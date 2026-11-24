"""Seeded, detached smoke, pressure bursts, falling grit and glowing cinders."""
import math
import random
from collections import defaultdict
from dataclasses import dataclass, field

import bpy
import numpy as np
from mathutils import Euler, Matrix, Quaternion, Vector

from blender_motion import (EFFECT_PREFIX, STACKS, TAU, _Nodes, _action, _curve,
    _ink, _link, _mesh, _simple, _sphere_data, _vector_keys, clamp, fps, frame, smooth)


class WorldSampler:
    """Evaluate only a particle emitter's transform chain at a fractional birth frame.

    The imported animated objects use ordinary transform FCurves.  Evaluating
    this small chain avoids advancing a landscape and all wing skins per ember.
    """
    def __init__(self):
        self.bind={}
        self.cache={}

    def _binding(self,obj):
        if obj in self.bind:
            return self.bind[obj]
        default={k:tuple(getattr(obj,k)) for k in
            ("location","rotation_euler","rotation_quaternion","rotation_axis_angle","scale",
             "delta_location","delta_rotation_euler","delta_rotation_quaternion","delta_scale")}
        active={}
        ad=obj.animation_data
        if ad and ad.action:
            active=defaultdict(list)
            for fc in ad.action.fcurves:
                if fc.data_path in default and not fc.mute:
                    active[fc.data_path].append((fc.array_index,fc))
        self.bind[obj]=(default,active)
        return default,active

    def matrix(self,obj,f):
        cachekey=(obj,round(f,5))
        if cachekey in self.cache:
            return self.cache[cachekey]
        default,active=self._binding(obj)
        values={k:list(v) for k,v in default.items()}
        for name,fcs in active.items():
            for i,fc in fcs:
                values[name][i]=fc.evaluate(f)
        mode=obj.rotation_mode
        if mode=='QUATERNION':
            q=Quaternion(values['rotation_quaternion'])
            dq=Quaternion(values['delta_rotation_quaternion'])
        elif mode=='AXIS_ANGLE':
            v=values['rotation_axis_angle']
            q=Quaternion(v[1:],v[0]) if sum(x*x for x in v[1:])>1e-10 else Quaternion()
            dq=Euler(values['delta_rotation_euler']).to_quaternion()
        else:
            q=Euler(values['rotation_euler'],mode).to_quaternion()
            dq=Euler(values['delta_rotation_euler'],mode).to_quaternion()
        loc=Vector(values['location'])+Vector(values['delta_location'])
        size=Vector(tuple(a*b for a,b in zip(values['scale'],values['delta_scale'])))
        basis=Matrix.LocRotScale(loc,dq@q,size)
        world=self.matrix(obj.parent,f)@obj.matrix_parent_inverse@basis if obj.parent else basis
        self.cache[cachekey]=world
        return world

    def point(self,obj,f,offset):
        return self.matrix(obj,f)@Vector(offset)


def _noise(rng,x,y,z,scale):
    """Trilinear, continuous noise on a periodic random lattice."""
    lattice=rng.uniform(-1,1,(20,20,20))
    p=np.asarray((x,y,z))*scale + np.array([6.8,9.4,8.7])[:,None,None]
    i=np.floor(p).astype(np.int32)
    u=p-i
    u=u*u*(3-2*u)
    val=np.zeros(x.shape)
    for a in range(2):
        for b in range(2):
            for c in range(2):
                w=(u[0] if a else 1-u[0])*(u[1] if b else 1-u[1])*(u[2] if c else 1-u[2])
                val+=w*lattice[(i[0]+a)%20,(i[1]+b)%20,(i[2]+c)%20]
    return val


def _cloud_image(kind,variation):
    """Integrate a lit, irregular density field once into a packed RGBA impostor."""
    name=EFFECT_PREFIX+f"Air density • {kind} {variation}"
    old=bpy.data.images.get(name)
    if old:
        return old
    n=96
    seed=961127+variation*721
    rng=np.random.RandomState(seed)
    coord=np.linspace(-1.07,1.07,n)
    x,y=np.meshgrid(coord,coord)
    # Visibility comes from overlapping billows, with clear air between the lobes.
    lobes=[(0,0,0,.58)]
    for i in range(8):
        ang=(i/8)*TAU+rng.uniform(-.28,.28)
        radius=rng.uniform(.28,.50)
        lobes.append((math.cos(ang)*radius,math.sin(ang)*radius,rng.uniform(-.24,.25),rng.uniform(.28,.46)))
    light=np.zeros(x.shape)
    transmission=np.ones(x.shape)
    for depth in np.linspace(.98,-.98,13):
        z=np.full(x.shape,depth)
        coarse=_noise(np.random.RandomState(seed),x,y,z,3.15)
        fine=_noise(np.random.RandomState(seed+1),x,y,z,8.65)
        f=np.full(x.shape,-2.0)
        for cx,cy,cz,rad in lobes:
            q=rad-np.sqrt(((x-cx)*1.02)**2+((y-cy)*.96)**2+((z-cz)*1.10)**2)
            blend=np.maximum(.16-np.abs(q-f),0)/.16
            f=np.maximum(q,f)+.04*blend*blend
        d=np.clip((f+.09+.12*coarse+.054*fine)*3.8,0,1)
        a=1-np.exp(-.285*d)
        shade=np.clip(.48+.27*y+.24*depth+.19*coarse,0,1)
        light+=transmission*a*shade
        transmission*=1-a
    alpha=(1-transmission)
    shade=light/np.maximum(alpha,.001)
    colors={
        "smoke":((.112,.121,.128),(.46,.47,.46)),
        "vent":((.36,.42,.42),(.90,.84,.67)),
        "dust":((.175,.130,.078),(.55,.43,.26)),
        "roof":((.16,.135,.112),(.49,.42,.32)),
        "snow":((.46,.56,.63),(.82,.84,.82)),
    }
    low,high=np.array(colors[kind][0]),np.array(colors[kind][1])
    rgb=low[None,None,:]+(high-low)[None,None,:]*shade[:,:,None]
    rgba=np.empty((n,n,4),dtype=np.float32)
    rgba[:,:,:3]=rgb
    rgba[:,:,3]=alpha
    img=bpy.data.images.new(name,n,n,alpha=True,float_buffer=True)
    img.colorspace_settings.name='Non-Color'
    img.alpha_mode='STRAIGHT'
    img.pixels.foreach_set(rgba.reshape(-1))
    img.update()
    img.pack()
    return img


def _cloud_mesh(kind,variation):
    name=EFFECT_PREFIX+f"Cloud sheet · {kind} {variation}"
    old=bpy.data.meshes.get(name)
    if old:
        return old
    mesh=_mesh(f"Cloud sheet · {kind} {variation}",[(-1,-1,0),(1,-1,0),(1,1,0),(-1,1,0)],[(0,1,2,3)],False)
    uv=mesh.uv_layers.new()
    for loop,coord in zip(uv.data,((0,0),(1,0),(1,1),(0,1))):
        loop.uv=coord
    mat=bpy.data.materials.new(EFFECT_PREFIX+f'Air · {kind} {variation}')
    mat.use_nodes=True
    mat.diffuse_color=(.55,.46,.39,.45)
    nodes=_Nodes(mat)
    img=nodes.node('ShaderNodeTexImage','Preintegrated density and scattering',-500,280)
    img.image=_cloud_image(kind,variation)
    img.extension='CLIP'
    info=nodes.node('ShaderNodeObjectInfo','Individual particle lifetime',-500,40)
    alpha=nodes.math('MULTIPLY',img.outputs['Alpha'],info.outputs['Alpha'],x=-220,y=110)
    trans=nodes.node('ShaderNodeBsdfTransparent','Transmittance through vapor',-10,20)
    transmission=nodes.math('SUBTRACT',1.,alpha,x=-190,y=0)
    nodes.plug(transmission,trans.inputs['Color'])
    emission=nodes.node('ShaderNodeEmission','Integrated scattering',90,250)
    nodes.plug(img.outputs['Color'],emission.inputs['Color'])
    ambient=nodes.node('ShaderNodeValue','Sky illumination',-180,-195)
    ambient.name='Vapor skylight'
    ambient.outputs[0].default_value=1.0 if kind=='vent' else .70
    strength=nodes.math('MULTIPLY',alpha,ambient.outputs[0],x=0,y=130)
    nodes.plug(strength,emission.inputs['Strength'])
    surface=nodes.node('ShaderNodeAddShader','Emission plus unscattered light',330,200)
    nodes.plug(trans.outputs[0],surface.inputs[0]);nodes.plug(emission.outputs[0],surface.inputs[1])
    out=nodes.node('ShaderNodeOutputMaterial','Output',570,210)
    nodes.plug(surface.outputs[0],out.inputs['Surface'])
    mesh.materials.append(mat)
    return mesh


def _growing_grain(kind):
    name=EFFECT_PREFIX+'Particle mesh • '+kind
    existing=bpy.data.meshes.get(name)
    if existing: return existing
    # Elongated real geometry keeps ash and sparks readable in oblique and top-down views.
    if kind=='ember':
        mesh=_sphere_data('Particle mesh • '+kind,8,5)
        mat=_ink('Cinders | amber',(1,.365,.035),3.7)
    else:
        mesh=_mesh('Particle mesh • '+kind,
          [(-1.0,-.31,.16),(-.48,.72,-.16),(.95,.12,.18),(.63,-.60,-.18),(.02,.02,.62),(.13,-.04,-.59)],
          [(0,1,4),(1,2,4),(2,3,4),(3,0,4),(1,0,5),(2,1,5),(3,2,5),(0,3,5)],False)
        mat=_simple('Coal fleck | bronze ash',(.20,.133,.071),.95,emit=.05)
    if not mesh.materials: mesh.materials.append(mat)
    return mesh


@dataclass
class Birth:
    kind:str
    launch:float
    duration:float
    anchor:object
    offset:tuple
    velocity:tuple
    acceleration:tuple
    radius:tuple
    opacity:float
    seed:int
    group:str
    end:float=60.0
    accent:float=0.0


def _bursts(scene,castle,body,stacks,shoes,fires,sampler):
    rng=random.Random(2374581)
    births=[]
    def add(kind,t,life,anchor,local,velocity,accel,radius,alpha,group,end=60,accent=0):
        births.append(Birth(kind,t,life,anchor,tuple(local),tuple(velocity),tuple(accel),
                            tuple(radius),alpha,rng.randrange(1000000),group,end,accent))
    cuts=((0,22),(25,30),(30,60))
    for i,flue,spec in stacks:
        origin=Vector(spec[1])-Vector(spec[0])
        for lo,hi in cuts:
            t=lo+.06+i*.15
            while t<hi-.08:
                strength=1.0+.72*smooth(40.5,43.55,t)*(1-smooth(45.1,47.0,t))
                pos=origin+Vector((rng.uniform(-.18,.18),.10,rng.uniform(-.20,.20)))
                flight=smooth(43.6,45.4,t)
                vel=(1.9+rng.random()*1.15,1.15+2.15*flight+rng.random()*.65,3.05+rng.random()*1.2)
                accel=(.41+.45*flight,.20+.35*flight,-.36)
                add('smoke',t,rng.uniform(3.8,5.1),flue,pos,vel,accel,
                    (rng.uniform(.58,.78)*strength,rng.uniform(2.40,3.60)*strength,1.08),
                    .55 if i<2 else .40,"stack",hi)
                t+=rng.uniform(.64,.91)*(1+.09*i)/strength
    # Identify impact from the imported shoe itself. Compression and terrain edits
    # can alter the nominal stride. Its sole must have returned before soil moves.
    for idx,shoe in enumerate(shoes):
        for lo,hi in ((0,22),(25,30),(30,44.03)):
            prev=None;air=False
            step=1/fps(scene)
            f0=math.ceil(lo/step);f1=math.floor(hi/step)
            for j in range(f0,f1+1):
                t=j*step;f=frame(scene,t)
                # Local shoe elevation already includes toe rocker and IK.
                default,fc=sampler._binding(shoe)
                ys=next((curve for index,curve in fc.get('location',[]) if index==1),None)
                y=ys.evaluate(f) if ys else default['location'][1]
                if prev is not None and y>.48: air=True
                if air and prev is not None and prev>.025 and y<=.025:
                    air=False
                    for k in range(4):
                        ang=TAU*(k+.25*rng.random())/4
                        d=rng.uniform(1.25,2.45)
                        t_emit=t+.015+rng.random()*.065
                        local=(d*.38*math.cos(ang),.04,.42+d*.52*math.sin(ang))
                        vel=(d*math.cos(ang),d*math.sin(ang),rng.uniform(.38,.94))
                        kind='snow' if 37.5<t<40 else 'dust'
                        add(kind,t_emit,rng.uniform(.74,1.34),shoe,local,vel,(.18,.42,-.27),
                            (.22,rng.uniform(.92,1.45),1.28),.75,'sole',hi)
                prev=y
    if body:
        # Double valve release, then short contrails as the sails bite.
        for t,side,local in ((43.68,1,(12.44,18.58,3.78)),(43.94,-1,(-13.28,17.92,1.80)),
                              (44.30,1,(10.80,15.35,-4.15)),(44.405,-1,(-11.8,15.90,-3.9))):
            for j in range(9):
                u=j/8
                final=t>44.40
                span=.96+.51*u if final else 1.47+1.0*u
                add('vent',t+j*(.012 if final else .045),1.04+.46*rng.random(),body,
                    (local[0],local[1]+.18*rng.random(),local[2]+rng.uniform(-.18,.18)),
                    (side*(6.8+4.3*u),rng.uniform(.4,2.0),.95+.9*u),
                    (-side*2.5,.54,.53),(.26,span,1.16),.63 if final else .89,'valve',
                    accent=44.54 if final else 0)
        # Falling mortar and flakes originate at selected original roof eaves.
        ledges=((9.44,23.42,6.91),(-12.13,21.70,.06),(1.7,22.31,-10.45),
                (-7.45,23.36,9.38),(5.11,24.53,9.61),(-9.83,19.79,-5.61),
                (-12.22,27.81,3.4),(12.33,19.99,4.5))
        for event,amp in ((42.56,.48),(43.40,.93),(43.85,1),(44.24,1),(45.56,.70),
                          (47.48,.52),(49.62,.49),(52.04,.47),(54.15,.38)):
            for j in range(round(9+7*amp)):
                roof=ledges[(j+int(event*4))%len(ledges)]
                offset=(roof[0]+rng.uniform(-.65,.65),roof[1]+rng.uniform(-.27,.3),roof[2]+rng.uniform(-.7,.7))
                t=event+rng.uniform(.03,.26)+.03*(j%3)
                vel=(rng.uniform(-.7,1.1),rng.uniform(.5,1.75),rng.uniform(-.8,.65))
                add('fleck',t,rng.uniform(1.01,1.72),body,offset,vel,(.45,.46,-8.2),
                    (rng.uniform(.035,.085),rng.uniform(.052,.115),1),1,"roof grain")
                if j%3==0:
                    add('roof',t,rng.uniform(1.23,1.67),body,offset,vel,(.46,.63,-3.15),
                        (.17,rng.uniform(.53,1.10),1.17),.63,'eaves')
        if shoes:
            for i,t in enumerate((44.15,44.03,44.28,44.40)):
                shoe=shoes[i%len(shoes)]
                for j in range(6):
                    a=TAU*j/6+rng.random()*.46
                    d=rng.uniform(2.4,4.3)
                    add('dust',t+.03+.04*rng.random(),rng.uniform(1.1,1.55),shoe,
                        (.82*math.cos(a),.04,.87*math.sin(a)),(d*math.cos(a),d*math.sin(a),1.1+rng.random()),
                        (.10,.51,-.48),(.28,1.45+.77*rng.random(),1.23),.69,'release')
    for slot,fire,windows in fires:
        height=1.28
        for a,b in windows:
            t=a+.02
            while t<b-.04:
                out=slot=='carried'
                local=(rng.uniform(-.40,.42),height+rng.uniform(-.12,.21),rng.uniform(-.16,.19))
                spd=.70 if out else 1
                add('ember',t,rng.uniform(.65,1.23) if out else rng.uniform(.78,1.55),fire,local,
                    (rng.uniform(-.27,.28)*spd,rng.uniform(-.19,.20)*spd,rng.uniform(.87,1.48)*spd),
                    (.21 if out else .03,.18 if out else .05,-.17),(.014 if out else .011,.024 if out else .019,1),1,'sparks',b)
                t+=rng.uniform(.11,.22)
    return sorted(births,key=lambda e:e.launch)


def make_particles(scene,coll,castle,body,stacks,shoes,fires,camera=None,timeline=None):
    """World-space paths stay where they were shed, even when the castle climbs."""
    sampler=WorldSampler()
    events=_bursts(scene,castle,body,stacks,shoes,fires,sampler)
    if not events:
        return {'events':0,'objects':0}
    pools=defaultdict(list)
    current_camera=camera or scene.camera
    for e in events:
        rng=random.Random(e.seed)
        card=e.kind not in ('ember','fleck')
        variation=e.seed%3 if card else 0
        key=(e.kind,variation)
        start=e.launch;duration=min(e.duration,e.end-start)
        if duration<.025: continue
        slot=next((s for s in pools[key] if s['until']<start-.065),None)
        if slot is None:
            data=_cloud_mesh(e.kind,variation) if card else _growing_grain(e.kind)
            obj=_link(coll,f"{e.kind} | {variation+1:02d} · {len(pools[key])+1:02d}",data)
            obj['role']="Detached world-space effect"
            obj.visible_shadow=False
            if card:
                obj.visible_diffuse=False;obj.visible_glossy=False;obj.visible_transmission=False
                if current_camera:
                    track=obj.constraints.new('COPY_ROTATION');track.name='Face the film camera'
                    track.target=current_camera;track.owner_space='WORLD';track.target_space='WORLD'
            slot={'obj':obj,'until':0,'location':{},'scale':{},'alpha':{},'rotate':{},'hide':{frame(scene,0)-1:1.0}}
            pools[key].append(slot)
        obj=slot['obj']
        birthframe=frame(scene,start)
        world=sampler.point(e.anchor,birthframe,e.offset)
        # A roof flake carries most of the ship's velocity for its first
        # fraction of a second. Hot gas loses that inherited speed to wind.
        earlier=sampler.point(e.anchor,birthframe-1,e.offset)
        initial=(world-earlier)*fps(scene)
        if initial.length>56:
            initial=Vector((0,0,0))
        elif initial.length>22:
            initial*=22/initial.length
        inherit={'smoke':.55,'vent':.72,'dust':.02,'snow':.02,'roof':.79,
                 'fleck':.91,'ember':.38}[e.kind]
        initial*=inherit
        drag={'smoke':1.24,'vent':1.38,'dust':2.7,'snow':2.2,'roof':1.41,
              'fleck':.63,'ember':1.77}[e.kind]
        direction=Vector(e.velocity)
        accel=Vector(e.acceleration)
        fstart=frame(scene,start);fend=frame(scene,start+duration)
        slot['until']=start+duration
        slot['hide'][fstart]=0
        slot['hide'][fend+.012]=1
        if card: slot['alpha'][fstart-.015]=0
        angle=rng.uniform(-math.pi,math.pi)
        freq=rng.uniform(1.1,2.2)
        wobble=rng.uniform(.12,.30) if e.kind=='smoke' else .05
        accent_u=clamp((e.accent-start)/duration) if e.accent else None
        phases={0,.13,.29,.47,.66,.83,1}
        if accent_u is not None:phases.add(accent_u)
        for u in sorted(phases):
            age=duration*u
            f=fstart+(fend-fstart)*u
            p=world+direction*age+accel*(.5*age*age)+initial*((1-math.exp(-drag*age))/drag)
            p.x+=wobble*age*math.sin(angle+age*freq)
            p.y+=wobble*.61*age*math.cos(angle+age*freq)
            slot['location'][f]=tuple(p)
            # Dissipation occurs in alpha rather than abruptly deflating a cloud.
            if card:
                growth=u**.86
                if accent_u is not None:
                    growth=.27*smooth(0,accent_u,u)+.73*growth
                span=e.radius[0]+(e.radius[1]-e.radius[0])*growth
                slot['scale'][f]=(span*e.radius[2],span,span)
                alpha=e.opacity*smooth(0,accent_u if accent_u is not None else .20,u)*(1-smooth(.39,1,u))
                slot['alpha'][f]=alpha
            else:
                size=(e.radius[0]+(e.radius[1]-e.radius[0])*u)*max(0,math.sin(math.pi*min(1,u)*.98))**.58
                zscale=1.84 if e.kind=='ember' else .72
                slot['scale'][f]=(size,size*.72,size*zscale)
                slot['rotate'][f]=(angle+1.3*age,angle*.47+2.1*age,angle*.82+age*2.7)
    for slots in pools.values():
        for s in slots:
            obj=s['obj']
            _vector_keys(obj,'location',sorted(s['location'].items()))
            _vector_keys(obj,'scale',sorted(s['scale'].items()))
            if s['rotate']: _vector_keys(obj,'rotation_euler',sorted(s['rotate'].items()))
            if s['alpha']: _curve(obj,'color',sorted(s['alpha'].items()),3)
            for prop in ('hide_render','hide_viewport'):
                _curve(obj,prop,sorted(s['hide'].items()),interpolation='CONSTANT')
    # Use the film's actual sun-to-moon trajectory for the preintegrated color.
    directed=(timeline or {}).get('frames',[]) if isinstance(timeline,dict) else []
    if directed:
        for kind,variation in pools:
            if kind in ('ember','fleck'):continue
            mat=_cloud_mesh(kind,variation).materials[0]
            value=mat.node_tree.nodes.get('Vapor skylight').outputs[0]
            keys=[]
            for i in range(0,len(directed),8):
                row=directed[i];sky=row.get('sky')
                strength=.17+.92*sky.get('ambient',.65)+.09*sky.get('sunPower',1) if sky else .90
                if kind=='vent':strength*=1.26
                keys.append((frame(scene,row.get('t',i/fps(scene))),strength))
            _curve(mat.node_tree,value.path_from_id('default_value'),keys)
    counts=defaultdict(int)
    for e in events: counts[e.group]+=1
    return {'events':len(events),'objects':sum(map(len,pools.values())),'emission_groups':dict(counts)}
