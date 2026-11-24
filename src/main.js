import * as THREE from "../vendor/three.module.js";
import { createTimeline } from "../direction/timeline.js";
import { createClosingStage } from "../direction/companion-stage.js";
import { createFramePoser } from "../direction/apply-frame.js";
import { createCastle } from "./castle.js";
import { createCastleWeather } from "./castle-weather.js";
import { createEnvironment } from "./environment.js";
import { createCrow } from "./crow.js";
import { createInterior } from "./interior.js";
import { createTurnip } from "./turnip.js";
import { createTravelCalcifer } from "./calcifer.js";
import { sampleTurnipMotion, sampleFireMotion } from "./companions.js";
import { createJourneyWorlds } from "./journey-worlds.js";
import { createAtmosphere, createSmoke } from "./atmosphere.js";
import { createFinish } from "./finish.js";
import { DURATION, chapters, worldCuts, motionAt, createDirection } from "./director.js";
import { createSoundtrack } from "./audio.js";

const params = new URLSearchParams(location.search);
const capture = params.has("capture");
const byId = id => document.getElementById(id);
const loader = byId("loading");
const progress = byId("progress");
const scrubber = byId("timeline");
const chapterDots = Array.from(document.querySelectorAll(".chapter-dot"));
const clamp = THREE.MathUtils.clamp;

document.body.classList.toggle("capture", capture);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: capture
  });
} catch (error) {
  loader.querySelector("small").textContent = "无法启动 WebGL 2。请打开浏览器的硬件加速后重试。";
  throw error;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.03;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const pixelRatio = () => capture ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
renderer.setPixelRatio(pixelRatio());
byId("stage").appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(46, 1, .15, 1800);
const atmosphere = createAtmosphere(scene, renderer);
const land = createEnvironment();
const castle = createCastle();
const weather = createCastleWeather(castle);
const crow = createCrow();
const turnip = createTurnip();
const travelingFire = createTravelCalcifer();
scene.add(land.group, castle.group, crow.group, turnip.group);
turnip.anchors.carryObject.add(travelingFire.group);
travelingFire.group.scale.setScalar(.70);

const kitchen = createInterior();
kitchen.scene.environment = atmosphere.environment;
kitchen.scene.environmentIntensity = .2;
const journey = createJourneyWorlds(atmosphere.environment);
for (const section of worldCuts) journey.configs[section.world].start = section.a;
journey.stats.terrainSpeed = 2.25;
const smoke = createSmoke(castle.anchors.body, castle.anchors.smokestacks);
const finish = createFinish(renderer);
const director = createDirection(land, params.get("camera") === "A" ? "A" : "B");
const timeline = createTimeline({
  director, heightAt: land.heightAt, turnip: sampleTurnipMotion, fire: sampleFireMotion
});
const cast = { renderer, scene, camera, castle, land, crow, kitchen, turnip, travelingFire, journey, director };
const poseFrame = createFramePoser(cast);
const target = new THREE.Vector3();
let closing = null;
let closingActive = false;
let playing = false;
let mode = "film";
let current = 0;
let startTime = 0;
let lastLabel = "";
let exploreWorld = "highlands";
let exploreDistance = 0;
const orbit = { theta: -.51, phi: 1.27, radius: 94, target: new THREE.Vector3(0, 20, 0) };

function playback() {
  return { playing, mode, time: current, world: exploreWorld };
}

const soundtrack = createSoundtrack(playback);

function parentTo(object, parent) {
  if (object.parent !== parent) parent.add(object);
}

function leaveClosingStage() {
  if (!closingActive) return;
  closing.reset();
  parentTo(turnip.group, scene);
  turnip.group.scale.setScalar(1);
  travelingFire.anchors.flameObject.position.set(.005, .375, -.013);
  closingActive = false;
}

function filmLabel(t, original) {
  if (t < 40) return [original.name, original.chapter];
  if (t < 42.35) return ["远行 · 越过沙丘", 3];
  if (t < 44.40) return ["迎风张开两翼", 3];
  if (t < 48.65) return ["排开云气，向前飞", 3];
  if (t < 52.85) return ["夜航 · 风里的灯", 3];
  if (t < 55.42) return ["黎明 · 天边有光", 4];
  return ["一起飞过清晨的草地", 4];
}

function showFilmTime(seconds) {
  progress.style.transform = "scaleX(" + seconds / DURATION + ")";
  byId("clock").textContent = String(Math.floor(seconds)).padStart(2, "0") + " / " + DURATION;
  scrubber.setAttribute("aria-valuenow", String(Math.round(seconds)));
}

function drawFilm(seconds) {
  current = clamp(seconds, 0, DURATION);
  // The 60-second endpoint holds native frame 1440, sampled at 59 + 23/24.
  const t = Math.min(current, DURATION - 1 / 24);
  const shot = timeline.sample(t);
  const ending = shot.type === "flight";
  let stage;
  if (ending) {
    closing ??= createClosingStage(cast, THREE);
    closingActive = true;
    stage = closing.scene;
    journey.setSharedTime(t);
  } else {
    leaveClosingStage();
    if (shot.type === "interior") stage = kitchen.scene;
    else if (shot.type === "journey") stage = journey.setWorld(shot.world, t);
    else stage = scene;
  }

  land.update(t);
  atmosphere.update(t);
  smoke.update(t);
  weather.update(shot.world, ending ? shot.sky.windowGlow : undefined);
  kitchen.update(t, shot.type === "interior"
    ? { action: "hearth", local: t - 22, visible: true }
    : { visible: false });

  poseFrame(shot, { stage, castleStage: ending ? stage : undefined, actorStage: ending ? stage : undefined, animateFire: true });
  if (ending) closing.update(shot);
  if (camera.aspect < .94) {
    target.fromArray(shot.camera.target);
    camera.position.sub(target).multiplyScalar(["interior", "greet"].includes(shot.type) ? 1.27 : 1.43).add(target);
    camera.fov = Math.max(56, camera.fov);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }

  const [label, chapter] = filmLabel(t, director.sample(t));
  if (lastLabel !== label) {
    byId("chapter").textContent = label;
    chapterDots.forEach((button, i) => button.classList.toggle("active", chapter === i));
    lastLabel = label;
  }
  finish.render(stage, camera);
  showFilmTime(current);
  window.__SHOT_STATE__ = {
    time: current, sampleTime: t, type: shot.type, world: shot.world, stage: stage.name,
    camera: camera.position.toArray(), target: shot.camera.target, fovY: camera.fov,
    bird: shot.bird?.position, castlePosition: shot.castle.position, motion: shot.motion, sky: shot.sky,
    companions: shot.companions?.visible ? {
      position: shot.companions.position, height: shot.companions.height, fireHop: shot.companions.fire.worldHeight
    } : null
  };
  return renderer.info.render;
}

function drawExplore(time) {
  leaveClosingStage();
  const highlands = exploreWorld === "highlands";
  const world = highlands ? null : exploreWorld;
  const stage = highlands ? scene : journey.setWorld(world, time, 0);
  parentTo(castle.group, stage);
  parentTo(crow.group, stage);
  crow.group.visible = false;
  castle.group.visible = true;
  const flying = world === "sky";
  const motion = { distance: exploreDistance, speed: 0, flight: flying ? 1 : 0, bank: 0, landing: 0, height: flying ? 10 : 0 };
  castle.update(time, motion);
  castle.group.position.set(0, motion.height, 0);
  weather.update(world);
  land.update(time);
  atmosphere.update(time);
  smoke.update(time);
  kitchen.update(time, { visible: false });

  const s = Math.sin(orbit.phi);
  camera.position.set(
    orbit.target.x + orbit.radius * s * Math.sin(orbit.theta),
    orbit.target.y + orbit.radius * Math.cos(orbit.phi),
    orbit.target.z + orbit.radius * s * Math.cos(orbit.theta)
  );
  camera.up.set(0, 1, 0);
  camera.lookAt(orbit.target);
  camera.fov = camera.aspect < .9 ? 60 : 47;
  camera.updateProjectionMatrix();

  parentTo(turnip.group, scene);
  turnip.group.visible = highlands;
  travelingFire.group.visible = highlands;
  if (highlands) {
    turnip.group.position.set(14, land.heightAt(14, 25), 25);
    turnip.group.rotation.y = .1;
    travelingFire.group.scale.setScalar(.70);
    const actor = turnip.update(time, { action: "idle", local: 0, energy: 1, holdFire: true, look: 0 });
    travelingFire.update(time, { action: "carried", local: 0, carrierMotion: actor, look: 0, attention: .42 });
    travelingFire.group.position.set(0, 0, 0);
    turnip.anchors.carryObject.getWorldPosition(target);
    travelingFire.group.rotation.y = Math.atan2(camera.position.x - target.x, camera.position.z - target.z) - turnip.group.rotation.y;
  }
  finish.render(stage, camera);
  window.__SHOT_STATE__ = { time: current, type: "explore", world: exploreWorld, stage: stage.name, camera: camera.position.toArray(), target: orbit.target.toArray(), motion };
  return renderer.info.render;
}

function renderAt(seconds) {
  return mode === "film" ? drawFilm(seconds) : drawExplore(seconds);
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  finish.resize();
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderAt(mode === "film" ? current : performance.now() / 1000);
}

function start(from = 0) {
  if (!Number.isFinite(from)) return;
  mode = "film";
  current = clamp(from, 0, DURATION);
  playing = true;
  startTime = performance.now() - current * 1000;
  document.body.classList.add("started");
  document.body.classList.remove("ended", "exploring");
  byId("toggle").textContent = "暂停";
  lastLabel = "";
  showFilmTime(current);
  soundtrack.sync(current, true);
}

function pause() {
  if (playing) {
    current = clamp((performance.now() - startTime) / 1000, 0, DURATION);
    playing = false;
    drawFilm(current);
  }
  document.body.classList.toggle("ended", current >= DURATION && mode === "film");
  byId("toggle").textContent = current >= DURATION ? "重播" : "继续";
  soundtrack.sync(current, false);
}

function seek(seconds, resume = false) {
  if (!Number.isFinite(seconds)) return;
  mode = "film";
  playing = false;
  current = clamp(seconds, 0, DURATION);
  document.body.classList.add("started");
  document.body.classList.remove("exploring");
  document.body.classList.toggle("ended", current >= DURATION);
  drawFilm(current);
  if (resume && current < DURATION) start(current);
  else {
    soundtrack.sync(current, false);
    byId("toggle").textContent = current >= DURATION ? "重播" : "继续";
  }
}

function tick(now) {
  if (playing) {
    const t = (now - startTime) / 1000;
    if (t >= DURATION) pause();
    else drawFilm(t);
  } else if (mode === "explore") drawExplore(now / 1000);
  requestAnimationFrame(tick);
}

function selectExploreWorld(name, reset = false) {
  const differentFamily = (name === "highlands") !== (exploreWorld === "highlands");
  exploreWorld = name;
  byId("world").value = name;
  if (!reset && !differentFamily) return;
  if (name === "highlands") {
    orbit.theta = -.51;
    orbit.phi = 1.27;
    orbit.radius = 94;
    orbit.target.set(0, 20, 0);
  } else {
    orbit.radius = Math.hypot(89, 2.5, 20);
    orbit.theta = Math.atan2(89, 20);
    orbit.phi = Math.acos(2.5 / orbit.radius);
    orbit.target.set(0, 22, 0);
  }
}

function explore() {
  pause();
  const name = mode === "film" ? (current < 40 && director.sample(current).world || "highlands") : exploreWorld;
  exploreDistance = motionAt(current).distance;
  mode = "explore";
  selectExploreWorld(name, true);
  document.body.classList.add("started", "exploring");
  document.body.classList.remove("ended");
  byId("chapter").textContent = "自由观景";
  lastLabel = "";
  drawExplore(performance.now() / 1000);
}

const togglePlay = () => playing ? pause() : start(current >= DURATION - .01 ? 0 : current);
for (const id of ["begin", "again", "restart"]) byId(id).addEventListener("click", () => start(0));
byId("toggle").addEventListener("click", togglePlay);
chapterDots.forEach((button, i) => button.addEventListener("click", () => start(chapters[i].t + .05)));
document.querySelectorAll("[data-explore]").forEach(button => button.addEventListener("click", explore));
byId("world").addEventListener("change", event => {
  selectExploreWorld(event.target.value);
  drawExplore(performance.now() / 1000);
});
byId("full").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  else document.documentElement.requestFullscreen?.().catch(() => {});
});
window.addEventListener("resize", resize);

let scrubPointer = null;
let resumeAfterSeek = false;
function pointerTime(event) {
  const rect = scrubber.getBoundingClientRect();
  return (event.clientX - rect.left) / Math.max(1, rect.width) * DURATION;
}
scrubber.addEventListener("pointerdown", event => {
  if (event.button !== 0 || scrubPointer !== null) return;
  event.preventDefault();
  scrubber.focus({ preventScroll: true });
  scrubPointer = event.pointerId;
  resumeAfterSeek = playing;
  scrubber.setPointerCapture(event.pointerId);
  seek(pointerTime(event));
});
scrubber.addEventListener("pointermove", event => {
  if (scrubPointer === event.pointerId) seek(pointerTime(event));
});
scrubber.addEventListener("pointerup", event => {
  if (scrubPointer !== event.pointerId) return;
  scrubPointer = null;
  seek(pointerTime(event), resumeAfterSeek);
});
scrubber.addEventListener("pointercancel", event => {
  if (scrubPointer !== event.pointerId) return;
  scrubPointer = null;
  if (resumeAfterSeek && current < DURATION) start(current);
});
scrubber.addEventListener("keydown", event => {
  const step = event.shiftKey ? 5 : 1;
  const times = { ArrowLeft: current - step, ArrowRight: current + step, Home: 0, End: DURATION };
  if (!(event.key in times)) return;
  event.preventDefault();
  seek(times[event.key], playing);
});

let orbitPointer = null;
let lastX = 0;
let lastY = 0;
const canvas = renderer.domElement;
canvas.addEventListener("pointerdown", event => {
  if (mode !== "explore" || event.button !== 0 || orbitPointer !== null) return;
  orbitPointer = event.pointerId;
  lastX = event.clientX;
  lastY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", event => {
  if (orbitPointer !== event.pointerId) return;
  orbit.theta -= (event.clientX - lastX) * .004;
  orbit.phi = clamp(orbit.phi + (event.clientY - lastY) * .004, .18, 1.56);
  lastX = event.clientX;
  lastY = event.clientY;
});
function endOrbit(event) {
  if (event.pointerId === orbitPointer) orbitPointer = null;
}
for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(name, endOrbit);
canvas.addEventListener("wheel", event => {
  if (mode !== "explore") return;
  event.preventDefault();
  orbit.radius = clamp(orbit.radius * Math.exp(event.deltaY * .0008), 30, 230);
}, { passive: false });
document.addEventListener("keydown", event => {
  if (["SELECT", "INPUT", "TEXTAREA"].includes(event.target.tagName)) return;
  if (event.code === "Space") {
    event.preventDefault();
    togglePlay();
  } else if (event.code === "KeyR" || (event.code === "Escape" && mode === "explore")) start(0);
});

// Stable inspection hooks shared with the original interactive edition.
window.__HOWL__ = {
  ...cast, renderAt, start, pause, seek, duration: DURATION, shots: worldCuts, timeline,
  get current() { return current; },
  get playback() { return playback(); },
  getClosingStage: () => closing,
  setMode(value) { if (value === "explore") explore(); else if (value === "film") seek(current); },
  stats: { castle: castle.stats, land: land.stats, crow: crow.stats, kitchen: kitchen.stats, turnip: turnip.stats, journey: journey.stats }
};
window.__POSE_FRAME__ = poseFrame;
window.__APPLY_FRAME__ = frame => { renderAt(frame.t); return { frame: frame.frame, t: frame.t }; };

async function initialize() {
  const started = performance.now();
  const metrics = [];
  window.__LOAD_METRICS__ = metrics;
  if (!capture) {
    renderer.setPixelRatio(1);
    renderer.setSize(320, 180);
    finish.resize();
    camera.aspect = 16 / 9;
    camera.updateProjectionMatrix();
    const stops = [9.5, 23.9, 27, 31, 33.7, 36.2, 38.7, 41.2, 43.8, 47.2, 50.5, 53.2];
    for (let i = 0; i < stops.length; i++) {
      loader.querySelector("small").textContent = "正在铺开沿途风景 · " + (i + 1) + " / " + stops.length;
      const mark = performance.now();
      drawFilm(stops[i]);
      metrics.push({ time: stops[i], milliseconds: performance.now() - mark });
      byId("load-progress").style.width = (i + 1) / (stops.length + 1) * 100 + "%";
      await new Promise(requestAnimationFrame);
    }
  }
  renderer.setPixelRatio(pixelRatio());
  current = capture ? 0 : 4.7;
  lastLabel = "";
  resize();
  byId("load-progress").style.width = "100%";
  loader.classList.add("complete");
  document.body.classList.add("ready");
  window.__READY__ = true;
  metrics.total = performance.now() - started;
  if (!capture) requestAnimationFrame(tick);
}

initialize().catch(error => {
  console.error(error);
  loader.querySelector("small").textContent = "场景未能完成加载，请重新打开";
});
