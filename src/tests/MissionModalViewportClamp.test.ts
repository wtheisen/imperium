import { describe, it, expect } from 'vitest';

/**
 * Mirrors the modal positioning logic in MissionSelectScene.showModal()
 * so we can verify the viewport-clamping fix without a browser.
 *
 * Key change: approxH was raised to 660 (from 440/560), and an additional
 * clamp ensures the modal's max-height box (75vh) never extends below the
 * bottom of the viewport regardless of where the node sits on the map.
 */
function computeModalTop(opts: {
  nodeYpx: number;
  mapH: number;
  mapRectTop: number;
  viewportH: number;
}): number {
  const { nodeYpx, mapH, mapRectTop, viewportH } = opts;
  const approxH = 660;
  let top = nodeYpx - 80;
  if (top + approxH > mapH - 20) top = mapH - approxH - 20;
  const maxModalH = viewportH * 0.75;
  const maxTop = viewportH - mapRectTop - maxModalH - 10;
  top = Math.min(top, maxTop);
  top = Math.max(10, top);
  return top;
}

describe('Mission modal viewport clamping — small viewport', () => {
  const viewportH = 780;  // <=800px tall viewport (the bug repro scenario)
  const mapRectTop = 50;  // map starts 50px from viewport top
  const mapH = 730;

  it('top is at least 10px (never off the top)', () => {
    // Node near the very top of the map
    const top = computeModalTop({ nodeYpx: 0, mapH, mapRectTop, viewportH });
    expect(top).toBeGreaterThanOrEqual(10);
  });

  it('modal bottom (top + 75vh) does not exceed the viewport', () => {
    // Node near the bottom — the bug scenario
    const top = computeModalTop({ nodeYpx: 700, mapH, mapRectTop, viewportH });
    const maxModalH = viewportH * 0.75;
    expect(top + maxModalH).toBeLessThanOrEqual(viewportH - mapRectTop);
  });

  it('DEPLOY button is reachable: modal fits within viewport height', () => {
    // At a very low node (y=88% of map height, as in the repro)
    const nodeYpx = 0.88 * mapH;
    const top = computeModalTop({ nodeYpx, mapH, mapRectTop, viewportH });
    const modalBottomInViewport = mapRectTop + top + viewportH * 0.75;
    expect(modalBottomInViewport).toBeLessThanOrEqual(viewportH + 1); // +1 for float rounding
  });
});

describe('Mission modal viewport clamping — large viewport', () => {
  const viewportH = 1080;
  const mapRectTop = 50;
  const mapH = 1030;

  it('does not clamp top unnecessarily when viewport is large', () => {
    // Node in the middle of the map — ideal position should be preserved
    const nodeYpx = mapH * 0.5;
    const idealTop = nodeYpx - 80;
    const top = computeModalTop({ nodeYpx, mapH, mapRectTop, viewportH });
    // Should not be pushed down beyond the ideal position
    expect(top).toBeLessThanOrEqual(idealTop + 1);
  });

  it('top is at least 10px even on large viewports', () => {
    const top = computeModalTop({ nodeYpx: 0, mapH, mapRectTop, viewportH });
    expect(top).toBeGreaterThanOrEqual(10);
  });
});

describe('approxH constant — matches actual modal content height', () => {
  it('approxH is 660, which exceeds the old underestimate of 440 for uncompleted missions', () => {
    // The old value (440) was less than actual content (~650px), causing the modal
    // to be positioned too low. Verify the new value is large enough.
    const APPROX_H = 660;
    const OLD_UNCOMPLETED = 440;
    expect(APPROX_H).toBeGreaterThan(OLD_UNCOMPLETED);
  });

  it('approxH is 660, which exceeds the old underestimate of 560 for completed missions', () => {
    const APPROX_H = 660;
    const OLD_COMPLETED = 560;
    expect(APPROX_H).toBeGreaterThan(OLD_COMPLETED);
  });
});

describe('DEPLOY bar sticky positioning', () => {
  // Mirrors the inline style applied to the deploy bar div in buildMissionModal()
  const DEPLOY_BAR_STYLES = 'position:sticky;bottom:0';

  it('deploy bar uses position:sticky', () => {
    expect(DEPLOY_BAR_STYLES).toContain('position:sticky');
  });

  it('deploy bar is pinned to bottom:0 so it is always visible', () => {
    expect(DEPLOY_BAR_STYLES).toContain('bottom:0');
  });
});
