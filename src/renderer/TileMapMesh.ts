import * as THREE from 'three';
import { MAP_WIDTH, MAP_HEIGHT } from '../config';
import { TerrainType } from '../map/MapManager';
import { TerrainTextures } from './TerrainTextures';

const TILE_3D_SIZE = 1;
const TILE_3D_HEIGHT = 0.15;
const FOREST_HEIGHT = TILE_3D_HEIGHT * 3;

/** Simple seeded pseudo-random */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Value noise at a point */
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
  let value = 0, amplitude = 0.5, frequency = 1, total = 0;
  for (let i = 0; i < octaves; i++) {
    value += smoothNoise(x * frequency, y * frequency, seed + i * 1000) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / total;
}

/** Per-terrain-type material properties */
const TERRAIN_MATERIALS: Record<number, { roughness: number; metalness: number; transparent?: boolean; opacity?: number }> = {
  [TerrainType.GRASS]:     { roughness: 0.92, metalness: 0.0 },
  [TerrainType.WATER]:     { roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 },
  [TerrainType.GOLD_MINE]: { roughness: 0.6,  metalness: 0.35 },
  [TerrainType.STONE]:     { roughness: 0.8,  metalness: 0.05 },
  [TerrainType.DIRT]:      { roughness: 0.95, metalness: 0.0 },
  [TerrainType.FOREST]:      { roughness: 0.88, metalness: 0.0 },
  [TerrainType.METAL_FLOOR]: { roughness: 0.4,  metalness: 0.6 },
  [TerrainType.HULL_WALL]:   { roughness: 0.5,  metalness: 0.5 },
};

/** Height ranges per terrain type: [min, max] */
const HEIGHT_RANGES: Record<number, [number, number]> = {
  [TerrainType.GRASS]:     [0.0,   0.12],
  [TerrainType.STONE]:     [0.05,  0.2],
  [TerrainType.DIRT]:      [0.0,   0.08],
  [TerrainType.GOLD_MINE]: [0.05,  0.12],
  [TerrainType.FOREST]:    [0.0,   0.1],
  [TerrainType.WATER]:       [-0.12, -0.08],
  [TerrainType.METAL_FLOOR]: [0.0, 0.0],
  [TerrainType.HULL_WALL]:   [0.3, 0.4],
};

/**
 * Builds a 3D tile grid using merged geometry for performance.
 * Tiles are batched by terrain type + texture variant into a small
 * number of merged meshes (draw calls), not one mesh per tile.
 *
 * Individual tile references are kept for fog color tinting.
 */
export class TileMapMesh {
  readonly group = new THREE.Group();
  /** Per-tile data for fog tinting: [y][x] = { mesh, vertexStart, vertexCount } */
  private tileRefs: (TileRef | null)[][] = [];
  private terrainTextures: TerrainTextures;
  private mergedMeshes: THREE.Mesh[] = [];

  /** Height map: [y][x] = elevation Y offset */
  private heightMap: number[][] = [];
  private terrainGrid: TerrainType[][] = [];

  /** Water materials tracked separately for animation */
  private waterMaterials: THREE.MeshStandardMaterial[] = [];
  private waterTextures: THREE.Texture[] = [];

  constructor(terrainGrid: TerrainType[][]) {
    this.terrainGrid = terrainGrid;
    this.terrainTextures = new TerrainTextures();
    this.buildHeightMap(terrainGrid);
    this.buildGrid(terrainGrid);
  }

  /** Compute elevation noise for rolling hills */
  private buildHeightMap(terrain: TerrainType[][]): void {
    const seed = 42;
    for (let y = 0; y < MAP_HEIGHT; y++) {
      this.heightMap[y] = [];
      for (let x = 0; x < MAP_WIDTH; x++) {
        const terrainType = terrain[y]?.[x] ?? TerrainType.GRASS;
        const range = HEIGHT_RANGES[terrainType] ?? [0, 0.1];

        // Low-frequency fbm for smooth rolling hills
        const n = fbm(x / 4, y / 4, 3, seed);
        this.heightMap[y][x] = range[0] + n * (range[1] - range[0]);
      }
    }
  }

  /** Get the elevation Y value at integer tile coords */
  getHeightAtTile(tileX: number, tileY: number): number {
    if (tileY < 0 || tileY >= MAP_HEIGHT || tileX < 0 || tileX >= MAP_WIDTH) return 0;
    return this.heightMap[tileY][tileX];
  }

  /** Get interpolated height at fractional world position */
  getHeightAt(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;

    const h00 = this.getHeightAtTile(ix, iy);
    const h10 = this.getHeightAtTile(ix + 1, iy);
    const h01 = this.getHeightAtTile(ix, iy + 1);
    const h11 = this.getHeightAtTile(ix + 1, iy + 1);

    // Bilinear interpolation
    const hx0 = h00 + (h10 - h00) * fx;
    const hx1 = h01 + (h11 - h01) * fx;
    return hx0 + (hx1 - hx0) * fy;
  }

  /** Expose height map for decorations */
  getHeightMap(): number[][] {
    return this.heightMap;
  }

  /** Expose terrain grid for decorations */
  getTerrainGrid(): TerrainType[][] {
    return this.terrainGrid;
  }

  private buildGrid(terrain: TerrainType[][]): void {
    // Group tiles by material key (terrainType + variant)
    const buckets = new Map<string, { terrainType: number; positions: { x: number; y: number; yOff: number; h: number }[] }>();

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const terrainType = terrain[y]?.[x] ?? TerrainType.GRASS;
        const variant = ((x * 7 + y * 13) & 0x7fffffff) % 8;
        const key = `${terrainType}-${variant}`;

        if (!buckets.has(key)) {
          buckets.set(key, { terrainType, positions: [] });
        }

        // Use height map for Y offset
        const heightY = this.heightMap[y][x];
        let yOff = heightY;
        let h = TILE_3D_HEIGHT;
        if (terrainType === TerrainType.FOREST) {
          h = FOREST_HEIGHT;
        }

        buckets.get(key)!.positions.push({ x, y, yOff, h });
      }
    }

    // Init tileRefs grid
    for (let y = 0; y < MAP_HEIGHT; y++) {
      this.tileRefs[y] = new Array(MAP_WIDTH).fill(null);
    }

    // Build one merged mesh per bucket
    for (const [key, bucket] of buckets) {
      const { terrainType, positions } = bucket;
      const variant = parseInt(key.split('-')[1]);

      const texture = this.terrainTextures.getTexture(terrainType, variant * 7, variant * 13);
      const matProps = TERRAIN_MATERIALS[terrainType] ?? { roughness: 0.85, metalness: 0.05 };
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: matProps.roughness,
        metalness: matProps.metalness,
        vertexColors: true,
        transparent: matProps.transparent ?? false,
        opacity: matProps.opacity ?? 1.0,
      });

      // Track water materials for animation
      if (terrainType === TerrainType.WATER) {
        this.waterMaterials.push(material);
        this.waterTextures.push(texture);
      }

      // Build merged BufferGeometry from box tiles
      const tileCount = positions.length;
      const w = TILE_3D_SIZE * 0.97;

      const verticesPerTile = 36; // non-indexed box
      const totalVerts = tileCount * verticesPerTile;
      const posArr = new Float32Array(totalVerts * 3);
      const normArr = new Float32Array(totalVerts * 3);
      const uvArr = new Float32Array(totalVerts * 2);
      const colArr = new Float32Array(totalVerts * 3); // vertex colors for fog tinting

      // Reference box geometry to extract face data
      const refGeo = new THREE.BoxGeometry(w, TILE_3D_HEIGHT, w);
      const refNonIndexed = refGeo.toNonIndexed();
      const refPos = refNonIndexed.getAttribute('position').array as Float32Array;
      const refNorm = refNonIndexed.getAttribute('normal').array as Float32Array;
      const refUv = refNonIndexed.getAttribute('uv').array as Float32Array;
      refGeo.dispose();
      refNonIndexed.dispose();

      // For forest tiles, we need a taller box
      let refForestPos: Float32Array | null = null;
      if (terrainType === TerrainType.FOREST) {
        const fGeo = new THREE.BoxGeometry(w, FOREST_HEIGHT, w).toNonIndexed();
        refForestPos = fGeo.getAttribute('position').array as Float32Array;
        fGeo.dispose();
      }

      for (let i = 0; i < tileCount; i++) {
        const { x, y, yOff } = positions[i];
        const vStart = i * verticesPerTile;
        const usePos = (terrainType === TerrainType.FOREST && refForestPos) ? refForestPos : refPos;

        for (let v = 0; v < verticesPerTile; v++) {
          const si = v * 3;
          const di = (vStart + v) * 3;
          posArr[di]     = usePos[si]     + x;
          posArr[di + 1] = usePos[si + 1] + yOff;
          posArr[di + 2] = usePos[si + 2] + y;

          normArr[di]     = refNorm[si];
          normArr[di + 1] = refNorm[si + 1];
          normArr[di + 2] = refNorm[si + 2];

          // Vertex colors default to white (no tint)
          colArr[di]     = 1;
          colArr[di + 1] = 1;
          colArr[di + 2] = 1;

          const ui = v * 2;
          const dui = (vStart + v) * 2;
          uvArr[dui]     = refUv[ui];
          uvArr[dui + 1] = refUv[ui + 1];
        }

        // Store tile ref
        this.tileRefs[y][x] = { meshIndex: this.mergedMeshes.length, vertexStart: vStart, vertexCount: verticesPerTile };
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
      geometry.setAttribute('color', new THREE.BufferAttribute(colArr, 3));

      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.mergedMeshes.push(mesh);
    }
  }

  /** Animate water UV scrolling */
  animateWater(deltaMs: number): void {
    const dt = deltaMs / 1000;
    for (const tex of this.waterTextures) {
      tex.offset.x += 0.0003 * dt;
      tex.offset.y += 0.0002 * dt;
    }
  }

  /** Set the vertex color tint for a tile (used by FogRenderer). */
  setTileColor(tileX: number, tileY: number, r: number, g: number, b: number): void {
    const ref = this.tileRefs[tileY]?.[tileX];
    if (!ref) return;
    const mesh = this.mergedMeshes[ref.meshIndex];
    const colorAttr = mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    const arr = colorAttr.array as Float32Array;

    for (let v = 0; v < ref.vertexCount; v++) {
      const idx = (ref.vertexStart + v) * 3;
      arr[idx] = r;
      arr[idx + 1] = g;
      arr[idx + 2] = b;
    }
    colorAttr.needsUpdate = true;
  }

  /** Legacy compat — returns null since tiles are merged. */
  getTileMesh(_tileX: number, _tileY: number): THREE.Mesh | null {
    return null;
  }

  dispose(): void {
    for (const mesh of this.mergedMeshes) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.terrainTextures.dispose();
  }
}

interface TileRef {
  meshIndex: number;
  vertexStart: number;
  vertexCount: number;
}
