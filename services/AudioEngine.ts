import { Waveform, InstrumentPreset, ActiveNote, Loop } from '../types';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private distortion: WaveShaperNode | null = null;
  private delay: DelayNode | null = null;
  private delayGain: GainNode | null = null;
  
  private recorder: MediaRecorder | null = null;
  private recordChunks: Blob[] = [];
  private dest: MediaStreamAudioDestinationNode | null = null;

  private activeNotes: Map<number, ActiveNote> = new Map();
  private activeLoops: Map<string, AudioBufferSourceNode> = new Map();

  private preset: InstrumentPreset = {
    name: 'Pro Shredder',
    waveform: Waveform.GUITAR,
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
      
      // Setup recording destination
      this.dest = this.ctx.createMediaStreamDestination();

      this.updateDistortionCurve(this.preset.distortion);

      this.distortion.connect(this.filter);
      this.filter.connect(this.masterGain);
      
      this.filter.connect(this.delay);
      this.delay.connect(this.delayGain);
      this.delayGain.connect(this.delay);
      this.delayGain.connect(this.masterGain);

      this.masterGain.connect(this.ctx.destination);
      this.masterGain.connect(this.dest); // Route to recorder
      this.masterGain.gain.value = 0.5;
    }
    
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public startRecording() {
    this.init();
    if (!this.dest) return;
    
    this.recordChunks = [];
    this.recorder = new MediaRecorder(this.dest.stream);
    this.recorder.ondataavailable = (e) => this.recordChunks.push(e.data);
    this.recorder.start();
  }

  public async stopRecording(): Promise<Loop | null> {
    return new Promise((resolve) => {
      if (!this.recorder || !this.ctx) return resolve(null);
      
      this.recorder.onstop = async () => {
        const blob = new Blob(this.recordChunks, { type: 'audio/ogg; codecs=opus' });
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await this.ctx!.decodeAudioData(arrayBuffer);
        const url = URL.createObjectURL(blob);
        
        resolve({
          id: Math.random().toString(36).substr(2, 9),
          url,
          buffer: audioBuffer,
          isPlaying: false
        });
      };
      this.recorder.stop();
    });
  }

  public playLoop(loop: Loop, onEnded: () => void) {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const source = this.ctx.createBufferSource();
    source.buffer = loop.buffer;
    source.loop = true;
    source.connect(this.masterGain);
    source.start();
    
    this.activeLoops.set(loop.id, source);
  }

  public stopLoop(id: string) {
    const source = this.activeLoops.get(id);
    if (source) {
      source.stop();
      source.disconnect();
      this.activeLoops.delete(id);
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

  private createStringSource(freq: number, feedback: number = 0.98, damping: number = 8000): AudioNode {
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
    feedbackGain.gain.value = feedback;
    
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = damping;

    burstSource.connect(delay);
    delay.connect(lp);
    lp.connect(feedbackGain);
    feedbackGain.connect(delay);
    
    burstSource.start();
    return delay;
  }

  private createDrumSource(row: number, freq: number): AudioNode {
    if (!this.ctx) throw new Error("AudioContext not initialized");
    const now = this.ctx.currentTime;
    
    if (row === 0) { // Kick
      const osc = this.ctx.createOscillator();
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.5);
      osc.start();
      osc.stop(now + 0.5);
      return osc;
    } else if (row === 1) { // Snare
      const noise = this.ctx.createBufferSource();
      const bufferSize = this.ctx.sampleRate * 0.2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      noise.buffer = buffer;
      
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 1000;
      noise.connect(filter);
      noise.start();
      return filter;
    } else { // Hi-hats and misc
      const noise = this.ctx.createBufferSource();
      const bufferSize = this.ctx.sampleRate * 0.05;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      noise.buffer = buffer;
      
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 7000;
      noise.connect(filter);
      noise.start();
      return filter;
    }
  }

  public noteOn(id: number, frequency: number, row?: number) {
    this.init();
    if (!this.ctx || !this.distortion) return;

    let source: AudioNode;
    let gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    switch (this.preset.waveform) {
      case Waveform.PIANO:
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const osc3 = this.ctx.createOscillator();
        osc1.frequency.value = frequency;
        osc2.frequency.value = frequency * 2;
        osc3.frequency.value = frequency * 3;
        osc1.type = 'sine';
        osc2.type = 'sine';
        osc3.type = 'sine';
        const mix = this.ctx.createGain();
        osc1.connect(mix);
        osc2.connect(mix);
        osc3.connect(mix);
        osc1.start(); osc2.start(); osc3.start();
        source = mix;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.6, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 2.0);
        break;

      case Waveform.GUITAR:
      case Waveform.PHYSICAL_STRING:
        source = this.createStringSource(frequency, 0.985 - (this.preset.stringDamping * 0.05), 8000);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.8, now + this.preset.attack);
        break;

      case Waveform.SLIDE:
        source = this.createStringSource(frequency, 0.995, 12000);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.9, now + 0.1);
        break;

      case Waveform.DRUMS:
        source = this.createDrumSource(row || 0, frequency);
        gain.gain.setValueAtTime(1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        break;

      default:
        const osc = this.ctx.createOscillator();
        osc.type = (this.preset.waveform as OscillatorType) || 'sawtooth';
        osc.frequency.setValueAtTime(frequency, now);
        osc.start();
        source = osc;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.8, now + this.preset.attack);
    }

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
      if (this.preset.waveform === Waveform.DRUMS) {
        this.activeNotes.delete(id);
        return;
      }

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