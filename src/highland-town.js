import * as THREE from "../vendor/three.module.js";
import { TAU, clamp, mix, noise, prng, heightAt, texCanvas } from "./landforms.js";

const routeX=z=>-104+.085*z+3.5*Math.sin(z*.051);
const pick=(list,r)=>list[Math.floor(r()*list.length)];
const paint=['#e6d6a8','#e4c990','#d9c6a5','#dbd2b4','#d3aa79','#c99682','#ead7a5','#e2cbb9','#c2c4ae','#d6b275','#ba8074'];
const roofing=['#a65e48','#b16a4e','#9f5749','#b47254','#ad6453','#9e6450','#946554','#826962','#897570','#a36249'];
const trim=['#64564a','#665548','#5d5146','#76634e','#725a46'];
const shutter=['#6c8062','#708b78','#7e8c68','#8c766a','#6b8291'];
const vec=(x,y,z)=>new THREE.Vector3(x,y,z);
function pos(h,x,y,z){
  const c=Math.cos(h.ang),s=Math.sin(h.ang);
  return vec(h.x+c*x+s*z,h.y+y,h.z-s*x+c*z);
}
function objAt(p,q,s){
  return new THREE.Matrix4().compose(p,q,s);
}
const up=vec(0,1,0),identity=new THREE.Quaternion();
function batch(){return {p:[],c:[],uv:[]};}
function vertex(b,p,c,u,v){b.p.push(p.x,p.y,p.z);b.c.push(c.r,c.g,c.b);b.uv.push(u,v);}
function tri(b,a,d,e,c,uv=[[0,0],[1,0],[1,1]]){
  const cc=new THREE.Color(c);vertex(b,a,cc,...uv[0]);vertex(b,d,cc,...uv[1]);vertex(b,e,cc,...uv[2]);
}
function face(b,a,d,e,f,c,uv=[[0,0],[1,0],[1,1],[0,1]]){
  tri(b,a,d,e,c,[uv[0],uv[1],uv[2]]);tri(b,a,e,f,c,[uv[0],uv[2],uv[3]]);
}
function finalBatch(group,b,mat,name){
  if(!b.p.length)return;
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.c,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));g.computeVertexNormals();g.computeBoundingSphere();
  const mesh=new THREE.Mesh(g,mat);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
}
function instanced(group,g,mat,items,name,shadow=true) {
  if(!items.length)return;
  const m=new THREE.InstancedMesh(g,mat,items.length);
  for(let i=0;i<items.length;i++){
    const [mt,color]=items[i];m.setMatrixAt(i,mt);if(color)m.setColorAt(i,new THREE.Color(color));
  }
  m.name=name;m.castShadow=shadow;m.receiveShadow=true;m.computeBoundingSphere();group.add(m);return m;
}
function roofPaint(){
  return texCanvas(256,256,(ctx,w,h)=>{
    const r=prng(48201),rows=12,cols=8,rh=h/rows,cw=w/cols;
    ctx.fillStyle='#a6a09d';ctx.fillRect(0,0,w,h);
    for(let row=-1;row<rows+1;row++)for(let col=-1;col<=cols;col++){
      const x=(col+.5*(row%2))*cw,y=row*rh,shade=170+Math.floor(r()*56);
      ctx.fillStyle=`rgb(${shade},${shade-2},${shade-3})`;
      ctx.beginPath();ctx.moveTo(x+.6,y+.3);ctx.lineTo(x+cw-1,y+.8);ctx.lineTo(x+cw-1,y+rh-2);ctx.quadraticCurveTo(x+cw*.69,y+rh+1,x+cw*.3,y+rh);ctx.lineTo(x+.7,y+rh-1);ctx.fill();
      ctx.strokeStyle='rgba(78,75,74,.49)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(x+cw-1,y+2);ctx.lineTo(x+cw-1,y+rh-1);ctx.lineTo(x+cw*.58,y+rh+.1);ctx.stroke();
      ctx.strokeStyle='rgba(255,248,232,.28)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+2,y+3);ctx.lineTo(x+2,y+rh-3);ctx.stroke();
      for(let n=0;n<5;n++){const xx=x+r()*cw,yy=y+r()*rh;ctx.fillStyle=r()<.5?'rgba(246,242,228,.16)':'rgba(89,89,85,.18)';ctx.fillRect(xx,yy,1+r()*5,.6+r()*2);}
    }
  },true);
}
function windowPaint(seed,shut=true){
  const rand=prng(seed),sc=pick(shutter,rand);
  return texCanvas(192,160,(ctx,w,h)=>{
    const x=shut?50:36,xx=w-x,top=13,bt=142,ww=xx-x;
    const pane=ctx.createLinearGradient(0,top,0,bt);pane.addColorStop(0,'#738e94');pane.addColorStop(.45,'#839c9e');pane.addColorStop(1,'#485d61');
    ctx.fillStyle='#6c6457';ctx.fillRect(x-5,top-6,ww+10,bt-top+9);
    ctx.fillStyle='#c2ad85';ctx.fillRect(x-2,top-3,ww+4,bt-top+4);
    ctx.fillStyle='#55574c';ctx.fillRect(x+2,top+1,ww-4,bt-top-3);
    ctx.fillStyle=pane;ctx.fillRect(x+5,top+4,ww-10,bt-top-10);
    ctx.fillStyle='rgba(210,204,170,.30)';ctx.beginPath();ctx.moveTo(x+5,top+6);ctx.lineTo(x+ww*.32,top+6);ctx.lineTo(x+ww*.19,bt-31);ctx.lineTo(x+5,bt-18);ctx.fill();
    ctx.fillStyle='rgba(226,224,197,.25)';ctx.beginPath();ctx.moveTo(xx-5,top+9);ctx.lineTo(xx-ww*.26,top+9);ctx.lineTo(xx-ww*.15,bt-29);ctx.lineTo(xx-5,bt-22);ctx.fill();
    ctx.fillStyle='#9d8d70';ctx.fillRect(w*.5-2,top+3,4.5,bt-top-7);ctx.fillRect(x+2,mix(top,bt,.48),ww-4,4.7);
    ctx.fillStyle='#d0ba91';ctx.fillRect(w*.5-2,top+3,1.5,bt-top-7);ctx.fillRect(x+2,mix(top,bt,.48),ww-4,1.7);
    if(shut){
      for(const left of [true,false]){
        const a=left?5:xx+4,sw=x-10;
        ctx.fillStyle='#514f43';ctx.fillRect(a-1,top+2,sw+3,bt-top);
        ctx.fillStyle=sc;ctx.fillRect(a,top+3,sw,bt-top-3);
        for(let y=top+11;y<bt-7;y+=7){ctx.fillStyle='rgba(43,50,42,.40)';ctx.fillRect(a+4,y,sw-8,2.1);ctx.fillStyle='rgba(220,219,170,.32)';ctx.fillRect(a+4,y+2.6,sw-8,1.7);}
        ctx.fillStyle='rgba(224,215,168,.29)';ctx.fillRect(a+2,top+5,2,bt-top-8);
        ctx.fillStyle='#645a49';ctx.fillRect(left?a+2:a+sw-8,top+24,7,2.3);ctx.fillRect(left?a+2:a+sw-8,bt-20,7,2.3);
      }
    }
    ctx.fillStyle='#857e68';ctx.fillRect(x-7,bt+1,ww+14,6);
    ctx.fillStyle='#d7c9ac';ctx.fillRect(x-8,bt-1,ww+16,3);
    if(seed%3===0){
      ctx.fillStyle='#885c44';ctx.fillRect(x-4,bt-3,ww+6,8);
      for(let j=0;j<48;j++){const px=x+rand()*ww,py=bt-5-7*rand();ctx.fillStyle=pick(['#6d8152','#668557','#8d9763','#d89991','#c37d81','#dca1a4'],rand);ctx.beginPath();ctx.ellipse(px,py,1.5+rand()*2,1.4+rand()*2,0,0,TAU);ctx.fill();}
    }
  });
}
function roadMap(cobbles) {
  return texCanvas(256,256,(ctx,w,h)=>{
    const r=prng(cobbles?849:591);ctx.fillStyle=cobbles?'#938f7b':'#c1b394';ctx.fillRect(0,0,w,h);
    if(cobbles) {
      for(let row=-1;row<23;row++){
        const hh=12,xx=row%2?7:0;for(let i=-1;i<19;i++){
          const x=i*16+xx,y=row*hh,sz=146+Math.floor(r()*53);
          ctx.fillStyle=`rgb(${sz+7},${sz+4},${sz-9})`;ctx.beginPath();ctx.roundRect(x+.6,y+.9,14.7,10.4,2+r()*2);ctx.fill();
          ctx.strokeStyle='rgba(240,230,205,.31)';ctx.lineWidth=.9;ctx.beginPath();ctx.moveTo(x+3,y+2);ctx.lineTo(x+12,y+2);ctx.stroke();
        }
      }
    } else {
      for(let i=0;i<6300;i++){
        const x=r()*w,y=r()*h,sz=1+r()**2*3.5;
        ctx.fillStyle=pick(['rgba(90,107,74,.21)','rgba(231,213,170,.65)','rgba(137,121,96,.42)','rgba(225,213,192,.69)'],r);
        ctx.beginPath();ctx.ellipse(x,y,sz,sz*.62,0,0,TAU);ctx.fill();
      }
      const g=ctx.createLinearGradient(0,0,w,0);g.addColorStop(0,'rgba(98,123,70,.72)');g.addColorStop(.22,'rgba(121,134,83,0)');g.addColorStop(.46,'rgba(126,145,87,.17)');g.addColorStop(.53,'rgba(126,145,87,.22)');g.addColorStop(.8,'rgba(121,134,83,0)');g.addColorStop(1,'rgba(98,123,70,.72)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    }
    ctx.globalCompositeOperation='destination-in';const fade=ctx.createLinearGradient(0,0,w,0);fade.addColorStop(0,'rgba(0,0,0,0)');fade.addColorStop(cobbles?.04:.16,'black');fade.addColorStop(cobbles?.96:.84,'black');fade.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=fade;ctx.fillRect(0,0,w,h);ctx.globalCompositeOperation='source-over';
  },true);
}
function ribbon(group,nodes,width,mat,name,seed){
  const curve=new THREE.CatmullRomCurve3(nodes.map(p=>vec(p[0],0,p[1]))),p=[],uv=[],idx=[],col=[];
  let len=0,prev=null;const number=1+Math.ceil(curve.getLength()/1.6),nside=6;
  for(let j=0;j<=number;j++){
    const t=j/number,pt=curve.getPoint(t),tan=curve.getTangent(t),dx=-tan.z,dz=tan.x;
    if(prev)len+=pt.distanceTo(prev);prev=pt;
    const w=width*(.91+.17*noise(j*.075+seed,7.3));
    for(let k=0;k<nside;k++){
      const u=k/(nside-1),off=(u-.5)*w;
      const x=pt.x+dx*off,z=pt.z+dz*off,cc=.96+.07*noise(x*.61,z*.58);
      p.push(x,heightAt(x,z)+.095,z);uv.push(u,len/8);col.push(cc,cc,cc);
      if(j&&k){const q=j*nside+k;idx.push(q-nside-1,q-1,q-nside,q-nside,q-1,q);}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();
  const m=new THREE.Mesh(g,mat);m.name=name;m.receiveShadow=true;group.add(m);
}
function makeLanes(group) {
  const cm=new THREE.MeshLambertMaterial({map:roadMap(true),vertexColors:true,side:THREE.DoubleSide,transparent:true,polygonOffset:true,polygonOffsetFactor:-1,depthWrite:false});
  const dm=new THREE.MeshLambertMaterial({map:roadMap(false),vertexColors:true,side:THREE.DoubleSide,transparent:true,polygonOffset:true,polygonOffsetFactor:-1,depthWrite:false});
  for(const [delta,w] of [[0,7.15],[-17,3.0],[17,3.15]]){
    const pts=[];for(let z=-65;z<=66;z+=10)pts.push([routeX(z)+delta,z]);
    ribbon(group,pts,w,cm,'Old town paved lane',delta+40);
  }
  for(const z of [-25.7,27.4])ribbon(group,[[-143,z+2],[-121,z+1],[routeX(z),z],[-87,z-1],[-70,z-3.8]],4.3,cm,'Cross street',z);
  ribbon(group,[[-104,57],[-99,72],[-76,73],[-54,58],[-42,46],[-31,45],[-15,53],[4,60]],2.65,dm,'Meadow cart track',12);
  ribbon(group,[[-78,-27],[-63,-29],[-43,-41],[-14,-43],[9,-37],[33,-40],[51,-55],[63,-58]],2.18,dm,'Fisherman’s footpath',4);
}
function broadleafPaint(seed){
  return texCanvas(224,196,(ctx,w,h)=>{
    const r=prng(seed),clusters=[];
    for(let k=0;k<25;k++){
      const a=r()*TAU,rr=Math.sqrt(r())*.78;
      clusters.push([w*(.50+Math.cos(a)*rr*.44),h*(.48+Math.sin(a)*rr*.44),9+r()*17]);
    }
    clusters.sort((a,b)=>b[1]-a[1]);
    ctx.lineWidth=1.6;ctx.lineCap='round';ctx.strokeStyle='rgba(88,89,58,.76)';
    for(const [x,y] of clusters){ctx.beginPath();ctx.moveTo(w*.51,h*.86);ctx.quadraticCurveTo(w*.51+(x-w*.5)*.36,h*.57,x,y);ctx.stroke();}
    const dark=['#56764d','#61804d','#6c8a54','#5a794f'],lit=['#829954','#92a85f','#a3b367','#8da560'];
    for(const [x,y,rr] of clusters){
      for(let j=0;j<29;j++){
        const a=r()*TAU,d=Math.sqrt(r())*rr,xx=x+Math.cos(a)*d,yy=y+Math.sin(a)*d*.82;
        const light=r()<.30+(.57-yy/h)*.64,leaf=light?lit:dark;
        ctx.fillStyle=leaf[Math.floor(r()*leaf.length)];ctx.beginPath();
        ctx.ellipse(xx,yy,2.4+r()*4.4,1.3+r()*2.2,-.7+r()*1.2,0,TAU);ctx.fill();
      }
    }
  });
}
function broadleafGeo(seed){
  const r=prng(seed),p=[],uv=[],color=[],norm=[],idx=[];
  for(let j=0;j<25;j++){
    const tier=Math.floor(j/5),a=j%5*TAU/5+tier*.59+(r()-.5)*.32;
    const y=-.57+tier*.271+r()*.07,rad=.28+.24*Math.sin(tier/4*Math.PI),xx=Math.cos(a)*rad,zz=Math.sin(a)*rad;
    const wide=.85+Math.sin(tier/4*Math.PI)*.27+r()*.21,high=.73+r()*.23;
    const theta=a+Math.PI/2+(r()-.5)*.53,dx=Math.cos(theta)*wide*.5,dz=Math.sin(theta)*wide*.5;
    const tilt=.18+(r()-.5)*.34,leanX=Math.cos(a)*tilt,leanZ=Math.sin(a)*tilt;
    const n=vec(Math.cos(a)*.61,.86,Math.sin(a)*.61).normalize(),k=p.length/3;
    for(const [u,v] of [[0,0],[1,0],[0,1],[1,1]]){
      const side=u*2-1,upward=v-.5;
      p.push(xx+side*dx+upward*leanX,y+upward*high,zz+side*dz+upward*leanZ);uv.push(u,v);
      const shade=.80+.18*v+.025*tier;color.push(shade,shade,shade);norm.push(n.x,n.y,n.z);
    }
    idx.push(k,k+2,k+1,k+1,k+2,k+3);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3));g.setAttribute('color',new THREE.Float32BufferAttribute(color,3));g.setIndex(idx);g.computeBoundingSphere();return g;
}
function makeTown(group){
  const r=prng(47611),boxes=[],posts=[],pipes=[],wins=[[],[],[],[]],roof=batch(),solid=batch(),fabric=batch(),canopies=[[],[]],plots=[];
  const box=(h,x,y,z,w,hei,d,c,ang=0)=>{
    boxes.push([objAt(pos(h,x,y,z),new THREE.Quaternion().setFromAxisAngle(up,h.ang+ang),vec(w,hei,d)),c]);
  };
  const beam=(h,a,b,w,d,c)=>{
    const pa=pos(h,...a),pb=pos(h,...b),diff=pb.clone().sub(pa);
    boxes.push([objAt(pa.clone().lerp(pb,.5),new THREE.Quaternion().setFromUnitVectors(up,diff.clone().normalize()),vec(w,diff.length(),d)),c]);
  };
  const cylinder=(bucket,h,x,y,z,sx,sy,sz,c)=>{
    bucket.push([objAt(pos(h,x,y,z),new THREE.Quaternion().setFromAxisAngle(up,h.ang),vec(sx,sy,sz)),c]);
  };
  const planeWindow=(h,x,y,z,ww,hh,angle,k)=>{
    const p=pos(h,x,y,z);wins[k].push([objAt(p,new THREE.Quaternion().setFromAxisAngle(up,h.ang+angle),vec(ww,hh,1)),null]);
  };
  const fillGables=(h,w,d,eave,peak,wall)=>{
    for(const s of [-1,1]){
      const z=s*d/2;
      tri(solid,pos(h,-w/2,eave,z),pos(h,w/2,eave,z),pos(h,0,peak,z),wall);
    }
  };
  function pitched(h,w,d,eave,rise,shade,over=.37) {
    const a=w*.5+over,b=d*.5+over,y0=eave-over*.32,y1=eave+rise;
    const vv=Math.hypot(a,y1-y0)/3.65,uu=2*b/3.2;
    for(const side of [-1,1]){
      face(roof,pos(h,side*a,y0,-b),pos(h,side*a,y0,b),pos(h,0,y1,b),pos(h,0,y1,-b),shade,[[0,0],[uu,0],[uu,vv],[0,vv]]);
      beam(h,[side*a,y0-.08,-b],[side*a,y0-.08,b],.15,.15,'#74604c');
    }
    beam(h,[0,y1+.008,-b],[0,y1+.008,b],.13,.13,'#ae8870');
    for(const s of [-1,1])for(const dir of [-1,1])beam(h,[dir*a,y0,s*b],[0,y1,s*b],.15,.13,'#8e735e');
  }
  function hipped(h,w,d,eave,rise,shade) {
    const a=w*.5+.40,b=d*.5+.40,rr=Math.max(b*.25,b-Math.min(w*.38,d*.3));
    const y=eave-.11,top=eave+rise,uu=2*b/3.2,vv=Math.hypot(a,top-y)/3.65;
    for(const side of [-1,1]){
      face(roof,pos(h,side*a,y,-b),pos(h,side*a,y,b),pos(h,0,top,rr),pos(h,0,top,-rr),shade,[[0,0],[uu,0],[(b+rr)/3.2,vv],[(b-rr)/3.2,vv]]);
      beam(h,[side*a,y-.075,-b],[side*a,y-.075,b],.15,.15,'#776651');
      tri(roof,pos(h,-a,y,side*b),pos(h,a,y,side*b),pos(h,0,top,side*rr),shade,[[0,0],[2*a/3.2,0],[a/3.2,vv]]);
      beam(h,[-a,y,side*b],[a,y,side*b],.15,.15,'#776651');
      for(const dir of [-1,1])beam(h,[dir*a,y,side*b],[0,top,side*rr],.15,.13,'#ad866d');
    }
    beam(h,[0,top+.025,-rr],[0,top+.025,rr],.16,.14,'#b08a72');
  }
  function annex(h,w,d,eave,id,wall,wood,ro) {
    const world=pos(h,-w*.13,0,-d*.47),part={x:world.x,y:h.y,z:world.z,ang:h.ang+Math.PI*.5};
    const ww=3.7+(id%3)*.48,dd=w*.63,hh=eave*(.70+.055*(id%3)),rise=ww*.51;
    box(part,0,hh*.47,0,ww,hh*1.04,dd,wall);
    fillGables(part,ww,dd,hh,hh+rise,wall);pitched(part,ww,dd,hh,rise,ro,.26);
    for(const side of [-1,1]){
      const z=side*(dd*.5+.048),f=side===1?0:Math.PI;
      box(part,0,hh-.08,z,ww+.12,.16,.16,wood);box(part,0,hh*.50,z,ww+.12,.15,.16,wood);
      for(const xx of [-ww*.46,ww*.46])box(part,xx,hh*.5,z,.16,hh,.15,wood);
      planeWindow(part,0,hh*.72,side*(dd*.5+.13),1.62,1.54,f,(id+1)%3);
      planeWindow(part,0,hh+rise*.32,side*(dd*.5+.13),1.01,.91,f,3);
    }
  }
  function oriel(h,w,d,eave,id){
    const cx=(id%2===0?1:-1)*w*.43,cz=d*.50,y0=eave*.51,y1=eave+.32,radius=1.22,n=8;
    const mat=['#c3b490','#d9c492','#d3bf98'],pp=(a,rr,y)=>pos(h,cx+Math.cos(a)*rr,y,cz+Math.sin(a)*rr);
    for(let j=0;j<n;j++){
      const a=j/n*TAU+Math.PI/8,b=(j+1)/n*TAU+Math.PI/8,mid=(a+b)*.5;
      face(solid,pp(a,radius*.69,y0-.57),pp(b,radius*.69,y0-.57),pp(b,radius,y0),pp(a,radius,y0),'#8a755d');
      face(solid,pp(a,radius,y0),pp(b,radius,y0),pp(b,radius,y1),pp(a,radius,y1),mat[j%3]);
      tri(solid,pp(a,radius*1.22,y1-.02),pp(b,radius*1.22,y1-.02),pp(0,0,y1+2.66),['#77857a','#718779','#6f8279','#819182'][j%4]);
      if(Math.sin(mid)>.1){
        const angle=Math.PI/2-mid,rad=radius*Math.cos(Math.PI/n)+.034;
        planeWindow(h,cx+Math.cos(mid)*rad,(y0+y1)*.5,cz+Math.sin(mid)*rad,.82,(y1-y0)*.71,angle,3);
      }
    }
    cylinder(pipes,h,cx,y1+2.80,cz,.085,.63,.085,'#8a7d64');
  }
  function balcony(h,w,d,eave,wood){
    const zz=d*.5+.56,yy=eave*.51,ww=w*.66;
    box(h,0,yy,zz,ww,.19,1.03,wood);box(h,0,yy+.96,zz+.48,ww+.09,.12,.13,'#8f795e');
    for(const x of [-ww*.47,0,ww*.47])box(h,x,yy+.48,zz+.48,.15,.97,.15,wood);
    for(let j=0;j<12;j++)box(h,ww*((j+.5)/12-.5),yy+.50,zz+.48,.072,.87,.072,wood);
    for(const x of [-ww*.46,ww*.46])beam(h,[x,yy-.60,d*.5+.04],[x,yy-.13,zz+.43],.14,.13,wood);
  }
  function chimney(h,x,z,base,hh,w) {
    box(h,x,base+hh*.5,z,w,hh,w*.85,'#c7af98');
    for(let k=.35;k<hh-.1;k+=.47)box(h,x,base+k,z,w*1.012,.043,w*.867,'#a6917e');
    box(h,x,base+hh-.11,z,w*1.15,.14,w*.99,'#b7937d');box(h,x,base+hh+.035,z,w*1.26,.13,w*1.07,'#d1baa4');
    box(h,x,base+hh+.109,z,w*.74,.025,w*.64,'#695e54');
    if(w>.82)cylinder(pipes,h,x-w*.14,base+hh+.30,z,w*.40,.47,w*.40,'#9f7661');
  }
  function dormer(h,x,z,base,s,scale,shade) {
    const world=pos(h,x,base,z),sub={x:world.x,y:world.y,z:world.z,ang:h.ang+s*Math.PI/2};
    const ww=scale*1.76,dd=scale*1.36,hh=scale*1.19;
    box(sub,0,hh*.40,0,ww,hh*1.14,dd,'#cdbb98');fillGables(sub,ww,dd,hh,hh+ww*.4,'#cdbb98');pitched(sub,ww,dd,hh,ww*.4,shade,.17);
    planeWindow(sub,0,hh*.51,dd/2+.021,ww*.73,hh*.88,0,3);
  }
  function awning(h,w,d,x,y,variant){
    const width=w*.48,part=width/6,front=d*.5+.07,cols=variant%2?['#976c61','#e6d6ad']:['#759682','#e4d4a7'];
    for(let k=0;k<6;k++){
      const l=x-width/2+k*part,rr=l+part,co=cols[k%2];
      face(fabric,pos(h,l,y,front),pos(h,rr,y,front),pos(h,rr,y-.46,front+1.07),pos(h,l,y-.46,front+1.07),co);
      face(fabric,pos(h,l,y-.46,front+1.07),pos(h,rr,y-.46,front+1.07),pos(h,rr,y-.65,front+1.07),pos(h,l,y-.65,front+1.07),co);
    }
  }
  function banner(h,w,d,level){
    const x=w*.44,z=d*.5+.08,y=level;
    beam(h,[x,y,z],[x,y+.67,z+2.02],.065,.065,'#796951');
    const stripes=['#d79856','#c36c72','#dba24d','#bd6a76'];
    for(let k=0;k<8;k++){
      const a=k/8,b=(k+1)/8;
      const pp=(t,j)=>pos(h,x+Math.sin(1.1+t*4.9+j)*.16,y+.14+t*.46-j*(1.42-.13*Math.sin(t*3.3)),z+.41+t*1.53+j*.12);
      face(fabric,pp(a,0),pp(b,0),pp(b,1),pp(a,1),stripes[Math.floor(k/2)]);
    }
  }
  function oneHouse(x,z,ang,w,d,eave,rise,id) {
    let base=-Infinity,low=Infinity;for(const a of [-.5,.5])for(const b of [-.5,.5]){
      const loc=pos({x,z,y:0,ang},a*w,0,b*d),level=heightAt(loc.x,loc.z);base=Math.max(base,level);low=Math.min(low,level);
    }
    const h={x,z,y:base+.045,ang},wall=pick(paint,r),wood=pick(trim,r),ro=pick(roofing,r),fra=id%5!==2,hip=id%6===2;
    const footDepth=Math.max(1.1,base-low+.65);
    box(h,0,.07-footDepth*.5,0,w+.16,footDepth,d+.16,'#969782');box(h,0,eave*.5,0,w,eave,d,wall);
    if(hip)hipped(h,w,d,eave,rise,ro);
    else {fillGables(h,w,d,eave,eave+rise,wall);pitched(h,w,d,eave,rise,ro);}
    plots.push({h,w,d});
    const floors=Math.max(2,Math.round(eave/3.1)),stage=eave/floors;
    // The front and rear elevations have independent studs, braces and shutters.
    for(const s of [-1,1]) {
      const zz=s*(d/2+.047),nwin=w>8.35?3:2;
      for(let j=0;j<=floors;j++)box(h,0,j*stage+.03,zz,w+.17,j===0?.23:.16,.16,wood);
      for(const side of [-1,1])box(h,side*(w*.5-.06),eave*.50,zz,.21,eave,.19,wood);
      if(fra){
        const stud=(nwin>2)?w*.166:0;
        for(const xx of nwin>2?[-stud,stud]:[0])box(h,xx,eave*.50,zz,.17,eave,.18,wood);
        if(!hip){for(let k=0;k<2;k++){
          const s2=k?1:-1,xx=s2*w*.46;
          beam(h,[xx,eave+.08,zz],[s2*w*.16,eave+rise*.60,zz],.15,.15,wood);
        }
        box(h,0,eave+rise*.46,zz,.17,rise*.91,.16,wood);
        box(h,0,eave+rise*.38,zz,w*.59,.15,.15,wood);}
      }
      for(let fl=0;fl<floors;fl++)for(let j=0;j<nwin;j++){
        if(fl===0&&s===1&&j===Math.floor(nwin*.5))continue;
        const xx=w*((j+.5)/nwin-.5),ww=Math.min(w/nwin*.79,2.16);
        planeWindow(h,xx,fl*stage+stage*.56,s*(d/2+.122),ww,Math.min(1.86,stage*.76),s===1?0:Math.PI,(id+j)%3);
      }
      if(!hip)planeWindow(h,0,eave+rise*.35,s*(d/2+.126),1.60,1.40,s===1?0:Math.PI,id%3);
    }
    for(const s of [-1,1]){
      const xx=s*(w/2+.051),nwin=d>8.65?3:2;
      for(let fl=1;fl<floors;fl++)box(h,xx,fl*stage,0,.16,.15,d+.15,wood);
      if(fra)for(const k of [-.5,0,.5])box(h,xx,eave*.5,k*(d-.24),.17,eave,.17,wood);
      for(let fl=0;fl<floors;fl++)for(let j=0;j<nwin;j++)planeWindow(h,s*(w/2+.128),fl*stage+stage*.56,d*((j+.5)/nwin-.5),1.82,Math.min(1.78,stage*.73),s*Math.PI/2,(id+j+1)%3);
    }
    const entry=w*((Math.floor((w>8.35?3:2)*.5)+.5)/(w>8.35?3:2)-.5),front=d*.5+.15;
    box(h,entry,1.14,front,1.25,2.29,.16,'#8c785a');box(h,entry,1.10,front+.097,1.02,2.13,.065,pick(['#627461','#75664f','#656e71','#88815c'],r));
    box(h,entry,1.75,front+.143,.64,.52,.035,'#889a92');box(h,entry,.08,front+.21,1.55,.18,.65,'#b8aa91');
    if(id%4===1)awning(h,w,d,entry,2.91,id);
    if(id%4===0||id%9===1)banner(h,w,d,eave-.53);
    const side=id%2?-1:1,dir=id%3===2?-1:1;
    chimney(h,side*w*.13,dir*d*(.17+.18*r()),eave+rise*.60,1.82+r()*1.40,.66+r()*.33);
    const count=d>8.6?2:1;
    for(let k=0;k<count;k++){
      const sign=(id%3===1&&k===1)?-side:side,xx=sign*w*.35,baseY=eave+rise*.20;
      dormer(h,xx,d*((k+.5)/count-.5),baseY,sign,.86+r()*.17,ro);
    }
    if(id%7===0){
      // Projecting first-floor shop bay and a modest roof over the windows.
      const xx=-w*.31;box(h,xx,1.65,d/2+.18,w*.29,1.48,.58,'#bba788');planeWindow(h,xx,1.66,d/2+.49,w*.25,1.20,0,3);
      box(h,xx,2.44,d/2+.19,w*.34,.16,.78,'#8c7966');
    }
    if(id%4===1||id%7===4)annex(h,w,d,eave,id,wall,wood,ro);
    if(id%11===3)oriel(h,w,d,eave,id);
    if(id%9===1)balcony(h,w,d,eave,wood);
    return h;
  }
  const zs=[-47,-35.5,-15.3,-4.8,6.1,17.5,37.1,48.9],rows=[-24,-8.8,8.6,24.2];let houses=0;
  for(let a=0;a<rows.length;a++)for(let j=0;j<zs.length;j++){
    if(a===0&&(j===0||j===1))continue;
    const z=zs[j]+(a-.9)*.83+(r()-.5)*1.35;
    const x=routeX(z)+rows[a]+(r()-.5)*1.5;
    const front=a===0||a===1?1:-1;
    const ang=Math.PI/2*front-.12*Math.cos(z*.051)+(r()-.5)*.12+(a===0&&j===5?Math.PI*.5:0);
    oneHouse(x,z,ang,7.55+r()*2.95,8.05+r()*3.40,5.45+r()*4.8,3.1+r()*2.65,houses++);
  }
  for(const [x,z,ang,w,d] of [[-139,2,.77,8,9],[-142,16,1.4,8.4,8],[-141,39,1.25,7.3,8.5],[-142,-13,1.23,8,8],[-88,-56,2.85,8.4,8],[-115,-58,3.0,8.8,9.3],[-80,58,2.48,9.9,8],[-123,57,2.60,8,9.1],[-66,0,-1.2,7.9,8.7],[-66,12,-1.46,8,9.9],[-70,-42,-1.71,7.4,8.7]])oneHouse(x,z,ang,w,d,5.2+r()*2.2,3.1+r()*1.8,houses++);
  const ch={x:-135,y:heightAt(-135,-37)+.45,z:-37,ang:.12};
  box(ch,0,3.87,1.3,10.8,8.4,17.8,'#c9c5ad');
  fillGables({x:pos(ch,0,0,1.3).x,y:ch.y,z:pos(ch,0,0,1.3).z,ang:ch.ang},10.8,17.8,8.07,13.04,'#d1c9b0');
  pitched({...ch,x:pos(ch,0,0,1.3).x,z:pos(ch,0,0,1.3).z},10.8,17.8,8.07,4.97,'#81716a',.35);
  for(const s of [-1,1])for(let i=0;i<4;i++){
    const z=-5.3+i*3.95;box(ch,s*5.60,3.25,z,.72,6.5,.72,'#b5ac97');
    if(i<3)planeWindow(ch,s*5.46,4.65,z+1.77,1.6,3.3,s*Math.PI/2,3);
  }
  const tower={x:pos(ch,0,0,-8.8).x,z:pos(ch,0,0,-8.8).z,y:ch.y,ang:ch.ang};
  box(tower,0,7.3,0,4.45,15.2,4.45,'#d5c9a6');
  for(const y of [1.2,7.3,12.15,14.79])box(tower,0,y,0,4.75,.23,4.75,'#a89d87');
  for(const s of [-1,1])for(const axis of [0,1]){
    const xx=axis?s*2.24:0,zz=axis?0:s*2.24;
    planeWindow(tower,xx,13.6,zz,2.20,2.18,axis?s*Math.PI/2:(s>0?0:Math.PI),3);
  }
  // Copper spire with a bell-shaped lower skirt and a finial.
  const sides=8,levels=[[14.9,3.6],[15.51,2.81],[16.3,1.98],[18.1,1.48],[20.05,1.13],[24.05,.16],[24.82,0]];
  for(let j=0;j<levels.length-1;j++)for(let k=0;k<sides;k++){
    const a=k/sides*TAU+Math.PI/8,b=(k+1)/sides*TAU+Math.PI/8,l=levels[j],u=levels[j+1],q=(ang,row)=>pos(tower,Math.cos(ang)*row[1],row[0],Math.sin(ang)*row[1]);
    face(solid,q(a,l),q(b,l),q(b,u),q(a,u),['#70877e','#768e84','#617b74','#778b7d'][k%4]);
  }
  cylinder(pipes,tower,0,25.1,0,.12,1.8,.12,'#82755c');box(tower,0,25.63,0,.81,.10,.11,'#8d8062');
  // A few fruit trees and lindens frame the roofs without hiding the building fronts.
  for(const [xx,zz,rad,count] of [[-145,-41,10,9],[-147,48,9,5],[-64,37,7,5],[-79,-61,7,7],[-124,69,9,6],[-57,4,8,5],[-124,-23,3,3],[-84,28,3,3]]){
    for(let j=0;j<count;j++){
      const x=xx+(r()-.5)*rad*2,z=zz+(r()-.5)*rad*2,h=3.4+r()*2.7,pr={x,y:heightAt(x,z),z,ang:r()*TAU};
      cylinder(posts,pr,0,h*.40,0,h*.092,h*.84,h*.092,'#746547');
      for(const s of [-1,1])beam(pr,[0,h*.42,0],[s*h*.22,h*.82,.10*h],.14,.13,'#786c4e');
      const size=h*(.46+r()*.16);canopies[j%2].push([objAt(pos(pr,0,h*.91,0),new THREE.Quaternion().setFromAxisAngle(up,r()*TAU),vec(size,size*.85,size)),null]);
    }
  }
  // A soft, conforming contact wash grounds the foundation under each house.
  const shadowGeom=new THREE.BufferGeometry(),shadowP=[],shadowUV=[],shadowIndex=[],subdiv=5;
  for(const {h,w,d} of plots){
    const base=shadowP.length/3;
    for(let v=0;v<=subdiv;v++)for(let u=0;u<=subdiv;u++){
      const xu=u/subdiv,zv=v/subdiv,world=pos(h,(xu-.5)*(w+4.1),0,(zv-.5)*(d+4.1));
      const x=world.x+.64,z=world.z-.62;shadowP.push(x,heightAt(x,z)+.11,z);shadowUV.push(xu,zv);
      if(v&&u){const q=base+v*(subdiv+1)+u;shadowIndex.push(q-subdiv-2,q-1,q-subdiv-1,q-subdiv-1,q-1,q);}
    }
  }
  shadowGeom.setAttribute('position',new THREE.Float32BufferAttribute(shadowP,3));shadowGeom.setAttribute('uv',new THREE.Float32BufferAttribute(shadowUV,2));shadowGeom.setIndex(shadowIndex);
  const contactMap=texCanvas(128,128,(ctx,w,h)=>{
    const grd=ctx.createRadialGradient(w*.5,h*.5,w*.22,w*.5,h*.5,w*.64);grd.addColorStop(0,'rgba(89,80,62,.62)');grd.addColorStop(.65,'rgba(96,87,69,.44)');grd.addColorStop(1,'rgba(110,103,78,0)');ctx.fillStyle=grd;ctx.fillRect(0,0,w,h);
  });
  const shadows=new THREE.Mesh(shadowGeom,new THREE.MeshBasicMaterial({map:contactMap,transparent:true,opacity:.50,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2}));
  shadows.name='Soft shadows at the old town foundations';group.add(shadows);
  const bm=new THREE.MeshLambertMaterial(),barkMat=new THREE.MeshLambertMaterial();
  const plaster=texCanvas(256,256,(ctx,w,h)=>{
    const rng=prng(95343);ctx.fillStyle='#f0efe6';ctx.fillRect(0,0,w,h);
    for(let j=0;j<2600;j++){
      const x=rng()*w,y=rng()*h,sz=1.2+9*rng();ctx.fillStyle=rng()<.5?'rgba(140,128,107,.076)':'rgba(255,253,240,.13)';ctx.beginPath();ctx.ellipse(x,y,sz*(.55+.36*rng()),sz*(.72+rng()*.7),.16,0,TAU);ctx.fill();
    }
  },true);
  bm.onBeforeCompile=shader=>{
    shader.uniforms.uPigment={value:plaster};
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vTownPos;').replace('#include <begin_vertex>','#include <begin_vertex>\nvTownPos=(instanceMatrix*vec4(position,1.)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D uPigment;varying vec3 vTownPos;').replace('#include <color_fragment>',`#include <color_fragment>
      vec2 uvPigment=vec2(vTownPos.x*.076+vTownPos.z*.066,vTownPos.y*.101+vTownPos.z*.015);
      diffuseColor.rgb*=mix(vec3(1.),texture2D(uPigment,uvPigment).rgb,.56);
    `);
  };
  instanced(group,new THREE.BoxGeometry(1,1,1),bm,boxes,'Lime plaster, timbering, chimneys and ridge caps');
  instanced(group,new THREE.CylinderGeometry(.50,.5,1,8),bm,pipes,'Chimney pots and steeple finial');
  instanced(group,new THREE.CylinderGeometry(.35,.55,1,7),barkMat,posts,'Town lindens and fruit tree trunks');
  for(let i=0;i<4;i++){
    const mat=new THREE.MeshLambertMaterial({map:windowPaint([348,749,1307,3189][i],i<3),alphaTest:.30,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1});
    instanced(group,new THREE.PlaneGeometry(1,1),mat,wins[i],'Glazed town windows with shutters '+i,false);
  }
  finalBatch(group,roof,new THREE.MeshLambertMaterial({map:roofPaint(),vertexColors:true,side:THREE.DoubleSide}),'Overlapping clay tiles on pitched roofs');
  finalBatch(group,solid,new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide}),'Timber gables and copper bell tower');
  finalBatch(group,fabric,new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide}),'Striped market awnings and festival banners');
  for(let i=0;i<2;i++){
    const leaves=new THREE.MeshLambertMaterial({map:broadleafPaint(783+i*137),vertexColors:true,alphaTest:.28,side:THREE.DoubleSide});
    leaves.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;',''));};
    instanced(group,broadleafGeo(783+i*28),leaves,canopies[i],'Orchard and broadleaf crowns '+i,false);
  }
  return {houses,windows:wins.reduce((n,a)=>n+a.length,0),church:[tower.x,tower.y+25.63,tower.z],townTrees:posts.length};
}

export { makeLanes, makeTown };
