"""Physically based surface translation for the original coloured, UV-mapped meshes."""
import bpy,math
from pathlib import Path
from lighting import linear
MATERIALS={}
IMAGES={}
SIGNALS={}
IMAGE_ROOT=Path('.')
def configure_images(folder):
 global IMAGE_ROOT
 IMAGE_ROOT=Path(folder)
def tree_signal(label,default=0.):
 if label in SIGNALS:return SIGNALS[label]
 ng=bpy.data.node_groups.new(label,'ShaderNodeTree')
 ng.interface.new_socket(name='Amount',in_out='OUTPUT',socket_type='NodeSocketFloat')
 val=ng.nodes.new('ShaderNodeValue');val.label=label;val.outputs[0].default_value=default
 out=ng.nodes.new('NodeGroupOutput');out.location=(220,0);ng.links.new(val.outputs[0],out.inputs[0])
 SIGNALS[label]=(ng,val.outputs[0]);return SIGNALS[label]
def set_signals(frame,window_glow,snow,interior=False):
 for label,v in [('Weather • snow on up-facing plates',snow),('Lights behind glass',window_glow),('Kitchen • firelight',int(interior))]:
  ng,val=tree_signal(label);val.default_value=float(v);val.keyframe_insert('default_value',frame=frame)
def get_image(image):
 if isinstance(image,dict):image=image.get('path',image.get('image',image.get('file')))
 if not image:return None
 p=Path(image)
 if not p.is_absolute():p=IMAGE_ROOT/p
 if not p.is_file():return None
 k=str(p)
 if k not in IMAGES:
  img=bpy.data.images.load(k,check_existing=True);img.pack();IMAGES[k]=img
 return IMAGES[k]
def as_rgba(d,default=(1.,1.,1.)):
 if d is None:d=default
 if isinstance(d,str):d=linear(d)
 if isinstance(d,dict):d=[d[k] for k in ('r','g','b')]
 return (*d[:3],1.)
def get_material(desc,label,vertex=False,kind=None):
 if not desc:desc={}
 name=label or desc.get('name') or desc.get('type') or 'Painted surface'
 source_name=(str(name)+' '+str(desc.get('name',''))).lower()
 castle=('castle / ' in source_name) or 'castle/' in source_name
 family=(source_name.split('castle / ')[-1].split(' ')[0] if castle else '')
 desc_id=desc.get('id',desc.get('uuid',str(id(desc))))
 category=kind or 'surface'
 if not kind:
  if 'tarn' in source_name or any(t in source_name for t in ['lake water','lake surface','rippling water','rippled water','water on','reflected mountain panorama']):category='water'
  elif 'cloud' in source_name or any(t in source_name for t in ['cirrus','vapour','vapor','mist layer','fog layer','mist at','star field','stars at','sky-line']):category='layer'
  elif any(t in source_name for t in ['permanent','illuminated window','lamp glow','lamplight','warm windows','lit windows','lit town windows']):category='lit'
  elif any(t in source_name for t in ['meadow','terrain','pasture','hillside','field surfaces','dune ground']):category='terrain'
  elif 'window' in source_name and 'frame' not in source_name:category='window'
  elif 'wood' in source_name or 'oak' in source_name or 'timber' in source_name:category='wood'
  elif 'brass' in source_name:category='brass'
  elif 'iron' in source_name or 'copper' in source_name:category='metal'
 mat_key=(str(desc_id),family,category,bool(vertex))
 if mat_key in MATERIALS:return MATERIALS[mat_key]
 m=bpy.data.materials.new(name[:60]);MATERIALS[mat_key]=m;m.use_nodes=True;nt=m.node_tree;nt.nodes.clear()
 def node(ntype,label,x=0,y=0):
  item=nt.nodes.new(ntype);item.label=label;item.name=label;item.location=(x,y);return item
 def path(a,b):nt.links.new(a,b)
 def mix(x,y,f,mode,label,loc):
  n=node('ShaderNodeMixRGB',label,*loc);n.blend_type=mode
  for i,val in ((0,f),(1,x),(2,y)):
   if isinstance(val,(int,float,tuple,list)):n.inputs[i].default_value=val
   else:path(val,n.inputs[i])
  return n.outputs[0]
 def set_input(socket,val):
  if isinstance(val,(int,float,tuple,list)):socket.default_value=val
  else:path(val,socket)
 def maths(op,a,b,nm,loc):
  n=node('ShaderNodeMath',nm,*loc);n.operation=op;set_input(n.inputs[0],a);set_input(n.inputs[1],b);return n.outputs[0]
 def remap(source,a,b,c,d,nm,loc,smooth=False):
  n=node('ShaderNodeMapRange',nm,*loc)
  if smooth:n.interpolation_type='SMOOTHERSTEP'
  set_input(n.inputs['Value'],source);n.inputs['From Min'].default_value=a;n.inputs['From Max'].default_value=b;n.inputs['To Min'].default_value=c;n.inputs['To Max'].default_value=d;return n.outputs['Result']
 def groupval(name,loc):
  g=node('ShaderNodeGroup',name,*loc);g.node_tree=tree_signal(name)[0];return g.outputs[0]
 coords=node('ShaderNodeTexCoord','Local coordinates',-1270,-125)
 col=as_rgba(desc.get('color'))
 color=col
 if vertex:
  attr=node('ShaderNodeVertexColor','Original painted vertex colour',-1230,370);attr.layer_name='Color'
  color=attr.outputs['Color']
  if col[:3] != (1.,1.,1.):color=mix(color,col,1.,'MULTIPLY','Pigment',(-990,400))
 uv=coords.outputs['UV']
 tex_desc=desc.get('map') or desc.get('texture')
 image=get_image(tex_desc)
 tex=None;opacity=float(desc.get('opacity',1.) or 0)
 if image:
  tex=node('ShaderNodeTexImage','Original painted texture',-820,280);tex.image=image;rep=desc.get('repeat') or (tex_desc.get('repeat',[1.,1.]) if isinstance(tex_desc,dict) else [1.,1.])
  if isinstance(rep,dict):rep=(rep['x'],rep['y'])
  if any(abs(x-1.)>1e-5 for x in rep[:2]):
   v=node('ShaderNodeVectorMath','Original texture scale',-1030,90);v.operation='MULTIPLY';v.inputs[1].default_value=(*rep[:2],1.);path(uv,v.inputs[0]);uv=v.outputs[0]
  path(uv,tex.inputs[0]);color=mix(color,tex.outputs['Color'],1.,'MULTIPLY','Surface painting',(-580,350))
 typ=desc.get('type','')
 if family=='shadow':
  category='cavity'
 if family in ['metal','wood','roof','wall','brass','glass','sail']:category=family
 if family=='glass':category='window'
 metal=float(desc.get('metalness',0.) or 0)
 rough=float(desc.get('roughness',.79) if desc.get('roughness') is not None else .79)
 if category=='metal':metal=max(.55,metal);rough=min(.52,rough)
 elif category=='brass':metal=max(.78,metal);rough=min(.35,rough)
 elif category=='wood':rough=.65
 elif category=='roof':rough=.70
 elif category=='wall':rough=.86
 elif category=='window':rough=.27;metal=max(metal,.24)
 elif category=='cavity':rough=.83;metal=.10
 elif category=='terrain':rough=.90
 elif category=='water':color=(.035,.19,.245,1.);metal=.24;rough=.22
 p=node('ShaderNodeBsdfPrincipled','Reflectance and local finish',450,270)
 p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if category in ['metal','brass','roof','wood','wall','water']:
  n=node('ShaderNodeTexNoise','Casting, wear and grain',-960,-240)
  scale={'metal':1.90,'brass':3.6,'roof':2.6,'wood':4.4,'wall':5.8,'water':.57}[category]
  n.inputs['Scale'].default_value=scale;n.inputs['Detail'].default_value=2.;n.inputs['Roughness'].default_value=.61
  coord=coords.outputs['Object']
  if category in ['wood','water']:
   stretch=node('ShaderNodeVectorMath','Material direction',-1170,-245);stretch.operation='MULTIPLY'
   stretch.inputs[1].default_value=(3.0,.28,5.0) if category=='wood' else (.51,.81,3.0);path(coord,stretch.inputs[0]);coord=stretch.outputs[0]
  path(coord,n.inputs['Vector'])
  roughval=remap(n.outputs['Fac'],.20,.81,max(.10,rough-.12),min(.98,rough+.14),'Roughness variation',(-500,-165))
  path(roughval,p.inputs['Roughness'])
  fine=node('ShaderNodeTexNoise','Small surface detail',-510,-380);fine.inputs['Scale'].default_value=scale*(4.1 if category!='water' else 2.4);fine.inputs['Detail'].default_value=1.6;path(coord,fine.inputs['Vector'])
  bump=node('ShaderNodeBump','Surface relief',-200,-245);bump.inputs['Strength'].default_value={'metal':.21,'brass':.09,'wood':.25,'wall':.17,'roof':.20,'water':.19}[category]
  bump.inputs['Distance'].default_value={'metal':.018,'brass':.010,'wood':.021,'wall':.016,'roof':.021,'water':.12}[category]
  path(fine.outputs['Fac'],bump.inputs['Height']);path(bump.outputs[0],p.inputs['Normal'])
  if category=='metal':
   oxide=remap(n.outputs['Fac'],.56,.83,0.,.25,'Weathered iron',(-475,-30),True)
   color=mix(color,(*linear('#845c43'),1.),oxide,'MIX','Oxide on older plates',(-240,255))
 if castle and category in ['roof','metal']:
  geom=node('ShaderNodeNewGeometry','Surface normal in world space',-490,-610);sep=node('ShaderNodeSeparateXYZ','Upward normal',-270,-585);path(geom.outputs['Normal'],sep.inputs[0])
  mask=remap(sep.outputs['Z'],.37,.76,0.,.94 if category=='roof' else .45,'Snow-facing upper plates',(-80,-600),True)
  snow=maths('MULTIPLY',mask,groupval('Weather • snow on up-facing plates',(-230,-745)),'Winter accumulation',(165,-515))
  color=mix(color,(*linear('#e7edf2'),1.),snow,'MIX','Snow on upper surfaces',(150,355))
 set_input(p.inputs['Base Color'],color)
 emiss=as_rgba(desc.get('emissive'),(0,0,0));energy=float(desc.get('emissiveIntensity',1.) or 0)
 if any(emiss[:3]):
  p.inputs['Emission Color'].default_value=emiss;p.inputs['Emission Strength'].default_value=energy
  glow_map=get_image(desc.get('emissiveMap'))
  if glow_map:
   gt=node('ShaderNodeTexImage','Baked ember cracks',-410,670);gt.image=glow_map;path(uv,gt.inputs['Vector'])
   glow=mix(emiss,gt.outputs['Color'],1.,'MULTIPLY','Light inside the charred wood',(-130,615))
   path(glow,p.inputs['Emission Color'])
  if desc.get('bumpMap') and tex and category not in ('wood','metal','roof','brass','wall','water'):
   bn=node('ShaderNodeBump','Bark and stone relief',45,-205)
   bn.inputs['Strength'].default_value=.29;bn.inputs['Distance'].default_value=max(.004,min(.06,float(desc.get('bumpScale',.025) or .025)))
   path(tex.outputs['Color'],bn.inputs['Height']);path(bn.outputs[0],p.inputs['Normal'])
 if category in ['window','lit']:
  p.inputs['Emission Color'].default_value=(*linear('#ffb965'),1.)
  scale=maths('MULTIPLY',groupval('Lights behind glass',(-120,52)),1.85 if category=='window' else 3.1,'Window warmth',(168,65));path(scale,p.inputs['Emission Strength'])
 alpha=None
 if tex and (desc.get('transparent') or desc.get('alphaTest',0)>0 or image.channels==4 and category=='layer'):
  alpha=tex.outputs['Alpha']
  if desc.get('alphaTest',0) and not desc.get('transparent'):
   alpha=maths('GREATER_THAN',alpha,desc['alphaTest'],'Leaf and petal silhouette',(0,-130))
  if opacity<.999:alpha=maths('MULTIPLY',alpha,opacity,'Paint opacity',(150,-80))
 elif opacity<.999:alpha=opacity
 surf=p.outputs['BSDF']
 if category=='layer':
  e=node('ShaderNodeEmission','Distant atmosphere',460,-110);set_input(e.inputs['Color'],color);e.inputs['Strength'].default_value=.9;surf=e.outputs[0]
 if alpha is not None:
  if category=='layer':
   t=node('ShaderNodeBsdfTransparent','Open sky',390,-235);s=node('ShaderNodeMixShader','Atmosphere opacity',700,60);set_input(s.inputs[0],alpha);path(t.outputs[0],s.inputs[1]);path(surf,s.inputs[2]);surf=s.outputs[0]
  else:set_input(p.inputs['Alpha'],alpha)
 out=node('ShaderNodeOutputMaterial','Surface',925,230);path(surf,out.inputs['Surface'])
 m.cycles.emission_sampling='NONE'
 m.diffuse_color=as_rgba(desc.get('color'));m.roughness=rough;m.metallic=metal
 return m
