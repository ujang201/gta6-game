// Seeded deterministic RNG for SOLMAR BAY (mulberry32) plus small helpers.
// Every random choice in the city, traffic and missions flows from one seed,
// so the same seed always builds the same Solmar Bay.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed) {
    this.next = mulberry32(seed);
  }
  // float in [0, 1)
  f() {
    return this.next();
  }
  // float in [min, max)
  range(min, max) {
    return min + (max - min) * this.next();
  }
  // integer in [min, max] inclusive
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }
  // pick one element of an array
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  // true with probability p
  chance(p) {
    return this.next() < p;
  }
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// shortest signed angular difference, in radians
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}
