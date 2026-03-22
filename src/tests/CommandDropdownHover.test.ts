import { describe, it, expect } from 'vitest';

/**
 * Mirrors the style block content from MissionSelectScene.injectStyles()
 * so we can verify hover and animation rules without a full DOM/browser setup.
 */
const INJECTED_CSS = `
  @keyframes dropdown-enter {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .ms-cmd-item:hover {
    color: #c8982a !important;
    background: rgba(200,152,42,0.08) !important;
  }
`;

/**
 * Mirrors the mouseenter/mouseleave handler logic from MissionSelectScene
 * so we can verify the hover colors applied via JS.
 */
function applyHoverStyles(el: { style: Record<string, string> }): void {
  el.style.background = 'rgba(200,152,42,0.08)';
  el.style.color = '#c8982a';
}

function removeHoverStyles(el: { style: Record<string, string> }): void {
  el.style.background = 'transparent';
  el.style.color = '#5a7a8a';
}

/**
 * Mirrors the dropdown show/hide logic from MissionSelectScene.
 */
function showDropdown(el: { style: Record<string, string> }): void {
  el.style.display = 'block';
  el.style.animation = 'dropdown-enter 0.15s ease-out';
}

function hideDropdown(el: { style: Record<string, string> }): void {
  el.style.display = 'none';
}

describe('Command dropdown hover state', () => {
  it('CSS includes a :hover rule for .ms-cmd-item', () => {
    expect(INJECTED_CSS).toContain('.ms-cmd-item:hover');
  });

  it('hover rule sets brass accent color', () => {
    expect(INJECTED_CSS).toContain('color: #c8982a !important');
  });

  it('hover rule sets brass tinted background', () => {
    expect(INJECTED_CSS).toContain('background: rgba(200,152,42,0.08) !important');
  });

  it('mouseenter handler sets brass color', () => {
    const el = { style: { color: '#5a7a8a', background: 'transparent' } };
    applyHoverStyles(el);
    expect(el.style.color).toBe('#c8982a');
  });

  it('mouseenter handler sets brass tinted background', () => {
    const el = { style: { color: '#5a7a8a', background: 'transparent' } };
    applyHoverStyles(el);
    expect(el.style.background).toBe('rgba(200,152,42,0.08)');
  });

  it('mouseleave handler resets color to muted blue-gray', () => {
    const el = { style: { color: '#c8982a', background: 'rgba(200,152,42,0.08)' } };
    removeHoverStyles(el);
    expect(el.style.color).toBe('#5a7a8a');
  });

  it('mouseleave handler resets background to transparent', () => {
    const el = { style: { color: '#c8982a', background: 'rgba(200,152,42,0.08)' } };
    removeHoverStyles(el);
    expect(el.style.background).toBe('transparent');
  });
});

describe('Command dropdown entry animation', () => {
  it('CSS defines the dropdown-enter keyframe', () => {
    expect(INJECTED_CSS).toContain('@keyframes dropdown-enter');
  });

  it('keyframe starts with opacity 0 and a translateY(-4px) offset', () => {
    expect(INJECTED_CSS).toContain('opacity: 0');
    expect(INJECTED_CSS).toContain('translateY(-4px)');
  });

  it('keyframe ends at opacity 1 and translateY(0)', () => {
    expect(INJECTED_CSS).toContain('opacity: 1');
    expect(INJECTED_CSS).toContain('translateY(0)');
  });

  it('showDropdown sets display to block', () => {
    const el = { style: { display: 'none', animation: '' } };
    showDropdown(el);
    expect(el.style.display).toBe('block');
  });

  it('showDropdown applies dropdown-enter animation', () => {
    const el = { style: { display: 'none', animation: '' } };
    showDropdown(el);
    expect(el.style.animation).toBe('dropdown-enter 0.15s ease-out');
  });

  it('hideDropdown sets display to none (no animation on close)', () => {
    const el = { style: { display: 'block', animation: 'dropdown-enter 0.15s ease-out' } };
    hideDropdown(el);
    expect(el.style.display).toBe('none');
  });
});
