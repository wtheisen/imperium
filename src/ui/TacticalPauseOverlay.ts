import { EventBus } from '../EventBus';

/**
 * Fullscreen overlay shown during tactical pause (planning mode).
 * Displays "TACTICAL PAUSE" text, queued order count, and a hint to resume.
 */
export class TacticalPauseOverlay {
  private overlay: HTMLDivElement | null = null;
  private queueCountEl: HTMLElement | null = null;

  show(): void {
    if (this.overlay) return;
    this.overlay = document.createElement('div');
    Object.assign(this.overlay.style, {
      position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
      background: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: '9999', pointerEvents: 'none',
    });

    const frame = document.createElement('div');
    Object.assign(frame.style, {
      position: 'absolute', inset: '0',
      border: '2px solid rgba(200,152,42,0.2)',
      animation: 'tactical-pause-border-pulse 2s ease-in-out infinite',
      pointerEvents: 'none',
    });
    this.overlay.appendChild(frame);

    const text = document.createElement('div');
    Object.assign(text.style, {
      fontFamily: 'Teko, sans-serif', fontSize: '96px', color: '#c8982a',
      letterSpacing: '12px', textTransform: 'uppercase',
      textShadow: '0 0 30px rgba(200,152,42,0.4), 0 0 60px rgba(200,152,42,0.15)',
      animation: 'tactical-pause-text-pulse 2s ease-in-out infinite',
    });
    text.textContent = 'TACTICAL PAUSE';

    const subtitle = document.createElement('div');
    Object.assign(subtitle.style, {
      fontFamily: 'Share Tech Mono, monospace', fontSize: '16px', color: 'rgba(200,152,42,0.6)',
      letterSpacing: '3px', marginTop: '8px', textAlign: 'center',
    });
    subtitle.textContent = 'PLANNING MODE — ISSUE ORDERS';

    const queueCount = document.createElement('div');
    Object.assign(queueCount.style, {
      fontFamily: 'Share Tech Mono, monospace', fontSize: '13px', color: 'rgba(200,191,160,0.4)',
      letterSpacing: '2px', marginTop: '16px', textAlign: 'center',
      transition: 'color 0.2s',
    });
    queueCount.textContent = 'QUEUED ORDERS: 0';
    this.queueCountEl = queueCount;

    const hint = document.createElement('div');
    Object.assign(hint.style, {
      fontFamily: 'Share Tech Mono, monospace', fontSize: '12px', color: 'rgba(200,191,160,0.25)',
      letterSpacing: '2px', marginTop: '20px', textAlign: 'center',
    });
    hint.textContent = 'PRESS P TO EXECUTE & RESUME';

    const wrapper = document.createElement('div');
    wrapper.style.textAlign = 'center';
    wrapper.appendChild(text);
    wrapper.appendChild(subtitle);
    wrapper.appendChild(queueCount);
    wrapper.appendChild(hint);
    this.overlay.appendChild(wrapper);

    if (!document.getElementById('tactical-pause-styles')) {
      const style = document.createElement('style');
      style.id = 'tactical-pause-styles';
      style.textContent = `
        @keyframes tactical-pause-text-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes tactical-pause-border-pulse {
          0%, 100% { border-color: rgba(200,152,42,0.15); }
          50% { border-color: rgba(200,152,42,0.35); }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(this.overlay);
    EventBus.on('tactical-queue-changed', this.updateQueueCount, this);
  }

  hide(): void {
    EventBus.off('tactical-queue-changed', this.updateQueueCount, this);
    this.queueCountEl = null;
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  updateQueueCount = (data: { count: number }): void => {
    if (this.queueCountEl) {
      this.queueCountEl.textContent = `QUEUED ORDERS: ${data.count}`;
      this.queueCountEl.style.color = data.count > 0 ? 'rgba(200,152,42,0.7)' : 'rgba(200,191,160,0.4)';
    }
  };

  destroy(): void {
    this.hide();
  }
}
