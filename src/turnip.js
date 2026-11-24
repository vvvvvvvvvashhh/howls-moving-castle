import * as THREE from "../vendor/three.module.js";
import { gesture, sampleTurnipMotion } from "./companions.js";



const TAU=Math.PI*2;
const clamp=THREE.MathUtils.clamp;
const headRings=[[-.192,.013,.014],[-.180,.084,.078],[-.155,.152,.116],[-.120,.202,.150],[-.067,.242,.178],[-.005,.255,.190],[.067,.250,.187],[.118,.229,.170],[.152,.186,.148],[.179,.113,.099],[.187,.036,.031]];
const chestRings=[[2.52,.242,.153],[2.63,.232,.158],[2.72,.220,.152],[2.83,.232,.166],[2.99,.287,.184],[3.14,.340,.191],[3.28,.361,.202],[3.35,.327,.157],[3.41,.187,.109]];

function interpolated(rows,y,col){
  if(y<=rows[0][0])return rows[0][col];
  for(let i=1;i<rows.length;i++)if(y<rows[i][0]){
    const a=rows[i-1],b=rows[i],t=(y-a[0])/(b[0]-a[0]);return a[col]+(b[col]-a[col])*t;
  }
  return rows[rows.length-1][col];
}
function grid(uCount,vCount,sample,reverse=false){
  const points=[],uvs=[],colors=[],indices=[];
  for(let j=0;j<=vCount;j++)for(let i=0;i<=uCount;i++){
    const u=i/uCount,v=j/vCount,p=sample(u,v);points.push(p[0],p[1],p[2]);uvs.push(u,v);
    if(p.length>3)colors.push(p[3],p[4],p[5]);
    if(i<uCount&&j<vCount){const a=j*(uCount+1)+i,b=a+1,c=a+uCount+1,d=c+1;
      if(reverse)indices.push(a,d,b,a,c,d);else indices.push(a,b,d,a,d,c);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  if(colors.length)g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
function curvedRod(points,radii,radial=9,steps=0){
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal');
  const count=steps||Math.max(8,points.length*4),frames=curve.computeFrenetFrames(count,false);
  return grid(radial,count,(u,v)=>{
    const j=Math.round(v*count),p=curve.getPointAt(v),f=v*(radii.length-1),i=Math.floor(f),r=THREE.MathUtils.lerp(radii[i],radii[Math.min(i+1,radii.length-1)],f-i);
    p.addScaledVector(frames.normals[j],r*Math.cos(u*TAU));p.addScaledVector(frames.binormals[j],r*Math.sin(u*TAU));return p.toArray();
  });
}
function mesh(parent,geometry,material,position=[0,0,0]){
  const o=new THREE.Mesh(geometry,material);o.position.set(...position);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;
}
function obj(parent,x=0,y=0,z=0){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);return g;}
const unitBall=new THREE.SphereGeometry(1,18,12);
function ball(parent,m,at,scale){const o=mesh(parent,unitBall,m,at);o.scale.set(...scale);return o;}
function cord(parent,m,pts,r,radial=8,steps=0){return mesh(parent,curvedRod(pts,Array.isArray(r)?r:pts.map(()=>r),radial,steps),m);}
function seeded(initial){let n=initial;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
function canvasTexture(width,height,draw){const c=document.createElement('canvas');c.width=width;c.height=height;draw(c.getContext('2d'),width,height);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;}
function clothWeave(){
  const texture=canvasTexture(192,192,(c,w,h)=>{
    const rng=seeded(831);c.fillStyle='#d8d8d6';c.fillRect(0,0,w,h);
    for(let i=0;i<h;i+=2){c.fillStyle=i%4?'rgba(77,75,82,.10)':'rgba(255,255,248,.20)';c.fillRect(0,i,w,1);}
    for(let i=0;i<w;i+=2){c.fillStyle=i%4?'rgba(49,45,48,.08)':'rgba(255,255,255,.20)';c.fillRect(i,0,1,h);}
    for(let i=0;i<850;i++){const x=rng()*w,y=rng()*h;c.strokeStyle=rng()>.48?'rgba(245,235,209,.31)':'rgba(58,52,53,.13)';c.lineWidth=.4+rng()*.6;c.beginPath();c.moveTo(x,y);c.lineTo(x+1+rng()*4,y+1.3+rng()*1.8);c.stroke();}
  });texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(3,2.5);return texture;
}
function faceTexture(){
  return canvasTexture(1024,512,(ctx,W,H)=>{
    const rng=seeded(86192);
    const rootColor=ctx.createLinearGradient(0,0,0,H);rootColor.addColorStop(0,'#c2bfa7');rootColor.addColorStop(.19,'#e2ddc0');rootColor.addColorStop(.46,'#eae3c9');rootColor.addColorStop(.71,'#e4dabc');rootColor.addColorStop(1,'#c6b79e');ctx.fillStyle=rootColor;ctx.fillRect(0,0,W,H);
    for(let i=0;i<14000;i++){ctx.fillStyle=rng()>.48?'rgba(86,72,43,.075)':'rgba(255,254,231,.18)';ctx.fillRect(rng()*W,rng()*H,.55+rng()*1.8,.6+rng()*1.4);}
    for(let i=0;i<190;i++){const x=rng()*W,y=rng()*H,front=Math.abs(x-W*.5)<W*.18;if(front&&y<H*.71&&y>H*.18)continue;ctx.strokeStyle=`rgba(101,87,65,${.035+.075*rng()})`;ctx.lineWidth=.6+rng()*.95;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+4,y-1-rng()*3,x+5+rng()*14,y-1);ctx.stroke();}
    const f=(x,y)=>[W*(.5+Math.asin(clamp(x/interpolated(headRings,y,1),-.99,.99))/TAU),H*(.187-y)/.379];
    const move=(x,y)=>ctx.moveTo(...f(x,y)),curve=(x1,y1,x2,y2,x3,y3)=>ctx.bezierCurveTo(...f(x1,y1),...f(x2,y2),...f(x3,y3));
    ctx.lineCap='round';ctx.lineJoin='round';
    // The grin follows the surface of the turnip, including both corners.
    ctx.fillStyle='#f6efda';ctx.strokeStyle='#171512';ctx.lineWidth=14.6;ctx.beginPath();move(-.213,-.032);
    curve(-.143,-.008,.095,-.004,.215,-.024);curve(.185,-.102,.085,-.147,-.013,-.146);curve(-.105,-.142,-.181,-.101,-.213,-.032);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.strokeStyle='#242019';ctx.lineWidth=10.3;for(const t of [[-.109,-.019,-.117,-.043,-.108,-.086,-.096,-.119],[.014,-.013,.010,-.042,.016,-.110,.031,-.142],[.130,-.017,.130,-.049,.122,-.085,.115,-.106]]){
      ctx.beginPath();move(t[0],t[1]);curve(...t.slice(2));ctx.stroke();}
    for(const s of [-1,1]){
      const p=f(s*.131,.061+(s>0?.006:0));ctx.fillStyle='#11100e';ctx.beginPath();ctx.ellipse(p[0],p[1],18.6,26.6,s*-.05,0,TAU);ctx.fill();
      ctx.fillStyle='rgba(250,242,212,.48)';ctx.beginPath();ctx.ellipse(p[0]-3.5,p[1]-8.6,2.6,3.6,0,0,TAU);ctx.fill();
    }
    ctx.strokeStyle='rgba(92,77,56,.77)';ctx.lineWidth=3.0;
    for(const marks of [[.185,.085,.215,.083],[.195,.067,.227,.065],[.201,.048,.226,.044],[-.205,.035,-.227,.031],[-.211,.019,-.231,.015]]){
      ctx.beginPath();move(marks[0],marks[1]);ctx.lineTo(...f(marks[2],marks[3]));ctx.stroke();}
    ctx.strokeStyle='rgba(107,87,59,.53)';ctx.lineWidth=2.1;ctx.beginPath();move(-.026,.023);curve(-.024,.027,-.022,.032,-.012,.034);ctx.stroke();
    ctx.beginPath();move(.004,.031);curve(.010,.035,.014,.037,.018,.039);ctx.stroke();
  });
}

// Each moving part keeps a small set of material batches, including the hands and their stitch lines.
function batch(parent){
  const byMaterial=new Map();for(const m of [...parent.children])if(m.isMesh){if(!byMaterial.has(m.material))byMaterial.set(m.material,[]);byMaterial.get(m.material).push(m);}
  for(const [material,list] of byMaterial){if(list.length<2)continue;
    const vertices=[],normals=[],uvs=[],colors=[];
    for(const m of list){m.updateMatrix();const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();g.applyMatrix4(m.matrix);
      for(const [attr,out,size] of [['position',vertices,3],['normal',normals,3],['uv',uvs,2],['color',colors,3]]){
        const a=g.getAttribute(attr);if(!a){if(attr==='color'&&material.vertexColors)for(let q=0;q<g.attributes.position.count;q++)out.push(1,1,1);continue;}
        for(let q=0;q<a.count;q++)size===2?out.push(a.getX(q),a.getY(q)):out.push(a.getX(q),a.getY(q),a.getZ(q));
      }
      parent.remove(m);g.dispose();
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    if(uvs.length)g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));if(colors.length)g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));mesh(parent,g,material);
  }
}

function makeMaterials(){
  const weave=clothWeave();
  const cloth=c=>new THREE.MeshStandardMaterial({color:c,map:weave,roughness:.94,side:THREE.DoubleSide});
  const solid=(c,roughness=.86)=>new THREE.MeshStandardMaterial({color:c,roughness,side:THREE.DoubleSide});
  const tails=cloth('#373a47');tails.vertexColors=true;
  return {coat:cloth('#353844'),lapel:cloth('#42434e'),tail:tails,lining:cloth('#282b36'),crease:cloth('#2b2c37'),pipe:solid('#a7653d'),pipeBand:solid('#ab8752',.63),pipeHole:solid('#312821'),
    shirt:cloth('#d897a2'),vest:cloth('#457b9d'),bow:cloth('#716887'),bowLight:cloth('#81758f'),
    felt:cloth('#303039'),brim:cloth('#292a32'),ribbon:cloth('#b07685'),edge:cloth('#50424c'),thread:cloth('#625946'),
    button:solid('#35323a',.48),buttonWell:solid('#17171e'),buttonThread:solid('#66606c'),wood:solid('#856543'),woodLit:solid('#ac8152'),woodDark:solid('#58452e'),
    skin:new THREE.MeshStandardMaterial({map:faceTexture(),roughness:.96,envMapIntensity:.73}),glove:cloth('#e1dac8'),gloveSeam:cloth('#b6ab93'),straw:solid('#c2a16a'),strawDark:solid('#806840')};
}
function makeHead(head,m){
  const skin=grid(74,43,(u,v)=>{
    const a=(u-.5)*TAU,y=-.192+v*.379,rx=interpolated(headRings,y,1),rz=interpolated(headRings,y,2);
    const ripple=1+.012*Math.sin(3*a+.7)+.008*Math.cos(5*a+y*4);
    return [rx*Math.sin(a)*ripple-.009*(1-v)**2,y+.003*Math.cos(a*2+.65)*(1-Math.abs(v-.5)*2),rz*Math.cos(a)*ripple];
  });mesh(head,skin,m.skin);
  for(let i=0;i<3;i++){const x=(i-1)*.028;cord(head,m.woodLit,[[x,-.171,-.006],[x-.008,-.197,-.012],[x-.015,-.207+(i%2)*.006,-.013]],[.006,.004,.001],6);}
  // The lip of the small cob pipe rests in the far corner of his smile.
  cord(head,m.woodDark,[[.194,-.034,.109],[.275,-.040,.120],[.361,-.044,.120],[.427,-.043,.115]],[.010,.009,.009,.011],10,15);
  const bowl=obj(head,.445,-.038,.113);bowl.rotation.z=-.16;
  const bowlShape=[[.010,-.059],[.034,-.061],[.041,-.049],[.045,.047],[.043,.060],[.031,.064],[.028,.045],[.028,.026],[.001,.025]].map(p=>new THREE.Vector2(...p));
  mesh(bowl,new THREE.LatheGeometry(bowlShape,22),m.pipe);const top=ball(bowl,m.pipeHole,[0,.041,0],[.029,.007,.029]);
  const collar=mesh(bowl,new THREE.TorusGeometry(.0414,.004,6,20),m.pipeBand,[0,.050,0]);collar.rotation.x=Math.PI/2;
  batch(bowl);
  const hat=obj(head,.006,.146,-.003);hat.rotation.set(-.045,-.02,-.075);
  mesh(hat,grid(72,8,(u,v)=>{
    const a=(u-.5)*TAU,r=.209+.246*v,x=Math.sin(a)*r,z=Math.cos(a)*r*.80;
    const curl=(.030*Math.sin(a)**2-.013*Math.cos(a)+.008*Math.sin(3*a+.6))*v*v;
    return [x,.017+curl+.006*Math.cos(v*Math.PI),z];
  }),m.brim);
  const brimEdge=[];for(let i=0;i<=48;i++){const a=i*TAU/48;brimEdge.push([Math.sin(a)*.455,.011+.030*Math.sin(a)**2-.013*Math.cos(a)+.008*Math.sin(3*a+.6),Math.cos(a)*.364]);}
  cord(hat,m.felt,brimEdge,.008,7,77);
  const crownH=.483;
  function crown(u,v){const a=(u-.5)*TAU,r=.198+.031*v-.012*Math.sin(v*Math.PI)+.006*Math.sin(3*a+v*2.4)*v+.009*Math.cos(a*4-.4)*v*v;
    return [Math.sin(a)*r+.037*v*v,.018+crownH*v+.007*Math.sin(3*a+.35)*v*v,Math.cos(a)*r*.87-.024*v];}
  mesh(hat,grid(62,20,crown),m.felt);
  mesh(hat,grid(58,5,(u,v)=>{const h=.026+v*.099,p=crown(u,h/crownH);p[0]*=1.022;p[2]*=1.022;p[1]+=.004*Math.sin((u-.5)*TAU-.7);return p;}),m.ribbon);
  for(const h of [.027,.121]){const thread=[];for(let i=0;i<=40;i++){const p=crown(i/40,h/crownH);p[0]*=1.023;p[2]*=1.023;thread.push(p);}cord(hat,m.edge,thread,.0027,5,57);}
  const upper=[];for(let i=0;i<=54;i++)upper.push(crown(i/54,1));cord(hat,m.edge,upper,.007,6,65);
  mesh(hat,grid(54,6,(u,v)=>{const p=crown(u,1);return [.037+(p[0]-.037)*v,.472+.020*v,-.024+(p[2]+.024)*v];}),m.brim);
  const lid=obj(hat,.038,crownH+.007,-.123);lid.rotation.x=-.64;lid.rotation.z=-.12;
  ball(lid,m.felt,[0,.001,.074],[.20,.018,.152]);
  const scuff=[[.086,.366,.153],[.105,.357,.153],[.117,.351,.153]];cord(hat,m.edge,scuff,.0034,5,8);
  for(let i=0;i<3;i++)cord(hat,m.edge,[[.148,.39+i*.010,.106],[.158,.386+i*.010,.099],[.165,.383+i*.010,.093]],.0028,5,7);
  batch(hat);batch(head);return {hat,lid};
}
function addSuit(body,m){
  function chestSurface(x,y,offset=0){const rx=interpolated(chestRings,y,1),rz=interpolated(chestRings,y,2);return [x,y,rz*Math.sqrt(Math.max(.028,1-(x/rx)**2))+offset];}
  mesh(body,grid(58,30,(u,v)=>{
    const y=2.52+v*.89,a=(u-.5)*TAU;const w=interpolated(chestRings,y,1),d=interpolated(chestRings,y,2);
    const fold=.010*Math.sin(6*a+v*4)+.009*Math.sin(9*a-v*6)*Math.sin(v*Math.PI);
    return [Math.sin(a)*(w+fold),y,Math.cos(a)*(d+fold)];
  }),m.coat);
  function panel(points,material,offset){
    const outline=points.map(p=>new THREE.Vector2(...p));const triangles=THREE.ShapeUtils.triangulateShape(outline,[]),ps=[],us=[],index=[];
    for(let k=0;k<triangles.length;k++){
      const [a,b,c]=triangles[k].map(i=>points[i]),base=ps.length/3,subs=5;
      for(let row=0;row<=subs;row++)for(let col=0;col<=subs-row;col++){
        const ub=col/subs,uc=row/subs,ua=1-ub-uc,x=a[0]*ua+b[0]*ub+c[0]*uc,y=a[1]*ua+b[1]*ub+c[1]*uc;
        ps.push(...chestSurface(x,y,offset));us.push(x*2.7+.5,(y-2.50)*1.3);
        const q=base+row*(subs+1)-row*(row-1)/2+col;
        if(col<subs-row){index.push(q,q+1,q+subs-row+1);if(col<subs-row-1)index.push(q+1,q+subs-row+2,q+subs-row+1);}
      }
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(ps,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(us,2));g.setIndex(index);g.computeVertexNormals();mesh(body,g,material);
  }
  const vest=[[-.209,3.325],[-.111,3.402],[.112,3.402],[.211,3.325],[.180,3.080],[.033,2.787],[-.018,2.820],[-.173,3.074]];
  panel(vest,m.vest,.044);panel([[-.116,3.397],[.132,3.397],[.109,3.244],[.009,3.091],[-.104,3.233]],m.shirt,.068);
  for(const s of [-1,1]){
    const points=[[s*.145,3.394],[s*.269,3.355],[s*.307,3.201],[s*.239,3.225],[s*.265,3.168],[s*.206,3.135],[s*.032,2.839],[s*.117,3.157]];
    panel(points,m.lapel,.069);
    cord(body,m.crease,points.slice(1,7).map(p=>chestSurface(...p,.075)),.0041,6,21);
    panel([[s*.015,3.355],[s*.102,3.482],[s*.169,3.455],[s*.14,3.287],[s*.077,3.311]],m.shirt,.072);
  }
  const button=(x,y,r,z)=>{ball(body,m.button,[x,y,z],[r,r,.009]);for(const s of [-1,1])ball(body,m.buttonWell,[x+s*r*.29,y,z+.008],[r*.12,r*.17,.0027]);};
  for(let k=0;k<3;k++){const y=3.035-.082*k;button(.012,y,.014,chestSurface(.012,y,.059)[2]);}button(.042,2.751,.028,chestSurface(.045,2.751,.047)[2]);
  const bow=obj(body,.002,3.340,.254);
  for(const s of [-1,1]){
    mesh(bow,grid(16,22,(u,v)=>{
      const a=u*TAU,length=v,x=s*(.027+.177*length),ry=.042+.070*Math.sin(length*Math.PI*.52),rz=.030+.024*Math.sin(length*Math.PI);
      return [x,Math.cos(a)*ry+s*.008*length+Math.sin(length*Math.PI*2)*.009,Math.sin(a)*rz+.014*Math.cos(a*2.0)*Math.sin(length*Math.PI)+.012*length];
    },s>0),s>0?m.bow:m.bowLight);
    ball(bow,s>0?m.bow:m.bowLight,[s*.201,s*.007,.010],[.014,.108,.033]);
    for(const sign of [-1,1])cord(bow,m.bow,[[s*.043,sign*.014,.032],[s*.089,sign*.022,.041],[s*.124,sign*.039,.037]], [.004,.004,.001],6);
  }
  ball(bow,m.bow,[0,0,.028],[.050,.056,.040]);batch(bow);
  for(const s of [-1,1])cord(body,m.crease,[[s*.265,3.05,.080],[s*.215,2.86,.070],[s*.189,2.67,.076]],[.003,.004,.003],6,14);
  batch(body);
  return bow;
}

function addSleeve(arm,m,s){
  cord(arm,m.wood,[[s*-.25,.014,-.024],[s*.16,.010,-.018],[s*.53,.016,-.002],[s*.95,.026,.012]],[.035,.038,.032,.027],9,17);
  const center=(t)=>[s*(1.095*t-.170*(1-t)**3),-.038*(1-t)**3-.017*Math.sin(Math.PI*t)-.022*Math.sin(TAU*t)+.010*t,.011*Math.sin(t*Math.PI)+.025*t];
  function ring(u,t){
    const a=u*TAU,p=center(t);
    const shoulder=THREE.MathUtils.smoothstep(t,0,.145);
    const radius=(.137-.038*t+.015*Math.exp(-(((t-.19)/.17)**2))+.020*Math.exp(-(((t-.94)/.12)**2)))*(.18+.82*shoulder);
    const wrinkle=.008*Math.sin(4*a+2.1*t)+.012*Math.cos(3*a-5*t)*Math.sin(t*Math.PI)+.014*Math.sin(29*t+2.3*Math.sin(a))*(1-t)*Math.sin(Math.PI*t);
    const scallop=t**10*(.024*Math.sin(3*a+.6)+.015*Math.cos(a*6-.8)-.062*Math.max(0,1-Math.abs(u-.71)/.065)-.043*Math.max(0,1-Math.abs(u-.21)/.036));
    return [p[0]+s*scallop,p[1]+Math.cos(a)*(radius+wrinkle),p[2]+Math.sin(a)*(radius*.88+wrinkle)];
  }
  mesh(arm,grid(34,39,ring,s<0),m.coat);
  mesh(arm,grid(34,4,(u,v)=>{const outside=ring(u,1),end=center(1);return [outside[0]-s*.072*v,end[1]+(outside[1]-end[1])*(1-.23*v),end[2]+(outside[2]-end[2])*(1-.23*v)];},s>0),m.lining);
  cord(arm,m.wood,[[s*.91,.002,.017],[s*1.01,.012,.024],[s*1.15,.020,.030],[s*1.249,.031,.029]],[.030,.032,.035,.028],10,22);
  const rng=seeded(733+(s+1)*37);
  for(let i=0;i<12;i++){
    const a=rng()*TAU,h=.040+rng()*.048,from=.91+rng()*.095,to=1.105+rng()*.042;
    cord(arm,i%3?m.strawDark:m.straw,[[s*from,Math.sin(a)*.032,.022+Math.cos(a)*.032],[s*(to-.034),Math.sin(a)*h*.7,.02+Math.cos(a)*h*.7],[s*to,Math.sin(a)*h,.022+Math.cos(a)*h]],[.0032,.0030,.0008],5,8);
  }
  for(const u of [.105,.40,.65]){
    const path=[.11,.22,.42,.66,.88,.98].map(t=>ring(u,t));cord(arm,m.crease,path,.0028,5,23);
  }
  const glove=obj(arm,s*1.23,.034,.030);glove.rotation.y=s*.08;glove.rotation.z=s*.055;
  ball(glove,m.glove,[s*.037,.001,.002],[.060,.063,.070]);
  ball(glove,m.glove,[s*.129,.014,.012],[.151,.064,.068]);
  for(const y of [-.026,.026])cord(glove,m.gloveSeam,[[s*.015,y,-.038],[s*.047,y*.87,.036],[s*.065,y*.78,.054]],[.0032,.0041,.0020],5,8);
  const fingers=[
    [[.194,.049,-.028],[.253,.074,-.047],[.308,.114,-.052],[.348,.158,-.047]],
    [[.223,.035,.003],[.295,.061,.011],[.363,.094,.020],[.401,.128,.018]],
    [[.226,.009,.029],[.297,.019,.056],[.351,.047,.078],[.386,.072,.084]],
    [[.210,-.016,.042],[.271,-.021,.087],[.310,.003,.116],[.337,.024,.115]],
    [[.147,-.024,.046],[.185,-.055,.096],[.218,-.089,.116],[.244,-.115,.117]],
  ];
  fingers.forEach((points,i)=>{
    const rr=i===4?.027:i===1?.024:.021;
    const list=points.map(p=>[s*p[0],p[1],p[2]]);cord(glove,m.glove,list,[rr,rr*.92,rr*.75,rr*.45],9,18);
    ball(glove,m.glove,list[list.length-1],[rr*.47,rr*.46,rr*.45]);
    if(i<4){const k=list[1];cord(glove,m.gloveSeam,[[k[0]-s*.012,k[1]+.013,k[2]+rr*.63],[k[0]-s*.005,k[1]+.005,k[2]+rr*.90],[k[0]+s*.005,k[1]+.004,k[2]+rr*.91]],[.0011,.0017,.0009],5,6);}
  });
  for(let i=0;i<3;i++){const yy=(i-1)*.016;cord(glove,m.gloveSeam,[[s*.080,yy,.061],[s*.122,yy+.006,.076],[s*.157,yy+.010,.075]],[.0012,.0020,.0010],5,8);}
  batch(arm);batch(glove);return glove;
}

// The right sleeve keeps its cloth, seams, straw and crossbar when the elbow folds under the pan.
function bentElbow(x,y,z,out) {
  const u=clamp((x-.32)/.38,0,1),angle=1.18*u*u*(3-2*u);
  const c=Math.cos(angle),s=Math.sin(angle),offset=x-.51;
  return out.set(.51+c*offset-s*y,s*offset+c*y,z);
}
function makeCarryingSleeve(arm){
  const p=new THREE.Vector3(),n=new THREE.Vector3(),parts=[];
  for(const mesh of arm.children)if(mesh.isMesh){
    const geometry=mesh.geometry,rest=geometry.attributes.position,normals=geometry.attributes.normal;
    const bent=rest.clone(),bentNormals=normals.clone();
    for(let i=0;i<rest.count;i++){
      const x=rest.getX(i),y=rest.getY(i),z=rest.getZ(i);
      bentElbow(x,y,z,p);bent.setXYZ(i,p.x,p.y,p.z);
      const u=clamp((x-.32)/.38,0,1),angle=1.18*u*u*(3-2*u);
      const c=Math.cos(angle),s=Math.sin(angle),dAngle=1.18*6*u*(1-u)/.38;
      // The inverse transpose keeps the original sleeve folds lit across the elbow.
      const dxDx=c-p.y*dAngle,dxDy=-s,dyDy=c,dyDx=s+(p.x-.51)*dAngle;
      const nx=normals.getX(i),ny=normals.getY(i),nz=normals.getZ(i);
      n.set(dyDy*nx-dyDx*ny,-dxDy*nx+dxDx*ny,(dxDx*dyDy-dxDy*dyDx)*nz).normalize();
      bentNormals.setXYZ(i,n.x,n.y,n.z);
    }
    geometry.morphAttributes.position=[bent];geometry.morphAttributes.normal=[bentNormals];
    geometry.computeBoundingSphere();mesh.updateMorphTargets();parts.push(mesh);
  }
  return parts;
}
function addTail(body,m,s){
  const rows=19,cols=48,flows=[];
  const g=grid(cols,rows,(u,v)=>{
    const a=u*Math.PI,sa=Math.sin(a),ca=Math.cos(a),drop=v;
    const free=drop**1.45,flute=Math.sin(a*5.1+s*.62+drop*2.4),fold=(.023+.061*drop)*flute+.020*drop*Math.cos(a*9-drop*2.8);
    const hem=.018*Math.sin(a*13+.6)+.019*Math.sin(a*21-.8);
    const rips=[[.15,.037,.054],[.28,.028,.085],[.46,.035,.10],[.69,.030,.078],[.83,.032,.063]].reduce((n,[x,w,h])=>n+h*Math.max(0,1-Math.abs(u-x)/w),0);
    const x=s*(sa*.232*(1-.19*drop)+(.82+.29*u+.24*sa)*drop**1.20+sa*fold)-s*1.35*rips*drop**7+.13*free;
    const y=2.73-drop*(1.02-.59*u+.15*sa)+free*(.12*s+.069*flute)+drop**6*(hem+rips*.60);
    const z=ca*(.155+.070*drop+fold)-free*(.29+.29*u)+.115*Math.sin(a*1.4+s*.4)*free+.65*fold;
    const shade=.88+.17*(flute*.5+.5)+.060*Math.cos(a*10+drop*3)+.075*drop**7;
    flows.push([free,Math.sin(a*3.8-drop*2.3+s*.61),Math.cos(a*3.8-drop*2.3+s*.61)]);
    return [x,y,z,shade,shade*(.997-.009*drop),shade*(1.003-.012*drop)];
  },s>0);
  const panel=mesh(body,g,m.tail);panel.frustumCulled=false;
  const positions=g.attributes.position,rest=positions.array.slice();positions.setUsage(THREE.DynamicDrawUsage);
  function flutter(t,motion){
    const st=Math.sin(t*2.31+s*.45),ct=Math.cos(t*2.31+s*.45),slow=Math.sin(t*1.04+s*.8);
    const lift=.43*motion.cloth,lag=.17*motion.tilt;
    for(let i=0;i<positions.count;i++){
      const [w,sn,cs]=flows[i],a=w*(sn*ct+cs*st),k=i*3;
      positions.array[k]=rest[k]+.028*a*s+(.023*slow+lag)*w;
      positions.array[k+1]=rest[k+1]+.044*a+(.015*slow+lift)*w;
      positions.array[k+2]=rest[k+2]+.069*a-(.025*slow+.095*motion.arc+.09*motion.stretch)*w;
    }
    positions.needsUpdate=true;
  }
  return flutter;
}
function addStem(body,m){
  // One slightly bent alder stem carries both the scarecrow and the wooden crossbar.
  const stemPoints=[[.008,.005,0],[.020,.15,-.009],[.016,.67,-.022],[-.026,1.17,-.018],[-.032,1.62,-.017],[-.009,2.02,0],[.006,2.77,-.012],[-.007,3.27,-.028],[.009,3.69,-.020]];
  cord(body,m.wood,stemPoints,[.012,.043,.053,.057,.054,.049,.042,.032,.031],13,73);
  cord(body,m.wood,[[.006,.65,-.018],[.059,.72,-.019],[.097,.772,-.021],[.101,.791,-.024]],[.041,.034,.026,.016],10,14);
  const grain=seeded(1536);for(let i=0;i<12;i++){
    const a=grain()*TAU,ya=.08+grain()*.84,yb=ya+.13+grain()*.43,xc=.012-.034*ya,st=grain()*.007;
    cord(body,i%4?m.woodDark:m.woodLit,[[xc+.044*Math.sin(a),ya,.045*Math.cos(a)-.019],[xc+.047*Math.sin(a)+st,(ya+yb)*.5,.049*Math.cos(a)-.020],[xc+.048*Math.sin(a)+st,yb,.048*Math.cos(a)-.021]],[.0017,.003,.0014],5,8);
  }
  for(let i=0;i<7;i++){const a=i*2.4;cord(body,i%2?m.straw:m.strawDark,[[.02*Math.sin(a),3.34,.02*Math.cos(a)-.017],[.023*Math.sin(a),3.42,.020*Math.cos(a)-.019],[.026*Math.sin(a),3.45,.021*Math.cos(a)-.015]],[.0035,.003,.001],5,7);}
  for(const s of [-1,1]){
    const leg=grid(34,30,(u,v)=>{
      const a=(u-.5)*TAU,curve=Math.sin(v*Math.PI),centerX=s*(.052+.095*curve)-.14*v+.095*Math.sin(v*5.3),centerZ=-.026-.075*v;
      const r=.143+.064*curve-.034*v,rag=v**8*(.05*Math.sin(4*a+.7)+.030*Math.cos(9*a-1));
      return [centerX+Math.sin(a)*r*(1+.09*Math.cos(4*a+v*4)),2.54-v*(1.00+s*.11)+rag,centerZ+Math.cos(a)*r*(.91+.09*Math.sin(5*a+v*4))];
    },true);mesh(body,leg,s<0?m.lining:m.coat);
  }
}
function contactPatch(){
  const tex=canvasTexture(64,64,(c,w)=>{const g=c.createRadialGradient(w/2,w/2,.5,w/2,w/2,w/2);g.addColorStop(0,'rgba(25,28,20,.80)');g.addColorStop(.38,'rgba(26,28,23,.50)');g.addColorStop(1,'rgba(34,36,26,0)');c.fillStyle=g;c.fillRect(0,0,w,w);});
  const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,opacity:.31,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const o=new THREE.Mesh(new THREE.PlaneGeometry(.60,.45),mat);o.position.y=.018;o.rotation.x=-Math.PI/2;return o;
}

function createTurnip(){
  const group=new THREE.Group();group.name='Turnip Head';const rig=obj(group),body=obj(rig),m=makeMaterials();
  addStem(body,m);const bow=addSuit(body,m);
  const tails=[addTail(rig,m,-1),addTail(rig,m,1)];
  const crossbar=obj(rig,0,3.315,0);
  const arms=[-1,1].map(s=>{const arm=obj(crossbar,s*.347,0,0);const glove=addSleeve(arm,m,s);return {arm,glove,s};});
  const right=arms[1],carryParts=makeCarryingSleeve(right.arm),wristRest=right.glove.position.clone();
  const wristBent=bentElbow(wristRest.x,wristRest.y,wristRest.z,new THREE.Vector3());
  const palmMark=obj(right.glove,.174,.006,.004),carryObject=obj(group);carryObject.name='Ash pan resting in the right palm';
  const head=obj(rig,.007,3.790,-.015);const {hat,lid}=makeHead(head,m);
  const faceObject=obj(head,0,.008,.178);faceObject.name='Eyes and grin';
  const footObject=obj(rig,.008,.005,0),groundObject=obj(group),hatObject=obj(hat,.035,.49,-.024);
  const groundShadow=contactPatch();group.add(groundShadow);
  const anchors={face:new THREE.Vector3(.007,3.798,.163),faceObject,footObject,groundObject,hatObject,carryObject,
    foot:new THREE.Vector3(0,0,0),hat:new THREE.Vector3(0,4.54,0)};
  let meshCount=0,triangles=0;group.traverse(o=>{if(o.isMesh){meshCount++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});
  function update(t,options={}){
    const {action='idle',local=t,energy=1}=options;
    const k=sampleTurnipMotion(local,action,energy);
    const greeting=action==='greet',follow=action==='travel';
    const hold=clamp(Number(options.holdFire||0),0,1);
    const hello=options.wave??(greeting?(
      .61*gesture(local,.18,.88,1.80)+gesture(local,1.64,2.66,3.58)+.42*gesture(local,3.68,4.37,5.10)
    ):hold*(.59*gesture(local,-.20,.45,1.65)+.39*gesture(local,2.65,3.35,4.40)));
    const look=options.look??(greeting?-.72*gesture(local,0,.48,1.71)+.77*gesture(local,1.31,2.56,4.05):0);
    const headLift=greeting?.80*hello:0;
    const backwardGlance=follow?hold*(1-THREE.MathUtils.smootherstep(local,1.54,2.75)):0;
    const greetGlance=greeting?(.52*gesture(local,.02,.49,1.38)+gesture(local,1.61,2.56,3.55)+.72*gesture(local,3.55,4.14,4.91)):0;
    rig.position.set(0,k.height,0);
    const squash=.071*k.gather+.073*k.impact-.028*k.stretch-.016*k.rebound;
    rig.scale.set(1+.18*squash,1-squash,1+.13*squash);
    rig.rotation.set(.011*Math.sin(t*1.55)-.081*k.gather+.079*k.stretch+.065*k.impact+(follow?.044:0)*k.arc,
      .026*Math.sin(t*.79)+.072*k.tilt+.093*backwardGlance,.015*Math.sin(t*1.68)+.154*k.roll-.047*hello);
    const nod=-.059+.020*Math.sin(t*1.82)+.093*k.gather+.066*k.impact-.14*headLift;
    const glance=.071*Math.sin(t*.89-.6)+(.41+.52*hold)*look+.062*k.tilt;
    head.rotation.set(THREE.MathUtils.lerp(nod,.117+.12*k.arc,Math.max(greetGlance,backwardGlance)*.91),
      THREE.MathUtils.lerp(THREE.MathUtils.lerp(glance,.14,greetGlance),1.35+.075*k.arc,backwardGlance*.94),
      .039+.032*Math.sin(t*1.13)-.105*k.tilt+.119*hello);
    crossbar.rotation.z=.100*(1-2*hold)*hello+.056*k.roll-.029*k.impact;
    arms.forEach(({arm,glove,s})=>{
      const greetingHand=(s>0?1-hold:hold)*hello;
      arm.rotation.z=s*(.016+.102*k.arc-.097*k.gather-.109*k.impact+.045*k.rebound+.021*Math.sin(t*2.03+s*.68)
        +greetingHand*(.33+.05*Math.sin(local*7.1))-.05*(s<0?hello:0));
      arm.rotation.y=s*(.033+.026*Math.sin(t*1.47+s*.5)+.085*k.stretch-.075*k.impact+.145*greetingHand);
      if(s<0)arm.rotation.y-=.42*hold;
      glove.rotation.z=s*(.055+.048*Math.sin(t*2.12+s*.61)+.12*k.cloth
        +greetingHand*(.16+.19*Math.sin(local*8.7-.55)));
      glove.rotation.y=s*(.08+.06*k.tilt+.20*greetingHand*Math.cos(local*8.7-.55));
    });
    for(const mesh of carryParts)mesh.morphTargetInfluences[0]=hold;
    right.glove.position.lerpVectors(wristRest,wristBent,hold);
    right.arm.rotation.z=THREE.MathUtils.lerp(right.arm.rotation.z,-1.30+.047*k.impact-.026*k.tilt,hold);
    const trayYaw=greeting?-.31:-.86;
    right.arm.rotation.y=THREE.MathUtils.lerp(right.arm.rotation.y,trayYaw+.049*k.tilt,hold);
    right.glove.rotation.x=.90*hold;
    right.glove.rotation.z=THREE.MathUtils.lerp(right.glove.rotation.z,1.30+.032*k.impact,hold);
    right.glove.rotation.y=THREE.MathUtils.lerp(right.glove.rotation.y,.012,hold);
    palmMark.getWorldPosition(carryObject.position);group.worldToLocal(carryObject.position);
    carryObject.position.y+=.065;
    carryObject.rotation.set(.025*k.cloth,0,.032*k.roll);
    hat.position.y=.146+.045*k.impact+.023*k.rebound+.015*k.arc;
    hat.rotation.set(-.045-.052*k.stretch+.053*k.impact-.092*hello,-.02+.044*k.tilt,
      -.075-.104*k.tilt+.046*k.roll-.062*hello);
    lid.rotation.x=-.60-.11*k.stretch-.11*k.arc+.07*k.impact+.050*Math.sin(t*2.45);
    bow.rotation.set(-.13*k.stretch+.105*k.impact,.074*k.tilt,.047*Math.sin(t*3.3)+.103*k.cloth);
    tails.forEach(flutter=>flutter(t,k));
    groundShadow.material.opacity=.31/(1+.72*k.height);groundShadow.scale.setScalar(1+.41*k.height);
    return k;
  }
  update(0);return {group,update,anchors,stats:{meshes:meshCount,triangles:Math.round(triangles)}};
}

export { createTurnip, sampleTurnipMotion };
