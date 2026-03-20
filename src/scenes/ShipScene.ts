import { GameSceneInterface, getSceneManager } from './SceneManager';
import { getPlayerState, spendShipCredits, setShipUpgradeLevel, savePlayerState, getShipOrdnance, setShipOrdnance } from '../state/PlayerState';
import { SHIP_ROOMS } from '../ship/ShipDatabase';
import { getShipUpgradeLevel, getShipOrdnanceSlots } from '../ship/ShipState';
import { CARD_DATABASE } from '../cards/CardDatabase';
import { Card } from '../cards/Card';

// ── Theme constants ─────────────────────────────────────────────

const ROOM_THEMES: Record<string, { border: string; icon: string }> = {
  logistics_bay:    { border: '#6090cc', icon: '\u2692' },  // ⚒
  armorium:         { border: '#c8982a', icon: '\u2694' },  // ⚔
  astropathic_choir: { border: '#a070cc', icon: '\u2604' }, // ☄
  augur_array:      { border: '#50b0b0', icon: '\u25C9' },  // ◉
  enginarium:       { border: '#60aa60', icon: '\u2699' },  // ⚙
};

let shipStylesInjected = false;
function injectShipStyles(): void {
  if (shipStylesInjected) return;
  shipStylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes ship-card-in {
      from { opacity:0; transform:translateY(16px); }
      to { opacity:1; transform:translateY(0); }
    }
    @keyframes ship-scanline {
      0% { transform: translateY(-100%); }
      100% { transform: translateY(100vh); }
    }
    .ship-room-card {
      transition: all 0.2s;
    }
    .ship-room-card:hover {
      border-color: rgba(200,152,42,0.4) !important;
      background: rgba(200,152,42,0.04) !important;
    }
    .ship-upgrade-btn {
      transition: all 0.15s;
    }
    .ship-upgrade-btn:not(:disabled):hover {
      border-color: rgba(200,152,42,0.7) !important;
      background: rgba(200,152,42,0.18) !important;
      color: #e8dcc0 !important;
    }
    .ship-upgrade-btn:disabled {
      opacity: 0.35;
      cursor: default !important;
    }
    .ship-nav-btn {
      transition: all 0.2s;
    }
    .ship-nav-btn:hover {
      border-color: rgba(90,122,138,0.6) !important;
      color: #7a9aaa !important;
    }
  `;
  document.head.appendChild(style);
}

// ── Scene ───────────────────────────────────────────────────────

export class ShipScene implements GameSceneInterface {
  id = 'ShipScene';

  private container: HTMLDivElement | null = null;

  create(): void {
    injectShipStyles();

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
          animation:ship-scanline 8s linear infinite;pointer-events:none;"></div>
      </div>
    `;
    this.container.appendChild(bg);

    // Top bar
    this.container.appendChild(this.buildTopBar(state));

    // Room grid
    this.container.appendChild(this.buildRoomGrid());

    // Ordnance loadout
    this.container.appendChild(this.buildOrdnanceLoadout());
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
        color:rgba(200,152,42,0.45);letter-spacing:3px;">STRIKE CRUISER // SHIP SYSTEMS</div>
    `;
    bar.appendChild(left);

    // Center spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    bar.appendChild(spacer);

    // Ship credits display
    const creditsDisplay = document.createElement('div');
    Object.assign(creditsDisplay.style, {
      display: 'flex', alignItems: 'center', gap: '8px', marginRight: '20px',
    });
    creditsDisplay.innerHTML = `
      <div style="font-size:10px;letter-spacing:2px;color:rgba(80,176,176,0.5);">SHIP CREDITS</div>
      <div id="ship-credits-display" style="font-family:'Teko',sans-serif;font-size:26px;font-weight:700;
        color:#50b0b0;line-height:1;">${state.shipCredits}</div>
      <div style="font-size:10px;color:rgba(80,176,176,0.4);letter-spacing:1px;">SC</div>
    `;
    bar.appendChild(creditsDisplay);

    // Nav buttons
    const navContainer = document.createElement('div');
    Object.assign(navContainer.style, { display: 'flex', gap: '8px' });

    const supplyBtn = document.createElement('button');
    supplyBtn.className = 'ship-nav-btn';
    Object.assign(supplyBtn.style, {
      background: 'transparent', border: '1px solid rgba(90,122,138,0.3)',
      color: '#5a7a8a', fontFamily: '"Share Tech Mono",monospace',
      fontSize: '11px', padding: '6px 14px', cursor: 'pointer', letterSpacing: '1px',
    });
    supplyBtn.textContent = 'SUPPLY DEPOT';
    supplyBtn.addEventListener('click', () => {
      getSceneManager().start('ShopScene');
    });
    navContainer.appendChild(supplyBtn);

    const backBtn = document.createElement('button');
    backBtn.className = 'ship-nav-btn';
    Object.assign(backBtn.style, {
      background: 'transparent', border: '1px solid rgba(200,191,160,0.15)',
      color: '#5a7a5a', fontFamily: '"Share Tech Mono",monospace',
      fontSize: '11px', padding: '6px 20px', cursor: 'pointer', letterSpacing: '2px',
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
    navContainer.appendChild(backBtn);

    bar.appendChild(navContainer);
    return bar;
  }

  private buildRoomGrid(): HTMLElement {
    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, {
      flex: '1', overflowY: 'auto', padding: '28px',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: '16px', alignContent: 'start', position: 'relative',
    });

    const state = getPlayerState();

    SHIP_ROOMS.forEach((room, idx) => {
      const currentLevel = getShipUpgradeLevel(room.id);
      const maxLevel = room.tiers.length;
      const isMaxed = currentLevel >= maxLevel;
      const currentTier = currentLevel > 0 ? room.tiers[currentLevel - 1] : null;
      const nextTier = !isMaxed ? room.tiers[currentLevel] : null;
      const canAfford = nextTier ? state.shipCredits >= nextTier.cost : false;
      const theme = ROOM_THEMES[room.id] || { border: '#c8982a', icon: '\u2726' };

      const card = document.createElement('div');
      card.className = 'ship-room-card';
      Object.assign(card.style, {
        background: 'rgba(200,191,160,0.02)',
        border: '1px solid rgba(200,191,160,0.08)',
        borderLeft: `3px solid ${theme.border}`,
        padding: '20px 22px 18px',
        position: 'relative',
        animation: `ship-card-in 0.3s ease-out ${idx * 0.06}s both`,
      });

      // Build level dots
      const dots = Array.from({ length: maxLevel }, (_, i) => {
        const filled = i < currentLevel;
        return `<div style="width:10px;height:10px;border-radius:50%;
          border:1px solid ${filled ? theme.border : 'rgba(200,191,160,0.15)'};
          background:${filled ? theme.border : 'transparent'};
          ${filled ? `box-shadow:0 0 6px ${theme.border}40;` : ''}
          transition:all 0.3s;"></div>`;
      }).join('');

      card.innerHTML = `
        <!-- Header -->
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <div style="font-size:22px;line-height:1;">${theme.icon}</div>
          <div style="flex:1;">
            <div style="font-family:'Teko',sans-serif;font-size:22px;font-weight:600;
              color:#e8dcc0;letter-spacing:1px;line-height:1;">${room.name.toUpperCase()}</div>
          </div>
        </div>

        <!-- Description -->
        <div style="font-size:10px;color:rgba(200,191,160,0.4);line-height:1.5;margin-bottom:14px;">
          ${room.description}</div>

        <!-- Divider -->
        <div style="height:1px;background:linear-gradient(90deg,${theme.border}30,transparent);margin-bottom:14px;"></div>

        <!-- Level indicator -->
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <div style="font-size:9px;letter-spacing:2px;color:rgba(200,191,160,0.3);">LEVEL</div>
          <div style="display:flex;gap:4px;">${dots}</div>
          <div style="font-size:10px;color:rgba(200,191,160,0.25);margin-left:auto;">
            ${currentLevel}/${maxLevel}</div>
        </div>

        <!-- Current effect -->
        ${currentTier ? `
          <div style="padding:8px 10px;background:rgba(200,191,160,0.03);
            border-left:2px solid ${theme.border}40;margin-bottom:10px;">
            <div style="font-size:9px;letter-spacing:1px;color:rgba(200,191,160,0.3);margin-bottom:3px;">ACTIVE</div>
            <div style="font-size:12px;color:${theme.border};letter-spacing:0.5px;">
              ${currentTier.description}</div>
          </div>
        ` : `
          <div style="padding:8px 10px;background:rgba(200,191,160,0.015);
            border-left:2px solid rgba(200,191,160,0.06);margin-bottom:10px;">
            <div style="font-size:9px;letter-spacing:1px;color:rgba(200,191,160,0.2);">NOT UPGRADED</div>
          </div>
        `}

        <!-- Next tier preview -->
        ${nextTier ? `
          <div style="padding:8px 10px;background:rgba(200,152,42,0.02);
            border-left:2px solid rgba(200,152,42,0.15);margin-bottom:14px;">
            <div style="font-size:9px;letter-spacing:1px;color:rgba(200,152,42,0.4);margin-bottom:3px;">
              NEXT: LEVEL ${nextTier.level}</div>
            <div style="font-size:11px;color:rgba(200,191,160,0.6);letter-spacing:0.5px;">
              ${nextTier.description}</div>
          </div>
        ` : `
          <div style="padding:8px 10px;margin-bottom:14px;">
            <div style="font-size:9px;letter-spacing:1px;color:rgba(74,158,74,0.5);">FULLY UPGRADED</div>
          </div>
        `}

        <!-- Upgrade button slot -->
        <div id="ship-upgrade-${room.id}"></div>
      `;

      // Build upgrade button
      const btnSlot = card.querySelector(`#ship-upgrade-${room.id}`)!;

      if (isMaxed) {
        const maxLabel = document.createElement('div');
        Object.assign(maxLabel.style, {
          textAlign: 'center', fontSize: '10px', letterSpacing: '2px',
          color: 'rgba(74,158,74,0.4)', padding: '8px 0',
        });
        maxLabel.textContent = 'MAXIMUM LEVEL REACHED';
        btnSlot.appendChild(maxLabel);
      } else {
        const upgradeBtn = document.createElement('button');
        upgradeBtn.className = 'ship-upgrade-btn';
        upgradeBtn.disabled = !canAfford;
        Object.assign(upgradeBtn.style, {
          width: '100%',
          padding: '10px 16px',
          background: canAfford ? 'rgba(200,152,42,0.1)' : 'transparent',
          border: `1px solid ${canAfford ? 'rgba(200,152,42,0.4)' : 'rgba(200,191,160,0.08)'}`,
          color: canAfford ? '#c8982a' : '#3a3a2a',
          fontFamily: '"Share Tech Mono",monospace',
          fontSize: '12px',
          cursor: canAfford ? 'pointer' : 'default',
          letterSpacing: '2px',
        });
        upgradeBtn.textContent = `UPGRADE  ${nextTier!.cost} SC`;
        upgradeBtn.addEventListener('click', () => {
          if (spendShipCredits(nextTier!.cost)) {
            setShipUpgradeLevel(room.id, currentLevel + 1);
            savePlayerState();
            this.render();
          }
        });
        btnSlot.appendChild(upgradeBtn);
      }

      wrapper.appendChild(card);
    });

    return wrapper;
  }

  private buildOrdnanceLoadout(): HTMLElement {
    const section = document.createElement('div');
    Object.assign(section.style, {
      padding: '0 28px 28px',
      position: 'relative',
      flexShrink: '0',
    });

    const slotCount = getShipOrdnanceSlots();
    const currentLoadout = [...getShipOrdnance()];
    // Trim to slot count
    while (currentLoadout.length > slotCount) currentLoadout.pop();

    // Header
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex', alignItems: 'center', gap: '12px',
      marginBottom: '16px', paddingTop: '8px',
      borderTop: '1px solid rgba(160,112,204,0.1)',
    });
    header.innerHTML = `
      <div style="width:3px;height:20px;background:#a070cc;"></div>
      <div style="font-family:'Teko',sans-serif;font-size:13px;font-weight:500;
        color:rgba(160,112,204,0.5);letter-spacing:3px;">ORDNANCE LOADOUT // ORBITAL SUPPORT</div>
    `;
    section.appendChild(header);

    // Current loadout slots
    const slotsRow = document.createElement('div');
    Object.assign(slotsRow.style, {
      display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap',
    });

    for (let i = 0; i < slotCount; i++) {
      const cardId = currentLoadout[i];
      const card = cardId ? CARD_DATABASE[cardId] : null;
      const slotEl = document.createElement('div');
      Object.assign(slotEl.style, {
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '10px 16px', minWidth: '160px',
        background: card ? 'rgba(160,112,204,0.06)' : 'rgba(200,191,160,0.015)',
        border: `1px solid ${card ? 'rgba(160,112,204,0.25)' : 'rgba(200,191,160,0.06)'}`,
        borderLeft: `3px solid ${card ? '#a070cc' : 'rgba(200,191,160,0.08)'}`,
        cursor: card ? 'pointer' : 'default',
        transition: 'all 0.2s',
      });

      if (card) {
        slotEl.innerHTML = `
          <span style="font-size:16px;color:rgba(160,112,204,0.6);">✷</span>
          <div>
            <div style="font-size:12px;color:#c8bfa0;letter-spacing:0.5px;">${card.name}</div>
            <div style="font-size:9px;color:rgba(200,191,160,0.3);letter-spacing:1px;">SLOT ${i + 1}</div>
          </div>
          <span style="font-size:9px;color:rgba(200,60,60,0.4);margin-left:auto;letter-spacing:1px;cursor:pointer;">REMOVE</span>
        `;
        slotEl.addEventListener('mouseenter', () => {
          slotEl.style.borderColor = 'rgba(200,60,60,0.3)';
        });
        slotEl.addEventListener('mouseleave', () => {
          slotEl.style.borderColor = 'rgba(160,112,204,0.25)';
        });
        slotEl.addEventListener('click', () => {
          currentLoadout.splice(i, 1);
          setShipOrdnance(currentLoadout);
          savePlayerState();
          this.render();
        });
      } else {
        slotEl.innerHTML = `
          <span style="font-size:16px;color:rgba(200,191,160,0.1);">✷</span>
          <div>
            <div style="font-size:11px;color:rgba(200,191,160,0.15);letter-spacing:1px;">\u2014 EMPTY \u2014</div>
            <div style="font-size:9px;color:rgba(200,191,160,0.1);letter-spacing:1px;">SLOT ${i + 1}</div>
          </div>
        `;
      }

      slotsRow.appendChild(slotEl);
    }
    section.appendChild(slotsRow);

    // Available ordnance from collection
    const state = getPlayerState();
    const ordnanceCards: Card[] = [];
    for (const [cardId, qty] of Object.entries(state.collection)) {
      if (qty <= 0) continue;
      const card = CARD_DATABASE[cardId];
      if (card && card.type === 'ordnance') ordnanceCards.push(card);
    }

    if (ordnanceCards.length > 0) {
      const availLabel = document.createElement('div');
      Object.assign(availLabel.style, {
        fontSize: '9px', letterSpacing: '2px', color: 'rgba(200,191,160,0.25)',
        marginBottom: '8px',
      });
      availLabel.textContent = 'AVAILABLE ORDNANCE';
      section.appendChild(availLabel);

      const grid = document.createElement('div');
      Object.assign(grid.style, {
        display: 'flex', gap: '8px', flexWrap: 'wrap',
      });

      const hasEmptySlot = currentLoadout.length < slotCount;

      for (const card of ordnanceCards) {
        const alreadyLoaded = currentLoadout.includes(card.id);
        const el = document.createElement('div');
        Object.assign(el.style, {
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '6px 12px',
          background: alreadyLoaded ? 'rgba(160,112,204,0.03)' : 'rgba(200,191,160,0.02)',
          border: `1px solid ${alreadyLoaded ? 'rgba(160,112,204,0.15)' : 'rgba(200,191,160,0.06)'}`,
          cursor: hasEmptySlot && !alreadyLoaded ? 'pointer' : 'default',
          opacity: alreadyLoaded ? '0.4' : (hasEmptySlot ? '1' : '0.5'),
          transition: 'all 0.2s',
        });
        el.innerHTML = `
          <span style="font-size:12px;color:rgba(160,112,204,0.5);">✷</span>
          <span style="font-size:11px;color:rgba(200,191,160,0.5);letter-spacing:0.5px;">${card.name}</span>
          ${alreadyLoaded ? '<span style="font-size:8px;color:rgba(160,112,204,0.4);letter-spacing:1px;margin-left:4px;">LOADED</span>' : ''}
        `;

        if (hasEmptySlot && !alreadyLoaded) {
          el.addEventListener('mouseenter', () => {
            el.style.borderColor = 'rgba(160,112,204,0.4)';
            el.style.background = 'rgba(160,112,204,0.06)';
          });
          el.addEventListener('mouseleave', () => {
            el.style.borderColor = 'rgba(200,191,160,0.06)';
            el.style.background = 'rgba(200,191,160,0.02)';
          });
          el.addEventListener('click', () => {
            currentLoadout.push(card.id);
            setShipOrdnance(currentLoadout);
            savePlayerState();
            this.render();
          });
        }

        grid.appendChild(el);
      }
      section.appendChild(grid);
    }

    return section;
  }
}
