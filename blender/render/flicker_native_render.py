"""Render or resume the v5 native PNG sequence, committing one frame at a time.

Run Blender with the v5 master open. Set production_v5/control.json to
{"command":"pause"} or {"command":"stop"} to finish the current frame and
exit. Resume by setting {"command":"run"} and running the same command again.
"""

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import struct
import sys
import time
from contextlib import contextmanager

import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from flicker_native_master import SKY_PASS, SURFACE_MIST
from render_film import atom_json, now


FORMAT = 'cycles-v5-sampled-mist-rgb8-v1'
PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'
PNG_END = b'\x00\x00\x00\x00IEND\xaeB`\x82'


def file_hash(path):
    with path.open('rb') as reader:
        return hashlib.file_digest(reader, 'sha256').hexdigest()


def valid_png(path):
    if not path.is_file() or path.stat().st_size < 128:
        return False
    with path.open('rb') as reader:
        header = reader.read(29)
        reader.seek(-12, os.SEEK_END)
        tail = reader.read()
    return (header[:16] == PNG_SIGNATURE + b'\x00\x00\x00\rIHDR'
            and struct.unpack('>IIBBBBB', header[16:29]) == (1920, 1080, 8, 2, 0, 0, 0)
            and tail == PNG_END)


def native_png_stamp(path):
    """Read the frame and sample count written by Blender and the Cycles engine."""
    with path.open('rb') as reader:
        if reader.read(8) != PNG_SIGNATURE:
            return None
        frame = samples = None
        while header := reader.read(8):
            if len(header) != 8:
                return None
            length, kind = struct.unpack('>I4s', header)
            if kind == b'tEXt' and length < 65536:
                key, _, value = reader.read(length).partition(b'\x00')
                if key == b'Frame' and value.isdigit():
                    frame = int(value)
                if key == b'cycles.ViewLayer.samples' and value.isdigit():
                    samples = int(value)
            else:
                reader.seek(length, os.SEEK_CUR)
            reader.seek(4, os.SEEK_CUR)
            if frame is not None and samples is not None:
                return frame, samples
            if kind == b'IEND':
                break
    return None


def is_committed(path, record, frame, settings):
    if not record.is_file() or not valid_png(path):
        return False
    try:
        data = json.loads(record.read_text())
        return (data['frame'] == frame and data['settings'] == settings
                and native_png_stamp(path) == (frame, settings['samples'])
                and data['bytes'] == path.stat().st_size and data['sha256'] == file_hash(path))
    except (OSError, ValueError, KeyError):
        return False


def control_state(path):
    try:
        if not path.exists():
            return 'run'
        command = json.loads(path.read_text())['command']
        if command in ('run', 'pause', 'stop'):
            return command
    except (OSError, ValueError, KeyError):
        pass
    return 'invalid'


@contextmanager
def try_lease(path):
    # Leave each lock inode in place. Unlinking an unlocked inode while another
    # worker already has it open would allow a third writer to lock a new inode.
    with path.open('a+') as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            yield False
        else:
            yield True


def validate_master(scene, schedule):
    render = scene.render
    image = render.image_settings
    if (render.engine != 'CYCLES' or (render.resolution_x, render.resolution_y) != (1920, 1080)
            or render.resolution_percentage != 100 or render.fps != 24 or render.fps_base != 1
            or (scene.frame_start, scene.frame_end) != (1, 1440) or render.use_border
            or not render.use_motion_blur or not render.use_compositing
            or image.file_format != 'PNG' or image.color_mode != 'RGB' or image.color_depth != '8'
            or scene.cycles.use_animated_seed or scene.cycles.use_adaptive_sampling
            or scene.cycles.time_limit != 0):
        raise ValueError('The open project does not match the approved native 60-second film settings')
    layer = scene.view_layers[0]
    aov_writer = scene.world.node_tree.nodes.get(SKY_PASS)
    source = scene.node_tree.nodes['Blender camera, light and geometry']
    surface_mist = scene.node_tree.nodes.get(SURFACE_MIST)
    if (not layer.use_pass_mist or not layer.aovs.get(SKY_PASS) or not aov_writer
            or aov_writer.aov_name != SKY_PASS or aov_writer.inputs['Value'].default_value != 1
            or not surface_mist or surface_mist.operation != 'SUBTRACT'
            or not surface_mist.inputs[0].is_linked or not surface_mist.inputs[1].is_linked
            or surface_mist.inputs[0].links[0].from_socket != source.outputs['Mist']
            or surface_mist.inputs[1].links[0].from_socket != source.outputs[SKY_PASS]):
        raise ValueError('The master is missing its sampled sky and distance compositing passes')
    curves = scene.animation_data.action.fcurves
    curve = curves.find('cycles.samples')
    if (not curve or curve.mute or not curves.find('render.motion_blur_shutter')
            or not curves.find('cycles.transparent_max_bounces')):
        raise ValueError('The sample, shutter or transparent-ray schedule is missing')
    keys = [(int(k.co.x), int(k.co.y), k.interpolation) for k in curve.keyframe_points]
    if keys != [(v['first'], v['samples'], 'CONSTANT') for v in schedule]:
        raise ValueError('The sample-map keyframes differ from the active native sample curve')
    sample_by_frame = {}
    next_frame = 1
    for section in schedule:
        samples = section['samples']
        if (section['first'] != next_frame or section['last'] < next_frame or samples < 16
                or layer.samples not in (0, samples)):
            raise ValueError(f'Unsupported schedule or render layer sample override: {section}')
        for frame in range(next_frame, section['last']+1):
            if curve.evaluate(frame) != samples:
                raise ValueError(f'Native sample value differs at frame {frame}')
            sample_by_frame[frame] = samples
        next_frame = section['last']+1
    if next_frame != 1441:
        raise ValueError('The render schedule must cover 1–1440')
    return curve, sample_by_frame


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=HERE.parent / 'production_v5' / 'frames')
    parser.add_argument('--sample-map', type=Path, default=HERE / 'flicker_native_samples.json')
    parser.add_argument('--control', type=Path)
    parser.add_argument('--worker', default='native-v5')
    parser.add_argument('--start', type=int, default=1)
    parser.add_argument('--end', type=int, default=1440)
    parser.add_argument('--frames', nargs='+', type=int)
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    output = args.output.resolve()
    progress = output / 'progress'
    workers = output / 'workers'
    locks = output / 'locks'
    for directory in (output, progress, workers, locks):
        directory.mkdir(parents=True, exist_ok=True)
    if next(output.glob('howl_*.jpg'), None):
        raise ValueError('Select an independent v5 PNG folder; this directory contains a JPEG sequence')
    control = (args.control or output.parent/'control.json').resolve()
    status = workers / f'{args.worker}.json'
    master = Path(bpy.data.filepath).resolve()
    schedule = json.loads(args.sample_map.read_text())
    scene = bpy.context.scene
    curve, native_samples = validate_master(scene, schedule)
    frames = sorted(set(args.frames)) if args.frames else range(args.start, args.end+1)
    if not frames or any(f not in native_samples for f in frames):
        raise ValueError('Select one or more frames in 1–1440')
    sample_map_digest = hashlib.sha256(json.dumps(schedule, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    base_settings = dict(tag=FORMAT, engine='CYCLES', width=1920, height=1080, fps=24,
                         pixel_format='RGB8 PNG', master_sha256=file_hash(master), sample_map_sha256=sample_map_digest)
    started = now()
    completed = skipped = 0
    asset_curves = scene.animation_data.action.fcurves
    shutter_curve = asset_curves.find('render.motion_blur_shutter')
    bounces_curve = asset_curves.find('cycles.transparent_max_bounces')

    def report(state, **details):
        atom_json(status, dict(worker=args.worker, state=state, started=started, updated=now(),
                               completed=completed, skipped=skipped, selected_frames=len(frames), **details))

    def commit_frame(frame, path, record, settings):
        nonlocal completed
        temp = output/f'.{path.stem}.{args.worker}.{os.getpid()}.png'
        try:
            scene.frame_set(frame)
            scene.cycles.samples = settings['samples']
            if (round(scene.render.motion_blur_shutter, 6) != settings['shutter']
                    or scene.cycles.transparent_max_bounces != settings['transparent_bounces']):
                raise RuntimeError(f'Scene evaluation disagrees with its native controls at {frame}')
            report('rendering', frame=frame, samples=scene.cycles.samples)
            print('NATIVE_FRAME_START', frame, scene.cycles.samples, flush=True)
            scene.render.filepath = str(temp)
            begin = time.monotonic()
            result = bpy.ops.render.render(write_still=True)
            stamp = native_png_stamp(temp) if temp.is_file() else None
            if ('FINISHED' not in result or not valid_png(temp) or scene.cycles.samples != native_samples[frame]
                    or stamp != (frame, native_samples[frame])):
                raise RuntimeError(f'Native render failed to produce the expected frame {frame}')
            digest = file_hash(temp)
            size = temp.stat().st_size
            os.replace(temp, path)
            seconds = round(time.monotonic()-begin, 4)
            atom_json(record, dict(frame=frame, settings=settings, native_samples=stamp[1], sha256=digest, bytes=size,
                                   seconds=seconds, finished=now(), master=master.name, worker=args.worker))
            completed += 1
            report('running', frame=frame, last_frame_seconds=seconds)
            print('NATIVE_FRAME_DONE', frame, scene.cycles.samples, seconds, digest, flush=True)
        finally:
            temp.unlink(missing_ok=True)

    with try_lease(workers/f'{args.worker}.lock') as acquired:
        if not acquired:
            raise RuntimeError(f'A worker already owns the selected monitor name {args.worker}')
        # The native curve has just been checked at all 1440 frames. Hold the
        # verified centre-frame value during subframe evaluation for the shutter.
        curve.mute = True
        scene.render.use_persistent_data = True
        report('running')
        try:
            todo = frames
            while todo:
                held_by_peers = []
                for frame in todo:
                    command = control_state(control)
                    if command != 'run':
                        report({'pause': 'paused', 'stop': 'stopped', 'invalid': 'invalid-control'}[command], next_frame=frame)
                        print('NATIVE_CONTROL_EXIT', command, frame, flush=True)
                        return
                    stem = f'howl_{frame:04d}'
                    path, record = output/(stem+'.png'), progress/(stem+'.json')
                    with try_lease(locks/(stem+'.lock')) as owns_frame:
                        if not owns_frame:
                            held_by_peers.append(frame)
                            continue
                        settings = dict(base_settings, samples=native_samples[frame],
                                        shutter=round(shutter_curve.evaluate(frame), 6),
                                        transparent_bounces=round(bounces_curve.evaluate(frame)))
                        if is_committed(path, record, frame, settings):
                            skipped += 1
                        else:
                            commit_frame(frame, path, record, settings)
                todo = held_by_peers
                if todo:
                    report('waiting-for-peer', remaining=len(todo))
                    time.sleep(2)
            report('done', frame=frames[-1])
        except BaseException as exc:
            report('failed', frame=frame if 'frame' in locals() else None, error=repr(exc))
            raise
        finally:
            curve.mute = False


if __name__ == '__main__':
    main()
