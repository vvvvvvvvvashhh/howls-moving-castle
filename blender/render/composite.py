"""Native geometry-guided lighting filter and distance haze. Runs on Blender's
CPU compositor, including builds compiled without OpenImageDenoise."""
import bpy
from lighting import rgba
from timeline import SEASONS,HIGHLAND
def compositor(scene,timeline=None,denoise=True):
 scene.use_nodes=True;scene.render.use_compositing=True;scene.render.compositor_device='CPU';nt=scene.node_tree;nt.nodes.clear()
 vl=scene.view_layers[0];vl.use_pass_z=True
 cyc=scene.render.engine=='CYCLES'
 if cyc:vl.cycles.denoising_store_passes=denoise
 def node(typ,label,loc):
  n=nt.nodes.new(typ);n.name=n.label=label;n.location=loc;return n
 def link(a,b):nt.links.new(a,b)
 def mix(mode,l,r,f,label,loc):
  m=node('CompositorNodeMixRGB',label,loc);m.blend_type=mode
  for v,i in ((f,0),(l,1),(r,2)):
   if isinstance(v,(tuple,float,int,list)):m.inputs[i].default_value=v
   else:link(v,m.inputs[i])
  return m.outputs[0]
 def maths(op,a,b,label,loc):
  m=node('CompositorNodeMath',label,loc);m.operation=op
  for val,i in ((a,0),(b,1)):
   if isinstance(val,(int,float)):m.inputs[i].default_value=val
   else:link(val,m.inputs[i])
  return m.outputs[0]
 src=node('CompositorNodeRLayers','Blender camera, light and geometry',(-950,155));beauty=src.outputs['Image']
 if cyc and denoise:
  albedo=src.outputs['Denoising Albedo'];normal=src.outputs['Denoising Normal']
  # Work on illumination divided by the actual paint. Fine roof tiles, iron
  # rivets and flower colours consequently survive the noise filtering.
  gain=mix('ADD',albedo,(.20,.20,.20,1),1.,'Surface pigment with dark-floor guard',(-710,345))
  irradiance=mix('DIVIDE',beauty,gain,1.,'Isolate illumination',(-470,295))
  norm_01=mix('MIX',normal,(.56,.56,.56,1),.53,'Surface orientation',(-710,90))
  witness=mix('MIX',albedo,norm_01,.47,'Albedo and normal guide',(-485,65))
  fil=node('CompositorNodeBilateralblur','Edge-aware light filter',(-225,245));fil.iterations=2;fil.sigma_color=.084;fil.sigma_space=2.1;link(irradiance,fil.inputs['Image']);link(witness,fil.inputs['Determinator'])
  lit=mix('MULTIPLY',fil.outputs[0],gain,1.,'Restore original colour',(0,275))
  # The background is deterministic. Preserve pin stars and the daybreak sun.
  visible=maths('LESS_THAN',src.outputs['Depth'],2400.,'Solid surfaces',(-125,-45))
  beauty=mix('MIX',beauty,lit,visible,'Clear unfiltered sky',(240,285))
 else:visible=maths('LESS_THAN',src.outputs['Depth'],2400.,'Solid surfaces',(-155,-40))
 depth=node('CompositorNodeMapRange','Aerial perspective in world units',(-200,-250));depth.use_clamp=True;depth.inputs[1].default_value=150.;depth.inputs[2].default_value=570.;depth.inputs[3].default_value=0.;depth.inputs[4].default_value=.36;link(src.outputs['Depth'],depth.inputs[0])
 haze=maths('MULTIPLY',depth.outputs[0],visible,'Atmosphere in front of the terrain',(25,-130))
 tint=node('CompositorNodeRGB','Horizon light',(25,-290));tint.outputs[0].default_value=rgba(HIGHLAND['horizon'])
 if timeline:
  frames=timeline['frames']
  for i,rec in enumerate(frames):
   p=frames[max(i-1,0)];n=frames[min(i+1,len(frames)-1)]
   if i not in (0,len(frames)-1) and rec['world']==p['world']==n['world'] and (not rec.get('sky') or i%8):continue
   sky=rec.get('sky') or SEASONS.get(rec['world'],HIGHLAND);tint.outputs[0].default_value=rgba(sky.get('horizon',HIGHLAND['horizon']));tint.outputs[0].keyframe_insert('default_value',frame=int(rec['frame']))
 out=mix('MIX',beauty,tint.outputs[0],haze,'Distant air without obscuring foreground',(520,150))
 fin=node('CompositorNodeComposite','Final picture',(770,170));link(out,fin.inputs['Image'])
 return fin
