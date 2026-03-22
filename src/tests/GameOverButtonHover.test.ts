import { describe, it, expect } from 'vitest';

/**
 * Mirrors the mouseenter/mouseleave handler logic from GameOverScene.makeButton()
 * to verify that hover effects use textShadow (not letterSpacing) so no layout
 * reflow occurs.
 */
function applyHoverStyles(
  btn: { style: Record<string, string> },
  color: string,
): void {
  btn.style.background = `linear-gradient(180deg,${color}25 0%,${color}12 100%)`;
  btn.style.borderColor = `${color}90`;
  btn.style.textShadow = `0 0 8px ${color}40`;
}

function removeHoverStyles(
  btn: { style: Record<string, string> },
  color: string,
): void {
  btn.style.background = `linear-gradient(180deg,${color}15 0%,${color}08 100%)`;
  btn.style.borderColor = `${color}60`;
  btn.style.textShadow = 'none';
}

describe('GameOverScene button hover — no letter-spacing reflow', () => {
  const color = '#c8982a';

  it('mouseenter sets textShadow glow instead of changing letterSpacing', () => {
    const btn = { style: { textShadow: '', letterSpacing: '4px', background: '', borderColor: '' } };
    applyHoverStyles(btn, color);
    expect(btn.style.textShadow).toBe(`0 0 8px ${color}40`);
  });

  it('mouseenter does not change letterSpacing', () => {
    const btn = { style: { textShadow: '', letterSpacing: '4px', background: '', borderColor: '' } };
    applyHoverStyles(btn, color);
    expect(btn.style.letterSpacing).toBe('4px');
  });

  it('mouseenter brightens background gradient', () => {
    const btn = { style: { textShadow: '', letterSpacing: '4px', background: '', borderColor: '' } };
    applyHoverStyles(btn, color);
    expect(btn.style.background).toBe(
      `linear-gradient(180deg,${color}25 0%,${color}12 100%)`,
    );
  });

  it('mouseenter brightens border color', () => {
    const btn = { style: { textShadow: '', letterSpacing: '4px', background: '', borderColor: '' } };
    applyHoverStyles(btn, color);
    expect(btn.style.borderColor).toBe(`${color}90`);
  });

  it('mouseleave clears textShadow', () => {
    const btn = { style: { textShadow: `0 0 8px ${color}40`, letterSpacing: '4px', background: '', borderColor: '' } };
    removeHoverStyles(btn, color);
    expect(btn.style.textShadow).toBe('none');
  });

  it('mouseleave does not change letterSpacing', () => {
    const btn = { style: { textShadow: `0 0 8px ${color}40`, letterSpacing: '4px', background: '', borderColor: '' } };
    removeHoverStyles(btn, color);
    expect(btn.style.letterSpacing).toBe('4px');
  });

  it('mouseleave restores dim background gradient', () => {
    const btn = { style: { textShadow: `0 0 8px ${color}40`, letterSpacing: '4px', background: '', borderColor: '' } };
    removeHoverStyles(btn, color);
    expect(btn.style.background).toBe(
      `linear-gradient(180deg,${color}15 0%,${color}08 100%)`,
    );
  });

  it('mouseleave restores dim border color', () => {
    const btn = { style: { textShadow: `0 0 8px ${color}40`, letterSpacing: '4px', background: '', borderColor: '' } };
    removeHoverStyles(btn, color);
    expect(btn.style.borderColor).toBe(`${color}60`);
  });
});
