import { Waveform, InstrumentPreset } from "../types";

export const generateAIPreset = async (mood: string): Promise<InstrumentPreset> => {
  // Local "AI" generation - no network dependency
  await new Promise(resolve => setTimeout(resolve, 400));
  
  const waveforms = [Waveform.PHYSICAL_STRING, Waveform.SAWTOOTH, Waveform.SQUARE, Waveform.TRIANGLE];
  const randomWave = waveforms[Math.floor(Math.random() * waveforms.length)];
  
  return {
    name: `${mood.split(' ')[0] || 'Modern'} Lead`,
    waveform: randomWave,
    filterCutoff: 1000 + Math.random() * 5000,
    resonance: 2 + Math.random() * 10,
    attack: 0.005 + Math.random() * 0.05,
    decay: 0.1 + Math.random() * 0.4,
    sustain: 0.3 + Math.random() * 0.5,
    release: 0.4 + Math.random() * 1.2,
    detune: 0,
    vibratoRate: 4 + Math.random() * 4,
    vibratoDepth: 0.05 + Math.random() * 0.15,
    distortion: 0.4 + Math.random() * 0.5,
    delayFeedback: 0.2 + Math.random() * 0.4,
    delayTime: 0.1 + Math.random() * 0.4,
    reverbWet: 0.1 + Math.random() * 0.4,
    feedbackAmount: 0.1 + Math.random() * 0.3,
    stringDamping: 0.2 + Math.random() * 0.6
  };
};