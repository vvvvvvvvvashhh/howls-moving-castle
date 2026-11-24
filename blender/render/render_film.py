"""Resumable native Blender frame writer with atomic images and timing records.
Run inside Blender, for example:
    blender -b Film.blend -t 8 --python-exit-code 7 -P render_film.py -- \
      --output frames --start 1 --end 960 --samples 8 --width 1920 --shutter 0.3
"""
from pathlib import Path
import argparse,bpy,datetime,json,os,struct,sys,time,uuid,hashlib,traceback
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
def atom_json(p,value):
 temp=p.with_name('.'+p.name+'.'+uuid.uuid4().hex[:12]+'.tmp');temp.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n');os.replace(temp,p)
def jpeg_size(path):
 if not path.is_file() or path.stat().st_size<350:return None
 try:
  with path.open('rb') as f:
   if f.read(2)!=b'\xff\xd8':return None
   while True:
    head=f.read(1)
    if not head:return None
    if head!=b'\xff':continue
    marker=f.read(1)
    while marker==b'\xff':marker=f.read(1)
    if not marker or marker in (b'\xd9',b'\xda'):return None
    if marker in (b'\x00',b'\xd8') or 0xd0<=marker[0]<=0xd7:continue
    length=struct.unpack('>H',f.read(2))[0]
    if marker[0] in (0xc0,0xc1,0xc2,0xc3):
     _,h,w=struct.unpack('>BHH',f.read(5));f.seek(-2,2);return (w,h) if f.read(2)==b'\xff\xd9' else None
    f.seek(length-2,1)
 except (OSError,struct.error):return None
def get_lock(path,worker,stale):
 for _ in range(2):
  try:
   fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o644)
   with os.fdopen(fd,'w') as h:h.write(worker+'\n')
   return True
  except FileExistsError:
   try:
    if time.time()-path.stat().st_mtime<=stale:return False
    path.unlink()
   except FileNotFoundError:pass
 return False
def parser():
 p=argparse.ArgumentParser();p.add_argument('--output',required=True);p.add_argument('--prefix',default='howl_');p.add_argument('--start',type=int,default=1);p.add_argument('--end',type=int,default=1440);p.add_argument('--step',type=int,default=1);p.add_argument('--frames',type=int,nargs='*');p.add_argument('--samples',type=int,default=8);p.add_argument('--sample-map');p.add_argument('--save-only',action='store_true');p.add_argument('--width',type=int,default=1920);p.add_argument('--shutter',type=float,default=.30);p.add_argument('--engine',default='CYCLES');p.add_argument('--tag',default='native-film-v1');p.add_argument('--worker');p.add_argument('--stale',type=int,default=900);p.add_argument('--save-master');p.add_argument('--no-compositor',action='store_true')
 return p
def main():
 args=parser().parse_args(sys.argv[sys.argv.index('--')+1:]);s=bpy.context.scene
 schedule=json.loads(Path(args.sample_map).read_text()) if args.sample_map else []
 def spp(fr):
  for seg in schedule:
   if seg['first']<=fr<=seg['last']:return int(seg['samples'])
  return args.samples
 frames=args.frames or range(args.start,args.end+1,args.step);output=Path(args.output).resolve();output.mkdir(parents=True,exist_ok=True)
 progress=output/'progress';locks=output/'locks';workers=output/'workers'
 for p in (progress,locks,workers):p.mkdir(parents=True,exist_ok=True)
 worker=args.worker or uuid.uuid4().hex[:10];status=workers/(worker+'.json')
 width=args.width;height=round(width*9/16)
 s.render.engine=args.engine;s.render.resolution_x=width;s.render.resolution_y=height;s.render.resolution_percentage=100
 s.render.image_settings.file_format='JPEG';s.render.image_settings.color_mode='RGB';s.render.image_settings.quality=97
 s.render.use_persistent_data=True;s.cycles.use_denoising=False;s.cycles.use_adaptive_sampling=False;s.cycles.samples=args.samples;s.eevee.taa_render_samples=args.samples
 s.render.use_motion_blur=args.shutter>0;s.render.motion_blur_shutter=args.shutter
 # A 0.30-frame centred exposure supports the rapid fly-through. Reset it
 # across discontinuous scene/camera cuts, including the first new frame.
 cuts={529,601,721,781,841,901,961}
 if args.no_compositor:s.render.use_compositing=False
 if args.engine!='CYCLES' and not args.no_compositor:
  sys.path.insert(0,str(Path(__file__).resolve().parent));from composite import compositor
  source=Path(__file__).resolve().parents[1]/'direction'/'frames.json';compositor(s,json.loads(source.read_text()),False)
 if args.save_master:
  cut_keys={s.frame_start:args.shutter,s.frame_end:args.shutter}
  for fr in cuts:cut_keys.update({fr-2:args.shutter,fr-1:0.,fr:0.,fr+1:args.shutter})
  for fr,sh in sorted(cut_keys.items()):s.render.motion_blur_shutter=sh;s.render.keyframe_insert(data_path='motion_blur_shutter',frame=fr)
  if s.animation_data and s.animation_data.action:
   for fc in s.animation_data.action.fcurves:
    if 'motion_blur_shutter' in fc.data_path:
     for k in fc.keyframe_points:k.interpolation='CONSTANT'
  if schedule:
   for seg in schedule:
    s.cycles.samples=seg['samples'];s.cycles.keyframe_insert(data_path='samples',frame=seg['first'])
   if s.animation_data and s.animation_data.action:
    for fc in s.animation_data.action.fcurves:
     if 'cycles.samples' in fc.data_path:
      for k in fc.keyframe_points:k.interpolation='CONSTANT'
  for screen in bpy.data.screens:
   for area in screen.areas:
    if area.type=='VIEW_3D':
     sp=area.spaces.active;sp.region_3d.view_perspective='CAMERA';sp.overlay.show_extras=False;sp.overlay.show_overlays=False;sp.shading.color_type='VERTEX'
  s.frame_set(1);s.render.filepath='//frames/howl_';bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(Path(args.save_master).resolve()),compress=True)
 if args.save_only:return
 spec=dict(tag=args.tag,width=width,height=height,samples=args.samples,shutter=args.shutter,engine=args.engine,compositing=not args.no_compositor)
 completed=0;skipped=0;started=now();master=Path(bpy.data.filepath).name
 def report(state,**extra):atom_json(status,dict(worker=worker,state=state,started=started,updated=now(),completed=completed,skipped=skipped,master=master,**extra))
 report('running')
 for fr in frames:
  spec['samples']=spp(fr)
  st=time.monotonic();stem=args.prefix+'%04d'%fr;path=output/(stem+'.jpg');met=progress/(stem+'.json');lock=locks/(stem+'.lock')
  if jpeg_size(path)==(width,height) and met.is_file():
   try:
    if json.loads(met.read_text()).get('settings')==spec:skipped+=1;continue
   except (OSError,ValueError):pass
  if not get_lock(lock,worker,args.stale):skipped+=1;continue
  tmp=output/('.'+stem+'.'+worker+'.jpg')
  try:
   report('rendering',frame=fr)
   s.frame_set(fr);s.cycles.samples=spp(fr);s.eevee.taa_render_samples=spp(fr);s.render.motion_blur_shutter=0. if any(fr in (cut-1,cut) for cut in cuts) else args.shutter
   s.render.filepath=str(tmp);bpy.ops.render.render(write_still=True)
   if jpeg_size(tmp)!=(width,height):raise RuntimeError('The written JPEG did not validate: '+str(tmp))
   os.replace(tmp,path)
   atom_json(met,dict(frame=fr,settings=spec,seconds=round(time.monotonic()-st,4),finished=now(),scene=master,bytes=path.stat().st_size,worker=worker))
   completed+=1;report('running',frame=fr)
  except Exception as ex:
   report('failed',frame=fr,error=repr(ex));raise
  finally:
   try:lock.unlink()
   except FileNotFoundError:pass
   try:tmp.unlink()
   except FileNotFoundError:pass
 report('done')
if __name__=='__main__':main()
