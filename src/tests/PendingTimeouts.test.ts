import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../EventBus';

// Stub document before importing VFXRenderer (same pattern as VFXRendererHpBars.test.ts)
const fakeCanvas = {
  width: 0, height: 0,
  getContext: () => ({
    fillStyle: '', font: '', textAlign: '', textBaseline: '',
    fillRect: vi.fn(), fillText: vi.fn(), clearRect: vi.fn(),
    measureText: () => ({ width: 0 }),
  }),
  style: {},
};
const fakeDiv = {
  style: {}, remove: vi.fn(), appendChild: vi.fn(),
  contains: vi.fn(() => false),
};
vi.stubGlobal('document', {
  createElement: (tag: string) => (tag === 'canvas' ? { ...fakeCanvas } : { ...fakeDiv }),
  body: { appendChild: vi.fn(), contains: vi.fn(() => false) },
});

import * as THREE from 'three';
import { VFXRenderer } from '../renderer/VFXRenderer';

describe('VFXRenderer pendingTimeouts', () => {
  let scene: THREE.Scene;
  let vfx: VFXRenderer;

  beforeEach(() => {
    vi.useFakeTimers();
    scene = new THREE.Scene();
    vfx = new VFXRenderer(scene);
    vfx.camera = new THREE.PerspectiveCamera();
  });

  afterEach(() => {
    vi.useRealTimers();
    EventBus.removeAllListeners();
  });

  it('scheduleTimeout adds an entry to pendingTimeouts', () => {
    const vfxAny = vfx as any;
    expect(vfxAny.pendingTimeouts).toHaveLength(0);
    vfxAny.scheduleTimeout(() => {}, 100);
    expect(vfxAny.pendingTimeouts).toHaveLength(1);
  });

  it('scheduleTimeout runs the callback after the delay', () => {
    const fn = vi.fn();
    (vfx as any).scheduleTimeout(fn, 200);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('dispose() clears all pending timeouts and empties the array', () => {
    const vfxAny = vfx as any;
    const fn = vi.fn();
    vfxAny.scheduleTimeout(fn, 500);
    vfxAny.scheduleTimeout(fn, 1000);
    expect(vfxAny.pendingTimeouts).toHaveLength(2);

    vfx.dispose();

    // Callbacks must not fire after dispose
    vi.advanceTimersByTime(2000);
    expect(fn).not.toHaveBeenCalled();
    expect(vfxAny.pendingTimeouts).toHaveLength(0);
  });

  it('dispose() is safe to call when no timeouts are pending', () => {
    expect(() => vfx.dispose()).not.toThrow();
  });

  it('dispose() is idempotent — second call does not throw', () => {
    (vfx as any).scheduleTimeout(() => {}, 100);
    vfx.dispose();
    expect(() => vfx.dispose()).not.toThrow();
  });
});
