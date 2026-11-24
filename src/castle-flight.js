import * as THREE from "../vendor/three.module.js";
import { smoothRange } from "./locomotion.js";

const vec = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const mix = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const Y = vec(0, 1, 0), Z = vec(0, 0, 1);
const ZERO = vec(), ONE = vec(1, 1, 1);
const yawQ = new THREE.Quaternion();

function axisFrame(yaw, pitch, out = new THREE.Quaternion()) {
  return out.setFromAxisAngle(Y, yaw).multiply(yawQ.setFromAxisAngle(Z, pitch));
}

function rayGeometry() {
  const sweep = [-.32, -.015, .34, .71, 1.08, 1.44];
  const lengths = [13.2, 16.4, 18.0, 17.85, 16.2, 14.1];
  const elbows = [.54, .53, .51, .53, .55, .57];
  return sweep.map((yaw, i) => {
    const length = lengths[i], elbow = elbows[i];
    const pitch = .36 - .105 * i, tipYaw = yaw + .12, tipPitch = .16 - i * .103;
    const innerQ = axisFrame(yaw, pitch), outerQ = axisFrame(tipYaw, tipPitch);
    const knuckle = vec(length * elbow, 0, 0).applyQuaternion(innerQ);
    const tip = vec(length * (1 - elbow), 0, 0).applyQuaternion(outerQ).add(knuckle);
    return { yaw, pitch, tipYaw, tipPitch, length, elbow, knuckle, tip,
      innerInverse: new THREE.Matrix4().makeRotationFromQuaternion(innerQ.invert()),
      outerInverse: new THREE.Matrix4().makeRotationFromQuaternion(outerQ.invert()).multiply(new THREE.Matrix4().makeTranslation(-knuckle.x, -knuckle.y, -knuckle.z)) };
  });
}

function along(ray, ratio) {
  if (ratio < ray.elbow) return ray.knuckle.clone().multiplyScalar(ratio / ray.elbow);
  return ray.knuckle.clone().lerp(ray.tip, (ratio - ray.elbow) / (1 - ray.elbow));
}

function wingSurface(rays, i, span, across) {
  const scallop = Math.sin(across * Math.PI);
  // A cord races straight from knuckle to knuckle. The weathered sail sags between its lacing points.
  const radial = span * (1 - .115 * scallop * Math.pow(span, 3.2));
  const p = along(rays[i], radial).lerp(along(rays[i + 1], radial), across);
  p.y += scallop * (.50 * Math.sin(Math.PI * span) - .28 * span * span);
  return p;
}

function makeSkinWeights(geometry, rays) {
  const pos = geometry.getAttribute('position'), indices = [], weights = [];
  const bearings = new Float64Array(rays.length);
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), z = pos.getZ(k), radius = Math.hypot(x, z), theta = Math.atan2(-z, x);
    rays.forEach((ray, j) => {
      const p = along(ray, clamp(radius / Math.hypot(ray.tip.x, ray.tip.z), .001, 1));
      bearings[j] = Math.atan2(-p.z, p.x);
    });
    let j = 0;
    while (j < rays.length - 2 && theta > bearings[j + 1]) j++;
    const weight = clamp((theta - bearings[j]) / (bearings[j + 1] - bearings[j]), 0, 1);
    const hingeWeight = ray => {
      const knuckleRadius = Math.hypot(ray.knuckle.x, ray.knuckle.z);
      return smoothRange(knuckleRadius - .22, knuckleRadius + .22, radius);
    };
    const a = hingeWeight(rays[j]), b = hingeWeight(rays[j + 1]);
    indices.push(j * 2, j * 2 + 1, j * 2 + 2, j * 2 + 3);
    weights.push((1 - weight) * (1 - a), (1 - weight) * a, weight * (1 - b), weight * b);
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
}

function addWing(batch, rays, side) {
  const colors = side === 1
    ? ['#bb9779', '#c8ad8b', '#b99c84', '#c5a389', '#aa8774']
    : ['#a8a082', '#b3ab8e', '#a29c81', '#b1a58a', '#9d9379'];
  const binding = '#6d5b4c', wood = '#78644f', brass = '#a28b69';
  for (let i = 0; i < rays.length - 1; i++) {
    const patch = (s, a) => wingSurface(rays, i, s, a);
    for (const [start, end, tone] of [[.115, .35, .86], [.35, .63, .98], [.63, 1, 1.05]]) {
      batch.surf(7, 8, (u, v) => patch(mix(start, end, u), v), new THREE.Color(colors[i]).multiplyScalar(tone), 'sail', false, 1, 1,
        (u, v) => {const shade = .92 + .055 * Math.sin(v * Math.PI) + .03 * u; return [shade, shade, shade];});
    }
    // The old radial seams, hem, eyelets and a few replacement pieces remain visible from below.
    for (const [s, radius, col] of [[.35, .030, '#92816b'], [.63, .036, '#948069'], [1, .073, binding]]) {
      const edge = Array.from({length: 9}, (_, j) => patch(s, j / 8));
      batch.path(edge, radius, col, 'metal', 9, 5);
    }
    if (i === 1 || i === 3) {
      batch.surf(4, 3, (u, v) => {
        const radial = mix(.71, .85, u) - .036 * v;
        const p = patch(radial, mix(.19, .56, v) + .033 * u);
        p.y += .037;
        return p;
      }, side === 1 ? '#aa8268' : '#938e78', 'sail');
    }
  }
  for (const [i, ray] of rays.entries()) {
    const pt = u => along(ray, u);
    batch.cylinder(pt(.025), pt(ray.elbow), i === 0 ? .22 : .145, .105, wood, 'metal', 10);
    batch.cylinder(pt(ray.elbow), pt(.972), .121, .059, '#8e7759', 'metal', 9);
    batch.cylinder(pt(.967), pt(1.035), .076, .031, brass, 'brass', 8);
    const pin = ray.knuckle, cross = vec(-Math.sin(ray.yaw) * .20, 0, -Math.cos(ray.yaw) * .20);
    batch.cylinder(pin.clone().sub(cross), pin.clone().add(cross), .205, .20, '#7b6b55', 'metal', 10);
    for (const u of [.16, .46, .61, .84]) {
      batch.cylinder(pt(u - .0067), pt(u + .008), u < .5 ? .165 : .125, u < .5 ? .159 : .119, brass, 'brass', 9);
    }
    if (i < 3) {
      const cable = [.07, .20, .37, .52].map(u => {
        const p = pt(u);p.y -= .08 + .41 * Math.sin((u - .07) / .45 * Math.PI);return p;
      });
      batch.path(cable, .045, '#615849', 'metal', 8, 5);
    }
  }
}

function finishSkin(rig, batch, bones, weightsFor, stats) {
  const temporary = new THREE.Group();
  stats.triangles += batch.finish(temporary);
  const skeleton = new THREE.Skeleton(bones, bones.map(() => new THREE.Matrix4()));
  for (const original of temporary.children) {
    const geometry = original.geometry;
    weightsFor(geometry);
    const mesh = new THREE.SkinnedMesh(geometry, original.material);
    mesh.name = original.name;mesh.castShadow = true;mesh.receiveShadow = true;mesh.frustumCulled = false;
    rig.add(mesh);mesh.bind(skeleton, new THREE.Matrix4());
  }
}

function createSternScrew(body, materials, Batch, side, stats) {
  const joint = new THREE.Group(), arm = new THREE.Group(), slide = new THREE.Group(), prop = new THREE.Group();
  joint.name = side > 0 ? 'Starboard stern propeller housing' : 'Port stern propeller housing';
  joint.position.set(side * 7.3, side > 0 ? 14.45 : 13.78, side > 0 ? -8.76 : -8.47);
  body.add(joint);joint.add(arm);arm.add(slide);slide.add(prop);
  prop.name = 'Feathering paddle screw';prop.position.z = 6.68;
  const fixed = new Batch(materials), beam = new Batch(materials), piston = new Batch(materials);
  fixed.orb([0, 0, 0], [.95, .86, .91], '#6c6659', 'metal', [0,0,0], 14, 9);
  fixed.cylinder([-1.06,0,0],[1.06,0,0],.61,.61,'#817561','metal',14);
  fixed.ring([side*.87,0,0],[1,0,0],.59,.12,'#a68d67','metal',14);
  beam.cylinder([0,0,.16],[0,0,4.40],.59,.42,'#6b6858','metal',12);
  for (const sign of [-1,1]) {
    beam.beam([sign*.45,-.10,.35],[sign*.65,.17,2.67],.17,.24,'#82745d','metal');
    beam.beam([sign*.65,.17,2.67],[sign*.29,-.04,4.4],.13,.19,'#8b795c','metal');
  }
  for (const z of [.58,1.01,2.34,3.84,4.3])beam.ring([0,0,z],[0,0,1],.56-.032*z,.088,'#988568','metal',14);
  piston.cylinder([0,0,.38],[0,0,5.88],.275,.245,'#9a927c','metal',12);
  piston.cylinder([0,0,5.51],[0,0,6.43],.38,.30,'#656459','metal',12);
  piston.cylinder([0,0,6.37],[0,0,6.84],.53,.45,'#8e7d61','metal',14);
  piston.ring([0,0,6.51],[0,0,1],.50,.076,'#b09b75','metal',14);
  stats.triangles += fixed.finish(joint) + beam.finish(arm) + piston.finish(slide);
  const paddles = new Batch(materials), bones=[];
  for (let i=0;i<4;i++) {
    const bone = new THREE.Bone();bone.name = 'Spring-loaded paddle root';bone.matrixAutoUpdate=false;prop.add(bone);bones.push(bone);
    const angle = i * Math.PI * .5;
    paddles.local([0,0,0],[0,0,angle],()=>{
      const point=(u,v)=>{
        const width = .14 + .49*Math.sin(Math.PI*Math.pow(u,.80)) + .10*u;
        return vec(.31+u*2.64 + .21*(1-v)*Math.pow(u,4), (v-.5)*2*width + .50*u*u,
          .08 + .26*u - .47*(v-.5)*Math.sin(Math.PI*u) + .18*Math.sin(Math.PI*u));
      };
      const color=(side>0 ? ['#6d7463','#817458','#6c7362','#8b7b5f'] : ['#817765','#667365','#887960','#737762'])[i];
      paddles.surf(11,4,point,color,'sail');
      paddles.surf(3,4,(u,v)=>{const p=point(.89+.11*u,v);p.z+=.017;return p;},'#a18b68','sail');
      const spar=Array.from({length:7},(_,j)=>point(j/6,.36));
      paddles.path(spar,.073,'#584f43','metal',8,6);
      paddles.cylinder([.27,0,.075],[.75,.04,.13],.16,.13,'#9a8664','metal',9);
    });
  }
  finishSkin(prop,paddles,bones,geometry=>{
    const pos=geometry.getAttribute('position'),indices=[],weights=[];
    for(let k=0;k<pos.count;k++){
      const angle=Math.atan2(pos.getY(k),pos.getX(k));
      indices.push((Math.round(angle/(Math.PI*.5))+4)%4,0,0,0);weights.push(1,0,0,0);
    }
    geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
    geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  },stats);
  const place = new THREE.Matrix4(), turn = new THREE.Matrix4(), axis = new THREE.Vector3();
  const from=[], to=[];
  for(let i=0;i<4;i++){
    const angle=i*Math.PI*.5;
    from.push(new THREE.Matrix4().makeRotationZ(angle).multiply(new THREE.Matrix4().makeTranslation(.31,0,0)));
    to.push(new THREE.Matrix4().makeTranslation(-.31,0,0).multiply(new THREE.Matrix4().makeRotationZ(-angle)));
  }
  let lastFlight=NaN;
  return function update(t,state){
    const deploy=smoothRange(.12,.83,state.flight);
    if(state.flight!==lastFlight){
      const yaw = side*mix(.20,2.76,deploy), pitch=mix(.21,-.11,deploy)+.12*Math.sin(Math.PI*deploy);
      axis.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
      arm.quaternion.setFromUnitVectors(Z,axis);
      slide.position.z=mix(.10,5.69,smoothRange(.19,.88,state.flight));
      const feather=smoothRange(.34,.90,state.flight);
      turn.makeRotationY(-1.47*(1-feather));
      for(let i=0;i<bones.length;i++){
        bones[i].matrix.copy(place.multiplyMatrices(from[i],turn).multiply(to[i]));bones[i].matrixWorldNeedsUpdate=true;
      }
      // At rest the narrow paddle pack sits entirely inside the side-mounted sleeve.
      prop.visible=state.flight>.20;
      lastFlight=state.flight;
    }
    const angle=state.direction?state.direction.propellerPhase*(side>0?1.018:.982):t*2.42;
    prop.rotation.z=side*(angle+.31)+.52*side;
  };
}

function createFlightRig(body, materials, Batch, stats) {
  const rays = rayGeometry(), sides = [], propellers = [];
  for (const side of [-1, 1]) {
    const rig = new THREE.Group();
    rig.name = side === 1 ? 'Starboard folding sail fan' : 'Port folding sail fan';
    const batch = new Batch(materials);
    addWing(batch, rays, side);
    const bones = rays.flatMap((ray, i) => ['inboard', 'folding tip'].map(part => {
      const bone = new THREE.Bone();bone.name = `Sail batten ${i + 1} ${part}`;bone.matrixAutoUpdate = false;rig.add(bone);return bone;
    }));
    finishSkin(rig,batch,bones,g=>makeSkinWeights(g,rays),stats);
    const hinge = new THREE.Group();
    hinge.position.set(side * (side > 0 ? 13.3 : 13.0), side > 0 ? 17.65 : 18.14, side > 0 ? -.72 : -2.66);
    hinge.scale.x = side;
    const frame = new Batch(materials);
    frame.cylinder([-.79, -.04, 0], [.29, 0, 0], .65, .55, '#6b5d4f', 'metal', 16);
    frame.cylinder([.23, -.03, 0], [.43, .015, 0], .62, .58, '#9e896a', 'brass', 16);
    frame.cylinder([.42, .01, 0], [.56, .01, 0], .30, .22, '#75674f', 'metal', 10);
    frame.beam([-1.31, -1.51, .16], [.15, -.12, .05], .24, .29, '#796951', 'metal');
    frame.beam([-1.14, -.84, -1.11], [.15, -.12, -.10], .17, .19, '#8a755b', 'metal');
    stats.triangles += frame.finish(hinge);
    hinge.add(rig);body.add(hinge);
    sides.push({ side, rig, bones });
    propellers.push(createSternScrew(body,materials,Batch,side,stats));
  }

  const rot = new THREE.Quaternion(), posedElbow = new THREE.Vector3(), inverse = new THREE.Matrix4();
  const last = { flight: NaN };
  function update(t, state) {
    /* Each sail has its own opening time. */
    for(const movePropeller of propellers)movePropeller(t,state);
    for (const { side, rig, bones } of sides) {
      const cue=state.direction, which=side>0?1:0;
      const wingFlight=cue?cue.wing[which]:state.flight;
      const opening=smoothRange(.015,.78,wingFlight);
      // Only the pressure on the broad sail changes while gliding. The spars hold their spread.
      const catchAir = smoothRange(.085,.71,wingFlight);
      rig.rotation.x = catchAir * (.03 * Math.sin(t * .65 + side * .53) + side * state.bank * .14);
      rig.rotation.z = catchAir * (.048 * Math.sin(t * .76 + side * .44) + side * state.bank * .19);
      if(cue){rig.rotation.z+=cue.wingFlex[which];rig.rotation.x+=cue.wingFlex[which]*.28;}
      if (!cue && state.flight === last.flight) continue;
      for (const [i, ray] of rays.entries()) {
        const lag = i * .018;
        const spread = smoothRange(lag, .93 + lag * .65, opening);
        const extension = smoothRange(.14 + lag, .93 + lag * .7, opening);
        const innerYaw = mix(1.40 + .045 * i, ray.yaw, spread);
        const innerPitch = mix(.23 + .024 * i, ray.pitch, spread) + Math.sin(spread * Math.PI) * .18;
        const outerYaw = mix(-1.33 - .013 * i, ray.tipYaw, extension);
        const outerPitch = mix(.77 + .038 * i, ray.tipPitch, extension) + Math.sin(extension * Math.PI) * .23;
        axisFrame(innerYaw, innerPitch, rot);
        bones[i * 2].matrix.compose(ZERO, rot, ONE).multiply(ray.innerInverse);
        posedElbow.set(ray.length * ray.elbow, 0, 0).applyQuaternion(rot);
        axisFrame(outerYaw, outerPitch, rot);
        inverse.compose(posedElbow, rot, ONE).multiply(ray.outerInverse);
        bones[i * 2 + 1].matrix.copy(inverse);
        bones[i * 2].matrixWorldNeedsUpdate = true;
        bones[i * 2 + 1].matrixWorldNeedsUpdate = true;
      }
    }
    last.flight = state.direction ? NaN : state.flight;
  }
  return { update, wings: sides.map(s => s.rig) };
}

export { createFlightRig };
