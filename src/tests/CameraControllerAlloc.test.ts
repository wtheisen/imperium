import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CameraController } from '../renderer/CameraController';

// Stub DOM and window for Node test environment
const mockDomAddEventListener = vi.fn();
const mockDomRemoveEventListener = vi.fn();
const mockWindowAddEventListener = vi.fn();
const mockWindowRemoveEventListener = vi.fn();

Object.defineProperty(globalThis, 'window', {
  value: {
    addEventListener: mockWindowAddEventListener,
    removeEventListener: mockWindowRemoveEventListener,
    innerWidth: 1280,
    innerHeight: 720,
  },
  writable: true,
});

function makeDomElement(): HTMLElement {
  return {
    addEventListener: mockDomAddEventListener,
    removeEventListener: mockDomRemoveEventListener,
  } as unknown as HTMLElement;
}

function makeController(): CameraController {
  return new CameraController(makeDomElement(), 16 / 9);
}

describe('CameraController – pre-allocated pan vectors', () => {
  beforeEach(() => {
    mockDomAddEventListener.mockReset();
    mockWindowAddEventListener.mockReset();
  });

  it('_panRight is the same object reference across onMouseMove pan calls', () => {
    const ctrl = makeController() as any;
    ctrl.isPanning = true;

    const ref = ctrl._panRight;

    // Simulate two mousemove events while panning
    ctrl.onMouseMove({ clientX: 110, clientY: 100, button: 2 });
    ctrl.onMouseMove({ clientX: 120, clientY: 105, button: 2 });

    expect(ctrl._panRight).toBe(ref);
  });

  it('_panForward is the same object reference across onMouseMove pan calls', () => {
    const ctrl = makeController() as any;
    ctrl.isPanning = true;
    ctrl.prevMouse = { x: 100, y: 100 };

    const ref = ctrl._panForward;

    ctrl.onMouseMove({ clientX: 110, clientY: 100, button: 2 });
    ctrl.onMouseMove({ clientX: 120, clientY: 110, button: 2 });

    expect(ctrl._panForward).toBe(ref);
  });

  it('_panRight is the same object reference across tick() edge-pan calls', () => {
    const ctrl = makeController() as any;
    // Place mouse at left edge to trigger edge panning
    ctrl.mouseScreenX = 2;
    ctrl.mouseScreenY = 400;

    const ref = ctrl._panRight;

    ctrl.tick();
    ctrl.tick();

    expect(ctrl._panRight).toBe(ref);
  });

  it('_panForward is the same object reference across tick() edge-pan calls', () => {
    const ctrl = makeController() as any;
    ctrl.mouseScreenX = 2;
    ctrl.mouseScreenY = 400;

    const ref = ctrl._panForward;

    ctrl.tick();
    ctrl.tick();

    expect(ctrl._panForward).toBe(ref);
  });

  it('panning moves the camera target', () => {
    const ctrl = makeController() as any;
    ctrl.isPanning = true;
    ctrl.prevMouse = { x: 100, y: 100 };

    const targetBefore = ctrl.target.clone();
    ctrl.onMouseMove({ clientX: 120, clientY: 100, button: 2 });

    // Target should have shifted
    const moved =
      ctrl.target.x !== targetBefore.x ||
      ctrl.target.y !== targetBefore.y ||
      ctrl.target.z !== targetBefore.z;
    expect(moved).toBe(true);
  });

  it('tick() edge-pan moves camera target when mouse is at screen edge', () => {
    const ctrl = makeController() as any;
    ctrl.mouseScreenX = 2; // left edge
    ctrl.mouseScreenY = 400;

    const targetBefore = ctrl.target.clone();
    ctrl.tick();

    const moved =
      ctrl.target.x !== targetBefore.x ||
      ctrl.target.z !== targetBefore.z;
    expect(moved).toBe(true);
  });
});
