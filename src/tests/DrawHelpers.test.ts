import { describe, it, expect, beforeEach } from 'vitest';
import { Deck } from '../cards/Deck';
import { Card } from '../cards/Card';
import { HAND_SIZE } from '../config';

function makeCard(id: string, opts: Partial<Card> = {}): Card {
  return { id, name: `Card ${id}`, type: 'unit', cost: 5, description: 'test', ...opts };
}

function makeCards(count: number): Card[] {
  return Array.from({ length: count }, (_, i) => makeCard(`c${i}`));
}

/**
 * These tests verify the draw-loop mechanics that UIScene's
 * drawMultipleCards and drawCardForCost helpers rely on.
 */
describe('Draw helper patterns', () => {
  let deck: Deck;

  beforeEach(() => {
    deck = new Deck([...makeCards(15)]);
  });

  describe('multi-draw loop (drawMultipleCards pattern)', () => {
    it('draws N cards into empty hand slots', () => {
      // Free up 3 slots
      deck.playCard(0);
      deck.playCard(1);
      deck.playCard(2);
      expect(deck.getHandSize()).toBe(HAND_SIZE - 3);

      const drawn: Card[] = [];
      for (let i = 0; i < 3; i++) {
        const card = deck.drawCard();
        if (card) drawn.push(card);
      }

      expect(drawn).toHaveLength(3);
      expect(deck.getHandSize()).toBe(HAND_SIZE);
    });

    it('stops drawing when hand is full', () => {
      // Free 1 slot, try to draw 3
      deck.playCard(0);
      const drawn: Card[] = [];
      for (let i = 0; i < 3; i++) {
        const card = deck.drawCard();
        if (card) drawn.push(card);
      }

      expect(drawn).toHaveLength(1);
    });

    it('tracks reshuffle during multi-draw', () => {
      // Use a small deck so we can exhaust the draw pile
      const smallDeck = new Deck([...makeCards(HAND_SIZE + 1)]);
      // Draw pile has 1 card. Play 3 to make room + fill discard.
      for (let i = 0; i < 3; i++) smallDeck.playCard(i);
      // Draw pile: 1, Discard: 3, Hand: HAND_SIZE - 3
      // First draw uses the 1 remaining card, second triggers reshuffle
      let reshuffleCount = 0;
      for (let i = 0; i < 3; i++) {
        const card = smallDeck.drawCard();
        if (card && smallDeck.lastDrawReshuffled) reshuffleCount++;
      }

      expect(reshuffleCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('draw-for-cost pattern (drawCardForCost pattern)', () => {
    it('draws single card when gold sufficient', () => {
      deck.playCard(0);
      const initialDeckSize = deck.getDeckSize();
      const drawn = deck.drawCard();

      expect(drawn).not.toBeNull();
      expect(deck.getDeckSize()).toBe(initialDeckSize - 1);
      expect(deck.hand[0]).toBe(drawn);
    });

    it('card appears in correct hand slot after draw', () => {
      // Free slot 2 specifically
      deck.playCard(2);
      const drawn = deck.drawCard();

      expect(drawn).not.toBeNull();
      expect(deck.hand[2]).toBe(drawn);
    });

    it('returns null when hand is full (no draw possible)', () => {
      const drawn = deck.drawCard();
      expect(drawn).toBeNull();
    });
  });
});
