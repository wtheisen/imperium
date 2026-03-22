import { GameSceneInterface, getSceneManager } from './SceneManager';
import { getPlayerState, addToCollection, addShipCredits, savePlayerState, getCollectionCount } from '../state/PlayerState';
import { CARD_DATABASE } from '../cards/CardDatabase';
import { CardType } from '../cards/Card';
import { MissionDefinition } from '../missions/MissionDefinition';
import { SALVAGE_CREDIT_BASE, SALVAGE_DUPLICATE_BONUS } from '../config';

const TYPE_THEME: Record<CardType, { bg: string; border: string; label: string; icon: string }> = {
  unit:      { bg: 'rgba(60,80,120,0.2)',  border: 'rgba(80,120,180,0.35)', label: '#6090cc', icon: 'UNIT' },
  building:  { bg: 'rgba(60,100,60,0.2)',  border: 'rgba(80,150,80,0.35)',  label: '#60aa60', icon: 'BLDG' },
  ordnance:  { bg: 'rgba(100,60,120,0.2)', border: 'rgba(140,80,180,0.35)', label: '#a070cc', icon: 'ORD' },
  equipment: { bg: 'rgba(50,100,100,0.2)', border: 'rgba(70,150,150,0.35)', label: '#50b0b0', icon: 'GEAR' },
};

interface CardDecision {
  cardId: string;
  action: 'keep' | 'salvage';
  isDuplicate: boolean;
  creditValue: number;
}

export class SalvageScene implements GameSceneInterface {
  id = 'SalvageScene';
  private container: HTMLDivElement | null = null;
  private decisions: CardDecision[] = [];
  private passData: any = null;
  private confirmed = false;

  create(data?: any): void {
    this.passData = data;
    const takenPackCards: string[] = data?.takenPackCards ?? [];
    const state = getPlayerState();

    // Build decisions list
    this.decisions = takenPackCards.map(cardId => {
      const isDuplicate = getCollectionCount(cardId) > 0;
      const creditValue = SALVAGE_CREDIT_BASE + (isDuplicate ? SALVAGE_DUPLICATE_BONUS : 0);
      return { cardId, action: 'keep' as const, isDuplicate, creditValue };
    });

    this.container = document.createElement('div');
    this.container.id = 'salvage-ui';
    Object.assign(this.container.style, {
      position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
      background: 'linear-gradient(160deg, rgba(10,10,14,0.97) 0%, rgba(14,12,8,0.97) 100%)',
      zIndex: '10', display: 'flex', flexDirection: 'column',
      alignItems: 'center',
      fontFamily: '"Share Tech Mono","Courier New",monospace', color: '#c8bfa0',
      overflow: 'hidden',
    });

    document.getElementById('game-container')!.appendChild(this.container);
    this.render();
  }

  private render(): void {
    if (!this.container) return;
    this.container.innerHTML = '';

    // Background decorations
    const bg = document.createElement('div');
    bg.innerHTML = `
      <div style="position:absolute;inset:0;pointer-events:none;overflow:hidden;">
        <div style="position:absolute;inset:0;opacity:0.015;
          background:repeating-linear-gradient(45deg,transparent,transparent 18px,#50b0b0 18px,#50b0b0 20px);"></div>
        <div style="position:absolute;inset:0;
          background:radial-gradient(ellipse at center,transparent 30%,rgba(0,0,0,0.5) 100%);"></div>
      </div>
    `;
    this.container.appendChild(bg);

    // Content wrapper
    const content = document.createElement('div');
    Object.assign(content.style, {
      position: 'relative', display: 'flex', flexDirection: 'column',
      alignItems: 'center', width: '100%', height: '100%',
      overflowY: 'auto', padding: '40px 20px',
    });
    this.container.appendChild(content);

    // Title
    const title = document.createElement('div');
    title.style.textAlign = 'center';
    title.style.marginBottom = '32px';
    title.innerHTML = `
      <div style="font-size:10px;letter-spacing:4px;color:rgba(80,176,176,0.5);margin-bottom:8px;">
        POST-MISSION RECOVERY</div>
      <div style="font-family:'Teko',sans-serif;font-size:42px;font-weight:700;
        color:#50b0b0;letter-spacing:6px;line-height:1;
        text-shadow:0 0 30px rgba(80,176,176,0.2);">
        FIELD SALVAGE</div>
      <div style="font-size:10px;color:rgba(200,191,160,0.3);margin-top:8px;letter-spacing:2px;">
        CHOOSE WHICH CARDS TO KEEP OR SALVAGE FOR SHIP CREDITS</div>
    `;
    content.appendChild(title);

    // Cards list
    const cardList = document.createElement('div');
    Object.assign(cardList.style, {
      display: 'flex', flexDirection: 'column', gap: '8px',
      width: '100%', maxWidth: '500px',
    });
    content.appendChild(cardList);

    for (let i = 0; i < this.decisions.length; i++) {
      const decision = this.decisions[i];
      const card = CARD_DATABASE[decision.cardId];
      if (!card) continue;
      const theme = TYPE_THEME[card.type as CardType] || TYPE_THEME.unit;

      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 16px',
        background: decision.action === 'keep'
          ? 'rgba(74,158,74,0.06)'
          : 'rgba(80,176,176,0.06)',
        border: `1px solid ${decision.action === 'keep'
          ? 'rgba(74,158,74,0.25)'
          : 'rgba(80,176,176,0.25)'}`,
        transition: 'all 0.15s',
      });

      // Card info
      const info = document.createElement('div');
      info.style.flex = '1';
      info.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <div style="font-size:8px;letter-spacing:1px;color:${theme.label};
            background:${theme.label}15;padding:1px 5px;">${theme.icon}</div>
          <div style="font-family:'Teko',sans-serif;font-size:18px;font-weight:600;
            color:#d8cca8;letter-spacing:0.5px;line-height:1;">${card.name}</div>
          <div style="font-family:'Teko',sans-serif;font-size:16px;font-weight:600;
            color:#c8982a;line-height:1;">${card.cost}g</div>
          ${decision.isDuplicate
            ? `<div style="font-size:8px;letter-spacing:1px;color:rgba(200,152,42,0.6);
                background:rgba(200,152,42,0.1);padding:1px 5px;">DUPLICATE</div>`
            : ''}
        </div>
        <div style="font-size:9px;color:rgba(200,191,160,0.35);line-height:1.3;
          overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${card.description}</div>
      `;
      row.appendChild(info);

      // KEEP button
      const keepBtn = document.createElement('button');
      const isKeep = decision.action === 'keep';
      Object.assign(keepBtn.style, {
        padding: '6px 14px',
        background: isKeep ? 'rgba(74,158,74,0.15)' : 'transparent',
        border: `1px solid ${isKeep ? 'rgba(74,158,74,0.5)' : 'rgba(74,158,74,0.15)'}`,
        color: isKeep ? '#4a9e4a' : 'rgba(74,158,74,0.4)',
        fontFamily: '"Share Tech Mono",monospace', fontSize: '10px',
        cursor: 'pointer', letterSpacing: '1px', transition: 'all 0.15s',
        whiteSpace: 'nowrap',
      });
      keepBtn.textContent = 'KEEP';
      keepBtn.addEventListener('click', () => {
        this.decisions[i].action = 'keep';
        this.render();
      });
      row.appendChild(keepBtn);

      // SALVAGE button
      const salvageBtn = document.createElement('button');
      const isSalvage = decision.action === 'salvage';
      Object.assign(salvageBtn.style, {
        padding: '6px 14px',
        background: isSalvage ? 'rgba(80,176,176,0.15)' : 'transparent',
        border: `1px solid ${isSalvage ? 'rgba(80,176,176,0.5)' : 'rgba(80,176,176,0.15)'}`,
        color: isSalvage ? '#50b0b0' : 'rgba(80,176,176,0.4)',
        fontFamily: '"Share Tech Mono",monospace', fontSize: '10px',
        cursor: 'pointer', letterSpacing: '1px', transition: 'all 0.15s',
        whiteSpace: 'nowrap',
      });
      salvageBtn.textContent = `SALVAGE ${decision.creditValue} SC`;
      salvageBtn.addEventListener('click', () => {
        this.decisions[i].action = 'salvage';
        this.render();
      });
      row.appendChild(salvageBtn);

      cardList.appendChild(row);
    }

    // Summary
    const totalCredits = this.decisions
      .filter(d => d.action === 'salvage')
      .reduce((sum, d) => sum + d.creditValue, 0);
    const keepCount = this.decisions.filter(d => d.action === 'keep').length;
    const salvageCount = this.decisions.filter(d => d.action === 'salvage').length;

    const summary = document.createElement('div');
    Object.assign(summary.style, {
      marginTop: '24px', textAlign: 'center', width: '100%', maxWidth: '500px',
      padding: '16px', borderTop: '1px solid rgba(200,152,42,0.1)',
    });
    summary.innerHTML = `
      <div style="display:flex;justify-content:center;gap:32px;margin-bottom:16px;">
        <div style="text-align:center;">
          <div style="font-size:9px;letter-spacing:2px;color:rgba(74,158,74,0.5);">KEEPING</div>
          <div style="font-family:'Teko',sans-serif;font-size:28px;font-weight:700;
            color:#4a9e4a;line-height:1;margin-top:4px;">${keepCount}</div>
          <div style="font-size:9px;color:rgba(74,158,74,0.4);letter-spacing:1px;">CARDS</div>
        </div>
        <div style="width:1px;background:rgba(200,152,42,0.1);"></div>
        <div style="text-align:center;">
          <div style="font-size:9px;letter-spacing:2px;color:rgba(80,176,176,0.5);">SALVAGING</div>
          <div style="font-family:'Teko',sans-serif;font-size:28px;font-weight:700;
            color:#50b0b0;line-height:1;margin-top:4px;">${salvageCount}</div>
          <div style="font-size:9px;color:rgba(80,176,176,0.4);letter-spacing:1px;">CARDS</div>
        </div>
        <div style="width:1px;background:rgba(200,152,42,0.1);"></div>
        <div style="text-align:center;">
          <div style="font-size:9px;letter-spacing:2px;color:rgba(80,176,176,0.5);">CREDITS EARNED</div>
          <div style="font-family:'Teko',sans-serif;font-size:28px;font-weight:700;
            color:#50b0b0;line-height:1;margin-top:4px;">+${totalCredits}</div>
          <div style="font-size:9px;color:rgba(80,176,176,0.4);letter-spacing:1px;">SC</div>
        </div>
      </div>
    `;
    content.appendChild(summary);

    // CONFIRM button
    const confirmBtn = document.createElement('button');
    Object.assign(confirmBtn.style, {
      padding: '14px 48px',
      background: 'linear-gradient(180deg,rgba(80,176,176,0.15) 0%,rgba(80,176,176,0.08) 100%)',
      color: '#50b0b0',
      border: '1px solid rgba(80,176,176,0.5)',
      fontFamily: "'Teko',sans-serif",
      fontSize: '20px', fontWeight: '600',
      letterSpacing: '6px', cursor: 'pointer',
      transition: 'all 0.2s', marginTop: '8px',
    });
    confirmBtn.textContent = 'CONFIRM';
    confirmBtn.addEventListener('mouseenter', () => {
      confirmBtn.style.background = 'linear-gradient(180deg,rgba(80,176,176,0.25) 0%,rgba(80,176,176,0.12) 100%)';
      confirmBtn.style.borderColor = 'rgba(80,176,176,0.8)';
      confirmBtn.style.letterSpacing = '8px';
    });
    confirmBtn.addEventListener('mouseleave', () => {
      confirmBtn.style.background = 'linear-gradient(180deg,rgba(80,176,176,0.15) 0%,rgba(80,176,176,0.08) 100%)';
      confirmBtn.style.borderColor = 'rgba(80,176,176,0.5)';
      confirmBtn.style.letterSpacing = '6px';
    });
    confirmBtn.addEventListener('click', () => this.confirm());
    content.appendChild(confirmBtn);
  }

  private confirm(): void {
    if (this.confirmed) return;
    this.confirmed = true;
    for (const decision of this.decisions) {
      if (decision.action === 'keep') {
        addToCollection(decision.cardId, 1);
      } else {
        addShipCredits(decision.creditValue);
      }
    }
    savePlayerState();

    // Transition to GameOverScene with pass-through data
    const sm = getSceneManager();
    sm.stop('SalvageScene');
    sm.start('GameOverScene', {
      victory: this.passData?.victory ?? true,
      missionId: this.passData?.missionId ?? '',
      mission: this.passData?.mission ?? null,
      missionName: this.passData?.missionName ?? 'Unknown Mission',
      objectivesCompleted: this.passData?.objectivesCompleted ?? 0,
      totalObjectives: this.passData?.totalObjectives ?? 0,
      optionalCompleted: this.passData?.optionalCompleted ?? 0,
      optionalTotal: this.passData?.optionalTotal ?? 0,
      sessionXp: this.passData?.sessionXp ?? {},
    });
  }

  shutdown(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.decisions = [];
    this.passData = null;
    this.confirmed = false;
  }
}
