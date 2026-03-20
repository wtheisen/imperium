import { describe, it, expect, vi } from 'vitest';
import { Entity, Component } from '../entities/Entity';

function mockComponent(): Component {
  return { update: vi.fn(), destroy: vi.fn() };
}

describe('Entity', () => {
  it('has unique entityId', () => {
    const a = new Entity(0, 0);
    const b = new Entity(0, 0);
    expect(a.entityId).not.toBe(b.entityId);
  });

  it('starts active and visible', () => {
    const e = new Entity(5, 10);
    expect(e.active).toBe(true);
    expect(e.visible).toBe(true);
  });

  it('sets tile and screen positions', () => {
    const e = new Entity(3, 7, 'enemy');
    expect(e.tileX).toBe(3);
    expect(e.tileY).toBe(7);
    expect(e.team).toBe('enemy');
  });

  describe('components', () => {
    it('add and get component', () => {
      const e = new Entity(0, 0);
      const comp = mockComponent();
      e.addComponent('test', comp);
      expect(e.getComponent('test')).toBe(comp);
      expect(e.hasComponent('test')).toBe(true);
    });

    it('getComponent returns undefined for missing', () => {
      const e = new Entity(0, 0);
      expect(e.getComponent('nope')).toBeUndefined();
      expect(e.hasComponent('nope')).toBe(false);
    });

    it('removeComponent calls destroy', () => {
      const e = new Entity(0, 0);
      const comp = mockComponent();
      e.addComponent('x', comp);
      e.removeComponent('x');
      expect(comp.destroy).toHaveBeenCalled();
      expect(e.hasComponent('x')).toBe(false);
    });

    it('updateComponents calls update on all', () => {
      const e = new Entity(0, 0);
      const c1 = mockComponent();
      const c2 = mockComponent();
      e.addComponent('a', c1);
      e.addComponent('b', c2);
      e.updateComponents(16);
      expect(c1.update).toHaveBeenCalledWith(16);
      expect(c2.update).toHaveBeenCalledWith(16);
    });
  });

  describe('data store', () => {
    it('set and get data', () => {
      const e = new Entity(0, 0);
      e.setData('foo', 42);
      expect(e.getData('foo')).toBe(42);
    });

    it('returns null for missing key', () => {
      const e = new Entity(0, 0);
      expect(e.getData('missing')).toBeNull();
    });
  });

  describe('destroyEntity', () => {
    it('destroys all components and sets inactive', () => {
      const e = new Entity(0, 0);
      const c1 = mockComponent();
      const c2 = mockComponent();
      e.addComponent('a', c1);
      e.addComponent('b', c2);
      e.destroyEntity();
      expect(c1.destroy).toHaveBeenCalled();
      expect(c2.destroy).toHaveBeenCalled();
      expect(e.active).toBe(false);
      expect(e.hasComponent('a')).toBe(false);
    });
  });

});
