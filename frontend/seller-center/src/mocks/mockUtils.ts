// Deterministic mock-data helpers. Seeded so generated datasets are stable across reloads.
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rng = mulberry32(7);

export function resetSeed(seed = 7) {
  rng = mulberry32(seed);
}

export function randomFloat(min: number, max: number): number {
  return min + rng() * (max - min);
}

export function randomInt(min: number, max: number): number {
  return Math.floor(randomFloat(min, max + 1));
}

export function randomId(prefix = 'id'): string {
  return `${prefix}_${Math.floor(rng() * 1e9).toString(36)}`;
}

export function randomDateBetween(start: Date, end: Date): string {
  const t = start.getTime() + rng() * (end.getTime() - start.getTime());
  return new Date(t).toISOString();
}

export function pickOne<T>(arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function pickMany<T>(arr: readonly T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

export function randomBool(trueProbability = 0.5): boolean {
  return rng() < trueProbability;
}

export function simulateDelay<T>(value: T, ms = 300): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
