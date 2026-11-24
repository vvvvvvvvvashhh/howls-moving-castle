import * as THREE from "../vendor/three.module.js";
import { makeGroundscape } from "./journey-landscape.js";
import { makeVegetation } from "./journey-flora.js";
import { makeTownscape } from "./journey-town.js";
import { makeSkyDome, makeAtmosphericLayers } from "./journey-sky.js";

const configs={
  spring:{start:27,horizon:'#c8ddd8',midSky:'#86b6cc',zenith:'#588bb5',glow:'#ffe6cd',glowAmount:.17,sunVector:[-.58,.40,.78],fog:'#bbd0cb',fogNear:112,fogFar:565,upper:'#d3e6ee',bounce:'#8b9a71',ambient:1.27,key:'#ffe9ce',keyPower:2.14,keyPosition:[59,102,62],fill:'#c4deea',fillPower:.51,env:.56},
  summer:{start:31,horizon:'#b9dfdd',midSky:'#5c9fc1',zenith:'#4383b4',glow:'#fff0c7',glowAmount:.20,sunVector:[-.72,.57,.51],fog:'#b6cfca',fogNear:120,fogFar:620,upper:'#c8e6f3',bounce:'#84966b',ambient:1.22,key:'#ffedbd',keyPower:2.52,keyPosition:[47,105,81],fill:'#b4d8e5',fillPower:.48,env:.52},
  autumn:{start:35,horizon:'#e8c8a6',midSky:'#b0bcb7',zenith:'#778eb0',glow:'#ffd18c',glowAmount:.29,sunVector:[-.84,.36,.41],fog:'#d3c2a5',fogNear:119,fogFar:515,upper:'#dedfda',bounce:'#9c825c',ambient:1.12,key:'#ffd5a4',keyPower:2.55,keyPosition:[52,62,98],fill:'#bfd0d3',fillPower:.43,env:.54},
  winter:{start:39,horizon:'#cad9e3',midSky:'#a4baca',zenith:'#778da7',glow:'#eaf2f6',glowAmount:.12,sunVector:[-.74,.50,-.44],fog:'#bdcdd9',fogNear:113,fogFar:594,upper:'#d7e6fa',bounce:'#a5bcc8',ambient:1.30,key:'#e9e9df',keyPower:1.76,keyPosition:[42,84,-81],fill:'#b4cedf',fillPower:.55,env:.50},
  desert:{start:43,horizon:'#eed0ad',midSky:'#a9c3c9',zenith:'#648eb1',glow:'#ffe1ad',glowAmount:.41,sunVector:[-.68,.31,.66],fog:'#dfbaa0',fogNear:112,fogFar:557,upper:'#e7dfcf',bounce:'#c8a47e',ambient:1.14,key:'#ffdcad',keyPower:2.64,keyPosition:[47,55,101],fill:'#bed0da',fillPower:.30,env:.49},
  sky:{start:46,horizon:'#b3dbe9',midSky:'#68a9cd',zenith:'#437eae',glow:'#ffffed',glowAmount:.22,sunVector:[-.78,.47,.45],fog:'#c1dce3',fogNear:119,fogFar:642,upper:'#d9edfb',bounce:'#b3c5cc',ambient:1.36,key:'#fff1d2',keyPower:2.09,keyPosition:[58,99,66],fill:'#bddfee',fillPower:.50,env:.65},
  city:{start:49,horizon:'#ecc6ac',midSky:'#d3a9af',zenith:'#888fa9',glow:'#ffd492',glowAmount:.55,sunVector:[-.84,.19,.48],fog:'#d6b8aa',fogNear:124,fogFar:563,upper:'#e0d4d7',bounce:'#ad9478',ambient:1.13,key:'#ffd0a1',keyPower:2.14,keyPosition:[27,51,98],fill:'#b5bfd1',fillPower:.53,env:.48},
  night:{start:52,horizon:'#526681',midSky:'#2a405f',zenith:'#14223d',glow:'#b7cde2',glowAmount:.16,sunVector:[-.9,.23,-.35],fog:'#52677c',fogNear:123,fogFar:546,upper:'#acc3de',bounce:'#637680',ambient:.72,key:'#c6d9f2',keyPower:1.16,keyPosition:[-64,96,-95],fill:'#c3d9ef',fillPower:1.02,env:.37}
};

/** All temporal quantities are sampled from absolute film time, including after a seek. */
function createJourneyWorlds(environmentTexture){
  const scene=new THREE.Scene();scene.name='The castle crossing eight changing landscapes';
  scene.environment=environmentTexture||null;scene.fog=new THREE.Fog('#c6d5d3',110,590);
  const hemi=new THREE.HemisphereLight(0xffffff,0xffffff,1.3),key=new THREE.DirectionalLight(0xffffff,2.2),fill=new THREE.DirectionalLight(0xffffff,.4);
  key.castShadow=true;key.shadow.mapSize.set(1024,1024);
  Object.assign(key.shadow.camera,{left:-50,right:50,top:56,bottom:-44,near:9,far:265});
  key.shadow.normalBias=.080;key.shadow.bias=-.00016;key.shadow.radius=3;key.target.position.set(0,13,0);
  fill.position.set(82,37,-48);fill.target.position.set(0,19,0);scene.add(hemi,key,key.target,fill,fill.target);
  const applySky=makeSkyDome(scene),time={value:0},states=new Map(),stats={worlds:{},active:null,terrainSpeed:.45};
  let active=null;
  function makeState(name){
    const root=new THREE.Group();root.name='Walking landscape · '+name;root.visible=false;scene.add(root);
    const groundUpdate=makeGroundscape(root,name,time),plantUpdate=makeVegetation(root,name,time);
    makeTownscape(root,name);const airUpdate=makeAtmosphericLayers(root,name,time);
    let draws=0,triangles=0,instances=0;
    root.traverse(node=>{if(node.isMesh||node.isPoints){draws++;const count=node.geometry.index?.count??node.geometry.attributes.position.count;
      triangles+=node.isPoints?0:Math.floor(count/3)*(node.isInstancedMesh?node.count:1);if(node.isInstancedMesh)instances+=node.count;}});
    const state={root,groundUpdate,plantUpdate,airUpdate,config:configs[name]};states.set(name,state);
    stats.worlds[name]={draws,triangles,instances,houses:root.userData.houses||0};return state;
  }
  function update(t,travelDistance){
    if(!active)return;
    const s=states.get(active),elapsed=t-s.config.start;time.value=t;
    const travel=elapsed<0?Math.tanh(elapsed/12)*12:elapsed<=5?elapsed:5+Math.tanh((elapsed-5)/17)*17;
    s.root.position.z=-(travelDistance??travel*stats.terrainSpeed);s.groundUpdate(t);s.plantUpdate(t);s.airUpdate(t,travel);
  }
  function setWorld(name,t=0,travelDistance){
    if(!Object.prototype.hasOwnProperty.call(configs,name))throw new Error('Unknown journey world '+name);
    if(active!==name){
      if(active)states.get(active).root.visible=false;
      const s=states.get(name)||makeState(name),cfg=s.config;
      active=name;stats.active=name;s.root.visible=true;
      applySky(cfg);scene.background=new THREE.Color(cfg.horizon);scene.fog.color.set(cfg.fog);scene.fog.near=cfg.fogNear;scene.fog.far=cfg.fogFar;
      scene.environmentIntensity=cfg.env;hemi.color.set(cfg.upper);hemi.groundColor.set(cfg.bounce);hemi.intensity=cfg.ambient;
      key.color.set(cfg.key);key.intensity=cfg.keyPower;key.position.set(...cfg.keyPosition);
      fill.color.set(cfg.fill);fill.intensity=cfg.fillPower;key.shadow.intensity=name==='sky'?.18:name==='winter'?.56:name==='desert'?.74:.76;key.shadow.needsUpdate=true;
    }
    update(t,travelDistance);return scene;
  }
  return {scene,setWorld,update,stats,configs,stateForFilm(name){return states.get(name)||makeState(name);},setSharedTime(t){time.value=t;}};
}

export { createJourneyWorlds };
