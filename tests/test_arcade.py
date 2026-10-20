import json
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

from catalog import scan
from server import ArcadeServer


class CollectionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def test_metadata_nested_paths_core_and_bios(self):
        folder = self.root / 'mame2003_plus' / '动作'
        folder.mkdir(parents=True)
        (folder / 'game.zip').write_bytes(b'rom')
        (folder / 'neogeo.zip').write_bytes(b'bios')
        (folder / 'cover.png').write_bytes(b'image')
        (self.root / 'gamelist.xml').write_text('''<gameList><game>
            <path>./mame2003_plus/动作/GAME.zip</path><name>中文游戏</name>
            <image>./mame2003_plus/动作/cover.png</image><desc>简介</desc>
            </game></gameList>''', encoding='utf-8')
        result = scan(self.root)
        self.assertEqual(len(result['games']), 1)
        game = result['games'][0]
        self.assertEqual(game['title'], '中文游戏')
        self.assertEqual(game['core'], 'mame2003_plus')
        self.assertEqual(game['category'], '动作')
        self.assertIn('%E5%8A%A8', game['rom'])
        self.assertTrue(game['bios'].endswith('/neogeo.zip'))
        self.assertTrue(game['cover'].endswith('/cover.png'))

    def test_empty_malformed_and_private(self):
        self.assertEqual(scan(self.root)['games'], [])
        (self.root / '.private').mkdir()
        (self.root / '.private' / 'secret.zip').write_bytes(b'private')
        (self.root / 'ok.zip').write_bytes(b'rom')
        (self.root / 'gamelist.xml').write_text('<bad>')
        result = scan(self.root)
        self.assertEqual([g['title'] for g in result['games']], ['ok'])
        self.assertEqual(len(result['warnings']), 1)

    def test_xml_cannot_reference_parent(self):
        (self.root / 'ok.zip').write_bytes(b'rom')
        (self.root / 'gamelist.xml').write_text('<gameList><game><path>../ok.zip</path><name>bad</name></game></gameList>')
        self.assertEqual(scan(self.root)['games'][0]['title'], 'ok')

    def test_entity_xml_is_rejected(self):
        (self.root / 'gamelist.xml').write_text('<!DOCTYPE gameList [<!ENTITY a "hello">]><gameList/>')
        self.assertEqual(len(scan(self.root)['warnings']), 1)


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.roms = root / 'roms'
        self.roms.mkdir()
        self.engine = root / 'engine'
        self.engine.mkdir()
        (self.roms / '测试.zip').write_bytes(b'0123456789')
        (self.roms / 'secret.sqlite3').write_bytes(b'secret')
        (self.roms / '.env').write_text('secret')
        (self.engine / 'test.wasm').write_bytes(b'wasm')
        self.server = ArcadeServer(('127.0.0.1', 0), self.roms, self.engine)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f'http://127.0.0.1:{self.server.server_port}'
        self.rom = self.server.catalog()
        self.url = json.loads(self.rom)['games'][0]['rom']

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def get(self, path, **kw):
        return urllib.request.urlopen(urllib.request.Request(self.base + path, **kw))

    def test_catalog_and_head(self):
        with self.get('/library/catalog.json') as response:
            self.assertEqual(response.read(), self.rom)
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
        with self.get(self.url, method='HEAD') as response:
            self.assertEqual(response.headers['Content-Length'], '10')
            self.assertEqual(response.read(), b'')

    def test_ranges_for_rom_and_video(self):
        for requested, expected in [('bytes=2-4', b'234'), ('bytes=-3', b'789'), ('bytes=7-', b'789')]:
            with self.get(self.url, headers={'Range': requested}) as response:
                self.assertEqual(response.status, 206)
                self.assertEqual(response.read(), expected)
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.get(self.url, headers={'Range': 'bytes=99-'})
        self.assertEqual(error.exception.code, 416)

    def test_private_and_traversal_blocked(self):
        for path in ['/roms/.env', '/roms/secret.sqlite3', '/roms/', '/roms/%2e%2e/server.py', '/server.py']:
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.get(path)
            self.assertEqual(error.exception.code, 404)

    def test_symlink_is_not_served(self):
        try:
            (self.roms / 'link.zip').symlink_to(self.engine / 'test.wasm')
        except OSError:
            self.skipTest('Symlink creation unavailable on this system')
        self.assertEqual(len(scan(self.roms)['games']), 1)
        with self.assertRaises(urllib.error.HTTPError):
            self.get('/roms/link.zip')

    def test_engine_and_pages(self):
        for path in ['/library/', '/support.html', '/help.html', '/stick-test.html', '/health']:
            with self.get(path) as response:
                self.assertEqual(response.status, 200)
        with self.get('/data/test.wasm') as response:
            self.assertEqual(response.headers['Content-Type'], 'application/wasm')


if __name__ == '__main__':
    unittest.main()
