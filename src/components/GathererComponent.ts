import { Component } from '../entities/Entity';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { MoverComponent } from './MoverComponent';
import { EventBus } from '../EventBus';

export type GathererState = 'idle' | 'moving-to-mine' | 'gathering' | 'moving-to-drop' | 'dropping';

export class GathererComponent implements Component {
  private unit: Unit;
  public state: GathererState = 'idle';
  private gatherRate: number;
  private capacity: number;
  private carried: number = 0;
  private gatherTimer: number = 0;
  private mineX: number = -1;
  private mineY: number = -1;
  private dropX: number = -1;
  private dropY: number = -1;

  private onMineExhausted: (data: { tileX: number; tileY: number }) => void;
  private onEntityDied: (data: { entity: any; killer: any }) => void;

  constructor(unit: Unit, gatherRate: number, capacity: number) {
    this.unit = unit;
    this.gatherRate = gatherRate;
    this.capacity = capacity;

    this.onMineExhausted = (data) => {
      if (data.tileX !== this.mineX || data.tileY !== this.mineY) return;
      if (this.carried > 0) {
        this.state = 'moving-to-drop';
        EventBus.emit('request-path', {
          unit: this.unit,
          targetX: this.dropX,
          targetY: this.dropY,
        });
      } else {
        this.state = 'idle';
      }
    };
    EventBus.on('mine-exhausted', this.onMineExhausted);

    this.onEntityDied = (data) => {
      const { entity } = data;
      if (!(entity instanceof Building) || entity.team !== 'player') return;
      const coversX = this.dropX >= entity.tileX && this.dropX <= entity.tileX + entity.tileWidth - 1;
      const coversY = this.dropY >= entity.tileY && this.dropY <= entity.tileY + entity.tileHeight - 1;
      if (!coversX || !coversY) return;
      if (this.carried > 0) {
        EventBus.emit('gold-gathered', { amount: this.carried, unit: this.unit });
        this.carried = 0;
      }
      this.state = 'idle';
    };
    EventBus.on('entity-died', this.onEntityDied);
  }

  assignMine(mineX: number, mineY: number, dropX: number, dropY: number): void {
    this.mineX = mineX;
    this.mineY = mineY;
    this.dropX = dropX;
    this.dropY = dropY;
    this.state = 'moving-to-mine';
  }

  setGatherRate(rate: number): void {
    this.gatherRate = rate;
  }

  getGatherRate(): number {
    return this.gatherRate;
  }

  getCapacity(): number {
    return this.capacity;
  }

  setCapacity(cap: number): void {
    this.capacity = cap;
  }

  isGathering(): boolean {
    return this.state !== 'idle';
  }

  update(delta: number): void {
    if (this.state === 'idle') return;

    const mover = this.unit.getComponent<MoverComponent>('mover');
    if (!mover) return;

    switch (this.state) {
      case 'moving-to-mine':
        if (!mover.isMoving()) {
          if (Math.abs(this.unit.tileX - this.mineX) <= 1 && Math.abs(this.unit.tileY - this.mineY) <= 1) {
            this.state = 'gathering';
            this.gatherTimer = 0;
          }
        }
        break;

      case 'gathering':
        this.gatherTimer += delta;
        if (this.gatherTimer >= 1000 / this.gatherRate) {
          this.carried++;
          this.gatherTimer = 0;
          EventBus.emit('mine-tick', { mineX: this.mineX, mineY: this.mineY });
          EventBus.emit('floating-text-3d', { tileX: this.unit.tileX, tileY: this.unit.tileY, text: '+1', color: '#ffd700' });
          if (this.carried >= this.capacity) {
            this.state = 'moving-to-drop';
            EventBus.emit('request-path', {
              unit: this.unit,
              targetX: this.dropX,
              targetY: this.dropY,
            });
          }
        }
        break;

      case 'moving-to-drop':
        if (!mover.isMoving()) {
          if (Math.abs(this.unit.tileX - this.dropX) <= 1 && Math.abs(this.unit.tileY - this.dropY) <= 1) {
            this.state = 'dropping';
          }
        }
        break;

      case 'dropping':
        EventBus.emit('gold-gathered', { amount: this.carried, unit: this.unit });
        this.carried = 0;
        this.state = 'moving-to-mine';
        EventBus.emit('request-path', {
          unit: this.unit,
          targetX: this.mineX,
          targetY: this.mineY,
        });
        break;
    }
  }

  destroy(): void {
    this.state = 'idle';
    EventBus.off('mine-exhausted', this.onMineExhausted);
    EventBus.off('entity-died', this.onEntityDied);
  }
}
