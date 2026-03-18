import {
  MAP_WIDTH, MAP_HEIGHT, NEAR_MINE_GOLD, DEFAULT_MINE_GOLD, FAR_MINE_GOLD,
  POI_BASE_COUNT, POI_PER_DIFFICULTY, POI_MIN_SPACING, POI_MIN_DIST_FROM_START,
  POI_MIN_DIST_FROM_CAMP, POI_MIN_DIST_FROM_MINE,
  PACK_BASE_COUNT, PACK_PER_DIFFICULTY, PACK_MIN_DIST_FROM_START,
} from '../config';
import { IsoHelper } from './IsoHelper';
import { MissionDefinition, TerrainParams, POIDefinition, POIType } from '../missions/MissionDefinition';
import { PackDefinition, PackType } from '../packs/PackTypes';
import { EventBus } from '../EventBus';
import { generateSpaceHulk } from './SpaceHulkGenerator';

export enum TerrainType {
  GRASS = 0,
  WATER = 1,
  GOLD_MINE = 2,
  STONE = 3,
  DIRT = 4,
  FOREST = 5,
  METAL_FLOOR = 6,
  HULL_WALL = 7,
}

interface MineData {
  remaining: number;
  maxGold: number;
}

/** Simple seeded PRNG (Lehmer / MINSTD) */
function createRng(seed: number): () => number {
  let s = Math.abs(seed) || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Value noise at integer lattice point */
function noise2d(x: number, y: number, seed: number): number {
  const h = ((x * 73856093) ^ (y * 19349663) ^ seed) & 0x7fffffff;
  const rng = createRng(h || 1);
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
  return (n00 + (n10 - n00) * sx) + ((n01 + (n11 - n01) * sx) - (n00 + (n10 - n00) * sx)) * sy;
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

export class MapManager {
  private terrain: TerrainType[][];
  private mineData: Map<string, MineData> = new Map();
  private floorType: TerrainType = TerrainType.GRASS;
  private generatedPOIs: POIDefinition[] = [];
  private generatedPacks: PackDefinition[] = [];

  constructor() {
    this.terrain = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
      this.terrain[y] = [];
      for (let x = 0; x < MAP_WIDTH; x++) {
        this.terrain[y][x] = TerrainType.GRASS;
      }
    }
  }

  private mineKey(x: number, y: number): string {
    return `${x},${y}`;
  }

  initMine(x: number, y: number, goldAmount: number): void {
    this.terrain[y][x] = TerrainType.GOLD_MINE;
    this.mineData.set(this.mineKey(x, y), { remaining: goldAmount, maxGold: goldAmount });
  }

  getMineRemaining(tileX: number, tileY: number): number {
    return this.mineData.get(this.mineKey(tileX, tileY))?.remaining ?? 0;
  }

  getMineRatio(tileX: number, tileY: number): number {
    const data = this.mineData.get(this.mineKey(tileX, tileY));
    if (!data || data.maxGold === 0) return 0;
    return data.remaining / data.maxGold;
  }

  depleteMine(tileX: number, tileY: number, amount: number): number {
    const key = this.mineKey(tileX, tileY);
    const data = this.mineData.get(key);
    if (!data) return 0;
    const taken = Math.min(amount, data.remaining);
    data.remaining -= taken;
    if (data.remaining <= 0) {
      this.exhaustMine(tileX, tileY);
    }
    return taken;
  }

  private exhaustMine(tileX: number, tileY: number): void {
    this.terrain[tileY][tileX] = this.floorType;
    this.mineData.delete(this.mineKey(tileX, tileY));
    EventBus.emit('mine-exhausted', { tileX, tileY });
  }

  /** Apply mission-specific terrain — procedural generation + optional explicit overrides */
  loadMissionTerrain(mission: MissionDefinition): void {
    // Reset grid to grass
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        this.terrain[y][x] = TerrainType.GRASS;
      }
    }
    this.mineData.clear();

    // Collect protected positions (player start, camps, objectives)
    const protectedPositions: { x: number; y: number; radius: number }[] = [];
    protectedPositions.push({ x: mission.playerStartX, y: mission.playerStartY, radius: 5 });
    for (const camp of mission.enemyCamps) {
      protectedPositions.push({ x: camp.tileX, y: camp.tileY, radius: 3 });
    }
    for (const obj of mission.objectives) {
      protectedPositions.push({ x: obj.tileX, y: obj.tileY, radius: 3 });
    }

    const params = mission.terrain ?? {};
    const mapType = params.mapType ?? 'outdoor';

    if (mapType === 'space_hulk') {
      this.floorType = TerrainType.METAL_FLOOR;
      const seed = params.seed ?? Math.floor(Math.random() * 2147483646) + 1;
      const corridorWidth = params.corridorWidth ?? 3;
      this.terrain = generateSpaceHulk(MAP_WIDTH, MAP_HEIGHT, seed, corridorWidth, protectedPositions);
    } else {
      this.floorType = TerrainType.GRASS;
      // Generate procedural terrain
      this.generateTerrain(mission, protectedPositions);
    }

    // Place gold mines: explicit if provided, otherwise procedural
    if (mission.goldMines) {
      for (const mine of mission.goldMines) {
        if (mine.tileX >= 0 && mine.tileX < MAP_WIDTH && mine.tileY >= 0 && mine.tileY < MAP_HEIGHT) {
          this.initMine(mine.tileX, mine.tileY, mine.goldAmount);
        }
      }
    } else {
      const params = mission.terrain ?? {};
      const seed = params.seed ?? Math.floor(Math.random() * 2147483646) + 1;
      const rng = createRng(seed + 9999);
      this.placeProceduralMines(
        mission.playerStartX, mission.playerStartY,
        params.goldMineCount ?? 6, rng
      );
    }

    // Ensure connectivity from player start to all camps, objectives, and mines
    this.ensureConnectivity(mission);

    // Compute reachability from player start for procedural placement
    const reachable = this.floodFillReachable(mission.playerStartX, mission.playerStartY);

    // Procedural PoIs and Packs
    const poiSeed = (mission.terrain?.seed ?? Math.floor(Math.random() * 2147483646) + 1) + 7777;
    const poiRng = createRng(poiSeed);
    this.generatedPOIs = this.placeProceduralPOIs(mission, poiRng, reachable);

    const packSeed = poiSeed + 3333;
    const packRng = createRng(packSeed);
    this.generatedPacks = this.placeProceduralPacks(mission, packRng, reachable);
  }

  private generateTerrain(
    mission: MissionDefinition,
    protectedPositions: { x: number; y: number; radius: number }[]
  ): void {
    const params: TerrainParams = mission.terrain ?? {};
    const seed = params.seed ?? Math.floor(Math.random() * 2147483646) + 1;
    const rng = createRng(seed);

    const waterCoverage = params.waterCoverage ?? 0.08;
    const stoneCoverage = params.stoneCoverage ?? 0.04;
    const forestCoverage = params.forestCoverage ?? 0.06;
    const riverCount = params.riverCount ?? 1;

    // Step 1: Base terrain via noise thresholds
    // We compute noise for every tile, then assign types based on sorted thresholds
    const noiseValues: { x: number; y: number; n: number }[] = [];
    const forestNoise: { x: number; y: number; n: number }[] = [];

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const n = fbm(x / MAP_WIDTH * 6, y / MAP_HEIGHT * 6, 4, seed);
        noiseValues.push({ x, y, n });
        // Different frequency noise for forest
        const fn = fbm(x / MAP_WIDTH * 8, y / MAP_HEIGHT * 8, 3, seed + 5000);
        forestNoise.push({ x, y, n: fn });
      }
    }

    // Sort by noise value to pick lowest N% as water, next M% as stone, etc.
    const sorted = [...noiseValues].sort((a, b) => a.n - b.n);
    const totalTiles = MAP_WIDTH * MAP_HEIGHT;

    const waterCount = Math.floor(totalTiles * waterCoverage);
    const stoneCount = Math.floor(totalTiles * stoneCoverage);

    // Assign water to lowest noise values
    for (let i = 0; i < waterCount && i < sorted.length; i++) {
      const { x, y } = sorted[i];
      if (!this.isProtected(x, y, protectedPositions)) {
        this.terrain[y][x] = TerrainType.WATER;
      }
    }

    // Assign stone to highest noise values
    const sortedDesc = [...noiseValues].sort((a, b) => b.n - a.n);
    for (let i = 0; i < stoneCount && i < sortedDesc.length; i++) {
      const { x, y } = sortedDesc[i];
      if (this.terrain[y][x] === TerrainType.GRASS && !this.isProtected(x, y, protectedPositions)) {
        this.terrain[y][x] = TerrainType.STONE;
      }
    }

    // Assign forest using separate noise — highest values become forest
    const sortedForest = [...forestNoise].sort((a, b) => b.n - a.n);
    const forestCount = Math.floor(totalTiles * forestCoverage);
    for (let i = 0; i < forestCount && i < sortedForest.length; i++) {
      const { x, y } = sortedForest[i];
      if (this.terrain[y][x] === TerrainType.GRASS && !this.isProtected(x, y, protectedPositions)) {
        this.terrain[y][x] = TerrainType.FOREST;
      }
    }

    // Sprinkle some DIRT on remaining grass using yet another noise layer
    const dirtNoise: number[][] = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
      dirtNoise[y] = [];
      for (let x = 0; x < MAP_WIDTH; x++) {
        dirtNoise[y][x] = fbm(x / MAP_WIDTH * 4, y / MAP_HEIGHT * 4, 3, seed + 3000);
      }
    }
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (this.terrain[y][x] === TerrainType.GRASS && dirtNoise[y][x] > 0.62) {
          this.terrain[y][x] = TerrainType.DIRT;
        }
      }
    }

    // Step 2: Carve rivers
    for (let r = 0; r < riverCount; r++) {
      this.carveRiver(rng, protectedPositions);
    }

    // Step 3: Clear protected zones (player start = 5x5 grass, camps/objectives = 3x3)
    for (const pz of protectedPositions) {
      const half = pz.radius;
      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          const tx = pz.x + dx;
          const ty = pz.y + dy;
          if (tx >= 0 && tx < MAP_WIDTH && ty >= 0 && ty < MAP_HEIGHT) {
            if (this.terrain[ty][tx] !== TerrainType.GOLD_MINE) {
              this.terrain[ty][tx] = TerrainType.GRASS;
            }
          }
        }
      }
    }
  }

  private isProtected(
    x: number, y: number,
    protectedPositions: { x: number; y: number; radius: number }[]
  ): boolean {
    for (const pz of protectedPositions) {
      if (Math.abs(x - pz.x) <= pz.radius && Math.abs(y - pz.y) <= pz.radius) {
        return true;
      }
    }
    return false;
  }

  private carveRiver(
    rng: () => number,
    protectedPositions: { x: number; y: number; radius: number }[]
  ): void {
    // Pick a random edge to start from (0=top, 1=bottom, 2=left, 3=right)
    const edge = Math.floor(rng() * 4);
    let x: number, y: number;
    let dx: number, dy: number;

    switch (edge) {
      case 0: // top → bottom
        x = Math.floor(rng() * (MAP_WIDTH - 4)) + 2;
        y = 0; dx = 0; dy = 1;
        break;
      case 1: // bottom → top
        x = Math.floor(rng() * (MAP_WIDTH - 4)) + 2;
        y = MAP_HEIGHT - 1; dx = 0; dy = -1;
        break;
      case 2: // left → right
        y = Math.floor(rng() * (MAP_HEIGHT - 4)) + 2;
        x = 0; dx = 1; dy = 0;
        break;
      default: // right → left
        y = Math.floor(rng() * (MAP_HEIGHT - 4)) + 2;
        x = MAP_WIDTH - 1; dx = -1; dy = 0;
        break;
    }

    const maxSteps = MAP_WIDTH + MAP_HEIGHT;
    for (let step = 0; step < maxSteps; step++) {
      // Place 1-2 tiles wide
      for (let w = -1; w <= 0; w++) {
        const wx = dx === 0 ? x + w : x;
        const wy = dy === 0 ? y + w : y;
        if (wx >= 0 && wx < MAP_WIDTH && wy >= 0 && wy < MAP_HEIGHT) {
          if (!this.isProtected(wx, wy, protectedPositions)) {
            this.terrain[wy][wx] = TerrainType.WATER;
          }
        }
      }

      // Advance with meander
      x += dx;
      y += dy;
      // Random perpendicular drift
      const drift = rng();
      if (drift < 0.3) {
        if (dx === 0) x = Math.max(1, Math.min(MAP_WIDTH - 2, x - 1));
        else y = Math.max(1, Math.min(MAP_HEIGHT - 2, y - 1));
      } else if (drift > 0.7) {
        if (dx === 0) x = Math.max(1, Math.min(MAP_WIDTH - 2, x + 1));
        else y = Math.max(1, Math.min(MAP_HEIGHT - 2, y + 1));
      }

      if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) break;
    }
  }

  private placeProceduralMines(
    playerX: number, playerY: number,
    count: number, rng: () => number
  ): void {
    // Distribute mines into near/mid/far tiers
    const nearCount = Math.max(1, Math.floor(count / 3));
    const midCount = Math.max(1, Math.floor(count / 3));
    const farCount = count - nearCount - midCount;

    const tiers: { minDist: number; maxDist: number; gold: number; count: number }[] = [
      { minDist: 3, maxDist: 6, gold: NEAR_MINE_GOLD, count: nearCount },
      { minDist: 8, maxDist: 14, gold: DEFAULT_MINE_GOLD, count: midCount },
      { minDist: 16, maxDist: 30, gold: FAR_MINE_GOLD, count: farCount },
    ];

    const placed: { x: number; y: number }[] = [];

    for (const tier of tiers) {
      let attempts = 0;
      let placedInTier = 0;
      while (placedInTier < tier.count && attempts < 200) {
        attempts++;
        const tx = Math.floor(rng() * MAP_WIDTH);
        const ty = Math.floor(rng() * MAP_HEIGHT);
        const dist = Math.abs(tx - playerX) + Math.abs(ty - playerY);

        if (dist < tier.minDist || dist > tier.maxDist) continue;
        if (this.terrain[ty][tx] !== TerrainType.GRASS && this.terrain[ty][tx] !== TerrainType.DIRT && this.terrain[ty][tx] !== TerrainType.METAL_FLOOR) continue;

        // Not adjacent to water
        if (this.hasAdjacentWater(tx, ty)) continue;

        // Not too close to another mine
        if (placed.some(p => Math.abs(p.x - tx) + Math.abs(p.y - ty) < 4)) continue;

        this.initMine(tx, ty, tier.gold);
        placed.push({ x: tx, y: ty });
        placedInTier++;
      }
    }
  }

  private hasAdjacentWater(x: number, y: number): boolean {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT) {
          if (this.terrain[ny][nx] === TerrainType.WATER) return true;
        }
      }
    }
    return false;
  }

  private ensureConnectivity(mission: MissionDefinition): void {
    // Flood-fill from player start on walkable tiles
    const visited: boolean[][] = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
      visited[y] = new Array(MAP_WIDTH).fill(false);
    }

    const queue: { x: number; y: number }[] = [{ x: mission.playerStartX, y: mission.playerStartY }];
    visited[mission.playerStartY][mission.playerStartX] = true;

    while (queue.length > 0) {
      const { x, y } = queue.shift()!;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT && !visited[ny][nx]) {
          if (this.isWalkable(nx, ny)) {
            visited[ny][nx] = true;
            queue.push({ x: nx, y: ny });
          }
        }
      }
    }

    // Collect all targets that must be reachable
    const targets: { x: number; y: number }[] = [];
    for (const camp of mission.enemyCamps) {
      targets.push({ x: camp.tileX, y: camp.tileY });
    }
    for (const obj of mission.objectives) {
      targets.push({ x: obj.tileX, y: obj.tileY });
    }
    if (mission.optionalObjectives) {
      for (const obj of mission.optionalObjectives) {
        targets.push({ x: obj.tileX, y: obj.tileY });
      }
    }
    for (const [key] of this.mineData) {
      const [mx, my] = key.split(',').map(Number);
      targets.push({ x: mx, y: my });
    }

    // Carve grass paths to any unreachable target
    for (const target of targets) {
      if (target.x >= 0 && target.x < MAP_WIDTH && target.y >= 0 && target.y < MAP_HEIGHT) {
        if (!visited[target.y][target.x]) {
          this.carvePath(mission.playerStartX, mission.playerStartY, target.x, target.y, visited);
        }
      }
    }
  }

  /** Carve a straight-ish grass path from src to dst, updating visited set */
  private carvePath(
    sx: number, sy: number, dx: number, dy: number,
    visited: boolean[][]
  ): void {
    let cx = sx, cy = sy;
    const maxSteps = MAP_WIDTH + MAP_HEIGHT;
    for (let i = 0; i < maxSteps; i++) {
      if (cx === dx && cy === dy) break;
      // Move toward target
      if (Math.abs(dx - cx) > Math.abs(dy - cy)) {
        cx += dx > cx ? 1 : -1;
      } else {
        cy += dy > cy ? 1 : -1;
      }
      if (cx >= 0 && cx < MAP_WIDTH && cy >= 0 && cy < MAP_HEIGHT) {
        const t = this.terrain[cy][cx];
        if (t === TerrainType.WATER || t === TerrainType.FOREST || t === TerrainType.STONE || t === TerrainType.HULL_WALL) {
          this.terrain[cy][cx] = this.floorType;
        }
        visited[cy][cx] = true;
      }
    }
  }

  /** No-op: 3D tile map is built by GameRenderer via 'terrain-ready' event */
  render(): void {}

  getTerrain(tileX: number, tileY: number): TerrainType {
    if (!IsoHelper.isInBounds(tileX, tileY)) return TerrainType.WATER;
    return this.terrain[tileY][tileX];
  }

  isWalkable(tileX: number, tileY: number): boolean {
    const t = this.getTerrain(tileX, tileY);
    return t !== TerrainType.WATER && t !== TerrainType.FOREST && t !== TerrainType.HULL_WALL;
  }

  getWalkabilityGrid(): number[][] {
    const grid: number[][] = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
      grid[y] = [];
      for (let x = 0; x < MAP_WIDTH; x++) {
        grid[y][x] = this.isWalkable(x, y) ? 0 : 1;
      }
    }
    return grid;
  }

  isGoldMine(tileX: number, tileY: number): boolean {
    return this.getTerrain(tileX, tileY) === TerrainType.GOLD_MINE;
  }

  /** Expose the raw terrain grid for the 3D renderer. */
  getTerrainGrid(): TerrainType[][] {
    return this.terrain;
  }

  /** Return the floor type for this map (GRASS for outdoor, METAL_FLOOR for space hulk). */
  getFloorType(): TerrainType {
    return this.floorType;
  }

  /** Get all mine positions with their gold amounts. */
  getAllMines(): { tileX: number; tileY: number; remaining: number; maxGold: number }[] {
    const mines: { tileX: number; tileY: number; remaining: number; maxGold: number }[] = [];
    for (const [key, data] of this.mineData) {
      const [x, y] = key.split(',').map(Number);
      mines.push({ tileX: x, tileY: y, remaining: data.remaining, maxGold: data.maxGold });
    }
    return mines;
  }

  getGeneratedPOIs(): POIDefinition[] { return this.generatedPOIs; }
  getGeneratedPacks(): PackDefinition[] { return this.generatedPacks; }

  /** Flood-fill reachable walkable tiles from a starting position */
  private floodFillReachable(startX: number, startY: number): boolean[][] {
    const reachable: boolean[][] = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
      reachable[y] = new Array(MAP_WIDTH).fill(false);
    }
    const queue: { x: number; y: number }[] = [{ x: startX, y: startY }];
    reachable[startY][startX] = true;
    while (queue.length > 0) {
      const { x, y } = queue.shift()!;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT && !reachable[ny][nx]) {
          if (this.isWalkable(nx, ny)) {
            reachable[ny][nx] = true;
            queue.push({ x: nx, y: ny });
          }
        }
      }
    }
    return reachable;
  }

  private placeProceduralPOIs(mission: MissionDefinition, rng: () => number, reachable: boolean[][]): POIDefinition[] {
    const count = POI_BASE_COUNT + mission.difficulty * POI_PER_DIFFICULTY;
    const placed: POIDefinition[] = [];
    const mines = this.getAllMines();

    // Weighted type distribution
    const typeWeights: { type: POIType; weight: number; reward: () => POIDefinition['reward'] }[] = [
      { type: 'gold_cache',  weight: 0.30, reward: () => ({ gold: 8 + Math.floor(rng() * 8) }) },
      { type: 'ammo_dump',   weight: 0.25, reward: () => ({ cardDraws: 1 + (rng() < 0.3 ? 1 : 0) }) },
      { type: 'med_station', weight: 0.15, reward: () => ({ healAmount: 15, healRadius: 5 }) },
      { type: 'intel',       weight: 0.15, reward: () => ({ fogRevealRadius: 20 }) },
      { type: 'relic',       weight: 0.15, reward: () => ({}) },
    ];

    const pickType = (): typeof typeWeights[0] => {
      const r = rng();
      let cumulative = 0;
      for (const tw of typeWeights) {
        cumulative += tw.weight;
        if (r < cumulative) return tw;
      }
      return typeWeights[0];
    };

    let attempts = 0;
    while (placed.length < count && attempts < 500) {
      attempts++;
      const tx = Math.floor(rng() * (MAP_WIDTH - 4)) + 2;
      const ty = Math.floor(rng() * (MAP_HEIGHT - 4)) + 2;

      if (!this.isWalkable(tx, ty)) continue;
      if (!reachable[ty][tx]) continue;

      // Min distance from player start
      const distStart = Math.abs(tx - mission.playerStartX) + Math.abs(ty - mission.playerStartY);
      if (distStart < POI_MIN_DIST_FROM_START) continue;

      // Min distance from enemy camps
      if (mission.enemyCamps.some(c => Math.abs(tx - c.tileX) + Math.abs(ty - c.tileY) < POI_MIN_DIST_FROM_CAMP)) continue;

      // Min distance from other PoIs
      if (placed.some(p => Math.abs(tx - p.tileX) + Math.abs(ty - p.tileY) < POI_MIN_SPACING)) continue;

      // Min distance from gold mines
      if (mines.some(m => Math.abs(tx - m.tileX) + Math.abs(ty - m.tileY) < POI_MIN_DIST_FROM_MINE)) continue;

      const tw = pickType();
      placed.push({
        id: `poi_gen_${placed.length}`,
        type: tw.type,
        tileX: tx,
        tileY: ty,
        reward: tw.reward(),
      });
    }

    return placed;
  }

  private placeProceduralPacks(mission: MissionDefinition, rng: () => number, reachable: boolean[][]): PackDefinition[] {
    const count = PACK_BASE_COUNT + mission.difficulty * PACK_PER_DIFFICULTY;
    const placed: PackDefinition[] = [];
    const mines = this.getAllMines();

    const packTypes: { type: PackType; weight: number }[] = [
      { type: 'random',   weight: 0.40 },
      { type: 'wargear',  weight: 0.25 },
      { type: 'ordnance', weight: 0.15 },
      { type: 'unit',     weight: 0.10 },
      { type: 'building', weight: 0.10 },
    ];

    const pickType = (): PackType => {
      const r = rng();
      let cumulative = 0;
      for (const pt of packTypes) {
        cumulative += pt.weight;
        if (r < cumulative) return pt.type;
      }
      return 'random';
    };

    // Place at least 1 pack near an enemy camp (within 6 tiles)
    if (mission.enemyCamps.length > 0) {
      let campAttempts = 0;
      while (campAttempts < 100) {
        campAttempts++;
        const camp = mission.enemyCamps[Math.floor(rng() * mission.enemyCamps.length)];
        const dx = Math.floor(rng() * 12) - 6;
        const dy = Math.floor(rng() * 12) - 6;
        const tx = camp.tileX + dx;
        const ty = camp.tileY + dy;
        if (tx < 2 || tx >= MAP_WIDTH - 2 || ty < 2 || ty >= MAP_HEIGHT - 2) continue;
        if (!this.isWalkable(tx, ty)) continue;
        if (!reachable[ty][tx]) continue;
        const distCamp = Math.abs(tx - camp.tileX) + Math.abs(ty - camp.tileY);
        if (distCamp > 6) continue;
        if (mines.some(m => Math.abs(tx - m.tileX) + Math.abs(ty - m.tileY) < 3)) continue;

        placed.push({ id: `pack_gen_0`, type: pickType(), tileX: tx, tileY: ty });
        break;
      }
    }

    // Place remaining packs spread across the map
    let attempts = 0;
    while (placed.length < count && attempts < 500) {
      attempts++;
      const tx = Math.floor(rng() * (MAP_WIDTH - 4)) + 2;
      const ty = Math.floor(rng() * (MAP_HEIGHT - 4)) + 2;

      if (!this.isWalkable(tx, ty)) continue;
      if (!reachable[ty][tx]) continue;

      // Min distance from player start
      const distStart = Math.abs(tx - mission.playerStartX) + Math.abs(ty - mission.playerStartY);
      if (distStart < PACK_MIN_DIST_FROM_START) continue;

      // Min distance from other packs
      if (placed.some(p => Math.abs(tx - p.tileX) + Math.abs(ty - p.tileY) < 8)) continue;

      // Min distance from PoIs
      if (this.generatedPOIs.some(p => Math.abs(tx - p.tileX) + Math.abs(ty - p.tileY) < 5)) continue;

      // Min distance from gold mines
      if (mines.some(m => Math.abs(tx - m.tileX) + Math.abs(ty - m.tileY) < 3)) continue;

      placed.push({
        id: `pack_gen_${placed.length}`,
        type: pickType(),
        tileX: tx,
        tileY: ty,
      });
    }

    return placed;
  }
}
