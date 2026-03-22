import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventBus } from '../EventBus';

// ── DOM stub for ShopUI ──────────────────────────────────────────────────────

function makeEl() {
  const el: any = {
    style: {} as Record<string, string>,
    textContent: '',
    className: '',
    children: [] as any[],
    appendChild: vi.fn((child: any) => { el.children.push(child); return child; }),
    remove: vi.fn(),
    setAttribute: vi.fn(),
    getAttribute: vi.fn(() => null),
    addEventListener: vi.fn(),
  };
  return el;
}

let appendedToBody: any[] = [];

function setupDocumentStub() {
  appendedToBody = [];
  vi.stubGlobal('document', {
    createElement: vi.fn(() => makeEl()),
    body: { appendChild: vi.fn((el: any) => { appendedToBody.push(el); return el; }) },
    head: { appendChild: vi.fn() },
    getElementById: vi.fn(() => null),
  });
}

// ── ShopUI mutual exclusion tests ────────────────────────────────────────────

describe('ShopUI.isVisible()', () => {
  beforeEach(() => {
    setupDocumentStub();
    EventBus.removeAllListeners();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    EventBus.removeAllListeners();
  });

  it('returns false before showPack() is called', async () => {
    const { ShopUI } = await import('../ui/ShopUI');
    const shop = new ShopUI();
    expect(shop.isVisible()).toBe(false);
  });

  it('returns true after showPack() is called', async () => {
    const { ShopUI } = await import('../ui/ShopUI');
    const shop = new ShopUI();
    shop.showPack(1, 'SUPPLY POD');
    expect(shop.isVisible()).toBe(true);
  });

  it('returns false after hide() is called', async () => {
    const { ShopUI } = await import('../ui/ShopUI');
    const shop = new ShopUI();
    shop.showPack(1, 'SUPPLY POD');
    shop.hide();
    expect(shop.isVisible()).toBe(false);
  });

  it('returns false after destroy() is called', async () => {
    const { ShopUI } = await import('../ui/ShopUI');
    const shop = new ShopUI();
    shop.showPack(1, 'SUPPLY POD');
    shop.destroy();
    expect(shop.isVisible()).toBe(false);
  });
});

describe('ShopUI.hide() emits shop-closed', () => {
  beforeEach(() => {
    setupDocumentStub();
    EventBus.removeAllListeners();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    EventBus.removeAllListeners();
  });

  it('emits shop-closed when hiding a visible shop', async () => {
    const { ShopUI } = await import('../ui/ShopUI');
    const shop = new ShopUI();
    shop.showPack(1, 'SUPPLY POD');

    const listener = vi.fn();
    EventBus.on('shop-closed', listener);

    shop.hide();
    expect(listener).toHaveBeenCalledOnce();
  });

  it('does not emit shop-closed when hide() is called and shop is already hidden', async () => {
    const { ShopUI } = await import('../ui/ShopUI');
    const shop = new ShopUI();

    const listener = vi.fn();
    EventBus.on('shop-closed', listener);

    shop.hide(); // never shown — should be a no-op
    expect(listener).not.toHaveBeenCalled();
  });

  it('emits shop-closed exactly once when hide() is called twice after showPack()', async () => {
    const { ShopUI } = await import('../ui/ShopUI');
    const shop = new ShopUI();
    shop.showPack(1, 'SUPPLY POD');

    const listener = vi.fn();
    EventBus.on('shop-closed', listener);

    shop.hide();
    shop.hide(); // second call should be a no-op
    expect(listener).toHaveBeenCalledOnce();
  });

  it('emits shop-closed via destroy()', async () => {
    const { ShopUI } = await import('../ui/ShopUI');
    const shop = new ShopUI();
    shop.showPack(1, 'SUPPLY POD');

    const listener = vi.fn();
    EventBus.on('shop-closed', listener);

    shop.destroy();
    expect(listener).toHaveBeenCalledOnce();
  });
});

// ── UIScene source-level verification ───────────────────────────────────────
// UIScene is too DOM-heavy to instantiate in tests, so we verify the key
// mutual exclusion guards exist in source.

describe('UIScene dialog mutual exclusion (source guards)', () => {
  it('registers pack-decision listener for deferred supply drop', async () => {
    const src = await import('../scenes/UIScene?raw');
    expect(src.default).toContain("EventBus.on('pack-decision', this.onPackDecisionUI");
  });

  it('registers shop-closed listener for deferred pack pickup', async () => {
    const src = await import('../scenes/UIScene?raw');
    expect(src.default).toContain("EventBus.on('shop-closed', this.onShopClosed");
  });

  it('guards onSupplyDrop: defers when packPickupUI is active', async () => {
    const src = await import('../scenes/UIScene?raw');
    expect(src.default).toContain('if (this.packPickupUI)');
    expect(src.default).toContain('this.pendingSupplyDrop = true');
  });

  it('guards onPackCollected: defers when shop is visible', async () => {
    const src = await import('../scenes/UIScene?raw');
    expect(src.default).toContain('this.shopUI?.isVisible()');
    expect(src.default).toContain('this.pendingPackCollected = data');
  });

  it('onPackDecisionUI shows deferred supply drop and clears flag', async () => {
    const src = await import('../scenes/UIScene?raw');
    expect(src.default).toContain('this.pendingSupplyDrop = false');
    // After clearing the flag it shows the shop
    expect(src.default).toContain("this.shopUI.showPack(1, 'SUPPLY POD')");
  });

  it('onShopClosed shows deferred pack and clears slot', async () => {
    const src = await import('../scenes/UIScene?raw');
    expect(src.default).toContain('this.pendingPackCollected = null');
    // Shows the pending pack by creating PackPickupUI
    expect(src.default).toContain('new PackPickupUI(data.packId');
  });

  it('unregisters pack-decision listener on shutdown', async () => {
    const src = await import('../scenes/UIScene?raw');
    expect(src.default).toContain("EventBus.off('pack-decision', this.onPackDecisionUI");
  });

  it('unregisters shop-closed listener on shutdown', async () => {
    const src = await import('../scenes/UIScene?raw');
    expect(src.default).toContain("EventBus.off('shop-closed', this.onShopClosed");
  });
});
