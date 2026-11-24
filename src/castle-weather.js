import * as THREE from "../vendor/three.module.js";

function createCastleWeather(castle){
  const snow={value:0},seen=new Set(),glass=[];
  castle.group.traverse(o=>{
    if(!o.isMesh)return;
    const m=o.material;if(seen.has(m))return;seen.add(m);
    if(o.name==='Castle / glass')glass.push(m);
    if(!['Castle / roof','Castle / metal'].includes(o.name))return;
    const strength=o.name==='Castle / roof'?1:.58;
    m.onBeforeCompile=shader=>{
      shader.uniforms.journeySnow=snow;
      shader.vertexShader='varying float vSnowUp;varying vec3 vSnowPosition;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nvSnowUp=normalize(mat3(modelMatrix)*objectNormal).y;');
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvSnowPosition=transformed;');
      shader.fragmentShader='uniform float journeySnow;varying float vSnowUp;varying vec3 vSnowPosition;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float snowGrain=sin(vSnowPosition.x*3.7+sin(vSnowPosition.z*4.3))*sin(vSnowPosition.z*6.1);
        float snowCover=journeySnow*${strength.toFixed(2)}*smoothstep(.38,.74,vSnowUp+snowGrain*.07);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.88,.94,1.0),snowCover);
      `);
    };
    m.customProgramCacheKey=()=>`journey-snow-${strength}`;
  });
  const warm=new THREE.PointLight('#ffc075',0,43,2);warm.position.set(0,19,12);castle.anchors.body.add(warm);
  return {update(world,override){
    snow.value=world==='winter'?1:0;
    const n=override??(world==='night'?1:world==='city'?.22:0);
    for(const m of glass){m.emissive.set('#ffc16b');m.emissiveIntensity=n*.9;}
    warm.intensity=n*95;
  }};
}

export { createCastleWeather };
