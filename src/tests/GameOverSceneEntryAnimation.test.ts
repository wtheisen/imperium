import { describe, it, expect } from 'vitest';

// Use ?raw imports to verify animation styles are present in source — consistent
// with the DropSitePanelBackground.test.ts pattern used elsewhere in this project.

describe('GameOverScene entry animation — keyframes', () => {
  it('defines go-fade-in keyframe from opacity 0 + translateY(10px) to opacity 1 + translateY(0)', async () => {
    const src = await import('../scenes/GameOverScene?raw');
    expect(src.default).toContain('@keyframes go-fade-in');
    expect(src.default).toContain('from { opacity: 0; transform: translateY(10px); }');
    expect(src.default).toContain('to   { opacity: 1; transform: translateY(0); }');
  });

  it('defines go-title-in keyframe from opacity 0 + scale(0.9) to opacity 1 + scale(1)', async () => {
    const src = await import('../scenes/GameOverScene?raw');
    expect(src.default).toContain('@keyframes go-title-in');
    expect(src.default).toContain('from { opacity: 0; transform: scale(0.9); }');
    expect(src.default).toContain('to   { opacity: 1; transform: scale(1); }');
  });
});

describe('GameOverScene entry animation — container and title', () => {
  it('applies go-fade-in animation to the main container', async () => {
    const src = await import('../scenes/GameOverScene?raw');
    expect(src.default).toContain("animation: 'go-fade-in 0.5s ease-out both'");
  });

  it('applies go-title-in animation to the title element', async () => {
    const src = await import('../scenes/GameOverScene?raw');
    expect(src.default).toContain('animation:go-title-in 0.6s ease-out 0.1s both');
  });

  it('applies go-fade-in to the subtitle element with early delay', async () => {
    const src = await import('../scenes/GameOverScene?raw');
    expect(src.default).toContain('animation:go-fade-in 0.3s ease-out 0.05s both');
  });

  it('applies go-fade-in to the stats bar (mission/objectives/duration) with 0.2s delay', async () => {
    const src = await import('../scenes/GameOverScene?raw');
    expect(src.default).toContain('animation:go-fade-in 0.4s ease-out 0.2s both');
  });
});

describe('GameOverScene entry animation — staggered sections', () => {
  it('stagger: rewards section has 0.3s delay', async () => {
    const src = await import('../scenes/GameOverScene?raw');
    expect(src.default).toContain('animation:go-fade-in 0.4s ease-out 0.3s both');
  });

  it('stagger: req points section has 0.35s delay', async () => {
    const src = await import('../scenes/GameOverScene?raw');
    expect(src.default).toContain('animation:go-fade-in 0.4s ease-out 0.35s both');
  });

  it('stagger: xp section has 0.4s delay', async () => {
    const src = await import('../scenes/GameOverScene?raw');
    expect(src.default).toContain('animation:go-fade-in 0.4s ease-out 0.4s both');
  });

  it('stagger: battle honours section has 0.45s delay', async () => {
    const src = await import('../scenes/GameOverScene?raw');
    expect(src.default).toContain('animation:go-fade-in 0.4s ease-out 0.45s both');
  });

  it('stagger: after-action report section has 0.5s delay', async () => {
    const src = await import('../scenes/GameOverScene?raw');
    expect(src.default).toContain('animation:go-fade-in 0.4s ease-out 0.5s both');
  });

  it('stagger: buttons div has 0.55s delay (last to appear)', async () => {
    const src = await import('../scenes/GameOverScene?raw');
    expect(src.default).toContain('animation:go-fade-in 0.4s ease-out 0.55s both');
  });
});

describe('GameOverScene entry animation — cleanup', () => {
  it('injects style element with id game-over-animations', async () => {
    const src = await import('../scenes/GameOverScene?raw');
    expect(src.default).toContain("goStyle.id = 'game-over-animations'");
  });

  it('removes the injected style element in shutdown()', async () => {
    const src = await import('../scenes/GameOverScene?raw');
    expect(src.default).toContain("document.getElementById('game-over-animations')?.remove()");
  });
});
