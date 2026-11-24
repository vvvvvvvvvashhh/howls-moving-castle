import * as THREE from "../vendor/three.module.js";
import { createCalcifer, createFireCarrier } from "./calcifer.js";
import { gesture } from "./companions.js";

// The hearth is a complete little room: light, food and objects share its scale.
function createInterior() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#29251e');
  const root = new THREE.Group(); scene.add(root);
  let seed=60419;
  const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  function texture(type, base){
    const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');
    x.fillStyle=base;x.fillRect(0,0,512,512);
    const im=x.getImageData(0,0,512,512);
    for(let i=0;i<im.data.length;i+=4){const n=(random()-.5)*(type==='wood'?20:30);for(let j=0;j<3;j++)im.data[i+j]=Math.max(0,Math.min(255,im.data[i+j]+n));}
    x.putImageData(im,0,0);
    if(type==='wood'){
      for(let k=0;k<240;k++) {x.strokeStyle=`rgba(23,13,6,${.025+random()*.13})`;x.lineWidth=.4+random()*1.7;x.beginPath();let yy=random()*512;for(let i=0;i<=512;i+=8){const y=yy+Math.sin(i*.018+k)*2.8+Math.sin(i*.06+k*.2)*.7;i?x.lineTo(i,y):x.moveTo(i,y);}x.stroke();}
      for(let k=0;k<6;k++){let px=random()*512,py=random()*512;for(let r=4;r<28;r+=4){x.strokeStyle='rgba(27,14,4,.11)';x.beginPath();x.ellipse(px,py,r*2.5,r*.6,.05,0,Math.PI*2);x.stroke();}}
    }else{
      for(let k=0;k<1300;k++){x.fillStyle=`rgba(${random()>.55?'245,231,195':'51,42,28'},${random()*.07})`;x.fillRect(random()*512,random()*512,3+random()*50,2+random()*60);}
    }
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;
  }
  const M={
    oak:new THREE.MeshStandardMaterial({color:'#937456',map:texture('wood','#9e805d'),roughness:.86}),
    darkwood:new THREE.MeshStandardMaterial({color:'#76523b',map:texture('wood','#996f4a'),roughness:.8}),
    beam:new THREE.MeshStandardMaterial({color:'#5d4834',map:texture('wood','#7a6045'),roughness:.92}),
    plaster:new THREE.MeshStandardMaterial({color:'#e0d0a3',map:texture('plaster','#d7cda8'),roughness:1}),
    stone:new THREE.MeshStandardMaterial({color:'#777267',map:texture('stone','#aca38e'),roughness:.96}),
    stoneDark:new THREE.MeshStandardMaterial({color:'#4e4840',map:texture('stone','#8c7a60'),roughness:1}),
    soot:new THREE.MeshStandardMaterial({color:'#292820',roughness:1}),
    sage:new THREE.MeshStandardMaterial({color:'#74894b',map:texture('wood','#b2bd81'),roughness:.65}),
    sageDark:new THREE.MeshStandardMaterial({color:'#465c30',roughness:.8}),
    brass:new THREE.MeshStandardMaterial({color:'#b49455',metalness:.72,roughness:.35}),
    copper:new THREE.MeshStandardMaterial({color:'#aa6035',metalness:.78,roughness:.39}),
    iron:new THREE.MeshStandardMaterial({color:'#302e29',metalness:.64,roughness:.55}),
    black:new THREE.MeshStandardMaterial({color:'#1b2021',roughness:.65}),
    cream:new THREE.MeshStandardMaterial({color:'#e8dfbd',roughness:.26}),
    blue:new THREE.MeshStandardMaterial({color:'#385c67',roughness:.37}),
    red:new THREE.MeshStandardMaterial({color:'#a94c37',roughness:.43}),
    amber:new THREE.MeshStandardMaterial({color:'#866221',metalness:.12,roughness:.17}),
    bottle:new THREE.MeshStandardMaterial({color:'#314b3e',metalness:.15,roughness:.18}),
    cloth:new THREE.MeshStandardMaterial({color:'#d9bd8d',roughness:1,side:THREE.DoubleSide}),
    leaves:new THREE.MeshStandardMaterial({color:'#5f7141',roughness:.94,side:THREE.DoubleSide}),
    bread:new THREE.MeshStandardMaterial({color:'#b97d3d',map:texture('stone','#dfbd7a'),roughness:.91}),
    egg:new THREE.MeshStandardMaterial({color:'#fff0cb',roughness:.4}),
    yolk:new THREE.MeshStandardMaterial({color:'#f6b531',roughness:.34}),
    bacon:new THREE.MeshStandardMaterial({color:'#a84b37',roughness:.52}),
  };
  const boxGeo=new THREE.BoxGeometry(1,1,1), sphereGeo=new THREE.SphereGeometry(1,20,12);
  function mesh(g,m,pos=[0,0,0],scale=[1,1,1],parent=root){const o=new THREE.Mesh(g,m);o.position.set(...pos);o.scale.set(...scale);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
  const box=(pos,size,m=M.darkwood,parent=root)=>mesh(boxGeo,m,pos,size,parent);
  const ball=(pos,size,m=M.cream,parent=root)=>mesh(sphereGeo,m,pos,size,parent);
  function rod(a,b,r,m=M.iron,parent=root){a=new THREE.Vector3(...a);b=new THREE.Vector3(...b);const v=b.clone().sub(a),o=mesh(new THREE.CylinderGeometry(r,r,v.length(),10),m,a.clone().add(b).multiplyScalar(.5).toArray(),[1,1,1],parent);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return o;}
  function ring(pos,r,t,m,rot=[0,0,0],parent=root){const o=mesh(new THREE.TorusGeometry(r,t,8,30),m,pos,[1,1,1],parent);o.rotation.set(...rot);return o;}
  function pot(pos,r,h,m=M.copper){
    const pts=[[.02,0],[r*.7,0],[r*.94,h*.12],[r,h*.45],[r*.88,h*.85],[r*.83,h],[r*.70,h],[r*.72,h*.86]].map(p=>new THREE.Vector2(...p));
    const g=new THREE.Group();g.position.set(...pos);root.add(g);mesh(new THREE.LatheGeometry(pts,24),m,[0,0,0],[1,1,1],g);ring([0,h,0],r*.84,.045,m,[Math.PI/2,0,0],g);return g;
  }
  function bottle(pos,r,h,m=M.bottle){const pts=[[0,0],[r,0],[r,h*.55],[r*.9,h*.65],[r*.35,h*.78],[r*.31,h],[r*.4,h],[r*.4,h*.91]].map(p=>new THREE.Vector2(...p));mesh(new THREE.LatheGeometry(pts,16),m,pos);box([pos[0],pos[1]+h*.35,pos[2]+r*.96],[r*1.35,h*.27,.012],M.cream);}
  // Uneven planks, broad beams and an old ochre plaster wall.
  box([0,-.29,.3],[16,.18,16],M.beam);
  for(let i=0;i<24;i++){
    for(let j=0;j<4;j++){let l=3.7+random()*.2;box([-7.65+i*.66,-.12,(j-1.5)*3.9+((i%2)*.2)],[.645,.22,l],i%4===0?M.darkwood:M.oak);}
  }
  box([0,4,-5.8],[16,8,.4],M.plaster);
  box([-8,4,.5],[.35,8,13],M.plaster);
  // The right wall has a large real opening rather than a painted window.
  box([8,1.1,.5],[.35,2.2,13],M.plaster);box([8,6.9,.5],[.35,2.2,13],M.plaster);
  box([8,4,-4.5],[.35,3.6,3.2],M.plaster);box([8,4,5],[.35,3.6,3.6],M.plaster);
  for(let x=-8;x<=8;x+=4)box([x,4,-5.53],[.22,8,.26],M.beam);
  for(let z=-5.5;z<8;z+=3.4)box([0,7.7,z],[16,.45,.34],M.beam);
  box([0,1,-5.45],[16,.22,.2],M.beam);box([0,6.9,-5.45],[16,.2,.2],M.beam);
  const daylight=new THREE.MeshBasicMaterial({color:'#c6d8c8'});
  box([9.6,4,.4],[.1,5,7.8],daylight);
  for(const y of [2.2,5.8])box([7.78,y,.3],[.42,.13,7.0],M.darkwood);
  for(const z of [-3.2,.25,3.7])box([7.78,4,z],[.42,3.7,.13],M.darkwood);
  box([7.78,4,.3],[.42,.1,7.0],M.darkwood);
  box([7.6,2.08,.3],[1.05,.18,7.4],M.oak);
  // Arch blocks enclose a deep black firebox.
  box([0,1.85,-5.3],[5.8,3.7,.22],M.soot);
  box([0,.18,-3.68],[6.8,.4,3.5],M.stoneDark);
  for(const side of [-1,1])for(let y=0;y<6;y++){
    box([side*(2.45+(y%2)*.04),.45+y*.55,-4.52],[.94,.53,2.0],y%3===0?M.stoneDark:M.stone);
  }
  for(let i=0;i<11;i++){
    const a=Math.PI*(i+.5)/11,o=box([Math.cos(a)*2.39,3.25+Math.sin(a)*1.15,-4.51],[.66,.85,2.05],i%3===0?M.stoneDark:M.stone);o.rotation.z=a-Math.PI/2;
  }
  box([0,4.75,-4.5],[6.9,.31,2.5],M.stoneDark);box([0,4.98,-4.55],[7.0,.14,2.6],M.stone);
  const hoodGeom=new THREE.BufferGeometry();
  hoodGeom.setAttribute('position',new THREE.Float32BufferAttribute([-3.4,5.1,-3.24,3.4,5.1,-3.24,-2,7.6,-4.1,2,7.6,-4.1,-3.4,5.1,-5.7,3.4,5.1,-5.7,-2,7.6,-5.7,2,7.6,-5.7],3));
  hoodGeom.setIndex([0,1,2,1,3,2,1,5,3,5,7,3,4,0,6,0,2,6]);hoodGeom.computeVertexNormals();mesh(hoodGeom,M.soot);
  for(let y=5.4;y<7.5;y+=.55)box([0,y,-3.25-(y-5.1)*.345],[6.9-(y-5.1)*1.1,.055,.09],M.iron);
  // The bricks turn inward around the fire. Soot gathers at the top, ash at the foot.
  const brickM=['#67514a','#54443e','#745248','#614b46','#584b46'].map(c=>new THREE.MeshStandardMaterial({color:c,map:texture('stone','#b8aaa0'),roughness:1}));
  for(let row=0;row<10;row++){
    const yy=.70+row*.355;
    for(let col=-3;col<=3;col++){
      const xx=col*.85+(row%2)*.425;
      if(Math.abs(xx)>2.4)continue;
      const b=box([xx,yy,-5.075],[.825-random()*.033,.33-random()*.025,.18+random()*.038],brickM[(row*3+col+15)%5]);
      b.rotation.z=(random()-.5)*.026;
    }
    for(const side of [-1,1])for(let col=0;col<2;col++){
      const zz=-4.82+col*.70+(row%2)*.23;
      box([side*2.04,yy,zz],[.15,.32,.67],brickM[(row+col+3)%5]);
    }
  }
  const barkCanvas=document.createElement('canvas');barkCanvas.width=256;barkCanvas.height=192;
  const bark=barkCanvas.getContext('2d');bark.fillStyle='#332c29';bark.fillRect(0,0,256,192);
  const seamCanvas=document.createElement('canvas');seamCanvas.width=256;seamCanvas.height=192;
  const seam=seamCanvas.getContext('2d');seam.fillStyle='black';seam.fillRect(0,0,256,192);
  for(let i=0;i<94;i++){
    let x=random()*256,y=random()*230-28;const l=9+random()*96;
    const n=random();bark.strokeStyle=n>.68?'#635751':n>.3?'#46413b':'#221c1b';bark.lineWidth=1+random()*3;
    const path=new Path2D();path.moveTo(x,y);
    for(let d=0;d<l;d+=6){x+=(random()-.5)*4;y+=6;path.lineTo(x,y);}
    bark.stroke(path);
    if(n>.79){seam.strokeStyle=n>.94?'#ffc16b':'#d86b39';seam.lineWidth=.6+random();seam.stroke(path);}
  }
  const barkMap=new THREE.CanvasTexture(barkCanvas),seamMap=new THREE.CanvasTexture(seamCanvas);
  barkMap.colorSpace=seamMap.colorSpace=THREE.SRGBColorSpace;
  const charred=new THREE.MeshStandardMaterial({color:'#a19a90',map:barkMap,bumpMap:barkMap,bumpScale:.045,emissive:'#ed6533',emissiveMap:seamMap,emissiveIntensity:.89,roughness:1});
  const ember=new THREE.MeshStandardMaterial({color:'#392a25',emissive:'#72200d',emissiveIntensity:.58,roughness:1});
  const paleAsh=new THREE.MeshStandardMaterial({color:'#3e3d38',roughness:1});
  const ashPhoto=document.createElement('canvas');ashPhoto.width=256;ashPhoto.height=128;const ashCtx=ashPhoto.getContext('2d'),ashImage=ashCtx.createImageData(256,128);
  for(let y=0;y<128;y++)for(let x=0;x<256;x++){
    const u=(x-128)/128,v=(y-64)/64,rad=Math.hypot(u,v),a=Math.atan2(v,u),grain=random(),allow=THREE.MathUtils.clamp((1.01+.065*Math.sin(a*7.3)+.060*Math.sin(a*13.8)-rad)/.36,0,1),k=(y*256+x)*4;
    const l=31+10*Math.sin(u*16.3+.6*Math.cos(v*15.1))+8*Math.sin(v*28.8+u*12.5)+grain*24+(grain>.975?23:0);
    ashImage.data.set([l*1.07,l,l*.93,grain<allow?255:0],k);
  }
  ashCtx.putImageData(ashImage,0,0);const ashMap=new THREE.CanvasTexture(ashPhoto);ashMap.colorSpace=THREE.SRGBColorSpace;
  const ashBedMaterial=new THREE.MeshStandardMaterial({color:'#746d64',map:ashMap,alphaTest:.38,roughness:1});
  const ashVerts=[-.13,.456,-3.55],ashUV=[.5,.5],ashIndex=[];
  for(let i=0;i<42;i++){const a=2*Math.PI*i/42,r=1+random()*.12;ashVerts.push(-.13+Math.cos(a)*1.52*r,.401+random()*.011,-3.55+Math.sin(a)*.64*r);ashUV.push(.5+.50*Math.cos(a),.5+.50*Math.sin(a));ashIndex.push(0,1+(i+1)%42,1+i);}
  const ashGeometry=new THREE.BufferGeometry();ashGeometry.setAttribute('position',new THREE.Float32BufferAttribute(ashVerts,3));ashGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(ashUV,2));ashGeometry.setIndex(ashIndex);ashGeometry.computeVertexNormals();mesh(ashGeometry,ashBedMaterial);
  const cut=document.createElement('canvas');cut.width=cut.height=128;const end=cut.getContext('2d');end.fillStyle='#39312c';end.fillRect(0,0,128,128);
  for(let i=0;i<4700;i++){end.fillStyle=random()>.47?'rgba(121,112,95,.20)':'rgba(13,12,12,.14)';end.fillRect(random()*128,random()*128,1+random()*3,.8+random()*2);}
  for(let r=4;r<82;r+=3+random()*3){end.lineWidth=.6+random()*1.2;end.strokeStyle=random()>.28?'rgba(24,22,21,.62)':'rgba(124,113,95,.31)';end.beginPath();for(let j=0;j<=64;j++){const a=j*2*Math.PI/64,ra=r*(1+.038*Math.sin(5*a+r*.021)+.043*Math.sin(3*a+.6));const x=62+Math.cos(a)*ra,y=67+Math.sin(a)*ra*.94;j?end.lineTo(x,y):end.moveTo(x,y);}end.stroke();}
  for(let i=0;i<12;i++){const a=random()*Math.PI*2,r=15+random()*38,dx=Math.cos(a),dy=Math.sin(a);end.fillStyle=i%4?'#1b1816':'#503628';end.beginPath();end.moveTo(62+dx*r,67+dy*r);end.lineTo(62+dx*(r+15)-dy*2.0,67+dy*(r+15)+dx*2.0);end.lineTo(62+dx*82-dy*3.2,67+dy*82+dx*3.2);end.lineTo(62+dx*82+dy*1.6,67+dy*82-dx*1.6);end.closePath();end.fill();}
  const endMap=new THREE.CanvasTexture(cut);endMap.colorSpace=THREE.SRGBColorSpace;
  const cutWood=new THREE.MeshStandardMaterial({color:'#918a80',map:endMap,roughness:1});
  function splitLog(a,b,r){
    const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),span=vb.clone().sub(va);
    const length=span.length(),g=new THREE.CylinderGeometry(r*.91,r,length,13,5,true),pos=g.attributes.position;
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),theta=Math.atan2(z,x);
      const f=.97+.064*Math.sin(3*theta+.6)+.033*Math.cos(theta*6+y*2.8)+.021*Math.sin(y*7+theta*4);
      pos.setXYZ(i,x*f+.024*Math.sin(y*2.2),y,z*f);
    }
    g.computeVertexNormals();const log=mesh(g,charred,va.add(vb).multiplyScalar(.5).toArray());
    log.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),span.normalize());
    for(const side of [-1,1]){
      const y=side*length*.5,rad=r*(side>0?.91:1),points=[.024*Math.sin(y*2.2),y,0],tex=[.5,.5],tri=[];
      for(let i=0;i<13;i++){const a=i*2*Math.PI/13,x=rad*Math.sin(a),z=rad*Math.cos(a),theta=Math.atan2(z,x);const f=.97+.064*Math.sin(3*theta+.6)+.033*Math.cos(theta*6+y*2.8)+.021*Math.sin(y*7+theta*4);points.push(x*f+.024*Math.sin(y*2.2),y,z*f);tex.push(.5+.48*Math.sin(a),.5+.48*Math.cos(a));const j=1+i,k=1+(i+1)%13;side>0?tri.push(0,j,k):tri.push(0,k,j);}
      const cap=new THREE.BufferGeometry();cap.setAttribute('position',new THREE.Float32BufferAttribute(points,3));cap.setAttribute('uv',new THREE.Float32BufferAttribute(tex,2));cap.setIndex(tri);cap.computeVertexNormals();mesh(cap,cutWood,[0,0,0],[1,1,1],log);
    }
  }
  splitLog([-1.47,.56,-3.56],[1.31,.56,-3.78],.20);
  splitLog([-1.42,.59,-3.11],[.98,.61,-3.62],.17);
  splitLog([-1.06,.61,-3.83],[.73,.64,-3.04],.145);
  splitLog([.29,.59,-3.18],[1.40,.63,-3.37],.16);
  const coalGeom=new THREE.IcosahedronGeometry(1,1),cp=coalGeom.attributes.position;
  for(let i=0;i<cp.count;i++){const x=cp.getX(i),y=cp.getY(i),z=cp.getZ(i),f=.88+.10*Math.cos(4.2*x+5.3*z)+.07*Math.sin(5*y+x);cp.setXYZ(i,x*f,y*f,z*f);}coalGeom.computeVertexNormals();
  for(let i=0;i<58;i++){
    const angle=random()*Math.PI*2,dist=Math.sqrt(random()),x=-.13+Math.cos(angle)*1.52*dist,z=-3.57+Math.sin(angle)*.65*dist;
    const size=.03+.072*random();const coal=mesh(coalGeom,i%6===0?paleAsh:i%4===0?ember:charred,[x,.422+random()*.032,z],[size*1.65,size*.58,size]);coal.rotation.set((random()-.5)*.24,random()*Math.PI*2,(random()-.5)*.30);
  }
  // Both andirons bracket the flame. The breakfast pan is slightly behind its right shoulder.
  for(const x of [-1.78,1.76]){
    rod([x,.43,-2.95],[x,1.62,-2.95],.067);ball([x,1.63,-2.95],[.105,.15,.105],M.iron);
    ring([x,1.51,-2.95],.074,.017,M.brass,[Math.PI/2,0,0]);
    rod([x,.61,-2.95],[x,.54,-4.73],.061);
    for(const dir of [-1,1])rod([x,.68,-2.95],[x+dir*.16,.43,-2.85],.046);
  }
  for(let i=0;i<5;i++)rod([.53,1.56,-4.98+i*.25],[1.91,1.56,-4.98+i*.25],.040);
  for(const x of [.54,1.89])rod([x,1.55,-3.89],[x,1.55,-4.99],.043);
  rod([1.76,1.53,-2.95],[1.76,1.56,-4.45],.050);
  pot([1.20,1.60,-4.02],.79,.18,M.iron);rod([1.75,1.76,-3.95],[2.69,1.83,-3.44],.067);
  for(let i=0;i<3;i++){ball([.90+i*.29,1.80,-4.02+(i%2)*.32],[.25,.033,.18],M.egg);ball([.90+i*.29,1.83,-4.02+(i%2)*.32],[.089,.040,.087],M.yolk);}
  for(let i=0;i<3;i++){const b=box([1.18+i*.14,1.81,-4.29],[.090,.035,.40],M.bacon);b.rotation.y=.21;}
  pot([-1.44,1.34,-4.42],.35,.43,M.iron);ball([-1.44,1.80,-4.42],[.32,.067,.30],M.iron);ball([-1.44,1.89,-4.42],[.064,.062,.064],M.brass);
  ring([-1.44,1.94,-4.42],.32,.035,M.iron,[0,0,0]);rod([-1.72,1.61,-4.42],[-1.94,1.82,-4.42],.066);
  for(const x of [-1.70,-1.14])rod([x,.45,-4.43],[x,1.35,-4.43],.048);
  // The well-loved green dresser from the kitchen: carved frames, open shelves.
  const cx=5.15;
  box([cx,1.15,-4.95],[3.55,2.2,1.45],M.sageDark);
  for(let i=0;i<3;i++){
    box([cx+(i-1)*1.08,1.18,-4.19],[1.02,1.83,.12],M.sage);
    box([cx+(i-1)*1.08,1.16,-4.11],[.75,1.51,.035],M.sageDark);
    box([cx+(i-1)*1.08,1.16,-4.08],[.65,1.4,.02],M.sage);
    ball([cx+(i-1)*1.08+.29,1.48,-3.99],[.07,.07,.055],M.brass);
  }
  box([cx,2.35,-4.9],[3.9,.16,1.65],M.darkwood);
  box([cx,4.42,-5.56],[3.6,3.96,.17],M.sageDark);
  for(const x of [cx-1.82,cx+1.82])box([x,4.33,-5.06],[.16,4.1,1.12],M.sage);
  for(const y of [2.56,3.7,4.8,6.3])box([cx,y,-5.05],[3.85,.15,1.15],M.sage);
  box([cx,6.5,-5.07],[4,.21,1.32],M.sage);box([cx,6.64,-5.07],[4.2,.09,1.4],M.brass);
  for(let i=0;i<14;i++)ball([cx-1.75+i*.27,6.41,-4.41],[.11,.11,.055],M.sage);
  for(let shelf=0;shelf<3;shelf++)for(let i=0;i<7;i++){
    const xx=cx-1.48+i*.48,yy=[2.47,3.8,4.9][shelf],zz=-4.8+(random()-.5)*.15;
    if(i%3===0){pot([xx,yy,zz],.18,.42,[M.cream,M.blue,M.red][shelf]);}
    else bottle([xx,yy,zz],.13+random()*.04,.5+random()*.65,[M.bottle,M.amber,M.blue][(i+shelf)%3]);
  }
  for(let i=0;i<4;i++){const plate=mesh(new THREE.CylinderGeometry(.29,.25,.065,24),M.cream,[cx+.7,2.45+i*.07,-4.6]);}
  // Magic door, four-colour selector, coat pegs and a wall clock.
  box([-5.5,2.4,-5.46],[2.55,4.8,.22],M.darkwood);
  for(let i=0;i<6;i++)box([-6.55+i*.42,2.42,-5.3],[.405,4.6,.08],M.oak);
  for(const y of [.35,2.1,4.55])box([-5.5,y,-5.17],[2.5,.15,.1],M.beam);
  for(const x of [-6.93,-4.08])box([x,2.55,-5.23],[.23,5.15,.3],M.beam);
  box([-5.5,5.05,-5.23],[3.08,.24,.32],M.beam);
  ball([-4.63,2.3,-5.02],[.105,.105,.105],M.brass);
  const dialM=['#191c1f','#c38c36','#346476','#a14c3d'].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.45}));
  for(let i=0;i<4;i++){const o=mesh(new THREE.CircleGeometry(.35,20,i*Math.PI/2,Math.PI/2),dialM[i],[-4.65,3.5,-5.03]);}
  ring([-4.65,3.5,-5.0],.37,.045,M.brass);rod([-4.65,3.5,-4.93],[-4.43,3.73,-4.93],.033,M.brass);
  const clockX=-7.05;ring([clockX,5.5,-5.21],.42,.07,M.darkwood);
  mesh(new THREE.CircleGeometry(.4,32),M.cream,[clockX,5.5,-5.22]);
  rod([clockX,5.5,-5.12],[clockX+.18,5.64,-5.12],.018);rod([clockX,5.5,-5.1],[clockX,5.82,-5.1],.012);
  // Copperware hangs from the beams; each pan has a curved bowl and real handle.
  rod([-2.9,5.45,-2.7],[3,5.45,-2.7],.035);
  for(let i=0;i<6;i++){
    const px=-2.6+i*.62;ring([px,5.33,-2.7],.1,.019,M.iron);
    rod([px,5.24,-2.7],[px,4.82-(i%2)*.28,-2.7],.035,M.copper);
    const p=pot([0,0,0],.22+(i%3)*.055,.08,M.copper);p.position.set(px,4.6-(i%2)*.28,-2.7);p.rotation.x=Math.PI/2;
  }
  // Warm table foreground; its silhouette frames rather than obscures Calcifer.
  box([-3.7,1.57,2.45],[5.5,.22,2.35],M.darkwood);
  for(const x of [-6,-1.4])for(const z of [1.6,3.3]){box([x,.75,z],[.2,1.6,.2],M.beam);}
  box([-3.7,1.66,2.45],[1.15,.022,2.37],M.cloth);
  for(let i=0;i<3;i++){mesh(new THREE.CylinderGeometry(.43,.4,.055,32),M.cream,[-5.1+i*1.35,1.73,2.3]);pot([-5.4+i*1.35,1.74,1.7],.16,.27,M.blue);ring([-5.18+i*1.35,1.91,1.7],.105,.025,M.blue,[0,0,0]);}
  ball([-2.2,1.88,2.5],[.6,.2,.29],M.bread);
  for(let i=0;i<4;i++){const score=box([-2.5+i*.2,2.04,2.48],[.026,.015,.36],M.cream);score.rotation.z=.14;}
  bottle([-4.2,1.7,2.9],.14,.72,M.bottle);
  // Stacked split logs at the hearth, towels and trailing herbs.
  for(let i=0;i<13;i++){const x=-3.1+(i%3)*.24,y=.25+Math.floor(i/3)*.22,z=-2.9+(i%2)*.16;rod([x,y,z-.6],[x,y,z+.35],.12,M.beam);}
  for(let bunch=0;bunch<4;bunch++){
    const bx=3.15+bunch*.7,by=6.5,bz=-3.9;
    rod([bx,by+.5,bz],[bx,by-1,bz],.022,M.beam);
    for(let i=0;i<17;i++){const t=random(),a=random()*Math.PI*2,o=ball([bx+Math.cos(a)*.22*t,by-.2-t*.9,bz+Math.sin(a)*.2*t],[.06,.15,.022],M.leaves);o.rotation.z=Math.cos(a)*.65;}
  }
  // Merge static pieces by material, retaining their world transforms.
  root.updateMatrixWorld(true);
  const buckets=new Map();
  root.traverse(o=>{if(o.isMesh){let a=buckets.get(o.material);if(!a){a=[];buckets.set(o.material,a);}a.push(o);}});
  const batched=new THREE.Group();
  for(const [mat,list] of buckets){
    const arrays={position:[],normal:[],uv:[]};
    for(const o of list){let g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);if(!g.attributes.normal)g.computeVertexNormals();const n=g.attributes.position.count;
      for(const key of ['position','normal','uv']){const at=g.attributes[key],dim=key==='uv'?2:3;for(let i=0;i<n*dim;i++)arrays[key].push(at?at.array[i]:0);}g.dispose();}
    const g=new THREE.BufferGeometry();for(const key of Object.keys(arrays))g.setAttribute(key,new THREE.Float32BufferAttribute(arrays[key],key==='uv'?2:3));
    const o=new THREE.Mesh(g,mat);o.castShadow=true;o.receiveShadow=true;batched.add(o);
  }
  scene.remove(root);scene.add(batched);
  const calcifer=createCalcifer();
  const oldBed=new THREE.Vector3(-.50,.66,-3.44),newBed=new THREE.Vector3(.38,.703,-2.82);
  const carrier=createFireCarrier();carrier.position.set(newBed.x,.394,newBed.z);carrier.rotation.y=-.19;carrier.scale.setScalar(.825);scene.add(carrier);
  calcifer.group.position.copy(oldBed);calcifer.group.rotation.y=.11;
  calcifer.group.scale.setScalar(1.10);scene.add(calcifer.group);
  calcifer.group.updateMatrixWorld(true);
  const calciferFace=calcifer.anchors.faceObject.getWorldPosition(new THREE.Vector3());
  const anchors={fire:calciferFace.clone(),calciferFace,faceObject:calcifer.anchors.faceObject,calcifer:calcifer.group,carrier};
  const amb=new THREE.HemisphereLight('#f3e0b6','#4b3528',1.13);scene.add(amb);
  const sun=new THREE.DirectionalLight('#fff0cf',2.3);sun.position.set(10,7,3);sun.target.position.set(-2,1,-4);scene.add(sun,sun.target);
  sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:.1,far:40});sun.shadow.normalBias=.03;sun.shadow.bias=-.0002;
  const bounce=new THREE.PointLight('#e4c28b',22,22,2);bounce.position.set(1,5,4);scene.add(bounce);
  function update(t,options={}){
    const hearth=options.action==='hearth'||(options.action===undefined&&t>=22&&t<=25);
    const local=options.local??t-22;
    const takeoff=1.57,flight=.74;
    const u=hearth?THREE.MathUtils.clamp((local-takeoff)/flight,0,1):0;
    const arc=4*u*(1-u),distance=.84*u+.16*u*u*(3-2*u);
    const gather=hearth?gesture(local,1.10,1.49,1.595):0;
    const stretch=hearth?gesture(local,1.48,1.65,1.91):0;
    const impact=hearth?gesture(local,2.285,2.39,2.59):0;
    const rebound=hearth?gesture(local,2.41,2.57,2.80):0;
    const motion={gather,stretch,impact,rebound,arc,height:.70*arc,roll:.65*arc-.33*gather-.20*impact};
    calcifer.group.position.lerpVectors(oldBed,newBed,distance);calcifer.group.position.y+=motion.height;
    const curious=hearth?.89*gesture(local,-.05,.69,1.37)+.48*gesture(local,2.50,2.90,3.78):0;
    const look=options.look??(hearth?THREE.MathUtils.smoothstep(local,.09,.48)*(1-.72*THREE.MathUtils.smoothstep(local,2.35,2.87)):0);
    const gazeY=options.gazeY??(hearth?-.9*gesture(local,.05,.86,1.59)+.54*gesture(local,2.48,2.94,3.46):0);
    const blink=options.blink??(hearth?Math.max(gesture(local,.51,.60,.73),.72*gesture(local,2.25,2.32,2.45)):0);
    calcifer.group.rotation.y=.11+.14*curious*look+.11*arc-.07*distance;
    calcifer.update(t,{attention:options.attention??curious,look,gazeY,blink,motion,visible:options.visible??true,
      draftX:-.70*arc+.17*impact,draftZ:-.40*arc});
    // A small rock of the iron lip marks the instant the spirit settles onto the wood.
    carrier.rotation.z=-.047*impact+.021*rebound;carrier.rotation.x=.026*impact-.012*rebound;
    calcifer.anchors.faceObject.getWorldPosition(calciferFace);anchors.fire.copy(calciferFace);
    return motion;
  }
  update(0);
  return {scene,update,anchors,stats:{staticBatches:batched.children.length,fireVolumeSamples:26}};
}

export { createInterior };
