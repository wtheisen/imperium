import { getPlayerState, applyPendingRewards, addRequisitionPoints, savePlayerState, getActiveModifiers, clearModifiers } from '../state/PlayerState';
import { CARD_DATABASE } from '../cards/CardDatabase';
import { MissionDefinition } from '../missions/MissionDefinition';
import { GameSceneInterface, getSceneManager } from './SceneManager';
import { getModifierBonus } from '../state/DifficultyModifiers';
import { EventBus } from '../EventBus';
import { BattleReport } from '../systems/BattleRecorder';
import {
  MISSION_REWARD_BASE,
  MISSION_REWARD_PER_DIFFICULTY,
  MISSION_REWARD_PER_OBJECTIVE,
  DEFEAT_REWARD_FRACTION,
} from '../config';

interface CardStats {
  cardPlayCounts: Record<string, number>;
  cardsDrawn: number;
  cardsDiscarded: number;
  reshuffleCount: number;
}

const UNIT_LABELS: Record<string, string> = {
  marine: 'Space Marine', guardsman: 'Guardsman', scout: 'Scout',
  servitor: 'Servitor', ogryn: 'Ogryn', techmarine: 'Techmarine',
  rhino: 'Rhino', leman_russ: 'Leman Russ', sentinel: 'Sentinel',
  ork_boy: 'Ork Boy', ork_shoota: 'Ork Shoota', ork_nob: 'Ork Nob',
  drop_ship: 'Drop Ship', barracks: 'Barracks', tarantula: 'Tarantula', aegis: 'Aegis',
};

function labelFor(type: string): string {
  return UNIT_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export class GameOverScene implements GameSceneInterface {
  id = 'GameOverScene';
  private container: HTMLDivElement | null = null;

  private victory = false;
  private missionId = '';
  private mission: MissionDefinition | null = null;
  private missionName = '';
  private objectivesCompleted = 0;
  private totalObjectives = 0;
  private optionalCompleted = 0;
  private optionalTotal = 0;
  private sessionXp: Record<string, number> = {};
  private cardStats: CardStats | null = null;
  private battleHonours: { promoted: { name: string; cardId: string }[]; fallen: { name: string }[] } | null = null;
  private battleReport: BattleReport | null = null;

  create(data?: any): void {
    this.victory = data?.victory ?? false;
    this.missionId = data?.missionId ?? '';
    this.mission = data?.mission ?? null;
    this.missionName = data?.missionName ?? 'Unknown Mission';
    this.objectivesCompleted = data?.objectivesCompleted ?? 0;
    this.totalObjectives = data?.totalObjectives ?? 0;
    this.optionalCompleted = data?.optionalCompleted ?? 0;
    this.optionalTotal = data?.optionalTotal ?? 0;
    this.sessionXp = data?.sessionXp ?? {};
    this.cardStats = data?.cardStats ?? null;
    this.battleHonours = data?.battleHonours ?? null;
    this.battleReport = data?.battleReport ?? null;

    // Listen for card-stats emitted by UIScene during its shutdown
    EventBus.on('card-stats', this.onCardStats, this);

    const state = getPlayerState();
    if (this.victory && this.missionId) {
      state.completedMissions.add(this.missionId);
    }

    const earnedCards = [...state.pendingRewards];
    applyPendingRewards();

    // Calculate requisition points reward
    const difficulty = this.mission?.difficulty ?? 1;
    const modifierBonus = this.victory ? getModifierBonus(getActiveModifiers()) : 0;
    let reqEarned = MISSION_REWARD_BASE
      + (difficulty * MISSION_REWARD_PER_DIFFICULTY)
      + (this.objectivesCompleted * MISSION_REWARD_PER_OBJECTIVE)
      + modifierBonus;
    if (!this.victory) {
      reqEarned = Math.floor(reqEarned * DEFEAT_REWARD_FRACTION);
    }
    addRequisitionPoints(reqEarned);

    // Clear modifiers after mission
    clearModifiers();

    // Save after all rewards applied
    savePlayerState();

    const goStyle = document.createElement('style');
    goStyle.id = 'game-over-animations';
    goStyle.textContent = `
      @keyframes go-fade-in {
        from { opacity: 0; transform: translateY(10px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes go-title-in {
        from { opacity: 0; transform: scale(0.9); }
        to   { opacity: 1; transform: scale(1); }
      }
    `;
    document.head.appendChild(goStyle);

    this.container = document.createElement('div');
    this.container.id = 'game-over-ui';
    Object.assign(this.container.style, {
      position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
      background: 'linear-gradient(160deg, rgba(10,10,14,0.97) 0%, rgba(14,12,8,0.97) 100%)',
      zIndex: '10', display: 'flex', flexDirection: 'column',
      alignItems: 'center',
      fontFamily: '"Share Tech Mono","Courier New",monospace', color: '#c8bfa0',
      overflowY: 'auto',
      animation: 'go-fade-in 0.5s ease-out both',
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
        <div style="margin-top:24px;text-align:left;width:300px;animation:go-fade-in 0.4s ease-out 0.3s both;">
          <div style="font-size:9px;letter-spacing:2px;color:rgba(200,152,42,0.4);margin-bottom:8px;">REWARDS EARNED</div>
          <div style="font-size:12px;color:#4a9e4a;border-left:2px solid rgba(74,158,74,0.2);padding-left:10px;">
            ${lines.join('')}
          </div>
        </div>`;
    }

    // Req points HTML
    const reqHtml = `
      <div style="margin-top:${earnedCards.length > 0 ? '16' : '24'}px;text-align:left;width:300px;animation:go-fade-in 0.4s ease-out 0.35s both;">
        <div style="font-size:9px;letter-spacing:2px;color:rgba(200,152,42,0.4);margin-bottom:8px;">REQUISITION POINTS</div>
        <div style="display:flex;align-items:center;gap:10px;border-left:2px solid rgba(200,152,42,0.2);padding-left:10px;">
          <div style="font-family:'Teko',sans-serif;font-size:28px;font-weight:700;color:#c8982a;line-height:1;">
            +${reqEarned}</div>
          <div style="font-size:11px;color:rgba(200,152,42,0.6);letter-spacing:1px;">REQ POINTS</div>
          ${modifierBonus > 0 ? `<div style="font-size:10px;color:#4a9e4a;letter-spacing:1px;">(+${modifierBonus} skull bonus)</div>` : ''}
        </div>
        <div style="font-size:10px;color:rgba(200,191,160,0.3);margin-top:4px;padding-left:12px;">
          Total: ${state.requisitionPoints} RP</div>
      </div>`;

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
        <div style="margin-top:16px;text-align:left;width:300px;animation:go-fade-in 0.4s ease-out 0.4s both;">
          <div style="font-size:9px;letter-spacing:2px;color:rgba(200,152,42,0.4);margin-bottom:8px;">EXPERIENCE GAINED</div>
          <div style="font-size:11px;border-left:2px solid rgba(96,144,204,0.2);padding-left:10px;">
            ${lines.join('')}
          </div>
        </div>`;
    }

    this.container.innerHTML = `
      <div style="position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:-1;">
        <div style="position:absolute;inset:0;opacity:0.015;
          background:repeating-linear-gradient(45deg,transparent,transparent 18px,${accentColor} 18px,${accentColor} 20px);"></div>
        <div style="position:absolute;inset:0;
          background:radial-gradient(ellipse at center,transparent 30%,rgba(0,0,0,0.5) 100%);"></div>
      </div>

      <div style="position:relative;text-align:center;padding:40px 20px 60px;max-width:700px;width:100%;">
        <div style="font-size:10px;letter-spacing:4px;color:rgba(200,152,42,0.4);margin-bottom:8px;
          animation:go-fade-in 0.3s ease-out 0.05s both;">
          ${subtitleText}</div>
        <div style="font-family:'Teko',sans-serif;font-size:56px;font-weight:700;
          color:${accentColor};letter-spacing:8px;line-height:1;
          text-shadow:0 0 30px ${accentColor}30;
          animation:go-title-in 0.6s ease-out 0.1s both;">
          ${titleText}</div>

        <div style="margin-top:20px;display:flex;align-items:center;justify-content:center;gap:20px;
          animation:go-fade-in 0.4s ease-out 0.2s both;">
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
              margin-top:2px;">${this.objectivesCompleted}/${this.totalObjectives}${this.optionalTotal > 0 ? `<span style="font-size:16px;color:#50b0b0;margin-left:6px;">+${this.optionalCompleted}/${this.optionalTotal}</span>` : ''}</div>
          </div>
          ${this.battleReport ? `
          <div style="width:1px;height:30px;background:rgba(200,152,42,0.1);"></div>
          <div style="text-align:center;">
            <div style="font-size:9px;letter-spacing:2px;color:rgba(200,191,160,0.3);">DURATION</div>
            <div style="font-family:'Teko',sans-serif;font-size:28px;font-weight:700;
              color:#c8bfa0;margin-top:2px;">${formatDuration(this.battleReport.durationMs)}</div>
          </div>` : ''}
        </div>

        ${rewardsHtml}
        ${reqHtml}
        ${xpHtml}
        ${this.renderBattleHonours()}

        <div id="card-stats-section"></div>

        ${this.renderBattleReport()}

        <div id="game-over-buttons" style="display:flex;gap:16px;margin-top:32px;justify-content:center;flex-wrap:wrap;animation:go-fade-in 0.4s ease-out 0.55s both;"></div>
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

    const shopBtn = this.makeButton('SUPPLY DEPOT', '#50b0b0');
    shopBtn.addEventListener('click', () => {
      getSceneManager().start('ShopScene');
    });
    btnsDiv.appendChild(shopBtn);

    const shipBtn = this.makeButton('SHIP', '#50b0b0');
    shipBtn.addEventListener('click', () => {
      getSceneManager().start('ShipScene');
    });
    btnsDiv.appendChild(shipBtn);

    const returnBtn = this.makeButton('RETURN TO COMMAND', this.victory ? '#4a9e4a' : '#5a7a8a');
    returnBtn.addEventListener('click', () => {
      getSceneManager().start('MissionSelectScene');
    });
    btnsDiv.appendChild(returnBtn);

    // Render card stats if already available
    if (this.cardStats) this.renderCardStats(this.cardStats);
  }

  // ── Battle Report Sections ─────────────────────────────────

  private renderBattleReport(): string {
    const r = this.battleReport;
    if (!r) return '';

    return `
      <div style="margin-top:24px;width:100%;border-top:1px solid rgba(200,152,42,0.1);padding-top:24px;animation:go-fade-in 0.4s ease-out 0.5s both;">
        <div style="font-family:'Teko',sans-serif;font-size:24px;font-weight:600;letter-spacing:6px;
          color:rgba(200,152,42,0.5);text-align:center;margin-bottom:20px;">AFTER-ACTION REPORT</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
          ${this.renderCombatStats(r)}
          ${this.renderEconomyReport(r)}
        </div>
        ${this.renderCardEfficiency(r)}
      </div>`;
  }

  private renderCombatStats(r: BattleReport): string {
    // Total kills by player
    const playerKills = r.killTimeline.filter(k => k.killerTeam === 'player').length;
    const playerLosses = r.killTimeline.filter(k => k.victimTeam === 'player').length;

    // Kills by unit type (player kills)
    const killsByType: Record<string, number> = {};
    for (const k of r.killTimeline) {
      if (k.killerTeam === 'player') {
        killsByType[k.killerType] = (killsByType[k.killerType] || 0) + 1;
      }
    }
    const sortedKills = Object.entries(killsByType).sort((a, b) => b[1] - a[1]);

    // Damage dealt totals
    const totalDmgDealt = Object.values(r.damageDealt).reduce((a, b) => a + b, 0);
    const totalDmgTaken = Object.values(r.damageTaken).reduce((a, b) => a + b, 0);

    // MVP
    const mvpHtml = r.mvpUnitType
      ? `<div style="display:flex;justify-content:space-between;padding:4px 0;border-top:1px solid rgba(200,152,42,0.08);margin-top:4px;">
          <span style="color:#c8982a;font-weight:600;">MVP</span>
          <span style="color:#c8982a;">${labelFor(r.mvpUnitType)} (${r.mvpKills} kills)</span>
        </div>`
      : '';

    // Kills breakdown
    const killLines = sortedKills.slice(0, 5).map(([type, count]) =>
      `<div style="display:flex;justify-content:space-between;padding:2px 0;">
        <span style="color:rgba(200,191,160,0.4);">${labelFor(type)}</span>
        <span style="color:#c8bfa0;">${count}</span>
      </div>`
    ).join('');

    // Units deployed vs lost
    const allTypes = new Set([...Object.keys(r.unitsDeployed), ...Object.keys(r.unitsLost)]);
    const survivalLines = [...allTypes].map(type => {
      const deployed = r.unitsDeployed[type] || 0;
      const lost = r.unitsLost[type] || 0;
      const survived = deployed - lost;
      const color = lost === 0 ? '#4a9e4a' : lost >= deployed ? '#c43030' : '#c8982a';
      return `<div style="display:flex;justify-content:space-between;padding:2px 0;">
        <span style="color:rgba(200,191,160,0.4);">${labelFor(type)}</span>
        <span style="color:${color};">${survived}/${deployed}</span>
      </div>`;
    }).join('');

    return `
      <div style="text-align:left;">
        <div style="font-size:9px;letter-spacing:2px;color:rgba(200,152,42,0.4);margin-bottom:8px;">COMBAT STATISTICS</div>
        <div style="font-size:11px;border-left:2px solid rgba(200,152,42,0.2);padding-left:10px;">
          <div style="display:flex;justify-content:space-between;padding:2px 0;">
            <span style="color:rgba(200,191,160,0.4);">Enemies Killed</span>
            <span style="color:#4a9e4a;">${playerKills}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:2px 0;">
            <span style="color:rgba(200,191,160,0.4);">Units Lost</span>
            <span style="color:#c43030;">${playerLosses}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:2px 0;">
            <span style="color:rgba(200,191,160,0.4);">Damage Dealt</span>
            <span style="color:#c8bfa0;">${totalDmgDealt}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:2px 0;">
            <span style="color:rgba(200,191,160,0.4);">Damage Taken</span>
            <span style="color:#c43030;">${totalDmgTaken}</span>
          </div>
          ${mvpHtml}
        </div>

        ${sortedKills.length > 0 ? `
        <div style="font-size:9px;letter-spacing:2px;color:rgba(200,152,42,0.4);margin:12px 0 8px;">KILLS BY UNIT TYPE</div>
        <div style="font-size:11px;border-left:2px solid rgba(74,158,74,0.2);padding-left:10px;">
          ${killLines}
        </div>` : ''}

        ${survivalLines ? `
        <div style="font-size:9px;letter-spacing:2px;color:rgba(200,152,42,0.4);margin:12px 0 8px;">UNIT SURVIVAL</div>
        <div style="font-size:11px;border-left:2px solid rgba(96,144,204,0.2);padding-left:10px;">
          ${survivalLines}
        </div>` : ''}
      </div>`;
  }

  private renderEconomyReport(r: BattleReport): string {
    const sources = [
      { label: 'Mining', value: r.goldBySource.mines, color: '#c8982a' },
      { label: 'Objectives', value: r.goldBySource.objectives, color: '#4a9e4a' },
      { label: 'Supply Drops', value: r.goldBySource.supplyDrops, color: '#50b0b0' },
      { label: 'Other', value: r.goldBySource.other, color: '#8a6a4e' },
    ].filter(s => s.value > 0);

    const maxVal = Math.max(...sources.map(s => s.value), 1);

    const barLines = sources.map(s => {
      const pct = Math.round((s.value / maxVal) * 100);
      return `<div style="margin-bottom:6px;">
        <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px;">
          <span style="color:rgba(200,191,160,0.4);">${s.label}</span>
          <span style="color:${s.color};">${s.value}g</span>
        </div>
        <div style="height:4px;background:rgba(200,191,160,0.06);border-radius:2px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${s.color};border-radius:2px;
            transition:width 0.5s ease;"></div>
        </div>
      </div>`;
    }).join('');

    return `
      <div style="text-align:left;">
        <div style="font-size:9px;letter-spacing:2px;color:rgba(200,152,42,0.4);margin-bottom:8px;">ECONOMY REPORT</div>
        <div style="border-left:2px solid rgba(200,152,42,0.2);padding-left:10px;">
          <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:12px;">
            <div style="font-family:'Teko',sans-serif;font-size:28px;font-weight:700;color:#c8982a;line-height:1;">
              ${r.totalGoldEarned}</div>
            <div style="font-size:10px;color:rgba(200,152,42,0.5);letter-spacing:1px;">TOTAL REQUISITION EARNED</div>
          </div>
          ${barLines}
        </div>
      </div>`;
  }

  private renderCardEfficiency(r: BattleReport): string {
    const entries = Object.entries(r.cardPlays);
    if (entries.length === 0) return '';

    // Sort by play count descending
    entries.sort((a, b) => b[1].count - a[1].count);

    const totalPlayed = entries.reduce((sum, [_, v]) => sum + v.count, 0);
    const totalSpent = entries.reduce((sum, [_, v]) => sum + v.totalCost, 0);
    const playerKills = r.killTimeline.filter(k => k.killerTeam === 'player').length;
    const costPerKill = playerKills > 0 ? (totalSpent / playerKills).toFixed(1) : '—';

    const cardLines = entries.slice(0, 6).map(([id, stats]) => {
      const card = CARD_DATABASE[id];
      const name = card ? card.name : id;
      return `<div style="display:flex;justify-content:space-between;padding:2px 0;">
        <span style="color:rgba(200,191,160,0.4);">${name}</span>
        <span style="color:#c8bfa0;">${stats.count}x <span style="color:rgba(200,152,42,0.4);font-size:10px;">(${stats.totalCost}g)</span></span>
      </div>`;
    }).join('');

    return `
      <div style="margin-top:20px;text-align:left;">
        <div style="font-size:9px;letter-spacing:2px;color:rgba(200,152,42,0.4);margin-bottom:8px;">CARD EFFICIENCY</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
          <div style="border-left:2px solid rgba(200,152,42,0.2);padding-left:10px;font-size:11px;">
            <div style="display:flex;justify-content:space-between;padding:2px 0;">
              <span style="color:rgba(200,191,160,0.4);">Total Cards Played</span>
              <span style="color:#c8982a;">${totalPlayed}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:2px 0;">
              <span style="color:rgba(200,191,160,0.4);">Total Gold Spent</span>
              <span style="color:#c8982a;">${totalSpent}g</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:2px 0;">
              <span style="color:rgba(200,191,160,0.4);">Avg Cost Per Kill</span>
              <span style="color:${costPerKill === '—' ? '#8a6a4e' : '#4a9e4a'};">${costPerKill}g</span>
            </div>
          </div>
          <div style="border-left:2px solid rgba(200,152,42,0.2);padding-left:10px;font-size:11px;">
            ${cardLines}
          </div>
        </div>
      </div>`;
  }

  // ── Existing Sections ──────────────────────────────────────

  private renderBattleHonours(): string {
    const bh = this.battleHonours;
    if (!bh || (bh.promoted.length === 0 && bh.fallen.length === 0)) return '';

    let html = `<div style="margin-top:16px;text-align:left;width:300px;animation:go-fade-in 0.4s ease-out 0.45s both;">`;
    html += `<div style="font-size:9px;letter-spacing:2px;color:rgba(200,152,42,0.4);margin-bottom:8px;">BATTLE HONOURS</div>`;
    html += `<div style="border-left:2px solid rgba(200,152,42,0.2);padding-left:10px;">`;

    for (const p of bh.promoted) {
      const typeLabel = labelFor(p.cardId);
      html += `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;">
        <div style="width:4px;height:4px;background:#c8982a;border-radius:50%;flex-shrink:0;"></div>
        <span style="font-size:12px;color:#c8982a;font-weight:600;">${p.name}</span>
        <span style="font-size:9px;color:rgba(200,191,160,0.3);letter-spacing:1px;">${typeLabel.toUpperCase()} · PROMOTED</span>
      </div>`;
    }

    for (const f of bh.fallen) {
      html += `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;">
        <div style="width:4px;height:4px;background:#c43030;border-radius:50%;flex-shrink:0;"></div>
        <span style="font-size:12px;color:rgba(196,48,48,0.7);">${f.name}</span>
        <span style="font-size:9px;color:rgba(200,191,160,0.3);letter-spacing:1px;">KILLED IN ACTION</span>
      </div>`;
    }

    html += `</div></div>`;
    return html;
  }

  private onCardStats = (stats: CardStats): void => {
    this.cardStats = stats;
    this.renderCardStats(stats);
  };

  private renderCardStats(stats: CardStats): void {
    const section = this.container?.querySelector('#card-stats-section');
    if (!section) return;

    const totalPlayed = Object.values(stats.cardPlayCounts).reduce((a, b) => a + b, 0);

    // Find MVP (most played)
    let mvpName = '—';
    let mvpCount = 0;
    for (const [id, count] of Object.entries(stats.cardPlayCounts)) {
      if (count > mvpCount) {
        mvpCount = count;
        const card = CARD_DATABASE[id];
        mvpName = card ? `${card.name} (${count}x)` : id;
      }
    }

    // Build stats lines
    const lines = [
      { label: 'Cards Played', value: `${totalPlayed}`, color: '#c8982a' },
      { label: 'Cards Drawn', value: `${stats.cardsDrawn}`, color: '#6090cc' },
      { label: 'Cards Discarded', value: `${stats.cardsDiscarded}`, color: '#8a6a4e' },
      { label: 'Reshuffles', value: `${stats.reshuffleCount}`, color: '#c8982a' },
      { label: 'MVP Card', value: mvpName, color: '#4a9e4a' },
    ];

    const linesHtml = lines.map(l =>
      `<div style="display:flex;justify-content:space-between;padding:2px 0;">
        <span style="color:rgba(200,191,160,0.4);">${l.label}</span>
        <span style="color:${l.color};">${l.value}</span>
      </div>`
    ).join('');

    section.innerHTML = `
      <div style="margin-top:16px;text-align:left;width:300px;">
        <div style="font-size:9px;letter-spacing:2px;color:rgba(200,152,42,0.4);margin-bottom:8px;">DECK PERFORMANCE</div>
        <div style="font-size:11px;border-left:2px solid rgba(200,152,42,0.2);padding-left:10px;">
          ${linesHtml}
        </div>
      </div>`;
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
    EventBus.off('card-stats', this.onCardStats, this);
    document.getElementById('game-over-animations')?.remove();
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
}
