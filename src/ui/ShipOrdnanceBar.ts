import { Card } from '../cards/Card';
import { CARD_DATABASE } from '../cards/CardDatabase';
import { EventBus } from '../EventBus';
import { getCardArtRenderer } from '../renderer/CardArtRenderer';

interface OrdnanceSlot {
  card: Card | null;
  charges: number;
  maxCharges: number;
  el: HTMLElement;
}

const ORD_COLOR = '#8844cc';

export class ShipOrdnanceBar {
  private slots: OrdnanceSlot[] = [];
  private container: HTMLElement | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private selectedIndex: number = -1;

  constructor(cardIds: string[], slotCount: number, chargesPerSlot: number) {
    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position: 'absolute',
      top: '0',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '8px',
      padding: '0 16px',
      zIndex: '10',
      pointerEvents: 'auto',
    });

    // Build card slots
    for (let i = 0; i < slotCount; i++) {
      const card = cardIds[i] ? CARD_DATABASE[cardIds[i]] ?? null : null;
      const slotEl = this.buildCardEl(card, i, chargesPerSlot);
      const slot: OrdnanceSlot = {
        card,
        charges: card ? chargesPerSlot : 0,
        maxCharges: chargesPerSlot,
        el: slotEl,
      };
      this.slots.push(slot);
      this.container.appendChild(slotEl);
    }

    // Insert into the ui-overlay (absolute positioned, not inside hud-top flex)
    const uiOverlay = document.getElementById('ui-overlay');
    if (uiOverlay) {
      uiOverlay.appendChild(this.container);
    }

    // Keyboard: Shift+1 through Shift+4
    this.keyHandler = (e: KeyboardEvent) => {
      if (!e.shiftKey) return;
      const num = parseInt(e.key);
      let slotIdx = -1;
      if (num >= 1 && num <= 4) {
        slotIdx = num - 1;
      } else {
        const codeMap: Record<string, number> = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 };
        if (e.code in codeMap) slotIdx = codeMap[e.code];
      }
      if (slotIdx >= 0 && slotIdx < this.slots.length) {
        this.selectSlot(slotIdx);
      }
    };
    document.addEventListener('keydown', this.keyHandler);
  }

  private buildCardEl(card: Card | null, index: number, maxCharges: number): HTMLElement {
    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, {
      position: 'relative',
      transition: 'transform 0.25s cubic-bezier(0.23,1,0.32,1)',
      cursor: card ? 'pointer' : 'default',
      transform: 'translateY(10px)',  // hang down from the top bar
    });

    if (!card) {
      // Empty slot
      const frame = document.createElement('div');
      Object.assign(frame.style, {
        width: '80px', height: '112px',
        borderRadius: '5px',
        border: '1px dashed rgba(136,68,204,0.15)',
        background: 'rgba(136,68,204,0.02)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: '4px',
      });
      frame.innerHTML = `
        <span style="font-size:16px;color:rgba(136,68,204,0.15);">✷</span>
        <span style="font-family:'Share Tech Mono',monospace;font-size:7px;color:rgba(200,191,160,0.15);letter-spacing:1px;">EMPTY</span>
      `;
      wrapper.appendChild(frame);
      return wrapper;
    }

    // Card frame (scaled-down version of the hand cards)
    const frame = document.createElement('div');
    Object.assign(frame.style, {
      position: 'relative',
      width: '80px', height: '112px',
      borderRadius: '5px',
      overflow: 'hidden',
      background: 'linear-gradient(170deg, #1e1c18 0%, #141210 40%, #0e0c0a 100%)',
      border: `2px solid ${ORD_COLOR}50`,
      boxShadow: `0 2px 8px rgba(0,0,0,0.6), 0 0 8px ${ORD_COLOR}15`,
      display: 'flex', flexDirection: 'column',
      userSelect: 'none',
    });

    // Title bar
    const titleBar = document.createElement('div');
    Object.assign(titleBar.style, {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '2px 4px 1px 5px',
      background: 'linear-gradient(180deg, rgba(40,36,28,0.9), rgba(28,24,18,0.9))',
      borderBottom: '1px solid #3a3228',
      minHeight: '14px',
    });
    titleBar.innerHTML = `
      <span style="font-family:'Cinzel',Georgia,serif;font-size:7px;font-weight:700;
        color:#e8d8b0;line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
        text-shadow:0 1px 2px rgba(0,0,0,0.6);flex:1;">${card.name}</span>
    `;
    frame.appendChild(titleBar);

    // Art window
    const artBox = document.createElement('div');
    Object.assign(artBox.style, {
      margin: '2px 3px 1px', height: '38px', borderRadius: '2px',
      border: '1px solid #2a2418', overflow: 'hidden',
      background: '#0a0a0e', position: 'relative',
    });
    const artImg = document.createElement('img');
    artImg.src = getCardArtRenderer().getArt(card.texture, card.type);
    Object.assign(artImg.style, { width: '100%', height: '100%', objectFit: 'cover', display: 'block' });
    artBox.appendChild(artImg);
    const vignette = document.createElement('div');
    Object.assign(vignette.style, {
      position: 'absolute', inset: '0', pointerEvents: 'none',
      boxShadow: 'inset 0 0 10px rgba(0,0,0,0.6)',
      background: `linear-gradient(180deg, transparent 40%, ${ORD_COLOR}22 100%)`,
    });
    artBox.appendChild(vignette);
    frame.appendChild(artBox);

    // Type line
    const typeLine = document.createElement('div');
    Object.assign(typeLine.style, {
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
      padding: '1px 3px',
      background: 'linear-gradient(180deg, rgba(40,36,28,0.7), rgba(28,24,18,0.7))',
      borderTop: '1px solid #2a2418', borderBottom: '1px solid #2a2418',
      fontFamily: "'Cinzel',Georgia,serif", fontSize: '6px', fontWeight: '700',
      letterSpacing: '1px', textTransform: 'uppercase', color: ORD_COLOR,
    });
    typeLine.innerHTML = `<span style="font-size:8px;">✷</span> ordnance`;
    frame.appendChild(typeLine);

    // Text box
    const textBox = document.createElement('div');
    Object.assign(textBox.style, {
      flex: '1', margin: '2px 3px', padding: '3px 4px', borderRadius: '2px',
      background: 'linear-gradient(180deg, #d4c8a8 0%, #c4b890 30%, #b8a878 100%)',
      boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.12)', overflow: 'hidden',
    });
    textBox.innerHTML = `<div style="font-family:'Alegreya',Georgia,serif;font-size:6.5px;
      color:#2a2018;line-height:1.3;text-align:center;">${card.description}</div>`;
    frame.appendChild(textBox);

    // Bottom bar with hotkey
    const bottomBar = document.createElement('div');
    Object.assign(bottomBar.style, {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '1px 5px 2px',
    });
    bottomBar.innerHTML = `
      <span style="font-family:'Cinzel',serif;font-size:7px;color:#5a5248;
        background:rgba(20,18,14,0.4);border:1px solid #2a2418;border-radius:2px;
        padding:0 3px;line-height:1.4;">S+${index + 1}</span>
    `;
    frame.appendChild(bottomBar);

    // Corner filigree (pseudo-elements via box-shadow hack — just use border decorations)
    const cornerTL = document.createElement('div');
    Object.assign(cornerTL.style, {
      position: 'absolute', top: '1px', left: '1px', width: '8px', height: '8px',
      borderTop: `1px solid ${ORD_COLOR}30`, borderLeft: `1px solid ${ORD_COLOR}30`,
      borderRadius: '3px 0 0 0', pointerEvents: 'none',
    });
    frame.appendChild(cornerTL);
    const cornerBR = document.createElement('div');
    Object.assign(cornerBR.style, {
      position: 'absolute', bottom: '1px', right: '1px', width: '8px', height: '8px',
      borderBottom: `1px solid ${ORD_COLOR}30`, borderRight: `1px solid ${ORD_COLOR}30`,
      borderRadius: '0 0 3px 0', pointerEvents: 'none',
    });
    frame.appendChild(cornerBR);

    wrapper.appendChild(frame);

    // Charges badge (overlaid on top-right of card)
    const chargesBadge = document.createElement('div');
    chargesBadge.dataset.chargesBadge = 'true';
    Object.assign(chargesBadge.style, {
      position: 'absolute', top: '-4px', right: '-4px',
      width: '22px', height: '22px', borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Teko',sans-serif", fontSize: '13px', fontWeight: '700',
      color: '#fff',
      background: `radial-gradient(circle at 35% 35%, #a060e0, #6030a0 60%, #402070 100%)`,
      border: '2px solid #1a1a2e',
      boxShadow: `0 2px 6px rgba(0,0,0,0.5), 0 0 8px ${ORD_COLOR}40`,
      zIndex: '5', lineHeight: '1',
    });
    chargesBadge.textContent = `${maxCharges}`;
    wrapper.appendChild(chargesBadge);

    // Hover — extend the barrel down further
    wrapper.addEventListener('mouseenter', () => {
      const slot = this.slots[index];
      if (slot && slot.charges > 0) {
        wrapper.style.transform = 'translateY(20px) scale(1.05)';
        frame.style.borderColor = ORD_COLOR;
        frame.style.boxShadow = `0 8px 24px rgba(0,0,0,0.8), 0 0 16px ${ORD_COLOR}40`;
      }
    });
    wrapper.addEventListener('mouseleave', () => {
      wrapper.style.transform = 'translateY(10px)';
      frame.style.borderColor = `${ORD_COLOR}50`;
      frame.style.boxShadow = `0 2px 8px rgba(0,0,0,0.6), 0 0 8px ${ORD_COLOR}15`;
    });

    wrapper.addEventListener('click', () => this.selectSlot(index));

    return wrapper;
  }

  private selectSlot(index: number): void {
    const slot = this.slots[index];
    if (!slot || !slot.card || slot.charges <= 0) return;

    // Deselect previous
    this.deselectCurrent();

    // Highlight this slot
    this.selectedIndex = index;
    const wrapper = slot.el;
    const frame = wrapper.querySelector('div') as HTMLElement;
    wrapper.style.transform = 'translateY(28px) scale(1.1)';
    wrapper.style.zIndex = '20';
    if (frame) {
      frame.style.borderColor = '#bb77ff';
      frame.style.boxShadow = `0 0 20px ${ORD_COLOR}80, 0 0 40px ${ORD_COLOR}40, 0 8px 24px rgba(0,0,0,0.8)`;
      frame.style.filter = 'brightness(1.3)';
    }

    EventBus.emit('ship-ordnance-select', { card: slot.card, slotIndex: index });
  }

  deselectCurrent(): void {
    if (this.selectedIndex < 0) return;
    const slot = this.slots[this.selectedIndex];
    if (slot) {
      const wrapper = slot.el;
      const frame = wrapper.querySelector('div') as HTMLElement;
      wrapper.style.transform = 'translateY(10px)';
      wrapper.style.zIndex = '';
      if (frame) {
        frame.style.borderColor = `${ORD_COLOR}50`;
        frame.style.boxShadow = `0 2px 8px rgba(0,0,0,0.6), 0 0 8px ${ORD_COLOR}15`;
        frame.style.filter = '';
      }
    }
    this.selectedIndex = -1;
  }

  fireSlot(index: number): void {
    this.deselectCurrent();
    const slot = this.slots[index];
    if (!slot || slot.charges <= 0) return;
    slot.charges--;

    // Update charges badge
    const badge = slot.el.querySelector('[data-charges-badge]') as HTMLElement;
    if (badge) {
      badge.textContent = `${slot.charges}`;
      if (slot.charges <= 0) {
        badge.style.background = 'radial-gradient(circle at 35% 35%, #804040, #502020 60%, #301010 100%)';
        badge.style.boxShadow = '0 2px 6px rgba(0,0,0,0.5)';
      }
    }

    // Gray out the card when depleted
    if (slot.charges <= 0) {
      const frame = slot.el.querySelector('div') as HTMLElement;
      if (frame) {
        slot.el.style.opacity = '0.35';
        slot.el.style.pointerEvents = 'none';
        slot.el.style.filter = 'saturate(0.2)';
      }
    }
  }

  destroy(): void {
    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    this.container?.remove();
    this.container = null;
    this.slots = [];
  }
}
