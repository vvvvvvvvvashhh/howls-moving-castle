"""Finalize an independent .blend copy with score, shot markers, and camera workspace.

blender -b master.blend -P finalize_project.py -- --output film.blend --score preserved_score.m4a
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy

TOOLS=Path(__file__).resolve().parent
sys.path.insert(0,str(TOOLS))
from pack_score import pack_score

MARKERS=(
    (0,'开场｜风穿花海'),(5.75,'追鸟｜随乌鸦升起'),(10.70,'掠门｜城堡近景'),
    (15.80,'小镇｜红屋顶街道'),(22,'炉火｜卡西法回应'),(25,'伙伴｜芜菁头出发'),
    (30,'四季｜春花初开'),(32.5,'夏｜草木临水'),(35,'秋｜金色林间'),(37.5,'冬｜踏过雪原'),
    (40,'远行｜沙丘与城镇'),(42.35,'起飞蓄力｜城堡屈膝'),(43.63,'起飞｜推力释放'),
    (47.35,'阵风｜空中回摆'),(50.50,'夜航｜灯火亮起'),(54.05,'黎明｜太阳升起'),
    (55.42,'草地告别｜一起追赶'),
)
REPLACED_MARKERS={'Meadow','The kitchen','A travelling friend','Spring','Summer','Autumn','Winter',
                  'Flight begins','Stars','Daybreak','Travelling home'}


CUT_FRAMES=(529,601,721,781,841,901,961)


def standalone_render(scene,schedule):
    # Mirror the native production settings so Ctrl-F12 renders the same
    # camera, timing, sample budget and hard-cut boundaries without a script.
    scene.render.engine='CYCLES'
    scene.render.resolution_x=1920;scene.render.resolution_y=1080
    scene.render.resolution_percentage=100
    scene.render.use_compositing=True;scene.render.use_persistent_data=True
    scene.cycles.use_denoising=False;scene.cycles.use_adaptive_sampling=False
    scene.render.use_motion_blur=True
    existing=scene.animation_data.action if scene.animation_data else None
    if existing:
        for fc in list(existing.fcurves):
            if fc.data_path in ('cycles.samples','render.motion_blur_shutter'):
                existing.fcurves.remove(fc)
    cut_keys={scene.frame_start:.30,scene.frame_end:.30}
    for fr in CUT_FRAMES:cut_keys.update({fr-1:0.0,fr:0.0,fr+1:.30})
    for fr,val in sorted(cut_keys.items()):
        scene.render.motion_blur_shutter=val
        scene.render.keyframe_insert(data_path='motion_blur_shutter',frame=fr)
    for seg in schedule:
        scene.cycles.samples=int(seg['samples'])
        scene.cycles.keyframe_insert(data_path='samples',frame=int(seg['first']))
    for fc in scene.animation_data.action.fcurves:
        if fc.data_path in ('cycles.samples','render.motion_blur_shutter'):
            for key in fc.keyframe_points:key.interpolation='CONSTANT'
    scene.render.image_settings.file_format='FFMPEG'
    scene.render.image_settings.color_mode='RGB'
    encoder=scene.render.ffmpeg
    encoder.format='MPEG4';encoder.codec='H264';encoder.constant_rate_factor='HIGH'
    encoder.ffmpeg_preset='GOOD';encoder.audio_codec='AAC';encoder.audio_channels='STEREO'
    encoder.audio_mixrate=48000;encoder.audio_bitrate=256
    scene.render.filepath='//howls_moving_castle_render.mp4'


def mark_shots(scene):
    owned=REPLACED_MARKERS|{label for sec,label in MARKERS}
    for marker in tuple(scene.timeline_markers):
        if marker.name in owned:
            scene.timeline_markers.remove(marker)
    rate=scene.render.fps/scene.render.fps_base
    for sec,label in MARKERS:
        scene.timeline_markers.new(label,frame=scene.frame_start+round(sec*rate))


def camera_workspace(scene):
    layout=bpy.data.workspaces.get('Layout')
    if layout and bpy.context.window:
        bpy.context.window.workspace=layout
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type!='VIEW_3D':continue
            space=area.spaces.active
            space.camera=scene.camera
            space.lock_camera=False
            if space.region_3d:
                space.region_3d.view_perspective='CAMERA'
                space.region_3d.view_camera_offset=(0,0)
                space.region_3d.view_camera_zoom=0
    for obj in tuple(bpy.context.selected_objects):
        obj.select_set(False)
    scene.frame_set(scene.frame_start)
    bpy.context.view_layer.update()


def portable_paths():
    # Packed content is authoritative. Readable relative extraction paths also
    # make an unpacked copy usable on a different computer.
    used=set()
    for image in bpy.data.images:
        if not image.packed_file or not image.filepath_raw:continue
        name=Path(image.filepath_raw).name
        if not name:continue
        if name in used:name=image.name+'_'+name
        used.add(name)
        path='//textures/'+name
        image.filepath_raw=path
        if len(image.packed_files)==1:image.packed_files[0].filepath=path
    for sound in bpy.data.sounds:
        if sound.packed_file:
            sound.filepath='//audio/'+Path(sound.filepath).name


def audit(scene):
    data=bpy.data
    missing=[]
    file_images=[i for i in data.images if i.type=='IMAGE' and i.name not in ('Render Result','Viewer Node')]
    for im in file_images:
        if im.source=='FILE' and im.packed_file is None:missing.append({'image':im.name,'path':im.filepath})
        if im.source=='GENERATED' and im.packed_file is None:missing.append({'generated_image':im.name})
    for snd in data.sounds:
        if snd.filepath and not snd.packed_file:missing.append({'sound':snd.name,'path':snd.filepath})
    for lib in data.libraries:
        if lib.filepath:missing.append({'library':lib.filepath})
    for clip in data.movieclips:
        if clip.filepath and not getattr(clip,'packed_file',None):missing.append({'movieclip':clip.filepath})
    for f in data.fonts:
        if f.filepath not in ('','<builtin>','<builtin_font>') and not f.packed_file:
            missing.append({'font':f.name,'path':f.filepath})
    for cache in data.cache_files:
        if cache.filepath:missing.append({'geometry_cache':cache.filepath})
    for vol in data.volumes:
        if vol.filepath and not getattr(vol,'packed_file',None):missing.append({'volume':vol.filepath})
    seq=scene.sequence_editor
    seqs=(seq.sequences_all if hasattr(seq,'sequences_all') else seq.strips_all) if seq else []
    strips=list(seqs)
    sounds=[st for st in strips if st.type=='SOUND']
    visuals=[st.name for st in strips if st.type!='SOUND']
    labels={m.name for m in scene.timeline_markers}
    expected={label for sec,label in MARKERS}
    saved_frame=scene.frame_current
    root=data.objects.get('HW • Calcifer | carried')
    stable={}
    for fr in (529,644,1048,1139,1300,1396,1440):
        scene.frame_set(fr)
        stable[fr]=[(o.name,o.matrix_world.copy()) for o in (scene.camera,root) if o is not None]
    seek=0.0
    for fr,items in reversed(list(stable.items())):
        scene.frame_set(fr)
        for name,m in items:
            b=data.objects[name].matrix_world
            seek=max(seek,max(abs(m[r][c]-b[r][c]) for r in range(4) for c in range(4)))
    scene.frame_set(saved_frame)
    cams=[a.spaces.active.region_3d.view_perspective for a in bpy.context.screen.areas
          if a.type=='VIEW_3D' and a.spaces.active.region_3d] if bpy.context.screen else []
    score=sounds[0] if sounds else None
    sampling=[]
    existing=scene.animation_data.action if scene.animation_data else None
    if existing:
        fc=existing.fcurves.find('cycles.samples')
        if fc:sampling=[(round(k.co.x),round(k.co.y)) for k in fc.keyframe_points]
    shutdown=existing.fcurves.find('render.motion_blur_shutter') if existing else None
    bounce=existing.fcurves.find('cycles.transparent_max_bounces') if existing else None
    accent_frame=scene.frame_start+44.54*scene.render.fps/scene.render.fps_base
    steam=[]
    for obj in scene.objects:
        if 'vent |' not in obj.name or not obj.animation_data:continue
        fc=obj.animation_data.action.fcurves.find('color',index=3)
        if fc:
            steam.extend(round(k.co.y,5) for k in fc.keyframe_points if abs(k.co.x-accent_frame)<.003)
    return {
      'encoded_format':[scene.render.image_settings.file_format,scene.render.ffmpeg.format,scene.render.ffmpeg.codec,scene.render.ffmpeg.audio_codec],
      'vent_opacity_at_44p54':steam,'grass_transparent_bounce_keys':[(round(k.co.x),round(k.co.y)) for k in bounce.keyframe_points] if bounce else [],
      'sample_keys':sampling,'cut_shutters':[[fr,round(shutdown.evaluate(fr),3),round(shutdown.evaluate(fr-1),3),round(shutdown.evaluate(fr+1),3)] for fr in CUT_FRAMES] if shutdown else [],
      'frame_on_open':saved_frame,'camera':scene.camera.name if scene.camera else None,
      'active_camera_viewports':cams,'fps':scene.render.fps/scene.render.fps_base,
      'frames':[scene.frame_start,scene.frame_end],'resolution':[scene.render.resolution_x,scene.render.resolution_y],
      'native_effects':json.loads(scene.get('native_motion_summary','{}')),
      'images':len(file_images),'packed_images':sum(bool(i.packed_file) for i in file_images),'unresolved_external_data':missing,
      'render_output':scene.render.filepath,'score_location':score.sound.filepath if score else None,
      'score_strips':len(sounds),'score_packed_bytes':score.sound.packed_file.size if score and score.sound.packed_file else 0,
      'score_strip_start':score.frame_final_start if score else None,'score_strip_end_exclusive':score.frame_final_end if score else None,
      'visual_sequencer_strips':visuals,'sequencer_enabled':scene.render.use_sequencer,'scene_sound_enabled':scene.use_audio,
      'shot_markers':len(labels),'missing_markers':sorted(expected-labels),'repeat_seek_error':seek,
    }


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',required=True)
    parser.add_argument('--score',help='Optional local audio file to pack; omit for the public silent edition')
    parser.add_argument('--report')
    parser.add_argument('--samples',default=str(TOOLS.parent/'render'/'film_samples.json'))
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    source=Path(bpy.data.filepath).resolve()
    output=Path(args.output).expanduser().resolve()
    if source==output:raise ValueError('Choose a final copy path distinct from the rendering master.')
    if not source.is_file():raise ValueError('Open the rendered master .blend before invoking the finalizer.')
    output.parent.mkdir(parents=True,exist_ok=True)
    scene=bpy.context.scene
    schedule=json.loads(Path(args.samples).read_text())
    if args.score:
        pack_score(scene,args.score)
    else:
        scene.render.use_sequencer=False
        scene.use_audio=False
    mark_shots(scene);standalone_render(scene,schedule)
    camera_workspace(scene)
    bpy.ops.file.pack_all();portable_paths()
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(output),compress=True,relative_remap=False)
    bpy.ops.wm.open_mainfile(filepath=str(output))
    scene=bpy.context.scene;report=audit(scene)
    report['source_master']=source.name
    report['source_master_sha256']=hashlib.sha256(source.read_bytes()).hexdigest()
    report['project_sha256']=hashlib.sha256(output.read_bytes()).hexdigest()
    if args.report:Path(args.report).write_text(json.dumps(report,indent=2,ensure_ascii=False))
    print('HOWL FINAL FILE',str(output),flush=True)
    print('HOWL FINAL AUDIT',json.dumps(report,ensure_ascii=False),flush=True)
    if report['unresolved_external_data'] or (args.score and not report['score_packed_bytes']) or report['missing_markers']:
        raise RuntimeError('An external reference, packed score, or chapter marker needs attention.')
    if report['native_effects'].get('particles',{}).get('events')!=662 or report['native_effects'].get('secondary_objects')!=10 or report['vent_opacity_at_44p54']!=[.63]*9:
        raise RuntimeError('The source master is missing the approved secondary motion or pressure cue.')
    if report['resolution']!=[1920,1080] or [tuple(pair) for pair in report['sample_keys']]!=[(x['first'],x['samples']) for x in schedule]:
        raise RuntimeError('The delivery copy does not contain the 1080p sampling program.')
    if (report['frame_on_open']!=scene.frame_start or report['repeat_seek_error']>1e-6 or
            report['visual_sequencer_strips'] or
            (args.score and (not report['sequencer_enabled'] or not report['scene_sound_enabled'] or
            report['score_strip_start']!=scene.frame_start or report['score_strip_end_exclusive']!=scene.frame_end+1))):
        raise RuntimeError('The saved file does not reopen with the expected camera, time, or sound timeline.')


if __name__=='__main__':
    main()
