import { MISSIONS } from '../missions/MissionDatabase';
import { MissionDefinition } from '../missions/MissionDefinition';
import { getPlayerState } from '../state/PlayerState';
import { GameSceneInterface, getSceneManager } from './SceneManager';

// Inject Google Fonts once
let fontsInjected = false;
function injectFonts(): void {
  if (fontsInjected) return;
  fontsInjected = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Teko:wght@400;500;600;700&family=Share+Tech+Mono&display=swap';
  document.head.appendChild(link);
}

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
    @keyframes ms-skull-fade {
      from { opacity: 0; transform: scale(0.8); }
      to { opacity: 0.04; transform: scale(1); }
    }
  `;
  document.head.appendChild(style);
}

const DIFF_THEMES: Record<number, { color: string; label: string; symbol: string }> = {
  1: { color: '#4a9e4a', label: 'STANDARD', symbol: 'I' },
  2: { color: '#c8982a', label: 'HAZARDOUS', symbol: 'II' },
  3: { color: '#c43030', label: 'EXTREMIS', symbol: 'III' },
};

const MAP_TYPE_LABELS: Record<string, string> = {
  outdoor: 'PLANETARY SURFACE',
  space_hulk: 'SPACE HULK',
};

/**
 * MissionSelectScene — Warhammer 40K military briefing-style mission selection.
 */
export class MissionSelectScene implements GameSceneInterface {
  id = 'MissionSelectScene';
  private container: HTMLDivElement | null = null;
  private selectedMissionIdx = 0;

  create(): void {
    injectFonts();
    injectStyles();
    const state = getPlayerState();

    // Ensure selected mission is not locked; fall back to first unlocked
    const selectedMission = MISSIONS[this.selectedMissionIdx];
    if (selectedMission && this.isMissionLocked(selectedMission, state)) {
      const firstUnlocked = MISSIONS.findIndex(m => !this.isMissionLocked(m, state));
      this.selectedMissionIdx = firstUnlocked >= 0 ? firstUnlocked : 0;
    }

    this.container = document.createElement('div');
    this.container.id = 'mission-select-ui';
    Object.assign(this.container.style, {
      position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
      zIndex: '10', overflow: 'hidden',
      fontFamily: '"Share Tech Mono", monospace',
      color: '#c8bfa0',
      // Deep military dark with a warm undertone
      background: 'linear-gradient(160deg, #0a0a0e 0%, #12100c 40%, #0e0c08 100%)',
    });

    // Build the full layout
    this.container.innerHTML = this.buildLayout(state);
    document.getElementById('game-container')!.appendChild(this.container);

    // Wire up interactivity after DOM is in place
    this.wireEvents(state);
  }

  private buildLayout(state: ReturnType<typeof getPlayerState>): string {
    const missions = MISSIONS;
    const selectedMission = missions[this.selectedMissionIdx];
    const completed = state.completedMissions.has(selectedMission.id);
    const theme = DIFF_THEMES[selectedMission.difficulty] || DIFF_THEMES[1];

    return `
      <!-- Atmospheric background layers -->
      <div style="position:absolute;inset:0;pointer-events:none;overflow:hidden;">
        <!-- Diagonal hazard stripes -->
        <div style="position:absolute;inset:0;opacity:0.018;
          background:repeating-linear-gradient(45deg,transparent,transparent 18px,#c8982a 18px,#c8982a 20px);
          animation:ms-stripe-scroll 4s linear infinite;"></div>
        <!-- Scanline -->
        <div style="position:absolute;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,rgba(200,191,160,0.06),transparent);
          animation:ms-scanline 8s linear infinite;"></div>
        <!-- Vignette -->
        <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,0.7) 100%);"></div>
        <!-- Corner aquila decoration -->
        <div style="position:absolute;top:20px;right:24px;font-size:48px;opacity:0.04;
          font-family:'Teko',sans-serif;letter-spacing:6px;color:#c8982a;
          animation:ms-skull-fade 1.5s ease-out forwards;">+ AQUILA +</div>
      </div>

      <!-- Top bar -->
      <div style="position:relative;display:flex;align-items:center;justify-content:space-between;
        padding:16px 32px;border-bottom:1px solid rgba(200,152,42,0.15);
        background:linear-gradient(180deg,rgba(200,152,42,0.04) 0%,transparent 100%);">
        <div style="display:flex;align-items:center;gap:16px;">
          <div style="width:3px;height:28px;background:#c8982a;"></div>
          <div>
            <div style="font-family:'Teko',sans-serif;font-size:14px;font-weight:500;
              color:rgba(200,152,42,0.5);letter-spacing:4px;">IMPERIAL COMMAND // STRATEGOS TERMINAL</div>
          </div>
        </div>
        <div style="display:flex;gap:12px;align-items:center;">
          ${this.buildDeckSelector(state)}
          <button id="ms-edit-decks" style="padding:6px 14px;background:transparent;
            color:#5a7a8a;border:1px solid rgba(90,122,138,0.3);font-family:'Share Tech Mono',monospace;
            font-size:11px;cursor:pointer;letter-spacing:1px;transition:all 0.2s;">EDIT DECKS</button>
          <button id="ms-tech-trees" style="padding:6px 14px;background:transparent;
            color:#5a7a8a;border:1px solid rgba(90,122,138,0.3);font-family:'Share Tech Mono',monospace;
            font-size:11px;cursor:pointer;letter-spacing:1px;transition:all 0.2s;">TECH TREES</button>
          <button id="ms-supply-depot" style="padding:6px 14px;background:transparent;
            color:#5a7a8a;border:1px solid rgba(90,122,138,0.3);font-family:'Share Tech Mono',monospace;
            font-size:11px;cursor:pointer;letter-spacing:1px;transition:all 0.2s;">SUPPLY DEPOT</button>
        </div>
      </div>

      <!-- Main content -->
      <div style="position:relative;display:flex;flex:1;overflow:hidden;">

        <!-- Left: Mission list -->
        <div style="width:340px;flex-shrink:0;border-right:1px solid rgba(200,152,42,0.1);
          display:flex;flex-direction:column;overflow-y:auto;">
          <div style="padding:20px 24px 12px;border-bottom:1px solid rgba(200,152,42,0.08);">
            <div style="font-family:'Teko',sans-serif;font-size:13px;font-weight:500;
              color:rgba(200,152,42,0.4);letter-spacing:3px;animation:ms-flicker 6s infinite;">
              MISSION DOSSIERS // ${missions.length} AVAILABLE</div>
          </div>
          <div id="ms-mission-list" style="flex:1;overflow-y:auto;">
            ${missions.map((m, i) => this.buildMissionListItem(m, i, state)).join('')}
          </div>
        </div>

        <!-- Right: Selected mission detail -->
        <div style="flex:1;display:flex;flex-direction:column;overflow-y:auto;position:relative;">
          <!-- Header -->
          <div style="padding:32px 40px 0;">
            <div style="font-family:'Teko',sans-serif;font-size:56px;font-weight:700;
              color:#e8dcc0;letter-spacing:8px;line-height:1;
              animation:ms-header-in 0.6s ease-out;">${selectedMission.name.toUpperCase()}</div>

            <!-- Threat level bar -->
            <div style="display:flex;align-items:center;gap:16px;margin-top:16px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <div style="font-size:10px;letter-spacing:2px;color:rgba(200,191,160,0.4);">THREAT LEVEL</div>
                <div style="display:flex;gap:3px;">
                  ${[1, 2, 3].map(d => `<div style="width:24px;height:6px;
                    background:${d <= selectedMission.difficulty ? theme.color : 'rgba(200,191,160,0.08)'};
                    ${d <= selectedMission.difficulty ? `box-shadow:0 0 8px ${theme.color}40;` : ''}
                    transition:all 0.3s;"></div>`).join('')}
                </div>
                <div style="font-size:10px;letter-spacing:2px;color:${theme.color};font-weight:bold;">${theme.label}</div>
              </div>
              <div style="width:1px;height:16px;background:rgba(200,191,160,0.1);"></div>
              <div style="font-size:10px;letter-spacing:2px;color:rgba(200,191,160,0.4);">
                ${MAP_TYPE_LABELS[selectedMission.terrain?.mapType || 'outdoor'] || 'PLANETARY SURFACE'}</div>
              ${completed ? `<div style="display:flex;align-items:center;gap:6px;margin-left:auto;">
                <div style="width:8px;height:8px;background:#4a9e4a;border-radius:50%;box-shadow:0 0 6px #4a9e4a80;"></div>
                <div style="font-size:10px;letter-spacing:2px;color:#4a9e4a;">VICTORY CONFIRMED</div>
              </div>` : ''}
            </div>

            <!-- Divider with trace animation -->
            <div style="position:relative;height:1px;margin-top:20px;background:rgba(200,152,42,0.06);">
              <div style="position:absolute;inset:0;background:linear-gradient(90deg,${theme.color},transparent);
                animation:ms-border-trace 1s ease-out forwards;opacity:0.3;"></div>
            </div>
          </div>

          <!-- Description + Objectives -->
          <div style="padding:24px 40px;display:flex;gap:40px;flex:1;">
            <!-- Left column: briefing -->
            <div style="flex:1;">
              <div style="font-size:10px;letter-spacing:3px;color:rgba(200,152,42,0.4);margin-bottom:10px;">
                MISSION BRIEFING</div>
              <p style="color:#a09880;font-size:13px;line-height:1.8;margin:0;">${selectedMission.description}</p>

              <!-- Mission stats -->
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:28px;">
                ${this.buildStatBox('STARTING REQUISITION', `${selectedMission.startingGold} REQ`, '#c8982a')}
                ${this.buildStatBox('OBJECTIVES', `${selectedMission.objectives.length}`, theme.color)}
                ${this.buildStatBox('ENEMY POSITIONS', `${selectedMission.enemyCamps.length}`, '#c43030')}
                ${this.buildStatBox('SUPPLY INTERVAL', `${Math.round(selectedMission.supplyDropIntervalMs / 1000)}s`, '#5a7a8a')}
              </div>
            </div>

            <!-- Right column: objectives -->
            <div style="width:280px;flex-shrink:0;">
              <div style="font-size:10px;letter-spacing:3px;color:rgba(200,152,42,0.4);margin-bottom:14px;">
                TACTICAL OBJECTIVES</div>
              <div style="display:flex;flex-direction:column;gap:10px;">
                ${selectedMission.objectives.map((obj, i) => `
                  <div style="padding:12px 14px;background:rgba(200,152,42,0.03);
                    border-left:2px solid ${theme.color}40;position:relative;
                    animation:ms-card-in 0.4s ease-out ${0.2 + i * 0.1}s both;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                      <div style="font-size:9px;letter-spacing:1px;color:${theme.color};
                        background:${theme.color}15;padding:1px 6px;">${obj.type.toUpperCase()}</div>
                      <div style="font-size:9px;color:rgba(200,191,160,0.3);">+${obj.goldReward} REQ</div>
                    </div>
                    <div style="font-family:'Teko',sans-serif;font-size:16px;font-weight:500;
                      color:#c8bfa0;letter-spacing:1px;">${obj.name}</div>
                    <div style="font-size:10px;color:rgba(200,191,160,0.4);line-height:1.5;margin-top:2px;">
                      ${obj.description}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <!-- Deploy bar -->
          <div style="padding:20px 40px 28px;border-top:1px solid rgba(200,152,42,0.08);
            display:flex;align-items:center;justify-content:space-between;
            background:linear-gradient(180deg,transparent,rgba(200,152,42,0.02));">
            <div style="font-size:10px;color:rgba(200,191,160,0.3);letter-spacing:2px;">
              AWAITING DEPLOYMENT ORDER // CLICK TO PROCEED</div>
            <button id="ms-deploy-btn" style="
              position:relative;overflow:hidden;
              padding:14px 56px;
              background:linear-gradient(180deg,rgba(200,152,42,0.12) 0%,rgba(200,152,42,0.04) 100%);
              color:#c8982a;
              border:1px solid rgba(200,152,42,0.4);
              font-family:'Teko',sans-serif;font-size:22px;font-weight:600;
              letter-spacing:6px;cursor:pointer;
              transition:all 0.25s;
              animation:ms-glow-pulse 3s ease-in-out infinite;
              --ms-accent:rgba(200,152,42,0.3);
            ">DEPLOY</button>
          </div>
        </div>
      </div>
    `;
  }

  private isMissionLocked(mission: MissionDefinition, state: ReturnType<typeof getPlayerState>): boolean {
    const completedCount = state.completedMissions.size;
    if (mission.difficulty === 2 && completedCount < 1) return true;
    if (mission.difficulty === 3 && completedCount < 2) return true;
    return false;
  }

  private getLockRequirement(mission: MissionDefinition): string {
    if (mission.difficulty === 2) return 'COMPLETE 1 MISSION TO UNLOCK';
    if (mission.difficulty === 3) return 'COMPLETE 2 MISSIONS TO UNLOCK';
    return '';
  }

  private buildMissionListItem(mission: MissionDefinition, index: number, state: ReturnType<typeof getPlayerState>): string {
    const selected = index === this.selectedMissionIdx;
    const completed = state.completedMissions.has(mission.id);
    const theme = DIFF_THEMES[mission.difficulty] || DIFF_THEMES[1];
    const locked = this.isMissionLocked(mission, state);

    return `
      <div class="ms-mission-item" data-idx="${index}" data-locked="${locked}" style="
        padding:16px 24px;cursor:${locked ? 'default' : 'pointer'};position:relative;
        border-bottom:1px solid rgba(200,152,42,0.05);
        background:${selected && !locked ? 'rgba(200,152,42,0.06)' : 'transparent'};
        border-left:${selected && !locked ? `3px solid ${theme.color}` : '3px solid transparent'};
        opacity:${locked ? '0.4' : '1'};
        pointer-events:${locked ? 'none' : 'auto'};
        transition:all 0.2s;
        animation:ms-card-in 0.3s ease-out ${index * 0.08}s both;
      ">
        <!-- Top row: number + name -->
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="font-family:'Teko',sans-serif;font-size:28px;font-weight:700;
            color:${selected && !locked ? theme.color : 'rgba(200,191,160,0.12)'};line-height:1;
            transition:color 0.2s;min-width:28px;">${String(index + 1).padStart(2, '0')}</div>
          <div style="flex:1;">
            <div style="font-family:'Teko',sans-serif;font-size:18px;font-weight:600;
              color:${selected && !locked ? '#e8dcc0' : '#6a6458'};letter-spacing:1px;
              transition:color 0.2s;">${mission.name.toUpperCase()}</div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:2px;">
              <div style="display:flex;gap:2px;">
                ${[1, 2, 3].map(d => `<div style="width:12px;height:3px;
                  background:${d <= mission.difficulty ? theme.color + (selected && !locked ? '' : '60') : 'rgba(200,191,160,0.06)'};
                  transition:all 0.2s;"></div>`).join('')}
              </div>
              <div style="font-size:9px;letter-spacing:1px;color:${selected && !locked ? theme.color : 'rgba(200,191,160,0.2)'};">
                ${theme.symbol}</div>
              ${completed ? `<div style="font-size:9px;color:#4a9e4a60;letter-spacing:1px;">COMPLETE</div>` : ''}
              ${locked ? `<div style="font-size:9px;color:#c43030;letter-spacing:1px;font-weight:bold;">LOCKED</div>` : ''}
            </div>
            ${locked ? `<div style="font-size:8px;color:#c43030;letter-spacing:1px;margin-top:4px;opacity:0.7;">
              ${this.getLockRequirement(mission)}</div>` : ''}
          </div>
        </div>
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

  private buildStatBox(label: string, value: string, color: string): string {
    return `
      <div style="padding:10px 12px;background:rgba(200,191,160,0.02);
        border-left:2px solid ${color}30;">
        <div style="font-size:9px;letter-spacing:2px;color:rgba(200,191,160,0.3);margin-bottom:4px;">
          ${label}</div>
        <div style="font-family:'Teko',sans-serif;font-size:22px;font-weight:600;
          color:${color};letter-spacing:1px;">${value}</div>
      </div>
    `;
  }

  private wireEvents(state: ReturnType<typeof getPlayerState>): void {
    if (!this.container) return;

    // Mission list items
    this.container.querySelectorAll('.ms-mission-item').forEach(el => {
      const idx = parseInt((el as HTMLElement).dataset.idx || '0');
      const locked = (el as HTMLElement).dataset.locked === 'true';
      if (locked) return; // Skip locked missions
      el.addEventListener('click', () => {
        this.selectedMissionIdx = idx;
        this.shutdown();
        this.create();
      });
      el.addEventListener('mouseenter', () => {
        if (idx !== this.selectedMissionIdx) {
          (el as HTMLElement).style.background = 'rgba(200,152,42,0.03)';
        }
      });
      el.addEventListener('mouseleave', () => {
        if (idx !== this.selectedMissionIdx) {
          (el as HTMLElement).style.background = 'transparent';
        }
      });
    });

    // Deploy
    const deployBtn = this.container.querySelector('#ms-deploy-btn');
    if (deployBtn) {
      deployBtn.addEventListener('mouseenter', () => {
        (deployBtn as HTMLElement).style.background = 'linear-gradient(180deg,rgba(200,152,42,0.25) 0%,rgba(200,152,42,0.1) 100%)';
        (deployBtn as HTMLElement).style.borderColor = 'rgba(200,152,42,0.7)';
        (deployBtn as HTMLElement).style.letterSpacing = '10px';
      });
      deployBtn.addEventListener('mouseleave', () => {
        (deployBtn as HTMLElement).style.background = 'linear-gradient(180deg,rgba(200,152,42,0.12) 0%,rgba(200,152,42,0.04) 100%)';
        (deployBtn as HTMLElement).style.borderColor = 'rgba(200,152,42,0.4)';
        (deployBtn as HTMLElement).style.letterSpacing = '6px';
      });
      deployBtn.addEventListener('click', () => {
        const mission = MISSIONS[this.selectedMissionIdx];
        getSceneManager().start('DropSiteScene', { mission });
      });
    }

    // Deck selector
    this.container.querySelectorAll('.ms-deck-btn').forEach(el => {
      const deckIdx = parseInt((el as HTMLElement).dataset.deck || '0');
      el.addEventListener('click', () => {
        state.selectedDeckIndex = deckIdx;
        this.shutdown();
        this.create();
      });
    });

    // Edit Decks / Tech Trees
    this.container.querySelector('#ms-edit-decks')?.addEventListener('click', () => {
      getSceneManager().start('DeckEditScene');
    });
    this.container.querySelector('#ms-tech-trees')?.addEventListener('click', () => {
      getSceneManager().start('TechTreeScene');
    });
    this.container.querySelector('#ms-supply-depot')?.addEventListener('click', () => {
      getSceneManager().start('ShopScene');
    });

    // Hover effects on utility buttons
    ['#ms-edit-decks', '#ms-tech-trees', '#ms-supply-depot'].forEach(sel => {
      const btn = this.container?.querySelector(sel) as HTMLElement | null;
      if (btn) {
        btn.addEventListener('mouseenter', () => { btn.style.borderColor = 'rgba(90,122,138,0.6)'; btn.style.color = '#7a9aaa'; });
        btn.addEventListener('mouseleave', () => { btn.style.borderColor = 'rgba(90,122,138,0.3)'; btn.style.color = '#5a7a8a'; });
      }
    });
  }

  shutdown(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
}
