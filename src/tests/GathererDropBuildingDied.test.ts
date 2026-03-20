import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GathererComponent } from '../components/GathererComponent';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { EventBus } from '../EventBus';

const makeUnit = () =>
  new Unit(5, 5, 'servitor', {
    maxHp: 50,
    speed: 2,
    attackDamage: 0,
    attackRange: 0,
    attackCooldown: 0,
    isRanged: false,
  });

const makeDropShip = (tileX = 0, tileY = 0, tileWidth = 2, tileHeight = 2) =>
  new Building(tileX, tileY, 'drop-ship', { maxHp: 200, tileWidth, tileHeight }, 'player');

describe('GathererComponent – drop building destroyed', () => {
  let unit: Unit;
  let gatherer: GathererComponent;

  beforeEach(() => {
    unit = makeUnit();
    gatherer = new GathererComponent(unit, 1, 5);
    gatherer.assignMine(8, 8, 1, 1); // dropX=1, dropY=1
  });

  afterEach(() => {
    gatherer.destroy();
    EventBus.removeAllListeners();
  });

  it('goes idle and emits gold-gathered when carrying gold and drop building dies', () => {
    // Simulate the gatherer carrying some gold en-route to drop
    (gatherer as any).carried = 3;
    gatherer.state = 'moving-to-drop';

    const goldEvents: { amount: number }[] = [];
    EventBus.on('gold-gathered', (data: { amount: number }) => goldEvents.push(data));

    const dropShip = makeDropShip(0, 0, 2, 2); // covers (0,0)–(1,1), so dropX=1,dropY=1 is inside
    EventBus.emit('entity-died', { entity: dropShip, killer: null });

    expect(gatherer.state).toBe('idle');
    expect(goldEvents).toHaveLength(1);
    expect(goldEvents[0].amount).toBe(3);
    expect((gatherer as any).carried).toBe(0);
  });

  it('goes idle without emitting gold-gathered when not carrying gold', () => {
    (gatherer as any).carried = 0;
    gatherer.state = 'moving-to-drop';

    const goldEvents: unknown[] = [];
    EventBus.on('gold-gathered', (data: unknown) => goldEvents.push(data));

    const dropShip = makeDropShip(0, 0, 2, 2);
    EventBus.emit('entity-died', { entity: dropShip, killer: null });

    expect(gatherer.state).toBe('idle');
    expect(goldEvents).toHaveLength(0);
  });

  it('ignores entity-died for enemy buildings', () => {
    (gatherer as any).carried = 3;
    gatherer.state = 'moving-to-drop';

    const enemyBuilding = new Building(0, 0, 'ork-hut', { maxHp: 100, tileWidth: 2, tileHeight: 2 }, 'enemy');
    EventBus.emit('entity-died', { entity: enemyBuilding, killer: null });

    expect(gatherer.state).toBe('moving-to-drop');
    expect((gatherer as any).carried).toBe(3);
  });

  it('ignores entity-died for a building that does not cover the drop point', () => {
    (gatherer as any).carried = 3;
    gatherer.state = 'moving-to-drop';

    const farBuilding = makeDropShip(10, 10, 2, 2); // nowhere near dropX=1, dropY=1
    EventBus.emit('entity-died', { entity: farBuilding, killer: null });

    expect(gatherer.state).toBe('moving-to-drop');
    expect((gatherer as any).carried).toBe(3);
  });
});
