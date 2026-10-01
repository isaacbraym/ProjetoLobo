export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a: number, b: number, v: number) => {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
};
/** Amortecimento independente de framerate: aproxima `a` de `b` com meia-vida `halfLife` (s). */
export const damp = (a: number, b: number, halfLife: number, dt: number) =>
  halfLife <= 0 ? b : lerp(a, b, 1 - Math.pow(2, -dt / halfLife));
/** Diferença angular em (-PI, PI]. */
export const angleDiff = (a: number, b: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
};
export const dampAngle = (a: number, b: number, halfLife: number, dt: number) =>
  a + angleDiff(a, b) * (halfLife <= 0 ? 1 : 1 - Math.pow(2, -dt / halfLife));
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
