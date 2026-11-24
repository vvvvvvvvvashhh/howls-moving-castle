import * as THREE from "../vendor/three.module.js";
const up=new THREE.Vector3(0,1,0),handoff=5.75;
const smooth=(a,b,t)=>THREE.MathUtils.smootherstep(t,a,b);
const drift=t=>(t-15)*.45;
function rail(keys){
 const k=keys.map(a=>({t:a[0],p:new THREE.Vector3(...a.slice(1,4)),v:a[4]}));
 k.forEach((a,i)=>{if(!a.v){const p=k[Math.max(0,i-1)],n=k[Math.min(k.length-1,i+1)];a.v=n.p.clone().sub(p.p).divideScalar(n.t-p.t);}});
 return t=>{let i=1;while(i<k.length-1&&t>k[i].t)i++;const a=k[i-1],b=k[i],dt=b.t-a.t,u=THREE.MathUtils.clamp((t-a.t)/dt,0,1),u2=u*u,u3=u2*u;
  return a.p.clone().multiplyScalar(2*u3-3*u2+1).addScaledVector(a.v,dt*(u3-2*u2+u)).addScaledVector(b.p,-2*u3+3*u2).addScaledVector(b.v,dt*(u3-u2));};
}
function createCameraA(land){
 const curve=p=>new THREE.CatmullRomCurve3(p.map(a=>new THREE.Vector3(...a)),false,'centripetal');
 const path=curve([[48,land.heightAt(48,99)+2.8,99],[42,land.heightAt(42,84)+5.1,84],[34,12.8,70],[25,16,62]]);
 const look=curve([[8,17,-12],[6,18,-9],[3,20,-5],[0,21,0]]);
 function opening(t){const p=t/7,q=.75*p+.25*p*p*(3-2*p),camera=path.getPoint(q),target=look.getPoint(q);target.z+=drift(t);
  const bank=.007*Math.sin(p*Math.PI*2),r=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(camera,target,up));r.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),bank));
  const bird=camera.clone().addScaledVector(new THREE.Vector3(0,0,-1).applyQuaternion(r),7.2).addScaledVector(new THREE.Vector3(1,0,0).applyQuaternion(r),-2.08+.26*Math.sin(t*.65)).addScaledVector(up,.88+.104*Math.sin(t*.72));
  return {camera,target,bird,bank,fov:47-p,birdBank:.12*Math.sin(t*.6)-2*bank+.23*(1-p)};}
 const e=opening(handoff),b=opening(handoff-.001),bv=e.bird.clone().sub(b.bird).multiplyScalar(1000),cv=e.camera.clone().sub(b.camera).multiplyScalar(1000),tv=e.target.clone().sub(b.target).multiplyScalar(1000);
 const local=(t,x,y,z)=>[t,x,y,z+drift(t)];
 const fly=rail([[handoff,...e.bird.toArray(),bv],local(7.5,31,34,37),local(9.5,36,56,7),local(11,34,50,-13),local(12.8,20,33,-19),local(14,4,23,-17),local(15.3,-20,22,-19),[17.5,-55,23,-16],[19.5,-94,27,-27],[21,-121,37,-39],[22,-143,46,-53]]);
 const birdAt=t=>t<=handoff?opening(Math.max(0,t)).bird:fly(Math.min(22,t));
 function sample(t,castleZ=drift(t)){
  if(t<=handoff)return opening(t);
  const bird=birdAt(t),bt=Math.max(handoff,t-.25),lag=birdAt(bt),heading=birdAt(Math.min(22,bt+.04)).sub(birdAt(Math.max(handoff,bt-.04))).normalize();
  const near=smooth(11,13.2,t)*(1-smooth(15.2,16.7,t)),height=THREE.MathUtils.lerp(12,7,near),back=THREE.MathUtils.lerp(6,4,near);
  const camera=lag.addScaledVector(heading,-back).addScaledVector(up,height);camera.z-=near*2.8;
  const tangent=birdAt(Math.min(22,t+.04)).sub(birdAt(Math.max(0,t-.04))).normalize();
  let target=bird.clone().addScaledVector(tangent,4.5).addScaledVector(up,1.3);
  target.lerp(new THREE.Vector3(1.53,21.25,castleZ-12.48),.45*smooth(12.5,13.6,t)*(1-smooth(14.1,15,t)));
  const blend=smooth(handoff,8.8,t);camera.lerp(e.camera.clone().addScaledVector(cv,t-handoff),1-blend);target.lerp(e.target.clone().addScaledVector(tv,t-handoff),1-blend);
  const zOffset=(castleZ-drift(t))*smooth(handoff,10,t)*(1-smooth(15.3,19,t));bird.z+=zOffset;camera.z+=zOffset;target.z+=zOffset;
  const d0=birdAt(Math.max(handoff,t-.12)).sub(birdAt(Math.max(handoff,t-.24))).normalize(),d1=birdAt(Math.min(22,t+.24)).sub(birdAt(Math.min(22,t+.12))).normalize();
  const turn=THREE.MathUtils.clamp(d0.clone().cross(d1).y*1.6,-.35,.35);
  return {camera,target,bird,fov:46.18+7*smooth(handoff,11,t)-3*smooth(20,22,t),bank:turn*.12,birdBank:turn};
 }
 return {sample};
}

export { createCameraA };
