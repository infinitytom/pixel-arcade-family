"""Import user-owned Phosphor Line 2.0 / Dot 3.3 presets without redistributing assets."""
import argparse
import io
import json
from pathlib import Path, PurePosixPath
import re
from zipfile import ZipFile
from phosphor_slang import translate


def convert(source):
    with ZipFile(source) as outer:
        nested = next((n for n in outer.namelist() if n.endswith('/PhosphorDot/v3.3.zip')), None)
        archive = ZipFile(io.BytesIO(outer.read(nested))) if nested else outer
        try:
            base = next(n.rsplit('/', 1)[0] + '/' for n in archive.namelist()
                        if n.endswith('/phosphor-dot v3.3/CRT.glslp') and '/shaders_glsl/' in n)
            shaders = {}
            for output, preset in [('phosphor-dot.glslp', 'CRT.glslp'),
                                   ('phosphor-glow.glslp', 'Dot-bloom.glslp')]:
                text = archive.read(base + preset).decode('utf-8-sig').replace('\r', '')
                resources = []
                for name in dict.fromkeys(re.findall(r'^shader\d+\s*=\s*"([^"]+)"', text, re.M)):
                    relative = PurePosixPath(name)
                    if relative.is_absolute() or '..' in relative.parts:
                        raise ValueError('Unexpected shader dependency path')
                    code = archive.read(base + name).decode('utf-8-sig').replace('\r', '')
                    resources.append({'name': relative.name, 'type': 'text', 'value': code})
                    text = text.replace('"' + name + '"', '"' + relative.name + '"')
                defaults = dict(re.findall(r'^(\w+)\s*=\s*"([-+0-9.eE]+)"\s*$', text, re.M))
                for resource in resources:
                    resource['value'] = re.sub(r'^(#pragma parameter\s+(\w+)\s+"[^"]*"\s+)([-+0-9.eE]+)', lambda m: m[1] + defaults.get(m[2], m[3]), resource['value'], flags=re.M)
                shaders[output] = {'shader': {'type': 'text', 'value': text}, 'resources': resources}
            line_archive = next((n for n in outer.namelist() if n.endswith('/PhosphorLine/v2.0.zip')), None)
            if line_archive:
                with ZipFile(io.BytesIO(outer.read(line_archive))) as line:
                    line_base = 'shaders_slang/phosphor-line v2.0/'
                    for output, preset in [('phosphor-line.glslp', 'D10_PhosphorLine.slangp'),
                                           ('phosphor-line-glow.glslp', 'E10_PhosphorLineDiffusion.slangp'),
                                           ('phosphor-line-reflex.glslp', 'F10_PhosphorLineReflex.slangp')]:
                        text = line.read(line_base + preset).decode('utf-8-sig').replace('\r', '')
                        resources = []
                        for name in dict.fromkeys(re.findall(r'^shader\d+\s*=\s*"([^"]+)"', text, re.M)):
                            filename = 'pl2-' + PurePosixPath(name).stem + '.glsl'
                            code = translate(line.read(line_base + name).decode('utf-8-sig'), PurePosixPath(name).stem)
                            resources.append({'name': filename, 'type': 'text', 'value': code})
                            text = text.replace('"' + name + '"', '"' + filename + '"')
                        names = list(dict.fromkeys(name for resource in resources for name in re.findall(r'^#pragma parameter\s+(\w+)', resource['value'], re.M)))
                        text = re.sub(r'^parameters\s*=.*$', 'parameters = "' + ';'.join(names) + '"', text, flags=re.M)
                        overrides = dict(re.findall(r'^(\w+)\s*=\s*"([-+0-9.eE]+)"\s*$', text, re.M))
                        for resource in resources:
                            resource['value'] = re.sub(r'^(#pragma parameter\s+(\w+)\s+"[^"]*"\s+)([-+0-9.eE]+)',
                                lambda m: m[1] + overrides.get(m[2], m[3]), resource['value'], flags=re.M)
                        shaders[output] = {'shader': {'type': 'text', 'value': text}, 'resources': resources}
            return {'format': 'pixelarcade-phosphor-v1', 'attribution': 'Phosphor Line v2.0 / Dot v3.3 · Roc-Y（脑浆油条）',
                    'shaders': shaders}
        finally:
            if archive is not outer:
                archive.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'site/library/private-shaders.json')
    args = parser.parse_args()
    result = convert(args.archive)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
    print('Imported', len(result['shaders']), 'local GLSL presets:', args.output)
