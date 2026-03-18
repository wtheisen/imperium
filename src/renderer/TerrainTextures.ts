import * as THREE from 'three';
import { TerrainType } from '../map/MapManager';

// ── Noise utilities (kept for border blending) ────────────────────────

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function noise2d(x: number, y: number, seed: number): number {
  const rng = seededRandom(Math.floor(x * 73856093 + y * 19349663 + seed) & 0x7fffffff);
  return rng();
}

function smoothNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = noise2d(ix, iy, seed);
  const n10 = noise2d(ix + 1, iy, seed);
  const n01 = noise2d(ix, iy + 1, seed);
  const n11 = noise2d(ix + 1, iy + 1, seed);
  return (n00 + (n10 - n00) * sx) + ((n01 + (n11 - n01) * sx) - (n00 + (n10 - n00) * sx)) * sy;
}

function fbm(x: number, y: number, octaves: number, seed: number): number {
  let value = 0, amplitude = 0.5, frequency = 1, total = 0;
  for (let i = 0; i < octaves; i++) {
    value += smoothNoise(x * frequency, y * frequency, seed + i * 1000) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / total;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ── LPC tile image data ───────────────────────────────────────────────

const TILE_PX = 32; // pixels per tile in the tileset
const NUM_TERRAIN_TYPES = 8;

/**
 * Loaded tile pixel data. Each terrain type (indexed by TerrainType enum value)
 * has a Uint8ClampedArray of RGBA pixel data (32x32 = 4096 bytes).
 */
let tilePixels: Uint8ClampedArray[] | null = null;

/** Load the LPC terrain tileset strip and extract per-tile pixel data. */
export function loadTerrainTileset(): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      tilePixels = [];
      for (let i = 0; i < NUM_TERRAIN_TYPES; i++) {
        const data = ctx.getImageData(i * TILE_PX, 0, TILE_PX, TILE_PX);
        tilePixels.push(data.data);
      }
      resolve();
    };
    img.onerror = () => reject(new Error('Failed to load terrain-tiles.png'));
    // Vite serves files from public/ at root
    img.src = 'sprites/terrain-tiles.png';
  });
}

/**
 * Sample a pixel from the loaded tile image for a terrain type.
 * Uses tiling (modulo) so the 32x32 texture repeats across the map.
 */
function sampleTilePixel(terrainType: number, wx: number, wy: number): [number, number, number] {
  if (!tilePixels || terrainType < 0 || terrainType >= tilePixels.length) {
    return [128, 128, 128]; // gray fallback
  }
  const pixels = tilePixels[terrainType];
  // Map world coords to pixel coords within the 32x32 tile (repeating)
  const px = ((Math.floor(wx * TILE_PX) % TILE_PX) + TILE_PX) % TILE_PX;
  const py = ((Math.floor(wy * TILE_PX) % TILE_PX) + TILE_PX) % TILE_PX;
  const idx = (py * TILE_PX + px) * 4;
  return [pixels[idx], pixels[idx + 1], pixels[idx + 2]];
}

/** Sample terrain color — uses loaded tile images if available, else procedural fallback. */
export function sampleTerrainColor(terrainType: number, wx: number, wy: number): [number, number, number] {
  if (tilePixels) {
    return sampleTilePixel(terrainType, wx, wy);
  }
  // Procedural fallback (used before tileset loads)
  return sampleProceduralColor(terrainType, wx, wy);
}

// ── Procedural fallback colors (simple, fast) ─────────────────────────

function sampleProceduralColor(terrainType: number, wx: number, wy: number): [number, number, number] {
  const n = fbm(wx * 6, wy * 6, 3, terrainType * 10000);
  switch (terrainType) {
    case TerrainType.GRASS:      return [clamp(55 + n * 30, 0, 255), clamp(95 + n * 40, 0, 255), clamp(40 + n * 15, 0, 255)];
    case TerrainType.WATER:      return [clamp(20 + n * 15, 0, 255), clamp(45 + n * 25, 0, 255), clamp(80 + n * 40, 0, 255)];
    case TerrainType.GOLD_MINE:  return [clamp(140 + n * 40, 0, 255), clamp(120 + n * 30, 0, 255), clamp(50 + n * 15, 0, 255)];
    case TerrainType.STONE:      return [clamp(95 + n * 40, 0, 255), clamp(92 + n * 40, 0, 255), clamp(90 + n * 40, 0, 255)];
    case TerrainType.DIRT:       return [clamp(110 + n * 30, 0, 255), clamp(85 + n * 20, 0, 255), clamp(55 + n * 15, 0, 255)];
    case TerrainType.FOREST:     return [clamp(25 + n * 20, 0, 255), clamp(55 + n * 35, 0, 255), clamp(20 + n * 15, 0, 255)];
    case TerrainType.METAL_FLOOR: return [clamp(60 + n * 15, 0, 255), clamp(62 + n * 15, 0, 255), clamp(65 + n * 18, 0, 255)];
    case TerrainType.HULL_WALL:  return [clamp(40 + n * 12, 0, 255), clamp(42 + n * 12, 0, 255), clamp(48 + n * 14, 0, 255)];
    default:                     return [clamp(55 + n * 30, 0, 255), clamp(95 + n * 40, 0, 255), clamp(40 + n * 15, 0, 255)];
  }
}

// ── Blended map texture generation ────────────────────────────────────

const BLEND_WIDTH = 0.38;
const SHARP_TYPES = new Set([TerrainType.HULL_WALL, TerrainType.METAL_FLOOR]);

function smoothstep(lo: number, hi: number, t: number): number {
  const x = clamp((t - lo) / (hi - lo), 0, 1);
  return x * x * (3 - 2 * x);
}

/**
 * Generate a single blended terrain texture covering the entire map.
 * Samples from loaded LPC tile images (or procedural fallback).
 * Terrain types blend smoothly at tile borders with noise-modulated edges.
 */
export function generateBlendedMapTexture(
  terrainGrid: TerrainType[][],
  mapWidth: number,
  mapHeight: number,
  resolution = 32
): THREE.CanvasTexture {
  const w = mapWidth * resolution;
  const h = mapHeight * resolution;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(w, h);
  const d = imageData.data;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const idx = (py * w + px) * 4;

      const wx = px / resolution;
      const wy = py / resolution;
      const tx = Math.floor(wx);
      const ty = Math.floor(wy);
      const fx = wx - tx;
      const fy = wy - ty;

      const ctxType = tx >= 0 && tx < mapWidth && ty >= 0 && ty < mapHeight
        ? terrainGrid[ty][tx]
        : TerrainType.GRASS;

      const isSharp = SHARP_TYPES.has(ctxType);
      const [cr, cg, cb] = sampleTerrainColor(ctxType, wx, wy);

      if (isSharp) {
        d[idx] = cr; d[idx + 1] = cg; d[idx + 2] = cb; d[idx + 3] = 255;
        continue;
      }

      const borderNoise = fbm(wx * 4, wy * 4, 2, 77777) * 0.12;

      let r = cr, g = cg, b = cb;
      let totalWeight = 1.0;

      // Cardinal neighbor blending
      const edges: [number, number, number][] = [
        [tx - 1, ty, fx],
        [tx + 1, ty, 1 - fx],
        [tx, ty - 1, fy],
        [tx, ty + 1, 1 - fy],
      ];

      for (const [nx, ny, dist] of edges) {
        if (nx < 0 || nx >= mapWidth || ny < 0 || ny >= mapHeight) continue;
        const nType = terrainGrid[ny][nx];
        if (nType === ctxType || SHARP_TYPES.has(nType)) continue;

        const adjustedDist = dist + borderNoise;
        if (adjustedDist >= BLEND_WIDTH) continue;

        const w2 = 1 - smoothstep(0, BLEND_WIDTH, adjustedDist);
        const [nr, ng, nb] = sampleTerrainColor(nType, wx, wy);
        r += nr * w2; g += ng * w2; b += nb * w2;
        totalWeight += w2;
      }

      // Diagonal neighbor blending (weaker)
      const corners: [number, number, number][] = [
        [tx - 1, ty - 1, Math.sqrt(fx * fx + fy * fy)],
        [tx + 1, ty - 1, Math.sqrt((1 - fx) * (1 - fx) + fy * fy)],
        [tx - 1, ty + 1, Math.sqrt(fx * fx + (1 - fy) * (1 - fy))],
        [tx + 1, ty + 1, Math.sqrt((1 - fx) * (1 - fx) + (1 - fy) * (1 - fy))],
      ];

      for (const [nx, ny, dist] of corners) {
        if (nx < 0 || nx >= mapWidth || ny < 0 || ny >= mapHeight) continue;
        const nType = terrainGrid[ny][nx];
        if (nType === ctxType || SHARP_TYPES.has(nType)) continue;

        const adjustedDist = dist * 0.7 + borderNoise;
        if (adjustedDist >= BLEND_WIDTH) continue;

        const w2 = (1 - smoothstep(0, BLEND_WIDTH, adjustedDist)) * 0.5;
        const [nr, ng, nb] = sampleTerrainColor(nType, wx, wy);
        r += nr * w2; g += ng * w2; b += nb * w2;
        totalWeight += w2;
      }

      d[idx] = clamp(r / totalWeight, 0, 255);
      d[idx + 1] = clamp(g / totalWeight, 0, 255);
      d[idx + 2] = clamp(b / totalWeight, 0, 255);
      d[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

// ── Water texture (kept for water overlay mesh) ───────────────────────

const TEX_SIZE = 128;

function generateWaterTexture(seed: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
  const d = imageData.data;

  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const idx = (y * TEX_SIZE + x) * 4;
      const nx = x / TEX_SIZE;
      const ny = y / TEX_SIZE;
      const n = fbm(nx * 5, ny * 5, 4, seed);
      const ripple = Math.sin(nx * 25 + n * 8) * Math.cos(ny * 20 + n * 6) * 0.5 + 0.5;
      d[idx] = clamp(20 + n * 15 + ripple * 10, 0, 255);
      d[idx + 1] = clamp(45 + n * 25 + ripple * 15, 0, 255);
      d[idx + 2] = clamp(80 + n * 40 + ripple * 25, 0, 255);
      d[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Terrain texture cache — kept for water overlay tiles */
export class TerrainTextures {
  private textures = new Map<string, THREE.CanvasTexture>();

  getWaterTexture(seed = 10000): THREE.CanvasTexture {
    const key = `water-${seed}`;
    if (!this.textures.has(key)) {
      const canvas = generateWaterTexture(seed);
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      this.textures.set(key, tex);
    }
    return this.textures.get(key)!;
  }

  dispose(): void {
    for (const tex of this.textures.values()) {
      tex.dispose();
    }
    this.textures.clear();
  }
}
