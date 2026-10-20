"""Remove loading time and export a silent screen recording."""
from pathlib import Path
import json
import subprocess

root = Path(__file__).resolve().parents[1]
timeline = json.loads((root / 'dist/recording/timeline.json').read_text())
cuts = {scene['scene']: scene['seconds'] for scene in timeline['cuts']}
if 'support' in cuts:
    raise RuntimeError('Re-record without donation scenes before rendering')
loading, gameplay = cuts['loading'], cuts['gameplay']
video_file = root / timeline['file']
filters = (f'[0:v]split=2[a][b];[a]trim=start=0:end={loading:.3f},setpts=PTS-STARTPTS[v0];'
           f'[b]trim=start={gameplay:.3f},setpts=PTS-STARTPTS[v1];'
           '[v0][v1]concat=n=2:v=1:a=0,fps=30,format=yuv420p[v]')
output = root / 'dist/pixel-arcade-family-promo.mp4'
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'warning', '-y', '-i', str(video_file),
                '-filter_complex', filters, '-map', '[v]', '-an', '-c:v', 'libx264',
                '-preset', 'medium', '-crf', '21', '-movflags', '+faststart', str(output)], check=True)
print(json.dumps({'output': str(output), 'audio': False}))
