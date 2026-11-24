import * as THREE from "../vendor/three.module.js";
import { TAU, clamp, mix, noise, fbm, smooth, prng, heightAt, lakeDistance, texCanvas } from "./landforms.js";

const pick=(list,r)=>list[Math.floor(r()*list.length)];
const woods=[
  [-57,-73,25,17,70],[-112,-105,42,22,118],[-154,-77,32,23,95],
  [47,-160,25,20,75],[111,-192,56,24,135],[181,-120,23,36,112],
  [179,-52,29,18,75],[-184,38,36,47,105],[-116,103,38,22,79],
  [205,81,42,33,100],[81,150,45,18,78],[-16,-196,40,30,89],
  [240,-193,62,32,123],[-247,-180,70,28,110],
];
function inTown(x,z,margin=0) {return x>-140-margin&&x<-69+margin&&z>-59-margin&&z<61+margin;}
function planted(x,z){return lakeDistance(x,z)>1.028 && !inTown(x,z) && Math.hypot(x,z)>11.9;}
function gauss(r){return (r()+r()+r()+r()-2)*.88;}
function materialForCard(texture,time,windAmt){
  const m=new THREE.MeshLambertMaterial({map:texture,alphaTest:.28,side:THREE.DoubleSide});
  m.onBeforeCompile=shader=>{
    shader.uniforms.uMeadowSeconds=time;
    // A clump is a canopy with an upward-facing lighting normal. Back-face
    // rasterisation must not turn this normal into a downward-facing one.
    const sameLightBothSides=THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '');
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',sameLightBothSides);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float uMeadowSeconds;')
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        vec2 rootXZ=instanceMatrix[3].xz;
        float breeze=sin(dot(rootXZ,vec2(.176,.129))+uMeadowSeconds*1.31)+.43*sin(dot(rootXZ,vec2(-.079,.23))-uMeadowSeconds*1.86);
        transformed.x+=${windAmt.toFixed(3)}*position.y*position.y*breeze;
        transformed.z+=${(windAmt*.27).toFixed(3)}*position.y*position.y*breeze;
      `);
  };
  m.customProgramCacheKey=()=>String(windAmt);return m;
}
function cardGeom(cross=true) {
  const p=[],uv=[],ind=[],norm=[];
  for(let f=0;f<(cross?2:1);f++){
    const angle=f*Math.PI/2+.07,dx=Math.cos(angle),dz=Math.sin(angle),first=p.length/3;
    for(let y=0;y<=1;y++)for(let side=0;side<2;side++){
      const k=(side-.5)*(1-y*.045);
      p.push(dx*k+.027*y,y,dz*k-.017*y);uv.push(side,y);norm.push(0,1,0);
    }
    ind.push(first,first+2,first+1,first+1,first+2,first+3);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ind);g.computeBoundingSphere();return g;
}
function makePlanting(group,geom,mat,points,name,shadow=false){
  if(!points.length) return;
  const mesh=new THREE.InstancedMesh(geom,mat,points.length),o=new THREE.Object3D(),color=new THREE.Color();
  points.forEach((p,i)=>{
    o.position.set(p[0],p[1],p[2]);o.rotation.set(p[7]||0,p[3],p[8]||0);o.scale.set(p[4],p[5],p[6]);o.updateMatrix();mesh.setMatrixAt(i,o.matrix);
    const tint=p[9]||1;color.setRGB(tint,tint*(.99+.01*(i%3)),tint*(.96+.02*(i%4)));mesh.setColorAt(i,color);
  });
  mesh.name=name;mesh.castShadow=shadow;mesh.receiveShadow=shadow;mesh.computeBoundingSphere();group.add(mesh);return mesh;
}
function blade(ctx,x,y,xt,yt,width,bend,color) {
  const mx=(x+xt)*.5+bend,my=(y+yt)*.5;
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x-width*.5,y);
  ctx.quadraticCurveTo(mx-width*.37,my,xt,yt);
  ctx.quadraticCurveTo(mx+width*.4,my+1.3,x+width*.5,y);ctx.fill();
}
function grassTexture(seed,wheat=false) {
  return texCanvas(192,192,(ctx,w,h)=>{
    const r=prng(seed), colors=wheat?['#83945a','#95a55f','#aab667','#b4bc77','#839450','#bec782']:['#769651','#87a455','#94aa57','#a1b65f','#b2bd70','#839e55'];
    for(let i=0;i<42;i++){
      const x=w*(.075+.85*r()),y=h*(.94+.055*r()),hi=h*(.12+.72*r()),delta=(r()-.45)*hi*.70;
      blade(ctx,x,y,x+delta,y-hi,1.7+r()*3.0,delta*.19,pick(colors,r));
      if(wheat&&hi>h*.57&&r()<.52) {
        const xx=x+delta,yy=y-hi,aa=Math.atan2(delta,hi);
        ctx.save();ctx.translate(xx,yy);ctx.rotate(aa);ctx.strokeStyle='#a29959';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(0,2);ctx.lineTo(0,-14);ctx.stroke();
        for(let j=0;j<5;j++){const s=j%2?1:-1;ctx.fillStyle=pick(['#a9a565','#bdb478','#c6bc82'],r);ctx.beginPath();ctx.ellipse(s*2,-j*2.1,1.6,3.3,s*.7,0,TAU);ctx.fill();}
        ctx.restore();
      }
    }
  });
}
function flowerTexture(seed,kind){
  const palettes={
    daisy:['#e3dfb3','#fff5cc','#fbf7dd','#edeaca'],butter:['#ebae35','#ffd443','#f8c236','#ffdc71'],
    blue:['#7384b4','#859ed0','#a0a5cd','#6876b2'],rose:['#e78d96','#eda3a6','#f5b6bf','#d67a92']
  };
  return texCanvas(256,256,(ctx,w,h)=>{
    const r=prng(seed),leaf=['#638a51','#73974e','#8aab54','#829b51','#769953'],petals=palettes[kind],flowers=[];
    for(let i=0;i<27;i++){
      const bx=w*(.17+.64*r()), by=h*(.94+.055*r()),len=h*(.09+.35*r());const ex=bx+(r()-.45)*len*.92;
      blade(ctx,bx,by,ex,by-len,2+r()*6,(r()-.5)*9,pick(leaf,r));
    }
    for(let s=0;s<8;s++){
      const x=w*(.29+.42*r()),y=h*.985, hi=h*(.39+.43*r()),xt=clamp(x+(r()-.48)*hi*.71,26,w-23),yt=y-hi;
      const mx=(x+xt)*.5+(r()-.5)*19;
      ctx.lineWidth=1.4+r()*1.2;ctx.strokeStyle=pick(leaf,r);ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(mx,yt+hi*.40,xt,yt);ctx.stroke();
      for(let j=0;j<5;j++){
        const v=.12+j*.12, xx=mix(x,xt,v), yy=y-hi*v,side=(j+s)%2?1:-1;
        const len=(11+r()*19)*(1-v*.6);blade(ctx,xx,yy,xx+len*side,yy-len*(.27+.45*r()),3+r()*4.4,side*5,pick(leaf,r));
      }
      flowers.push([xt,yt,5+r()*4.2,r()*TAU]);
      if(kind==='blue'){
        for(let j=0;j<4;j++){const f=.065*j;flowers.push([xt+(j%2?1:-1)*(4+4*r()),yt+hi*f,3.5+r()*2,r()*TAU]);}
      }else if(kind==='butter'&&s%2===0){
        const xx=xt+14*r()-7,yy=yt+13+r()*12;
        ctx.lineWidth=1.5;ctx.strokeStyle=pick(leaf,r);ctx.beginPath();ctx.moveTo(mix(x,xt,.7),y-hi*.7);ctx.lineTo(xx,yy);ctx.stroke();
        flowers.push([xx,yy,3+r()*2,r()*TAU]);
      }
    }
    flowers.sort((a,b)=>a[1]-b[1]);
    for(const [x,y,rr,rot] of flowers) {
      const petalCount=kind==='daisy'?8:5,tilt=.60+r()*.35;
      ctx.save();ctx.translate(x,y);ctx.rotate((r()-.5)*.45);ctx.scale(1,tilt);
      for(let p=0;p<petalCount;p++){
        const angle=p/petalCount*TAU+rot,ss=(.78+r()*.25)*rr;
        ctx.save();ctx.rotate(angle);ctx.fillStyle=pick(petals,r);ctx.beginPath();ctx.ellipse(0,-ss*.62,ss*(kind==='daisy'?.24:.39),ss*.58,0,0,TAU);ctx.fill();ctx.restore();
      }
      ctx.fillStyle=kind==='blue'?'#e5ca7b':kind==='rose'?'#d3a852':'#c48a35';ctx.beginPath();ctx.ellipse(0,0,rr*.28,rr*.25,0,0,TAU);ctx.fill();
      ctx.fillStyle=kind==='daisy'?'#e5bd53':'#ffe0a0';ctx.beginPath();ctx.ellipse(-rr*.08,-rr*.08,rr*.13,rr*.08,-.4,0,TAU);ctx.fill();ctx.restore();
    }
  });
}
function coniferGeometry(seed) {
  const r=prng(seed),p=[],c=[],uv=[];
  const collect=(v,co)=>{p.push(...v);c.push(co.r,co.g,co.b);uv.push(0,0);};
  const tri=(a,b,d,ca,cb=ca,cd=ca)=>{collect(a,ca);collect(b,cb);collect(d,cd);};
  const dark=new THREE.Color('#395d58'),green=new THREE.Color('#4c7664'),tip=new THREE.Color('#799474'),brown=new THREE.Color('#625b49'),bark=new THREE.Color('#847559');
  const v=(a,y,rr,cx=0,cz=0)=>[cx+Math.cos(a)*rr,y,cz+Math.sin(a)*rr];
  for(let i=0;i<5;i++){
    const a=i*TAU/5,b=(i+1)*TAU/5;tri(v(a,0,.027),v(b,0,.027),v(b,.76,.008),brown,bark,bark);
    tri(v(a,0,.027),v(b,.76,.008),v(a,.76,.008),brown,bark,brown);
  }
  const layers=8,leanX=(r()-.5)*.034,leanZ=(r()-.5)*.04;
  for(let k=0;k<layers;k++){
    const t=k/(layers-1),level=.18+t*.70;
    const radius=(.23*(1-t*.83))*(.90+r()*.14),n=k===7?5:8;
    const shift=r()*TAU,cx=leanX*level,cz=leanZ*level;
    for(let j=0;j<n;j++){
      const a=shift+j*TAU/n+(r()-.5)*.14,da=TAU/n,sz=radius*(.84+.22*r()),down=.038+.031*r()+(1-t)*.026;
      const base=[cx,level+.105*(1-t*.5),cz],l=v(a-da*.60,level+down*.13,sz*.53,cx,cz),rt=v(a+da*.60,level+down*.09,sz*.58,cx,cz);
      const end=v(a,level-down,sz,cx,cz),blade=v(a-.06,level+.012,sz*.69,cx,cz);
      const up=green.clone().lerp(tip,.13*r()+.41*t),sh=dark.clone().lerp(green,.19+r()*.28),edge=green.clone().lerp(tip,.23+r()*.19);
      tri(base,l,end,up,sh,edge);tri(base,end,rt,up,edge,sh);
    }
  }
  const pt=[leanX,1.08,leanZ];
  for(let i=0;i<5;i++)tri(pt,v(i*TAU/5,.89,.041,leanX,leanZ),v((i+1)*TAU/5,.89,.041,leanX,leanZ),tip,green,green);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));g.computeVertexNormals();g.computeBoundingSphere();return g;
}
function ghostSpruce(seed){
  return texCanvas(162,256,(ctx,w,h)=>{
    const r=prng(seed),cols=['#3f6459','#496b5b','#507459','#55785d','#608365','#51765e'];
    const cx=w*.51,base=h*.987;ctx.fillStyle='#635a46';ctx.beginPath();ctx.moveTo(cx-w*.019,base);ctx.lineTo(cx+w*.018,base);ctx.lineTo(cx,10);ctx.fill();
    for(let i=0;i<31;i++){
      const q=i/31,y=mix(h*.84,h*.08,q),ww=(1-q*.91)*w*(.31+.09*r());
      for(let j=0;j<5;j++){
        const s=(j%2===0)?1:-1,rr=ww*(.46+.64*r()),dy=2+r()*13+(1-q)*6;
        ctx.fillStyle=pick(cols,r);ctx.beginPath();ctx.moveTo(cx+r()*3,y+5);
        ctx.quadraticCurveTo(cx+s*rr*.55,y+dy*.37,cx+s*rr,y+dy);
        ctx.lineTo(cx+s*rr*.73,y+dy*.85+1);ctx.lineTo(cx+s*rr*.77,y+dy*1.15+3);
        ctx.lineTo(cx+s*rr*.43,y+dy*.97);ctx.lineTo(cx+s*rr*.49,y+dy*1.41+3);
        ctx.quadraticCurveTo(cx+s*ww*.23,y+dy,cx-s,y+10);ctx.fill();
      }
    }
    ctx.fillStyle='#5a755a';ctx.beginPath();ctx.moveTo(cx+1,2);ctx.lineTo(cx-4,29);ctx.lineTo(cx+5,29);ctx.fill();
  });
}
function rockGeometry(seed,detail=1){
  const g=new THREE.IcosahedronGeometry(1,detail),p=g.attributes.position,c=[],r=prng(seed),offX=50*r(),offZ=50*r();
  const base=new THREE.Color('#999b90'),crack=new THREE.Color('#727d76'),light=new THREE.Color('#c6c4a8'),moss=new THREE.Color('#a2ad7e'),cc=new THREE.Color();
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),v=noise(x*3+offX,z*3+y*8+offZ);
    const rad=.85+v*.25,up=y>0?Math.min(.82,y*.93+.072*noise(x*8,y*9+z)):y;
    p.setXYZ(i,x*rad+up*.13,up*(.9+.10*v),z*(.88+.19*v));
    cc.copy(crack).lerp(base,smooth(-.5,.48,y)).lerp(light,.4*v).lerp(moss,.58*smooth(.42,.79,y)*smooth(.4,.72,v));
    c.push(cc.r,cc.g,cc.b);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));g.computeVertexNormals();g.computeBoundingSphere();return g;
}
function plantRocks(group) {
  const r=prng(13951),sets=[[],[],[],[]],hubs=[[5,72],[40,53],[-29,44],[63,-54],[27,-72],[-34,7],[56,14],[-60,70],[174,-108],[139,-177],[81,-148],[-149,-24],[89,55]];
  function put(x,z,s){
    const d=lakeDistance(x,z);if(d<.97||inTown(x,z,2)||Math.hypot(x,z)<20)return;
    const y=heightAt(x,z),sh=.30+r()*.40;
    sets[(s<.74?0:2)+Math.floor(r()*2)].push([x,y+s*.06,z,r()*TAU,s,s*sh,s*(.58+r()*.5),(r()-.5)*.2,(r()-.5)*.17,.87+r()*.18]);
  }
  hubs.forEach(([x,z],n)=>{
    const size=n%3===0?1.6:1.05;put(x,z,size*(1+r()*1.35));
    for(let j=0;j<14;j++)put(x+gauss(r)*4.2,z+gauss(r)*3.6,(.16+r()**2*1.05)*size);
  });
  for(let i=0;i<148;i++){
    const a=r()*TAU,d=.975+r()*.105;
    const u=77*Math.cos(a)*d,v=48*Math.sin(a)*d;put(114+Math.cos(.55)*u+Math.sin(.55)*v,-112-Math.sin(.55)*u+Math.cos(.55)*v,.19+r()**2*1.3);
  }
  const mat=new THREE.MeshLambertMaterial({vertexColors:true});
  for(let k=0;k<4;k++)makePlanting(group,rockGeometry(780+k*71,k<2?0:1),mat,sets[k],'Glacial granite and lichen '+k,true);
  return sets.reduce((s,v)=>s+v.length,0);
}
function forestContact(group,sets){
  const map=texCanvas(96,96,(ctx,w,h)=>{
    const g=ctx.createRadialGradient(48,48,0,48,48,47);g.addColorStop(0,'rgba(49,69,56,.83)');g.addColorStop(.35,'rgba(55,75,58,.66)');g.addColorStop(.78,'rgba(64,78,60,.23)');g.addColorStop(1,'rgba(69,85,63,0)');
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  });
  const positions=sets.flat().filter((p,i)=>Math.hypot(p[0],p[2])<220||i%3===0);
  const material=new THREE.MeshBasicMaterial({map,transparent:true,opacity:.31,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2});
  const geometry=new THREE.PlaneGeometry(1,1);geometry.rotateX(-Math.PI*.5);
  const mesh=new THREE.InstancedMesh(geometry,material,positions.length),o=new THREE.Object3D(),up=new THREE.Vector3(0,1,0),normal=new THREE.Vector3(),q=new THREE.Quaternion().setFromAxisAngle(up,Math.PI*.29);
  positions.forEach((p,i)=>{
    const h=p[5],x=p[0]+h*.18,z=p[2]-h*.18,rad=1.05;
    normal.set(heightAt(x-rad,z)-heightAt(x+rad,z),2*rad,heightAt(x,z-rad)-heightAt(x,z+rad)).normalize();
    o.position.set(x,heightAt(x,z)+.085,z);o.quaternion.setFromUnitVectors(up,normal).multiply(q);o.scale.set(h*.84,1,h*.44);o.updateMatrix();mesh.setMatrixAt(i,o.matrix);
  });
  mesh.computeBoundingSphere();mesh.name='Dappled contact shade beneath spruce stands';group.add(mesh);
}
function plantWoods(group,time) {
  const r=prng(37429),real=[[],[],[]],cards=[[],[]],hubs=woods.slice();
  for(let k=0;k<21;k++){const a=k/21*TAU+r()*.12,rad=234+r()*96;hubs.push([Math.cos(a)*rad,Math.sin(a)*rad,22+r()*27,18+r()*19,30+Math.floor(r()*55)]);}
  for(const [cx,cz,rx,rz,n] of hubs){
    for(let j=0;j<n;j++) {
      const x=cx+gauss(r)*rx,z=cz+gauss(r)*rz,d=Math.hypot(x,z);
      if(d<50||lakeDistance(x,z)<1.046||inTown(x,z,5))continue;
      const patch=fbm(x*.033+5,z*.04-7);
      if(r()>.53+patch*.52)continue;
      const h=(4.6+r()**.8*9.6)*(d>240?1.1:1),variate=.75+r()*.47,y=heightAt(x,z)-.12;
      const detail=d<210&&r()<(d<122?.31:.145);
      if(detail)real[Math.floor(r()*3)].push([x,y,z,r()*TAU,h*variate,h,h*variate,(r()-.5)*.038,(r()-.5)*.065,.77+.26*r()]);
      else cards[Math.floor(r()*2)].push([x,y,z,r()*TAU,h*(.58+r()*.13),h,h*.65,0,0,.80+.27*r()]);
    }
  }
  const mat=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
  for(let k=0;k<3;k++)makePlanting(group,coniferGeometry(384+k*472),mat,real[k],'Norway spruce with drooping branch whorls '+k,true);
  const cm=cardGeom();for(let k=0;k<2;k++)makePlanting(group,cm,materialForCard(ghostSpruce(93+k*464),time,.002),cards[k],'Distant conifer stands '+k);
  forestContact(group,[...real,...cards]);
  return [...real,...cards].reduce((s,v)=>s+v.length,0);
}
function plantMeadow(group,time) {
  const r=prng(124432),grasses=[[],[]],flowers=[[],[],[],[]],species=['daisy','butter','blue','rose'];
  function grass(x,z,size) {
    if(!planted(x,z))return;
    const k=noise(x*.12,z*.13)>.56?1:0,height=size*(.28+r()*.42),wide=height*(1.30+r()*1.28);
    grasses[k].push([x,heightAt(x,z)-.035,z,r()*TAU,wide,height,wide,0,0,.87+r()*.2]);
  }
  for(let i=0;i<5300;i++)grass(-75+r()*195,-76+r()*184,.68+r()*.54);
  for(let i=0;i<2600;i++)grass(2+gauss(r)*31,58+gauss(r)*25,.70+r()*.74);
  for(let i=0;i<1100;i++)grass(53+gauss(r)*22,-51+gauss(r)*17,.85+r()*.51);
  for(let i=0;i<1800;i++)grass(-165+r()*365,-181+r()*322,.85+r()*.56);
  let clusters=[];
  for(let i=0;i<115;i++)clusters.push([-53+r()*161,-64+r()*160,1.7+r()*5.4,.9+r()*2.7,12+Math.floor(r()*22)]);
  for(let i=0;i<67;i++)clusters.push([20+gauss(r)*30,57+gauss(r)*18,1.9+r()*3.3,1.2+r()*2.4,16+Math.floor(r()*19)]);
  for(let i=0;i<24;i++)clusters.push([56+gauss(r)*22,-52+gauss(r)*17,1.7+r()*3.3,1.25+r()*2.4,17+Math.floor(r()*18)]);
  // The warm first bank reaches the foreground of the opening camera.
  for(const [cx,cz,rx,rz] of [[42,88,8,4.2],[49,81,7,5],[35,86,7,5],[56,79,6,4],[27,77,7,4],[36,64,6,3.7]]){
    for(let i=0;i<7;i++)clusters.push([cx+gauss(r)*rx*.68,cz+gauss(r)*rz*.60,1.9+r()*1.8,1+r()*1.5,17+Math.floor(r()*12)]);
  }
  for(const [cx,cz,rx,rz,count] of clusters) {
    const roll=r(),family=roll<.35?0:roll<.67?1:roll<.86?2:3;
    for(let j=0;j<count;j++){
      const x=cx+gauss(r)*rx,z=cz+gauss(r)*rz;if(!planted(x,z))continue;
      const k=r()<.81?family:Math.floor(r()*4),h=(k===2?.57:.42)+r()*(k===2?.46:.42),w=h*(.90+.31*r());
      flowers[k].push([x,heightAt(x,z)-.025,z,r()*TAU,w,h,w,0,0,.89+r()*.16]);
    }
  }
  const geometry=cardGeom();for(let k=0;k<2;k++)makePlanting(group,geometry,materialForCard(grassTexture(713+k*634,!!k),time,.102),grasses[k],'Wind-turned meadow blades '+k);
  for(let k=0;k<4;k++)makePlanting(group,geometry,materialForCard(flowerTexture(831+k*351,species[k]),time,.088),flowers[k],species[k]+' wildflowers');
  return {grass:grasses[0].length+grasses[1].length,flowers:flowers.reduce((s,v)=>s+v.length,0)};
}
function foregroundBlooms(group,time){
  const rng=prng(95613),sets=[[],[],[]],places=[[42,88],[38,83],[46,83],[52,77],[32,74],[24,68],[30,60],[13,62],[54,-51],[47,-42]];
  for(let i=0;i<places.length;i++){
    const [cx,cz]=places[i];
    for(let j=0;j<18;j++){
      const x=cx+gauss(rng)*3.2,z=cz+gauss(rng)*2.2,s=.66+rng()*.64;
      sets[(j%5===0?Math.floor(rng()*3):i%3)].push([x,heightAt(x,z)-.018,z,rng()*TAU,s,s,s,0,0,.92+rng()*.10]);
    }
  }
  const mat=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
  mat.onBeforeCompile=shader=>{
    shader.uniforms.uSeconds=time;shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float uSeconds;').replace('#include <begin_vertex>',`#include <begin_vertex>
      float wave=sin(dot(instanceMatrix[3].xz,vec2(.176,.129))+uSeconds*1.31);
      transformed.x+=.093*position.y*position.y*wave;
    `);
  };
  for(let species=0;species<3;species++){
    const p=[],c=[],A=new THREE.Color('#63884d'),B=new THREE.Color('#94ab59');
    const petal=new THREE.Color(['#f4f0d7','#efbd3c','#858ec8'][species]),light=new THREE.Color(['#fff9db','#ffdc6b','#a4b1d7'][species]),center=new THREE.Color('#d9a345');
    const t=(a,b,d,c0,c1=c0,c2=c0)=>{for(const [v,col] of [[a,c0],[b,c1],[d,c2]]){p.push(...v);c.push(col.r,col.g,col.b);}};
    const stem=(x1,y1,z1,x2,y2,z2,width)=>{
      for(let j=0;j<3;j++){const a=j/3*TAU,b=(j+1)/3*TAU;
        const u=[x1+width*Math.cos(a),y1,z1+width*Math.sin(a)],v=[x1+width*Math.cos(b),y1,z1+width*Math.sin(b)],w=[x2+width*.64*Math.cos(a),y2,z2+width*.64*Math.sin(a)],q=[x2+width*.64*Math.cos(b),y2,z2+width*.64*Math.sin(b)];
        t(u,v,w,A,A,B);t(v,q,w,A,B,B);
      }
    };
    const hh=species===2?.87:.68,tx=.025+species*.019,tz=.033;
    stem(0,0,0,-.015,hh*.49,.014,.010);stem(-.015,hh*.49,.014,tx,hh,tz,.0077);
    for(let j=0;j<4;j++){
      const a=(.19+j*.39)*TAU,y=(.15+j*.09)*hh,len=.12+.065*(j%2);
      const mid=[Math.cos(a)*len*.65,y+.056,Math.sin(a)*len*.65],base=[0,y,0],end=[Math.cos(a)*len,y+.094,Math.sin(a)*len];
      t(base,[mid[0]+Math.sin(a)*.016,mid[1]-.008,mid[2]-Math.cos(a)*.016],end,A,B,B);
      t(base,end,[mid[0]-Math.sin(a)*.016,mid[1]-.005,mid[2]+Math.cos(a)*.016],A,B,A);
    }
    const blooms=species===2?3:1;
    for(let h=0;h<blooms;h++){
      const hx=tx+(h===1?.057:h===2?-.047:0),hz=tz+(h===1?-.028:h===2?.03:0),hy=hh-h*.087;
      if(h)stem(tx*.8,hy-.046,tz*.8,hx,hy,hz,.0044);
      const np=species===0?8:5,rr=species===2?.047:.059;
      for(let j=0;j<np;j++){
        const a=j/np*TAU+.16,side=species===0?.26:.40,R=(f,b,y)=>[hx+Math.cos(a)*rr*f-Math.sin(a)*rr*b,hy+rr*y,hz+Math.sin(a)*rr*f+Math.cos(a)*rr*b];
        const dip=species===2?-.68:.13,wing=species===2?-.47:.21;
        t(R(.14,0,.025),R(.68,-side,wing),R(1,0,dip),petal,petal,light);
        t(R(.14,0,.025),R(1,0,dip),R(.67,side,wing),petal,light,petal);
        t([hx,hy+.009,hz],R(.26,-.085,0),R(.26,.085,0),center);
      }
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));g.computeVertexNormals();g.computeBoundingSphere();
    makePlanting(group,g,mat,sets[species],['Marguerites','Buttercups','Bluebells'][species]+' with individual petals');
  }
  return sets.reduce((n,a)=>n+a.length,0);
}
function makePlants(group,time){
  const rocks=plantRocks(group),trees=plantWoods(group,time),meadow=plantMeadow(group,time);
  return {rocks,trees,...meadow,modeledFlowerStems:foregroundBlooms(group,time)};
}

export { inTown, makePlants };
