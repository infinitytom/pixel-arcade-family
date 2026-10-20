"""Compose a quiet original synth loop and mux it onto the unchanged silent promo.

Requires NumPy and FFmpeg. No sampled music or third-party audio is used.
"""
from pathlib import Path
import json
import math
import subprocess
import wave
import numpy as np

root = Path(__file__).resolve().parents[1]
source = root / 'dist/pixel-arcade-family-promo-v2.mp4'
if not source.exists():
    source = root / 'dist/pixel-arcade-family-promo.mp4'
info = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries',
                                          'format=duration', '-of', 'json', str(source)]))
duration = float(info['format']['duration'])
rate = 48000
beat = 60 / 100
track = np.zeros((math.ceil((duration + 1) * rate), 2), dtype=np.float64)
rng = np.random.default_rng(20261020)


def note(midi, at, length, gain, pan=0, bass=False):
    count = int(length * rate)
    t = np.arange(count) / rate
    freq = 440 * 2 ** ((midi - 69) / 12)
    tone = np.sin(2 * np.pi * freq * t)
    tone += 0.2 * np.sin(4 * np.pi * freq * t)
    tone += 0.065 * np.sin(6 * np.pi * freq * t)
    envelope = (1 - np.exp(-t * 90)) * np.exp(-t / (0.35 if bass else 0.24))
    envelope *= np.minimum(1, (length - t) * 30)
    data = gain * envelope * tone
    start = round(at * rate)
    end = min(start + count, len(track))
    if end <= start:
        return
    track[start:end, 0] += data[:end-start] * math.sqrt((1 - pan) / 2)
    track[start:end, 1] += data[:end-start] * math.sqrt((1 + pan) / 2)


# A minor / F major / C major / G major. Sparse pentatonic melody, warm plucks.
chords = [(45, [57, 60, 64, 69]), (41, [57, 60, 65, 69]),
          (48, [55, 60, 64, 67]), (43, [55, 59, 62, 67])]
melodies = [[76, None, 72, 69, None, 72, 74, None],
            [72, None, 69, None, 67, 69, 72, None],
            [76, None, 79, 76, None, 74, 72, None],
            [74, None, 71, 67, None, 69, 71, None]]
for bar in range(math.ceil(duration / (4 * beat))):
    begin = bar * 4 * beat
    bass, chord = chords[bar % 4]
    for step in range(8):
        at = begin + step * beat / 2
        note(chord[(step + (bar // 4) % 2) % 4], at, 0.52, 0.045,
             pan=-0.3 if step % 2 else 0.3)
        melody = melodies[bar % 4][step]
        if melody is not None:
            note(melody, at, 0.6, 0.034, pan=0.1)
    for step in (0, 2):
        note(bass, begin + step * beat, 0.8, 0.07, bass=True)
    # Very soft click percussion, well below the melodic layer.
    for step in range(4):
        start = round((begin + step * beat) * rate)
        n = int(0.035 * rate)
        click = rng.uniform(-1, 1, n) * np.exp(-np.arange(n) / (rate * 0.006)) * 0.006
        end = min(start + n, len(track))
        if end > start:
            track[start:end] += click[:end-start, None]

# Subtle stereo echo and gentle entrances/exits.
delay = int(beat * 0.75 * rate)
track[delay:] += 0.13 * track[:-delay, ::-1]
t = np.arange(len(track)) / rate
fade = np.minimum(1, t / 1.6) * np.clip((duration - t) / 3, 0, 1)
track *= fade[:, None]
raw = root / 'dist/arcade-background.wav'
with wave.open(str(raw), 'wb') as output:
    output.setnchannels(2)
    output.setsampwidth(2)
    output.setframerate(rate)
    output.writeframes((np.clip(track, -1, 1) * 32767).astype('<i2').tobytes())
result = root / 'dist/pixel-arcade-family-promo-v3.mp4'
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'warning', '-y', '-i', str(source),
                '-i', str(raw), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy',
                '-af', 'loudnorm=I=-27:TP=-9:LRA=6', '-c:a', 'aac', '-b:a', '128k',
                '-ar', '48000', '-t', str(duration), '-movflags', '+faststart', str(result)], check=True)
print(json.dumps({'output': str(result), 'duration': duration, 'targetLUFS': -27}))
