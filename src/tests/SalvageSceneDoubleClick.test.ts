import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stub DOM before any module imports
vi.stubGlobal('document', {
  createElement: vi.fn(() => {
    const el: any = {
      style: {},
      innerHTML: '',
      appendChild: vi.fn(),
      remove: vi.fn(),
      addEventListener: vi.fn(),
    };
    return el;
  }),
  getElementById: vi.fn(() => ({
    appendChild: vi.fn(),
  })),
  body: { appendChild: vi.fn() },
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

// Stub PlayerState functions
vi.mock('../state/PlayerState', () => ({
  getPlayerState: vi.fn(() => ({ collection: {}, shipCredits: 0 })),
  addToCollection: vi.fn(),
  addShipCredits: vi.fn(),
  savePlayerState: vi.fn(),
  getCollectionCount: vi.fn(() => 0),
}));

// Stub SceneManager
vi.mock('../scenes/SceneManager', () => ({
  getSceneManager: vi.fn(() => ({
    stop: vi.fn(),
    start: vi.fn(),
  })),
  SceneManager: vi.fn(),
}));

// Stub CardDatabase with one entry so decisions build correctly
vi.mock('../cards/CardDatabase', () => ({
  CARD_DATABASE: {
    'test-card': { name: 'Test Card', type: 'unit', cost: 2, description: 'A test card.' },
  },
}));

// Stub config constants
vi.mock('../config', () => ({
  SALVAGE_CREDIT_BASE: 10,
  SALVAGE_DUPLICATE_BONUS: 5,
}));

import { addToCollection, addShipCredits, savePlayerState } from '../state/PlayerState';
import { getSceneManager } from '../scenes/SceneManager';
import { SalvageScene } from '../scenes/SalvageScene';

function makeScene(cardIds: string[] = ['test-card']): SalvageScene {
  const scene = new SalvageScene();
  scene.create({ takenPackCards: cardIds, victory: true, missionId: 'test' });
  return scene;
}

describe('SalvageScene double-click guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('applies rewards exactly once when confirm() is called once', () => {
    const scene = makeScene();
    (scene as any).confirm();

    expect(savePlayerState).toHaveBeenCalledTimes(1);
  });

  it('does not apply rewards a second time when confirm() is called twice', () => {
    const scene = makeScene();
    (scene as any).confirm();
    (scene as any).confirm();

    expect(savePlayerState).toHaveBeenCalledTimes(1);
  });

  it('does not transition scenes a second time on double confirm()', () => {
    const sm = { stop: vi.fn(), start: vi.fn() };
    vi.mocked(getSceneManager).mockReturnValue(sm as any);

    const scene = makeScene();
    (scene as any).confirm();
    (scene as any).confirm();

    expect(sm.stop).toHaveBeenCalledTimes(1);
    expect(sm.start).toHaveBeenCalledTimes(1);
  });

  it('keeps card rewards at correct count for keep decisions', () => {
    const scene = makeScene(['test-card']);
    // default action is 'keep'
    (scene as any).confirm();

    expect(addToCollection).toHaveBeenCalledTimes(1);
    expect(addShipCredits).not.toHaveBeenCalled();
  });

  it('applies ship credits for salvage decisions and not for keep decisions', () => {
    const scene = makeScene(['test-card']);
    (scene as any).decisions[0].action = 'salvage';
    (scene as any).confirm();

    expect(addShipCredits).toHaveBeenCalledTimes(1);
    expect(addToCollection).not.toHaveBeenCalled();
  });

  it('resets confirmed flag after shutdown so the scene can be reused', () => {
    const scene = makeScene();
    (scene as any).confirm();
    expect((scene as any).confirmed).toBe(true);

    scene.shutdown();
    expect((scene as any).confirmed).toBe(false);
  });

  it('allows confirm() to run again after shutdown and re-create', () => {
    const scene = makeScene();
    (scene as any).confirm();
    scene.shutdown();

    scene.create({ takenPackCards: ['test-card'], victory: true });
    (scene as any).confirm();

    expect(savePlayerState).toHaveBeenCalledTimes(2);
  });
});
