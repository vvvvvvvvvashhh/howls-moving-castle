const clamp = (value, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, value));
const mix = (a, b, amount) => a + (b - a) * amount;
const wrap = value => value - Math.floor(value);

const GAIT = Object.freeze({
  strideLength: 10.8,
  speed: 2.25,
  period: 4.8,
  stance: .765,
  legs: Object.freeze([
    Object.freeze({ name: 'port fore', side: -1, fore: true, strike: .51 }),
    Object.freeze({ name: 'starboard fore', side: 1, fore: true, strike: 0 }),
    Object.freeze({ name: 'port aft', side: -1, fore: false, strike: .24 }),
    Object.freeze({ name: 'starboard aft', side: 1, fore: false, strike: .76 })
  ])
});

function smoothRange(a, b, value) {
  const q = clamp((value - a) / (b - a));
  return q * q * (3 - 2 * q);
}

function quintic(q) {
  return q * q * q * (q * (q * 6 - 15) + 10);
}

function pulse(phase, start, peak, end) {
  return smoothRange(start, peak, phase) * (1 - smoothRange(peak, end, phase));
}

// The last tangent is deliberately downward. The carriage absorbs the blow after contact.
const footArc = [[0, 0, 0], [.16, .60, 6.8], [.36, 2.32, 6.0], [.55, 2.84, 0], [.77, 2.10, -6.5], [1, 0, -7.9]];
const footRocker = [[0, 0, 0], [.20, .235, .28], [.39, .25, -.55], [.67, -.065, -1.2], [.83, -.20, 0], [1, 0, 0]];

function hermiteKeys(keys, value) {
  let i = 1;
  while (i < keys.length - 1 && value > keys[i][0]) i++;
  const [a, ya, da] = keys[i - 1], [b, yb, db] = keys[i];
  const w = b - a, q = clamp((value - a) / w), r = 1 - q;
  return r * r * ((1 + 2 * q) * ya + w * q * da) + q * q * ((3 - 2 * q) * yb - w * r * db);
}

// Distances are along local +Z. Both a travelling root and a scrolling landscape use this clock.
// Footfalls in (fromDistance, toDistance], suitable for sound, dust and mechanical impacts.
function footfallsBetween(fromDistance, toDistance) {
  if (!(toDistance > fromDistance)) return [];
  const events = [];
  for (const [index, leg] of GAIT.legs.entries()) {
    const first = Math.floor(fromDistance / GAIT.strideLength - leg.strike + 1e-10) + 1;
    const last = Math.floor(toDistance / GAIT.strideLength - leg.strike + 1e-10);
    for (let turn = first; turn <= last; turn++) {
      const distance = (turn + leg.strike) * GAIT.strideLength;
      events.push({ index, name: leg.name, side: leg.side, fore: leg.fore, distance, timeAtNominalSpeed: distance / GAIT.speed });
    }
  }
  return events.sort((a, b) => a.distance - b.distance);
}

function sampleLocomotion(t, options = {}) {
  const speed = options.speed ?? GAIT.speed;
  const distance = options.distance ?? t * speed;
  const turns = distance / GAIT.strideLength;
  const flight = clamp(options.flight ?? 0), landing = clamp(options.landing ?? 0);
  const grounded = 1 - smoothRange(.025, .36, flight);
  const airborne = smoothRange(.10, .88, flight);
  const bank = clamp(options.bank ?? 0, -.5, .5);
  const brace = smoothRange(.015, .34, flight);
  const body = { x: 0, y: -.40, z: 0, pitch: 0, roll: 0, yaw: 0 };
  const feet = GAIT.legs.map((leg, index) => {
    const phase = wrap(turns - leg.strike + 1e-12);
    const swing = clamp((phase - GAIT.stance) / (1 - GAIT.stance));
    const advance = quintic(clamp((swing - .055) / .90));
    // The advancing root cancels -distance exactly throughout the support interval.
    const travel = GAIT.strideLength * (GAIT.stance * .5 - phase + advance);
    const lift = hermiteKeys(footArc, swing) * (leg.fore ? 1 : .92);
    const pitch = hermiteKeys(footRocker, swing);
    const swingArc = Math.sin(Math.PI * swing);
    const f = phase < .22 ? phase + 1 : phase;
    // Transfer to the other three pads before the piston takes this foot off the ground.
    const unload = smoothRange(GAIT.stance - .15, GAIT.stance - .015, f) * (1 - smoothRange(.94, 1.13, f));
    const hit = pulse(phase, 0, .036, .156);
    const rebound = pulse(phase, .106, .17, .238);
    const impact = hit - .21 * rebound;
    const foreDirection = leg.fore ? 1 : -1;
    body.x -= leg.side * unload * .70;
    body.z -= foreDirection * unload * .33;
    body.y -= (leg.fore ? .73 : .55) * impact;
    body.y += .115 * unload;
    body.roll += leg.side * (unload * .023 - impact * .014);
    body.pitch += foreDirection * (impact * .029 + unload * .012);
    body.yaw += leg.side * foreDirection * unload * .006;
    const tuck = smoothRange(.21 + (index % 2) * .035, .94, flight);
    return { index, name: leg.name, phase, swing, planted: phase <= GAIT.stance && flight < .025,
      travel: mix(travel, foreDirection * .76, brace), lift: lift * (1 - brace),
      pitch: pitch * (1 - brace), sideArc: .38 * swingArc * swingArc * (1 - brace),
      gather: swingArc * (1 - brace), impact: hit * grounded, tuck };
  });
  const kneel = pulse(flight, 0, .12, .39);
  const steadyRoll = Math.sin(t * .52 + .62) * .024 + Math.sin(t * .27 - .3) * .013;
  body.x = body.x * grounded + airborne * .17 * Math.sin(t * .38);
  body.z = body.z * grounded + airborne * .09 * Math.sin(t * .43);
  body.y = mix(body.y, .09 + .16 * Math.sin(t * .53), airborne) - .42 * kneel - .85 * landing;
  body.pitch = body.pitch * grounded - .067 * airborne + .020 * airborne * Math.sin(t * .41 + .8) + .021 * landing;
  body.roll = body.roll * grounded + (bank + steadyRoll) * airborne;
  body.yaw = body.yaw * grounded + .018 * airborne * Math.sin(t * .36 - .65);
  return { distance, speed, phase: wrap(turns), period: speed ? GAIT.strideLength / Math.abs(speed) : Infinity,
    flight, bank, landing, grounded, airborne, body, feet };
}

export { GAIT, smoothRange, footfallsBetween, sampleLocomotion };
