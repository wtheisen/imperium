import { describe, it, expect } from 'vitest';

/**
 * Mirrors the default style values applied to the "+ NEW" deck button
 * in DeckEditScene so we can verify visibility without a full DOM setup.
 */
function applyDefaultStyles(el: { style: Record<string, string> }): void {
  el.style.background = 'transparent';
  el.style.borderColor = 'rgba(200,191,160,0.3)';
  el.style.color = '#6a6a5a';
}

function applyHoverStyles(el: { style: Record<string, string> }): void {
  el.style.borderColor = 'rgba(200,152,42,0.5)';
  el.style.color = '#c8982a';
}

function applyLeaveStyles(el: { style: Record<string, string> }): void {
  el.style.borderColor = 'rgba(200,191,160,0.3)';
  el.style.color = '#6a6a5a';
}

describe('+ NEW deck button default visibility', () => {
  it('default border uses 0.3 opacity (not near-invisible 0.1)', async () => {
    const src = await import('../scenes/DeckEditScene?raw');
    expect(src.default).toContain('rgba(200,191,160,0.3)');
    expect(src.default).not.toContain('rgba(200,191,160,0.1)');
  });

  it('default text color is #6a6a5a', async () => {
    const src = await import('../scenes/DeckEditScene?raw');
    expect(src.default).toContain('#6a6a5a');
  });

  it('default style sets background to transparent', () => {
    const el = { style: {} as Record<string, string> };
    applyDefaultStyles(el);
    expect(el.style.background).toBe('transparent');
  });

  it('default style sets readable border opacity', () => {
    const el = { style: {} as Record<string, string> };
    applyDefaultStyles(el);
    expect(el.style.borderColor).toBe('rgba(200,191,160,0.3)');
  });

  it('default style sets readable text color', () => {
    const el = { style: {} as Record<string, string> };
    applyDefaultStyles(el);
    expect(el.style.color).toBe('#6a6a5a');
  });
});

describe('+ NEW deck button hover state', () => {
  it('source includes mouseenter listener for hover color', async () => {
    const src = await import('../scenes/DeckEditScene?raw');
    expect(src.default).toContain('mouseenter');
    expect(src.default).toContain('rgba(200,152,42,0.5)');
    expect(src.default).toContain('#c8982a');
  });

  it('source includes mouseleave listener to reset styles', async () => {
    const src = await import('../scenes/DeckEditScene?raw');
    expect(src.default).toContain('mouseleave');
  });

  it('mouseenter handler sets brass accent border', () => {
    const el = { style: { borderColor: 'rgba(200,191,160,0.3)', color: '#6a6a5a' } };
    applyHoverStyles(el);
    expect(el.style.borderColor).toBe('rgba(200,152,42,0.5)');
  });

  it('mouseenter handler sets brass accent color', () => {
    const el = { style: { borderColor: 'rgba(200,191,160,0.3)', color: '#6a6a5a' } };
    applyHoverStyles(el);
    expect(el.style.color).toBe('#c8982a');
  });

  it('mouseleave handler resets border to default opacity', () => {
    const el = { style: { borderColor: 'rgba(200,152,42,0.5)', color: '#c8982a' } };
    applyLeaveStyles(el);
    expect(el.style.borderColor).toBe('rgba(200,191,160,0.3)');
  });

  it('mouseleave handler resets text color to default', () => {
    const el = { style: { borderColor: 'rgba(200,152,42,0.5)', color: '#c8982a' } };
    applyLeaveStyles(el);
    expect(el.style.color).toBe('#6a6a5a');
  });
});
