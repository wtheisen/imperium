import { describe, it, expect, afterEach } from 'vitest';
import { CardEffects } from '../cards/CardEffects';
import { Entity } from '../entities/Entity';
import { MoverComponent } from '../components/MoverComponent';
import { CombatComponent } from '../components/CombatComponent';
import { HealthComponent } from '../components/HealthComponent';
import { TimerManager } from '../utils/TimerManager';
import { EventBus } from '../EventBus';
import type { Card } from '../cards/Card';

// Minimal stubs so CardEffects can be instantiated without a full game world
function makeEconomy(gold = 999) {
  return { canAfford: () => true, spend: () => {}, getGold: () => gold } as any;
}

function makeEntityManager(enemyEntities: Entity[] = [], playerEntities: Entity[] = []) {
  return {
    getEntitiesByTeam: (team: string) => team === 'enemy' ? enemyEntities : playerEntities,
    getUnits: () => [],
    getEntitiesAtTile: () => [],
    spawnUnit: () => ({ active: true, addComponent: () => {}, getComponent: () => undefined }),
    spawnBuilding: () => null,
  } as any;
}

function makeEntity(tileX: number, tileY: number, team: 'player' | 'enemy', speed: number, cooldown?: number) {
  const e = new Entity(tileX, tileY, team);
  // MoverComponent requires a Unit, but only uses unit.tileX/Y for fracTile init — cast to any
  const mover = new MoverComponent(e as any, speed);
  mover.setPath([{ x: tileX + 1, y: tileY }]); // give it a path so isMoving() = true
  e.addComponent('mover', mover);
  if (cooldown !== undefined) {
    const combat = new CombatComponent(e, 5, 1, cooldown, false);
    e.addComponent('combat', combat);
  }
  return e;
}

function ordnanceCard(effect: string, radius = 3, value = 4000): Card {
  return { id: 'test', name: 'Test', type: 'ordnance', cost: 0, ordnanceEffect: effect, ordnanceRadius: radius, ordnanceValue: value } as Card;
}

describe('CardEffects ordnance AoE helpers', () => {
  afterEach(() => {
    TimerManager.get().clear();
    EventBus.removeAllListeners();
  });

  describe('ordnanceStasis', () => {
    it('sets speed to 0 and stops mover for enemies in radius', () => {
      const enemy = makeEntity(5, 5, 'enemy', 2, 1000);
      const fx = new CardEffects(makeEntityManager([enemy]), makeEconomy());
      fx.castOrdnance(ordnanceCard('stasis', 3, 4000), 5, 5);
      const mover = enemy.getComponent<MoverComponent>('mover')!;
      expect(mover.getSpeed()).toBe(0);
      expect(mover.isMoving()).toBe(false);
    });

    it('sets combat cooldown to 999999', () => {
      const enemy = makeEntity(5, 5, 'enemy', 2, 1000);
      const fx = new CardEffects(makeEntityManager([enemy]), makeEconomy());
      fx.castOrdnance(ordnanceCard('stasis', 3, 4000), 5, 5);
      const combat = enemy.getComponent<CombatComponent>('combat')!;
      expect(combat.getCooldown()).toBe(999999);
    });

    it('restores speed and cooldown after duration', () => {
      const enemy = makeEntity(5, 5, 'enemy', 2, 1000);
      const fx = new CardEffects(makeEntityManager([enemy]), makeEconomy());
      fx.castOrdnance(ordnanceCard('stasis', 3, 4000), 5, 5);
      TimerManager.get().update(4001);
      const mover = enemy.getComponent<MoverComponent>('mover')!;
      const combat = enemy.getComponent<CombatComponent>('combat')!;
      expect(mover.getSpeed()).toBe(2);
      expect(combat.getCooldown()).toBe(1000);
    });

    it('does not affect enemies outside radius', () => {
      const far = makeEntity(10, 10, 'enemy', 2, 1000);
      const fx = new CardEffects(makeEntityManager([far]), makeEconomy());
      fx.castOrdnance(ordnanceCard('stasis', 3, 4000), 5, 5);
      expect(far.getComponent<MoverComponent>('mover')!.getSpeed()).toBe(2);
    });

    it('emits ordnance-vfx-3d with type stasis', () => {
      const events: any[] = [];
      EventBus.on('ordnance-vfx-3d', (e) => events.push(e));
      const fx = new CardEffects(makeEntityManager([]), makeEconomy());
      fx.castOrdnance(ordnanceCard('stasis', 3, 4000), 7, 8);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: 'stasis', tileX: 7, tileY: 8, radius: 3, durationMs: 4000 });
    });
  });

  describe('ordnanceSmoke', () => {
    it('reduces enemy speed to 30% and triples combat cooldown', () => {
      const enemy = makeEntity(5, 5, 'enemy', 4, 1000);
      const fx = new CardEffects(makeEntityManager([enemy]), makeEconomy());
      fx.castOrdnance(ordnanceCard('smoke', 3, 5000), 5, 5);
      const mover = enemy.getComponent<MoverComponent>('mover')!;
      const combat = enemy.getComponent<CombatComponent>('combat')!;
      expect(mover.getSpeed()).toBeCloseTo(1.2); // 4 * 0.3
      expect(combat.getCooldown()).toBe(3000);   // 1000 * 3
    });

    it('does not call mover.stop() (speed > 0)', () => {
      const enemy = makeEntity(5, 5, 'enemy', 4, 1000);
      const fx = new CardEffects(makeEntityManager([enemy]), makeEconomy());
      fx.castOrdnance(ordnanceCard('smoke', 3, 5000), 5, 5);
      expect(enemy.getComponent<MoverComponent>('mover')!.isMoving()).toBe(true);
    });

    it('restores speed and cooldown after duration', () => {
      const enemy = makeEntity(5, 5, 'enemy', 4, 1000);
      const fx = new CardEffects(makeEntityManager([enemy]), makeEconomy());
      fx.castOrdnance(ordnanceCard('smoke', 3, 5000), 5, 5);
      TimerManager.get().update(5001);
      expect(enemy.getComponent<MoverComponent>('mover')!.getSpeed()).toBe(4);
      expect(enemy.getComponent<CombatComponent>('combat')!.getCooldown()).toBe(1000);
    });
  });

  describe('ordnanceRally', () => {
    it('boosts player speed by 1.5x', () => {
      const ally = makeEntity(5, 5, 'player', 2);
      const fx = new CardEffects(makeEntityManager([], [ally]), makeEconomy());
      fx.castOrdnance(ordnanceCard('rally', 4, 5000), 5, 5);
      expect(ally.getComponent<MoverComponent>('mover')!.getSpeed()).toBe(3); // 2 * 1.5
    });

    it('does not modify combat component', () => {
      const ally = makeEntity(5, 5, 'player', 2, 1000);
      const fx = new CardEffects(makeEntityManager([], [ally]), makeEconomy());
      fx.castOrdnance(ordnanceCard('rally', 4, 5000), 5, 5);
      expect(ally.getComponent<CombatComponent>('combat')!.getCooldown()).toBe(1000);
    });

    it('restores speed after duration', () => {
      const ally = makeEntity(5, 5, 'player', 2);
      const fx = new CardEffects(makeEntityManager([], [ally]), makeEconomy());
      fx.castOrdnance(ordnanceCard('rally', 4, 5000), 5, 5);
      TimerManager.get().update(5001);
      expect(ally.getComponent<MoverComponent>('mover')!.getSpeed()).toBe(2);
    });

    it('does not affect enemies', () => {
      const enemy = makeEntity(5, 5, 'enemy', 2);
      const fx = new CardEffects(makeEntityManager([enemy], []), makeEconomy());
      fx.castOrdnance(ordnanceCard('rally', 4, 5000), 5, 5);
      expect(enemy.getComponent<MoverComponent>('mover')!.getSpeed()).toBe(2);
    });
  });

  describe('emitOrdnanceVfx (via heal/barrage/vortex)', () => {
    it('heal emits ordnance-vfx-3d with type heal when entities healed', () => {
      const events: any[] = [];
      EventBus.on('ordnance-vfx-3d', (e) => events.push(e));
      // ally with health component
      const ally = makeEntity(5, 5, 'player', 2);
      ally.addComponent('health', new HealthComponent(ally as any, 50));
      const fx = new CardEffects(makeEntityManager([], [ally]), makeEconomy());
      fx.castOrdnance({ id: 'test', name: 'Test', type: 'ordnance', cost: 0, ordnanceEffect: 'narthecium', ordnanceRadius: 3, ordnanceValue: 20 } as Card, 5, 5);
      expect(events[0]).toMatchObject({ type: 'heal', tileX: 5, tileY: 5 });
    });

    it('barrage emits ordnance-vfx-3d with type fireball', () => {
      const events: any[] = [];
      EventBus.on('ordnance-vfx-3d', (e) => events.push(e));
      const fx = new CardEffects(makeEntityManager([]), makeEconomy());
      fx.castOrdnance({ id: 'test', name: 'Test', type: 'ordnance', cost: 0, ordnanceEffect: 'lance_strike', ordnanceRadius: 3, ordnanceValue: 30 } as Card, 3, 4);
      expect(events[0]).toMatchObject({ type: 'fireball', tileX: 3, tileY: 4 });
    });

    it('rally emits ordnance-vfx-3d with type heal', () => {
      const events: any[] = [];
      EventBus.on('ordnance-vfx-3d', (e) => events.push(e));
      const fx = new CardEffects(makeEntityManager([], []), makeEconomy());
      fx.castOrdnance(ordnanceCard('rally', 4, 5000), 2, 3);
      expect(events[0]).toMatchObject({ type: 'heal', tileX: 2, tileY: 3 });
    });
  });
});

describe('CardEffects static lookups', () => {
  describe('getUnitStats', () => {
    it('returns stats for known unit types', () => {
      const marine = CardEffects.getUnitStats('marine');
      expect(marine).toBeDefined();
      expect(marine!.maxHp).toBeGreaterThan(0);
      expect(marine!.attackDamage).toBeGreaterThan(0);
      expect(marine!.speed).toBeGreaterThan(0);
    });

    it('servitor has gather stats', () => {
      const servitor = CardEffects.getUnitStats('servitor');
      expect(servitor).toBeDefined();
      expect(servitor!.gatherRate).toBeGreaterThan(0);
      expect(servitor!.gatherCapacity).toBeGreaterThan(0);
    });

    it('returns undefined for unknown type', () => {
      expect(CardEffects.getUnitStats('nonexistent')).toBeUndefined();
    });

    it('all unit types have required fields', () => {
      const types = ['servitor', 'guardsman', 'marine', 'scout', 'ogryn', 'techmarine', 'rhino', 'leman_russ', 'sentinel'];
      for (const type of types) {
        const stats = CardEffects.getUnitStats(type);
        expect(stats, `${type} should exist`).toBeDefined();
        expect(stats!.maxHp).toBeGreaterThan(0);
        expect(stats!.speed).toBeGreaterThan(0);
        expect(stats!.attackDamage).toBeGreaterThanOrEqual(0);
        expect(stats!.attackRange).toBeGreaterThanOrEqual(1);
        expect(stats!.attackCooldown).toBeGreaterThan(0);
        expect(typeof stats!.isRanged).toBe('boolean');
      }
    });

    it('ranged units have range > 1', () => {
      const ranged = ['guardsman', 'rhino', 'leman_russ', 'sentinel'];
      for (const type of ranged) {
        const stats = CardEffects.getUnitStats(type)!;
        expect(stats.isRanged, `${type} should be ranged`).toBe(true);
        expect(stats.attackRange, `${type} range`).toBeGreaterThan(1);
      }
    });
  });

  describe('getBuildingStats', () => {
    it('returns stats for known building types', () => {
      const tarantula = CardEffects.getBuildingStats('tarantula');
      expect(tarantula).toBeDefined();
      expect(tarantula!.maxHp).toBeGreaterThan(0);
      expect(tarantula!.attackDamage).toBeGreaterThan(0);
    });

    it('aegis has no attack', () => {
      const aegis = CardEffects.getBuildingStats('aegis');
      expect(aegis).toBeDefined();
      expect(aegis!.attackDamage).toBeUndefined();
    });

    it('returns undefined for unknown type', () => {
      expect(CardEffects.getBuildingStats('nonexistent')).toBeUndefined();
    });

    it('all building types have required fields', () => {
      const types = ['tarantula', 'aegis', 'barracks', 'drop_ship', 'sanctum'];
      for (const type of types) {
        const stats = CardEffects.getBuildingStats(type);
        expect(stats, `${type} should exist`).toBeDefined();
        expect(stats!.maxHp).toBeGreaterThan(0);
        expect(stats!.tileWidth).toBeGreaterThanOrEqual(1);
        expect(stats!.tileHeight).toBeGreaterThanOrEqual(1);
      }
    });
  });
});
