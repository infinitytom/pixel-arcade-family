"""Account-scoped arcade storage. Mount behind an existing session authorizer."""
import asyncio
import base64
import binascii
import errno
import os
from contextlib import contextmanager
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import time
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

SETTINGS = {'filter', 'frame', 'mask', 'strength', 'cheats', 'fullscreen', 'resume',
            'autoSave', 'cacheDays', 'uiSound', 'uiVolume', 'inputStyle'}
CHUNK_BYTES = 1024 * 1024


class SyncStore:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.files = self.path.parent / 'sync-files'
        self.parts = self.path.parent / 'sync-uploads'
        for folder in (self.files, self.parts):
            folder.mkdir(exist_ok=True)
            folder.chmod(0o700)
        with self.connect() as db:
            db.executescript('''PRAGMA journal_mode=WAL;
              CREATE TABLE IF NOT EXISTS items(username TEXT,kind TEXT,item TEXT,value TEXT,
                revision INTEGER,PRIMARY KEY(username,kind,item));
              CREATE TABLE IF NOT EXISTS operations(username TEXT,op TEXT,created INTEGER,
                PRIMARY KEY(username,op));
              CREATE TABLE IF NOT EXISTS saves(username TEXT,id TEXT,game TEXT,stamp INTEGER,
                source TEXT,session TEXT,metadata TEXT,state BLOB,revision INTEGER,
                PRIMARY KEY(username,id));
              CREATE TABLE IF NOT EXISTS uploads(username TEXT,op TEXT,game TEXT,metadata TEXT,
                size INTEGER,offset INTEGER,modified INTEGER,PRIMARY KEY(username,op));
              CREATE INDEX IF NOT EXISTS save_game ON saves(username,game,stamp DESC);
            ''')
            columns = {r['name'] for r in db.execute('PRAGMA table_info(saves)')}
            for name, kind in [('file', 'TEXT'), ('size', 'INTEGER'), ('digest', 'TEXT')]:
                if name not in columns:
                    db.execute(f'ALTER TABLE saves ADD COLUMN {name} {kind}')
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
            return {'protocol': 2, 'chunkBytes': CHUNK_BYTES, 'items': [dict(kind=r['kind'], id=r['item'], value=json.loads(r['value']),
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

    def header(self, payload):
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
        metadata = {k: point.get(k) for k in ('updatedAt', 'source', 'sessionId', 'thumbnail', 'core', 'src', 'reason')}
        metadata['sessionId'] = session
        if any(v is not None and (not isinstance(v, (str, int)) or isinstance(v, str) and len(v) > 4096)
               for k, v in metadata.items() if k != 'thumbnail'):
            raise HTTPException(400, '存档信息无效')
        sid = hashlib.sha256((game + '\n' + str(stamp) + '\n' + session).encode()).hexdigest()
        return oid, game, metadata, sid

    def safe_path(self, root, relative):
        result = (root / relative).resolve()
        if not result.is_relative_to(root.resolve()):
            raise HTTPException(503, '存档路径无效')
        return result

    def names(self, username, oid, sid):
        owner = hashlib.sha256(username.encode()).hexdigest()
        return self.safe_path(self.parts, owner + '/' + oid + '.part'), owner + '/' + sid + '.bin'

    def cleanup(self, names):
        for name in names:
            if name:
                try:
                    self.safe_path(self.files, name).unlink(missing_ok=True)
                except OSError:
                    pass

    def store(self, db, username, oid, game, metadata, sid, state=b'', file=None, size=None, digest=None):
        stale = []
        now = int(time.time() * 1000)
        if not db.execute('SELECT 1 FROM saves WHERE username=? AND id=?', (username, sid)).fetchone():
            if metadata['source'] == 'auto' and metadata['reason'] != 'periodic' and metadata['sessionId']:
                old = db.execute("""SELECT id,file FROM saves WHERE username=? AND game=? AND source='auto'
                  AND session=? AND stamp<=? ORDER BY stamp DESC LIMIT 1""",
                                 (username, game, metadata['sessionId'], metadata['updatedAt'])).fetchone()
                if old:
                    stale.append(old['file'])
                    db.execute('DELETE FROM saves WHERE username=? AND id=?', (username, old['id']))
            db.execute("""INSERT INTO saves(username,id,game,stamp,source,session,metadata,state,revision,file,size,digest)
              VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""", (username, sid, game, metadata['updatedAt'], metadata['source'],
              metadata['sessionId'], json.dumps(metadata), state, now, file, len(state) if size is None else size, digest))
            removed = db.execute("""SELECT id,file FROM saves WHERE username=? AND game=? AND source=? AND id NOT IN
              (SELECT id FROM saves WHERE username=? AND game=? AND source=? ORDER BY stamp DESC,id DESC LIMIT 3)""",
              (username, game, metadata['source'], username, game, metadata['source'])).fetchall()
            for row in removed:
                stale.append(row['file'])
                db.execute('DELETE FROM saves WHERE username=? AND id=?', (username, row['id']))
        db.execute('INSERT OR IGNORE INTO operations VALUES(?,?,?)', (username, oid, now))
        db.execute('DELETE FROM operations WHERE created<?', (now - 90 * 86400000,))
        return stale

    def save(self, username, payload):
        # Compatibility for old pages. New clients use bounded chunks instead.
        oid, game, metadata, sid = self.header(payload)
        try:
            state = base64.b64decode(payload['point']['state'], validate=True)
        except (KeyError, ValueError, TypeError, binascii.Error):
            raise HTTPException(400, '存档数据无效') from None
        if not state:
            raise HTTPException(400, '存档数据为空')
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute('SELECT 1 FROM operations WHERE username=? AND op=?', (username, oid)).fetchone():
                return {'id': sid, 'ok': True}
            stale = self.store(db, username, oid, game, metadata, sid, state)
        self.cleanup(stale)
        return {'id': sid, 'ok': True}

    def begin(self, username, payload):
        oid, game, metadata, sid = self.header(payload)
        size = payload.get('size')
        if type(size) is not int or not 0 < size < 2**63:
            raise HTTPException(400, '存档长度无效')
        part, name = self.names(username, oid, sid)
        now = int(time.time() * 1000)
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute('SELECT 1 FROM operations WHERE username=? AND op=?', (username, oid)).fetchone():
                return {'id': sid, 'complete': True}
            if db.execute('SELECT 1 FROM saves WHERE username=? AND id=?', (username, sid)).fetchone():
                db.execute('INSERT OR IGNORE INTO operations VALUES(?,?,?)', (username, oid, now))
                return {'id': sid, 'complete': True}
            # Abandoned partials expire; local queues can safely restart them.
            for old in db.execute('SELECT username,op FROM uploads WHERE modified<?', (now - 7 * 86400000,)).fetchall():
                old_part, _ = self.names(old['username'], old['op'], sid)
                old_part.unlink(missing_ok=True)
                db.execute('DELETE FROM uploads WHERE username=? AND op=?', (old['username'], old['op']))
            old = db.execute('SELECT * FROM uploads WHERE username=? AND op=?', (username, oid)).fetchone()
            encoded = json.dumps(metadata)
            if old and (old['game'] != game or old['metadata'] != encoded or old['size'] != size):
                raise HTTPException(409, '待上传存档信息已变化，请重新保存')
            part.parent.mkdir(parents=True, exist_ok=True)
            part.parent.chmod(0o700)
            final = self.safe_path(self.files, name)
            if old and not part.exists() and final.exists():
                os.replace(final, part)  # Recover a rename interrupted before DB commit.
            if not old or not part.exists():
                part.write_bytes(b'')
                part.chmod(0o600)
                offset = 0
            else:
                offset = min(old['offset'], part.stat().st_size)
                with part.open('r+b') as out:
                    out.truncate(offset)
            db.execute('INSERT OR REPLACE INTO uploads VALUES(?,?,?,?,?,?,?)',
                       (username, oid, game, encoded, size, offset, now))
        return {'id': sid, 'complete': False, 'offset': offset, 'size': size, 'chunkBytes': CHUNK_BYTES}

    def chunk(self, username, oid, payload):
        self.operation_id(oid)
        if not isinstance(payload, dict) or type(payload.get('offset')) is not int or payload['offset'] < 0:
            raise HTTPException(400, '分块位置无效')
        try:
            data = base64.b64decode(payload['data'], validate=True)
        except (KeyError, ValueError, TypeError, binascii.Error):
            raise HTTPException(400, '分块数据无效') from None
        if not 0 < len(data) <= CHUNK_BYTES or hashlib.sha256(data).hexdigest() != payload.get('sha256'):
            raise HTTPException(400, '分块校验失败')
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM uploads WHERE username=? AND op=?', (username, oid)).fetchone()
            if row is None:
                raise HTTPException(404, '上传会话已失效，请重试')
            header = {'opId': oid, 'game': row['game'], 'point': json.loads(row['metadata'])}
            _, _, _, sid = self.header(header)
            part, _ = self.names(username, oid, sid)
            offset = payload['offset']
            if offset + len(data) > row['size'] or offset > row['offset']:
                raise HTTPException(409, '分块位置不一致，请重试')
            if offset < row['offset']:
                with part.open('rb') as inp:
                    inp.seek(offset)
                    if offset + len(data) > row['offset'] or inp.read(len(data)) != data:
                        raise HTTPException(409, '重传分块不一致')
                return {'offset': row['offset']}
            with part.open('r+b') as out:
                out.seek(offset)
                out.write(data)
                out.truncate(offset + len(data))
                out.flush()
                os.fsync(out.fileno())
            offset += len(data)
            db.execute('UPDATE uploads SET offset=?,modified=? WHERE username=? AND op=?',
                       (offset, int(time.time() * 1000), username, oid))
        return {'offset': offset}

    def finish(self, username, oid):
        self.operation_id(oid)
        stale = []
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM uploads WHERE username=? AND op=?', (username, oid)).fetchone()
            if row is None:
                if db.execute('SELECT 1 FROM operations WHERE username=? AND op=?', (username, oid)).fetchone():
                    return {'ok': True, 'complete': True}
                raise HTTPException(404, '上传会话已失效，请重试')
            metadata = json.loads(row['metadata'])
            _, game, _, sid = self.header({'opId': oid, 'game': row['game'], 'point': metadata})
            part, name = self.names(username, oid, sid)
            if row['offset'] != row['size'] or not part.exists() or part.stat().st_size != row['size']:
                raise HTTPException(409, '存档尚未完整上传')
            digest = hashlib.sha256()
            with part.open('rb') as inp:
                while data := inp.read(CHUNK_BYTES):
                    digest.update(data)
            final = self.safe_path(self.files, name)
            final.parent.mkdir(parents=True, exist_ok=True)
            final.parent.chmod(0o700)
            exists = db.execute('SELECT 1 FROM saves WHERE username=? AND id=?', (username, sid)).fetchone()
            if not exists:
                os.replace(part, final)
                final.chmod(0o600)
                stale = self.store(db, username, oid, game, metadata, sid, file=name, size=row['size'], digest=digest.hexdigest())
            else:
                part.unlink(missing_ok=True)
                db.execute('INSERT OR IGNORE INTO operations VALUES(?,?,?)', (username, oid, int(time.time() * 1000)))
            db.execute('DELETE FROM uploads WHERE username=? AND op=?', (username, oid))
        self.cleanup(stale)
        return {'id': sid, 'ok': True, 'size': row['size'], 'sha256': digest.hexdigest()}

    def point_info(self, username, sid):
        with self.connect() as db:
            row = db.execute('SELECT metadata,file,COALESCE(size,LENGTH(state)) AS bytes,digest FROM saves WHERE username=? AND id=?', (username, sid)).fetchone()
            if row is None:
                raise HTTPException(404, '这份存档已不在当前历史中')
            return {**json.loads(row['metadata']), 'chunked': True, 'size': row['bytes'], 'sha256': row['digest']}

    def read_chunk(self, username, sid, offset):
        if type(offset) is not int or offset < 0:
            raise HTTPException(400, '下载位置无效')
        with self.connect() as db:
            row = db.execute('SELECT file,COALESCE(size,LENGTH(state)) AS bytes FROM saves WHERE username=? AND id=?', (username, sid)).fetchone()
            if row is None:
                raise HTTPException(404, '这份存档已不在当前历史中')
            if offset >= row['bytes']:
                raise HTTPException(416, '下载位置超出存档长度')
            if row['file']:
                with self.safe_path(self.files, row['file']).open('rb') as inp:
                    inp.seek(offset)
                    data = inp.read(CHUNK_BYTES)
            else:
                data = db.execute('SELECT substr(state,?,?) FROM saves WHERE username=? AND id=?',
                                  (offset + 1, CHUNK_BYTES, username, sid)).fetchone()[0]
        return data

    def saves(self, username, game):
        with self.connect() as db:
            return {'points': [dict(id=r['id'], updatedAt=r['stamp'], source=r['source']) for r in db.execute(
                'SELECT id,stamp,source FROM saves WHERE username=? AND game=? ORDER BY stamp DESC,id DESC', (username, game))]}

    def point(self, username, sid):
        with self.connect() as db:
            row = db.execute('SELECT metadata,state,file FROM saves WHERE username=? AND id=?', (username, sid)).fetchone()
            if row is None:
                raise HTTPException(404, '这份存档已不在当前历史中')
            if row['file']:
                raise HTTPException(409, '存档使用新版分块同步，请刷新游戏厅后继续')
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
        username = await user(request)
        if request.headers.get('x-arcade-sync') == '2':
            return await run_in_threadpool(store.point_info, username, sid)
        return await run_in_threadpool(store.point, username, sid)

    async def storage_call(function, *args):
        try:
            return await run_in_threadpool(function, *args)
        except OSError as exc:
            if exc.errno == errno.ENOSPC:
                raise HTTPException(507, 'NAS 可用存储空间不足，请释放空间后重试') from None
            raise HTTPException(503, 'NAS 存档存储暂不可用，请重试') from None
        except sqlite3.OperationalError as exc:
            if 'full' in str(exc).lower():
                raise HTTPException(507, 'NAS 可用存储空间不足，请释放空间后重试') from None
            raise HTTPException(503, '存档数据库暂不可用，请重试') from None

    @router.post('/uploads')
    async def begin_upload(request: Request):
        username = await user(request)
        payload = await body(request, 1024 * 1024)
        return await storage_call(store.begin, username, payload)

    @router.post('/uploads/{oid}')
    async def upload_chunk(oid: str, request: Request):
        username = await user(request)
        async with uploads:
            payload = await body(request, 2 * 1024 * 1024)
            return await storage_call(store.chunk, username, oid, payload)

    @router.post('/uploads/{oid}/finish')
    async def finish_upload(oid: str, request: Request):
        username = await user(request)
        await body(request, 8192)
        return await storage_call(store.finish, username, oid)

    @router.get('/saves/{sid}/data')
    async def download_chunk(sid: str, request: Request, offset: int = 0):
        if not re.fullmatch('[0-9a-f]{64}', sid):
            raise HTTPException(404)
        data = await storage_call(store.read_chunk, await user(request), sid, offset)
        return Response(data, media_type='application/octet-stream',
                        headers={'X-Chunk-SHA256': hashlib.sha256(data).hexdigest()})

    @router.post('/saves')
    async def save(request: Request):
        username = await user(request)
        async with uploads:
            payload = await body(request, 23 * 1024 * 1024)
            return await run_in_threadpool(store.save, username, payload)

    return router
