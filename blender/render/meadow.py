"""Preserve the recovered alpine meadow's cutout leaves during glancing ray paths."""
from pathlib import Path
import bpy


def preserve_source_meadow(scene):
    plants = [
        ob for ob in scene.objects
        if ob.type == 'MESH' and (
            'wind-turned meadow blades' in ob.get('source_name', '').lower()
            or 'wildflowers' in ob.get('source_name', '').lower()
        )
    ]
    if not plants:
        return 0
    for ob in plants:
        ob.visible_shadow = False

    for mat in {mat for ob in plants for mat in ob.data.materials}:
        nt = mat.node_tree
        if nt.nodes.get('Source meadow Lambert'):
            continue
        pr = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        output = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
        diffuse = nt.nodes.new('ShaderNodeBsdfDiffuse')
        diffuse.name = diffuse.label = 'Source meadow Lambert'
        diffuse.location = (480, 280)
        pigment = pr.inputs['Base Color']
        if pigment.links:
            nt.links.new(pigment.links[0].from_socket, diffuse.inputs['Color'])
        else:
            diffuse.inputs['Color'].default_value = pigment.default_value
        # Cycles uses the source's imported split vertex normals. Forcing a
        # world-space normal here makes grazing rays produce hot shading points.
        clear = nt.nodes.new('ShaderNodeBsdfTransparent')
        clear.label = 'Opening between grass blades'
        clear.location = (475, 80)
        coverage = nt.nodes.new('ShaderNodeMixShader')
        coverage.label = 'Original leaf and petal silhouette'
        coverage.location = (710, 220)
        nt.links.new(pr.inputs['Alpha'].links[0].from_socket, coverage.inputs[0])
        nt.links.new(clear.outputs[0], coverage.inputs[1])
        nt.links.new(diffuse.outputs[0], coverage.inputs[2])
        nt.links.new(coverage.outputs[0], output.inputs['Surface'])
        nt.nodes.remove(pr)

    # In shots with the meadow, shallow viewing rays can cross dozens of
    # transparent leaves. Keep the original path setting in all other sets.
    keyframes = ((1, 32), (529, 10), (601, 32), (721, 10), (961, 32))
    for frame, limit in keyframes:
        scene.cycles.transparent_max_bounces = limit
        scene.cycles.keyframe_insert(data_path='transparent_max_bounces', frame=frame)
    action = scene.animation_data.action
    for curve in action.fcurves:
        if curve.data_path == 'cycles.transparent_max_bounces':
            for key in curve.keyframe_points:
                key.interpolation = 'CONSTANT'
    scene.frame_set(scene.frame_current)
    return len(plants)


if __name__ == '__main__':
    import sys
    directory = Path(__file__).resolve().parent
    scene = bpy.context.scene
    count = preserve_source_meadow(scene)
    if count != 6:
        raise RuntimeError(f'Expected six original grass and flower stands, found {count}')
    scene.frame_set(1)
    bpy.context.preferences.filepaths.save_version = 0
    destination = str(directory / 'production_v4.blend')
    bpy.ops.wm.save_as_mainfile(filepath=destination, compress=True)
    print(f'SAVED_MEADOW {destination} {count}', flush=True)
    scene.render.resolution_x = 768
    scene.render.resolution_y = 432
    scene.render.resolution_percentage = 100
    scene.cycles.samples = 4
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = .30
    scene.render.filepath = str(directory / 'v4_opening_0001.jpg')
    bpy.ops.render.render(write_still=True)
