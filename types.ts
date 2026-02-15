
export enum Waveform {
  SINE = 'sine',
  SQUARE = 'square',
  SAWTOOTH = 'sawtooth',
  TRIANGLE = 'triangle'
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
}

export interface ActiveNote {
  id: number;
  frequency: number;
  node: GainNode;
  oscillator: OscillatorNode;
  vibrato: OscillatorNode;
  vibratoGain: GainNode;
}

export interface GridPos {
  row: number;
  col: number;
}
