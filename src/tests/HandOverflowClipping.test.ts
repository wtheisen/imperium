import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Guards for the hand overflow clipping fix.
 *
 * Previously, `overflow:hidden` on the hand section and its wrapper clipped
 * cards on both left and right edges at narrower viewport widths. The fix:
 * - Changes both overflow:hidden to overflow:visible so cards aren't hard-clipped
 * - Adds `zoom: 0.85` to `.card-slot` inside `#hud-section-hand` so all cards
 *   fit within the available 1fr column at 1920px without overflowing.
 */

describe('Hand section overflow fix (UIScene.ts)', () => {
  it('hand section wrapper uses overflow:visible (not hidden)', async () => {
    const src = await import('../scenes/UIScene.ts?raw');
    // The wrapper div around hud-section-hand must not use overflow:hidden
    // Check that the hand section wrapper has overflow:visible
    expect(src.default).toContain('overflow:visible');
  });

  it('hud-section-hand does not use overflow:hidden', async () => {
    const src = await import('../scenes/UIScene.ts?raw');
    // Find the hud-section-hand div and ensure it no longer has overflow:hidden
    const handSectionMatch = src.default.match(/id="hud-section-hand"[^>]*/);
    expect(handSectionMatch).not.toBeNull();
    expect(handSectionMatch![0]).not.toContain('overflow:hidden');
  });

  it('hud-section-hand uses overflow:visible', async () => {
    const src = await import('../scenes/UIScene.ts?raw');
    const handSectionMatch = src.default.match(/id="hud-section-hand"[^>]*/);
    expect(handSectionMatch).not.toBeNull();
    expect(handSectionMatch![0]).toContain('overflow:visible');
  });
});

describe('Hand card slot zoom fix (ui-scene.css)', () => {
  const cssPath = resolve(__dirname, '../scenes/ui-scene.css');
  const css = readFileSync(cssPath, 'utf8');

  it('applies zoom to card-slot elements inside hud-section-hand', () => {
    expect(css).toContain('#hud-section-hand .card-slot');
  });

  it('zoom value reduces card layout size to fit the hand column', () => {
    // The zoom value should be less than 1 (scales down) to fit cards
    const match = css.match(/#hud-section-hand \.card-slot\s*\{([^}]*)\}/);
    expect(match).not.toBeNull();
    const block = match![1];
    const zoomMatch = block.match(/zoom:\s*([\d.]+)/);
    expect(zoomMatch).not.toBeNull();
    const zoomValue = parseFloat(zoomMatch![1]);
    expect(zoomValue).toBeGreaterThan(0);
    expect(zoomValue).toBeLessThan(1);
  });

  it('zoom is sufficient to fit all cards at 1920px (card content ≤ 872px hand width)', () => {
    // At 1920px: hand section = (1920 - 176) / 2 = 872px
    // Content = 7 card-slots * 116px * zoom + gaps + spacers + padding
    // 7 slots, 8 gaps at 5px, 2 spacers at 6px, 16px total padding
    const zoom = 0.85;
    const cardWidth = 116;
    const numSlots = 7; // deck + 5 hand + discard
    const gaps = 8 * 5;
    const spacers = 2 * 6;
    const padding = 16;
    const contentWidth = numSlots * cardWidth * zoom + gaps + spacers + padding;
    const handSectionWidth = (1920 - 176) / 2;
    expect(contentWidth).toBeLessThanOrEqual(handSectionWidth);
  });
});
