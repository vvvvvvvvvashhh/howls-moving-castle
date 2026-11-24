import * as THREE from "../vendor/three.module.js";

const up = new THREE.Vector3(0, 1, 0);
const localZ = new THREE.Vector3(0, 0, 1);
const handoff = 5.75;
const openingDrift = t => (t - 15) * .45;
const smooth = (a, b, t) => THREE.MathUtils.smootherstep(t, a, b);
const localKey = (t, x, y, z) => [t, x, y, z + openingDrift(t)];

// Positions and derivatives are expressed in world units and seconds.
// Explicit times let the bird accelerate downhill and level out at the door.
function rail(keys) {
  const knots = keys.map(([time, x, y, z, velocity]) => ({
    time, point: new THREE.Vector3(x, y, z), velocity
  }));
  for (let i = 0; i < knots.length; i++) {
    const key = knots[i];
    if (key.velocity) continue;
    const previous = knots[Math.max(0, i - 1)];
    const next = knots[Math.min(i + 1, knots.length - 1)];
    key.velocity = next.point.clone().sub(previous.point).divideScalar(next.time - previous.time);
  }
  return t => {
    if (t <= knots[0].time) return knots[0].point.clone();
    let i = 1;
    while (i < knots.length - 1 && t > knots[i].time) i++;
    const a = knots[i - 1], b = knots[i], duration = b.time - a.time;
    const u = THREE.MathUtils.clamp((t - a.time) / duration, 0, 1), u2 = u * u, u3 = u2 * u;
    return a.point.clone().multiplyScalar(2 * u3 - 3 * u2 + 1)
      .addScaledVector(a.velocity, duration * (u3 - 2 * u2 + u))
      .addScaledVector(b.point, -2 * u3 + 3 * u2)
      .addScaledVector(b.velocity, duration * (u3 - u2));
  };
}

function curve(points) {
  return new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'centripetal');
}

function createCameraB(land) {
  const approach = curve([[48, land.heightAt(48, 99) + 2.8, 99],
    [42, land.heightAt(42, 84) + 5.1, 84], [34, 12.8, 70], [25, 16, 62]]);
  const sight = curve([[8, 17, -12], [6, 18, -9], [3, 20, -5], [0, 21, 0]]);

  function originalOpening(t) {
    const p = t / 7, q = p * p * (3 - 2 * p) * .25 + p * .75;
    const camera = approach.getPoint(q), target = sight.getPoint(q);
    target.z += openingDrift(t);
    const bank = .007 * Math.sin(p * Math.PI * 2), fov = 47 - p;
    return { camera, target, bank, fov };
  }

  // Bake the approved opening at the film frame rate. Subsequent camera work
  // then has no effect on the bird's positions at the handoff or under the eaves.
  function openingBird(t) {
    const { camera, target, bank } = originalOpening(t);
    const rotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(camera, target, up));
    rotation.multiply(new THREE.Quaternion().setFromAxisAngle(localZ, bank));
    return camera.clone().addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(rotation), 7.2)
      .addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(rotation), -2.08 + .26 * Math.sin(t * .65))
      .addScaledVector(up, .88 + .104 * Math.sin(t * .72));
  }
  const openingKeys = [];
  for (let frame = 0; frame < handoff * 24; frame++) {
    const t = frame / 24;
    openingKeys.push([t, ...openingBird(t).toArray()]);
  }
  const end = originalOpening(handoff), earlier = originalOpening(handoff - .001);
  const cameraVelocity = end.camera.clone().sub(earlier.camera).multiplyScalar(1000);
  const targetVelocity = end.target.clone().sub(earlier.target).multiplyScalar(1000);
  const bEnd = openingBird(handoff), birdVelocity = bEnd.clone().sub(openingBird(handoff - .001)).multiplyScalar(1000);
  const birdAt = rail([...openingKeys, [handoff, ...bEnd.toArray(), birdVelocity],
    [6.6, 21.7, 20.5, 55.2], [7.8, 19.4, 33.1, 43.1], [9.2, 25.8, 47.2, 26.8],
    [10.1, 27.8, 53, 15.05], [10.65, 27.1, 50.4, 6.4], localKey(11.45, 22.1, 43.5, -4.2),
    localKey(12.25, 17.8, 34.9, -11.5), localKey(13, 13.5, 27.1, -16.1),
    localKey(13.55, 8.8, 23.7, -17.5), localKey(14.05, 3.5, 22.2, -16.1),
    localKey(14.4, -.7, 21.7, -15.8), localKey(14.75, -4.5, 21.75, -16.5),
    localKey(15.3, -12.4, 21.3, -18.4), localKey(15.85, -20.5, 20.6, -19.1),
    [16.5, -31.8, 19, -19], [18, -62, 18.1, -20], [19.35, -87, 21.3, -24.3],
    [20.6, -109.5, 23.5, -31.5], [21.5, -126.5, 25.9, -43.3], [22, -140, 29, -52]
  ]);
  const cameraAt = rail([[handoff, ...end.camera.toArray(), cameraVelocity],
    [6.6, 26.7, 21, 61.1], [7.8, 24.3, 38.7, 50], [9.2, 28.6, 56.6, 31.5],
    [10.1, 30.5, 66.2, 17.7], [10.65, 31.3, 64.2, 10.4], localKey(11.45, 26.7, 53.2, 1.4),
    localKey(12.25, 21.4, 42.8, -6.8), localKey(13, 18.1, 34, -13.3),
    localKey(13.55, 14.2, 29.8, -19), localKey(14.05, 8.9, 27.8, -19.4),
    localKey(14.4, 4.8, 27.5, -18.7), localKey(14.75, .85, 27, -20),
    localKey(15.3, -6.2, 27.2, -22), localKey(15.85, -13.3, 25.5, -22),
    [16.5, -23.8, 22.9, -20], [18, -53.4, 18.05, -18.6], [19.35, -78.8, 20.7, -23.4],
    [20.6, -99.5, 23.1, -29.1], [21.5, -112.3, 24.2, -36.5], [22, -118, 25.3, -39]
  ]);
  const tower = new THREE.Vector3(-135 - 8.8 * Math.sin(.12), land.heightAt(-135, -37) + 19.6, -37 - 8.8 * Math.cos(.12));

  function sample(time, castleZ = openingDrift(time)) {
    const t = THREE.MathUtils.clamp(time, 0, 22), bird = birdAt(t);
    if (t <= handoff) {
      const base = originalOpening(t);
      const birdBank = Math.sin(t * .6) * .12 - base.bank * 2 + .23 * (1 - t / 7);
      return { ...base, bird, birdBank };
    }
    const camera = cameraAt(t);
    const followHull = smooth(handoff, 11, t) * (1 - smooth(15.8, 19.3, t));
    const zDifference = (castleZ - openingDrift(t)) * followHull;
    bird.z += zDifference;
    camera.z += zDifference;
    const fov = end.fov + 5.25 * smooth(handoff, 9, t) + 2.3 * smooth(14.5, 18, t) - 6.5 * smooth(20.4, 22, t);

    // Leave the bird room to turn through the shot. Offset the sight line,
    // then let the actual roof, doorway and bell tower pull the eye in turn.
    const toBird = bird.clone().sub(camera), distance = toBird.length();
    const forward = toBird.normalize();
    const right = forward.clone().cross(up).normalize(), viewUp = right.clone().cross(forward);
    const screenX = -.29 + .45 * smooth(10.4, 13.5, t) - .37 * smooth(14.55, 18, t);
    const screenY = .10 - .12 * smooth(9.5, 13, t) + .16 * smooth(15.8, 19, t);
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(fov * .5));
    const aim = forward.clone().addScaledVector(right, -screenX * halfHeight * 16 / 9)
      .addScaledVector(viewUp, -screenY * halfHeight).normalize();
    const toward = (point, strength) => aim.lerp(point.sub(camera).normalize(), strength).normalize();
    toward(new THREE.Vector3(0, 24, castleZ), .44 * smooth(6.35, 8.3, t) * (1 - smooth(10.4, 12.2, t)));
    // Keep the top of the visible mast inside the rising composition until the
    // bird has rounded the roof. The camera can then freely commit to its dive.
    if (t > 6.1 && t < 10.95) {
      const viewRight = aim.clone().cross(up).normalize(), vertical = viewRight.clone().cross(aim);
      const toMast = new THREE.Vector3(-.34, 43.4, .7 + castleZ).sub(camera);
      const excess = Math.atan2(toMast.dot(vertical), toMast.dot(aim)) - Math.atan(.84 * halfHeight);
      const rise = smooth(6.1, 7.05, t) * (1 - smooth(10.4, 10.95, t));
      aim.applyAxisAngle(viewRight, Math.max(0, excess) * smooth(0, .038, excess) * rise);
    }
    toward(new THREE.Vector3(1.53, 21.25, castleZ - 12.48), .50 * smooth(12.5, 13.65, t) * (1 - smooth(14.06, 14.67, t)));
    toward(tower.clone(), smooth(20.55, 21.85, t));
    const target = camera.clone().addScaledVector(aim, Math.max(distance, 20));
    if (t < 7.2) {
      const oldSight = end.target.clone().addScaledVector(targetVelocity, t - handoff);
      target.lerp(oldSight, 1 - smooth(handoff, 7.2, t));
    }
    // The crow banks toward the actual turn, with a small anticipation. A
    // positive local roll raises its right wing (the model faces local -Z).
    const bendTime = THREE.MathUtils.clamp(t + .065, handoff, 21.78);
    const pivot = birdAt(bendTime), approach = pivot.clone().sub(birdAt(bendTime - .18));
    const departure = birdAt(bendTime + .18).sub(pivot);
    const yaw = Math.atan2(approach.x * departure.z - approach.z * departure.x,
      approach.x * departure.x + approach.z * departure.z);
    const openingBank = Math.sin(handoff * .6) * .12 - end.bank * 2 + .23 * (1 - handoff / 7);
    const birdBank = THREE.MathUtils.lerp(openingBank, THREE.MathUtils.clamp(-2 * yaw, -.36, .36), smooth(handoff, 6.7, t));
    const bank = end.bank * (1 - smooth(handoff, 7, t)) + .095 * birdBank * smooth(handoff, 7, t);
    return { camera, target, bird, bank, fov, birdBank };
  }
  return { sample };
}

export { createCameraB };
