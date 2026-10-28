"""Account-scoped arcade storage. Mount behind an existing session authorizer."""
import asyncio
import base64
import binascii
from contextlib import contextmanager
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import time
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool

SETTINGS = {'filter', 'frame', 'mask', 'strength', 'cheats', 'fullscreen', 'resume',
            'autoSave', 'cacheDays', 'uiSound', 'uiVolume', 'inputStyle'}
MAX_STATE = 16 * 1024 * 1024
QUOTA = 512 * 1024 * 1024


class SyncStore:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript('''PRAGMA journal_mode=WAL;
              CREATE TABLE IF NOT EXISTS items(username TEXT,kind TEXT,item TEXT,value TEXT,
                revision INTEGER,PRIMARY KEY(username,kind,item));
              CREATE TABLE IF NOT EXISTS operations(username TEXT,op TEXT,created INTEGER,
                PRIMARY KEY(username,op));
              CREATE TABLE IF NOT EXISTS saves(username TEXT,id TEXT,game TEXT,stamp INTEGER,
                source TEXT,session TEXT,metadata TEXT,state BLOB,revision INTEGER,
                PRIMARY KEY(username,id));
              CREATE INDEX IF NOT EXISTS save_game ON saves(username,game,stamp DESC);
            ''')
        try:
            self.path.chmod(0o600)
        except OSError:
            pass

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def metadata(self, username):
        with self.connect() as db:
            return {'items': [dict(kind=r['kind'], id=r['item'], value=json.loads(r['value']),
                                   revision=r['revision']) for r in db.execute(
                'SELECT * FROM items WHERE username=? ORDER BY revision,kind,item', (username,))],
                    'games': [dict(r) for r in db.execute('''SELECT game,MAX(revision) AS revision,
                      MAX(stamp) AS updatedAt FROM saves WHERE username=? GROUP BY game''', (username,))],
                    'serverTime': int(time.time() * 1000)}

    @staticmethod
    def operation_id(value):
        if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{8,100}', value):
            raise HTTPException(400, '同步操作标识无效')
        return value

    def apply(self, username, operations):
        if not isinstance(operations, list) or not 1 <= len(operations) <= 100:
            raise HTTPException(400, '同步批次无效')
        validated = []
        for op in operations:
            if not isinstance(op, dict):
                raise HTTPException(400, '同步格式无效')
            oid = self.operation_id(op.get('opId'))
            kind, item, value = op.get('kind'), op.get('id'), op.get('value')
            if kind not in ('favorite', 'recent', 'setting', 'picture') or not isinstance(item, str) or not 1 <= len(item) <= 4096:
                raise HTTPException(400, '同步项目无效')
            if kind == 'favorite' and not isinstance(value, bool):
                raise HTTPException(400, '收藏格式无效')
            if kind == 'recent' and (type(value) is not int or not 0 < value < 10**14):
                raise HTTPException(400, '历史格式无效')
            if kind == 'setting' and (item not in SETTINGS or not isinstance(value, str) or len(value) > 80):
                raise HTTPException(400, '设置格式无效')
            if kind == 'picture' and value is not None and (
                    not isinstance(value, dict) or set(value) - {'filter', 'frame', 'mask', 'strength'}
                    or any(not isinstance(v, str) or len(v) > 80 for v in value.values())):
                raise HTTPException(400, '画面设置格式无效')
            validated.append((oid, kind, item, json.dumps(value), bool(op.get('seed'))))
        now = int(time.time() * 1000)
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            for oid, kind, item, value, seed in validated:
                if db.execute('SELECT 1 FROM operations WHERE username=? AND op=?', (username, oid)).fetchone():
                    continue
                old = db.execute('SELECT 1 FROM items WHERE username=? AND kind=? AND item=?', (username, kind, item)).fetchone()
                if not seed or not old:
                    if not old and db.execute('SELECT COUNT(*) FROM items WHERE username=?', (username,)).fetchone()[0] >= 20000:
                        raise HTTPException(413, '账号记录数量已达上限')
                    db.execute('''INSERT INTO items VALUES(?,?,?,?,?) ON CONFLICT(username,kind,item)
                      DO UPDATE SET value=excluded.value,revision=excluded.revision''', (username, kind, item, value, now))
                db.execute('INSERT INTO operations VALUES(?,?,?)', (username, oid, now))
            db.execute('DELETE FROM operations WHERE created<?', (now - 90 * 86400000,))
            # Recent history is bounded; favorite tombstones are retained to prevent resurrection.
            db.execute('''DELETE FROM items WHERE username=? AND kind='recent' AND item NOT IN
              (SELECT item FROM items WHERE username=? AND kind='recent'
                ORDER BY CAST(value AS INTEGER) DESC,revision DESC LIMIT 100)''', (username, username))
        return self.metadata(username)

    def save(self, username, payload):
        if not isinstance(payload, dict):
            raise HTTPException(400, '存档格式无效')
        oid = self.operation_id(payload.get('opId'))
        game, point = payload.get('game'), payload.get('point')
        if not isinstance(game, str) or not game.startswith('resume:') or len(game) > 4096 or not isinstance(point, dict):
            raise HTTPException(400, '存档项目无效')
        stamp, source, session = point.get('updatedAt'), point.get('source'), point.get('sessionId', '')
        if type(stamp) is not int or not 0 < stamp < 10**14 or source not in ('manual', 'auto') or not isinstance(session, str) or len(session) > 128:
            raise HTTPException(400, '存档时间或类型无效')
        thumb = point.get('thumbnail')
        if thumb is not None and (not isinstance(thumb, str) or not thumb.startswith('data:image/jpeg;base64,') or len(thumb) > 256000):
            raise HTTPException(400, '缩略图格式无效')
        try:
            state = base64.b64decode(point['state'], validate=True)
        except (KeyError, ValueError, TypeError, binascii.Error):
            raise HTTPException(400, '存档数据无效') from None
        if not 0 < len(state) <= MAX_STATE:
            raise HTTPException(413, '单份存档最大 16 MB，请单独导出较大存档')
        metadata = {k: point.get(k) for k in ('updatedAt', 'source', 'sessionId', 'thumbnail', 'core', 'src', 'reason')}
        if any(v is not None and (not isinstance(v, (str, int)) or isinstance(v, str) and len(v) > 4096)
               for k, v in metadata.items() if k != 'thumbnail'):
            raise HTTPException(400, '存档信息无效')
        sid = hashlib.sha256((game + '\n' + str(stamp) + '\n' + session).encode()).hexdigest()
        now = int(time.time() * 1000)
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute('SELECT 1 FROM operations WHERE username=? AND op=?', (username, oid)).fetchone():
                return {'id': sid, 'ok': True}
            if not db.execute('SELECT 1 FROM saves WHERE username=? AND id=?', (username, sid)).fetchone():
                if source == 'auto' and metadata['reason'] != 'periodic' and session:
                    old = db.execute('''SELECT id FROM saves WHERE username=? AND game=? AND source='auto'
                      AND session=? AND stamp<=? ORDER BY stamp DESC LIMIT 1''', (username, game, session, stamp)).fetchone()
                    if old:
                        db.execute('DELETE FROM saves WHERE username=? AND id=?', (username, old['id']))
                db.execute('INSERT INTO saves VALUES(?,?,?,?,?,?,?,?,?)',
                           (username, sid, game, stamp, source, session, json.dumps(metadata), state, now))
                db.execute('''DELETE FROM saves WHERE username=? AND game=? AND source=? AND id NOT IN
                  (SELECT id FROM saves WHERE username=? AND game=? AND source=? ORDER BY stamp DESC,id DESC LIMIT 3)''',
                           (username, game, source, username, game, source))
                used = db.execute('SELECT COALESCE(SUM(LENGTH(state)),0) FROM saves WHERE username=?', (username,)).fetchone()[0]
                if used > QUOTA:
                    raise HTTPException(413, '账号云存档已达 512 MB；本地存档保留，可单独导出')
            db.execute('INSERT INTO operations VALUES(?,?,?)', (username, oid, now))
            db.execute('DELETE FROM operations WHERE created<?', (now - 90 * 86400000,))
        return {'id': sid, 'ok': True}

    def saves(self, username, game):
        with self.connect() as db:
            return {'points': [dict(id=r['id'], updatedAt=r['stamp'], source=r['source']) for r in db.execute(
                'SELECT id,stamp,source FROM saves WHERE username=? AND game=? ORDER BY stamp DESC,id DESC', (username, game))]}

    def point(self, username, sid):
        with self.connect() as db:
            row = db.execute('SELECT metadata,state FROM saves WHERE username=? AND id=?', (username, sid)).fetchone()
            if row is None:
                raise HTTPException(404, '这份存档已不在当前历史中')
            return {**json.loads(row['metadata']), 'state': base64.b64encode(row['state']).decode()}


def create_sync_router(state, authorize, check_origin):
    router = APIRouter(prefix='/sync')
    store = SyncStore(Path(state) / 'arcade-sync.sqlite3')
    uploads = asyncio.Semaphore(2)

    async def user(request):
        username = (await run_in_threadpool(authorize, request))['username']
        if unquote(request.headers.get('x-arcade-account', '')) != username:
            raise HTTPException(409, '账号已切换，请刷新页面后继续同步')
        return username

    async def body(request, maximum):
        check_origin(request)
        raw = bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw) > maximum:
                raise HTTPException(413, '同步请求过大')
        try:
            return json.loads(raw)
        except (ValueError, UnicodeError):
            raise HTTPException(400, '同步 JSON 无效') from None

    @router.get('/metadata')
    async def metadata(request: Request):
        return await run_in_threadpool(store.metadata, await user(request))

    @router.post('/metadata')
    async def update(request: Request):
        username = await user(request)
        payload = await body(request, 1024 * 1024)
        if not isinstance(payload, dict):
            raise HTTPException(400, '同步格式无效')
        return await run_in_threadpool(store.apply, username, payload.get('operations'))

    @router.get('/saves')
    async def saves(request: Request, game: str):
        if len(game) > 4096:
            raise HTTPException(400, '游戏标识过长')
        return await run_in_threadpool(store.saves, await user(request), game)

    @router.get('/saves/{sid}')
    async def point(sid: str, request: Request):
        if not re.fullmatch('[0-9a-f]{64}', sid):
            raise HTTPException(404)
        return await run_in_threadpool(store.point, await user(request), sid)

    @router.post('/saves')
    async def save(request: Request):
        username = await user(request)
        async with uploads:
            payload = await body(request, 23 * 1024 * 1024)
            return await run_in_threadpool(store.save, username, payload)

    return router
