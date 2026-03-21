import { UnitStats } from '../entities/Unit';
import { PackDefinition } from '../packs/PackTypes';

export type ObjectiveType = 'destroy' | 'recover' | 'purge' | 'survive' | 'activate' | 'collect';

export type EnvironmentModifier = 'dense_fog' | 'ork_frenzy' | 'supply_shortage' | 'armored_advance' | 'night_raid';

export type OnCompleteActionType =
  | 'reveal_objective'
  | 'spawn_reinforcements'
  | 'modify_environment'
  | 'reveal_fog'
  | 'grant_bonus';

export interface OnCompleteAction {
  type: OnCompleteActionType;
  /** For reveal_objective — the objective to inject into the mission */
  revealObjective?: ObjectiveDefinition;
  /** For spawn_reinforcements — spawn at position or from camp */
  spawnTileX?: number;
  spawnTileY?: number;
  spawnCampId?: string;
  spawnCount?: number;
  /** For modify_environment — add or remove a modifier */
  modifier?: EnvironmentModifier;
  modifierAction?: 'add' | 'remove';
  /** For reveal_fog — center and radius of fog reveal */
  fogTileX?: number;
  fogTileY?: number;
  fogRadius?: number;
  /** For grant_bonus — extra rewards */
  bonusGold?: number;
  bonusCardDraws?: number;
  /** For grant_bonus — radius-based temp stat buff */
  buffRadius?: number;
  buffAtkBonus?: number;
  buffDurationMs?: number;
}

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
  /** For 'survive' objectives — hold position for this many ms */
  surviveDurationMs?: number;
  /** For 'survive' objectives — radius around objective to defend */
  surviveRadius?: number;
  /** For 'activate' objectives — channel (hold position) for this many ms */
  channelDurationMs?: number;
  /** For 'collect' objectives — how many items to gather */
  collectTotal?: number;
  /** For 'collect' objectives — positions of items to collect */
  collectPositions?: { tileX: number; tileY: number }[];
  goldReward: number;
  cardDraws: number;
  /** ID of prerequisite objective that must complete before this one activates */
  prerequisiteId?: string;
  /** Whether this objective is hidden until revealed by an on-complete action */
  hidden?: boolean;
  /** Action to execute when this objective completes */
  onCompleteAction?: OnCompleteAction;
}

export type POIType = 'gold_cache' | 'ammo_dump' | 'med_station' | 'intel' | 'relic';

export interface POIDefinition {
  id: string;
  type: POIType;
  tileX: number;
  tileY: number;
  reward: {
    gold?: number;
    cardDraws?: number;
    healAmount?: number;
    healRadius?: number;
    fogRevealRadius?: number;
  };
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
  /** Optional bonus objectives — not required for victory */
  optionalObjectives?: ObjectiveDefinition[];
  enemyCamps: EnemyCampDefinition[];
  playerStartX: number;
  playerStartY: number;
  startingGold: number;
  supplyDropIntervalMs: number;
  /** Per-mission gold mine placement with explicit gold amounts */
  goldMines?: { tileX: number; tileY: number; goldAmount: number }[];
  /** Procedural terrain generation parameters */
  terrain?: TerrainParams;
  /** Time in ms for extraction phase after objectives complete. 0 or omitted = instant victory. */
  extractionTimerMs?: number;
  /** Per-mission environment modifiers that change gameplay rules */
  environmentModifiers?: EnvironmentModifier[];
  /** Points of interest — bonus pickups scattered on map */
  pointsOfInterest?: POIDefinition[];
  /** Card packs placed on the map for the player to discover */
  packSpawns?: PackDefinition[];
}
