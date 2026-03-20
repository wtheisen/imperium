import { GameSceneInterface, getSceneManager } from './SceneManager';
import { getPlayerState, SavedDeck, savePlayerState, getCollectionCount } from '../state/PlayerState';
import { CARD_DATABASE } from '../cards/CardDatabase';
import { Card, CardType } from '../cards/Card';
import { MIN_DECK_SIZE, MAX_DECK_SIZE } from '../config';
import './deck-edit.css';

// ── Theme constants ─────────────────────────────────────────────

const TYPE_THEME: Record<CardType, { bg: string; border: string; label: string; icon: string }> = {
  unit:      { bg: 'rgba(60,80,120,0.2)',  border: 'rgba(80,120,180,0.35)', label: '#6090cc', icon: 'UNIT' },
  building:  { bg: 'rgba(60,100,60,0.2)',  border: 'rgba(80,150,80,0.35)',  label: '#60aa60', icon: 'BLDG' },
  ordnance:  { bg: 'rgba(100,60,120,0.2)', border: 'rgba(140,80,180,0.35)', label: '#a070cc', icon: 'ORD' },
  equipment: { bg: 'rgba(50,100,100,0.2)', border: 'rgba(70,150,150,0.35)', label: '#50b0b0', icon: 'GEAR' },
};

const TYPE_ORDER: CardType[] = ['unit', 'building', 'equipment'];

// ── Scene ───────────────────────────────────────────────────────

export class DeckEditScene implements GameSceneInterface {
  id = 'DeckEditScene';

  private activeDeckIndex: number = 0;
  private container: HTMLDivElement | null = null;
  private filterType: CardType | 'all' = 'all';

  create(_data?: any): void {
    const state = getPlayerState();
    this.activeDeckIndex = state.selectedDeckIndex;

    const container = document.createElement('div');
    this.container = container;
    Object.assign(container.style, {
      position: 'absolute', inset: '0',
      fontFamily: '"Share Tech Mono", monospace',
      color: '#c8bfa0',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      background: 'linear-gradient(160deg, #0a0a0e 0%, #12100c 40%, #0e0c08 100%)',
    });

    document.getElementById('game-container')?.appendChild(container);
    this.render();
  }

  shutdown(): void {
    this.container?.remove();
    this.container = null;
  }

  // ── Rendering ─────────────────────────────────────────────────

  private render(): void {
    if (!this.container) return;
    this.container.innerHTML = '';

    const state = getPlayerState();
    const deck = state.decks[this.activeDeckIndex];
    if (!deck) return;

    // Atmospheric background
    this.container.innerHTML = `
      <div style="position:absolute;inset:0;pointer-events:none;overflow:hidden;">
        <div style="position:absolute;inset:0;opacity:0.015;
          background:repeating-linear-gradient(45deg,transparent,transparent 18px,#c8982a 18px,#c8982a 20px);"></div>
        <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 50%,rgba(0,0,0,0.6) 100%);"></div>
      </div>
    `;

    // Top bar
    this.container.appendChild(this.buildTopBar(state, deck));

    // Warning bar
    const warn = document.createElement('div');
    warn.id = 'de-warning';
    Object.assign(warn.style, {
      height: '0', overflow: 'hidden', textAlign: 'center',
      fontSize: '11px', color: '#c43030', letterSpacing: '1px',
      fontFamily: '"Share Tech Mono",monospace',
      transition: 'height 0.2s, padding 0.2s',
      flexShrink: '0', background: 'rgba(196,48,48,0.05)',
    });
    this.container.appendChild(warn);

    // Main area
    const main = document.createElement('div');
    Object.assign(main.style, {
      display: 'flex', flex: '1', overflow: 'hidden', gap: '0',
      position: 'relative',
    });
    this.container.appendChild(main);

    main.appendChild(this.buildCollectionPanel(state, deck));
    main.appendChild(this.buildDeckPanel(deck));
  }

  // ── Top Bar ───────────────────────────────────────────────────

  private buildTopBar(state: ReturnType<typeof getPlayerState>, deck: SavedDeck): HTMLElement {
    const bar = document.createElement('div');
    Object.assign(bar.style, {
      display: 'flex', alignItems: 'center', padding: '12px 28px',
      gap: '0', flexShrink: '0', position: 'relative',
      borderBottom: '1px solid rgba(200,152,42,0.1)',
      background: 'linear-gradient(180deg,rgba(200,152,42,0.03) 0%,transparent 100%)',
    });

    // Left section: title + tabs
    const left = document.createElement('div');
    Object.assign(left.style, { display: 'flex', alignItems: 'center', gap: '16px' });

    // Title bar
    left.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-right:8px;">
        <div style="width:3px;height:24px;background:#c8982a;"></div>
        <div style="font-family:'Teko',sans-serif;font-size:13px;font-weight:500;
          color:rgba(200,152,42,0.45);letter-spacing:3px;">ARMOURY // DECK CONFIGURATION</div>
      </div>
    `;

    // Deck tabs
    const tabGroup = document.createElement('div');
    Object.assign(tabGroup.style, { display: 'flex', gap: '4px' });
    for (let i = 0; i < state.decks.length; i++) {
      const sel = i === this.activeDeckIndex;
      const tab = document.createElement('button');
      tab.className = 'de-tab';
      Object.assign(tab.style, {
        background: sel ? 'rgba(200,152,42,0.08)' : 'transparent',
        border: `1px solid ${sel ? 'rgba(200,152,42,0.35)' : 'rgba(200,191,160,0.06)'}`,
        color: sel ? '#c8982a' : '#4a4a3a',
        fontFamily: '"Share Tech Mono",monospace', fontSize: '11px',
        padding: '5px 16px', cursor: 'pointer', letterSpacing: '1px',
      });
      tab.textContent = state.decks[i].name.toUpperCase();
      tab.addEventListener('click', () => { this.activeDeckIndex = i; this.render(); });
      tabGroup.appendChild(tab);
    }
    left.appendChild(tabGroup);

    // New deck
    const newBtn = document.createElement('button');
    newBtn.className = 'de-tab';
    Object.assign(newBtn.style, {
      background: 'transparent', border: '1px dashed rgba(200,191,160,0.1)',
      color: '#3a3a2a', fontFamily: '"Share Tech Mono",monospace',
      fontSize: '11px', padding: '5px 12px', cursor: 'pointer', letterSpacing: '1px',
    });
    newBtn.textContent = '+ NEW';
    newBtn.addEventListener('click', () => {
      state.decks.push({
        id: `custom_${Date.now()}`, name: `Deck ${state.decks.length + 1}`,
        faction: 'adeptus_astartes', cardIds: [],
      });
      this.activeDeckIndex = state.decks.length - 1;
      this.render();
    });
    left.appendChild(newBtn);
    bar.appendChild(left);

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    bar.appendChild(spacer);

    // Back button
    const backBtn = document.createElement('button');
    Object.assign(backBtn.style, {
      background: 'transparent', border: '1px solid rgba(200,191,160,0.15)',
      color: '#5a7a5a', fontFamily: '"Share Tech Mono",monospace',
      fontSize: '11px', padding: '6px 20px', cursor: 'pointer', letterSpacing: '2px',
      transition: 'all 0.2s',
    });
    backBtn.textContent = 'DISMISS';
    backBtn.addEventListener('mouseenter', () => {
      backBtn.style.borderColor = 'rgba(80,150,80,0.4)';
      backBtn.style.color = '#7aaa7a';
    });
    backBtn.addEventListener('mouseleave', () => {
      backBtn.style.borderColor = 'rgba(200,191,160,0.15)';
      backBtn.style.color = '#5a7a5a';
    });
    backBtn.addEventListener('click', () => {
      for (const d of getPlayerState().decks) {
        if (d.cardIds.length < MIN_DECK_SIZE) {
          this.showWarning(`Deck "${d.name}" needs at least ${MIN_DECK_SIZE} cards (has ${d.cardIds.length})`);
          return;
        }
      }
      savePlayerState();
      getSceneManager().start('MissionSelectScene');
    });
    bar.appendChild(backBtn);

    return bar;
  }

  // ── Collection Panel (left) ───────────────────────────────────

  private buildCollectionPanel(state: ReturnType<typeof getPlayerState>, deck: SavedDeck): HTMLElement {
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      flex: '1', display: 'flex', flexDirection: 'column',
      overflow: 'hidden', padding: '20px 24px 16px',
      borderRight: '1px solid rgba(200,152,42,0.06)',
    });

    // Header + filters
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: '14px', flexShrink: '0',
    });

    header.innerHTML = `
      <div style="font-size:10px;letter-spacing:3px;color:rgba(200,152,42,0.4);">IMPERIAL ARMOURY</div>
    `;

    // Filter buttons
    const filters = document.createElement('div');
    Object.assign(filters.style, { display: 'flex', gap: '3px' });
    const allTypes: (CardType | 'all')[] = ['all', ...TYPE_ORDER];
    for (const t of allTypes) {
      const active = this.filterType === t;
      const btn = document.createElement('button');
      btn.className = 'de-filter-btn';
      Object.assign(btn.style, {
        background: active ? 'rgba(200,152,42,0.08)' : 'transparent',
        border: `1px solid ${active ? 'rgba(200,152,42,0.3)' : 'rgba(200,191,160,0.06)'}`,
        color: active ? '#c8982a' : '#3a3a2a',
        fontFamily: '"Share Tech Mono",monospace', fontSize: '9px',
        padding: '3px 8px', cursor: 'pointer', letterSpacing: '1px',
      });
      btn.textContent = t === 'all' ? 'ALL' : (TYPE_THEME[t as CardType]?.icon || t.toUpperCase());
      btn.addEventListener('click', () => { this.filterType = t; this.render(); });
      filters.appendChild(btn);
    }
    header.appendChild(filters);
    panel.appendChild(header);

    // Card grid
    const grid = document.createElement('div');
    grid.id = 'de-collection';
    Object.assign(grid.style, {
      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '6px', overflowY: 'auto', flex: '1', paddingRight: '4px',
    });
    panel.appendChild(grid);

    // Count cards in deck
    const deckCounts: Record<string, number> = {};
    for (const id of deck.cardIds) deckCounts[id] = (deckCounts[id] || 0) + 1;

    // Sort cards by type then name
    const allIds = Object.keys(state.collection)
      .filter(id => getCollectionCount(id) > 0)
      .filter(id => {
        const card = CARD_DATABASE[id];
        if (!card || card.type === 'ordnance') return false; // ordnance goes in ship slots, not decks
        if (this.filterType === 'all') return true;
        return card.type === this.filterType;
      })
      .sort((a, b) => {
        const ca = CARD_DATABASE[a], cb = CARD_DATABASE[b];
        if (!ca || !cb) return 0;
        const typeA = TYPE_ORDER.indexOf(ca.type as CardType);
        const typeB = TYPE_ORDER.indexOf(cb.type as CardType);
        if (typeA !== typeB) return typeA - typeB;
        return ca.cost - cb.cost;
      });

    let cardIdx = 0;
    for (const cardId of allIds) {
      const card = CARD_DATABASE[cardId];
      if (!card) continue;

      const owned = getCollectionCount(cardId);
      const inDeck = deckCounts[cardId] || 0;
      const canAdd = inDeck < owned && deck.cardIds.length < MAX_DECK_SIZE;
      const theme = TYPE_THEME[card.type as CardType] || TYPE_THEME.unit;

      const el = document.createElement('div');
      el.className = 'de-coll-card';
      el.dataset.disabled = canAdd ? 'false' : 'true';
      Object.assign(el.style, {
        background: canAdd ? theme.bg : 'rgba(200,191,160,0.01)',
        border: `1px solid ${canAdd ? theme.border : 'rgba(200,191,160,0.04)'}`,
        padding: '10px 10px 8px',
        cursor: canAdd ? 'pointer' : 'default',
        opacity: canAdd ? '1' : '0.35',
        animation: `de-card-in 0.25s ease-out ${cardIdx * 0.02}s both`,
        position: 'relative',
      });

      el.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
          <div style="font-size:9px;letter-spacing:1px;color:${theme.label};
            background:${theme.label}15;padding:1px 5px;">${theme.icon}</div>
          <div style="font-family:'Teko',sans-serif;font-size:18px;font-weight:600;
            color:#c8982a;line-height:1;">${card.cost}</div>
        </div>
        <div style="font-family:'Teko',sans-serif;font-size:16px;font-weight:600;
          color:${canAdd ? '#d8cca8' : '#4a4a3a'};letter-spacing:0.5px;line-height:1.2;
          margin-bottom:4px;">${card.name}</div>
        <div style="font-size:9px;color:rgba(200,191,160,0.3);line-height:1.4;
          display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
          overflow:hidden;margin-bottom:6px;">${card.description}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:9px;color:rgba(200,191,160,0.2);letter-spacing:1px;">
            ${inDeck}/${owned}</div>
          ${canAdd ? `<div style="font-size:9px;color:rgba(200,152,42,0.4);letter-spacing:1px;">+ ADD</div>` : ''}
        </div>
      `;

      if (canAdd) {
        el.addEventListener('click', () => {
          deck.cardIds.push(cardId);
          this.render();
        });
      }

      grid.appendChild(el);
      cardIdx++;
    }

    return panel;
  }

  // ── Deck Panel (right) ────────────────────────────────────────

  private buildDeckPanel(deck: SavedDeck): HTMLElement {
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      width: '320px', flexShrink: '0', display: 'flex',
      flexDirection: 'column', overflow: 'hidden', padding: '20px 24px 16px',
      background: 'rgba(200,152,42,0.01)',
    });

    // Header
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: '14px', flexShrink: '0',
    });

    const size = deck.cardIds.length;
    const valid = size >= MIN_DECK_SIZE && size <= MAX_DECK_SIZE;
    const sizeColor = size < MIN_DECK_SIZE ? '#c43030' : valid ? '#4a9e4a' : '#c8982a';

    header.innerHTML = `
      <div>
        <div style="font-size:10px;letter-spacing:3px;color:rgba(200,152,42,0.4);margin-bottom:4px;">
          ACTIVE LOADOUT</div>
        <div style="font-family:'Teko',sans-serif;font-size:24px;font-weight:600;
          color:#e8dcc0;letter-spacing:2px;line-height:1;">${deck.name.toUpperCase()}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-family:'Teko',sans-serif;font-size:32px;font-weight:700;
          color:${sizeColor};line-height:1;">${size}</div>
        <div style="font-size:9px;color:rgba(200,191,160,0.3);letter-spacing:1px;margin-top:-2px;">
          / ${MAX_DECK_SIZE} MAX</div>
      </div>
    `;
    panel.appendChild(header);

    // Capacity bar
    const barWrap = document.createElement('div');
    Object.assign(barWrap.style, {
      height: '3px', background: 'rgba(200,191,160,0.06)',
      marginBottom: '16px', flexShrink: '0', position: 'relative',
    });
    const barFill = document.createElement('div');
    const pct = Math.min(100, (size / MAX_DECK_SIZE) * 100);
    Object.assign(barFill.style, {
      height: '100%', width: `${pct}%`,
      background: `linear-gradient(90deg, ${sizeColor}, ${sizeColor}cc)`,
      boxShadow: `0 0 6px ${sizeColor}40`,
      transition: 'width 0.3s',
    });
    barWrap.appendChild(barFill);
    panel.appendChild(barWrap);

    // Min deck warning
    if (size < MIN_DECK_SIZE) {
      const minWarn = document.createElement('div');
      Object.assign(minWarn.style, {
        fontSize: '9px', color: '#c43030', letterSpacing: '1px',
        marginBottom: '12px', padding: '6px 8px',
        background: 'rgba(196,48,48,0.05)', borderLeft: '2px solid rgba(196,48,48,0.3)',
      });
      minWarn.textContent = `MINIMUM ${MIN_DECK_SIZE} CARDS REQUIRED`;
      panel.appendChild(minWarn);
    }

    // Card list
    const list = document.createElement('div');
    list.id = 'de-deck-list';
    Object.assign(list.style, {
      overflowY: 'auto', flex: '1', display: 'flex',
      flexDirection: 'column', gap: '2px',
    });
    panel.appendChild(list);

    // Group by card id, preserving order
    const cardCounts: Record<string, number> = {};
    const cardOrder: string[] = [];
    for (const id of deck.cardIds) {
      if (!cardCounts[id]) { cardCounts[id] = 0; cardOrder.push(id); }
      cardCounts[id]++;
    }

    // Sort by type then cost
    cardOrder.sort((a, b) => {
      const ca = CARD_DATABASE[a], cb = CARD_DATABASE[b];
      if (!ca || !cb) return 0;
      const typeA = TYPE_ORDER.indexOf(ca.type as CardType);
      const typeB = TYPE_ORDER.indexOf(cb.type as CardType);
      if (typeA !== typeB) return typeA - typeB;
      return ca.cost - cb.cost;
    });

    let rowIdx = 0;
    for (const cardId of cardOrder) {
      const card = CARD_DATABASE[cardId];
      if (!card) continue;
      const count = cardCounts[cardId];
      const theme = TYPE_THEME[card.type as CardType] || TYPE_THEME.unit;

      const row = document.createElement('div');
      row.className = 'de-deck-row';
      Object.assign(row.style, {
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '7px 10px',
        borderLeft: `2px solid ${theme.border}`,
        background: 'transparent',
        animation: `de-slide-right 0.2s ease-out ${rowIdx * 0.03}s both`,
      });

      row.innerHTML = `
        <div style="font-family:'Teko',sans-serif;font-size:18px;font-weight:600;
          color:#c8982a;min-width:20px;text-align:center;">${card.cost}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="font-family:'Teko',sans-serif;font-size:15px;font-weight:500;
              color:#c8bfa0;letter-spacing:0.5px;white-space:nowrap;overflow:hidden;
              text-overflow:ellipsis;">${card.name}${count > 1 ? ` <span style="color:rgba(200,191,160,0.3);">x${count}</span>` : ''}</div>
          </div>
          <div style="font-size:8px;color:${theme.label};letter-spacing:1px;opacity:0.6;">
            ${theme.icon}</div>
        </div>
      `;

      // Remove button
      const removeBtn = document.createElement('button');
      removeBtn.className = 'de-remove-btn';
      Object.assign(removeBtn.style, {
        background: 'transparent', border: 'none',
        color: '#6a4a4a', fontFamily: '"Share Tech Mono",monospace',
        fontSize: '14px', cursor: 'pointer', padding: '2px 6px',
        letterSpacing: '1px',
      });
      removeBtn.textContent = 'DEL';
      removeBtn.addEventListener('click', () => {
        const idx = deck.cardIds.indexOf(cardId);
        if (idx !== -1) { deck.cardIds.splice(idx, 1); this.render(); }
      });
      row.appendChild(removeBtn);

      list.appendChild(row);
      rowIdx++;
    }

    // Type breakdown summary at bottom
    const summary = document.createElement('div');
    Object.assign(summary.style, {
      display: 'flex', gap: '8px', justifyContent: 'center',
      padding: '12px 0 0', marginTop: '8px',
      borderTop: '1px solid rgba(200,152,42,0.06)', flexShrink: '0',
    });

    const typeCounts: Record<string, number> = {};
    for (const id of deck.cardIds) {
      const c = CARD_DATABASE[id];
      if (c) typeCounts[c.type] = (typeCounts[c.type] || 0) + 1;
    }

    for (const t of TYPE_ORDER) {
      const ct = typeCounts[t] || 0;
      if (ct === 0) continue;
      const theme = TYPE_THEME[t];
      summary.innerHTML += `
        <div style="font-size:9px;letter-spacing:1px;color:${theme.label};opacity:0.5;">
          ${theme.icon} ${ct}</div>
      `;
    }
    panel.appendChild(summary);

    return panel;
  }

  // ── Helpers ───────────────────────────────────────────────────

  private showWarning(msg: string): void {
    const el = this.container?.querySelector('#de-warning') as HTMLElement | null;
    if (el) {
      el.textContent = msg;
      el.style.height = '28px';
      el.style.padding = '6px 0';
      setTimeout(() => { el.style.height = '0'; el.style.padding = '0'; }, 3000);
    }
  }
}
