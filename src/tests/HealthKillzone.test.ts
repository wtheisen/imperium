import { describe, it, expect, afterEach } from 'vitest';
import { HealthComponent } from '../components/HealthComponent';
import { EventBus } from '../EventBus';
import { Entity } from '../entities/Entity';

// Minimal entity stub
function makeEntity(): Entity {
  return {
    entityId: 'test-1',
    tileX: 5,
    tileY: 5,
    team: 'player',
    active: true,
    getComponent: () => undefined,
  } as any;
}

describe('HealthComponent killzone integration', () => {
  afterEach(() => {
    EventBus.removeAllListeners();
  });

  it('heal emits entity-heal-attempt event', () => {
    const entity = makeEntity();
    const health = new HealthComponent(entity, 100);
    health.takeDamage(30); // HP = 70

    const attempts: any[] = [];
    EventBus.on('entity-heal-attempt', (data: any) => attempts.push(data));

    health.heal(20);
    expect(attempts.length).toBe(1);
    expect(attempts[0].entity).toBe(entity);
    expect(attempts[0].amount).toBe(20);
  });

  it('heal succeeds when not cancelled', () => {
    const entity = makeEntity();
    const health = new HealthComponent(entity, 100);
    health.takeDamage(30); // HP = 70

    health.heal(20);
    expect(health.currentHp).toBe(90);
  });

  it('heal is blocked when cancelled via event', () => {
    const entity = makeEntity();
    const health = new HealthComponent(entity, 100);
    health.takeDamage(30); // HP = 70

    // Simulate killzone listener
    EventBus.on('entity-heal-attempt', (data: any) => {
      data.cancel.cancelled = true;
    });

    health.heal(20);
    expect(health.currentHp).toBe(70); // No healing occurred
  });
});
