import * as THREE from "../vendor/three.module.js";
import { TAU, clamp, mix, smooth, fbm, prng, pick, between, ink, cachedMap, sheet, ellipse, cutouts, Faces, groundSpots } from "./journey-geometry.js";
import { groundHeight } from "./journey-landscape.js";

const foliage={
 spring:{shadow:['#775e62','#856a72','#97717b'],mid:['#b88392','#cc95a0','#d6a0ab','#c58f9b'],light:['#e5b1bb','#efbdc5','#f2cfd0','#dfacb1'],sun:['#f5d8d5','#ffebe0','#f2cecd'],trunk:'#696052',bark:'#977b6f'},
 summer:{shadow:['#335746','#48674a','#4c704c'],mid:['#608048','#69894c','#749052','#577f4d'],light:['#87a35a','#99ab64','#a6b16a','#82a264'],sun:['#c0c578','#9caf5d','#bdc77d'],trunk:'#5e6250',bark:'#8b886b'},
 autumn:{shadow:['#81513d','#905d38','#91663e'],mid:['#b57032','#c07d33','#ca8734','#b06a33'],light:['#db9a40','#e6a842','#edb24f','#dc9e43'],sun:['#f6cb66','#ffd77a','#f4bd51'],trunk:'#6d5947',bark:'#a28c6f'},
 red:{shadow:['#78433c','#824a39','#87503b'],mid:['#a95735','#bb6339','#ba6136','#b36a42'],light:['#d57c40','#d88848','#e08e49','#cb7040'],sun:['#eba455','#f1b36a','#ea9653'],trunk:'#6b5144',bark:'#96785e'},
 birch:{shadow:['#7a713f','#8d7838','#8d793d'],mid:['#b6943b','#c09a3c','#c8a444','#b79847'],light:['#d8b44e','#ebc459','#e4be54','#efd16a'],sun:['#f7d779','#f5df84','#f5ce66'],trunk:'#b5b0a0',bark:'#e3dfcb'},
 city:{shadow:['#435d4c','#50604a','#5d6e4e'],mid:['#687f53','#7b8753','#7b8951'],light:['#91a260','#a0a866','#a6a967'],sun:['#b9b270','#b5ba79','#a7ac69'],trunk:'#756854',bark:'#998a69'},
 night:{shadow:['#1c303b','#243d44','#263d46'],mid:['#2b474c','#345254','#3b5359'],light:['#446063','#4b6969','#476466'],sun:['#5b7475','#60807d','#627a78'],trunk:'#2c3942',bark:'#3c4b53'}
};
function branch(ctx,x0,y0,x1,y1,r0,r1,bend,side,color){
  const dx=x1-x0,dy=y1-y0,len=Math.max(1,Math.hypot(dx,dy)),ux=-dy/len,uy=dx/len;
  const mx=(x0+x1)*.5+bend,my=(y0+y1)*.5+side;
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x0-ux*r0,y0-uy*r0);
  ctx.quadraticCurveTo(mx-ux*(r0+r1)*.35,my-uy*(r0+r1)*.35,x1-ux*r1,y1-uy*r1);
  ctx.lineTo(x1+ux*r1,y1+uy*r1);ctx.quadraticCurveTo(mx+ux*(r0+r1)*.35,my+uy*(r0+r1)*.35,x0+ux*r0,y0+uy*r0);ctx.closePath();ctx.fill();
}
function softLeafCloud(ctx,x,y,rx,ry,pal,r,detail){
  // Overlapping palettes follow an individual branch's envelope. Ragged rims
  // and open pockets let one bough read separately from its neighbour.
  const n=13+Math.floor(detail*6),pts=[];
  for(let i=0;i<n;i++){
    const a=r()*TAU,rr=Math.sqrt(r())*.76;
    pts.push([x+Math.cos(a)*rx*rr,y+Math.sin(a)*ry*rr,(.20+r()*.28)*rx,(.20+r()*.32)*ry]);
  }
  for(const [a,b,w,h] of pts)ellipse(ctx,a,b,w,h,r()*.58-.29,pick(pal.shadow,r));
  for(let i=0;i<42*detail;i++){
    const a=r()*TAU,rr=Math.sqrt(r())*.93,xx=x+Math.cos(a)*rx*rr,yy=y+Math.sin(a)*ry*rr;
    const light=(1-Math.sin(a)*rr)*.45+(Math.cos(a)*rr)*.17;
    const cc=light+r()*.58>.77?pal.mid:pal.shadow,rad=(1.3+r()**1.5*4.5)*(rx/22)**.6;
    ellipse(ctx,xx,yy,rad*1.29,rad*(.50+r()*.28),-1.1+r()*1.6,pick(cc,r));
  }
  for(let i=0;i<36*detail;i++){
    const a=r()*TAU,rad=Math.sqrt(r())*.77;
    let xx=x+rx*(Math.cos(a)*rad+.09),yy=y+ry*(Math.sin(a)*rad-.18);
    const s=(1.1+r()**1.5*3.4)*(rx/22)**.45,hi=(yy-y)/ry;
    const colors=r()+hi*.65>.62?pal.mid:r()+hi*.32>.17?pal.light:pal.sun;
    ellipse(ctx,xx,yy,s*1.30,s*(.46+r()*.37),-.8+r()*1.29,pick(colors,r));
    if(i%5===0)ellipse(ctx,xx+s,yy-s*.54,s*.39,s*.29,.1,pick(pal.sun,r));
  }
}
function broadTree(ctx,w,h,kind,variant){
  const seed=7921+variant*3361+kind.charCodeAt(1)*207,r=prng(seed);
  const species=kind==='autumn'?(variant===1?'red':variant===2?'birch':variant===3?'red':'autumn'):kind;
  const pal=foliage[species],birch=species==='birch',cherry=kind==='spring',willow=kind==='summer'&&variant===2;
  const rootX=w*(.48+.05*r()),rootY=h*.984,limbs=[],crowns=[],fine=[];
  const drift=(r()-.5)*w*.08,trunkW=w*(birch?.0205:cherry?.036:.033);
  function limb(x0,y0,x1,y1,r0,r1,bend,order){
    limbs.push([x0,y0,x1,y1,r0,r1,bend,order]);
  }
  const leaderX=rootX+drift,leaderY=h*(birch?.19:cherry?.27:.23);
  limb(rootX,rootY,leaderX,leaderY,trunkW,w*.0058,drift*.5,0);
  if(birch)limb(rootX+w*.017,rootY,rootX+w*.13,h*.34,trunkW*.60,w*.004,w*.04,0);
  const n=(birch?13:10)+Math.floor(r()*5);
  for(let i=0;i<n;i++){
    const side=i%2?1:-1,t=(i+r()*.5)/n;
    const by=h*(.72-.40*t+(r()-.5)*.075),bx=mix(rootX,leaderX,(rootY-by)/(rootY-leaderY));
    const reach=w*(cherry?.36:birch?.25:.34)*(1-.46*t)*(.74+.32*r());
    const ax=bx+reach*.67*side,ay=by-h*(.06+.09*r());
    const ex=bx+reach*side,ey=by-h*(cherry?.18:.21)*(1-.25*t)-r()*h*.075;
    const thick=trunkW*(.40-.22*t)*(.66+r()*.47);
    limb(bx,by,ax,ay,thick,thick*.53,reach*side*.11,1);limb(ax,ay,ex,ey,thick*.55,1.2,side*reach*.045,2);
    for(let k=0;k<(birch?3:4);k++){
      const v=(k+.35)/(birch?3:4),kX=mix(ax,ex,v),kY=mix(ay,ey,v),sx=kX+side*between(r,-.05*w,.078*w),sy=kY-h*between(r,.055,.15);
      limb(kX,kY,sx,sy,thick*.30,.50,w*.009*side,3);
      const size=(birch?.068:cherry?.089:.09)*w*between(r,.76,1.30);
      crowns.push([sx,sy,size,size*(willow?1.33:cherry?.67:birch?.98:.78)*(1+r()*.20),r()]);
      if((cherry||kind==='autumn'||willow)&&k===0&&r()<.72){
        crowns.push([kX+side*size*.32,kY-size*.25,size*.81,size*(willow?1.23:.70),r()]);
      }
      if(willow)fine.push([sx,sy,size*.73,side]);
    }
  }
  for(let i=0;i<12;i++){
    const v=r(),sx=leaderX+(r()-.5)*w*(.32-.16*v),sy=h*(.09+.24*v);
    const sz=w*between(r,.046,.096);crowns.push([sx,sy,sz,sz*(cherry?.70:.85),r()]);
    limb(leaderX,leaderY+h*.06,sx,sy,2.2,.43,0,3);
  }
  for(const [x0,y0,x1,y1,r0,r1,bend,ord] of limbs){
    branch(ctx,x0,y0,x1,y1,r0,r1,bend,ord?5:-2,pal.trunk);
    if(ord<3)branch(ctx,x0+r0*.25,y0,x1+r1*.1,y1,r0*.35,r1*.24,bend,ord?5:-2,pal.bark);
    if(birch&&ord<2){
      for(let k=0;k<18;k++){const t=r(),bx=mix(x0,x1,t)+bend*Math.sin(t*Math.PI),by=mix(y0,y1,t),rr=mix(r0,r1,t);ellipse(ctx,bx+(r()-.5)*rr,by,rr*(.23+r()*.55),.8+r()*1.1,.10,'#766f63');}
    }
  }
  // Crossing twig silhouettes stay visible below the canopy.
  for(let s=0;s<4;s++){const a=(s-1.5)*w*.014;branch(ctx,rootX+a,rootY,rootX+drift*.26,h*.795,1.3,.53,a*.57,0,pal.trunk);}
  crowns.sort((a,b)=>a[4]-b[4]);
  for(const [x,y,rx,ry] of crowns)softLeafCloud(ctx,x,y,rx,ry,pal,r,cherry?1.12:1);
  if(cherry){
    for(const [x,y,rx,ry] of crowns){
      for(let j=0;j<14;j++){const a=r()*TAU,hp=Math.sqrt(r())*.89,x0=x+Math.cos(a)*hp*rx,y0=y+Math.sin(a)*hp*ry;
        const s=.6+r()*1.35;ellipse(ctx,x0,y0,s,s*.74,-.3,pick(pal.sun,r));if(j%4===0)ellipse(ctx,x0+1.5,y0-.8,s*.72,s*.48,.5,'#fff0df');
        if(j%5===0)ellipse(ctx,x0-.3,y0+.6,.46,.35,0,'#bf8b76');
      }
    }
  }
  if(willow){
    for(const [x,y,sz,side] of fine)for(let k=0;k<7;k++){
      const dx=(r()-.5)*sz,sag=sz*(.8+r()),ax=x+dx,by=y+sz*.16;
      ctx.strokeStyle=pick([...pal.shadow,...pal.mid],r);ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(ax,by);ctx.quadraticCurveTo(ax+side*4,by+sag*.46,ax+side,by+sag);ctx.stroke();
      for(let j=0;j<10;j++)ellipse(ctx,ax+Math.sin(j*.31)*side*2,by+sag*j/10,1.0,2.8,side*.5,pick(pal.mid,r));
    }
  }
}
function pineTree(ctx,w,h,variant,night=false){
  const r=prng(6687+619*variant),cx=w*(.49+(r()-.5)*.05),h0=h*.97,t=h*.035,lean=w*(r()-.5)*.08;
  const dark=night?['#22343e','#283c44','#2b4247']:['#36595c','#406366','#4b7170'];
  const light=night?['#405b60','#466468','#536c70']:['#98b0bb','#c3d1d5','#dce5e4','#b4ccd2'];
  branch(ctx,cx,h0,cx+lean,t,w*.026,.87,lean*.2,0,night?'#323d42':'#766961');
  for(let i=0;i<33;i++){
    const f=i/32,y=mix(h*.83,t,f),wx=mix(w*.405,w*.012,Math.pow(f,.82))*(.85+.15*r()),x=cx+lean*(.15+f*.85);
    for(let h0=0;h0<6;h0++){
      const s=(h0%2)?1:-1,sz=wx*(.46+.57*r()),sy=y+(r()-.5)*h*.021,sag=(.25+.16*r())*sz;
      const ex=x+s*sz,ey=sy+sag*.86,teeth=8;
      ctx.fillStyle=pick(dark,r);ctx.beginPath();ctx.moveTo(x,sy-4);
      ctx.quadraticCurveTo(x+s*sz*.36,sy+sag*.62,ex,ey);
      for(let k=teeth;k>=0;k--){const u=k/teeth;ctx.lineTo(x+s*sz*u,sy+sag*u+(1-u)*8+(k%2?8:2)*(1-f*.38));}
      ctx.closePath();ctx.fill();
      if(r()< (night?.39:.91)){
        const cap=night?'#526a6e':pick(light,r);ctx.fillStyle=cap;ctx.beginPath();ctx.moveTo(x,sy-4.1);
        for(let k=1;k<=10;k++){const u=k/10;ctx.lineTo(x+s*sz*u,sy+sag*Math.pow(u,.76)-2.4-(1-u)*(3+r()*5)+(k%3)*1.35);}
        ctx.lineTo(ex,ey+.65);for(let k=9;k>=0;k--){const u=k/10;ctx.lineTo(x+s*sz*u,sy+sag*u+(k%3===1?3.2:.8));}ctx.fill();
        if(!night){ctx.strokeStyle='rgba(230,239,235,.62)';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(x+s*sz*.32,sy+sag*.29-4);ctx.lineTo(x+s*sz*.64,sy+sag*.61-2);ctx.stroke();}
      }
      for(let k=0;k<7;k++){const u=.50+.50*r(),xx=x+s*sz*u,yy=sy+sag*u;ctx.strokeStyle=pick(dark,r);ctx.lineWidth=.83;ctx.beginPath();ctx.moveTo(xx,yy+1.8);ctx.lineTo(xx+s*(1.4+r()*4),yy+4+r()*3);ctx.stroke();}
    }
  }
  branch(ctx,cx+lean,t+h*.10,cx+lean,t,2.4,.2,2,0,night?light[0]:'#becfd0');
}
function treeAtlas(kind){
  return cachedMap('trees '+kind,()=>sheet(384,480,(c,w,h,v)=>{
    if(kind==='winter')pineTree(c,w,h,v);
    else if(kind==='night'&&v%2===0)pineTree(c,w,h,v,true);
    else broadTree(c,w,h,kind,v);
  }));
}
function blade(c,x,y,ex,ey,breadth,bend,col){
  const mx=(x+ex)*.5+bend,my=(y+ey)*.5;
  c.fillStyle=col;c.beginPath();c.moveTo(x-breadth*.44,y);c.quadraticCurveTo(mx-breadth*.61,my,ex,ey);c.quadraticCurveTo(mx+breadth*.45,my+1,x+breadth*.44,y);c.fill();
}
function grassAtlas(kind){
  const grass=kind==='city'?['#817e52','#8f8d5d','#9f9c68','#a8a16b']:kind==='winter'?['#998c74','#a2967c','#bcb197','#c6c6ae']:kind==='autumn'?['#81723f','#8c7c43','#b09957','#bd9f5e','#a48e4e']:kind==='desert'?['#937144','#ab8d57','#c6ac6c','#c3a370']:kind==='night'?['#304653','#3c5556','#52675e','#455b57']:['#597f47','#6c914c','#7e9b4e','#96a857','#a5b464'];
  return cachedMap('grass '+kind,()=>sheet(192,208,(c,w,h,v)=>{
    const r=prng(7246+v*615+kind.charCodeAt(0)*5),top=v===1?.82:v===2?.70:.60;
    for(let j=0;j<(kind==='winter'?22:47);j++){
      const x=w*(.13+r()*.74),by=h*(.95+r()*.032),ht=h*(.13+r()**.85*top),tx=x+(r()-.52)*ht*.76,ty=by-ht,bend=(r()-.52)*ht*.25;
      blade(c,x,by,tx,ty,1.8+r()*4.2,bend,pick(grass,r));
      if(((v===2||v===3)&&j%5===0&&ht>h*.4)||kind==='winter'&&j%7===0){
        const light=kind==='night'?'#658078':kind==='winter'?'#cfc5a6':kind==='autumn'?'#cdb576':'#b8b46c';
        for(let k=0;k<9;k++){const f=k/9;ellipse(c,tx+(k%2?1:-1)*2*(1-f),ty-k*1.65,1.35,3.9,(k%2?1:-1)*.62,light);}
      }
    }
  }));
}
function flowersAtlas(){
  const pals=[['#d07f98','#e595a1','#f0b1bd','#f7c2cb'],['#dbad3c','#f4bd44','#ffd763','#edb348'],['#776caa','#8f82c2','#aa9bd2','#b4addc'],['#e5dfc4','#f6edd6','#f4f1de','#fef5dc']];
  return cachedMap('spring flowers',()=>sheet(270,270,(c,w,h,variant)=>{
    const r=prng(1637+variant*275),stem=['#527747','#698e45','#7e984b','#70904b'];
    for(let i=0;i<24;i++){
      const bx=w*(.15+.7*r()),by=h*.974,ht=h*(.10+.26*r());
      blade(c,bx,by,bx+(r()-.45)*ht,by-ht,3+r()*5,(r()-.5)*10,pick(stem,r));
    }
    for(let i=0;i<(variant===2?9:8);i++){
      const x=w*(.2+r()*.59),y=h*.982,ht=h*(.33+.38*r()),ex=clamp(x+(r()-.5)*w*.52,21,w-21),ey=y-ht,bd=(r()-.5)*12;
      c.strokeStyle=pick(stem,r);c.lineWidth=1.4+r()*1.2;c.beginPath();c.moveTo(x,y);c.quadraticCurveTo((ex+x)*.5+bd,y-ht*.42,ex,ey);c.stroke();
      for(let k=0;k<5;k++){const t=.14+k*.129,xx=mix(x,ex,t)+bd*Math.sin(t*Math.PI),yy=y-ht*t,s=k%2?1:-1;blade(c,xx,yy,xx+s*(7+r()*16),yy-6-r()*12,2.4+r()*3,s*4,pick(stem,r));}
      if(variant===2){
        for(let k=0;k<13;k++){const t=k/13,a=TAU*k*.392,s=2.8+4.1*(1-t);
          const px=ex+Math.cos(a)*7.0*(1-t),py=ey-ht*.20*t;ellipse(c,px,py,s*1.3,s*.95,-.28,pick(pals[2],r));ellipse(c,px+.45,py-.67,s*.44,s*.36,0,'#d6cbe7');
        }
      }else{
        const rr=between(r,7.9,13.9)*(variant===3?.91:1),rot=r()*TAU,petals=variant===3?8:variant===1?5:6;
        for(let j=0;j<petals;j++){const a=j*TAU/petals+rot;ellipse(c,ex+Math.cos(a)*rr*.48,ey+Math.sin(a)*rr*.40,rr*.60,rr*(variant===3?.23:.34),a,pick(pals[variant],r));}
        ellipse(c,ex,ey,rr*.28,rr*.22,-.1,variant===1?'#ba883c':'#d3a654');ellipse(c,ex+.4,ey-.5,rr*.13,rr*.11,0,'#ffe4a0');
      }
    }
  }));
}
function trees(parent,name,time){
  const r=prng(5161+name.charCodeAt(0)*39+name.length*74),items=[],sh=[],winter=name==='winter';
  function plant(x,z,h,variant,shade=1){
    const y=groundHeight(name,x,z);if(name==='summer'&&y<-2.23)return;
    const width=h*(winter?.55:name==='spring'?1.05:name==='summer'?.84:name==='autumn'?(variant===2?.61:.91):.78)*(r()*.20+.91);
    items.push([x,y-.11,z,width,h,between(r,-.23,.23),variant,new THREE.Color().setScalar(.94+r()*.08).multiplyScalar(shade),r()<.5]);
    if(x> -100)sh.push([x-.5,y,z-1,width*.80,width*.66,.29]);
  }
  const plots={
    spring:[[-42,50,18,29,24],[-62,-54,23,31,27],[-91,4,33,80,40],[-25,-87,8,19,12],[-55,107,16,28,17]],
    summer:[[-135,-40,12,47,30],[-143,68,18,51,28],[-155,20,19,85,28],[-19,91,8,23,8],[-18,-97,8,22,7]],
    autumn:[[-34,-69,14,23,31],[-48,54,16,34,34],[-75,-19,19,54,42],[-109,88,32,49,54],[-100,-99,38,36,44]],
    winter:[[-39,59,16,27,34],[-39,-60,13,31,38],[-82,-5,29,68,64],[-122,98,26,46,49],[-114,-99,28,39,39]],
    city:[[-29,101,13,25,13],[-39,-105,12,24,13],[-121,19,25,101,27]],
    night:[[-43,58,16,31,20],[-57,-70,21,32,20],[-116,2,34,86,44]]
  };
  for(const [px,pz,dx,dz,count] of plots[name]){
    for(let k=0;k<count;k++){
      const a=r()*TAU,d=Math.sqrt(r()),x=px+Math.cos(a)*dx*d,z=pz+Math.sin(a)*dz*d;
      const h=(name==='city'?5:name==='spring'?5.2:name==='night'?6.5:6.0)+r()**.68*(name==='autumn'?15:winter?16:name==='spring'?8:10);
      plant(x,z,h,Math.floor(r()*4),.94+r()*.05);
    }
  }
  const sides={
    spring:[[10,47,18,0],[1,67,15,2],[-9,29,11,3],[-9,-43,16,0],[17,-50,15,1],[15,83,16,2],[21,-68,17,2],[-18,2,6.5,1]],
    summer:[[1,62,17,2],[-8,83,13,3],[-7,-61,17,0],[-13,-36,8,3],[-11,40,8,1],[18,-79,12,1]],
    autumn:[[21,47,22,2],[14,61,21,0],[-7,36,16,0],[-4,-46,20,1],[12,-61,24,3],[14,-75,20,2],[10,85,19,1],[-8,-31,12,2],[-11,7,7.8,0]],
    winter:[[13,43,20,1],[6,54,17,2],[-4,38,13,3],[10,-51,21,0],[1,-41,15,2],[-7,-31,10,1],[13,77,18,3],[21,-69,16,1],[-16,9,7.0,2]],
    city:[[-5,82,12,1],[-8,-77,12,3],[-13,-46,8,0],[-17,39,7,2]],
    night:[[9,57,15,0],[6,-58,17,2],[-10,-34,10,0],[-4,39,11,0],[-17,73,13,3]]
  };
  for(const [x,z,h,v] of sides[name])plant(x,z,h,v);
  cutouts(parent,name+' branching trees',treeAtlas(name),items,time,{wind:winter?.007:.016,cut:.31});
  groundSpots(parent,sh,name==='winter'?'#829caf':name==='night'?'#192d3b':'#4d5b43',name==='winter'?.32:.33);
}
function meadows(parent,name,time){
  const r=prng(6581+name.length*82+name.charCodeAt(0)),g=[],f=[],win=name==='winter';
  const total=win?230:name==='night'?540:name==='city'?600:name==='desert'?170:1800;
  for(let i=0;i<total;i++){
    let x=between(r,-58,58),z=between(r,-102,103);
    if(Math.abs(x)<13&&Math.abs(z)<23&&r()<.79)continue;
    const y=groundHeight(name,x,z);if(name==='summer'&&y<-2.36)continue;
    const w=between(r,.64,2.65)*(win?.78:name==='desert'?.80:1),ht=w*between(r,.21,.41);
    if((name==='city'||name==='night')&&r()<.35)continue;
    g.push([x,y-.09,z,w,ht,between(r,-.54,.54),Math.floor(r()*4),'#ffffff',r()<.5]);
  }
  if(name==='summer'){
    for(let k=0;k<430;k++){
      const z=between(r,-114,114),shore=15.2+4.6*Math.sin(z*.046)+2.9*Math.sin(z*.091+1.7),x=-shore+between(r,-.8,4.5),y=groundHeight(name,x,z);
      if(y<-3.25)continue;const w=between(r,1.18,3.12);
      g.push([x,y-.08,z,w,w*between(r,.82,1.26),between(r,-.40,.40),2,'#c4c5a2',r()<.5]);
    }
  }
  if(name==='spring'||name==='summer'){
    const num=name==='spring'?2700:460;
    for(let k=0;k<num;k++){
      const x=between(r,-49,55),z=between(r,-98,104),y=groundHeight(name,x,z);
      if((name==='summer'&&y<-1.9)||Math.abs(x)<11&&Math.abs(z)<21&&r()<.88)continue;
      const meadow=fbm(x*.043+8,z*.048+30);
      if(meadow+.32*r()<.51)continue;
      const w=between(r,1.4,3.2)*(1+.16*meadow),h=w*between(r,.40,.63);
      const patch=fbm(x*.033+33,z*.039+19)+.16*(r()-.5);
      const tile=name==='summer'?(r()<.66?1:3):patch<.40?1:patch<.47?2:patch<.56?0:3;
      f.push([x,y-.065,z,w,h,between(r,-.49,.49),tile,'#ffffff',r()<.5]);
    }
  }
  if(name==='spring'||name==='summer'||name==='autumn'){
    const near=[
      [29,39,8.6,12],[38,17,5.3,8.3],[20,7,5.1,9.5],[34,-16,7.1,10],
      [31,-38,7.5,11.4],[21,-55,7.9,13],[-3,39,6.1,11],[-14,-38,8,19],[-19,67,6.6,12]
    ];
    for(let id=0;id<near.length;id++){
      const [cx,cz,rx,rz]=near[id],cnt=name==='spring'?98:name==='summer'?59:38;
      for(let k=0;k<cnt;k++){
        const a=TAU*r(),rad=Math.sqrt(r()),x=cx+rx*Math.cos(a)*rad,z=cz+rz*Math.sin(a)*rad+.26*(x-cx),y=groundHeight(name,x,z);
        if(name==='summer'&&y<-2)continue;
        const width=between(r,1.20,3.4),ht=width*between(r,.32,.58);
        g.push([x,y-.055,z,width,ht,between(r,-.54,.54),Math.floor(r()*4),'#ffffff',r()<.5]);
        if(name==='spring'||(name==='summer'&&r()<.11)){
          const tile=name==='summer'?1:(r()<.69?[0,3,1,2,3,0,2,3,1][id]:Math.floor(r()*4));
          f.push([x+.26,y-.045,z-.19,width*(.91+r()*.39),ht*(1.08+.66*r()),between(r,-.43,.43),tile,'#ffffff',r()<.5]);
        }
      }
    }
  }
  cutouts(parent,'Individual field grass, seed heads and reeds',grassAtlas(name),g,time,{wind:.084,cut:.27});
  if(f.length)cutouts(parent,'Wildflower drifts and individual petals',flowersAtlas(),f,time,{wind:.060,cut:.27});
}
function orchardFence(parent){
  const f=new Faces();const path=[];
  for(let k=0;k<19;k++){const z=-94+k*10,x=-23+Math.sin(z*.042)*2.3,y=groundHeight('spring',x,z);
    if(Math.abs(z)<19)continue;const a=[x,y,z];path.push(a);f.box(x,y-.1,z,.41,2.43+.15*Math.cos(k*2),.51,'#a59c7b',.05);
    if(path.length>1){const p=path[path.length-2];if(z-p[2]<12)for(const h of [.75,1.55])f.tube([p[0],p[1]+h,p[2]],[x,y+h,z],.148,.15,'#b4a780',5);}
  }
  f.build(parent,'Weathered double-rail orchard fence');
}
function particles(parent,name,time){
  const config={
    spring:[130,0,'#f5c3cd','#ffdfd6'],autumn:[175,1,'#e5a040','#b9663a'],winter:[660,2,'#e3edf3','#faf8f0'],
    desert:[155,3,'#e9c493','#f0d6ac'],night:[76,4,'#ffca68','#fff0a2']
  }[name];if(!config)return;
  const [n,mode,co1,co2]=config,r=prng(1808+mode*35),p=[],attrs=[],colors=[],c=new THREE.Color();
  for(let i=0;i<n;i++){
    p.push(between(r,-64,57),r()*(mode===4?8:mode===3?9.5:48),between(r,-108,110));
    attrs.push(r()*TAU,r(),r(),r());c.copy(ink(co1)).lerp(ink(co2),r());colors.push(c.r,c.g,c.b);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('variant',new THREE.Float32BufferAttribute(attrs,4));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const uniforms={uTime:time,uScreen:{value:window.innerHeight},uMode:{value:mode}};
  const vs=`attribute vec4 variant; attribute vec3 color; uniform float uTime,uScreen,uMode; varying vec4 vData;varying vec3 vCol;
  void main(){vec3 p=position; float t=uTime, a=variant.x;
    if(uMode<2.5){float speed=uMode>1.5?1.95:uMode>.5?1.35:.78;
      p.y=mod(p.y-t*speed*(.7+variant.z*.78),47.5)+.25;
      p.z+=sin(t*.60+a+p.y*.19)*(.7+variant.z*1.4)-mod(t*.38,50.);p.x+=.62*cos(t*.7+a);
    }else if(uMode<3.5){p.y=position.y*.38+.30*sin(t*.29+a)+.35;p.z-=mod(t*1.3,31.);p.x+=sin(t*.25+a)*.42;}
    else{p.y+=1.03+sin(t*.73+a)*.61;p.z+=sin(t*.46+a)*1.08;p.x+=cos(t*.42+a)*.77;}
    vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
    float size=uMode>3.5?.33+variant.y*.25:uMode>2.5?.13+variant.y*.21:uMode>1.5?.075+variant.y*.17:.14+variant.y*.25;
    gl_PointSize=clamp(size*uScreen*.5*projectionMatrix[1][1]/max(3.,-mv.z),1.,uScreen*.018);
    vData=vec4(variant.x+t*(1.1+variant.z),variant.y,uMode,t);vCol=color;
  }`;
  const fs=`varying vec4 vData;varying vec3 vCol;
  void main(){vec2 p=gl_PointCoord*2.-1.;float m=vData.z;float a=1.;vec3 col=vCol;
    if(m<1.5){float co=cos(vData.x),si=sin(vData.x);p=mat2(co,si,-si,co)*p;
      float d=length(vec2(p.x*(m<.5?1.88:1.49),p.y*.98));a=1.-smoothstep(.72,1.,d);col*=.82+.18*abs(co);
    }else if(m<2.5){float d=length(p);a=(1.-smoothstep(.20,1.,d))*.93;}
    else if(m<3.5){float d=length(vec2(p.x*.8,p.y*2.));a=(1.-smoothstep(.13,1.,d))*.54;}
    else{float d=length(p);a=(1.-smoothstep(.03,1.,d))*(.25+.73*pow(.5+.5*sin(vData.w*1.8+vData.x*.27),2.));col*=1.2+1.6*(1.-smoothstep(.05,.49,d));}
    if(a<.035)discard;gl_FragColor=vec4(col,a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
  const m=new THREE.ShaderMaterial({uniforms,vertexShader:vs,fragmentShader:fs,transparent:true,depthWrite:false,blending:mode===4?THREE.AdditiveBlending:THREE.NormalBlending});
  const point=new THREE.Points(g,m);point.name=['Falling orchard petals','Maple leaves in the wind','Snowflakes at three depths','Wind-blown desert grit','Fireflies beside the road'][mode];point.frustumCulled=false;point.renderOrder=7;parent.add(point);
  return ()=>{uniforms.uScreen.value=window.innerHeight;};
}
function makeVegetation(parent,name,time){
  if(name==='sky')return ()=>{};
  if(name!=='desert')trees(parent,name,time);
  meadows(parent,name,time);
  if(name==='spring')orchardFence(parent);
  const fn=particles(parent,name,time);
  return fn||(()=>{});
}

export { makeVegetation };
