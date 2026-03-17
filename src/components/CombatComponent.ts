import { Component, Entity } from '../entities/Entity';
import { HealthComponent } from './HealthComponent';
import { IsoHelper } from '../map/IsoHelper';
import { Projectile } from '../entities/Projectile';

export class CombatComponent implements Component {
  private entity: Entity;
  private damage: number;
  private range: number;
  private cooldown: number;
  private isRanged: boolean;
  private cooldownTimer: number = 0;
  public target: Entity | null = null;

  constructor(entity: Entity, damage: number, range: number, cooldown: number, isRanged: boolean) {
    this.entity = entity;
    this.damage = damage;
    this.range = range;
    this.cooldown = cooldown;
    this.isRanged = isRanged;
  }

  setTarget(target: Entity | null): void {
    this.target = target;
  }

  getDamage(): number {
    return this.damage;
  }

  setDamage(damage: number): void {
    this.damage = damage;
  }

  getRange(): number {
    return this.range;
  }

  setRange(range: number): void {
    this.range = range;
  }

  getCooldown(): number {
    return this.cooldown;
  }

  setCooldown(cooldown: number): void {
    this.cooldown = cooldown;
  }

  isInRange(target: Entity): boolean {
    const dist = IsoHelper.tileDistance(this.entity.tileX, this.entity.tileY, target.tileX, target.tileY);
    return dist <= this.range;
  }

  update(delta: number): void {
    if (this.cooldownTimer > 0) {
      this.cooldownTimer -= delta;
    }

    if (!this.target || !this.target.active) {
      this.target = null;
      return;
    }

    if (!this.isInRange(this.target)) return;

    if (this.cooldownTimer <= 0) {
      this.attack(this.target);
      this.cooldownTimer = this.cooldown;
    }
  }

  private attack(target: Entity): void {
    const health = target.getComponent<HealthComponent>('health');
    if (!health) return;

    if (this.isRanged) {
      new Projectile(
        this.entity.tileX, this.entity.tileY,
        target.tileX, target.tileY,
        () => {
          if (target.active) {
            health.takeDamage(this.damage, this.entity);
          }
        }
      );
    } else {
      health.takeDamage(this.damage, this.entity);
    }
  }

  destroy(): void {
    this.target = null;
  }
}
