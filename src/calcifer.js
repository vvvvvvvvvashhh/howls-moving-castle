import * as THREE from "../vendor/three.module.js";
import { sampleFireMotion, sampleTurnipMotion } from "./companions.js";



// Every row describes a horizontal cross-section through a single current of gas.
// The currents join in one continuous density field before light is integrated.
const currents = [
  [[-.18,0,0,.36,.28],[0,-.02,0,.56,.40],[.22,-.03,.02,.68,.50],[.52,-.04,.01,.70,.53],[.80,-.04,-.015,.63,.48],[1.07,-.09,-.045,.52,.43],[1.29,-.12,-.07,.43,.38],[1.46,-.045,-.075,.33,.30],[1.63,.11,-.085,.21,.22],[1.79,.16,-.07,.12,.13],[1.94,.08,-.04,.008,.012]],
  [[.12,.20,-.06,.37,.31],[.55,.32,-.10,.40,.32],[.86,.37,-.14,.30,.26],[1.06,.42,-.17,.21,.19],[1.26,.53,-.14,.17,.13],[1.43,.58,-.12,.103,.105],[1.56,.56,-.105,.061,.070],[1.68,.46,-.09,.009,.014]],
  [[.13,-.22,-.01,.31,.31],[.49,-.38,-.01,.31,.29],[.77,-.44,.015,.24,.22],[.96,-.55,.02,.17,.17],[1.14,-.57,.02,.11,.13],[1.31,-.46,-.01,.009,.012]],
  [[.08,-.42,.015,.24,.25],[.27,-.55,.035,.30,.23],[.46,-.66,.04,.23,.19],[.62,-.74,.03,.145,.135],[.71,-.84,.02,.085,.085],[.82,-.87,.005,.009,.011]],
  [[.10,.37,.05,.28,.245],[.30,.51,.04,.25,.23],[.47,.67,.04,.17,.17],[.60,.79,.06,.115,.105],[.72,.81,.09,.055,.08],[.80,.77,.12,.009,.01]],
  [[.75,-.15,.085,.16,.20],[.98,-.30,.09,.20,.17],[1.17,-.38,.08,.16,.14],[1.35,-.43,.08,.145,.12],[1.51,-.51,.055,.083,.085],[1.64,-.48,.055,.040,.050],[1.74,-.39,.05,.009,.012]],
  [[.47,-.10,-.17,.33,.33],[.86,-.16,-.24,.30,.29],[1.14,-.30,-.26,.25,.25],[1.40,-.36,-.28,.15,.16],[1.53,-.44,-.22,.07,.075],[1.62,-.39,-.20,.008,.012]],
];
const lower = [-1.25,-.26,-.83], upper = [1.25,2.23,.83];

function fieldTexture() {
  const width=64,height=72,depth=36;
  const data=new Uint8Array(width*height*depth);
  const profiles=Array.from({length:height},(_,j)=>{
    const y=lower[1]+(upper[1]-lower[1])*j/(height-1);
    return currents.map(curve=>{
      if(y<curve[0][0]||y>curve[curve.length-1][0])return null;
      let k=1;
      while(k<curve.length-1&&curve[k][0]<y)k++;
      const a=curve[k-1],b=curve[k],t=(y-a[0])/(b[0]-a[0]);
      const step=b[0]-a[0], prev=curve[Math.max(0,k-2)],next=curve[Math.min(curve.length-1,k+1)];
      const t2=t*t,t3=t2*t;
      return [1,2,3,4].map(n=>(2*t3-3*t2+1)*a[n]+(-2*t3+3*t2)*b[n]+(t3-2*t2+t)*step*(b[n]-prev[n])/(b[0]-prev[0])+(t3-t2)*step*(next[n]-a[n])/(next[0]-a[0]));
    });
  });
  for(let k=0;k<depth;k++)for(let j=0;j<height;j++)for(let i=0;i<width;i++){
    const x=lower[0]+(upper[0]-lower[0])*i/(width-1),z=lower[2]+(upper[2]-lower[2])*k/(depth-1);
    let field=-.55;
    for(const row of profiles[j]){
      if(!row)continue;
      const [cx,cz,w,d]=row;
      const f=(1-Math.hypot((x-cx)/w,(z-cz)/d))*Math.min(w,d);
      const blend=Math.max(.105-Math.abs(f-field),0)/.105;
      field=Math.max(f,field)+blend*blend*.02625;
    }
    data[i+width*(j+height*k)]=Math.round(255*THREE.MathUtils.clamp((field+.40)/.85,0,1));
  }
  const tex=new THREE.Data3DTexture(data,width,height,depth);
  tex.format=THREE.RedFormat; tex.minFilter=tex.magFilter=THREE.LinearFilter;
  tex.unpackAlignment=1;tex.needsUpdate=true;return tex;
}

function turbulenceTexture() {
  const n=32,data=new Uint8Array(n*n*n*4);
  let seed=245137;
  for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed>>>24;}
  const tex=new THREE.Data3DTexture(data,n,n,n);
  tex.minFilter=tex.magFilter=THREE.LinearFilter;
  tex.wrapS=tex.wrapT=tex.wrapR=THREE.RepeatWrapping;tex.needsUpdate=true;return tex;
}

const volumeVertex=`
  varying vec3 samplePosition;
  varying vec3 eyePosition;
  void main(){
    samplePosition=position;
    eyePosition=(inverse(modelMatrix)*vec4(cameraPosition,1.0)).xyz;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
  }`;
const volumeFragment=`
  precision highp sampler3D;
  uniform sampler3D densityMap;
  uniform sampler3D turbulenceMap;
  uniform float time;
  uniform vec2 draft;
  varying vec3 samplePosition;
  varying vec3 eyePosition;
  const vec3 lo=vec3(-1.25,-.26,-.83), hi=vec3(1.25,2.23,.83);
  void main(){
    vec3 ray=normalize(samplePosition-eyePosition);
    vec3 a=(lo-eyePosition)/ray, b=(hi-eyePosition)/ray;
    vec3 nearPlane=min(a,b),farPlane=max(a,b);
    float entry=max(max(nearPlane.x,nearPlane.y),nearPlane.z);
    float leave=min(min(farPlane.x,farPlane.y),farPlane.z);
    entry=max(entry,0.0);
    float stepLength=(leave-entry)/26.0;
    float dither=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
    vec3 q=eyePosition+(entry+(.04+.92*dither)*stepLength)*ray;
    vec3 light=vec3(0.);float transmittance=1.;
    for(int j=0;j<26;j++){
      float h=clamp(q.y*.55,0.,1.);
      vec3 p=q;
      vec3 broad=texture(turbulenceMap,q*vec3(.075,.061,.074)+vec3(.21,-time*.052,.38)).rgb-.5;
      vec3 finer=texture(turbulenceMap,q*vec3(.16,.14,.19)+vec3(.51,-time*.089,.11)).rgb-.5;
      p.xz-=draft*(h*h*.27+.018*h);
      p.x+=h*h*(.12*sin(time*2.12+q.y*2.2)+.065*sin(time*3.20-q.y*3.8));
      p.z+=h*h*.09*cos(time*1.7-q.y*3.6);
      p+=broad*(.055+.33*h)+finer*(.023+.115*h);
      p.y=(p.y-.05)/(1.+.035*sin(time*2.52)+.022*sin(time*4.1))+.05;
      float field=texture(densityMap,(p-lo)/(hi-lo)).r*.85-.4;
      float mantle=smoothstep(-.067,-.006,field)*(.033+.031*broad.g);
      float edgeWidth=max(.030,stepLength*.45);
      float density=(mantle+.93*smoothstep(-edgeWidth*.55,edgeWidth,field))*(1.-smoothstep(1.28,2.12,p.y)*.21);
      density*=smoothstep(-.17+.058*broad.g+.030*sin(8.9*p.x+1.9*time),.045,p.y);
      if(density>.002){
        float core=1.-smoothstep(.12,.91,length(vec2((p.x+.010)*1.03,(p.y-.53)*1.08)));
        float frontWarmth=core*(.58+.42*smoothstep(-.27,.33,p.z));
        float line=p.x+.12*sin(p.y*5.2-time*2.5)+.085*sin(p.y*8.1+time*1.7)+.15*broad.r;
        float ribbon=exp(-62.*(line+.16)*(line+.16))+.83*exp(-85.*(line-.275)*(line-.275));
        float rise=smoothstep(.58,1.08,p.y)*(1.-smoothstep(1.59,1.92,p.y));
        float eddy=sin(12.*p.y-.20*time+2.0*sin(6.1*p.x-2.2*time)+broad.g*2.8);
        float temperature=clamp(.32*smoothstep(-.045,.23,field)+.67*frontWarmth+.18*(1.-h)+.12*broad.b+.055*finer.b+.49*ribbon*rise+.080*eddy*rise-.084*smoothstep(.94,1.67,p.y),0.,1.);
        vec3 fringe=vec3(.68,.019,.010), crimson=vec3(1.00,.033,.013);
        vec3 tangerine=vec3(1.49,.121,.019), amber=vec3(1.97,.358,.035), cream=vec3(2.36,.86,.155);
        vec3 color=mix(fringe,crimson,smoothstep(.0,.28,temperature));
        color=mix(color,tangerine,smoothstep(.27,.59,temperature));
        color=mix(color,amber,smoothstep(.54,.82,temperature));
        color=mix(color,cream,smoothstep(.73,1.,temperature)*(.90+.065*finer.b));
        float edgeHeat=smoothstep(-.080,.055,field);
        color*=.79+.21*edgeHeat;
        float opacity=1.-exp(-density*stepLength*8.65);
        light+=transmittance*opacity*color;
        transmittance*=1.-opacity;
      }
      q+=ray*stepLength;
    }
    float alpha=1.-transmittance;
    if(alpha<.007)discard;
    gl_FragColor=vec4(light/max(alpha,.001),alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function faceMaterial(feeling) {
  return new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:feeling,
    vertexShader:`varying vec2 face;void main(){face=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`
      varying vec2 face;uniform float time,interest,gaze,liftGaze,closeLids;
      float mark(float d){float w=max(fwidth(d)*.74,.003);return 1.-smoothstep(-w,w,d);}
      void paint(inout vec4 layer,vec3 color,float amount){layer.rgb=mix(layer.rgb,color,amount);layer.a=max(layer.a,amount);}
      void main(){
        vec2 p=face;vec4 layer=vec4(0.);
        float blink=max(.065,(1.-.86*pow(max(0.,cos((time-.80)*1.21)),150.))*(1.-.93*closeLids));
        float look=.011*sin(time*.87)+.004*sin(time*2.07)+.038*gaze;
        for(int i=0;i<2;i++){
          float s=float(i)*2.-1.;vec2 e=p-vec2(s*.227,.71+s*.009+.018*interest);
          e.x+=s*.105*e.y;e.y/=(blink*(1.+.14*interest));
          e.x*=1.+e.y*.8;
          float contour=length(e/vec2(.096+(s+.3)*.007,.106+s*.004))-1.;
          paint(layer,vec3(.128,.042,.023),mark(contour));
          paint(layer,vec3(.90,.76+.10*e.y,.55),mark(contour+.080));
          vec2 d=e-vec2(.010+look,.010+.005*cos(time*1.18)+.031*liftGaze);
          float pupil=length(d/vec2(.031,.036))-1.;
          paint(layer,vec3(.036,.019,.013),mark(pupil));
          float glint=length((d-vec2(-.008,.012))/vec2(.006,.007))-1.;
          paint(layer,vec3(.80,.53,.29),mark(glint)*.34);
        }
        float shape=clamp(.46+.32*sin(time*1.77-.8)+.07*sin(time*3.1)+.21*interest,0.,1.);
        float px=(p.x-.012)/(.147-.019*shape);
        float mid=.470+.061*px*px-.007*shape;
        vec2 m=vec2(px,(p.y-mid)/(.035+.040*shape));
        m.y+=.14*px;
        float lip=length(m)-1.;
        paint(layer,vec3(.27,.036,.018),mark(lip));
        paint(layer,mix(vec3(.35,.041,.023),vec3(.72,.085,.045),1.-smoothstep(-.9,.3,m.y)),mark(lip+.10));
        float tongue=length((m-vec2(.1,-.79))/vec2(.70,.37))-1.;
        paint(layer,vec3(.90,.225,.080),min(mark(tongue),mark(lip+.12))*.89);
        if(layer.a<.01)discard;gl_FragColor=layer;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
}

let sharedDensity,sharedTurbulence;

function createCalcifer({outdoor=false}={}) {
  const group=new THREE.Group();group.name=outdoor?'Calcifer on kindling':'Calcifer in the hearth';
  const body=new THREE.Group();group.add(body);
  const time={value:0};
  const feeling={time,interest:{value:0},gaze:{value:0},liftGaze:{value:0},closeLids:{value:0}};
  const draft={value:new THREE.Vector2()};
  const volumeGeo=new THREE.BoxGeometry(upper[0]-lower[0],upper[1]-lower[1],upper[2]-lower[2]);
  volumeGeo.translate(0,(upper[1]+lower[1])*.5,0);
  const volume=new THREE.Mesh(volumeGeo,new THREE.ShaderMaterial({
    uniforms:{densityMap:{value:sharedDensity??=fieldTexture()},turbulenceMap:{value:sharedTurbulence??=turbulenceTexture()},time,draft},
    transparent:true,depthWrite:false,side:THREE.FrontSide,vertexShader:volumeVertex,fragmentShader:volumeFragment,
  }));
  volume.renderOrder=3;body.add(volume);
  const faceGeometry=new THREE.PlaneGeometry(1,.73,22,14);
  const positions=faceGeometry.attributes.position;
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),y=positions.getY(i)+.61;
    const z=.505*Math.sqrt(Math.max(.20,1-(x/.75)**2-((y-.53)/.99)**2));
    positions.setXYZ(i,x,y,z);
  }
  faceGeometry.computeVertexNormals();
  const face=new THREE.Mesh(faceGeometry,faceMaterial(feeling));face.renderOrder=4;body.add(face);
  const faceCenter=new THREE.Vector3(.006,.64,.49),faceObject=new THREE.Object3D();
  faceObject.position.copy(faceCenter);face.add(faceObject);
  const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=96;
  const ctx=glowCanvas.getContext('2d'),grad=ctx.createRadialGradient(48,48,0,48,48,48);
  grad.addColorStop(0,'rgba(255,159,72,.85)');grad.addColorStop(.27,'rgba(255,99,33,.40)');grad.addColorStop(.64,'rgba(233,69,24,.09)');grad.addColorStop(1,'rgba(158,43,20,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,96,96);
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(glowCanvas),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:.24}));
  glow.position.set(0,.77,-.42);glow.scale.set(3.65,3.55,1);glow.renderOrder=1;body.add(glow);
  const sparkGeometry=new THREE.SphereGeometry(1,6,4), sparkColors=['#fa722b','#ffba57','#f97438'];
  const cinders=new THREE.InstancedMesh(sparkGeometry,new THREE.MeshBasicMaterial({color:'#fff8e8'}),13);
  const sparkPose=new THREE.Object3D();
  cinders.instanceMatrix.setUsage(THREE.DynamicDrawUsage);cinders.frustumCulled=false;group.add(cinders);
  for(let i=0;i<13;i++){
    cinders.setColorAt(i,new THREE.Color(sparkColors[i%3]));
  }
  const light=new THREE.PointLight('#ff9b51',outdoor?2.8:31,outdoor?4.2:9,2);light.position.set(0,.76,.56);body.add(light);
  function update(t,options={}){
    time.value=t;
    const {attention=0,look=0,gazeY=0,blink=0,motion,draftX=0,draftZ=0}=options;
    const gather=motion?.gather||0,stretch=motion?.stretch||0,impact=motion?.impact||0;
    const rebound=motion?.rebound||0,roll=motion?.roll||0,arc=motion?.arc||0;
    if(typeof options.visible==='boolean')group.visible=options.visible;
    feeling.interest.value=attention;feeling.gaze.value=look;feeling.liftGaze.value=gazeY;feeling.closeLids.value=blink;
    body.position.set(.135*attention*look-.042*roll,.015*attention+.023*stretch,.104*attention);
    body.rotation.set(-.075*attention-.049*stretch+.049*impact,.11*attention*look,-.143*attention*look+.092*roll);
    const squash=.232*gather+.238*impact-.247*stretch-.078*rebound-.08*attention;
    body.scale.set(1+.59*squash,1-squash,1+.47*squash);
    draft.value.set(draftX-.44*attention*look-.32*roll,draftZ-.19*stretch);
    face.position.set(Math.sin(t*2.26)*.012,.009*Math.sin(t*3.02),0);face.rotation.z=.019*Math.sin(t*1.56-.5);
    light.intensity=(outdoor?2.8:32)*(1+.061*Math.sin(t*7.2)+.042*Math.sin(t*12.9)+.062*stretch);
    glow.material.opacity=outdoor?.20+.045*arc:.24;
    for(let i=0;i<cinders.count;i++){
      const speed=outdoor?.45+(i%4)*.072:.17+(i%4)*.019;
      const f=THREE.MathUtils.euclideanModulo(t*speed+i*.3991,1);
      const span=.28+.45*f,x=Math.sin(i*23.56+f*4.4)*span+Math.sin(f*6.2+i)*.11;
      sparkPose.position.set(x+draftX*f*.58,1.18+f*(1.12+(i%3)*.22)-.11*stretch,Math.sin(f*4.2+2*i)*.21-.17+draftZ*f*.58);
      if(options.sparkTrail)options.sparkTrail(f/speed,sparkPose.position);
      const fade=f>.045&&f<.93?Math.sin(f*Math.PI)**.88:0;
      const r=(outdoor?.018+(i%3)*.006:.009+(i%3)*.003)*fade;
      sparkPose.scale.set(r,r*(1.68+.41*Math.sin(t*3+i)),r*.69);
      sparkPose.rotation.z=.32*Math.sin(t*2.1+i)+.18*draftX;sparkPose.updateMatrix();
      cinders.setMatrixAt(i,sparkPose.matrix);
    }
    cinders.instanceMatrix.needsUpdate=true;
  }
  update(0);
  return {group,update,faceCenter,anchors:{faceObject}};
}

let fuelMaterials;
function charredWoodMaterials(){
  if(fuelMaterials)return fuelMaterials;
  let seed=18353;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const surface=(width,height)=>{const c=document.createElement('canvas');c.width=width;c.height=height;return c.getContext('2d');};
  const bark=surface(192,192),heat=surface(192,192),end=surface(128,128);
  bark.fillStyle='#62534b';bark.fillRect(0,0,192,192);heat.fillStyle='black';heat.fillRect(0,0,192,192);
  for(let i=0;i<132;i++){
    let x=random()*200-4,y=random()*245-53;
    const dark=random(),length=10+random()*85,path=new Path2D();path.moveTo(x,y);
    for(let j=0;j<length;j+=5){x+=(random()-.5)*3.6;y+=5;path.lineTo(x,y);}
    bark.strokeStyle=dark>.68?'#a19883':dark>.38?'#413a35':'#2a231f';
    bark.lineWidth=.7+random()*2.5;bark.stroke(path);
    if(dark>.81){heat.strokeStyle=dark>.94?'#ffc475':'#d44f27';heat.lineWidth=.7+random()*1.3;heat.stroke(path);}
  }
  end.fillStyle='#a78460';end.fillRect(0,0,128,128);
  for(let r=5;r<86;r+=4+random()*2){
    end.beginPath();
    for(let j=0;j<=52;j++){
      const a=j*Math.PI/26,R=r*(1+.040*Math.cos(4*a+.008*r)+.032*Math.sin(7*a));
      const x=58+Math.cos(a)*R,y=66+Math.sin(a)*R*.94;j?end.lineTo(x,y):end.moveTo(x,y);
    }
    end.strokeStyle=r>46?'#584538':'#7b553c';end.lineWidth=.8+random()*1.2;end.stroke();
  }
  for(let j=0;j<11;j++){
    const a=random()*Math.PI*2,r=13+random()*40;end.beginPath();end.moveTo(58+Math.cos(a)*r,66+Math.sin(a)*r);
    end.lineTo(58+Math.cos(a-.035)*74,66+Math.sin(a-.035)*74);end.lineTo(58+Math.cos(a+.024)*74,66+Math.sin(a+.024)*74);
    end.closePath();end.fillStyle='#32271e';end.fill();
  }
  const texture=ctx=>{const map=new THREE.CanvasTexture(ctx.canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;return map;};
  const barkMap=texture(bark),heatMap=texture(heat);
  fuelMaterials={
    bark:new THREE.MeshStandardMaterial({map:barkMap,color:'#c1a98d',bumpMap:barkMap,bumpScale:.024,
      emissive:'#ff642b',emissiveMap:heatMap,emissiveIntensity:1.22,roughness:.99}),
    end:new THREE.MeshStandardMaterial({map:texture(end),color:'#d7bb92',roughness:.96}),
    pan:new THREE.MeshStandardMaterial({color:'#51423a',metalness:.56,roughness:.67,side:THREE.DoubleSide}),
    lip:new THREE.MeshStandardMaterial({color:'#ad7450',metalness:.62,roughness:.49}),
    coal:new THREE.MeshStandardMaterial({color:'#332723',emissive:'#6e210d',emissiveIntensity:.62,roughness:1}),
  };
  return fuelMaterials;
}

function createFireCarrier(){
  const group=new THREE.Group();group.name='The little hearth pan and its two split pieces of wood';
  const m=charredWoodMaterials();
  const add=(geometry,material)=>{const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;mesh.castShadow=true;group.add(mesh);return mesh;};
  const profile=[[.005,.025],[.44,.025],[.62,.046],[.77,.105],[.85,.185],[.865,.209],
    [.83,.209],[.815,.186],[.744,.133],[.600,.087],[.42,.069],[.005,.069]].map(([x,y])=>new THREE.Vector2(x,y));
  const pan=add(new THREE.LatheGeometry(profile,32),m.pan);pan.scale.z=.71;
  const lip=add(new THREE.TorusGeometry(.850,.018,7,39),m.lip);lip.position.y=.207;lip.rotation.x=Math.PI/2;lip.scale.y=.71;
  for(const side of [-1,1]){
    const ear=add(new THREE.TorusGeometry(.118,.025,7,22),m.pan);
    ear.rotation.x=Math.PI/2+.20;ear.position.set(side*.88,.18,0);ear.scale.set(1,.77,1);
  }
  const up=new THREE.Vector3(0,1,0);
  function log(start,finish,r){
    const a=new THREE.Vector3(...start),b=new THREE.Vector3(...finish),axis=b.clone().sub(a);
    const g=new THREE.CylinderGeometry(r*.91,r,axis.length(),15,6),pos=g.attributes.position;
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),angle=Math.atan2(z,x);
      const f=.98+.085*Math.sin(3*angle+.27)+.046*Math.cos(5*angle+y*1.8);
      pos.setXYZ(i,x*f+.016*Math.sin(y*3.2),y,z*f);
    }
    g.computeVertexNormals();const piece=add(g,[m.bark,m.end,m.end]);
    piece.position.copy(a).lerp(b,.5);piece.quaternion.setFromUnitVectors(up,axis.normalize());
  }
  log([-.69,.230,.13],[.78,.278,.33],.146);
  log([-.58,.206,.30],[.63,.330,-.31],.130);
  const coa=new THREE.IcosahedronGeometry(1,0);
  const lumps=[[-.43,.145,-.20,.14],[.10,.12,-.35,.15],[.29,.16,.05,.16],[-.66,.17,-.04,.12],[.53,.14,-.20,.12]];
  const coal=new THREE.InstancedMesh(coa,m.coal,lumps.length),pose=new THREE.Object3D();
  coal.castShadow=true;coal.receiveShadow=true;group.add(coal);
  lumps.forEach(([x,y,z,r],i)=>{pose.position.set(x,y,z);pose.scale.set(1.33*r,.55*r,r);pose.rotation.y=i*2.4;pose.updateMatrix();coal.setMatrixAt(i,pose.matrix);});
  return group;
}

function fireGroundPatch(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
  const ctx=canvas.getContext('2d'),g=ctx.createRadialGradient(32,32,2,32,32,32);
  g.addColorStop(0,'rgba(33,22,16,.78)');g.addColorStop(.50,'rgba(45,30,21,.35)');g.addColorStop(1,'rgba(45,30,21,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
  const mat=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,opacity:.54,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const patch=new THREE.Mesh(new THREE.PlaneGeometry(2.13,1.49),mat);patch.rotation.x=-Math.PI/2;patch.position.y=.017;return patch;
}

function createTravelCalcifer(){
  const group=new THREE.Group();group.name='Traveling Calcifer';
  const rig=new THREE.Group(),groundObject=new THREE.Object3D(),footObject=new THREE.Object3D();
  const ground=fireGroundPatch();group.add(rig,ground,groundObject);rig.add(footObject);
  rig.add(createFireCarrier());
  const flame=createCalcifer({outdoor:true});flame.group.position.set(.005,.375,-.013);rig.add(flame.group);
  const forward=new THREE.Vector3();
  function update(t,options={}){
    const {action='travel',local=t,energy=1,look=0}=options;
    const carried=action==='carried';
    const motion=carried?(options.carrierMotion||sampleTurnipMotion(local,'travel',energy)):sampleFireMotion(local,action,energy);
    rig.position.y=carried?0:motion.height;
    rig.rotation.set((carried?.020:.082)*(motion.stretch-motion.impact),0,(carried?.023:.13)*motion.roll);
    const drift=carried?.54:.83;
    const relativeHeading=(options.heading??0)-(options.facing??0);
    forward.set(Math.sin(relativeHeading),0,Math.cos(relativeHeading));
    const unit=carried?1/Math.max(.25,group.scale.x):1;
    function sparkTrail(age,p){
      const birth=local-age*.59;
      const earlier=carried?sampleTurnipMotion(birth,motion.action||'travel',energy):sampleFireMotion(birth,action,energy);
      p.addScaledVector(forward,-Math.min(1.45,(motion.distance-earlier.distance)*unit*.72));
      p.y+=THREE.MathUtils.clamp((earlier.height-motion.height)*unit*.65,-.74,.72);
    }
    flame.update(t,{motion,look,attention:options.attention??.23,gazeY:options.gazeY??.22,blink:options.blink??0,
      sparkTrail,draftX:options.draftX??-(.17+.39*motion.arc)*drift,draftZ:options.draftZ??-(.37+.34*motion.stretch)*drift});
    ground.visible=!carried;ground.material.opacity=.54/(1+.88*motion.height);ground.scale.setScalar(1+.34*motion.height);
    return motion;
  }
  update(0);
  return {group,update,anchors:{faceObject:flame.anchors.faceObject,flameObject:flame.group,footObject,groundObject}};
}

export { createCalcifer, createFireCarrier, createTravelCalcifer, sampleFireMotion };
