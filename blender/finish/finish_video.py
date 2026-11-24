"""Encode one 60-second film from native PNGs, with optional local audio.

Run with normal Python and an FFmpeg build containing libx264 and zscale.
This is a portable public wrapper around the project's approved v5 colour finish.
It does not render Blender frames and does not include a soundtrack.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess
import tempfile

from color_finish import grade_filter, write_chroma_lut


def probe(path, *options):
    return json.loads(subprocess.check_output(
        ['ffprobe', '-v', 'error', *options, '-of', 'json', str(path)], text=True))


def check_frames(folder, pattern):
    digest = hashlib.sha256()
    for number in range(1, 1441):
        path = folder / (pattern % number)
        if not path.is_file():
            raise ValueError(f'Missing frame {number}: {path.name}')
        data = path.read_bytes()
        if (data[:8] != b'\x89PNG\r\n\x1a\n'
                or struct.unpack('>II', data[16:24]) != (1920, 1080)
                or data[-12:] != b'\x00\x00\x00\x00IEND\xaeB`\x82'):
            raise ValueError(f'Expected a complete 1920 x 1080 PNG: {path.name}')
        digest.update(hashlib.sha256(data).digest())
    if (folder / (pattern % 1441)).exists():
        raise ValueError('This 60-second encoder expects exactly frames 1–1440.')
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--frames', required=True, type=Path)
    parser.add_argument('--pattern', default='howl_%04d.png')
    parser.add_argument('--audio', type=Path, help='Optional local audio; not distributed with this project')
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--no-grade', action='store_true', help='Use when the PNGs are already colour-finished')
    parser.add_argument('--threads', type=int, default=min(os.cpu_count() or 1, 8))
    parser.add_argument('--overwrite', action='store_true')
    args = parser.parse_args()
    if args.threads < 1:
        parser.error('--threads must be positive')
    frames = args.frames.resolve()
    output = args.output.resolve()
    audio = args.audio.resolve() if args.audio else None
    if output.exists() and not args.overwrite:
        parser.error('Output exists. Choose another name, or explicitly use --overwrite.')
    if output.suffix.lower() != '.mp4':
        parser.error('--output must end in .mp4')
    if audio and (not audio.is_file() or audio == output):
        parser.error('--audio must be an existing file distinct from the output')
    try:
        if Path(args.pattern % 1).name != args.pattern % 1:
            raise ValueError('Use a filename pattern without folders.')
        sequence_hash = check_frames(frames, args.pattern)
    except (OSError, ValueError, TypeError, struct.error) as error:
        parser.error(str(error))
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='howl-finish-', dir=output.parent) as temp:
        scratch = Path(temp)
        candidate = scratch / 'complete.mp4'
        write_chroma_lut(scratch)
        command = ['ffmpeg', '-nostdin', '-hide_banner', '-v', 'warning', '-xerror', '-y',
                   '-filter_threads', str(min(args.threads, 4)), '-threads', '2',
                   '-framerate', '24', '-start_number', '1', '-start_number_range', '1',
                   '-i', str(frames / args.pattern)]
        audio_mode = 'none'
        if audio:
            command += ['-i', str(audio)]
        command += ['-map', '0:v:0']
        if audio:
            stream = probe(audio, '-select_streams', 'a:0', '-show_streams')['streams'][0]
            duration = float(stream.get('duration', 0))
            if (stream.get('codec_name') == 'aac' and stream.get('sample_rate') == '48000'
                    and stream.get('channels') == 2 and abs(duration - 60) < 0.001):
                command += ['-map', '1:a:0', '-c:a', 'copy']
                audio_mode = 'copied_60_second_aac'
            else:
                command += ['-map', '1:a:0', '-af', 'atrim=duration=60,apad=whole_dur=60',
                            '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2']
                audio_mode = 'aac_trimmed_or_padded_to_60_seconds'
        else:
            command += ['-an']
        filters = grade_filter(saturation=1.0) if args.no_grade else grade_filter(protect_gamut=True)
        command += ['-map_metadata', '-1', '-map_chapters', '-1', '-vf', filters,
                    '-c:v', 'libx264', '-threads:v', str(args.threads), '-preset', 'slow', '-crf', '17',
                    '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_trc', 'bt709',
                    '-color_primaries', 'bt709', '-color_range', 'tv',
                    '-fps_mode:v', 'passthrough', '-video_track_timescale', '24000',
                    '-movflags', '+faststart', str(candidate)]
        subprocess.run(command, cwd=scratch, check=True)
        video = probe(candidate, '-count_frames', '-select_streams', 'v:0', '-show_streams')['streams'][0]
        if (video['width'], video['height'], video['r_frame_rate'], int(video['nb_read_frames'])) != (1920, 1080, '24/1', 1440):
            raise RuntimeError('Finished video failed dimensions, frame rate, or decoded-frame validation.')
        if abs(float(video['duration']) - 60) > 0.001:
            raise RuntimeError('Finished video duration differs from 60 seconds.')
        os.replace(candidate, output)
    report = {'file': output.name, 'width': 1920, 'height': 1080, 'fps': 24, 'frames': 1440,
              'duration_seconds': 60, 'chroma_finish': 1.0 if args.no_grade else 1.08,
              'gamut_protection': not args.no_grade, 'audio': audio_mode,
              'source_sequence_sha256': sequence_hash,
              'mp4_sha256': hashlib.sha256(output.read_bytes()).hexdigest()}
    output.with_suffix('.validation.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
