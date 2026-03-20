import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MissionSystem } from '../systems/MissionSystem';
import { EventBus } from '../EventBus';
import { EXTRACTION_WAVE_INTERVAL_MS } from '../config';
import { MissionDefinition } from '../missions/MissionDefinition';

function mockEntityManager() {
  return {
    getUnits: vi.fn().mockReturnValue([]),
    getBuildings: vi.fn().mockReturnValue([]),
    destroy: vi.fn(),
  } as any;
}

const minimalMission: MissionDefinition = {
  id: 'test',
  name: 'Test Mission',
  description: '',
  difficulty: 1,
  objectives: [],
  enemyCamps: [],
  playerStartX: 5,
  playerStartY: 5,
  startingGold: 0,
  supplyDropIntervalMs: 999999,
  extractionTimerMs: 60000,
};

describe('MissionSystem extraction wave interval', () => {
  let system: MissionSystem;

  beforeEach(() => {
    system = new MissionSystem(mockEntityManager(), minimalMission);
    system.state = 'EXTRACTION';
  });

  afterEach(() => {
    EventBus.removeAllListeners();
  });

  it('does not emit extraction-wave-spawn before EXTRACTION_WAVE_INTERVAL_MS', () => {
    const handler = vi.fn();
    EventBus.on('extraction-wave-spawn', handler);

    system.update(EXTRACTION_WAVE_INTERVAL_MS - 1);

    expect(handler).not.toHaveBeenCalled();
  });

  it('emits extraction-wave-spawn exactly at EXTRACTION_WAVE_INTERVAL_MS', () => {
    const handler = vi.fn();
    EventBus.on('extraction-wave-spawn', handler);

    system.update(EXTRACTION_WAVE_INTERVAL_MS);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({
      tileX: minimalMission.playerStartX,
      tileY: minimalMission.playerStartY,
    });
  });

  it('emits a second wave after two intervals', () => {
    const handler = vi.fn();
    EventBus.on('extraction-wave-spawn', handler);

    system.update(EXTRACTION_WAVE_INTERVAL_MS);
    system.update(EXTRACTION_WAVE_INTERVAL_MS);

    expect(handler).toHaveBeenCalledTimes(2);
  });
});
