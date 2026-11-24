'use strict';

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const mix = (a, b, amount) => a + (b - a) * amount;
const radians = degrees => degrees * Math.PI / 180;
const degrees = angle => angle * 180 / Math.PI;
const add = (a, b) => a.map((value, i) => value + b[i]);
const sub = (a, b) => a.map((value, i) => value - b[i]);
const scale = (a, amount) => a.map(value => value * amount);
const vMix = (a, b, amount) => a.map((value, i) => mix(value, b[i], amount));
const dot = (a, b) => a.reduce((total, value, i) => total + value * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => scale(a, 1 / (Math.hypot(...a) || 1));

function smooth(a, b, x) {
  const u = clamp((x - a) / (b - a));
  return u * u * u * (10 + u * (6 * u - 15));
}

// Time parameterized cubic Hermite. Harmonic slopes preserve monotonicity
// on unevenly spaced keys. A third column locks a physical derivative.
function track(keys) {
  const n = keys.length;
  const h = keys.slice(1).map((p,i) => p[0] - keys[i][0]);
  const slopes = h.map((d,i) => (keys[i + 1][1] - keys[i][1]) / d);
  const v = keys.map((p,i) => {
    if (p.length > 2) return p[2];
    if (!i) return slopes[0];
    if (i === n - 1) return slopes[n - 2];
    const a = slopes[i - 1], b = slopes[i];
    if (a * b <= 0) return 0;
    const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
    return (w1 + w2) / (w1 / a + w2 / b);
  });
  return t => {
    if (t <= keys[0][0]) return keys[0][1];
    if (t >= keys[n-1][0]) return keys[n-1][1];
    let i = 0;
    while (t > keys[i+1][0]) i++;
    const u = (t - keys[i][0]) / h[i], w = 1 - u;
    return w*w*((1+2*u)*keys[i][1] + h[i]*u*v[i])
      + u*u*((3-2*u)*keys[i+1][1] - h[i]*w*v[i+1]);
  };
}

// Piecewise raised-cosine speeds, analytically integrated. The floor stops
// under planted feet; a sample can be evaluated in any order.
function speedRail(keys) {
  return t => {
    let distance = 0;
    for (let i=0; i<keys.length-1; i++) {
      const [a, va] = keys[i], [b, vb] = keys[i+1];
      if (t <= a) return { distance, speed: va };
      const duration = b-a, u = Math.min(1, (t-a)/duration);
      distance += duration * (va*u + (vb-va)*.5*(u - Math.sin(Math.PI*u)/Math.PI));
      if (t <= b) return { distance, speed: mix(va,vb,.5-.5*Math.cos(Math.PI*u)) };
    }
    const [last, speed] = keys.at(-1);
    return { distance: distance + Math.max(0,t-last)*speed, speed };
  };
}

function project(point, camera, aspect=16/9) {
  const delta = sub(point,camera.position);
  const forward = unit(sub(camera.target,camera.position));
  const eRight = unit(cross(forward,[0,1,0]));
  const eUp = unit(cross(eRight,forward));
  const c = Math.cos(camera.bank || 0), s = Math.sin(camera.bank || 0);
  const right = add(scale(eRight,c),scale(eUp,s)), up = add(scale(eUp,c),scale(eRight,-s));
  const depth = dot(delta,forward), tan = Math.tan(radians(camera.fovY)*.5);
  return [(.5+.5*dot(delta,right)/(depth*tan*aspect)), .5-.5*dot(delta,up)/(depth*tan), depth];
}

module.exports = {clamp,mix,radians,degrees,add,sub,scale,vMix,dot,cross,unit,smooth,track,speedRail,project};
