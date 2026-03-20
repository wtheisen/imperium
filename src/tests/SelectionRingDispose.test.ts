import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { EntityRenderer } from '../renderer/EntityRenderer';
import { Unit, UnitStats } from '../entities/Unit';
import { EventBus } from '../EventBus';

const baseStats: UnitStats = {
  maxHp: 10,
  speed: 1,
  attackDamage: 5,
  attackRange: 1,
  attackCooldown: 1000,
  isRanged: false,
};

function makeUnit(x = 0, y = 0): Unit {
  const u = new Unit(x, y, 'marine', baseStats, 'player');
  u.active = true;
  return u;
}

describe('SelectionRing dispose', () => {
  let scene: THREE.Scene;
  let renderer: EntityRenderer;

  beforeEach(() => {
    scene = new THREE.Scene();
    renderer = new EntityRenderer(scene);
  });

  afterEach(() => {
    renderer.dispose();
    EventBus.removeAllListeners();
  });

  it('disposes border sub-mesh geometry and material when deselecting in setSelected', () => {
    const unit = makeUnit(2, 3);
    renderer.syncAll([unit]);

    // Select to create ring
    renderer.setSelected([unit.entityId]);

    // Grab the ring and its border child
    const rings = (renderer as any).selectionRings as Map<string, THREE.Mesh>;
    const ring = rings.get(unit.entityId)!;
    expect(ring).toBeDefined();

    // Collect dispose spies from all child meshes (the border sub-mesh)
    const childSpies: { geomDispose: ReturnType<typeof vi.spyOn>; matDispose: ReturnType<typeof vi.spyOn> }[] = [];
    ring.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh && child !== ring) {
        childSpies.push({
          geomDispose: vi.spyOn(child.geometry, 'dispose'),
          matDispose: vi.spyOn(child.material as THREE.Material, 'dispose'),
        });
      }
    });

    // Deselect — should dispose all children
    renderer.setSelected([]);

    for (const spy of childSpies) {
      expect(spy.geomDispose).toHaveBeenCalled();
      expect(spy.matDispose).toHaveBeenCalled();
    }
    expect(rings.has(unit.entityId)).toBe(false);
  });

  it('disposes border sub-mesh geometry and material when entity removed in syncAll', () => {
    const unit = makeUnit(2, 3);
    renderer.syncAll([unit]);
    renderer.setSelected([unit.entityId]);

    const rings = (renderer as any).selectionRings as Map<string, THREE.Mesh>;
    const ring = rings.get(unit.entityId)!;
    expect(ring).toBeDefined();

    const childSpies: { geomDispose: ReturnType<typeof vi.spyOn>; matDispose: ReturnType<typeof vi.spyOn> }[] = [];
    ring.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh && child !== ring) {
        childSpies.push({
          geomDispose: vi.spyOn(child.geometry, 'dispose'),
          matDispose: vi.spyOn(child.material as THREE.Material, 'dispose'),
        });
      }
    });

    // Remove entity from active list — syncAll cleanup should dispose ring + children
    renderer.syncAll([]);

    for (const spy of childSpies) {
      expect(spy.geomDispose).toHaveBeenCalled();
      expect(spy.matDispose).toHaveBeenCalled();
    }
    expect(rings.has(unit.entityId)).toBe(false);
  });
});
