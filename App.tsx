
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { audioEngine } from './services/AudioEngine';
import { generateAIPreset } from './services/GeminiService';
import { Waveform, InstrumentPreset, GridPos } from './types';
import { 
  Settings, 
  Sparkles, 
  Volume2, 
  Activity, 
  Music, 
  ChevronRight,
  Zap
} from 'lucide-react';

const ROWS = 6;
const COLS = 12;
const ROW_INTERVAL = 5; // Perfect 4th
const START_MIDI = 48; // C3

const midiToFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

const App: React.FC = () => {
  const [preset, setPreset] = useState<InstrumentPreset>({
    name: 'Lead Shredder',
    waveform: Waveform.SAWTOOTH,
    filterCutoff: 2500,
    resonance: 8,
    attack: 0.05,
    decay: 0.2,
    sustain: 0.6,
    release: 1.0,
    detune: 0,
    vibratoRate: 6,
    vibratoDepth: 0.2
  });
  
  const [activeTouches, setActiveTouches] = useState<Map<number, GridPos>>(new Map());
  const [isAIGenerating, setIsAIGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    audioEngine.updatePreset(preset);
  }, [preset]);

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    const row = parseInt(target.dataset.row || '-1');
    const col = parseInt(target.dataset.col || '-1');
    
    if (row !== -1 && col !== -1) {
      const midi = START_MIDI + (row * ROW_INTERVAL) + col;
      const freq = midiToFreq(midi);
      audioEngine.noteOn(e.pointerId, freq);
      setActiveTouches(prev => new Map(prev).set(e.pointerId, { row, col }));
      (target as any).releasePointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeTouches.has(e.pointerId)) return;
    
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Calculate position within the grid for expression
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1 - (e.clientY - rect.top) / rect.height;

    // Isomorphic expression logic: 
    // Slide horizontally = micro-pitch bending
    // Slide vertically = timbre modulation
    const cellWidth = rect.width / COLS;
    const cellHeight = rect.height / ROWS;
    
    const colFloat = (e.clientX - rect.left) / cellWidth;
    const rowFloat = (e.clientY - rect.top) / cellHeight;
    
    // Invert row because visual 0 is top
    const actualRowFloat = ROWS - rowFloat;
    
    const midiFloat = START_MIDI + (Math.floor(rowFloat) * ROW_INTERVAL) + colFloat;
    const freq = midiToFreq(midiFloat);
    
    // ModX is based on how far from cell center we are horizontally
    const modX = (colFloat % 1) - 0.5;
    // ModY is vertical position within the grid
    const modY = y;

    audioEngine.noteUpdate(e.pointerId, freq, modX, modY);
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
    if (!aiPrompt) return;
    setIsAIGenerating(true);
    try {
      const newPreset = await generateAIPreset(aiPrompt);
      setPreset(newPreset);
      setShowSettings(true);
    } catch (error) {
      console.error(error);
    } finally {
      setIsAIGenerating(false);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-black text-white select-none overflow-hidden">
      {/* Header / Toolbar */}
      <header className="h-14 border-b border-white/10 flex items-center justify-between px-6 bg-[#111] z-20">
        <div className="flex items-center gap-3">
          <div className="bg-cyan-500 p-1.5 rounded-lg">
            <Zap size={20} className="text-black fill-current" />
          </div>
          <h1 className="font-extrabold text-xl tracking-tighter italic uppercase text-cyan-400">
            GeoShred <span className="text-white opacity-40">Pro</span>
          </h1>
        </div>

        <div className="flex-1 max-w-xl mx-8 relative">
          <input 
            type="text" 
            placeholder="Describe a sound (e.g. 'Epic screaming lead guitar')..."
            className="w-full bg-white/5 border border-white/10 rounded-full py-2 px-5 pr-12 focus:outline-none focus:border-cyan-500/50 transition-all text-sm"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAIGenerate()}
          />
          <button 
            onClick={handleAIGenerate}
            disabled={isAIGenerating}
            className={`absolute right-1 top-1 p-1.5 rounded-full ${isAIGenerating ? 'bg-white/10 text-white/20' : 'bg-cyan-500 text-black hover:bg-cyan-400'} transition-all`}
          >
            {isAIGenerating ? <Activity size={18} className="animate-pulse" /> : <Sparkles size={18} />}
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end mr-2">
            <span className="text-[10px] uppercase font-bold tracking-widest text-white/30">Preset</span>
            <span className="text-xs font-semibold text-cyan-400">{preset.name}</span>
          </div>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-lg transition-all ${showSettings ? 'bg-cyan-500 text-black' : 'bg-white/5 hover:bg-white/10'}`}
          >
            <Settings size={22} />
          </button>
        </div>
      </header>

      {/* Main Grid Area */}
      <main className="flex-1 relative flex overflow-hidden">
        {/* The Instrument Grid */}
        <div 
          ref={gridRef}
          className="flex-1 grid gap-[1px] bg-white/5 p-[1px] touch-none"
          style={{ gridTemplateRows: `repeat(${ROWS}, 1fr)`, gridTemplateColumns: `repeat(${COLS}, 1fr)` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {Array.from({ length: ROWS * COLS }).map((_, i) => {
            const row = Math.floor(i / COLS);
            const col = i % COLS;
            const midi = START_MIDI + (row * ROW_INTERVAL) + col;
            // Explicitly cast the value in the .some() callback to fix the unknown type error on properties row and col
            const isActive = Array.from(activeTouches.values()).some((t: GridPos) => t.row === row && t.col === col);
            const isRoot = midi % 12 === 0;
            const isOctave = midi % 12 === 0 && midi !== 0;

            return (
              <div
                key={i}
                data-row={row}
                data-col={col}
                className={`shred-grid-cell relative flex items-center justify-center border border-white/5 cursor-crosshair
                  ${isActive ? 'active-cell' : 'bg-[#151515]'}
                  ${isRoot ? 'border-l-cyan-500/40 border-l-2' : ''}
                  ${isOctave ? 'octave-cell bg-[#1a1a1a]' : ''}
                `}
              >
                <div className="absolute top-1 left-1.5 text-[8px] font-bold text-white/10 pointer-events-none uppercase">
                  {['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][midi % 12]}{Math.floor(midi/12)-1}
                </div>
                {isActive && (
                  <div className="absolute inset-0 animate-pulse bg-cyan-400/5 pointer-events-none" />
                )}
              </div>
            );
          })}
        </div>

        {/* Sidebar Settings */}
        <aside className={`absolute right-0 top-0 bottom-0 w-80 bg-[#111] border-l border-white/10 transition-transform duration-300 z-10 shadow-2xl p-6 overflow-y-auto ${showSettings ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="flex items-center gap-2 mb-8">
            <Volume2 className="text-cyan-400" size={20} />
            <h2 className="font-bold text-lg uppercase tracking-wider">Engine Settings</h2>
          </div>

          <div className="space-y-6">
            <section>
              <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 block mb-3">Oscillator</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.values(Waveform).map(w => (
                  <button 
                    key={w}
                    onClick={() => setPreset(prev => ({ ...prev, waveform: w }))}
                    className={`py-2 px-3 text-xs rounded-md border capitalize transition-all ${preset.waveform === w ? 'bg-cyan-500 border-cyan-500 text-black' : 'bg-white/5 border-white/10 hover:border-white/30'}`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <div className="flex justify-between items-center mb-3">
                <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Filter Cutoff</label>
                <span className="text-xs text-cyan-400 font-mono">{Math.round(preset.filterCutoff)}Hz</span>
              </div>
              <input 
                type="range" min="100" max="10000" step="10"
                value={preset.filterCutoff}
                onChange={(e) => setPreset(prev => ({ ...prev, filterCutoff: parseFloat(e.target.value) }))}
                className="w-full accent-cyan-500 bg-white/10 h-1.5 rounded-lg appearance-none"
              />
            </section>

            <section>
              <div className="flex justify-between items-center mb-3">
                <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Resonance</label>
                <span className="text-xs text-cyan-400 font-mono">{preset.resonance}</span>
              </div>
              <input 
                type="range" min="0" max="25" step="0.5"
                value={preset.resonance}
                onChange={(e) => setPreset(prev => ({ ...prev, resonance: parseFloat(e.target.value) }))}
                className="w-full accent-cyan-500 bg-white/10 h-1.5 rounded-lg appearance-none"
              />
            </section>

            <section>
              <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 block mb-4">ADSR Envelope</label>
              <div className="grid grid-cols-2 gap-4">
                {['attack', 'decay', 'sustain', 'release'].map(attr => (
                  <div key={attr}>
                    <div className="flex justify-between text-[10px] mb-1 capitalize">
                      <span>{attr}</span>
                      <span className="text-cyan-400">{(preset as any)[attr]}</span>
                    </div>
                    <input 
                      type="range" min="0.01" max="2" step="0.01"
                      value={(preset as any)[attr]}
                      onChange={(e) => setPreset(prev => ({ ...prev, [attr]: parseFloat(e.target.value) }))}
                      className="w-full accent-cyan-500 bg-white/10 h-1 rounded-lg appearance-none"
                    />
                  </div>
                ))}
              </div>
            </section>

            <section>
               <div className="flex justify-between items-center mb-3">
                <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Vibrato Depth</label>
                <span className="text-xs text-cyan-400 font-mono">{preset.vibratoDepth}</span>
              </div>
              <input 
                type="range" min="0" max="1" step="0.01"
                value={preset.vibratoDepth}
                onChange={(e) => setPreset(prev => ({ ...prev, vibratoDepth: parseFloat(e.target.value) }))}
                className="w-full accent-cyan-500 bg-white/10 h-1.5 rounded-lg appearance-none"
              />
            </section>
          </div>

          <div className="mt-12 pt-8 border-t border-white/5">
            <button 
              onClick={() => audioEngine.setMasterVolume(0)}
              className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 py-3 rounded-lg font-bold text-xs uppercase tracking-widest transition-all"
            >
              Emergency Kill
            </button>
          </div>
        </aside>
      </main>

      {/* Expression Visualizer Footer */}
      <footer className="h-10 border-t border-white/10 bg-[#0a0a0a] flex items-center px-4 justify-between">
        <div className="flex items-center gap-6 overflow-hidden">
          <div className="flex items-center gap-2">
            <Music size={14} className="text-white/40" />
            <span className="text-[10px] text-white/40 uppercase font-bold tracking-widest">Active Notes</span>
            <div className="flex gap-1">
              {Array.from(activeTouches.keys()).map(id => (
                <div key={id} className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_5px_cyan]" />
              ))}
              {activeTouches.size === 0 && <span className="text-[10px] text-white/10">Idle</span>}
            </div>
          </div>
        </div>
        
        <div className="text-[9px] text-white/20 font-medium uppercase flex items-center gap-2">
          <span>Buffer: Low Latency</span>
          <div className="w-1 h-1 rounded-full bg-green-500" />
          <span className="ml-2">Mode: Isomorphic Fourth</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
