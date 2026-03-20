import { EventBus } from '../EventBus';

export interface QueuedOrder {
  unitId: string;
  type: 'move' | 'attack-move' | 'patrol' | 'attack' | 'gather';
  targetX: number;
  targetY: number;
}

export interface QueuedCardPlay {
  card: any;
  cardIndex: number;
  tileX: number;
  tileY: number;
  isShipOrdnance?: boolean;
  slotIndex?: number;
}

/**
 * Manages queued orders and card plays during tactical pause.
 * When the game is paused, commands and card plays are queued
 * instead of executed immediately. On unpause, all queued actions
 * are flushed to the respective systems.
 */
export class TacticalPauseManager {
  private _paused = false;
  private _orderQueue: QueuedOrder[] = [];
  private _cardPlayQueue: QueuedCardPlay[] = [];
  private _projectedGoldSpent = 0;

  get paused(): boolean { return this._paused; }

  get orderCount(): number { return this._orderQueue.length + this._cardPlayQueue.length; }

  get orderQueue(): readonly QueuedOrder[] { return this._orderQueue; }
  get cardPlayQueue(): readonly QueuedCardPlay[] { return this._cardPlayQueue; }

  pause(): void {
    this._paused = true;
  }

  resume(): void {
    this._paused = false;
  }

  queueOrder(order: QueuedOrder): void {
    this._orderQueue.push(order);
    EventBus.emit('tactical-order-queued', order);
    EventBus.emit('tactical-queue-changed', { count: this.orderCount });
  }

  queueCardPlay(play: QueuedCardPlay): void {
    if (!play.isShipOrdnance) {
      this._projectedGoldSpent += play.card.cost ?? 0;
    }
    this._cardPlayQueue.push(play);
    EventBus.emit('tactical-card-queued', play);
    EventBus.emit('tactical-queue-changed', { count: this.orderCount });
  }

  getProjectedGoldRemaining(currentGold: number): number {
    return currentGold - this._projectedGoldSpent;
  }

  /** Flush all queued orders. Returns the queues for the caller to execute. */
  flush(): { orders: QueuedOrder[]; cardPlays: QueuedCardPlay[] } {
    const orders = [...this._orderQueue];
    const cardPlays = [...this._cardPlayQueue];
    this._orderQueue = [];
    this._cardPlayQueue = [];
    this._projectedGoldSpent = 0;
    EventBus.emit('tactical-queue-cleared');
    EventBus.emit('tactical-queue-changed', { count: 0 });
    return { orders, cardPlays };
  }

  clear(): void {
    this._orderQueue = [];
    this._cardPlayQueue = [];
    this._projectedGoldSpent = 0;
    EventBus.emit('tactical-queue-cleared');
    EventBus.emit('tactical-queue-changed', { count: 0 });
  }
}
