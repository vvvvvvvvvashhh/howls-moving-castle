// 高地、炉火、芜菁头和四季的基础镜头。最终影片从 40 秒起改由
// direction/ending.js 连续取样；原始轨道也提供了衔接时的速度和方向。
import * as THREE from "../vendor/three.module.js";
import { createCameraA } from "./camera-a.js";
import { createCameraB } from "./camera-b.js";

const DURATION=60;
const chapters=[{t:0,name:'随风掠过城堡'},{t:22,name:'炉火的回应'},{t:25,name:'老朋友，一起走'},{t:30,name:'追着四季远行'},{t:54,name:'迎着晨光回家'}];
const worldCuts=[
 {a:30,b:32.5,world:'spring',name:'春 · 花开成路'},
 {a:32.5,b:35,world:'summer',name:'夏 · 风过湖湾'},
 {a:35,b:37.5,world:'autumn',name:'秋 · 金色的林间'},
 {a:37.5,b:40,world:'winter',name:'冬 · 踏过雪原'},
 {a:40,b:42.5,world:'desert',name:'远行 · 沙丘'},
 {a:42.5,b:45,world:'city',name:'远行 · 城市上空'},
 {a:45,b:49,world:'sky',name:'张开翅膀，飞进云海'},
 {a:49,b:51.5,world:'night',name:'夜 · 灯火在等我们'}
];
const v=a=>new THREE.Vector3(...a),up=new THREE.Vector3(0,1,0),clamp=THREE.MathUtils.clamp;
const sm=(a,b,t)=>THREE.MathUtils.smootherstep(t,a,b),mix=THREE.MathUtils.lerp;
function motionAt(t){
 const distance=t<30?.45*t:13.5+2.25*(t-30),speed=t<30?.45:2.25;
 const flight=sm(43.7,45.5,t)*(1-sm(48.6,50.4,t));
 return {distance,speed,flight,bank:flight*(.035*Math.sin((t-44)*1.37)+.022),landing:t>=50.4?Math.exp(-(t-50.4)*9):0,height:flight*10};
}
function createDirection(land,variant='B'){
 const exterior=(variant==='A'?createCameraA:createCameraB)(land);
 function sample(t){
  t=clamp(t,0,60);const motion=motionAt(t);let type='exterior',world=null,chapter=0,name='风穿花海';
  let castleZ=(t-15)*.45,position,target,bird,bank=0,birdBank=0,fov=47;
  if(t<22){
   const s=exterior.sample(t,castleZ);position=s.camera;target=s.target;bird=s.bird;bank=s.bank;birdBank=s.birdBank;fov=s.fov;
   name=t<5.75?'风穿花海':t<10.7?'随乌鸦升起':t<15.8?'从城门旁掠过':'飞进红屋顶的小城';
  }else if(t<25){
   type='interior';chapter=1;name='卡西法，也一起走';const u=(t-22)/3;
   position=v([mix(1.6,.30,sm(22,25,t)),mix(2.55,2.05,u),mix(4.8,2.2,sm(22,25,t))]);
   target=v([mix(-.43,.32,sm(23.35,24.5,t)),mix(1.70,1.76,u),mix(-2.93,-2.57,sm(23.35,24.5,t))]);fov=mix(49,46,u);
  }else if(t<30){
   type='greet';chapter=2;name='芜菁头，出发啦';castleZ=.45*(t-25);
   // The character root will supply a small real travel offset after sampling its jumps.
   const u=(t-25)/5,theta=mix(.42,.13,u),radius=mix(10.1,9.6,u),base=land.heightAt(25,35);
   position=v([25+Math.sin(theta)*radius,base+2.65,35+Math.cos(theta)*radius]);target=v([25,base+3.15,35]);fov=mix(43.8,44.4,u);
   if(t<27.3){const a=(t-25)/2.3;bird=v([mix(36,2,a),base+8.6+Math.sin(a*Math.PI)*1.7,mix(44,17,a)]);birdBank=-.18*Math.sin(a*Math.PI);}
  }else if(t<51.5){
   type='journey';chapter=3;const section=worldCuts.find(s=>t<s.b)||worldCuts.at(-1);world=section.world;name=section.name;castleZ=0;
   const u=(t-30)/21.5,theta=THREE.MathUtils.degToRad(42+78*u),radius=89+2.8*Math.sin(u*Math.PI);
   position=v([Math.sin(theta)*radius,25+3.5*Math.sin(u*Math.PI)+motion.height,Math.cos(theta)*radius]);target=v([0,22+motion.height,0]);
   fov=44+1.4*Math.sin(u*Math.PI);bank=motion.flight*.008*Math.sin((t-45)*.6);
   bird=v([28-1.95*(t-30),49+motion.height+2.2*Math.sin((t-30)*.37),23+3*Math.sin((t-30)*.23)]);birdBank=.10*Math.sin((t-30)*.4);
  }else{
   type='home';chapter=4;name='我们一起，慢慢走远';const local=t-51.5,p=sm(52.5,57.2,t);castleZ=2.25*local;
   const gy=land.heightAt(8,-19);
   position=v([mix(14.4,42,p),mix(gy+2.85,24,p),mix(-25.1,-65,p)]);
   target=v([mix(8,0,p),mix(gy+3.1,17,p),mix(-19,5+castleZ*.40,p)]);fov=46;
   bird=v([-12-2.6*local,32+3.3*local,castleZ+16+7*local]);birdBank=.11*Math.sin(local*.65);
  }
  return {t,type,world,chapter,name,camera:position,target,bird,bank,birdBank,fov,castleZ,motion};
 }
 function birdTangent(t){const a=sample(Math.max(0,t-.035)),b=sample(Math.min(59.999,t+.035));if(!a.bird||!b.bird)return new THREE.Vector3(-1,0,0);const d=b.bird.clone().sub(a.bird);return d.lengthSq()>1e-8?d.normalize():new THREE.Vector3(0,0,1);}
 return {sample,birdTangent};
}

export { DURATION, chapters, worldCuts, motionAt, createDirection };
