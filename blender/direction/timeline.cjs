'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {clamp,radians,add,sub,scale,unit,vMix,dot,cross,smooth,project}=require('./curves.cjs');
const {loadSource}=require('./source_runtime.cjs');
const {sampleEnding,rigAt,castleCenter}=require('./ending.cjs');
const {patchRigSource}=require('./rig_patch.cjs');

const FPS=24, DURATION=60;
const DEFAULT_SOURCE=path.resolve(__dirname,'../source/howls_moving_castle_dynamic60.html');
const up=[0,1,0];
const toArray=v=>v.toArray();
const modes={exterior:'highlands',interior:'kitchen',greet:'highlands'};

function sampleBirdCamera(t,original,source) {
  const current={position:toArray(original.camera),target:toArray(original.target),bank:original.bank,fovY:original.fov};
  if(t<5.75 || t>20.80) return current;
  // Causal camera suspension. The rail for the bird is left exactly as filmed.
  // The translation and pan have different responses to its fast direction
  // changes. The kernel has finite support, so seeking never changes the frame.
  const strength=smooth(5.82,7.44,t)*(1-smooth(18.96,20.77,t));
  const door=1-.34*smooth(12.60,13.58,t)*(1-smooth(14.25,14.85,t));
  const delays=[0,.0625,.1458,.2500,.3750];
  const posWeights=[.16,.21,.30,.22,.11], dirWeights=[.14,.18,.25,.27,.16];
  let p=[0,0,0], heading=[0,0,0];
  for(let i=0;i<delays.length;i++) {
    const from=source.director.sample(t-delays[i]*door);
    const q=toArray(from.camera), f=unit(sub(toArray(from.target),q));
    p=add(p,scale(q,posWeights[i]));
    heading=add(heading,scale(f,dirWeights[i]));
  }
  const position=vMix(current.position,p,.95*strength);
  const oldHeading=unit(sub(current.target,current.position));
  let aim=unit(vMix(oldHeading,unit(heading),.95*strength));
  if(t>6.08 && t<10.96) {
    const right=unit(cross(aim,up)), vertical=unit(cross(right,aim));
    const mast=sub([-.34,43.40,original.castleZ+.70],position);
    const maxAngle=Math.atan(.90*Math.tan(radians(current.fovY*.5)));
    const excess=Math.max(0,Math.atan2(dot(mast,vertical),dot(mast,aim))-maxAngle);
    const adjustment=excess*smooth(6.1,7,t)*(1-smooth(10.40,10.95,t));
    aim=unit(add(scale(aim,Math.cos(adjustment)),scale(vertical,Math.sin(adjustment))));
  }
  const length=Math.hypot(...sub(current.target,current.position));
  return {...current,position,target:add(position,scale(aim,length))};
}

function createTimeline(htmlPath=DEFAULT_SOURCE) {
  const source=typeof htmlPath==='string'?loadSource(htmlPath):htmlPath;
  function birdAt(t) {
    if(t<40) return source.director.sample(t).bird?.toArray()||null;
    if(t>48.45) return null;
    // The crow climbs ahead of the departing castle and exits over the top.
    // Position and its derivative agree with the journey track at 40 seconds.
    const h=t-40, center=castleCenter(t), initial=source.director.sample(40);
    const b=initial.bird.toArray();
    const vy=2.2*.37*Math.cos(10*.37),vz=3*.23*Math.cos(10*.23);
    const climb=3.9*Math.max(0,h-2.3)*smooth(42.3,43.5,t);
    return [b[0]-1.95*h+.18*h*h,b[1]+vy*h+.88*h*h+climb,b[2]+vz*h+.20*h*h+center[2]];
  }
  function birdState(t,original) {
    const position=birdAt(t);
    if(!position)return null;
    const step=.035;
    const before=birdAt(Math.max(0,t-step))||position,after=birdAt(Math.min(59.999,t+step))||position;
    const glide=.94*smooth(9.8,10.8,t)*(1-smooth(15.2,16.2,t));
    return {position,tangent:unit(sub(after,before)),bank:original?original.birdBank:.1*Math.sin((t-30)*.4),
      scale:.4,glide,energy:1};
  }
  function sample(t) {
    t=clamp(t,0,DURATION);
    let result,original;
    if(t>=40) {
      result=sampleEnding(t,source);
    } else {
      original=source.director.sample(t);
      let camera=sampleBirdCamera(t,original,source);
      let companions=null;
      if(original.type==='greet') {
        const local=t-25,m=source.turnip(local,'greet',1);
        const x=25-m.distance*.33,z=35+m.distance*.945,y=source.heightAt(x,z);
        const delta=[x-25,y-source.heightAt(25,35),z-35];
        camera={...camera,position:add(camera.position,delta),target:add(camera.target,add(delta,[0,m.height*.08,0]))};
        companions={visible:true,action:'greet',local,energy:1,scale:1,position:[x,y,z],yaw:.16-.30*smooth(28.5,30,t),
          holdFire:true,look:.30*Math.sin(local*1.3),height:m.height,distance:m.distance,groundPoint:[x,y,z],
          hatPoint:[x,y+4.54+m.height,z],fire:{mode:'carried',localHeight:0,worldHeight:0,impact:0,carrierScale:.70}};
      }
      const cPos=[0,original.motion.height,original.world?0:original.castleZ];
      result={type:original.type,world:original.world||modes[original.type],castle:{position:cPos},
        motion:{...original.motion},rig:null,camera,companions,sky:null,environmentWeights:null};
    }
    if(result.companions) {
      const actor=result.companions,[x,,z]=result.camera.position;
      let yaw=Math.atan2(x-actor.position[0],z-actor.position[2])-actor.yaw;
      if(t>=40 && yaw<0) yaw+=Math.PI*2;
      actor.fire.yaw=yaw;
    }
    return {t,frame:1+Math.round(t*FPS),...result,bird:birdState(t,original)};
  }
  return {sample,source};
}

function bake(outPath,options={}) {
  const fps=options.fps||FPS, start=options.start??0, end=options.end??DURATION;
  const dir=createTimeline(options.source||DEFAULT_SOURCE), frames=[];
  for(let i=Math.round(start*fps);i<Math.round(end*fps);i++) {
    const value=dir.sample(i/fps);value.frame=i+1;frames.push(value);
  }
  const json={version:1,fps,duration:DURATION,frameStart:Math.round(start*fps)+1,frameEnd:Math.round(end*fps),
    axis:'Three XYZ, Y up, castle nose +Z; to Blender (x,-z,y)',fov:'vertical degrees',bank:'radians around camera local +Z',
    skyColors:'display sRGB triplets 0..1',sunPower:'Blender SUN energy',frames};
  const round=(_,v)=>typeof v==='number'?Math.round(v*1e6)/1e6:v;
  fs.writeFileSync(outPath,JSON.stringify(json,round));
  return json;
}

if(require.main===module) {
  const args=process.argv.slice(2);
  const read=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
  const dest=read('--out',path.join(__dirname,'frames.json'));
  const result=bake(dest,{source:read('--source',DEFAULT_SOURCE),fps:Number(read('--fps',24)),start:Number(read('--start',0)),end:Number(read('--end',60))});
  console.log(result.frames.length+' frames written to '+dest);
}

module.exports={FPS,DURATION,DEFAULT_SOURCE,createTimeline,bake,sampleEnding,rigAt,castleCenter,patchRigSource,project};
