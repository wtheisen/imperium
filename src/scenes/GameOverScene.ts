import { getPlayerState, applyPendingRewards } from '../state/PlayerState';
import { CARD_DATABASE } from '../cards/CardDatabase';
import { MissionDefinition } from '../missions/MissionDefinition';
import { GameSceneInterface, getSceneManager } from './SceneManager';

export class GameOverScene implements GameSceneInterface {
  id = 'GameOverScene';
  private container: HTMLDivElement | null = null;

  private victory = false;
  private missionId = '';
  private mission: MissionDefinition | null = null;
  private missionName = '';
  private objectivesCompleted = 0;
  private totalObjectives = 0;
  private sessionXp: Record<string, number> = {};

  create(data?: any): void {
    this.victory = data?.victory ?? false;
    this.missionId = data?.missionId ?? '';
    this.mission = data?.mission ?? null;
    this.missionName = data?.missionName ?? 'Unknown Mission';
    this.objectivesCompleted = data?.objectivesCompleted ?? 0;
    this.totalObjectives = data?.totalObjectives ?? 0;
    this.sessionXp = data?.sessionXp ?? {};

    const state = getPlayerState();
    if (this.victory && this.missionId) {
      state.completedMissions.add(this.missionId);
    }

    const earnedCards = [...state.pendingRewards];
    applyPendingRewards();

    this.container = document.createElement('div');
    this.container.id = 'game-over-ui';
    Object.assign(this.container.style, {
      position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
      background: 'linear-gradient(160deg, rgba(10,10,14,0.95) 0%, rgba(14,12,8,0.95) 100%)',
      zIndex: '10', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: '"Share Tech Mono","Courier New",monospace', color: '#c8bfa0',
    });

    const accentColor = this.victory ? '#4a9e4a' : '#c43030';
    const titleText = this.victory ? 'MISSION COMPLETE' : 'DROP SHIP DESTROYED';
    const subtitleText = this.victory ? 'THE EMPEROR PROTECTS' : 'GLORY IN DEATH';

    // Rewards HTML
    let rewardsHtml = '';
    if (earnedCards.length > 0) {
      const cardCounts: Record<string, number> = {};
      for (const id of earnedCards) cardCounts[id] = (cardCounts[id] || 0) + 1;
      const lines = Object.entries(cardCounts).map(([id, count]) => {
        const card = CARD_DATABASE[id];
        const name = card ? card.name : id;
        return `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;">
          <div style="width:4px;height:4px;background:#4a9e4a;border-radius:50%;"></div>
          <span>${count > 1 ? `${name} x${count}` : name}</span>
        </div>`;
      });
      rewardsHtml = `
        <div style="margin-top:24px;text-align:left;width:300px;">
          <div style="font-size:9px;letter-spacing:2px;color:rgba(200,152,42,0.4);margin-bottom:8px;">REWARDS EARNED</div>
          <div style="font-size:12px;color:#4a9e4a;border-left:2px solid rgba(74,158,74,0.2);padding-left:10px;">
            ${lines.join('')}
          </div>
        </div>`;
    }

    // XP HTML
    const xpEntries = Object.entries(this.sessionXp).filter(([_, v]) => v > 0);
    let xpHtml = '';
    if (xpEntries.length > 0) {
      const lines = xpEntries.map(([type, amount]) =>
        `<div style="display:flex;justify-content:space-between;padding:2px 0;">
          <span style="color:rgba(200,191,160,0.4);">${type.charAt(0).toUpperCase() + type.slice(1)}</span>
          <span style="color:#6090cc;">+${amount} XP</span>
        </div>`
      );
      xpHtml = `
        <div style="margin-top:16px;text-align:left;width:300px;">
          <div style="font-size:9px;letter-spacing:2px;color:rgba(200,152,42,0.4);margin-bottom:8px;">EXPERIENCE GAINED</div>
          <div style="font-size:11px;border-left:2px solid rgba(96,144,204,0.2);padding-left:10px;">
            ${lines.join('')}
          </div>
        </div>`;
    }

    this.container.innerHTML = `
      <div style="position:absolute;inset:0;pointer-events:none;overflow:hidden;">
        <div style="position:absolute;inset:0;opacity:0.015;
          background:repeating-linear-gradient(45deg,transparent,transparent 18px,${accentColor} 18px,${accentColor} 20px);"></div>
        <div style="position:absolute;inset:0;
          background:radial-gradient(ellipse at center,transparent 30%,rgba(0,0,0,0.5) 100%);"></div>
      </div>

      <div style="position:relative;text-align:center;">
        <div style="font-size:10px;letter-spacing:4px;color:rgba(200,152,42,0.4);margin-bottom:8px;">
          ${subtitleText}</div>
        <div style="font-family:'Teko',sans-serif;font-size:56px;font-weight:700;
          color:${accentColor};letter-spacing:8px;line-height:1;
          text-shadow:0 0 30px ${accentColor}30;">
          ${titleText}</div>

        <div style="margin-top:20px;display:flex;align-items:center;justify-content:center;gap:20px;">
          <div style="text-align:center;">
            <div style="font-size:9px;letter-spacing:2px;color:rgba(200,191,160,0.3);">MISSION</div>
            <div style="font-family:'Teko',sans-serif;font-size:20px;font-weight:600;
              color:#e8dcc0;letter-spacing:1px;margin-top:2px;">${this.missionName.toUpperCase()}</div>
          </div>
          <div style="width:1px;height:30px;background:rgba(200,152,42,0.1);"></div>
          <div style="text-align:center;">
            <div style="font-size:9px;letter-spacing:2px;color:rgba(200,191,160,0.3);">OBJECTIVES</div>
            <div style="font-family:'Teko',sans-serif;font-size:28px;font-weight:700;
              color:${this.objectivesCompleted === this.totalObjectives ? '#4a9e4a' : '#c8982a'};
              margin-top:2px;">${this.objectivesCompleted}/${this.totalObjectives}</div>
          </div>
        </div>

        ${rewardsHtml}
        ${xpHtml}

        <div id="game-over-buttons" style="display:flex;gap:16px;margin-top:32px;justify-content:center;"></div>
      </div>
    `;

    document.getElementById('game-container')!.appendChild(this.container);

    const btnsDiv = this.container.querySelector('#game-over-buttons')!;

    if (!this.victory) {
      const retryBtn = this.makeButton('RETRY', '#c8982a');
      retryBtn.addEventListener('click', () => {
        getSceneManager().start('GameScene', { mission: this.mission });
      });
      btnsDiv.appendChild(retryBtn);
    }

    const returnBtn = this.makeButton('RETURN TO COMMAND', this.victory ? '#4a9e4a' : '#5a7a8a');
    returnBtn.addEventListener('click', () => {
      getSceneManager().start('MissionSelectScene');
    });
    btnsDiv.appendChild(returnBtn);
  }

  private makeButton(text: string, color: string): HTMLButtonElement {
    const btn = document.createElement('button');
    Object.assign(btn.style, {
      padding: '12px 36px',
      background: `linear-gradient(180deg,${color}15 0%,${color}08 100%)`,
      color,
      border: `1px solid ${color}60`,
      fontFamily: "'Teko',sans-serif",
      fontSize: '18px',
      fontWeight: '600',
      letterSpacing: '4px',
      cursor: 'pointer',
      transition: 'all 0.2s',
    });
    btn.textContent = text;
    btn.addEventListener('mouseenter', () => {
      btn.style.background = `linear-gradient(180deg,${color}25 0%,${color}12 100%)`;
      btn.style.borderColor = `${color}90`;
      btn.style.letterSpacing = '6px';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = `linear-gradient(180deg,${color}15 0%,${color}08 100%)`;
      btn.style.borderColor = `${color}60`;
      btn.style.letterSpacing = '4px';
    });
    return btn;
  }

  shutdown(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
}
