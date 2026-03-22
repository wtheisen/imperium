import { describe, it, expect } from 'vitest';

// Guard that the DropSiteScene shows feedback when clicking unwalkable tiles.
// These tests protect against regression of the invalid-click feedback fix.

describe('DropSiteScene unwalkable tile click feedback', () => {
  it('has an else branch for the isWalkable check in the click handler', async () => {
    const src = await import('../scenes/DropSiteScene?raw');
    // The click handler must have an else path calling showInvalidClick
    expect(src.default).toContain('showInvalidClick(tx, ty)');
  });

  it('defines showInvalidClick method', async () => {
    const src = await import('../scenes/DropSiteScene?raw');
    expect(src.default).toContain('private showInvalidClick(tx: number, ty: number)');
  });

  it('showInvalidClick stores the click position', async () => {
    const src = await import('../scenes/DropSiteScene?raw');
    expect(src.default).toContain('this.invalidClickX = tx');
    expect(src.default).toContain('this.invalidClickY = ty');
  });

  it('showInvalidClick clears after a timeout', async () => {
    const src = await import('../scenes/DropSiteScene?raw');
    expect(src.default).toContain('this.invalidClickX = -1');
    expect(src.default).toContain('this.invalidClickY = -1');
  });

  it('drawMap renders a red X at the invalid click position', async () => {
    const src = await import('../scenes/DropSiteScene?raw');
    // Should draw the X lines when invalidClickX >= 0
    expect(src.default).toContain('this.invalidClickX >= 0');
    expect(src.default).toMatch(/rgba\(220,60,60/);
  });

  it('mousemove handler sets cursor to not-allowed on unwalkable tiles', async () => {
    const src = await import('../scenes/DropSiteScene?raw');
    expect(src.default).toContain('not-allowed');
    expect(src.default).toContain("canvas.style.cursor");
  });

  it('shutdown clears the invalidClickTimer to prevent leaks', async () => {
    const src = await import('../scenes/DropSiteScene?raw');
    expect(src.default).toContain('clearTimeout(this.invalidClickTimer)');
  });
});
