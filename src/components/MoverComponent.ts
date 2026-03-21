import { Component } from '../entities/Entity';
import { Unit } from '../entities/Unit';
export class MoverComponent implements Component {
  private unit: Unit;
  private path: { x: number; y: number }[] = [];
  private pathIndex: number = 0;
  private moving: boolean = false;
  private moveSpeed: number;

  /** When true, unit will stop to engage enemies encountered en route */
  public attackMoving: boolean = false;
  /** Stored attack-move destination for resuming after combat */
  public attackMoveDestination: { x: number; y: number } | null = null;
  /** When true, unit stays in place and only attacks enemies in range */
  public holdPosition: boolean = false;

  /** Behavior mode for standing orders */
  public behaviorMode: 'none' | 'patrol' | 'explore' = 'none';
  /** Patrol waypoints — unit walks back and forth between these */
  public patrolPoints: { x: number; y: number }[] = [];
  public patrolIndex: number = 0;

  /** Fractional tile position for smooth 3D interpolation */
  public fracTileX: number;
  public fracTileY: number;

  /** External speed multiplier (e.g. 0.6 for 40% slow on ice). Reset each tick by TerrainEffectSystem. */
  public speedMultiplier: number = 1.0;

  constructor(unit: Unit, speed: number) {
    this.unit = unit;
    this.moveSpeed = speed;
    this.fracTileX = unit.tileX;
    this.fracTileY = unit.tileY;
  }

  setPath(path: { x: number; y: number }[]): void {
    this.path = path;
    this.pathIndex = 0;
    this.moving = path.length > 0;
    this.holdPosition = false;
    // A direct setPath from patrol/explore keeps the behavior;
    // explicit user move commands call stop() which clears behavior
  }

  isMoving(): boolean {
    return this.moving;
  }

  getSpeed(): number {
    return this.moveSpeed;
  }

  setSpeed(speed: number): void {
    this.moveSpeed = speed;
  }

  stop(): void {
    this.moving = false;
    this.path = [];
    this.pathIndex = 0;
    this.attackMoving = false;
    this.attackMoveDestination = null;
    this.behaviorMode = 'none';
    this.patrolPoints = [];
    this.patrolIndex = 0;
  }

  /** Stop movement but preserve attack-move destination for resuming */
  stopForCombat(): void {
    this.moving = false;
    this.path = [];
    this.pathIndex = 0;
  }

  getTargetTile(): { x: number; y: number } | null {
    if (this.path.length === 0) return null;
    return this.path[this.path.length - 1];
  }

  update(delta: number): void {
    if (!this.moving || this.pathIndex >= this.path.length) {
      this.moving = false;
      return;
    }

    const target = this.path[this.pathIndex];
    const dx = target.x - this.fracTileX;
    const dy = target.y - this.fracTileY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Speed in tiles/second (convert from the old pixel-based speed), apply terrain multiplier
    const tilesPerSecond = this.moveSpeed * 0.8 * this.speedMultiplier;
    const step = tilesPerSecond * (delta / 1000);

    if (dist <= step) {
      // Arrived at next waypoint
      this.fracTileX = target.x;
      this.fracTileY = target.y;
      this.unit.tileX = target.x;
      this.unit.tileY = target.y;
      this.pathIndex++;

      if (this.pathIndex >= this.path.length) {
        this.moving = false;
      }
    } else {
      // Interpolate toward target
      const nx = dx / dist;
      const ny = dy / dist;
      this.fracTileX += nx * step;
      this.fracTileY += ny * step;

      // Update facing direction toward movement target
      this.unit.facing = Math.atan2(nx, ny);

      // Update integer tile position for game logic (combat range, etc.)
      this.unit.tileX = Math.round(this.fracTileX);
      this.unit.tileY = Math.round(this.fracTileY);
    }

  }

  destroy(): void {
    this.stop();
  }
}
