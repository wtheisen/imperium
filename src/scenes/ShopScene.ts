import { GameSceneInterface, getSceneManager } from './SceneManager';
import { getPlayerState, addToCollection, spendRequisitionPoints, savePlayerState } from '../state/PlayerState';
import { CARD_DATABASE } from '../cards/CardDatabase';
import { CardType } from '../cards/Card';
import { SHOP_PRICE_MULTIPLIER } from '../config';

// ── Theme constants ─────────────────────────────────────────────

const TYPE_THEME: Record<CardType, { bg: string; border: string; label: string; icon: string }> = {
  unit:      { bg: 'rgba(60,80,120,0.2)',  border: 'rgba(80,120,180,0.35)', label: '#6090cc', icon: 'UNIT' },
  building:  { bg: 'rgba(60,100,60,0.2)',  border: 'rgba(80,150,80,0.35)',  label: '#60aa60', icon: 'BLDG' },
  ordnance:  { bg: 'rgba(100,60,120,0.2)', border: 'rgba(140,80,180,0.35)', label: '#a070cc', icon: 'ORD' },
  doctrine:  { bg: 'rgba(120,100,50,0.2)', border: 'rgba(180,150,60,0.35)', label: '#c8a844', icon: 'DOC' },
  equipment: { bg: 'rgba(50,100,100,0.2)', border: 'rgba(70,150,150,0.35)', label: '#50b0b0', icon: 'GEAR' },
};

const TYPE_ORDER: CardType[] = ['unit', 'building', 'equipment', 'ordnance', 'doctrine'];

// Inject fonts (shared with other scenes)
let fontsReady = false;
function ensureFonts(): void {
  if (fontsReady) return;
  fontsReady = true;
  if (!document.querySelector('link[href*="Teko"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Teko:wght@400;500;600;700&family=Share+Tech+Mono&display=swap';
    document.head.appendChild(link);
  }
}

let shopStylesInjected = false;
function injectShopStyles(): void {
  if (shopStylesInjected) return;
  shopStylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes shop-card-in {
      from { opacity:0; transform:translateY(12px); }
      to { opacity:1; transform:translateY(0); }
    }
    #shop-grid::-webkit-scrollbar {
      width: 4px;
    }
    #shop-grid::-webkit-scrollbar-track {
      background: rgba(200,191,160,0.03);
    }
    #shop-grid::-webkit-scrollbar-thumb {
      background: rgba(200,152,42,0.2);
      border-radius: 2px;
    }
    .shop-card {
      transition: all 0.15s;
    }
    .shop-card:hover {
      border-color: rgba(200,152,42,0.6) !important;
      background: rgba(200,152,42,0.06) !important;
    }
    .shop-buy-btn {
      transition: all 0.15s;
    }
    .shop-buy-btn:not(:disabled):hover {
      border-color: rgba(200,152,42,0.7) !important;
      background: rgba(200,152,42,0.15) !important;
      color: #e8dcc0 !important;
    }
    .shop-buy-btn:disabled {
      opacity: 0.3;
      cursor: default !important;
    }
    .shop-filter-btn {
      transition: all 0.15s;
    }
    .shop-filter-btn:hover {
      border-color: rgba(200,191,160,0.3) !important;
      color: #c8bfa0 !important;
    }
  `;
  document.head.appendChild(style);
}

// ── Scene ───────────────────────────────────────────────────────

export class ShopScene implements GameSceneInterface {
  id = 'ShopScene';

  private container: HTMLDivElement | null = null;
  private filterType: CardType | 'all' = 'all';

  create(): void {
    ensureFonts();
    injectShopStyles();

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
      zIndex: '10',
    });

    document.getElementById('game-container')?.appendChild(container);
    this.render();
  }

  shutdown(): void {
    this.container?.remove();
    this.container = null;
  }

  private render(): void {
    if (!this.container) return;
    this.container.innerHTML = '';

    const state = getPlayerState();

    // Atmospheric background
    const bg = document.createElement('div');
    bg.innerHTML = `
      <div style="position:absolute;inset:0;pointer-events:none;overflow:hidden;">
        <div style="position:absolute;inset:0;opacity:0.015;
          background:repeating-linear-gradient(45deg,transparent,transparent 18px,#c8982a 18px,#c8982a 20px);"></div>
        <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 50%,rgba(0,0,0,0.6) 100%);"></div>
        <div style="position:absolute;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,rgba(200,191,160,0.04),transparent);
          animation:ms-scanline 8s linear infinite;pointer-events:none;"></div>
      </div>
    `;
    this.container.appendChild(bg);

    // Top bar
    this.container.appendChild(this.buildTopBar(state));

    // Filter bar
    this.container.appendChild(this.buildFilterBar());

    // Card grid
    this.container.appendChild(this.buildCardGrid(state));
  }

  private buildTopBar(state: ReturnType<typeof getPlayerState>): HTMLElement {
    const bar = document.createElement('div');
    Object.assign(bar.style, {
      display: 'flex', alignItems: 'center', padding: '12px 28px',
      flexShrink: '0', position: 'relative',
      borderBottom: '1px solid rgba(200,152,42,0.1)',
      background: 'linear-gradient(180deg,rgba(200,152,42,0.03) 0%,transparent 100%)',
    });

    // Left: title
    const left = document.createElement('div');
    Object.assign(left.style, { display: 'flex', alignItems: 'center', gap: '12px' });
    left.innerHTML = `
      <div style="width:3px;height:24px;background:#c8982a;"></div>
      <div style="font-family:'Teko',sans-serif;font-size:13px;font-weight:500;
        color:rgba(200,152,42,0.45);letter-spacing:3px;">SUPPLY DEPOT // REQUISITION EXCHANGE</div>
    `;
    bar.appendChild(left);

    // Center spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    bar.appendChild(spacer);

    // Req points display
    const reqDisplay = document.createElement('div');
    Object.assign(reqDisplay.style, {
      display: 'flex', alignItems: 'center', gap: '8px', marginRight: '20px',
    });
    reqDisplay.innerHTML = `
      <div style="font-size:10px;letter-spacing:2px;color:rgba(200,152,42,0.5);">REQUISITION</div>
      <div id="shop-req-display" style="font-family:'Teko',sans-serif;font-size:26px;font-weight:700;
        color:#c8982a;line-height:1;">${state.requisitionPoints}</div>
      <div style="font-size:10px;color:rgba(200,152,42,0.4);letter-spacing:1px;">RP</div>
    `;
    bar.appendChild(reqDisplay);

    // Back button
    const backBtn = document.createElement('button');
    Object.assign(backBtn.style, {
      background: 'transparent', border: '1px solid rgba(200,191,160,0.15)',
      color: '#5a7a5a', fontFamily: '"Share Tech Mono",monospace',
      fontSize: '11px', padding: '6px 20px', cursor: 'pointer', letterSpacing: '2px',
      transition: 'all 0.2s',
    });
    backBtn.textContent = 'BACK TO COMMAND';
    backBtn.addEventListener('mouseenter', () => {
      backBtn.style.borderColor = 'rgba(80,150,80,0.4)';
      backBtn.style.color = '#7aaa7a';
    });
    backBtn.addEventListener('mouseleave', () => {
      backBtn.style.borderColor = 'rgba(200,191,160,0.15)';
      backBtn.style.color = '#5a7a5a';
    });
    backBtn.addEventListener('click', () => {
      getSceneManager().start('MissionSelectScene');
    });
    bar.appendChild(backBtn);

    return bar;
  }

  private buildFilterBar(): HTMLElement {
    const bar = document.createElement('div');
    Object.assign(bar.style, {
      display: 'flex', alignItems: 'center', gap: '4px',
      padding: '12px 28px', flexShrink: '0',
      borderBottom: '1px solid rgba(200,152,42,0.06)',
    });

    const label = document.createElement('div');
    Object.assign(label.style, {
      fontSize: '9px', letterSpacing: '2px', color: 'rgba(200,152,42,0.35)',
      marginRight: '12px',
    });
    label.textContent = 'FILTER';
    bar.appendChild(label);

    const allTypes: (CardType | 'all')[] = ['all', ...TYPE_ORDER];
    for (const t of allTypes) {
      const active = this.filterType === t;
      const btn = document.createElement('button');
      btn.className = 'shop-filter-btn';
      Object.assign(btn.style, {
        background: active ? 'rgba(200,152,42,0.08)' : 'transparent',
        border: `1px solid ${active ? 'rgba(200,152,42,0.3)' : 'rgba(200,191,160,0.06)'}`,
        color: active ? '#c8982a' : '#3a3a2a',
        fontFamily: '"Share Tech Mono",monospace', fontSize: '10px',
        padding: '4px 10px', cursor: 'pointer', letterSpacing: '1px',
      });
      btn.textContent = t === 'all' ? 'ALL' : (TYPE_THEME[t as CardType]?.icon || t.toUpperCase());
      btn.addEventListener('click', () => { this.filterType = t; this.render(); });
      bar.appendChild(btn);
    }

    return bar;
  }

  private buildCardGrid(state: ReturnType<typeof getPlayerState>): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.id = 'shop-grid';
    Object.assign(wrapper.style, {
      flex: '1', overflowY: 'auto', padding: '20px 28px',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      gap: '10px', alignContent: 'start', position: 'relative',
    });

    // Get all cards, sorted by type then cost
    const allIds = Object.keys(CARD_DATABASE)
      .filter(id => {
        if (this.filterType === 'all') return true;
        return CARD_DATABASE[id].type === this.filterType;
      })
      .sort((a, b) => {
        const ca = CARD_DATABASE[a], cb = CARD_DATABASE[b];
        const typeA = TYPE_ORDER.indexOf(ca.type as CardType);
        const typeB = TYPE_ORDER.indexOf(cb.type as CardType);
        if (typeA !== typeB) return typeA - typeB;
        return ca.cost - cb.cost;
      });

    let cardIdx = 0;
    for (const cardId of allIds) {
      const card = CARD_DATABASE[cardId];
      if (!card) continue;

      const buyPrice = card.cost * SHOP_PRICE_MULTIPLIER;
      const owned = state.collection[cardId] || 0;
      const canAfford = state.requisitionPoints >= buyPrice;
      const theme = TYPE_THEME[card.type as CardType] || TYPE_THEME.unit;

      const el = document.createElement('div');
      el.className = 'shop-card';
      Object.assign(el.style, {
        background: theme.bg,
        border: `1px solid ${theme.border}`,
        padding: '12px 14px 10px',
        position: 'relative',
        animation: `shop-card-in 0.25s ease-out ${cardIdx * 0.02}s both`,
      });

      el.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <div style="font-size:9px;letter-spacing:1px;color:${theme.label};
            background:${theme.label}15;padding:1px 5px;">${theme.icon}</div>
          <div style="font-family:'Teko',sans-serif;font-size:18px;font-weight:600;
            color:#c8982a;line-height:1;" title="In-game cost">${card.cost}</div>
        </div>
        <div style="font-family:'Teko',sans-serif;font-size:18px;font-weight:600;
          color:#d8cca8;letter-spacing:0.5px;line-height:1.2;margin-bottom:4px;">${card.name}</div>
        <div style="font-size:9px;color:rgba(200,191,160,0.35);line-height:1.4;
          display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
          overflow:hidden;margin-bottom:10px;min-height:25px;">${card.description}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="font-size:9px;color:rgba(200,191,160,0.25);letter-spacing:1px;">OWNED</div>
            <div style="font-family:'Teko',sans-serif;font-size:18px;font-weight:600;
              color:rgba(200,191,160,0.5);line-height:1;">${owned}</div>
          </div>
          <div id="shop-buy-${cardId}"></div>
        </div>
      `;

      // Buy button
      const buySlot = el.querySelector(`#shop-buy-${cardId}`)!;
      const buyBtn = document.createElement('button');
      buyBtn.className = 'shop-buy-btn';
      buyBtn.disabled = !canAfford;
      Object.assign(buyBtn.style, {
        background: canAfford ? 'rgba(200,152,42,0.08)' : 'transparent',
        border: `1px solid ${canAfford ? 'rgba(200,152,42,0.35)' : 'rgba(200,191,160,0.08)'}`,
        color: canAfford ? '#c8982a' : '#3a3a2a',
        fontFamily: '"Share Tech Mono",monospace', fontSize: '10px',
        padding: '4px 10px', cursor: canAfford ? 'pointer' : 'default',
        letterSpacing: '1px',
      });
      buyBtn.textContent = `BUY ${buyPrice} RP`;
      buyBtn.addEventListener('click', () => {
        if (spendRequisitionPoints(buyPrice)) {
          addToCollection(cardId, 1);
          savePlayerState();
          this.render();
        }
      });
      buySlot.appendChild(buyBtn);

      wrapper.appendChild(el);
      cardIdx++;
    }

    if (allIds.length === 0) {
      const empty = document.createElement('div');
      Object.assign(empty.style, {
        gridColumn: '1 / -1', textAlign: 'center', padding: '60px 0',
        fontSize: '12px', color: 'rgba(200,191,160,0.3)', letterSpacing: '2px',
      });
      empty.textContent = 'NO ITEMS AVAILABLE';
      wrapper.appendChild(empty);
    }

    return wrapper;
  }
}
