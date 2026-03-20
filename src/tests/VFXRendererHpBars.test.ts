import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../EventBus';

// Stub document.createElement / document.body before importing VFXRenderer
const fakeCanvas = {
  width: 0,
  height: 0,
  getContext: () => ({
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    fillRect: vi.fn(),
    fillText: vi.fn(),
    clearRect: vi.fn(),
    measureText: () => ({ width: 0 }),
  }),
  style: {},
};
const fakeDiv = {
  style: {},
  remove: vi.fn(),
  appendChild: vi.fn(),
  contains: vi.fn(() => false),
};
vi.stubGlobal('document', {
  createElement: (tag: string) => (tag === 'canvas' ? { ...fakeCanvas } : { ...fakeDiv }),
  body: { appendChild: vi.fn(), contains: vi.fn(() => false) },
});

// Now import — constructor will use stubbed document
import * as THREE from 'three';
import { VFXRenderer } from '../renderer/VFXRenderer';
import { Unit, UnitStats } from '../entities/Unit';

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

describe('VFXRenderer.syncHpBars', () => {
  let scene: THREE.Scene;
  let vfx: VFXRenderer;

  beforeEach(() => {
    scene = new THREE.Scene();
    vfx = new VFXRenderer(scene);
    vfx.camera = new THREE.PerspectiveCamera();
  });

  afterEach(() => {
    EventBus.removeAllListeners();
  });

  it('reuses persistent _hpBarActiveIds set across frames (no per-frame allocation)', () => {
    const privateVfx = vfx as any;
    const originalSet = privateVfx._hpBarActiveIds;
    expect(originalSet).toBeInstanceOf(Set);

    vfx.syncHpBars([makeUnit()]);
    expect(privateVfx._hpBarActiveIds).toBe(originalSet);

    vfx.syncHpBars([makeUnit(1, 1)]);
    expect(privateVfx._hpBarActiveIds).toBe(originalSet);
  });
});
