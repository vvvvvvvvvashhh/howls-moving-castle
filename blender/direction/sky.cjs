'use strict';

const { clamp, mix, radians, smooth, track } = require('./curves.cjs');
const rgb = hex => [0,2,4].map(n => parseInt(hex.slice(n,n+2),16)/255);
const cMix = (a,b,u) => a.map((v,i) => mix(v,b[i],u));

// All palette entries are display sRGB. Convert to scene-linear once when
// assigning Blender shaders or light colors. The moon has its own fixture.
const duringFlight = [
  // time, horizon, middle atmosphere, upper sky, sunlight, moonlight, solar energy, lunar energy, world strength, windows, stars
  [40.00,'eed0ad','a9c3c9','648eb1','ffdcad','bad2ef',2.64,0,.72,.05,0],
  [43.35,'ecd2b5','a7bfcb','668eae','ffdbab','bad2ef',2.45,0,.74,.07,0],
  [46.10,'cadee5','87bad5','4a86b2','fff0cb','bbcfed',2.76,0,.82,.04,0],
  [47.45,'eed2ad','9ab3c6','597ca4','ffd4a0','bbcfed',2.36,0,.73,.09,0],
  [48.63,'efaa83','c297a6','596d9a','ffac75','bbcfed',1.52,0,.54,.22,0],
  [49.46,'b78b9a','756b91','3c4776','ff9c75','b5cbea',.40,.14,.46,.54,.06],
  [50.43,'65768e','405675','243554','ff996c','a9c4ed',0,.53,.40,.89,.74],
  [51.20,'485c78','2b4165','182c4c','ff9668','b5ccf0',0,.68,.36,1,.97],
  [52.18,'495e7d','2d4369','192f52','ff9668','b6d1f2',0,.65,.37,1,.96],
  [53.06,'9d8390','627593','35496d','ffac7c','bdcee9',.05,.57,.43,.80,.58],
  [54.09,'e5ae91','a7abb5','627ea0','ffb77d','c8d9ef',.49,.30,.57,.42,.17],
  [54.82,'ffdab0','bdc7c8','84a1b8','ffd392','d0e3f0',1.75,.11,.69,.15,.03],
  [55.65,'f4e1bc','bbd2d3','91b1c2','ffe1a5','d0e3f0',2.53,.01,.77,.04,0],
  [60.00,'e8e0bf','b5d1d4','86adbf','ffe5b0','d0e3f0',2.63,0,.78,.03,0],
];
const palettes = duringFlight.map(a=>({t:a[0],c:a.slice(1,6).map(rgb),levels:a.slice(6)}));
const sunAltitude = track([[40,18.1,0],[43.3,25],[45.4,31],[46.5,29],[47.5,19],[48.63,7.2],[49.48,-1.7],[50.9,-23],[51.65,-36],[52.2,-24],[53.06,-7.1],[54.09,.45],[54.82,5.1],[56.6,10.7],[60,13.5]]);
const sunAzimuth = track([[40,-45.85,0],[44,-58],[46.2,-80],[47.65,-116],[49.5,-171],[51.7,-230],[52.65,-322],[54.09,-377],[55.7,-378.0],[60,-373]]);
const sunDisc = track([[40,.22,0],[45,.2],[47.8,.25],[49.5,0],[53.74,0],[54.05,.25],[54.42,.94],[55.35,1],[60,1]]);

function endingSky(t) {
  let i=0;
  while (i<palettes.length-2 && t>palettes[i+1].t) i++;
  const a=palettes[i], b=palettes[i+1], u=smooth(a.t,b.t,t);
  const [horizon,midSky,zenith,sunColor,moonColor]=a.c.map((c,j)=>cMix(c,b.c[j],u));
  const [sunPower,moonPower,ambient,windowGlow,stars]=a.levels.map((v,j)=>mix(v,b.levels[j],u));
  const el=radians(sunAltitude(t)), az=radians(sunAzimuth(t));
  const moonAz=radians(mix(53,68,smooth(49,53.5,t))), moonEl=radians(37);
  return {
    solarElevation:sunAltitude(t),sunDirection:[Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)],
    moonDirection:[Math.sin(moonAz)*Math.cos(moonEl),Math.sin(moonEl),Math.cos(moonAz)*Math.cos(moonEl)],
    horizon,midSky,zenith,sunColor,moonColor,sunPower,moonPower,ambient,windowGlow,stars,dawnDisc:clamp(sunDisc(t)),
  };
}

function environmentWeights(t) {
  const toCity=smooth(41.94,43.12,t), toClouds=smooth(44.36,46.05,t);
  const toMeadow=smooth(51.9,55.7,t);
  return {desert:1-toCity,city:toCity*(1-toClouds),sky:toClouds*(1-toMeadow),highlands:toClouds*toMeadow};
}

module.exports={endingSky,environmentWeights};
