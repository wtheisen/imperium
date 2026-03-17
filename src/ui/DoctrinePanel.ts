import { Card } from '../cards/Card';
import { EventBus } from '../EventBus';

const MAX_DOCTRINES = 3;

export class DoctrinePanel {
  private container: HTMLDivElement;
  private headerEl: HTMLDivElement;
  private slotsEl: HTMLDivElement;
  private doctrines: Card[] = [];

  constructor() {
    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position: 'absolute',
      top: '50px',
      left: '12px',
      width: '200px',
      zIndex: '100',
      pointerEvents: 'none',
      fontFamily: '"Share Tech Mono","Courier New",monospace',
    });
    this.container.id = 'doctrine-panel';

    this.headerEl = document.createElement('div');
    Object.assign(this.headerEl.style, {
      fontSize: '9px',
      letterSpacing: '2px',
      color: 'rgba(200,152,42,0.4)',
      marginBottom: '6px',
    });
    this.headerEl.textContent = 'ACTIVE DOCTRINES';
    this.container.appendChild(this.headerEl);

    this.slotsEl = document.createElement('div');
    this.container.appendChild(this.slotsEl);

    document.body.appendChild(this.container);

    EventBus.on('doctrines-changed', this.onDoctrinesChanged, this);
    this.render();
  }

  private onDoctrinesChanged = (data: { doctrines: Card[] }) => {
    this.doctrines = data.doctrines.slice(0, MAX_DOCTRINES);
    this.render();
  };

  private render(): void {
    this.slotsEl.innerHTML = '';

    if (this.doctrines.length === 0) {
      const empty = document.createElement('div');
      Object.assign(empty.style, {
        fontSize: '9px', color: 'rgba(200,191,160,0.15)',
        fontStyle: 'italic', padding: '4px 0',
      });
      empty.textContent = 'No doctrines active';
      this.slotsEl.appendChild(empty);
      return;
    }

    for (const doctrine of this.doctrines) {
      const card = document.createElement('div');
      Object.assign(card.style, {
        background: 'linear-gradient(135deg, rgba(10,10,14,0.85) 0%, rgba(18,16,10,0.82) 100%)',
        border: '1px solid rgba(200,152,42,0.12)',
        borderLeft: '2px solid rgba(200,152,42,0.35)',
        padding: '6px 8px',
        marginBottom: '3px',
        pointerEvents: 'auto',
      });

      const name = document.createElement('div');
      Object.assign(name.style, {
        fontFamily: "'Teko',sans-serif",
        fontSize: '14px',
        fontWeight: '600',
        color: '#c8982a',
        letterSpacing: '0.5px',
        lineHeight: '1.2',
      });
      name.textContent = doctrine.name;
      card.appendChild(name);

      const desc = document.createElement('div');
      Object.assign(desc.style, {
        fontSize: '9px',
        color: 'rgba(200,191,160,0.35)',
        marginTop: '2px',
        lineHeight: '1.3',
      });
      desc.textContent = doctrine.description;
      card.appendChild(desc);

      this.slotsEl.appendChild(card);
    }

    const remaining = MAX_DOCTRINES - this.doctrines.length;
    for (let i = 0; i < remaining; i++) {
      const slot = document.createElement('div');
      Object.assign(slot.style, {
        background: 'rgba(200,191,160,0.01)',
        border: '1px solid rgba(200,191,160,0.04)',
        borderLeft: '2px solid rgba(200,191,160,0.06)',
        padding: '6px 8px',
        marginBottom: '3px',
      });
      const label = document.createElement('div');
      Object.assign(label.style, {
        fontSize: '9px', color: 'rgba(200,191,160,0.1)',
        textAlign: 'center', letterSpacing: '1px',
      });
      label.textContent = '— empty —';
      slot.appendChild(label);
      this.slotsEl.appendChild(slot);
    }
  }

  update(): void {}

  destroy(): void {
    EventBus.off('doctrines-changed', this.onDoctrinesChanged, this);
    this.container.remove();
  }
}
