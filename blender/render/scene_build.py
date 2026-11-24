"""Assemble the recovered moving castle as an editable standalone Blender production."""
import argparse, json, math, os, re, sys, time
from pathlib import Path
from collections import defaultdict
ROOT=Path(__file__).resolve().parent;PROJECT=ROOT.parent
sys.path.insert(0,str(ROOT));sys.path.insert(0,str(PROJECT/'motion'))
import bpy
import numpy as np
from mathutils import Matrix
import mesh_import
from mesh_import import empty,attach,mesh_arrays,np_array,instance_matrices
from materials import configure_images,get_material,linear
from timeline import configure_timeline,channel,grouped_channels
from lighting import world_vector

def log(*args):print('HOWL',*args,flush=True)
def load_json(path):return json.loads(Path(path).read_text())
def path_root(a,p):return Path(a).resolve() if a else p
def source_label(rec):return rec.get('name') or rec.get('type','Object')+' '+rec['id']
def local_matrix(v):
 if not v:return Matrix.Identity(4)
 return Matrix(np.asarray(v,dtype=np.float64).reshape(4,4).T.tolist())
def skip_source(rec,desc):
 name=source_label(rec).lower();typ=rec.get('type')
 if typ in ('Points','Sprite','Line','LineSegments'):return True
 if name in ('atmospheric gradient from the horizon to the zenith','dappled contact shade beneath spruce stands','soft shadows at the old town foundations','soft contact of vegetation and stone'):return True
 if 'ground shadow' in name or 'contact shadow' in name or 'contact shade' in name:return True
 return False
def source_group(nid,records,roots,actors,cache):
 if nid in cache:return cache[nid]
 r=records[nid];name=r.get('name') or ''
 if nid in actors.values():
  v=next(k for k,x in actors.items() if x==nid)
  if v=='travelingFire':v='turnip'
 elif 'Walking landscape' in name:v=re.split(r'[·•:]',name)[-1].strip().lower()
 elif nid==roots.get('land'):v='highlands'
 elif nid==roots.get('kitchen'):v='kitchen'
 elif nid==roots.get('journey'):v='journey'
 elif nid==roots.get('main'):v='main'
 elif r.get('parent') in records:v=source_group(r['parent'],records,roots,actors,cache)
 else:v='main'
 cache[nid]=v;return v
def suffix_name(a):return (a[:51]+' … '+a[-8:]) if len(a)>62 else a
def load_scene(folder,subset=None):
 doc=load_json(folder/'scene.json');records0=doc['nodes'];records={x['id']:x for x in records0}
 roots=doc['roots'];actors=doc['actors'];groups={};objs={};by_name=defaultdict(list);branch=defaultdict(list);geom_objects=defaultdict(list)
 blob=np.memmap(folder/'geometry.bin',dtype=np.uint8,mode='r');mesh_import.CURRENT_BLOB=blob
 configure_images(folder);textures=doc.get('textures',{})
 for k,mat in doc['materials'].items():
  mat['id']=k
  for field in ['map','bumpMap','emissiveMap','alphaMap','normalMap']:
   ref=mat.get(field)
   if isinstance(ref,str) and ref in textures:
    desc=textures[ref];mat[field]=desc
    if field=='map':mat['repeat']=desc.get('repeat',[1,1])
 coll_root=bpy.data.collections.new('Source • scenes and actors');bpy.context.scene.collection.children.link(coll_root);conversion=empty('Three Y-up → Blender Z-up',coll_root);conversion.rotation_euler.x=math.pi/2
 collections={};shared={};totals=[0,0,0];sm=time.monotonic()
 for j,r in enumerate(records0):
  nid=r['id'];group=source_group(nid,records,roots,actors,groups);name=source_label(r);g=r.get('geometry');mids=r.get('material') or []
  if not isinstance(mids,list):mids=[mids]
  m=doc['materials'].get(mids[0],{}) if mids else {}
  if group not in collections:
   coll=bpy.data.collections.new('Film • '+group);coll_root.children.link(coll);collections[group]=coll
  coll=collections[group]
  is_web_sky=group in ('main','journey') and m.get('type')=='ShaderMaterial' and r.get('parent') in (roots.get('main'),roots.get('journey'))
  if g and not is_web_sky and not skip_source(r,m) and (subset is None or group in subset):
   geo=doc['geometries'][g];instance=r.get('instanceMatrix');colors=r.get('instanceColor');at=geo['attributes']
   cells=at.get('instanceCell') if instance else None
   sem=get_material(m,name,bool(at.get('color') or colors)).name
   shared_key=(g,tuple(mids),sem)
   if not instance and shared_key in shared:
    ob=bpy.data.objects.new(suffix_name(name),shared[shared_key]);coll.objects.link(ob)
   else:
    arr=mesh_arrays(geo,blob)
    if len(arr[1])==0:ob=empty(suffix_name(name),coll)
    else:
     mats=instance_matrices(instance)[:r.get('count',None)] if instance else None
     col=np_array(colors,np.float32,3,blob)[:len(mats)] if colors and mats is not None else None
     if cells:cells=np_array(cells,np.float32,2,blob)[:len(mats)]
     ob=attach(coll,suffix_name(name),arr,m,matrices=mats,colors=col,cells=cells)
     if not instance:shared[shared_key]=ob.data
     if len(mids)>1 and ob.data and len(ob.data.polygons):
      for mid in mids[1:]:ob.data.materials.append(get_material(doc['materials'][mid],name,arr[4] is not None))
      mi=np.zeros(len(arr[1]),dtype=np.int32)
      for grp in geo.get('groups',[]):mi[grp['start']//3:(grp['start']+grp['count'])//3]=min(len(mids)-1,grp['materialIndex'])
      if instance and len(mi)!=len(ob.data.polygons):mi=np.tile(mi,len(ob.data.polygons)//len(mi))
      if len(mi)==len(ob.data.polygons):ob.data.polygons.foreach_set('material_index',mi)
    if ob.type=='MESH':totals[0]+=len(ob.data.vertices);totals[1]+=len(ob.data.polygons);totals[2]+=1
   if ob.type=='MESH':geom_objects[g].append(ob)
  else:ob=empty(suffix_name(name),coll)
  ob['source_name']=r.get('name','');ob['source_id']=nid;ob['source_group']=group
  objs[nid]=ob
  if r.get('name'):by_name[r['name']].append(ob)
  branch[group].append(ob)
  if j and j%150==0:log('Imported objects',j,'of',len(records0),'native mesh totals',totals)
 for r in records0:
  ob=objs[r['id']];parent=objs.get(r.get('parent'),conversion);ob.parent=parent
  loc,rot,sc=local_matrix(r.get('matrix')).decompose();ob.rotation_mode='QUATERNION';ob.location=loc;ob.rotation_quaternion=rot;ob.scale=sc
 log('Asset import complete',len(objs),totals,round(time.monotonic()-sm,2))
 return dict(doc=doc,nodes=objs,records=records,by_name=by_name,branch=branch,groups=groups,geom_objects=geom_objects,
             conversion=conversion,collections=collections,blob=blob,roots=roots,actors=actors)
def compact(vals,start=1,tol=0.000001):
 vals=np.asarray(vals,dtype=np.float32)
 if len(vals)==1:return [(start,float(vals[0]))]
 a=vals[1:]-vals[:-1];keep=np.r_[True,np.abs(a[1:]-a[:-1])>tol,True]
 return list(zip(np.arange(start,start+len(vals))[keep],vals[keep]))
def write_transforms(ob,raw,frame_start=1):
 raw=raw.copy()
 q=raw[:,3:7]
 if len(q)>1:
  f=np.r_[1.,np.where(np.sum(q[1:]*q[:-1],axis=1)<0,-1.,1.)].cumprod()
  q*=f[:,None]
 for prop,data in [('location',raw[:,:3]),('rotation_quaternion',q[:,(3,0,1,2)]),('scale',raw[:,7:10])]:
  setattr(ob,prop,data[0].tolist())
  for i in range(data.shape[1]):
   if np.ptp(data[:,i])>1e-6:channel(ob,prop,compact(data[:,i],frame_start),i)
def import_actions(imported,folder,frame_start=1):
 path=folder/'animation.json'
 if not path.exists():return {},{}
 doc=load_json(path);blob=np.memmap(folder/'animation.bin',dtype=np.uint8,mode='r')
 vis={}
 for nid,tr in doc.get('tracks',{}).items():
  ob=imported['nodes'].get(nid)
  if not ob:continue
  if tr.get('transform'):write_transforms(ob,np_array(tr['transform'],np.float32,10,blob),frame_start)
  if tr.get('visible'):vis[nid]=np_array(tr['visible'],np.uint32,None,blob).astype(np.bool_)
 for gid,track in doc.get('geometryTracks',{}).items():
  if not track.get('position'):continue
  objects=imported['geom_objects'].get(gid,[])
  if not objects:continue
  ob=objects[0];nv=len(ob.data.vertices);raw=np_array(track['position'],np.float32,None,blob)
  if len(raw)!=doc['frames']*nv*3:continue
  samples=raw.reshape(doc['frames'],-1);base=samples[0];grid=np.linspace(0,len(samples)-1,min(90,len(samples)),dtype=int)
  sketch=samples[grid]-base
  gram=sketch@sketch.T
  if gram.max()<1e-9:continue
  eig,vec=np.linalg.eigh(gram);idx=np.argsort(eig)[::-1];eig=eig[idx];vec=vec[:,idx]
  positive=eig>eig[0]*1e-7
  rank=min(20,int(np.searchsorted(np.cumsum(np.maximum(eig,0))/np.maximum(eig,0).sum(),.9998)+1),int(positive.sum()))
  if rank==0:continue
  basis=(vec[:,:rank].T@sketch)/np.sqrt(eig[:rank])[:,None]
  coeff=np.empty((len(samples),rank),np.float32)
  for k in range(0,len(samples),75):coeff[k:k+75]=(samples[k:k+75]-base)@basis.T
  ob.shape_key_add(name='Basis')
  for j in range(rank):
   scale=float(np.max(np.abs(coeff[:,j])))
   if scale<1e-6:continue
   sk=ob.shape_key_add(name='Baked motion %02d'%(j+1));sk.data.foreach_set('co',np.ascontiguousarray(base+scale*basis[j],dtype=np.float32))
   sk.slider_min=-1.;sk.slider_max=1.;channel(ob.data.shape_keys,'key_blocks["'+sk.name+'"].value',compact(coeff[:,j]/scale,frame_start))
  log('Baked editable deformations',gid,rank)
 return vis,doc
def set_visibility(ob,mask,start=1):
 mask=np.asarray(mask,dtype=np.bool_)
 change=np.r_[True,mask[1:]!=mask[:-1]];hidden=(~mask).astype(np.float32)
 if change.sum()==1:ob.hide_render=bool(hidden[0]);ob.hide_viewport=bool(hidden[0]);return
 keys=list(zip(np.arange(start,start+len(mask))[change],hidden[change]))
 channel(ob,'hide_render',keys,interp='CONSTANT');channel(ob,'hide_viewport',keys,interp='CONSTANT')
def scene_visibility(imported,frames,raw_visibility,continuum):
 recs=imported['records'];group_map=imported['groups'];shape=(len(frames),);truth=np.ones(shape,dtype=np.bool_);false=np.zeros(shape,dtype=np.bool_)
 vis_cache={};group_masks=defaultdict(lambda:false)
 names=np.array([f['world'] for f in frames]);times=np.array([f['t'] for f in frames]);end=times>=40.
 for gr in ('main','journey','castle','turnip','crow'):group_masks[gr]=truth
 for gr in ('highlands','kitchen','spring','summer','autumn','winter','desert','city','sky','night'):group_masks[gr]=names==gr
 group_masks['highlands']|=end;group_masks['desert']|=(end & (times<47.));group_masks['city']|=end;group_masks['sky']|=(end & (times>42.))
 # Resolve inherited source visibility exactly once for each descendant.
 exempt=set(imported['roots'].values())|{n for n,r in recs.items() if 'Walking landscape' in (r.get('name') or '')}
 def inherited(nid):
  if nid in vis_cache:return vis_cache[nid]
  r=recs[nid];own=truth if nid in exempt else raw_visibility.get(nid,truth if r.get('visible',True) else false)
  parent=r.get('parent')
  if parent in recs:own=own & inherited(parent)
  vis_cache[nid]=own;return own
 for nid,ob in imported['nodes'].items():
  if ob.type!='MESH':continue
  gr=group_map[nid];local=group_masks[gr]
  name=ob.get('source_name','').lower()
  if gr in ('highlands','desert','city','sky'):
   local=local.copy()
   if gr=='highlands':
    if ob in continuum['late_terrain_sources']:local[end]=False
    elif nid not in continuum.get('late_highlands',set()):local[end]=False
   elif gr=='desert':local[end]=(times[end]<46.25) if nid in continuum.get('desert_trim',set()) else False
   elif gr=='city':local[end]=nid in continuum.get('city_buildings',set())
   elif gr=='sky':local[end]=nid in continuum.get('clouds',set())
  set_visibility(ob,local & inherited(nid))
def practical_lights(scene):
 col=bpy.data.collections.new('Lighting • kitchen interiors');scene.collection.children.link(col)
 def area(label,position,target,brightness,size,color):
  d=bpy.data.lights.new(label,'AREA');d.energy=brightness;d.shape='DISK';d.size=size;d.color=linear(color)
  ob=bpy.data.objects.new(label,d);col.objects.link(ob);ob.location=world_vector(position);ob.rotation_euler=(world_vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
  n=scene.frame_end;fr=np.arange(1,n+1);set_visibility(ob,(fr>=529)&(fr<601));return ob
 area('Daylight through the kitchen window',(7.35,4.38,-.05),(-2.,1.7,-3.),550,4.15,'#fff0d4')
 area('Warm bounce from the worktable',(1.6,4.25,3.4),(-.65,1.35,-3.15),150,3.8,'#ffd9a7')
def render_settings(sc,width,samples,engine):
 sc.render.engine=engine;sc.render.resolution_x=width;sc.render.resolution_y=round(width*9/16);sc.render.resolution_percentage=100
 sc.render.fps=24;sc.render.fps_base=1;sc.render.pixel_aspect_x=sc.render.pixel_aspect_y=1
 sc.render.image_settings.file_format='JPEG';sc.render.image_settings.quality=95;sc.render.image_settings.color_mode='RGB';sc.render.film_transparent=False
 sc.view_settings.view_transform='AgX';sc.view_settings.look='AgX - Medium High Contrast';sc.view_settings.exposure=.12
 sc.render.use_persistent_data=True;sc.cycles.use_denoising=False;sc.cycles.samples=samples;sc.cycles.use_adaptive_sampling=False
 sc.cycles.max_bounces=2;sc.cycles.diffuse_bounces=1;sc.cycles.glossy_bounces=1;sc.cycles.transparent_max_bounces=10;sc.cycles.transmission_bounces=0
 sc.cycles.sample_clamp_indirect=2.2;sc.cycles.blur_glossy=1.0;sc.cycles.seed=41;sc.cycles.use_animated_seed=False
 sc.eevee.taa_render_samples=samples;sc.eevee.shadow_pool_size='512';sc.eevee.shadow_ray_count=1;sc.eevee.shadow_step_count=4
 sc.eevee.use_shadows=True;sc.eevee.use_raytracing=False;sc.eevee.use_fast_gi=False
 sc.render.use_motion_blur=False;sc.render.motion_blur_shutter=.25
 sc.render.filepath='//frames/howl_'
 return sc
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--assets');ap.add_argument('--timeline');ap.add_argument('--output');ap.add_argument('--width',type=int,default=1920);ap.add_argument('--samples',type=int,default=8);ap.add_argument('--engine',default='CYCLES');ap.add_argument('--subset');ap.add_argument('--preview',type=int,nargs='*');ap.add_argument('--preview-only',action='store_true');ap.add_argument('--skip-effects',action='store_true')
 args=ap.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
 folder=path_root(args.assets,PROJECT/'export');timeline=load_json(path_root(args.timeline,PROJECT/'direction'/'frames.json'));output=path_root(args.output,ROOT/'Howls_Moving_Castle.blend')
 bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene.name='The Walk • the moving castle';bpy.context.preferences.filepaths.save_version=0
 imported=load_scene(folder,set(args.subset.split(',')) if args.subset else None)
 render_settings(scene,args.width,args.samples,args.engine);cam,weather=configure_timeline(scene,timeline)
 vis,adoc=import_actions(imported,folder)
 if not adoc:log('No source animation package yet: static preview build')
 from continuum import build_continuum
 cont=build_continuum(scene,imported,timeline['frames'])
 scene_visibility(imported,timeline['frames'],vis,cont)
 practical_lights(scene)
 if not args.skip_effects:
  from blender_motion import build_motion
  result=build_motion(scene,imported=imported,timeline=timeline)
  log('Native effects ready',list(result))
 from composite import compositor
 compositor(scene,timeline,denoise=args.engine=='CYCLES')
 scene.frame_set(scene.frame_start);bpy.context.view_layer.update();render_settings(scene,args.width,args.samples,args.engine)
 from meadow import preserve_source_meadow
 preserve_source_meadow(scene)
 if not args.preview_only:
  bpy.ops.wm.save_as_mainfile(filepath=str(output),compress=True)
  log('Saved project',output)
 for fr in args.preview or []:
  scene.frame_set(fr);scene.render.filepath=str(ROOT/f'original_scene_{args.engine}_{fr:04d}_{args.width}.jpg')
  start=time.monotonic();bpy.ops.render.render(write_still=True);log('Preview',fr,round(time.monotonic()-start,2))
if __name__=='__main__':main()
