import * as THREE from "../vendor/three.module.js";
import { FXAAShader } from "../vendor/FXAAShader.js";

function createFinish(renderer){
  const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true,stencilBuffer:false});
  target.texture.name='Windborne linear scene';
  const uniforms=THREE.UniformsUtils.clone(FXAAShader.uniforms);uniforms.tDiffuse.value=target.texture;
  const shader=FXAAShader.fragmentShader.replace(/}\s*$/,`\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`);
  const material=new THREE.ShaderMaterial({uniforms,vertexShader:FXAAShader.vertexShader,fragmentShader:shader,depthTest:false,depthWrite:false});
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);quad.frustumCulled=false;scene.add(quad);
  return {resize(){const w=renderer.domElement.width,h=renderer.domElement.height;target.setSize(w,h);uniforms.resolution.value.set(1/w,1/h);},render(world,view){renderer.setRenderTarget(target);renderer.render(world,view);renderer.setRenderTarget(null);renderer.render(scene,camera);}};
}

export { createFinish };
