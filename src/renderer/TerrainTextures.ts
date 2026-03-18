import * as THREE from 'three';
import { TerrainType } from '../map/MapManager';

// ── Noise utilities (for border blending only) ───────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

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

// ── LPC tile image data ───────────────────────────────────────────────

const TILE_PX = 32;
const NUM_TERRAIN_TYPES = 8;

/** Per-terrain-type canvases (32x32 each) for fast drawImage stamping */
let tileCanvases: HTMLCanvasElement[] | null = null;
/** Per-terrain-type pixel data for per-pixel border blending */
let tilePixels: Uint8ClampedArray[] | null = null;

/** Load the LPC terrain tileset strip and extract per-tile data. */
export function loadTerrainTileset(): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = img.width;
      srcCanvas.height = img.height;
      const srcCtx = srcCanvas.getContext('2d')!;
      srcCtx.drawImage(img, 0, 0);

      tileCanvases = [];
      tilePixels = [];
      for (let i = 0; i < NUM_TERRAIN_TYPES; i++) {
        // Extract pixel data
        const data = srcCtx.getImageData(i * TILE_PX, 0, TILE_PX, TILE_PX);
        tilePixels.push(data.data);

        // Create a small canvas for this tile (for fast drawImage stamping)
        const tc = document.createElement('canvas');
        tc.width = TILE_PX;
        tc.height = TILE_PX;
        const tctx = tc.getContext('2d')!;
        tctx.putImageData(data, 0, 0);
        tileCanvases.push(tc);
      }
      resolve();
    };
    img.onerror = () => reject(new Error('Failed to load terrain-tiles.png'));
    img.src = 'sprites/terrain-tiles.png';
  });
}

/** Sample a pixel from the loaded tile image (with tiling). */
function sampleTilePixel(terrainType: number, wx: number, wy: number): [number, number, number] {
  if (!tilePixels || terrainType < 0 || terrainType >= tilePixels.length) {
    return [128, 128, 128];
  }
  const pixels = tilePixels[terrainType];
  const px = ((Math.floor(wx * TILE_PX) % TILE_PX) + TILE_PX) % TILE_PX;
  const py = ((Math.floor(wy * TILE_PX) % TILE_PX) + TILE_PX) % TILE_PX;
  const idx = (py * TILE_PX + px) * 4;
  return [pixels[idx], pixels[idx + 1], pixels[idx + 2]];
}

// ── Blended map texture generation ────────────────────────────────────

const BLEND_WIDTH = 0.35;
const SHARP_TYPES = new Set([TerrainType.HULL_WALL, TerrainType.METAL_FLOOR]);

function smoothstep(lo: number, hi: number, t: number): number {
  const x = clamp((t - lo) / (hi - lo), 0, 1);
  return x * x * (3 - 2 * x);
}

/**
 * Generate the blended map texture.
 *
 * Fast path (tile images loaded):
 *   1. Stamp each tile's 32x32 image onto the canvas via drawImage (GPU-fast)
 *   2. Only do per-pixel blending in narrow border strips between different terrain types
 *
 * Slow path (fallback before images load):
 *   Simple flat colors per tile, no per-pixel noise.
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

  if (tileCanvases && tilePixels) {
    // ── Fast path: stamp tiles then blend borders ──────────────────

    // Step 1: Stamp all tiles using drawImage (very fast)
    for (let ty = 0; ty < mapHeight; ty++) {
      for (let tx = 0; tx < mapWidth; tx++) {
        const terrainType = terrainGrid[ty]?.[tx] ?? TerrainType.GRASS;
        const tileCanvas = tileCanvases[terrainType] ?? tileCanvases[0];
        // Draw the 32x32 tile scaled to `resolution x resolution`
        ctx.drawImage(tileCanvas, 0, 0, TILE_PX, TILE_PX,
          tx * resolution, ty * resolution, resolution, resolution);
      }
    }

    // Step 2: Per-pixel blending only at borders between different terrain types
    // Find which tiles have a neighbor with a different type
    const borderTiles: { tx: number; ty: number }[] = [];
    for (let ty = 0; ty < mapHeight; ty++) {
      for (let tx = 0; tx < mapWidth; tx++) {
        const ct = terrainGrid[ty][tx];
        if (SHARP_TYPES.has(ct)) continue;
        let hasDifferentNeighbor = false;
        for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nx = tx + dx, ny = ty + dy;
          if (nx >= 0 && nx < mapWidth && ny >= 0 && ny < mapHeight) {
            if (terrainGrid[ny][nx] !== ct && !SHARP_TYPES.has(terrainGrid[ny][nx])) {
              hasDifferentNeighbor = true;
              break;
            }
          }
        }
        if (hasDifferentNeighbor) borderTiles.push({ tx, ty });
      }
    }

    // Only process border tile pixels
    if (borderTiles.length > 0) {
      const imageData = ctx.getImageData(0, 0, w, h);
      const d = imageData.data;

      for (const { tx, ty } of borderTiles) {
        const ctxType = terrainGrid[ty][tx];
        const startPx = tx * resolution;
        const startPy = ty * resolution;

        for (let ly = 0; ly < resolution; ly++) {
          for (let lx = 0; lx < resolution; lx++) {
            const px = startPx + lx;
            const py = startPy + ly;
            const fx = lx / resolution; // 0..1 within tile
            const fy = ly / resolution;

            // Quick check: is this pixel near any border?
            const minEdgeDist = Math.min(fx, 1 - fx, fy, 1 - fy);
            if (minEdgeDist >= BLEND_WIDTH) continue; // interior pixel, skip

            const wx = px / resolution;
            const wy = py / resolution;
            const borderNoise = fbm(wx * 4, wy * 4, 2, 77777) * 0.1;

            const [cr, cg, cb] = sampleTilePixel(ctxType, wx, wy);
            let r = cr, g = cg, b = cb;
            let totalWeight = 1.0;

            // Cardinal blending
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
              const ad = dist + borderNoise;
              if (ad >= BLEND_WIDTH) continue;
              const bw = 1 - smoothstep(0, BLEND_WIDTH, ad);
              const [nr, ng, nb] = sampleTilePixel(nType, wx, wy);
              r += nr * bw; g += ng * bw; b += nb * bw;
              totalWeight += bw;
            }

            const idx = (py * w + px) * 4;
            d[idx] = clamp(r / totalWeight, 0, 255);
            d[idx + 1] = clamp(g / totalWeight, 0, 255);
            d[idx + 2] = clamp(b / totalWeight, 0, 255);
            // alpha stays 255
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
    }
  } else {
    // ── Fallback: flat colors per tile (instant, no noise) ─────────
    const FALLBACK_COLORS: Record<number, string> = {
      [TerrainType.GRASS]:       '#4a6b30',
      [TerrainType.WATER]:       '#1a4060',
      [TerrainType.GOLD_MINE]:   '#8a7040',
      [TerrainType.STONE]:       '#707070',
      [TerrainType.DIRT]:        '#6e5535',
      [TerrainType.FOREST]:      '#2a4520',
      [TerrainType.METAL_FLOOR]: '#404448',
      [TerrainType.HULL_WALL]:   '#2a2c32',
    };

    for (let ty = 0; ty < mapHeight; ty++) {
      for (let tx = 0; tx < mapWidth; tx++) {
        const terrainType = terrainGrid[ty]?.[tx] ?? TerrainType.GRASS;
        ctx.fillStyle = FALLBACK_COLORS[terrainType] ?? FALLBACK_COLORS[TerrainType.GRASS];
        ctx.fillRect(tx * resolution, ty * resolution, resolution, resolution);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
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
    for (const tex of this.textures.values()) tex.dispose();
    this.textures.clear();
  }
}
