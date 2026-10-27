"""Install native cheat data locally. Keep upstream files and their attribution intact.

No ROMs or cheats are enabled by this script. Optional ROM root limits installation
to exact archive names; no parent/clone guesses are made.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FBNEO = 'https://codeload.github.com/finalburnneo/FBNeo-cheats/zip/refs/heads/master'
MAME = 'https://raw.githubusercontent.com/libretro/mame2003-plus-libretro/master/metadata/cheat.dat'


def install(destination, rom_root=None, fbneo_archive=None, mame_dat=None):
    def get(local, url):
        if local:
            return Path(local).read_bytes()
        print('Fetching', url, flush=True)
        with urllib.request.urlopen(url, timeout=90) as response:
            return response.read()

    names = None
    if rom_root:
        names = {p.stem for p in Path(rom_root).rglob('*') if p.suffix.lower() in {'.zip', '.7z'}}
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    archive = get(fbneo_archive, FBNEO)
    native = get(mame_dat, MAME)
    manifest = {'version': 1, 'fbneo': [], 'mame': [], 'sources': [
        {'url': FBNEO, 'sha256': hashlib.sha256(archive).hexdigest()},
        {'url': MAME, 'sha256': hashlib.sha256(native).hexdigest()}]}
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        for path in z.namelist():
            name = Path(path).stem
            if not path.endswith('.ini') or '/cheats/' not in path or not re.fullmatch(r'[A-Za-z0-9_-]+', name):
                continue
            if names is not None and name not in names:
                continue
            target = destination / 'fbneo' / (name + '.ini')
            target.parent.mkdir(exist_ok=True)
            target.write_bytes(z.read(path))
            manifest['fbneo'].append(name)
    # Split MAME's native database into exact-ROM files; preserve its credit header.
    header = native.split(b'; Cheat Engine Commands:')[0]
    entries = {}
    for line in native.splitlines():
        match = re.match(rb'^:?([A-Za-z0-9_-]+):', line)
        if not match or match[1].startswith(b'_'):
            continue
        name = match[1].decode('ascii')
        if names is None or name in names:
            entries.setdefault(name, []).append(line)
    for name, lines in entries.items():
        target = destination / 'mame2003-plus' / (name + '.dat')
        target.parent.mkdir(exist_ok=True)
        target.write_bytes(header + b'\n:_command:00000001\n' + b'\n'.join(lines) + b'\n')
        manifest['mame'].append(name)
    for key in ['fbneo', 'mame']:
        manifest[key].sort()
    (destination / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    (destination / 'SOURCES.txt').write_text(
        'FBNeo-cheats: https://github.com/finalburnneo/FBNeo-cheats\n'
        'MAME 2003 Plus metadata: https://github.com/libretro/mame2003-plus-libretro/blob/master/metadata/cheat.dat\n'
        "Original cheat.dat credits: Pugsy's MAME Cheat Page.\n"
        'Data downloaded for local use; upstream repositories do not provide an explicit standalone redistribution license for these databases.\n'
        'Do not assume the application GPL license covers the cheat data.\n', encoding='utf-8')
    print('Installed:', len(manifest['fbneo']), 'FBNeo and', len(manifest['mame']), 'MAME ROMs', flush=True)
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--destination', type=Path, default=ROOT / 'site/library/cheats')
    parser.add_argument('--rom-root', type=Path)
    parser.add_argument('--fbneo-archive', type=Path)
    parser.add_argument('--mame-dat', type=Path)
    args = parser.parse_args()
    install(args.destination, args.rom_root, args.fbneo_archive, args.mame_dat)
