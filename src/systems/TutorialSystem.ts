import { EventBus } from '../EventBus';
import { getPlayerState } from '../state/PlayerState';

interface TutorialStep {
  event: string | null; // null = show on create (with delay)
  message: string;
  delay?: number; // ms delay before showing (for the initial step)
  filter?: (data: any) => boolean;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    event: null,
    message: 'SELECT A SERVITOR AND RIGHT-CLICK A GOLD MINE TO BEGIN GATHERING REQUISITION',
    delay: 2000,
  },
  {
    event: 'gold-gathered',
    message: 'PLAY CARDS FROM YOUR HAND USING KEYS 1-9. KEY 0 DRAWS A CARD (COSTS 3G).',
  },
  {
    event: 'card-played',
    message: 'RIGHT-CLICK TO MOVE UNITS. THEY AUTO-ATTACK NEARBY ENEMIES.',
  },
  {
    event: 'entity-died',
    message: 'DESTROY ENEMY CAMPS TO COMPLETE OBJECTIVES',
    filter: (data: any) => data?.entity?.team === 'enemy',
  },
  {
    event: 'objective-completed',
    message: 'COMPLETE ALL OBJECTIVES TO ACHIEVE VICTORY. THE EMPEROR PROTECTS.',
  },
];

const AUTO_DISMISS_MS = 8000;
const FADE_DURATION_MS = 300;

export class TutorialSystem {
  private disabled = false;
  private currentStepIndex = 0;
  private container: HTMLDivElement | null = null;
  private messageEl: HTMLDivElement | null = null;
  private dismissTimer: number | null = null;
  private fadeOutTimer: number | null = null;
  private delayTimer: number | null = null;
  private boundListeners: { event: string; fn: (...args: any[]) => void }[] = [];

  constructor() {
    if (getPlayerState().completedMissions.size > 0) {
      this.disabled = true;
      return;
    }

    this.createOverlay();
    this.scheduleStep(0);
  }

  private createOverlay(): void {
    const container = document.createElement('div');
    container.id = 'tutorial-tooltip';
    container.style.cssText = `
      position: fixed;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      max-width: 400px;
      padding: 16px 20px 12px 24px;
      background: rgba(10,10,14,0.92);
      border: 1px solid rgba(200,152,42,0.4);
      border-left: 3px solid #c8982a;
      font-family: 'Share Tech Mono', monospace;
      color: #c8bfa0;
      font-size: 13px;
      line-height: 1.5;
      letter-spacing: 1px;
      pointer-events: auto;
      cursor: pointer;
      opacity: 0;
      transition: opacity ${FADE_DURATION_MS}ms ease;
      display: none;
      box-shadow: 0 4px 20px rgba(0,0,0,0.6);
    `;

    const msg = document.createElement('div');
    msg.style.cssText = 'margin-bottom: 8px;';
    container.appendChild(msg);

    const dismiss = document.createElement('div');
    dismiss.textContent = 'CLICK TO DISMISS';
    dismiss.style.cssText = `
      font-size: 9px;
      color: rgba(200,191,160,0.35);
      letter-spacing: 2px;
      text-align: right;
    `;
    container.appendChild(dismiss);

    container.addEventListener('click', () => this.hideTooltip());

    document.body.appendChild(container);
    this.container = container;
    this.messageEl = msg;
  }

  private scheduleStep(index: number): void {
    if (this.disabled || index >= TUTORIAL_STEPS.length) return;
    this.currentStepIndex = index;
    const step = TUTORIAL_STEPS[index];

    if (step.event === null) {
      // Immediate step with optional delay
      this.delayTimer = window.setTimeout(() => {
        this.delayTimer = null;
        this.showTooltip(step.message);
        this.scheduleStep(index + 1);
      }, step.delay ?? 0);
    } else {
      // Listen for event
      const fn = (data: any) => {
        if (step.filter && !step.filter(data)) return;
        this.removeListener(step.event!, fn);
        this.showTooltip(step.message);
        this.scheduleStep(index + 1);
      };
      this.addListener(step.event, fn);
    }
  }

  private addListener(event: string, fn: (...args: any[]) => void): void {
    EventBus.on(event, fn);
    this.boundListeners.push({ event, fn });
  }

  private removeListener(event: string, fn: (...args: any[]) => void): void {
    EventBus.off(event, fn);
    this.boundListeners = this.boundListeners.filter(
      (l) => !(l.event === event && l.fn === fn)
    );
  }

  private showTooltip(message: string): void {
    if (!this.container || !this.messageEl) return;

    // Clear any pending timers
    this.clearTimers();

    this.messageEl.textContent = message;
    this.container.style.display = 'block';

    // Force reflow then fade in
    void this.container.offsetHeight;
    this.container.style.opacity = '1';

    // Auto-dismiss after timeout
    this.dismissTimer = window.setTimeout(() => {
      this.dismissTimer = null;
      this.hideTooltip();
    }, AUTO_DISMISS_MS);
  }

  private hideTooltip(): void {
    if (!this.container) return;

    if (this.dismissTimer !== null) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }

    this.container.style.opacity = '0';
    this.fadeOutTimer = window.setTimeout(() => {
      this.fadeOutTimer = null;
      if (this.container) this.container.style.display = 'none';
    }, FADE_DURATION_MS);
  }

  private clearTimers(): void {
    if (this.dismissTimer !== null) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
    if (this.fadeOutTimer !== null) {
      clearTimeout(this.fadeOutTimer);
      this.fadeOutTimer = null;
    }
    if (this.delayTimer !== null) {
      clearTimeout(this.delayTimer);
      this.delayTimer = null;
    }
  }

  destroy(): void {
    this.clearTimers();

    for (const { event, fn } of this.boundListeners) {
      EventBus.off(event, fn);
    }
    this.boundListeners = [];

    if (this.container) {
      this.container.remove();
      this.container = null;
      this.messageEl = null;
    }

    this.disabled = true;
  }
}
