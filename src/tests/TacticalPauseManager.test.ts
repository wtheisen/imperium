import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TacticalPauseManager, QueuedOrder, QueuedCardPlay } from '../systems/TacticalPauseManager';
import { EventBus } from '../EventBus';

describe('TacticalPauseManager', () => {
  let manager: TacticalPauseManager;

  beforeEach(() => {
    manager = new TacticalPauseManager();
    EventBus.removeAllListeners();
  });

  describe('pause state', () => {
    it('starts unpaused', () => {
      expect(manager.paused).toBe(false);
    });

    it('can be paused and resumed', () => {
      manager.pause();
      expect(manager.paused).toBe(true);
      manager.resume();
      expect(manager.paused).toBe(false);
    });
  });

  describe('order queue', () => {
    it('starts with zero orders', () => {
      expect(manager.orderCount).toBe(0);
    });

    it('queues movement orders', () => {
      const order: QueuedOrder = { unitId: 'u1', type: 'move', targetX: 10, targetY: 15 };
      manager.queueOrder(order);
      expect(manager.orderCount).toBe(1);
      expect(manager.orderQueue[0]).toEqual(order);
    });

    it('queues multiple orders', () => {
      manager.queueOrder({ unitId: 'u1', type: 'move', targetX: 10, targetY: 15 });
      manager.queueOrder({ unitId: 'u2', type: 'attack', targetX: 5, targetY: 5 });
      manager.queueOrder({ unitId: 'u3', type: 'patrol', targetX: 20, targetY: 20 });
      expect(manager.orderCount).toBe(3);
    });

    it('emits tactical-order-queued event', () => {
      const spy = vi.fn();
      EventBus.on('tactical-order-queued', spy);
      const order: QueuedOrder = { unitId: 'u1', type: 'move', targetX: 10, targetY: 15 };
      manager.queueOrder(order);
      expect(spy).toHaveBeenCalledWith(order);
    });

    it('emits tactical-queue-changed with count', () => {
      const spy = vi.fn();
      EventBus.on('tactical-queue-changed', spy);
      manager.queueOrder({ unitId: 'u1', type: 'move', targetX: 10, targetY: 15 });
      expect(spy).toHaveBeenCalledWith({ count: 1 });
    });
  });

  describe('card play queue', () => {
    it('queues card plays', () => {
      const play: QueuedCardPlay = { card: { id: 'marine', type: 'unit' }, cardIndex: 0, tileX: 5, tileY: 5 };
      manager.queueCardPlay(play);
      expect(manager.orderCount).toBe(1);
      expect(manager.cardPlayQueue[0]).toEqual(play);
    });

    it('counts card plays in total order count', () => {
      manager.queueOrder({ unitId: 'u1', type: 'move', targetX: 10, targetY: 15 });
      manager.queueCardPlay({ card: { id: 'marine' }, cardIndex: 0, tileX: 5, tileY: 5 });
      expect(manager.orderCount).toBe(2);
    });

    it('emits tactical-card-queued event', () => {
      const spy = vi.fn();
      EventBus.on('tactical-card-queued', spy);
      const play: QueuedCardPlay = { card: { id: 'marine' }, cardIndex: 0, tileX: 5, tileY: 5 };
      manager.queueCardPlay(play);
      expect(spy).toHaveBeenCalledWith(play);
    });

    it('queues ship ordnance plays', () => {
      const play: QueuedCardPlay = {
        card: { id: 'lance_strike' }, cardIndex: -1, tileX: 10, tileY: 10,
        isShipOrdnance: true, slotIndex: 0,
      };
      manager.queueCardPlay(play);
      expect(manager.cardPlayQueue[0].isShipOrdnance).toBe(true);
      expect(manager.cardPlayQueue[0].slotIndex).toBe(0);
    });
  });

  describe('flush', () => {
    it('returns all queued items and clears the queues', () => {
      manager.queueOrder({ unitId: 'u1', type: 'move', targetX: 10, targetY: 15 });
      manager.queueOrder({ unitId: 'u2', type: 'attack', targetX: 5, targetY: 5 });
      manager.queueCardPlay({ card: { id: 'marine' }, cardIndex: 0, tileX: 3, tileY: 3 });

      const result = manager.flush();
      expect(result.orders).toHaveLength(2);
      expect(result.cardPlays).toHaveLength(1);
      expect(manager.orderCount).toBe(0);
      expect(manager.orderQueue).toHaveLength(0);
      expect(manager.cardPlayQueue).toHaveLength(0);
    });

    it('emits tactical-queue-cleared on flush', () => {
      const spy = vi.fn();
      EventBus.on('tactical-queue-cleared', spy);
      manager.queueOrder({ unitId: 'u1', type: 'move', targetX: 10, targetY: 15 });
      manager.flush();
      expect(spy).toHaveBeenCalled();
    });

    it('emits tactical-queue-changed with 0 on flush', () => {
      const spy = vi.fn();
      EventBus.on('tactical-queue-changed', spy);
      manager.queueOrder({ unitId: 'u1', type: 'move', targetX: 10, targetY: 15 });
      spy.mockClear();
      manager.flush();
      expect(spy).toHaveBeenCalledWith({ count: 0 });
    });

    it('returns empty arrays when nothing queued', () => {
      const result = manager.flush();
      expect(result.orders).toHaveLength(0);
      expect(result.cardPlays).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('clears all queued items', () => {
      manager.queueOrder({ unitId: 'u1', type: 'move', targetX: 10, targetY: 15 });
      manager.queueCardPlay({ card: { id: 'marine' }, cardIndex: 0, tileX: 3, tileY: 3 });
      manager.clear();
      expect(manager.orderCount).toBe(0);
    });

    it('emits tactical-queue-cleared on clear', () => {
      const spy = vi.fn();
      EventBus.on('tactical-queue-cleared', spy);
      manager.clear();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('projected gold tracking', () => {
    it('starts with full gold remaining', () => {
      expect(manager.getProjectedGoldRemaining(50)).toBe(50);
    });

    it('deducts card cost from projected gold', () => {
      manager.queueCardPlay({ card: { id: 'marine', cost: 10 }, cardIndex: 0, tileX: 5, tileY: 5 });
      expect(manager.getProjectedGoldRemaining(50)).toBe(40);
    });

    it('accumulates costs across multiple queued cards', () => {
      manager.queueCardPlay({ card: { id: 'marine', cost: 10 }, cardIndex: 0, tileX: 5, tileY: 5 });
      manager.queueCardPlay({ card: { id: 'marine', cost: 10 }, cardIndex: 1, tileX: 6, tileY: 5 });
      manager.queueCardPlay({ card: { id: 'marine', cost: 10 }, cardIndex: 2, tileX: 7, tileY: 5 });
      expect(manager.getProjectedGoldRemaining(20)).toBe(-10);
    });

    it('does not deduct cost for ship ordnance (free)', () => {
      manager.queueCardPlay({
        card: { id: 'lance_strike', cost: 0 }, cardIndex: -1, tileX: 10, tileY: 10,
        isShipOrdnance: true, slotIndex: 0,
      });
      expect(manager.getProjectedGoldRemaining(30)).toBe(30);
    });

    it('treats missing cost as zero', () => {
      manager.queueCardPlay({ card: { id: 'marine' }, cardIndex: 0, tileX: 5, tileY: 5 });
      expect(manager.getProjectedGoldRemaining(25)).toBe(25);
    });

    it('resets projected gold on flush', () => {
      manager.queueCardPlay({ card: { id: 'marine', cost: 10 }, cardIndex: 0, tileX: 5, tileY: 5 });
      manager.flush();
      expect(manager.getProjectedGoldRemaining(50)).toBe(50);
    });

    it('resets projected gold on clear', () => {
      manager.queueCardPlay({ card: { id: 'marine', cost: 10 }, cardIndex: 0, tileX: 5, tileY: 5 });
      manager.clear();
      expect(manager.getProjectedGoldRemaining(50)).toBe(50);
    });
  });

  describe('shutdown sequence', () => {
    it('resume before clear leaves manager unpaused with empty queues', () => {
      manager.pause();
      manager.queueOrder({ unitId: 'u1', type: 'move', targetX: 5, targetY: 5 });
      manager.queueCardPlay({ card: { id: 'marine' }, cardIndex: 0, tileX: 3, tileY: 3 });

      manager.resume();
      manager.clear();

      expect(manager.paused).toBe(false);
      expect(manager.orderCount).toBe(0);
    });

    it('emits game-resumed before clearing when shutdown while paused', () => {
      const events: string[] = [];
      EventBus.on('game-resumed', () => events.push('game-resumed'));
      EventBus.on('tactical-queue-cleared', () => events.push('tactical-queue-cleared'));

      manager.pause();
      manager.queueOrder({ unitId: 'u1', type: 'move', targetX: 5, targetY: 5 });

      // simulate the shutdown sequence from GameScene
      if (manager.paused) {
        manager.resume();
        EventBus.emit('game-resumed');
      }
      manager.clear();

      expect(events[0]).toBe('game-resumed');
      expect(events[1]).toBe('tactical-queue-cleared');
    });

    it('clear is safe to call when not paused', () => {
      manager.queueOrder({ unitId: 'u1', type: 'patrol', targetX: 0, targetY: 0 });
      expect(() => manager.clear()).not.toThrow();
      expect(manager.orderCount).toBe(0);
    });

    it('resume+clear on already-unpaused manager does not throw', () => {
      expect(manager.paused).toBe(false);
      expect(() => {
        if (manager.paused) {
          manager.resume();
          EventBus.emit('game-resumed');
        }
        manager.clear();
      }).not.toThrow();
    });
  });

  describe('all order types', () => {
    it.each(['move', 'attack', 'attack-move', 'patrol', 'gather'] as const)(
      'queues %s orders',
      (type) => {
        manager.queueOrder({ unitId: 'u1', type, targetX: 10, targetY: 10 });
        expect(manager.orderQueue[0].type).toBe(type);
      }
    );
  });
});
