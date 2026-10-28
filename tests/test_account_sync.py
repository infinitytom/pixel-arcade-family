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

    def test_quota_retention_and_transaction_rollback(self):
        from unittest.mock import patch
        with patch('account_sync.QUOTA', 600):
            for stamp in range(100, 105):
                self.store.save('alice', self.point(stamp))
            self.assertEqual(len(self.store.saves('alice', 'resume:fbneo:/roms/dino.zip')['points']), 3)
            with self.assertRaises(HTTPException) as full:
                self.store.save('alice', self.point(200, 'auto'))
            self.assertEqual(full.exception.status_code, 413)
            self.assertEqual(len(self.store.saves('alice', 'resume:fbneo:/roms/dino.zip')['points']), 3)
        invalid = self.point(300)
        invalid['point']['state'] = 'not-base64!'
        with self.assertRaises(HTTPException):
            self.store.save('alice', invalid)

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


if __name__ == '__main__':
    unittest.main()
