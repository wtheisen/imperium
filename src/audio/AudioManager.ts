import { EventBus } from '../EventBus';
import { DEFAULT_VOLUME } from '../config';

export class AudioManager {
  private ctx: AudioContext;
  private masterGain: GainNode;
  private muted = false;
  private savedVolume: number = DEFAULT_VOLUME;
  private cooldowns: Map<string, number> = new Map();
  private noiseBuffer: AudioBuffer | null = null;

  constructor() {
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = DEFAULT_VOLUME;
    this.masterGain.connect(this.ctx.destination);

    // Build white noise buffer
    this.noiseBuffer = this.createNoiseBuffer();

    // Resume on first user interaction (autoplay policy)
    const resume = () => {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    };
    document.addEventListener('pointerdown', resume, { once: true });
    document.addEventListener('keydown', resume, { once: true });

    // Register EventBus listeners
    EventBus.on('selection-changed', this.onSelectionChanged, this);
    EventBus.on('command-issued', this.onCommandIssued, this);
    EventBus.on('card-played', this.onCardPlayed, this);
    EventBus.on('card-play-failed', this.onCardPlayFailed, this);
    EventBus.on('damage-dealt', this.onDamageDealt, this);
    EventBus.on('entity-died', this.onEntityDied, this);
    EventBus.on('gold-changed', this.onGoldChanged, this);
    EventBus.on('objective-completed', this.onObjectiveCompleted, this);
    EventBus.on('supply-pod-incoming', this.onSupplyPodIncoming, this);
    EventBus.on('audio-toggle-mute', this.toggleMute, this);
    EventBus.on('card-discarded', this.onCardDiscarded, this);
  }

  private canPlay(key: string, cooldownMs: number): boolean {
    const now = performance.now();
    const last = this.cooldowns.get(key) || 0;
    if (now - last < cooldownMs) return false;
    this.cooldowns.set(key, now);
    return true;
  }

  private createNoiseBuffer(): AudioBuffer {
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * 0.1); // 100ms
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // --- Sound methods ---

  playClick(): void {
    if (!this.canPlay('click', 80)) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 800;
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }

  playMoveCommand(): void {
    if (!this.canPlay('move', 100)) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playAttackCommand(): void {
    if (!this.canPlay('attack', 100)) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 300;
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }

  playGatherCommand(): void {
    if (!this.canPlay('gather', 100)) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 500;
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  /** Card draw: quick "shwick" noise sweep (high→low, 100ms) */
  playCardDraw(): void {
    if (!this.canPlay('cardDraw', 80)) return;
    if (!this.noiseBuffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3000, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(500, this.ctx.currentTime + 0.1);
    filter.Q.value = 3;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start();
    source.stop(this.ctx.currentTime + 0.1);
  }

  /** Card play — per card type sounds */
  playCardPlayedUnit(): void {
    if (!this.canPlay('cardPlayUnit', 150)) return;
    // Thud: low sine + noise
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 120;
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  playCardPlayedBuilding(): void {
    if (!this.canPlay('cardPlayBuilding', 150)) return;
    // Clank: sawtooth burst
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 200;
    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.12);
    // Secondary metallic ping
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = 1800;
    gain2.gain.setValueAtTime(0.1, this.ctx.currentTime + 0.03);
    gain2.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
    osc2.connect(gain2);
    gain2.connect(this.masterGain);
    osc2.start(this.ctx.currentTime + 0.03);
    osc2.stop(this.ctx.currentTime + 0.08);
  }

  playCardPlayedSpell(): void {
    if (!this.canPlay('cardPlaySpell', 150)) return;
    // Whoosh: noise sweep
    if (!this.noiseBuffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(2000, this.ctx.currentTime + 0.2);
    filter.Q.value = 2;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start();
    source.stop(this.ctx.currentTime + 0.2);
  }

  playCardPlayedDoctrine(): void {
    if (!this.canPlay('cardPlayDoctrine', 150)) return;
    // Chime: ascending two-note
    const t = this.ctx.currentTime;
    const notes = [880, 1320]; // A5, E6
    for (let i = 0; i < notes.length; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = notes[i];
      gain.gain.setValueAtTime(0.2, t + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.15);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t + i * 0.08);
      osc.stop(t + i * 0.08 + 0.15);
    }
  }

  /** Unit spawn: metallic materialization tone */
  playUnitSpawn(): void {
    if (!this.canPlay('unitSpawn', 100)) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  /** Discard: soft shuffle sound */
  playDiscard(): void {
    if (!this.canPlay('discard', 100)) return;
    if (!this.noiseBuffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1500;
    filter.Q.value = 1;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start();
    source.stop(this.ctx.currentTime + 0.08);
  }

  playCardPlayed(): void {
    if (!this.canPlay('cardPlayed', 150)) return;
    if (!this.noiseBuffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(2000, this.ctx.currentTime + 0.2);
    filter.Q.value = 2;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start();
    source.stop(this.ctx.currentTime + 0.2);
  }

  playCardFailed(): void {
    if (!this.canPlay('cardFailed', 150)) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 150;
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  playHit(): void {
    if (!this.canPlay('hit', 50)) return;
    if (!this.noiseBuffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.03);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start();
    source.stop(this.ctx.currentTime + 0.03);
  }

  playDeath(): void {
    if (!this.canPlay('death', 100)) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }

  playGold(): void {
    if (!this.canPlay('gold', 100)) return;
    const t = this.ctx.currentTime;
    // Two quick ascending pings
    for (let i = 0; i < 2; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = i === 0 ? 1200 : 1600;
      gain.gain.setValueAtTime(0.15, t + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.05);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t + i * 0.06);
      osc.stop(t + i * 0.06 + 0.05);
    }
  }

  playObjective(): void {
    if (!this.canPlay('objective', 500)) return;
    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    for (let i = 0; i < notes.length; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = notes[i];
      gain.gain.setValueAtTime(0.2, t + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.1);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t + i * 0.1);
      osc.stop(t + i * 0.1 + 0.1);
    }
  }

  playSupplyPod(): void {
    if (!this.canPlay('supplyPod', 500)) return;
    const t = this.ctx.currentTime;
    const freqs = [600, 800, 600, 800, 600];
    for (let i = 0; i < freqs.length; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freqs[i];
      gain.gain.setValueAtTime(0.15, t + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.1);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t + i * 0.1);
      osc.stop(t + i * 0.1 + 0.1);
    }
  }

  // --- Event handlers ---

  private onSelectionChanged(): void {
    this.playClick();
  }

  private onCommandIssued({ type }: { type: string }): void {
    if (type === 'move') this.playMoveCommand();
    else if (type === 'attack') this.playAttackCommand();
    else if (type === 'gather') this.playGatherCommand();
  }

  private onCardPlayed({ card }: { card?: any }): void {
    // Play type-specific sound
    if (card) {
      switch (card.type) {
        case 'unit':
          this.playCardPlayedUnit();
          this.playUnitSpawn();
          return;
        case 'building':
          this.playCardPlayedBuilding();
          return;
        case 'ordnance':
          this.playCardPlayedSpell();
          return;
        case 'doctrine':
          this.playCardPlayedDoctrine();
          return;
      }
    }
    // Fallback
    this.playCardPlayed();
  }

  private onCardPlayFailed(): void {
    this.playCardFailed();
  }

  private onDamageDealt(): void {
    this.playHit();
  }

  private onEntityDied(): void {
    this.playDeath();
  }

  private onGoldChanged({ amount }: { amount: number }): void {
    if (amount > 0) this.playGold();
  }

  private onObjectiveCompleted(): void {
    this.playObjective();
  }

  private onSupplyPodIncoming(): void {
    this.playSupplyPod();
  }

  private onCardDiscarded(): void {
    this.playDiscard();
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.muted) {
      this.savedVolume = this.masterGain.gain.value;
      this.masterGain.gain.value = 0;
    } else {
      this.masterGain.gain.value = this.savedVolume;
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  destroy(): void {
    EventBus.off('selection-changed', this.onSelectionChanged, this);
    EventBus.off('command-issued', this.onCommandIssued, this);
    EventBus.off('card-played', this.onCardPlayed, this);
    EventBus.off('card-play-failed', this.onCardPlayFailed, this);
    EventBus.off('damage-dealt', this.onDamageDealt, this);
    EventBus.off('entity-died', this.onEntityDied, this);
    EventBus.off('gold-changed', this.onGoldChanged, this);
    EventBus.off('objective-completed', this.onObjectiveCompleted, this);
    EventBus.off('supply-pod-incoming', this.onSupplyPodIncoming, this);
    EventBus.off('audio-toggle-mute', this.toggleMute, this);
    EventBus.off('card-discarded', this.onCardDiscarded, this);
    this.ctx.close();
  }
}
