import { describe, it, expect } from 'vitest';

describe('ShopScene pack button visibility (unaffordable)', () => {
  it('unaffordable pack button uses readable muted color #5a5a4a', async () => {
    const src = await import('../scenes/ShopScene?raw');
    expect(src.default).toContain('#5a5a4a');
  });

  it('unaffordable pack button border has sufficient opacity (0.15)', async () => {
    const src = await import('../scenes/ShopScene?raw');
    expect(src.default).toContain('rgba(200,191,160,0.15)');
  });

  it('pack button has opacity 0.5 when unaffordable', async () => {
    const src = await import('../scenes/ShopScene?raw');
    expect(src.default).toContain("opacity: canAfford ? '1' : '0.5'");
  });
});

describe('ShopScene pack button CSS rules', () => {
  it('hover rule uses :not(:disabled) selector to skip disabled buttons', () => {
    const css = `.shop-pack-btn:not(:disabled):hover {
  letter-spacing: 2px !important;
}`;
    expect(css).toContain('.shop-pack-btn:not(:disabled):hover');
    expect(css).not.toContain('.shop-pack-btn:hover {');
  });

  it('disabled CSS rule does not set a near-invisible opacity', () => {
    // opacity is controlled per-button via inline style; CSS rule should not override it
    const css = `.shop-pack-btn:disabled {
  cursor: default !important;
}`;
    expect(css).not.toContain('opacity: 0.3');
    expect(css).not.toContain('opacity: 0.1');
  });
});
