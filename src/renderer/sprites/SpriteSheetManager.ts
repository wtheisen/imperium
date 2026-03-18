import * as THREE from 'three';
import { SpriteSheetConfig, SPRITE_UNIT_TYPES } from './SpriteSheetConfig';
import { generatePlaceholderSheet } from './PlaceholderSpriteGenerator';

/**
 * Holds all SpriteSheetConfigs keyed by `unitType`.
 * Generates placeholder sprite sheets at startup and supports
 * swapping in real sprite art later.
 */
export class SpriteSheetManager {
  private configs = new Map<string, SpriteSheetConfig>();

  /** Generate placeholder sprite sheets for all infantry unit types. */
  generatePlaceholders(): void {
    for (const unitType of SPRITE_UNIT_TYPES) {
      // Generate both player and enemy variants — for now use player variant
      // Enemy tinting is handled via SpriteBillboard.setTint() at render time
      const { config } = generatePlaceholderSheet(unitType, 'player');
      this.configs.set(unitType, config);
    }
  }

  /** Look up the sprite sheet config for a unit type. */
  getConfig(unitType: string): SpriteSheetConfig | undefined {
    return this.configs.get(unitType);
  }

  /** Load a real sprite sheet from a URL, replacing the placeholder texture and dimensions. */
  loadSheet(
    unitType: string,
    url: string,
    overrides?: { frameWidth?: number; frameHeight?: number; columns?: number; rows?: number }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        url,
        (texture) => {
          texture.magFilter = THREE.NearestFilter;
          texture.minFilter = THREE.NearestFilter;
          texture.colorSpace = THREE.SRGBColorSpace;

          const existing = this.configs.get(unitType);
          if (existing) {
            // Dispose old texture
            existing.texture.dispose();
            existing.texture = texture;
            // Apply dimension overrides if the real sheet differs from placeholder
            if (overrides?.frameWidth) existing.frameWidth = overrides.frameWidth;
            if (overrides?.frameHeight) existing.frameHeight = overrides.frameHeight;
            if (overrides?.columns) existing.columns = overrides.columns;
            if (overrides?.rows) existing.rows = overrides.rows;
          }
          resolve();
        },
        undefined,
        reject
      );
    });
  }

  /** Load all real sprite sheets that exist in public/sprites/. */
  async loadRealSheets(): Promise<void> {
    // Map of unit types that have real sprite sheets available
    const realSheets: { unitType: string; url: string; frameWidth: number; frameHeight: number }[] = [
      { unitType: 'marine', url: 'sprites/marine.png', frameWidth: 88, frameHeight: 96 },
    ];

    const promises = realSheets.map(({ unitType, url, frameWidth, frameHeight }) =>
      this.loadSheet(unitType, url, { frameWidth, frameHeight }).catch((err) => {
        console.warn(`Failed to load sprite sheet for ${unitType}:`, err);
      })
    );

    await Promise.all(promises);
  }

  dispose(): void {
    for (const config of this.configs.values()) {
      config.texture.dispose();
    }
    this.configs.clear();
  }
}
