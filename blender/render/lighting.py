"""Blender 4.3 lighting for the highlands, seasonal worlds and continuous dawn."""
import bpy, math
from pathlib import Path
from mathutils import Vector
FOLDER=Path(__file__).resolve().parent
def linear(v):
    if isinstance(v,str):
        v=v.lstrip('#');v=[int(v[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in v[:3])
def rgba(v):
    return (*linear(v),1.)
def world_vector(v):
    return Vector((v[0],-v[2],v[1]))
def keyf(socket, value, frame):
    socket.default_value=value
    if frame is not None: socket.keyframe_insert('default_value',frame=frame)
def object_key(obj, prop, value, frame):
    setattr(obj,prop,value)
    if frame is not None: obj.keyframe_insert(prop,frame=frame)
def aim_direction(obj, direction):
    return (-Vector(direction).normalized()).to_track_quat('-Z','Y')
def make_world(scene):
    w=scene.world or bpy.data.worlds.new('Highlands • painted atmosphere')
    scene.world=w;w.name='Highlands • sun, stars and moving daylight';w.use_nodes=True
    nt=w.node_tree;nt.nodes.clear()
    def node(name,label,loc=(0,0)):
        n=nt.nodes.new(name);n.name=label;n.label=label;n.location=loc;return n
    def path(src,dst): nt.links.new(src,dst)
    def math_node(op,a,b,label,loc):
        n=node('ShaderNodeMath',label,loc);n.operation=op
        for i,val in enumerate((a,b)):
            if val is None:continue
            if isinstance(val,(int,float)):n.inputs[i].default_value=val
            else:path(val,n.inputs[i])
        return n.outputs[0]
    def mix(a,b,f,label,loc,blend='MIX'):
        n=node('ShaderNodeMixRGB',label,loc);n.blend_type=blend
        for i,val in ((1,a),(2,b),(0,f)):
            if isinstance(val,(float,int,tuple)):n.inputs[i].default_value=val
            else:path(val,n.inputs[i])
        return n.outputs[0]
    def mapped(src,lo,hi,label,loc):
        n=node('ShaderNodeMapRange',label,loc);n.clamp=True;n.interpolation_type='SMOOTHERSTEP'
        n.inputs['From Min'].default_value=lo;n.inputs['From Max'].default_value=hi
        path(src,n.inputs['Value']);return n.outputs['Result']
    def color(label,default,loc):
        n=node('ShaderNodeRGB',label,loc);n.outputs[0].default_value=rgba(default);return n.outputs[0]
    def scalar(label,value,loc):
        n=node('ShaderNodeValue',label,loc);n.outputs[0].default_value=value;return n.outputs[0]
    coords=node('ShaderNodeTexCoord','World direction',(-1500,280))
    rays=coords.outputs['Generated']
    height=node('ShaderNodeSeparateXYZ','Altitude',(-1270,300));path(rays,height.inputs[0])
    height=mapped(height.outputs['Z'],-.05,.78,'From horizon to zenith',(-1020,330))
    lo=color('Horizon','#c4d8d7',(-1280,580));hi=color('Zenith','#398ac1',(-1280,485))
    sky=mix(lo,hi,height,'Aerial colour',(-680,370))
    tex=node('ShaderNodeTexEnvironment','Cloud relief and star map',(-1310,-50))
    img=bpy.data.images.load(str(FOLDER/'weather_sky_data.png'),check_existing=True);img.colorspace_settings.name='Non-Color'
    img.pack();tex.image=img;tex.interpolation='Linear'
    sep=node('ShaderNodeSeparateColor','Cloud, height, stars',(-1030,-30));path(tex.outputs['Color'],sep.inputs[0])
    cc=color('Cloud light','#f7ecda',(-1000,130));cs=color('Cloud shade','#9cabb2',(-1000,45))
    cloud_color=mix(cs,cc,sep.outputs[1],'Sunlit cloud relief',(-665,10))
    opacity=math_node('MULTIPLY',sep.outputs[0],.85,'Broken cloud cover',(-660,120))
    sky=mix(sky,cloud_color,opacity,'Moving weather',(-385,240))
    direction=node('ShaderNodeCombineXYZ','Position of sun',(-1280,-400))
    dot=node('ShaderNodeVectorMath','Angular distance from sun',(-1000,-360));dot.operation='DOT_PRODUCT'
    sun_norm=node('ShaderNodeVectorMath','Unit solar direction',(-1120,-485));sun_norm.operation='NORMALIZE';path(direction.outputs['Vector'],sun_norm.inputs[0]);path(sun_norm.outputs[0],dot.inputs[1])
    ray_norm=node('ShaderNodeVectorMath','Unit sky direction',(-1320,-210));ray_norm.operation='NORMALIZE';path(rays,ray_norm.inputs[0]);path(ray_norm.outputs[0],dot.inputs[0])
    sun_d=dot.outputs['Value']
    dotpos=math_node('MAXIMUM',sun_d,0.,'Visible hemisphere',(-780,-330))
    glow=math_node('POWER',dotpos,52,'Horizon half-light',(-560,-295))
    glow_control=scalar('Golden hour',.12,(-770,-230))
    glow=math_node('MULTIPLY',glow,glow_control,'Warm air',(-345,-220))
    gold=color('Sunlight colour','#ffdfae',(-560,-150))
    sky=mix(sky,gold,glow,'Solar airlight',(-130,180),'ADD')
    core=mapped(sun_d,math.cos(math.radians(.38)),math.cos(math.radians(.24)),'Solar disc',(-525,-450))
    radiant=scalar('Visible sun disc',.4,(-520,-535))
    core=math_node('MULTIPLY',core,radiant,'Disc radiance',(-310,-425))
    halo=math_node('POWER',dotpos,610.,'Gold around the rising sun',(-510,-640))
    halo=math_node('MULTIPLY',halo,radiant,'Dawn halo concentration',(-230,-600))
    sky=mix(sky,(.32,.165,.05,1.),halo,'Golden air near the disc',(0,270),'ADD')
    sky=mix(sky,(5.0,3.6,1.55,1.),core,'Sun on the horizon',(125,180),'ADD')
    star_strength=scalar('Nightfall',0,(-300,-600))
    stars=math_node('MULTIPLY',sep.outputs[2],star_strength,'Star intensity',(-110,-520))
    sky=mix(sky,(.87,.94,1.,1.),stars,'Night stars',(360,175),'ADD')
    indirect=scalar('Environment strength',.69,(75,-95))
    camera_strength=scalar('Sky display exposure',1.10,(75,-180))
    lpath=node('ShaderNodeLightPath','Ray type',(-160,-90))
    bg=node('ShaderNodeBackground','Ambient sky',(600,0));path(sky,bg.inputs['Color']);path(indirect,bg.inputs['Strength'])
    camera_bg=node('ShaderNodeBackground','Visible sky',(600,160));path(sky,camera_bg.inputs['Color']);path(camera_strength,camera_bg.inputs['Strength'])
    outmix=node('ShaderNodeMixShader','Light and atmosphere',(840,170));path(lpath.outputs['Is Camera Ray'],outmix.inputs[0]);path(bg.outputs[0],outmix.inputs[1]);path(camera_bg.outputs[0],outmix.inputs[2])
    out=node('ShaderNodeOutputWorld','World',(1050,170));path(outmix.outputs[0],out.inputs[0])
    # Direct illumination comes from a world-space sun. Background rays still
    # see the panorama, including warm and cool reflections on the riveted hull.
    w.cycles.sampling_method='NONE'
    def sunlight(label):
        dat=bpy.data.lights.new(label,'SUN');o=bpy.data.objects.new(label,dat);scene.collection.objects.link(o)
        o.rotation_mode='QUATERNION';dat.use_shadow=True;return o
    sun=sunlight('Sun • all fields and town');sun.data.angle=math.radians(2.15)
    moon=sunlight('Moon • blue hour');moon.data.angle=math.radians(4.6)
    skylight=sunlight('Sky • reflected fill on cast iron');skylight.data.angle=math.radians(19);skylight.data.use_shadow=False
    refl=bpy.data.lights.new('Sky reflection on the boiler','AREA');refl.shape='RECTANGLE';refl.size=73;refl.size_y=37;refl.use_shadow=False;refl.diffuse_factor=.20
    reflector=bpy.data.objects.new('Sky • long soft reflection',refl);scene.collection.objects.link(reflector);reflector.rotation_mode='QUATERNION'
    return locals()
def set_weather(rig,sky,frame=None,interior=False):
    def c(name,default): return sky.get(name,default)
    lo=c('horizon','#c9dbd8');hi=c('zenith','#4887b4');sun_col=c('sunColor','#fff0d1')
    s_power=0. if interior else float(c('sunPower',2.6));m_power=0. if interior else float(c('moonPower',0.))
    stars=float(c('stars',0));disc=float(c('dawnDisc',.25))
    ambient=float(c('ambient',.7))
    sun_direction=world_vector(c('sunDirection',[-.56,.71,.54])).normalized()
    for sock,v in zip(rig['direction'].inputs,sun_direction):keyf(sock,v,frame)
    keyf(rig['lo'],rgba(lo),frame);keyf(rig['hi'],rgba(hi),frame);keyf(rig['gold'],rgba(sun_col),frame)
    # Change the brightness of the actual clouds as the sun goes down.
    daylight=min(1.,max(0.,s_power/2.5));twilight=min(1.,max(0.,s_power/1.2))
    base=linear(lo);sun_linear=linear(sun_col)
    shadow_rgb=tuple(base[i]*(.54+.14*daylight) for i in range(3))
    lit_rgb=tuple(base[i]*(.53-.11*daylight)+sun_linear[i]*(.013+.56*twilight+.27*daylight) for i in range(3))
    keyf(rig['cs'],(*shadow_rgb,1),frame);keyf(rig['cc'],(*lit_rgb,1),frame)
    keyf(rig['indirect'],.22 if interior else ambient*1.14,frame)
    keyf(rig['camera_strength'],1.07+.025*daylight,frame)
    keyf(rig['glow_control'],.09*daylight+disc*.30,frame);keyf(rig['radiant'],disc*6.3,frame)
    keyf(rig['star_strength'],stars*1.45,frame)
    moon_dir=world_vector(c('moonDirection',[.33,.67,-.63])).normalized()
    # A broad sky fill supports the reflected-light side of the hardware. Real
    # contact and cast-shadow edges are owned by the sun and moon fixtures.
    fill=0 if interior else .62+.53*daylight+.20*m_power
    fill_col=tuple(.69*q+.31 for q in c('moonColor',[.69,.79,.92])) if not isinstance(c('moonColor',[.69,.79,.92]),str) else '#cfdfed'
    for o,d,col,p in ((rig['sun'],sun_direction,sun_col,s_power),(rig['moon'],moon_dir,c('moonColor','#b6c9f0'),m_power),(rig['skylight'],world_vector(c('_cameraFillDirection',[.61,.64,.46])).normalized(),fill_col,fill)):
        q=aim_direction(o,d)
        if q.dot(o.rotation_quaternion)<0:q.negate()
        object_key(o,'rotation_quaternion',q,frame);object_key(o.data,'energy',p,frame);object_key(o.data,'color',linear(col),frame)
    center=world_vector(c('_castleCenter',[0,22,0]));fill_dir=world_vector(c('_cameraFillDirection',[.61,.64,.46])).normalized()
    refl=rig['reflector'];object_key(refl,'location',center+fill_dir*82.,frame);rq=aim_direction(refl,fill_dir)
    if rq.dot(refl.rotation_quaternion)<0:rq.negate()
    object_key(refl,'rotation_quaternion',rq,frame);object_key(refl.data,'color',linear(fill_col),frame);object_key(refl.data,'energy',0. if interior else 17500+daylight*14500+m_power*2200,frame)
