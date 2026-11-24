import * as THREE from "../vendor/three.module.js";
import { GAIT, sampleLocomotion } from "./locomotion.js";
import { createFlightRig } from "./castle-flight.js";

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const asV = p => Array.isArray(p) ? v(...p) : p;
const up = v(0, 1, 0);
const Z = v(0, 0, 1);
const ink = '#332e2b';
const darkIron = '#403d3c';
const weld = '#665951';
const copper = '#a97850';
const cream = '#c6b48c';
const steel = '#6e7775';
const iron = ['#77685e', '#7f6d60', '#826b5d', '#646762', '#78736b', '#756d62', '#626d70', '#856f60', '#74665e'];
const bottomIron = ['#5a5956', '#626364', '#656760', '#705c55', '#665850', '#626568', '#796456'];
const redPlate = ['#87665b', '#805e55', '#7e6459', '#885e52', '#896658', '#765f57', '#766b62', '#72716c', '#8e6657'];
const oak = ['#634b3d', '#735441', '#6a4b3b', '#835e43'];
const tile = ['#a34d3a', '#9c4939', '#98503f', '#ad5944', '#a75540', '#8f493a', '#b36246', '#a45845', '#945342'];
const plaster = ['#d6c9a7', '#cabc9d', '#c1af92', '#ddcb9e', '#c6bfaa', '#cbb994'];
function random(seed) {
  let a = seed >>> 0;
  return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
}
const select = (a, r) => a[Math.floor(r() * a.length)];
const mix = (a,b,q) => new THREE.Color(a).lerp(new THREE.Color(b),q);
const cache = new Map();
function cached(key, f) { if (!cache.has(key)) cache.set(key, f()); return cache.get(key); }

// Rounded plate, beam and machine housing. A cuboid with a circular
// fillet of constant world-space width on all twelve edges.
function castBox(dim) {
 const half=dim.map(v=>v*.5), bevel=Math.min(.115,Math.min(...half)*.32);
 const axes=[[2,0,1,1],[2,0,1,-1],[0,1,2,1],[0,1,2,-1],[1,2,0,1],[1,2,0,-1]];
 const pos=[],normal=[],uv=[],indices=[];
 for(const [f,u,v,side] of axes){
  const base=pos.length/3;
  const us=[-half[u],-half[u]+bevel,half[u]-bevel,half[u]];
  const vs=[-half[v],-half[v]+bevel,half[v]-bevel,half[v]];
  for(const y of vs) for(const x of us) {
   const a=[0,0,0];a[f]=half[f]*side;a[u]=x;a[v]=y;
   const center=a.map((q,i)=>Math.max(-half[i]+bevel,Math.min(half[i]-bevel,q)));
   const n=a.map((q,i)=>q-center[i]);const len=Math.hypot(...n)||1;
   const unit=n.map(q=>q/len);pos.push(...center.map((q,i)=>q+unit[i]*bevel));normal.push(...unit);
   uv.push((x/half[u]+1)*.5,(y/half[v]+1)*.5);
  }
  for(let y=0;y<3;y++)for(let x=0;x<3;x++){
   const a=base+y*4+x,b=a+1,c=a+4,d=c+1;
   if(side>0)indices.push(a,b,c,b,d,c);else indices.push(a,c,b,b,c,d);
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
 g.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
 g.setIndex(indices);return g;
}
const boxGeo = () => cached('box', () => new THREE.BoxGeometry(1, 1, 1));
const orbGeo = (h=16,k=10) => cached('s'+h+','+k,() => new THREE.SphereGeometry(1,h,k));
const tubeGeo = (r1,r2,n) => cached('c'+r1+','+r2+','+n,() => new THREE.CylinderGeometry(r2,r1,1,n,1,false));
const torGeo = (r,t,n) => cached('t'+r+','+t+','+n,() => new THREE.TorusGeometry(r,t,Math.max(4,Math.ceil(n/8)),n));
const tmpP = v(), tmpN = v(), normMat = new THREE.Matrix3(), meshMat = new THREE.Matrix4(), colorTmp = new THREE.Color();
const ID = new THREE.Matrix4();
function transform(pos=[0,0,0],rot=[0,0,0],scale=[1,1,1]){
  return new THREE.Matrix4().compose(asV(pos),rot.isQuaternion ? rot : new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),asV(scale));
}
function texture(kind) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const ctx = cv.getContext('2d'), im = ctx.createImageData(256,256), d = im.data, r = random(kind==='metal'?326:kind==='roof'?455:kind==='wood'?4256:834);
  const n = 16, f = new Float32Array(n*n);
  for (let i=0;i<f.length;i++) f[i]=r();
  const smooth = t=>t*t*(3-2*t);
  function noise(x,y,step) {
    const px=x*step/256,py=y*step/256,dx=smooth(px%1),dy=smooth(py%1),ix=Math.floor(px),iy=Math.floor(py);
    const s=(a,b)=>f[((b%step)*n+(a%step))%f.length];
    return lerp(lerp(s(ix,iy),s(ix+1,iy),dx),lerp(s(ix,iy+1),s(ix+1,iy+1),dx),dy);
  }
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const j=(y*256+x)*4;
    const p=.40*noise(x,y,4)+.30*noise(x,y,8)+.30*noise(x,y,16), g=r();
    const fleck=kind==='metal'?Math.max(0,.51-p)*150:0;
    const z=(kind==='metal'?223:kind==='wall'?224:kind==='wood'?221:226) + (p-.5)*(kind==='metal'?69:34) + (g-.5)*(kind==='metal'?22:12);
    const grain=kind==='wood'?(Math.sin(y*.58+1.7*Math.sin(x*.03))*.5+.5)*10:0;
    d[j]=z+fleck*.31-grain;d[j+1]=z-fleck*.67-grain;d[j+2]=z-fleck*1.16-grain;d[j+3]=255;
  }
  ctx.putImageData(im,0,0);
  if(kind==='metal') {
    for(let k=0;k<70;k++){
      const x=r()*256,y=r()*256,rad=3+r()**2*18,rr=ctx.createRadialGradient(x,y,0,x,y,rad);
      if(k%3){rr.addColorStop(0,'rgba(113,76,50,.13)');rr.addColorStop(1,'rgba(113,76,50,0)');}
      else{rr.addColorStop(0,'rgba(129,151,142,.12)');rr.addColorStop(1,'rgba(129,151,142,0)');}
      ctx.fillStyle=rr;ctx.fillRect(x-rad,y-rad,2*rad,2*rad);
    }
    for(let i=0;i<470;i++){
      const x=r()*256,y=r()*256,h=.4+r()**3*28;
      ctx.strokeStyle=r()>.36?'rgba(83,57,42,.15)':'rgba(235,232,210,.25)';ctx.lineWidth=.3+r()*.9;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(r()-.5)*2,y+h);ctx.stroke();
    }
  }else if(kind==='wall'){
    for(let i=0;i<85;i++){ctx.fillStyle='rgba(92,78,58,.045)';ctx.fillRect(r()*256,r()*256,1+r()*8,1+r()**3*26);}
  }else if(kind==='wood'){
    for(let i=0;i<85;i++){const y=r()*256,x=r()*256;ctx.strokeStyle='rgba(71,57,44,.13)';ctx.lineWidth=.4+r()*1.2;ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+10,y+2,x+26,y-2,x+34,y);ctx.stroke();}
  }
  const map=new THREE.CanvasTexture(cv);map.wrapS=map.wrapT=THREE.RepeatWrapping;map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=2;return map;
}
function materials(){
 const m={};
 for(const kind of ['metal','roof','wood','wall','glass','shadow','brass','sail']){
  m[kind]=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:kind==='glass'?.38:kind==='brass'?.58:kind==='metal'?.81:.94,metalness:kind==='glass'?.08:kind==='metal'?.16:kind==='brass'?.31:0});
  if(['metal','roof','wood','wall'].includes(kind))m[kind].map=texture(kind);
  if(kind==='sail')m[kind].side=THREE.DoubleSide;
 }
 return m;
}
// The static model is accumulated by surface material; the moving joints have their own batches.
class Batch {
 constructor(m){this.m=m;this.parts=new Map();this.frame=ID;this.count=0;}
 local(p,rot,fn){const old=this.frame;this.frame=old.clone().multiply(transform(p,rot));fn();this.frame=old;}
 add(g,c,kind='metal',local=ID){
  let b=this.parts.get(kind);if(!b){b={p:[],n:[],uv:[],c:[],i:[]};this.parts.set(kind,b);}
  meshMat.multiplyMatrices(this.frame,local);normMat.getNormalMatrix(meshMat);colorTmp.set(c);
  const pos=g.getAttribute('position'), nor=g.getAttribute('normal'), uv=g.getAttribute('uv'), col=g.getAttribute('color'),idx=g.index, base=b.p.length/3;
  for(let i=0;i<pos.count;i++){
   tmpP.fromBufferAttribute(pos,i).applyMatrix4(meshMat);b.p.push(tmpP.x,tmpP.y,tmpP.z);
   tmpN.fromBufferAttribute(nor,i).applyMatrix3(normMat).normalize();b.n.push(tmpN.x,tmpN.y,tmpN.z);
   const a=col?col.getX(i):1,e=col?col.getY(i):1,f=col?col.getZ(i):1;b.c.push(colorTmp.r*a,colorTmp.g*e,colorTmp.b*f);
   if(uv)b.uv.push(uv.getX(i),uv.getY(i));else b.uv.push(0,0);
  }
  if(idx){for(let i=0;i<idx.count;i++)b.i.push(base+idx.getX(i));}else{for(let i=0;i<pos.count;i++) b.i.push(base+i);}
  this.count++;
 }
 box(pos,sz,col,kind='metal',rot=[0,0,0]){const dims=sz.slice().sort((a,b)=>a-b);
  if(dims[0]>.20 && dims[1]>.38 && dims[2]>.72 && (kind==='metal'||kind==='wood'||kind==='brass')){
   this.add(castBox(sz),col,kind,transform(pos,rot));return;
  }
  this.add(boxGeo(),col,kind,transform(pos,rot,sz));}
 orb(pos,sz,col,kind='metal',rot=[0,0,0],h=16,k=10){const broad=Math.max(...sz)>1.35 && Math.min(...sz)>.24;
  this.add(orbGeo(broad?Math.max(32,h):h,broad?Math.max(18,k):k),col,kind,transform(pos,rot,sz));}
 cylinder(a,b,r1,r2,c,kind='metal',n=14){
  a=asV(a);b=asV(b);const delta=b.clone().sub(a), length=delta.length();if(length<.0001)return;
  const q=new THREE.Quaternion().setFromUnitVectors(up,delta.multiplyScalar(1/length));
  if(Math.max(r1,r2)>.38 && n>=10)n=Math.max(n,Math.max(r1,r2)>1.05?36:24);
  this.add(tubeGeo(r1,r2,n),c,kind,transform(a.clone().lerp(b,.5),q,[1,length,1]));
 }
 beam(a,b,w,d,c,kind='wood'){
  a=asV(a);b=asV(b);const delta=b.clone().sub(a),length=delta.length();if(length<.001)return;
  this.add(boxGeo(),c,kind,transform(a.clone().lerp(b,.5),new THREE.Quaternion().setFromUnitVectors(up,delta.normalize()),[w,length,d]));
 }
 ring(pos,axis,r,t,c,kind='metal',n=24){
   if(r>.64 && n>=12)n=Math.max(n,r>1.4?44:32);
   this.add(torGeo(r,t,n),c,kind,transform(pos,new THREE.Quaternion().setFromUnitVectors(Z,asV(axis).clone().normalize())));
 }
 path(points,r,c,kind='metal',s=0,n=7,closed=false) {
  const pts=points.map(asV);const curve=new THREE.CatmullRomCurve3(pts,closed,'centripetal');
  this.add(new THREE.TubeGeometry(curve,s || Math.max(6,pts.length*3),r,n,closed),c,kind);
 }
 surf(nu,nv,point,c,kind='metal',flip=false,us=1,vs=1,shade=null){
  const p=[],uv=[],idx=[],cs=[];
  for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){const q=asV(point(i/nu,j/nv));p.push(q.x,q.y,q.z);uv.push(i/nu*us,j/nv*vs);if(shade){const t=shade(i/nu,j/nv);cs.push(t[0],t[1],t[2]);}}
  for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){const a=j*(nu+1)+i,b=a+1,d=a+nu+1,e=d+1;if(flip)idx.push(a,d,b,b,d,e);else idx.push(a,b,d,b,e,d);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));if(shade)g.setAttribute('color',new THREE.Float32BufferAttribute(cs,3));g.setIndex(idx);g.computeVertexNormals();this.add(g,c,kind);
 }
 face(points,c,kind='metal',flip=false){
  const p=points.map(asV),ns=v().crossVectors(p[1].clone().sub(p[0]),p[2].clone().sub(p[0])).normalize();
  const dir=Math.abs(ns.z)>.65?'z':Math.abs(ns.y)>.65?'y':'x';
  const flat=p.map(q=>new THREE.Vector2(dir==='x'?q.z:q.x,dir==='y'?q.z:q.y));
  const tris=THREE.ShapeUtils.triangulateShape(flat,[]),idx=[];for(const t of tris){
   const [i,j,k]=t;const n=v().crossVectors(p[j].clone().sub(p[i]),p[k].clone().sub(p[i]));if((n.dot(ns)<0)!==flip)idx.push(i,k,j);else idx.push(i,j,k);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p.flatMap(q=>[q.x,q.y,q.z]),3));g.setAttribute('uv',new THREE.Float32BufferAttribute(flat.flatMap(q=>[q.x*.25,q.y*.25]),2));g.setIndex(idx);g.computeVertexNormals();this.add(g,c,kind);
 }
 finish(group) {
  let tris=0;
  for(const [kind,b] of this.parts){
   const g=new THREE.BufferGeometry();
   for(const [name,arr,size] of [['position',b.p,3],['normal',b.n,3],['color',b.c,3],['uv',b.uv,2]])g.setAttribute(name,new THREE.Float32BufferAttribute(arr,size));
   g.setIndex(b.i);g.computeBoundingSphere();
   const mesh=new THREE.Mesh(g,this.m[kind]);mesh.name='Castle / '+kind;mesh.castShadow=!['glass','shadow'].includes(kind);mesh.receiveShadow=true;group.add(mesh);tris+=b.i.length/3;
  }
  return tris;
 }
}
function inkBolt(b,p,r=.11,c='#9e8975'){b.orb(p,[r,r*.8,r],c,'metal',[0,0,0],7,4);}
function cable(b,p,r=.055,c='#4f4a40'){b.path(p,r,c,'metal',Math.max(5,p.length*2),5);}
function ringPoints(fn,u1=0,u2=TAU,count=32){return Array.from({length:count+1},(_,i)=>fn(lerp(u1,u2,i/count)));}
function linearRing(b,y,rx,rz,c,th=.13,dx=0,dz=0){b.path(ringPoints(a=>[dx+rx*Math.sin(a),y,dz+rz*Math.cos(a)],0,TAU,32).slice(0,-1),th,c,'metal',50,6,true);}
function rail(b,p,h=.8){
 const pts=p.map(asV);for(let i=0;i<pts.length;i++){const a=pts[i];b.cylinder(a,a.clone().add(v(0,h,0)),.06,.049,'#65594c','metal',6);}
 for(const z of [h,h*.45])b.path(pts.map(a=>a.clone().add(v(0,z,0))),.056,'#6d624d','metal',Math.max(8,pts.length*3),5);
}
function tubeWithCollars(b,points,r,col,collarCol=weld,steps=3){
 const p=points.map(asV),curve=new THREE.CatmullRomCurve3(p);b.add(new THREE.TubeGeometry(curve,Math.max(10,p.length*4),r,12,false),col);
 for(let j=0;j<=steps;j++){const f=.025+.95*j/steps,q=curve.getPointAt(f),n=curve.getTangentAt(f);b.ring(q,n,r+.035,Math.max(.065,r*.12),collarCol,'metal',14);}
}

const hullLevels = [
 [9.55,4.65,4.05,-.30,-1.05],[10.55,7.15,5.8,-.4,-.90],[12.0,10.0,8.2,-.42,-.55],
 [14.15,12.1,10.05,-.42,-.24],[16.7,13.15,11.25,-.34,-.15],[19.65,13.65,11.65,-.30,-.12],
 [22.10,13.75,11.52,-.25,-.25],[24.1,13.15,11.15,-.3,-.35],[25.70,11.80,10.20,-.45,-.5],
 [27.25,9.0,8.65,-.30,-.80],[28.50,5.05,5.00,-.10,-.90]];
function hullAt(y,a,out=0){
 let j=0;while(j<hullLevels.length-2 && y>hullLevels[j+1][0])j++;
 const A=hullLevels[j],B=hullLevels[j+1],f=clamp((y-A[0])/(B[0]-A[0]),0,1);
 const l=k=>lerp(A[k],B[k],f);
 const si=Math.sin(a),co=Math.cos(a),swell=1+.024*Math.sin(3*a+.7)+.014*Math.cos(5*a-.14*y);
 const faceIn=Math.pow(Math.max(0,co),8)*Math.max(0,1-Math.abs((y-16.25)/4.8))*2;
 return v(l(3)+(l(1)*swell+out)*si,y+.28*Math.sin(2*a+.2)+.12*Math.sin(5*a-y*.15),l(4)+(l(2)*swell+out)*co-faceIn);
}
function hull(b,rnd){
 const bands=[9.57,10.73,12.08,14.19,16.59,19.39,21.9,23.86,25.61,27.16,28.49];
 b.surf(64,30,(u,t)=>hullAt(lerp(9.55,28.5,t),u*TAU,-.11),'#483c38','metal',false,7,3);
 for(let j=0;j<bands.length-1;j++){
  const lo=bands[j],hi=bands[j+1],n=[12,14,16,18,19,18,19,18,17,14][j],start=(j%2?.48:.04)*TAU/n+.052*Math.sin(j);
  const angles=Array.from({length:n+1},(_,i)=> start+TAU*i/n+(i>0&&i<n?(rnd()-.5)*.065:0));
  const boundary=(a,k)=> .16*Math.sin(a*3+k*.8)+.11*Math.cos(a*5+k*.2);
  for(let i=0;i<n;i++){
   const a0=angles[i]+.0023,a1=angles[i+1]-.0023,mid=(a0+a1)/2,th=.018+rnd()*.058;
   const aa=(s,t)=>lerp(a0,a1,s)+(t-.5)*.027*Math.sin(i*3.3+j);
   const pp=(s,t,out=th)=>{const a=aa(s,t),y=lerp(lo+boundary(a,j)+.026,hi+boundary(a,j+1)-.02,t);return hullAt(y,a,out+.058*Math.sin(s*Math.PI)*Math.sin(t*Math.PI));};
   const reddish=Math.cos(mid)>.40&&j>=2&&j<8;
   const col=select(reddish?redPlate:j<4?bottomIron:iron,rnd);
   const gauge=.135,outer=th+.036;
   const dome=(s,t)=>pp(s,t,outer+.042*Math.sin(Math.PI*s)*Math.sin(Math.PI*t));
   b.surf(8,4,dome,col,'metal',false,1.5,1);
   const cut=mix(col,'#382f2a',.20),edge=(s,t,v)=>pp(s,t,outer-gauge*(1-v));
   b.surf(8,1,(s,v)=>edge(s,0,v),cut,'metal');
   b.surf(8,1,(s,v)=>edge(1-s,1,v),cut,'metal');
   b.surf(4,1,(t,v)=>edge(0,1-t,v),cut,'metal');
   b.surf(4,1,(t,v)=>edge(1,t,v),cut,'metal');
   if(j>0&&j<9){for(const side of [.055,.95]){inkBolt(b,pp(side,.15,th+.08),.09,select(['#a8947b','#89796a','#5d5149'],rnd));if(j%2===0)inkBolt(b,pp(side,.84,th+.08),.095,'#a79987');}}
   if(j>1&&j<9&&rnd()<.26){b.path(ringPoints(s=>pp(s,.07,th+.06),.08,.91,5),.045,'#a58b73','metal',7,5);}
  }
 }
 for(const [y,col,s,e] of [[12.08,'#483e3d',.56,5.75],[19.45,'#66584e',.9,2.98],[21.94,'#574840',-2.64,-.7],[24.02,'#957d63',1.1,5.4]]){
   b.path(ringPoints(a=>hullAt(y,a,.095),s,e,40),.145,col,'metal',44,7);
 }
 // Steel strakes gather into the keel on the underside.
 for(let j=0;j<14;j++){
  const a=j*TAU/14+.09,c=select(bottomIron,rnd);b.path([hullAt(15.3,a+.12,.12),hullAt(13.5,a+.07,.13),hullAt(11.7,a,.17),hullAt(10.3,a-.06,.22)],.20,c,'metal',12,7);
 }
 b.orb([-.4,10.13,-.95],[6.3,1.12,4.7],'#595852','metal',[0,.05,.03],20,10);
 b.box([0,10,-1],[2.9,.5,9.1],'#4e4c4a','metal',[.035,.03,0]);
}
function port(b,p,axis,r,l,base='#817165',rim='#ac9579',bolts=true){
 const q=asV(p),n=asV(axis).clone().normalize(), at=d=>q.clone().addScaledVector(n,d);
 b.cylinder(at(-.16),at(.10),r*1.24,r*1.15,base,'metal',20);
 b.ring(at(.09),n,r*1.15,r*.065,'#514943','metal',22);
 b.cylinder(at(.10),at(l-.12),r*.93,r*.94,base,'metal',22);
 b.cylinder(at(l-.13),at(l-.082),r*.81,r*.81,'#28292a','shadow',22);
 b.ring(at(l-.045),n,r*.84,r*.153,rim,'metal',26);
 b.ring(at(l-.003),n,r*.706,r*.047,'#65564c','metal',24);
 if(bolts&&r>.49){const side=v().crossVectors(n,axis===up?Z:up);if(side.lengthSq()<.001)side.set(1,0,0);side.normalize();const top=v().crossVectors(n,side).normalize();
 for(let i=0;i<6;i++){const a=i*TAU/6+.15;inkBolt(b,at(.105).addScaledVector(side,Math.cos(a)*r*1.10).addScaledVector(top,Math.sin(a)*r*1.10),r*.09,rim);}
 }
}
const podProfile=[[0,.37],[.08,.65],[.19,.81],[.32,.93],[.45,1],[.57,1],[.68,.96],[.77,.86],[.86,.70],[.94,.47],[1,.035]];
function podShape(t){let j=0;while(j<podProfile.length-2&&t>podProfile[j+1][0])j++;const a=podProfile[j],z=podProfile[j+1];return lerp(a[1],z[1],(t-a[0])/(z[0]-a[0]));}
function pod(b, o, rnd){
 const {x,z,y,h,rx,rz,angle=0,colors=iron,band='#8a8475',eyes=[],upper='#77786f',shift=0}=o;
 function point(a,t,extra=0){
  const f=podShape(t),dist=1+.018*Math.sin(3*a+.5)+.007*Math.sin(7*a+3*t),xx=((rx*f)*dist+extra)*Math.sin(a),zz=(rz*f*dist+extra)*Math.cos(a);
  return v(x+xx*Math.cos(angle)+zz*Math.sin(angle),y+t*h+.16*Math.sin(2*a+.4)*Math.sin(Math.PI*t),z-xx*Math.sin(angle)+zz*Math.cos(angle));
 }
 b.surf(48,23,(s,t)=>point(s*TAU,t,-.07),'#514640','metal',false,5,4);
 const rows=[0,.14,.29,.43,.57,.68,.78,.89,.97,1];
 const boundary=(j,a)=>rows[j]+Math.sin(rows[j]*Math.PI)*(.032*Math.sin(a*2+.75*j+shift)+.019*Math.cos(a*3-j*.78)+.012*Math.sin(a*5+.2*j));
 for(let j=0;j<rows.length-1;j++){
  const num=j>5?10:13,sh=(j%2?.42:0)*TAU/num;
  for(let i=0;i<num;i++){
   const a0=i*TAU/num+sh+.0035,a1=(i+1)*TAU/num+sh-.0035,t0=rows[j]+.0018,t1=rows[j+1]-.0018;
   const pp=(u,t,off=.02)=>{const raw=lerp(a0,a1,u),a=raw+.041*(t-.5)*Math.sin(raw*2+j*.5+shift);return point(a,lerp(boundary(j,a)+.0015,boundary(j+1,a)-.0015,t),off);};
   const pal=j>=5?[upper,upper,colors[2],colors[3],upper]:colors;
   const c=mix(select(pal,rnd),j>4?upper:colors[0],.43);
   const rim=mix(c,'#3c3832',.19);
   b.surf(8,1,(u,s)=>pp(u,0,-.060+.093*s),rim,'metal');
   b.surf(8,1,(u,s)=>pp(1-u,1,-.060+.093*s),rim,'metal');
   b.surf(8,5,(u,t)=>pp(u,t,.033+.020*Math.sin(u*Math.PI)*Math.sin(t*Math.PI)),c,'metal',false,1.3,1.3,(u,t)=>{const f=.94+.06*t-.055*Math.sin(u*3+i)*Math.sin(t*Math.PI);return [f*1.015,f,f*.983];});
   if(j===2||j===4||j===5||j===6){inkBolt(b,pp(.07,.14,.07),.09,'#8d8070');if(j<6)inkBolt(b,pp(.89,.15,.07),.096,'#b29a7c');}
  }
 }
 // Overlapping curved iron apron, with a chipped uneven edge and broad joiners.
 const n=18;
 for(let i=0;i<n;i++){
  const a0=i*TAU/n+.002,a1=(i+1)*TAU/n-.002,flaw=rnd(),low=.478+.038*rnd()+.026*Math.sin(i*.8+shift),top=.565+(.012+.045*rnd())+.030*Math.sin(i*.82+shift),off=.114+rnd()*.09;
  const pp=(s,t)=>{const a=lerp(a0,a1,s)+(t-.5)*.030*Math.cos(i+shift);return point(a,lerp(low+.022*Math.sin(s*4.0+i),top-.009*(1-Math.cos(s*TAU))*.5,t),off);};
  if(flaw<.08)continue;
  const hullSide=Math.cos((a0+a1)*.5+angle);const guard=mix(band,select([...colors,'#6f746e','#958672'],rnd),(hullSide>.46 && o.mainEye) ? .09+rnd()*.35 : .22+rnd()*.59);
  b.surf(5,3,pp,guard,'metal',false,1,1,(u,t)=>{const d=.85+.13*t+.024*Math.sin(u*6+i);return [d*1.013,d,d*.982];});
  inkBolt(b,pp(.12,.76),.10,'#c2ac84');inkBolt(b,pp(.88,.76),.095,'#c0a781');
  if(i%4===1){const a=(a0+a1)*.5;b.path([point(a,.31,.13),point(a,.395,.14),point(a,.486,.13)],.15,'#5c4b44','metal',7,6);}
 }
 if(o.mainEye){
  for(const [i,a] of [-2.68,-1.74,-.99,1.04,1.76,2.49].entries()){
   const lo=.21+.028*(i%3),hi=.60+.025*Math.sin(i+shift),width=.055+.012*(i%3);
   const pp=(u,t)=>point(a+(u-.5)*width+.08*(t-.5),lerp(lo,hi,t),.18+.055*Math.sin(u*Math.PI));
   b.surf(2,6,pp,i%3===1?'#737265':'#73695c','metal');
   for(const t of [.15,.71,.93])inkBolt(b,pp(.5,t),.12,'#a59275');
  }
 }
 for(const [a,t,r,l] of eyes){const p=point(a,t,.05),n=v(Math.sin(a+angle),.24+.55*(t-.70),Math.cos(a+angle));port(b,p,n,r,l,upper,'#ac9a7e');}
 return point;
}
function bow(b,rnd){
 const upper=(s,t)=>{
  const x=(s-.5)*15.7,n=Math.abs((s-.5)*2);
  const y=lerp(18.57+1.03*(1-n*n)+.26*Math.sin(7.5*s-.8),22.35+.51*Math.cos((s-.39)*6),t);
  const z=lerp(15.18-4.01*n**2,10.48-1.22*n**1.6,t)+.46*Math.sin(t*Math.PI);
  return v(x,y,z);
 };
 const jaw=(s,t)=>{
  const x=(s-.5)*15.35,n=Math.abs((s-.5)*2);
  const zz=lerp(8.52+.65*(1-n*n),15.36-3.4*n*n,t);
  const yy=lerp(11.03+.96*n*n,14.37+1.03*n*n+.28*Math.sin(7*s+.48),t)-1.14*Math.sin(t*Math.PI)+.20*Math.sin(4*s);
  return v(x,yy,zz);
 };
 b.surf(26,7,upper,'#543e37','metal');b.surf(26,7,jaw,'#4f423c','metal');
 for(const [f,n,cols] of [[upper,9,redPlate],[jaw,10,redPlate]]){
  for(let j=0;j<2;j++)for(let i=0;i<n;i++){
   const lo=i/n+.0019,hi=(i+1)/n-.0019,lt=j/2+.002,ht=(j+1)/2-.002;
   const pp=(u,t)=>{const p=f(lerp(lo,hi,u),lerp(lt,ht,t));p.z+=.05;p.y+=.026;return p;};
   b.surf(3,3,pp,select(cols,rnd),'metal');for(const k of [.10,.87]){inkBolt(b,pp(k,.12),.106,'#af876b');}
  }
 }
 const brow=s=>upper(s,0),lip=s=>jaw(s,1);
 b.path(ringPoints(brow,.005,.995,29),.13,'#744a40','metal',36,9);
 b.path(ringPoints(s=>lip(s).add(v(0,0,.06)),.005,.995,29),.215,'#745749','metal',36,9);
 b.path(ringPoints(s=>lip(s).add(v(0,-.30,-.16)),.06,.94,25),.13,'#a36c55','metal',29,7);
 // Recessed firebox and the irregular plates on either cheek.
 b.orb([-.22,16.87,11.03],[6.21,2.71,.76],'#383d39','metal',[0,0,.025],26,14);
 for(let j=0;j<5;j++){const x=-3.55+j*1.60;b.beam([x,15.26,12.43],[x+.28,18.08+.26*Math.sin(j),12.48],.19,.23,'#645649','metal');}
 const teeth=[[-5.85,1.32,.43],[-4.45,1.40,.77],[-2.94,1.37,.42],[-1.56,1.27,.68],[-.12,1.48,.35],[1.33,1.34,.57],[2.79,1.45,.78],[4.21,1.31,.48],[5.47,1.0,.57]];
 for(const [x,w,drop] of teeth){
  const p=brow(x/15.7+.5),z=p.z+.01,y=p.y+.12;
  b.face([[x-w*.49,y+.06,z-.06],[x-w*.47,y-drop*.69,z+.01],[x-w*.32,y-drop,z+.05],[x+w*.38,y-drop*.74,z+.01],[x+w*.48,y+.12,z-.08]],select(['#876a54','#837062','#8a7660','#796757'],rnd),'metal');
  inkBolt(b,[x+.11*w,y-.07,z+.075],.087,'#a18c70');
 }
 const lower=(s,t)=>{const p=lip(.1+.77*s);p.y+=.15+.21*Math.sin(s*3.7)+t*.10;p.z-=.14+t*1.96;return p;};
 b.surf(17,3,lower,'#766858','metal');
 b.path(ringPoints(s=>lower(s,.77),0,1,18),.12,'#94806b','metal',23,7);
 for(const y of [15.75,17.90])b.path([[-5.3,y+.22,11.98],[-2.9,y,12.40],[.4,y-.17,12.47],[3.4,y+.04,12.27],[5.1,y+.35,11.91]],.12,'#5d5148','metal',16,7);
 for(let i=0;i<7;i++){const a=(i+.08)/7,c=(i+.94)/7;
  b.surf(3,2,(s,t)=>{const p=lip(lerp(a,c,s));p.z+=.12-.24*t;p.y-=.06+.52*t;return p;},select(['#815e53','#826457','#8a6556','#73665a'],rnd),'metal',true);
 }
 for(const side of [-1,1]){
  const x=side;
  b.orb([x*6.74,17.12,10.58],[3.03,3.28,2.15],x<0?'#805f55':'#846357','metal',[.1,x*.30,x*.27],22,12);
  b.path([[x*6.1,14.49,12.48],[x*6.75,14.83,12.78],[x*7.0,16.8,13.30],[x*6.72,18.82,13.40],[x*5.83,20.34,13.14]],.24,'#795a4d','metal',15,8);
  port(b,[x*7.48,19.1,12],[x*.19,.14,1],.59,.46,'#925748','#ad8463');
  b.path([[x*4.58,12.1,10.16],[x*6.78,12.84,10.83],[x*7.55,14.03,11.44],[x*7.87,15.15,11.58]],.29,'#8d6450','metal',12,8);
 }
 // Folded cheek armour wraps around the recessed mouth instead of ending at its rim.
 for(const side of [-1,1]){
  const cheek=(u,t,off=0)=>{
   const x=side*(5.63+2.87*u+.40*t+.09*Math.sin(t*Math.PI));
   const y=14.78+4.35*t+.51*u+.20*Math.sin(u*4.5);
   const z=12.98-.67*u-.24*(u-.40)**2+.16*Math.sin(Math.PI*t)+off;
   return v(x,y,z);
  };
  for(let k=0;k<3;k++){const a=k/3+.002,c=(k+1)/3-.002;
   const pp=(s,t)=>cheek(lerp(a,c,s),t,.029);
   b.surf(3,4,pp,select(['#79685c','#82675b','#8a6958','#766d61'],rnd),'metal',side<0);
   for(const t of [.13,.87])inkBolt(b,pp(.80,t),.11,'#a49176');
  }
  b.path(ringPoints(t=>cheek(.97,t,.07),.06,.94,9),.09,'#776455','metal',11,6);
 }
 const rim=[[ -5.58,15.05,14.08],[-5.69,16.76,14.27],[-5.02,18.47,14.54],[-3.02,18.85,14.79],[-.48,18.88,15.04],[2.68,18.77,14.87],[4.83,18.49,14.47],[5.64,16.94,14.12],[5.47,15.36,14.06],[2.87,14.88,14.66],[-.38,14.69,14.87],[-3.32,14.83,14.57]];
 const backs=rim.map(([x,y,z])=>[x*.77-.19,16.73+(y-16.73)*.79,11.55+.12*Math.cos(x)]);
 for(let i=0;i<rim.length;i++){
  const j=(i+1)%rim.length,rs=[rim[i],rim[j],backs[j],backs[i]],co=select(['#585b53','#554f46','#646154','#5b5b51','#685d4c'],rnd);
  b.face(rs,co,'metal',true);b.face(rs,co,'metal');
  if(i===1||i===5||i===8||i===10)b.beam(v(...rim[i]).lerp(v(...backs[i]),.12),v(...backs[i]),.105,.085,'#756c57','metal');
 }
 // Two short drums and the blue-black rear plate are visible deep in the shaded firebox.
 b.orb([-.64,16.71,11.57],[3.52,1.43,.53],'#48514e','metal',[.05,0,-.04],18,9);
 for(const [x,y,r] of [[-1.48,16.55,.76],[1.38,16.84,.61]]){
  const p=[x,y,12.02];b.cylinder([x,y,11.82],p,r*.96,r,'#5e6257','metal',16);
  b.ring([x,y,12.07],[0,0,1],r*.81,.095,'#7a7661','metal',17);
  b.cylinder([x,y,12.04],[x,y,12.10],r*.36,r*.39,'#6c6c58','metal',10);
 }

 // The pentagonal nose is hammered into a single bent central cap.
 const outline=[[-3.40,18.97,15.23],[-3.06,20.68,15.38],[-.40,22.17,15.27],[2.72,20.72,15.05],[3.00,19.15,15.18]];
 const rear=outline.map(([x,y,z])=>[x*.90,y+.24,z-1.87]);
 for(let i=0;i<outline.length;i++){const j=(i+1)%outline.length;b.face([outline[i],outline[j],rear[j],rear[i]],i===1||i===2?'#996c56':'#775c50','metal');}
 const mid=[-.36,20.27,15.65];
 for(let i=0;i<outline.length;i++){const j=(i+1)%outline.length;b.face([outline[j],outline[i],mid],['#8a574d','#946550','#906453','#885c4f','#806454'][i],'metal');}
 b.path(outline.slice(0,5),.115,'#a38569','metal',15,7);
 for(const k of [0,1,2,3,4]){const t=v(...outline[k]).lerp(v(...mid),.10);inkBolt(b,t,.102,'#ae9679');}
 port(b,[-1.77,20.40,15.65],[-.1,.12,1],.39,.18,'#805d50','#957b62');
 port(b,[1.01,20.33,15.61],[.09,.15,1],.35,.19,'#795b50','#927d65');
 // This continuous curved forecastle joins the underside of the eye boilers to the red bow.
 const browDeck=(s,t)=>{const x=lerp(-9.38,9.06,s),q=Math.abs((s-.51)*2);return v(x,lerp(21.80+.97*(1-q*q)+.16*Math.sin(s*7),24.37-.56*q*q,t),lerp(12.25-3.35*q*q,8.36-1.04*q*q,t)+.12*Math.sin(t*Math.PI));};
 b.surf(28,6,browDeck,'#68564d');
 for(let i=0;i<11;i++){const lo=(i+.002)/11,hi=(i+.998)/11;
  const pp=(u,t)=>{const p=browDeck(lerp(lo,hi,u),t);p.z+=.06;return p;};
  b.surf(4,3,pp,select(['#6d5d56','#716057','#6e6158','#756358','#79675b'],rnd),'metal');
  for(const k of [.08,.86])inkBolt(b,pp(k,.15),.097,'#99846f');
  if(i%3===1)b.beam(pp(.24,0),pp(.27,.81),.18,.18,'#826c58','metal');
 }
 b.path(ringPoints(u=>browDeck(u,.004),0,1,28),.128,'#7b6455','metal',31,7);
}

function windowFrame(b,x,y,w,h,rnd,lit=false){
 const frame=select(['#564b3e','#594b3e','#66574a'],rnd),z=.075;
 b.box([x,y+h*.48,0],[w*1.16,h*1.13,.09],frame,'wood');
 const glass=lit?select(['#c28f58','#bd9c6b','#b58e57'],rnd):select(['#596b68','#687d79','#536466','#73827b','#617578'],rnd);
 const points=[[-.46,0],[.46,0],[.46,.83],[.36,.94],[.19,1],[-.2,1],[-.38,.94],[-.46,.82]].map(([a,t])=>[x+a*w,y+t*h,z]);
 b.face(points,glass,'glass');
 b.face([[x-w*.43,y+h*.79,z+.004],[x+w*.40,y+h*.95,z+.004],[x+w*.40,y+h*.76,z+.004],[x-w*.43,y+h*.59,z+.004]],lit?'#caa873':'#83918a','glass',true);
 b.box([x,y+h*.5,z+.036],[Math.max(.052,w*.071),h,.065],frame,'wood');
 b.box([x,y+h*.51,z+.036],[w,.068,.06],frame,'wood');
 if(w>1.02)b.box([x,y+h*.78,z+.037],[w,.054,.064],frame,'wood');
 b.box([x,y-.035,.14],[w*1.37,.12,.34],select(oak,rnd),'wood');
}
function house(b,opt,rnd){
 const {x,y,z,w,d,h,rise,yaw=0,cl=cream,over=.34,detail=1,dormer=false,lit=false,support=false,lean=0,roofCol=null}=opt;
 b.local([x,y,z],[0,yaw,lean],()=>{
  const half=w/2,deep=d/2,fascia=select(oak,rnd),ridgeX=w*(rnd()-.5)*.085,wood=select(oak,rnd);
  b.box([0,h/2,0],[w,h,d],cl,'wall');
  b.box([0,.085,0],[w+.17,.24,d+.17],wood,'wood');
  b.box([0,h-.10,0],[w+.19,.19,d+.17],wood,'wood');
  for(const sign of [-1,1]){
   const front=sign*deep;
   const points=[[-half,h,front],[half,h,front],[ridgeX,h+rise,front]].map(asV);
   b.face(points,cl,'wall',sign<0);
  }
  // Individually laid rows follow the eaves and sag slightly between gables.
  for(const sign of [-1,1]){
   const edge=sign*(half+over),start=-deep-over,end=deep+over;
   const at=(u,t,lift=0)=>{
    const xx=lerp(edge,ridgeX,t),zz=lerp(start,end,u),sag=Math.sin(u*Math.PI)*.16*(.6+t*.4);
    return v(xx,h-.12+rise*t-.13*Math.sin(t*Math.PI)-sag+lift,zz);
   };
   b.surf(7,5,(u,t)=>at(u,t),roofCol||'#75473b','roof',sign>0);
   const rows=Math.max(3,Math.round(Math.hypot(half+over,rise)/.49)),n=Math.max(4,Math.round((d+2*over)/.64));
   for(let j=0;j<rows;j++){
     const offset=j%2?.51:0;
     for(let k=-1;k<n;k++){
       const us=Math.max(0,(k+offset)/n),ue=Math.min(1,(k+1+offset)/n);if(ue-us<.012)continue;
       const t0=j/rows+.001,t1=(j+1)/rows+.003,hi=.045+rnd()*.045,cs=roofCol||select(tile,rnd);
       const tilePoint=(u,t)=>{const P=at(lerp(us+.0009,ue-.0009,u),lerp(t0,t1,t),hi*(1-.72*t)+.042*Math.sin(Math.PI*u)**2);P.y-=.035*Math.sin(Math.PI*u)*(1-t);return P;};
       b.surf(4,2,tilePoint,cs,'roof',sign>0);
       b.surf(4,1,(u,s)=>{const p=tilePoint(u,0);p.y-=.045*(1-s);return p;},mix(cs,'#542d28',.20),'roof',sign<0);
     }
   }
   b.beam(at(0,0),at(1,0),.21,.19,'#584537','wood');
   for(const u of [0,1]){
    b.beam(at(u,0).add(v(0,-.03,0)),at(u,1),.20,.20,fascia,'wood');
    b.path([at(u,0,.07),at(u,.5,.07),at(u,1,.07)],.063,roofCol||'#ad795b','roof',6,5);
   }
  }
  b.path([[ridgeX,h+rise+.04,-deep-over-.06],[ridgeX,h+rise-.11,0],[ridgeX,h+rise+.05,deep+over+.06]],.14,roofCol||'#99654f','roof',12,8);
  const face=(p,ang,L,isFront,visible)=>{
    b.local(p,[0,ang,0],()=>{
     for(const side of [-1,1])b.box([side*(L*.5-.09),h*.5,.02],[.16,h+.05,.18],wood,'wood');
     if(h>3.8){b.box([0,h*.50,.035],[L,.16,.16],wood,'wood');}
     const n=Math.max(1,Math.min(4,Math.floor(L/(detail>.85?2.04:2.37))));
     if(visible){
      for(let k=0;k<n;k++){
        const xx=(k+.5-n*.5)*L/n;
        const wh=Math.min(h>3.8?h*.30:h*.59,1.64),wy=h>3.8?h*.58:.27*h,ww=Math.min(1.08,L/(n*1.73));
        windowFrame(b,xx,wy,ww,wh,rnd,lit&&(k%2===0));
        if(h>3.8&&k%2===0)windowFrame(b,xx,.30,ww*.83,Math.min(1.58,h*.30),rnd);
      }
     }
     for(let k=1;k<n;k++){const xx=(k/n-.5)*L;b.box([xx,h*.49,.038],[.13,h,.15],wood,'wood');}
     if(isFront){
       b.beam([-.47*L,h+.02,.07],[ridgeX,h+rise-.1,.07],.14,.15,wood);
       b.beam([.47*L,h+.02,.07],[ridgeX,h+rise-.1,.07],.14,.15,wood);
       b.beam([ridgeX,h+.03,.07],[ridgeX,h+rise-.11,.07],.115,.13,wood);
       if(rise>2)for(const s of [-1,1])b.beam([s*L*.24,h+.07,.07],[ridgeX,h+rise*.58,.07],.105,.135,wood);
     }
    });
   };
   face([0,0,deep],0,w,true,true);face([0,0,-deep],Math.PI,w,true,true);
   face([half,0,0],Math.PI/2,d,false,true);face([-half,0,0],-Math.PI/2,d,false,true);
   if(support){b.box([0,-.14,0],[w+.48,.34,d+.4],'#574b41','wood');for(const s of [-1,1]){b.beam([s*w*.39,-1.26,-d*.32],[s*w*.39,-.2,d*.42],.21,.25,'#7c644d');b.box([s*w*.39,-.52,deep+.03],[.24,.66,.35],wood,'wood');}}
   if(dormer){const xx=w*.28,dz=d*.06;b.box([xx,h+rise*.55,dz],[.65,1.48,.72],'#a87f64','wall');for(let i=0;i<3;i++)b.box([xx,h+rise*.29+.4*i,dz],[.69,.08,.76],'#806b58','metal');b.box([xx,h+rise*.55+.82,dz],[.89,.22,.91],'#7d6654','metal');}
 });
}
function landing(b,x,y,z,w,d,yaw,rnd){
 b.local([x,y,z],[0,yaw,0],()=>{
  b.box([0,0,0],[w,.20,d],'#5d4b3e','wood');
  for(let i=0;i<Math.ceil(w/.48);i++){const u=(i+.5)/Math.ceil(w/.48);b.box([(u-.5)*w,.13,0],[w/Math.ceil(w/.48)-.045,.085,d],select(oak,rnd),'wood');}
  const p=[[-w/2,.18,-d/2],[-w/2,.18,d/2]];
  for(let i=1;i<=Math.ceil(w/1.16);i++)p.push([-w/2+w*i/Math.ceil(w/1.16),.18,d/2]);
  p.push([w/2,.18,-d/2]);rail(b,p,.84);
  for(const s of [-1,1])b.beam([s*w*.35,-1.55,-d*.5],[s*w*.35,-.1,d*.4],.17,.2,'#685647');
 });
}
function cottageCluster(b,rnd){
 const buildings=[
  {x:1.9,y:29.62,z:-3.9,w:4.53,d:7.08,h:4.75,rise:2.48,yaw:1.34,cl:'#d5c7a8',dormer:true},
  {x:3.7,y:28.32,z:-7.2,w:4.36,d:5.20,h:4.09,rise:2.25,yaw:-.56,cl:'#c5baa0',dormer:true},
  {x:-3.25,y:33.16,z:-4.45,w:3.12,d:3.89,h:3.77,rise:2.37,yaw:.23,cl:'#c6b38c',dormer:true},
  {x:4.7,y:26.15,z:1.28,w:5.24,d:4.41,h:3.54,rise:1.99,yaw:-.26,cl:'#d8cdad'},
  {x:8.52,y:23.68,z:-3.59,w:4.39,d:5.49,h:3.76,rise:2.12,yaw:-.50,cl:'#d8ceae',dormer:true},
  {x:-8.5,y:23.6,z:-6.48,w:4.04,d:3.96,h:3.38,rise:1.96,yaw:.31,cl:'#c4baa2'},
  {x:4.9,y:22.78,z:9.28,w:2.23,d:4.35,h:2.06,rise:1.08,yaw:1.53,cl:'#d7c9aa',support:true},
  {x:9.40,y:21.80,z:6.85,w:2.84,d:2.46,h:2.0,rise:1.24,yaw:.73,cl:'#d4c6a2',support:true,lit:true},
  {x:-7.20,y:21.23,z:9.23,w:2.22,d:3.57,h:2.14,rise:1.12,yaw:1.20,cl:'#c3b89c',support:true},
  {x:11.96,y:18.90,z:4.59,w:3.16,d:2.73,h:2.40,rise:1.24,yaw:.90,cl:'#d4c7a8',support:true,dormer:true},
  {x:-12.11,y:20.25,z:.04,w:4.1,d:2.81,h:2.85,rise:1.48,yaw:-1.35,cl:'#c7b89c',support:true},
  {x:-9.70,y:17.99,z:-5.44,w:3.74,d:3.53,h:2.59,rise:1.56,yaw:-1.72,cl:'#ccbea2',support:true},
  {x:1.69,y:20.41,z:-10.27,w:4.76,d:3.35,h:3.31,rise:1.74,yaw:Math.PI-.12,cl:'#d8ccaa',support:true,lit:true},
  {x:6.77,y:19.85,z:-8.93,w:3.38,d:2.85,h:2.94,rise:1.78,yaw:2.74,cl:'#c2b59a',support:true},
  {x:-1.05,y:16.03,z:-10.06,w:3.03,d:2.46,h:3.08,rise:1.50,yaw:Math.PI+.07,cl:'#c6b89d',support:true}
 ];
 for(const h of buildings)house(b,h,rnd);
 landing(b,1.78,20.16,-12.14,5.95,2.15,Math.PI-.12,rnd);
 landing(b,-13.57,20.08,-.1,4.71,1.70,-Math.PI*.49,rnd);
 // Paired dormers with narrow casements sit directly on the main joined roof.
 for(const off of [-1.24,1.28])house(b,{x:4.12,y:34.38,z:-3.9+off,w:1.44,d:1.46,h:.88,rise:.77,yaw:Math.PI/2+.08,cl:'#d9c9a7',over:.13},rnd);
}

function stack(b,pts,baseRadius,color,rnd){
 const curve=new THREE.CatmullRomCurve3(pts.map(asV),false,'centripetal');
 const frames=curve.computeFrenetFrames(40,false);
 const profile=[[0,1.35],[.10,1.18],[.22,1.03],[.40,1.03],[.58,.85],[.75,.77],[.83,.8],[.90,.99],[.94,1.16],[1,1.13]];
 function radius(t){let i=0;while(i<profile.length-2&&t>profile[i+1][0])i++;const [a,ar]=profile[i],[e,er]=profile[i+1];return baseRadius*lerp(ar,er,(t-a)/(e-a));}
 function basis(t){const n=Math.min(39,Math.floor(t*40)),s=t*40-n;return [frames.normals[n].clone().lerp(frames.normals[n+1],s).normalize(),frames.binormals[n].clone().lerp(frames.binormals[n+1],s).normalize()];}
 function p(a,t,dr=0){const [n,bn]=basis(t),rr=radius(t)*(1+.018*Math.sin(a*5+t*.7))+dr;return curve.getPointAt(t).addScaledVector(n,Math.cos(a)*rr).addScaledVector(bn,Math.sin(a)*rr);}
 for(let j=0;j<profile.length-1;j++){
  const bot=profile[j][0],top=profile[j+1][0];for(let k=0;k<6;k++){
   const a0=(k+(j%2)*.17)*TAU/6+.001,a1=a0+TAU/6-.002;
   b.surf(5,3,(u,t)=>p(lerp(a0,a1,u),lerp(bot,top,t)),j===8?'#64584f':k===1||k===4?color:select([color,color,'#8a6b59','#76665d'],rnd),'metal',false,1,1);
  }
 }
 for(const t of [.04,.19,.40,.575,.825,.925,.991]){
  const pos=curve.getPointAt(t),axis=curve.getTangentAt(t),r=radius(t);
  b.ring(pos,axis,r+.01,baseRadius*(t>.89?.128:t===.40?.145:.085),t>.89?'#766a5d':t===.40?'#a38b70':'#645a52','metal',24);
  if(t===.40||t===.825){b.ring(curve.getPointAt(t+.016),axis,r+.018,.055,'#b39876','metal',22);if(t===.4)for(let i=0;i<8;i++)inkBolt(b,p((i+.3)*TAU/8,t,.10),.08,'#b7a587');}
 }
 b.surf(26,2,(u,t)=>p(u*TAU,1-t*.10,-baseRadius*.16),'#393736','shadow',false);
 const top=curve.getPointAt(1),axis=curve.getTangentAt(1),bottom=curve.getPointAt(.895);
 b.cylinder(bottom.clone().addScaledVector(axis,-.06),bottom,.84*radius(.89),.84*radius(.89),'#29292a','shadow',24);
 return top.clone();
}
function millsAndVents(b,rnd,createStack,secondary){
 const stacks=[
  {p:[[5.2,26.2,-5.9],[6.8,29.8,-6.8],[7.75,35.6,-7.35],[8.88,42.56,-7.56]],r:1.15,c:'#846653'},
  {p:[[9.10,23.3,-2.90],[10.8,26.8,-3.85],[11.85,32.5,-4.90],[13.17,39.85,-5.5]],r:1.18,c:'#806355'},
  {p:[[-5.85,30.45,-5.65],[-6.18,34.43,-5.85],[-5.94,38.75,-6.07],[-6.25,41.09,-6.37]],r:.81,c:'#788073'},
  {p:[[-9.47,26.6,-2.65],[-10.28,29.8,-3.2],[-11.18,33.4,-3.33],[-12.0,36.83,-3.50]],r:.64,c:'#8f6957'}
 ];
 for(const s of stacks)createStack(s);
 // An open watch cabin on a spindly mast gives the skyline its uneven fork.
 {const hinge=secondary('Spring mounted lookout mast',v(-1,34.7,1.12)),b=hinge.batch;
 const stem=[-1.00,34.7,1.12],top=[-.32,42.01,.67];
 b.cylinder(stem,top,.34,.25,'#635d53','metal',12);b.ring([-.36,41.74,.7],up,.38,.10,'#9b805d','brass',16);
 b.cylinder([-.34,41.72,.70],[-.34,42.0,.70],1.36,1.43,'#736a51','metal',14);
 b.cylinder([-.34,42,.7],[-.34,42.98,.7],1.02,1.10,'#494b43','shadow',13);
 for(let i=0;i<8;i++){const a=i*TAU/8,rad=1.19;b.local([-.34+Math.sin(a)*rad,42.60,.70+Math.cos(a)*rad],[0,a,0],()=>{b.box([0,0,0],[.26,1.14,.22],'#ab9772');b.box([0,-.42,.01],[.80,.27,.17],'#aca080');});}
 b.cylinder([-.34,43.06,.70],[-.34,43.29,.70],1.44,1.28,'#827962','metal',16);
 b.cylinder([-.34,43.29,.70],[-.34,43.53,.70],1.27,.25,'#928472','metal',16);
 b.cylinder([-.34,43.45,.70],[-.33,44.0,.70],.065,.04,'#6d6251','metal',7);
 const a=[-.63,39.62,.85];b.beam(a,[4.82,39.99,.94],.12,.17,'#625747','metal');
 b.beam([-.56,38.88,.86],[3.9,39.95,.95],.10,.12,'#8b775b','metal');
 b.path([[-4.29,39.6,1.06],[-2.33,39.82,.97],a,[2.06,39.83,.9],[4.82,39.99,.94]],.06,'#a48a61','metal',12,5);
 for(const x of [-4.05,-3.86,3.88,4.65]) b.cylinder([x,39.72,.97],[x,40.23,.97],.038,.035,'#716956','metal',5);
 hinge.finish();}
 // Smaller conical roofs and old organ pipes break the cluster of chimneys.
 const tower=(x,y,z,r,h)=>{b.cylinder([x,y,z],[x,y+h,z],r,r*.93,'#b4a28a','wall',16);for(let i=0;i<7;i++){const a=i*TAU/7;b.local([x+Math.sin(a)*r,y+h*.48,z+Math.cos(a)*r],[0,a,0],()=>windowFrame(b,0,0,.34,.69,rnd));}
 b.cylinder([x,y+h,z],[x+.08,y+h+1.71,z-.06],r*1.25,.09,'#9a5143','roof',16);b.ring([x,y+h+.04,z],up,r*1.22,.10,'#6e4b3d','wood',20);};
 tower(-.67,33.08,-1.47,1.08,1.68);tower(-7.55,29.16,-6.36,1.39,2.31);
}
function auxiliary(b,rnd){
 // External steam mains and nested return pipes physically tie the boilers to the hull.
 const pipeSets=[
  {r:1.02,c:'#7e766a',pts:[[9.25,26.52,4.24],[11.42,25.26,4.82],[11.89,22.18,4.64],[12.69,20.40,3.47],[12.42,18.50,4.31],[11.58,17.9,5.37]]},
  {r:.89,c:'#8a6553',pts:[[11.72,18.34,3.72],[13.19,17.05,3.03],[13.37,16.11,.79],[12.90,15.98,-2.26],[11.74,16.96,-3.22]]},
  {r:1.05,c:'#706c66',pts:[[-9.61,23.97,4.41],[-12.02,22.89,4.19],[-12.92,20.73,2.62],[-13.73,19.04,.92],[-13.50,17.12,2.01],[-12.0,16.1,3.90]]},
  {r:.93,c:'#8a6252',pts:[[9.36,26.24,-4.41],[11.27,25.90,-5.0],[12.63,25.2,-6.05],[13.10,24.92,-6.77],[13.04,26.73,-6.4]]},
  {r:1.2,c:'#78645b',pts:[[-6.62,14.49,-7.65],[-5.42,14.04,-9.59],[-2.1,13.80,-10.65],[1.56,14.87,-10.76],[4.50,16.88,-10.05]]},
  {r:.72,c:'#646d49',pts:[[-11.30,16.94,-4.74],[-11.83,14.94,-3.79],[-11.41,13.58,-.81],[-9.4,12.34,1.11],[-7.26,11.46,1.47]]},
  {r:.68,c:'#806b58',pts:[[5.82,11.64,3.77],[9.0,12.85,3.03],[11.54,14.69,1.0],[12.07,16.26,-2.76],[11.4,18.01,-3.95]]}
 ];
 for(const q of pipeSets)tubeWithCollars(b,q.pts,q.r,q.c,'#9a8470',4);
 for(const side of [-1,1]){
   const a=side>0?1.09:-1.07;
   for(let k=0;k<3;k++){
     const p=[hullAt(12.0+k*.45,a*.67,.12),hullAt(12.8+k*.64,a*.93,.20),hullAt(14.42+k*.68,a*1.19,.35),hullAt(15.76+k*.73,a*1.36,.27),hullAt(17.1+k*.60,a*1.45,.15)];
     tubeWithCollars(b,p,.30+k*.045,select(['#6d706a','#776966','#877362'],rnd),'#75695e',2);
   }
 }
 for(const [y,a,r,l] of [[17.65,1.58,1.12,1.45],[17.62,-1.59,1.00,1.62],[20.12,-2.76,.63,.76],[13.5,2.72,.63,.52],[20.85,-.96,.69,1.08],[17.08,.99,.61,.86],[16.48,-2.10,.73,1.18],[22.3,2.13,.70,1.38]]){
  const p=hullAt(y,a,.05),n=v(Math.sin(a),.03,Math.cos(a));port(b,p,n,r,l,'#766960','#9d8c73');
 }
 // Hinged access panels, louvres and small bolted hatches sit tangent to the ship's skin.
 for(const [y,a,w,h] of [[20,1.85,2.7,2.2],[16.75,-.80,2.2,1.65],[21.26,-2.17,2.5,2.15],[13.89,2.23,2.12,1.5],[18.84,2.95,2.48,2.2],[15.75,.85,2.0,1.38]]){
  const p=hullAt(y,a,.32);b.local([p.x,p.y,p.z],[0,a,0],()=>{b.box([0,0,.01],[w,h,.12],'#584e46');b.box([0,0,.095],[w-.19,h-.19,.09],'#655f58');for(let j=0;j<5;j++){b.box([.02,-h*.29+j*h*.143,.17],[w*.77,.13,.19],j%2?'#514b45':'#6c675c','metal',[-.17,0,0]);}for(const sx of [-1,1])for(const sy of [-1,1])inkBolt(b,[sx*(w/2-.15),sy*(h/2-.15),.18],.10,'#a18e76');});
 }
}
function vanes(originalBatch,secondary){
 function sail(sign,zs,tops,bottoms,span){
  const vane=secondary(sign>0?'Starboard shell storm vane':'Port shell storm vane',
    v(sign*(span[1]-2.7),tops[1]-2.24,zs[1]-.17));
  const b=vane.batch;
  const at=(j,u,t)=>{const z=lerp(zs[j],zs[j+1],u),width=lerp(span[j],span[j+1],u),y=lerp(lerp(bottoms[j],bottoms[j+1],u)+.71*Math.sin(u*Math.PI),lerp(tops[j],tops[j+1],u)-.79*Math.sin(u*Math.PI),t);
  return v(sign*(width+.40*Math.sin(Math.PI*t)+.27*Math.sin(Math.PI*u)*Math.sin(Math.PI*t)),y,z);};
  for(let j=0;j<zs.length-1;j++){
   b.surf(8,4,(s,t)=>at(j,s,t),sign>0?['#926b59','#99745f','#96705e'][j]:['#6d7565','#7e7965','#747363'][j],'sail',sign<0);
   for(const t of [0,1])b.path(ringPoints(s=>at(j,s,t),0,1,9),.105,'#69584c','metal',9,6);
   b.path(ringPoints(t=>at(j,0,t),0,1,8),.135,'#685648','metal',8,7);
   if(j===zs.length-2)b.path(ringPoints(t=>at(j,1,t),0,1,8),.135,'#685648','metal',8,7);
   const tip=at(j,0,1),inward=v(sign*(Math.abs(tip.x)-2.7),tip.y-2.24,tip.z-.17);
   b.beam(inward,tip,.16,.16,'#706451','metal');
  }
  vane.finish();
 }
 sail(1,[2.1,-1.18,-5.40,-9.13],[19.5,21.5,23.55,25.23],[15.32,16.05,17.96,20.61],[12.65,14.25,15.12,15.43]);
 sail(-1,[-3.38,-6.29,-9.04,-11.47],[18.66,19.38,20.05,21.28],[15.43,15.20,16.38,17.70],[12.4,13.05,13.4,12.67]);
}

function doorAndFittings(b,rnd,secondary){
 const p=[1.58,20.49,-11.96];
 b.local(p,[0,Math.PI-.12,0],()=>{
  const outline=[[-.63,0],[.63,0],[.63,1.51],[.49,1.83],[.24,1.99],[-.18,2.0],[-.5,1.81],[-.63,1.55]];
  b.face(outline.map(([x,y])=>[x,y,.165]),'#4e4031','wood');
  for(let i=0;i<5;i++){const x=(i-2)*.21,hh=1.7+.17*Math.cos(x*4);b.box([x,hh/2,.22],[.194,hh,.061],i%2?'#79583c':'#826141','wood');}
  b.path(outline.map(([x,y])=>[x,y,.24]),.078,'#59483c','wood',19,7);
  b.box([0,1.22,.262],[.78,.65,.09],'#50453a','wood');b.box([0,1.23,.323],[.62,.48,.04],'#869188','glass');
  b.box([0,1.24,.36],[.062,.5,.06],'#6e543e','wood');b.orb([.35,.76,.39],[.075,.075,.1],'#bd9c65','brass',[0,0,0],8,5);
  b.box([0,-.07,.46],[1.56,.15,.70],'#82735d','wood');
 });
 // An external ladder, tide gauges, copper speaking-tubes and work light.
 const ladder=(x,y,z,height,angle)=>{
  b.local([x,y,z],[0,angle,0],()=>{
   for(const sx of [-.4,.4]){b.cylinder([sx,0,0],[sx,height,0],.068,.067,'#785e49','metal',7);b.path([[sx,height-.1,0],[sx,height+.32,0],[sx,height+.42,-.24],[sx,height+.1,-.44]],.065,'#8e7960','metal',8,6);}
   for(let j=0;j<=Math.floor(height/.49);j++)b.cylinder([-.4,j*.49,0],[.4,j*.49,0],.052,.052,'#94806b','metal',7);
  });
 };
 ladder(-11.52,20.80,5.82,5.35,-1.0);ladder(4.82,16.42,-10.45,4.49,Math.PI-.19);
 for(const [x,y,z,ang] of [[-13.14,22.48,.17,-Math.PI/2],[3.99,22.1,-11.41,Math.PI],[11.43,21.02,6.15,.8]]){
  const hinge=secondary('Wall lantern '+x.toFixed(2),
    v(x+Math.sin(ang)*.52,y+.14,z+Math.cos(ang)*.52));
  b.local([x,y,z],[0,ang,0],()=>b.beam([0,.14,-.18],[0,.14,.57],.11,.12,ink,'metal'));
  {const b=hinge.batch;b.local([x,y,z],[0,ang,0],()=>{b.cylinder([0,-.36,.52],[0,.12,.52],.10,.085,'#b89a65','brass',7);b.orb([0,-.46,.52],[.20,.29,.20],'#c7a16a','glass',[0,0,0],9,6);b.cylinder([0,-.73,.52],[0,-.66,.52],.19,.14,'#685742','metal',9);});hinge.finish();}
 }
 for(const [x,y,z,dx,dz] of [[-3.9,34.31,-6.0,-3.85,-1],[7.14,31.11,-4.93,3.4,1.81],[-8.83,26.66,4.52,-2.50,.90]]){
  b.cylinder([x,y,z],[x+dx*.84,y+1.25,z+dz*.84],.085,.062,'#7d6f56','metal',7);
  cable(b,[[x,y+.08,z],[x+dx*.45,y+.30,z+dz*.45],[x+dx*.84,y+1.25,z+dz*.84]],.031,'#5f594b');
 }
 const s=v(-5.7,31.95,-7.36),e=v(-9.2,27.28,-7.57);
 cable(b,[s,s.clone().lerp(e,.46).add(v(0,-.84,.06)),e],.055,'#69583f');
}
function wheel(b,r,rnd,n=14){
 let shape=new THREE.Shape();
 for(let i=0;i<n*4;i++){const a=i*TAU/(n*4),rr=r*((i%4===1||i%4===2)?1:.88),x=Math.cos(a)*rr,y=Math.sin(a)*rr;if(i===0)shape.moveTo(x,y);else shape.lineTo(x,y);}shape.closePath();
 const hole=new THREE.Path();hole.absarc(0,0,r*.66,0,TAU,true);shape.holes.push(hole);
 const geometry=new THREE.ExtrudeGeometry(shape,{depth:r*.16,bevelEnabled:false,curveSegments:18});b.add(geometry,'#8f7960');
 for(let j=0;j<6;j++){const a=j*TAU/6;b.beam([Math.cos(a)*r*.17,Math.sin(a)*r*.17,r*.08],[Math.cos(a)*r*.77,Math.sin(a)*r*.77,r*.08],r*.125,r*.12,'#8c795f','metal');}
 b.cylinder([0,0,-.04],[0,0,r*.24],r*.23,r*.23,'#605d55','metal',14);
 b.cylinder([0,0,r*.22],[0,0,r*.34],r*.108,r*.113,'#b39768','brass',8);
}
function tailwork(b,rnd){
 const shells=[
  [-7.30,18.09,-7.58,4.64,4.49,3.29,'#745c52'],
  [8.53,18.9,-6.37,4.41,4.36,3.88,'#827368'],
  [11.09,20.22,1.24,3.06,4.66,3.38,'#936650'],
  [-10.33,21.1,.54,3.79,5.24,3.64,'#79685c']
 ];
 for(const [x,y,z,rx,ry,rz,col] of shells){
  b.orb([x,y,z],[rx,ry,rz],col,'metal',[.06,x*.01,.12],24,16);
  for(const [k,co] of [[-.34,'#5f534a'],[.30,'#8c7c66']]){
   const axis=v(.10,1,.02).normalize();
   const points=ringPoints(a=>[x+Math.sin(a)*rx*.95,y+ry*k-.13*Math.cos(a),z+Math.cos(a)*rz*.95],0,TAU,30).slice(0,-1);
   b.path(points,.12,co,'metal',37,7,true);
  }
 }
 // A recessed circular service hatch at the stern, with eight lug bolts.
 port(b,[-5.9,17.35,-9.58],[-.24,.04,-1],1.63,.77,'#70665a','#a38b70');
 tubeWithCollars(b,[[-9.64,21.35,-5.94],[-10.60,21.07,-6.59],[-10.97,19.80,-7.01],[-10.25,18.62,-7.49],[-8.48,18.18,-8.57]],.48,'#938473','#7c6a5a',3);
 tubeWithCollars(b,[[7.89,21.41,-8.0],[9.64,21.22,-7.46],[10.49,20.42,-6.3],[9.94,18.56,-6.2],[9.31,17.92,-6.96]],.40,'#7d806d','#a18b68',3);
}
function machineryAndSheds(b,rnd){
 // Iron elbows descend in front of the boiler shell and feed the manifold at the keel.
 const trunk=[
  {r:.73,p:[[7.61,23.65,8.26],[8.58,23.08,9.11],[9.36,21.91,9.75],[9.82,20.09,10.30],[10.28,18.77,10.41],[10.82,17.88,9.80],[10.93,17.71,8.53]],c:'#787873',collar:'#9b8c78'},
  {r:.79,p:[[-6.41,16.79,9.36],[-8.12,17.21,9.61],[-10.66,17.92,10.02],[-12.36,18.31,10.25]],c:'#747775',collar:'#96816b'},
  {r:.64,p:[[-6.45,12.51,7.09],[-8.02,12.64,8.13],[-10.04,13.43,8.55],[-11.29,14.39,7.83],[-11.98,15.81,6.75]],c:'#626e71',collar:'#827567'},
  {r:.49,p:[[-6.60,11.93,6.39],[-8.62,12.21,7.63],[-10.61,13.1,7.83],[-11.93,14.35,6.81],[-12.42,16.07,5.57]],c:'#687375',collar:'#8e7966'},
  {r:.35,p:[[-7.12,11.55,5.65],[-9.04,11.93,6.99],[-11.0,12.82,6.97],[-12.26,14.07,5.72],[-12.80,15.84,4.64]],c:'#757a70',collar:'#7a6d5e'},
  {r:.53,p:[[5.58,11.35,-4.56],[7.59,11.69,-4.80],[9.46,12.94,-3.60],[10.73,14.23,-3.76],[11.63,15.18,-5.04]],c:'#716f64',collar:'#8a7964'}
 ];
 for(const f of trunk)tubeWithCollars(b,f.p,f.r,f.c,f.collar,4);
 port(b,[-12.14,18.26,10.22],[-.92,.22,.20],.75,.56,'#6d726e','#9a8b76');
 port(b,[10.89,17.86,9.18],[.24,-.035,1],.57,.52,'#747269','#968573');
 for(const [s,a,yy] of [[1,1.00,24.3],[-1,-1.06,23.63]]){
  const p0=hullAt(yy,a,.42),p1=hullAt(yy-2.15,a+s*.14,.57),p2=hullAt(yy-4.88,a+s*.24,.48);
  tubeWithCollars(b,[p0,p1,p2],.25,'#8b806d','#a18f75',3);
 }
 // Broad cheek plates sit tangent to the curvature, with a second folded flange and an oval hatch.
 for(const side of [-1,1]){
  const x=side;
  b.path([[x*5.83,14.54,13.04],[x*6.48,15.63,13.33],[x*7.43,17.05,13.20],[x*8.43,18.13,12.48]],.115,'#ac9076','metal',12,7);
  b.path([[x*7.71,14.78,12.04],[x*8.27,15.67,12.12],[x*8.56,16.73,12.0],[x*8.71,17.78,11.77]],.085,'#665b50','metal',10,6);
  for(let k=0;k<6;k++){const t=k/5;inkBolt(b,[x*(6.13+1.43*t),14.89+t*2.33,13.18+.10*Math.sin(t*Math.PI)],.105,'#ad977e');}
 }
 // Old cable and conduit follow the ship's curves, with brackets where the wall changes direction.
 const conduits=[
 [[-11.84,24.79,3.77],[-11.61,25.55,4.64],[-10.66,26.21,6.03],[-9.91,26.78,6.66]],
 [[9.25,24.0,5.66],[10.28,24.41,4.63],[11.15,24.18,2.79],[11.71,23.41,1.21]],
 [[-10.73,16.39,6.01],[-11.22,16.11,5.01],[-11.65,15.39,3.43],[-11.87,14.68,2.53]],
 [[-3.76,29.74,-7.51],[-4.71,29.44,-8.18],[-5.92,28.12,-8.29],[-6.44,27.68,-8.02]],
 [[3.25,19.82,-10.83],[3.97,18.89,-11.21],[5.16,18.31,-10.87],[6.61,18.46,-10.08]]
 ];
 for(const line of conduits){
  for(let j=0;j<2;j++){const p=line.map(([x,y,z])=>[x,y+j*.17,z+j*.055]);b.path(p,.070, j?'#897456':'#736956','metal',13,6);}
  for(const k of [0,2]){const [x,y,z]=line[k];b.box([x,y+.09,z],[.17,.37,.19],'#8e816e');}
 }
 function shed(x,y,z,w,h,depth,yaw,col,roof,rise,spokes){
  b.local([x,y,z],[0,yaw,0],()=>{
   const D=depth*.5,e=.18;
   b.box([0,h*.5,0],[w,h,depth],col,'wall');
   b.box([0,.04,0],[w+.30,.18,depth+.27],'#645143','wood');
   for(const s of [-1,1])b.box([s*(w*.5-.09),h*.49,D+.02],[.15,h,.17],'#6e5743','wood');
   const n=Math.max(1,Math.round(w/1.15));for(let i=0;i<n;i++){
    const xx=((i+.5)/n-.5)*w; b.local([xx,h*.19,D+.08],[0,0,0],()=>windowFrame(b,0,0,Math.min(.77,w/(n*1.51)),h*.65,rnd,i===1&&n===3));
   }
   const p=(u,t,off=0)=>v((u-.5)*(w+e*2),h-.04+rise*t-.06*Math.sin(u*Math.PI)+off,lerp(D+e,-D-e,t));
   b.surf(7,3,p,roof,'roof');
   const rows=3,nt=Math.ceil(w/.48);
   for(let j=0;j<rows;j++)for(let k=-1;k<nt;k++){
    const a=Math.max(0,(k+(j%2*.5))/nt),c=Math.min(1,(k+1+(j%2*.5))/nt);if(c<=a)continue;
    b.surf(2,1,(s,t)=>p(lerp(a+.001,c-.001,s),lerp(j/rows+.001,(j+1)/rows+.002,t),.042+.025*Math.sin(s*Math.PI)),mix(roof,select(tile,rnd),.31),'roof');
   }
   b.beam(p(0,0),p(1,0),.12,.12,'#594a3c','wood');
   for(const sx of [-1,1]){b.beam(p(sx<0?0:1,0),p(sx<0?0:1,1),.14,.12,'#765b45','wood');if(spokes)b.beam([sx*w*.37,-.78,-D*.63],[sx*w*.37,-.10,D+.11],.16,.17,'#68584a','wood');}
  });
 }
 shed(3.55,25.95,9.96,4.07,1.48,1.35,.03,'#bcb9a0','#8d5743',.62,true);
 shed(-8.11,23.12,9.42,3.43,1.43,1.32,-.48,'#c2b59b','#865540',.56,true);
 shed(-11.78,18.59,-4.28,3.76,1.51,1.51,-1.96,'#b9b7a1','#8b624d',.61,true);
 shed(10.74,23.03,-5.35,3.36,1.58,1.56,2.13,'#bdb89b','#8e5a46',.60,true);
 // Heavy iron slings connect the port shoulder to the central keel beneath the foredeck.
 for(const side of [-1,1])for(let j=0;j<3;j++){
  const x=side*(6.15+j*.84),z=7.25-j*.46;
  b.beam([x,13.82+j*.26,z+1.20],[side*(7.75+j*.85),12.44+j*.35,z-.84],.34,.39,'#6b6254','metal');
 }
 // Aft radiator and twin service lockers break up the round stern.
 b.local([-4.37,19.46,-10.18],[0,Math.PI+.27,-.035],()=>{
  b.box([0,0,0],[2.66,2.02,.30],'#786e61');for(let j=0;j<6;j++)b.box([0,-.69+j*.265,.24],[2.18,.12,.19],j%2?'#615d55':'#8b8170','metal',[-.22,0,0]);
  for(const x of [-1.12,1.12])for(const y of [-.8,.8])inkBolt(b,[x,y,.24],.11,'#ac987c');
 });
}

function jointCross(b,y,r,col,brass=false){
 b.cylinder([-r*1.12,y,0],[r*1.12,y,0],r,r,col,'metal',14);
 for(const s of [-1,1]){
   b.cylinder([s*r*.99,y,0],[s*r*1.18,y,0],r*.92,r*.90,'#655d4f','metal',14);
   b.cylinder([s*r*1.12,y,0],[s*r*1.23,y,0],r*.68,r*.68,brass?'#9c865a':'#8f7c61','metal',12);
   b.cylinder([s*r*1.21,y,0],[s*r*1.29,y,0],r*.27,r*.26,'#554f45','metal',8);
 }
}
function constructBone(b,type,L,side){
 if(type===0){
  jointCross(b,.09,1.13,'#75685a',true);
  b.cylinder([0,.32,0],[0,L*.65,0],.97,.68,'#85715b','metal',14);
  b.cylinder([0,L*.54,0],[0,L*.78,0],.78,.61,'#8e795d','metal',12);
  b.cylinder([0,L*.73,0],[0,L,0],.49,.39,'#777161','metal',12);
  for(const s of [-1,1]){
   b.beam([s*.78,.50,.25],[s*.44,L*.76,.16],.29,.60,'#8a755d','metal');
   b.cylinder([s*.62,L*.37,-.38],[s*.42,L*.88,-.22],.18,.15,'#aa9c82','metal',9);
  }
  for(const f of [.20,.47,.68])b.ring([0,L*f,0],up,lerp(.96,.61,f),.12,'#685c4f','metal',16);
 }else if(type===1){
  jointCross(b,.03,.94,'#70695b',true);
  b.cylinder([0,.14,0],[0,L*.52,0],.73,.54,'#85765e','metal',12);
  b.cylinder([0,L*.46,0],[0,L*.91,0],.46,.38,'#a19377','metal',12);
  b.cylinder([0,L*.79,0],[0,L,0],.48,.40,'#696856','metal',12);
  for(const s of [-1,1]){
   b.beam([s*.49,.36,.18],[s*.32,L*.78,.12],.23,.36,'#82735a','metal');
   for(const f of [.20,.38,.58])b.cylinder([s*.30,L*f,-.18],[s*.54,L*f,-.18],.09,.09,'#b3a17d','metal',8);
  }
  for(const f of [.27,.48,.83])b.ring([0,L*f,0],up,.69-.24*f,.096,'#655e51','metal',14);
 }else{
  jointCross(b,.035,.60,'#827455',true);
  b.cylinder([0,.08,0],[0,L*.68,0],.44,.32,'#8a7d63','metal',12);
  b.cylinder([0,L*.62,0],[0,L,.01],.36,.29,'#777363','metal',12);
  for(const s of [-1,1])b.cylinder([s*.31,.27,.08],[s*.24,L*.88,.02],.095,.087,'#aa9c81','metal',8);
  for(const f of [.17,.65])b.ring([0,L*f,0],up,.41-.10*f,.073,'#615d4f','metal',12);
 }
}

function solePlate(b,outline,y,thickness,rim){
 const lower=outline.map(([x,z])=>[x,y,z]),upper=outline.map(([x,z])=>[x,y+thickness,z]);
 b.face(upper.slice().reverse(),rim,'metal');b.face(lower,'#58544a','metal');
 for(let i=0;i<outline.length;i++){
  const j=(i+1)%outline.length;
  b.face([lower[i],upper[i],upper[j],lower[j]],i%3===1?'#766c58':'#625d50','metal');
 }
}

function toeSegment(b,points,radii,tip=false){
 for(let i=0;i<points.length-1;i++){
  const last=i===points.length-2, color=tip&&last?'#a18d73':i===0?'#81755e':'#938066';
  b.cylinder(points[i],points[i+1],radii[i],radii[i+1],color,'metal',10);
  if(i>0)b.orb(points[i],[radii[i]*1.15,radii[i]*.90,radii[i]*1.05],'#887c63','metal',[0,0,0],9,6);
 }
}

function buildFoot(parent,mat,side,record){
 const shoe=new THREE.Group();shoe.name='Riveted walking shoe';parent.add(shoe);
 const center=new Batch(mat);
 solePlate(center,[[-.76,-.48],[-.47,-1.04],[.42,-1.04],[.78,-.58],[.90,.50],[.53,1.02],[-.62,.93],[-.90,.42]],.026,.185,'#796c58');
 center.orb([0,.42,.04],[.84,.40,1.06],'#89795d','metal',[0,0,side*.038],16,9);
 jointCross(center,.57,.43,'#7a7059',true);
 for(const s of [-1,1])center.cylinder([s*.59,.41,-.50],[s*.63,.42,.62],.13,.11,'#a49374','metal',9);
 const toes=new THREE.Group(),tips=new THREE.Group(),heel=new THREE.Group();
 toes.name='Three forward toe hinges';tips.name='Distal claws';heel.name='Heel cleat';
 toes.position.set(0,.255,.51);tips.position.set(0,0,.94);heel.position.set(0,.21,-.55);
 shoe.add(toes,heel);toes.add(tips);
 const roots=new Batch(mat),ends=new Batch(mat),hind=new Batch(mat);
 for(const [dx,dz] of [[-1.45,2.72],[.04,3.38],[1.48,2.72]]){
  const cross=dx*.72, end=dz-.51-.94;
  toeSegment(roots,[[dx*.19,.082,0],[dx*.45,.041,.47],[cross,.004,.94]],[.34,.29,.235]);
  ends.orb([cross,0,0],[.28,.235,.255],'#8d8066','metal',[0,0,0],10,6);
  toeSegment(ends,[[cross,0,0],[dx*.87,-.045,end*.46],[dx*.965,-.108,end*.80],[dx,-.185,end]],[.245,.22,.148,.052],true);
  ends.orb([dx*.89,-.111,end*.54],[.205,.112,.31],'#756d59','metal',[0,0,0],10,5);
 }
 toeSegment(hind,[[0,.11,0],[-.075,.018,-.54],[-.13,-.050,-.97],[-.15,-.148,-1.23]],[.34,.27,.20,.055],true);
 record.triangles+=center.finish(shoe)+roots.finish(toes)+ends.finish(tips)+hind.finish(heel);
 return {shoe,toes,tips,heel};
}

function buildLeg(parent,body,mat,leg,index,record){
 const {side,fore}=leg;
 const hip=v(side*(fore?8.10:8.23),fore?12.71:12.38,fore?5.36:-5.65);
 const toeBase=v(side*(fore?10.23:10.42),0,fore?6.40:-5.57);
 const airShoe=v(side*(fore?7.13:7.02),fore?10.23:10.06,fore?2.03:-8.11);
 const lengths=[5.58,5.50,3.41],bones=[];
 for(let j=0;j<3;j++){
  const n=new THREE.Group();n.name=`${leg.name} ${['hip yoke','knee piston','hock'][j]}`;
  const b=new Batch(mat);constructBone(b,j,lengths[j],side);record.triangles+=b.finish(n);parent.add(n);bones.push(n);
 }
 const foot=buildFoot(parent,mat,side,record);
 const ram=new THREE.Group(),link=new Batch(mat);
 link.cylinder([0,0,0],[0,.52,0],.24,.245,'#756a56','metal',10);
 link.cylinder([0,.50,0],[0,.63,0],.287,.269,'#aa9472','metal',12);
 link.cylinder([0,.60,0],[0,1,0],.152,.148,'#b6a78b','metal',10);
 record.triangles+=link.finish(ram);parent.add(ram);
 const A=v(),B=v(),C=v(),D=v(),P=v(),airP=v(),groundHock=v(),skyHock=v(),pole=v(),axis=v(),lateral=v();
 const V=v(),W=v(),right=v(),upAxis=v(),normal=v(),frame=new THREE.Matrix4();
 const shoeGround=new THREE.Quaternion(),shoeAir=new THREE.Quaternion(),qEuler=new THREE.Euler(0,0,0,'YXZ');
 const airRotation=new THREE.Quaternion().setFromEuler(qEuler.set(-1.02,side*(fore?.12:.19),side*.16,'YXZ'));
 function align(g,a,b,nominal){
  upAxis.copy(b).sub(a);const length=upAxis.length();upAxis.multiplyScalar(1/Math.max(length,.001));
  right.copy(lateral).addScaledVector(upAxis,-lateral.dot(upAxis)).normalize();normal.crossVectors(right,upAxis);
  g.position.copy(a);g.quaternion.setFromRotationMatrix(frame.makeBasis(right,upAxis,normal));g.scale.set(1,length/nominal,1);
 }
 function update(state){
  const pose=state.feet[index],tuck=pose.tuck,stance=GAIT.stance;
  P.copy(toeBase);P.x+=side*pose.sideArc;P.z+=pose.travel;
  P.y=pose.lift+Math.max(0,Math.sin(pose.pitch)*3.15-pose.lift,-Math.sin(pose.pitch)*1.75-pose.lift);
  airP.copy(airShoe).applyMatrix4(body.matrix);
  if(pose.direction){airP.x+=pose.direction.swingX;airP.y+=pose.direction.swingY;airP.z+=pose.direction.swingZ;}
  P.lerp(airP,tuck);
  shoeGround.setFromEuler(qEuler.set(pose.pitch,side*(fore?.105:.16)+side*.046*pose.gather,side*.042*pose.gather,'YXZ'));
  shoeAir.copy(body.quaternion).multiply(airRotation);
  foot.shoe.position.copy(P);foot.shoe.quaternion.copy(shoeGround).slerp(shoeAir,tuck);
  foot.toes.rotation.x=.63*tuck+.050*pose.gather*(1-tuck);
  foot.tips.rotation.x=1.23*tuck+.065*pose.gather*(1-tuck);foot.heel.rotation.x=1.17*tuck;
  A.copy(hip).applyMatrix4(body.matrix);
  D.set(0,.565,.035).applyQuaternion(foot.shoe.quaternion).add(P);
  const anklePitch=.40+.18*Math.cos(Math.PI*Math.min(1,pose.phase/stance))+.25*pose.gather;
  const span=Math.sqrt(lengths[2]*lengths[2]-.43*.43);
  groundHock.set(-side*.43,span*Math.cos(anklePitch),-span*Math.sin(anklePitch));
  skyHock.set(side*.87,-.72,-3.22).normalize().applyQuaternion(body.quaternion);
  groundHock.normalize().lerp(skyHock,tuck).normalize();C.copy(D).addScaledVector(groundHock,lengths[2]);
  axis.copy(C).sub(A);const dx=axis.length();axis.multiplyScalar(1/Math.max(.001,dx));
  pole.set(side*lerp(.49,1.18,tuck),-.32*tuck,lerp(1,.29,tuck));
  pole.addScaledVector(axis,-pole.dot(axis)).normalize();
  const ad=clamp((lengths[0]**2-lengths[1]**2+dx*dx)/(2*Math.max(dx,.001)),.002,lengths[0]-.002);
  B.copy(A).addScaledVector(axis,ad).addScaledVector(pole,Math.sqrt(Math.max(.0001,lengths[0]**2-ad*ad)));
  lateral.set(1,0,0).applyQuaternion(body.quaternion);
  align(bones[0],A,B,lengths[0]);align(bones[1],B,C,lengths[1]);align(bones[2],C,D,lengths[2]);
  V.copy(A).lerp(B,.48).addScaledVector(lateral,side*.75);V.z-=.28;
  W.copy(B).lerp(C,.48).addScaledVector(lateral,side*.59);W.z-=.18;align(ram,V,W,1);
 }
 return {update,foot:foot.shoe,bones};
}


function createCastle(){
 const mat=materials(), group=new THREE.Group(),body=new THREE.Group(),rnd=random(240909),b=new Batch(mat);
 group.name='Howl’s walking castle';body.name='Boiler shell and town';group.add(body);
 const anchors={smokestacks:[],door:v(1.53,21.25,-12.48),doorstep:v(1.78,20.42,-13.06),face:v(0,21,13.25),roof:v(1.9,36.5,-4.0),mast:v(-.34,43.40,.70),body};
 const stats={triangles:0,drawCalls:0,staticParts:0};
 hull(b,rnd);tailwork(b,rnd);
 pod(b,{x:-4.83,z:-1.92,y:22.24,h:14.62,rx:6.93,rz:6.29,angle:-.15,mainEye:true,shift:.5,colors:['#70695f','#7c6f60','#756e64','#6b706b','#827366'],band:'#a99d86',upper:'#737d7b',eyes:[[-.49,.823,.88,.70],[.39,.814,.87,.65],[-1.57,.72,.46,.33]]},rnd);
 pod(b,{x:-8.05,z:2.45,y:18.55,h:10.37,rx:5.10,rz:4.53,angle:-.18,shift:2.5,colors:['#6c706f','#746d64','#716c65','#737672','#776d60'],band:'#8a8a7c',upper:'#767a75',eyes:[[-1.25,.79,.63,.75],[-1.86,.76,.51,.65]]},rnd);
 pod(b,{x:4.70,z:4.40,y:18.40,h:14.45,rx:6.18,rz:5.82,angle:.12,mainEye:true,shift:4,colors:['#806a5d','#8b705e','#867566','#786f62','#8e7564'],band:'#b3a78b',upper:'#79847e',eyes:[[-.39,.818,.91,.77],[.43,.81,.95,.75],[1.91,.72,.46,.51]]},rnd);
 let secondaryParts=0;
 function secondary(name,p) {
  const hinge=new THREE.Group(), rest=new THREE.Group(), batch=new Batch(mat);
  hinge.name=name;hinge.position.copy(p);rest.position.copy(p).multiplyScalar(-1);
  hinge.add(rest);body.add(hinge);
  return {batch, finish(){secondaryParts+=batch.count;stats.triangles+=batch.finish(rest);}};
 }
 bow(b,rnd);cottageCluster(b,rnd);auxiliary(b,rnd);vanes(b,secondary);machineryAndSheds(b,rnd);doorAndFittings(b,rnd,secondary);
 const stacks=[];
 millsAndVents(b,rnd,s=>{
  const socket=asV(s.p[0]),stackMesh=new THREE.Group(),metal=new Batch(mat);
  stackMesh.name='Riveted flue';stackMesh.position.copy(socket);body.add(stackMesh);
  const top=stack(metal,s.p.map(p=>asV(p).clone().sub(socket)),s.r,s.c,rnd);
  stats.triangles+=metal.finish(stackMesh);
  const anchor=top.clone().add(socket);anchors.smokestacks.push(anchor);stacks.push({stackMesh,top,anchor});
 },secondary);
 for(const sx of [-1,1])for(const f of [-1,1]){
  const x=sx*(f>0?8.1:8.23),z=f>0?5.36:-5.65;
  b.orb([x,13.11,z],[1.68,1.35,1.62],'#756b59','metal',[.0,.12,sx*.12],16,10);
  b.cylinder([x-sx*.6,12.77,z],[x+sx*1.22,12.77,z],1.06,.82,'#8d7c62','metal',16);
  b.ring([x+sx*.96,12.77,z],[sx,0,0],.86,.13,'#635e54','metal',18);
 }
 stats.staticParts=b.count+secondaryParts;stats.triangles+=b.finish(body);
 const movable=[];
 // A spoked hoist beside the port shoulder hangs outside the shell on a triangular bracket.
 const hoistMount=new THREE.Group(),hoist=new THREE.Group();hoistMount.position.set(-12.56,28.22,3.34);hoistMount.rotation.y=-.35;hoistMount.rotation.x=.13;hoistMount.add(hoist);body.add(hoistMount);
 const wh=new Batch(mat);wh.ring([0,0,0],Z,1.69,.105,'#8c816e','metal',32);wh.ring([0,0,-.22],Z,1.63,.07,'#636355','metal',28);
 for(let i=0;i<8;i++){const a=i*TAU/8;wh.cylinder([Math.cos(a)*.23,Math.sin(a)*.23,-.06],[Math.cos(a)*1.64,Math.sin(a)*1.64,0],.071,.058,'#81745d','metal',7);}
 wh.cylinder([0,0,-.28],[0,0,.21],.32,.25,'#6d695b','metal',12); stats.triangles+=wh.finish(hoist);movable.push([hoist,-.14]);
 const ax=new Batch(mat);
 for(const [a,c,w] of [[[-8.95,27.88,3.13],[-12.59,28.22,3.19],.16],[[-9.55,25.85,2.83],[-12.66,28.22,3.08],.15],[[-8.63,28.68,1.60],[-12.68,28.22,3.13],.11]])ax.beam(a,c,w,w,'#766b57','metal');
 cable(ax,[[-12.37,26.58,3.18],[-12.42,25.71,3.10],[-12.58,24.39,3.04]],.050,'#625b4b');
 stats.triangles+=ax.finish(body);
 for(const [x,y,z,angle,r,sp] of [[13.11,18.65,.87,1.52,1.03,.20],[-12.78,17.66,2.34,-1.38,.83,-.26],[-8.49,22.63,-7.86,-2.5,.66,.24]]){
  const mount=new THREE.Group(),disc=new THREE.Group();mount.position.set(x,y,z);mount.rotation.y=angle;mount.add(disc);body.add(mount);
  const wb=new Batch(mat);wheel(wb,r,rnd,Math.round(12+r*4));stats.triangles+=wb.finish(disc);movable.push([disc,sp]);
 }
 const legs=GAIT.legs.map((leg,i)=>buildLeg(group,body,mat,leg,i,stats));
 const flightRig=createFlightRig(body,mat,Batch,stats);
 const pivot=v(0,15.9,0),rotatedPivot=v();
 let motion;
 function update(t,options={}){
  motion=sampleLocomotion(t,options);const pose=motion.body;
  if(options.direction){
   const cue=options.direction;motion.direction=cue;
   const air=cue.airborne;
   pose.pitch=pose.pitch*(1-air)+cue.pitch;pose.yaw=pose.yaw*(1-air)+cue.yaw;
   pose.roll=pose.roll*(1-air)+cue.roll;pose.y+=cue.compressY;
   for(let i=0;i<motion.feet.length;i++){
    const f=motion.feet[i],shoe=cue.feet[i],b=shoe.brace;
    f.travel+=(shoe.stanceTravel-f.travel)*b;f.lift*=1-b;f.pitch*=1-b;f.gather*=1-b;f.sideArc*=1-b;
    f.tuck=shoe.tuck;f.planted=b>=1?shoe.planted:f.planted;f.direction=shoe;
   }
  }
  body.rotation.set(pose.pitch,pose.yaw,pose.roll,'YXZ');
  rotatedPivot.copy(pivot).applyQuaternion(body.quaternion);
  body.position.set(pose.x,pose.y,pose.z).add(pivot).sub(rotatedPivot);
  body.updateMatrix();
  for(const {update:moveLeg} of legs)moveLeg(motion);
  flightRig.update(t,motion);
  for(const [disc,sp] of movable)disc.rotation.z=t*sp+motion.flight*.3+pose.pitch*.9;
  for(let i=0;i<stacks.length;i++){
   const {stackMesh,top,anchor}=stacks[i];
   // The flexible stovepipe collars settle a few frames after each shoe takes the weight.
   const lagDistance=motion.distance-motion.speed*(.12+.033*i);
   const delayed=sampleLocomotion(t-.12-.033*i,{...options,distance:lagDistance}).body;
   stackMesh.rotation.z=(delayed.roll-pose.roll)*.57+motion.airborne*.0036*Math.sin(t*.64-i*.4);
   stackMesh.rotation.x=(delayed.pitch-pose.pitch)*.57+motion.airborne*.0033*Math.sin(t*.58+i*.56);
   anchor.copy(top).applyQuaternion(stackMesh.quaternion).add(stackMesh.position);
  }
  return motion;
 }
 update(0);group.traverse(o=>{if(o.isMesh)stats.drawCalls++});
 return {group,update,anchors,stats,gait:GAIT,legs,wings:flightRig.wings,get motion(){return motion;}};
}

export { createCastle };
