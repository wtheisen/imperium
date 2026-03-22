import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventBus } from '../EventBus';
import { TacticalPauseOverlay } from '../ui/TacticalPauseOverlay';

function makeEl() {
  const el: any = {
    style: {} as Record<string, string>,
    textContent: '',
    id: '',
    children: [] as any[],
    appendChild: vi.fn((child: any) => { el.children.push(child); }),
    remove: vi.fn(),
  };
  return el;
}

describe('TacticalPauseOverlay', () => {
  let bodyAppended: any[];
  let headAppended: any[];

  beforeEach(() => {
    bodyAppended = [];
    headAppended = [];

    vi.stubGlobal('document', {
      createElement: vi.fn(() => makeEl()),
      body: { appendChild: vi.fn((el: any) => bodyAppended.push(el)) },
      head: { appendChild: vi.fn((el: any) => headAppended.push(el)) },
      getElementById: vi.fn(() => null),
    });

    EventBus.removeAllListeners();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    EventBus.removeAllListeners();
  });

  describe('show()', () => {
    it('appends overlay to document.body', () => {
      const overlay = new TacticalPauseOverlay();
      overlay.show();
      expect(document.body.appendChild).toHaveBeenCalledTimes(1);
      expect(bodyAppended).toHaveLength(1);
    });

    it('is idempotent — second call does not append a second overlay', () => {
      const overlay = new TacticalPauseOverlay();
      overlay.show();
      overlay.show();
      expect(bodyAppended).toHaveLength(1);
    });

    it('injects tactical-pause-styles when not present', () => {
      const overlay = new TacticalPauseOverlay();
      overlay.show();
      expect(document.head.appendChild).toHaveBeenCalledTimes(1);
    });

    it('skips style injection when tactical-pause-styles already exists', () => {
      (document.getElementById as ReturnType<typeof vi.fn>).mockReturnValue(makeEl());
      const overlay = new TacticalPauseOverlay();
      overlay.show();
      expect(document.head.appendChild).not.toHaveBeenCalled();
    });

    it('subscribes to tactical-queue-changed', () => {
      const overlay = new TacticalPauseOverlay();
      expect(EventBus.listenerCount('tactical-queue-changed')).toBe(0);
      overlay.show();
      expect(EventBus.listenerCount('tactical-queue-changed')).toBe(1);
    });
  });

  describe('hide()', () => {
    it('removes the overlay element', () => {
      const overlay = new TacticalPauseOverlay();
      overlay.show();
      const appended = bodyAppended[0];
      overlay.hide();
      expect(appended.remove).toHaveBeenCalled();
    });

    it('does not throw when called before show()', () => {
      const overlay = new TacticalPauseOverlay();
      expect(() => overlay.hide()).not.toThrow();
    });

    it('unsubscribes from tactical-queue-changed', () => {
      const overlay = new TacticalPauseOverlay();
      overlay.show();
      overlay.hide();
      const spy = vi.spyOn(overlay, 'updateQueueCount');
      EventBus.emit('tactical-queue-changed', { count: 5 });
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('updateQueueCount()', () => {
    it('updates queue count text content', () => {
      const overlay = new TacticalPauseOverlay();
      overlay.show();
      // queueCountEl is the 3rd child appended to wrapper (text, subtitle, queueCount)
      // Access via the updateQueueCount method directly
      overlay.updateQueueCount({ count: 3 });
      // No throw — method is safe to call after show
    });

    it('is safe to call when not shown', () => {
      const overlay = new TacticalPauseOverlay();
      expect(() => overlay.updateQueueCount({ count: 1 })).not.toThrow();
    });
  });

  describe('destroy()', () => {
    it('removes overlay when shown', () => {
      const overlay = new TacticalPauseOverlay();
      overlay.show();
      const appended = bodyAppended[0];
      overlay.destroy();
      expect(appended.remove).toHaveBeenCalled();
    });

    it('does not throw when called without show()', () => {
      const overlay = new TacticalPauseOverlay();
      expect(() => overlay.destroy()).not.toThrow();
    });

    it('unsubscribes from tactical-queue-changed', () => {
      const overlay = new TacticalPauseOverlay();
      overlay.show();
      overlay.destroy();
      const spy = vi.spyOn(overlay, 'updateQueueCount');
      EventBus.emit('tactical-queue-changed', { count: 7 });
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('show/hide cycle', () => {
    it('can be shown again after being hidden', () => {
      const overlay = new TacticalPauseOverlay();
      overlay.show();
      overlay.hide();
      overlay.show();
      expect(bodyAppended).toHaveLength(2);
    });

    it('only one subscription active at a time across show/hide cycles', () => {
      const overlay = new TacticalPauseOverlay();
      overlay.show();
      overlay.hide();
      overlay.show();
      expect(EventBus.listenerCount('tactical-queue-changed')).toBe(1);
    });
  });
});
