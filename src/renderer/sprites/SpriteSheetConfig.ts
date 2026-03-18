import * as THREE from 'three';

/** Animation names for sprite sheets. */
export type SpriteAnimName = 'idle' | 'walk' | 'attack' | 'death';

/** Definition of a single animation within a sprite sheet. */
export interface SpriteAnimDef {
  startCol: number;
  frameCount: number;
  /** Milliseconds per frame. */
  frameDuration: number;
  loop: boolean;
}

/** Configuration for a unit's sprite sheet atlas. */
export interface SpriteSheetConfig {
  unitType: string;
  texture: THREE.Texture;
  /** Total columns in atlas. */
  columns: number;
  /** Total rows in atlas (8 directions). */
  rows: number;
  /** Pixel width of a single frame. */
  frameWidth: number;
  /** Pixel height of a single frame. */
  frameHeight: number;
  /** Animation definitions keyed by name. */
  animations: Record<SpriteAnimName, SpriteAnimDef>;
  /** World-space height of the billboard quad. */
  worldHeight: number;
}

/** Infantry unit types that use sprites instead of 3D meshes. */
export const SPRITE_UNIT_TYPES = new Set<string>([
  'marine',
  'guardsman',
  'scout',
  'servitor',
  'ork_boy',
  'ork_shoota',
  'ork_nob',
  'ogryn',
  'techmarine',
]);

/** Building types that use sprites instead of 3D meshes. */
export const SPRITE_BUILDING_TYPES = new Set<string>([
  'drop_ship',
  'barracks',
  'tarantula',
  'aegis',
]);

/**
 * Convert an entity's facing (radians) and the camera's azimuth (radians)
 * into one of 8 direction indices.
 * 0=S (facing camera), 1=SW, 2=W, 3=NW, 4=N, 5=NE, 6=E, 7=SE.
 */
export function facingToDirection8(entityFacing: number, cameraAzimuth: number): number {
  // Relative angle: how entity faces relative to camera
  let rel = entityFacing - cameraAzimuth;
  // Normalize to [0, 2π)
  rel = ((rel % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  // Quantize to 8 directions (each sector = π/4)
  const index = Math.round(rel / (Math.PI / 4)) % 8;
  return index;
}
