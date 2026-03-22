import { describe, it, expect } from 'vitest';

/**
 * Regression tests for pause overlay z-index layering.
 *
 * The TacticalPauseOverlay sits at z-index 9999. PackPickupUI and ShopUI
 * must both render above it (z-index > 9999) so they remain visible and
 * interactive when P is pressed while a dialog is open.
 */

const PAUSE_OVERLAY_Z = 9999;

describe('PackPickupUI z-index above TacticalPauseOverlay', () => {
  it('PackPickupUI overlay z-index is above the pause overlay', async () => {
    const src = await import('../ui/PackPickupUI?raw');
    const match = src.default.match(/zIndex:\s*'(\d+)'/);
    expect(match).not.toBeNull();
    const zIndex = parseInt(match![1], 10);
    expect(zIndex).toBeGreaterThan(PAUSE_OVERLAY_Z);
  });

  it('PackPickupUI overlay z-index is exactly 10000', async () => {
    const src = await import('../ui/PackPickupUI?raw');
    expect(src.default).toContain("zIndex: '10000'");
  });
});

describe('ShopUI z-index above TacticalPauseOverlay', () => {
  it('ShopUI overlay z-index is above the pause overlay', async () => {
    const src = await import('../ui/ShopUI?raw');
    const match = src.default.match(/z-index:\s*(\d+)/);
    expect(match).not.toBeNull();
    const zIndex = parseInt(match![1], 10);
    expect(zIndex).toBeGreaterThan(PAUSE_OVERLAY_Z);
  });

  it('ShopUI overlay z-index is exactly 10000', async () => {
    const src = await import('../ui/ShopUI?raw');
    expect(src.default).toContain('z-index: 10000');
  });
});

describe('TacticalPauseOverlay z-index constant', () => {
  it('TacticalPauseOverlay uses z-index 9999', async () => {
    const src = await import('../ui/TacticalPauseOverlay?raw');
    expect(src.default).toContain("zIndex: '9999'");
  });
});
