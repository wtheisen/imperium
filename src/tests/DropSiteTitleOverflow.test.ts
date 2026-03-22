import { describe, it, expect } from 'vitest';

// Guard that the mission title div in DropSiteScene has overflow-safe styles.
// These tests protect against accidental regression of the title overflow fix.

describe('DropSiteScene mission title overflow fix', () => {
  it('title div has word-break:break-word to prevent overflow', async () => {
    const src = await import('../scenes/DropSiteScene?raw');
    expect(src.default).toContain('word-break:break-word');
  });

  it('title div uses line-height:1.1 for wrapped-line spacing', async () => {
    const src = await import('../scenes/DropSiteScene?raw');
    // The title div should use 1.1, not the old value of 1
    expect(src.default).toMatch(/font-size:28px[^}]*line-height:1\.1/);
  });

  it('title text is uppercased via toUpperCase()', async () => {
    const src = await import('../scenes/DropSiteScene?raw');
    expect(src.default).toContain('this.mission.name.toUpperCase()');
  });
});
