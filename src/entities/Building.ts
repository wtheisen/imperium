import { Entity, EntityTeam } from './Entity';

export interface BuildingStats {
  maxHp: number;
  tileWidth: number;
  tileHeight: number;
  attackDamage?: number;
  attackRange?: number;
  attackCooldown?: number;
}

export class Building extends Entity {
  public stats: BuildingStats;
  public buildingType: string;
  public tileWidth: number;
  public tileHeight: number;
  /** Rally point: newly trained units will move here after spawning */
  public rallyPoint: { x: number; y: number } | null = null;

  constructor(
    tileX: number,
    tileY: number,
    buildingType: string,
    stats: BuildingStats,
    team: EntityTeam = 'player'
  ) {
    super(tileX, tileY, team);
    this.buildingType = buildingType;
    this.stats = { ...stats };
    this.tileWidth = stats.tileWidth;
    this.tileHeight = stats.tileHeight;
  }
}
