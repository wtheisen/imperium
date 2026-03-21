import { describe, it, expect, afterEach } from 'vitest';
import { EconomySystem } from '../systems/EconomySystem';
import { EventBus } from '../EventBus';

describe('EconomySystem mutator integration', () => {
  let economy: EconomySystem;

  afterEach(() => {
    economy?.destroy();
    EventBus.removeAllListeners();
  });

  it('mutator-gold positive adds gold', () => {
    economy = new EconomySystem(50);
    EventBus.emit('mutator-gold', { amount: 10, reason: 'blood_tithe_kill' });
    expect(economy.getGold()).toBe(60);
  });

  it('mutator-gold negative removes gold', () => {
    economy = new EconomySystem(50);
    EventBus.emit('mutator-gold', { amount: -8, reason: 'blood_tithe_death' });
    expect(economy.getGold()).toBe(42);
  });

  it('mutator-gold negative does not go below 0', () => {
    economy = new EconomySystem(3);
    EventBus.emit('mutator-gold', { amount: -10, reason: 'blood_tithe_death' });
    expect(economy.getGold()).toBe(0);
  });
});
