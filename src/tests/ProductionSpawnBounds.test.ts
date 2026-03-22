import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventBus } from '../EventBus';
import { Building } from '../entities/Building';
import { ProductionComponent, TRAINABLE_UNITS } from '../components/ProductionComponent';
import { IsoHelper } from '../map/IsoHelper';

const BUILDING_STATS = { maxHp: 100, tileWidth: 2, tileHeight: 2 };

function trainedPayload(tileX: number, tileY: number) {
  const building = new Building(tileX, tileY, 'barracks', BUILDING_STATS);
  const prod = new ProductionComponent(building);
  const unit = TRAINABLE_UNITS[0];
  const emitSpy = vi.spyOn(EventBus, 'emit');
  prod.queueUnit(unit);
  prod.update(unit.buildTime);
  const call = emitSpy.mock.calls.find(c => c[0] === 'unit-trained');
  return call?.[1] as { tileX: number; tileY: number } | undefined;
}

describe('ProductionComponent spawnUnit bounds', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    EventBus.removeAllListeners();
  });

  it('spawns at a valid neighboring tile for a mid-map building', () => {
    const payload = trainedPayload(5, 5);
    expect(payload).toBeDefined();
    expect(IsoHelper.isInBounds(payload!.tileX, payload!.tileY)).toBe(true);
  });

  it('still finds a valid offset for a building at the (0,0) corner', () => {
    // Negative offsets (-1,0) etc. are out of bounds, but positive offsets (2,0) etc. are valid
    const payload = trainedPayload(0, 0);
    expect(payload).toBeDefined();
    expect(IsoHelper.isInBounds(payload!.tileX, payload!.tileY)).toBe(true);
  });

  it('falls back to the building tile when no offset is in-bounds', () => {
    // Force all offset checks to fail so the default path is exercised
    vi.spyOn(IsoHelper, 'isInBounds').mockReturnValue(false);

    const payload = trainedPayload(3, 7);
    expect(payload).toBeDefined();
    // Must fall back to the building's own tile, not (bx-1, by) = (2, 7)
    expect(payload!.tileX).toBe(3);
    expect(payload!.tileY).toBe(7);
  });

  it('fallback is never a negative coordinate', () => {
    vi.spyOn(IsoHelper, 'isInBounds').mockReturnValue(false);

    const payload = trainedPayload(0, 0);
    expect(payload).toBeDefined();
    expect(payload!.tileX).toBeGreaterThanOrEqual(0);
    expect(payload!.tileY).toBeGreaterThanOrEqual(0);
  });
});
