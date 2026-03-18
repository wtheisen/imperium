import * as THREE from 'three';
import { SpriteSheetConfig, SpriteAnimName } from './SpriteSheetConfig';

/** Per-unit-type visual config for placeholder silhouettes. */
interface UnitSilhouette {
  bodyColor: string;
  bodyWidth: number;
  bodyHeight: number;
  headRadius: number;
  /** Weapon indicator: 'sword', 'gun', 'tool', 'shield', 'claw', 'none' */
  weapon: string;
  /** World-space height for the billboard. */
  worldHeight: number;
}

const UNIT_SILHOUETTES: Record<string, UnitSilhouette> = {
  marine:     { bodyColor: '#2244aa', bodyWidth: 22, bodyHeight: 32, headRadius: 7, weapon: 'sword',  worldHeight: 0.9 },
  guardsman:  { bodyColor: '#aa8844', bodyWidth: 18, bodyHeight: 26, headRadius: 6, weapon: 'gun',    worldHeight: 0.7 },
  scout:      { bodyColor: '#225522', bodyWidth: 16, bodyHeight: 28, headRadius: 5, weapon: 'gun',    worldHeight: 0.75 },
  servitor:   { bodyColor: '#666666', bodyWidth: 20, bodyHeight: 22, headRadius: 6, weapon: 'tool',   worldHeight: 0.6 },
  ork_boy:    { bodyColor: '#44aa22', bodyWidth: 24, bodyHeight: 30, headRadius: 8, weapon: 'claw',   worldHeight: 0.85 },
  ork_shoota: { bodyColor: '#44aa22', bodyWidth: 22, bodyHeight: 28, headRadius: 7, weapon: 'gun',    worldHeight: 0.8 },
  ork_nob:    { bodyColor: '#44aa22', bodyWidth: 28, bodyHeight: 36, headRadius: 9, weapon: 'claw',   worldHeight: 1.0 },
  ogryn:      { bodyColor: '#8b7355', bodyWidth: 28, bodyHeight: 38, headRadius: 7, weapon: 'shield', worldHeight: 1.1 },
  techmarine: { bodyColor: '#aa2222', bodyWidth: 20, bodyHeight: 30, headRadius: 6, weapon: 'tool',   worldHeight: 0.85 },
};

const FRAME_W = 64;
const FRAME_H = 64;
const COLS = 16; // 4 anims x 4 frames each
const ROWS = 8;  // 8 directions

/**
 * Generates a placeholder sprite sheet atlas using canvas 2D drawing.
 * Each atlas: 8 rows (directions) x 16 columns (4 frames x 4 animations).
 * Draws colored silhouettes with directional indicators and simple animation.
 */
export function generatePlaceholderSheet(
  unitType: string,
  team: 'player' | 'enemy'
): { canvas: HTMLCanvasElement; config: SpriteSheetConfig } {
  const sil = UNIT_SILHOUETTES[unitType];
  if (!sil) throw new Error(`No silhouette config for unit type: ${unitType}`);

  const canvas = document.createElement('canvas');
  canvas.width = COLS * FRAME_W;
  canvas.height = ROWS * FRAME_H;
  const ctx = canvas.getContext('2d')!;

  // Team tint overlay
  const teamTint = team === 'player' ? 'rgba(100,150,255,0.15)' : 'rgba(255,80,80,0.15)';

  const animations: Record<SpriteAnimName, { startCol: number; frameCount: number; frameDuration: number; loop: boolean }> = {
    idle:   { startCol: 0,  frameCount: 4, frameDuration: 400, loop: true },
    walk:   { startCol: 4,  frameCount: 4, frameDuration: 150, loop: true },
    attack: { startCol: 8,  frameCount: 4, frameDuration: 120, loop: false },
    death:  { startCol: 12, frameCount: 4, frameDuration: 200, loop: false },
  };

  for (let dir = 0; dir < 8; dir++) {
    for (const [animName, animDef] of Object.entries(animations) as [SpriteAnimName, typeof animations['idle']][]) {
      for (let frame = 0; frame < animDef.frameCount; frame++) {
        const col = animDef.startCol + frame;
        const x0 = col * FRAME_W;
        const y0 = dir * FRAME_H;

        ctx.save();
        ctx.translate(x0, y0);
        drawFrame(ctx, sil, dir, animName, frame, teamTint);
        ctx.restore();
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;

  return {
    canvas,
    config: {
      unitType,
      texture,
      columns: COLS,
      rows: ROWS,
      frameWidth: FRAME_W,
      frameHeight: FRAME_H,
      animations,
      worldHeight: sil.worldHeight,
    },
  };
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  sil: UnitSilhouette,
  direction: number,
  anim: SpriteAnimName,
  frame: number,
  teamTint: string
): void {
  const cx = FRAME_W / 2;
  const groundY = FRAME_H - 4; // Leave 4px for shadow

  // Direction angle for rotation (0=S, going clockwise)
  const angle = (direction / 8) * Math.PI * 2;

  // Animation offsets
  let bobY = 0;
  let legSpread = 0;
  let weaponAngle = 0;
  let deathProgress = 0;
  let bodyAlpha = 1;

  switch (anim) {
    case 'idle':
      bobY = Math.sin(frame * Math.PI / 2) * 1.5;
      break;
    case 'walk':
      bobY = Math.abs(Math.sin(frame * Math.PI / 2)) * 3;
      legSpread = Math.sin(frame * Math.PI / 2) * 4;
      break;
    case 'attack':
      weaponAngle = frame < 2
        ? (frame / 2) * 0.8
        : ((4 - frame) / 2) * 0.8;
      break;
    case 'death':
      deathProgress = frame / 3;
      bodyAlpha = 1 - deathProgress * 0.3;
      break;
  }

  ctx.globalAlpha = bodyAlpha;

  // Shadow blob
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx, groundY, sil.bodyWidth * 0.5, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Death: topple sideways
  if (anim === 'death') {
    ctx.translate(cx, groundY);
    ctx.rotate(deathProgress * Math.PI / 3);
    ctx.translate(-cx, -groundY);
  }

  // Body
  const bodyX = cx - sil.bodyWidth / 2;
  const bodyY = groundY - sil.bodyHeight - bobY;

  ctx.fillStyle = sil.bodyColor;
  ctx.fillRect(bodyX, bodyY, sil.bodyWidth, sil.bodyHeight);

  // Team tint overlay on body
  ctx.fillStyle = teamTint;
  ctx.fillRect(bodyX, bodyY, sil.bodyWidth, sil.bodyHeight);

  // Head
  const headY = bodyY - sil.headRadius;
  ctx.fillStyle = sil.bodyColor;
  ctx.beginPath();
  ctx.arc(cx, headY, sil.headRadius, 0, Math.PI * 2);
  ctx.fill();

  // Direction indicator — small arrow/dot showing which way the unit faces
  const dirIndicatorDist = sil.headRadius + 3;
  const dirX = cx + Math.sin(angle) * dirIndicatorDist;
  const dirY = headY - Math.cos(angle) * dirIndicatorDist;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(dirX, dirY, 2, 0, Math.PI * 2);
  ctx.fill();

  // Legs (walk animation)
  if (anim === 'walk') {
    ctx.fillStyle = darkenColor(sil.bodyColor, 0.7);
    const legW = sil.bodyWidth * 0.3;
    const legH = 6;
    ctx.fillRect(cx - legW / 2 - legSpread, groundY - legH, legW, legH);
    ctx.fillRect(cx - legW / 2 + legSpread, groundY - legH, legW, legH);
  }

  // Weapon indicator
  drawWeapon(ctx, sil, cx, bodyY, sil.bodyWidth, weaponAngle, direction);

  ctx.globalAlpha = 1;
}

function drawWeapon(
  ctx: CanvasRenderingContext2D,
  sil: UnitSilhouette,
  cx: number,
  bodyY: number,
  bodyW: number,
  swingAngle: number,
  direction: number
): void {
  // Determine which side the weapon appears on based on direction
  const side = (direction >= 2 && direction <= 6) ? -1 : 1;
  const weaponX = cx + side * (bodyW / 2 + 2);
  const weaponY = bodyY + 8;

  ctx.save();
  ctx.translate(weaponX, weaponY);
  ctx.rotate(swingAngle * side);

  switch (sil.weapon) {
    case 'sword':
      ctx.fillStyle = '#aaaacc';
      ctx.fillRect(-1, -12, 3, 16);
      // Crossguard
      ctx.fillRect(-4, 2, 9, 2);
      break;
    case 'gun':
      ctx.fillStyle = '#555555';
      ctx.fillRect(-1, -2, 3, 14);
      // Barrel
      ctx.fillStyle = '#333333';
      ctx.fillRect(-1, -6, 2, 6);
      break;
    case 'tool':
      ctx.fillStyle = '#888888';
      ctx.fillRect(-1, -2, 2, 12);
      // Wrench head
      ctx.fillStyle = '#777777';
      ctx.fillRect(-3, -4, 7, 3);
      break;
    case 'shield':
      ctx.fillStyle = '#777777';
      ctx.fillRect(-3, -4, 7, 16);
      ctx.strokeStyle = '#999999';
      ctx.lineWidth = 1;
      ctx.strokeRect(-3, -4, 7, 16);
      break;
    case 'claw':
      ctx.fillStyle = '#88aa44';
      for (let i = -1; i <= 1; i++) {
        ctx.fillRect(i * 3 - 1, -8, 2, 10);
      }
      break;
  }

  ctx.restore();
}

function darkenColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.floor(r * factor)},${Math.floor(g * factor)},${Math.floor(b * factor)})`;
}
