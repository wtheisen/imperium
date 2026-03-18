import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EconomySystem } from '../systems/EconomySystem';
import { EventBus } from '../EventBus';

describe('EconomySystem', () => {
  let economy: EconomySystem;

  beforeEach(() => {
    economy = new EconomySystem(100);
  });

  afterEach(() => {
    economy.destroy();
    EventBus.removeAllListeners();
  });

  describe('basic operations', () => {
    it('starts with specified gold', () => {
      expect(economy.getGold()).toBe(100);
    });

    it('canAfford returns true when enough gold', () => {
      expect(economy.canAfford(50)).toBe(true);
      expect(economy.canAfford(100)).toBe(true);
    });

    it('canAfford returns false when not enough gold', () => {
      expect(economy.canAfford(101)).toBe(false);
    });

    it('spend deducts gold', () => {
      expect(economy.spend(30)).toBe(true);
      expect(economy.getGold()).toBe(70);
    });

    it('spend fails when insufficient gold', () => {
      expect(economy.spend(200)).toBe(false);
      expect(economy.getGold()).toBe(100);
    });

    it('addGold increases gold', () => {
      economy.addGold(50);
      expect(economy.getGold()).toBe(150);
    });
  });

  describe('event-driven income', () => {
    it('gains gold on enemy kill', () => {
      EventBus.emit('entity-died', {
        entity: { team: 'enemy' },
        killer: { team: 'player' },
      });
      expect(economy.getGold()).toBeGreaterThan(100);
    });

    it('ignores friendly kills', () => {
      EventBus.emit('entity-died', {
        entity: { team: 'player' },
        killer: { team: 'enemy' },
      });
      expect(economy.getGold()).toBe(100);
    });

    it('gains gold from gathering', () => {
      EventBus.emit('gold-gathered', { amount: 10 });
      expect(economy.getGold()).toBe(110);
    });

    it('gains gold from supply drops', () => {
      EventBus.emit('supply-drop', { gold: 25 });
      expect(economy.getGold()).toBe(125);
    });

    it('gains gold from objective completion', () => {
      EventBus.emit('objective-completed', { objectiveId: 'obj1', goldReward: 15, cardDraws: 2 });
      expect(economy.getGold()).toBe(115);
    });
  });

  describe('events emitted', () => {
    it('emits gold-changed on spend', () => {
      let received: { amount: number; total: number } | null = null;
      EventBus.on('gold-changed', (data: { amount: number; total: number }) => { received = data; });
      economy.spend(20);
      expect(received).toEqual({ amount: -20, total: 80 });
    });

    it('emits gold-changed on addGold', () => {
      let received: { amount: number; total: number } | null = null;
      EventBus.on('gold-changed', (data: { amount: number; total: number }) => { received = data; });
      economy.addGold(10);
      expect(received).toEqual({ amount: 10, total: 110 });
    });
  });
});
