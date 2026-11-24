import * as THREE from "../vendor/three.module.js";
import { TAU, clamp, mix, smooth, noise, fbm, prng, pick, between, ink, texCanvas, sheet, ellipse, cachedMap, cutouts, Faces, makeGeometry } from "./journey-geometry.js";

function makeSkyDome(scene){
  const un={low:{value:new THREE.Color()},middle:{value:new THREE.Color()},high:{value:new THREE.Color()},glow:{value:new THREE.Color()},sun:{value:new THREE.Vector3()},strength:{value:0},lower:{value:new THREE.Color()},skySea:{value:0}};
  const shader=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:un,
    vertexShader:`varying vec3 dir;void main(){vec4 p=modelMatrix*vec4(position,1.);dir=p.xyz-cameraPosition;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader:`varying vec3 dir;uniform vec3 low,middle,high,glow,sun,lower;uniform float strength,skySea;
      void main(){vec3 d=normalize(dir);float y=d.y;
        vec3 c=mix(low,middle,pow(smoothstep(-.065,.28,y),.76));
        c=mix(c,high,pow(smoothstep(.16,.74,y),.76));c=mix(c,lower,skySea*smoothstep(.04,.46,-y));
        float lit=max(dot(d,sun),0.);c+=glow*strength*(.31*pow(lit,14.)+.48*pow(lit,71.));
        gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  const m=new THREE.Mesh(new THREE.SphereGeometry(1290,28,14),shader);m.frustumCulled=false;m.renderOrder=-100;m.name='Atmospheric gradient from the horizon to the zenith';scene.add(m);
  return cfg=>{un.low.value.set(cfg.horizon);un.middle.value.set(cfg.midSky);un.high.value.set(cfg.zenith);un.glow.value.set(cfg.glow);un.strength.value=cfg.glowAmount;un.sun.value.set(...cfg.sunVector).normalize();un.skySea.value=cfg.start===46?1:0;un.lower.value.set('#689abc');};
}
function cloudPaint(c,w,h,v){
  const r=prng(31248+v*4816),lobes=[],n=w*h;
  const add=(cx,cy,rx,ry,depth)=>lobes.push([cx*w,cy*h,rx*w,ry*h,depth]);
  // The underside is long and fairly flat. Higher turrets grow off a small
  // number of parent cells and the edge is broken by much smaller wisps.
  const towers=v===0?[[.28,.60,.17,.21],[.42,.48,.17,.34],[.56,.59,.18,.22],[.73,.63,.14,.17]]:
    v===1?[[.19,.67,.13,.13],[.34,.59,.15,.20],[.50,.51,.17,.29],[.64,.42,.14,.34],[.79,.61,.13,.17]]:
    v===2?[[.22,.66,.14,.13],[.36,.57,.15,.19],[.53,.59,.18,.19],[.70,.54,.15,.22],[.83,.66,.10,.12]]:
    [[.20,.63,.13,.13],[.32,.46,.14,.28],[.42,.39,.13,.31],[.56,.58,.16,.22],[.73,.66,.14,.15]];
  add(.50,.677,.439,.110,.36);
  for(let i=0;i<21;i++){
    const t=(i+.4)/21,x=.075+t*.85,mid=1-Math.abs(t*2-1),rad=.033+.050*r();
    add(x,.68+.072*Math.sin(t*6.2+v*2.1)+(.026+r()*.055)*mid,rad*(.70+r()*.61),(.033+.064*r())*(.65+mid*.42),.33+r()*.25);
  }
  for(const [cx,cy,rx,ry] of towers){
    add(cx,cy,rx,ry,.48+r()*.25);
    for(let k=0;k<9;k++){
      const a=r()*TAU,rad=.45+.54*r(),xx=cx+Math.cos(a)*rx*.84*rad,yy=cy+Math.sin(a)*ry*.79*rad;
      add(xx,yy,rx*(.24+r()*.33),ry*(.24+r()*.33),.39+r()*.38);
    }
  }
  const front=new Float32Array(n),coverage=new Float32Array(n),image=c.createImageData(w,h),data=image.data,offset=14+v*16;
  front.fill(-10);
  const nx=new Float32Array(n),ny=new Float32Array(n),fine=new Float32Array(n);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const id=y*w+x,dx=(noise(x*.022+offset,y*.024+11)-.5)*7.4+(noise(x*.095+8,y*.084+offset)-.5)*2.4,dy=(noise(x*.026-9,y*.029+offset)-.5)*6.4+(noise(x*.092+offset,y*.080-23)-.5)*2.3;
    nx[id]=x+dx;ny[id]=y+dy;fine[id]=noise(x*.13+offset,y*.12+1)*.42+noise(x*.043-11,y*.046+offset)*.58;
  }
  for(const [cx,cy,rx,ry,depth] of lobes){
    const x0=Math.max(0,Math.floor(cx-rx-7)),x1=Math.min(w-1,Math.ceil(cx+rx+7)),y0=Math.max(0,Math.floor(cy-ry-7)),y1=Math.min(h-1,Math.ceil(cy+ry+7)),base=ry*(depth-.5)*.50;
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const i=y*w+x,px=(nx[i]-cx)/rx,py=(ny[i]-cy)/ry,k=1-px*px-py*py;if(k<-.19)continue;
      const e=k*Math.min(rx,ry)*.54;
      coverage[i]=Math.max(coverage[i],smooth(-1.1,2.8,e));
      const d=base+Math.sqrt(Math.max(0,k))*ry*(.60+depth*.39),o=front[i],soft=5.0;
      front[i]=Math.max(o,d)+Math.max(0,soft-Math.abs(o-d))**2/(4*soft);
    }
  }
  const shadow=[152,169,184],top=[248,245,230],back=[187,204,212];
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const i=y*w+x,alpha=coverage[i];if(alpha<.005)continue;
    const gx=clamp((front[i+1]-front[i-1])*.48,-1.8,1.8),gy=clamp((front[i+w]-front[i-w])*.48,-1.8,1.8);
    const norm=1/Math.sqrt(1+gx*gx+gy*gy),light=clamp((-.44*gx+.76*gy+.61)*norm*.54+.45);
    const yp=y/h,base=smooth(.79,.33,yp)*.33,relief=.40*light+.31+.25*base+.13*(fine[i]-.48)-.20*smooth(.65,.81,yp);
    const t=smooth(.28,.79,relief),edge=(1-alpha)*.36;
    for(let k=0;k<3;k++)data[i*4+k]=Math.round(mix(mix(shadow[k],top[k],t),back[k],edge));
    data[i*4+3]=Math.round(alpha*255);
  }
  c.putImageData(image,0,0);
}
// putImageData ignores the current canvas transform, so bake each atlas cell
// on its own canvas and composite it at the requested atlas position.
function cloudMap(){
  return cachedMap('modelled cumulus',()=>sheet(408,215,(c,w,h,v)=>{
    const a=document.createElement('canvas');a.width=w;a.height=h;cloudPaint(a.getContext('2d'),w,h,v);c.drawImage(a,0,0);
  }));
}
function cirrusMap(){
  return cachedMap('wind-sheared cloud',()=>sheet(384,144,(c,w,h,v)=>{
    const r=prng(9278+v*367);
    const rise=(v%2?1:-1)*between(r,18,36),crest=between(r,17,32);
    c.filter='blur(1.55px)';
    for(let k=0;k<82;k++){
      const t=(r()+r()+r())/3,x=between(r,.02*w,.50*w),end=x+between(r,.24*w,.65*w),base=h*(.36+.25*t),factor=(r()-.5);
      const grad=c.createLinearGradient(x,0,end,0);grad.addColorStop(0,'rgba(235,241,234,0)');grad.addColorStop(.43,'rgba(232,239,232,'+(.045+r()*.11)+')');grad.addColorStop(.69,'rgba(244,243,226,'+(.07+r()*.10)+')');grad.addColorStop(1,'rgba(241,243,233,0)');
      c.strokeStyle=grad;c.lineWidth=.6+r()**1.5*4.3;c.lineCap='round';c.beginPath();c.moveTo(x,base+factor*22);
      c.bezierCurveTo(x+(end-x)*.22,base-rise*.45+factor*11,x+(end-x)*.67,base-crest+factor*28,end,base-rise+factor*24);c.stroke();
    }
    c.filter='none';
  }));
}
function skyBanks(parent,name,time){
  const sets={
    spring:[[ -437,65,204,150,46,0],[-483,111,-197,161,57,1],[-493,103,39,96,34,2],[-383,39,-44,70,19,2],[-366,43,91,88,33,0],[-387,48,-276,122,42,3]],
    summer:[[-419,67,198,198,79,1],[-448,91,87,134,57,0],[-490,87,-190,218,85,3],[-384,47,-45,78,36,0],[-390,57,-295,92,35,2]],
    autumn:[[-440,80,190,183,45,2],[-389,50,-174,134,40,0],[-451,95,-220,137,49,2],[-437,47,90,102,29,2]],
    winter:[[-435,85,187,234,72,0],[-435,108,-250,192,70,3],[-356,49,-88,109,37,2],[-433,69,51,100,42,1]],
    desert:[[-526,99,-292,157,31,2],[-489,73,231,121,26,2],[-497,58,2,74,17,2]],
    sky:[[-460,102,194,180,82,1],[-459,125,-197,164,64,0],[-390,41,-41,160,35,2],[-382,46,56,113,29,2]],
    city:[[-460,87,168,204,54,2],[-428,53,-157,154,41,2],[-510,77,-281,186,42,0],[-455,48,-23,109,23,2]],
    night:[[-504,45,168,181,34,2],[-543,52,-132,125,25,2],[-484,47,-315,126,30,2]]
  };
  const tint={spring:'#fff9f5',summer:'#ffffff',autumn:'#f7dcc8',winter:'#d6dfe7',desert:'#f1d8ca',sky:'#ffffff',city:'#f5c7b3',night:'#53637b'}[name];
  const cloudItems=sets[name].map(([x,y,z,w,h,v],i)=>[x,y,z,w,h,0,v,tint,i%2===0]);
  cutouts(parent,'Distant cumulus with sunlit crests',cloudMap(),cloudItems,time,{cut:.015,blend:true,opacity:name==='night'?.53:name==='desert'?.70:.91,fog:false,order:-9});
  const r=prng(1911+name.length),wisps=[];
  for(let i=0;i<(name==='night'||name==='city'?0:name==='desert'?4:2);i++){
    const x=between(r,-610,-510),z=(i-(name==='desert'?1.5:.5))*180+between(r,-62,63),y=between(r,149,230);
    wisps.push([x,y,z,between(r,128,244),between(r,25,55),0,i%4,name==='night'?'#677383':name==='city'?'#edbcaf':name==='desert'?'#f2d4c2':'#e3f2f2',r()<.5]);
  }
  cutouts(parent,'High, wind-combed cirrus',cirrusMap(),wisps,time,{cut:.008,blend:true,opacity:.36,fog:false,order:-10});
}
function moonTexture(){
  return cachedMap('silver moon',()=>texCanvas(384,384,(c,w,h)=>{
    const cx=192,cy=192,R=91,r=prng(448);
    const halo=c.createRadialGradient(cx,cy,R*.85,cx,cy,R*2.08);
    halo.addColorStop(0,'rgba(198,221,228,.36)');halo.addColorStop(.28,'rgba(157,196,218,.21)');halo.addColorStop(.59,'rgba(124,159,196,.10)');halo.addColorStop(1,'rgba(111,146,190,0)');c.fillStyle=halo;c.fillRect(0,0,w,h);
    c.save();c.beginPath();c.arc(cx,cy,R,0,TAU);c.clip();
    const g=c.createRadialGradient(cx-25,cy-24,9,cx+10,cy+5,104);g.addColorStop(0,'#f5ecd3');g.addColorStop(.68,'#e3e1cd');g.addColorStop(.88,'#d1d5c9');g.addColorStop(1,'#9aaab0');c.fillStyle=g;c.fillRect(0,0,w,h);
    const maria=[[-.42,-.25,.24,.14],[-.15,-.39,.17,.16],[.14,-.30,.22,.16],[.44,-.17,.19,.18],[.27,.00,.13,.11],[-.36,.02,.15,.21],[-.14,.26,.29,.11],[.03,-.53,.26,.06]];
    for(const [x,y,rx,ry] of maria){
      for(let k=0;k<94;k++){const a=TAU*r(),d=Math.sqrt(r()),xx=cx+R*(x+Math.cos(a)*rx*d),yy=cy+R*(y+Math.sin(a)*ry*d);
        ellipse(c,xx,yy,1.2+r()**2*7.9,1.2+r()**2*5.1,r()*TAU,pick(['rgba(113,128,137,.13)','rgba(132,142,141,.17)','rgba(150,157,146,.13)'],r));}
    }
    for(let i=0;i<310;i++){
      const a=r()*TAU,d=Math.sqrt(r())*R,x=cx+Math.cos(a)*d,y=cy+Math.sin(a)*d,rad=.45+r()**3*4.6;
      ellipse(c,x+.38,y+.52,rad,rad*.75,0,'rgba(102,117,123,.17)');ellipse(c,x-.23,y-.16,rad*.83,rad*.61,0,'rgba(240,234,208,.29)');
    }c.restore();
  }));
}
function sunTexture(){
  return cachedMap('amber sun',()=>texCanvas(256,256,(c,w,h)=>{
    const r=c.createRadialGradient(128,128,2,128,128,126);r.addColorStop(0,'rgba(255,238,187,1)');r.addColorStop(.22,'rgba(255,223,157,1)');r.addColorStop(.237,'rgba(255,218,150,.81)');r.addColorStop(.264,'rgba(252,198,135,.32)');r.addColorStop(.56,'rgba(250,187,137,.10)');r.addColorStop(1,'rgba(243,182,144,0)');c.fillStyle=r;c.fillRect(0,0,w,h);
  }));
}
function nightStars(parent,time){
  const r=prng(65156),p=[],data=[],col=[],c=new THREE.Color();
  for(let i=0;i<840;i++){
    const a=between(r,-1.25,1.25),el=.027+Math.pow(r(),.86)*.83,rad=950;
    const x=-Math.cos(a)*Math.cos(el),z=Math.sin(a)*Math.cos(el);
    p.push(x*rad,Math.sin(el)*rad,z*rad);data.push(r(),r()*TAU);
    c.copy(ink('#b7cbdf')).lerp(ink('#fae7bd'),r()**2*.82);col.push(c.r,c.g,c.b);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('variant',new THREE.Float32BufferAttribute(data,2));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  const u={uTime:time,uScreen:{value:window.innerHeight}};
  const mat=new THREE.ShaderMaterial({uniforms:u,transparent:true,depthWrite:false,vertexShader:`attribute vec2 variant;attribute vec3 color;uniform float uTime,uScreen;varying float power;varying vec3 col;
    void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);float s=pow(variant.x,5.);gl_PointSize=max(1.3,uScreen/680.*(1.10+3.45*s));power=(.30+.69*variant.x)*(.78+.22*pow(.5+.5*sin(uTime*1.33+variant.y),2.));col=color;}`,
    fragmentShader:`varying float power;varying vec3 col;void main(){vec2 p=(gl_PointCoord-.5)*2.;float d=length(p);float core=exp(-d*d*6.);float t=power*(core+.36*exp(-abs(p.x)*16.)*exp(-abs(p.y)*4.)+.36*exp(-abs(p.y)*16.)*exp(-abs(p.x)*4.));if(t<.025)discard;gl_FragColor=vec4(col*(1.+core*.32),t);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`});
  const s=new THREE.Points(g,mat);s.name='Uneven star field with bright and faint stars';s.frustumCulled=false;s.renderOrder=-12;parent.add(s);return ()=>{u.uScreen.value=window.innerHeight;};
}
function makeAtmosphericLayers(parent,name,time){
  const skyGroup=new THREE.Group();skyGroup.name='Slow cloud drift';parent.add(skyGroup);skyBanks(skyGroup,name,time);
  let updateStars=null;
  if(name==='night'){
    updateStars=nightStars(parent,time);
    cutouts(parent,'Silver moon, maria and soft aureole',moonTexture(),[[-554,126,-261,151,151,0,0,'#f7faf7']],time,{atlas:false,cut:.003,blend:true,fog:false,order:-11});
  }else if(name==='city'){
    cutouts(parent,'Low evening sun',sunTexture(),[[-495,62,225,194,194,0,0,'#fff4dd']],time,{atlas:false,cut:.003,blend:true,fog:false,order:-11});
  }
  if(name==='sky')airSea(parent,time);
  return (t,elapsed)=>{skyGroup.position.z=-elapsed*(name==='sky'?.75:.27);if(updateStars)updateStars();};
}

function cliffPaint(){
  return cachedMap('airborne shale with moss',()=>texCanvas(320,320,(c,w,h)=>{
    const r=prng(12963);c.fillStyle='#e2e1d4';c.fillRect(0,0,w,h);
    for(let k=0;k<900;k++){
      const a=between(r,1,10);ellipse(c,r()*w,r()*h,a,a*between(r,.21,.61),-.72+r()*.56,pick(['rgba(99,111,105,.095)','rgba(127,134,113,.13)','rgba(248,248,220,.32)'],r));
    }
    for(let k=0;k<160;k++){
      const x=r()*w,y=r()*h,d=2+r()**2*36;c.strokeStyle=pick(['rgba(118,125,119,.29)','rgba(147,147,123,.32)','rgba(246,238,209,.43)'],r);c.lineWidth=.5+r()**2*1.3;c.beginPath();c.moveTo(x,y);c.lineTo(x+d*.48,y-d*.23+(r()-.5)*4);c.lineTo(x+d,y-d*.52+r()*4);c.stroke();
    }
  },true));
}
function floater(parent){
  const r=prng(12809),cliff=new Faces(),top=new Faces(),pines=new Faces(),falls=new Faces(),moss=new Faces();
  const islands=[[-187,89,44,9.6,14.2,.18],[-252,-173,52,10.4,19.6,-.83]];
  for(let id=0;id<islands.length;id++){
    const [x,z,y,rad,depth,phase]=islands[id],n=34,es=12,cs=[],rings=[];
    for(let i=0;i<n;i++){
      const a=TAU*i/n+phase,rr=.79+.13*Math.sin(a*3+.7)+.10*Math.sin(a*5-1.6)+.075*Math.sin(a*8+.3)+.047*r();
      cs.push([a,rr,.5+.5*Math.sin(a*3+.25)+.25*Math.cos(a*8+1.78),r()*.35]);
    }
    function topY(a,t=1){return y+t*(.68*Math.sin(a*2+phase)+1.18*Math.sin(a*3-.55)+.37*Math.cos(a*8+1.21))+(1-t)*1.6;}
    function rimAt(i,t){
      const [a,rr,spur,grain]=cs[i],ease=t**(.59+.22*Math.sin(a*2.1)),ledge=.93+.035*Math.sin(t*29+grain*4+Math.cos(a*3)*.57);
      const k=rr*ease*ledge*(1+.075*Math.sin(a*5+t*6.8))+(1-t)*.04;
      const xx=x+rad*(Math.cos(a)*k*.81+.31*(1-t)-.14*Math.sin(t*TAU));
      const zz=z+rad*(Math.sin(a)*k*1.42-.23*(1-t)+.13*Math.sin(t*4.6+phase));
      const bottom=y-depth-(.22+.72*spur)*depth*(1-t)*.40;
      return [xx,mix(bottom,topY(a),t)+Math.sin(a*6+t*5)*(.25+.66*(1-t)),zz];
    }
    const fac=y=>Math.max(0,Math.min(1,y));
    for(let j=0;j<=es;j++){
      const t=j/es,row=cs.map((_,i)=>rimAt(i,t));rings.push(row);
      if(j)for(let i=0;i<n;i++){
        const q=(i+1)%n,[a,rr,spur]=cs[i],l=rings[j-1][i],n0=rings[j-1][q],v=row[q],u=row[i];
        const rock=(a,t)=>{const cut=fbm(Math.cos(a)*3.75+t*2.8+id*9,Math.sin(a)*3.75-t*4.1+16);
          const color=new THREE.Color().copy(ink('#657c82')).lerp(ink('#a1a498'),fac(.14+.60*cut+Math.cos(a-.48)*.18+t*.15));
          if(t>.76)color.lerp(ink('#7d9174'),smooth(.76,1,t)*(.28+.40*cut));return color;};
        const v0=rock(a,(j-1)/es),v1=rock(cs[q][0],(j-1)/es),v2=rock(cs[q][0],t),v3=rock(a,t);
        const uvv=[[i/n*3.8,(j-1)/es*2.6],[(i+1)/n*3.8,(j-1)/es*2.6],[(i+1)/n*3.8,t*2.6],[i/n*3.8,t*2.6]];
        cliff.face([l,n0,v],[v0,v1,v2],[uvv[0],uvv[1],uvv[2]]);cliff.face([l,v,u],[v0,v2,v3],[uvv[0],uvv[2],uvv[3]]);
      }
    }
    let prev=null;
    for(const d of [.03,.30,.61,.81,1]){
      const row=cs.map(([a],i)=>{const e=rings[es][i];return [mix(x,e[0],d),topY(a,d)+(.4+.9*noise(Math.cos(a)*2.1+d*3.7,Math.sin(a)*2.1+id*6.2))*(1-d),mix(z,e[2],d)];});
      if(prev)for(let i=0;i<n;i++){
        const q=(i+1)%n,co=pick(['#87a16f','#99af77','#a7b67d','#7e9b72','#91aa70'],r);
        top.face([prev[i],prev[q],row[q]],co);top.face([prev[i],row[q],row[i]],co);
      }
      prev=row;
    }
    for(let i=0;i<34;i++){
      const a=TAU*r(),d=rad*.65*Math.sqrt(r()),xx=x+.64*Math.cos(a)*d,zz=z+Math.sin(a)*d*1.20,yy=topY(a,d/rad)+.56,ht=between(r,1.25,3.9);
      pines.tube([xx,yy,zz],[xx+.05,yy+ht*.87,zz],.13,.046,'#75826a',5);
      for(let k=0;k<3;k++){
        const rr=ht*(.24-.045*k);pines.tube([xx+.03*k,yy+ht*(.13+k*.19),zz],[xx+.06*k,yy+ht*(.69+.14*k),zz+.05],rr,.035,pick(['#557e6e','#718e75','#7a9374'],r),7);
      }
    }
    for(let j=0;j<13;j++){
      const a=Math.floor(r()*n),p=rings[es][a],len=1.0+2.7*r();
      moss.tube([p[0],p[1]-.1,p[2]],[p[0]+.19,p[1]-len,p[2]+.25],.11,.035,pick(['#879a73','#81977b','#9aa776'],r),4);
    }
    if(id===0){
      const tx=x-1.0,tz=z+3.1,ty=y+1.70;
      top.box(tx,ty,tz,2.4,3.9,2.6,'#bbbca8',.13);top.box(tx,ty+3.5,tz,2.6,.52,2.8,'#afb69e',.13);
      top.box(tx+.45,ty+3.87,tz-.7,.52,1.12,.64,'#c4c4ad',.13);
    }
    const waterfall=rings[es][id===0?4:29],w=id===0?.74:.64;
    for(let k=0;k<12;k++){
      const t=k/12,u=(k+1)/12,point=(v,s)=>[waterfall[0]+.4+Math.sin(v*3.8)*1.9,waterfall[1]-.04-v*depth*1.25,waterfall[2]+v*v*2.3+s*w*(1+.3*v)];
      falls.face([point(t,-.5),point(t,.5),point(u,.5),point(u,-.5)],k>8?'#a4cad7':'#d0e7e7');
    }
  }
  cliff.build(parent,'Weathered airborne cliffs',new THREE.MeshLambertMaterial({map:cliffPaint(),vertexColors:true,side:THREE.DoubleSide}));
  top.build(parent,'Mossy crests and a ruined watchtower');pines.build(parent,'Distant stands of trees');moss.build(parent,'Hanging vegetation');
  falls.build(parent,'Water falling away into the air',new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.71,side:THREE.DoubleSide,depthWrite:false}));
}
function billowGeometry(variant){
  const r=prng(7563+variant*1873),lobes=[[0,-.06,0,.71,.59,.94]];
  const main=[[-.25,-.01,-.53,.54,.58,.47],[.25,-.04,.55,.49,.47,.51],[-.51,-.13,.19,.45,.42,.55],[.57,-.13,-.17,.43,.50,.50],[-.05,.25,.03,.46,.47,.50]];
  for(const [x,y,z,a,b,d] of main){
    lobes.push([x+(r()-.5)*.13,y+(r()-.5)*.19,z+(r()-.5)*.16,a,b,d]);
    for(let i=0;i<4;i++){
      const u=TAU*r(),v=(r()-.37)*1.15,S=.20+r()*.17;
      lobes.push([x+Math.cos(u)*a*.79,y+Math.sin(v)*b*.69,z+Math.sin(u)*d*.75,S*(.75+r()*.6),S*(.60+r()*.51),S*(.76+r()*.56)]);
    }
  }
  const nx=26,ny=16,nz=29,Lx=1.45,Ly=1.27,Lz=1.58,grid=[],norm=[],p=[],nn=[],ind=[],at=(i,j,k)=>(i*ny+j)*nz+k;
  for(let i=0;i<nx;i++)for(let j=0;j<ny;j++)for(let k=0;k<nz;k++){
    const x=mix(-Lx,Lx,i/(nx-1)),y=mix(-Ly,Ly,j/(ny-1)),z=mix(-Lz,Lz,k/(nz-1));
    const wx=x+.105*(noise(x*4.5+32+z,y*4.3+variant)-.5),wy=y+.12*(noise(y*3.6+z*.71+13,x*3.3-9)-.5),wz=z+.088*(noise(z*5.0+x*1.1-12,y*4.3+19)-.5);
    let dist=4;
    for(const [cx,cy,cz,rx,ry,rz] of lobes){
      const d=(Math.sqrt(((wx-cx)/rx)**2+((wy-cy)/ry)**2+((wz-cz)/rz)**2)-1)*Math.min(rx,ry,rz);
      const blend=.14;dist=Math.min(dist,d)-Math.max(0,blend-Math.abs(dist-d))**2/(4*blend);
    }
    grid.push([x,y,z,dist]);
  }
  for(let i=0;i<nx;i++)for(let j=0;j<ny;j++)for(let k=0;k<nz;k++){
    const dx=grid[at(Math.min(nx-1,i+1),j,k)][3]-grid[at(Math.max(0,i-1),j,k)][3],dy=grid[at(i,Math.min(ny-1,j+1),k)][3]-grid[at(i,Math.max(0,j-1),k)][3],dz=grid[at(i,j,Math.min(nz-1,k+1))][3]-grid[at(i,j,Math.max(0,k-1))][3];
    const n=new THREE.Vector3(dx*(nx-1)/Lx,dy*(ny-1)/Ly,dz*(nz-1)/Lz).normalize();norm.push(n);
  }
  const vertices=new Map(),u=new THREE.Vector3(),v=new THREE.Vector3();
  function edge(a,b){const key=a<b?a*grid.length+b:b*grid.length+a;if(vertices.has(key))return vertices.get(key);
    const A=grid[a],B=grid[b],t=A[3]/(A[3]-B[3]),idx=p.length/3;p.push(mix(A[0],B[0],t),mix(A[1],B[1],t),mix(A[2],B[2],t));
    const n=norm[a].clone().lerp(norm[b],t).normalize();nn.push(n.x,n.y,n.z);vertices.set(key,idx);return idx;
  }
  function tri(a,b,c){
    u.set(p[b*3]-p[a*3],p[b*3+1]-p[a*3+1],p[b*3+2]-p[a*3+2]);v.set(p[c*3]-p[a*3],p[c*3+1]-p[a*3+1],p[c*3+2]-p[a*3+2]);u.cross(v);
    if(u.x*nn[a*3]+u.y*nn[a*3+1]+u.z*nn[a*3+2]>0)ind.push(a,b,c);else ind.push(a,c,b);
  }
  const tets=[[0,1,3,7],[0,3,2,7],[0,2,6,7],[0,6,4,7],[0,4,5,7],[0,5,1,7]];
  for(let i=0;i<nx-1;i++)for(let j=0;j<ny-1;j++)for(let k=0;k<nz-1;k++){
    const a=[at(i,j,k),at(i+1,j,k),at(i,j+1,k),at(i+1,j+1,k),at(i,j,k+1),at(i+1,j,k+1),at(i,j+1,k+1),at(i+1,j+1,k+1)];
    const count=a.reduce((n,id)=>n+(grid[id][3]<0?1:0),0);if(!count||count===8)continue;
    for(const f of tets){const interior=[],exterior=[];
      for(const k of f)(grid[a[k]][3]<0?interior:exterior).push(a[k]);
      if(interior.length===0||interior.length===4)continue;
      if(interior.length===1||interior.length===3){const from=interior.length===1?interior:exterior,to=from===interior?exterior:interior;
        tri(edge(from[0],to[0]),edge(from[0],to[1]),edge(from[0],to[2]));
      }else{const A=edge(interior[0],exterior[0]),B=edge(interior[0],exterior[1]),C=edge(interior[1],exterior[1]),D=edge(interior[1],exterior[0]);tri(A,B,C);tri(A,C,D);}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nn,3));g.setIndex(ind);g.computeBoundingSphere();return g;
}
function billowMaterial(time){
  const g=cachedMap('cloud particulates',()=>texCanvas(256,256,(c,w,h)=>{
    const d=c.createImageData(w,h),a=d.data;
    for(let j=0;j<h;j++)for(let i=0;i<w;i++){const u=i/w*TAU,v=j/h*TAU;
      const b=fbm(Math.cos(u)*3.7+Math.cos(v)*2.1+11,Math.sin(v)*4.1+Math.sin(u)*2.3-7),f=fbm(Math.cos(u)*12+Math.cos(v)*8.2,Math.sin(v)*11.3+Math.sin(u)*5.7);
      const q=(j*w+i)*4;a[q]=b*255;a[q+1]=f*255;a[q+2]=.5*(b+f)*255;a[q+3]=255;
    }c.putImageData(d,0,0);
  },true));g.colorSpace=THREE.NoColorSpace;
  return new THREE.ShaderMaterial({transparent:true,depthWrite:true,uniforms:{clock:time,pat:{value:g},low:{value:ink('#6592b3')},high:{value:ink('#eff1e9')},aerial:{value:ink('#bad7e1')}},vertexShader:`
    uniform float clock;varying vec3 localP,worldP,N;void main(){mat4 M=modelMatrix*instanceMatrix;vec4 q=M*vec4(position,1.);q.y+=.29*sin(clock*.34+M[3].x*.10+position.z*2.3);q.z+=.32*sin(clock*.22+M[3].z*.08);worldP=q.xyz;localP=position;mat3 m=mat3(M);vec3 n=normal/vec3(dot(m[0],m[0]),dot(m[1],m[1]),dot(m[2],m[2]));N=normalize(m*n);gl_Position=projectionMatrix*viewMatrix*q;}`,
    fragmentShader:`uniform sampler2D pat;uniform vec3 low,high,aerial;varying vec3 localP,worldP,N;
      void main(){vec3 n=normalize(N);vec2 uv=(worldP.xz+vec2(worldP.y*.54,worldP.y*.4))*.014;vec2 n0=texture2D(pat,uv).rg,n1=texture2D(pat,uv*2.4+.41).rg;
        float nx=texture2D(pat,uv+vec2(.011,0.)).r-n0.x,nz=texture2D(pat,uv+vec2(0.,.011)).r-n0.x;
        n=normalize(n+vec3(-nx*1.12,0.,-nz*1.12));
        float diffuse=dot(n,normalize(vec3(.35,.62,.70)));float top=smoothstep(-.65,.52,localP.y);
        float lit=clamp(.045+.265*top+.33*diffuse+.29*n0.x+.14*(n1.y-.52),0.,1.);vec3 color=mix(low,high,smoothstep(.17,.88,lit));
        vec3 viewDir=normalize(cameraPosition-worldP);float edge=1.-smoothstep(.02,.42,abs(dot(viewDir,n)));color=mix(color,high,.13*edge);
        float fog=smoothstep(140.,523.,length(cameraPosition-worldP));color=mix(color,aerial,.76*fog);gl_FragColor=vec4(color,.98-edge*(.25+.17*n0.y));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
}
function airSea(parent,time){
  const r=prng(8512),groups=[[],[],[]],mat=billowMaterial(time),banks=[];
  function bank(kind,x,y,z,rx,ry,rz,angle=0){groups[kind].push([x,y,z,rx,ry,rz,angle]);}
  // The high bank sits under the moving feet. Its undulating visible lip
  // gives way to an open gulf, with a second and a third cloud deck below.
  bank(0,0,-4.6,-.8,15.4,6.0,21.5,.11);bank(2,-9,-6.80,24,16.3,9.3,20.6,-.33);
  bank(1,-11,-8.8,-29,18,11.2,25,.38);bank(2,24,-7.2,37.5,13.7,17.6,18.0,.32);
  bank(1,24,-7.9,-39,18.7,17.9,17.0,-.25);bank(0,32,-12,58.7,18.0,17.8,22.7,.39);
  bank(0,35,-17,-61,16,16.5,24.1,-.08);
  for(let row=0;row<4;row++)for(let j=-3;j<=3;j++){
    if((row===0&&j===0)||(row===1&&j=== -1)||r()<.14)continue;
    const x=-35-row*57+between(r,-13.5,13.5),z=j*(37+row*9)+between(r,-12,12),y=-17-row*2.15+between(r,-7,5);
    bank((row+j+6)%3,x,y,z,between(r,19,38)*(1+row*.05),between(r,11.1,22.0),between(r,20,43),between(r,-.85,.85));
  }
  for(let j=0;j<13;j++){const x=between(r,-185,18),z=between(r,-155,167);if(x>-115&&z>-36&&z<19)continue;bank(j%3,x,between(r,-42,-59),z,between(r,24,58),between(r,8,17),between(r,27,65),r()*1.7);}
  const tmp=new THREE.Object3D();
  for(let i=0;i<3;i++){
    const set=groups[i],mesh=new THREE.InstancedMesh(billowGeometry(i),mat,set.length);
    for(let j=0;j<set.length;j++){const [x,y,z,rx,ry,rz,a]=set[j];tmp.position.set(x,y,z);tmp.rotation.set(0,a,0);tmp.scale.set(rx,ry,rz);tmp.updateMatrix();mesh.setMatrixAt(j,tmp.matrix);}
    mesh.name='Carved three-dimensional cloud banks';mesh.computeBoundingSphere();parent.add(mesh);
  }
  for(let i=0;i<11;i++){const x=between(r,-230,-80),z=between(r,-200,180),w=between(r,25,66);banks.push([x,between(r,-25,-10),z,w,w*between(r,.19,.40),between(r,-.19,.19),i%4,'#e0edf3',r()<.5]);}
  for(const [x,y,z,w,h,v] of [[4,-6.9,-14.5,20,8.4,2],[-13,-10,24,27,12.5,3],[22,-7.7,38,28,14,0],[15,-8.7,-42,29,13.9,1],[-36,-13,-10,35,13.4,3]]){
    banks.push([x,y,z,w,h,.01,v,'#ebf1f4',false]);
  }
  cutouts(parent,'Distant mist between cloud layers',cloudMap(),banks,time,{cut:.015,blend:true,opacity:.63,order:-1});
  const veil=[];
  for(const [x,y,z,w,h,v] of [[9,-4.7,15,22,7.8,0],[12,-4.0,-14,23,6.7,1],[21,-6.2,34,34,10,2],[25,-7.2,-36,31,11,3],[27,-10.5,14,25,9,1],[23,-11.3,-16,26,8,2],[-31,-9.1,-1,35,10,0],[-50,-12,-30,44,12,2],[-97,-15,31,50,15,1]]){
    veil.push([x,y,z,w,h,.06,v,'#edf3f2',v%2===0]);
  }
  cutouts(parent,'Fleecy vapour edging the open cloud channels',vapourMap(),veil,time,{cut:.006,blend:true,opacity:.79,wind:.025,order:4});
  floater(parent);
}

function vapourMap(){
  return cachedMap('fine mist at the rim',()=>sheet(256,136,(c,w,h,v)=>{
    const tmp=document.createElement('canvas');tmp.width=w;tmp.height=h;const ctx=tmp.getContext('2d'),img=ctx.createImageData(w,h),px=img.data;
    for(let j=0;j<h;j++)for(let i=0;i<w;i++){
      const x=i/w*2-1,y=j/h*2-1,b=fbm(i*.027+v*17,j*.031+v*8+13),n=fbm(i*.073+31,j*.074+v*13);
      const cy=.21*Math.sin(x*4.5+v)+.16*Math.cos(x*7.3+v*.9),dx=x*1.04,dy=(y-cy)*1.59;
      const d=1-dx*dx-dy*dy+(b-.50)*.94+(n-.49)*.31,cover=smooth(-.06,.83,d)*smooth(.29,.64,b*.65+n*.35);
      const k=(j*w+i)*4,light=clamp(.58-.36*y+.26*(b-.45));px[k]=mix(167,239,light);px[k+1]=mix(193,244,light);px[k+2]=mix(210,241,light);px[k+3]=Math.round(cover*168);
    }ctx.putImageData(img,0,0);c.drawImage(tmp,0,0);
  }));
}

export { makeSkyDome, makeAtmosphericLayers };
