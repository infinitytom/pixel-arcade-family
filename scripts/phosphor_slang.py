"""Backend translation for the supplied Phosphor Line 2.0 passes (not shader assets)."""
import re


def translate(text, pass_name=''):
    text = text.replace('\r', '')
    text = re.sub(r'^#version[^\n]*\n', '', text)
    parameters = []

    def block(match):
        if match[2] == 'params':
            body = re.sub(r'//[^\n]*', '', match[1])
            parameters.extend(name for kind, name in re.findall(r'\b(float|vec[234])\s+(\w+)\s*;', body) if name != 'OutputSize')
        return ''

    text = re.sub(r'layout\([^)]*\)\s*uniform\s+\w+\s*\{(.*?)\}\s*(params|global)\s*;', block, text, flags=re.S)
    sizes = {'OutputSize': 'OutputSize', 'SourceSize': 'InputSize', 'OriginalSize': 'OrigInputSize',
             'ColorAdjSize': 'ColorAdjInputSize', 'PhosphorLineSize': 'PhosphorLineInputSize'}
    uniforms = 'uniform mat4 MVPMatrix;\nuniform vec2 ' + ','.join(sorted(set(sizes.values()) | {'TextureSize', 'ColorAdjTextureSize', 'PhosphorLineTextureSize'})) + ';\n'
    uniforms += '\n'.join('uniform float ' + name + ';' for name in dict.fromkeys(parameters)) + '\n'
    for field, uniform in sizes.items():
        text = text.replace('global.' + field, '(vec4(' + uniform + ',1.0/' + uniform + '))')
    text = text.replace('params.OutputSize', '(vec4(OutputSize,1.0/OutputSize))')
    text = text.replace('global.MVP', 'MVPMatrix').replace('global.FinalViewportSize', 'ARCADE_FINAL_VIEWPORT')
    text = text.replace('params.', '').replace('mat3x3', 'mat3')
    common, rest = text.split('#pragma stage vertex', 1)
    common = re.sub(r'\btexture\s*\(', 'texture2D(', common)
    vertex, fragment = rest.split('#pragma stage fragment', 1)
    vertex = re.sub(r'layout\([^)]*\)\s*in\s+', 'attribute ', vertex)
    vertex = re.sub(r'layout\([^)]*\)\s*out\s+', 'varying ', vertex)
    vertex = re.sub(r'\bPosition\b', 'VertexCoord', vertex)
    # Desktop Slang samples normalized content; GLES uses padded power-of-two
    # textures and provides TexCoord for only the populated subrectangle.
    vertex = re.sub(r'vTexCoord\s*=\s*TexCoord\s*;', 'vTexCoord=TexCoord*TextureSize/InputSize;', vertex)
    fragment = re.sub(r'layout\([^)]*\)\s*in\s+', 'varying ', fragment)
    fragment = re.sub(r'layout\([^)]*\)\s*out\s+vec4\s+FragColor\s*;', '', fragment)
    fragment = re.sub(r'layout\([^)]*\)\s*uniform\s+', 'uniform ', fragment)
    fragment = fragment.replace('FragColor', 'gl_FragColor')
    fragment = re.sub(r'void\s+main\s*\(\s*\)\s*\{', 'void main(){gl_FragColor=vec4(0.0,0.0,0.0,1.0);', fragment)
    for name in re.findall(r'uniform sampler2D\s+(\w+)\s*;', fragment):
        replacement = 'Texture' if name == 'Source' else name + 'Texture'
        fragment = re.sub(r'\b' + name + r'\b', replacement, fragment)
    fragment = re.sub(r'\btexture\s*\(', 'texture2D(', fragment)

    # GLES 2 has no array constructors. Preserve coefficients and lookups via
    # constant branches rather than relying on desktop GLSL initialization.
    for section_name, section in [('common', common), ('fragment', fragment)]:
        arrays = []
        def array(match):
            name, values = match[1], match[2].split(',')
            arrays.append(name)
            return 'float arcade_' + name + '(int i){' + ''.join('if(i==' + str(i) + ')return ' + value.strip() + ';' for i, value in enumerate(values)) + 'return 0.0;}\n'
        section = re.sub(r'const\s+float\s+(\w+)\[\d+\]\s*=\s*float\[\d+\]\((.*?)\)\s*;', array, section, flags=re.S)
        for name in arrays:
            section = re.sub(r'\b' + name + r'\[([^\]]+)\]', r'arcade_' + name + r'(\1)', section)
        if section_name == 'common':
            common = section
        else:
            fragment = section
    source_scale = '(InputSize/TextureSize)'
    common_scale = ('(PhosphorLineInputSize/PhosphorLineTextureSize)' if pass_name in {'PP-diffusion', 'PP-reflex'} else
                    '(ColorAdjInputSize/ColorAdjTextureSize)' if pass_name == 'diffusion-h' else source_scale)
    sample_common = '#define texture2D(T,U) texture2D(T,(U)*' + common_scale + ')\n'
    sample_fragment = '#undef texture2D\n#define texture2D(T,U) texture2D(T,(U)*' + source_scale + ')\n'
    return ('/* Local backend adaptation of the user-supplied shader. Original authorship retained. */\n'
            '#ifdef GL_ES\nprecision highp float;\nprecision highp int;\n#endif\n' + uniforms + sample_common + common +
            '\n#if defined(VERTEX)\n' + vertex + '\n#elif defined(FRAGMENT)\n' + sample_fragment + fragment + '\n#endif\n')
