import { describe, it, expect, beforeEach } from 'vitest';
import { Deck } from '../cards/Deck';
import { Card } from '../cards/Card';
import { HAND_SIZE, DISCARDS_PER_OBJECTIVE } from '../config';

function makeCard(id: string, opts: Partial<Card> = {}): Card {
  return {
    id,
    name: `Card ${id}`,
    type: 'unit',
    cost: 5,
    description: 'test',
    ...opts,
  };
}

function makeCards(count: number): Card[] {
  return Array.from({ length: count }, (_, i) => makeCard(`c${i}`));
}

describe('Deck', () => {
  let deck: Deck;
  const cards = makeCards(10);

  beforeEach(() => {
    deck = new Deck([...cards]);
  });

  describe('constructor', () => {
    it('fills hand up to HAND_SIZE', () => {
      expect(deck.getHandSize()).toBe(HAND_SIZE);
    });

    it('remaining cards go to draw pile', () => {
      expect(deck.getDeckSize()).toBe(10 - HAND_SIZE);
    });

    it('discard starts empty', () => {
      expect(deck.getDiscardSize()).toBe(0);
    });

    it('hand has exactly HAND_SIZE slots', () => {
      expect(deck.hand).toHaveLength(HAND_SIZE);
    });
  });

  describe('drawCard', () => {
    it('draws into first empty slot', () => {
      // Play card from slot 0 to create an empty
      deck.playCard(0);
      const drawn = deck.drawCard();
      expect(drawn).not.toBeNull();
      expect(deck.hand[0]).toBe(drawn);
    });

    it('returns null when hand is full', () => {
      expect(deck.drawCard()).toBeNull();
    });

    it('reshuffles discard when draw pile empties', () => {
      // Play all hand cards to fill discard (5 cards in discard, 5 empty hand slots)
      for (let i = 0; i < HAND_SIZE; i++) deck.playCard(i);
      expect(deck.getHandSize()).toBe(0);
      // Draw pile has 5 remaining cards; draw them to fill hand slots
      deck.drawToFill();
      expect(deck.getDeckSize()).toBe(0);
      expect(deck.getDiscardSize()).toBe(HAND_SIZE); // 5 played cards in discard
      // Play one to make room, then draw — should reshuffle discard
      deck.playCard(0);
      expect(deck.getDiscardSize()).toBe(HAND_SIZE + 1);
      const drawn = deck.drawCard();
      expect(drawn).not.toBeNull();
    });
  });

  describe('playCard', () => {
    it('removes card from hand slot', () => {
      const card = deck.hand[0];
      const played = deck.playCard(0);
      expect(played).toBe(card);
      expect(deck.hand[0]).toBeNull();
    });

    it('adds played card to discard', () => {
      deck.playCard(0);
      expect(deck.getDiscardSize()).toBe(1);
    });

    it('single-use cards do not go to discard', () => {
      const suDeck = new Deck([makeCard('su1', { singleUse: true }), ...makeCards(HAND_SIZE - 1)]);
      suDeck.playCard(0);
      // singleUse card should not be in discard
      expect(suDeck.discardPile.find(c => c.id === 'su1')).toBeUndefined();
    });

    it('returns null for empty slot', () => {
      deck.playCard(0);
      expect(deck.playCard(0)).toBeNull();
    });

    it('returns null for out-of-range index', () => {
      expect(deck.playCard(-1)).toBeNull();
      expect(deck.playCard(99)).toBeNull();
    });
  });

  describe('playCardById', () => {
    it('finds and plays by id', () => {
      const target = deck.hand[2]!;
      const played = deck.playCardById(target.id);
      expect(played?.id).toBe(target.id);
      expect(deck.hand[2]).toBeNull();
    });

    it('returns null for unknown id', () => {
      expect(deck.playCardById('nonexistent')).toBeNull();
    });
  });

  describe('discardCard', () => {
    it('discards and draws replacement into same slot', () => {
      const oldCard = deck.hand[1];
      const result = deck.discardCard(1);
      expect(result).toBe(true);
      expect(deck.hand[1]).not.toBe(oldCard);
      expect(deck.hand[1]).not.toBeNull();
    });

    it('decrements discard count', () => {
      deck.discardCard(0);
      expect(deck.getDiscardsRemaining()).toBe(DISCARDS_PER_OBJECTIVE - 1);
    });

    it('fails when no discards remaining', () => {
      for (let i = 0; i < DISCARDS_PER_OBJECTIVE; i++) {
        deck.discardCard(i % HAND_SIZE);
      }
      expect(deck.discardCard(0)).toBe(false);
    });
  });

  describe('addCard / addCardToHand', () => {
    it('addCard puts card in discard', () => {
      const c = makeCard('extra');
      deck.addCard(c);
      expect(deck.getDiscardSize()).toBe(1);
    });

    it('addCardToHand puts card in first empty slot', () => {
      deck.playCard(2); // free slot 2
      const c = makeCard('direct');
      expect(deck.addCardToHand(c)).toBe(true);
      expect(deck.hand[2]?.id).toBe('direct');
    });

    it('addCardToHand returns false when hand is full', () => {
      expect(deck.addCardToHand(makeCard('nope'))).toBe(false);
    });
  });

  describe('resetDiscards', () => {
    it('resets to base plus bonus', () => {
      deck.discardCard(0);
      deck.resetDiscards(3);
      expect(deck.getDiscardsRemaining()).toBe(DISCARDS_PER_OBJECTIVE + 3);
    });
  });

  describe('drawToFill', () => {
    it('fills all empty slots', () => {
      deck.playCard(0);
      deck.playCard(1);
      deck.drawToFill();
      expect(deck.getHandSize()).toBe(HAND_SIZE);
    });
  });
});
