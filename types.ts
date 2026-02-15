
export enum Waveform {
  SINE = 'sine',
  SQUARE = 'square',
  SAWTOOTH = 'sawtooth',
  TRIANGLE = 'triangle',
  PHYSICAL_STRING = 'string',
  PIANO = 'piano',
  GUITAR = 'guitar',
  SLIDE = 'slide',
  DRUMS = 'drums'
}

export enum ScaleType {
  CHROMATIC = 'chromatic',
  MAJOR = 'major',
  MINOR = 'minor',
  BLUES = 'blues',
  PENTATONIC = 'pentatonic',
  RAGA_BHAIRAV = 'bhairav'
}

export interface InstrumentPreset {
  name: string;
  waveform: Waveform;
  filterCutoff: number;
  resonance: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  detune: number;
  vibratoRate: number;
  vibratoDepth: number;
  // New Pro Features
  distortion: number;
  delayFeedback: number;
  delayTime: number;
  reverbWet: number;
  feedbackAmount: number;
  stringDamping: number;
}

export interface ActiveNote {
  id: number;
  frequency: number;
  node: GainNode;
  oscillator: OscillatorNode | AudioNode; // AudioNode for string modeling
  vibrato?: OscillatorNode;
  vibratoGain?: GainNode;
}

export interface GridPos {
  row: number;
  col: number;
  midi: number;
}

export interface Loop {
  id: string;
  url: string;
  buffer: AudioBuffer;
  isPlaying: boolean;
  source?: AudioBufferSourceNode;
}
