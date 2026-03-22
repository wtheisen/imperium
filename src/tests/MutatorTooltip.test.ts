import { describe, it, expect } from 'vitest';
import { MODIFIER_META } from '../systems/EnvironmentModifierSystem';

describe('Mutator tooltip metadata', () => {
  it('every modifier has a non-empty name for tooltip display', () => {
    for (const m of MODIFIER_META) {
      expect(m.name, `${m.id} missing name`).toBeTruthy();
    }
  });

  it('every modifier has a non-empty description for tooltip display', () => {
    for (const m of MODIFIER_META) {
      expect(m.description, `${m.id} missing description`).toBeTruthy();
    }
  });

  it('every modifier has a non-empty icon for the button face', () => {
    for (const m of MODIFIER_META) {
      expect(m.icon, `${m.id} missing icon`).toBeTruthy();
    }
  });

  it('tooltip attribute text is formatted as "Name: description"', () => {
    for (const m of MODIFIER_META) {
      const tooltipText = `${m.name}: ${m.description}`;
      expect(tooltipText).toMatch(/^.+: .+$/);
    }
  });

  it('tooltip text does not contain unescaped double-quotes that would break the HTML attribute', () => {
    for (const m of MODIFIER_META) {
      const tooltipText = `${m.name}: ${m.description}`;
      expect(tooltipText, `${m.id} tooltip contains raw double-quote`).not.toContain('"');
    }
  });

  it('covers all 15 modifiers', () => {
    expect(MODIFIER_META).toHaveLength(15);
  });
});
