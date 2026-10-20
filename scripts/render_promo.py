"""Trim real loading time; combine recorded app scenes and optional system narration."""
from pathlib import Path
import json
import subprocess

root = Path(__file__).resolve().parents[1]
timeline = json.loads((root / 'dist/recording/timeline.json').read_text())
cuts = {scene['scene']: scene['seconds'] for scene in timeline['cuts']}
loading, gameplay = cuts['loading'], cuts['gameplay']
removed = gameplay - loading
video_file = root / timeline['file']
voice_scenes = ['intro', 'library', 'search', 'gameplay', 'deploy', 'support']
args = ['ffmpeg', '-hide_banner', '-loglevel', 'warning', '-y', '-i', str(video_file)]
filters = [f'[0:v]split=2[a][b];[a]trim=start=0:end={loading:.3f},setpts=PTS-STARTPTS[v0];'
           f'[b]trim=start={gameplay:.3f},setpts=PTS-STARTPTS[v1];'
           '[v0][v1]concat=n=2:v=1:a=0,fps=30,format=yuv420p[v]']
for index, scene in enumerate(voice_scenes, 1):
    args += ['-i', str(root / f'dist/voice/{scene}.wav')]
    offset = cuts[scene] - (removed if cuts[scene] >= gameplay else 0)
    filters.append(f'[{index}:a]adelay={int(offset * 1000)}:all=1[voice{index}]')
duration = timeline['duration'] - removed
filters.append(''.join(f'[voice{i}]' for i in range(1, len(voice_scenes) + 1)) +
               f'amix=inputs={len(voice_scenes)}:normalize=0,apad,atrim=duration={duration:.3f}[audio]')
output = root / 'dist/pixel-arcade-family-promo.mp4'
args += ['-filter_complex', ';'.join(filters), '-map', '[v]', '-map', '[audio]',
         '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-c:a', 'aac',
         '-b:a', '160k', '-movflags', '+faststart', str(output)]
subprocess.run(args, check=True, cwd=root)
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', '1', '-i', str(output),
                '-frames:v', '1', str(root / 'docs/promo-poster.png')], check=True)
print(json.dumps({'output': str(output), 'duration': duration, 'loadingRemoved': removed}, ensure_ascii=False))
