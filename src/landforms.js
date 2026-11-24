import * as THREE from "../vendor/three.module.js";

const TAU = Math.PI * 2;
const clamp = (v,a=0,b=1) => Math.max(a,Math.min(b,v));
const mix = (a,b,t) => a+(b-a)*t;
function smooth(a,b,x) { const t = clamp((x-a)/(b-a)); return t*t*(3-2*t); }
function prng(seed) {
  let s = seed|0;
  return () => { s = (s + 0x6D2B79F5)|0; let t = Math.imul(s^(s>>>15),1|s); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; };
}
function hash(i,j) {
  let n = Math.imul(i,374761393)+Math.imul(j,668265263)|0;
  n = Math.imul(n^(n>>>13),1274126177);
  return ((n^(n>>>16))>>>0)/4294967295;
}
function noise(x,z) {
  const i=Math.floor(x),j=Math.floor(z);
  let u=x-i,v=z-j; u=u*u*(3-2*u);v=v*v*(3-2*v);
  return mix(mix(hash(i,j),hash(i+1,j),u),mix(hash(i,j+1),hash(i+1,j+1),u),v);
}
function fbm(x,z) {
  return .54*noise(x,z)+.27*noise(x*2.02+7.1,z*2.02-5.3)+.13*noise(x*4.09-19.5,z*4.09+8.4)+.06*noise(x*8.15+32.0,z*8.15+15.2);
}
const LAKE = { x:114, z:-112, y:-3.4, a:77, b:48, angle:.55 };
const lakeCos=Math.cos(LAKE.angle),lakeSin=Math.sin(LAKE.angle);
function shoreRadius(a) {
  return 1+.087*Math.sin(a*3-.9)+.055*Math.sin(a*5+1.2)+.035*Math.cos(a*8+.5)+.016*Math.sin(a*12-.6);
}
function lakeLocal(x,z) {
  const dx=x-LAKE.x,dz=z-LAKE.z;
  return [(lakeCos*dx-lakeSin*dz)/LAKE.a,(lakeSin*dx+lakeCos*dz)/LAKE.b];
}
function lakeDistance(x,z) {
  const dx=x-LAKE.x,dz=z-LAKE.z,u=(lakeCos*dx-lakeSin*dz)/LAKE.a,v=(lakeSin*dx+lakeCos*dz)/LAKE.b;
  return Math.hypot(u,v)/shoreRadius(Math.atan2(v,u));
}
function lakePoint(angle,r) {
  const radius=shoreRadius(angle)*r, u=LAKE.a*Math.cos(angle)*radius,v=LAKE.b*Math.sin(angle)*radius;
  return [LAKE.x+lakeCos*u+lakeSin*v,LAKE.z-lakeSin*u+lakeCos*v];
}
function meadowHeight(x,z) {
  const r=Math.hypot(x,z), amp=1+smooth(92,320,r)*2.6;
  let hills=(fbm(x*.012+8,z*.012+24)-.475)*18 + 2.4*Math.sin(z*.036+x*.019)+1.2*Math.cos(x*.040-z*.023);
  hills=hills*amp + smooth(120,330,r)*(3+8*noise(x*.007+17,z*.006-3));
  hills*=smooth(28,67,r);
  const d=lakeDistance(x,z);
  if(d<1) return LAKE.y - (1-d)*(8+4*(1-d));
  if(d<1.52) return mix(LAKE.y+(d-1)*7.5,hills,smooth(1,1.52,d));
  return hills;
}
const angular=(ang,k,x,z)=>noise(Math.cos(ang)*k+x,Math.sin(ang)*k+z);
const summits=[
  [-2.77,.25,.43,105],[-2.36,.15,.24,68],[-1.73,.32,.22,56],[-1.16,.17,.29,118],
  [-.81,.13,.20,65],[-.25,.25,.17,86],[.39,.31,.19,72],[.84,.20,.38,108],
  [1.69,.36,.18,83],[2.02,.14,.21,61],[2.68,.22,.30,104],
];
function mountainBands(a) {
  const lowC=360+36*Math.sin(a*3+.8)+24*Math.sin(5*a-1.7)+32*(angular(a,9,10,11)-.5);
  const midC=495+43*Math.sin(a*3-.8)+30*Math.cos(6*a+.4)+34*(angular(a,15,4,12)-.5);
  const farC=664+52*Math.sin(a*2-.7)+38*Math.sin(5*a+1.4)+47*(angular(a,13,22,-3)-.5);
  let peak=0;
  for(const [az,w1,w2,amp] of summits){
    const delta=Math.atan2(Math.sin(a-az),Math.cos(a-az)),w=delta>0?w2:w1;
    peak=Math.max(peak,amp*Math.exp(-(Math.abs(delta/w)**1.33)));
  }
  const lo=23+40*angular(a,4,13,24)+16*angular(a,14,4,-4);
  const mi=36+65*angular(a,5,1,17)+34*angular(a,19,-2,3);
  const teeth=angular(a,35,16,-8)*11+angular(a,67,-6,16)*5;
  const far=57+peak+50*angular(a,8,-7,21)+28*angular(a,21,2,-9)+teeth;
  return [lowC,midC,farC,lo,mi,far,a];
}
function mountainHeightFromBands(x,z,r,b) {
  const a=b[6];
  const apron=(center,w,h,p) => h*Math.pow(Math.max(0,1-Math.abs(r-center)/w),p);
  const low=apron(b[0],141,b[3],1.23);
  let mid=apron(b[1],162,b[4],1.13),high=apron(b[2],189,b[5],1.04);
  const brush=fbm(x*.024+32,z*.027-53);
  // Interlocking rock spurs open into glacial couloirs as they descend.
  // Two different frequencies and spatial warps prevent a regular radial fan.
  const distHigh=Math.abs(r-b[2])/189,distMid=Math.abs(r-b[1])/162;
  if(high>0){
    const spread=Math.sin(Math.PI*Math.min(1,distHigh))**.68;
    const wave=.5+.5*Math.sin(a*71+(r-b[2])*.024+5.6*angular(a,10,13,3)+3.3*brush);
    const folds=wave*.62+.38*(1-Math.abs(2*noise(x*.034+brush*3,z*.031-3)-1));
    high+=(folds-.49)*74*spread;
  }
  if(mid>0){
    const spread=Math.sin(Math.PI*Math.min(1,distMid))**.8;
    const ribs=.5+.5*Math.sin(a*54+(r-b[1])*.031+4.6*angular(a,14,3,6)+3.1*brush);
    mid+=(ribs-.5)*34*spread;
  }
  const top=Math.max(low,mid,high);
  return -9+top+(Math.min(low,mid)+Math.min(mid,high))*.13 +(brush-.48)*23*smooth(4,64,top);
}
function mountainAt(x,z) {
  const r=Math.hypot(x,z); if(r<220 || r>966) return -80;
  return mountainHeightFromBands(x,z,r,mountainBands(Math.atan2(z,x)));
}
function heightAt(x,z) {
  const land=meadowHeight(x,z),r=Math.hypot(x,z);
  return r<220||r>966?land:Math.max(land,mountainAt(x,z));
}
const meadowPalette={
  yellow:new THREE.Color('#b9c473'),green:new THREE.Color('#8baa6d'),shade:new THREE.Color('#64916e'),
  dry:new THREE.Color('#c0ba80'),stony:new THREE.Color('#a1a28c'),soil:new THREE.Color('#908e76'),
  worn:new THREE.Color('#b5ad91'),
};
function meadowColor(x,z,c,d=lakeDistance(x,z)){
  const p=meadowPalette,warp=fbm(x*.018-32,z*.015+71);
  const b=fbm(x*.015-38+warp*.87,z*.020+4+warp*.61),f=fbm(x*.027+35+warp*1.5,z*.014-7);
  c.copy(p.shade).lerp(p.green,smooth(.26,.57,b)).lerp(p.yellow,.87*smooth(.35,.67,f));
  const brush=smooth(.43,.70,fbm(x*.035+8+warp*.49,z*.02+67));
  c.lerp(p.dry,.29*brush).multiplyScalar(.978+.053*noise(x*.047-11,z*.053+21));
  c.lerp(p.stony,(1-smooth(1.018,1.13,d))*(.68+.28*noise(x*.15,z*.15)));
  if(d<1)c.lerp(p.soil,.44);
  const west=Math.abs(x+104+Math.sin(z*.052)*2-.04*z),north=Math.abs(z+2);
  const town=(1-smooth(29,43,west+(warp-.5)*6))*(1-smooth(43,62,north+(f-.5)*9));
  c.lerp(p.worn,town*(.71+.24*brush));return c;
}
function texCanvas(w,h,paint,repeat=false) {
  const c=document.createElement('canvas');c.width=w;c.height=h; paint(c.getContext('2d'),w,h);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
  if(repeat) tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  tex.anisotropy=4; return tex;
}

function meadowPaint() {
  return texCanvas(256,256,(ctx,w,h)=>{
    ctx.fillStyle='#e7ead6';ctx.fillRect(0,0,w,h);
    const rnd=prng(4362);
    for(let i=0;i<1100;i++) {
      const x=rnd()*w,y=rnd()*h,ry=1.5+rnd()*6;
      ctx.fillStyle=rnd()<.5?'rgba(113,130,95,.075)':'rgba(248,244,209,.115)';
      ctx.beginPath();ctx.ellipse(x,y,ry*(1.3+rnd()),ry,rnd()*.6,0,TAU);ctx.fill();
    }
    for(let i=0;i<4800;i++){
      const x=rnd()*w,y=rnd()*h,hue=rnd();
      ctx.strokeStyle=hue<.31?'rgba(100,116,73,.19)':hue<.66?'rgba(253,247,202,.44)':'rgba(116,139,89,.27)';
      ctx.lineWidth=.45+rnd()*.8;
      const len=1+rnd()*4;
      ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+len*.23,y-len*.27,x+len*.78,y-len*.52);ctx.stroke();
    }
  },true);
}
function indexedGeometry(pos,idx,colors,uv) {
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);
  if(colors)g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  if(uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.computeVertexNormals();g.computeBoundingSphere();return g;
}
function makeGround(group) {
  const center=[],border=[];for(let i=-45;i<=45;i++)center.push(i*3.3);for(let i=1;i<=10;i++)border.push(148.5+i*6.0);
  const extra=[218,230,246,267,293,326,365,413,473,550,649,775,935];
  const out=border.concat(extra),ax=out.slice().reverse().map(v=>-v).concat(center,out),n=ax.length;
  const p=[],uv=[],col=[],idx=[];
  const c=new THREE.Color();
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const bx=ax[i],bz=ax[j],jit=(Math.abs(bx)+Math.abs(bz)<400)?.52:.9;
    const x=bx+(noise(i*.7,j*.7)-.5)*jit,z=bz+(noise(i*.7+51,j*.7-6)-.5)*jit;
    const y=meadowHeight(x,z);
    meadowColor(x,z,c);
    p.push(x,y,z);uv.push(x*.125,z*.125);col.push(c.r,c.g,c.b);
    if(i>0&&j>0){const a=j*n+i,b0=a-1,c0=a-n,d0=c0-1;
      if((i+j)%2)idx.push(d0,b0,c0,c0,b0,a);else idx.push(d0,a,c0,d0,b0,a);
    }
  }
  const g=indexedGeometry(p,idx,col,uv);
  const m=new THREE.MeshLambertMaterial({vertexColors:true,map:meadowPaint()});
  const o=new THREE.Mesh(g,m);o.name='Rolling alpine meadow and exposed lake bed';o.receiveShadow=true;group.add(o);
}
function cragTexture(){
  const w=512, data=new Uint8Array(w*w*4);
  // Periodic multi-octave erosion field. This data texture is sampled in
  // world space so the rock continues across mesh edges and changes of slope.
  const grid=(x,y,period,off)=>{
    const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j,cl=(k)=>(k%period+period)%period;
    const s=u*u*(3-2*u),t=v*v*(3-2*v);
    return mix(mix(hash(cl(i)+off,cl(j)-off),hash(cl(i+1)+off,cl(j)-off),s),
      mix(hash(cl(i)+off,cl(j+1)-off),hash(cl(i+1)+off,cl(j+1)-off),s),t);
  };
  for(let j=0;j<w;j++)for(let i=0;i<w;i++){
    const x=i/w,z=j/w,warp=grid(x*5,z*5,5,438),u=x+.043*(warp-.5),v=z+.050*(warp-.5);
    const a=grid(u*8,v*8,8,71),b=grid(u*16,v*16,16,711),d=grid(x*41,z*41,41,94);
    const fine=grid(x*95,z*95,95,121);
    const c=.53*a+.27*b+.15*d+.05*fine;
    const seam=Math.abs(Math.sin(TAU*(x*4+z*7)+5.3*a+2*b));
    const k=(j*w+i)*4;data[k]=255*c;data[k+1]=255*(.53*seam+.47*b);data[k+2]=255*(.70*d+.30*fine);data[k+3]=255;
  }
  const texture=new THREE.DataTexture(data,w,w,THREE.RGBAFormat);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
  return texture;
}
function cragSlopes(erosion){
  const {width:w,height:h,data:source}=erosion.image,data=new Uint8Array(w*h*4);
  const relief=(x,y)=>{const k=(((y+h)%h)*w+(x+w)%w)*4;return (source[k]*6.1+source[k+1]*2.6+source[k+2]*.8)/255;};
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4,dx=(relief(x+1,y)-relief(x-1,y))*w*.0046*.5,dy=(relief(x,y+1)-relief(x,y-1))*h*.0046*.5;
    data[i]=Math.round(255*clamp(.5+dx/3));data[i+1]=Math.round(255*clamp(.5+dy/3));data[i+2]=128;data[i+3]=255;
  }
  const tex=new THREE.DataTexture(data,w,h,THREE.RGBAFormat);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.needsUpdate=true;return tex;
}
function makeMountains(group) {
  const n=493,steps=[3,4,3,5,2,3,4,3,2,3,4,5,5,3,2];
  const jmax=steps.reduce((x,y)=>x+y,0),p=[],idx=[],col=[],uv=[],meta=[];
  for(let i=0;i<=n;i++){
    const a=i/n*TAU,b=mountainBands(a);
    // Every ridge and saddle receives its own vertices; accumulation uses
    // actual glacial spurs instead of smoothing across the crest.
    const anchors=[221,b[0]-78,b[0]-25,b[0],b[0]+40,(b[0]+b[1])*.5,b[1]-34,b[1],b[1]+37,(b[1]+b[2])*.5,b[2]-53,b[2]-21,b[2],b[2]+54,847,965];
    anchors.sort((a,b)=>a-b);let j=0;
    const put=r=>{
      const x=Math.cos(a)*r,z=Math.sin(a)*r,y=mountainHeightFromBands(x,z,r,b);
      p.push(x,y,z);uv.push(x*.007,z*.007);meta.push([x,y,z,r]);
      if(i&&j){const q=i*(jmax+1)+j,h=q-(jmax+1);idx.push(h-1,q-1,h,h,q-1,q);}
      j++;
    };
    put(anchors[0]);
    for(let k=0;k<steps.length;k++)for(let v=1;v<=steps[k];v++)put(mix(anchors[k],anchors[k+1],v/steps[k]));
  }
  const g=indexedGeometry(p,idx,null,uv),norm=g.attributes.normal;
  const v=new THREE.Color(),low=new THREE.Color('#799578'),near=new THREE.Color('#78908c'),rock=new THREE.Color('#566e83'),lightRock=new THREE.Color('#8e9daa'),meadow=new THREE.Color();
  for(let i=0;i<meta.length;i++) {
    const [x,y,z,r]=meta[i],ny=Math.abs(norm.getY(i)),grain=fbm(x*.030-4,z*.030+15);
    const rocky=smooth(37,104,y+(grain-.50)*34+(1-ny)*29);
    v.copy(low).lerp(near,smooth(290,526,r)*.86).lerp(rock,rocky).lerp(lightRock,smooth(.4,.82,grain)*rocky*.39);
    v.multiplyScalar(.95+.09*noise(x*.060+2,z*.052-13));
    const elevation=y-meadowHeight(x,z);
    meadowColor(x,z,meadow).multiplyScalar(.79);
    v.lerp(meadow,1-smooth(0,40,elevation));col.push(v.r,v.g,v.b);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  const mat=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.FrontSide});
  const erosion=cragTexture(),slopeMap=cragSlopes(erosion);
  mat.onBeforeCompile=s=>{
    s.uniforms.uCrag={value:erosion};s.uniforms.uCragSlope={value:slopeMap};
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vCragPos;varying vec3 vCragN;').replace('#include <begin_vertex>','#include <begin_vertex>\nvCragPos=position;vCragN=normal;');
    s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D uCrag;uniform sampler2D uCragSlope;varying vec3 vCragPos;varying vec3 vCragN;').replace('#include <color_fragment>',`#include <color_fragment>
      vec3 normalTerrain=normalize(vCragN);
      vec2 mal=vCragPos.xz*.0046+vec2(vCragPos.y*.0014,-vCragPos.y*.0027);
      vec3 erosion=texture2D(uCrag,mal).rgb;
      vec3 fineStone=texture2D(uCrag,mal*2.09+vec2(.31,-.27)).rgb;
      float heightZone=smoothstep(57.,141.,vCragPos.y);
      float snowLine=smoothstep(80.,158.,vCragPos.y+(erosion.r-.5)*61.);
      float rockFaces=.84*(erosion.r-.5)+.43*(erosion.g-.5)+.23*(fineStone.g-.5);
      rockFaces+=(1.-normalTerrain.y)*.72+normalTerrain.x*.17;
      float bareRock=smoothstep(.105,.315,rockFaces);
      float snowCover=snowLine*(1.-bareRock*.91);
      float valleySnow=smoothstep(.60,.78,erosion.r*.59+(1.-erosion.g)*.41)*heightZone;
      snowCover=max(snowCover,valleySnow*.89);
      vec3 crag=diffuseColor.rgb*mix(1.,mix(.67,1.24,erosion.r)*mix(.82,1.16,fineStone.b),smoothstep(18.,88.,vCragPos.y));
      float reliefMask=heightZone*(1.-snowCover*.78);
      vec3 snow=mix(vec3(.45,.58,.70),vec3(.93,.95,.94),clamp(.31+.48*normalTerrain.y-.35*normalTerrain.x+.20*fineStone.r,0.,1.));
      diffuseColor.rgb=mix(crag,snow,clamp(snowCover,0.,1.));
    `);
    s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      vec2 grad=(texture2D(uCragSlope,mal).rg-.5)*3.;
      grad+=(texture2D(uCragSlope,mal*2.09+vec2(.31,-.27)).rg-.5)*.71;
      vec3 stoneNormal=normalize(normalTerrain-vec3(grad.x,0.,grad.y)*(.74*reliefMask*max(.35,normalTerrain.y)));
      normal=normalize(mat3(viewMatrix)*stoneNormal);
    `);
    s.fragmentShader=s.fragmentShader.replace('#include <fog_fragment>',THREE.ShaderChunk.fog_fragment.replace('vFogDepth * vFogDepth','vFogDepth * vFogDepth * 0.53'));
  };
  const mesh=new THREE.Mesh(g,mat);mesh.name='Alpine foothills, cirques and snow fields';group.add(mesh);
}
function panoramaTexture(group){
  const w=1536,h=224,data=new Uint8Array(w*h*4),trees=new Float32Array(w),treeLight=new Float32Array(w);
  trees.fill(-1);
  for(const mesh of group.children){
    if(!mesh.isInstancedMesh||!(mesh.name.startsWith('Norway spruce')||mesh.name.startsWith('Distant conifer')))continue;
    const m=mesh.instanceMatrix.array;
    for(let j=0;j<mesh.count;j++){
      const k=j*16,dx=m[k+12]-LAKE.x,dz=m[k+14]-LAKE.z,dist=Math.hypot(dx,dz);
      if(dist<18||dist>330)continue;
      const hi=Math.hypot(m[k+4],m[k+5],m[k+6]),az=(Math.atan2(dz,dx)/TAU+.5)*w,rad=w/TAU*Math.atan2(hi*.25,dist);
      for(let c=Math.floor(az-rad);c<=Math.ceil(az+rad);c++){
        const u=Math.abs(c-az)/Math.max(.45,rad);
        if(u>1)continue;
        const crown=hi*(.28+.75*(1-u)**.69),top=Math.atan2(m[k+13]+crown-LAKE.y,dist),i=(c%w+w)%w;
        if(top>trees[i]){trees[i]=top;treeLight[i]=noise(dx*.17,dz*.17);}
      }
    }
  }
  const sky1=[161,199,210],sky2=[103,172,199],farStone=[132,158,168],snow=[206,219,219],foothill=[109,142,132],shore=[88,118,98];
  for(let i=0;i<w;i++){
    const a=(i/w-.5)*TAU,dx=Math.cos(a),dz=Math.sin(a);let fore=-1,mid=-1,back=-1,top=0;
    for(let s=12;s<890;s+=s<225?9:17){
      const x=LAKE.x+s*dx,z=LAKE.z+s*dz;
      const elev=heightAt(x,z);
      const angle=Math.atan2(elev-LAKE.y,s);
      if(s<205)fore=Math.max(fore,angle);else if(s<490)mid=Math.max(mid,angle);else if(angle>back){back=angle;top=elev;}
    }
    for(let j=0;j<h;j++){
      const elevation=(j/(h-1))*.73-.025;
      let color;
      if(elevation<fore)color=shore;
      else if(elevation<trees[i]){const q=treeLight[i];color=[75+q*13,104+q*14,99+q*10];}
      else if(elevation<mid)color=foothill;
      else if(elevation<back){
        const q=smooth(.61,1,elevation/Math.max(.001,back))*smooth(83,179,top);
        color=farStone.map((v,k)=>mix(v,snow[k],q));
      } else {
        const q=smooth(.008,.68,elevation);color=sky1.map((v,k)=>mix(v,sky2[k],q));
      }
      const k=(j*w+i)*4;data[k]=color[0];data[k+1]=color[1];data[k+2]=color[2];data[k+3]=255;
    }
  }
  const tex=new THREE.DataTexture(data,w,h,THREE.RGBAFormat);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=THREE.RepeatWrapping;tex.magFilter=tex.minFilter=THREE.LinearFilter;tex.needsUpdate=true;return tex;
}
function makeLake(group,time) {
  const pos=[LAKE.x,LAKE.y,LAKE.z],uv=[0,0],idx=[],steps=160;
  for(let j=1;j<=4;j++)for(let i=0;i<steps;i++){
    const a=i/steps*TAU,r=1.09*j/4,[x,z]=lakePoint(a,r);pos.push(x,LAKE.y,z);uv.push(r,0);
    const here=1+(j-1)*steps+i,next=1+(j-1)*steps+(i+1)%steps;
    if(j===1)idx.push(0,next,here);else{const old=here-steps,onext=next-steps;idx.push(old,onext,here,onext,next,here);}
  }
  const g=indexedGeometry(pos,idx,null,uv);
  const uniforms=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uPanorama:{value:null},uSeconds:{value:0}}]);
  uniforms.uPanorama.value=panoramaTexture(group);uniforms.uSeconds=time;
  const mat=new THREE.ShaderMaterial({uniforms,fog:true,vertexShader:`
    #include <common>
    #include <fog_pars_vertex>
    varying vec3 vP; varying float vShore;
    void main(){vP=(modelMatrix*vec4(position,1.)).xyz;vShore=uv.x;
      vec4 mvPosition=viewMatrix*vec4(vP,1.);gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
    }`,fragmentShader:`
    #include <common>
    #include <fog_pars_fragment>
    uniform sampler2D uPanorama;uniform float uSeconds;
    varying vec3 vP;varying float vShore;
    float h(vec2 p){return fract(sin(dot(p,vec2(97.41,31.87)))*43758.5453);}
    float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
    void main(){
      vec2 k=vP.xz;
      float swell=sin(k.y*.40+k.x*.145+uSeconds*.88+1.9*n(k*.078));
      float r=sin(k.y*2.9+k.x*.82-uSeconds*1.75+2.9*n(k*.46));
      float r2=sin(k.y*5.10-k.x*.73+uSeconds*2.02+2.1*n(k*.66));
      vec3 normal=normalize(vec3(.005*swell+.004*r2,1.,.008*swell+.005*r+.0027*r2));
      vec3 eye=normalize(cameraPosition-vP);
      vec3 ray=reflect(-eye,normal);
      vec2 puv=vec2(atan(ray.z,ray.x)/6.2831853+.5,(asin(clamp(ray.y,-1.,1.))+.025)/.73);
      vec3 sky=texture2D(uPanorama,puv).rgb;
      float f=pow(1.-max(dot(eye,normal),0.),3.);
      float littoral=smoothstep(.73,1.025,vShore);
      vec3 subsurface=mix(vec3(.070,.214,.267),vec3(.172,.288,.253),littoral);
      sky=mix(sky,vec3(.290,.476,.573),.13);
      vec3 color=mix(subsurface,sky,.46+.45*f);
      float silver=smoothstep(.89,1.,r*.69+r2*.31)*smoothstep(.48,.83,n(k*vec2(.105,.49)+vec2(uSeconds*.08,0.)));
      color*=1.+.016*swell+.012*(n(k*vec2(.057,.153))-.5);
      color+=vec3(.107,.119,.105)*silver;
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`});
  const m=new THREE.Mesh(g,mat);m.name='Alpine tarn with a reflected mountain panorama';group.add(m);
}

export { TAU, clamp, mix, smooth, prng, noise, fbm, LAKE, lakeLocal, lakeDistance, heightAt, makeGround, makeMountains, makeLake, texCanvas };
