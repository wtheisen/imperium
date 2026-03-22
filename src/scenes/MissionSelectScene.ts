import { MISSIONS } from '../missions/MissionDatabase';
import { MissionDefinition } from '../missions/MissionDefinition';
import { getPlayerState, toggleModifier, savePlayerState } from '../state/PlayerState';
import { MODIFIERS, getModifierBonus } from '../state/DifficultyModifiers';
import { GameSceneInterface, getSceneManager } from './SceneManager';
import { generateMission, generateSeedString, parseSeedString } from '../missions/ProceduralMissionGenerator';
import { EnvironmentModifier } from '../missions/MissionDefinition';
import { MODIFIER_META } from '../systems/EnvironmentModifierSystem';

// Inject scoped styles once
let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes ms-scanline {
      0% { transform: translateY(-100%); }
      100% { transform: translateY(100vh); }
    }
    @keyframes ms-flicker {
      0%, 100% { opacity: 1; }
      92% { opacity: 1; }
      93% { opacity: 0.7; }
      94% { opacity: 1; }
    }
    @keyframes ms-glow-pulse {
      0%, 100% { filter: brightness(1) drop-shadow(0 0 4px var(--ms-accent)); }
      50% { filter: brightness(1.15) drop-shadow(0 0 10px var(--ms-accent)); }
    }
    @keyframes ms-card-in {
      from { opacity: 0; transform: translateY(30px) scale(0.95); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes ms-header-in {
      from { opacity: 0; transform: translateY(-20px); letter-spacing: 20px; }
      to { opacity: 1; transform: translateY(0); letter-spacing: 8px; }
    }
    @keyframes ms-stripe-scroll {
      0% { background-position: 0 0; }
      100% { background-position: 40px 40px; }
    }
    @keyframes ms-border-trace {
      0% { clip-path: inset(0 100% 0 0); }
      100% { clip-path: inset(0 0 0 0); }
    }
    @keyframes cm-node-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
    @keyframes cm-node-in {
      from { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
      to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }
    @keyframes cm-modal-in {
      from { opacity: 0; transform: translateY(8px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes cm-threat-orbit {
      from { transform: rotate(0deg) translateX(28px) rotate(0deg); }
      to   { transform: rotate(360deg) translateX(28px) rotate(-360deg); }
    }
    .cm-node:hover { filter: brightness(1.3); cursor: pointer; }
    .cm-node-dot {
      position: absolute;
      width: 4px; height: 4px;
      border-radius: 50%;
      top: 50%; left: 50%;
      margin: -2px 0 0 -2px;
      animation: cm-threat-orbit 4s linear infinite;
    }
    .cm-node-dot:nth-child(2) { animation-delay: -1.33s; }
    .cm-node-dot:nth-child(3) { animation-delay: -2.66s; }
  `;
  document.head.appendChild(style);
}

const DIFF_THEMES: Record<number, { color: string; label: string; symbol: string }> = {
  1: { color: '#4a9e4a', label: 'STANDARD',  symbol: 'I'  },
  2: { color: '#c8982a', label: 'HAZARDOUS', symbol: 'II' },
  3: { color: '#c43030', label: 'EXTREMIS',  symbol: 'III' },
  4: { color: '#8020c0', label: 'HELLDIVE',  symbol: 'IV' },
};

const MAP_TYPE_LABELS: Record<string, string> = {
  outdoor:    'PLANETARY SURFACE',
  space_hulk: 'SPACE HULK',
};

interface CampaignNode {
  missionId: string;
  x: number; // % from left of map container
  y: number; // % from top of map container
}

const CAMPAIGN_NODES: CampaignNode[] = [
  // ── Difficulty 1 — STANDARD (southern landing zones) ──
  { missionId: 'purge_outskirts', x: 28, y: 72 },
  { missionId: 'hold_the_line',   x: 62, y: 78 },

  // ── Difficulty 2 — HAZARDOUS (mid-continent band) ──
  { missionId: 'secure_relay',      x: 18, y: 52 },
  { missionId: 'vox_array',         x: 42, y: 58 },
  { missionId: 'scavenge_evacuate', x: 72, y: 55 },
  { missionId: 'night_raid',        x: 55, y: 42 },
  { missionId: 'space_hulk_alpha',  x: 83, y: 30 },

  // ── Difficulty 3 — EXTREMIS (northern contested zones) ──
  { missionId: 'exterminatus',    x: 22, y: 28 },
  { missionId: 'armored_assault', x: 45, y: 22 },
  { missionId: 'green_tide',      x: 68, y: 32 },
  { missionId: 'deep_strike',     x: 86, y: 18 },

  // ── Difficulty 4 — HELLDIVE (enemy heartland) ──
  { missionId: 'exterminatus_omega', x: 40, y: 10 },
];

/**
 * MissionSelectScene — Theater-of-war planet surface campaign map.
 * All missions displayed as deployable zones. Click a node to open
 * a floating mission detail modal.
 */
export class MissionSelectScene implements GameSceneInterface {
  id = 'MissionSelectScene';
  private container: HTMLDivElement | null = null;
  private selectedMissionId: string | null = null;
  private commandDropdownOpen = false;
  private procDifficulty = 2;
  private procSeedStr = generateSeedString();
  private playerMutators = new Set<EnvironmentModifier>();

  create(): void {
    injectStyles();

    this.container = document.createElement('div');
    this.container.id = 'mission-select-ui';
    Object.assign(this.container.style, {
      position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
      zIndex: '10', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      fontFamily: '"Share Tech Mono", monospace',
      color: '#c8bfa0',
      background: 'linear-gradient(160deg, #0a0a0e 0%, #12100c 40%, #0e0c08 100%)',
    });

    this.container.innerHTML = this.buildLayout();
    document.getElementById('game-container')!.appendChild(this.container);
    this.wireEvents();
  }

  private buildLayout(): string {
    const state = getPlayerState();
    return `
      <!-- Atmospheric background -->
      <div style="position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:0;">
        <div style="position:absolute;inset:0;opacity:0.018;
          background:repeating-linear-gradient(45deg,transparent,transparent 18px,#c8982a 18px,#c8982a 20px);
          animation:ms-stripe-scroll 4s linear infinite;"></div>
        <div style="position:absolute;left:0;right:0;height:2px;
          background:linear-gradient(90deg,transparent,rgba(200,191,160,0.06),transparent);
          animation:ms-scanline 8s linear infinite;"></div>
        <div style="position:absolute;inset:0;
          background:radial-gradient(ellipse at center,transparent 30%,rgba(0,0,0,0.6) 100%);"></div>
        <!-- Atmosphere glow at top -->
        <div style="position:absolute;top:0;left:0;right:0;height:40%;
          background:radial-gradient(ellipse at 50% -20%,rgba(100,60,20,0.15) 0%,transparent 70%);"></div>
      </div>

      <!-- Top bar -->
      <div style="position:relative;z-index:2;display:flex;align-items:center;
        justify-content:space-between;padding:14px 28px;flex-shrink:0;
        border-bottom:1px solid rgba(200,152,42,0.15);
        background:linear-gradient(180deg,rgba(200,152,42,0.04) 0%,transparent 100%);">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="width:3px;height:26px;background:#c8982a;flex-shrink:0;"></div>
          <div style="font-family:'Teko',sans-serif;font-size:13px;font-weight:500;
            color:rgba(200,152,42,0.5);letter-spacing:4px;animation:ms-flicker 6s infinite;">
            IMPERIAL COMMAND // STRATEGOS TERMINAL</div>
        </div>
        <div style="display:flex;gap:10px;align-items:center;">
          ${this.buildDeckSelector(state)}
          <button id="ms-edit-decks" style="padding:6px 14px;background:transparent;
            color:#5a7a8a;border:1px solid rgba(90,122,138,0.3);font-family:'Share Tech Mono',monospace;
            font-size:11px;cursor:pointer;letter-spacing:1px;transition:all 0.2s;">EDIT DECKS</button>
          <div style="position:relative;">
            <button id="ms-command-btn" style="padding:6px 14px;background:transparent;
              color:#5a7a8a;border:1px solid rgba(90,122,138,0.3);font-family:'Share Tech Mono',monospace;
              font-size:11px;cursor:pointer;letter-spacing:1px;transition:all 0.2s;">COMMAND ▾</button>
            <div id="ms-command-dropdown" style="display:none;position:absolute;top:calc(100% + 4px);right:0;
              z-index:100;background:rgba(10,10,14,0.97);
              border:1px solid rgba(200,152,42,0.2);min-width:160px;">
              <button class="ms-cmd-item" data-scene="TechTreeScene"
                style="display:block;width:100%;padding:10px 16px;background:transparent;
                color:#5a7a8a;border:none;border-bottom:1px solid rgba(200,152,42,0.08);
                font-family:'Share Tech Mono',monospace;font-size:11px;cursor:pointer;
                letter-spacing:1px;text-align:left;transition:all 0.15s;">TECH TREES</button>
              <button class="ms-cmd-item" data-scene="ShopScene"
                style="display:block;width:100%;padding:10px 16px;background:transparent;
                color:#5a7a8a;border:none;border-bottom:1px solid rgba(200,152,42,0.08);
                font-family:'Share Tech Mono',monospace;font-size:11px;cursor:pointer;
                letter-spacing:1px;text-align:left;transition:all 0.15s;">SUPPLY DEPOT</button>
              <button class="ms-cmd-item" data-scene="ShipScene"
                style="display:block;width:100%;padding:10px 16px;background:transparent;
                color:#5a7a8a;border:none;
                font-family:'Share Tech Mono',monospace;font-size:11px;cursor:pointer;
                letter-spacing:1px;text-align:left;transition:all 0.15s;">SHIP</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Campaign map -->
      <div id="cm-map" style="position:relative;flex:1;overflow:hidden;z-index:1;">
        <!-- Planet terrain texture layers -->
        <div style="position:absolute;inset:0;pointer-events:none;
          background:
            radial-gradient(ellipse at 30% 60%,rgba(60,40,15,0.25) 0%,transparent 50%),
            radial-gradient(ellipse at 70% 40%,rgba(40,50,20,0.2) 0%,transparent 45%),
            radial-gradient(ellipse at 50% 80%,rgba(80,50,10,0.18) 0%,transparent 40%);"></div>
        <!-- Grid lines suggesting tactical map overlay -->
        <div style="position:absolute;inset:0;pointer-events:none;opacity:0.04;
          background-image:linear-gradient(rgba(200,191,160,1) 1px,transparent 1px),
                           linear-gradient(90deg,rgba(200,191,160,1) 1px,transparent 1px);
          background-size:60px 60px;"></div>
        <!-- Equator line (mid-difficulty boundary) -->
        <div style="position:absolute;left:5%;right:5%;top:46%;height:1px;pointer-events:none;
          background:linear-gradient(90deg,transparent,rgba(200,152,42,0.08) 20%,rgba(200,152,42,0.08) 80%,transparent);"></div>

        <!-- Region labels -->
        <div style="position:absolute;left:2%;top:88%;font-family:'Teko',sans-serif;font-size:11px;
          color:rgba(200,191,160,0.12);letter-spacing:3px;pointer-events:none;">LANDING ZONE ALPHA</div>
        <div style="position:absolute;left:2%;top:45%;font-family:'Teko',sans-serif;font-size:11px;
          color:rgba(200,152,42,0.1);letter-spacing:3px;pointer-events:none;">CONTESTED TERRITORY</div>
        <div style="position:absolute;left:2%;top:5%;font-family:'Teko',sans-serif;font-size:11px;
          color:rgba(196,48,48,0.12);letter-spacing:3px;pointer-events:none;">ENEMY HEARTLAND</div>

        <!-- Mission nodes (rendered by JS after DOM insert) -->
        <div id="cm-nodes"></div>

        <!-- Mutator picker row -->
        <div id="cm-mutator-picker" style="position:absolute;bottom:58px;left:50%;transform:translateX(-50%);
          z-index:10;display:flex;flex-wrap:wrap;justify-content:center;gap:4px;
          padding:6px 12px;
          background:linear-gradient(180deg,rgba(14,12,8,0.92) 0%,rgba(10,10,14,0.92) 100%);
          border:1px solid rgba(200,152,42,0.12);border-bottom:none;
          box-shadow:0 -4px 16px rgba(0,0,0,0.4);">
          <div style="width:100%;font-family:'Teko',sans-serif;font-size:9px;font-weight:500;
            color:rgba(200,152,42,0.35);letter-spacing:3px;text-align:center;margin-bottom:2px;">MUTATORS</div>
          ${MODIFIER_META.map(m => `<button class="cm-mutator-btn" data-mod="${m.id}" title="${m.name}: ${m.description}" style="
            width:30px;height:30px;
            background:rgba(200,191,160,0.03);
            border:1px solid rgba(200,191,160,0.1);
            color:#5a5a4a;font-size:14px;
            cursor:pointer;transition:all 0.2s;
            display:flex;align-items:center;justify-content:center;
            position:relative;">${m.icon}</button>`).join('')}
        </div>

        <!-- Procedural mission generator panel -->
        <div id="cm-proc-panel" style="position:absolute;bottom:14px;left:50%;transform:translateX(-50%);
          z-index:10;display:flex;align-items:center;gap:10px;
          padding:10px 18px;
          background:linear-gradient(180deg,rgba(14,12,8,0.95) 0%,rgba(10,10,14,0.95) 100%);
          border:1px solid rgba(200,152,42,0.2);
          box-shadow:0 0 20px rgba(0,0,0,0.6),0 0 10px rgba(200,152,42,0.05);">
          <div style="font-family:'Teko',sans-serif;font-size:11px;font-weight:500;
            color:rgba(200,152,42,0.5);letter-spacing:3px;">GENERATE OPERATION</div>
          <div style="width:1px;height:18px;background:rgba(200,152,42,0.15);"></div>
          <!-- Difficulty selector -->
          <div style="display:flex;gap:3px;" id="cm-proc-diff">
            ${[1,2,3,4].map(d => `<button class="cm-proc-diff-btn" data-diff="${d}" style="
              width:22px;height:22px;
              background:${d === 2 ? 'rgba(200,152,42,0.15)' : 'rgba(200,191,160,0.03)'};
              border:1px solid ${d === 2 ? 'rgba(200,152,42,0.5)' : 'rgba(200,191,160,0.1)'};
              color:${d === 2 ? '#c8982a' : '#5a5a4a'};
              font-family:'Share Tech Mono',monospace;font-size:10px;cursor:pointer;
              transition:all 0.15s;">${d}</button>`).join('')}
          </div>
          <div style="width:1px;height:18px;background:rgba(200,152,42,0.15);"></div>
          <!-- Seed input -->
          <input id="cm-proc-seed" type="text" maxlength="6" value="${this.procSeedStr}" style="
            width:64px;padding:3px 6px;
            background:rgba(200,191,160,0.03);
            border:1px solid rgba(200,191,160,0.1);
            color:#c8982a;font-family:'Share Tech Mono',monospace;font-size:11px;
            text-align:center;letter-spacing:2px;outline:none;
            transition:border-color 0.15s;" />
          <button id="cm-proc-reroll" title="New Seed" style="
            padding:3px 8px;background:transparent;
            border:1px solid rgba(200,191,160,0.1);
            color:#5a7a8a;font-family:'Share Tech Mono',monospace;font-size:11px;
            cursor:pointer;transition:all 0.15s;">&#x21bb;</button>
          <div style="width:1px;height:18px;background:rgba(200,152,42,0.15);"></div>
          <button id="cm-proc-generate" style="
            padding:6px 16px;
            background:linear-gradient(180deg,rgba(200,152,42,0.12) 0%,rgba(200,152,42,0.04) 100%);
            border:1px solid rgba(200,152,42,0.4);
            color:#c8982a;font-family:'Teko',sans-serif;font-size:14px;font-weight:600;
            letter-spacing:4px;cursor:pointer;transition:all 0.2s;">DEPLOY</button>
        </div>

        <!-- Mission detail modal -->
        <div id="cm-modal" style="display:none;position:absolute;z-index:50;width:340px;
          max-height:75vh;overflow-y:auto;
          background:linear-gradient(160deg,rgba(14,12,8,0.97) 0%,rgba(10,10,14,0.97) 100%);
          border:1px solid rgba(200,152,42,0.3);
          box-shadow:0 0 40px rgba(0,0,0,0.8),0 0 20px rgba(200,152,42,0.08);
          animation:cm-modal-in 0.18s ease-out;"></div>
      </div>
    `;
  }

  private buildDeckSelector(state: ReturnType<typeof getPlayerState>): string {
    return state.decks.map((deck, i) => {
      const selected = i === state.selectedDeckIndex;
      return `<button class="ms-deck-btn" data-deck="${i}" style="
        padding:6px 14px;
        background:${selected ? 'rgba(200,152,42,0.1)' : 'transparent'};
        color:${selected ? '#c8982a' : '#5a5a4a'};
        border:1px solid ${selected ? 'rgba(200,152,42,0.4)' : 'rgba(200,191,160,0.08)'};
        font-family:'Share Tech Mono',monospace;font-size:11px;cursor:pointer;
        letter-spacing:1px;transition:all 0.2s;
      ">${deck.name} [${deck.cardIds.length}]</button>`;
    }).join('');
  }

  private buildMissionModal(mission: MissionDefinition, completed: boolean): string {
    const state = getPlayerState();
    const theme = DIFF_THEMES[mission.difficulty] || DIFF_THEMES[1];
    const terrainLabel = MAP_TYPE_LABELS[mission.terrain?.mapType || 'outdoor'] || 'PLANETARY SURFACE';
    const activeIds = state.activeModifiers;
    const bonus = getModifierBonus(activeIds);

    return `
      <div style="padding:20px 22px 0;">
        <!-- Header -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:12px;">
          <div style="font-family:'Teko',sans-serif;font-size:28px;font-weight:700;
            color:#e8dcc0;letter-spacing:4px;line-height:1;">${mission.name.toUpperCase()}</div>
          <button id="cm-modal-close" style="flex-shrink:0;background:transparent;border:none;
            color:rgba(200,191,160,0.3);font-size:18px;cursor:pointer;padding:0 0 0 8px;
            line-height:1;transition:color 0.15s;">✕</button>
        </div>

        <!-- Threat row -->
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="font-size:9px;letter-spacing:2px;color:rgba(200,191,160,0.4);">THREAT</div>
            <div style="display:flex;gap:2px;">
              ${[1,2,3].map(d => `<div style="width:20px;height:5px;
                background:${d <= mission.difficulty ? theme.color : 'rgba(200,191,160,0.08)'};
                ${d <= mission.difficulty ? `box-shadow:0 0 6px ${theme.color}40;` : ''}"></div>`).join('')}
            </div>
            <div style="font-size:9px;letter-spacing:2px;color:${theme.color};font-weight:bold;">${theme.label}</div>
          </div>
          <div style="width:1px;height:12px;background:rgba(200,191,160,0.1);"></div>
          <div style="font-size:9px;letter-spacing:1px;color:rgba(200,191,160,0.35);">${terrainLabel}</div>
          ${completed ? `<div style="display:flex;align-items:center;gap:4px;margin-left:auto;">
            <div style="width:6px;height:6px;background:#4a9e4a;border-radius:50%;"></div>
            <div style="font-size:9px;letter-spacing:1px;color:#4a9e4a;">PACIFIED</div>
          </div>` : ''}
        </div>

        <!-- Divider -->
        <div style="height:1px;background:rgba(200,152,42,0.08);margin-bottom:14px;position:relative;">
          <div style="position:absolute;inset:0;
            background:linear-gradient(90deg,${theme.color},transparent);
            opacity:0.25;animation:ms-border-trace 0.8s ease-out forwards;"></div>
        </div>

        <!-- Briefing -->
        <div style="font-size:9px;letter-spacing:2px;color:rgba(200,152,42,0.4);margin-bottom:6px;">MISSION BRIEFING</div>
        <p style="color:#a09880;font-size:12px;line-height:1.7;margin:0 0 16px;">${mission.description}</p>

        <!-- Stat boxes -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
          ${this.buildStatBox('STARTING REQ', `${mission.startingGold}`, '#c8982a')}
          ${this.buildStatBox('OBJECTIVES', `${mission.objectives.length}`, theme.color)}
          ${this.buildStatBox('ENEMY CAMPS', `${mission.enemyCamps.length}`, '#c43030')}
          ${this.buildStatBox('SUPPLY INT.', `${Math.round(mission.supplyDropIntervalMs / 1000)}s`, '#5a7a8a')}
        </div>

        <!-- Objectives -->
        <div style="font-size:9px;letter-spacing:2px;color:rgba(200,152,42,0.4);margin-bottom:8px;">TACTICAL OBJECTIVES</div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:${completed ? '0' : '20px'};">
          ${mission.objectives.map((obj, i) => `
            <div style="padding:8px 10px;background:rgba(200,152,42,0.03);
              border-left:2px solid ${theme.color}40;
              animation:ms-card-in 0.3s ease-out ${0.1 + i * 0.08}s both;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
                <div style="font-size:8px;letter-spacing:1px;color:${theme.color};
                  background:${theme.color}15;padding:1px 5px;">${obj.type.toUpperCase()}</div>
                <div style="font-size:8px;color:rgba(200,191,160,0.3);">+${obj.goldReward} REQ</div>
              </div>
              <div style="font-family:'Teko',sans-serif;font-size:14px;font-weight:500;
                color:#c8bfa0;letter-spacing:1px;">${obj.name}</div>
            </div>
          `).join('')}
        </div>
      </div>

      ${completed ? `
        <!-- Skull Modifiers -->
        <div style="padding:12px 22px;border-top:1px solid rgba(200,152,42,0.08);
          background:rgba(200,152,42,0.012);">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <div style="font-size:9px;letter-spacing:2px;color:rgba(200,152,42,0.4);">SKULL MODIFIERS</div>
            ${bonus > 0 ? `<div style="font-size:9px;color:#c8982a;">+${bonus} BONUS RP</div>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${MODIFIERS.map(mod => {
              const active = activeIds.includes(mod.id);
              return `<button class="ms-skull-btn" data-mod="${mod.id}" title="${mod.description}" style="
                display:flex;align-items:center;gap:5px;
                padding:5px 10px;
                background:${active ? 'rgba(200,152,42,0.12)' : 'rgba(200,191,160,0.02)'};
                border:1px solid ${active ? 'rgba(200,152,42,0.5)' : 'rgba(200,191,160,0.08)'};
                color:${active ? '#c8982a' : '#5a5a4a'};
                font-family:'Share Tech Mono',monospace;font-size:10px;
                cursor:pointer;transition:all 0.2s;letter-spacing:1px;
                ${active ? 'box-shadow:0 0 6px rgba(200,152,42,0.15);' : ''}
              ">
                <span style="font-size:12px;">${mod.icon}</span>
                <span>${mod.name}</span>
                <span style="font-size:8px;color:${active ? '#4a9e4a' : 'rgba(200,191,160,0.2)'};">+${mod.reqPointsBonus}</span>
              </button>`;
            }).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Deploy bar -->
      <div style="padding:14px 22px 18px;border-top:1px solid rgba(200,152,42,0.08);
        background:linear-gradient(180deg,transparent,rgba(200,152,42,0.02));">
        <button id="ms-deploy-btn" style="
          width:100%;position:relative;overflow:hidden;
          padding:12px 0;
          background:linear-gradient(180deg,rgba(200,152,42,0.12) 0%,rgba(200,152,42,0.04) 100%);
          color:#c8982a;
          border:1px solid rgba(200,152,42,0.4);
          font-family:'Teko',sans-serif;font-size:20px;font-weight:600;
          letter-spacing:6px;cursor:pointer;
          transition:all 0.25s;
          animation:ms-glow-pulse 3s ease-in-out infinite;
          --ms-accent:rgba(200,152,42,0.3);
        ">DEPLOY</button>
      </div>
    `;
  }

  private buildStatBox(label: string, value: string, color: string): string {
    return `
      <div style="padding:8px 10px;background:rgba(200,191,160,0.02);
        border-left:2px solid ${color}30;">
        <div style="font-size:8px;letter-spacing:2px;color:rgba(200,191,160,0.3);margin-bottom:2px;">
          ${label}</div>
        <div style="font-family:'Teko',sans-serif;font-size:18px;font-weight:600;
          color:${color};letter-spacing:1px;">${value}</div>
      </div>
    `;
  }

  private renderNodes(): void {
    const container = this.container?.querySelector('#cm-nodes') as HTMLElement | null;
    if (!container) return;

    const state = getPlayerState();
    const missionMap = new Map(MISSIONS.map(m => [m.id, m]));

    container.innerHTML = CAMPAIGN_NODES.map((node, idx) => {
      const mission = missionMap.get(node.missionId);
      if (!mission) return '';

      const theme = DIFF_THEMES[mission.difficulty] || DIFF_THEMES[1];
      const completed = state.completedMissions.has(mission.id);
      const isSpaceHulk = mission.terrain?.mapType === 'space_hulk';
      const symbol = isSpaceHulk ? '◈' : mission.difficulty >= 4 ? '✦' : '⊕';
      const selected = this.selectedMissionId === mission.id;

      const nodeColor = completed ? '#4a9e4a' : theme.color;
      const size = mission.difficulty >= 4 ? 62 : mission.difficulty >= 3 ? 54 : 48;

      return `
        <div class="cm-node" data-mission="${mission.id}" style="
          position:absolute;
          left:${node.x}%;top:${node.y}%;
          width:${size}px;height:${size}px;
          transform:translate(-50%,-50%);
          border-radius:${isSpaceHulk ? '4px' : '50%'};
          border:${selected ? `2px solid ${nodeColor}` : `1px solid ${nodeColor}60`};
          background:radial-gradient(circle,${nodeColor}${selected ? '28' : '14'} 0%,transparent 70%);
          box-shadow:0 0 ${selected ? '24px' : '12px'} ${nodeColor}${selected ? '60' : '30'};
          ${!completed ? `animation:cm-node-pulse ${2.5 + idx * 0.3}s ease-in-out infinite;` : ''}
          display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
          cursor:pointer;user-select:none;
          animation-delay:${idx * 0.15}s;
          transition:box-shadow 0.2s,border-color 0.2s;
        ">
          ${!completed ? `
            <div class="cm-node-dot" style="background:${nodeColor};"></div>
            <div class="cm-node-dot" style="background:${nodeColor};animation-delay:-1.33s;"></div>
            <div class="cm-node-dot" style="background:${nodeColor};animation-delay:-2.66s;"></div>
          ` : `
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
              font-size:${size * 0.4}px;color:${nodeColor}40;pointer-events:none;">✦</div>
          `}
          <div style="position:relative;z-index:1;font-size:${size >= 54 ? '14' : '12'}px;color:${nodeColor};line-height:1;">${symbol}</div>
          <div style="position:relative;z-index:1;font-family:'Teko',sans-serif;font-size:9px;
            color:${nodeColor}cc;letter-spacing:1px;text-align:center;line-height:1.2;
            max-width:${size + 60}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${mission.name.toUpperCase()}
          </div>
          <div style="position:relative;z-index:1;display:flex;gap:2px;margin-top:1px;">
            ${[1,2,3].map(d => `<div style="width:8px;height:2px;
              background:${d <= mission.difficulty ? nodeColor : nodeColor + '20'};"></div>`).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  private showModal(missionId: string): void {
    const modal = this.container?.querySelector('#cm-modal') as HTMLElement | null;
    const mapEl = this.container?.querySelector('#cm-map') as HTMLElement | null;
    if (!modal || !mapEl) return;

    const mission = MISSIONS.find(m => m.id === missionId);
    if (!mission) return;

    this.selectedMissionId = missionId;
    this.renderNodes();

    const state = getPlayerState();
    const completed = state.completedMissions.has(missionId);
    modal.innerHTML = this.buildMissionModal(mission, completed);
    modal.style.display = 'block';

    // Position modal near the node, but keep it on-screen
    const node = CAMPAIGN_NODES.find(n => n.missionId === missionId);
    if (node) {
      const mapRect = mapEl.getBoundingClientRect();
      const mapW = mapRect.width || window.innerWidth;
      const mapH = mapRect.height || (window.innerHeight - 50);

      const nodeXpx = (node.x / 100) * mapW;
      const nodeYpx = (node.y / 100) * mapH;

      const modalW = 340;
      const gap = 20;

      // Horizontal: prefer right, flip left if near right edge
      let left = nodeXpx + gap;
      if (left + modalW > mapW - 20) left = nodeXpx - modalW - gap;
      left = Math.max(10, Math.min(left, mapW - modalW - 10));

      // Vertical: prefer center-aligned to node, shift up if near bottom
      let top = nodeYpx - 80;
      const approxH = completed ? 560 : 440;
      if (top + approxH > mapH - 20) top = mapH - approxH - 20;
      top = Math.max(10, top);

      modal.style.left = `${left}px`;
      modal.style.top = `${top}px`;
    }

    this.wireModalEvents(mission, completed);
  }

  private hideModal(): void {
    const modal = this.container?.querySelector('#cm-modal') as HTMLElement | null;
    if (modal) modal.style.display = 'none';
    this.selectedMissionId = null;
    this.renderNodes();
  }

  private wireModalEvents(mission: MissionDefinition, completed: boolean): void {
    const modal = this.container?.querySelector('#cm-modal');
    if (!modal) return;

    // Close button
    modal.querySelector('#cm-modal-close')?.addEventListener('click', e => {
      e.stopPropagation();
      this.hideModal();
    });

    // Deploy button
    const deployBtn = modal.querySelector('#ms-deploy-btn') as HTMLElement | null;
    if (deployBtn) {
      deployBtn.addEventListener('mouseenter', () => {
        deployBtn.style.background = 'linear-gradient(180deg,rgba(200,152,42,0.25) 0%,rgba(200,152,42,0.1) 100%)';
        deployBtn.style.borderColor = 'rgba(200,152,42,0.7)';
        deployBtn.style.letterSpacing = '10px';
      });
      deployBtn.addEventListener('mouseleave', () => {
        deployBtn.style.background = 'linear-gradient(180deg,rgba(200,152,42,0.12) 0%,rgba(200,152,42,0.04) 100%)';
        deployBtn.style.borderColor = 'rgba(200,152,42,0.4)';
        deployBtn.style.letterSpacing = '6px';
      });
      deployBtn.addEventListener('click', () => {
        getSceneManager().start('DropSiteScene', { mission });
      });
    }

    // Skull modifier toggles
    if (completed) {
      modal.querySelectorAll('.ms-skull-btn').forEach(el => {
        const modId = (el as HTMLElement).dataset.mod || '';
        el.addEventListener('click', () => {
          toggleModifier(modId);
          savePlayerState();
          // Re-render modal in place
          const state = getPlayerState();
          const isCompleted = state.completedMissions.has(mission.id);
          (this.container?.querySelector('#cm-modal') as HTMLElement).innerHTML =
            this.buildMissionModal(mission, isCompleted);
          this.wireModalEvents(mission, isCompleted);
        });
      });
    }
  }

  private wireEvents(): void {
    if (!this.container) return;
    const state = getPlayerState();

    // Render nodes after DOM is ready
    this.renderNodes();

    // Node clicks
    this.container.querySelector('#cm-nodes')?.addEventListener('click', e => {
      const target = (e.target as HTMLElement).closest('.cm-node') as HTMLElement | null;
      if (target?.dataset.mission) {
        if (this.selectedMissionId === target.dataset.mission) {
          this.hideModal();
        } else {
          this.showModal(target.dataset.mission);
        }
      }
    });

    // Click outside modal to close
    this.container.querySelector('#cm-map')?.addEventListener('click', e => {
      const modal = this.container?.querySelector('#cm-modal') as HTMLElement | null;
      const target = e.target as HTMLElement;
      if (modal && modal.style.display !== 'none' &&
          !modal.contains(target) && !target.closest('.cm-node')) {
        this.hideModal();
      }
    });

    // Deck selector
    this.container.querySelectorAll('.ms-deck-btn').forEach(el => {
      const deckIdx = parseInt((el as HTMLElement).dataset.deck || '0');
      el.addEventListener('click', () => {
        state.selectedDeckIndex = deckIdx;
        this.shutdown();
        this.create();
      });
    });

    // Edit Decks
    this.container.querySelector('#ms-edit-decks')?.addEventListener('click', () => {
      getSceneManager().start('DeckEditScene');
    });

    // Command dropdown
    const commandBtn = this.container.querySelector('#ms-command-btn') as HTMLElement | null;
    const dropdown = this.container.querySelector('#ms-command-dropdown') as HTMLElement | null;
    if (commandBtn && dropdown) {
      commandBtn.addEventListener('click', e => {
        e.stopPropagation();
        this.commandDropdownOpen = !this.commandDropdownOpen;
        dropdown.style.display = this.commandDropdownOpen ? 'block' : 'none';
      });
      // Close dropdown on outside click
      document.addEventListener('click', this._closeDropdown);
    }

    // Command dropdown items
    this.container.querySelectorAll('.ms-cmd-item').forEach(el => {
      const scene = (el as HTMLElement).dataset.scene || '';
      el.addEventListener('mouseenter', () => {
        (el as HTMLElement).style.background = 'rgba(90,122,138,0.1)';
        (el as HTMLElement).style.color = '#7a9aaa';
      });
      el.addEventListener('mouseleave', () => {
        (el as HTMLElement).style.background = 'transparent';
        (el as HTMLElement).style.color = '#5a7a8a';
      });
      el.addEventListener('click', () => {
        if (scene) getSceneManager().start(scene);
      });
    });

    // Mutator picker toggle buttons
    this.container.querySelectorAll('.cm-mutator-btn').forEach(el => {
      const modId = (el as HTMLElement).dataset.mod as EnvironmentModifier;
      el.addEventListener('click', () => {
        if (this.playerMutators.has(modId)) {
          this.playerMutators.delete(modId);
        } else {
          this.playerMutators.add(modId);
        }
        this.updateMutatorButtons();
      });
    });

    // Procedural mission generator panel
    this.container.querySelectorAll('.cm-proc-diff-btn').forEach(el => {
      const d = parseInt((el as HTMLElement).dataset.diff || '2');
      el.addEventListener('click', () => {
        this.procDifficulty = d;
        this.updateProcDiffButtons();
      });
    });

    this.container.querySelector('#cm-proc-reroll')?.addEventListener('click', () => {
      this.procSeedStr = generateSeedString();
      const seedInput = this.container?.querySelector('#cm-proc-seed') as HTMLInputElement | null;
      if (seedInput) seedInput.value = this.procSeedStr;
    });

    this.container.querySelector('#cm-proc-seed')?.addEventListener('input', (e) => {
      this.procSeedStr = ((e.target as HTMLInputElement).value || '').toUpperCase().slice(0, 6);
    });

    this.container.querySelector('#cm-proc-generate')?.addEventListener('click', () => {
      const seedInput = this.container?.querySelector('#cm-proc-seed') as HTMLInputElement | null;
      if (seedInput) this.procSeedStr = seedInput.value.toUpperCase().slice(0, 6);
      const seed = parseSeedString(this.procSeedStr);
      const state = getPlayerState();
      // Merge skull modifiers + player-toggled mutators
      const allModifiers = [...(state.activeModifiers || []), ...Array.from(this.playerMutators)];
      const mission = generateMission(this.procDifficulty, seed, allModifiers);
      getSceneManager().start('DropSiteScene', { mission });
    });

    // Hover effects on proc generate button
    const procGen = this.container.querySelector('#cm-proc-generate') as HTMLElement | null;
    if (procGen) {
      procGen.addEventListener('mouseenter', () => {
        procGen.style.background = 'linear-gradient(180deg,rgba(200,152,42,0.25) 0%,rgba(200,152,42,0.1) 100%)';
        procGen.style.borderColor = 'rgba(200,152,42,0.7)';
      });
      procGen.addEventListener('mouseleave', () => {
        procGen.style.background = 'linear-gradient(180deg,rgba(200,152,42,0.12) 0%,rgba(200,152,42,0.04) 100%)';
        procGen.style.borderColor = 'rgba(200,152,42,0.4)';
      });
    }

    // Hover effects on top bar buttons
    ['#ms-edit-decks', '#ms-command-btn'].forEach(sel => {
      const btn = this.container?.querySelector(sel) as HTMLElement | null;
      if (btn) {
        btn.addEventListener('mouseenter', () => {
          btn.style.borderColor = 'rgba(90,122,138,0.6)';
          btn.style.color = '#7a9aaa';
        });
        btn.addEventListener('mouseleave', () => {
          btn.style.borderColor = 'rgba(90,122,138,0.3)';
          btn.style.color = '#5a7a8a';
        });
      }
    });
  }

  private updateProcDiffButtons(): void {
    this.container?.querySelectorAll('.cm-proc-diff-btn').forEach(el => {
      const d = parseInt((el as HTMLElement).dataset.diff || '0');
      const selected = d === this.procDifficulty;
      (el as HTMLElement).style.background = selected ? 'rgba(200,152,42,0.15)' : 'rgba(200,191,160,0.03)';
      (el as HTMLElement).style.borderColor = selected ? 'rgba(200,152,42,0.5)' : 'rgba(200,191,160,0.1)';
      (el as HTMLElement).style.color = selected ? '#c8982a' : '#5a5a4a';
    });
  }

  private updateMutatorButtons(): void {
    this.container?.querySelectorAll('.cm-mutator-btn').forEach(el => {
      const modId = (el as HTMLElement).dataset.mod as EnvironmentModifier;
      const active = this.playerMutators.has(modId);
      (el as HTMLElement).style.background = active ? 'rgba(200,152,42,0.2)' : 'rgba(200,191,160,0.03)';
      (el as HTMLElement).style.borderColor = active ? 'rgba(200,152,42,0.6)' : 'rgba(200,191,160,0.1)';
      (el as HTMLElement).style.color = active ? '#c8982a' : '#5a5a4a';
      (el as HTMLElement).style.boxShadow = active ? '0 0 8px rgba(200,152,42,0.3),inset 0 0 6px rgba(200,152,42,0.1)' : 'none';
    });
  }

  private _closeDropdown = (): void => {
    this.commandDropdownOpen = false;
    const dropdown = this.container?.querySelector('#ms-command-dropdown') as HTMLElement | null;
    if (dropdown) dropdown.style.display = 'none';
  };

  shutdown(): void {
    document.removeEventListener('click', this._closeDropdown);
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
}
