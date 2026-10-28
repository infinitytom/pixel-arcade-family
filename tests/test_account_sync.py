import base64
from pathlib import Path
import tempfile
import unittest

try:
    from fastapi import FastAPI, HTTPException
    from fastapi.testclient import TestClient
    from account_sync import SyncStore, create_sync_router
except ImportError:
    SyncStore = None


@unittest.skipIf(SyncStore is None, 'optional account runtime is not installed')
class AccountSyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'sync.sqlite3'
        self.store = SyncStore(self.path)

    def tearDown(self):
        self.temp.cleanup()

    def op(self, kind='favorite', item='dino', value=True, **extra):
        import uuid
        return dict(opId=str(uuid.uuid4()), kind=kind, id=item, value=value, **extra)

    def point(self, stamp, source='manual', session='test', reason='periodic'):
        return dict(opId=f'operation-{stamp}', game='resume:fbneo:/roms/dino.zip', point=dict(
            state=base64.b64encode(bytes([stamp % 256]) * 200).decode(), updatedAt=stamp,
            source=source, sessionId=session, reason=reason, thumbnail=None, core='fbneo', src='/roms/dino.zip'))

    def test_seed_tombstone_retry_and_account_isolation(self):
        add = self.op()
        self.store.apply('alice', [add])
        self.store.apply('alice', [self.op(value=False)])
        self.store.apply('alice', [add, self.op(seed=True)])
        self.assertFalse(self.store.metadata('alice')['items'][0]['value'])
        self.assertEqual(self.store.metadata('bob')['items'], [])
        self.assertEqual(SyncStore(self.path).metadata('alice')['items'][0]['value'], False)

    def test_independent_device_edits_merge_without_replacing_other_fields(self):
        self.store.apply('alice', [self.op(item='dino'), self.op('setting', 'filter', 'crt')])
        self.store.apply('alice', [self.op(item='1942'), self.op('setting', 'uiVolume', '35')])
        values = {(v['kind'], v['id']): v['value'] for v in self.store.metadata('alice')['items']}
        self.assertEqual(values, {('favorite', 'dino'): True, ('favorite', '1942'): True,
                                 ('setting', 'filter'): 'crt', ('setting', 'uiVolume'): '35'})

    def test_recent_history_is_bounded_and_sorted_by_play_time(self):
        for start in [0, 80]:
            self.store.apply('alice', [self.op('recent', str(i), 1000+i) for i in range(start, start+80)])
        ids = {v['id'] for v in self.store.metadata('alice')['items']}
        self.assertEqual(ids, {str(i) for i in range(60, 160)})

    def test_manual_auto_retention_binary_integrity_and_retries(self):
        for source, start in [('manual', 100), ('auto', 200)]:
            for i in range(start, start+5):
                self.store.save('alice', self.point(i, source))
        points = self.store.saves('alice', 'resume:fbneo:/roms/dino.zip')['points']
        self.assertEqual(len(points), 6)
        self.assertEqual({p['updatedAt'] for p in points}, {102, 103, 104, 202, 203, 204})
        self.store.save('alice', self.point(100))  # Old retry cannot resurrect a pruned point.
        self.assertEqual(len(self.store.saves('alice', 'resume:fbneo:/roms/dino.zip')['points']), 6)
        data = self.store.point('alice', points[0]['id'])
        self.assertEqual(base64.b64decode(data['state']), bytes([204]) * 200)
        with self.assertRaises(HTTPException) as missing:
            self.store.point('bob', points[0]['id'])
        self.assertEqual(missing.exception.status_code, 404)

    def test_exit_checkpoint_replaces_only_the_same_session_latest_auto(self):
        for stamp in [100, 101]:
            self.store.save('alice', self.point(stamp, 'auto'))
        self.store.save('alice', self.point(102, 'auto', reason='checkpoint'))
        stamps = [p['updatedAt'] for p in self.store.saves('alice', 'resume:fbneo:/roms/dino.zip')['points']]
        self.assertEqual(stamps, [102, 100])

    def upload(self, username, stamp, data, game='resume:fbneo:/roms/large.zip'):
        import hashlib
        payload = self.point(stamp)
        payload['game'] = game
        payload['point'].pop('state')
        payload['size'] = len(data)
        begin = self.store.begin(username, payload)
        if begin.get('complete'):
            return begin['id']
        offset = begin['offset']
        while offset < len(data):
            part = data[offset:offset+1024*1024]
            result = self.store.chunk(username, payload['opId'], {'offset':offset,
                'data':base64.b64encode(part).decode(), 'sha256':hashlib.sha256(part).hexdigest()})
            offset = result['offset']
        return self.store.finish(username, payload['opId'])['id']

    def test_large_chunked_state_and_old_database_download(self):
        import hashlib
        data = b'large-save-pattern' * 1048576  # More than the previous 16 MB cap.
        sid = self.upload('alice', 301, data)
        self.assertGreater(self.store.point_info('alice', sid)['size'], 16*1024*1024)
        actual = b''.join(self.store.read_chunk('alice', sid, n) for n in range(0, len(data), 1048576))
        self.assertEqual(hashlib.sha256(actual).digest(), hashlib.sha256(data).digest())
        old = self.store.save('alice', self.point(302))['id']
        self.assertEqual(self.store.read_chunk('alice', old, 0), bytes([302 % 256])*200)
        self.assertEqual(self.store.metadata('alice')['protocol'], 2)

    def test_chunk_retry_resume_account_isolation_and_incomplete_commit(self):
        import hashlib
        data = b'resume-me' * 200000
        payload = self.point(401);payload['point'].pop('state');payload['size']=len(data)
        begin=self.store.begin('alice',payload)
        chunk=data[:1048576]
        block={'offset':0,'data':base64.b64encode(chunk).decode(),'sha256':hashlib.sha256(chunk).hexdigest()}
        self.assertEqual(self.store.chunk('alice',payload['opId'],block)['offset'],len(chunk))
        self.assertEqual(self.store.chunk('alice',payload['opId'],block)['offset'],len(chunk))
        self.store=SyncStore(self.path)
        self.assertEqual(self.store.begin('alice',payload)['offset'],len(chunk))
        with self.assertRaises(HTTPException):self.store.finish('alice',payload['opId'])
        with self.assertRaises(HTTPException):self.store.chunk('bob',payload['opId'],block)
        bad={**block,'sha256':'0'*64}
        with self.assertRaises(HTTPException):self.store.chunk('alice',payload['opId'],bad)
        rest=data[len(chunk):]
        self.store.chunk('alice',payload['opId'],{'offset':len(chunk),'data':base64.b64encode(rest).decode(),'sha256':hashlib.sha256(rest).hexdigest()})
        sid=self.store.finish('alice',payload['opId'])['id']
        self.assertTrue(self.store.finish('alice',payload['opId'])['ok'])
        self.assertTrue(self.store.begin('alice',payload)['complete'])
        with self.assertRaises(HTTPException):self.store.read_chunk('bob',sid,0)

    def test_no_account_size_quota_and_file_retention(self):
        import json
        # A sparse file represents an account already above the old total quota.
        fake=self.store.files/'existing.bin'
        with fake.open('wb') as out:out.truncate(513*1024*1024)
        with self.store.connect() as db:
            db.execute('INSERT INTO saves(username,id,game,stamp,source,session,metadata,state,revision,file,size) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
                ('alice','f'*64,'resume:fbneo:/roms/existing.zip',1,'manual','old',json.dumps({}),b'',1,'existing.bin',fake.stat().st_size))
        ids=[self.upload('alice',n,b'new save',game='resume:fbneo:/roms/retain.zip') for n in range(501,506)]
        points=self.store.saves('alice','resume:fbneo:/roms/retain.zip')['points']
        self.assertEqual(len(points),3)
        self.assertNotIn(ids[0],[p['id'] for p in points])
        self.assertEqual(len(list(self.store.files.rglob('*.bin'))),4)
        invalid=self.point(300);invalid['point']['state']='not-base64!'
        with self.assertRaises(HTTPException):self.store.save('alice',invalid)

    def test_router_requires_session_origin_account_binding_and_valid_payload(self):
        app = FastAPI()
        def authorize(request):
            if request.headers.get('test-session') != 'alice':
                raise HTTPException(401)
            return {'username': 'alice'}
        def origin(request):
            if request.headers.get('origin') != 'https://arcade.test' or not request.headers.get('content-type', '').startswith('application/json'):
                raise HTTPException(403)
        app.include_router(create_sync_router(Path(self.temp.name), authorize, origin))
        client = TestClient(app)
        self.assertEqual(client.get('/sync/metadata').status_code, 401)
        headers = {'test-session': 'alice', 'X-Arcade-Account': 'bob', 'Origin': 'https://arcade.test'}
        self.assertEqual(client.post('/sync/metadata', headers=headers, json={'operations':[self.op()]}).status_code, 409)
        headers['X-Arcade-Account'] = 'alice'
        self.assertEqual(client.post('/sync/metadata', headers={**headers, 'Origin':'https://evil.test'}, json={}).status_code, 403)
        self.assertEqual(client.post('/sync/metadata', headers=headers, json={'operations':[self.op()]}).status_code, 200)
        self.assertEqual(client.post('/sync/metadata', headers=headers, json={'operations':[self.op(value='invalid')]}).status_code, 400)
        self.assertEqual(client.post('/sync/saves', headers=headers, json=self.point(100)).status_code, 200)
        self.assertEqual(client.post('/sync/saves', headers=headers, json=[]).status_code, 400)
        import hashlib
        manifest=self.point(777);raw=base64.b64decode(manifest['point'].pop('state'));manifest['size']=len(raw)
        self.assertEqual(client.post('/sync/uploads',headers={**headers,'Origin':'https://evil.test'},json=manifest).status_code,403)
        start=client.post('/sync/uploads',headers=headers,json=manifest);self.assertEqual(start.status_code,200)
        oid=manifest['opId'];sid=start.json()['id']
        block={'offset':0,'data':base64.b64encode(raw).decode(),'sha256':hashlib.sha256(raw).hexdigest()}
        self.assertEqual(client.post('/sync/uploads/'+oid,headers={**headers,'X-Arcade-Account':'bob'},json=block).status_code,409)
        self.assertEqual(client.post('/sync/uploads/'+oid,headers=headers,json=block).json()['offset'],len(raw))
        self.assertEqual(client.post('/sync/uploads/'+oid+'/finish',headers=headers,json={}).status_code,200)
        info=client.get('/sync/saves/'+sid,headers={**headers,'X-Arcade-Sync':'2'}).json();self.assertTrue(info['chunked'])
        download=client.get('/sync/saves/'+sid+'/data?offset=0',headers=headers)
        self.assertEqual(download.content,raw);self.assertEqual(download.headers['x-chunk-sha256'],hashlib.sha256(raw).hexdigest())
        self.assertEqual(client.get('/sync/saves/'+sid+'/data?offset=0').status_code,401)



if __name__ == '__main__':
    unittest.main()
