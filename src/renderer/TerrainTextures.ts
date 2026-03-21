import * as THREE from 'three';
import { TerrainType } from '../map/MapManager';
import { fbm } from '../utils/MathUtils';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ── LPC tile image data ───────────────────────────────────────────────

const TILE_PX = 32;
const NUM_PNG_TILES = 8;
const NUM_TERRAIN_TYPES = 12;

/** Per-terrain-type canvases (32x32 each) for fast drawImage stamping */
let tileCanvases: HTMLCanvasElement[] | null = null;
/** Per-terrain-type pixel data for per-pixel border blending */
let tilePixels: Uint8ClampedArray[] | null = null;

/** Generate a procedural 32x32 tile canvas for new terrain types */
function generateProceduralTile(terrainType: TerrainType): { canvas: HTMLCanvasElement; pixels: Uint8ClampedArray } {
  const canvas = document.createElement('canvas');
  canvas.width = TILE_PX;
  canvas.height = TILE_PX;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(TILE_PX, TILE_PX);
  const d = imageData.data;

  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const idx = (y * TILE_PX + x) * 4;
      const nx = x / TILE_PX;
      const ny = y / TILE_PX;

      let r: number, g: number, b: number;

      switch (terrainType) {
        case TerrainType.LAVA: {
          // Dark crust with bright orange/red veins
          const n = fbm(nx * 6, ny * 6, 3, 55555);
          const vein = Math.pow(Math.max(0, n - 0.3) * 2.5, 0.5);
          r = clamp(40 + vein * 215, 0, 255);
          g = clamp(15 + vein * 120, 0, 255);
          b = clamp(10 + vein * 20, 0, 255);
          break;
        }
        case TerrainType.ICE: {
          // White-blue with subtle cracks
          const n = fbm(nx * 5, ny * 5, 3, 66666);
          const crack = Math.abs(n - 0.5) < 0.03 ? 0.6 : 1.0;
          r = clamp((180 + n * 40) * crack, 0, 255);
          g = clamp((195 + n * 35) * crack, 0, 255);
          b = clamp((220 + n * 30) * crack, 0, 255);
          break;
        }
        case TerrainType.SAND: {
          // Tan/yellow with subtle grain
          const n = fbm(nx * 8, ny * 8, 2, 77777);
          r = clamp(190 + n * 30, 0, 255);
          g = clamp(165 + n * 25, 0, 255);
          b = clamp(110 + n * 20, 0, 255);
          break;
        }
        case TerrainType.RUBBLE: {
          // Gray concrete/rubble with debris variation
          const n = fbm(nx * 7, ny * 7, 3, 88888);
          const detail = fbm(nx * 15, ny * 15, 2, 88889);
          r = clamp(95 + n * 40 + detail * 15, 0, 255);
          g = clamp(90 + n * 35 + detail * 12, 0, 255);
          b = clamp(85 + n * 30 + detail * 10, 0, 255);
          break;
        }
        default:
          r = 128; g = 128; b = 128;
      }

      d[idx] = r;
      d[idx + 1] = g;
      d[idx + 2] = b;
      d[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return { canvas, pixels: imageData.data };
}

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

      // Extract tiles from the PNG strip (first 8)
      for (let i = 0; i < NUM_PNG_TILES; i++) {
        const data = srcCtx.getImageData(i * TILE_PX, 0, TILE_PX, TILE_PX);
        tilePixels.push(data.data);

        const tc = document.createElement('canvas');
        tc.width = TILE_PX;
        tc.height = TILE_PX;
        const tctx = tc.getContext('2d')!;
        tctx.putImageData(data, 0, 0);
        tileCanvases.push(tc);
      }

      // Generate procedural tiles for new terrain types (8-11)
      const newTypes = [TerrainType.LAVA, TerrainType.ICE, TerrainType.SAND, TerrainType.RUBBLE];
      for (const tt of newTypes) {
        const { canvas, pixels } = generateProceduralTile(tt);
        tileCanvases.push(canvas);
        tilePixels.push(pixels);
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
      [TerrainType.LAVA]:        '#8a2010',
      [TerrainType.ICE]:         '#b8c8dd',
      [TerrainType.SAND]:        '#bea870',
      [TerrainType.RUBBLE]:      '#6a6560',
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
