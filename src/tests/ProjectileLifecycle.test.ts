import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Entity } from '../entities/Entity';
import { HealthComponent } from '../components/HealthComponent';
import { CombatComponent } from '../components/CombatComponent';
import { CombatSystem } from '../systems/CombatSystem';
import { EventBus } from '../EventBus';
import { TimerManager } from '../utils/TimerManager';

// Minimal EntityManager mock
function mockEntityManager(entities: Map<string, Entity>) {
  return {
    getEntity: (id: string) => entities.get(id),
    getAllEntities: () => Array.from(entities.values()),
    getEntitiesByTeam: (team: string) =>
      Array.from(entities.values()).filter((e) => e.team === team),
    getNearestEnemy: () => null,
  } as any;
}

describe('Projectile lifecycle', () => {
  let attacker: Entity;
  let target: Entity;
  let targetHealth: HealthComponent;
  let entities: Map<string, Entity>;

  beforeEach(() => {
    EventBus.removeAllListeners();
    TimerManager.get().clear();

    attacker = new Entity(0, 0, 'player');
    target = new Entity(3, 0, 'enemy');
    targetHealth = new HealthComponent(target, 100);
    target.addComponent('health', targetHealth);

    entities = new Map([
      [attacker.entityId, attacker],
      [target.entityId, target],
    ]);
  });

  afterEach(() => {
    EventBus.removeAllListeners();
    TimerManager.get().clear();
  });

  describe('CombatComponent ranged attack', () => {
    it('emits projectile-spawned event instead of creating Projectile instance', () => {
      const spawned = vi.fn();
      EventBus.on('projectile-spawned', spawned);

      const combat = new CombatComponent(attacker, 10, 5, 1000, true);
      combat.setTarget(target);
      combat.update(1001); // past cooldown

      expect(spawned).toHaveBeenCalledWith(
        expect.objectContaining({
          fromTileX: 0,
          fromTileY: 0,
          toTileX: 3,
          toTileY: 0,
          duration: 300,
        })
      );
    });

    it('schedules projectile-hit event via TimerManager', () => {
      const hit = vi.fn();
      EventBus.on('projectile-hit', hit);

      const combat = new CombatComponent(attacker, 10, 5, 1000, true);
      combat.setTarget(target);
      combat.update(1001);

      // Not yet — timer hasn't fired
      expect(hit).not.toHaveBeenCalled();

      // Advance timer
      TimerManager.get().update(300);

      expect(hit).toHaveBeenCalledWith(
        expect.objectContaining({
          targetId: target.entityId,
          attackerId: attacker.entityId,
          damage: 10,
        })
      );
    });

    it('does not hold entity references in the timer closure', () => {
      const combat = new CombatComponent(attacker, 10, 5, 1000, true);
      combat.setTarget(target);
      combat.update(1001);

      // The projectile-hit event should carry only string IDs and a number,
      // not entity objects. Verify by intercepting the event.
      const hit = vi.fn();
      EventBus.on('projectile-hit', hit);
      TimerManager.get().update(300);

      const data = hit.mock.calls[0][0];
      expect(typeof data.targetId).toBe('string');
      expect(typeof data.attackerId).toBe('string');
      expect(typeof data.damage).toBe('number');
    });

    it('melee attack applies damage directly without timer', () => {
      const combat = new CombatComponent(attacker, 10, 5, 1000, false);
      combat.setTarget(target);
      combat.update(1001);

      expect(targetHealth.currentHp).toBe(90);
    });
  });

  describe('CombatSystem projectile-hit handler', () => {
    it('applies damage when target is alive', () => {
      const em = mockEntityManager(entities);
      const system = new CombatSystem(em);

      EventBus.emit('projectile-hit', {
        targetId: target.entityId,
        attackerId: attacker.entityId,
        damage: 25,
      });

      expect(targetHealth.currentHp).toBe(75);
      system.destroy();
    });

    it('skips damage when target is already dead', () => {
      const em = mockEntityManager(entities);
      const system = new CombatSystem(em);

      target.active = false;

      EventBus.emit('projectile-hit', {
        targetId: target.entityId,
        attackerId: attacker.entityId,
        damage: 25,
      });

      expect(targetHealth.currentHp).toBe(100);
      system.destroy();
    });

    it('skips damage when target entity no longer exists', () => {
      const em = mockEntityManager(entities);
      const system = new CombatSystem(em);

      entities.delete(target.entityId);

      EventBus.emit('projectile-hit', {
        targetId: target.entityId,
        attackerId: attacker.entityId,
        damage: 25,
      });

      // No crash, no damage
      expect(targetHealth.currentHp).toBe(100);
      system.destroy();
    });

    it('applies damage even when attacker is already dead', () => {
      const em = mockEntityManager(entities);
      const system = new CombatSystem(em);

      entities.delete(attacker.entityId);

      EventBus.emit('projectile-hit', {
        targetId: target.entityId,
        attackerId: attacker.entityId,
        damage: 25,
      });

      // Damage still applied (projectile already in flight)
      expect(targetHealth.currentHp).toBe(75);
      system.destroy();
    });
  });

  describe('CombatSystem projectile-hit-aoe handler', () => {
    it('damages all enemies in radius', () => {
      const enemy2 = new Entity(4, 0, 'enemy');
      const health2 = new HealthComponent(enemy2, 100);
      enemy2.addComponent('health', health2);
      entities.set(enemy2.entityId, enemy2);

      const em = mockEntityManager(entities);
      const system = new CombatSystem(em);

      EventBus.emit('projectile-hit-aoe', {
        attackerId: attacker.entityId,
        tileX: 3,
        tileY: 0,
        radius: 2,
        damage: 30,
        enemyTeam: 'enemy',
      });

      expect(targetHealth.currentHp).toBe(70); // at tile 3,0 — distance 0
      expect(health2.currentHp).toBe(70); // at tile 4,0 — distance 1
      system.destroy();
    });

    it('skips enemies out of radius', () => {
      const farEnemy = new Entity(20, 20, 'enemy');
      const farHealth = new HealthComponent(farEnemy, 100);
      farEnemy.addComponent('health', farHealth);
      entities.set(farEnemy.entityId, farEnemy);

      const em = mockEntityManager(entities);
      const system = new CombatSystem(em);

      EventBus.emit('projectile-hit-aoe', {
        attackerId: attacker.entityId,
        tileX: 3,
        tileY: 0,
        radius: 2,
        damage: 30,
        enemyTeam: 'enemy',
      });

      expect(farHealth.currentHp).toBe(100);
      system.destroy();
    });
  });

  describe('CombatSystem retarget throttle', () => {
    it('skips auto-targeting when delta is below the 250ms interval', () => {
      const em = mockEntityManager(entities);
      const system = new CombatSystem(em);
      const spy = vi.spyOn(em, 'getNearestEnemy');

      // Give attacker a combat component with no target
      const combat = new CombatComponent(attacker, 10, 5, 1000, false);
      attacker.addComponent('combat', combat);

      // Update with small deltas — should not trigger retarget scan
      system.update(100);
      system.update(100);
      expect(spy).not.toHaveBeenCalled();

      system.destroy();
    });

    it('runs auto-targeting once the 250ms interval elapses', () => {
      const em = mockEntityManager(entities);
      const system = new CombatSystem(em);
      const spy = vi.spyOn(em, 'getNearestEnemy');

      const combat = new CombatComponent(attacker, 10, 5, 1000, false);
      attacker.addComponent('combat', combat);

      // Accumulate past the threshold
      system.update(125);
      system.update(125);
      expect(spy).toHaveBeenCalled();

      system.destroy();
    });

    it('resets timer after triggering, requiring another full interval', () => {
      const em = mockEntityManager(entities);
      const system = new CombatSystem(em);
      const spy = vi.spyOn(em, 'getNearestEnemy');

      const combat = new CombatComponent(attacker, 10, 5, 1000, false);
      attacker.addComponent('combat', combat);

      // First trigger
      system.update(250);
      expect(spy).toHaveBeenCalledTimes(1);

      // Small delta — should not trigger again
      spy.mockClear();
      system.update(50);
      expect(spy).not.toHaveBeenCalled();

      // Accumulate to next threshold
      system.update(200);
      expect(spy).toHaveBeenCalledTimes(1);

      system.destroy();
    });
  });

  describe('Cleanup on shutdown', () => {
    it('CombatSystem.destroy() unsubscribes event handlers', () => {
      const em = mockEntityManager(entities);
      const system = new CombatSystem(em);
      system.destroy();

      // After destroy, events should not apply damage
      EventBus.emit('projectile-hit', {
        targetId: target.entityId,
        attackerId: attacker.entityId,
        damage: 25,
      });

      expect(targetHealth.currentHp).toBe(100);
    });

    it('TimerManager.clear() prevents pending projectile callbacks from firing', () => {
      const hit = vi.fn();
      EventBus.on('projectile-hit', hit);

      const combat = new CombatComponent(attacker, 10, 5, 1000, true);
      combat.setTarget(target);
      combat.update(1001); // fires ranged attack, schedules timer

      // Simulate shutdown: clear timers before they fire
      TimerManager.get().clear();
      TimerManager.get().update(300);

      expect(hit).not.toHaveBeenCalled();
    });
  });
});
