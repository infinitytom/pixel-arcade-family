"""Extract factual screen ratios from official core metadata (no ROM data)."""
import argparse
import hashlib
import json
import time
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen
import xml.etree.ElementTree as ET

SOURCES = {
    'mame2003_plus': 'https://raw.githubusercontent.com/libretro/mame2003-plus-libretro/master/metadata/mame2003-plus.xml',
    'fbneo': 'https://raw.githubusercontent.com/libretro/FBNeo/master/dats/' + quote('FinalBurn Neo (ClrMame Pro XML, Arcade only).dat'),
}


def download(url):
    deadline = time.monotonic() + 90
    chunks, size = [], 0
    with urlopen(url, timeout=20) as response:
        while chunk := response.read(65536):
            size += len(chunk)
            if size > 80 * 1024 * 1024 or time.monotonic() > deadline:
                raise ValueError('Metadata download exceeded its size or time limit')
            chunks.append(chunk)
    return b''.join(chunks)


def extract(data):
    ratios = {}
    root = ET.fromstring(data)
    for game in [*root.findall('game'), *root.findall('machine')]:
        video = game.find('video')
        if video is None:
            video = game.find('display')
        if video is None:
            continue
        try:
            x, y = float(video.get('aspectx', '4')), float(video.get('aspecty', '3'))
            ratio = x / y
            vertical = video.get('orientation') == 'vertical' or video.get('rotate') in ('90', '270')
            if vertical and ratio > 1:
                ratio = 1 / ratio
            if .2 <= ratio <= 5 and game.get('name'):
                ratios[game.get('name')] = round(ratio, 6)
        except (ValueError, ZeroDivisionError):
            continue
    return dict(sorted(ratios.items()))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mame-source', type=Path)
    parser.add_argument('--fbneo-source', type=Path)
    parser.add_argument('--destination', type=Path, default=Path(__file__).resolve().parents[1] / 'site/library/game-layouts.json')
    args = parser.parse_args()
    result = {'version': 1, 'sources': []}
    for core, url in SOURCES.items():
        local = args.mame_source if core == 'mame2003_plus' else args.fbneo_source
        data = local.read_bytes() if local else download(url)
        result[core] = extract(data)
        result['sources'].append({'url': url, 'sha256': hashlib.sha256(data).hexdigest()})
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    args.destination.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print('Screen layouts:', {core: len(result[core]) for core in SOURCES})
