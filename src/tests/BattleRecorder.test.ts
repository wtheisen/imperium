import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BattleRecorder } from '../systems/BattleRecorder';
import { EventBus } from '../EventBus';
import { Unit } from '../entities/Unit';

function makeUnit(team: 'player' | 'enemy', unitType: string): Unit {
  return new Unit(0, 0, unitType, {
    maxHp: 100, speed: 1, attackDamage: 10, attackRange: 1, attackCooldown: 1, isRanged: false,
  }, team);
}

describe('BattleRecorder', () => {
  let recorder: BattleRecorder;

  beforeEach(() => {
    recorder = new BattleRecorder();
  });

  afterEach(() => {
    recorder.destroy();
    EventBus.removeAllListeners();
  });

  describe('kill tracking', () => {
    it('records kills in timeline', () => {
      const killer = makeUnit('player', 'marine');
      const victim = makeUnit('enemy', 'ork_boy');

      EventBus.emit('entity-died', { entity: victim, killer });

      const report = recorder.getReport();
      expect(report.killTimeline).toHaveLength(1);
      expect(report.killTimeline[0].killerType).toBe('marine');
      expect(report.killTimeline[0].victimType).toBe('ork_boy');
      expect(report.killTimeline[0].killerTeam).toBe('player');
      expect(report.killTimeline[0].victimTeam).toBe('enemy');
    });

    it('identifies MVP unit type by kills', () => {
      const marine = makeUnit('player', 'marine');
      const scout = makeUnit('player', 'scout');

      // Marine gets 3 kills, scout gets 1
      for (let i = 0; i < 3; i++) {
        EventBus.emit('entity-died', { entity: makeUnit('enemy', 'ork_boy'), killer: marine });
      }
      EventBus.emit('entity-died', { entity: makeUnit('enemy', 'ork_boy'), killer: scout });

      const report = recorder.getReport();
      expect(report.mvpUnitType).toBe('marine');
      expect(report.mvpKills).toBe(3);
    });

    it('tracks units lost for player', () => {
      const playerUnit = makeUnit('player', 'guardsman');
      EventBus.emit('entity-died', { entity: playerUnit, killer: makeUnit('enemy', 'ork_boy') });

      const report = recorder.getReport();
      expect(report.unitsLost['guardsman']).toBe(1);
    });

    it('handles death with no killer', () => {
      const victim = makeUnit('enemy', 'ork_boy');
      EventBus.emit('entity-died', { entity: victim });

      const report = recorder.getReport();
      expect(report.killTimeline).toHaveLength(1);
      expect(report.killTimeline[0].killerType).toBe('unknown');
      expect(report.killTimeline[0].killerTeam).toBe('unknown');
    });
  });

  describe('damage tracking', () => {
    it('tracks damage dealt by player units', () => {
      const attacker = makeUnit('player', 'marine');
      const target = makeUnit('enemy', 'ork_boy');

      EventBus.emit('damage-dealt', { attacker, target, amount: 25 });
      EventBus.emit('damage-dealt', { attacker, target, amount: 15 });

      const report = recorder.getReport();
      expect(report.damageDealt['marine']).toBe(40);
    });

    it('tracks damage taken by player units', () => {
      const attacker = makeUnit('enemy', 'ork_boy');
      const target = makeUnit('player', 'guardsman');

      EventBus.emit('damage-dealt', { attacker, target, amount: 30 });

      const report = recorder.getReport();
      expect(report.damageTaken['guardsman']).toBe(30);
    });

    it('ignores enemy-on-enemy damage for dealt tracking', () => {
      const attacker = makeUnit('enemy', 'ork_boy');
      const target = makeUnit('enemy', 'ork_nob');

      EventBus.emit('damage-dealt', { attacker, target, amount: 10 });

      const report = recorder.getReport();
      expect(report.damageDealt).toEqual({});
    });
  });

  describe('gold source tracking', () => {
    it('attributes gold to mining when gold-gathered fires', () => {
      EventBus.emit('gold-gathered', { amount: 10 });
      EventBus.emit('gold-changed', { amount: 10, total: 110 });

      const report = recorder.getReport();
      expect(report.goldBySource.mines).toBe(10);
      expect(report.totalGoldEarned).toBe(10);
    });

    it('attributes gold to objectives', () => {
      EventBus.emit('objective-completed', { objectiveId: 'obj1', goldReward: 15, cardDraws: 2 });
      EventBus.emit('gold-changed', { amount: 15, total: 115 });

      const report = recorder.getReport();
      expect(report.goldBySource.objectives).toBe(15);
    });

    it('attributes gold to supply drops', () => {
      EventBus.emit('supply-drop', { gold: 20, cardDraws: 1 });
      EventBus.emit('gold-changed', { amount: 20, total: 120 });

      const report = recorder.getReport();
      expect(report.goldBySource.supplyDrops).toBe(20);
    });

    it('ignores negative gold changes (spending)', () => {
      EventBus.emit('gold-changed', { amount: -10, total: 90 });

      const report = recorder.getReport();
      expect(report.totalGoldEarned).toBe(0);
    });
  });

  describe('card play tracking', () => {
    it('records card plays with cost', () => {
      const card = { id: 'marine', name: 'Space Marine', type: 'unit' as const, cost: 8, description: '', entityType: 'marine' };
      EventBus.emit('card-played', { card, cardIndex: 0, tileX: 5, tileY: 5 });
      EventBus.emit('card-played', { card, cardIndex: 1, tileX: 6, tileY: 6 });

      const report = recorder.getReport();
      expect(report.cardPlays['marine'].count).toBe(2);
      expect(report.cardPlays['marine'].totalCost).toBe(16);
    });

    it('tracks unit deployments from cards', () => {
      const card = { id: 'marine', name: 'Space Marine', type: 'unit' as const, cost: 8, description: '', entityType: 'marine' };
      EventBus.emit('card-played', { card, cardIndex: 0, tileX: 5, tileY: 5 });

      const report = recorder.getReport();
      expect(report.unitsDeployed['marine']).toBe(1);
    });

    it('does not track deployments for non-unit cards', () => {
      const card = { id: 'frag', name: 'Frag Grenade', type: 'ordnance' as const, cost: 3, description: '' };
      EventBus.emit('card-played', { card, cardIndex: 0, tileX: 5, tileY: 5 });

      const report = recorder.getReport();
      expect(report.unitsDeployed).toEqual({});
      expect(report.cardPlays['frag'].count).toBe(1);
    });
  });

  describe('report generation', () => {
    it('returns empty report when no events fired', () => {
      const report = recorder.getReport();
      expect(report.killTimeline).toEqual([]);
      expect(report.damageDealt).toEqual({});
      expect(report.damageTaken).toEqual({});
      expect(report.totalGoldEarned).toBe(0);
      expect(report.mvpUnitType).toBeNull();
      expect(report.mvpKills).toBe(0);
      expect(report.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns live references (caller must not mutate after getReport)', () => {
      const report1 = recorder.getReport();
      EventBus.emit('entity-died', { entity: makeUnit('enemy', 'ork_boy'), killer: makeUnit('player', 'marine') });
      const report2 = recorder.getReport();

      // Both reports share the same underlying array since BattleRecorder is destroyed
      // immediately after getReport() is called in production — no defensive copy needed.
      expect(report1.killTimeline).toHaveLength(1);
      expect(report2.killTimeline).toHaveLength(1);
      expect(report1.killTimeline).toBe(report2.killTimeline);
    });
  });

  describe('cleanup', () => {
    it('stops listening after destroy', () => {
      recorder.destroy();
      EventBus.emit('entity-died', { entity: makeUnit('enemy', 'ork_boy'), killer: makeUnit('player', 'marine') });

      const report = recorder.getReport();
      expect(report.killTimeline).toHaveLength(0);
    });
  });
});
