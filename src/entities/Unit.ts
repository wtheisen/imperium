import { Entity, EntityTeam } from './Entity';

export interface UnitStats {
  maxHp: number;
  speed: number;
  attackDamage: number;
  attackRange: number;
  attackCooldown: number;
  isRanged: boolean;
  gatherRate?: number;
  gatherCapacity?: number;
  /** Number of models in the squad. Stats represent per-model values; total HP/damage = per-model × squadSize. Default 1. */
  squadSize?: number;
}

export class Unit extends Entity {
  public stats: UnitStats;
  public unitType: string;
  public xp: number = 0;

  // Camp-aware AI fields (enemy units only)
  public campId?: string;
  public homeX?: number;
  public homeY?: number;
  public aggroRadius?: number;
  public patrolPath?: { x: number; y: number }[];

  constructor(
    tileX: number,
    tileY: number,
    unitType: string,
    stats: UnitStats,
    team: EntityTeam = 'player'
  ) {
    super(tileX, tileY, team);
    this.unitType = unitType;
    this.stats = { ...stats };
  }

}
