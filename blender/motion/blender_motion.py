"""Blender-native character and mechanical effects for the 60-second Howl film.

The imported scene retains Three's Y-up local frame under a conversion root.
Particles detach into the Blender world. All animation is stored as editable
FCurves, with deterministic birth samples and no scene handlers or cache files.
"""
import math
import os
import random
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0,str(HERE))
from flame_field import gas_surface, gas_waves

TAU=2*math.pi
SIN=math.sin
COS=math.cos
EFFECT_PREFIX="HW • "
FIRE_WINDOWS={"hearth":((22,25),),"carried":((25,30),(51.5,60))}
STACKS=(
 ((5.2,26.2,-5.9),(8.88,42.56,-7.56)),
 ((9.10,23.3,-2.9),(13.17,39.85,-5.5)),
 ((-5.85,30.45,-5.65),(-6.25,41.09,-6.37)),
 ((-9.47,26.6,-2.65),(-12.0,36.83,-3.50)),
)


def clamp(x,lo=0,hi=1):
    return min(hi,max(lo,x))


def smooth(a,b,x):
    u=clamp((x-a)/(b-a))
    return u*u*(3-2*u)


def pulse(a,b,c,t):
    return smooth(a,b,t)*(1-smooth(b,c,t))


def fps(scene):
    return scene.render.fps/scene.render.fps_base


def frame(scene,seconds):
    return scene.frame_start+seconds*fps(scene)


def _action(id_block,label=None):
    ad=id_block.animation_data_create()
    if ad.action is None:
        ad.action=bpy.data.actions.new(label or id_block.name)
    return ad.action


def _curve(id_block,path,values,index=0,interpolation='LINEAR',action=None):
    """Write one independent channel, including unambiguous hard visibility cuts."""
    if not values:
        return
    action=action or _action(id_block)
    # The module owns only the named channels it creates.
    f=action.fcurves.find(path,index=index) or action.fcurves.new(path,index=index)
    if len(f.keyframe_points):
        merged={round(k.co[0],5):k.co[1] for k in f.keyframe_points}
        merged.update((round(float(t),5),float(v)) for t,v in values)
        values=sorted(merged.items())
        f.keyframe_points.clear()
    f.keyframe_points.add(len(values))
    f.keyframe_points.foreach_set("co",np.asarray(values,dtype=np.float32).reshape(-1))
    enum=bpy.types.Keyframe.bl_rna.properties['interpolation'].enum_items[interpolation].value
    f.keyframe_points.foreach_set('interpolation',np.full(len(values),enum,dtype=np.int32))
    f.update()
    return f


def _vector_keys(obj,path,values,interpolation='LINEAR'):
    action=_action(obj)
    for i in range(3):
        _curve(obj,path,[(t,v[i]) for t,v in values],i,interpolation,action)


def _sample_times(scene,windows,step):
    times=set()
    for a,b in windows:
        lo=int(math.floor(frame(scene,a)))
        hi=int(math.ceil(frame(scene,b)))
        times.update(range(lo,hi+1,step))
        times.add(hi)
    return sorted(times)


def _visible(scene,objects,windows):
    """Unlike a collection restriction, hiding a Blender empty leaves children visible."""
    keys={float(scene.frame_start)-1:1.0}
    for a,b in windows:
        keys[frame(scene,a)]=0.0
        keys[frame(scene,b)]=1.0
    for obj in objects:
        _curve(obj,'hide_render',list(sorted(keys.items())),interpolation='CONSTANT')
        _curve(obj,'hide_viewport',list(sorted(keys.items())),interpolation='CONSTANT')


def _link(collection,name,data=None,parent=None):
    obj=bpy.data.objects.new(EFFECT_PREFIX+name,data)
    collection.objects.link(obj)
    obj.parent=parent
    return obj


def _mesh(name,verts,faces,smooth_shade=True):
    mesh=bpy.data.meshes.new(EFFECT_PREFIX+name)
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    if smooth_shade:
        mesh.polygons.foreach_set("use_smooth",np.ones(len(mesh.polygons),dtype=np.bool_))
    return mesh


def _sphere_data(label,segments=24,rings=14):
    old=bpy.data.meshes.get(EFFECT_PREFIX+label)
    if old:
        return old
    vs=[(0,1,0)]
    for j in range(1,rings):
        p=math.pi*j/rings
        for i in range(segments):
            a=TAU*i/segments
            vs.append((SIN(p)*COS(a),COS(p),SIN(p)*SIN(a)))
    bottom=len(vs)
    vs.append((0,-1,0))
    face=[]
    for i in range(segments):
        n=(i+1)%segments
        face.append((0,1+n,1+i))
        for j in range(rings-2):
            a,b=1+j*segments+i,1+j*segments+n
            face.append((a,b,b+segments,a+segments))
        last=1+(rings-2)*segments
        face.append((last+i,last+n,bottom))
    return _mesh(label,vs,face)


def _simple(name,rgba,rough=.75,metal=0,emit=0):
    mat=bpy.data.materials.get(EFFECT_PREFIX+name)
    if mat:
        return mat
    mat=bpy.data.materials.new(EFFECT_PREFIX+name)
    mat.diffuse_color=(*rgba,1)
    mat.use_nodes=True
    node=mat.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value=(*rgba,1)
    node.inputs['Roughness'].default_value=rough
    node.inputs['Metallic'].default_value=metal
    node.inputs['Emission Color'].default_value=(*rgba,1)
    node.inputs['Emission Strength'].default_value=emit
    return mat


def _ink(name,rgba,strength=1):
    # Source eye paint remains dark beside incandescent gas. Its own radiance
    # keeps the face readable in both the kitchen and sunlit grass.
    mat=bpy.data.materials.get(EFFECT_PREFIX+name+" | ink")
    if mat:
        return mat
    mat=bpy.data.materials.new(EFFECT_PREFIX+name+" | ink")
    mat.diffuse_color=(*rgba,1)
    mat.use_nodes=True
    nodes=mat.node_tree.nodes;nodes.remove(nodes.get('Principled BSDF'))
    emission=nodes.new('ShaderNodeEmission')
    emission.inputs['Color'].default_value=(*rgba,1)
    emission.inputs['Strength'].default_value=strength
    mat.node_tree.links.new(emission.outputs[0],nodes.get('Material Output').inputs['Surface'])
    return mat


def _sphere(coll,name,parent,loc,scale,mat):
    data=_sphere_data("Orb · "+mat.name)
    if len(data.materials)==0:
        data.materials.append(mat)
    obj=_link(coll,name,data,parent)
    obj.location=loc
    obj.scale=scale
    return obj


class _Nodes:
    def __init__(self,material):
        self.tree=material.node_tree
        self.tree.nodes.clear()

    def node(self,kind,name,x=0,y=0):
        n=self.tree.nodes.new(kind)
        n.label=name
        n.location=(x,y)
        return n

    def plug(self,value,socket):
        if hasattr(value,'is_output'):
            self.tree.links.new(value,socket)
        else:
            socket.default_value=value

    def math(self,op,a,b=None,*,name='',clamped=False,x=0,y=0):
        n=self.node('ShaderNodeMath',name or op,x,y)
        n.operation=op
        n.use_clamp=clamped
        self.plug(a,n.inputs[0])
        if b is not None:
            self.plug(b,n.inputs[1])
        return n.outputs[0]

    def ramp(self,source,stops,title,x=0,y=0):
        n=self.node('ShaderNodeValToRGB',title,x,y)
        ramp=n.color_ramp
        ramp.interpolation='EASE'
        for i,(p,c) in enumerate(stops):
            e=ramp.elements[i] if i<2 else ramp.elements.new(p)
            e.position=p
            e.color=(*c,1)
        self.plug(source,n.inputs[0])
        return n.outputs[0]


def _flame_material(scene,slot,windows):
    """Emission skin plus a bounded, emissive body visible through the grazing edge."""
    name=EFFECT_PREFIX+"Calcifer | gas and luminous core · "+slot
    mat=bpy.data.materials.new(name)
    mat.diffuse_color=(1,.27,.028,1)
    mat.use_nodes=True
    n=_Nodes(mat)
    output=n.node('ShaderNodeOutputMaterial','Luminous gas',900,120)
    tex=n.node('ShaderNodeTexCoord','Rest coordinates',-1260,200)
    sep=n.node('ShaderNodeSeparateXYZ','Local height is Y',-1070,200)
    n.plug(tex.outputs['Generated'],sep.inputs[0])
    x,h,z=sep.outputs
    def calc(op,a,b=None,**kw):
        return n.math(op,a,b,**kw)
    dx=calc('MULTIPLY',calc('SUBTRACT',x,.507),2.08)
    dy=calc('MULTIPLY',calc('SUBTRACT',h,.305),1.87)
    rr=calc('SQRT',calc('ADD',calc('MULTIPLY',dx,dx),calc('MULTIPLY',dy,dy)))
    core=calc('SUBTRACT',1,calc('MULTIPLY',rr,1.49),clamped=True,name='Hot center')
    clock=n.node('ShaderNodeValue','Time in seconds',-1240,-200)
    clock.name='Gas time'
    _curve(mat.node_tree,clock.outputs[0].path_from_id("default_value"),
           [(frame(scene,0),0),(frame(scene,60),60)])
    t=clock.outputs[0]
    # Light moves upward through the folds rather than moving a static color band.
    sinA=calc('SINE',calc('SUBTRACT',calc('MULTIPLY',h,11.2),calc('MULTIPLY',t,2.19)))
    sinB=calc('SINE',calc('ADD',calc('MULTIPLY',h,15.0),calc('MULTIPLY',t,1.45)))
    line=calc('ADD',calc('SUBTRACT',x,.5),calc('ADD',calc('MULTIPLY',sinA,.040),calc('MULTIPLY',sinB,.019)))
    ridges=[]
    for center,falloff in ((-.105,150),(.112,208)):
        d=calc('SUBTRACT',line,center)
        ridges.append(calc('EXPONENT',calc('MULTIPLY',calc('MULTIPLY',d,d),-falloff)))
    ribbon=calc('MAXIMUM',*ridges)
    rise=calc('MULTIPLY',calc('MULTIPLY',calc('SUBTRACT',h,.36),4.9,clamped=True),
              calc('MULTIPLY',calc('SUBTRACT',1.0,h),3.1,clamped=True))
    noise=n.node('ShaderNodeTexNoise','Folds in rising gas',-400,-415)
    noise.noise_dimensions='4D'
    n.plug(tex.outputs['Generated'],noise.inputs['Vector'])
    noise.inputs['Scale'].default_value=3.8
    noise.inputs['Detail'].default_value=1.1
    n.plug(calc('MULTIPLY',t,.39),noise.inputs['W'])
    geometry=n.node('ShaderNodeNewGeometry','Optical thickness',-600,-640)
    dot=n.node('ShaderNodeVectorMath','Grazing angle',-410,-640)
    dot.operation='DOT_PRODUCT'
    n.plug(geometry.outputs["Normal"],dot.inputs[0])
    n.plug(geometry.outputs["Incoming"],dot.inputs[1])
    facing=calc('ABSOLUTE',dot.outputs["Value"])
    heat=calc('ADD',.020,calc('ADD',calc('MULTIPLY',core,.94),calc('MULTIPLY',calc('MULTIPLY',ribbon,rise),.63)))
    heat=calc('ADD',heat,calc('ADD',calc('MULTIPLY',noise.outputs['Fac'],.12),calc('MULTIPLY',facing,.095)),clamped=True)
    tint=n.ramp(heat,[(0,(.41,.008,.0018)),(.19,(.76,.020,.003)),(.40,(1,.074,.005)),
                       (.61,(1,.25,.009)),(.81,(1,.56,.047)),(1,(1,.86,.30))],
                'Crimson fringe → honey glow',130,390)
    emission=n.node('ShaderNodeEmission','Radiant flame',435,310)
    n.plug(tint,emission.inputs['Color'])
    alpha=calc('ADD',.49,calc('MULTIPLY',facing,.48),clamped=True,name='Soft silhouette',x=220,y=0)
    strength=calc('MULTIPLY',alpha,calc('ADD',.95,calc('MULTIPLY',heat,1.65)))
    n.plug(strength,emission.inputs['Strength'])
    transparent=n.node('ShaderNodeBsdfTransparent','Thin edges',425,135)
    n.plug(calc('SUBTRACT',1.,alpha),transparent.inputs['Color'])
    mix=n.node('ShaderNodeAddShader','Gas radiance and transmission',670,260)
    n.plug(transparent.outputs[0],mix.inputs[0]);n.plug(emission.outputs[0],mix.inputs[1])
    n.plug(mix.outputs[0],output.inputs['Surface'])
    # A true participating medium under the partially transparent shell, kept
    # shallow to retain the source's hand-painted expression with four CPU samples.
    volume=n.node('ShaderNodeVolumePrincipled','Interior gas',620,-140)
    volume.inputs['Color'].default_value=(.76,.133,.025,1)
    volume.inputs['Density'].default_value=.13
    volume.inputs['Anisotropy'].default_value=.1
    volume.inputs['Emission Strength'].default_value=.58
    n.plug(tint,volume.inputs['Emission Color'])
    n.plug(volume.outputs[0],output.inputs['Volume'])
    return mat


def _eye(coll,face,side,material,objects):
    center=(side*.231,.714+.010*side,.480)
    pivot=_link(coll,'Eye hinge '+str(side),parent=face)
    pivot.location=center
    pivot.rotation_euler[1]=side*.17
    eye=_sphere(coll,'Eye | warm outline '+str(side),pivot,(0,0,0),(.113,.131,.061),material['lash'])
    ivory=_sphere(coll,'Eye | warm ivory '+str(side),pivot,(0,.002,.011),(.105,.122,.057),material['ivory'])
    pupil=_sphere(coll,'Eye | pupil '+str(side),pivot,(.012,.012,.069),(.038,.044,.016),material['iris'])
    glint=_sphere(coll,'Eye | catchlight '+str(side),pupil,(-.27,.32,.88),(.23,.23,.24),material['glint'])
    objects.extend((eye,ivory,pupil,glint))
    return pivot,pupil


def _mouth(coll,face,mats,objects,scene,windows):
    # Curved open crescent with a raised corner and a small tongue on its bottom edge.
    verts=[];faces=[];matindex=[]
    radii=(0,.28,.52,.73,.90,.965,1.0)
    slices=42
    for r in radii:
        for i in range(slices):
            a=TAU*i/slices;q=r*COS(a);v=r*SIN(a)
            x=.010+.146*q
            y=.469+.056*q*q-.010*q+.070*v
            z=.564-.167*x*x-.064*(y-.48)**2+.007*(1-r*r)
            verts.append((x,y,z))
    for j in range(len(radii)-1):
        for i in range(slices):
            n=(i+1)%slices;a=j*slices+i;b=j*slices+n
            faces.append((a,a+slices,b+slices,b))
            ax=TAU*(i+.5)/slices; r=.5*(radii[j]+radii[j+1])
            if j==len(radii)-2: mi=0
            elif r*SIN(ax)<-.37+.11*COS(ax) and j<len(radii)-2: mi=2
            else: mi=1
            matindex.append(mi)
    mesh=_mesh('Mouth | crescent',verts,faces)
    for key in ('lip','mouth','tongue'): mesh.materials.append(mats[key])
    mesh.polygons.foreach_set('material_index',np.asarray(matindex,dtype=np.int32))
    obj=_link(coll,'Mouth | smiling',mesh,face)
    objects.append(obj)
    obj.shape_key_add(name='Rest')
    key=obj.shape_key_add(name='Open vowel')
    v=np.array(verts,dtype=np.float32)
    q=(v[:,0]-.010)/.146
    mid=.469+.056*q*q-.010*q
    v[:,1]=mid+1.44*(v[:,1]-mid)-.012*np.maximum(0,1-q*q)
    key.data.foreach_set('co',v.reshape(-1))
    samples=_sample_times(scene,windows,3)
    _curve(mesh.shape_keys,key.path_from_id("value"),[(f,.38+.35*SIN((f-scene.frame_start)/fps(scene)*2.3)
           +.12*SIN((f-scene.frame_start)/fps(scene)*4.3)) for f in samples])
    return obj


def build_calcifer(scene,coll,parent,slot='hearth',windows=None):
    """Attach one original-size Calcifer to its *source body*, which inclines and squashes."""
    windows=windows or FIRE_WINDOWS[slot]
    base=_link(coll,'Calcifer | '+slot,parent=parent)
    objects=[]
    verts,quads=gas_surface()
    mesh=_mesh("Seven currents | "+slot,verts.tolist(),quads)
    mesh.materials.append(_flame_material(scene,slot,windows))
    flame=_link(coll,'Seven joined currents | '+slot,mesh,base)
    objects.append(flame)
    flame.shape_key_add(name='Seven currents | still')
    samples=_sample_times(scene,windows,3)
    for i,(label,moved,phase) in enumerate(gas_waves(verts)):
        key=flame.shape_key_add(name=label)
        key.slider_min=-1;key.slider_max=1
        key.data.foreach_set('co',moved.astype(np.float32).reshape(-1))
        keykeys=[]
        for f in samples:
            t=(f-scene.frame_start)/fps(scene)
            if i<4:
                speed=2.59 if i<2 else 4.67
                value=SIN(t*speed+phase+i*.17)
            else:
                value=.60*SIN(1.32*t-.28)+.27*SIN(.81*t+.32)
            keykeys.append((f,value))
        _curve(mesh.shape_keys,key.path_from_id('value'),keykeys)
    face=_link(coll,'Calcifer | expression '+slot,parent=base)
    m={
      'lash':_ink('Eye | umber rim',(.125,.040,.017)),
      'ivory':_ink('Eye | ivory',(.97,.86,.69),1.34),
      'iris':_ink('Eye | cocoa pupil',(.025,.012,.005)),
      'glint':_ink('Eye | honey glint',(1,.83,.54),1.45),
      'lip':_ink('Mouth | dark sienna',(.17,.022,.009)),
      'mouth':_ink('Mouth | warm umber',(.27,.036,.012)),
      'tongue':_ink('Mouth | coral tongue',(.83,.15,.045),1.05),
    }
    for s in (-1,1):
        lid,pupil=_eye(coll,face,s,m,objects)
        lids=[];gaze=[]
        ticks=_sample_times(scene,windows,1)
        for f in ticks:
            t=(f-scene.frame_start)/fps(scene)
            wink=max(0,COS((t-.8)*1.21))**145
            if slot=='hearth':
                wink=max(wink,pulse(22.50,22.60,22.72,t),.74*pulse(24.25,24.33,24.43,t))
                look=smooth(22.1,22.5,t)*(1-.72*smooth(24.35,24.88,t))
                lift=-.84*pulse(22.05,22.86,23.59,t)+.46*pulse(24.45,24.90,25.4,t)
            else:
                look=.28*SIN(1.25*t)+.25
                lift=.18*SIN(1.65*t)
            lids.append((f,1-.917*wink))
            gaze.append((f,(.012+.011*SIN(.87*t)+.031*look,.010+.004*COS(1.18*t)+.028*lift,.069)))
        _curve(lid,'scale',lids,1)
        _vector_keys(pupil,'location',gaze)
    _mouth(coll,face,m,objects,scene,windows)
    lamp=bpy.data.lights.new(EFFECT_PREFIX+'Firelight '+slot,'POINT')
    lamp.color=(1,.41,.105)
    lamp.shadow_soft_size=.57 if slot=='hearth' else .33
    lamp.energy=60 if slot=='hearth' else 12
    light=_link(coll,'Living firelight | '+slot,lamp,base)
    light.location=(0,.67,.78)
    objects.append(light)
    _curve(lamp,'energy',[(f,lamp.energy*(1+.07*SIN((f-scene.frame_start)/fps(scene)*7.1)
                  +.03*SIN((f-scene.frame_start)/fps(scene)*12.1))) for f in samples])
    _visible(scene,objects,windows)
    return dict(root=base,body=flame,face=face,objects=objects,light=light)


def _triangulate_ash(coll,parent,scene,windows):
    """Narrow incandescent cracks adhere to the original pair of split logs."""
    from mathutils import Quaternion
    vertices=[];faces=[]
    rng=random.Random(53191)
    for a,b,rad in (((-.69,.230,.13),(.78,.278,.33),.146),
                    ((-.58,.206,.30),(.63,.330,-.31),.130)):
        a,b=Vector(a),Vector(b)
        axis=(b-a).normalized()
        top=Vector((0,1,0));top=(top-axis*top.dot(axis)).normalized()
        side=axis.cross(top).normalized()
        for k in range(11):
            start=rng.uniform(.025,.75);span=rng.uniform(.10,.32)
            ang=rng.uniform(-1.36,1.36)
            prev=None
            for j in range(7):
                u=j/6
                along=start+span*u
                theta=ang+.075*SIN(j*2.5+k*.71)+.04*SIN(j*3.2)
                outward=top*COS(theta)+side*SIN(theta)
                across=-top*SIN(theta)+side*COS(theta)
                radius=rad*(.99+.050*SIN(3*theta+k*.12)+.022*COS(5*theta+along))
                at=a.lerp(b,along)+outward*(radius+.006)
                width=.0036+.0030*SIN(math.pi*u)
                i=len(vertices)
                vertices.extend((tuple(at-width*across),tuple(at+width*across)))
                if prev is not None: faces.append((prev,prev+1,i+1,i))
                prev=i
    mesh=_mesh('Ember veins | split log',vertices,faces)
    mesh.materials.append(_ink('Ember | burnt-orange fissure',(1,.115,.009),1.62))
    obj=_link(coll,'Glowing grain in split kindling',mesh,parent)
    _visible(scene,[obj],windows)
    return obj


def _native_pan(coll,parent):
    """Recovery fallback for renderers that discarded the source metal and wood."""
    profile=((.005,.025),(.44,.025),(.62,.046),(.77,.105),(.85,.185),(.865,.209),
             (.83,.209),(.815,.186),(.744,.133),(.60,.087),(.42,.069),(.005,.069))
    verts=[];faces=[];n=56
    for r,y in profile:
        for i in range(n):
            a=TAU*i/n;verts.append((r*SIN(a),y,r*.71*COS(a)))
    for j in range(len(profile)-1):
        for i in range(n):
            b=(i+1)%n;faces.append((j*n+i,j*n+b,(j+1)*n+b,(j+1)*n+i))
    mesh=_mesh('Ash pan | spun iron',verts,faces)
    mesh.materials.append(_simple('Ash pan | rubbed copper',(.131,.080,.056),.52,.66))
    objs=[_link(coll,'Ash pan | rolled shell',mesh,parent)]
    def tube(label,centers,radius,material,closed):
        centers=[Vector(p) for p in centers]
        vs=[];fs=[];sides=8
        for i,c in enumerate(centers):
            before=centers[(i-1)%len(centers)] if i>0 or closed else c
            after=centers[(i+1)%len(centers)] if i<len(centers)-1 or closed else c
            tangent=(after-before).normalized()
            e1=tangent.cross(Vector((0,1,0)))
            if e1.length_squared<.001: e1=tangent.cross(Vector((1,0,0)))
            e1.normalize();e2=tangent.cross(e1).normalized()
            for j in range(sides):
                a=TAU*j/sides;vs.append(tuple(c+radius*(e1*COS(a)+e2*SIN(a))))
        for i in range(len(centers) if closed else len(centers)-1):
            ni=(i+1)%len(centers)
            for j in range(sides):
                k=(j+1)%sides;fs.append((i*sides+j,ni*sides+j,ni*sides+k,i*sides+k))
        if not closed:
            fs.extend((tuple(reversed(range(sides))),tuple(range(len(vs)-sides,len(vs)))))
        m=_mesh(label,vs,fs);m.materials.append(material);objs.append(_link(coll,label,m,parent))
    rim=_simple('Ash pan | brass lip',(.40,.18,.068),.40,.70)
    tube('Beaded copper rim',[(.85*SIN(TAU*i/64),.207,.85*.71*COS(TAU*i/64)) for i in range(64)],.018,rim,True)
    for sign in (-1,1):
        tube('Rolled iron ear',[(sign*.88+.118*SIN(TAU*i/28),.18+.022*COS(TAU*i/28),.091*COS(TAU*i/28)) for i in range(28)],.025,rim,True)
    wood=_simple('Kindling | carbon',(.068,.026,.012),.92)
    for a,b,r in (((-.69,.230,.13),(.78,.278,.33),.146),((-.58,.206,.30),(.63,.330,-.31),.130)):
        tube('Split charred wood',[a,b],r,wood,False)
    return objs


def _strip_visuals(parent):
    # The source shaders are an empty box and an opaque face rectangle without
    # their GLSL. They are replaced as a unit. Original transform anchors remain.
    for obj in tuple(parent.children_recursive):
        if obj.type not in ('MESH','LIGHT','VOLUME','CURVE','SURFACE'):
            continue
        ad=obj.animation_data
        if ad and ad.action:
            for f in list(ad.action.fcurves):
                if f.data_path in ('hide_render','hide_viewport'):
                    ad.action.fcurves.remove(f)
        obj.hide_render=True;obj.hide_viewport=True
        obj['replaced_by_native_flame']=True


def _source_label(obj):
    return ' '.join(str(x) for x in (obj.name,obj.get('three_name',''),obj.get('source_name',''),
                   obj.get('sourceName',''),obj.get('name_source',''),obj.get('nativeSemantic','')) if x).lower()


def _raw_name(obj):
    return obj.get('source_name') or obj.get('three_name') or obj.get('sourceName') or obj.name


def _all_named(scene,needle):
    needle=needle.lower()
    return [o for o in scene.objects if not o.name.startswith(EFFECT_PREFIX) and needle in _source_label(o)]


def _first(scene,needle):
    options=_all_named(scene,needle)
    return next((o for o in options if str(_raw_name(o)).lower()==needle.lower()),
                next((o for o in options if o.type=='EMPTY'),next(iter(options),None)))


def _relative_meshes(obj):
    return [c for c in obj.children_recursive if c.type=='MESH' and not c.name.startswith(EFFECT_PREFIX)]


def _source_body(group):
    # In the original group the sole child empty is a squash-and-tilt rig. The
    # other direct child was the thirteen instanced sparks.
    options=[o for o in group.children if o.type=='EMPTY']
    if not options: return group
    def importance(o):
        name=_source_label(o)
        return (int('body' in name or 'squash' in name),len(o.children_recursive),
                int(bool(o.animation_data and o.animation_data.action)))
    return max(options,key=importance)


def _windows_from_timeline(timeline):
    windows=dict(FIRE_WINDOWS)
    frames=timeline.get('frames',[]) if isinstance(timeline,dict) else []
    if not frames: return windows
    ranges=[];a=None
    for i,f in enumerate(frames):
        show=bool((f.get('companions') or {}).get('visible'))
        t=f.get('t',f.get('time',i/timeline.get('fps',24)))
        if show and a is None: a=t
        if not show and a is not None:
            ranges.append((a,t));a=None
    if a is not None: ranges.append((a,timeline.get('duration',60)))
    if ranges: windows['carried']=tuple(ranges)
    return windows


def _rotation_delta(scene,obj,samples):
    if obj.rotation_mode=='QUATERNION':
        from mathutils import Euler
        quats=[(f,tuple(Euler(v,'XYZ').to_quaternion())) for f,v in samples]
        for index in range(4):
            _curve(obj,'delta_rotation_quaternion',[(f,v[index]) for f,v in quats],index)
    else:
        _vector_keys(obj,'delta_rotation_euler',samples)


def _mechanism_wave(t,i,part):
    speed={"flue":2.05,"mast":1.68,"vane":2.45,"lamp":2.93}[part]
    lag={"flue":.12,"mast":.19,"vane":.145,"lamp":.22}[part]+i*.049
    u=t-lag
    wind=smooth(43.60,45.2,u)
    base=(.22*SIN(.84*u-i*.47)+.1*SIN(1.77*u+.7*i))*wind
    reaction=0
    for at,strength,freq in ((42.46,-.58,6.4),(43.58,1.28,7.3),(44.16,-.74,6.6),
                             (45.61,.97,5.5),(47.35,-.96,5.4),(49.45,.80,5.1),
                             (51.80,-.72,4.9),(54.15,.44,4.7)):
        elapsed=u-at
        if 0<elapsed<2.6:
            reaction+=strength*math.exp(-elapsed*(1.42+.08*i))*SIN(freq*elapsed*speed/2)
    gait=.11*SIN(u*(TAU/1.2)-.36*i)*(1-smooth(41.6,43.10,u))
    motion=base+reaction+gait
    magnitude={'flue':.052,'mast':.054,'vane':.045,'lamp':.255}[part]
    sign=-1 if i%2 else 1
    return (magnitude*(motion*(.62+.08*COS(i))+.11*wind*SIN(u*1.33+.6*i)),
            magnitude*(.11*motion+.046*wind*SIN(u*1.73)),sign*magnitude*(.78*motion+base*.49))


def apply_shell_motion(scene,stacks):
    devices=[]
    for i,obj,_ in stacks: devices.append((obj,i,'flue'))
    for query,label in (('spring mounted lookout mast','mast'),('shell storm vane','vane'),('wall lantern ','lamp')):
        devices.extend((o,i,label) for i,o in enumerate(_all_named(scene,query)) if o.type=='EMPTY')
    samples=_sample_times(scene,((0,60),),2)
    for obj,idx,kind in devices:
        _rotation_delta(scene,obj,[(f,_mechanism_wave((f-scene.frame_start)/fps(scene),idx,kind)) for f in samples])
        obj['secondary_motion']=kind+' inertia at its original attachment'
    return devices


def _cloth_parameters(local,action):
    travel=((.34,.64,.76,1.52,-1),(1.21,.88,1.16,2.63,1),(2.55,.61,.64,1.61,-1),(3.42,.85,1.09,2.52,1))
    greeting=((.76,.67,.84,1.05,-1),(2.10,.99,1.48,2.12,1),(3.77,.63,.66,1.17,-1),(4.78,.81,1.02,1.60,1),(6.08,.58,.59,1.19,-1))
    events=travel if action=='travel' else greeting
    t=local%4.68 if action=='travel' else local
    cloth=tilt=arc=stretch=0
    for at,d,b,h,side in events:
        dt=t-at
        st=pulse(-.091,.065,.29,dt)
        hit=pulse(d-.025,d+.088,d+.26,dt)
        rebound=pulse(d+.10,d+.24,d+.39,dt)
        if 0<=dt<d:
            u=dt/d;arc=4*u*(1-u)
            cloth+=arc*(2*u-1);tilt+=side*arc
        cloth+=-.42*st+.28*hit-.17*rebound
        tilt+=side*(-.30*st+.42*rebound);stretch+=st
    return cloth,tilt,arc,stretch


def apply_tail_cloth(scene,turnip,timeline,windows):
    if not turnip: return []
    original=[]
    for obj in _relative_meshes(turnip):
        if len(obj.data.vertices)!=980:continue
        arr=np.empty((980,3),np.float32)
        obj.data.vertices.foreach_get('co',arr.reshape(-1))
        if arr[:,1].min()>1.0 and arr[:,1].max()<2.85 and np.ptp(arr[:,0])>.67 and np.ptp(arr[:,2])>.35:
            original.append((obj,arr))
    rows=(timeline or {}).get('frames',[]) if isinstance(timeline,dict) else []
    for obj,verts in original:
        obj['cloth_model']='Pinned at the waist; separate inertia at the tattered hem'
        if not any(m.type=='SOLIDIFY' for m in obj.modifiers):
            thick=obj.modifiers.new('Hem • dark cloth has two sides','SOLIDIFY')
            thick.thickness=.012;thick.offset=0;thick.use_even_offset=False
        if obj.data.shape_keys and obj.data.shape_keys.animation_data:
            continue
        side=-1 if np.mean(verts[:,0])<0 else 1
        u=np.tile(np.arange(49)/48,20);v=np.repeat(np.arange(20)/19,49)
        w=v**1.45;phase=u*math.pi*3.8-v*2.3+side*.61
        if not obj.data.shape_keys:obj.shape_key_add(name='Original tailoring')
        shape_keys=[]
        offsets=[w[:,None]*trig(phase)[:,None]*np.array((.028*side,.044,.069)) for trig in (np.sin,np.cos)]
        offsets.extend(w[:,None]*v[None,:] for v in (np.array((.20,0,0)),np.array((0,.47,0)),np.array((0,0,.18))))
        for name,d in zip(('Woven wave A','Woven wave B','Side lag','Hem lift','Wind behind coat'),offsets):
            k=obj.shape_key_add(name=name);k.slider_min=-2;k.slider_max=2
            k.data.foreach_set('co',(verts+d).astype(np.float32).reshape(-1));shape_keys.append(k)
        key_data=[[] for k in shape_keys]
        for f in _sample_times(scene,windows,2):
            t=(f-scene.frame_start)/fps(scene)
            row=rows[min(len(rows)-1,max(0,round(t*fps(scene))))] if rows else {}
            act=row.get('companions') or {}
            action='greet' if t<30 else 'travel'
            local=act.get('local',t-(25 if action=='greet' else 51.5))
            cloth,tilt,arc,stretch=_cloth_parameters(local,action)
            slow=SIN(t*1.04+side*.8)
            gain=1.10+.17*smooth(51,55,t)
            values=(gain*COS(t*2.31+side*.45),gain*SIN(t*2.31+side*.45),
                    (.023*slow+.17*tilt)/.20,(.015*slow+.43*cloth)/.47,
                    -(.025*slow+.095*arc+.09*stretch)/.18)
            for a,val in zip(key_data,values):a.append((f,val))
        for k,keys in zip(shape_keys,key_data):_curve(obj.data.shape_keys,k.path_from_id('value'),keys)
    return [obj for obj,verts in original]


def _sail_gauge(scene):
    """Add a narrow physical hem to each of the existing sail membrane meshes."""
    guaged=[]
    varies=_all_named(scene,'shell storm vane')+_all_named(scene,'folding sail fan')
    for pivot in varies:
        for obj in _relative_meshes(pivot):
            if obj in guaged or not obj.data.materials:continue
            labels=[str(mat.name).lower() for mat in obj.data.materials if mat]
            if not labels or not all('sail' in l or 'canvas' in l for l in labels):continue
            if any(m.type=='SOLIDIFY' for m in obj.modifiers):continue
            m=obj.modifiers.new('Folded sail edge • two-sided canvas','SOLIDIFY')
            m.thickness=.033;m.offset=0;m.use_even_offset=False
            guaged.append(obj)
    return guaged


def _signal_flame_hops(scene,base,timeline):
    from air_particles import WorldSampler
    rows=timeline.get('frames',[]) if isinstance(timeline,dict) else []
    sampler=WorldSampler();samples=[]
    for i,row in enumerate(rows):
        t=row.get('t',row.get('time',i/timeline.get('fps',24)))
        if t<49:continue
        c=row.get('companions') or {}
        fire=c.get('fire') or {}
        if fire.get('mode')!='carried':continue
        f=frame(scene,t)
        height=fire.get('worldHeight',fire.get('localHeight',0)*c.get('scale',1))
        # The actor is scaled, its wrist tilts, and the gas is in the middle of
        # its own squash. Convert the intended vertical arc through the complete
        # parent matrix; dividing only by nominal actor size distorts this hop.
        world_parent=sampler.matrix(base.parent,f)@base.matrix_parent_inverse
        local=world_parent.to_3x3().inverted_safe()@Vector((0,0,height))
        samples.append((f,tuple(local),fire.get('impact',0)))
    if samples:
        action=_action(base)
        for fc in list(action.fcurves):
            if fc.data_path in ('location','scale'): action.fcurves.remove(fc)
        _vector_keys(base,'location',[(frame(scene,0),(0,0,0))]+[(f,p) for f,p,hit in samples])
        for i,factor in ((0,.073),(1,-.135),(2,.069)):
            _curve(base,'scale',[(frame(scene,0),1.0)]+[(f,1+factor*hit) for f,p,hit in samples],i)


def build_motion(scene,*,imported=None,timeline=None,particles=True):
    """Build and bake on the active Blender scene after importing the original source.

    'imported' may expose explicit native object anchors under the 'motion_anchors'
    key. Otherwise the authentic source names are resolved in the imported scene.
    'timeline' is the direction/frames.json dictionary; filenames are accepted.
    """
    import json
    from air_particles import make_particles
    if isinstance(timeline,(str,os.PathLike)):timeline=json.loads(Path(timeline).read_text())
    if timeline is None:
        timeline_path=HERE.parent/'direction'/'frames.json'
        timeline=json.loads(timeline_path.read_text()) if timeline_path.exists() else {}
    anchors=imported.get('motion_anchors',{}) if isinstance(imported,dict) else {}
    collection=bpy.data.collections.new('Animation | Calcifer, wind and falling ash')
    scene.collection.children.link(collection)
    windows=_windows_from_timeline(timeline)
    castle=anchors.get('castle') or _first(scene,'walking castle')
    body=anchors.get('boiler') or _first(scene,'boiler shell and town')
    turnip=anchors.get('turnip') or _first(scene,'turnip head')
    flues=anchors.get('flues') or [o for o in _all_named(scene,'riveted flue') if o.type=='EMPTY']
    shoes=anchors.get('shoes') or [o for o in _all_named(scene,'riveted walking shoe') if o.type=='EMPTY']
    def assign(items,specs):
        remaining=list(items);mapped=[]
        for i,p in enumerate(specs):
            if not remaining:break
            o=min(remaining,key=lambda q:(q.location-Vector(p)).length_squared)
            mapped.append((i,o));remaining.remove(o)
        return mapped
    stacks=[(i,o,STACKS[i]) for i,o in assign(flues,[s[0] for s in STACKS])]
    sorted_shoes=[o for i,o in assign(shoes,[(-10.23,0,6.4),(10.23,0,6.4),(-10.42,0,-5.57),(10.42,0,-5.57)])]
    mechanical=apply_shell_motion(scene,stacks)
    cloth=apply_tail_cloth(scene,turnip,timeline,windows['carried'])
    sails=_sail_gauge(scene)
    fires={};pan_roots=[]
    for slot,needle in (('hearth','calcifer in the hearth'),('carried','calcifer on kindling')):
        group=anchors.get(slot+'_flame') or _first(scene,needle)
        if not group:continue
        native_parent=anchors.get(slot+'_body') or _source_body(group)
        _strip_visuals(group)
        fires[slot]=build_calcifer(scene,collection,native_parent,slot,windows[slot])
        if slot=='carried' and not anchors.get('hops_baked_into_source',False):
            _signal_flame_hops(scene,fires[slot]['root'],timeline)
        pans=_all_named(scene,'little hearth pan')
        pan=next((p for p in pans if p.parent==group.parent),None)
        if pan is None and len(pans)>0:
            pvals={p for p in pans if p not in pan_roots}
            if pvals:
                pan=min(pvals,key=lambda obj:abs(obj.location.y-(.394 if slot=='hearth' else 0)))
        if pan is None:
            pan=_link(collection,slot+' | ash pan',parent=group.parent)
            if slot=='hearth':
                pan.location=(.38,.394,-2.82);pan.rotation_euler[1]=-.19;pan.scale=(.825,)*3
        if pan.type=='EMPTY' and not _relative_meshes(pan):
            pan_objs=_native_pan(collection,pan);_visible(scene,pan_objs,windows[slot])
        pan_roots.append(pan)
        _triangulate_ash(collection,pan,scene,windows[slot])
    if particles:
        sims=make_particles(scene,collection,castle,body,stacks,sorted_shoes,
                  [(slot,r['root'],windows[slot]) for slot,r in fires.items()],timeline=timeline)
    else:sims={}
    summary={'calcifers':list(fires),'pans':len(pan_roots),'flues':len(stacks),'feet':len(sorted_shoes),
             'secondary_objects':len(mechanical),'sail_membranes':len(sails),'coat_tails':len(cloth),
             'particles':sims}
    scene['native_motion_summary']=json.dumps(summary,ensure_ascii=False)
    print('HOWL NATIVE MOTION',scene['native_motion_summary'],flush=True)
    return {'fires':fires,'collection':collection,'mechanisms':mechanical,'summary':summary}
