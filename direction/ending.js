import { clamp, mix, radians, add, sub, scale, vMix, unit, smooth, track, speedRail } from "./curves.js";
import { endingSky, environmentWeights } from "./sky.js";

const forward=speedRail([[40,2.25],[41.25,2.25],[42.33,.48],[42.75,0],[43.82,0],
  [44.54,2.7],[45.53,7.0],[47.54,8.65],[50.14,10.3],[52.5,8.0],[54.9,5.15],[56.4,3.75],[60,3.0]]);
const lateral=track([[40,0,0],[44.45,0],[45.55,-.9],[46.4,-1.5],[47.55,2.8],[48.3,3.9],
  [49.55,-2.9],[50.20,-3.8],[51.78,2.7],[52.6,3.15],[54.0,-.6],[55.5,-1.3],[57.3,.75],[60,.3]]);
const altitude=track([[40,0,0],[44.4,0],[44.55,.40],[45.03,5.7],[45.53,14.1],[46.2,22.0],
  [47.55,30.2],[48.6,32.3],[49.6,31.1],[50.6,29.4],[51.7,33.2],[52.5,33.6],[53.7,30.5],
  [54.82,23.7],[56.05,14.5],[57.4,9.6],[58.4,8.1],[60,8.5]]);
const roll=track([[40,0,0],[42.40,0],[43.4,-2.45],[44.03,-.5],[44.55,3.5],[45.43,-4.55],
  [46.0,2.5],[46.45,.2],[47.35,9.7],[48.22,2.25],[49.45,-10.25],[50.47,-2.1],[51.8,8.0],
  [52.6,1.55],[53.74,-4.0],[54.9,-1.0],[56.35,3.35],[57.70,-2.4],[58.90,1.4],[60,.30]]);
// Positive Three rotation about X lowers a +Z bow. The takeoff thrust lifts it.
const pitch=track([[40,0,0],[42.33,0],[43.43,4.1],[43.66,3.9],[44.20,-6.2],[44.85,-9.0],
  [45.44,-1.15],[46.02,-4.6],[46.90,-2.5],[48.18,-4.5],[49.56,-1.2],[51.1,-3.7],
  [52.8,-2.4],[54.95,3.8],[56.12,3.3],[57.5,-1.5],[59.0,-.15],[60,-.8]]);
const yaw=track([[40,0,0],[43.4,1.3],[44.45,-1.0],[46.2,-3.0],[47.8,4.2],[49.65,-4.8],
  [51.9,4.0],[53.7,-2.0],[55.1,-1.0],[57.2,2.2],[60,0]]);
const shock=track([[40,0,0],[42.32,0],[42.80,-1.08],[43.42,-3.28],[43.60,-3.28],
  [43.91,-1.1],[44.19,1.50],[44.40,2.80],[44.59,2.95],[45.13,.2],[45.48,-.92],
  [45.82,.19],[46.04,.29],[46.42,0],[60,0]]);
const rotor=speedRail([[40,1.55],[42.76,1.55],[43.4,3.4],[44.04,6.15],[44.68,10.5],
  [46.01,13.15],[49.5,14.0],[53.1,12.7],[55.5,11.35],[60,10.25]]);

const startingAz=42+78*(10/21.5);
const startingRadius=89+2.8*Math.sin(10/21.5*Math.PI);
const orbitAz=track([[40,startingAz,78/21.5],[41.75,84.25],[43.50,89.1],[44.54,95.0],
  [45.75,105.5],[47.55,121.5],[49.0,135.6],[50.75,151.0],[52.18,162.2],[54.09,173.2],
  [55.65,177.5],[57.6,179.2],[60,180.0,.12]]);
const camRadius=track([[40,startingRadius,2.8*Math.PI/21.5*Math.cos(10/21.5*Math.PI)],
  [41.0,89.2],[42.35,80],[43.49,74.8],[44.4,75.7],[45.65,83],[47.4,88.5],[49.4,92],
  [51.8,93],[53.65,94],[55.3,98],[56.85,105],[58.50,109],[60,110.6,.6]]);
const camY=track([[40,25+3.5*Math.sin(10/21.5*Math.PI),3.5*Math.PI/21.5*Math.cos(10/21.5*Math.PI)],
  [41.2,27.4],[42.75,22.4],[43.60,20.75],[44.37,20.0],[44.88,22.1],[45.55,30.2],[46.45,45.0],
  [47.55,53.7],[49.2,58.3],[50.8,61.2],[52.56,65.1],[53.85,65.05],[55.5,64.3],
  [56.9,62.0],[58.6,56.8],[60,52.6,-1.05]]);
const vfov=track([[40,44+1.4*Math.sin(10/21.5*Math.PI),1.4*Math.PI/21.5*Math.cos(10/21.5*Math.PI)],
  [42.0,43.2],[43.4,41.6],[44.3,43.2],[45.55,47],[47.25,46.1],[49.65,45.0],
  [52.18,43.7],[54.08,45],[55.8,49],[57.8,49.6],[60,48.3]]);
const lookHeight=track([[40,22,0],[41.55,21.9],[43.43,18.60],[44.30,21.7],[44.82,24.9],
  [45.53,32.25],[46.5,44.7],[47.7,51.2],[49.8,52.45],[51.8,56.9],[53.3,56],[54.8,46.6],[56.1,34.5],[60,27.8]]);
// Each shoe takes one load/release. Order follows angle to the camera, then
// alternates the diagonals. The array order is the actual GAIT.legs order.
const footTimes=[44.15,44.03,44.28,44.40];
const offPhase=[-.4,.65,1.4,2.1];
// Park each shoe exactly where the last stride leaves it. The aft starboard
// foot is already finishing its swing and receives its upcoming contact.
const frozenDistance=36+forward(43.36).distance;
const feetBefore=[.51,0,.24,.76].map(strike=>{
  const turn=frozenDistance/10.8-strike, phase=turn-Math.floor(turn);
  return 10.8*(.765*.5-phase+(phase>.765?1:0));
});
const press=smooth;

function castleCenter(t) {return [lateral(t),altitude(t),forward(t).distance];}
function rigAt(t) {
  const flight=smooth(43.79,45.62,t);
  const wing=[smooth(43.36,44.70,t),smooth(43.02,44.33,t)];
  const atmosphere=smooth(44.45,46.05,t);
  const spring=(delay,hz,decay)=>{
    const age=t-delay;
    return age>0?Math.exp(-decay*age)*Math.sin(2*Math.PI*hz*age):0;
  };
  const skew=radians(roll(t));
  const wingFlex=[-1,1].map((s,i)=>radians(
    (s===1?9.4:8.0)*spring(i?44.13:44.48,1.12,1.32)
    + atmosphere*((roll(t-(i?.22:.345))-roll(t))*.65 + 1.75*Math.sin(2.6*t+i*1.2))
  ));
  const feet=footTimes.map((release,i)=>{
    const tuck=smooth(release,release+1.05+.085*i,t);
    const pend=spring(release+.53,.92-i*.035,1.20);
    return {
      release,tuck,planted:t<release,brace:press(42.30,43.10,t),
      stanceTravel:feetBefore[i] + forward(43.36).distance-forward(t).distance,
      swingZ:pend*2.05 + tuck*.45*Math.sin(1.80*t+offPhase[i]),
      swingX:tuck*(.30*Math.sin(1.32*t+i*.8)+(lateral(t-.25)-lateral(t))*.23),
      swingY:tuck*.27*Math.sin(2.05*t+offPhase[i]),
    };
  });
  return {flight,airborne:atmosphere,compressY:shock(t),roll:skew,pitch:radians(pitch(t)),
    yaw:radians(yaw(t)),wing,wingFlex,feet,propellerPhase:rotor(t).distance+40*1.55,
    bank:skew,enginePressure:smooth(42.17,43.56,t)*(1-.68*smooth(44.1,45.22,t))};
}

function hopOnce(t, start, duration, height) {
  if (t<start||t>start+duration) return 0;
  const u=(t-start)/duration;
  return height*4*u*(1-u);
}

function endingActors(t, source) {
  const timeScale=1.12, local=(t-48.5)*timeScale+.23, scaleBody=1.60;
  const gait=source.turnip(local,'travel',1), reference=source.turnip((55.0-48.5)*timeScale+.23,'travel',1);
  const travel=(gait.distance-reference.distance)*scaleBody;
  const x=11.1+travel*.105;
  const z=forward(55.0).distance-33.0+travel*.99447;
  const gy=source.heightAt(x,z);
  const doublet=[[54.93,.46,.70],[55.52,.59,1.18],[56.69,.49,.85],[57.45,.66,1.28],[58.49,.54,.98],[59.39,.54,.81]];
  let leap=0, compressed=0;
  for(const [a,d,h] of doublet) {
    leap+=hopOnce(t,a,d,h);
    compressed+=smooth(a+d-.025,a+d+.055,t)*(1-smooth(a+d+.055,a+d+.18,t));
  }
  const heading=.105, face=heading + .26 * (1-smooth(53.7,56.35,t));
  return {visible:t>=50.8,action:'travel',local,energy:1,scale:scaleBody,position:[x,gy,z],
    yaw:face,holdFire:true,look:.28*Math.sin(local*.83),height:gait.height*scaleBody,distance:travel,
    groundPoint:[x,gy,z],hatPoint:[x,gy+(4.54+gait.height)*scaleBody,z],
    fire:{mode:'carried',localHeight:leap/scaleBody,worldHeight:leap,impact:compressed,carrierScale:.70}};
}

function endingCamera(t,companions) {
  const angle=radians(orbitAz(t)), radius=camRadius(t);
  const lag=smooth(42.1,45.0,t);
  const x=radius*Math.sin(angle)+lateral(t-.33*lag)*.85;
  const cz=forward(t).distance;
  const drag=(forward(t-.22*lag).distance-cz)*.78;
  const pos=[x,camY(t),cz+drag+radius*Math.cos(angle)];
  const bank=radians(.16*Math.sin((t-44)*.52)*smooth(43.6,46.2,t)
    +.060*roll(t-.37)*smooth(44.2,46.0,t)*(1-smooth(53.5,56.3,t)));
  const originalLook=[lateral(t-.17)*.72,lookHeight(t),cz+Math.sin((t-40)*.29)*1.8*lag];
  const center=castleCenter(t);
  const mast=add(center,[-.34,43.4,.70]);
  const foot=add(companions.groundPoint,[0,1.1,0]);
  // Compose the final tableau in viewing directions. Interpolating world-space
  // target points would give too little influence to the nearer jumping figure.
  const closeWeight=mix(.41,.515,smooth(54.0,57.45,t));
  const down=unit(vMix(unit(sub(mast,pos)),unit(sub(foot,pos)),closeWeight));
  const reveal=smooth(53.72,57.30,t);
  const aim=unit(vMix(unit(sub(originalLook,pos)),down,reveal));
  const target=reveal===0?originalLook:add(pos,scale(aim,Math.hypot(...sub(originalLook,pos))));
  return {position:pos,target,bank,fovY:vfov(t),orbitDegrees:orbitAz(t),groundReveal:reveal};
}

function sampleEnding(t,source) {
  const center=castleCenter(t), speed=forward(t), companions=endingActors(t,source),rig=rigAt(t);
  const camera=endingCamera(t,companions), sky=endingSky(t);
  const motion={distance:36+speed.distance,speed:speed.speed,height:center[1],flight:rig.flight,bank:0,landing:0};
  return {type:'flight',world:'continuum',castle:{position:center},motion,rig,companions,camera,sky,
    environmentWeights:environmentWeights(t)};
}

export { sampleEnding, rigAt, castleCenter, endingActors };
