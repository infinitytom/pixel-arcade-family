"""Read a mounted arcade collection without changing its contents."""
from collections import Counter
from pathlib import Path, PurePosixPath
from urllib.parse import quote
import os
import re
import xml.etree.ElementTree as ET

CORES = {'fbneo', 'mame2003_plus', 'fbalpha2012_cps1', 'fbalpha2012_cps2'}
BIOS = {'neogeo.zip', 'pgm.zip', 'uni-bios.zip', 'collection-bios.zip'}


def public_file(root, path):
    """Reject hidden files, symlinks and paths outside the mounted root."""
    root, path = Path(root).resolve(), Path(path)
    try:
        relative = path.relative_to(root)
        if not relative.parts or any(p.startswith('.') for p in relative.parts):
            return False
        cursor = root
        for part in relative.parts:
            cursor /= part
            if cursor.is_symlink():
                return False
        return path.resolve().is_relative_to(root) and path.is_file()
    except (ValueError, OSError):
        return False


def scan(root, default_core='fbneo'):
    root = Path(root).resolve()
    if default_core not in CORES:
        raise ValueError('Unsupported DEFAULT_CORE')
    files = {}
    for base, directories, names in os.walk(root, followlinks=False):
        directories[:] = sorted(d for d in directories if not d.startswith('.')
                                and not (Path(base) / d).is_symlink())
        for name in names:
            path = Path(base) / name
            if not name.startswith('.') and not path.is_symlink() and path.is_file():
                files[path.relative_to(root).as_posix().casefold()] = path
    metadata, warnings = {}, []

    def resolve(base, value):
        rel = PurePosixPath(value.replace('\\', '/'))
        if rel.is_absolute() or '..' in rel.parts or ':' in value:
            return None
        return files.get((base / Path(*rel.parts)).relative_to(root).as_posix().casefold())

    def url(path):
        return '/roms/' + quote(path.relative_to(root).as_posix(), safe='/')

    for xml in sorted(p for p in files.values() if p.name.lower() == 'gamelist.xml'):
        try:
            if xml.stat().st_size > 16 * 1024 * 1024:
                raise ValueError('gamelist.xml exceeds 16 MiB')
            content = xml.read_bytes()
            if b'<!DOCTYPE' in content.upper() or b'<!ENTITY' in content.upper():
                raise ValueError('XML entities are not supported')
            for node in ET.fromstring(content).findall('game'):
                rom = resolve(xml.parent, node.findtext('path', ''))
                if rom is None:
                    continue
                item = {key: node.findtext(tag, '').strip() for key, tag in
                        [('title', 'name'), ('description', 'desc'),
                         ('publisher', 'publisher'), ('aliases', 'sortname')]}
                item['title'] = re.sub(r'^[A-Za-z0-9]+\s*-\s*', '', item['title'])
                game_rel = rom.relative_to(xml.parent)
                folders = [part for part in game_rel.parts[:-1] if part not in CORES]
                if folders:
                    item['category'] = folders[0]
                for key, tag in [('cover', 'image'), ('video', 'video'), ('logo', 'marquee')]:
                    asset = resolve(xml.parent, node.findtext(tag, ''))
                    if asset and asset.suffix.lower() in {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm'}:
                        item[key] = url(asset)
                metadata[rom] = item
        except (ET.ParseError, ValueError, OSError) as error:
            warnings.append(f'{xml.relative_to(root)}: {error}')

    games = []
    ordering = {path: index for index, path in enumerate(metadata)}
    for rom in sorted(files.values(), key=lambda p: (ordering.get(p, len(ordering)), str(p))):
        if rom.suffix.lower() not in {'.zip', '.7z'} or rom.name.lower() in BIOS:
            continue
        rel = rom.relative_to(root)
        item = dict(metadata.get(rom, {}))
        core = next((p for p in rel.parts[:-1] if p in CORES), default_core)
        # These two original ROM sets were tested with MAME in the original installation.
        # A filename alone is not a compatibility guarantee for other ROM revisions.
        if core == 'fbneo' and rom.name.lower() in {'kof97.zip', 'dino.zip'}:
            core = 'mame2003_plus'
        bios = next((files[key] for p in [rom.parent / 'collection-bios.zip', root / 'collection-bios.zip',
                                         rom.parent / 'neogeo.zip', root / 'neogeo.zip']
                     if (key := p.relative_to(root).as_posix().casefold()) in files), None)
        item.update(id=rel.as_posix(), title=item.get('title') or rom.stem,
                    filename=rom.name, category=item.get('category') or (rel.parts[-2] if len(rel.parts) > 1 else '未分类'),
                    rom=url(rom), bios=url(bios) if bios else '', core=core)
        games.append(item)
    return {'games': games, 'categories': dict(Counter(g['category'] for g in games)),
            'warnings': warnings, 'source': '本机挂载目录'}
