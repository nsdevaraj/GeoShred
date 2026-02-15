
import { Waveform, InstrumentPreset, ActiveNote } from '../types';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private activeNotes: Map<number, ActiveNote> = new Map();
  private preset: InstrumentPreset = {
    name: 'Initial Shred',
    waveform: Waveform.SAWTOOTH,
    filterCutoff: 2000,
    resonance: 5,
    attack: 0.05,
    decay: 0.2,
    sustain: 0.5,
    release: 0.8,
    detune: 0,
    vibratoRate: 5,
    vibratoDepth: 0
  };

  constructor() {
    // Audio context is initialized on first interaction
  }

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.filter = this.ctx.createBiquadFilter();

      this.masterGain.gain.setValueAtTime(0.5, this.ctx.currentTime);
      this.filter.type = 'lowpass';
      this.filter.frequency.setValueAtTime(this.preset.filterCutoff, this.ctx.currentTime);
      this.filter.Q.setValueAtTime(this.preset.resonance, this.ctx.currentTime);

      this.filter.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public updatePreset(newPreset: Partial<InstrumentPreset>) {
    this.preset = { ...this.preset, ...newPreset };
    if (this.filter && this.ctx) {
      this.filter.frequency.setTargetAtTime(this.preset.filterCutoff, this.ctx.currentTime, 0.05);
      this.filter.Q.setTargetAtTime(this.preset.resonance, this.ctx.currentTime, 0.05);
    }
  }

  public noteOn(id: number, frequency: number) {
    this.init();
    if (!this.ctx || !this.filter) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const vibrato = this.ctx.createOscillator();
    const vibratoGain = this.ctx.createGain();

    osc.type = this.preset.waveform;
    osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);
    osc.detune.setValueAtTime(this.preset.detune, this.ctx.currentTime);

    vibrato.frequency.setValueAtTime(this.preset.vibratoRate, this.ctx.currentTime);
    vibratoGain.gain.setValueAtTime(this.preset.vibratoDepth * frequency * 0.05, this.ctx.currentTime);
    
    vibrato.connect(vibratoGain);
    vibratoGain.connect(osc.frequency);

    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, this.ctx.currentTime + this.preset.attack);

    osc.connect(gain);
    gain.connect(this.filter);

    osc.start();
    vibrato.start();

    this.activeNotes.set(id, { id, frequency, node: gain, oscillator: osc, vibrato, vibratoGain });
  }

  public noteUpdate(id: number, frequency: number, modX: number = 0, modY: number = 0) {
    const note = this.activeNotes.get(id);
    if (note && this.ctx) {
      // Smooth frequency transition for portamento
      note.oscillator.frequency.setTargetAtTime(frequency, this.ctx.currentTime, 0.02);
      
      // Update vibrato based on modX (e.g. scrape/expression)
      note.vibratoGain.gain.setTargetAtTime(
        (this.preset.vibratoDepth + modX) * frequency * 0.05, 
        this.ctx.currentTime, 
        0.05
      );
    }
  }

  public noteOff(id: number) {
    const note = this.activeNotes.get(id);
    if (note && this.ctx) {
      const releaseTime = this.ctx.currentTime + this.preset.release;
      note.node.gain.cancelScheduledValues(this.ctx.currentTime);
      note.node.gain.setValueAtTime(note.node.gain.value, this.ctx.currentTime);
      note.node.gain.exponentialRampToValueAtTime(0.001, releaseTime);
      
      setTimeout(() => {
        note.oscillator.stop();
        note.vibrato.stop();
        note.oscillator.disconnect();
        note.node.disconnect();
        this.activeNotes.delete(id);
      }, this.preset.release * 1000 + 100);
    }
  }

  public setMasterVolume(val: number) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.05);
    }
  }
}

export const audioEngine = new AudioEngine();
