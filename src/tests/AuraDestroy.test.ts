import { describe, it, expect, vi } from 'vitest';
import { Entity } from '../entities/Entity';
import { AuraComponent, AuraConfig } from '../components/AuraComponent';
import { CombatComponent } from '../components/CombatComponent';
import { HealthComponent } from '../components/HealthComponent';

// Stub IsoHelper.tileDistance — all entities are within range (distance 1)
vi.mock('../map/IsoHelper', () => ({
  IsoHelper: {
    tileDistance: () => 1,
    tileToScreen: () => ({ x: 0, y: 0 }),
    screenToTile: () => ({ x: 0, y: 0 }),
  },
}));

vi.mock('../EventBus', () => ({
  EventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
}));

function makeEntity(team: 'player' | 'enemy' = 'player'): Entity {
  return new Entity(5, 5, team);
}

describe('AuraComponent destroy cleanup', () => {
  it('reverses damage boost on living entities when destroyed', () => {
    const building = makeEntity('player');
    const marine = makeEntity('player');

    const baseDamage = 10;
    const boost = 3;
    const combat = new CombatComponent(marine, baseDamage, 1, 1000, false);
    marine.addComponent('combat', combat);

    const config: AuraConfig = { damageBoost: boost, boostRadius: 5 };
    const getEntities = () => [building, marine];
    const aura = new AuraComponent(building, config, getEntities);
    building.addComponent('aura', aura);

    // Tick the aura to apply the boost
    aura.update(AuraComponent['AURA_INTERVAL']);
    expect(combat.getDamage()).toBe(baseDamage + boost);

    // Destroy aura — boost should be reversed
    aura.destroy();
    expect(combat.getDamage()).toBe(baseDamage);
  });

  it('reverses armor boost on living entities when destroyed', () => {
    const building = makeEntity('player');
    const marine = makeEntity('player');

    const health = new HealthComponent(marine, 100);
    health.armor = 2;
    marine.addComponent('health', health);

    const boost = 5;
    const config: AuraConfig = { armorBoost: boost, armorRadius: 5 };
    const getEntities = () => [building, marine];
    const aura = new AuraComponent(building, config, getEntities);
    building.addComponent('aura', aura);

    aura.update(AuraComponent['AURA_INTERVAL']);
    expect(health.armor).toBe(2 + boost);

    aura.destroy();
    expect(health.armor).toBe(2);
  });

  it('skips cleanup gracefully when getEntitiesFn throws', () => {
    const building = makeEntity('player');
    const config: AuraConfig = { damageBoost: 3, boostRadius: 5 };
    const getEntities = () => { throw new Error('EntityManager destroyed'); };
    const aura = new AuraComponent(building, config, getEntities);
    building.addComponent('aura', aura);

    // Should not throw
    expect(() => aura.destroy()).not.toThrow();
  });

  it('propagates errors from cleanup code (not silently swallowed)', () => {
    const building = makeEntity('player');
    const marine = makeEntity('player');

    // Create a combat component with a sabotaged getDamage
    const combat = new CombatComponent(marine, 10, 1, 1000, false);
    marine.addComponent('combat', combat);

    const config: AuraConfig = { damageBoost: 3, boostRadius: 5 };
    const getEntities = () => [building, marine];
    const aura = new AuraComponent(building, config, getEntities);
    building.addComponent('aura', aura);

    // Apply the boost first
    aura.update(AuraComponent['AURA_INTERVAL']);

    // Sabotage getDamage to throw during cleanup
    combat.getDamage = () => { throw new Error('component error'); };

    // Error should propagate, not be silently swallowed
    expect(() => aura.destroy()).toThrow('component error');
  });
});
