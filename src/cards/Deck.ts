import { Card } from './Card';
import { HAND_SIZE, DISCARDS_PER_OBJECTIVE } from '../config';
import { MathUtils } from '../utils/MathUtils';

export class Deck {
  public drawPile: Card[] = [];
  /** Fixed-slot hand. Null entries are empty slots. */
  public hand: (Card | null)[] = [];
  public discardPile: Card[] = [];
  private discardsRemaining: number = DISCARDS_PER_OBJECTIVE;
  private handSizeBonus: number = 0;

  constructor(startingCards: Card[]) {
    this.drawPile = MathUtils.shuffleArray(startingCards);
    // Initialize fixed slots
    this.hand = new Array(this.getMaxHandSize()).fill(null);
    this.drawToFill();
  }

  private getMaxHandSize(): number {
    return HAND_SIZE + this.handSizeBonus;
  }

  setHandSizeBonus(bonus: number): void {
    const oldSize = this.hand.length;
    const newSize = this.getMaxHandSize() + bonus - this.handSizeBonus;
    this.handSizeBonus = bonus;
    // Grow hand slots if needed
    while (this.hand.length < newSize) {
      this.hand.push(null);
    }
  }

  public lastDrawReshuffled = false;

  /** Draw a card into the first empty slot. Returns the card or null. */
  drawCard(): Card | null {
    this.lastDrawReshuffled = false;
    const emptySlot = this.hand.indexOf(null);
    if (emptySlot === -1) return null;

    if (this.drawPile.length === 0) {
      if (this.discardPile.length === 0) return null;
      this.drawPile = MathUtils.shuffleArray(this.discardPile);
      this.discardPile = [];
      this.lastDrawReshuffled = true;
    }

    const card = this.drawPile.pop()!;
    this.hand[emptySlot] = card;
    return card;
  }

  drawToFill(): void {
    while (this.hand.some(c => c === null)) {
      const card = this.drawCard();
      if (!card) break;
    }
  }

  /** Play a card from a specific slot. The slot becomes null (empty). */
  playCard(index: number): Card | null {
    if (index < 0 || index >= this.hand.length) return null;
    const card = this.hand[index];
    if (!card) return null;
    this.hand[index] = null;
    if (!card.singleUse) {
      this.discardPile.push(card);
    }
    return card;
  }

  playCardById(cardId: string): Card | null {
    const index = this.hand.findIndex((c) => c?.id === cardId);
    if (index === -1) return null;
    return this.playCard(index);
  }

  /** Discard a card from a slot and draw a replacement into that same slot. */
  discardCard(index: number): boolean {
    this.lastDrawReshuffled = false;
    if (this.discardsRemaining <= 0) return false;
    if (index < 0 || index >= this.hand.length) return false;
    const card = this.hand[index];
    if (!card) return false;

    this.hand[index] = null;
    this.discardPile.push(card);
    this.discardsRemaining--;

    // Draw replacement into same slot
    if (this.drawPile.length === 0 && this.discardPile.length > 0) {
      this.drawPile = MathUtils.shuffleArray(this.discardPile);
      this.discardPile = [];
      this.lastDrawReshuffled = true;
    }
    if (this.drawPile.length > 0) {
      this.hand[index] = this.drawPile.pop()!;
    }

    return true;
  }

  /** Mulligan: return marked cards to draw pile, reshuffle, redraw into those slots. */
  mulliganCards(indices: number[]): void {
    for (const idx of indices) {
      const card = this.hand[idx];
      if (card) {
        this.drawPile.push(card);
        this.hand[idx] = null;
      }
    }
    this.drawPile = MathUtils.shuffleArray(this.drawPile);
    for (const idx of indices) {
      if (this.drawPile.length > 0) {
        this.hand[idx] = this.drawPile.pop()!;
      }
    }
  }

  /** MTG-style mulligan: shuffle entire hand back, redraw drawCount cards. */
  mulliganFull(drawCount: number): void {
    for (let i = 0; i < this.hand.length; i++) {
      const card = this.hand[i];
      if (card) {
        this.drawPile.push(card);
        this.hand[i] = null;
      }
    }
    this.drawPile = MathUtils.shuffleArray(this.drawPile);
    for (let drawn = 0; drawn < drawCount; drawn++) {
      const emptySlot = this.hand.indexOf(null);
      if (emptySlot === -1 || this.drawPile.length === 0) break;
      this.hand[emptySlot] = this.drawPile.pop()!;
    }
  }

  getDiscardsRemaining(): number {
    return this.discardsRemaining;
  }

  resetDiscards(bonus: number = 0): void {
    this.discardsRemaining = DISCARDS_PER_OBJECTIVE + bonus;
  }

  addCard(card: Card): void {
    this.discardPile.push(card);
  }

  /** Add a card directly to the first empty hand slot. */
  addCardToHand(card: Card): boolean {
    const emptySlot = this.hand.indexOf(null);
    if (emptySlot === -1) return false;
    this.hand[emptySlot] = card;
    return true;
  }

  /** Count of non-null cards in hand. */
  getHandSize(): number {
    return this.hand.filter(c => c !== null).length;
  }

  getDeckSize(): number {
    return this.drawPile.length;
  }

  getDiscardSize(): number {
    return this.discardPile.length;
  }

  /** Peek at the top card of the draw pile without removing it. */
  peekTop(): Card | null {
    if (this.drawPile.length === 0) return null;
    return this.drawPile[this.drawPile.length - 1];
  }
}
