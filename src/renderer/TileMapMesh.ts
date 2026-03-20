import * as THREE from 'three';
import { MAP_WIDTH, MAP_HEIGHT } from '../config';
import { TerrainType } from '../map/MapManager';
import { TerrainTextures, generateBlendedMapTexture, loadTerrainTileset } from './TerrainTextures';
import { fbm } from '../utils/MathUtils';

const TILE_3D_HEIGHT = 0.15;

/** Height ranges per terrain type: [min, max] */
const HEIGHT_RANGES: Record<number, [number, number]> = {
  [TerrainType.GRASS]:       [0.0,   0.12],
  [TerrainType.STONE]:       [0.05,  0.2],
  [TerrainType.DIRT]:        [0.0,   0.08],
  [TerrainType.GOLD_MINE]:   [0.05,  0.12],
  [TerrainType.FOREST]:      [0.0,   0.1],
  [TerrainType.WATER]:       [-0.12, -0.08],
  [TerrainType.METAL_FLOOR]: [0.0,   0.0],
  [TerrainType.HULL_WALL]:   [0.3,   0.4],
};

/**
 * Builds a seamless 3D terrain mesh using a single continuous plane
 * with per-vertex height displacement and a blended terrain texture.
 * No visible tile seams — terrain types blend organically at borders.
 */
export class TileMapMesh {
  readonly group = new THREE.Group();

  private terrainTextures: TerrainTextures;
  private terrainMesh: THREE.Mesh | null = null;
  private mapTexture: THREE.CanvasTexture | null = null;

  /** Water overlay mesh for UV-scroll animation */
  private waterMesh: THREE.Mesh | null = null;
  private waterTexture: THREE.Texture | null = null;

  /** Height map: [y][x] = elevation Y offset */
  private heightMap: number[][] = [];
  private terrainGrid: TerrainType[][] = [];

  /** Vertex stride for the plane: MAP_WIDTH + 1 vertices per row */
  private readonly stride = MAP_WIDTH + 1;

  constructor(terrainGrid: TerrainType[][]) {
    this.terrainGrid = terrainGrid;
    this.terrainTextures = new TerrainTextures();
    this.buildHeightMap(terrainGrid);
    this.buildTerrainMesh(terrainGrid);
    this.buildWaterOverlay(terrainGrid);

    // Load LPC tile images async, then regenerate the map texture
    loadTerrainTileset().then(() => {
      this.regenerateMapTexture();
    }).catch(() => {
      // Procedural fallback already applied — no action needed
    });
  }

  /** Regenerate the blended map texture (called after tile images load). */
  private regenerateMapTexture(): void {
    if (!this.terrainMesh) return;
    const oldTexture = this.mapTexture;
    this.mapTexture = generateBlendedMapTexture(this.terrainGrid, MAP_WIDTH, MAP_HEIGHT, 32);
    const mat = this.terrainMesh.material as THREE.MeshStandardMaterial;
    mat.map = this.mapTexture;
    mat.needsUpdate = true;
    if (oldTexture) oldTexture.dispose();
  }

  // ── Height map ──────────────────────────────────────────────────────

  private buildHeightMap(terrain: TerrainType[][]): void {
    const seed = 42;
    for (let y = 0; y < MAP_HEIGHT; y++) {
      this.heightMap[y] = [];
      for (let x = 0; x < MAP_WIDTH; x++) {
        const terrainType = terrain[y]?.[x] ?? TerrainType.GRASS;
        const range = HEIGHT_RANGES[terrainType] ?? [0, 0.1];
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

    const hx0 = h00 + (h10 - h00) * fx;
    const hx1 = h01 + (h11 - h01) * fx;
    return hx0 + (hx1 - hx0) * fy;
  }

  getHeightMap(): number[][] { return this.heightMap; }
  getTerrainGrid(): TerrainType[][] { return this.terrainGrid; }

  // ── Continuous terrain mesh ─────────────────────────────────────────

  /**
   * Get the height at a vertex corner position.
   * Vertex (ix, iy) is the corner where up to 4 tiles meet.
   * We average the heights of adjacent tiles for smooth transitions.
   */
  private getCornerHeight(ix: number, iy: number): number {
    let sum = 0, count = 0;
    // The 4 tiles that share this corner vertex
    for (const [tx, ty] of [[ix - 1, iy - 1], [ix, iy - 1], [ix - 1, iy], [ix, iy]]) {
      if (tx >= 0 && tx < MAP_WIDTH && ty >= 0 && ty < MAP_HEIGHT) {
        sum += this.heightMap[ty][tx];
        count++;
      }
    }
    return count > 0 ? sum / count : 0;
  }

  private buildTerrainMesh(terrain: TerrainType[][]): void {
    const numVerts = this.stride * (MAP_HEIGHT + 1);
    const positions = new Float32Array(numVerts * 3);
    const uvs = new Float32Array(numVerts * 2);
    const colors = new Float32Array(numVerts * 3);
    const normals = new Float32Array(numVerts * 3);

    // Set vertex positions with height displacement
    for (let iy = 0; iy <= MAP_HEIGHT; iy++) {
      for (let ix = 0; ix <= MAP_WIDTH; ix++) {
        const vi = iy * this.stride + ix;
        const worldX = ix - 0.5; // vertex at tile edge
        const worldZ = iy - 0.5;
        const height = this.getCornerHeight(ix, iy);

        positions[vi * 3] = worldX;
        positions[vi * 3 + 1] = height;
        positions[vi * 3 + 2] = worldZ;

        uvs[vi * 2] = ix / MAP_WIDTH;
        uvs[vi * 2 + 1] = iy / MAP_HEIGHT;

        // Default vertex color: white (no fog tint)
        colors[vi * 3] = 1;
        colors[vi * 3 + 1] = 1;
        colors[vi * 3 + 2] = 1;
      }
    }

    // Build index buffer for tile quads (2 triangles each)
    const indices: number[] = [];
    for (let iy = 0; iy < MAP_HEIGHT; iy++) {
      for (let ix = 0; ix < MAP_WIDTH; ix++) {
        const a = iy * this.stride + ix;
        const b = a + 1;
        const c = (iy + 1) * this.stride + ix;
        const d = c + 1;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    // Compute normals
    // Initialize normals to zero
    normals.fill(0);
    const indexArr = indices;
    for (let i = 0; i < indexArr.length; i += 3) {
      const ia = indexArr[i], ib = indexArr[i + 1], ic = indexArr[i + 2];
      const ax = positions[ia * 3], ay = positions[ia * 3 + 1], az = positions[ia * 3 + 2];
      const bx = positions[ib * 3], by = positions[ib * 3 + 1], bz = positions[ib * 3 + 2];
      const cx = positions[ic * 3], cy = positions[ic * 3 + 1], cz = positions[ic * 3 + 2];

      const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
      const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
      const nx = e1y * e2z - e1z * e2y;
      const ny = e1z * e2x - e1x * e2z;
      const nz = e1x * e2y - e1y * e2x;

      for (const vi of [ia, ib, ic]) {
        normals[vi * 3] += nx;
        normals[vi * 3 + 1] += ny;
        normals[vi * 3 + 2] += nz;
      }
    }
    // Normalize
    for (let i = 0; i < numVerts; i++) {
      const si = i * 3;
      const len = Math.sqrt(normals[si] ** 2 + normals[si + 1] ** 2 + normals[si + 2] ** 2);
      if (len > 0) {
        normals[si] /= len;
        normals[si + 1] /= len;
        normals[si + 2] /= len;
      } else {
        normals[si + 1] = 1; // default up
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);

    // Generate the blended map texture
    this.mapTexture = generateBlendedMapTexture(terrain, MAP_WIDTH, MAP_HEIGHT, 32);

    const material = new THREE.MeshStandardMaterial({
      map: this.mapTexture,
      roughness: 0.85,
      metalness: 0.02,
      vertexColors: true,
    });

    this.terrainMesh = new THREE.Mesh(geometry, material);
    this.terrainMesh.frustumCulled = false;
    this.group.add(this.terrainMesh);
  }

  // ── Water overlay ───────────────────────────────────────────────────

  private buildWaterOverlay(terrain: TerrainType[][]): void {
    // Collect water tile positions
    const waterTiles: { x: number; y: number }[] = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (terrain[y]?.[x] === TerrainType.WATER) {
          waterTiles.push({ x, y });
        }
      }
    }
    if (waterTiles.length === 0) return;

    // Build a single merged plane for all water tiles
    const vertsPerTile = 4;
    const totalVerts = waterTiles.length * vertsPerTile;
    const positions = new Float32Array(totalVerts * 3);
    const uvs = new Float32Array(totalVerts * 2);
    const indices: number[] = [];

    const waterY = -0.06; // just above the depressed terrain

    for (let i = 0; i < waterTiles.length; i++) {
      const { x, y } = waterTiles[i];
      const vi = i * 4;

      // Quad corners matching tile bounds
      positions[vi * 3]     = x - 0.5; positions[vi * 3 + 1] = waterY; positions[vi * 3 + 2] = y - 0.5;
      positions[(vi+1) * 3] = x + 0.5; positions[(vi+1) * 3 + 1] = waterY; positions[(vi+1) * 3 + 2] = y - 0.5;
      positions[(vi+2) * 3] = x - 0.5; positions[(vi+2) * 3 + 1] = waterY; positions[(vi+2) * 3 + 2] = y + 0.5;
      positions[(vi+3) * 3] = x + 0.5; positions[(vi+3) * 3 + 1] = waterY; positions[(vi+3) * 3 + 2] = y + 0.5;

      uvs[vi * 2]     = 0; uvs[vi * 2 + 1] = 0;
      uvs[(vi+1) * 2] = 1; uvs[(vi+1) * 2 + 1] = 0;
      uvs[(vi+2) * 2] = 0; uvs[(vi+2) * 2 + 1] = 1;
      uvs[(vi+3) * 2] = 1; uvs[(vi+3) * 2 + 1] = 1;

      indices.push(vi, vi + 2, vi + 1);
      indices.push(vi + 1, vi + 2, vi + 3);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    this.waterTexture = this.terrainTextures.getWaterTexture();
    const material = new THREE.MeshStandardMaterial({
      map: this.waterTexture,
      roughness: 0.15,
      metalness: 0.1,
      transparent: true,
      opacity: 0.7,
    });

    this.waterMesh = new THREE.Mesh(geometry, material);
    this.waterMesh.frustumCulled = false;
    this.group.add(this.waterMesh);
  }

  // ── Water animation ─────────────────────────────────────────────────

  animateWater(deltaMs: number): void {
    if (!this.waterTexture) return;
    const dt = deltaMs / 1000;
    this.waterTexture.offset.x += 0.02 * dt;
    this.waterTexture.offset.y += 0.015 * dt;
  }

  // ── Fog vertex coloring ─────────────────────────────────────────────

  /**
   * Set the vertex color tint for a tile (used by FogRenderer).
   * Updates the 4 corner vertices of the tile. Shared vertices between
   * adjacent tiles create smooth fog gradients automatically.
   */
  setTileColor(tileX: number, tileY: number, r: number, g: number, b: number): void {
    if (!this.terrainMesh) return;
    const colorAttr = this.terrainMesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    const arr = colorAttr.array as Float32Array;

    // Tile (tileX, tileY) has corners at vertices (tileX, tileY), (tileX+1, tileY),
    // (tileX, tileY+1), (tileX+1, tileY+1)
    const corners = [
      tileY * this.stride + tileX,
      tileY * this.stride + tileX + 1,
      (tileY + 1) * this.stride + tileX,
      (tileY + 1) * this.stride + tileX + 1,
    ];

    for (const vi of corners) {
      const ci = vi * 3;
      // Use max brightness so fog transitions are smooth across shared vertices
      if (arr[ci] < r) arr[ci] = r;
      if (arr[ci + 1] < g) arr[ci + 1] = g;
      if (arr[ci + 2] < b) arr[ci + 2] = b;
    }

    colorAttr.needsUpdate = true;
  }

  /** Reset all vertex colors before a fog pass (call before setTileColor loop) */
  resetVertexColors(): void {
    if (!this.terrainMesh) return;
    const colorAttr = this.terrainMesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    (colorAttr.array as Float32Array).fill(0);
  }

  /** Legacy compat — returns null since terrain is a continuous mesh. */
  getTileMesh(_tileX: number, _tileY: number): THREE.Mesh | null {
    return null;
  }

  dispose(): void {
    if (this.terrainMesh) {
      this.terrainMesh.geometry.dispose();
      (this.terrainMesh.material as THREE.Material).dispose();
    }
    if (this.waterMesh) {
      this.waterMesh.geometry.dispose();
      (this.waterMesh.material as THREE.Material).dispose();
    }
    if (this.mapTexture) this.mapTexture.dispose();
    this.terrainTextures.dispose();
  }
}
