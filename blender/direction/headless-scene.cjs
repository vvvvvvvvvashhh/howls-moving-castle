'use strict';

const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {performance}=require('node:perf_hooks');
const {createCanvas,Image,ImageData,Path2D,DOMMatrix}=require('@napi-rs/canvas');
const {patchRigSource}=require('./rig_patch.cjs');
const {DEFAULT_SOURCE}=require('./timeline.cjs');

function makeCanvas() {
  const canvas=createCanvas(1,1);
  const input=interfaceElement();
  canvas.style={};
  canvas.addEventListener=input.addEventListener;
  canvas.removeEventListener=input.removeEventListener;
  canvas.dispatchEvent=input.dispatchEvent;
  canvas.setPointerCapture=input.setPointerCapture;
  return canvas;
}

function interfaceElement() {
  const classes=new Set(), attrs=new Map(), children=[],listeners=new Map();
  const item={children,style:{},dataset:{},classList:{
    add(...names){names.forEach(n=>classes.add(n));}, remove(...names){names.forEach(n=>classes.delete(n));},
    toggle(name,force){const b=force??!classes.has(name);if(b)classes.add(name);else classes.delete(name);return b;},
    contains:n=>classes.has(n),
  },addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
  removeEventListener(type,fn){listeners.get(type)?.delete(fn);},
  dispatchEvent(e){e.currentTarget=item;e.target=e.target||item;e.preventDefault=e.preventDefault||(()=>{});for(const fn of listeners.get(e.type)||[])fn(e);},
  setPointerCapture(){},getAttribute:k=>attrs.get(k),setAttribute(k,v){attrs.set(k,v);},
  querySelector:()=>interfaceElement(),querySelectorAll:()=>[],appendChild:x=>(children.push(x),x),
  getBoundingClientRect:()=>({x:0,y:0,left:0,top:0,width:1920,height:1080}),currentTime:0,
  pause(){item.paused=true;},play(){item.paused=false;return Promise.resolve();}};return item;
}

function createHeadlessScene(options={}) {
  const htmlPath=options.htmlPath||DEFAULT_SOURCE;
  let html=options.htmlText||fs.readFileSync(htmlPath,'utf8');
  if(!options.alreadyPatched && !html.includes('/* Each sail has its own opening time. */'))html=patchRigSource(html);
  let code=html.slice(html.indexOf('// assets/three.module.js'),html.lastIndexOf('</script>'));
  function single(old,value) {
    const start=code.indexOf(old);
    if(start<0||code.indexOf(old,start+old.length)>=0)throw new Error('Source adapter mismatch: '+old.slice(0,70));
    code=code.slice(0,start)+value+code.slice(start+old.length);
  }
  single('new THREE.WebGLRenderer({antialias:false,alpha:false,powerPreference:\'high-performance\',preserveDrawingBuffer:capture})','globalThis.__renderer');
  single('finish=createFinish(renderer);','finish={render(s,c){if(globalThis.__draw)globalThis.__draw(s,c);},resize(){}};');
  single('const pmrem=new THREE.PMREMGenerator(renderer);const target=pmrem.fromScene(envScene,.04,.1,150);scene.environment=target.texture;scene.environmentIntensity=.65;pmrem.dispose();',
    'const target={texture:null};scene.environment=null;scene.environmentIntensity=.65;');
  if(options.actorsOnly){
    single('land=createEnvironment();','land={group:new THREE.Group(),heightAt:__howl_module_6.heightAt,update(){},stats:{}};');
    single('const journey=createJourneyWorlds(atmosphere.environment);','const journey={scene:new THREE.Scene(),stats:{},configs:Object.fromEntries(worldCuts.map(o=>[o.world,{}])),setWorld(){},update(){}};');
  }
  if(options.skipWarmup)single('if(!capture){\n    renderer.setPixelRatio(1);','if(false){\n    renderer.setPixelRatio(1);');
  const all=new Map();
  const pick=id=>{if(!all.has(id))all.set(id,interfaceElement());return all.get(id);};
  const dots=Array.from({length:5},()=>interfaceElement()),explore=[interfaceElement(),interfaceElement()];
  const dom={...interfaceElement(),body:interfaceElement(),documentElement:interfaceElement(),getElementById:pick,
    querySelector:pick,querySelectorAll:q=>q==='.chapter-dot'?dots:q==='[data-explore]'?explore:[],
    createElement:tag=>tag==='canvas'?makeCanvas():interfaceElement(),createElementNS:(_,tag)=>tag==='canvas'?makeCanvas():interfaceElement()};
  if(options.testPlayback)pick('soundtrack').src='mock:local-audio';
  const surface=makeCanvas();
  const renderer={domElement:surface,shadowMap:{},info:{render:{calls:0,triangles:0,lines:0,points:0}},
    setPixelRatio(){},setSize(w,h){surface.width=w;surface.height=h;},render(){}};
  let now=1000, nextRaf=1;const pending=new Map(),draws=[];
  const locationSearch=options.testPlayback?'':'?capture=1';
  const ctx={...Object.fromEntries(
    ['setTimeout','clearTimeout','setInterval','clearInterval','URLSearchParams','URL','TextEncoder','TextDecoder',
      'atob','btoa','Uint8Array','Uint8ClampedArray','Uint16Array','Uint32Array','Int8Array','Int16Array',
      'Int32Array','Float32Array','Float64Array','ArrayBuffer','DataView'].map(n=>[n,globalThis[n]])),
    console,document:dom,performance:options.testPlayback?{now:()=>now}:performance,Image,ImageData,Path2D,DOMMatrix,__renderer:renderer,
    location:{search:locationSearch,href:'file:///howl-camera.html'+locationSearch},devicePixelRatio:1,
    innerWidth:1920,innerHeight:1080,addEventListener(){},removeEventListener(){},
    requestAnimationFrame:fn=>{if(!options.testPlayback)return 0;const n=nextRaf++;pending.set(n,fn);return n;},
    cancelAnimationFrame:n=>pending.delete(n),navigator:{userAgent:'Headless scene extraction'}};
  if(options.testPlayback)ctx.__draw=(stage,camera)=>{draws.push({time:now,stage:stage.name,position:camera.position.toArray()});};
  ctx.window=ctx;ctx.self=ctx;
  const context=vm.createContext(ctx);
  new vm.Script(code+'\nglobalThis.__THREE__=__howl_module_1;', {filename:path.basename(htmlPath)+'.js'}).runInContext(context);
  if(!ctx.__POSE_FRAME__)new vm.Script(fs.readFileSync(path.join(__dirname,'apply-frame.js'),'utf8'),{filename:'apply-frame.js'}).runInContext(context);
  if(!ctx.__HOWL__||!ctx.__READY__)throw new Error('Original scene initialization failed before capture was ready');
  return {h:ctx.__HOWL__,howl:ctx.__HOWL__,THREE:ctx.__THREE__,applyFrame:ctx.__APPLY_FRAME__,context,draws,
    advance(ms){now+=ms;const toRun=Array.from(pending.values());pending.clear();toRun.forEach(fn=>fn(now));},
    evaluate(code){return vm.runInContext(code,context);}};
}

function loadScene(refinedHTML=DEFAULT_SOURCE, options={}) {
  if(typeof refinedHTML!=='string')return createHeadlessScene(refinedHTML);
  const source=refinedHTML.includes('// assets/three.module.js')?{htmlText:refinedHTML}:{htmlPath:refinedHTML};
  return createHeadlessScene({...options,...source});
}

module.exports={loadScene,createHeadlessScene};
