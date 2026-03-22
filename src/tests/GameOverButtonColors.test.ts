import { describe, it, expect } from 'vitest';

describe('GameOverScene button colors use imperial brass palette', () => {
  it('SUPPLY DEPOT button uses brass #c8982a instead of teal', async () => {
    const src = await import('../scenes/GameOverScene?raw');
    // Confirm brass is used and off-theme teal is gone from button creation
    expect(src.default).toContain("this.makeButton('SUPPLY DEPOT', '#c8982a')");
    expect(src.default).not.toContain("this.makeButton('SUPPLY DEPOT', '#50b0b0')");
  });

  it('SHIP button uses brass #c8982a instead of teal', async () => {
    const src = await import('../scenes/GameOverScene?raw');
    expect(src.default).toContain("this.makeButton('SHIP', '#c8982a')");
    expect(src.default).not.toContain("this.makeButton('SHIP', '#50b0b0')");
  });

  it('RETURN TO COMMAND button uses brass #c8982a on defeat instead of gray', async () => {
    const src = await import('../scenes/GameOverScene?raw');
    expect(src.default).toContain("this.victory ? '#4a9e4a' : '#c8982a'");
    expect(src.default).not.toContain("this.victory ? '#4a9e4a' : '#5a7a8a'");
  });

  it('teal color #50b0b0 is not used for any button', async () => {
    const src = await import('../scenes/GameOverScene?raw');
    expect(src.default).not.toContain("makeButton('SUPPLY DEPOT', '#50b0b0')");
    expect(src.default).not.toContain("makeButton('SHIP', '#50b0b0')");
  });

  it('gray color #5a7a8a is not used for RETURN TO COMMAND on defeat', async () => {
    const src = await import('../scenes/GameOverScene?raw');
    expect(src.default).not.toContain('#5a7a8a');
  });

  it('RETRY button retains brass #c8982a', async () => {
    const src = await import('../scenes/GameOverScene?raw');
    expect(src.default).toContain("this.makeButton('RETRY', '#c8982a')");
  });

  it('victory RETURN TO COMMAND still uses green #4a9e4a', async () => {
    const src = await import('../scenes/GameOverScene?raw');
    expect(src.default).toContain('#4a9e4a');
  });
});
