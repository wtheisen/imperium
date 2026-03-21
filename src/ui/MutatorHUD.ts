import { EventBus } from '../EventBus';
import { EnvironmentModifier } from '../missions/MissionDefinition';
import { MODIFIER_META } from '../systems/EnvironmentModifierSystem';

/**
 * Compact HUD strip showing active environment mutators during gameplay.
 * Renders near the top-left of the screen below the doctrine panel.
 */
export class MutatorHUD {
  private container: HTMLDivElement;

  constructor() {
    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position: 'absolute',
      top: '110px',
      left: '10px',
      zIndex: '20',
      display: 'none',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: '4px',
      maxWidth: '200px',
    });
    document.body.appendChild(this.container);

    EventBus.on('active-mutators', this.onActiveMutators, this);
  }

  private onActiveMutators = ({ modifiers }: { modifiers: EnvironmentModifier[] }): void => {
    if (!modifiers || modifiers.length === 0) return;

    this.container.style.display = 'flex';
    this.container.innerHTML = '';

    for (const modId of modifiers) {
      const meta = MODIFIER_META.find(m => m.id === modId);
      if (!meta) continue;

      const badge = document.createElement('div');
      badge.title = `${meta.name}: ${meta.description}`;
      Object.assign(badge.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '3px',
        padding: '2px 6px',
        background: 'linear-gradient(180deg,rgba(14,12,8,0.9) 0%,rgba(10,10,14,0.9) 100%)',
        border: '1px solid rgba(200,152,42,0.3)',
        fontFamily: '"Share Tech Mono", monospace',
        fontSize: '9px',
        color: '#c8982a',
        letterSpacing: '1px',
        whiteSpace: 'nowrap',
      });
      badge.innerHTML = `<span style="font-size:12px;">${meta.icon}</span><span>${meta.name.toUpperCase()}</span>`;
      this.container.appendChild(badge);
    }
  };

  destroy(): void {
    EventBus.off('active-mutators', this.onActiveMutators, this);
    this.container.remove();
  }
}
