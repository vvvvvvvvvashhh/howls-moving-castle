"""One unbroken environment for flight: the original highlands grid carries the
desert relief and eventually the exact meadow beneath the waking companions."""
import bpy, numpy as np
from materials import linear
from timeline import channel
def mesh_vec(ob):
 p=np.empty(len(ob.data.vertices)*3,dtype='f');ob.data.vertices.foreach_get('co',p);return p.reshape(-1,3)
def pigment(ob):
 a=ob.data.color_attributes.get('Color')
 if not a:return np.ones((len(ob.data.vertices),4),np.float32)
 c=np.empty(len(a.data)*4,dtype='f');a.data.foreach_get('color',c);return c.reshape(-1,4)
def smooth(a,b,x):
 u=np.clip((x-a)/(b-a),0,1);return u*u*(3-2*u)
def surface(obs,label):
 return next((o for o in obs if o.type=='MESH' and label in o.get('source_name','').lower()),None)
def sample_grid(ob,xz):
 pts=mesh_vec(ob);col=pigment(ob)[:,:3]
 xs=np.unique(pts[:,0]);zs=np.unique(pts[:,2]);shape=(len(xs),len(zs))
 if len(pts)!=shape[0]*shape[1]:raise ValueError('Irregular export grid for '+ob.name)
 coords=np.stack((np.searchsorted(xs,pts[:,0]),np.searchsorted(zs,pts[:,2])),axis=-1)
 data=np.zeros((*shape,4),np.float32);data[coords[:,0],coords[:,1],0]=pts[:,1];data[coords[:,0],coords[:,1],1:]=col
 x,z=xz.T;i=np.clip(np.searchsorted(xs,x)-1,0,len(xs)-2);j=np.clip(np.searchsorted(zs,z)-1,0,len(zs)-2)
 a=np.clip((x-xs[i])/(xs[i+1]-xs[i]),0.,1.)[:,None];b=np.clip((z-zs[j])/(zs[j+1]-zs[j]),0.,1.)[:,None]
 return (1-a)*((1-b)*data[i,j]+b*data[i,j+1])+a*((1-b)*data[i+1,j]+b*data[i+1,j+1])
def timed(ob,keys):
 for prop in ('hide_render','hide_viewport'):channel(ob,prop,keys,interp='CONSTANT')
def smooth_keys(block,path,keys):
 fc=channel(block,path,keys)
 for p in fc.keyframe_points:p.interpolation='BEZIER';p.handle_left_type='AUTO_CLAMPED';p.handle_right_type='AUTO_CLAMPED'
def terrain_shader(src,mesh):
 m=src.copy();m.name='The continuous valley • dry earth to highland pasture';mesh.materials.clear();mesh.materials.append(m);nt=m.node_tree
 p=next(n for n in nt.nodes if n.type=='BSDF_PRINCIPLED');current=p.inputs['Base Color'].links[0].from_socket
 ar=nt.nodes.new('ShaderNodeVertexColor');ar.layer_name='Desert pigment';ar.label='Desert vertex pigment from the original dunes';ar.location=(-440,625)
 fac=nt.nodes.new('ShaderNodeValue');fac.label=fac.name='Returning grass';fac.location=(-220,670)
 mx=nt.nodes.new('ShaderNodeMixRGB');mx.label='From sand to the highlands';mx.location=(170,590)
 nt.links.new(fac.outputs[0],mx.inputs[0]);nt.links.new(ar.outputs['Color'],mx.inputs[1]);nt.links.new(current,mx.inputs[2]);nt.links.new(mx.outputs[0],p.inputs['Base Color'])
 # The sand carries its own fine anisotropic ripple field in world units.
 tc=nt.nodes.new('ShaderNodeTexCoord');tc.location=(-1160,725)
 wave=nt.nodes.new('ShaderNodeTexWave');wave.wave_type='BANDS';wave.bands_direction='Z';wave.inputs['Scale'].default_value=1.75;wave.inputs['Distortion'].default_value=8.;wave.inputs['Detail'].default_value=2.;wave.inputs['Detail Scale'].default_value=.46;wave.location=(-910,720);nt.links.new(tc.outputs['Object'],wave.inputs['Vector'])
 noise=nt.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=5.7;noise.inputs['Detail'].default_value=2.;noise.location=(-910,940);nt.links.new(tc.outputs['Object'],noise.inputs['Vector'])
 grain=nt.nodes.new('ShaderNodeMixRGB');grain.blend_type='MULTIPLY';grain.inputs[0].default_value=.11;grain.location=(-135,900);nt.links.new(ar.outputs['Color'],grain.inputs[1]);nt.links.new(wave.outputs[0],grain.inputs[2]);nt.links.new(grain.outputs[0],mx.inputs[1])
 for fr,v in [(961,0.),(1040,.08),(1129,.23),(1249,.28),(1320,.93),(1340,1.)]:
  fac.outputs[0].default_value=v;fac.outputs[0].keyframe_insert('default_value',frame=fr)
 return m
def build_continuum(scene,imported,frames):
 groups=imported['branch'];result=dict(late_terrain_sources=set(),late_highlands=set(),desert_trim=set(),city_buildings=set(),clouds=set());conv=imported['conversion']
 hg=surface(groups.get('highlands',[]),'rolling alpine meadow');sg=surface(groups.get('desert',[]),'continuous terrain');cg=surface(groups.get('city',[]),'continuous terrain')
 if hg and sg:
  coll=bpy.data.collections.new('Flight • the continuous valley');scene.collection.children.link(coll)
  mesh=hg.data.copy();o=bpy.data.objects.new('Flight • continuous hills and original meadow',mesh);coll.objects.link(o);o.parent=conv;o.matrix_basis=hg.matrix_basis.copy()
  pts=mesh_vec(hg);xz=pts[:,(0,2)];sand=sample_grid(sg,xz)
  if cg:
   city_local=np.column_stack(((xz[:,0]+70.)/.74,(xz[:,1]+46.)/.74))
   city=sample_grid(cg,city_local);city[:,0]*=.74
   ww=(smooth(32,62,-city_local[:,0])*(1-smooth(151,193,-city_local[:,0]))*(1-smooth(133,177,np.abs(city_local[:,1]))))[:,None]
   sand=sand*(1-ww)+city*ww
  ab=np.clip((np.abs(xz).max(axis=1)-210.)/300.,0.,1.)
  target=pts.copy();target[:,1]=(1.-ab)*sand[:,0]+ab*pts[:,1]
  inner=(np.abs(xz[:,0])<=17)&(np.abs(xz[:,1])<=24);target[inner,1]=0.
  # Preserve the exact near-field where the friends travel. Lower only remote
  # elevations in the sunrise corridor to retain an open horizon.
  far=smooth(170,560,np.maximum(np.abs(pts[:,0]),np.abs(pts[:,2])));horizon_sector=smooth(90,290,pts[:,2])
  base=pts.copy();base[:,1]*=1.-.74*far*horizon_sector
  mesh.vertices.foreach_set('co',np.ascontiguousarray(base,dtype=np.float32).ravel());mesh.update()
  target[:,1]*=1.-.74*far*horizon_sector
  o.shape_key_add(name='Original highland meadow');k=o.shape_key_add(name='Dunes and town terraces');k.data.foreach_set('co',target.ravel());k.slider_min=0.;k.slider_max=1.
  smooth_keys(mesh.shape_keys,'key_blocks["Dunes and town terraces"].value',[(961,1.),(1045,1.),(1110,.80),(1220,.50),(1275,.31),(1310,.07),(1330,0.),(1440,0.)])
  layer=mesh.color_attributes.new(name='Desert pigment',type='BYTE_COLOR',domain='POINT')
  colors=np.ones((len(pts),4),dtype=np.float32);colors[:,:3]=sand[:,1:];layer.data.foreach_set('color',colors.ravel());terrain_shader(hg.data.materials[0],mesh)
  timed(o,[(1,1.),(961,0.)]);result['late_terrain_sources'].add(hg)
  high_ridge=surface(groups.get('highlands',[]),'alpine foothills')
  if high_ridge:
   distant=high_ridge.copy();distant.data=high_ridge.data.copy();distant.name='Flight • remote ridges below the sunrise';coll.objects.link(distant);distant.parent=conv
   verts=mesh_vec(high_ridge);radius=np.sqrt(verts[:,0]**2+verts[:,2]**2)
   # The source backdrop included a flat inner skirt. Move that unseen skirt
   # below the foreground meadow and blend back to the ridgeline with distance.
   verts[:,1]=verts[:,1]*.38-3.-58.*(1.-smooth(270.,470.,radius))
   distant.data.vertices.foreach_set('co',np.ascontiguousarray(verts,dtype=np.float32).ravel());distant.data.update()
   timed(distant,[(1,1.),(961,0.)]);result['late_terrain_sources'].add(high_ridge)
 # The city is a real district on the western slope, visible from the opening of
 # this shot; its towers retain one solar shadow even while outside the camera.
 for ob in groups.get('city',[]):
  name=ob.get('source_name','').lower()
  if any(s in name for s in ('limewashed homes','tiled roofs','stone viaduct','tower clocks','masonry trim','shuttered windows')):result['city_buildings'].add(ob['source_id'])
 # Real distant sandstone outcrops bookend the flight and supply parallax.
 for ob in groups.get('desert',[]):
  name=ob.get('source_name','').lower()
  if 'stratified sandstone' in name:result['desert_trim'].add(ob['source_id'])
 # The World already contains broken, relief-shaded cumulus. Add two original
 # high-altitude transparent cirrus/cumulus strata. No solid blob sits in the
 # valley, competes with the city or follows the companions home.
 for ob in groups.get('sky',[]):
  name=ob.get('source_name','').lower()
  if ob.type!='MESH':continue
  if any(term in name for term in ('distant fair-weather','high cirrus','wind-sheared','distant cumulus','high-altitude','cumulus cloud','cloud streets','cirrus','horizon clouds')) and 'carved' not in name:
   result['clouds'].add(ob['source_id'])
 # Existing highland plantings, water and mountains remain on their original
 # coordinates. The final character therefore walks on the very same surface.
 for ob in groups.get('highlands',[]):
  name=ob.get('source_name','').lower()
  if ob==hg:continue
  if any(q in name for q in ['foothills','tarn','wildflower','meadow blades','glacial granite','spruce','conifer','lichen','orchard','broadleaf']):
   result['late_highlands'].add(ob['source_id'])
 # A formerly scrolling world root must stay fixed while the hero travels.
 for group in ('city','desert','sky','highlands'):
  for ob in groups.get(group,[]):
   name=ob.get('source_name','').lower()
   if 'walking landscape' in name:
    if ob.animation_data and ob.animation_data.action:
     for fc in ob.animation_data.action.fcurves:
      if fc.data_path in ('location','rotation_quaternion','scale'):
       for index in range(len(fc.keyframe_points)-1,-1,-1):
        if fc.keyframe_points[index].co.x>=961:fc.keyframe_points.remove(fc.keyframe_points[index],fast=True)
       idx=fc.array_index;d={'location':(0,0,0),'rotation_quaternion':(1,0,0,0),'scale':(1,1,1)}[fc.data_path][idx];fc.keyframe_points.insert(961,d,options={'FAST'});fc.update()
    else:ob.location=(0,0,0)
    if group=='city':
     # All the masonry, windows and bridges move together as a single actual
     # distant settlement. Its cast shadows stay attached to the ground.
     ob.location=(-70.,0.,-46.);ob.scale=(.74,.74,.74)
     if ob.animation_data and ob.animation_data.action:
      for fc in ob.animation_data.action.fcurves:
       if fc.data_path in ('location','scale'):
        val=((-70.,0.,-46.) if fc.data_path=='location' else (.74,.74,.74))[fc.array_index]
        fc.keyframe_points.insert(961,val,options={'FAST','REPLACE'});fc.update()
 return result
