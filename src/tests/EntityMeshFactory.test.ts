import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { EntityMeshFactory } from '../renderer/EntityMeshFactory';

describe('EntityMeshFactory', () => {
  let factory: EntityMeshFactory;

  afterEach(() => {
    factory?.dispose();
  });

  function meshChildren(group: THREE.Group): THREE.Mesh[] {
    return group.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
  }

  describe('humanoid units share body+head pattern', () => {
    const cases: { type: string; bodyH: number; headR: number; childCount: number }[] = [
      { type: 'unit-marine', bodyH: 0.7, headR: 0.12, childCount: 2 },
      { type: 'unit-guardsman', bodyH: 0.5, headR: 0.1, childCount: 2 },
      { type: 'unit-servitor', bodyH: 0.4, headR: 0.1, childCount: 2 },
      { type: 'unit-ork_boy', bodyH: 0.6, headR: 0.14, childCount: 2 },
      { type: 'unit-ork_nob', bodyH: 0.8, headR: 0.17, childCount: 2 },
    ];

    for (const { type, bodyH, headR, childCount } of cases) {
      it(`${type} has body at y=${bodyH / 2} and head at y=${bodyH + headR}`, () => {
        factory = new EntityMeshFactory();
        const group = factory.create(type);
        const meshes = meshChildren(group);
        expect(meshes).toHaveLength(childCount);

        const body = meshes[0];
        expect(body.position.y).toBeCloseTo(bodyH / 2);
        expect(body.geometry).toBeInstanceOf(THREE.BoxGeometry);

        const head = meshes[1];
        expect(head.position.y).toBeCloseTo(bodyH + headR);
        expect(head.geometry).toBeInstanceOf(THREE.SphereGeometry);
      });
    }
  });

  it('scout uses cylinder body, not box', () => {
    factory = new EntityMeshFactory();
    const group = factory.create('unit-scout');
    const meshes = meshChildren(group);
    expect(meshes).toHaveLength(2);
    expect(meshes[0].geometry).toBeInstanceOf(THREE.CylinderGeometry);
    expect(meshes[1].geometry).toBeInstanceOf(THREE.SphereGeometry);
  });

  it('ogryn has body + head + shield (3 meshes)', () => {
    factory = new EntityMeshFactory();
    const group = factory.create('unit-ogryn');
    const meshes = meshChildren(group);
    expect(meshes).toHaveLength(3);
    // Shield is a box at x=-0.32
    const shield = meshes[2];
    expect(shield.geometry).toBeInstanceOf(THREE.BoxGeometry);
    expect(shield.position.x).toBeCloseTo(-0.32);
  });

  it('techmarine has body + head + servo arm (3 meshes)', () => {
    factory = new EntityMeshFactory();
    const group = factory.create('unit-techmarine');
    const meshes = meshChildren(group);
    expect(meshes).toHaveLength(3);
    // Servo arm is a cylinder at z=-0.2
    const arm = meshes[2];
    expect(arm.geometry).toBeInstanceOf(THREE.CylinderGeometry);
    expect(arm.position.z).toBeCloseTo(-0.2);
  });

  it('ork_shoota delegates to ork_boy and adds gun (3 meshes)', () => {
    factory = new EntityMeshFactory();
    const group = factory.create('unit-ork_shoota');
    const meshes = meshChildren(group);
    expect(meshes).toHaveLength(3);
    // Gun cylinder at x=0.35
    const gun = meshes[2];
    expect(gun.geometry).toBeInstanceOf(THREE.CylinderGeometry);
    expect(gun.position.x).toBeCloseTo(0.35);
  });

  it('returns cloned groups (not the same reference)', () => {
    factory = new EntityMeshFactory();
    const a = factory.create('unit-marine');
    const b = factory.create('unit-marine');
    expect(a).not.toBe(b);
  });
});
