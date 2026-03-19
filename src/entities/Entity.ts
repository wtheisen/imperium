export interface Component {
  update(delta: number): void;
  destroy(): void;
}

export type EntityTeam = 'player' | 'enemy';

let entityCounter = 0;

export class Entity {
  public entityId: string;
  public tileX: number;
  public tileY: number;
  public team: EntityTeam;
  public active: boolean = true;
  public visible: boolean = true;
  /** Facing direction in radians (0 = +Z / south, increases clockwise) */
  public facing: number = 0;
  protected components: Map<string, Component> = new Map();

  constructor(
    tileX: number,
    tileY: number,
    team: EntityTeam = 'player'
  ) {
    this.entityId = `e-${++entityCounter}-${Math.random().toString(36).slice(2, 8)}`;
    this.tileX = tileX;
    this.tileY = tileY;
    this.team = team;
  }

  addComponent(name: string, component: Component): void {
    this.components.set(name, component);
  }

  getComponent<T extends Component>(name: string): T | undefined {
    return this.components.get(name) as T | undefined;
  }

  hasComponent(name: string): boolean {
    return this.components.has(name);
  }

  removeComponent(name: string): void {
    const c = this.components.get(name);
    if (c) {
      c.destroy();
      this.components.delete(name);
    }
  }

  updateComponents(delta: number): void {
    for (const component of this.components.values()) {
      component.update(delta);
    }
  }

  /** Arbitrary data store (replaces Phaser's getData/setData) */
  private dataStore: Map<string, unknown> = new Map();
  getData(key: string): unknown {
    return this.dataStore.get(key) ?? null;
  }
  setData(key: string, value: unknown): void {
    this.dataStore.set(key, value);
  }

  destroyEntity(): void {
    for (const component of this.components.values()) {
      component.destroy();
    }
    this.components.clear();
    this.active = false;
  }
}
