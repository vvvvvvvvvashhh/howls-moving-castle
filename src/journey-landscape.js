import * as THREE from "../vendor/three.module.js";
import { TAU, clamp, mix, smooth, noise, fbm, prng, pick, between, ink, makeGeometry, Faces, cachedMap, texCanvas, sheet, cutouts, ellipse, groundSpots } from "./journey-geometry.js";

const groundPal={
  spring:['#54774e','#7f9a52','#9fb464','#b6bf73'],
  summer:['#66823e','#98a94e','#bfc268','#cfc779'],
  autumn:['#805c35','#a58243','#c4a15b','#aa9758'],
  winter:['#aabfd1','#c9dbe0','#e1e9e8','#d0e0e1'],
  desert:['#c48e69','#d59f76','#e9b98b','#f2c898'],
  city:['#777759','#929465','#a1a273','#b3ac83'],
  night:['#203449','#304959','#496267','#475f65']
};
function groundHeight(name,x,z){
  const n=fbm(x*.017+39,z*.013-6),b=fbm(x*.008-12,z*.009+31),d=-x;
  const corridor=smooth(10,37,Math.abs(x));
  if(name==='sky')return -60;
  if(name==='desert'){
    const axis=d+.23*z+17*Math.sin(z*.015)+11*Math.sin(z*.034+d*.012)+10*noise(z*.017,d*.019);
    const wave=axis*.122+.36*Math.sin(z*.03)+.45*Math.sin(d*.019);
    const ridge=Math.pow(.5+.5*Math.cos(wave+.40*Math.sin(wave)),2.45);
    const taller=mix(3.9,24,smooth(16,107,d))*(.48+.92*fbm(d*.012,z*.011+7));
    const secondary=4.3*Math.sin(d*.051-z*.027)+7*(b-.46);
    return corridor*(ridge*taller+secondary*smooth(11,70,d)+.54*Math.sin(z*.10+x*.05));
  }
  if(name==='city'){
    const terrace=smooth(26,141,d)*(22+13*b+5*Math.sin(z*.041))+smooth(117,215,d)*(8+13*n+7*Math.cos(z*.032));
    return corridor*(terrace+(n-.45)*(x<0?8:3.2)+1.6*Math.sin(z*.043+x*.026));
  }
  let h=(n-.48)*14+(b-.47)*20+3*Math.sin(z*.038+x*.037);
  h=h*(x>0?.45:1)+smooth(47,173,d)*(6+10*b);
  if(name==='winter')h+=(.7+1.0*Math.cos(z*.075))*smooth(17,39,Math.abs(x));
  if(name==='autumn')h+=smooth(21,102,d)*(5+5*Math.sin(z*.044));
  if(name==='night')h+=smooth(45,196,d)*(7+15*Math.sin(z*.014+.4));
  const y=h*corridor;
  if(name==='summer'){
    const shoreNear=15.2+4.6*Math.sin(z*.046)+2.9*Math.sin(z*.091+1.7);
    const shoreFar=118+15*Math.sin(z*.025-.8)+6*Math.sin(z*.067);
    const lake=Math.min(d-shoreNear,shoreFar-d,159-Math.abs(z+7));
    const t=smooth(-1,8,lake);
    const approach=Math.min(y,mix(y,-2.4,smooth(-9,1.1,lake)));
    return mix(approach,-6.3-2.1*Math.sin(z*.019),t);
  }
  return y;
}
function earthMap(name){
  const kind=name==='desert'?'sand':name==='winter'?'snow':name==='autumn'?'leaf':'grass';
  return cachedMap('earth '+kind,()=>texCanvas(512,512,(ctx,w,h)=>{
    const r=prng(143+kind.charCodeAt(0));
    ctx.fillStyle=kind==='sand'?'#f1dfc8':kind==='snow'?'#f3f4f5':kind==='leaf'?'#eee2c8':'#e9eacb';ctx.fillRect(0,0,w,h);
    if(kind==='sand'){
      // The paired light and dark lines give the lee edges of a wind ripple.
      for(let i=-6;i<62;i++){
        const base=i*10.2;const path=(delta)=>{
          ctx.beginPath();
          for(let x=-4;x<=516;x+=5){
            const y=base+8*Math.sin(x/512*TAU+base*.021)+3*Math.sin(x/512*TAU*3-base*.038)+delta;
            if(x===-4)ctx.moveTo(x,y);else ctx.lineTo(x,y);
          }
        };
        path(1.2);ctx.strokeStyle='rgba(159,113,84,.34)';ctx.lineWidth=1.25;ctx.stroke();
        path(-.1);ctx.strokeStyle='rgba(255,248,220,.90)';ctx.lineWidth=1.75;ctx.stroke();
      }
    }else{
      const c=kind==='snow'?['rgba(151,177,199,.11)','rgba(255,255,255,.58)']:['rgba(101,118,75,.085)','rgba(252,246,213,.22)'];
      for(let i=0;i<1600;i++){const a=1+r()**2*12;ellipse(ctx,r()*w,r()*h,a,a*.37,-.20+r()*.52,pick(c,r));}
    }
    if(kind==='grass'||kind==='leaf'){
      for(let k=0;k<2100;k++){
        const x=r()*w,y=r()*h,L=2+r()**1.75*15,W=.8+r()*2.7;
        ctx.beginPath();ctx.moveTo(x-L*.55,y+W*.35);ctx.quadraticCurveTo(x,y-W*1.6,x+L*.51,y-W);ctx.quadraticCurveTo(x+L*.05,y+W,x-L*.55,y+W*.35);
        ctx.fillStyle=pick(['rgba(117,134,81,.38)','rgba(157,164,96,.40)','rgba(237,231,162,.50)','rgba(252,243,181,.57)'],r);ctx.fill();
      }
    }
    if(kind==='leaf'){
      const leaves=['rgba(150,104,62,.41)','rgba(214,164,94,.52)','rgba(243,205,132,.53)','rgba(117,100,67,.24)'];
      for(let k=0;k<5100;k++){const a=.9+r()**2*4.3;ellipse(ctx,r()*w,r()*h,a,a*.43,r()*TAU,pick(leaves,r));}
    }else{
      for(let i=0;i<8100;i++){
        const x=r()*w,y=r()*h,sz=.45+r()**2*(kind==='grass'?2.7:1.8);
        ctx.strokeStyle=kind==='snow'?pick(['rgba(139,173,194,.27)','rgba(255,255,255,.8)'],r):kind==='sand'?pick(['rgba(119,94,78,.30)','rgba(255,241,205,.46)'],r):pick(['rgba(104,118,75,.35)','rgba(255,249,198,.72)','rgba(151,151,93,.45)'],r);
        ctx.lineWidth=.48+r()*.8;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+sz,y-sz*.53);ctx.stroke();
      }
    }
  },true));
}
function ground(parent,name){
  const pal=groundPal[name].map(ink),c=new THREE.Color(),p=[],cs=[],u=[],idx=[];
  const xs=[];for(let x=-330;x<=-130;x+=5)xs.push(x);for(let x=-127;x<=83;x+=2.2)xs.push(x);
  const zs=[];for(let z=-400;z<-120;z+=6.5)zs.push(z);for(let z=-120;z<=120;z+=2.8)zs.push(z);for(let z=125;z<=400;z+=6.5)zs.push(z);
  for(let i=0;i<xs.length;i++)for(let j=0;j<zs.length;j++){
    const x=xs[i],z=zs[j],y=groundHeight(name,x,z),n=fbm(x*.022+31,z*.025-17),q=fbm(x*.062+5,z*.059+12),wide=fbm(x*.01-63,z*.014-7);
    c.copy(pal[0]).lerp(pal[1],smooth(.18,.63,n)).lerp(pal[2],smooth(.32,.70,q)*.68).lerp(pal[3],smooth(.42,.72,wide)*.75);
    if(name==='spring'||name==='summer'){
      const herbs=smooth(.47,.72,fbm(x*.058+31+n*3,z*.056+46))*.29;
      c.lerp(ink('#d6bd74'),herbs);
    }else if(name==='desert'){
      const gy=groundHeight(name,x,z+.45)-groundHeight(name,x,z-.45);
      const gx=groundHeight(name,x+.45,z)-groundHeight(name,x-.45,z);
      c.copy(pal[1]).lerp(pal[3],smooth(-.25,.8,-gx*.53+gy*.43)*.86).lerp(pal[0],smooth(-.28,.85,gx*.85-gy*.28)*.72).multiplyScalar(.96+q*.08);
    }else if(name==='winter')c.lerp(pal[2],smooth(-.20,1.4,y+q*.61)*.18);
    if(name==='city'){
      const earth=smooth(22,33,-x)*(1-smooth(134,187,-x));
      c.lerp(ink('#b7a188'),earth*.66);
    }
    p.push(x,y-.045,z);cs.push(c.r,c.g,c.b);
    if(name==='desert')u.push(x*.040+z*.008,z*.057+x*.017);
    else u.push(x*.073,z*.073);
    if(i&&j){const k=i*zs.length+j,l=zs.length;idx.push(k-l-1,k-l,k-1,k-l,k,k-1);}
  }
  const m=new THREE.Mesh(makeGeometry(p,idx,cs,u),new THREE.MeshLambertMaterial({map:earthMap(name),vertexColors:true}));
  m.name='Continuous terrain and unbroken foot contact';m.receiveShadow=true;parent.add(m);
}
const ranges={
  spring:[['#587986','#879da3','#c2d0cf',-355,45,53,1],['#708f88','#9aaa8a','#bfccba',-220,38,33,0],['#708957','#99ad72','#b0bb87',-179,18,18,0]],
  summer:[['#506d81','#8b9ca2','#c8d1d0',-369,50,74,1],['#668987','#89a398','#9da9a2',-239,40,39,0],['#547452','#82976a','#aab579',-194,24,23,0]],
  autumn:[['#797d90','#9c9fa7','#bec0b4',-325,55,51,0],['#777f70','#a6a37b','#c1b788',-212,35,44,0],['#826a4e','#a08d61','#b7a374',-171,22,28,0]],
  winter:[['#556f85','#8195a6','#d9e6e9',-348,58,91,1],['#5f7886','#839aa6','#d1e0e3',-237,38,51,1],['#607c88','#839da9','#b9cdd5',-184,27,33,0]],
  desert:[['#ad8282','#ca9a86','#d3a78c',-345,46,42,0],['#ad7a67','#c58d6c','#dca783',-249,25,30,0]],
  city:[['#878199','#afa1aa','#c6b9b1',-335,46,72,0],['#7e8482','#aa9e85','#bbb49a',-228,39,48,0]],
  night:[['#24374f','#3c5067','#5b697d',-315,43,61,0],['#2d4351','#46615e','#536d73',-219,36,37,0],['#2a404a','#3e5656','#496265',-158,25,28,0]]
};
function ridges(parent,name,time){
  const specs=ranges[name],cols=[],p=[],ix=[],uv=[],cc=new THREE.Color(),trees=[],r=prng(5523+name.length*64);
  const seed=Object.keys(ranges).indexOf(name)*4;
  specs.forEach(([base,stone,snow,cx,low,high,alpine],layer)=>{
    const offset=p.length/3,rows=alpine?29:18,dz=alpine?4.1:5.5,seg=Math.ceil(1200/dz);
    const a=ink(base),b=ink(stone),c=ink(snow),se=seed+layer*1.43;
    for(let j=0;j<=seg;j++){
      const z=-600+j*dz,warp=noise(z*.009+se,9.5);
      const spine=cx+18*Math.sin(z*.015+se)+17*(warp-.45);
      let profile=.25+.48*fbm(z*.009+se,43+se)+.28*Math.sin(z*.018+se);
      if(alpine){
        const peaks=[[-255,50,1.04],[-142,38,.80],[-14,56,.70],[123,39,1.17],[206,55,.83],[310,37,1.10]];
        let peak=0;for(const [z0,w,h] of peaks){
          const a=(z-z0-layer*11)/(w*(z<z0?.73:1.22));peak=Math.max(peak,h*Math.exp(-Math.pow(Math.abs(a),1.31)));
        }
        profile=.20+.64*peak+.26*fbm(z*.032+se,7)+.105*noise(z*.074+15,se);
      }
      const summit=low+high*profile+(alpine?(noise(z*.16,se)-.5)*5.2:0),wide=(alpine?90:layer===specs.length-1?40:61)*(1+.18*Math.sin(z*.019+se));
      for(let i=0;i<rows;i++){
        const t=i/(rows-1),f=t*2-1,dist=Math.abs(f),x=spine+f*wide;
        const n=fbm(x*.034+19,z*.025+se),rib=.5+.5*Math.sin(z*.107+f*10+4.3*fbm(x*.02-31,z*.023+5.7)),e=Math.sin(dist*Math.PI);
        const top=(1-dist)**(alpine?1.04:.83);
        const y=-5+summit*top+(alpine?(rib-.51)*39+(n-.5)*23:(n-.49)*14)*e;
        const snowline=low+high*(.48+.12*Math.sin(z*.033+se)-.23*rib);
        const cap=alpine?smooth(snowline-3,snowline+4,y)*(.75+.25*noise(z*.05,x*.09)):smooth(.42,.78,n)*.48;
        cc.copy(a).lerp(b,.17+.67*n+.08*rib).lerp(c,cap);
        cc.multiplyScalar(.92+.11*rib+.06*noise(z*.17,x*.12));
        p.push(x,y,z);cols.push(cc.r,cc.g,cc.b);uv.push(0,0);
        if(name!=='desert'&&layer>=specs.length-2&&f>.02&&f<.94&&y>3&&y<68&&Math.abs(z)<310&&j%2===0&&i%2===0){
          const patch=fbm(x*.070+se,z*.041-5)+.095*Math.sin(z*.055+x*.12);
          if(patch>.40+r()*.10){const ht=(1.4+r()*4.1)*(layer===specs.length-1?1:.77)*(name==='winter'?.80:1);
            trees.push([x+.12,y-.33,z+(r()-.5)*2,ht*(1.7+r()*.65),ht,0,Math.floor(r()*4),name==='night'?'#8796a1':name==='winter'?'#b0bec6':'#d4ddd3',r()<.5]);
          }
        }
        if(i&&j){const k=offset+j*rows+i;ix.push(k-rows-1,k-1,k-rows,k-1,k,k-rows);}
      }
    }
  });
  const m=new THREE.Mesh(makeGeometry(p,ix,cols,uv),ridgeSurface(name));m.name='Layered relief, folded slopes and high ridgelines';parent.add(m);
  if(trees.length)cutouts(parent,'Inhabited lower slopes and distant forest belts',distantForest(name),trees,time,{cut:.31});
}
function scatterRocks(parent,name){
  const r=prng(name==='winter'?721:name==='desert'?614:558),faces=new Faces(),shadows=[],pal=name==='winter'?['#9badb4','#b9cbd1','#e9eeed']:name==='desert'?['#a47556','#c9976c','#e6b889']:name==='night'?['#2f414b','#465553','#536561']:['#67775f','#8e9276','#abb08b'];
  let cnt=name==='summer'?86:name==='winter'?51:name==='desert'?68:34;
  for(let k=0;k<cnt;k++){
    let x,z;if(name==='summer'&&k<54){z=between(r,-99,105);x=-(14.4+4.6*Math.sin(z*.046)+2.9*Math.sin(z*.091+1.7))+between(r,-1.5,3);}
    else{x=between(r,-28,44);z=between(r,-111,101);}
    if(Math.abs(x)<12&&Math.abs(z)<21)continue;
    const y=groundHeight(name,x,z),size=(.27+2.5*r()**3)*(name==='desert'?1.24:1);
    if(name==='summer'&&y< -2.85)continue;
    const layers=[],n=7,ang=r()*TAU;
    for(let j=0;j<3;j++){
      const ring=[];for(let i=0;i<n;i++){
        const a=ang+TAU*i/n,rr=size*(.81+r()*.24)*(j===0?1:j===1?.80:.38);
        ring.push([x+Math.cos(a)*rr*.79,y-.13+size*(j===0?0:j===1?.39+r()*.16:.59+r()*.10),z+Math.sin(a)*rr]);
      }layers.push(ring);
    }
    for(let i=0;i<n;i++){
      let j=(i+1)%n;faces.face([layers[0][i],layers[0][j],layers[1][j],layers[1][i]],pal[0]);faces.face([layers[1][i],layers[1][j],layers[2][j],layers[2][i]],name==='winter'?pal[2]:pick(pal,r));
    }
    faces.face(layers[2],pal[2]);if(size>.8)shadows.push([x,y,z,size*2.1,size*2.4]);
  }
  faces.build(parent,'Weathered stones and snow caps');groundSpots(parent,shadows,name==='desert'?'#986a52':name==='winter'?'#809eb8':'#55674f',.25);
}
function lake(parent,time){
  const pts=[],idx=[],uv=[],col=[],c=new THREE.Color(),xs=45,zs=100;
  for(let i=0;i<xs;i++)for(let j=0;j<zs;j++){
    const x=-148+i*3.0,z=-170+j*3.45,n=fbm(x*.032-12,z*.027-14),d=-x;
    c.copy(ink('#4f9a9f')).lerp(ink('#91c0ba'),smooth(72,135,d)*.66+.15*n).lerp(ink('#79b3a7'),smooth(.39,.67,n)*.52);
    pts.push(x,-2.54,z);col.push(c.r,c.g,c.b);uv.push(x*.033,z*.033);
    if(i&&j){const k=i*zs+j;idx.push(k-zs-1,k-zs,k-1,k-zs,k,k-1);}
  }
  const map=cachedMap('water marks',()=>texCanvas(512,512,(c,w,h)=>{
    const r=prng(9437);c.fillStyle='#f1fcf3';c.fillRect(0,0,w,h);c.lineCap='round';
    for(let i=0;i<2100;i++){
      const x=r()*w,y=r()*h,l=2+r()**3*21;
      c.strokeStyle=pick(['rgba(108,169,174,.42)','rgba(145,192,187,.27)','rgba(255,255,242,.93)','rgba(216,235,214,.80)'],r);c.lineWidth=.5+r()*1.9;
      c.beginPath();c.moveTo(x,y);c.bezierCurveTo(x+1,y-l*.3,x-1.1,y-l*.65,x+.7,y-l);c.stroke();
    }
  },true));
  const mat=new THREE.MeshBasicMaterial({map,vertexColors:true});
  const m=new THREE.Mesh(makeGeometry(pts,idx,col,uv),mat);m.name='Wind-streaked alpine lake';parent.add(m);
  // Individual sun glints, shallow shoreline foam and two small lateen sails.
  const r=prng(1137),f=new Faces();
  for(let i=0;i<340;i++){
    const x=between(r,-121,-20),z=between(r,-135,135);if(groundHeight('summer',x,z)>-2.75)continue;
    const len=between(r,.6,4.9),th=.035+r()*.10;
    f.face([[x-th,-2.47,z-len*.5],[x+th,-2.47,z-len*.5],[x+th*.28,-2.47,z+len*.5],[x-th*.38,-2.47,z+len*.5]],pick(['#a6cebf','#a5d0c8','#bdd6c5','#98c3b8'],r));
  }
  f.build(parent,'Fine wind catches on the lake',new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide}));
  const boats=new Faces();
  for(const [x,z,s,side] of [[-79,51,1,1],[-104,-53,.70,-1]]){
    const y=-2.35;
    boats.face([[x,y+.37,z-3.1*s],[x,y-.11,z-1.9*s],[x,y-.11,z+2.1*s],[x,y+.48,z+3.1*s]],'#69594e');
    boats.tube([x,y,z],[x,y+7.2*s,z],.13*s,.074*s,'#8e7352',6);
    boats.face([[x,y+6.9*s,z+.09],[x+.38*s,y+1.2*s,z+3.4*s*side],[x,y+1.4*s,z+.09]],'#eee2c2');
    boats.face([[x,y+5.4*s,z-.12],[x,y+1.4*s,z-.16],[x+.15*s,y+1.4*s,z-2.0*s*side]],'#dfc6a2');
  }
  boats.build(parent,'Two linen-sailed boats');
  return t=>{map.offset.y=-t*.0024;map.offset.x=t*.0009;};
}
function mesas(parent){
  const r=prng(3367),f=new Faces();
  for(const [x,z,w,h,n] of [[-198,-127,29,33,16],[-203,-92,13,42,12],[-195,-70,8,27,10],[-190,85,27,36,15],[-198,119,16,47,12],[-231,142,22,31,15],[-187,8,18,22,13],[-270,-225,39,49,18]]){
    const yy=3,base=[],a0=r()*TAU;
    for(let i=0;i<n;i++){const a=a0+i*TAU/n,rr=.72+r()*.36;base.push([Math.cos(a)*rr,Math.sin(a)*rr]);}
    let prev=null;
    const steps=[[0,1.30],[.13,1.14],[.22,.85],[.37,.72],[.43,.72],[.47,.64],[.65,.60],[.69,.62],[.74,.52],[.86,.51],[.91,.54],[1,.42]];
    for(let row=0;row<steps.length;row++){
      const [y,rad]=steps[row],ring=base.map(([dx,dz],i)=>[x+dx*w*rad*.65+y*w*.13,yy+h*y+(.30+.55*y)*Math.sin(i*1.7+x),z+dz*w*rad*1.40]);
      if(prev)for(let i=0;i<n;i++){
        const k=(i+1)%n,co=new THREE.Color().copy(ink(pick(row%3===0?['#b28066','#bd8d72','#b1806b']:['#bc886a','#c79271','#c69577','#b37f65'],r)));
        co.multiplyScalar(.88+.17*(base[i][0]*.5+.5));f.face([prev[i],prev[k],ring[k],ring[i]],co);
      }
      if(row===steps.length-1)f.face(ring,'#d5a580');prev=ring;
    }
  }
  f.build(parent,'Stratified sandstone buttes and wind-cut fins');
}
function makeGroundscape(parent,name,time){
  if(name==='sky')return ()=>{};
  ground(parent,name);ridges(parent,name,time);scatterRocks(parent,name);
  if(name==='desert')mesas(parent);
  return name==='summer'?lake(parent,time):()=>{};
}

function rockTexture(){
  return cachedMap('glacial erosion and schist',()=>{
    const size=384,grid=48,table=[],r=prng(4811);
    for(let i=0;i<grid*grid;i++)table.push(r());
    const h=(x,y,k)=>table[(((x%k+k)%k)*7%grid)*grid+(((y%k+k)%k)*11%grid)];
    function periodic(u,v,k){
      const xx=u*k,yy=v*k,x=Math.floor(xx),y=Math.floor(yy),sx=xx-x,sy=yy-y,ax=sx*sx*(3-2*sx),ay=sy*sy*(3-2*sy);
      return mix(mix(h(x,y,k),h(x+1,y,k),ax),mix(h(x,y+1,k),h(x+1,y+1,k),ax),ay);
    }
    const data=new Uint8Array(size*size*4);
    for(let j=0;j<size;j++)for(let i=0;i<size;i++){
      const u=i/size,v=j/size,warp=periodic(u+.13,v-.24,5),xx=u+.081*(warp-.5),yy=v+.061*(periodic(u-.13,v+.4,6)-.5);
      const broad=periodic(xx+.09,yy+.05,9),mid=periodic(xx-.19,yy+.33,18),grain=periodic(u+.25,v-.3,39);
      const seams=Math.abs(Math.sin(TAU*(u*3+v*7)+6.1*broad+3.5*mid));const n=(j*size+i)*4;
      data[n]=255*(.53*broad+.30*mid+.17*grain);data[n+1]=255*(.58*seams+.42*mid);data[n+2]=255*(.61*grain+.39*periodic(u+.35,v-.1,27));data[n+3]=255;
    }
    const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.needsUpdate=true;return tex;
  });
}
function ridgeSurface(name){
  const alpine=['spring','summer','winter'].includes(name),winter=name==='winter',m=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
  m.onBeforeCompile=s=>{
    s.uniforms.uWeathered={value:rockTexture()};
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vRelief;varying vec3 vOut;').replace('#include <begin_vertex>','#include <begin_vertex>\nvRelief=position;vOut=normal;');
    s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vRelief;varying vec3 vOut;uniform sampler2D uWeathered;');
    const start=winter?'27.':name==='spring'?'41.':'43.',end=winter?'79.':name==='spring'?'85.':'96.';
    s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec3 landN=normalize(vOut);vec2 rockUV=vec2(vRelief.z*.0072+vRelief.x*.0027+vRelief.y*.0014,vRelief.x*.004-vRelief.y*.0094+vRelief.z*.0018);
      vec3 erosion=texture2D(uWeathered,rockUV).rgb,stone=texture2D(uWeathered,rockUV*2.29+vec2(.27,-.18)).rgb;
      float aspects=clamp(1.-landN.y,0.,1.);float relief=smoothstep(14.,62.,vRelief.y);
      diffuseColor.rgb*=mix(.80,1.23,erosion.r)*mix(.92,1.08,stone.b);
      ${alpine?`float snowBand=smoothstep(${start},${end},vRelief.y+(erosion.r-.48)*49.);
      float rock= (erosion.r-.50)*1.13+(erosion.g-.53)*.65+(stone.g-.52)*.31+(aspects-.23)*.91+landN.z*.23;
      float spine=smoothstep(-.035,.17,rock),gully=smoothstep(.58,.76,.54*(1.-erosion.g)+.46*erosion.r)*.85;
      vec3 slate=mix(vec3(.075,.125,.16),vec3(.25,.34,.38),erosion.r*.68+stone.b*.32);
      vec3 ice=mix(vec3(.36,.48,.57),vec3(.90,.92,.88),clamp(.23+.63*landN.y+landN.z*.14+(stone.r-.5)*.42,0.,1.));
      float cover=snowBand*(1.-spine*.92);cover=max(cover,gully*relief*.80);
      diffuseColor.rgb=mix(diffuseColor.rgb,slate,(.31+.60*spine)*relief);
      diffuseColor.rgb=mix(diffuseColor.rgb,ice,cover);`:''}
    `);
    // Preserve readable snow boundaries at distance while retaining aerial perspective.
    s.fragmentShader=s.fragmentShader.replace('#include <fog_fragment>',THREE.ShaderChunk.fog_fragment.replace('mix( gl_FragColor.rgb, fogColor, fogFactor )','mix( gl_FragColor.rgb, fogColor, fogFactor * .77 )'));
  };
  m.customProgramCacheKey=()=>('geological relief '+name);return m;
}
function distantForest(name){
  const winter=name==='winter',night=name==='night',autumn=name==='autumn';
  const pal=winter?['#506976','#5f7782','#708790','#899da1']:night?['#2b4051','#364954','#40565b','#4a5e65']:autumn?['#827753','#93885b','#a29566','#a9996c']:['#5c7966','#68866b','#789275','#849d7d'];
  return cachedMap('distant forest '+name,()=>sheet(170,95,(c,w,h,v)=>{
    const r=prng(684+v*463);
    for(let i=0;i<16;i++){
      const x=w*(.05+r()*.9),ht=h*(.28+r()*.68),y=h*(.96-r()*.14),ww=ht*(.18+r()*.12);
      c.fillStyle=pick(pal.slice(0,3),r);c.beginPath();c.moveTo(x,y-ht);
      for(let k=1;k<10;k++){const q=k/10;c.lineTo(x+ww*q*(k%2?.68:1),y-ht+ht*q);}
      c.lineTo(x+ww*.87,y);c.lineTo(x-ww,y);
      for(let k=9;k>0;k--){const q=k/10;c.lineTo(x-ww*q*(k%2?.8:1),y-ht+ht*q);}c.closePath();c.fill();
      c.fillStyle=pick(pal.slice(1),r);c.beginPath();c.moveTo(x,y-ht);c.lineTo(x+ww*.61,y-ht*.24);c.lineTo(x+ww*.16,y-ht*.34);c.fill();
    }
  }));
}

export { groundHeight, makeGroundscape };
