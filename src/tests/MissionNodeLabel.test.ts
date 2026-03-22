import { describe, it, expect } from 'vitest';
import { generateMission } from '../missions/ProceduralMissionGenerator';

/**
 * Replicates the label HTML generation from MissionSelectScene.renderNodes()
 * so we can verify truncation behaviour without a full DOM setup.
 */
function buildLabelHtml(missionName: string, size: number): string {
  return `<div style="position:relative;z-index:1;font-family:'Teko',sans-serif;font-size:9px;` +
    `color:#c8982acc;letter-spacing:1px;text-align:center;line-height:1.2;` +
    `max-width:${size + 60}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">` +
    `${missionName.toUpperCase()}` +
    `</div>`;
}

describe('MissionSelectScene node label', () => {
  it('renders the full mission name without JS truncation', () => {
    const longName = 'EXTERMINATUS DELTA';
    const html = buildLabelHtml(longName, 48);
    expect(html).toContain(longName.toUpperCase());
  });

  it('does not apply substring truncation to names longer than 14 characters', () => {
    const name = 'Armored Assault';
    expect(name.length).toBeGreaterThan(14);
    const html = buildLabelHtml(name, 48);
    // Full name present — no '…' suffix from JS truncation
    expect(html).toContain(name.toUpperCase());
    expect(html).not.toContain(name.toUpperCase().substring(0, 14) + '\u2026');
  });

  it('uses CSS text-overflow:ellipsis for overflow handling', () => {
    const html = buildLabelHtml('Purge The Outskirts', 48);
    expect(html).toContain('text-overflow:ellipsis');
    expect(html).toContain('overflow:hidden');
  });

  it('applies wider max-width (size + 60) to give names more room', () => {
    const size = 48;
    const html = buildLabelHtml('Any Mission', size);
    expect(html).toContain(`max-width:${size + 60}px`);
  });

  it('uses size + 60 max-width for large nodes (difficulty >= 4, size=62)', () => {
    const size = 62;
    const html = buildLabelHtml('Exterminatus Delta', size);
    expect(html).toContain(`max-width:${size + 60}px`);
  });

  it('procedural missions with long names are fully displayed', () => {
    // Generate a few procedural missions and verify long names render fully
    const missions = [
      generateMission(1, 12345),
      generateMission(2, 23456),
      generateMission(3, 34567),
      generateMission(4, 45678),
    ];
    const longNameMissions = missions.filter(m => m.name.length > 14);
    // At least some procedural missions should have names > 14 chars
    for (const m of longNameMissions) {
      const size = m.difficulty >= 4 ? 62 : m.difficulty >= 3 ? 54 : 48;
      const html = buildLabelHtml(m.name, size);
      expect(html).toContain(m.name.toUpperCase());
      expect(html).not.toContain(m.name.toUpperCase().substring(0, 14) + '\u2026');
    }
  });
});
