import * as THREE from "../vendor/three.module.js";
import { LAKE, heightAt, makeGround, makeMountains, makeLake } from "./landforms.js";
import { makePlants } from "./highland-plants.js";
import { makeLanes, makeTown } from "./highland-town.js";

function createEnvironment(){
  const group=new THREE.Group();
  group.name='The highlands, alpine lake and market town';
  const time={value:0};
  makeGround(group);
  makeMountains(group);
  makeLanes(group);
  const planted=makePlants(group,time);
  makeLake(group,time);
  const town=makeTown(group);
  const land=(x,above,z)=>[x,heightAt(x,z)+above,z];
  const anchors={
    lake:[LAKE.x,LAKE.y,LAKE.z], lakeShore:land(62,.1,-53),
    flowers:land(24,.55,65),
    meadowCamera:land(24,4.5,70), meadowTarget:[20,12,-15],
    meadowEndCamera:land(38,8,55), meadowEndTarget:[21,12,-18],
    lakeCamera:land(53,6.4,-34), lakeTarget:[123,-.8,-117],
    town:land(-104,7,0), townCamera:land(-79,25,53), townTarget:land(-105,13,5),
    townEndCamera:land(-112,29,-13),townEndTarget:land(-120,16,-45),
    church:town.church,
  };
  let draws=0,triangles=0;
  group.traverse(o=>{
    if(!o.isMesh)return;
    draws+=Array.isArray(o.material)?o.material.length:1;
    const geom=o.geometry,faces=(geom.index?.count||geom.attributes.position.count)/3;
    triangles+=faces*(o.isInstancedMesh?o.count:1);
  });
  return {group,heightAt,anchors,stats:{...planted,...town,draws,triangles},update(seconds){time.value=seconds;}};
}

export { createEnvironment };
