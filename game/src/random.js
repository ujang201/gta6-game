// Seeded random numbers for Solmar Bay. The whole city, traffic and crowd
// come from one fixed seed so the same build always grows the same streets.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range(a, b) {
      return a + (b - a) * next();
    },
    int(a, b) {
      return Math.floor(a + (b - a + 1) * next());
    },
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    chance(p) {
      return next() < p;
    },
    // Random point on a circle of the given radius around a centre.
    around(x, z, radius) {
      const ang = next() * Math.PI * 2;
      const r = radius * Math.sqrt(next());
      return { x: x + Math.cos(ang) * r, z: z + Math.sin(ang) * r };
    },
  };
}
