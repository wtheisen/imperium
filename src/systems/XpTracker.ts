import { EventBus } from '../EventBus';
import { Unit } from '../entities/Unit';
import { Entity } from '../entities/Entity';
import { getCardInstance } from '../state/PlayerState';

export class XpTracker {
  private sessionXp: Record<string, number> = {};

  constructor() {
    EventBus.on('entity-died', this.onEntityDied, this);
    EventBus.on('damage-dealt', this.onDamageDealt, this);
    EventBus.on('gold-gathered', this.onGoldGathered, this);
  }

  private addXp(unit: Unit, amount: number, isKill = false): void {
    if (!unit.unitType) return;
    unit.xp += amount;
    this.sessionXp[unit.unitType] = (this.sessionXp[unit.unitType] || 0) + amount;

    // Write back to the persistent CardInstance
    if (unit.cardInstanceId) {
      const inst = getCardInstance(unit.cardInstanceId);
      if (inst) {
        inst.xp += amount;
        if (isKill && inst.veteranData) {
          inst.veteranData.kills += 1;
        }
      }
    }
  }

  private onEntityDied({ entity, killer }: { entity: Entity; killer?: Entity }): void {
    // Award XP to the killer
    if (killer && killer.team === 'player' && killer instanceof Unit && entity.team !== 'player') {
      this.addXp(killer, 10, /* isKill */ true);
    }

    // Permadeath: revert veteran data if a named player unit dies
    if (entity instanceof Unit && entity.team === 'player' && entity.cardInstanceId) {
      const inst = getCardInstance(entity.cardInstanceId);
      if (inst?.veteranData) {
        const fallenName = inst.veteranData.name;
        inst.veteranData = undefined;
        inst.xp = 0;
        entity.cardInstanceId = undefined;
        EventBus.emit('veteran-killed', { name: fallenName, instanceId: inst.instanceId });
      }
    }
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

  /** No-op — XP is committed in real-time. Kept for API compatibility. */
  commitToPlayerState(): void {}

  destroy(): void {
    EventBus.off('entity-died', this.onEntityDied, this);
    EventBus.off('damage-dealt', this.onDamageDealt, this);
    EventBus.off('gold-gathered', this.onGoldGathered, this);
  }
}
