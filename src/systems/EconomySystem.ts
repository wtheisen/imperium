import { STARTING_GOLD, KILL_GOLD_BASE, OBJECTIVE_COMPLETION_BONUS } from '../config';
import { EventBus } from '../EventBus';
import { getActiveModifiers } from '../state/PlayerState';
import { getMergedEffects } from '../state/DifficultyModifiers';
import { getPassiveIncomeRate, getGoldPerKill, getGoldPerCardPlayed, getObjectiveGoldBonus } from '../ship/ShipState';

export class EconomySystem {
  private gold: number;
  private passiveIncomeTimer: number = 0;

  constructor(startingGold?: number) {
    this.gold = startingGold ?? STARTING_GOLD;
    EventBus.emit('gold-changed', { amount: 0, total: this.gold });

    EventBus.on('entity-died', this.onEntityDied, this);
    EventBus.on('gold-gathered', this.onGoldGathered, this);
    EventBus.on('objective-completed', this.onObjectiveCompleted, this);
    EventBus.on('supply-drop', this.onSupplyDrop, this);
    EventBus.on('card-played', this.onCardPlayed, this);
  }

  getGold(): number {
    return this.gold;
  }

  canAfford(cost: number): boolean {
    return this.gold >= cost;
  }

  spend(amount: number): boolean {
    if (this.gold < amount) return false;
    this.gold -= amount;
    EventBus.emit('gold-changed', { amount: -amount, total: this.gold });
    return true;
  }

  addGold(amount: number): void {
    const effects = getMergedEffects(getActiveModifiers());
    const adjusted = effects.goldMult ? Math.round(amount * effects.goldMult) : amount;
    this.gold += adjusted;
    EventBus.emit('gold-changed', { amount: adjusted, total: this.gold });
  }

  private onEntityDied({ entity, killer }: { entity: any; killer?: any }): void {
    if (entity.team === 'enemy' && killer && killer.team === 'player') {
      this.addGold(KILL_GOLD_BASE + getGoldPerKill());
    }
  }

  private onGoldGathered({ amount }: { amount: number }): void {
    this.addGold(amount);
  }

  private onObjectiveCompleted({ goldReward }: { objectiveId: string; goldReward: number; cardDraws: number }): void {
    const bonus = getObjectiveGoldBonus();
    const total = bonus > 0 ? Math.round(goldReward * (1 + bonus)) : goldReward;
    this.addGold(total);
  }

  private onCardPlayed(_data: any): void {
    const bonus = getGoldPerCardPlayed();
    if (bonus > 0) this.addGold(bonus);
  }

  update(delta: number): void {
    const rate = getPassiveIncomeRate();
    if (rate > 0) {
      this.passiveIncomeTimer += delta;
      if (this.passiveIncomeTimer >= 10000) {
        this.passiveIncomeTimer -= 10000;
        this.addGold(Math.round(rate));
      }
    }
  }

  private onSupplyDrop({ gold }: { gold: number }): void {
    this.addGold(gold);
  }

  destroy(): void {
    EventBus.off('entity-died', this.onEntityDied, this);
    EventBus.off('gold-gathered', this.onGoldGathered, this);
    EventBus.off('objective-completed', this.onObjectiveCompleted, this);
    EventBus.off('supply-drop', this.onSupplyDrop, this);
    EventBus.off('card-played', this.onCardPlayed, this);
  }
}
