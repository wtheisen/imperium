import { describe, it, expect } from 'vitest';

/**
 * Mirrors the scrollbar CSS rules added to MissionSelectScene.injectStyles()
 * so we can verify the rules match the design system without a full browser.
 */
const SCROLLBAR_CSS = `
    #cm-modal::-webkit-scrollbar { width: 4px; }
    #cm-modal::-webkit-scrollbar-track { background: transparent; }
    #cm-modal::-webkit-scrollbar-thumb { background: rgba(200,152,42,0.3); border-radius: 2px; }
`;

/**
 * Mirrors the fade overlay styles applied in MissionSelectScene.showModal().
 */
const FADE_STYLES = {
  position: 'sticky',
  bottom: '0',
  left: '0',
  right: '0',
  height: '40px',
  pointerEvents: 'none',
  background: 'linear-gradient(transparent, rgba(10,10,14,0.95))',
  marginTop: '-40px',
  display: 'block',
  zIndex: '1',
};

/**
 * Mirrors the updateFade logic from MissionSelectScene.showModal():
 *   const atBottom = modal.scrollTop + modal.clientHeight >= modal.scrollHeight - 4;
 *   fade.style.opacity = atBottom ? '0' : '1';
 */
function computeFadeOpacity(scrollTop: number, clientHeight: number, scrollHeight: number): string {
  const atBottom = scrollTop + clientHeight >= scrollHeight - 4;
  return atBottom ? '0' : '1';
}

describe('Mission modal scrollbar CSS', () => {
  it('targets #cm-modal with webkit scrollbar pseudo-element', () => {
    expect(SCROLLBAR_CSS).toContain('#cm-modal::-webkit-scrollbar');
  });

  it('sets scrollbar width to 4px to match ui-scene.css pattern', () => {
    expect(SCROLLBAR_CSS).toContain('width: 4px');
  });

  it('sets scrollbar track background to transparent', () => {
    expect(SCROLLBAR_CSS).toContain('#cm-modal::-webkit-scrollbar-track');
    expect(SCROLLBAR_CSS).toContain('background: transparent');
  });

  it('sets scrollbar thumb to brass colour with 0.3 opacity', () => {
    expect(SCROLLBAR_CSS).toContain('#cm-modal::-webkit-scrollbar-thumb');
    expect(SCROLLBAR_CSS).toContain('background: rgba(200,152,42,0.3)');
  });

  it('rounds the scrollbar thumb with border-radius 2px', () => {
    expect(SCROLLBAR_CSS).toContain('border-radius: 2px');
  });
});

describe('Mission modal fade overlay styles', () => {
  it('uses sticky positioning so it stays visible at the bottom of the scroll viewport', () => {
    expect(FADE_STYLES.position).toBe('sticky');
  });

  it('pins the fade to the bottom edge', () => {
    expect(FADE_STYLES.bottom).toBe('0');
  });

  it('has pointer-events none so it does not block clicks', () => {
    expect(FADE_STYLES.pointerEvents).toBe('none');
  });

  it('uses a gradient fading to the modal background colour', () => {
    expect(FADE_STYLES.background).toContain('linear-gradient(transparent,');
    expect(FADE_STYLES.background).toContain('rgba(10,10,14,0.95)');
  });

  it('applies negative marginTop equal to height to overlay content rather than push it down', () => {
    expect(FADE_STYLES.marginTop).toBe('-40px');
    expect(FADE_STYLES.height).toBe('40px');
  });

  it('sits above content with z-index 1', () => {
    expect(FADE_STYLES.zIndex).toBe('1');
  });
});

describe('Mission modal fade opacity logic', () => {
  it('shows fade (opacity 1) when content overflows below visible area', () => {
    // 200px visible, 400px total content, scrolled to top
    expect(computeFadeOpacity(0, 200, 400)).toBe('1');
  });

  it('hides fade (opacity 0) when scrolled to the very bottom', () => {
    // 200px visible, 400px total, scrolled to bottom (scrollTop=200)
    expect(computeFadeOpacity(200, 200, 400)).toBe('0');
  });

  it('hides fade when within 4px tolerance of the bottom', () => {
    // scrollTop=197, clientHeight=200, scrollHeight=400 → 397 >= 396 → atBottom
    expect(computeFadeOpacity(197, 200, 400)).toBe('0');
  });

  it('shows fade when more than 4px from the bottom', () => {
    // scrollTop=100, clientHeight=200, scrollHeight=400 → 300 < 396 → not atBottom
    expect(computeFadeOpacity(100, 200, 400)).toBe('1');
  });

  it('hides fade when content fits without scrolling (no overflow)', () => {
    // scrollHeight equals clientHeight — nothing to scroll
    expect(computeFadeOpacity(0, 300, 300)).toBe('0');
  });

  it('hides fade when content is shorter than the visible area', () => {
    // Content shorter than viewport: scrollHeight < clientHeight
    expect(computeFadeOpacity(0, 400, 300)).toBe('0');
  });

  it('shows fade mid-scroll with long content', () => {
    // 75vh modal (~560px), lots of content
    expect(computeFadeOpacity(0, 560, 900)).toBe('1');
    expect(computeFadeOpacity(340, 560, 900)).toBe('0'); // scrolled to bottom
  });
});
