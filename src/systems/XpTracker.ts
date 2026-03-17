import { EventBus } from '../EventBus';
import { Unit } from '../entities/Unit';
import { Entity } from '../entities/Entity';
import { addUnitXp } from '../state/PlayerState';

export class XpTracker {
  private sessionXp: Record<string, number> = {};

  constructor() {
    EventBus.on('entity-died', this.onEntityDied, this);
    EventBus.on('damage-dealt', this.onDamageDealt, this);
    EventBus.on('gold-gathered', this.onGoldGathered, this);
  }

  private addXp(unit: Unit, amount: number): void {
    if (!unit.unitType) return;
    // Per-unit XP
    unit.xp += amount;
    // Also track per-type session totals and update PlayerState
    this.sessionXp[unit.unitType] = (this.sessionXp[unit.unitType] || 0) + amount;
    addUnitXp(unit.unitType, amount);
  }

  private onEntityDied({ entity, killer }: { entity: Entity; killer?: Entity }): void {
    if (!killer || killer.team !== 'player') return;
    if (!(killer instanceof Unit)) return;
    if (entity.team === 'player') return;
    this.addXp(killer, 10);
  }

  private onDamageDealt({ attacker, target, amount }: { attacker: Entity; target: Entity; amount: number }): void {
    if (attacker.team !== 'player') return;
    if (!(attacker instanceof Unit)) return;
    if (target.team === 'player') return;
    const xp = Math.max(1, Math.floor(amount / 3));
    this.addXp(attacker, xp);
  }

  private onGoldGathered({ amount, unit }: { amount: number; unit?: Unit }): void {
    if (!unit || unit.team !== 'player') return;
    this.addXp(unit, amount);
  }

  getSessionXp(): Record<string, number> {
    return { ...this.sessionXp };
  }

  /** No-op — XP is now committed in real-time. Kept for API compatibility. */
  commitToPlayerState(): void {
    // XP already committed incrementally in addXp()
  }

  destroy(): void {
    EventBus.off('entity-died', this.onEntityDied, this);
    EventBus.off('damage-dealt', this.onDamageDealt, this);
    EventBus.off('gold-gathered', this.onGoldGathered, this);
  }
}
