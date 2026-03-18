const STYLE_ID = 'keybinding-overlay-styles';

const SECTIONS: { title: string; bindings: [string, string][] }[] = [
  {
    title: 'Cards',
    bindings: [
      ['1-9', 'Select card from hand'],
      ['~', 'Draw card (3g)'],
      ['Click / Drag', 'Play selected card'],
    ],
  },
  {
    title: 'Camera',
    bindings: [
      ['Middle-drag', 'Orbit'],
      ['Right-drag', 'Pan'],
      ['Scroll', 'Zoom'],
      ['Q / E', 'Rotate'],
    ],
  },
  {
    title: 'Units',
    bindings: [
      ['Left-click', 'Select unit'],
      ['Box select', 'Select multiple'],
      ['Double-click', 'Select all of type'],
      ['Right-click', 'Move / Attack'],
      ['Ctrl+1-9', 'Save control group'],
      ['Shift+1-9', 'Recall control group'],
    ],
  },
  {
    title: 'Actions',
    bindings: [
      ['Q W E R T', 'Context actions (row 1)'],
      ['A S D F G', 'Context actions (row 2)'],
      ['Z', 'Attack move'],
      ['X', 'Stop'],
      ['C', 'Hold position'],
    ],
  },
  {
    title: 'General',
    bindings: [
      ['P', 'Pause / Resume'],
      ['Esc', 'Cancel'],
      ['?', 'Toggle this help'],
    ],
  },
];

export class KeybindingOverlay {
  private el: HTMLDivElement;
  private visible = false;
  private boundKeyDown: (e: KeyboardEvent) => void;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'kb-overlay';
    this.el.style.display = 'none';
    document.body.appendChild(this.el);

    // Build content
    const panel = document.createElement('div');
    panel.className = 'kb-overlay__panel';
    panel.addEventListener('click', (e) => e.stopPropagation());

    const title = document.createElement('div');
    title.className = 'kb-overlay__title';
    title.textContent = 'KEYBOARD SHORTCUTS';
    panel.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'kb-overlay__sections';

    for (const section of SECTIONS) {
      const sec = document.createElement('div');
      sec.className = 'kb-overlay__section';
      const hdr = document.createElement('div');
      hdr.className = 'kb-overlay__section-title';
      hdr.textContent = section.title;
      sec.appendChild(hdr);

      for (const [key, desc] of section.bindings) {
        const row = document.createElement('div');
        row.className = 'kb-overlay__row';
        const badge = document.createElement('span');
        badge.className = 'kb-overlay__key';
        badge.textContent = key;
        const label = document.createElement('span');
        label.className = 'kb-overlay__desc';
        label.textContent = desc;
        row.appendChild(badge);
        row.appendChild(label);
        sec.appendChild(row);
      }
      grid.appendChild(sec);
    }
    panel.appendChild(grid);

    const hint = document.createElement('div');
    hint.className = 'kb-overlay__hint';
    hint.textContent = 'Press any key or click outside to close';
    panel.appendChild(hint);

    this.el.appendChild(panel);

    // Backdrop click dismisses
    this.el.addEventListener('click', () => this.hide());

    // Key listener
    this.boundKeyDown = (e: KeyboardEvent) => {
      if (!this.visible && e.key === '?') {
        this.show();
        e.preventDefault();
        e.stopPropagation();
      } else if (this.visible) {
        this.hide();
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('keydown', this.boundKeyDown, true);

    this.injectStyles();
  }

  show(): void {
    this.visible = true;
    this.el.style.display = 'flex';
  }

  hide(): void {
    this.visible = false;
    this.el.style.display = 'none';
  }

  toggle(): void {
    this.visible ? this.hide() : this.show();
  }

  isVisible(): boolean {
    return this.visible;
  }

  destroy(): void {
    document.removeEventListener('keydown', this.boundKeyDown, true);
    this.el.remove();
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
  }

  private injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .kb-overlay {
        position: fixed;
        inset: 0;
        z-index: 200;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(10,10,14,0.85);
      }
      .kb-overlay__panel {
        background: #0e0c0a;
        border: 1px solid rgba(200,152,42,0.25);
        border-radius: 6px;
        max-width: 600px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        padding: 20px 24px;
        box-shadow: 0 8px 40px rgba(0,0,0,0.8);
      }
      .kb-overlay__title {
        font-family: 'Teko', sans-serif;
        font-size: 22px;
        font-weight: 600;
        color: #c8982a;
        letter-spacing: 3px;
        text-align: center;
        margin-bottom: 16px;
        border-bottom: 1px solid rgba(200,152,42,0.15);
        padding-bottom: 10px;
      }
      .kb-overlay__sections {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }
      @media (max-width: 500px) {
        .kb-overlay__sections { grid-template-columns: 1fr; }
      }
      .kb-overlay__section-title {
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 2px;
        color: #c8982a;
        margin-bottom: 6px;
        font-family: 'Share Tech Mono', monospace;
      }
      .kb-overlay__row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
      }
      .kb-overlay__key {
        display: inline-block;
        min-width: 60px;
        text-align: center;
        padding: 2px 6px;
        font-family: 'Share Tech Mono', monospace;
        font-size: 11px;
        color: #d4c8a0;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(200,152,42,0.2);
        border-radius: 3px;
        white-space: nowrap;
      }
      .kb-overlay__desc {
        font-family: 'Share Tech Mono', monospace;
        font-size: 11px;
        color: #9a8e76;
      }
      .kb-overlay__hint {
        text-align: center;
        margin-top: 16px;
        font-family: 'Share Tech Mono', monospace;
        font-size: 10px;
        color: #5a5040;
      }
    `;
    document.head.appendChild(style);
  }
}
