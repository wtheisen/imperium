/** Shared squad formation offsets used by EntityRenderer, VFXRenderer, etc. */
export const SQUAD_FORMATIONS: Record<number, { x: number; z: number }[]> = {
  2: [{ x: -0.25, z: 0 }, { x: 0.25, z: 0 }],
  3: [{ x: 0, z: -0.25 }, { x: -0.28, z: 0.18 }, { x: 0.28, z: 0.18 }],
  4: [{ x: -0.25, z: -0.25 }, { x: 0.25, z: -0.25 }, { x: -0.25, z: 0.25 }, { x: 0.25, z: 0.25 }],
  5: [{ x: 0, z: -0.3 }, { x: -0.3, z: -0.05 }, { x: 0.3, z: -0.05 }, { x: -0.18, z: 0.28 }, { x: 0.18, z: 0.28 }],
  6: [{ x: -0.22, z: -0.3 }, { x: 0.22, z: -0.3 }, { x: -0.35, z: 0 }, { x: 0.35, z: 0 }, { x: -0.22, z: 0.3 }, { x: 0.22, z: 0.3 }],
};
