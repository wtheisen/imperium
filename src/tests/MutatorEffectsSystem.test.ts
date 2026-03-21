import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventBus } from '../EventBus';
import { resolveEnvironmentModifiers } from '../systems/EnvironmentModifierSystem';
import { MutatorEffectsSystem } from '../systems/MutatorEffectsSystem';
import { PlacementValidator } from '../map/PlacementValidator';
import { EntityManager } from '../systems/EntityManager';

// Minimal placement validator stub
function makeValidator(): PlacementValidator {
  return { canPlace: () => true, isWalkable: () => true } as any;
}

function makeEntityManager(): EntityManager {
  return new EntityManager(makeValidator());
}

describe('MutatorEffectsSystem', () => {
  afterEach(() => {
    EventBus.removeAllListeners();
  });

  describe('blood_tithe', () => {
    it('emits mutator-gold on enemy kill', () => {
      const em = makeEntityManager();
      const fx = resolveEnvironmentModifiers(['blood_tithe']);
      const system = new MutatorEffectsSystem(em, fx);

      const received: any[] = [];
      EventBus.on('mutator-gold', (data: any) => received.push(data));

      EventBus.emit('entity-died', {
        entity: { team: 'enemy', tileX: 5, tileY: 5, entityId: 'e1', destroyEntity: () => {} },
        killer: { team: 'player' },
      });

      expect(received.length).toBe(1);
      expect(received[0].amount).toBeGreaterThan(0);
      expect(received[0].reason).toBe('blood_tithe_kill');

      system.destroy();
    });

    it('emits negative gold on player death', () => {
      const em = makeEntityManager();
      const fx = resolveEnvironmentModifiers(['blood_tithe']);
      const system = new MutatorEffectsSystem(em, fx);

      const received: any[] = [];
      EventBus.on('mutator-gold', (data: any) => received.push(data));

      EventBus.emit('entity-died', {
        entity: { team: 'player', tileX: 5, tileY: 5, entityId: 'p1', destroyEntity: () => {} },
      });

      expect(received.length).toBe(1);
      expect(received[0].amount).toBeLessThan(0);
      expect(received[0].reason).toBe('blood_tithe_death');

      system.destroy();
    });

    it('does not emit gold when blood_tithe is not active', () => {
      const em = makeEntityManager();
      const fx = resolveEnvironmentModifiers([]);
      const system = new MutatorEffectsSystem(em, fx);

      const received: any[] = [];
      EventBus.on('mutator-gold', (data: any) => received.push(data));

      EventBus.emit('entity-died', {
        entity: { team: 'enemy', tileX: 5, tileY: 5, entityId: 'e1', destroyEntity: () => {} },
        killer: { team: 'player' },
      });

      expect(received.length).toBe(0);
      system.destroy();
    });
  });

  describe('killzone', () => {
    it('cancels heal attempts', () => {
      const em = makeEntityManager();
      const fx = resolveEnvironmentModifiers(['killzone']);
      const system = new MutatorEffectsSystem(em, fx);

      const cancel = { cancelled: false };
      EventBus.emit('entity-heal-attempt', {
        entity: { tileX: 5, tileY: 5 },
        amount: 10,
        cancel,
      });

      expect(cancel.cancelled).toBe(true);
      system.destroy();
    });

    it('does not cancel heals when killzone is off', () => {
      const em = makeEntityManager();
      const fx = resolveEnvironmentModifiers([]);
      const system = new MutatorEffectsSystem(em, fx);

      const cancel = { cancelled: false };
      EventBus.emit('entity-heal-attempt', {
        entity: { tileX: 5, tileY: 5 },
        amount: 10,
        cancel,
      });

      expect(cancel.cancelled).toBe(false);
      system.destroy();
    });
  });

  describe('iron_rain', () => {
    it('emits warning VFX after interval', () => {
      const em = makeEntityManager();
      const fx = resolveEnvironmentModifiers(['iron_rain']);
      const system = new MutatorEffectsSystem(em, fx);

      const vfxEvents: any[] = [];
      EventBus.on('mutator-vfx', (data: any) => vfxEvents.push(data));

      // Advance past interval (25000ms)
      system.update(26000);

      expect(vfxEvents.length).toBeGreaterThan(0);
      expect(vfxEvents[0].type).toBe('iron_rain_warning');

      system.destroy();
    });

    it('does not fire before interval', () => {
      const em = makeEntityManager();
      const fx = resolveEnvironmentModifiers(['iron_rain']);
      const system = new MutatorEffectsSystem(em, fx);

      const vfxEvents: any[] = [];
      EventBus.on('mutator-vfx', (data: any) => vfxEvents.push(data));

      system.update(5000);
      expect(vfxEvents.length).toBe(0);

      system.destroy();
    });
  });

  describe('cleanup', () => {
    it('destroy removes event listeners', () => {
      const em = makeEntityManager();
      const fx = resolveEnvironmentModifiers(['blood_tithe', 'killzone']);
      const system = new MutatorEffectsSystem(em, fx);
      system.destroy();

      const received: any[] = [];
      EventBus.on('mutator-gold', (data: any) => received.push(data));

      EventBus.emit('entity-died', {
        entity: { team: 'enemy', tileX: 5, tileY: 5, entityId: 'e1', destroyEntity: () => {} },
        killer: { team: 'player' },
      });

      expect(received.length).toBe(0);
    });
  });
});
