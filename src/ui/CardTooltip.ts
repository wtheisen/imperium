import { Card } from '../cards/Card';
import { CardEffects } from '../cards/CardEffects';

const TYPE_COLORS: Record<string, string> = {
  unit: '#4488ff', building: '#44aa44', ordnance: '#8844cc',
  doctrine: '#ffaa00', equipment: '#44dddd',
};

const STYLE_ID = 'card-tooltip-styles';

export class CardTooltip {
  private el: HTMLDivElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'card-tooltip';
    this.el.style.display = 'none';
    document.body.appendChild(this.el);

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        .card-tooltip {
          position: fixed;
          pointer-events: none;
          z-index: 100;
          width: 240px;
          background: #0e0c0a;
          border: 1px solid rgba(200,152,42,0.25);
          border-radius: 4px;
          padding: 0;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(0,0,0,0.8);
          font-family: 'Share Tech Mono', monospace;
          color: #d4c8a0;
          font-size: 11px;
        }
        .card-tooltip__accent {
          height: 3px;
          width: 100%;
        }
        .card-tooltip__header {
          padding: 6px 8px 4px;
          font-family: 'Teko', sans-serif;
          font-size: 16px;
          font-weight: 600;
          color: #e8d8b0;
          line-height: 1.1;
          border-bottom: 1px solid rgba(200,152,42,0.12);
        }
        .card-tooltip__type {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 1px;
          opacity: 0.6;
          margin-top: 1px;
        }
        .card-tooltip__body {
          padding: 6px 8px 8px;
        }
        .card-tooltip__grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2px 12px;
        }
        .card-tooltip__stat {
          display: flex;
          justify-content: space-between;
        }
        .card-tooltip__label {
          color: #7a7260;
          font-size: 10px;
        }
        .card-tooltip__value {
          color: #d4c8a0;
          font-size: 11px;
        }
        .card-tooltip__desc {
          margin-top: 4px;
          padding-top: 4px;
          border-top: 1px solid rgba(200,152,42,0.08);
          font-size: 10px;
          color: #9a8e76;
          line-height: 1.3;
        }
        .card-tooltip__badge {
          display: inline-block;
          margin-top: 4px;
          padding: 1px 5px;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 1px;
          border: 1px solid rgba(200,152,42,0.2);
          border-radius: 2px;
          color: #c8982a;
        }
      `;
      document.head.appendChild(style);
    }
  }

  show(card: Card, anchorRect: DOMRect): void {
    const color = TYPE_COLORS[card.type] || '#666';

    let statsHtml = '';
    switch (card.type) {
      case 'unit':
        statsHtml = this.buildUnitStats(card);
        break;
      case 'building':
        statsHtml = this.buildBuildingStats(card);
        break;
      case 'ordnance':
        statsHtml = this.buildOrdnanceStats(card);
        break;
      case 'equipment':
        statsHtml = this.buildEquipmentStats(card);
        break;
      case 'doctrine':
        statsHtml = this.buildDoctrineStats(card);
        break;
    }

    this.el.innerHTML = `
      <div class="card-tooltip__accent" style="background:${color}"></div>
      <div class="card-tooltip__header">
        ${card.name}
        <div class="card-tooltip__type" style="color:${color}">${card.type} &middot; ${card.cost}g</div>
      </div>
      <div class="card-tooltip__body">
        ${statsHtml}
        <div class="card-tooltip__desc">${card.description}</div>
        ${card.singleUse ? '<div class="card-tooltip__badge">Single Use</div>' : ''}
      </div>
    `;

    this.el.style.display = 'block';

    // Position above card, clamped to screen
    const ttWidth = 240;
    const ttHeight = this.el.offsetHeight;
    let left = anchorRect.left + anchorRect.width / 2 - ttWidth / 2;
    let top = anchorRect.top - ttHeight - 8;

    // Clamp horizontal
    if (left < 4) left = 4;
    if (left + ttWidth > window.innerWidth - 4) left = window.innerWidth - ttWidth - 4;
    // If no room above, show below
    if (top < 4) top = anchorRect.bottom + 8;

    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  hide(): void {
    this.el.style.display = 'none';
  }

  destroy(): void {
    this.el.remove();
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
  }

  private stat(label: string, value: string | number): string {
    return `<div class="card-tooltip__stat"><span class="card-tooltip__label">${label}</span><span class="card-tooltip__value">${value}</span></div>`;
  }

  private buildUnitStats(card: Card): string {
    const s = CardEffects.getUnitStats(card.entityType || '');
    if (!s) return '';
    const sq = s.squadSize || 1;
    const lines: string[] = [];
    lines.push(this.stat('HP', `${s.maxHp * sq}`));
    lines.push(this.stat('ATK', `${s.attackDamage * sq}`));
    lines.push(this.stat('Range', s.isRanged ? s.attackRange : 'Melee'));
    lines.push(this.stat('Speed', s.speed));
    if (sq > 1) lines.push(this.stat('Squad', `${sq} models`));
    if (s.gatherRate) lines.push(this.stat('Gather', `${s.gatherRate}/s (cap ${s.gatherCapacity})`));
    return `<div class="card-tooltip__grid">${lines.join('')}</div>`;
  }

  private buildBuildingStats(card: Card): string {
    const s = CardEffects.getBuildingStats(card.entityType || '');
    if (!s) return '';
    const lines: string[] = [];
    lines.push(this.stat('HP', s.maxHp));
    lines.push(this.stat('Size', `${s.tileWidth}x${s.tileHeight}`));
    if (s.attackDamage) {
      lines.push(this.stat('ATK', s.attackDamage));
      lines.push(this.stat('Range', s.attackRange || 0));
    }
    return `<div class="card-tooltip__grid">${lines.join('')}</div>`;
  }

  private buildOrdnanceStats(card: Card): string {
    const lines: string[] = [];
    if (card.ordnanceEffect) lines.push(this.stat('Effect', card.ordnanceEffect.replace(/_/g, ' ')));
    if (card.ordnanceValue) lines.push(this.stat('Value', card.ordnanceValue));
    if (card.ordnanceRadius) lines.push(this.stat('AoE Radius', card.ordnanceRadius));
    return `<div class="card-tooltip__grid">${lines.join('')}</div>`;
  }

  private buildEquipmentStats(card: Card): string {
    const lines: string[] = [];
    if (card.equipEffect) lines.push(this.stat('Effect', card.equipEffect.replace(/_/g, ' ')));
    if (card.equipValue) lines.push(this.stat('Value', `+${card.equipValue}`));
    if (card.equipFilter) lines.push(this.stat('Fits', card.equipFilter));

    const w = card.wargear;
    if (w) {
      if (w.statBoosts) {
        for (const b of w.statBoosts) {
          const prefix = b.mode === 'multiplicative' ? 'x' : '+';
          lines.push(this.stat(b.stat, `${prefix}${b.value}`));
        }
      }
      if (w.passives) {
        for (const p of w.passives) {
          lines.push(this.stat('Passive', p.id.replace(/_/g, ' ')));
        }
      }
      if (w.ability) {
        lines.push(this.stat('Ability', `${w.ability.name} [${w.ability.hotkey}]`));
        lines.push(this.stat('Cooldown', `${(w.ability.cooldown / 1000).toFixed(1)}s`));
      }
    }
    return `<div class="card-tooltip__grid">${lines.join('')}</div>`;
  }

  private buildDoctrineStats(card: Card): string {
    const lines: string[] = [];
    if (card.doctrineEffect) lines.push(this.stat('Effect', card.doctrineEffect.replace(/_/g, ' ')));
    if (card.doctrineValue) lines.push(this.stat('Value', card.doctrineValue));
    if (card.doctrineFilter) lines.push(this.stat('Target', card.doctrineFilter));
    lines.push(this.stat('Limit', 'Max 3 active'));
    return `<div class="card-tooltip__grid">${lines.join('')}</div>`;
  }
}
