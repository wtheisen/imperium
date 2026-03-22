import { EventBus } from '../EventBus';
import { CARD_DATABASE } from '../cards/CardDatabase';
import { CardType } from '../cards/Card';
import { PACK_BURN_GOLD_MULTIPLIER } from '../config';
import { PackType, PackDecision } from '../packs/PackTypes';

// ── Theme constants (shared with ShopScene) ──────────────────────

const TYPE_THEME: Record<CardType, { bg: string; border: string; label: string; icon: string }> = {
  unit:      { bg: 'rgba(60,80,120,0.2)',  border: 'rgba(80,120,180,0.35)', label: '#6090cc', icon: 'UNIT' },
  building:  { bg: 'rgba(60,100,60,0.2)',  border: 'rgba(80,150,80,0.35)',  label: '#60aa60', icon: 'BLDG' },
  ordnance:  { bg: 'rgba(100,60,120,0.2)', border: 'rgba(140,80,180,0.35)', label: '#a070cc', icon: 'ORD' },
  equipment: { bg: 'rgba(50,100,100,0.2)', border: 'rgba(70,150,150,0.35)', label: '#50b0b0', icon: 'GEAR' },
};

const PACK_LABEL: Record<PackType, string> = {
  random: 'RANDOM',
  wargear: 'WARGEAR',
  ordnance: 'ORDNANCE',
  unit: 'UNIT',
  building: 'BUILDING',
};

// ── Styles ──────────────────────────────────────────────────────

let stylesInjected = false;
function injectPackStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pack-fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes pack-slide-up {
      from { opacity: 0; transform: translateY(20px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    .pack-card-row {
      transition: all 0.15s;
    }
    .pack-card-row:hover {
      background: rgba(200,152,42,0.04) !important;
    }
    .pack-toggle-btn {
      transition: all 0.15s;
      cursor: pointer;
    }
    .pack-toggle-btn:hover {
      border-color: rgba(200,152,42,0.6) !important;
    }
    .pack-toggle-btn.active-take {
      background: rgba(80,180,80,0.15) !important;
      border-color: rgba(80,180,80,0.5) !important;
      color: #7acc7a !important;
    }
    .pack-toggle-btn.active-burn {
      background: rgba(200,80,60,0.15) !important;
      border-color: rgba(200,80,60,0.5) !important;
      color: #cc7a6a !important;
    }
    .pack-confirm-btn {
      transition: all 0.15s;
      cursor: pointer;
    }
    .pack-confirm-btn:hover {
      background: rgba(200,152,42,0.15) !important;
      border-color: rgba(200,152,42,0.7) !important;
      color: #e8dcc0 !important;
    }
  `;
  document.head.appendChild(style);
}

// ── PackPickupUI ────────────────────────────────────────────────

export class PackPickupUI {
  private overlay: HTMLDivElement | null = null;
  private packId: string;
  private packType: PackType;
  private cardIds: string[];
  private decisions: PackDecision[];

  constructor(packId: string, packType: PackType, cardIds: string[]) {
    this.packId = packId;
    this.packType = packType;
    this.cardIds = cardIds;
    // Default all cards to 'take'
    this.decisions = cardIds.map(id => ({ cardId: id, action: 'take' as const }));

    injectPackStyles();
    this.build();
    EventBus.emit('game-paused');
  }

  private build(): void {
    // Overlay backdrop
    const overlay = document.createElement('div');
    this.overlay = overlay;
    Object.assign(overlay.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '10000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)',
      animation: 'pack-fade-in 0.2s ease-out',
      fontFamily: '"Share Tech Mono","Courier New",monospace',
    });

    // Modal
    const modal = document.createElement('div');
    Object.assign(modal.style, {
      background: 'linear-gradient(160deg, rgba(10,10,14,0.95) 0%, rgba(14,12,8,0.95) 100%)',
      border: '1px solid rgba(200,152,42,0.2)',
      maxWidth: '500px',
      width: '90%',
      position: 'relative',
      animation: 'pack-slide-up 0.3s ease-out',
      overflow: 'hidden',
    });

    // Atmospheric diagonal stripes (subtle)
    const stripes = document.createElement('div');
    Object.assign(stripes.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      opacity: '0.015',
      background: 'repeating-linear-gradient(45deg,transparent,transparent 18px,#c8982a 18px,#c8982a 20px)',
    });
    modal.appendChild(stripes);

    // Header
    const header = document.createElement('div');
    Object.assign(header.style, {
      padding: '16px 20px 12px',
      borderBottom: '1px solid rgba(200,152,42,0.12)',
      background: 'linear-gradient(180deg,rgba(200,152,42,0.04) 0%,transparent 100%)',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      position: 'relative',
    });
    header.innerHTML = `
      <div style="width:3px;height:20px;background:#c8982a;"></div>
      <div style="font-family:'Teko',sans-serif;font-size:22px;font-weight:600;
        color:#c8982a;letter-spacing:3px;line-height:1;">LOOT PACK</div>
      <div style="font-family:'Teko',sans-serif;font-size:13px;font-weight:500;
        color:rgba(200,152,42,0.45);letter-spacing:2px;line-height:1;margin-top:3px;">
        // ${PACK_LABEL[this.packType]}</div>
    `;
    modal.appendChild(header);

    // Instruction
    const instructions = document.createElement('div');
    Object.assign(instructions.style, {
      padding: '10px 20px 6px',
      fontSize: '9px',
      letterSpacing: '1px',
      color: 'rgba(200,191,160,0.35)',
      position: 'relative',
    });
    instructions.textContent = 'CHOOSE: TAKE CARD OR BURN FOR REQUISITION';
    modal.appendChild(instructions);

    // Card list
    const cardList = document.createElement('div');
    Object.assign(cardList.style, {
      padding: '6px 20px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      position: 'relative',
    });

    for (let i = 0; i < this.cardIds.length; i++) {
      const cardId = this.cardIds[i];
      const card = CARD_DATABASE[cardId];
      if (!card) continue;

      const theme = TYPE_THEME[card.type as CardType] || TYPE_THEME.unit;
      const burnValue = Math.floor(card.cost * PACK_BURN_GOLD_MULTIPLIER);

      const row = document.createElement('div');
      row.className = 'pack-card-row';
      Object.assign(row.style, {
        background: theme.bg,
        border: `1px solid ${theme.border}`,
        padding: '10px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      });

      // Card info section
      const info = document.createElement('div');
      info.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="font-size:9px;letter-spacing:1px;color:${theme.label};
              background:${theme.label}15;padding:1px 5px;">${theme.icon}</div>
            <div style="font-family:'Teko',sans-serif;font-size:18px;font-weight:600;
              color:#d8cca8;letter-spacing:0.5px;line-height:1;">${card.name}</div>
          </div>
          <div style="font-family:'Teko',sans-serif;font-size:16px;font-weight:600;
            color:#c8982a;line-height:1;" title="In-game cost">${card.cost}g</div>
        </div>
        <div style="font-size:9px;color:rgba(200,191,160,0.4);line-height:1.4;
          margin-bottom:2px;">${card.description}</div>
      `;
      row.appendChild(info);

      // Action buttons
      const actions = document.createElement('div');
      Object.assign(actions.style, {
        display: 'flex',
        gap: '6px',
        justifyContent: 'flex-end',
      });

      const takeBtn = document.createElement('button');
      takeBtn.className = 'pack-toggle-btn active-take';
      Object.assign(takeBtn.style, {
        background: 'transparent',
        border: '1px solid rgba(200,191,160,0.15)',
        fontFamily: '"Share Tech Mono",monospace',
        fontSize: '10px',
        padding: '4px 12px',
        letterSpacing: '1px',
        color: '#5a7a5a',
      });
      takeBtn.textContent = 'TAKE';

      const burnBtn = document.createElement('button');
      burnBtn.className = 'pack-toggle-btn';
      Object.assign(burnBtn.style, {
        background: 'transparent',
        border: '1px solid rgba(200,191,160,0.15)',
        fontFamily: '"Share Tech Mono",monospace',
        fontSize: '10px',
        padding: '4px 12px',
        letterSpacing: '1px',
        color: '#7a5a5a',
      });
      burnBtn.textContent = `BURN +${burnValue}g`;

      // Wire up toggle logic
      const idx = i;
      const updateButtons = () => {
        const isTake = this.decisions[idx].action === 'take';
        takeBtn.className = `pack-toggle-btn ${isTake ? 'active-take' : ''}`;
        burnBtn.className = `pack-toggle-btn ${!isTake ? 'active-burn' : ''}`;
      };

      takeBtn.addEventListener('click', () => {
        this.decisions[idx].action = 'take';
        updateButtons();
      });
      burnBtn.addEventListener('click', () => {
        this.decisions[idx].action = 'burn';
        updateButtons();
      });

      // Set initial active state
      updateButtons();

      actions.appendChild(takeBtn);
      actions.appendChild(burnBtn);
      row.appendChild(actions);

      cardList.appendChild(row);
    }

    modal.appendChild(cardList);

    // Divider
    const divider = document.createElement('div');
    Object.assign(divider.style, {
      height: '1px',
      margin: '0 20px',
      background: 'linear-gradient(90deg,transparent,rgba(200,152,42,0.15),transparent)',
      position: 'relative',
    });
    modal.appendChild(divider);

    // Confirm button
    const confirmArea = document.createElement('div');
    Object.assign(confirmArea.style, {
      padding: '14px 20px',
      display: 'flex',
      justifyContent: 'center',
      position: 'relative',
    });

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'pack-confirm-btn';
    Object.assign(confirmBtn.style, {
      background: 'rgba(200,152,42,0.08)',
      border: '1px solid rgba(200,152,42,0.35)',
      color: '#c8982a',
      fontFamily: '"Share Tech Mono",monospace',
      fontSize: '12px',
      padding: '8px 32px',
      letterSpacing: '3px',
      cursor: 'pointer',
    });
    confirmBtn.textContent = 'CONFIRM';
    confirmBtn.addEventListener('click', () => {
      EventBus.emit('pack-decision', {
        packId: this.packId,
        decisions: this.decisions,
      });
      this.destroy();
    });

    confirmArea.appendChild(confirmBtn);
    modal.appendChild(confirmArea);

    overlay.appendChild(modal);
    document.getElementById('game-container')?.appendChild(overlay);
  }

  destroy(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
      EventBus.emit('game-resumed');
    }
  }
}
