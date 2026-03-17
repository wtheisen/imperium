import { UnitStats } from '../entities/Unit';

export type ObjectiveType = 'destroy' | 'recover' | 'purge';

export interface ObjectiveDefinition {
  id: string;
  type: ObjectiveType;
  name: string;
  description: string;
  tileX: number;
  tileY: number;
  /** For 'destroy' objectives — which camp's building must be destroyed */
  targetCampId?: string;
  /** For 'purge' objectives — radius in tiles to clear of enemies */
  purgeRadius?: number;
  goldReward: number;
  cardDraws: number;
}

export interface CampUnitDef {
  type: string;
  texture: string;
  count: number;
  stats: UnitStats;
}

export interface EnemyCampDefinition {
  id: string;
  tileX: number;
  tileY: number;
  units: CampUnitDef[];
  /** Optional enemy building at this camp */
  building?: {
    texture: string;
    buildingType: string;
    stats: { maxHp: number; tileWidth: number; tileHeight: number };
  };
  aggroRadius: number;
  patrolPath?: { x: number; y: number }[];
  /** Spawner config — if present, this camp continuously produces units */
  spawner?: {
    spawnInterval: number;
    spawnGroup: { type: string; texture: string; stats: any; count: number }[];
    maxActiveUnits: number;
    patrolRadius?: number;
  };
}

export interface TerrainParams {
  seed?: number;          // omit = random each play
  waterCoverage?: number; // 0-0.15, fraction of map that's water (default 0.08)
  stoneCoverage?: number; // 0-0.1 (default 0.04)
  forestCoverage?: number;// 0-0.15 (default 0.06)
  goldMineCount?: number; // total mines to place (default 6)
  riverCount?: number;    // 0-3 rivers to carve (default 1)
  mapType?: 'outdoor' | 'space_hulk'; // default 'outdoor'
  corridorWidth?: number; // 2-3, default 3 (space_hulk only)
}

export interface MissionDefinition {
  id: string;
  name: string;
  description: string;
  difficulty: number;
  objectives: ObjectiveDefinition[];
  enemyCamps: EnemyCampDefinition[];
  playerStartX: number;
  playerStartY: number;
  startingGold: number;
  supplyDropIntervalMs: number;
  /** Per-mission gold mine placement with explicit gold amounts */
  goldMines?: { tileX: number; tileY: number; goldAmount: number }[];
  /** Procedural terrain generation parameters */
  terrain?: TerrainParams;
}
