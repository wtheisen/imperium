import { Card } from '../cards/Card';
import { getAllCards } from '../cards/CardDatabase';
import { EventBus } from '../EventBus';

/* ── Inline styles ──────────────────────────────────────────────────── */

const OVERLAY_CSS = `
  position: fixed;
  inset: 0;
  background: rgba(5, 4, 2, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  font-family: 'Segoe UI', Tahoma, sans-serif;
`;

const MODAL_CSS = `
  background: linear-gradient(180deg, #1a1610 0%, #0f0d0a 100%);
  border: 2px solid #6b5a2e;
  border-radius: 6px;
  padding: 20px 28px 24px;
  min-width: 520px;
  max-width: 640px;
  box-shadow: 0 0 40px rgba(200, 168, 78, 0.15), inset 0 1px 0 rgba(200, 168, 78, 0.08);
`;

const TITLE_CSS = `
  font-size: 16px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #c8a84e;
  text-align: center;
  margin: 0 0 4px 0;
  text-shadow: 0 0 8px rgba(200, 168, 78, 0.35);
`;

const SUBTITLE_CSS = `
  font-size: 11px;
  color: #7a6f58;
  text-align: center;
  margin: 0 0 16px 0;
`;

const CARDS_ROW_CSS = `
  display: flex;
  gap: 12px;
  justify-content: center;
`;

const CARD_CSS = `
  background: linear-gradient(135deg, rgba(30, 26, 18, 0.95) 0%, rgba(22, 19, 13, 0.95) 100%);
  border: 1px solid #4a3f28;
  border-radius: 4px;
  padding: 14px 12px;
  width: 150px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
  text-align: left;
`;

const CARD_HOVER_BORDER = '#c8a84e';
const CARD_PICKED_CSS = `
  opacity: 0.25;
  pointer-events: none;
  border-color: #2a2518;
`;

const CARD_TYPE_CSS = `
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  margin: 0 0 4px 0;
  line-height: 1;
`;

const CARD_NAME_CSS = `
  font-size: 13px;
  font-weight: 700;
  color: #e8d48b;
  margin: 0 0 6px 0;
  line-height: 1.2;
`;

const CARD_DESC_CSS = `
  font-size: 10px;
  color: #9e937a;
  margin: 0 0 8px 0;
  line-height: 1.35;
`;

const CARD_COST_CSS = `
  font-size: 10px;
  color: #c8a84e;
  font-weight: 700;
  margin: 0;
`;

const FOOTER_CSS = `
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
`;

const BTN_CSS = `
  background: linear-gradient(180deg, #2e2818 0%, #1a1610 100%);
  border: 1px solid #6b5a2e;
  border-radius: 3px;
  color: #c8a84e;
  font-size: 11px;
  letter-spacing: 1px;
  text-transform: uppercase;
  padding: 6px 16px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
`;

/* ── Helpers ────────────────────────────────────────────────────────── */

const TYPE_COLORS: Record<string, string> = {
  unit: '#5b9bd5',
  building: '#8bc34a',
  ordnance: '#ce93d8',
  equipment: '#e57c3a',
};

function pickRandom<T>(arr: T[], n: number): T[] {
  const pool = [...arr];
  const result: T[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(idx, 1)[0]);
  }
  return result;
}

/* ── ShopUI class ───────────────────────────────────────────────────── */

export class ShopUI {
  private overlay: HTMLDivElement | null = null;
  private modal: HTMLDivElement | null = null;
  private cardsRow: HTMLDivElement | null = null;
  private subtitleEl: HTMLParagraphElement | null = null;

  private currentCards: Card[] = [];
  private pickedIndices: Set<number> = new Set();
  private picksRemaining = 0;
  private cardEls: HTMLDivElement[] = [];

  constructor() {
    // Widget is hidden by default; call showPack() to open.
  }

  /* ── Public API ─────────────────────────────────────────────────── */

  showPack(picks: number, title: string): void {
    this.picksRemaining = picks;
    this.pickedIndices.clear();
    this.currentCards = pickRandom(getAllCards(), 3);
    this.buildDOM(title);
  }

  consumePick(index: number): void {
    if (this.pickedIndices.has(index)) return;
    this.pickedIndices.add(index);
    this.picksRemaining--;

    // Visually mark the card as picked
    const el = this.cardEls[index];
    if (el) {
      el.setAttribute('style', `${CARD_CSS}${CARD_PICKED_CSS}`);
    }

    this.updateSubtitle();

    if (this.picksRemaining <= 0) {
      // Brief delay so the player sees the last pick before close
      setTimeout(() => this.hide(), 400);
    }
  }

  isVisible(): boolean {
    return this.overlay !== null;
  }

  hide(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
      this.modal = null;
      this.cardsRow = null;
      this.subtitleEl = null;
      this.cardEls = [];
      EventBus.emit('shop-closed');
    }
  }

  reroll(currentGold: number): void {
    // Reshuffle the 3 displayed cards (caller should deduct gold externally)
    this.pickedIndices.clear();
    this.currentCards = pickRandom(getAllCards(), 3);
    if (this.cardsRow) {
      this.renderCards();
    }
    this.updateSubtitle();
  }

  destroy(): void {
    this.hide();
  }

  /* ── DOM construction ───────────────────────────────────────────── */

  private buildDOM(title: string): void {
    // Remove any existing instance
    this.hide();

    // Overlay
    this.overlay = document.createElement('div');
    this.overlay.setAttribute('style', OVERLAY_CSS);

    // Modal
    this.modal = document.createElement('div');
    this.modal.setAttribute('style', MODAL_CSS);

    // Title
    const titleEl = document.createElement('p');
    titleEl.setAttribute('style', TITLE_CSS);
    titleEl.textContent = title;
    this.modal.appendChild(titleEl);

    // Subtitle (picks remaining)
    this.subtitleEl = document.createElement('p');
    this.subtitleEl.setAttribute('style', SUBTITLE_CSS);
    this.modal.appendChild(this.subtitleEl);
    this.updateSubtitle();

    // Cards row
    this.cardsRow = document.createElement('div');
    this.cardsRow.setAttribute('style', CARDS_ROW_CSS);
    this.modal.appendChild(this.cardsRow);

    this.renderCards();

    // Footer with reroll + close buttons
    const footer = document.createElement('div');
    footer.setAttribute('style', FOOTER_CSS);

    const rerollBtn = document.createElement('button');
    rerollBtn.setAttribute('style', BTN_CSS);
    rerollBtn.textContent = 'Reroll';
    rerollBtn.addEventListener('mouseenter', () => {
      rerollBtn.style.borderColor = CARD_HOVER_BORDER;
    });
    rerollBtn.addEventListener('mouseleave', () => {
      rerollBtn.style.borderColor = '#6b5a2e';
    });
    rerollBtn.addEventListener('click', () => {
      EventBus.emit('shop-reroll');
    });
    footer.appendChild(rerollBtn);

    const closeBtn = document.createElement('button');
    closeBtn.setAttribute('style', BTN_CSS);
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.borderColor = CARD_HOVER_BORDER;
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.borderColor = '#6b5a2e';
    });
    closeBtn.addEventListener('click', () => this.hide());
    footer.appendChild(closeBtn);

    this.modal.appendChild(footer);
    this.overlay.appendChild(this.modal);
    document.body.appendChild(this.overlay);
  }

  private renderCards(): void {
    if (!this.cardsRow) return;
    this.cardsRow.innerHTML = '';
    this.cardEls = [];

    this.currentCards.forEach((card, index) => {
      const el = document.createElement('div');
      el.setAttribute('style', CARD_CSS);

      // Hover effects
      el.addEventListener('mouseenter', () => {
        if (this.pickedIndices.has(index)) return;
        el.style.borderColor = CARD_HOVER_BORDER;
        el.style.boxShadow = `0 0 12px rgba(200, 168, 78, 0.25)`;
        el.style.transform = 'translateY(-2px)';
      });
      el.addEventListener('mouseleave', () => {
        if (this.pickedIndices.has(index)) return;
        el.style.borderColor = '#4a3f28';
        el.style.boxShadow = 'none';
        el.style.transform = 'none';
      });

      // Click to pick
      el.addEventListener('click', () => {
        if (this.pickedIndices.has(index) || this.picksRemaining <= 0) return;
        EventBus.emit('pack-pick', { card, index });
        this.consumePick(index);
      });

      // Card type badge
      const typeEl = document.createElement('p');
      typeEl.setAttribute('style', CARD_TYPE_CSS);
      typeEl.style.color = TYPE_COLORS[card.type] ?? '#888';
      typeEl.textContent = card.type;
      el.appendChild(typeEl);

      // Card name
      const nameEl = document.createElement('p');
      nameEl.setAttribute('style', CARD_NAME_CSS);
      nameEl.textContent = card.name;
      el.appendChild(nameEl);

      // Description
      const descEl = document.createElement('p');
      descEl.setAttribute('style', CARD_DESC_CSS);
      descEl.textContent = card.description;
      el.appendChild(descEl);

      // Cost
      const costEl = document.createElement('p');
      costEl.setAttribute('style', CARD_COST_CSS);
      costEl.textContent = `${card.cost}g`;
      el.appendChild(costEl);

      this.cardsRow!.appendChild(el);
      this.cardEls.push(el);
    });
  }

  private updateSubtitle(): void {
    if (!this.subtitleEl) return;
    if (this.picksRemaining > 0) {
      this.subtitleEl.textContent = `Choose ${this.picksRemaining} card${this.picksRemaining > 1 ? 's' : ''}`;
    } else {
      this.subtitleEl.textContent = 'All picks used';
    }
  }
}
