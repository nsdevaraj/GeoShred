
import { Waveform, InstrumentPreset } from "../types";

export const generateAIPreset = async (mood: string): Promise<InstrumentPreset> => {
  // Simulate network latency for the "AI" generation
  await new Promise(resolve => setTimeout(resolve, 600));

  const waveforms = [Waveform.SAWTOOTH, Waveform.SQUARE, Waveform.SINE, Waveform.TRIANGLE];
  const randomWaveform = waveforms[Math.floor(Math.random() * waveforms.length)];
  
  // Randomize parameters to simulate AI creativity
  return {
    name: `${mood.trim().substring(0, 15)}...`,
    waveform: randomWaveform,
    filterCutoff: 200 + Math.random() * 5000,
    resonance: Math.random() * 15,
    attack: 0.01 + Math.random() * 0.2,
    decay: 0.1 + Math.random() * 0.5,
    sustain: 0.3 + Math.random() * 0.7,
    release: 0.1 + Math.random() * 1.5,
    detune: 0,
    vibratoRate: 3 + Math.random() * 5,
    vibratoDepth: Math.random() * 0.2
  };
};
