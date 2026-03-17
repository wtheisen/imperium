/**
 * SupplyPod is now pure data. 3D visuals are handled by VFXRenderer
 * via 'supply-pod-3d' and 'supply-pod-opened-3d' events.
 */
export class SupplyPod {
  public tileX: number;
  public tileY: number;
  public opened: boolean = false;
  public gold: number;
  public cardDraws: number;

  constructor(
    tileX: number,
    tileY: number,
    gold: number,
    cardDraws: number
  ) {
    this.tileX = tileX;
    this.tileY = tileY;
    this.gold = gold;
    this.cardDraws = cardDraws;
  }

  open(): void {
    this.opened = true;
  }

  destroy(): void {
    // No-op — pure data
  }
}
