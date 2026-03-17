import { EventBus } from '../EventBus';
import { MissionDefinition, ObjectiveDefinition } from '../missions/MissionDefinition';

const TYPE_BADGES: Record<string, { label: string; color: string }> = {
  destroy:  { label: 'DESTROY',  color: '#c43030' },
  recover:  { label: 'RECOVER',  color: '#c8982a' },
  purge:    { label: 'PURGE',    color: '#a070cc' },
  survive:  { label: 'SURVIVE',  color: '#50b0b0' },
  activate: { label: 'ACTIVATE', color: '#60a0e0' },
  collect:  { label: 'COLLECT',  color: '#d0a040' },
};

export class ObjectiveDisplay {
  private container: HTMLDivElement;
  private objectiveRows: Map<string, HTMLDivElement> = new Map();
  private progressBars: Map<string, HTMLDivElement> = new Map();
  private completedIds: Set<string> = new Set();
  private mission: MissionDefinition;
  private extractionEl: HTMLDivElement | null = null;
  private boundOnComplete: (data: { objectiveId: string }) => void;
  private boundOnMissionUpdate: (data: any) => void;

  constructor(mission: MissionDefinition) {
    this.mission = mission;

    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position: 'absolute',
      top: '50px',
      right: '12px',
      width: '240px',
      background: 'linear-gradient(180deg,rgba(10,10,14,0.88) 0%,rgba(14,12,8,0.85) 100%)',
      border: '1px solid rgba(200,152,42,0.12)',
      borderTop: '2px solid rgba(200,152,42,0.25)',
      padding: '10px 12px',
      fontFamily: '"Share Tech Mono","Courier New",monospace',
      fontSize: '11px',
      color: '#c8bfa0',
      zIndex: '1000',
      pointerEvents: 'auto',
      userSelect: 'none',
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    } as CSSStyleDeclaration);

    // Header
    const header = document.createElement('div');
    Object.assign(header.style, {
      fontSize: '9px',
      letterSpacing: '2px',
      color: 'rgba(200,152,42,0.45)',
      marginBottom: '8px',
      paddingBottom: '6px',
      borderBottom: '1px solid rgba(200,152,42,0.08)',
    });
    header.textContent = 'TACTICAL OBJECTIVES';
    this.container.appendChild(header);

    // Environment modifiers display
    if (mission.environmentModifiers && mission.environmentModifiers.length > 0) {
      const modBar = document.createElement('div');
      Object.assign(modBar.style, {
        display: 'flex', gap: '4px', flexWrap: 'wrap',
        marginBottom: '8px', paddingBottom: '6px',
        borderBottom: '1px solid rgba(200,152,42,0.06)',
      });
      const modLabels: Record<string, string> = {
        dense_fog: 'DENSE FOG', ork_frenzy: 'ORK FRENZY',
        supply_shortage: 'NO SUPPLY', armored_advance: 'ARMORED',
        night_raid: 'NIGHT OPS',
      };
      const modColors: Record<string, string> = {
        dense_fog: '#6080a0', ork_frenzy: '#c43030',
        supply_shortage: '#c8982a', armored_advance: '#808080',
        night_raid: '#4060a0',
      };
      for (const mod of mission.environmentModifiers) {
        const tag = document.createElement('span');
        const color = modColors[mod] || '#888';
        Object.assign(tag.style, {
          fontSize: '7px', letterSpacing: '1px', color,
          background: `${color}15`, padding: '2px 5px',
          border: `1px solid ${color}30`,
        });
        tag.textContent = modLabels[mod] || mod.toUpperCase();
        modBar.appendChild(tag);
      }
      this.container.appendChild(modBar);
    }

    // Required objectives
    for (const obj of mission.objectives) {
      const row = this.createRow(obj, false);
      this.container.appendChild(row);
      this.objectiveRows.set(obj.id, row);
    }

    // Optional objectives
    if (mission.optionalObjectives && mission.optionalObjectives.length > 0) {
      const optHeader = document.createElement('div');
      Object.assign(optHeader.style, {
        fontSize: '8px', letterSpacing: '2px', color: 'rgba(200,152,42,0.3)',
        marginTop: '8px', marginBottom: '6px', paddingTop: '6px',
        borderTop: '1px solid rgba(200,152,42,0.06)',
      });
      optHeader.textContent = 'BONUS OBJECTIVES';
      this.container.appendChild(optHeader);

      for (const obj of mission.optionalObjectives) {
        const row = this.createRow(obj, true);
        this.container.appendChild(row);
        this.objectiveRows.set(obj.id, row);
      }
    }

    // Extraction countdown (hidden initially)
    this.extractionEl = document.createElement('div');
    Object.assign(this.extractionEl.style, {
      display: 'none',
      marginTop: '10px', paddingTop: '8px',
      borderTop: '2px solid rgba(74,158,74,0.3)',
      textAlign: 'center',
    });
    this.extractionEl.innerHTML = `
      <div style="font-size:9px;letter-spacing:2px;color:#4a9e4a;margin-bottom:4px;">EXTRACTION</div>
      <div class="extraction-timer" style="font-family:'Teko',sans-serif;font-size:28px;font-weight:700;color:#4a9e4a;line-height:1;"></div>
      <div style="font-size:8px;color:rgba(200,191,160,0.3);margin-top:2px;">RETURN TO DROP SHIP</div>
    `;
    this.container.appendChild(this.extractionEl);

    document.body.appendChild(this.container);

    this.boundOnComplete = (data) => this.markComplete(data.objectiveId);
    EventBus.on('objective-completed', this.boundOnComplete);

    this.boundOnMissionUpdate = (data) => this.onMissionUpdate(data);
    EventBus.on('mission-update', this.boundOnMissionUpdate);
  }

  private createRow(obj: ObjectiveDefinition, optional: boolean): HTMLDivElement {
    const row = document.createElement('div');
    const badge = TYPE_BADGES[obj.type] || TYPE_BADGES.destroy;
    Object.assign(row.style, {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '8px',
      padding: '6px 0',
      marginBottom: '2px',
      cursor: 'pointer',
      transition: 'background 0.15s',
      borderLeft: `2px solid ${badge.color}30`,
      paddingLeft: '8px',
      opacity: optional ? '0.7' : '1',
    });

    row.addEventListener('mouseenter', () => {
      row.style.background = 'rgba(200,152,42,0.04)';
    });
    row.addEventListener('mouseleave', () => {
      row.style.background = 'transparent';
    });

    row.addEventListener('click', () => {
      EventBus.emit('pan-to-objective', { tileX: obj.tileX, tileY: obj.tileY });
    });

    // Text block
    const textBlock = document.createElement('div');
    textBlock.style.flex = '1';

    // Type badge + name row
    const topRow = document.createElement('div');
    Object.assign(topRow.style, {
      display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px',
    });

    const typeBadge = document.createElement('span');
    Object.assign(typeBadge.style, {
      fontSize: '8px', letterSpacing: '1px', color: badge.color,
      background: `${badge.color}12`, padding: '1px 4px',
    });
    typeBadge.textContent = badge.label;
    topRow.appendChild(typeBadge);

    if (optional) {
      const bonusBadge = document.createElement('span');
      Object.assign(bonusBadge.style, {
        fontSize: '7px', letterSpacing: '1px', color: '#50b0b0',
        background: 'rgba(80,176,176,0.1)', padding: '1px 4px',
      });
      bonusBadge.textContent = 'BONUS';
      topRow.appendChild(bonusBadge);
    }

    const rewardEl = document.createElement('span');
    Object.assign(rewardEl.style, {
      fontSize: '8px', color: 'rgba(200,191,160,0.25)', letterSpacing: '1px',
    });
    rewardEl.textContent = `+${obj.goldReward}`;
    topRow.appendChild(rewardEl);

    textBlock.appendChild(topRow);

    const nameEl = document.createElement('div');
    nameEl.className = 'obj-name';
    Object.assign(nameEl.style, {
      fontFamily: "'Teko',sans-serif",
      fontSize: '15px',
      fontWeight: '600',
      color: '#d8cca8',
      letterSpacing: '0.5px',
      lineHeight: '1.2',
    });
    nameEl.textContent = obj.name;
    textBlock.appendChild(nameEl);

    const descEl = document.createElement('div');
    descEl.className = 'obj-desc';
    Object.assign(descEl.style, {
      fontSize: '9px',
      color: 'rgba(200,191,160,0.35)',
      marginTop: '1px',
      lineHeight: '1.4',
    });
    descEl.textContent = obj.description;
    textBlock.appendChild(descEl);

    // Progress bar for survive/activate/collect
    if (obj.type === 'survive' || obj.type === 'activate' || obj.type === 'collect') {
      const progressContainer = document.createElement('div');
      Object.assign(progressContainer.style, {
        marginTop: '4px', height: '3px',
        background: 'rgba(200,191,160,0.08)',
        borderRadius: '2px', overflow: 'hidden',
      });
      const progressFill = document.createElement('div');
      progressFill.className = 'progress-fill';
      Object.assign(progressFill.style, {
        height: '100%', width: '0%',
        background: badge.color, borderRadius: '2px',
        transition: 'width 0.3s ease',
      });
      progressContainer.appendChild(progressFill);
      textBlock.appendChild(progressContainer);
      this.progressBars.set(obj.id, progressFill);
    }

    row.appendChild(textBlock);

    // Status indicator
    const status = document.createElement('span');
    status.className = 'obj-status';
    Object.assign(status.style, {
      flexShrink: '0',
      width: '16px', height: '16px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '1px solid rgba(200,191,160,0.1)',
      fontSize: '10px',
      marginTop: '2px',
    });
    row.appendChild(status);

    return row;
  }

  private markComplete(objectiveId: string): void {
    if (this.completedIds.has(objectiveId)) return;
    this.completedIds.add(objectiveId);

    const row = this.objectiveRows.get(objectiveId);
    if (!row) return;

    row.style.borderLeftColor = 'rgba(74,158,74,0.4)';

    const nameEl = row.querySelector('.obj-name') as HTMLElement | null;
    const descEl = row.querySelector('.obj-desc') as HTMLElement | null;
    if (nameEl) {
      nameEl.style.textDecoration = 'line-through';
      nameEl.style.color = '#4a9e4a';
      nameEl.style.opacity = '0.7';
    }
    if (descEl) {
      descEl.style.textDecoration = 'line-through';
      descEl.style.opacity = '0.4';
    }

    // Fill progress bar to 100%
    const progressFill = this.progressBars.get(objectiveId);
    if (progressFill) {
      progressFill.style.width = '100%';
      progressFill.style.background = '#4a9e4a';
    }

    const status = row.querySelector('.obj-status') as HTMLElement | null;
    if (status) {
      status.textContent = '\u2713';
      status.style.color = '#4a9e4a';
      status.style.borderColor = 'rgba(74,158,74,0.3)';
      status.style.background = 'rgba(74,158,74,0.08)';
    }
  }

  private onMissionUpdate(data: any): void {
    // Update progress bars
    const allObjectives = [...(data.objectives || []), ...(data.optionalObjectives || [])];
    for (const obj of allObjectives) {
      if (obj.completed) continue;
      const progressFill = this.progressBars.get(obj.id);
      if (progressFill && obj.progressMax > 0) {
        const pct = Math.min(100, (obj.progress / obj.progressMax) * 100);
        progressFill.style.width = `${pct}%`;
      }
    }

    // Extraction display
    if (data.isExtracting && this.extractionEl) {
      this.extractionEl.style.display = 'block';
      const remaining = Math.max(0, data.extractionTimerMax - data.extractionTimer);
      const seconds = Math.ceil(remaining / 1000);
      const timerEl = this.extractionEl.querySelector('.extraction-timer') as HTMLElement;
      if (timerEl) {
        timerEl.textContent = `${seconds}s`;
        // Pulse when low
        if (seconds <= 10) {
          timerEl.style.color = seconds % 2 === 0 ? '#4a9e4a' : '#e8dcc0';
        }
      }
    }
  }

  update(): void {}

  destroy(): void {
    EventBus.off('objective-completed', this.boundOnComplete);
    EventBus.off('mission-update', this.boundOnMissionUpdate);
    this.container.remove();
    this.objectiveRows.clear();
    this.progressBars.clear();
    this.completedIds.clear();
  }
}
