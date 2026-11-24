import * as THREE from "../vendor/three.module.js";

function createAtmosphere(scene, renderer) {
  const uniforms={time:{value:0},sunDirection:{value:new THREE.Vector3(-.65,.72,.44).normalize()}};
  const mat=new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,uniforms,
    vertexShader:`varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`
    varying vec3 vDirection;uniform float time;uniform vec3 sunDirection;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
    float fbm(vec2 p){float n=0.,a=.5;for(int i=0;i<5;i++){n+=a*noise(p);p=mat2(1.6,1.2,-1.2,1.6)*p+vec2(9.3,13.7);a*=.5;}return n;}
    void main(){
      vec3 r=normalize(vDirection);float y=max(0.,r.y);
      vec3 low=vec3(.53,.73,.79),high=vec3(.065,.33,.60);
      vec3 col=mix(low,high,pow(smoothstep(-.06,.85,r.y),.58));
      float s=pow(max(dot(r,sunDirection),0.),24.);col+=vec3(.19,.14,.07)*s;
      float disk=smoothstep(.99955,.99985,dot(r,sunDirection));col+=vec3(2.4,1.9,1.2)*disk;
      if(r.y>0.02){
        vec2 p=r.xz/(r.y+.12)*1.55+vec2(time*.0009,0.);
        float n=fbm(p),detail=fbm(p*2.25+12.1);
        float cloud=smoothstep(.54,.70,n+detail*.16);
        cloud*=smoothstep(.02,.10,r.y)*(1.-smoothstep(.68,.91,r.y));
        float light=clamp(.68+(fbm(p+vec2(-.08,.15))-n)*3.4+.22*r.y,0.,1.);
        vec3 cc=mix(vec3(.49,.61,.64),vec3(1.12,1.08,.94),light);
        col=mix(col,cc,cloud*.97);
      }
      gl_FragColor=vec4(col,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  });
  const sky=new THREE.Mesh(new THREE.SphereGeometry(1400,32,20),mat);sky.frustumCulled=false;sky.renderOrder=-100;scene.add(sky);
  scene.fog=new THREE.FogExp2('#c2d6ce',.00125);
  const hemi=new THREE.HemisphereLight('#c7dfef','#78825b',1.55);scene.add(hemi);
  const key = new THREE.DirectionalLight('#fff0cd', 2.55);
  key.position.set(-90, 125, 95);
  key.target.position.set(0, 12, 0);
  key.castShadow = true;
  // One fixed projection covers the castle, market roofs, bell tower and
  // lanes throughout the bird's approach. The map also keeps the opening
  // meadow inside the original 150-unit field at comparable texel density.
  const shadow = key.shadow;
  shadow.mapSize.set(2048, 2048);
  Object.assign(shadow.camera, { left: -176, right: 112, top: 88, bottom: -136, near: 20, far: 300 });
  shadow.camera.updateProjectionMatrix();
  shadow.normalBias = .10;
  shadow.bias = -.00012;
  shadow.radius = 3;
  scene.add(key, key.target);
  const fill=new THREE.DirectionalLight('#c0d8ee',.35);fill.position.set(50,30,-100);scene.add(fill);
  // A soft photographic environment keeps aged metals legible from every angle.
  const envScene=new THREE.Scene();envScene.background=new THREE.Color('#b6d5e2');
  const envGeo=new THREE.SphereGeometry(60,24,12);
  const envMat=new THREE.ShaderMaterial({side:THREE.BackSide,vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 p;void main(){vec3 d=normalize(p);vec3 c=mix(vec3(.27,.30,.22),vec3(.63,.78,.87),smoothstep(-.18,.6,d.y));float s=pow(max(0.,dot(d,normalize(vec3(-.6,.8,.4)))),22.);c+=vec3(.75,.65,.42)*s;gl_FragColor=vec4(c,1.);}'});
  envScene.add(new THREE.Mesh(envGeo,envMat));
  const pmrem=new THREE.PMREMGenerator(renderer);const target=pmrem.fromScene(envScene,.04,.1,150);scene.environment=target.texture;scene.environmentIntensity=.65;pmrem.dispose();envGeo.dispose();envMat.dispose();
  return {sky,light:key,environment:target.texture,update(t){uniforms.time.value=t;}};
}

function createSmoke(parent,anchors){
  const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');
  const grad=ctx.createRadialGradient(64,64,5,64,64,62);grad.addColorStop(0,'rgba(255,255,255,.8)');grad.addColorStop(.35,'rgba(255,255,255,.55)');grad.addColorStop(.7,'rgba(255,255,255,.18)');grad.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,128,128);
  const map=new THREE.CanvasTexture(c),puffs=[];
  anchors.forEach((a,stack)=>{
    const pos=Array.isArray(a)?new THREE.Vector3(...a):a.clone();
    for(let i=0;i<18;i++){
      const material=new THREE.SpriteMaterial({map,color:stack%2?'#a5a9a0':'#93978e',transparent:true,opacity:.3,depthWrite:false});
      const sprite=new THREE.Sprite(material);parent.add(sprite);puffs.push({sprite,pos,i,stack});
    }
  });
  const smokeDark=new THREE.Color('#697069'),smokePale=new THREE.Color('#c9c9b8');
  return {update(t){for(const {sprite,pos,i,stack}of puffs){const p=(t*.08+i/18+stack*.13)%1;const drift=Math.sin(i*12.3+stack)*.8; sprite.position.copy(pos).add(new THREE.Vector3(p*14+drift*p,p*20,Math.sin(p*4+stack)*p*2.5));const size=(1.8+p*7)*(1+Math.sin(i*4)*.13);sprite.scale.set(size,size,1);sprite.material.opacity=(1-p)*.34*Math.min(1,p*12);sprite.material.color.copy(smokeDark).lerp(smokePale,p);}}};
}

export { createAtmosphere, createSmoke };
