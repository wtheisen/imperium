import { EventBus } from '../EventBus';
import { Deck } from '../cards/Deck';
import { Card } from '../cards/Card';
import { ProductionComponent, TrainableUnit } from '../components/ProductionComponent';
import { Building } from '../entities/Building';
import { STARTING_GOLD } from '../config';
import { MissionDefinition } from '../missions/MissionDefinition';
import { getSelectedDeckCards, addPendingReward } from '../state/PlayerState';
import { getAllCards } from '../cards/CardDatabase';
import { GameSceneInterface } from './SceneManager';
import { CommandPanel } from '../ui/CommandPanel';
import { ObjectiveDisplay } from '../ui/ObjectiveDisplay';
import { ShopUI } from '../ui/ShopUI';
import { Minimap } from '../ui/Minimap';
import { HotkeyGrid } from '../ui/HotkeyGrid';
import { CardTooltip } from '../ui/CardTooltip';
import { KeybindingOverlay } from '../ui/KeybindingOverlay';
import { getCardArtRenderer } from '../renderer/CardArtRenderer';
import { PackPickupUI } from '../ui/PackPickupUI';
import { CARD_DATABASE } from '../cards/CardDatabase';
import { getHandSizeBonus, getShipOrdnanceSlots, getShipOrdnanceCharges } from '../ship/ShipState';
import { ShipOrdnanceBar } from '../ui/ShipOrdnanceBar';
import { getShipOrdnance } from '../state/PlayerState';

/**
 * UIScene — manages deck, hand, gold, and all HUD logic.
 * UI rendering is done via HTML/CSS overlays (TODO: Phase 9).
 * For now, core deck/event logic works without visual widgets.
 */
export class UIScene implements GameSceneInterface {
  id = 'UIScene';

  private deck!: Deck;
  private currentGold: number = STARTING_GOLD;
  private container: HTMLDivElement | null = null;
  private goldEl: HTMLElement | null = null;
  private deckInfoEl: HTMLElement | null = null;
  private supplyTimerEl: HTMLElement | null = null;
  private handEl: HTMLElement | null = null;
  private isMuted = false;
  private commandPanel: CommandPanel | null = null;
  private objectiveDisplay: ObjectiveDisplay | null = null;
  private shopUI: ShopUI | null = null;
  private minimap: Minimap | null = null;
  private hotkeyGrid: HotkeyGrid | null = null;
  private cardTooltip: CardTooltip | null = null;
  private keybindingOverlay: KeybindingOverlay | null = null;
  private packPickupUI: PackPickupUI | null = null;
  private shipOrdnanceBar: ShipOrdnanceBar | null = null;
  private pauseOverlay: HTMLDivElement | null = null;
  /** Per-slot DOM elements for incremental updates. Index 0 = deck pile. */
  private slotEls: HTMLElement[] = [];
  private deckPileEl: HTMLElement | null = null;
  private discardPileEl: HTMLElement | null = null;
  private mission: MissionDefinition | null = null;

  // Card stats tracking (Feature 4)
  private cardPlayCounts: Record<string, number> = {};
  private cardsDrawn: number = 0;
  private cardsDiscarded: number = 0;
  private reshuffleCount: number = 0;

  // Affordability tracking (Feature 2)
  private lastAffordabilityGold: number = -1;

  // Scry/peek discard state (Feature 5)
  private scryState: { slotIndex: number; timeout: ReturnType<typeof setTimeout> | null; previewEl: HTMLElement | null } = {
    slotIndex: -1, timeout: null, previewEl: null,
  };

  // Deck gauge element (Feature 3)
  private deckGaugeEl: HTMLElement | null = null;

  create(data?: { mission?: MissionDefinition; deck?: Deck }): void {
    this.mission = data?.mission || null;
    if (data?.mission) {
      this.currentGold = data.mission.startingGold;
    }

    // Use pre-built deck from drop site (with mulligan applied) or build a new one
    if (data?.deck) {
      this.deck = data.deck;
    } else {
      const startingCards: Card[] = getSelectedDeckCards();
      this.deck = new Deck(startingCards);
    }
    this.deck.setHandSizeBonus(getHandSizeBonus());

    // Create HTML UI overlay
    this.createUIOverlay();

    // Create UI widgets
    this.hotkeyGrid = new HotkeyGrid();
    this.commandPanel = new CommandPanel(this.hotkeyGrid);
    if (this.mission) {
      this.objectiveDisplay = new ObjectiveDisplay(this.mission);
    }
    this.shopUI = new ShopUI();
    this.minimap = new Minimap();
    this.cardTooltip = new CardTooltip();
    this.keybindingOverlay = new KeybindingOverlay();

    // Ship ordnance bar
    const ordnanceIds = getShipOrdnance();
    const ordnanceSlots = getShipOrdnanceSlots();
    const ordnanceCharges = getShipOrdnanceCharges();
    this.shipOrdnanceBar = new ShipOrdnanceBar(ordnanceIds, ordnanceSlots, ordnanceCharges);

    // Event listeners
    EventBus.on('card-played', this.onCardPlayed, this);
    EventBus.on('card-play-failed', this.onCardPlayFailed, this);
    EventBus.on('gold-changed', this.onGoldChanged, this);
    EventBus.on('supply-drop', this.onSupplyDrop, this);
    EventBus.on('objective-completed', this.onObjectiveCompleted, this);
    EventBus.on('bonus-draws', this.onBonusDraws, this);
    EventBus.on('shop-buy', this.onShopBuy, this);
    EventBus.on('shop-reroll', this.onShopReroll, this);
    EventBus.on('shop-skip', this.onShopSkip, this);
    EventBus.on('pack-pick', this.onPackPick, this);
    EventBus.on('train-unit', this.onTrainUnit, this);
    EventBus.on('requisition-card', this.onRequisitionCard, this);
    EventBus.on('deck-draw', this.onDeckDraw, this);
    EventBus.on('wargear-return-to-hand', this.onWargearReturnToHand, this);
    EventBus.on('wargear-to-discard', this.onWargearToDiscard, this);
    EventBus.on('mission-update', this.onMissionUpdate, this);
    EventBus.on('spawner-neutralized', this.onSpawnerNeutralized, this);
    EventBus.on('reinforcements-incoming', this.onReinforcementsIncoming, this);
    EventBus.on('game-paused', this.onGamePaused, this);
    EventBus.on('game-resumed', this.onGameResumed, this);
    EventBus.on('pack-collected', this.onPackCollected, this);
    EventBus.on('pack-card-taken', this.onPackCardTaken, this);
    EventBus.on('ship-ordnance-select', this.onShipOrdnanceSelect, this);
    EventBus.on('ship-ordnance-fired', this.onShipOrdnanceFired, this);
    EventBus.on('card-drag-cancel', this.onShipOrdnanceCancel, this);

    // Keyboard shortcuts for card selection (1-5)
    document.addEventListener('keydown', this.onKeyDown);

    // Cancel scry on any left-click elsewhere
    this.boundScryCancel = (e: MouseEvent) => {
      if (this.scryState.slotIndex >= 0 && e.button === 0) {
        this.cancelScry();
      }
    };
    document.addEventListener('click', this.boundScryCancel);

    // Initial hand draw
    this.refreshHandUI();

    // Initial affordability + tension
    this.updateAffordability();
    this.updateDeckTension();
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const num = parseInt(e.key);
    if (num >= 1 && num <= 9) {
      const hand = this.deck.hand;
      const idx = num - 1;
      if (idx < hand.length && hand[idx]) {
        // Highlight the selected card in the hand
        this.highlightCardSlot(idx);
        EventBus.emit('card-drag-start', { card: hand[idx], cardIndex: idx });
      }
    }
    if (e.key === '`') {
      EventBus.emit('deck-draw', { cost: 3 });
    }
  };

  private highlightedSlotIdx: number = -1;

  private highlightCardSlot(idx: number): void {
    // Clear previous highlight
    this.clearCardHighlight();
    const slotEl = this.slotEls[idx];
    if (slotEl) {
      slotEl.style.outline = '2px solid #ffd700';
      slotEl.style.outlineOffset = '2px';
      slotEl.style.filter = 'brightness(1.3)';
      slotEl.style.transform = 'translateY(-8px)';
      this.highlightedSlotIdx = idx;
    }
  }

  private clearCardHighlight(): void {
    if (this.highlightedSlotIdx >= 0) {
      const slotEl = this.slotEls[this.highlightedSlotIdx];
      if (slotEl) {
        slotEl.style.outline = '';
        slotEl.style.outlineOffset = '';
        slotEl.style.filter = '';
        slotEl.style.transform = '';
      }
      this.highlightedSlotIdx = -1;
    }
  }

  // Drag state tracked at scene level to avoid listener leaks
  private dragState: { isDragging: boolean; card: Card | null; cardIndex: number; ghostEl: HTMLDivElement | null; sourceEl: HTMLElement | null } = {
    isDragging: false, card: null, cardIndex: -1, ghostEl: null, sourceEl: null,
  };
  private boundMouseMove: ((e: MouseEvent) => void) | null = null;
  private boundMouseUp: ((e: MouseEvent) => void) | null = null;
  private boundScryCancel: ((e: MouseEvent) => void) | null = null;

  private createUIOverlay(): void {
    this.container = document.createElement('div');
    this.container.id = 'ui-overlay';
    Object.assign(this.container.style, {
      position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '3', fontFamily: 'monospace',
    });

    this.container.innerHTML = `
      <div id="hud-top" style="position:absolute; top:0; left:0; right:0; pointer-events:auto;
        display:flex; align-items:center; gap:0; padding:0;
        background:linear-gradient(180deg,rgba(10,10,14,0.9) 0%,rgba(10,10,14,0.6) 70%,transparent 100%);
        font-family:'Share Tech Mono','Courier New',monospace;
        border-bottom:1px solid rgba(200,152,42,0.08);">
        <!-- Bottom edge glow -->
        <div style="position:absolute;bottom:0;left:0;right:0;height:1px;pointer-events:none;
          background:linear-gradient(90deg,transparent 5%,rgba(200,152,42,0.1) 30%,rgba(200,152,42,0.1) 70%,transparent 95%);"></div>
        <!-- Hazard stripe texture -->
        <div style="position:absolute;inset:0;pointer-events:none;overflow:hidden;opacity:0.01;
          background:repeating-linear-gradient(45deg,transparent,transparent 18px,#c8982a 18px,#c8982a 20px);"></div>

        <!-- Left: Requisition -->
        <div style="display:flex;align-items:center;gap:8px;padding:8px 16px;position:relative;">
          <div style="width:2px;height:18px;background:#c8982a;"></div>
          <div>
            <div style="font-size:7px;letter-spacing:2px;color:rgba(200,152,42,0.35);">REQUISITION</div>
            <span id="gold-display" style="font-family:'Teko',sans-serif;color:#c8982a;font-size:22px;font-weight:600;
              letter-spacing:1px;line-height:1;">${this.currentGold}</span>
          </div>
        </div>

        <!-- Divider -->
        <div style="width:1px;height:24px;background:linear-gradient(180deg,transparent,rgba(200,152,42,0.12),transparent);"></div>

        <!-- Armoury info -->
        <div style="padding:8px 14px;">
          <div style="font-size:7px;letter-spacing:2px;color:rgba(200,152,42,0.35);" id="armoury-label">ARMOURY</div>
          <span id="deck-info" style="color:rgba(200,191,160,0.4);font-size:11px;letter-spacing:1px;"></span>
          <div id="deck-gauge" style="margin-top:3px;width:60px;height:3px;background:rgba(200,191,160,0.1);border-radius:2px;overflow:hidden;">
            <div id="deck-gauge-fill" style="height:100%;width:100%;background:#c8982a;border-radius:2px;transition:width 0.3s ease,background 0.3s ease;"></div>
          </div>
        </div>

        <!-- Divider -->
        <div style="width:1px;height:24px;background:linear-gradient(180deg,transparent,rgba(200,152,42,0.12),transparent);"></div>

        <!-- Supply timer -->
        <div style="padding:8px 14px;">
          <div style="font-size:7px;letter-spacing:2px;color:rgba(200,152,42,0.35);">SUPPLY DROP</div>
          <span id="supply-timer" style="color:rgba(200,152,42,0.5);font-size:11px;letter-spacing:1px;"></span>
        </div>

        <div style="flex:1;"></div>

        <!-- Right: Mute -->
        <div style="padding:8px 16px;">
          <button id="mute-btn" style="background:transparent; border:1px solid rgba(200,191,160,0.08);
            color:rgba(200,191,160,0.2); cursor:pointer; font-family:'Share Tech Mono',monospace;
            font-size:8px; padding:4px 12px; letter-spacing:2px; transition:all 0.2s;">MUTE</button>
        </div>
      </div>

      <!-- Bottom HUD bar spanning full width -->
      <div id="hud-bottom" style="position:absolute; bottom:0; left:0; right:0; pointer-events:auto;
        display:grid; grid-template-columns:1fr 176px 1fr; align-items:stretch; height:192px;
        background:linear-gradient(180deg,transparent 0%,rgba(10,10,14,0.5) 6%,rgba(10,10,14,0.92) 18%,rgba(12,11,8,0.97) 100%);
        border-top:1px solid rgba(200,152,42,0.1);
        font-family:'Share Tech Mono','Courier New',monospace;">

        <!-- Subtle hazard stripe texture inside the bar -->
        <div style="position:absolute;inset:0;pointer-events:none;overflow:hidden;opacity:0.012;
          background:repeating-linear-gradient(45deg,transparent,transparent 18px,#c8982a 18px,#c8982a 20px);"></div>
        <!-- Top edge glow -->
        <div style="position:absolute;top:0;left:0;right:0;height:1px;pointer-events:none;
          background:linear-gradient(90deg,transparent 5%,rgba(200,152,42,0.15) 30%,rgba(200,152,42,0.15) 70%,transparent 95%);"></div>

        <!-- Section: Hand -->
        <div style="display:flex; flex-direction:column; min-width:0; overflow:hidden; position:relative;
          border-right:1px solid rgba(200,152,42,0.08);">
          <div style="padding:6px 12px 0; flex-shrink:0;">
            <div style="font-size:8px; letter-spacing:2px; color:rgba(200,152,42,0.3);">HAND</div>
          </div>
          <div id="hud-section-hand" style="flex:1; display:flex; align-items:flex-end; justify-content:center;
            padding:2px 8px 8px; gap:5px; perspective:800px; min-width:0; overflow:hidden;">
          </div>
        </div>

        <!-- Section: Minimap (grid-centered) -->
        <div style="display:flex; flex-direction:column; position:relative;
          border-right:1px solid rgba(200,152,42,0.08);">
          <div style="padding:6px 10px 0; flex-shrink:0;">
            <div style="font-size:8px; letter-spacing:2px; color:rgba(200,152,42,0.3);">AUSPEX</div>
          </div>
          <div id="hud-section-minimap" style="flex:1; display:flex; align-items:center; justify-content:center;
            padding:4px 8px 6px;">
          </div>
        </div>

        <!-- Section: Unit UI / Command Panel -->
        <div style="display:flex; flex-direction:column; min-width:0; overflow:hidden; position:relative;">
          <div style="padding:6px 12px 0; flex-shrink:0;">
            <div style="font-size:8px; letter-spacing:2px; color:rgba(200,152,42,0.3);">UNIT STATUS</div>
          </div>
          <div id="hud-section-unit" style="flex:1; overflow-y:auto; overflow-x:hidden; padding:4px 10px 6px;">
            <div style="display:flex;align-items:center;justify-content:center;height:100%;
              font-size:9px; letter-spacing:2px; color:rgba(200,191,160,0.1);">NO SELECTION</div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('game-container')!.appendChild(this.container);

    this.goldEl = this.container.querySelector('#gold-display');
    this.deckInfoEl = this.container.querySelector('#deck-info');
    this.supplyTimerEl = this.container.querySelector('#supply-timer');
    this.handEl = this.container.querySelector('#hud-section-hand');
    this.deckGaugeEl = this.container.querySelector('#deck-gauge-fill');

    // Mute button
    const muteBtn = this.container.querySelector('#mute-btn') as HTMLButtonElement;
    muteBtn.addEventListener('click', () => {
      this.isMuted = !this.isMuted;
      muteBtn.textContent = this.isMuted ? 'UNMUTE' : 'MUTE';
      EventBus.emit('audio-toggle-mute');
    });

    // Single document-level drag listeners (no leaks)
    this.boundMouseMove = (e: MouseEvent) => {
      if (!this.dragState.isDragging || !this.dragState.card) return;
      // Move ghost card
      if (this.dragState.ghostEl) {
        this.dragState.ghostEl.style.left = `${e.clientX}px`;
        this.dragState.ghostEl.style.top = `${e.clientY}px`;
      }
      EventBus.emit('card-drag-move', {
        card: this.dragState.card, cardIndex: this.dragState.cardIndex,
        screenX: e.clientX, screenY: e.clientY,
      });
    };

    this.boundMouseUp = (e: MouseEvent) => {
      if (!this.dragState.isDragging || !this.dragState.card) return;
      // Remove ghost
      if (this.dragState.ghostEl) {
        this.dragState.ghostEl.remove();
        this.dragState.ghostEl = null;
      }
      // Restore source card opacity
      if (this.dragState.sourceEl) {
        this.dragState.sourceEl.style.opacity = '1';
        this.dragState.sourceEl.style.transform = '';
      }
      EventBus.emit('card-drag-released', {
        card: this.dragState.card, cardIndex: this.dragState.cardIndex,
        screenX: e.clientX, screenY: e.clientY,
      });
      this.dragState.isDragging = false;
      this.dragState.card = null;
      this.dragState.cardIndex = -1;
      this.dragState.sourceEl = null;
    };

    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mouseup', this.boundMouseUp);

    // Listen for play success/fail to animate cards
    EventBus.on('card-played', this.onCardPlayedVFX, this);
    EventBus.on('card-play-failed', this.onCardPlayFailedVFX, this);
  }

  private playingSlot: number = -1;

  private onCardPlayedVFX = ({ cardIndex }: { card: Card; cardIndex: number }): void => {
    const slotEl = this.slotEls[cardIndex];
    if (slotEl) {
      slotEl.style.animation = 'card-play-out 0.35s ease-in forwards';
    }
  };

  private onCardPlayFailedVFX = ({ cardIndex }: { cardIndex?: number }): void => {
    this.shipOrdnanceBar?.deselectCurrent();
    if (cardIndex !== undefined && cardIndex >= 0 && cardIndex < this.slotEls.length) {
      const slotEl = this.slotEls[cardIndex];
      if (slotEl) {
        slotEl.style.animation = 'card-shake 0.35s ease';
        setTimeout(() => {
          if (slotEl) slotEl.style.animation = '';
        }, 350);
      }
    } else {
      // Fallback: shake the whole hand
      if (this.handEl) {
        this.handEl.style.animation = 'hand-shake 0.3s ease';
        setTimeout(() => {
          if (this.handEl) this.handEl.style.animation = '';
        }, 300);
      }
    }
  };

  private static TYPE_COLORS: Record<string, string> = {
    unit: '#4488ff', building: '#44aa44', ordnance: '#8844cc',
    equipment: '#44dddd',
  };

  private static readonly TYPE_ICONS: Record<string, string> = {
    unit: '\u2694',       // ⚔
    building: '\u2302',   // ⌂
    ordnance: '\u2737',   // ✷
    equipment: '\u2692',  // ⚒
  };

  private refreshHandUI(): void {
    if (!this.handEl) return;
    this.handEl.innerHTML = '';
    this.slotEls = [];
    this.deckPileEl = null;
    const hand = this.deck.hand;

    // Inject card CSS once
    if (!document.getElementById('card-vfx-styles')) {
      const style = document.createElement('style');
      style.id = 'card-vfx-styles';
      style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Alegreya:ital,wght@0,400;0,700;1,400&display=swap');

        @keyframes card-draw {
          0% { transform: translateY(60px) rotateX(20deg) scale(0.7); opacity: 0; }
          60% { transform: translateY(-6px) rotateX(-2deg) scale(1.02); opacity: 1; }
          100% { transform: translateY(0) rotateX(0deg) scale(1); opacity: 1; }
        }

        .card-slot {
          animation: card-draw 0.35s ease-out both;
          transform-style: preserve-3d;
          transition: transform 0.18s cubic-bezier(0.23,1,0.32,1),
                      box-shadow 0.18s ease;
        }
        .card-slot:hover {
          transform: translateY(-18px) scale(1.06);
          z-index: 10;
        }

        /* ── MTG-style card frame ── */
        .card-frame {
          position: relative;
          width: 116px;
          height: 162px;
          border-radius: 6px;
          overflow: hidden;
          cursor: grab;
          user-select: none;
          background: linear-gradient(170deg, #1e1c18 0%, #141210 40%, #0e0c0a 100%);
          border: 2px solid #3a3228;
          box-shadow: 0 2px 10px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04);
          display: flex;
          flex-direction: column;
        }

        /* ── Title bar (name + cost) ── */
        .card-title-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 3px 4px 2px 6px;
          background: linear-gradient(180deg, rgba(40,36,28,0.9), rgba(28,24,18,0.9));
          border-bottom: 1px solid #3a3228;
          min-height: 16px;
        }
        .card-title {
          font-family: 'Cinzel', Georgia, serif;
          font-size: 8.5px;
          font-weight: 700;
          color: #e8d8b0;
          line-height: 1.1;
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          text-shadow: 0 1px 2px rgba(0,0,0,0.6);
        }
        .card-mana {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Cinzel', serif;
          font-size: 10px;
          font-weight: 700;
          color: #1a1200;
          background: radial-gradient(circle at 35% 35%, #ffe080, #daa520 50%, #a07010 100%);
          box-shadow: 0 1px 2px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.3);
          border: 1px solid #8a6a10;
          flex-shrink: 0;
          margin-left: 3px;
        }

        /* ── Art window ── */
        .card-art {
          margin: 3px 4px 2px;
          height: 56px;
          border-radius: 2px;
          border: 1px solid #2a2418;
          overflow: hidden;
          background: #0a0a0e;
          position: relative;
        }
        .card-art img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          image-rendering: auto;
        }
        /* Color-tinted vignette overlay on art */
        .card-art-vignette {
          position: absolute;
          inset: 0;
          pointer-events: none;
          box-shadow: inset 0 0 14px rgba(0,0,0,0.6);
        }

        /* ── Type line ── */
        .card-type-line {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 2px 4px;
          background: linear-gradient(180deg, rgba(40,36,28,0.7), rgba(28,24,18,0.7));
          border-top: 1px solid #2a2418;
          border-bottom: 1px solid #2a2418;
          font-family: 'Cinzel', Georgia, serif;
          font-size: 7px;
          font-weight: 700;
          letter-spacing: 1px;
          text-transform: uppercase;
        }
        .card-type-icon { font-size: 9px; }

        /* ── Text box ── */
        .card-text-box {
          flex: 1;
          margin: 2px 4px;
          padding: 4px 5px;
          background:
            repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.012) 2px, rgba(0,0,0,0.012) 4px),
            linear-gradient(180deg, #d4c8a8 0%, #c4b890 30%, #b8a878 100%);
          border-radius: 2px;
          box-shadow: inset 0 1px 2px rgba(0,0,0,0.12);
          overflow: hidden;
        }
        .card-text {
          font-family: 'Alegreya', Georgia, serif;
          font-size: 7.5px;
          color: #2a2018;
          line-height: 1.35;
          text-align: center;
        }

        /* ── Bottom info bar ── */
        .card-bottom-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 2px 6px 3px;
        }
        .card-hotkey {
          font-family: 'Cinzel', serif;
          font-size: 8px;
          color: #5a5248;
          background: rgba(20,18,14,0.4);
          border: 1px solid #2a2418;
          border-radius: 2px;
          padding: 0px 4px;
          line-height: 1.4;
        }
        .card-singleuse-badge {
          font-family: 'Cinzel', serif;
          font-size: 7px;
          color: #8a4030;
          font-weight: 700;
          letter-spacing: 0.5px;
        }

        /* ── Corner filigree ── */
        .card-frame::before,
        .card-frame::after {
          content: '';
          position: absolute;
          width: 10px;
          height: 10px;
          border: 1px solid rgba(200,168,78,0.15);
          z-index: 2;
          pointer-events: none;
        }
        .card-frame::before {
          top: 1px; left: 1px;
          border-right: none; border-bottom: none;
          border-radius: 3px 0 0 0;
        }
        .card-frame::after {
          bottom: 1px; right: 1px;
          border-left: none; border-top: none;
          border-radius: 0 0 3px 0;
        }

        @keyframes card-play-out {
          0% { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-80px) scale(0.4); opacity: 0; }
        }
        @keyframes card-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px) rotate(-2deg); }
          40% { transform: translateX(5px) rotate(1deg); }
          60% { transform: translateX(-4px) rotate(-1deg); }
          80% { transform: translateX(3px); }
        }
        @keyframes hand-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        @keyframes card-draw-reveal {
          0% { transform: translateY(60px) rotateY(180deg) scale(0.7); opacity: 0; }
          50% { transform: translateY(-4px) rotateY(90deg) scale(1.02); opacity: 0.8; }
          100% { transform: translateY(0) rotateY(0deg) scale(1); opacity: 1; }
        }

        .card-slot.unaffordable .card-frame {
          opacity: 0.5;
          filter: saturate(0.3);
        }
        .card-slot.unaffordable .card-mana {
          background: radial-gradient(circle at 35% 35%, #ff6060, #c43030 50%, #802020 100%) !important;
          border-color: #601010 !important;
          color: #fff !important;
        }

        @keyframes deck-low-pulse {
          0%, 100% { border-color: #c43030; box-shadow: 0 0 8px rgba(196,48,48,0.3); }
          50% { border-color: #ff4040; box-shadow: 0 0 16px rgba(196,48,48,0.6); }
        }

        @keyframes deck-reshuffle {
          0% { transform: scale(1); box-shadow: 0 0 0 rgba(200,152,42,0); }
          50% { transform: scale(1.1); box-shadow: 0 0 20px rgba(200,152,42,0.5); }
          100% { transform: scale(1); box-shadow: 0 0 0 rgba(200,152,42,0); }
        }

        /* Bottom bar scrollbar */
        #hud-section-unit::-webkit-scrollbar { width: 4px; }
        #hud-section-unit::-webkit-scrollbar-track { background: transparent; }
        #hud-section-unit::-webkit-scrollbar-thumb {
          background: rgba(200,152,42,0.2);
          border-radius: 2px;
        }
      `;
      document.head.appendChild(style);
    }

    // ── Deck pile (slot 0) ──
    {
      const deckSize = this.deck.getDeckSize();
      const discardSize = this.deck.getDiscardSize();
      const canDraw = deckSize > 0 || discardSize > 0;

      const deckSlot = document.createElement('div');
      deckSlot.className = 'card-slot';
      deckSlot.style.animationDelay = '0ms';

      const deckFrame = document.createElement('div');
      deckFrame.className = 'card-frame';
      deckFrame.style.position = 'relative';
      if (!canDraw) deckFrame.style.opacity = '0.4';

      // Stack effect — offset shadow cards behind
      if (deckSize > 2) {
        deckFrame.style.boxShadow = `
          0 2px 10px rgba(0,0,0,0.7),
          3px 3px 0 -1px #0e0c0a, 3px 3px 0 0px #2a2418,
          6px 6px 0 -1px #0e0c0a, 6px 6px 0 0px #221e16
        `;
      } else if (deckSize > 0) {
        deckFrame.style.boxShadow = `
          0 2px 10px rgba(0,0,0,0.7),
          3px 3px 0 -1px #0e0c0a, 3px 3px 0 0px #2a2418
        `;
      }

      // Card back design
      const cardBack = document.createElement('div');
      Object.assign(cardBack.style, {
        position: 'absolute', inset: '0',
        background: 'linear-gradient(135deg, #1a1610 0%, #12100c 50%, #1a1610 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '4px',
      });

      // Aquila / decorative pattern
      const aquila = document.createElement('div');
      Object.assign(aquila.style, {
        width: '50px', height: '50px', borderRadius: '50%',
        border: '2px solid #3a3020',
        background: 'radial-gradient(circle, #1e1a14 0%, #14120e 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: 'inset 0 0 10px rgba(200,168,78,0.08)',
      });
      const aquilaInner = document.createElement('div');
      Object.assign(aquilaInner.style, {
        width: '30px', height: '30px', borderRadius: '50%',
        border: '1px solid #4a3a20',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Cinzel', serif", fontSize: '16px', color: '#6b5a2e',
        textShadow: '0 0 6px rgba(107,90,46,0.3)',
      });
      aquilaInner.textContent = '\u2726'; // ✦
      aquila.appendChild(aquilaInner);
      cardBack.appendChild(aquila);

      // Count label
      const countLabel = document.createElement('div');
      Object.assign(countLabel.style, {
        fontFamily: "'Cinzel', serif", fontSize: '10px', fontWeight: '700',
        color: '#6b5a2e', textAlign: 'center', lineHeight: '1.3',
      });
      countLabel.setAttribute('data-deck-count', '');
      countLabel.innerHTML = `${deckSize}<br><span style="font-size:7px;color:#4a3a20;letter-spacing:1px;">ARMOURY</span>`;
      cardBack.appendChild(countLabel);

      // Draw cost
      const drawCost = document.createElement('div');
      Object.assign(drawCost.style, {
        fontFamily: "'Alegreya', serif", fontSize: '8px', fontStyle: 'italic',
        color: '#c8a84e', marginTop: '2px',
      });
      drawCost.textContent = 'Draw: 3g';
      cardBack.appendChild(drawCost);

      deckFrame.appendChild(cardBack);

      // Hotkey badge
      const hkBar = document.createElement('div');
      hkBar.className = 'card-bottom-bar';
      Object.assign(hkBar.style, { position: 'absolute', bottom: '0', left: '0', right: '0' });
      const hk = document.createElement('span');
      hk.className = 'card-hotkey';
      hk.textContent = '0';
      hkBar.appendChild(hk);
      // Discard count on right
      const discardLabel = document.createElement('span');
      Object.assign(discardLabel.style, {
        fontFamily: "'Cinzel', serif", fontSize: '7px', color: '#4a3a20',
      });
      discardLabel.setAttribute('data-discard-count', '');
      discardLabel.textContent = `${discardSize} spent`;
      hkBar.appendChild(discardLabel);
      deckFrame.appendChild(hkBar);

      deckSlot.appendChild(deckFrame);

      // Click to draw
      deckSlot.addEventListener('click', () => {
        EventBus.emit('deck-draw', { cost: 3 });
      });
      deckSlot.style.cursor = canDraw ? 'pointer' : 'default';

      // Hover
      deckSlot.addEventListener('mouseenter', () => {
        if (canDraw) {
          deckFrame.style.borderColor = '#6b5a2e';
        }
      });
      deckSlot.addEventListener('mouseleave', () => {
        deckFrame.style.borderColor = '';
        deckSlot.style.transform = '';
      });

      this.deckPileEl = deckSlot;
      this.handEl.appendChild(deckSlot);

      // Spacer between deck and hand
      const spacer = document.createElement('div');
      spacer.style.width = '6px';
      spacer.style.flexShrink = '0';
      this.handEl.appendChild(spacer);
    }

    for (let i = 0; i < hand.length; i++) {
      const card = hand[i];

      // Empty slot — show ghost frame
      if (!card) {
        const emptySlot = document.createElement('div');
        emptySlot.className = 'card-slot';
        emptySlot.style.animationDelay = `${i * 70}ms`;
        const emptyFrame = document.createElement('div');
        emptyFrame.className = 'card-frame';
        Object.assign(emptyFrame.style, {
          opacity: '0.15',
          border: '2px dashed #3a3228',
          background: 'transparent',
          boxShadow: 'none',
        });
        // Hotkey label in center
        const emptyLabel = document.createElement('div');
        Object.assign(emptyLabel.style, {
          position: 'absolute', inset: '0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Cinzel', serif", fontSize: '16px', color: '#3a3228',
        });
        emptyLabel.textContent = `${i + 1}`;
        emptyFrame.appendChild(emptyLabel);
        emptySlot.appendChild(emptyFrame);
        this.slotEls[i] = emptySlot;
        this.handEl.appendChild(emptySlot);
        continue;
      }

      const color = UIScene.TYPE_COLORS[card.type] || '#666';
      const icon = UIScene.TYPE_ICONS[card.type] || '';

      const slot = document.createElement('div');
      slot.className = 'card-slot';
      slot.style.animationDelay = `${i * 70}ms`;

      const frame = document.createElement('div');
      frame.className = 'card-frame';

      // Title bar (name + cost)
      const titleBar = document.createElement('div');
      titleBar.className = 'card-title-bar';
      const titleEl = document.createElement('span');
      titleEl.className = 'card-title';
      titleEl.textContent = card.name;
      titleBar.appendChild(titleEl);
      const manaEl = document.createElement('span');
      manaEl.className = 'card-mana';
      manaEl.textContent = `${card.cost}`;
      titleBar.appendChild(manaEl);
      frame.appendChild(titleBar);

      // Art window
      const artBox = document.createElement('div');
      artBox.className = 'card-art';
      const artImg = document.createElement('img');
      artImg.src = getCardArtRenderer().getArt(card.texture, card.type);
      artBox.appendChild(artImg);
      const vignette = document.createElement('div');
      vignette.className = 'card-art-vignette';
      // Tint the bottom edge of vignette with the type color
      vignette.style.background = `linear-gradient(180deg, transparent 40%, ${color}22 100%)`;
      artBox.appendChild(vignette);
      frame.appendChild(artBox);

      // Type line
      const typeLine = document.createElement('div');
      typeLine.className = 'card-type-line';
      typeLine.style.color = color;
      typeLine.innerHTML = `<span class="card-type-icon">${icon}</span> ${card.type}`;
      frame.appendChild(typeLine);

      // Text box
      const textBox = document.createElement('div');
      textBox.className = 'card-text-box';
      const textEl = document.createElement('div');
      textEl.className = 'card-text';
      textEl.textContent = card.description;
      textBox.appendChild(textEl);
      frame.appendChild(textBox);

      // Bottom info bar
      const bottomBar = document.createElement('div');
      bottomBar.className = 'card-bottom-bar';
      const hotkeyEl = document.createElement('span');
      hotkeyEl.className = 'card-hotkey';
      hotkeyEl.textContent = `${i + 1}`;
      bottomBar.appendChild(hotkeyEl);
      if (card.singleUse) {
        const singleEl = document.createElement('span');
        singleEl.className = 'card-singleuse-badge';
        singleEl.textContent = 'SINGLE USE';
        bottomBar.appendChild(singleEl);
      }
      frame.appendChild(bottomBar);

      slot.appendChild(frame);
      this.slotEls[i] = slot;

      // Hover effects
      slot.addEventListener('mouseenter', () => {
        if (!this.dragState.isDragging) {
          frame.style.boxShadow = `0 8px 28px rgba(0,0,0,0.8), 0 0 20px ${color}30`;
          frame.style.borderColor = color;
          this.cardTooltip?.show(card, slot.getBoundingClientRect());
        }
      });
      slot.addEventListener('mouseleave', () => {
        if (!this.dragState.isDragging) {
          frame.style.boxShadow = '';
          frame.style.borderColor = '';
          slot.style.transform = '';
        }
        this.cardTooltip?.hide();
      });

      // Drag start
      slot.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.cardTooltip?.hide();
        this.startCardDrag(card, i, slot, e.clientX, e.clientY, color);
      });

      // Right-click to discard
      slot.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.handleRightClickDiscard(i);
      });

      this.handEl.appendChild(slot);
    }

    // ── Discard pile visual ──
    this.buildDiscardPile();
  }

  private buildDiscardPile(): void {
    if (!this.handEl) return;

    // Spacer before discard pile
    const spacer2 = document.createElement('div');
    spacer2.style.width = '6px';
    spacer2.style.flexShrink = '0';
    this.handEl.appendChild(spacer2);

    const discardSlot = document.createElement('div');
    discardSlot.className = 'card-slot';
    discardSlot.style.animationDelay = '0ms';

    const discardFrame = document.createElement('div');
    discardFrame.className = 'card-frame';
    discardFrame.style.position = 'relative';
    const discardSize = this.deck.getDiscardSize();
    if (discardSize === 0) discardFrame.style.opacity = '0.3';

    const discardBack = document.createElement('div');
    Object.assign(discardBack.style, {
      position: 'absolute', inset: '0',
      background: 'linear-gradient(135deg, #1a1210 0%, #12100c 50%, #1a1210 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: '4px',
    });

    const spentIcon = document.createElement('div');
    Object.assign(spentIcon.style, {
      width: '50px', height: '50px', borderRadius: '50%',
      border: '2px solid #3a2020',
      background: 'radial-gradient(circle, #1e1414 0%, #141010 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: 'inset 0 0 10px rgba(200,80,42,0.08)',
    });
    const spentInner = document.createElement('div');
    Object.assign(spentInner.style, {
      fontFamily: "'Cinzel', serif", fontSize: '14px', color: '#6b3a2e',
      textShadow: '0 0 6px rgba(107,58,46,0.3)',
    });
    spentInner.textContent = '\u2620'; // ☠
    spentIcon.appendChild(spentInner);
    discardBack.appendChild(spentIcon);

    const countLabel = document.createElement('div');
    Object.assign(countLabel.style, {
      fontFamily: "'Cinzel', serif", fontSize: '10px', fontWeight: '700',
      color: '#6b3a2e', textAlign: 'center', lineHeight: '1.3',
    });
    countLabel.setAttribute('data-spent-count', '');
    countLabel.innerHTML = `${discardSize}<br><span style="font-size:7px;color:#4a2a20;letter-spacing:1px;">SPENT</span>`;
    discardBack.appendChild(countLabel);

    const swapsLabel = document.createElement('div');
    Object.assign(swapsLabel.style, {
      fontFamily: "'Alegreya', serif", fontSize: '8px', fontStyle: 'italic',
      color: '#8a6a4e', marginTop: '2px',
    });
    swapsLabel.setAttribute('data-swaps-label', '');
    swapsLabel.textContent = `${this.deck.getDiscardsRemaining()} swaps`;
    discardBack.appendChild(swapsLabel);

    discardFrame.appendChild(discardBack);
    discardSlot.appendChild(discardFrame);
    discardSlot.style.cursor = 'default';

    this.discardPileEl = discardSlot;
    this.handEl.appendChild(discardSlot);
  }

  private updateDiscardPile(): void {
    if (!this.discardPileEl) return;
    const countEl = this.discardPileEl.querySelector('[data-spent-count]') as HTMLElement;
    const swapsEl = this.discardPileEl.querySelector('[data-swaps-label]') as HTMLElement;
    const frame = this.discardPileEl.querySelector('.card-frame') as HTMLElement;
    const discardSize = this.deck.getDiscardSize();
    if (countEl) countEl.innerHTML = `${discardSize}<br><span style="font-size:7px;color:#4a2a20;letter-spacing:1px;">SPENT</span>`;
    if (swapsEl) swapsEl.textContent = `${this.deck.getDiscardsRemaining()} swaps`;
    if (frame) frame.style.opacity = discardSize === 0 ? '0.3' : '1';
  }

  private handleRightClickDiscard(index: number): void {
    if (this.deck.getDiscardsRemaining() <= 0) {
      this.cancelScry();
      this.showNoSwapsFlash();
      return;
    }

    // Two-step scry: first right-click shows preview, second confirms
    if (this.scryState.slotIndex === index) {
      // Second right-click on same card — commit the discard
      this.cancelScry();
      this.performDiscard(index);
    } else {
      // First right-click (or different card) — show scry preview
      this.cancelScry();
      this.showScryPreview(index);
    }
  }

  private performDiscard(index: number): void {
    const card = this.deck.hand[index];
    const success = this.deck.discardCard(index);
    if (success) {
      this.cardsDiscarded++;
      if (this.deck.lastDrawReshuffled) this.reshuffleCount++;
      const slotEl = this.slotEls[index];
      if (slotEl) {
        slotEl.style.animation = 'card-play-out 0.3s ease-in forwards';
        setTimeout(() => {
          this.updateSlot(index);
          this.updateDeckPile();
          this.updateDiscardPile();
          this.updateDeckTension();
          this.updateAffordability();
          if (this.deck.lastDrawReshuffled) this.showReshuffleAnimation();
        }, 300);
      } else {
        this.updateSlot(index);
        this.updateDeckPile();
        this.updateDiscardPile();
        this.updateDeckTension();
        this.updateAffordability();
        if (this.deck.lastDrawReshuffled) this.showReshuffleAnimation();
      }
    }
  }

  private showReshuffleAnimation(): void {
    if (!this.deckPileEl) return;
    this.deckPileEl.style.animation = 'deck-reshuffle 0.6s ease-in-out';
    setTimeout(() => {
      if (this.deckPileEl) this.deckPileEl.style.animation = '';
    }, 600);

    // Floating "RESHUFFLE" text above deck pile
    const label = document.createElement('div');
    Object.assign(label.style, {
      position: 'fixed', pointerEvents: 'none', zIndex: '300',
      fontFamily: "'Teko', sans-serif", fontSize: '18px', fontWeight: '600',
      color: '#c8982a', letterSpacing: '3px',
      transition: 'transform 1s ease-out, opacity 1s ease-out',
      transform: 'translateY(0)', opacity: '1',
    });
    label.textContent = 'RESHUFFLE';
    const rect = this.deckPileEl.getBoundingClientRect();
    label.style.left = `${rect.left + rect.width / 2 - 40}px`;
    label.style.top = `${rect.top - 20}px`;
    document.body.appendChild(label);
    requestAnimationFrame(() => {
      label.style.transform = 'translateY(-30px)';
      label.style.opacity = '0';
    });
    setTimeout(() => label.remove(), 1000);
  }

  private showNoSwapsFlash(): void {
    const target = this.discardPileEl || this.deckPileEl;
    if (!target) return;
    const label = document.createElement('div');
    Object.assign(label.style, {
      position: 'fixed', pointerEvents: 'none', zIndex: '300',
      fontFamily: "'Teko', sans-serif", fontSize: '14px', fontWeight: '600',
      color: '#c43030', letterSpacing: '2px',
      transition: 'opacity 0.8s ease-out',
      opacity: '1',
    });
    label.textContent = 'NO SWAPS LEFT';
    const rect = target.getBoundingClientRect();
    label.style.left = `${rect.left + rect.width / 2 - 50}px`;
    label.style.top = `${rect.top - 16}px`;
    document.body.appendChild(label);
    setTimeout(() => { label.style.opacity = '0'; }, 100);
    setTimeout(() => label.remove(), 900);
  }

  /** Update a single hand slot without rebuilding the whole hand. */
  private updateSlot(index: number): void {
    if (!this.handEl || index < 0 || index >= this.slotEls.length) return;
    const oldEl = this.slotEls[index];
    if (!oldEl) return;

    const card = this.deck.hand[index];
    const artRenderer = getCardArtRenderer();

    const newSlot = document.createElement('div');
    newSlot.className = 'card-slot';

    if (!card) {
      // Empty slot ghost
      const emptyFrame = document.createElement('div');
      emptyFrame.className = 'card-frame';
      Object.assign(emptyFrame.style, {
        opacity: '0.15', border: '2px dashed #3a3228',
        background: 'transparent', boxShadow: 'none',
      });
      const emptyLabel = document.createElement('div');
      Object.assign(emptyLabel.style, {
        position: 'absolute', inset: '0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Cinzel', serif", fontSize: '16px', color: '#3a3228',
      });
      emptyLabel.textContent = `${index + 1}`;
      emptyFrame.appendChild(emptyLabel);
      newSlot.appendChild(emptyFrame);
    } else {
      const color = UIScene.TYPE_COLORS[card.type] || '#666';
      const icon = UIScene.TYPE_ICONS[card.type] || '';

      const frame = document.createElement('div');
      frame.className = 'card-frame';

      // Title bar
      const titleBar = document.createElement('div');
      titleBar.className = 'card-title-bar';
      const titleEl = document.createElement('span');
      titleEl.className = 'card-title';
      titleEl.textContent = card.name;
      titleBar.appendChild(titleEl);
      const manaEl = document.createElement('span');
      manaEl.className = 'card-mana';
      manaEl.textContent = `${card.cost}`;
      titleBar.appendChild(manaEl);
      frame.appendChild(titleBar);

      // Art
      const artBox = document.createElement('div');
      artBox.className = 'card-art';
      const artImg = document.createElement('img');
      artImg.src = artRenderer.getArt(card.texture, card.type);
      artBox.appendChild(artImg);
      const vignette = document.createElement('div');
      vignette.className = 'card-art-vignette';
      vignette.style.background = `linear-gradient(180deg, transparent 40%, ${color}22 100%)`;
      artBox.appendChild(vignette);
      frame.appendChild(artBox);

      // Type line
      const typeLine = document.createElement('div');
      typeLine.className = 'card-type-line';
      typeLine.style.color = color;
      typeLine.innerHTML = `<span class="card-type-icon">${icon}</span> ${card.type}`;
      frame.appendChild(typeLine);

      // Text box
      const textBox = document.createElement('div');
      textBox.className = 'card-text-box';
      const textEl = document.createElement('div');
      textEl.className = 'card-text';
      textEl.textContent = card.description;
      textBox.appendChild(textEl);
      frame.appendChild(textBox);

      // Bottom bar
      const bottomBar = document.createElement('div');
      bottomBar.className = 'card-bottom-bar';
      const hotkeyEl = document.createElement('span');
      hotkeyEl.className = 'card-hotkey';
      hotkeyEl.textContent = `${index + 1}`;
      bottomBar.appendChild(hotkeyEl);
      if (card.singleUse) {
        const singleEl = document.createElement('span');
        singleEl.className = 'card-singleuse-badge';
        singleEl.textContent = 'SINGLE USE';
        bottomBar.appendChild(singleEl);
      }
      frame.appendChild(bottomBar);
      newSlot.appendChild(frame);

      // Hover
      newSlot.addEventListener('mouseenter', () => {
        if (!this.dragState.isDragging) {
          frame.style.boxShadow = `0 8px 28px rgba(0,0,0,0.8), 0 0 20px ${color}30`;
          frame.style.borderColor = color;
          this.cardTooltip?.show(card, newSlot.getBoundingClientRect());
        }
      });
      newSlot.addEventListener('mouseleave', () => {
        if (!this.dragState.isDragging) {
          frame.style.boxShadow = '';
          frame.style.borderColor = '';
          newSlot.style.transform = '';
        }
        this.cardTooltip?.hide();
      });

      // Drag
      newSlot.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.cardTooltip?.hide();
        this.startCardDrag(card, index, newSlot, e.clientX, e.clientY, color);
      });

      // Right-click to discard
      newSlot.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.handleRightClickDiscard(index);
      });
    }

    // Apply draw-reveal animation when a card appears in a previously empty slot
    const wasEmpty = !oldEl.querySelector('.card-title-bar');
    if (card && wasEmpty) {
      newSlot.style.animation = 'card-draw-reveal 0.5s ease-out both';
      newSlot.style.transformStyle = 'preserve-3d';
    }

    oldEl.replaceWith(newSlot);
    this.slotEls[index] = newSlot;

    // Update affordability for the new slot
    this.updateAffordabilityForSlot(index);
  }

  /** Update just the deck pile counts without rebuilding. */
  private updateDeckPile(): void {
    if (!this.deckPileEl) return;
    // Find and update the count label and discard label inside the existing pile
    const countEl = this.deckPileEl.querySelector('[data-deck-count]') as HTMLElement;
    const discardEl = this.deckPileEl.querySelector('[data-discard-count]') as HTMLElement;
    if (countEl) countEl.innerHTML = `${this.deck.getDeckSize()}<br><span style="font-size:7px;color:#4a3a20;letter-spacing:1px;">ARMOURY</span>`;
    if (discardEl) discardEl.textContent = `${this.deck.getDiscardSize()} spent`;
  }

  private startCardDrag(card: Card, index: number, sourceEl: HTMLElement, startX: number, startY: number, _color: string): void {
    // Dim the source card
    sourceEl.style.opacity = '0.4';
    sourceEl.style.transform = 'scale(0.95)';

    // No cursor ghost — the 3D ghost mesh + label above the unit handles the preview
    this.dragState = { isDragging: true, card, cardIndex: index, ghostEl: null, sourceEl };

    EventBus.emit('card-drag-start', { card, cardIndex: index, screenX: startX, screenY: startY });
  }

  private updateGoldDisplay(): void {
    if (this.goldEl) {
      this.goldEl.textContent = `${this.currentGold}`;
    }
  }

  // ── Event Handlers ──────────────────────────────────

  private onCardPlayed({ card, cardIndex }: { card: Card; cardIndex: number }): void {
    this.clearCardHighlight();
    this.cancelScry();
    // Track stats
    this.cardPlayCounts[card.id] = (this.cardPlayCounts[card.id] || 0) + 1;
    this.deck.playCard(cardIndex);
    // Delay slot update to let play-out animation finish
    setTimeout(() => {
      this.updateSlot(cardIndex);
      this.updateDeckPile();
      this.updateDiscardPile();
      this.updateDeckTension();
      this.updateAffordability();
    }, 350);
  }

  private onCardPlayFailed(_data: any): void {
    this.clearCardHighlight();
    // Restore drag source if needed
    if (this.dragState.sourceEl) {
      this.dragState.sourceEl.style.opacity = '';
      this.dragState.sourceEl.style.transform = '';
    }
  }

  private onGoldChanged({ amount, total }: { amount: number; total: number }): void {
    this.currentGold = total;
    this.updateGoldDisplay();
    this.updateAffordability();
    if (amount > 0) {
      this.showFloatingGoldText(amount);
    }
  }

  private onSupplyDrop(): void {
    if (this.shopUI) {
      this.shopUI.showPack(1, 'SUPPLY POD');
    }
  }

  private onMissionUpdate(data: { supplyTimer: number; supplyInterval: number }): void {
    if (!this.supplyTimerEl) return;
    const remaining = Math.max(0, data.supplyInterval - data.supplyTimer);
    const seconds = Math.ceil(remaining / 1000);
    this.supplyTimerEl.textContent = `${seconds}s`;
  }

  private drawMultipleCards(count: number, staggerMs: number = 200): void {
    let drawIndex = 0;
    for (let i = 0; i < count; i++) {
      const drawn = this.deck.drawCard();
      if (drawn) {
        this.cardsDrawn++;
        if (this.deck.lastDrawReshuffled) this.reshuffleCount++;
        const slot = this.deck.hand.indexOf(drawn);
        if (slot >= 0) {
          const staggerDelay = drawIndex * staggerMs;
          setTimeout(() => {
            this.updateSlot(slot);
          }, staggerDelay);
          drawIndex++;
        }
        if (this.deck.lastDrawReshuffled) this.showReshuffleAnimation();
      }
    }
    this.updateDeckPile();
    this.updateDiscardPile();
    this.updateDeckTension();
    this.updateAffordability();
  }

  private drawCardForCost(cost: number): void {
    if (this.currentGold < cost) return;
    const drawn = this.deck.drawCard();
    if (!drawn) return;
    this.cardsDrawn++;
    if (this.deck.lastDrawReshuffled) this.reshuffleCount++;
    this.currentGold -= cost;
    EventBus.emit('gold-changed', { amount: -cost, total: this.currentGold });
    const slot = this.deck.hand.indexOf(drawn);
    if (slot >= 0) this.updateSlot(slot);
    this.updateDeckPile();
    this.updateDiscardPile();
    this.updateDeckTension();
    if (this.deck.lastDrawReshuffled) this.showReshuffleAnimation();
  }

  private onObjectiveCompleted({ cardDraws }: { objectiveId: string; goldReward: number; cardDraws: number }): void {
    this.drawMultipleCards(cardDraws);
    const allCards = getAllCards();
    const randomCard = allCards[Math.floor(Math.random() * allCards.length)];
    addPendingReward(randomCard.id);
    this.showBanner('OBJECTIVE COMPLETE', '#4a9e4a', 2000);
  }

  private onShopBuy({ card }: { card: Card }): void {
    if (this.currentGold >= card.cost) {
      EventBus.emit('gold-changed', { amount: -card.cost, total: this.currentGold - card.cost });
      this.currentGold -= card.cost;
      this.deck.addCard(card);
      if (this.shopUI) this.shopUI.hide();
    }
  }

  private onShopReroll(): void {
    if (this.currentGold >= 5) {
      this.currentGold -= 5;
      EventBus.emit('gold-changed', { amount: -5, total: this.currentGold });
      if (this.shopUI) this.shopUI.reroll(this.currentGold);
    }
  }

  private onBonusDraws({ count }: { count: number }): void {
    this.drawMultipleCards(count);
  }

  private onTrainUnit({ unit, building }: { unit: TrainableUnit; building: Building }): void {
    if (this.currentGold < unit.cost) return;
    const production = building.getComponent<ProductionComponent>('production');
    if (!production) return;
    if (production.queueUnit(unit)) {
      this.currentGold -= unit.cost;
      EventBus.emit('gold-changed', { amount: -unit.cost, total: this.currentGold });
    }
  }

  private onPackPick({ card, index }: { card: Card; index: number }): void {
    this.deck.addCardToHand(card);
    const slot = this.deck.hand.indexOf(card);
    if (slot >= 0) this.updateSlot(slot);
    this.updateDeckPile();
    addPendingReward(card.id);
    if (this.shopUI) this.shopUI.consumePick(index);
  }

  private onDeckDraw({ cost }: { cost: number }): void {
    this.drawCardForCost(cost);
  }

  private onRequisitionCard({ cost }: { cost: number }): void {
    this.drawCardForCost(cost);
  }

  private onWargearReturnToHand({ card }: { card: Card }): void {
    const added = this.deck.addCardToHand(card);
    if (!added) { this.deck.addCard(card); return; }
    const slot = this.deck.hand.indexOf(card);
    if (slot >= 0) this.updateSlot(slot);
    this.updateDeckPile();
  }

  private onWargearToDiscard({ card }: { card: Card }): void {
    this.deck.addCard(card);
  }

  private onShopSkip(): void {
    if (this.shopUI) this.shopUI.hide();
  }

  private onSpawnerNeutralized(): void {
    this.showBanner('SPAWNER NEUTRALIZED', '#4a9e4a', 2000);
  }

  private onReinforcementsIncoming(): void {
    this.showBanner('ENEMY REINFORCEMENTS INCOMING', '#c43030', 3000, true);
  }

  private onPackCollected = (data: { packId: string; type: string; cards: string[] }): void => {
    // Create pack pickup UI overlay
    this.packPickupUI = new PackPickupUI(data.packId, data.type as any, data.cards);
  };

  private onPackCardTaken = (data: { cardId: string }): void => {
    // Add card to the in-game deck
    const card = CARD_DATABASE[data.cardId];
    if (card && this.deck) {
      this.deck.addCard(card);
    }
  };

  private onGamePaused = (): void => {
    if (this.pauseOverlay) return;
    this.pauseOverlay = document.createElement('div');
    Object.assign(this.pauseOverlay.style, {
      position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
      background: 'rgba(0, 0, 0, 0.6)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: '9999', pointerEvents: 'none',
    });
    const text = document.createElement('div');
    Object.assign(text.style, {
      fontFamily: 'Teko, sans-serif', fontSize: '96px', color: '#c8982a',
      letterSpacing: '12px', textTransform: 'uppercase', textShadow: '0 0 30px rgba(200,152,42,0.4)',
    });
    text.textContent = 'PAUSED';
    const hint = document.createElement('div');
    Object.assign(hint.style, {
      fontFamily: 'Share Tech Mono, monospace', fontSize: '14px', color: '#c8bfa0',
      letterSpacing: '2px', marginTop: '12px', textAlign: 'center',
    });
    hint.textContent = 'PRESS P TO RESUME';
    const wrapper = document.createElement('div');
    wrapper.style.textAlign = 'center';
    wrapper.appendChild(text);
    wrapper.appendChild(hint);
    this.pauseOverlay.appendChild(wrapper);
    document.body.appendChild(this.pauseOverlay);
  };

  private onGameResumed = (): void => {
    if (this.pauseOverlay) {
      this.pauseOverlay.remove();
      this.pauseOverlay = null;
    }
  };

  /** Show floating "+Xg" text near the gold counter */
  private showFloatingGoldText(amount: number): void {
    if (!this.goldEl) return;
    const span = document.createElement('span');
    span.textContent = `+${amount}g`;
    Object.assign(span.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      fontFamily: "'Teko', sans-serif",
      fontSize: '16px',
      fontWeight: '600',
      color: '#c8982a',
      pointerEvents: 'none',
      zIndex: '100',
      whiteSpace: 'nowrap',
      transition: 'transform 1.5s ease-out, opacity 1.5s ease-out',
      transform: 'translateY(0)',
      opacity: '1',
    });
    // Position near the gold display
    const rect = this.goldEl.getBoundingClientRect();
    span.style.left = `${rect.right + 8}px`;
    span.style.top = `${rect.top}px`;
    document.body.appendChild(span);
    // Trigger animation on next frame
    requestAnimationFrame(() => {
      span.style.transform = 'translateY(-30px)';
      span.style.opacity = '0';
    });
    setTimeout(() => span.remove(), 1500);
  }

  /** Show a full-width banner at ~30% from the top of the screen */
  private showBanner(text: string, color: string, duration: number, pulse = false): void {
    const banner = document.createElement('div');
    Object.assign(banner.style, {
      position: 'fixed',
      top: '30%',
      left: '0',
      width: '100%',
      textAlign: 'center',
      fontFamily: "'Teko', sans-serif",
      fontSize: '32px',
      fontWeight: '700',
      letterSpacing: '8px',
      color: '#e8dcc0',
      background: `linear-gradient(90deg, transparent, ${color}55, ${color}55, transparent)`,
      padding: '14px 0',
      zIndex: '200',
      pointerEvents: 'none',
      transform: 'translateY(-100%)',
      transition: 'transform 0.3s ease-out, opacity 0.3s ease-out',
      opacity: '0',
    });
    if (pulse) {
      banner.style.animation = 'ui-banner-pulse 0.6s ease-in-out infinite alternate';
      // Inject keyframes if not already present
      if (!document.getElementById('ui-banner-pulse-style')) {
        const style = document.createElement('style');
        style.id = 'ui-banner-pulse-style';
        style.textContent = `@keyframes ui-banner-pulse { from { opacity: 0.7; } to { opacity: 1; } }`;
        document.head.appendChild(style);
      }
    }
    banner.textContent = text;
    document.body.appendChild(banner);
    // Slide in
    requestAnimationFrame(() => {
      banner.style.transform = 'translateY(0)';
      banner.style.opacity = '1';
    });
    // Slide out after duration
    setTimeout(() => {
      banner.style.transform = 'translateY(-100%)';
      banner.style.opacity = '0';
      setTimeout(() => banner.remove(), 300);
    }, duration);
  }

  // ── Feature 2: Affordability Dimming ──

  private updateAffordability(): void {
    if (this.lastAffordabilityGold === this.currentGold) return;
    this.lastAffordabilityGold = this.currentGold;
    for (let i = 0; i < this.slotEls.length; i++) {
      this.updateAffordabilityForSlot(i);
    }
  }

  private updateAffordabilityForSlot(index: number): void {
    const slotEl = this.slotEls[index];
    if (!slotEl) return;
    const card = this.deck.hand[index];
    if (!card) {
      slotEl.classList.remove('unaffordable');
      return;
    }
    if (card.cost > this.currentGold) {
      slotEl.classList.add('unaffordable');
    } else {
      slotEl.classList.remove('unaffordable');
    }
  }

  // ── Feature 3: Deck Tension Indicator ──

  private updateDeckTension(): void {
    const deckSize = this.deck.getDeckSize();
    const discardSize = this.deck.getDiscardSize();
    const handCount = this.deck.getHandSize();
    const total = deckSize + discardSize + handCount;

    // Update gauge bar
    if (this.deckGaugeEl) {
      const ratio = total > 0 ? deckSize / total : 0;
      this.deckGaugeEl.style.width = `${Math.round(ratio * 100)}%`;
      if (ratio > 0.4) {
        this.deckGaugeEl.style.background = '#c8982a'; // brass
      } else if (ratio > 0.15) {
        this.deckGaugeEl.style.background = '#d4a020'; // amber
      } else {
        this.deckGaugeEl.style.background = '#c43030'; // red
      }
    }

    // Update ARMOURY label color and deck pile pulse
    const armouryLabel = this.container?.querySelector('#armoury-label') as HTMLElement | null;
    const deckFrame = this.deckPileEl?.querySelector('.card-frame') as HTMLElement | null;

    if (deckSize <= 3 && deckSize > 0) {
      if (armouryLabel) armouryLabel.style.color = '#c43030';
      if (deckFrame) deckFrame.style.animation = 'deck-low-pulse 1s ease-in-out infinite';
    } else {
      if (armouryLabel) armouryLabel.style.color = '';
      if (deckFrame && deckFrame.style.animation === 'deck-low-pulse 1s ease-in-out infinite') {
        deckFrame.style.animation = '';
      }
    }

    // Update deck count label text for empty states
    const countEl = this.deckPileEl?.querySelector('[data-deck-count]') as HTMLElement | null;
    if (countEl) {
      if (deckSize === 0 && discardSize > 0) {
        countEl.innerHTML = `<span style="font-size:8px;color:#c8982a;letter-spacing:1px;">RESHUFFLING...</span>`;
      } else if (deckSize === 0 && discardSize === 0) {
        countEl.innerHTML = `<span style="font-size:9px;color:#c43030;font-weight:700;">EMPTY</span>`;
      }
    }
  }

  // ── Feature 5: Scry Preview on Discard ──

  private cancelScry(): void {
    if (this.scryState.timeout) {
      clearTimeout(this.scryState.timeout);
      this.scryState.timeout = null;
    }
    if (this.scryState.previewEl) {
      this.scryState.previewEl.remove();
      this.scryState.previewEl = null;
    }
    // Restore dimmed card
    if (this.scryState.slotIndex >= 0 && this.scryState.slotIndex < this.slotEls.length) {
      const slotEl = this.slotEls[this.scryState.slotIndex];
      if (slotEl) slotEl.style.opacity = '';
    }
    this.scryState.slotIndex = -1;
  }

  private showScryPreview(index: number): void {
    const targetEl = this.discardPileEl || this.deckPileEl;
    if (!targetEl) return;

    const peeked = this.deck.peekTop();
    const rect = targetEl.getBoundingClientRect();

    const preview = document.createElement('div');
    Object.assign(preview.style, {
      position: 'fixed', zIndex: '300', pointerEvents: 'none',
      left: `${rect.left + rect.width / 2}px`,
      top: `${rect.top - 36}px`,
      transform: 'translateX(-50%)',
      fontFamily: "'Teko', sans-serif", fontSize: '14px', fontWeight: '600',
      letterSpacing: '2px', textAlign: 'center',
      padding: '4px 12px', borderRadius: '4px',
      background: 'rgba(10,10,14,0.9)', border: '1px solid rgba(200,152,42,0.3)',
      transition: 'opacity 0.2s',
    });

    if (peeked) {
      preview.innerHTML = `<span style="color:rgba(200,152,42,0.5);font-size:10px;">NEXT:</span> <span style="color:#e8dcc0;">${peeked.name}</span>`;
    } else {
      preview.innerHTML = `<span style="color:#c43030;">RESHUFFLE?</span>`;
    }

    document.body.appendChild(preview);
    this.scryState.previewEl = preview;

    // Dim the right-clicked card
    const slotEl = this.slotEls[index];
    if (slotEl) slotEl.style.opacity = '0.5';
    this.scryState.slotIndex = index;

    // Auto-cancel after 2s
    this.scryState.timeout = setTimeout(() => this.cancelScry(), 2000);
  }

  private onShipOrdnanceSelect(data: { card: Card; slotIndex: number }): void {
    EventBus.emit('card-drag-start', {
      card: data.card,
      cardIndex: -1,
      isShipOrdnance: true,
      slotIndex: data.slotIndex,
    });
  }

  private onShipOrdnanceFired(data: { slotIndex: number }): void {
    this.shipOrdnanceBar?.fireSlot(data.slotIndex);
  }

  private onShipOrdnanceCancel(): void {
    this.shipOrdnanceBar?.deselectCurrent();
  }

  update(): void {
    if (this.deckInfoEl) {
      this.deckInfoEl.textContent = `Armoury: ${this.deck.getDeckSize()} | Spent: ${this.deck.getDiscardSize()}`;
    }
    if (this.commandPanel) this.commandPanel.update();
  }

  shutdown(): void {
    // Emit card stats for GameOverScene
    EventBus.emit('card-stats', {
      cardPlayCounts: { ...this.cardPlayCounts },
      cardsDrawn: this.cardsDrawn,
      cardsDiscarded: this.cardsDiscarded,
      reshuffleCount: this.reshuffleCount,
    });

    this.cancelScry();
    if (this.boundScryCancel) document.removeEventListener('click', this.boundScryCancel);

    EventBus.off('card-played', this.onCardPlayed, this);
    EventBus.off('card-play-failed', this.onCardPlayFailed, this);
    EventBus.off('gold-changed', this.onGoldChanged, this);
    EventBus.off('supply-drop', this.onSupplyDrop, this);
    EventBus.off('objective-completed', this.onObjectiveCompleted, this);
    EventBus.off('bonus-draws', this.onBonusDraws, this);
    EventBus.off('shop-buy', this.onShopBuy, this);
    EventBus.off('shop-reroll', this.onShopReroll, this);
    EventBus.off('shop-skip', this.onShopSkip, this);
    EventBus.off('pack-pick', this.onPackPick, this);
    EventBus.off('train-unit', this.onTrainUnit, this);
    EventBus.off('requisition-card', this.onRequisitionCard, this);
    EventBus.off('deck-draw', this.onDeckDraw, this);
    EventBus.off('wargear-return-to-hand', this.onWargearReturnToHand, this);
    EventBus.off('wargear-to-discard', this.onWargearToDiscard, this);
    EventBus.off('mission-update', this.onMissionUpdate, this);
    EventBus.off('spawner-neutralized', this.onSpawnerNeutralized, this);
    EventBus.off('reinforcements-incoming', this.onReinforcementsIncoming, this);
    EventBus.off('game-paused', this.onGamePaused, this);
    EventBus.off('game-resumed', this.onGameResumed, this);
    EventBus.off('pack-collected', this.onPackCollected, this);
    EventBus.off('pack-card-taken', this.onPackCardTaken, this);
    EventBus.off('ship-ordnance-select', this.onShipOrdnanceSelect, this);
    EventBus.off('ship-ordnance-fired', this.onShipOrdnanceFired, this);
    EventBus.off('card-drag-cancel', this.onShipOrdnanceCancel, this);
    this.packPickupUI?.destroy();
    if (this.shipOrdnanceBar) { this.shipOrdnanceBar.destroy(); this.shipOrdnanceBar = null; }
    if (this.pauseOverlay) { this.pauseOverlay.remove(); this.pauseOverlay = null; }

    document.removeEventListener('keydown', this.onKeyDown);
    if (this.boundMouseMove) document.removeEventListener('mousemove', this.boundMouseMove);
    if (this.boundMouseUp) document.removeEventListener('mouseup', this.boundMouseUp);
    EventBus.off('card-played', this.onCardPlayedVFX, this);
    EventBus.off('card-play-failed', this.onCardPlayFailedVFX, this);

    // Clean up ghost if drag was in progress
    if (this.dragState.ghostEl) { this.dragState.ghostEl.remove(); this.dragState.ghostEl = null; }

    if (this.commandPanel) { this.commandPanel.destroy(); this.commandPanel = null; }
    if (this.hotkeyGrid) { this.hotkeyGrid.destroy(); this.hotkeyGrid = null; }
    if (this.objectiveDisplay) { this.objectiveDisplay.destroy(); this.objectiveDisplay = null; }
    if (this.shopUI) { this.shopUI.destroy(); this.shopUI = null; }
    if (this.minimap) { this.minimap.destroy(); this.minimap = null; }
    if (this.cardTooltip) { this.cardTooltip.destroy(); this.cardTooltip = null; }
    if (this.keybindingOverlay) { this.keybindingOverlay.destroy(); this.keybindingOverlay = null; }

    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
}
