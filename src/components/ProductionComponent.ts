import { Component, Entity } from '../entities/Entity';
import { Building } from '../entities/Building';
import { EventBus } from '../EventBus';
import { IsoHelper } from '../map/IsoHelper';
import { UnitStats } from '../entities/Unit';

export interface TrainableUnit {
  unitType: string;
  texture: string;
  name: string;
  cost: number;
  buildTime: number; // ms
  stats: UnitStats;
}

interface QueueEntry {
  unit: TrainableUnit;
  progress: number; // 0..buildTime
}

export const TRAINABLE_UNITS: TrainableUnit[] = [
  {
    unitType: 'servitor', texture: 'unit-servitor', name: 'Servitor',
    cost: 5, buildTime: 5000,
    stats: { maxHp: 25, speed: 2, attackDamage: 3, attackRange: 1, attackCooldown: 1500, isRanged: false, gatherRate: 0.8, gatherCapacity: 6, squadSize: 1 },
  },
  {
    unitType: 'scout', texture: 'unit-scout', name: 'Scout Recon Team',
    cost: 5, buildTime: 6000,
    stats: { maxHp: 20, speed: 4, attackDamage: 3, attackRange: 1, attackCooldown: 1500, isRanged: false, squadSize: 3 },
  },
  {
    unitType: 'guardsman', texture: 'unit-guardsman', name: 'Infantry Squad',
    cost: 8, buildTime: 8000,
    stats: { maxHp: 30, speed: 2.5, attackDamage: 5, attackRange: 3, attackCooldown: 1200, isRanged: true, squadSize: 6 },
  },
  {
    unitType: 'marine', texture: 'unit-marine', name: 'Combat Squad',
    cost: 8, buildTime: 10000,
    stats: { maxHp: 60, speed: 1.8, attackDamage: 10, attackRange: 1, attackCooldown: 1000, isRanged: false, squadSize: 4 },
  },
];

export class ProductionComponent implements Component {
  private entity: Entity;
  private queue: QueueEntry[] = [];
  public maxQueueSize: number = 5;

  constructor(entity: Entity) {
    this.entity = entity;
  }

  queueUnit(unit: TrainableUnit): boolean {
    if (this.queue.length >= this.maxQueueSize) return false;
    this.queue.push({ unit, progress: 0 });
    return true;
  }

  getQueue(): QueueEntry[] {
    return this.queue;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  isTraining(): boolean {
    return this.queue.length > 0;
  }

  getCurrentProgress(): number {
    if (this.queue.length === 0) return 0;
    return this.queue[0].progress / this.queue[0].unit.buildTime;
  }

  update(delta: number): void {
    if (this.queue.length === 0) return;

    const current = this.queue[0];
    current.progress += delta;

    if (current.progress >= current.unit.buildTime) {
      this.queue.shift();
      this.spawnUnit(current.unit);
    }
  }

  private spawnUnit(trainable: TrainableUnit): void {
    const bx = this.entity.tileX;
    const by = this.entity.tileY;
    const offsets = [
      { x: -1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: -1 },
      { x: 2, y: 0 }, { x: 0, y: 2 }, { x: 2, y: 2 },
      { x: -1, y: 1 }, { x: 1, y: -1 }, { x: 2, y: 1 }, { x: 1, y: 2 },
      { x: -1, y: 2 }, { x: 2, y: -1 },
    ];

    let spawnX = bx;
    let spawnY = by;

    for (const off of offsets) {
      const tx = bx + off.x;
      const ty = by + off.y;
      if (IsoHelper.isInBounds(tx, ty)) {
        spawnX = tx;
        spawnY = ty;
        break;
      }
    }

    const rallyPoint = (this.entity instanceof Building) ? this.entity.rallyPoint : null;

    EventBus.emit('unit-trained', {
      unitType: trainable.unitType,
      texture: trainable.texture,
      stats: trainable.stats,
      tileX: spawnX,
      tileY: spawnY,
      rallyX: rallyPoint?.x,
      rallyY: rallyPoint?.y,
    });

    EventBus.emit('card-played-3d-vfx', { tileX: spawnX, tileY: spawnY, cardType: 'unit' });
  }

  destroy(): void {
    this.queue = [];
  }
}
