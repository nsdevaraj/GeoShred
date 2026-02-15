import { Waveform, InstrumentPreset, ActiveNote } from '../types';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private distortion: WaveShaperNode | null = null;
  private delay: DelayNode | null = null;
  private delayGain: GainNode | null = null;
  
  private activeNotes: Map<number, ActiveNote> = new Map();
  private preset: InstrumentPreset = {
    name: 'Pro Shredder',
    waveform: Waveform.PHYSICAL_STRING,
    filterCutoff: 4000,
    resonance: 3,
    attack: 0.01,
    decay: 0.3,
    sustain: 0.4,
    release: 0.8,
    detune: 0,
    vibratoRate: 5,
    vibratoDepth: 0.1,
    distortion: 0.5,
    delayFeedback: 0.4,
    delayTime: 0.3,
    reverbWet: 0.3,
    feedbackAmount: 0.2,
    stringDamping: 0.5
  };

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.filter = this.ctx.createBiquadFilter();
      this.distortion = this.ctx.createWaveShaper();
      this.delay = this.ctx.createDelay(2.0);
      this.delayGain = this.ctx.createGain();

      this.updateDistortionCurve(this.preset.distortion);

      // Routing: Source -> Distortion -> Filter -> Delay Loop -> Master
      this.distortion.connect(this.filter);
      this.filter.connect(this.masterGain);
      
      // Delay Branch
      this.filter.connect(this.delay);
      this.delay.connect(this.delayGain);
      this.delayGain.connect(this.delay); // feedback
      this.delayGain.connect(this.masterGain);

      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.value = 0.5;
    }
    
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private updateDistortionCurve(amount: number) {
    if (!this.distortion) return;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const k = amount * 10;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
    }
    this.distortion.curve = curve;
  }

  public updatePreset(newPreset: Partial<InstrumentPreset>) {
    this.preset = { ...this.preset, ...newPreset };
    if (!this.ctx) return;

    if (this.filter) {
      this.filter.frequency.setTargetAtTime(this.preset.filterCutoff, this.ctx.currentTime, 0.05);
      this.filter.Q.setTargetAtTime(this.preset.resonance, this.ctx.currentTime, 0.05);
    }
    if (this.delay) {
      this.delay.delayTime.setTargetAtTime(this.preset.delayTime, this.ctx.currentTime, 0.1);
    }
    if (this.delayGain) {
      this.delayGain.gain.setTargetAtTime(this.preset.delayFeedback, this.ctx.currentTime, 0.1);
    }
    if (this.preset.distortion !== undefined) {
      this.updateDistortionCurve(this.preset.distortion);
    }
  }

  private createStringSource(freq: number): AudioNode {
    if (!this.ctx) throw new Error("AudioContext not initialized");
    const period = 1 / freq;
    const burstLength = Math.max(2, Math.floor(this.ctx.sampleRate * period));
    const burstBuffer = this.ctx.createBuffer(1, burstLength, this.ctx.sampleRate);
    const data = burstBuffer.getChannelData(0);
    for (let i = 0; i < burstLength; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const burstSource = this.ctx.createBufferSource();
    burstSource.buffer = burstBuffer;

    const delay = this.ctx.createDelay();
    delay.delayTime.value = period;

    const feedbackGain = this.ctx.createGain();
    feedbackGain.gain.value = 0.99 - (this.preset.stringDamping * 0.05);
    
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 8000;

    burstSource.connect(delay);
    delay.connect(lp);
    lp.connect(feedbackGain);
    feedbackGain.connect(delay);
    
    burstSource.start();
    return delay;
  }

  public noteOn(id: number, frequency: number) {
    this.init();
    if (!this.ctx || !this.distortion) return;

    let source: AudioNode;
    let gain = this.ctx.createGain();

    if (this.preset.waveform === Waveform.PHYSICAL_STRING) {
      source = this.createStringSource(frequency);
    } else {
      const osc = this.ctx.createOscillator();
      osc.type = this.preset.waveform as OscillatorType;
      osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);
      osc.start();
      source = osc;
    }

    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.8, this.ctx.currentTime + this.preset.attack);

    source.connect(gain);
    gain.connect(this.distortion);

    this.activeNotes.set(id, { id, frequency, node: gain, oscillator: source });
  }

  public noteUpdate(id: number, frequency: number, modX: number = 0, modY: number = 0) {
    const note = this.activeNotes.get(id);
    if (note && this.ctx) {
      if (note.oscillator instanceof OscillatorNode) {
        note.oscillator.frequency.setTargetAtTime(frequency, this.ctx.currentTime, 0.03);
      } else if (note.oscillator instanceof DelayNode) {
        note.oscillator.delayTime.setTargetAtTime(1/frequency, this.ctx.currentTime, 0.03);
      }
      if (this.filter) {
        const expressiveCutoff = this.preset.filterCutoff + (modY * 4000);
        this.filter.frequency.setTargetAtTime(Math.min(18000, Math.max(20, expressiveCutoff)), this.ctx.currentTime, 0.05);
      }
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
        if (note.oscillator instanceof OscillatorNode) {
          note.oscillator.stop();
        }
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