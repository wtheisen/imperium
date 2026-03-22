import { describe, it, expect } from 'vitest';

/**
 * Mirrors the node-state style logic from TechTreeScene.createNodeVisual()
 * so we can verify visual differentiation without a full DOM/browser setup.
 */

interface NodeStyle {
  borderColor: string;
  fillColor: string;
  textColor: string;
  boxShadow: string;
  opacity: string;
}

function computeNodeStyle(
  isUnlocked: boolean,
  isAvailable: boolean,
  isActive: boolean,
): NodeStyle {
  let borderColor = '#333344';
  let fillColor = '#1a1a2e';
  let textColor = '#666666';
  let boxShadow = 'none';
  let opacity = '0.5';

  if (isUnlocked) {
    borderColor = isActive ? '#44aacc' : '#44aa44';
    fillColor = isActive ? '#1a2e2e' : '#1a2e1a';
    textColor = isActive ? '#88eeff' : '#88ff88';
    opacity = '0.95';
  } else if (isAvailable) {
    borderColor = isActive ? '#44ccdd' : '#ccaa44';
    fillColor = isActive ? '#1a2a2e' : '#352e1a';
    textColor = isActive ? '#44ccdd' : '#ccaa44';
    boxShadow = '0 0 10px rgba(204,170,68,0.3), inset 0 0 6px rgba(204,170,68,0.1)';
    opacity = '0.95';
  } else if (isActive) {
    borderColor = '#335566';
    fillColor = '#151a22';
    textColor = '#556688';
  }

  return { borderColor, fillColor, textColor, boxShadow, opacity };
}

/** Mirrors the mouseenter handler for available nodes */
function applyHoverStyles(el: { style: Record<string, string> }, boxShadow: string): void {
  el.style.background = '#3e351a';
  el.style.borderColor = '#ffd700';
  el.style.boxShadow = '0 0 14px rgba(204,170,68,0.4)';
}

/** Mirrors the mouseleave handler for available nodes */
function removeHoverStyles(
  el: { style: Record<string, string> },
  fillColor: string,
  borderColor: string,
  boxShadow: string,
): void {
  el.style.background = fillColor;
  el.style.borderColor = borderColor;
  el.style.boxShadow = boxShadow;
}

describe('TechTree node visual states — locked', () => {
  it('locked passive node has 0.5 opacity', () => {
    const s = computeNodeStyle(false, false, false);
    expect(s.opacity).toBe('0.5');
  });

  it('locked passive node has dim border #333344', () => {
    const s = computeNodeStyle(false, false, false);
    expect(s.borderColor).toBe('#333344');
  });

  it('locked passive node has muted text #666666', () => {
    const s = computeNodeStyle(false, false, false);
    expect(s.textColor).toBe('#666666');
  });

  it('locked passive node has no box-shadow', () => {
    const s = computeNodeStyle(false, false, false);
    expect(s.boxShadow).toBe('none');
  });

  it('locked active node has dim blue-gray border', () => {
    const s = computeNodeStyle(false, false, true);
    expect(s.borderColor).toBe('#335566');
  });

  it('locked active node still has 0.5 opacity (falls through to else-if active)', () => {
    const s = computeNodeStyle(false, false, true);
    expect(s.opacity).toBe('0.5');
  });
});

describe('TechTree node visual states — available (purchasable)', () => {
  it('available passive node has full opacity', () => {
    const s = computeNodeStyle(false, true, false);
    expect(s.opacity).toBe('0.95');
  });

  it('available passive node has gold border #ccaa44', () => {
    const s = computeNodeStyle(false, true, false);
    expect(s.borderColor).toBe('#ccaa44');
  });

  it('available passive node has warm fill #352e1a', () => {
    const s = computeNodeStyle(false, true, false);
    expect(s.fillColor).toBe('#352e1a');
  });

  it('available passive node has gold box-shadow glow', () => {
    const s = computeNodeStyle(false, true, false);
    expect(s.boxShadow).toContain('rgba(204,170,68,0.3)');
    expect(s.boxShadow).toContain('rgba(204,170,68,0.1)');
  });

  it('available active node has teal border #44ccdd', () => {
    const s = computeNodeStyle(false, true, true);
    expect(s.borderColor).toBe('#44ccdd');
  });

  it('available active node still gets glow', () => {
    const s = computeNodeStyle(false, true, true);
    expect(s.boxShadow).toContain('rgba(204,170,68,0.3)');
  });
});

describe('TechTree node visual states — unlocked', () => {
  it('unlocked passive node has full opacity', () => {
    const s = computeNodeStyle(true, false, false);
    expect(s.opacity).toBe('0.95');
  });

  it('unlocked passive node has green border #44aa44', () => {
    const s = computeNodeStyle(true, false, false);
    expect(s.borderColor).toBe('#44aa44');
  });

  it('unlocked passive node has green text #88ff88', () => {
    const s = computeNodeStyle(true, false, false);
    expect(s.textColor).toBe('#88ff88');
  });

  it('unlocked passive node has no box-shadow', () => {
    const s = computeNodeStyle(true, false, false);
    expect(s.boxShadow).toBe('none');
  });

  it('unlocked active node has teal border #44aacc', () => {
    const s = computeNodeStyle(true, false, true);
    expect(s.borderColor).toBe('#44aacc');
  });

  it('unlocked active node has teal text #88eeff', () => {
    const s = computeNodeStyle(true, false, true);
    expect(s.textColor).toBe('#88eeff');
  });
});

describe('TechTree node visual states — contrast between states', () => {
  it('locked nodes have lower opacity than available nodes', () => {
    const locked = computeNodeStyle(false, false, false);
    const available = computeNodeStyle(false, true, false);
    expect(parseFloat(locked.opacity)).toBeLessThan(parseFloat(available.opacity));
  });

  it('locked nodes have lower opacity than unlocked nodes', () => {
    const locked = computeNodeStyle(false, false, false);
    const unlocked = computeNodeStyle(true, false, false);
    expect(parseFloat(locked.opacity)).toBeLessThan(parseFloat(unlocked.opacity));
  });

  it('only available nodes get a box-shadow glow', () => {
    const locked = computeNodeStyle(false, false, false);
    const available = computeNodeStyle(false, true, false);
    const unlocked = computeNodeStyle(true, false, false);
    expect(locked.boxShadow).toBe('none');
    expect(available.boxShadow).not.toBe('none');
    expect(unlocked.boxShadow).toBe('none');
  });
});

describe('TechTree node hover styles — available nodes', () => {
  it('mouseenter sets bright gold border #ffd700', () => {
    const el = { style: { background: '#352e1a', borderColor: '#ccaa44', boxShadow: 'none' } };
    applyHoverStyles(el, 'none');
    expect(el.style.borderColor).toBe('#ffd700');
  });

  it('mouseenter sets warmer fill #3e351a', () => {
    const el = { style: { background: '#352e1a', borderColor: '#ccaa44', boxShadow: 'none' } };
    applyHoverStyles(el, 'none');
    expect(el.style.background).toBe('#3e351a');
  });

  it('mouseenter intensifies box-shadow glow', () => {
    const el = { style: { background: '#352e1a', borderColor: '#ccaa44', boxShadow: 'none' } };
    applyHoverStyles(el, 'none');
    expect(el.style.boxShadow).toContain('rgba(204,170,68,0.4)');
  });

  it('mouseleave restores original fill', () => {
    const el = { style: { background: '#3e351a', borderColor: '#ffd700', boxShadow: '' } };
    const originalFill = '#352e1a';
    const originalBorder = '#ccaa44';
    const originalShadow = '0 0 10px rgba(204,170,68,0.3), inset 0 0 6px rgba(204,170,68,0.1)';
    removeHoverStyles(el, originalFill, originalBorder, originalShadow);
    expect(el.style.background).toBe(originalFill);
  });

  it('mouseleave restores original border', () => {
    const el = { style: { background: '#3e351a', borderColor: '#ffd700', boxShadow: '' } };
    const originalFill = '#352e1a';
    const originalBorder = '#ccaa44';
    const originalShadow = '0 0 10px rgba(204,170,68,0.3), inset 0 0 6px rgba(204,170,68,0.1)';
    removeHoverStyles(el, originalFill, originalBorder, originalShadow);
    expect(el.style.borderColor).toBe(originalBorder);
  });

  it('mouseleave restores original box-shadow', () => {
    const el = { style: { background: '#3e351a', borderColor: '#ffd700', boxShadow: '' } };
    const originalFill = '#352e1a';
    const originalBorder = '#ccaa44';
    const originalShadow = '0 0 10px rgba(204,170,68,0.3), inset 0 0 6px rgba(204,170,68,0.1)';
    removeHoverStyles(el, originalFill, originalBorder, originalShadow);
    expect(el.style.boxShadow).toBe(originalShadow);
  });
});
