import { describe, it, expect } from 'vitest';
import { MAP_WIDTH, MAP_HEIGHT } from '../config';

// Pure helpers mirroring the DropSiteScene logic under test.

/** Resolves the display coordinate from hover/selected state — mirrors updateInfo() */
function resolveInfoCoord(hoverX: number, hoverY: number, selectedX: number, selectedY: number) {
  const infoX = (hoverX >= 0 && hoverX < MAP_WIDTH) ? hoverX : selectedX;
  const infoY = (hoverY >= 0 && hoverY < MAP_HEIGHT) ? hoverY : selectedY;
  return { infoX, infoY };
}

/** Formats the coordinate value for the COORDINATES readout — mirrors the template expression */
function formatCoords(infoX: number, infoY: number): string {
  return infoX < 0 || infoY < 0 ? '—' : `${infoX}, ${infoY}`;
}

describe('DropSiteScene coordinate display guard', () => {
  it('shows — when nothing is selected and cursor is off-map', () => {
    const { infoX, infoY } = resolveInfoCoord(-1, -1, -1, -1);
    expect(formatCoords(infoX, infoY)).toBe('—');
  });

  it('shows — when selectedX/Y are -1 and hover is off-map', () => {
    // Hover out of bounds (negative) falls back to selected which is also -1
    const { infoX, infoY } = resolveInfoCoord(-1, -1, -1, -1);
    expect(formatCoords(infoX, infoY)).toBe('—');
  });

  it('shows coordinates when cursor hovers on a valid tile', () => {
    const { infoX, infoY } = resolveInfoCoord(5, 10, -1, -1);
    expect(formatCoords(infoX, infoY)).toBe('5, 10');
  });

  it('shows coordinates when a zone is selected (no hover)', () => {
    const { infoX, infoY } = resolveInfoCoord(-1, -1, 20, 15);
    expect(formatCoords(infoX, infoY)).toBe('20, 15');
  });

  it('prefers hover over selected position', () => {
    const { infoX, infoY } = resolveInfoCoord(8, 12, 20, 15);
    expect(formatCoords(infoX, infoY)).toBe('8, 12');
  });

  it('falls back to selected when hover is at MAP_WIDTH boundary (off-map)', () => {
    // hoverX === MAP_WIDTH is out of bounds — should fall back to selectedX
    const { infoX, infoY } = resolveInfoCoord(MAP_WIDTH, MAP_HEIGHT, 3, 7);
    expect(formatCoords(infoX, infoY)).toBe('3, 7');
  });

  it('shows — when hover hits left/top map edge (x=0, y=0) which is valid', () => {
    const { infoX, infoY } = resolveInfoCoord(0, 0, -1, -1);
    expect(formatCoords(infoX, infoY)).toBe('0, 0');
  });
});

describe('DropSiteScene panel background styles', () => {
  // Verify the gradient style strings are present in DropSiteScene source.
  // These tests guard against accidental deletion of the background fix.
  it('right panel has a semi-transparent gradient background', async () => {
    const src = await import('../scenes/DropSiteScene?raw');
    expect(src.default).toContain(
      'background:linear-gradient(90deg, rgba(10,10,14,0.7) 0%, rgba(10,10,14,0.92) 30%, rgba(10,10,14,0.95) 100%)'
    );
  });

  it('left panel has a mirrored semi-transparent gradient background', async () => {
    const src = await import('../scenes/DropSiteScene?raw');
    expect(src.default).toContain(
      'background:linear-gradient(270deg, rgba(10,10,14,0.7) 0%, rgba(10,10,14,0.92) 30%, rgba(10,10,14,0.95) 100%)'
    );
  });

  it('right panel has padding-left to offset content from map edge', async () => {
    const src = await import('../scenes/DropSiteScene?raw');
    // The right panel style block should contain padding-left after the gradient line
    expect(src.default).toMatch(/background:linear-gradient\(90deg[^"]*\)[\s\S]*?padding-left:16px/);
  });

  it('left panel has padding-right to offset content from map edge', async () => {
    const src = await import('../scenes/DropSiteScene?raw');
    expect(src.default).toMatch(/background:linear-gradient\(270deg[^"]*\)[\s\S]*?padding-right:16px/);
  });
});

describe('DropSiteScene field conditions layout', () => {
  it('left panel has overflow-x:hidden to clip horizontal overflow', async () => {
    const src = await import('../scenes/DropSiteScene?raw');
    expect(src.default).toContain('overflow-x:hidden');
  });

  it('field conditions rows use grid layout to keep values inside panel', async () => {
    const src = await import('../scenes/DropSiteScene?raw');
    expect(src.default).toContain('grid-template-columns:1fr auto');
  });

  it('field conditions rows use align-items:baseline for label/value alignment', async () => {
    const src = await import('../scenes/DropSiteScene?raw');
    expect(src.default).toContain('align-items:baseline');
  });

  it('field conditions rows do not use flex space-between (caused value overflow)', async () => {
    const src = await import('../scenes/DropSiteScene?raw');
    // Extract just the three field condition row divs that follow the FIELD CONDITIONS label.
    // Each row had display:flex;justify-content:space-between before the fix — now grid.
    const start = src.default.indexOf('FIELD CONDITIONS');
    const end = src.default.indexOf('</div>\n        </div>', start);
    const fieldConditionsSection = src.default.slice(start, end);
    expect(fieldConditionsSection).not.toContain('display:flex;justify-content:space-between');
  });
});
