import * as THREE from 'three';

/**
 * Procedural 3D meshes for all entity types.
 * Returns cached THREE.Group instances keyed by type string.
 */
export class EntityMeshFactory {
  private cache = new Map<string, THREE.Group>();

  /** Get (or create + cache) a mesh for the given entity type. Returns a clone. */
  create(type: string): THREE.Group {
    if (!this.cache.has(type)) {
      this.cache.set(type, this.buildMesh(type));
    }
    return this.cache.get(type)!.clone();
  }

  private buildMesh(type: string): THREE.Group {
    switch (type) {
      case 'unit-marine': return this.buildMarine();
      case 'unit-guardsman': return this.buildGuardsman();
      case 'unit-scout': return this.buildScout();
      case 'unit-servitor': return this.buildServitor();
      case 'unit-ork_boy': return this.buildOrkBoy();
      case 'unit-ork_shoota': return this.buildOrkShoota();
      case 'unit-ork_nob': return this.buildOrkNob();
      case 'building-drop_ship': return this.buildDropShip();
      case 'building-barracks': return this.buildBarracks();
      case 'building-tarantula': return this.buildTarantula();
      case 'building-aegis': return this.buildAegis();
      case 'building-sanctum': return this.buildSanctum();
      case 'unit-ogryn': return this.buildOgryn();
      case 'unit-techmarine': return this.buildTechmarine();
      case 'unit-rhino': return this.buildRhino();
      case 'unit-leman_russ': return this.buildLemanRuss();
      case 'unit-sentinel': return this.buildSentinel();
      case 'projectile': return this.buildProjectile();
      // Terrain decoration ruins
      case 'ruin-wall-segment': return this.buildRuinWallSegment();
      case 'ruin-hab-block': return this.buildRuinHabBlock();
      case 'ruin-column': return this.buildRuinColumn();
      case 'ruin-aquila-shrine': return this.buildRuinAquilaShrine();
      case 'ruin-barricade': return this.buildRuinBarricade();
      case 'ruin-crater': return this.buildRuinCrater();
      default: return this.buildDefault();
    }
  }

  private buildMarine(): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x2244aa });
    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.3), mat);
    body.position.y = 0.35;
    group.add(body);
    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat);
    head.position.y = 0.82;
    group.add(head);
    return group;
  }

  private buildGuardsman(): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xaa8844 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.25), mat);
    body.position.y = 0.25;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat);
    head.position.y = 0.6;
    group.add(head);
    return group;
  }

  private buildScout(): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x225522 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.55, 8), mat);
    body.position.y = 0.275;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat);
    head.position.y = 0.65;
    group.add(head);
    return group;
  }

  private buildServitor(): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x666666 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.3), mat);
    body.position.y = 0.2;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat);
    head.position.y = 0.5;
    group.add(head);
    return group;
  }

  private buildOrkBoy(): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x44aa22 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.4), mat);
    body.position.y = 0.3;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mat);
    head.position.y = 0.74;
    group.add(head);
    return group;
  }

  private buildOrkShoota(): THREE.Group {
    const group = this.buildOrkBoy();
    // Add gun cylinder
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6), gunMat);
    gun.rotation.z = Math.PI / 2;
    gun.position.set(0.35, 0.4, 0);
    group.add(gun);
    return group;
  }

  private buildOrkNob(): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x44aa22 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.5), mat);
    body.position.y = 0.4;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), mat);
    head.position.y = 0.97;
    group.add(head);
    return group;
  }

  private buildDropShip(): THREE.Group {
    const group = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x556677 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x334455 });
    const engineMat = new THREE.MeshStandardMaterial({ color: 0x443333, emissive: 0x331111, emissiveIntensity: 0.3 });
    const aquilaMat = new THREE.MeshStandardMaterial({ color: 0xdaa520 });

    // Main hull — elongated armored body (2x2 footprint)
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 1.8), hullMat);
    hull.position.set(0.5, 0.3, 0.5);
    group.add(hull);

    // Upper deck / cockpit
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, 0.8), accentMat);
    deck.position.set(0.5, 0.75, 0.2);
    group.add(deck);

    // Nose cone (angled front)
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.4), hullMat);
    nose.position.set(0.5, 0.4, -0.3);
    nose.rotation.x = -0.2;
    group.add(nose);

    // Engine nacelles (rear, left and right)
    const engineGeo = new THREE.CylinderGeometry(0.2, 0.25, 0.6, 8);
    for (const side of [-0.55, 0.55]) {
      const engine = new THREE.Mesh(engineGeo, engineMat);
      engine.rotation.x = Math.PI / 2;
      engine.position.set(0.5 + side, 0.35, 1.2);
      group.add(engine);
    }

    // Landing struts (4 legs)
    const strutGeo = new THREE.BoxGeometry(0.08, 0.2, 0.08);
    const strutOffsets = [[-0.6, -0.5], [-0.6, 0.9], [0.6, -0.5], [0.6, 0.9]];
    for (const [ox, oz] of strutOffsets) {
      const strut = new THREE.Mesh(strutGeo, accentMat);
      strut.position.set(0.5 + ox, 0.0, 0.5 + oz);
      group.add(strut);
    }

    // Aquila emblem (gold bar on top)
    const aquila = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.15), aquilaMat);
    aquila.position.set(0.5, 0.95, 0.2);
    group.add(aquila);

    // Ramp (rear, lowered)
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 0.5), hullMat);
    ramp.position.set(0.5, 0.05, 1.4);
    ramp.rotation.x = 0.15;
    group.add(ramp);

    return group;
  }

  private buildBarracks(): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x882222 });
    // Main body
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 1.3), mat);
    base.position.y = 0.35;
    group.add(base);
    // Peaked roof (cone)
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x553333 });
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.5, 4), roofMat);
    roof.position.y = 0.95;
    roof.rotation.y = Math.PI / 4;
    group.add(roof);
    return group;
  }

  private buildTarantula(): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x555555 });
    // Base box
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), mat);
    base.position.y = 0.15;
    group.add(base);
    // Turret barrel
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6), barrelMat);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.3, 0.35, 0);
    group.add(barrel);
    return group;
  }

  private buildAegis(): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x999999 });
    // Low wide wall
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.2), mat);
    wall.position.y = 0.2;
    group.add(wall);
    return group;
  }

  private buildOgryn(): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x8b7355 });
    // Massive body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.45), mat);
    body.position.y = 0.425;
    group.add(body);
    // Small head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mat);
    head.position.y = 0.98;
    group.add(head);
    // Shield arm
    const shieldMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.35), shieldMat);
    shield.position.set(-0.32, 0.45, 0);
    group.add(shield);
    return group;
  }

  private buildTechmarine(): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xaa2222 });
    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.65, 0.3), mat);
    body.position.y = 0.325;
    group.add(body);
    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), mat);
    head.position.y = 0.76;
    group.add(head);
    // Servo arm (cylinder on back)
    const servoMat = new THREE.MeshStandardMaterial({ color: 0x666666 });
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), servoMat);
    arm.rotation.z = Math.PI / 4;
    arm.position.set(0, 0.7, -0.2);
    group.add(arm);
    return group;
  }

  private buildSanctum(): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xccccaa });
    // Base shrine
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), mat);
    base.position.y = 0.3;
    group.add(base);
    // Spire
    const spireMat = new THREE.MeshStandardMaterial({ color: 0xdaa520 });
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 6), spireMat);
    spire.position.y = 0.9;
    group.add(spire);
    return group;
  }

  private buildRhino(): THREE.Group {
    const group = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x2244aa });
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    // Hull — boxy armored transport
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 1.0), hullMat);
    hull.position.set(0, 0.3, 0);
    group.add(hull);
    // Upper hull
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.6), hullMat);
    upper.position.set(0, 0.55, -0.1);
    group.add(upper);
    // Tracks (left + right)
    for (const side of [-0.4, 0.4]) {
      const track = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 1.0), trackMat);
      track.position.set(side, 0.1, 0);
      group.add(track);
    }
    // Storm bolter (small turret gun on top)
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.25, 6), gunMat);
    gun.rotation.x = Math.PI / 2;
    gun.position.set(0, 0.65, -0.3);
    group.add(gun);
    return group;
  }

  private buildLemanRuss(): THREE.Group {
    const group = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x556b2f });
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const turretMat = new THREE.MeshStandardMaterial({ color: 0x4a5a2a });
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    // Hull — wide and low
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 1.2), hullMat);
    hull.position.set(0, 0.25, 0);
    group.add(hull);
    // Tracks (left + right, chunky)
    for (const side of [-0.5, 0.5]) {
      const track = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.25, 1.3), trackMat);
      track.position.set(side, 0.12, 0);
      group.add(track);
    }
    // Turret block
    const turret = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.5), turretMat);
    turret.position.set(0, 0.55, -0.05);
    group.add(turret);
    // Battle cannon barrel
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.7, 8), barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.55, -0.6);
    group.add(barrel);
    // Hull-mounted lascannon
    const lascannon = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), barrelMat);
    lascannon.rotation.x = Math.PI / 2;
    lascannon.position.set(0, 0.25, -0.75);
    group.add(lascannon);
    return group;
  }

  private buildSentinel(): THREE.Group {
    const group = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x888855 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x666644 });
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    // Cockpit (small boxy cabin, elevated)
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.35), frameMat);
    cabin.position.set(0, 0.7, 0);
    group.add(cabin);
    // Legs (two angled struts)
    for (const side of [-0.15, 0.15]) {
      // Upper leg
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), legMat);
      upper.position.set(side, 0.4, 0.05);
      upper.rotation.z = side > 0 ? -0.15 : 0.15;
      group.add(upper);
      // Lower leg (angled forward)
      const lower = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.06), legMat);
      lower.position.set(side * 1.3, 0.1, -0.08);
      lower.rotation.z = side > 0 ? 0.3 : -0.3;
      group.add(lower);
      // Foot
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.12), legMat);
      foot.position.set(side * 1.5, 0.02, -0.08);
      group.add(foot);
    }
    // Multilaser
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 6), gunMat);
    gun.rotation.x = Math.PI / 2;
    gun.position.set(0.22, 0.7, -0.25);
    group.add(gun);
    return group;
  }

  // ── Ruin / Decoration Meshes ──

  private buildRuinWallSegment(): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x777766, roughness: 0.95 });
    // Base wall section
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.12), mat);
    base.position.y = 0.2;
    group.add(base);
    // Upper broken section (offset, shorter)
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.12), mat);
    upper.position.set(-0.1, 0.53, 0);
    group.add(upper);
    // Small rubble piece at base
    const rubbleMat = new THREE.MeshStandardMaterial({ color: 0x666655, roughness: 0.98 });
    const rubble = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.1), rubbleMat);
    rubble.position.set(0.25, 0.04, 0.1);
    rubble.rotation.y = 0.3;
    group.add(rubble);
    return group;
  }

  private buildRuinHabBlock(): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x6a6a5e, roughness: 0.93 });
    const rubbleMat = new THREE.MeshStandardMaterial({ color: 0x5a5a50, roughness: 0.97 });
    // L-shaped wall arrangement
    const wallA = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.12), mat);
    wallA.position.set(0, 0.3, -0.3);
    group.add(wallA);
    const wallB = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.5), mat);
    wallB.position.set(-0.34, 0.225, 0);
    group.add(wallB);
    // Rubble scatter
    for (let i = 0; i < 4; i++) {
      const s = 0.06 + Math.random() * 0.08;
      const rb = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.6, s), rubbleMat);
      rb.position.set((Math.random() - 0.5) * 0.5, s * 0.3, (Math.random() - 0.3) * 0.4);
      rb.rotation.y = Math.random() * Math.PI;
      group.add(rb);
    }
    return group;
  }

  private buildRuinColumn(): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x888880, roughness: 0.9 });
    // Standing broken column
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.55, 8), mat);
    col.position.y = 0.275;
    group.add(col);
    // Fallen column segment on ground
    const fallen = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.35, 8), mat);
    fallen.rotation.z = Math.PI / 2;
    fallen.position.set(0.25, 0.07, 0.1);
    group.add(fallen);
    return group;
  }

  private buildRuinAquilaShrine(): THREE.Group {
    const group = new THREE.Group();
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7a7a70, roughness: 0.92 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xaa8822, roughness: 0.6, emissive: 0x221100, emissiveIntensity: 0.15 });
    // Base pedestal
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.35), stoneMat);
    base.position.y = 0.15;
    group.add(base);
    // Broken triangular top (wedge approximated by scaled box)
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.2, 3), stoneMat);
    top.position.y = 0.42;
    top.rotation.y = Math.PI / 6;
    group.add(top);
    // Gold aquila accent
    const aquila = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 0.08), goldMat);
    aquila.position.y = 0.32;
    group.add(aquila);
    return group;
  }

  private buildRuinBarricade(): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.97 });
    // Sandbag/rubble pile — cluster of squashed boxes
    for (let i = 0; i < 5; i++) {
      const w = 0.12 + Math.random() * 0.1;
      const h = 0.06 + Math.random() * 0.06;
      const d = 0.1 + Math.random() * 0.08;
      const bag = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      bag.position.set(
        (Math.random() - 0.5) * 0.3,
        h / 2 + (i > 2 ? 0.08 : 0),
        (Math.random() - 0.5) * 0.15
      );
      bag.rotation.y = Math.random() * 0.5;
      group.add(bag);
    }
    return group;
  }

  private buildRuinCrater(): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a3530, roughness: 0.98 });
    // Inverted shallow cone sunk into ground
    const crater = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.12, 12), mat);
    crater.rotation.x = Math.PI; // flip upside down
    crater.position.y = 0.0;
    group.add(crater);
    // Rim ring
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x4a4540, roughness: 0.95 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.04, 6, 12), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.02;
    group.add(rim);
    return group;
  }

  private buildProjectile(): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffff44, emissive: 0xffaa00, emissiveIntensity: 0.5 });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), mat);
    group.add(sphere);
    return group;
  }

  private buildDefault(): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xff00ff });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), mat);
    box.position.y = 0.15;
    group.add(box);
    return group;
  }

  dispose(): void {
    for (const group of this.cache.values()) {
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
    }
    this.cache.clear();
  }
}
