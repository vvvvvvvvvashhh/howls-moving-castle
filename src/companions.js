const clamp01 = x => Math.max(0, Math.min(1, x));
const smooth = x => {
  const a = clamp01(x);
  return a * a * (3 - 2 * a);
};

function gesture(time, start, peak, end) {
  if (time < start || time >= end) return 0;
  return time < peak ? smooth((time - start) / (peak - start)) : 1 - smooth((time - peak) / (end - peak));
}

// Takeoff (seconds), airtime (seconds), height, forward distance and the side that leads.
// The greeting has a small answering hop, a hat-tipping leap and a short pair on the way out.
const greeting = [
  [.76, .67, .84, 1.05, -1],
  [2.10, .99, 1.48, 2.12, 1],
  [3.77, .63, .66, 1.17, -1],
  [4.78, .81, 1.02, 1.60, 1],
  [6.08, .58, .59, 1.19, -1],
];
const turnipStride = [
  [.34, .64, .76, 1.52, -1],
  [1.21, .88, 1.16, 2.63, 1],
  [2.55, .61, .64, 1.61, -1],
  [3.42, .85, 1.09, 2.52, 1],
];
// The small coal has to gather itself, then takes several quick hops to catch its friend.
const fireStride = [
  [.43, .46, .46, .81, 1],
  [1.08, .61, .79, 1.88, -1],
  [1.88, .50, .59, 1.66, 1],
  [2.79, .65, .91, 2.23, -1],
  [3.71, .50, .53, 1.76, 1],
];
const idle = [];
const turnipPeriod = 4.68;
const firePeriod = 4.66;

function sample(local, events, period, energy, action) {
  const now = Math.max(0, local);
  const strength = Math.max(0, energy);
  const cycles = period ? Math.floor(now / period) : 0;
  const t = period ? now - cycles * period : now;
  const m = {
    action, height: 0, distance: 0, air: false, progress: 0, arc: 0,
    gather: 0, stretch: 0, impact: 0, rebound: 0, roll: 0, cloth: 0, tilt: 0,
  };
  for (const [takeoff, duration, apex, distance, side] of events) {
    m.distance += distance * cycles;
    const delay = t - takeoff;
    const u = clamp01(delay / duration);
    // Horizontal momentum carries the pole tip to a new spot. Its contact point then stays there.
    m.distance += distance * (.85 * u + .15 * smooth(u));
    const chargeTime = .20 + .12 * duration;
    const gather = gesture(delay, -chargeTime, -.085, .015);
    const stretch = gesture(delay, -.091, .065, .29);
    const impact = gesture(delay, duration - .025, duration + .088, duration + .26);
    const rebound = gesture(delay, duration + .10, duration + .24, duration + .39);
    m.gather += gather;
    m.stretch += stretch;
    m.impact += impact;
    m.rebound += rebound;
    m.roll += side * (-.88 * gather + .18 * stretch - .44 * impact + .22 * rebound);
    m.tilt += side * (-.30 * stretch + .42 * rebound);
    if (delay >= 0 && delay < duration) {
      const arc = 4 * u * (1 - u);
      m.air = true;
      m.progress = u;
      m.arc = arc;
      m.height = apex * arc;
      m.roll += side * arc * (.68 + .32 * Math.sin(Math.PI * u));
      m.tilt += side * arc;
      m.cloth += arc * (2 * u - 1);
    }
    m.cloth += -.42 * stretch + .28 * impact - .17 * rebound;
  }
  // Strength changes the amplitude, keeping the duration and ground-contact timing intact.
  m.air = m.air && strength > 0;
  m.distance *= strength;
  m.height *= strength;
  m.arc *= strength;
  m.gather *= strength;
  m.stretch *= strength;
  m.impact *= strength;
  m.rebound *= strength;
  m.roll *= strength;
  m.tilt *= strength;
  m.cloth *= strength;
  return m;
}

function sampleTurnipMotion(local = 0, action = 'travel', energy = 1) {
  if (action === 'greet') return sample(local, greeting, 0, energy, action);
  return sample(local, action === 'travel' ? turnipStride : idle, turnipPeriod, energy, action);
}

function sampleFireMotion(local = 0, action = 'travel', energy = 1) {
  return sample(local, action === 'travel' ? fireStride : idle, firePeriod, energy, action);
}

export { gesture, sampleTurnipMotion, sampleFireMotion };
