import { EventBus } from '../EventBus';
import { MissionDefinition, ObjectiveDefinition } from '../missions/MissionDefinition';

const TYPE_BADGES: Record<string, { label: string; color: string }> = {
  destroy: { label: 'DESTROY', color: '#c43030' },
  recover: { label: 'RECOVER', color: '#c8982a' },
  purge:   { label: 'PURGE',   color: '#a070cc' },
};

export class ObjectiveDisplay {
  private container: HTMLDivElement;
  private objectiveRows: Map<string, HTMLDivElement> = new Map();
  private completedIds: Set<string> = new Set();
  private mission: MissionDefinition;
  private boundOnComplete: (data: { objectiveId: string }) => void;

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

    for (const obj of mission.objectives) {
      const row = this.createRow(obj);
      this.container.appendChild(row);
      this.objectiveRows.set(obj.id, row);
    }

    document.body.appendChild(this.container);

    this.boundOnComplete = (data) => this.markComplete(data.objectiveId);
    EventBus.on('objective-completed', this.boundOnComplete);
  }

  private createRow(obj: ObjectiveDefinition): HTMLDivElement {
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

    const status = row.querySelector('.obj-status') as HTMLElement | null;
    if (status) {
      status.textContent = '\u2713';
      status.style.color = '#4a9e4a';
      status.style.borderColor = 'rgba(74,158,74,0.3)';
      status.style.background = 'rgba(74,158,74,0.08)';
    }
  }

  update(): void {}

  destroy(): void {
    EventBus.off('objective-completed', this.boundOnComplete);
    this.container.remove();
    this.objectiveRows.clear();
    this.completedIds.clear();
  }
}
