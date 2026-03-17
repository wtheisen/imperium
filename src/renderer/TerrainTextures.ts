import * as THREE from 'three';

const TEX_SIZE = 128; // pixels per tile texture

/** Simple seeded pseudo-random for deterministic noise */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Value noise at a point (0-1 range) */
function noise2d(x: number, y: number, seed: number): number {
  const rng = seededRandom(Math.floor(x * 73856093 + y * 19349663 + seed) & 0x7fffffff);
  return rng();
}

/** Smooth interpolated noise */
function smoothNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  // Smoothstep
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const n00 = noise2d(ix, iy, seed);
  const n10 = noise2d(ix + 1, iy, seed);
  const n01 = noise2d(ix, iy + 1, seed);
  const n11 = noise2d(ix + 1, iy + 1, seed);

  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

/** Multi-octave fractal noise */
function fbm(x: number, y: number, octaves: number, seed: number): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
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

/** Generate an AoE2-style grass texture */
function generateGrassTexture(seed: number): HTMLCanvasElement {
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

      // Base green with fbm variation
      const n = fbm(nx * 6, ny * 6, 4, seed);
      const n2 = fbm(nx * 12, ny * 12, 3, seed + 500);

      // AoE2-style earthy green — not too saturated
      const baseR = 55 + n * 30 - 10;
      const baseG = 95 + n * 40 + n2 * 15;
      const baseB = 40 + n * 15;

      // Dirt patches
      const dirt = fbm(nx * 4, ny * 4, 3, seed + 200);
      const dirtMask = clamp((dirt - 0.45) * 5, 0, 1);

      const dirtR = 90 + n * 20;
      const dirtG = 75 + n * 15;
      const dirtB = 50 + n * 10;

      // Blend grass and dirt
      const r = baseR * (1 - dirtMask) + dirtR * dirtMask;
      const g = baseG * (1 - dirtMask) + dirtG * dirtMask;
      const b = baseB * (1 - dirtMask) + dirtB * dirtMask;

      // Fine grass detail — thin vertical streaks with directional bias
      const grassDetail = Math.sin(x * 1.5 + n2 * 20 + seed * 0.01) * 0.5 + 0.5;
      const detail = grassDetail * 8 * (1 - dirtMask);

      // Sparse wildflower colored dots
      let flowerR = 0, flowerG = 0, flowerB = 0;
      const flowerNoise = fbm(nx * 20, ny * 20, 2, seed + 1500);
      if (flowerNoise > 0.78 && dirtMask < 0.2) {
        const flowerType = Math.floor(flowerNoise * 100) % 3;
        if (flowerType === 0) { flowerR = 30; flowerG = -10; flowerB = -15; }  // red
        else if (flowerType === 1) { flowerR = 20; flowerG = 15; flowerB = -10; }  // yellow
        else { flowerR = -5; flowerG = -5; flowerB = 25; }  // blue
      }

      d[idx] = clamp(r + detail * 0.3 + flowerR, 0, 255);
      d[idx + 1] = clamp(g + detail + flowerG, 0, 255);
      d[idx + 2] = clamp(b + detail * 0.2 + flowerB, 0, 255);
      d[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Generate water texture — dark blue-green with ripple patterns */
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

      // Deep blue-green water
      d[idx] = clamp(20 + n * 15 + ripple * 10, 0, 255);
      d[idx + 1] = clamp(45 + n * 25 + ripple * 15, 0, 255);
      d[idx + 2] = clamp(80 + n * 40 + ripple * 25, 0, 255);
      d[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Generate gold mine texture — rocky with gold veins */
function generateGoldTexture(seed: number): HTMLCanvasElement {
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

      const n = fbm(nx * 6, ny * 6, 4, seed);
      const n2 = fbm(nx * 10, ny * 10, 3, seed + 300);

      // Rocky brown base
      const baseR = 85 + n * 30;
      const baseG = 75 + n * 25;
      const baseB = 55 + n * 15;

      // Gold veins
      const vein = fbm(nx * 8, ny * 8, 4, seed + 100);
      const veinMask = clamp((vein - 0.42) * 8, 0, 1);

      // Gold sparkle
      const sparkle = n2 > 0.7 ? (n2 - 0.7) * 10 : 0;

      const goldR = 210 + sparkle * 40;
      const goldG = 170 + sparkle * 30;
      const goldB = 40 + sparkle * 20;

      const r = baseR * (1 - veinMask) + goldR * veinMask;
      const g = baseG * (1 - veinMask) + goldG * veinMask;
      const b = baseB * (1 - veinMask) + goldB * veinMask;

      d[idx] = clamp(r, 0, 255);
      d[idx + 1] = clamp(g, 0, 255);
      d[idx + 2] = clamp(b, 0, 255);
      d[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Generate stone texture — gray rock with cracks */
function generateStoneTexture(seed: number): HTMLCanvasElement {
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

      const n = fbm(nx * 6, ny * 6, 5, seed);
      const crack = fbm(nx * 14, ny * 14, 3, seed + 400);
      const crackLine = clamp((crack - 0.48) * 15, 0, 1);

      // Gray stone
      const base = 100 + n * 50;
      const dark = base * (1 - crackLine * 0.6);

      // Lichen patches (greenish-yellow blotches)
      const lichen = fbm(nx * 9, ny * 9, 2, seed + 1200);
      const lichenMask = clamp((lichen - 0.6) * 6, 0, 1);
      const lichenR = -8 * lichenMask;
      const lichenG = 12 * lichenMask;
      const lichenB = -5 * lichenMask;

      d[idx] = clamp(dark - 5 + lichenR, 0, 255);
      d[idx + 1] = clamp(dark - 3 + lichenG, 0, 255);
      d[idx + 2] = clamp(dark + lichenB, 0, 255);
      d[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Generate dirt texture — dry brown earth with cracks */
function generateDirtTexture(seed: number): HTMLCanvasElement {
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

      const n = fbm(nx * 6, ny * 6, 4, seed);
      const n2 = fbm(nx * 10, ny * 10, 3, seed + 600);

      // Dry brown earth
      const baseR = 110 + n * 30;
      const baseG = 85 + n * 20;
      const baseB = 55 + n * 15;

      // Crack lines
      const crack = fbm(nx * 14, ny * 14, 3, seed + 700);
      const crackLine = clamp((crack - 0.46) * 12, 0, 1);

      const r = baseR * (1 - crackLine * 0.4) + n2 * 10;
      const g = baseG * (1 - crackLine * 0.4) + n2 * 6;
      const b = baseB * (1 - crackLine * 0.3) + n2 * 4;

      // Scattered pebble highlights
      const pebble = fbm(nx * 25, ny * 25, 2, seed + 1300);
      const pebbleHighlight = pebble > 0.72 ? (pebble - 0.72) * 60 : 0;

      d[idx] = clamp(r + pebbleHighlight, 0, 255);
      d[idx + 1] = clamp(g + pebbleHighlight * 0.8, 0, 255);
      d[idx + 2] = clamp(b + pebbleHighlight * 0.5, 0, 255);
      d[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Generate forest texture — dark green canopy with shadowed patches */
function generateForestTexture(seed: number): HTMLCanvasElement {
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
      const n2 = fbm(nx * 10, ny * 10, 3, seed + 800);

      // Dark green canopy
      const baseR = 25 + n * 20;
      const baseG = 55 + n * 35 + n2 * 15;
      const baseB = 20 + n * 15;

      // Shadow patches between trees
      const shadow = fbm(nx * 8, ny * 8, 3, seed + 900);
      const shadowMask = clamp((shadow - 0.4) * 4, 0, 1);

      const r = baseR * (1 - shadowMask * 0.5);
      const g = baseG * (1 - shadowMask * 0.3);
      const b = baseB * (1 - shadowMask * 0.4);

      // Trunk highlights
      const trunk = n2 > 0.75 ? (n2 - 0.75) * 8 : 0;

      // Leaf litter dots (brownish-orange scattered on floor)
      const leaf = fbm(nx * 18, ny * 18, 2, seed + 1400);
      let leafR = 0, leafG = 0, leafB = 0;
      if (leaf > 0.7) {
        const leafIntensity = (leaf - 0.7) * 40;
        leafR = leafIntensity * 1.5;
        leafG = leafIntensity * 0.6;
        leafB = -leafIntensity * 0.3;
      }

      d[idx] = clamp(r + trunk * 25 + leafR, 0, 255);
      d[idx + 1] = clamp(g + trunk * 10 + leafG, 0, 255);
      d[idx + 2] = clamp(b + trunk * 5 + leafB, 0, 255);
      d[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Generate metal floor texture — dark gunmetal with panel lines and rivets */
function generateMetalFloorTexture(seed: number): HTMLCanvasElement {
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

      const n = fbm(nx * 8, ny * 8, 4, seed);
      const scratch = fbm(nx * 20, ny * 20, 2, seed + 100);

      // Dark gunmetal base
      let r = 60 + n * 15 + scratch * 8;
      let g = 62 + n * 15 + scratch * 8;
      let b = 65 + n * 18 + scratch * 8;

      // Panel grid lines every ~16px
      const gridX = x % 32;
      const gridY = y % 32;
      if (gridX === 0 || gridX === 1 || gridY === 0 || gridY === 1) {
        r -= 15; g -= 15; b -= 12;
      }

      // Rivet dots at grid corners
      const rivetX = x % 32;
      const rivetY = y % 32;
      if ((rivetX >= 2 && rivetX <= 4) && (rivetY >= 2 && rivetY <= 4)) {
        r += 12; g += 12; b += 14;
      }

      // Rust stain patches
      const rust = fbm(nx * 5, ny * 5, 3, seed + 300);
      if (rust > 0.6) {
        const rustAmt = (rust - 0.6) * 50;
        r += rustAmt * 1.2;
        g += rustAmt * 0.4;
        b -= rustAmt * 0.3;
      }

      // Directional scratch noise
      const scratchLine = Math.sin(nx * 40 + n * 10) * 0.5 + 0.5;
      r += scratchLine * 3;
      g += scratchLine * 3;
      b += scratchLine * 4;

      d[idx] = clamp(r, 0, 255);
      d[idx + 1] = clamp(g, 0, 255);
      d[idx + 2] = clamp(b, 0, 255);
      d[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Generate hull wall texture — very dark steel with structural ribs */
function generateHullWallTexture(seed: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d')!;

  const imageData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
  const d = imageData.data;

  // Determine if this variant gets hazard stripes (~10%)
  const rng = seededRandom(seed + 9999);
  const hasHazard = rng() < 0.1;

  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const idx = (y * TEX_SIZE + x) * 4;
      const nx = x / TEX_SIZE;
      const ny = y / TEX_SIZE;

      const n = fbm(nx * 6, ny * 6, 4, seed);

      // Very dark steel base
      let r = 40 + n * 12;
      let g = 42 + n * 12;
      let b = 48 + n * 14;

      // Thick structural ribs every ~32px
      const ribX = x % 32;
      const ribY = y % 32;
      if (ribX < 3 || ribY < 3) {
        r += 8; g += 8; b += 10;
      }

      // Hazard stripes (yellow/black diagonal)
      if (hasHazard && y > TEX_SIZE * 0.4 && y < TEX_SIZE * 0.6) {
        const stripe = ((x + y) % 16) < 8;
        if (stripe) {
          r = 180; g = 150; b = 20;
        } else {
          r = 20; g = 20; b = 20;
        }
      }

      d[idx] = clamp(r, 0, 255);
      d[idx + 1] = clamp(g, 0, 255);
      d[idx + 2] = clamp(b, 0, 255);
      d[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Terrain texture cache — generates once, returns Three.js textures */
export class TerrainTextures {
  private textures = new Map<string, THREE.CanvasTexture>();

  /** Get a texture for a terrain type + tile position (position varies the seed for variety) */
  getTexture(terrainType: number, tileX: number, tileY: number): THREE.CanvasTexture {
    // Use a few texture variants per type (not unique per tile — that'd be too many)
    const variant = ((tileX * 7 + tileY * 13) & 0x7fffffff) % 8;
    const key = `${terrainType}-${variant}`;

    if (!this.textures.has(key)) {
      const seed = terrainType * 10000 + variant * 1000;
      let canvas: HTMLCanvasElement;

      switch (terrainType) {
        case 0: canvas = generateGrassTexture(seed); break;  // GRASS
        case 1: canvas = generateWaterTexture(seed); break;  // WATER
        case 2: canvas = generateGoldTexture(seed); break;   // GOLD_MINE
        case 3: canvas = generateStoneTexture(seed); break;  // STONE
        case 4: canvas = generateDirtTexture(seed); break;   // DIRT
        case 5: canvas = generateForestTexture(seed); break; // FOREST
        case 6: canvas = generateMetalFloorTexture(seed); break; // METAL_FLOOR
        case 7: canvas = generateHullWallTexture(seed); break;   // HULL_WALL
        default: canvas = generateGrassTexture(seed); break;
      }

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
