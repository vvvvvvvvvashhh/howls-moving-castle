import { rigAt, castleCenter } from "./ending.js";

export function createClosingStage(h, THREE) {
  const s = new THREE.Scene();
  s.name = 'The flight across one valley';
  s.environment = h.scene.environment;
  s.environmentIntensity = .6;
  s.fog = new THREE.Fog(0xe5ccae, 108, 640);
  const toColor = (arr, out = new THREE.Color()) => out.setRGB(arr[0], arr[1], arr[2], THREE.SRGBColorSpace);
  const step = (a,b,x) => THREE.MathUtils.smootherstep(x,a,b);
  const city = h.journey.stateForFilm('city').root;
  const sand = h.journey.stateForFilm('desert').root;
  const sky = h.journey.stateForFilm('sky').root;
  const field = h.land.group.getObjectByName('Rolling alpine meadow and exposed lake bed');
  const desertSource = sand.getObjectByName('Continuous terrain and unbroken foot contact');
  if (field && desertSource) {
    const g=field.geometry.clone(),terrain=new THREE.Mesh(g,field.material);
    terrain.name='One valley from sand to green pasture';terrain.receiveShadow=true;
    const pos=g.attributes.position,col=g.attributes.color,base=pos.clone(),dune=pos.clone(),pigment=col.clone();
    const sp=desertSource.geometry.attributes.position,sc=desertSource.geometry.attributes.color;
    const xs=[],zs=[];for(let i=0;i<sp.count;i++){const x=sp.getX(i),z=sp.getZ(i);if(!i||x!==sp.getX(i-1))xs.push(x);if(i===0||x===sp.getX(0))zs.push(z);}
    const find=(values,x)=>{let lo=0,hi=values.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(values[m]>x)hi=m;else lo=m;}return lo;};
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i),z=pos.getZ(i),ix=find(xs,x),iz=find(zs,z),
        a=THREE.MathUtils.clamp((x-xs[ix])/(xs[ix+1]-xs[ix]),0,1),b=THREE.MathUtils.clamp((z-zs[iz])/(zs[iz+1]-zs[iz]),0,1);
      const k=ix*zs.length+iz;
      const bi=(attr,n)=>{const ar=attr.array,sz=attr.itemSize,at=(j)=>ar[j*sz+n];return (1-a)*((1-b)*at(k)+b*at(k+1))+a*((1-b)*at(k+zs.length)+b*at(k+zs.length+1));};
      const fade=step(210,510,Math.max(Math.abs(x),Math.abs(z)));
      const horizon=1-.74*step(170,560,Math.max(Math.abs(x),Math.abs(z)))*step(90,290,z);
      base.setY(i,pos.getY(i)*horizon);
      let dh=THREE.MathUtils.lerp(bi(sp,1),pos.getY(i),fade)*horizon;
      if(Math.abs(x)<=17 && Math.abs(z)<=24)dh=0;
      dune.setY(i,dh);pigment.setXYZ(i,bi(sc,0),bi(sc,1),bi(sc,2));
    }
    g.setAttribute('position',dune);g.computeVertexNormals();const dn=g.attributes.normal.clone();
    g.setAttribute('position',base);g.computeVertexNormals();g.morphAttributes.position=[dune];g.morphAttributes.normal=[dn];g.morphAttributes.color=[pigment];g.computeBoundingSphere();terrain.updateMorphTargets();
    s.add(terrain);s.userData.field=terrain;
  }
  const settlement = new THREE.Group();settlement.name='Western bridge town';settlement.position.set(-70,0,-46);settlement.scale.setScalar(.74);
  const lightsInTown = { value: 0 };
  const nightTown = h.journey.stateForFilm('night').root;
  for (const original of city.children) {
    if (!/limewashed|tiled roofs|arched stone|masonry trim|shuttered windows|tower clocks/i.test(original.name)) continue;
    const part = original.clone();
    if (/shuttered windows|tower clocks/i.test(original.name)) {
      const lighted = nightTown.getObjectByName(original.name).material.map;
      part.material = original.material.clone();
      part.material.onBeforeCompile = shader => {
        shader.uniforms.eveningMap = { value: lighted };
        shader.uniforms.windowGlow = lightsInTown;
        shader.fragmentShader = 'uniform sampler2D eveningMap;\nuniform float windowGlow;\n' + shader.fragmentShader;
        const blended = THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )',
          'mix(texture2D(map, vMapUv), texture2D(eveningMap, vMapUv), windowGlow)');
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', blended);
      };
      part.material.customProgramCacheKey = () => 'painted-dusk-casements';
    }
    settlement.add(part);
  }
  s.add(settlement);
  const rock=sand.getObjectByName('Stratified sandstone buttes and wind-cut fins');
  if(rock){const b=rock.clone();b.position.x-=45;b.position.z-=66;b.scale.y=.77;s.add(b);}
  const meadow=new THREE.Group();meadow.name='Highland meadow reached at dawn';s.add(meadow);
  const mt=new THREE.Matrix4(),ct=new THREE.Color();
  for(const o of h.land.group.children){
    if(o===field)continue;
    if(/foothills/i.test(o.name)){const r=o.clone();r.scale.y*=.38;r.position.y-=3;meadow.add(r);continue;}
    if(!/tarn|wildflower|meadow blades|glacial granite|spruce|conifer|lichen|orchard|broadleaf|individual petals/i.test(o.name))continue;
    const p=o.clone();
    if(p.isInstancedMesh){
      const allowed=[];
      for(let i=0;i<o.count;i++){
        o.getMatrixAt(i,mt);const x=mt.elements[12],z=mt.elements[14];
        const valley=z+.28*x+11*Math.sin(x*.046);
        const fraction=step(-25,52,valley);
        const hash=(Math.sin(i*127.1+o.geometry.attributes.position.count)*43758.5453)%1;
        if(Math.abs(hash)<fraction || Math.abs(x)>136)allowed.push(i);
      }
      p.count=allowed.length;
      allowed.forEach((old,i)=>{o.getMatrixAt(old,mt);p.setMatrixAt(i,mt);if(o.instanceColor){o.getColorAt(old,ct);p.setColorAt(i,ct);}});
      const custom=Object.entries(o.geometry.attributes).filter(([,a])=>a.isInstancedBufferAttribute);
      if(custom.length){p.geometry=o.geometry.clone();for(const [name,a] of custom){
        const arr=new a.array.constructor(allowed.length*a.itemSize);allowed.forEach((old,i)=>arr.set(a.array.subarray(old*a.itemSize,(old+1)*a.itemSize),i*a.itemSize));
        p.geometry.setAttribute(name,new THREE.InstancedBufferAttribute(arr,a.itemSize,a.normalized));
      }}
    }
    meadow.add(p);
  }
  const winds=sky.getObjectByName('Slow cloud drift');
  const cloudGroup=winds?winds.clone():new THREE.Group();cloudGroup.name='Thin distant moving cloud layers';s.add(cloudGroup);
  const clouds = [];
  cloudGroup.traverse(object => {
    if (!object.isMesh) return;
    const source = object.material, film = source.clone();
    film.onBeforeCompile = source.onBeforeCompile;
    film.customProgramCacheKey = source.customProgramCacheKey;
    object.material = film;
    clouds.push({ film, opacity: source.opacity });
  });
  const white = new THREE.Color(1,1,1), cloudColor = new THREE.Color();
  // All clouds kept here are original distant transparent paint cards. The
  // highland remains visible under the aircraft and the companions' shadows.
  const color=new THREE.Color();
  const u={low:{value:new THREE.Color()},mid:{value:new THREE.Color()},high:{value:new THREE.Color()},
    light:{value:new THREE.Color()},sunDir:{value:new THREE.Vector3()},stars:{value:0},disc:{value:0}};
  const dome=new THREE.Mesh(new THREE.SphereGeometry(1100,38,24),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:u,
    vertexShader:'varying vec3 ray;void main(){ray=mat3(modelMatrix)*position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 ray;uniform vec3 low,mid,high,light,sunDir;uniform float stars,disc;
    float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,91.4)))*43758.5453);}
    void main(){vec3 r=normalize(ray);vec3 sky=mix(low,mid,smoothstep(-.03,.31,r.y));sky=mix(sky,high,smoothstep(.14,.80,r.y));
    vec3 g=r*230.;vec3 cell=floor(g);float pin=1.-smoothstep(.07,.31,length(fract(g)-.5));
    sky+=vec3(.66,.75,.96)*pin*step(.982,hash(cell))*stars*smoothstep(.006,.2,r.y);
    float dist=acos(clamp(dot(r,normalize(sunDir)),-1.,1.));float core=1.-smoothstep(.0067,.0088,dist);
    sky+=light*disc*(core*3.25+exp(-dist*dist/.0014)*.87+exp(-dist*dist/.014)*.28);
    gl_FragColor=vec4(sky,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`}));
  dome.renderOrder=-100;dome.frustumCulled=false;s.add(dome);
  const hemi=new THREE.HemisphereLight(0xf2dfce,0xa1885e,1.05),key=new THREE.DirectionalLight(0xffe0aa,2.5),moon=new THREE.DirectionalLight(0xbad7f9,0);
  key.castShadow=true;Object.assign(key.shadow.camera,{left:-62,right:62,top:67,bottom:-48,near:5,far:310});key.shadow.mapSize.set(1024,1024);key.shadow.normalBias=.065;key.shadow.bias=-.00012;
  s.add(hemi,key,key.target,moon,moon.target);
  const parts=[];h.castle.group.traverse(o=>{if(/wall lantern|storm vane|lookout mast|riveted flue/i.test(o.name))parts.push({o,base:o.rotation.clone(),stack:/flue/i.test(o.name)});});
  const effects=createTakeoffDust(s,THREE);
  return {scene:s,reset(){for(const {o,base,stack} of parts)if(!stack)o.rotation.copy(base);},update(d){
    const t=d.t,w=d.sky;const center=d.castle.position;
    const f=s.userData.field;if(f)f.morphTargetInfluences[0]=1-step(43.4,55.38,t);
    cloudGroup.position.set((t-40)*1.6,0,-.48*(t-40));
    dome.position.fromArray(d.camera.position);toColor(w.horizon,u.low.value);toColor(w.midSky,u.mid.value);toColor(w.zenith,u.high.value);
    toColor(w.sunColor,u.light.value);u.sunDir.value.fromArray(w.sunDirection);u.stars.value=w.stars;u.disc.value=w.dawnDisc;
    lightsInTown.value=w.windowGlow;
    cloudColor.copy(u.mid.value).lerp(u.low.value,.53).lerp(white,.43*(1-step(.12,.77,w.stars)));
    for(const {film,opacity} of clouds){
      film.color.copy(cloudColor);
      film.opacity=opacity*(.69+.31*step(.13,1.9,w.sunPower));
    }
    s.fog.color.copy(u.low.value);s.environmentIntensity=.22+.53*w.ambient;
    hemi.color.copy(u.low.value).lerp(color.set(0xe8efff),.24);hemi.groundColor.set(0x98a276);hemi.intensity=.48+w.ambient*1.16;
    key.target.position.set(center[0],center[1]+17,center[2]);key.position.copy(key.target.position).addScaledVector(u.sunDir.value,140);
    toColor(w.sunColor,key.color);key.intensity=w.sunPower;
    moon.target.position.copy(key.target.position);moon.position.fromArray(w.moonDirection).multiplyScalar(130).add(moon.target.position);toColor(w.moonColor,moon.color);moon.intensity=w.moonPower;
    for(let i=0;i<parts.length;i++){
      const {o,base,stack}=parts[i],delay=.11+(i%5)*.046,old=rigAt(Math.max(40,t-delay));
      const sag=(old.roll-d.rig.roll)*(.50+(i%3)*.18);
      const age=Math.max(0,t-44.09-i%3*.045),jolt=t>44.09+i%3*.045?Math.sin(age*(9+i%3))*Math.exp(-age*.99):0;
      if(stack){o.rotation.z+=sag*.55+jolt*.034;o.rotation.x+=(old.pitch-d.rig.pitch)*.45;}
      else{o.rotation.z=base.z+sag+jolt*(.075+.022*(i%4));o.rotation.x=base.x+(old.pitch-d.rig.pitch)*.53;}
    }
    effects.update(d);
  }};
}

function createTakeoffDust(scene,THREE){
  const list=[];let seed=311182;const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
  function burst(type,time,side,count,index=0){
    for(let j=0;j<count;j++){
      const birth=time+random()*(type===0?.18:.27),root=castleCenter(birth),a=random()*Math.PI*2,rand=random();
      const footZ=[6.4,6.4,-5.57,-5.57][index];const p=type===0?[side*12.4,14.6,-1.4]:type===1?[side*10.3,.16,footZ]:[side*(5+7*random()),11+5*random(),-3-6*random()];
      let v,life,size,opacity,color;
      if(type===0){v=[side*(8+9*rand),1.3+4*random(),-2+4*random()];life=.68+.7*random();size=.65+.8*rand;opacity=.52;color=[.76,.78,.71];}
      else if(type===1){v=[Math.cos(a)*(2.5+6.2*rand),.9+1.6*random(),Math.sin(a)*(2.2+5.8*rand)];life=.65+.78*random();size=.45+1.2*rand;opacity=.55;color=[.63,.47,.32];}
      else{v=[side*(.6+1.8*rand),-.3-1.7*random(),-2-4*rand];life=.62+1.25*random();size=.10+.17*rand;opacity=.86;color=[.32,.23,.16];}
      list.push({birth,life,p:p.map((n,i)=>n+root[i]),v,size,opacity,color,type,spin:random()*6.28});
    }
  }
  burst(0,43.68,1,26);burst(0,43.94,-1,24);
  [[44.03,1,1],[44.15,-1,0],[44.28,-1,2],[44.40,1,3]].forEach(([t,s,i])=>burst(1,t+.05,s,17,i));
  for(const [t,si] of [[44.45,1],[46.15,-1],[47.35,1],[49.45,-1],[51.80,1],[54.1,-1]])burst(2,t,si,15);
  const n=list.length,p=new Float32Array(n*3),c=new Float32Array(n*3),a=new Float32Array(n),r=new Float32Array(n),spin=new Float32Array(n),g=new THREE.BufferGeometry();
  list.forEach((q,i)=>{c.set(q.color,i*3);spin[i]=q.spin;});g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setAttribute('tint',new THREE.BufferAttribute(c,3));g.setAttribute('strength',new THREE.BufferAttribute(a,1));g.setAttribute('radius',new THREE.BufferAttribute(r,1));g.setAttribute('spin',new THREE.BufferAttribute(spin,1));
  const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{pixelFactor:{value:720}},
   vertexShader:`attribute vec3 tint;attribute float strength,radius,spin;uniform float pixelFactor;varying vec3 col;varying float op;varying float phase;void main(){col=tint;op=strength;phase=spin;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(radius*pixelFactor/max(1.,-mv.z),0.,78.);}`,
   fragmentShader:`varying vec3 col;varying float op;varying float phase;void main(){vec2 d=gl_PointCoord-.5;float a=atan(d.y,d.x);float radial=length(d)*(1.+.13*sin(a*3.+phase)+.07*cos(a*5.-phase));float transparency=1.-smoothstep(.08,.50,radial);if(op*transparency<.01)discard;gl_FragColor=vec4(col,op*transparency);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
   }`});
  const points=new THREE.Points(g,mat);points.name='Short valve plumes, dust from four shoes and falling rust';points.frustumCulled=false;scene.add(points);
  return{update(d){const t=d.t;points.visible=t>=43.68&&t<56.5;if(!points.visible)return;
    mat.uniforms.pixelFactor.value=window.innerHeight/Math.tan(d.camera.fovY*Math.PI/360);
    list.forEach((q,i)=>{const age=t-q.birth,u=age/q.life;if(u<0||u>=1){a[i]=0;r[i]=0;return;}const k=i*3;
      p[k]=q.p[0]+q.v[0]*age;p[k+1]=q.p[1]+q.v[1]*age+(q.type===2?-3.8:q.type===1?-.4:.7)*age*age;p[k+2]=q.p[2]+q.v[2]*age-.38*age*age;
      r[i]=q.size*(q.type===2?1:.73+u*2.2);a[i]=q.opacity*Math.min(1,age*15)*(1-u)*(1-u);
    });g.attributes.position.needsUpdate=g.attributes.strength.needsUpdate=g.attributes.radius.needsUpdate=true;
  }};
}
