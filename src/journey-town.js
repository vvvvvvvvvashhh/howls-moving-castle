import * as THREE from "../vendor/three.module.js";
import { TAU, clamp, mix, prng, pick, between, texCanvas, sheet, cachedMap, ellipse, Faces, ink } from "./journey-geometry.js";
import { groundHeight } from "./journey-landscape.js";

function tileMap(){
  return cachedMap('terracotta tiles',()=>texCanvas(256,256,(c,w,h)=>{
    const r=prng(5661);c.fillStyle='#d2c2b6';c.fillRect(0,0,w,h);
    for(let row=-1;row<17;row++)for(let j=-1;j<14;j++){
      const x=j*21.35+(row%2)*10.7,y=row*16.0,v=Math.round(between(r,177,219));
      c.fillStyle='rgb('+v+','+(v-15)+','+(v-23)+')';c.beginPath();
      c.moveTo(x,y);c.lineTo(x+20.8,y);c.lineTo(x+19.7,y+13.5);c.quadraticCurveTo(x+12,y+18.2,x+1.4,y+13.3);c.fill();
      c.strokeStyle='rgba(109,89,78,.68)';c.lineWidth=1.35;c.beginPath();c.moveTo(x+1.1,y+13.6);c.quadraticCurveTo(x+10,y+18.2,x+19.7,y+13.8);c.stroke();
      c.strokeStyle='rgba(245,219,191,.52)';c.lineWidth=1.05;c.beginPath();c.moveTo(x+3,y+1);c.lineTo(x+4,y+12.5);c.stroke();
    }
  },true));
}
function plasterMap(){
  return cachedMap('town limewash',()=>texCanvas(192,192,(c,w,h)=>{
    const r=prng(7931);c.fillStyle='#eee8da';c.fillRect(0,0,w,h);
    for(let i=0;i<2200;i++){const x=r()*w,y=r()*h,v=r();c.fillStyle=v<.47?'rgba(105,96,80,.080)':'rgba(255,251,231,.31)';c.fillRect(x,y,.5+r()*2.8,.6+r()*3);}
    for(let k=0;k<70;k++)ellipse(c,r()*w,r()*h,1+r()**2*7,.7+r()*1.4,r(),r()<.5?'rgba(154,139,115,.16)':'rgba(255,247,222,.35)');
  },true));
}
function stoneMap(){
  return cachedMap('town stone',()=>texCanvas(256,256,(c,w,h)=>{
    const r=prng(6190);c.fillStyle='#a69885';c.fillRect(0,0,w,h);
    for(let k=-1;k<18;k++){const y=k*15.2;let x=-r()*30;
      while(x<w){const sz=16+r()*21,cc=167+Math.floor(r()*43);c.fillStyle='rgb('+cc+','+(cc-6)+','+(cc-17)+')';c.beginPath();c.roundRect(x+.5,y+.6,sz-1.3,14.1,1.4+r()*1.5);c.fill();
        c.strokeStyle='rgba(247,233,204,.62)';c.lineWidth=.85;c.beginPath();c.moveTo(x+3,y+2);c.lineTo(x+sz-4,y+1.7);c.stroke();x+=sz;}
    }
  },true));
}
function windowMap(night){
  const shades=['#66857a','#788999','#97855f','#6d8178'];
  return cachedMap('painted casements '+night,()=>sheet(110,145,(c,w,h,v)=>{
    const r=prng(2277+v*171),warm=night&&v!==3,l=24,t=10,ww=61,hh=117;
    c.fillStyle=night?'#605343':'#c4b396';c.fillRect(l-3,t-3,ww+6,hh+8);
    for(const s of [-1,1]){
      const x=s<0?6:85;c.fillStyle=night?'#404c4b':shades[v];c.fillRect(x,t+3,18,hh-2);
      c.fillStyle=night?'#54615b':'#91a094';c.fillRect(x+2,t+5,1.7,hh-6);
      c.strokeStyle=night?'#303c40':'#4b655f';c.lineWidth=1.8;
      for(let k=0;k<15;k++){const y=t+8+k*7;c.beginPath();c.moveTo(x+2,y);c.lineTo(x+16,y-1);c.stroke();}
      c.fillStyle=night?'#333c3e':'#5d6b60';c.fillRect(x,t+51,18,4.4);
    }
    c.fillStyle=warm?'#bc935d':night?'#4c5256':'#6a675c';c.fillRect(l,t,ww,hh);
    let g=c.createLinearGradient(0,t,0,t+hh);
    if(warm){g.addColorStop(0,v===0?'#d7904a':'#c78b48');g.addColorStop(.54,v===0?'#ffe29a':v===1?'#ffcb77':'#eab867');g.addColorStop(1,'#ce995d');}
    else if(night){g.addColorStop(0,'#344555');g.addColorStop(1,'#565b5a');}
    else{g.addColorStop(0,'#6e909b');g.addColorStop(.44,'#a6b5ac');g.addColorStop(1,'#697c76');}
    c.fillStyle=g;c.fillRect(l+3,t+3,ww-6,hh-6);
    // Two differently draped curtains, glazing bars and their narrow shadows.
    for(const side of [-1,1]){
      const x=side<0?l+4:l+ww-4; c.fillStyle=warm?'rgba(253,213,140,.77)':night?'rgba(138,137,125,.3)':'rgba(226,221,192,.68)';
      c.beginPath();c.moveTo(x,t+4);c.lineTo(x-side*ww*.37,t+4);c.quadraticCurveTo(x-side*ww*.21,t+31,x-side*ww*.12,t+hh*.60);c.lineTo(x-side*ww*.20,t+hh-4);c.lineTo(x,t+hh-4);c.fill();
    }
    c.fillStyle=warm?'#8a623e':night?'#3a464c':'#737c71';c.fillRect(l+ww*.485,t+1,3,hh-2);c.fillRect(l+1,t+hh*.41,ww-2,3.3);
    if(v%2===0)c.fillRect(l+1,t+hh*.72,ww-2,2);
    c.fillStyle=warm?'#edbe82':night?'#646a66':'#dad7bf';c.fillRect(l,t,2,hh);c.fillRect(l,t,ww,2);
    c.fillStyle=night?'#766754':'#c5b38f';c.fillRect(l-5,t+hh+1,ww+10,5);c.fillStyle=night?'#5d554b':'#8b806b';c.fillRect(l-2,t+hh+6,ww+4,2.4);
    if(!night&&v===0){
      c.fillStyle='#976d55';c.fillRect(l+1,t+hh-4,ww-1,8);
      for(let k=0;k<62;k++)ellipse(c,l+2+r()*(ww-4),t+hh-5-r()*8,1+r()*2,1+r()*1.4,-.2,pick(['#657751','#839259','#bc7d79','#cd8c86'],r));
    }
  }));
}
function windowUV(tile){
  const x=(tile%2)*.5+.002,y=(1-Math.floor(tile/2))*.5+.002,e=.496;return [[x,y],[x+e,y],[x+e,y+e],[x,y+e]];
}
function clockMap(night){
  return cachedMap('clock '+night,()=>texCanvas(192,192,(c,w,h)=>{
    const cx=w/2,cy=h/2;
    ellipse(c,cx,cy,90,90,0,night?'#6b6557':'#8d7c5b');ellipse(c,cx,cy,84.5,84.5,0,night?'#d2bc89':'#d9ca9e');
    ellipse(c,cx,cy,78.7,78.7,0,night?'#958365':'#887e63');ellipse(c,cx,cy,76.7,76.7,0,night?'#e2ca91':'#ded3ac');
    c.strokeStyle='#554f49';
    for(let k=0;k<60;k++){const a=k*TAU/60-Math.PI/2,r0=k%5?69.5:62.7;c.lineWidth=k%5?1.1:3.9;c.beginPath();c.moveTo(cx+Math.cos(a)*r0,cy+Math.sin(a)*r0);c.lineTo(cx+Math.cos(a)*73,cy+Math.sin(a)*73);c.stroke();}
    c.fillStyle='#585044';c.font='bold 16px Georgia';c.textAlign='center';c.textBaseline='middle';
    for(const [n,tx,ty] of [['XII',0,-49],['III',51,0],['VI',0,51],['IX',-51,0]])c.fillText(n,cx+tx,cy+ty);
    c.lineCap='round';c.lineWidth=5.2;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx-28,cy-18);c.stroke();c.lineWidth=3.4;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+28,cy-41);c.stroke();ellipse(c,cx,cy,5,5,0,'#746344');
  }));
}
function xform(x,y,z,angle){
  const cs=Math.cos(angle),sn=Math.sin(angle);
  return (a,b,d)=>[x+cs*a+sn*d,y+b,z-sn*a+cs*d];
}
function bridge(batches){
  const {stone,plain}=batches,color='#b4aa8c',edge='#ddd0aa';
  for(let k=-13;k<14;k++){
    const z=k*7.1,x=-23+.9*Math.sin(z*.024),y=groundHeight('city',x,z),floor=4.9+.75*Math.cos(z*.019);
    const front=x+1.55,back=x-1.55,span=7.12,radius=2.52,cy=floor-2.85;
    for(const a of [front,back]){
      const sign=a===front?1:-1;
      for(let i=0;i<12;i++){
        const t=i*Math.PI/12,u=(i+1)*Math.PI/12,Z0=z+radius*Math.cos(t),Z1=z+radius*Math.cos(u),Y0=cy+radius*Math.sin(t),Y1=cy+radius*Math.sin(u);
        stone.face([[a, Y0,Z0],[a,Y1,Z1],[a,floor+.94,Z1],[a,floor+.94,Z0]],color,[[Z0*.19,Y0*.18],[Z1*.19,Y1*.18],[Z1*.19,(floor+.94)*.18],[Z0*.19,(floor+.94)*.18]]);
        const rr=radius+.46,cc=i%2===0?'#d4c3a0':'#c1b495';
        plain.face([[a+sign*.044,Y0,Z0],[a+sign*.044,Y1,Z1],[a+sign*.044,cy+rr*Math.sin(u),z+rr*Math.cos(u)],[a+sign*.044,cy+rr*Math.sin(t),z+rr*Math.cos(t)]],cc);
        if(sign>0)plain.face([[front,Y0,Z0],[back,Y0,Z0],[back,Y1,Z1],[front,Y1,Z1]],'#938e78');
      }
      for(const side of [-1,1]){
        const za=z+side*radius,zb=z+side*span*.5;
        stone.face([[a,y-1,za],[a,y-1,zb],[a,floor+.94,zb],[a,floor+.94,za]],color,[[za*.19,0],[zb*.19,0],[zb*.19,1],[za*.19,1]]);
      }
    }
    plain.box(x,floor+.88,z,3.48,.31,span,edge);plain.box(x+1.46,floor+1.17,z,.30,.51,span,'#b6ae92');
    if(k%2===0)plain.box(x+1.46,floor+1.16,z+.4,.52,.8,.54,'#c9bc9b');
  }
}
function buildDistrict(parent,night){
  const r=prng(night?4876:3729),plain=new Faces(),walls=new Faces(),roof=new Faces(),windows=new Faces(),stone=new Faces(),clocks=new Faces();
  const batches={plain,walls,roof,windows,stone};const mode=night?'night':'city';
  const wallsPal=night?['#68727a','#71777a','#797774','#62717b','#747575']:['#dabf97','#d4b893','#cba88b','#d9c6a2','#c8baa1','#d0aa88','#e1c9a0','#d7c3a7','#d7ae99'];
  const roofPal=night?['#536476','#5f6674','#586778','#686a76','#616670']:['#ba7456','#b16a4c','#c98161','#ad674f','#ae6550','#be7957','#ca906a','#a05b4e','#af7565'];
  const wood=night?'#53606a':'#887460',edge=night?'#626e75':'#ab9075';
  function house(x,z,w,d,h,angle,id){
    const y=groundHeight(mode,x,z)-.62,at=xform(x,y,z,angle),wall=pick(wallsPal,r),clay=pick(roofPal,r),base=night?'#586775':'#a7a18c';
    const a=d/2,b=w/2,rise=d*between(r,.38,.67),hip=id%4===1&&w>d*.92,eaves=.34;
    const R=w*.5+eaves,D=d*.5+eaves,ry=Math.max(w*.13,R-(hip?D*.75:0)),eave=h,peak=eave+rise;
    for(const s of [-1,1]){
      walls.face([at(s*a,0,-b),at(s*a,0,b),at(s*a,h,b),at(s*a,h,-b)],wall,[[0,0],[w*.20,0],[w*.20,h*.20],[0,h*.20]]);
      walls.face([at(-a,0,s*b),at(a,0,s*b),at(a,h,s*b),at(-a,h,s*b)],wall,[[0,0],[d*.20,0],[d*.20,h*.20],[0,h*.20]]);
      if(!hip)walls.face([at(-a,h,s*b),at(a,h,s*b),at(0,peak,s*b)],wall,[[0,0],[d*.2,0],[d*.1,rise*.2]]);
      const pa=at(s*a,0,-b),pb=at(s*a,0,b);
      plain.face([[pa[0],y+.1,pa[2]],[pb[0],y+.1,pb[2]],[pb[0],y+.57,pb[2]],[pa[0],y+.57,pa[2]]],base);
      const len=Math.hypot(D,rise)*.45;
      roof.face([at(s*D,eave-.13,-R),at(s*D,eave-.13,R),at(0,peak,ry),at(0,peak,-ry)],clay,[[0,0],[R*.51,0],[(R+ry)*.255,len],[(R-ry)*.255,len]]);
      if(hip)roof.face([at(-D,eave-.13,s*R),at(D,eave-.13,s*R),at(0,peak,s*ry)],clay,[[0,0],[D*.52,0],[D*.26,len]]);
      plain.tube(at(s*D,eave-.18,-R),at(s*D,eave-.18,R),.105,.105,wood,5);
      if(id%3===0)for(const kz of [-1,1])plain.tube(at(kz*D,eave-.1,s*R),at(0,peak,s*ry),.064,.082,edge,4);
    }
    plain.tube(at(0,peak+.05,-ry),at(0,peak+.05,ry),.14,.14,night?'#717883':'#c39271',6);
    const floors=h>8.6?3:h>5.6?2:1,frontCols=Math.max(2,Math.min(4,Math.round(w/2.75))),sideCols=Math.max(1,Math.min(3,Math.round(d/3)));
    for(let floor=0;floor<floors;floor++){
      const baseline=(floor+.17)*h/floors+.32,winH=clamp(h/floors*.61,1.2,2.4);
      for(let side=0;side<4;side++){
        if(side===1&&Math.cos(angle)>.75)continue;
        const isFront=side<2,sgn=side%2?-1:1,cols=isFront?frontCols:sideCols,edgePos=(isFront?a:b)+.048,length=isFront?w:d;
        for(let k=0;k<cols;k++){
          const off=((k+.5)/cols-.5)*length,ww=Math.min(1.64,length/cols*.75),hh=winH;
          const coords=isFront? [at(sgn*edgePos,baseline,off-ww/2),at(sgn*edgePos,baseline,off+ww/2),at(sgn*edgePos,baseline+hh,off+ww/2),at(sgn*edgePos,baseline+hh,off-ww/2)]:
            [at(off-ww/2,baseline,sgn*edgePos),at(off+ww/2,baseline,sgn*edgePos),at(off+ww/2,baseline+hh,sgn*edgePos),at(off-ww/2,baseline+hh,sgn*edgePos)];
          let tile=night?(r()<.44?3:Math.floor(r()*3)):(id+k%2+floor)%4;
          windows.face(coords,'#ffffff',windowUV(tile));
        }
      }
    }
    const ch=at(-D*.24,h+rise*.48,R*(r()*.84-.42));
    plain.box(ch[0],ch[1],ch[2],.66,1.37+rise*.42,.71,night?'#647079':'#b9987d',angle);
    plain.box(ch[0],ch[1]+1.26+rise*.42,ch[2],.85,.26,.91,night?'#68747c':'#c3a589',angle);
    if(!night&&id%3===1){
      const dz=w*.18*(id%2?-1:1),bx=d*.25,by=h+rise*.45,ww=1.7,hh=1.32;
      walls.face([at(bx,by-.55,dz-ww*.5),at(bx,by-.55,dz+ww*.5),at(bx,by+hh,dz+ww*.5),at(bx,by+hh,dz-ww*.5)],wall);
      walls.face([at(bx,by+hh,dz-ww*.5),at(bx,by+hh,dz+ww*.5),at(bx,by+hh+.69,dz)],wall);
      for(const s of [-1,1])roof.face([at(bx+.22,by+hh-.03,dz+s*1.01),at(bx-1.43,by+hh-.03,dz+s*1.01),at(bx-1.43,by+hh+.75,dz),at(bx+.22,by+hh+.75,dz)],clay);
      windows.face([at(bx+.02,by-.2,dz-.46),at(bx+.02,by-.2,dz+.46),at(bx+.02,by+.9,dz+.46),at(bx+.02,by+.9,dz-.46)],'#ffffff',windowUV(id%4));
    }
  }
  let id=0;
  if(!night){
    for(let row=0;row<8;row++){
      const tx=-41-row*13.5;
      for(let k=-12;k<=12;k++){
        const x=tx+between(r,-2.5,2.5),z=k*12.8+(row%2?5.3:0)+between(r,-1.9,1.9);
        if(Math.abs(z-66)<12&&Math.abs(x+84)<15||Math.abs(z+74)<11&&Math.abs(x+112)<17)continue;
        const w=between(r,7.7,11.3),d=between(r,6.4,9.4),h=between(r,5.4,10.2)+(row===0?.6:0),angle=between(r,-.32,.32)+(id%4===0?Math.PI*.50:0);
        house(x,z,w,d,h,angle,id++);
      }
    }
  }else{
    for(const [cx,cz,rows,cols] of [[-91,72,3,9],[-98,-74,4,9],[-147,-8,2,14],[-64,-37,2,3]]){
      for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
        const x=cx-row*10.3+between(r,-1.6,1.6),z=cz+(col-(cols-1)/2)*9.6+(row%2)*3.2+between(r,-1.4,1.4);
        house(x,z,between(r,5.8,8.6),between(r,5,7.1),between(r,4.5,7.1),between(r,-.37,.37)+(id%4===0?1.4:0),id++);
      }
    }
  }
  function landmark(x,z,scale,clock,slate){
    const sy=scale,y=groundHeight(mode,x,z)-.6,P=(a,b,c)=>[x+a*sy,y+b*sy,z+c*sy],cream=night?'#778585':'#d5c3a1',base=night?'#63737d':'#c4b99f',dark=night?'#54636c':'#777f76';
    const B=(xx,yy,zz,w,h,d,col)=>{const t=P(xx,yy,zz);plain.box(t[0],t[1],t[2],w*sy,h*sy,d*sy,col);};
    B(0,0,0,5.2,16.7,5.4,base);B(0,.2,0,5.9,.77,6,cream);
    for(const y0 of [3.6,11.1,12.0,16.0,16.6])B(0,y0,0,5.6,.31,5.85,cream);
    for(const side of [-1,1])for(const zz of [-1,1])B(side*2.44,.65,zz*2.55,.48,15.6,.48,cream);
    if(clock){
      const rad=1.56*scale;
      for(const side of [-1,1]){
        const xx=x+side*2.66*scale,yy=y+13.9*scale;
        clocks.face([[xx,yy-rad,z-rad],[xx,yy-rad,z+rad],[xx,yy+rad,z+rad],[xx,yy+rad,z-rad]],'#ffffff');
        const zz=z+side*2.72*scale;
        clocks.face([[x-rad,yy-rad,zz],[x+rad,yy-rad,zz],[x+rad,yy+rad,zz],[x-rad,yy+rad,zz]],'#ffffff');
      }
    }
    for(const a of [-1,1])for(const b of [-1,1])B(a*1.86,17,b*1.85,.56,3.79,.59,cream);
    B(0,20.45,0,4.81,.53,4.82,cream);B(0,17,0,1.9,3.0,1.9,dark);
    function turn(sections,cols,num,startAngle=0){
      for(let k=1;k<sections.length;k++)for(let i=0;i<num;i++){
        const [y0,r0]=sections[k-1],[y1,r1]=sections[k],a=startAngle+TAU*i/num,b=startAngle+TAU*(i+1)/num;
        plain.face([P(r0*Math.cos(a),y0,r0*Math.sin(a)),P(r0*Math.cos(b),y0,r0*Math.sin(b)),P(r1*Math.cos(b),y1,r1*Math.sin(b)),P(r1*Math.cos(a),y1,r1*Math.sin(a))],cols[(i+k)%cols.length]);
      }
    }
    if(slate)turn([[20.8,3.63],[21.35,3.22],[25.2,1.5],[30.5,.19],[31.1,.10]],night?['#596b7e','#627283']:['#687d88','#73888c','#687880'],4,Math.PI/4);
    else{
      turn([[20.8,3.55],[21.4,2.9],[22.1,1.72],[23.3,2.45],[24.5,2.63],[25.45,2.13],[26.3,1.12],[27.0,.62],[27.8,.52],[28.1,.74],[29.3,.27]],night?['#5f7279','#70817e']:['#758a82','#8c9a88','#71887c'],8,Math.PI/8);
    }
    plain.tube(P(0,slate?30:28.9,0),P(0,slate?32.8:31.7,0),.10*sy,.052*sy,cream,6);
    if(!night&&!slate){plain.face([P(0,31.4,0),P(0,30.6,0),P(0,30.7,1.35),P(0,31.15,2.0)],'#b46554');}
  }
  if(night){landmark(-104,-85,.74,true,true);landmark(-115,83,.69,false,false);}
  else{landmark(-86,65,1.29,true,false);landmark(-113,-70,1.18,false,true);landmark(-119,-85,.89,true,true);bridge(batches);}
  const common=o=>new THREE.MeshLambertMaterial(Object.assign({vertexColors:true,side:THREE.DoubleSide},o));
  walls.build(parent,'Limewashed homes, gable ends and dormers',common({map:plasterMap()}));
  roof.build(parent,'Layered, tiled roofs and copper dormers',common({map:tileMap()}));
  stone.build(parent,'Arched stone viaduct over the lower road',common({map:stoneMap()}));
  plain.build(parent,'Chimneys, ridge caps, bell towers and masonry trim',common({}));
  windows.build(parent,'Individually placed shuttered windows', new THREE.MeshBasicMaterial({map:windowMap(night),vertexColors:true,alphaTest:.35,side:THREE.DoubleSide}));
  clocks.build(parent,'Painted faces of the tower clocks',new THREE.MeshBasicMaterial({map:clockMap(night),alphaTest:.38,side:THREE.DoubleSide}));
  parent.userData.houses=id;
}
function makeTownscape(parent,name){
  if(name==='city'||name==='night')buildDistrict(parent,name==='night');
}

export { makeTownscape };
