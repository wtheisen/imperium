import { describe, it, expect } from 'vitest';

describe('ShipScene upgrade button visibility', () => {
  it('affordable button uses high-contrast text color #e8d48b', async () => {
    const src = await import('../scenes/ShipScene?raw');
    expect(src.default).toContain('#e8d48b');
  });

  it('affordable button border has sufficient opacity (0.6)', async () => {
    const src = await import('../scenes/ShipScene?raw');
    expect(src.default).toContain('rgba(200,152,42,0.6)');
  });

  it('affordable button background has sufficient opacity (0.15)', async () => {
    const src = await import('../scenes/ShipScene?raw');
    expect(src.default).toContain('rgba(200,152,42,0.15)');
  });

  it('disabled/unaffordable button uses readable color #4a4a3a (not near-black #3a3a2a)', async () => {
    const src = await import('../scenes/ShipScene?raw');
    expect(src.default).toContain('#4a4a3a');
    expect(src.default).not.toContain("'#3a3a2a'");
    expect(src.default).not.toContain('"#3a3a2a"');
  });

  it('affordable button has a subtle glow box-shadow', async () => {
    const src = await import('../scenes/ShipScene?raw');
    expect(src.default).toContain('box-shadow: 0 0 8px rgba(200,152,42,0.15)');
  });
});
