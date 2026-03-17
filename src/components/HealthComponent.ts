import { Component, Entity } from '../entities/Entity';
import { EventBus } from '../EventBus';
import { TechPassiveComponent } from './TechPassiveComponent';

export class HealthComponent implements Component {
  private entity: Entity;
  public maxHp: number;
  public currentHp: number;
  public armor: number = 0;
  private invulnerable: boolean = false;

  constructor(entity: Entity, maxHp: number) {
    this.entity = entity;
    this.maxHp = maxHp;
    this.currentHp = maxHp;
  }

  setInvulnerable(value: boolean): void {
    this.invulnerable = value;
  }

  takeDamage(amount: number, attacker?: Entity): void {
    if (this.invulnerable) {
      this.spawnFloatingText('INVULNERABLE', '#44ffff');
      return;
    }

    const techPassive = this.entity.getComponent<TechPassiveComponent>('techPassive');
    if (techPassive) {
      if (techPassive.shouldDodge()) {
        this.spawnFloatingText('DODGE', '#00ccff');
        return;
      }
      if (techPassive.shouldBlock()) {
        this.spawnFloatingText('BLOCKED', '#ffcc00');
        return;
      }
      if (techPassive.hasDamageShield()) {
        techPassive.consumeDamageShield();
        this.spawnFloatingText('SHIELDED', '#44ffff');
        return;
      }
    }

    const reduced = Math.max(1, amount - this.armor);
    this.currentHp = Math.max(0, this.currentHp - reduced);

    this.spawnFloatingNumber(-reduced, '#ff4444');

    if (attacker) {
      EventBus.emit('damage-dealt', { attacker, target: this.entity, amount: reduced });
    }

    if (this.currentHp <= 0) {
      EventBus.emit('entity-died', { entity: this.entity, killer: attacker });
    }
  }

  heal(amount: number): void {
    const prevHp = this.currentHp;
    this.currentHp = Math.min(this.maxHp, this.currentHp + amount);
    const actualHeal = this.currentHp - prevHp;

    if (actualHeal > 0) {
      this.spawnFloatingNumber(actualHeal, '#44ff44');
    }
  }

  private spawnFloatingNumber(amount: number, color: string): void {
    const label = amount > 0 ? `+${amount}` : `${amount}`;
    EventBus.emit('floating-text-3d', { tileX: this.entity.tileX, tileY: this.entity.tileY, text: label, color });
  }

  private spawnFloatingText(label: string, color: string): void {
    EventBus.emit('floating-text-3d', { tileX: this.entity.tileX, tileY: this.entity.tileY, text: label, color });
  }

  isDead(): boolean {
    return this.currentHp <= 0;
  }

  update(_delta: number): void {
    // HP bar rendering is handled by VFXRenderer.syncHpBars()
  }

  destroy(): void {
    // No-op — no Phaser objects to clean up
  }
}
