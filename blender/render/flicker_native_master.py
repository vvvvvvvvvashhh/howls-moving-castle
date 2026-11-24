"""Prepare a new native .blend with antialiased haze and an explicit sample curve.

Run with Blender 4.3 and a previously opened source .blend. The original
art direction, motion shutter, transparent-ray schedule and sound stay intact.
"""

import argparse
import json
from pathlib import Path
import sys

import bpy


SKY_PASS = 'Direct sky coverage'
SURFACE_MIST = 'Sampled atmosphere on surfaces'


def clear_input(tree, socket):
    for link in list(socket.links):
        tree.links.remove(link)


def enable_surface_mist(scene):
    """Replace single-sample Z decisions with sample-filtered coverages."""
    layer = scene.view_layers[0]
    layer.use_pass_mist = True
    aov = layer.aovs.get(SKY_PASS) or layer.aovs.add()
    aov.name = SKY_PASS
    aov.type = 'VALUE'
    world_tree = scene.world.node_tree
    writer = world_tree.nodes.get(SKY_PASS)
    if not writer:
        writer = world_tree.nodes.new('ShaderNodeOutputAOV')
        writer.name = writer.label = SKY_PASS
        writer.location = (1100, -480)
    writer.aov_name = SKY_PASS
    writer.inputs['Value'].default_value = 1.0
    layer.update_render_passes()

    tree = scene.node_tree
    source = tree.nodes['Blender camera, light and geometry']
    sky = source.outputs[SKY_PASS]
    old_range = tree.nodes.get('Aerial perspective in world units')
    world_mist = scene.world.mist_settings
    if old_range:
        start = old_range.inputs[1].default_value
        stop = old_range.inputs[2].default_value
        strength = old_range.inputs[4].default_value
        world_mist.start = start
        world_mist.depth = stop - start
        world_mist.falloff = 'LINEAR'
        tree.nodes.remove(old_range)
    else:
        strength = tree.nodes['Atmosphere in front of the terrain'].inputs[1].default_value

    visible = tree.nodes['Solid surfaces']
    for port in visible.inputs[:2]:
        clear_input(tree, port)
    visible.operation = 'SUBTRACT'
    visible.label = 'Sampled surface coverage'
    visible.inputs[0].default_value = 1.0
    tree.links.new(sky, visible.inputs[1])

    # A fully exposed sky sample has mist=1. An opaque near-surface sample
    # has mist=0. Subtract the world coverage to leave the mist on geometry.
    atmospheric_depth = tree.nodes.get(SURFACE_MIST)
    if not atmospheric_depth:
        atmospheric_depth = tree.nodes.new('CompositorNodeMath')
        atmospheric_depth.name = atmospheric_depth.label = SURFACE_MIST
        atmospheric_depth.location = (-220, -242)
    atmospheric_depth.operation = 'SUBTRACT'
    atmospheric_depth.use_clamp = True
    tree.links.new(source.outputs['Mist'], atmospheric_depth.inputs[0])
    tree.links.new(sky, atmospheric_depth.inputs[1])
    amount = tree.nodes['Atmosphere in front of the terrain']
    for port in amount.inputs[:2]:
        clear_input(tree, port)
    amount.operation = 'MULTIPLY'
    tree.links.new(atmospheric_depth.outputs[0], amount.inputs[0])
    amount.inputs[1].default_value = strength
    if not source.outputs['Depth'].is_linked:
        layer.use_pass_z = False


def replace_sample_curve(scene, schedule):
    expected_first = scene.frame_start
    for section in schedule:
        if (section['first'] != expected_first or section['last'] < section['first']
                or not 1 <= section['samples'] <= 16777216):
            raise ValueError(f'Invalid Cycles sample section {section}')
        expected_first = section['last'] + 1
    if expected_first != scene.frame_end + 1:
        raise ValueError('The sample curve must cover all scene frames')
    action = scene.animation_data.action
    old_curve = action.fcurves.find('cycles.samples')
    if old_curve:
        action.fcurves.remove(old_curve)
    for section in schedule:
        scene.cycles.samples = section['samples']
        scene.cycles.keyframe_insert('samples', frame=section['first'])
    curve = action.fcurves.find('cycles.samples')
    for key in curve.keyframe_points:
        key.interpolation = 'CONSTANT'
    curve.update()
    for section in schedule:
        for frame in (section['first'], section['last']):
            if int(curve.evaluate(frame)) != section['samples']:
                raise RuntimeError(f'Cycles sample curve differs from the production schedule at {frame}')
    scene.frame_set(scene.frame_start)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--schedule', type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    source = Path(bpy.data.filepath).resolve()
    target = args.output.resolve()
    if source == target:
        raise ValueError('Choose a separate output path for the revised master')
    target.parent.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    schedule = json.loads(args.schedule.read_text())
    enable_surface_mist(scene)
    replace_sample_curve(scene, schedule)
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.color_depth = '8'
    scene.render.image_settings.compression = 24
    scene.render.filepath = '//frames/howl_'
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(target), compress=True, relative_remap=False)
    print('FLICKER_NATIVE_MASTER', target, json.dumps(schedule), flush=True)


if __name__ == '__main__':
    main()
