import { describe, it, expect, afterEach } from 'vitest';
import { MoverComponent } from '../components/MoverComponent';
import { Entity } from '../entities/Entity';
import { CardEffects } from '../cards/CardEffects';
import { HealthComponent } from '../components/HealthComponent';
import { TimerManager } from '../utils/TimerManager';
import { EventBus } from '../EventBus';
import type { Card } from '../cards/Card';

function makeUnit(tileX: number, tileY: number) {
  const e = new Entity(tileX, tileY, 'player');
  return e as any; // Unit shape: tileX/tileY/facing
}

function makeEntityManager(enemyEntities: Entity[] = []) {
  return {
    getEntitiesByTeam: (team: string) => team === 'enemy' ? enemyEntities : [],
    getUnits: () => [],
    getEntitiesAtTile: () => [],
    spawnUnit: () => ({ active: true, addComponent: () => {}, getComponent: () => undefined }),
    spawnBuilding: () => null,
  } as any;
}

describe('MoverComponent division-by-zero guard', () => {
  it('does not produce NaN when speed=0 and dist is tiny float', () => {
    const unit = makeUnit(5, 5);
    const mover = new MoverComponent(unit, 0);
    // Place fracTile slightly off from the target due to floating point
    mover.fracTileX = 5 + 1e-15;
    mover.fracTileY = 5 + 1e-15;
    mover.setPath([{ x: 5, y: 5 }]);

    mover.update(16);

    expect(mover.fracTileX).not.toBeNaN();
    expect(mover.fracTileY).not.toBeNaN();
  });

  it('does not produce NaN when speed=0 and unit is at exact target', () => {
    const unit = makeUnit(5, 5);
    const mover = new MoverComponent(unit, 0);
    mover.setPath([{ x: 5, y: 5 }]);

    mover.update(16);

    expect(mover.fracTileX).not.toBeNaN();
    expect(mover.fracTileY).not.toBeNaN();
  });

  it('does not NaN fracTile after multiple updates with speed=0 and small float offset', () => {
    const unit = makeUnit(3, 7);
    const mover = new MoverComponent(unit, 0);
    mover.fracTileX = 3 + 5e-16;
    mover.fracTileY = 7;
    mover.setPath([{ x: 3, y: 7 }]);

    for (let i = 0; i < 10; i++) mover.update(16);

    expect(mover.fracTileX).not.toBeNaN();
    expect(mover.fracTileY).not.toBeNaN();
  });
});

describe('CardEffects ordnanceVortex division-by-zero guard', () => {
  afterEach(() => {
    TimerManager.get().clear();
    EventBus.removeAllListeners();
  });

  function vortexCard(radius = 3, value = 10): Card {
    return { id: 'test', name: 'Vortex', type: 'ordnance', cost: 0, ordnanceEffect: 'vortex', ordnanceRadius: radius, ordnanceValue: value } as Card;
  }

  it('does not throw or produce NaN when enemy is at exact vortex center', () => {
    const enemy = new Entity(5, 5, 'enemy');
    enemy.addComponent('health', new HealthComponent(enemy as any, 100));
    const fx = new CardEffects(makeEntityManager([enemy]), { canAfford: () => true, spend: () => {}, getGold: () => 999 } as any);

    expect(() => fx.castOrdnance(vortexCard(), 5, 5)).not.toThrow();
    // Entity should still have valid tile coords
    expect(enemy.tileX).not.toBeNaN();
    expect(enemy.tileY).not.toBeNaN();
  });

  it('pulls enemies not at center toward vortex center', () => {
    const enemy = new Entity(3, 5, 'enemy');
    enemy.addComponent('health', new HealthComponent(enemy as any, 100));
    const fx = new CardEffects(makeEntityManager([enemy]), { canAfford: () => true, spend: () => {}, getGold: () => 999 } as any);

    fx.castOrdnance(vortexCard(), 5, 5);

    // Enemy was at (3,5), vortex at (5,5) — should have moved closer to (5,5)
    expect(enemy.tileX).toBeGreaterThan(3);
    expect(enemy.tileX).not.toBeNaN();
    expect(enemy.tileY).not.toBeNaN();
  });
});
