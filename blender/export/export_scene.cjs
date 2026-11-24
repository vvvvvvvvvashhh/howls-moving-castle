'use strict';
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const {loadScene}=require('../direction/headless-scene.cjs');
const {patchSecondary}=require('../motion/secondary_source.cjs');
const timeline=JSON.parse(fs.readFileSync(path.join(ROOT,'direction/frames.json'),'utf8'));
const html=patchSecondary(fs.readFileSync(path.join(ROOT,'render/castle_refined_source.html'),'utf8'));
const runtime=loadScene(html),h=runtime.howl,T=runtime.THREE;
const out=__dirname;fs.mkdirSync(path.join(out,'textures'),{recursive:true});
const mark=Date.now();
const roots={main:h.scene,kitchen:h.kitchen.scene,journey:h.journey.scene,land:h.land.group};
const actorRoots=new Set([h.castle.group,h.crow.group,h.turnip.group]);
for(const t of [0,23.9,27.6,31,33.6,36.1,38.7,41.1,43.7,47.2,50.5,57.5])h.renderAt(t);
runtime.applyFrame(timeline.frames[0]);
function matrices(){for(const r of [h.scene,h.kitchen.scene,h.journey.scene])r.updateMatrixWorld(true);}
matrices();
const objects=[],seen=new Set();
for(const root of [h.scene,h.kitchen.scene,h.journey.scene])root.traverse(o=>{if(!seen.has(o)){seen.add(o);objects.push(o);}});
const ids=new Map(objects.map((o,i)=>[o,'n'+i]));
const geometryBin={chunks:[],length:0},animationBin={chunks:[],length:0};
function add(bin,array,itemSize,type='float32',file='geometry.bin'){
 const a=type==='uint32'?new Uint32Array(array):new Float32Array(array);
 const b=Buffer.from(a.buffer,a.byteOffset,a.byteLength);const ref={file,offset:bin.length,length:a.length,itemSize,type};
 bin.chunks.push(b);bin.length+=b.length;return ref;
}
const geometries={},materials={},textures={};
const geoMap=new Map(),matMap=new Map(),texMap=new Map(),geoObjects=new Map();
const v=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3(),m=new T.Matrix4();
function positionOf(o){const g=o.geometry,p=g.attributes.position,arr=new Float32Array(p.count*3);for(let i=0;i<p.count;i++){if(o.getVertexPosition)o.getVertexPosition(i,v);else v.fromBufferAttribute(p,i);v.toArray(arr,i*3);}return arr;}
function isSpecial(o){return Boolean(o.isSkinnedMesh||o.morphTargetInfluences?.length);}
function exportGeometry(o){
 const g=o.geometry,key=g.uuid+(isSpecial(o)?':'+ids.get(o):'');if(geoMap.has(key))return geoMap.get(key);
 const id='g'+geoMap.size;geoMap.set(key,id);geoObjects.set(id,o);
 const attributes={};
 for(const [name,a] of Object.entries(g.attributes)){
  if(name==='position'&&isSpecial(o))attributes[name]=add(geometryBin,positionOf(o),3);
  else {const values=[];for(let i=0;i<a.count;i++)for(let k=0;k<a.itemSize;k++)values.push(a.isInterleavedBufferAttribute?a.data.array[i*a.data.stride+a.offset+k]:a.array[i*a.itemSize+k]);attributes[name]=add(geometryBin,values,a.itemSize,name==='skinIndex'?'uint32':'float32');}
  if(a.isInstancedBufferAttribute)attributes[name].instanced=true;
 }
 const index=g.index?add(geometryBin,g.index.array,1,'uint32'):null;
 geometries[id]={name:g.name,attributes,index,groups:g.groups.map(x=>({...x})),drawRange:{start:g.drawRange.start,count:Number.isFinite(g.drawRange.count)?g.drawRange.count:null},special:isSpecial(o)};
 return id;
}
function textureOf(tex){
 if(!tex)return null;if(texMap.has(tex))return texMap.get(tex);
 const im=tex.image||tex.source?.data;if(!im?.toBuffer&&!im?.toDataURL)return null;
 const id='tex'+texMap.size;texMap.set(tex,id);
 const filename='textures/'+id+'.png';let data;
 if(im.toBuffer)data=im.toBuffer('image/png');else data=Buffer.from(im.toDataURL('image/png').split(',')[1],'base64');
 fs.writeFileSync(path.join(out,filename),data);
 textures[id]={name:tex.name,file:filename,colorSpace:tex.colorSpace,wrapS:tex.wrapS,wrapT:tex.wrapT,repeat:tex.repeat.toArray(),offset:tex.offset.toArray(),rotation:tex.rotation,flipY:tex.flipY};return id;
}
function exportMaterial(a){
 if(matMap.has(a))return matMap.get(a);const id='m'+matMap.size;matMap.set(a,id);
 const d={name:a.name,type:a.type,color:a.color?.toArray()||[.5,.5,.5],emissive:a.emissive?.toArray()||[0,0,0],emissiveIntensity:a.emissiveIntensity??1,roughness:a.roughness??.7,metalness:a.metalness??0,opacity:a.opacity,transparent:a.transparent,alphaTest:a.alphaTest,side:a.side,vertexColors:a.vertexColors,depthWrite:a.depthWrite,size:a.size,bumpScale:a.bumpScale,normalScale:a.normalScale?.toArray()};
 for(const k of ['map','alphaMap','bumpMap','normalMap','roughnessMap','metalnessMap','emissiveMap'])d[k]=textureOf(a[k]);
 d.uniforms={};if(a.uniforms)for(const [name,u]of Object.entries(a.uniforms)){const z=u.value;if(z?.isTexture){const tx=textureOf(z);if(tx)d.uniforms[name]={texture:tx};}else if(z?.isColor)d.uniforms[name]={color:z.toArray()};else if(typeof z==='number')d.uniforms[name]=z;}
 materials[id]=d;return id;
}
const nodes=objects.map(o=>{
 const independent=actorRoots.has(o),local=independent?o.matrixWorld:o.matrix;
 const node={id:ids.get(o),name:o.name,type:o.type,parent:independent?null:(ids.get(o.parent)||null),matrix:local.toArray(),visible:o.visible,castShadow:o.castShadow,receiveShadow:o.receiveShadow};
 if(o.geometry){node.geometry=exportGeometry(o);node.material=(Array.isArray(o.material)?o.material:[o.material]).filter(Boolean).map(exportMaterial);}
 if(o.isInstancedMesh){node.count=o.count;node.instanceMatrix=add(geometryBin,o.instanceMatrix.array.slice(0,o.count*16),16);if(o.instanceColor)node.instanceColor=add(geometryBin,o.instanceColor.array.slice(0,o.count*3),3);}
 if(o.isLight){node.light={type:o.type,color:o.color.toArray(),intensity:o.intensity,distance:o.distance,decay:o.decay};}
 return node;
});
const scene={version:1,fps:24,duration:60,upAxis:'Y',roots:Object.fromEntries(Object.entries(roots).map(([k,o])=>[k,ids.get(o)])),actors:{castle:ids.get(h.castle.group),crow:ids.get(h.crow.group),turnip:ids.get(h.turnip.group),travelingFire:ids.get(h.travelingFire.group)},nodes,geometries,materials,textures};
fs.writeFileSync(path.join(out,'geometry.bin'),Buffer.concat(geometryBin.chunks));geometryBin.chunks.length=0;
fs.writeFileSync(path.join(out,'scene.json'),JSON.stringify(scene));
console.log('SCENE_READY',JSON.stringify({nodes:nodes.length,geometries:geoMap.size,materials:matMap.size,textures:texMap.size,geometryBytes:geometryBin.length,seconds:(Date.now()-mark)/1000}));
if(process.argv.includes('--scene-only'))process.exit(0);
const versions=new Map([...geoObjects].map(([id,o])=>[id,o.geometry.attributes.position.version]));
const deform=new Set([...geoObjects].filter(([id,o])=>isSpecial(o)).map(([id])=>id));
for(const t of [0,7.5,23.9,27.6,39.0,43.5,47.0,57.5]){
 runtime.applyFrame(timeline.frames[Math.min(1439,Math.round(t*24))]);matrices();
 for(const[id,o]of geoObjects){const n=o.geometry.attributes.position.version;if(n!==versions.get(id))deform.add(id);versions.set(id,n);}
}
const nframes=timeline.frames.length;
const transform=objects.map(()=>new Float32Array(nframes*10)),visible=objects.map(()=>new Uint32Array(nframes));
const deformArrays=new Map([...deform].map(id=>[id,new Float32Array(nframes*geometries[id].attributes.position.length)]));
const checkpoints=[];
for(let f=0;f<nframes;f++){
 runtime.applyFrame(timeline.frames[f]);matrices();
 for(let i=0;i<objects.length;i++){
  const o=objects[i];(actorRoots.has(o)?o.matrixWorld:o.matrix).decompose(v,q,s);
  const a=transform[i],k=f*10;v.toArray(a,k);q.toArray(a,k+3);s.toArray(a,k+7);visible[i][f]=o.visible?1:0;
 }
 for(const[id,arr]of deformArrays){const p=positionOf(geoObjects.get(id));arr.set(p,f*p.length);}
 if(f%120===0)console.log('BAKE',f,'/',nframes,Math.round((Date.now()-mark)/1000)+'s');
}
const tracks={};
for(let i=0;i<objects.length;i++){
 const a=transform[i],z=visible[i];let move=false,vis=false;
 for(let f=1;f<nframes&&!move;f++)for(let k=0;k<10;k++)if(Math.abs(a[f*10+k]-a[k])>1e-7){move=true;break;}
 for(let f=1;f<nframes&&!vis;f++)if(z[f]!==z[0])vis=true;
 if(move||vis){tracks[ids.get(objects[i])]={};if(move)tracks[ids.get(objects[i])].transform=add(animationBin,a,10,'float32','animation.bin');if(vis)tracks[ids.get(objects[i])].visible=add(animationBin,z,1,'uint32','animation.bin');}
}
const geometryTracks={};
for(const[id,array]of deformArrays)geometryTracks[id]={position:add(animationBin,array,3,'float32','animation.bin')};
fs.writeFileSync(path.join(out,'animation.bin'),Buffer.concat(animationBin.chunks));
fs.writeFileSync(path.join(out,'animation.json'),JSON.stringify({version:1,fps:24,frames:nframes,tracks,geometryTracks}));
console.log('ANIMATION_READY',JSON.stringify({tracks:Object.keys(tracks).length,deform:deform.size,animationBytes:animationBin.length,seconds:(Date.now()-mark)/1000}));
