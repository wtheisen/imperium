import { EventBus } from '../EventBus';
import { Entity } from '../entities/Entity';
import { Unit } from '../entities/Unit';
import { Card } from '../cards/Card';

export interface KillEvent {
  timestamp: number;
  killerType: string;
  victimType: string;
  killerTeam: string;
  victimTeam: string;
}

export interface BattleReport {
  killTimeline: KillEvent[];
  damageDealt: Record<string, number>;
  damageTaken: Record<string, number>;
  goldBySource: {
    mines: number;
    objectives: number;
    supplyDrops: number;
    other: number;
  };
  totalGoldEarned: number;
  cardPlays: Record<string, { count: number; totalCost: number }>;
  unitsDeployed: Record<string, number>;
  unitsLost: Record<string, number>;
  mvpUnitType: string | null;
  mvpKills: number;
  durationMs: number;
}

export class BattleRecorder {
  private startTime: number;
  private killTimeline: KillEvent[] = [];
  private damageDealt: Record<string, number> = {};
  private damageTaken: Record<string, number> = {};
  private goldBySource = { mines: 0, objectives: 0, supplyDrops: 0, other: 0 };
  private totalGoldEarned = 0;
  private cardPlays: Record<string, { count: number; totalCost: number }> = {};
  private unitsDeployed: Record<string, number> = {};
  private unitsLost: Record<string, number> = {};
  private killsByUnitType: Record<string, number> = {};

  // Track gold source context — set before gold-changed fires
  private pendingGoldSource: keyof typeof this.goldBySource | null = null;

  constructor() {
    this.startTime = Date.now();

    EventBus.on('entity-died', this.onEntityDied, this);
    EventBus.on('damage-dealt', this.onDamageDealt, this);
    EventBus.on('gold-gathered', this.onGoldGathered, this);
    EventBus.on('objective-completed', this.onObjectiveCompleted, this);
    EventBus.on('supply-drop', this.onSupplyDrop, this);
    EventBus.on('gold-changed', this.onGoldChanged, this);
    EventBus.on('card-played', this.onCardPlayed, this);
  }

  private getEntityType(entity: Entity): string {
    if (entity instanceof Unit) return entity.unitType || 'unknown';
    return (entity as any).buildingType || 'building';
  }

  private onEntityDied({ entity, killer }: { entity: Entity; killer?: Entity }): void {
    const victimType = this.getEntityType(entity);
    const killerType = killer ? this.getEntityType(killer) : 'unknown';

    this.killTimeline.push({
      timestamp: Date.now() - this.startTime,
      killerType,
      victimType,
      killerTeam: killer?.team ?? 'unknown',
      victimTeam: entity.team,
    });

    // Track kills by player unit type
    if (killer && killer.team === 'player' && entity.team === 'enemy') {
      this.killsByUnitType[killerType] = (this.killsByUnitType[killerType] || 0) + 1;
    }

    // Track units lost
    if (entity.team === 'player' && entity instanceof Unit) {
      this.unitsLost[victimType] = (this.unitsLost[victimType] || 0) + 1;
    }
  }

  private onDamageDealt({ attacker, target, amount }: { attacker: Entity; target: Entity; amount: number }): void {
    const attackerType = this.getEntityType(attacker);
    if (attacker.team === 'player') {
      this.damageDealt[attackerType] = (this.damageDealt[attackerType] || 0) + amount;
    }
    if (target.team === 'player') {
      const targetType = this.getEntityType(target);
      this.damageTaken[targetType] = (this.damageTaken[targetType] || 0) + amount;
    }
  }

  private onGoldGathered(): void {
    this.pendingGoldSource = 'mines';
  }

  private onObjectiveCompleted(): void {
    this.pendingGoldSource = 'objectives';
  }

  private onSupplyDrop(): void {
    this.pendingGoldSource = 'supplyDrops';
  }

  private onGoldChanged({ amount }: { amount: number }): void {
    if (amount <= 0) return;
    this.totalGoldEarned += amount;

    if (this.pendingGoldSource) {
      this.goldBySource[this.pendingGoldSource] += amount;
      this.pendingGoldSource = null;
    } else {
      // Kill gold, passive income, and other untagged sources
      this.goldBySource.other += amount;
    }
  }

  private onCardPlayed({ card }: { card: Card }): void {
    const id = card.id;
    if (!this.cardPlays[id]) {
      this.cardPlays[id] = { count: 0, totalCost: 0 };
    }
    this.cardPlays[id].count += 1;
    this.cardPlays[id].totalCost += card.cost;

    // Track unit deployments
    if ((card.type === 'unit' || card.type === 'building') && card.entityType) {
      this.unitsDeployed[card.entityType] = (this.unitsDeployed[card.entityType] || 0) + 1;
    }
  }

  getReport(): BattleReport {
    // Find MVP — unit type with most kills
    let mvpUnitType: string | null = null;
    let mvpKills = 0;
    for (const [type, kills] of Object.entries(this.killsByUnitType)) {
      if (kills > mvpKills) {
        mvpKills = kills;
        mvpUnitType = type;
      }
    }

    return {
      killTimeline: this.killTimeline,
      damageDealt: this.damageDealt,
      damageTaken: this.damageTaken,
      goldBySource: this.goldBySource,
      totalGoldEarned: this.totalGoldEarned,
      cardPlays: this.cardPlays,
      unitsDeployed: this.unitsDeployed,
      unitsLost: this.unitsLost,
      mvpUnitType,
      mvpKills,
      durationMs: Date.now() - this.startTime,
    };
  }

  destroy(): void {
    EventBus.off('entity-died', this.onEntityDied, this);
    EventBus.off('damage-dealt', this.onDamageDealt, this);
    EventBus.off('gold-gathered', this.onGoldGathered, this);
    EventBus.off('objective-completed', this.onObjectiveCompleted, this);
    EventBus.off('supply-drop', this.onSupplyDrop, this);
    EventBus.off('gold-changed', this.onGoldChanged, this);
    EventBus.off('card-played', this.onCardPlayed, this);
  }
}
