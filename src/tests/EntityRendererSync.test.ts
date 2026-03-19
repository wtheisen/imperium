import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

describe('EntityRenderer.syncAll', () => {
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

  it('creates meshes for active entities', () => {
    const unit = makeUnit(2, 3);
    renderer.syncAll([unit]);

    const mesh = renderer.getMesh(unit.entityId);
    expect(mesh).toBeDefined();
    expect(mesh!.position.x).toBeCloseTo(2);
    expect(mesh!.position.z).toBeCloseTo(3);
  });

  it('removes meshes when entities leave the active list', () => {
    const unit = makeUnit();
    renderer.syncAll([unit]);
    expect(renderer.getMesh(unit.entityId)).toBeDefined();

    // Entity no longer in the active list
    renderer.syncAll([]);
    expect(renderer.getMesh(unit.entityId)).toBeUndefined();
  });

  it('handles multiple sync cycles without leaking meshes', () => {
    const u1 = makeUnit(0, 0);
    const u2 = makeUnit(1, 1);

    renderer.syncAll([u1, u2]);
    expect(renderer.getAllMeshes()).toHaveLength(2);

    // Remove u1, keep u2, add u3
    const u3 = makeUnit(2, 2);
    renderer.syncAll([u2, u3]);
    expect(renderer.getAllMeshes()).toHaveLength(2);
    expect(renderer.getMesh(u1.entityId)).toBeUndefined();
    expect(renderer.getMesh(u2.entityId)).toBeDefined();
    expect(renderer.getMesh(u3.entityId)).toBeDefined();
  });

  it('skips inactive entities within the list', () => {
    const active = makeUnit(0, 0);
    const inactive = makeUnit(1, 1);
    inactive.active = false;

    renderer.syncAll([active, inactive]);
    expect(renderer.getMesh(active.entityId)).toBeDefined();
    expect(renderer.getMesh(inactive.entityId)).toBeUndefined();
  });

  it('reuses persistent activeIds set across frames (no per-frame allocation)', () => {
    const privateRenderer = renderer as any;
    const originalSet = privateRenderer.activeIds;
    expect(originalSet).toBeInstanceOf(Set);

    renderer.syncAll([makeUnit()]);
    expect(privateRenderer.activeIds).toBe(originalSet);

    renderer.syncAll([makeUnit(1, 1)]);
    expect(privateRenderer.activeIds).toBe(originalSet);
  });
});
