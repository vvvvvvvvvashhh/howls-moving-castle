"""Fast Blender mesh writer for Three.js triangles, vertex colours and instances."""
from pathlib import Path
import bpy, math
import numpy as np
from mathutils import Matrix
from materials import get_material
CURRENT_BLOB=None
def np_array(val, dtype=np.float32, columns=None, blob=None):
 if val is None:return None
 if isinstance(val,dict):
  if 'array' in val:return np_array(val['array'],dtype,columns,blob)
  if 'data' in val and isinstance(val['data'],(tuple,list)):return np_array(val['data'],dtype,columns,blob)
  offset=val.get('offset',val.get('byteOffset',val.get('o',0)))
  t={'f32':'<f4','float32':'<f4','Float32Array':'<f4','u32':'<u4','uint32':'<u4','Uint32Array':'<u4','u16':'<u2','uint16':'<u2','Uint16Array':'<u2','u8':'u1','Uint8Array':'u1','i32':'<i4','Int32Array':'<i4'}.get(str(val.get('type',val.get('dtype','f32'))), '<f4')
  size=np.dtype(t).itemsize
  count=val.get('length',val.get('n',None))
  if count is None:
   if 'byteLength' in val:count=val['byteLength']//size
   elif 'count' in val:count=val['count']*val.get('itemSize',1)
   else:raise ValueError('Unknown buffer descriptor: '+str(val))
  layer=np.frombuffer(blob if blob is not None else CURRENT_BLOB,dtype=t,count=int(count),offset=int(offset))
 else:layer=np.asarray(val)
 layer=layer.astype(dtype,copy=False)
 return layer.reshape(-1,columns) if columns else layer
def empty(label,coll):
 ob=bpy.data.objects.new(label,None);ob.empty_display_type='PLAIN_AXES';ob.empty_display_size=.45;coll.objects.link(ob);return ob
def mesh_arrays(geo,blob=None):
 a=geo.get('attributes',geo)
 pos=np_array(a.get('position',a.get('pos')),np.float32,3,blob)
 faces=np_array(geo.get('index',geo.get('indices',geo.get('idx'))),np.int32,3,blob)
 if faces is None:faces=np.arange(len(pos)//3*3,dtype=np.int32).reshape(-1,3)
 normals=np_array(a.get('normal',a.get('norm')),np.float32,3,blob)
 uv=np_array(a.get('uv'),np.float32,2,blob)
 col=np_array(a.get('color',a.get('colors')),np.float32,None,blob)
 if col is not None:col=col.reshape(len(pos),-1)[:,:3]
 return pos,faces,normals,uv,col
def mesh_data(label,arrays,need_normals=True):
 pos,faces,nrm,uv,color=arrays
 mesh=bpy.data.meshes.new(label)
 nvert=len(pos);nface=len(faces)
 mesh.vertices.add(nvert);mesh.vertices.foreach_set('co',np.ascontiguousarray(pos,dtype=np.float32).ravel())
 mesh.loops.add(nface*3);mesh.loops.foreach_set('vertex_index',np.ascontiguousarray(faces,dtype=np.int32).ravel())
 mesh.polygons.add(nface);mesh.polygons.foreach_set('loop_start',np.arange(0,nface*3,3,dtype=np.int32))
 if nrm is not None:mesh.polygons.foreach_set('use_smooth',np.ones(nface,dtype=np.bool_))
 mesh.update(calc_edges=True)
 if uv is not None and len(uv)==nvert:
  layer=mesh.uv_layers.new(name='UVMap',do_init=False)
  layer.uv.foreach_set('vector',np.ascontiguousarray(uv[faces.reshape(-1)],dtype=np.float32).ravel())
 if color is not None and len(color)==nvert:
  layer=mesh.color_attributes.new(name='Color',type='BYTE_COLOR',domain='POINT')
  rgba=np.ones((nvert,4),dtype=np.float32);rgba[:,:3]=color[:,:3]
  # Blender converts linear input to its stored sRGB bytes, preserving Three's colour semantics.
  layer.data.foreach_set('color',rgba.ravel());mesh.color_attributes.active_color=layer
 if need_normals and nrm is not None and len(nrm)==nvert:
  mesh.normals_split_custom_set_from_vertices(nrm)
 mesh.update()
 return mesh
def instance_matrices(val):
 raw=np_array(val,np.float32);return raw.reshape(-1,4,4).transpose(0,2,1)
def expanded_arrays(arr,matrices,colors=None,cells=None):
 p,faces,nrm,uv,c=arr
 ninst=len(matrices);nvert=len(p);m=matrices[:,:3,:3]
 pnew=np.einsum('nab,vb->nva',m,p,optimize=True)+matrices[:,None,:3,3]
 facesnew=(faces[None,:,:]+(np.arange(ninst,dtype=np.int32)*nvert)[:,None,None])
 negative=np.linalg.det(m)<0
 if negative.any():
  facesnew[negative]=facesnew[negative][:,:,[0,2,1]]
 nnew=None
 if nrm is not None:
  normmat=np.linalg.pinv(m).transpose(0,2,1)
  nnew=np.einsum('nab,vb->nva',normmat,nrm,optimize=True)
  nnew/=np.maximum(np.linalg.norm(nnew,axis=2,keepdims=True),1e-12)
 uvnew=None
 if uv is not None:
  uvnew=np.broadcast_to(uv,(ninst,nvert,2))
  if cells is not None:uvnew=(uvnew*.982+.009+cells[:,None,:])*.5
 cnew=None
 if c is not None or colors is not None:
  rgb=c if c is not None else np.ones((nvert,3),dtype=np.float32)
  cnew=np.broadcast_to(rgb,(ninst,nvert,3))
  if colors is not None:cnew=cnew*colors[:,None,:3]
 return (pnew.reshape(-1,3),facesnew.reshape(-1,3),None if nnew is None else nnew.reshape(-1,3),
         None if uvnew is None else uvnew.reshape(-1,2),None if cnew is None else cnew.reshape(-1,3))
def float_attr(mesh,name,values):
 att=mesh.attributes.new(name,'FLOAT_VECTOR','POINT');att.data.foreach_set('vector',np.ascontiguousarray(values,dtype=np.float32).ravel())
def instantiate(label,proto,matrices,colors,coll):
 p=bpy.data.meshes.new(label+' • instance locations');count=len(matrices);p.vertices.add(count)
 p.vertices.foreach_set('co',np.ascontiguousarray(matrices[:,:3,3],dtype=np.float32).ravel())
 mat=matrices[:,:3,:3];sc=np.linalg.norm(mat,axis=1);sc[:,2]*=np.where(np.linalg.det(mat)<0,-1.,1.);rot=mat/np.where(abs(sc)>.000001,sc,1.)[:,None,:]
 y=np.arcsin(np.clip(-rot[:,2,0],-1.,1.));x=np.arctan2(rot[:,2,1],rot[:,2,2]);z=np.arctan2(rot[:,1,0],rot[:,0,0])
 float_attr(p,'HW angles',np.column_stack((x,y,z)));float_attr(p,'HW size',sc)
 if colors is not None:
  att=p.color_attributes.new(name='HW instance pigment',type='FLOAT_COLOR',domain='POINT')
  rgba=np.ones((count,4),np.float32);rgba[:,:3]=colors[:,:3];att.data.foreach_set('color',rgba.ravel())
 p.update();ob=bpy.data.objects.new(label,p);coll.objects.link(ob);ob['instance_count']=count
 ng=bpy.data.node_groups.new(label[:39]+' • planting','GeometryNodeTree');ng.interface.new_socket(name='Geometry',in_out='INPUT',socket_type='NodeSocketGeometry');ng.interface.new_socket(name='Geometry',in_out='OUTPUT',socket_type='NodeSocketGeometry')
 src=ng.nodes.new('NodeGroupInput');src.location=(-650,240)
 out=ng.nodes.new('NodeGroupOutput');out.location=(210,180)
 inst=ng.nodes.new('GeometryNodeInstanceOnPoints');inst.location=(-30,210);ng.links.new(src.outputs['Geometry'],inst.inputs['Points'])
 info=ng.nodes.new('GeometryNodeObjectInfo');info.transform_space='ORIGINAL';info.location=(-655,5);info.inputs['Object'].default_value=proto;ng.links.new(info.outputs['Geometry'],inst.inputs['Instance'])
 for key,dest,yy in [('HW angles','Rotation',-205),('HW size','Scale',-370)]:
  a=ng.nodes.new('GeometryNodeInputNamedAttribute');a.data_type='FLOAT_VECTOR';a.inputs['Name'].default_value=key;a.location=(-435,yy);ng.links.new(a.outputs['Attribute'],inst.inputs[dest])
 ng.links.new(inst.outputs['Instances'],out.inputs['Geometry']);mod=ob.modifiers.new('Original instance placement','NODES');mod.node_group=ng
 return ob
def attach(collection,label,arrays,desc,*,matrices=None,colors=None,cells=None):
 pp,ff,nn,uv,col=arrays
 if matrices is None:
  mesh=mesh_data(label,arrays,need_normals=True)
  ob=bpy.data.objects.new(label,mesh);collection.objects.link(ob)
  m=get_material(desc,label,col is not None);mesh.materials.append(m);return ob
 count=len(matrices)
 if len(pp)<=36 or len(pp)*count<125000 or cells is not None:
  # Keep a colour/UV attribute per original instance for flowers and architectural details.
  expanded=expanded_arrays(arrays,matrices,colors,cells)
  mesh=mesh_data(label,expanded,need_normals=len(pp)*count<250000)
  ob=bpy.data.objects.new(label,mesh);collection.objects.link(ob);ob['instance_count']=count
  mesh.materials.append(get_material(desc,label,expanded[4] is not None));return ob
 # Large conifer stands and repeated architectural fittings share the original triangles.
 mesh=mesh_data(label+' • individual asset',arrays);mesh.materials.append(get_material(desc,label,col is not None))
 proto=bpy.data.objects.new(label[:48]+' • original',mesh);protos=bpy.data.collections.get('Original instance meshes')
 if protos is None:protos=bpy.data.collections.new('Original instance meshes');bpy.context.scene.collection.children.link(protos)
 protos.objects.link(proto);proto.hide_render=True;proto.hide_viewport=True
 return instantiate(label,proto,matrices,colors,collection)
