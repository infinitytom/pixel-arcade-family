"""Fetch only pinned official npm packages, verify SHA-512 before extracting."""
import base64
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import sys
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def apply_offline_patch(destination):
    # The 4.2.3 update checker has no offline error handler. Use its own bundled
    # version manifest so a family installation does not contact the public CDN.
    source = Path(destination) / 'src/emulator.js'
    original = 'https://cdn.emulatorjs.org/stable/data/version.json'
    content = source.read_text(encoding='utf-8')
    if content.count(original) != 1:
        raise RuntimeError('Unexpected upstream update-check implementation')
    source.write_text(content.replace('fetch("'+original+'")', 'fetch(new URL("version.json", new URL(window.EJS_pathtodata || "/data/", location.href)))'), encoding='utf-8')


def install(destination):
    destination = Path(destination)
    lock = json.loads((ROOT / 'engine-lock.json').read_text())
    for package in lock['packages']:
        print('Fetching', package['name'], package['version'], flush=True)
        with urllib.request.urlopen(package['url'], timeout=180) as response:
            payload = response.read()
        digest = 'sha512-' + base64.b64encode(hashlib.sha512(payload).digest()).decode()
        if digest != package['integrity']:
            raise RuntimeError('Package integrity mismatch: ' + package['name'])
        with tarfile.open(fileobj=io.BytesIO(payload), mode='r:gz') as archive:
            for member in archive.getmembers():
                path = PurePosixPath(member.name)
                if not member.isfile() or '..' in path.parts or path.is_absolute():
                    continue
                if package['name'] == '@emulatorjs/emulatorjs':
                    if len(path.parts) < 3 or path.parts[:2] != ('package', 'data'):
                        continue
                    relative = Path(*path.parts[2:])
                elif path.name.endswith('.data'):
                    relative = Path('cores') / path.name
                else:
                    continue
                target = destination / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.extractfile(member).read())
    apply_offline_patch(destination)
    print('Engine ready:', destination, flush=True)


if __name__ == '__main__':
    install(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'engine')
