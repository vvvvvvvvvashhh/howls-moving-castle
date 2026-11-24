import * as THREE from "../vendor/three.module.js";
import { TAU, clamp, mix, smooth, noise, fbm, prng, texCanvas } from "./landforms.js";


const pick=(list,r)=>list[Math.floor(r()*list.length)];
const between=(r,a,b)=>a+(b-a)*r();
const colorCache=new Map();
function ink(value){
  if(value?.isColor)return value;
  if(!colorCache.has(value))colorCache.set(value,new THREE.Color(value));
  return colorCache.get(value);
}
function makeGeometry(p,index,c,uv){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  if(c)g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));
  if(uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  if(index)g.setIndex(index);g.computeVertexNormals();g.computeBoundingSphere();return g;
}
const zeroUV=[[0,0],[1,0],[1,1],[0,1]];
class Faces{
  constructor(){this.p=[];this.c=[];this.uv=[];this.i=[];}
  face(points,col,uv=zeroUV){
    const base=this.p.length/3;
    for(let k=0;k<points.length;k++){
      const p=points[k],c=ink(Array.isArray(col)?col[k]:col);
      this.p.push(p[0],p[1],p[2]);this.c.push(c.r,c.g,c.b);
      this.uv.push(uv[k]?.[0]||0,uv[k]?.[1]||0);
    }
    for(let k=2;k<points.length;k++)this.i.push(base,base+k-1,base+k);
  }
  box(x,y,z,w,h,d,col,rotation=0){
    const co=Math.cos(rotation),si=Math.sin(rotation),world=(a,b,c)=>[x+a*co+c*si,y+b,z-a*si+c*co];
    let A=-w/2,B=w/2,C=-d/2,D=d/2;
    const p=[world(A,0,C),world(B,0,C),world(B,0,D),world(A,0,D),world(A,h,C),world(B,h,C),world(B,h,D),world(A,h,D)];
    for(const f of [[3,2,6,7],[1,0,4,5],[2,1,5,6],[0,3,7,4],[7,6,5,4]]){
      this.face(f.map(i=>p[i]),col);
    }
  }
  tube(a,b,r0,r1,col,n=7){
    const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),axis=q.clone().sub(p).normalize();
    const side=new THREE.Vector3(Math.abs(axis.y)>.88?1:0,Math.abs(axis.y)>.88?0:1,0).cross(axis).normalize(),cross=axis.clone().cross(side);
    const ring=(t,center,radius)=>center.clone().addScaledVector(side,Math.cos(t)*radius).addScaledVector(cross,Math.sin(t)*radius).toArray();
    for(let i=0;i<n;i++){
      const t=TAU*i/n,u=TAU*(i+1)/n;
      this.face([ring(t,p,r0),ring(u,p,r0),ring(u,q,r1),ring(t,q,r1)],col);
    }
  }
  build(parent,name,material=null){
    if(!this.p.length)return null;
    const mesh=new THREE.Mesh(makeGeometry(this.p,this.i,this.c,this.uv),material||new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide}));
    mesh.name=name;parent.add(mesh);return mesh;
  }
}

function sheet(w,h,paint){
  return texCanvas(w*2,h*2,(ctx)=>{
    for(let i=0;i<4;i++){
      ctx.save();ctx.translate(i%2*w,Math.floor(i/2)*h);ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();
      paint(ctx,w,h,i);ctx.restore();
    }
  });
}
function cardGeom(tiers=1){
  const p=[],u=[],idx=[];
  for(let j=0;j<=tiers;j++){
    const y=j/tiers;p.push(0,y,.5,0,y,-.5);u.push(0,y,1,y);
    if(j){const k=2*j;idx.push(k-2,k-1,k,k-1,k+1,k);}
  }
  const g=makeGeometry(p,idx,null,u);return g;
}
function cutouts(parent,name,map,items,time,options={}){
  if(!items.length)return;
  const wind=options.wind||0,atlas=options.atlas!==false,geom=cardGeom(wind?3:1);
  if(atlas){
    const tiles=new Float32Array(items.length*2);
    items.forEach((p,i)=>{const q=p[6]||0;tiles[i*2]=q%2;tiles[i*2+1]=1-Math.floor(q/2);});
    geom.setAttribute('instanceCell',new THREE.InstancedBufferAttribute(tiles,2));
  }
  const material=new THREE.MeshBasicMaterial({map,alphaTest:options.cut??.27,side:THREE.DoubleSide,
      depthWrite:options.blend?false:true,transparent:!!options.blend,opacity:options.opacity??1,fog:options.fog!==false});
  material.onBeforeCompile=shader=>{
    shader.uniforms.uJourneyTime=time;
    const more=(atlas?'attribute vec2 instanceCell;':'')+'uniform float uJourneyTime;';
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+more);
    if(atlas)shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n vMapUv = (vMapUv*.982+vec2(.009)+instanceCell)*.5;');
    if(wind)shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n float a=instanceMatrix[3].z*.17+instanceMatrix[3].x*.12; transformed.z+='+wind.toFixed(4)+'*position.y*position.y*(sin(uJourneyTime*1.23+a)+.42*sin(uJourneyTime*1.91-a*.65));');
  };
  material.customProgramCacheKey=()=>['journeyCard',atlas,wind].join('_');
  const mesh=new THREE.InstancedMesh(geom,material,items.length),tmp=new THREE.Object3D(),c=new THREE.Color();
  for(let i=0;i<items.length;i++){
    const [x,y,z,w,h,angle=0,,tint='#ffffff',flip=false]=items[i];
    tmp.position.set(x,y,z);tmp.rotation.set(0,angle,0);tmp.scale.set(1,h,w*(flip?-1:1));tmp.updateMatrix();
    mesh.setMatrixAt(i,tmp.matrix);mesh.setColorAt(i,c.set(tint));
  }
  mesh.name=name;mesh.frustumCulled=false;if(options.order)mesh.renderOrder=options.order;parent.add(mesh);return mesh;
}
function cachedMap(key,make){
  if(!textureCache.has(key))textureCache.set(key,make());
  return textureCache.get(key);
}
const textureCache=new Map();
function ellipse(ctx,x,y,rx,ry,rot,fill){
  ctx.fillStyle=fill;ctx.beginPath();ctx.ellipse(x,y,Math.max(.01,rx),Math.max(.01,ry),rot,0,TAU);ctx.fill();
}
function groundSpots(parent,items,color='#635f48',opacity=.30){
  if(!items.length)return;
  const map=cachedMap('soft shadow',()=>texCanvas(96,96,(c)=>{
    const g=c.createRadialGradient(48,48,2,48,48,47);g.addColorStop(0,'rgba(255,255,255,.85)');g.addColorStop(.40,'rgba(255,255,255,.57)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(0,0,96,96);
  }));
  const geo=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),material=new THREE.MeshBasicMaterial({color,map,transparent:true,depthWrite:false,opacity,polygonOffset:true,polygonOffsetFactor:-1});
  const m=new THREE.InstancedMesh(geo,material,items.length),o=new THREE.Object3D();
  for(let i=0;i<items.length;i++){let [x,y,z,w,d,angle=0]=items[i];o.position.set(x,y+.055,z);o.rotation.set(0,angle,0);o.scale.set(w,1,d);o.updateMatrix();m.setMatrixAt(i,o.matrix);}
  m.name='Soft contact of vegetation and stone';m.renderOrder=1;m.frustumCulled=false;parent.add(m);
}

export { pick, between, colorCache, ink, makeGeometry, Faces, sheet, cutouts, cachedMap, ellipse, groundSpots, TAU, clamp, mix, smooth, noise, fbm, prng, texCanvas };
