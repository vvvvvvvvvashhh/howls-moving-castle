"""Editable 24 fps camera, sky and hero-material signals from the director's frames."""
import bpy, math
import numpy as np
from lighting import make_world,set_weather,world_vector
from materials import set_signals
from mathutils import Quaternion
HIGHLAND=dict(horizon='#bfdae1',zenith='#3e84ba',sunColor='#fff0cb',sunDirection=(-.525,.662,.550),sunPower=3.05,moonPower=0,ambient=.75,dawnDisc=.23,windowGlow=0,stars=0)
SEASONS={
 'highlands':HIGHLAND,'kitchen':dict(HIGHLAND),
 'spring':dict(horizon='#c8ddd8',zenith='#588bb5',sunColor='#ffe9ce',sunDirection=(.443,.71,.54),sunPower=2.75,ambient=.75),
 'summer':dict(horizon='#b9dfdd',zenith='#4383b4',sunColor='#ffedbd',sunDirection=(.335,.708,.623),sunPower=3.,ambient=.70),
 'autumn':dict(horizon='#e8c8a6',zenith='#778eb0',sunColor='#ffd5a4',sunDirection=(.42,.44,.792),sunPower=2.85,ambient=.69),
 'winter':dict(horizon='#cad9e3',zenith='#778da7',sunColor='#e9e9df',sunDirection=(.36,.63,-.705),sunPower=2.,ambient=.77),
}
def channel(block,path,values,index=0,interp='LINEAR',name=None):
 if not values:return
 ad=block.animation_data_create()
 if ad.action is None:ad.action=bpy.data.actions.new(name or block.name+' motion')
 old=ad.action.fcurves.find(path,index=index)
 if old:ad.action.fcurves.remove(old)
 fc=ad.action.fcurves.new(path,index=index);points=fc.keyframe_points;points.add(len(values));a=np.asarray(values,dtype=np.float32);points.foreach_set('co',a.ravel())
 for p in points:p.interpolation=interp
 fc.update()
 return fc
def grouped_channels(block,path,frames,vals):
 a=np.asarray(vals)
 if a.ndim==1:a=a[:,None]
 for i in range(a.shape[1]):
  channel(block,path,list(zip(frames,a[:,i])),i)
def make_camera(scene,frames):
 data=bpy.data.cameras.new('40 mm gate • travelling camera');o=bpy.data.objects.new('Camera • the travelling castle',data);scene.collection.objects.link(o);scene.camera=o;o.rotation_mode='QUATERNION'
 data.sensor_fit='HORIZONTAL';data.sensor_width=36.;data.clip_start=.08;data.clip_end=3000.;data.dof.use_dof=False
 basis_z=(0.,0.,1.)
 locs=[];rots=[];lens=[];indices=[];prev=None
 for rec in frames:
  d=rec['camera'];fr=int(rec['frame']);pos=world_vector(d['position']);v=world_vector(d['target'])-pos
  q=v.to_track_quat('-Z','Y')@Quaternion(basis_z,float(d.get('bank',0)))
  if prev and q.dot(prev)<0:q.negate()
  prev=q.copy();indices.append(fr);locs.append(tuple(pos));rots.append(tuple(q))
  lens.append(36./(16./9)/(2.*math.tan(math.radians(d['fovY'])*.5)))
 grouped_channels(o,'location',indices,locs);grouped_channels(o,'rotation_quaternion',indices,rots);grouped_channels(data,'lens',indices,lens)
 return o
def configure_timeline(scene,timeline):
 frames=timeline['frames'];scene.frame_start=timeline.get('frameStart',1);scene.frame_end=timeline.get('frameEnd',len(frames));scene.render.fps=timeline.get('fps',24);scene.render.fps_base=1
 cam=make_camera(scene,frames);weather=make_world(scene)
 for i,f in enumerate(frames):
  last=frames[max(i-1,0)];nxt=frames[min(i+1,len(frames)-1)]
  changing=f['world']!=last['world'] or f['world']!=nxt['world']
  if not (i in (0,len(frames)-1) or changing or i%8==0):continue
  sky=dict(f.get('sky') or SEASONS.get(f['world'],HIGHLAND))
  d=f['camera'];dx=d['position'][0]-d['target'][0];dz=d['position'][2]-d['target'][2];angle=math.atan2(dx,dz)-.51
  sky['_cameraFillDirection']=[.835*math.sin(angle),.55,.835*math.cos(angle)]
  cp=list(f.get('castle',{}).get('position',[0,0,0]));cp[1]+=22.;sky['_castleCenter']=cp
  inside=f['type']=='interior'
  set_weather(weather,sky,int(f['frame']),inside)
  set_signals(f['frame'],sky.get('windowGlow',0),1.0 if f['world']=='winter' else 0.,inside)
 for b in (weather['sun'],weather['sun'].data,weather['moon'],weather['moon'].data,weather['skylight'],weather['skylight'].data,weather['reflector'],weather['reflector'].data,weather['w'].node_tree):
  if b.animation_data and b.animation_data.action:
   for fc in b.animation_data.action.fcurves:
    for p in fc.keyframe_points:p.interpolation='LINEAR'
 for lab,sec in [('Meadow',0),('The kitchen',22),('A travelling friend',25),('Spring',30),('Summer',32.5),('Autumn',35),('Winter',37.5),('Flight begins',40),('Stars',50.5),('Daybreak',54.05),('Travelling home',57.)]:scene.timeline_markers.new(lab,frame=1+round(sec*scene.render.fps))
 return cam,weather
