
import React, { useState, useEffect, useRef } from 'react';
import { audioEngine } from './services/AudioEngine';
import { generateAIPreset } from './services/GeminiService';
import { Waveform, InstrumentPreset, GridPos, ScaleType } from './types';
import { 
  Settings, 
  Sparkles, 
  Activity, 
  Music, 
  Zap,
  Layers,
  Waves,
  Repeat,
  Cpu,
  Guitar,
  Piano,
  MousePointer2,
  Drum
} from 'lucide-react';

const ROWS = 6;
const COLS = 12;
const ROW_INTERVAL = 5; // Perfect 4th
const START_MIDI = 36; // C2

const SCALES: Record<ScaleType, number[]> = {
  [ScaleType.CHROMATIC]: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  [ScaleType.MAJOR]: [0, 2, 4, 5, 7, 9, 11],
  [ScaleType.MINOR]: [0, 2, 3, 5, 7, 8, 10],
  [ScaleType.BLUES]: [0, 3, 5, 6, 7, 10],
  [ScaleType.PENTATONIC]: [0, 2, 4, 7, 9],
  [ScaleType.RAGA_BHAIRAV]: [0, 1, 4, 5, 7, 8, 11]
};

const midiToFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

const App: React.FC = () => {
  const [preset, setPreset] = useState<InstrumentPreset>({
    name: 'Pro Lead Shred',
    waveform: Waveform.GUITAR,
    filterCutoff: 3000,
    resonance: 5,
    attack: 0.01,
    decay: 0.2,
    sustain: 0.5,
    release: 0.8,
    detune: 0,
    vibratoRate: 6,
    vibratoDepth: 0.1,
    distortion: 0.5,
    delayFeedback: 0.3,
    delayTime: 0.25,
    reverbWet: 0.2,
    feedbackAmount: 0.1,
    stringDamping: 0.4
  });
  
  const [scale, setScale] = useState<ScaleType>(ScaleType.CHROMATIC);
  const [activeTouches, setActiveTouches] = useState<Map<number, GridPos>>(new Map());
  const [isAIGenerating, setIsAIGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<'synth' | 'fx' | 'scale'>('synth');
  const [snapToScale, setSnapToScale] = useState(true);

  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    audioEngine.updatePreset(preset);
  }, [preset]);

  const getSnappedMidi = (rawMidi: number) => {
    if (!snapToScale || preset.waveform === Waveform.DRUMS) return rawMidi;
    const octave = Math.floor(rawMidi / 12);
    const note = Math.round(rawMidi) % 12;
    const scaleNotes = SCALES[scale];
    
    let bestNote = scaleNotes[0];
    let minDiff = Infinity;
    for (const sNote of scaleNotes) {
      const diff = Math.abs(note - sNote);
      if (diff < minDiff) {
        minDiff = diff;
        bestNote = sNote;
      }
    }
    return (octave * 12) + bestNote;
  };

  const isInScale = (midi: number) => SCALES[scale].includes(midi % 12);

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const cellWidth = rect.width / COLS;
    const cellHeight = rect.height / ROWS;
    
    const col = Math.floor((e.clientX - rect.left) / cellWidth);
    const row = Math.floor((e.clientY - rect.top) / cellHeight);
    const invertedRow = ROWS - 1 - row;
    
    const rawMidi = START_MIDI + (invertedRow * ROW_INTERVAL) + col;
    const snappedMidi = getSnappedMidi(rawMidi);
    
    const freq = midiToFreq(snappedMidi);
    audioEngine.noteOn(e.pointerId, freq, row); // Pass row for drums
    setActiveTouches(prev => new Map(prev).set(e.pointerId, { row, col, midi: snappedMidi }));
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const touch = activeTouches.get(e.pointerId);
    if (!touch || preset.waveform === Waveform.DRUMS) return;
    
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;

    const y = 1 - (e.clientY - rect.top) / rect.height;
    const cellWidth = rect.width / COLS;
    const colFloat = (e.clientX - rect.left) / cellWidth;
    
    const currentMidi = touch.midi + (colFloat - (touch.col + 0.5));
    const finalMidi = getSnappedMidi(currentMidi);

    audioEngine.noteUpdate(e.pointerId, midiToFreq(finalMidi), 0, y);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    audioEngine.noteOff(e.pointerId);
    setActiveTouches(prev => {
      const next = new Map(prev);
      next.delete(e.pointerId);
      return next;
    });
  };

  const handleAIGenerate = async () => {
    setIsAIGenerating(true);
    try {
      const newPreset = await generateAIPreset(aiPrompt || 'Shred');
      setPreset(newPreset);
      setShowSettings(true);
    } catch (error) {
      console.error(error);
    } finally {
      setIsAIGenerating(false);
    }
  };

  const instruments = [
    { type: Waveform.GUITAR, icon: Guitar, label: 'Guitar' },
    { type: Waveform.PIANO, icon: Piano, label: 'Piano' },
    { type: Waveform.SLIDE, icon: MousePointer2, label: 'Slide' },
    { type: Waveform.DRUMS, icon: Drum, label: 'Drums' },
  ];

  return (
    <div className="h-screen w-screen flex flex-col bg-black text-white select-none overflow-hidden font-sans">
      <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-[#0a0a0a] z-30">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-cyan-400 to-blue-600 p-2 rounded-xl shadow-lg shadow-cyan-500/20">
            <Zap size={22} className="text-black fill-current" />
          </div>
          <div>
            <h1 className="font-black text-xl tracking-tighter italic uppercase text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-white">
              GeoShred <span className="text-white/20">Studio</span>
            </h1>
          </div>
        </div>

        <div className="flex-1 max-w-xl mx-8 relative group">
          <input 
            type="text" 
            placeholder="AI Tone Designer..."
            className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-6 pr-14 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition-all text-sm placeholder:text-white/20"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
          />
          <button 
            onClick={handleAIGenerate}
            disabled={isAIGenerating}
            className={`absolute right-1.5 top-1.5 p-1.5 rounded-lg ${isAIGenerating ? 'bg-white/5' : 'bg-cyan-500 text-black'} transition-all`}
          >
            {isAIGenerating ? <Activity size={18} className="animate-spin" /> : <Sparkles size={18} />}
          </button>
        </div>

        <button 
          onClick={() => setShowSettings(!showSettings)}
          className={`px-4 py-2 rounded-xl border transition-all ${showSettings ? 'bg-cyan-500 text-black' : 'bg-white/5 border-white/10'}`}
        >
          <Settings size={18} />
        </button>
      </header>

      <main className="flex-1 relative flex">
        <div 
          ref={gridRef}
          className={`flex-1 grid gap-[1px] bg-[#1a1a1a] p-[1px] touch-none cursor-crosshair ${preset.waveform === Waveform.DRUMS ? 'drum-mode' : ''}`}
          style={{ gridTemplateRows: `repeat(${ROWS}, 1fr)`, gridTemplateColumns: `repeat(${COLS}, 1fr)` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {Array.from({ length: ROWS * COLS }).map((_, i) => {
            const row = Math.floor(i / COLS);
            const col = i % COLS;
            const invRow = ROWS - 1 - row;
            const midi = START_MIDI + (invRow * ROW_INTERVAL) + col;
            const isActive = Array.from(activeTouches.values()).some((t) => t.row === row && t.col === col);
            const scaleActive = isInScale(midi);
            const isRoot = midi % 12 === 0;

            let cellLabel = "";
            if (preset.waveform === Waveform.DRUMS) {
              const drumLabels = ['Kick', 'Snare', 'Tom', 'Hat', 'Rim', 'Clap'];
              cellLabel = drumLabels[row] || "";
            } else {
              cellLabel = scaleActive ? `${['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][midi % 12]}${Math.floor(midi/12)-1}` : "";
            }

            return (
              <div
                key={i}
                className={`shred-grid-cell relative flex items-center justify-center pointer-events-none
                  ${isActive ? 'active-cell' : (scaleActive || preset.waveform === Waveform.DRUMS) ? 'bg-[#111]' : 'bg-black/80 opacity-40'}
                  ${isRoot && scaleActive && preset.waveform !== Waveform.DRUMS ? 'border-l-2 border-l-cyan-500' : 'border border-white/5'}
                  ${preset.waveform === Waveform.DRUMS ? 'rounded-md m-1' : ''}
                `}
              >
                {cellLabel && (
                  <div className="absolute top-1.5 left-1.5 text-[8px] font-bold text-white/20 uppercase">
                    {cellLabel}
                  </div>
                )}
                {isRoot && scaleActive && !isActive && preset.waveform !== Waveform.DRUMS && <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/20" />}
              </div>
            );
          })}
        </div>

        <aside className={`absolute right-0 top-0 bottom-0 w-80 bg-[#0a0a0a]/95 backdrop-blur-xl border-l border-white/10 transition-transform duration-300 z-40 flex flex-col ${showSettings ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="flex bg-[#111] p-1 gap-1 m-4 rounded-xl">
            {['synth', 'fx', 'scale'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${activeTab === tab ? 'bg-cyan-500 text-black' : 'text-white/40 hover:text-white'}`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-6 space-y-6">
            {activeTab === 'synth' && (
              <>
                <section className="space-y-4">
                   <h3 className="text-[10px] uppercase font-bold text-white/40">Instruments</h3>
                   <div className="grid grid-cols-2 gap-2">
                    {instruments.map(inst => (
                      <button 
                        key={inst.type}
                        onClick={() => setPreset(prev => ({ ...prev, waveform: inst.type }))}
                        className={`flex flex-col items-center gap-2 py-4 rounded-xl border transition-all ${preset.waveform === inst.type ? 'bg-cyan-500 text-black border-cyan-500 shadow-lg shadow-cyan-500/20' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                      >
                        <inst.icon size={20} />
                        <span className="text-[10px] font-bold uppercase">{inst.label}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="space-y-4 pt-4 border-t border-white/5">
                  <h3 className="text-[10px] uppercase font-bold text-white/40">Oscillators</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {[Waveform.SAWTOOTH, Waveform.SQUARE, Waveform.SINE, Waveform.TRIANGLE].map(w => (
                      <button 
                        key={w}
                        onClick={() => setPreset(prev => ({ ...prev, waveform: w }))}
                        className={`py-2 text-[10px] font-bold rounded-lg border uppercase ${preset.waveform === w ? 'bg-white text-black' : 'bg-white/5 border-white/10'}`}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </section>

                <ControlSlider label="Filter" value={preset.filterCutoff} min={200} max={10000} onChange={v => setPreset(p => ({...p, filterCutoff: v}))} />
                <ControlSlider label="Damping" value={preset.stringDamping} min={0} max={1} step={0.01} onChange={v => setPreset(p => ({...p, stringDamping: v}))} />
              </>
            )}

            {activeTab === 'fx' && (
              <>
                <ControlSlider label="Distortion" value={preset.distortion} min={0} max={1} step={0.01} onChange={v => setPreset(p => ({...p, distortion: v}))} />
                <ControlSlider label="Feedback" value={preset.delayFeedback} min={0} max={0.9} step={0.01} onChange={v => setPreset(p => ({...p, delayFeedback: v}))} />
                <ControlSlider label="Delay Time" value={preset.delayTime} min={0.05} max={1} step={0.01} onChange={v => setPreset(p => ({...p, delayTime: v}))} />
              </>
            )}

            {activeTab === 'scale' && (
              <div className="space-y-4">
                {Object.keys(SCALES).map(s => (
                  <button 
                    key={s}
                    onClick={() => setScale(s as ScaleType)}
                    className={`w-full py-3 px-4 text-left text-xs font-bold rounded-xl border uppercase ${scale === s ? 'bg-cyan-500 text-black' : 'bg-white/5 border-white/10'}`}
                  >
                    {s}
                  </button>
                ))}
                <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                  <span className="text-xs font-bold uppercase">Snap to Scale</span>
                  <button onClick={() => setSnapToScale(!snapToScale)} className={`w-12 h-6 rounded-full relative ${snapToScale ? 'bg-cyan-500' : 'bg-white/10'}`}>
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${snapToScale ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>
      </main>

      <footer className="h-10 border-t border-white/5 bg-[#050505] flex items-center px-6 justify-between text-[10px] font-bold uppercase text-white/40">
        <div className="flex gap-6">
          <span>{preset.waveform === Waveform.DRUMS ? 'Percussion Mode' : scale}</span>
          <span>{activeTouches.size} Note(s)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span>Engine Active</span>
        </div>
      </footer>
    </div>
  );
};

const ControlSlider: React.FC<{label: string, value: number, min: number, max: number, step?: number, onChange: (v: number) => void}> = ({label, value, min, max, step = 1, onChange}) => (
  <div>
    <div className="flex justify-between text-[10px] uppercase font-bold text-white/30 mb-2">
      <span>{label}</span>
      <span>{value.toFixed(2)}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full h-1.5 rounded-lg appearance-none bg-white/5 cursor-pointer accent-cyan-500" />
  </div>
);

export default App;
