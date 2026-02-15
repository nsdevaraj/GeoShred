import React, { useState, useEffect, useRef } from 'react';
import { audioEngine } from './services/AudioEngine';
import { PRESETS } from './services/GeminiService';
import { Waveform, InstrumentPreset, GridPos, ScaleType, Loop } from './types';
import { 
  Settings, 
  Activity, 
  Music, 
  Zap,
  Layers,
  Repeat,
  Cpu,
  Guitar,
  Piano,
  MousePointer2,
  Drum,
  ChevronDown,
  Circle,
  Square,
  Play,
  Pause,
  Trash2,
  RefreshCw
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
  const [preset, setPreset] = useState<InstrumentPreset>(PRESETS[0]);
  const [scale, setScale] = useState<ScaleType>(ScaleType.CHROMATIC);
  const [activeTouches, setActiveTouches] = useState<Map<number, GridPos>>(new Map());
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<'synth' | 'fx' | 'scale' | 'loops'>('synth');
  const [snapToScale, setSnapToScale] = useState(true);
  
  // Recording and Loops state
  const [isRecording, setIsRecording] = useState(false);
  const [loops, setLoops] = useState<Loop[]>([]);

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
    audioEngine.noteOn(e.pointerId, freq, row); 
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

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = PRESETS.find(p => p.name === e.target.value);
    if (selected) setPreset(selected);
  };

  const toggleRecording = async () => {
    if (isRecording) {
      const newLoop = await audioEngine.stopRecording();
      if (newLoop) {
        setLoops(prev => [...prev, newLoop]);
        setShowSettings(true);
        setActiveTab('loops');
      }
      setIsRecording(false);
    } else {
      audioEngine.startRecording();
      setIsRecording(true);
    }
  };

  const toggleLoop = (id: string) => {
    setLoops(prev => prev.map(l => {
      if (l.id === id) {
        if (l.isPlaying) {
          audioEngine.stopLoop(id);
          return { ...l, isPlaying: false, startTime: undefined };
        } else {
          audioEngine.playLoop(l, () => {
            // Callback when loop ends if not looping, but we loop them
          });
          return { ...l, isPlaying: true, startTime: audioEngine.currentTime };
        }
      }
      return l;
    }));
  };

  const deleteLoop = (id: string) => {
    audioEngine.stopLoop(id);
    setLoops(prev => prev.filter(l => l.id !== id));
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
          <div className="hidden sm:block">
            <h1 className="font-black text-xl tracking-tighter italic uppercase text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-white">
              GeoShred <span className="text-white/20">Studio</span>
            </h1>
          </div>
        </div>

        <div className="flex-1 max-w-md mx-4 sm:mx-8 relative">
          <div className="relative group">
            <select 
              value={preset.name}
              onChange={handlePresetChange}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-6 pr-10 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition-all text-sm appearance-none cursor-pointer font-bold tracking-tight text-cyan-400"
            >
              {PRESETS.map(p => (
                <option key={p.name} value={p.name} className="bg-[#111] text-white">{p.name}</option>
              ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/40">
              <ChevronDown size={16} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={toggleRecording}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all ${isRecording ? 'bg-red-500 border-red-500 text-white animate-pulse' : 'bg-white/5 border-white/10 text-red-500 hover:bg-white/10'}`}
          >
            {isRecording ? <Square size={16} fill="currentColor" /> : <Circle size={16} fill="currentColor" />}
            <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:inline">
              {isRecording ? 'Stop' : 'Rec'}
            </span>
          </button>
          
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`px-4 py-2 rounded-xl border transition-all ${showSettings ? 'bg-cyan-500 text-black border-cyan-500' : 'bg-white/5 border-white/10'}`}
          >
            <Settings size={18} />
          </button>
        </div>
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
            const isActive = Array.from(activeTouches.values()).some((t: GridPos) => t.row === row && t.col === col);
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
          <div className="flex bg-[#111] p-1 gap-1 m-4 rounded-xl border border-white/5">
            {['synth', 'fx', 'scale', 'loops'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${activeTab === tab ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20' : 'text-white/40 hover:text-white'}`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-6 space-y-6">
            {activeTab === 'synth' && (
              <>
                <section className="space-y-4">
                   <h3 className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Base Category</h3>
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

                <ControlSlider label="Filter Cutoff" value={preset.filterCutoff} min={200} max={10000} onChange={v => setPreset(p => ({...p, filterCutoff: v}))} />
                <ControlSlider label="String Damping" value={preset.stringDamping} min={0} max={1} step={0.01} onChange={v => setPreset(p => ({...p, stringDamping: v}))} />
                <ControlSlider label="Release" value={preset.release} min={0.1} max={3} step={0.1} onChange={v => setPreset(p => ({...p, release: v}))} />
              </>
            )}

            {activeTab === 'fx' && (
              <>
                <ControlSlider label="Distortion Drive" value={preset.distortion} min={0} max={1} step={0.01} onChange={v => setPreset(p => ({...p, distortion: v}))} />
                <ControlSlider label="Delay Feedback" value={preset.delayFeedback} min={0} max={0.9} step={0.01} onChange={v => setPreset(p => ({...p, delayFeedback: v}))} />
                <ControlSlider label="Delay Time" value={preset.delayTime} min={0.05} max={1} step={0.01} onChange={v => setPreset(p => ({...p, delayTime: v}))} />
              </>
            )}

            {activeTab === 'scale' && (
              <div className="space-y-4">
                <h3 className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Master Tuning</h3>
                {Object.keys(SCALES).map(s => (
                  <button 
                    key={s}
                    onClick={() => setScale(s as ScaleType)}
                    className={`w-full py-3 px-4 text-left text-xs font-bold rounded-xl border uppercase transition-all ${scale === s ? 'bg-cyan-500 text-black border-cyan-500 shadow-lg shadow-cyan-500/20' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                  >
                    {s}
                  </button>
                ))}
                <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                  <span className="text-xs font-bold uppercase">Snap to Scale</span>
                  <button onClick={() => setSnapToScale(!snapToScale)} className={`w-12 h-6 rounded-full relative transition-all ${snapToScale ? 'bg-cyan-500' : 'bg-white/10'}`}>
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${snapToScale ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'loops' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Loop Rack</h3>
                  <span className="bg-cyan-500/20 text-cyan-500 px-2 py-0.5 rounded text-[8px] font-black">{loops.length} LOOPS</span>
                </div>
                
                {loops.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-white/5 rounded-2xl text-white/20">
                    <RefreshCw size={32} className="mb-4 opacity-20" />
                    <p className="text-[10px] uppercase font-bold tracking-widest">No Loops Recorded</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {loops.map((loop, idx) => (
                      <LoopItem 
                        key={loop.id} 
                        loop={loop} 
                        index={idx} 
                        onToggle={toggleLoop} 
                        onDelete={deleteLoop} 
                      />
                    ))}
                  </div>
                )}
                
                <p className="text-[8px] uppercase font-bold text-white/20 text-center mt-6 tracking-widest">
                  Loops are saved for the current session only
                </p>
              </div>
            )}
          </div>
        </aside>
      </main>

      <footer className="h-10 border-t border-white/5 bg-[#050505] flex items-center px-6 justify-between text-[10px] font-bold uppercase tracking-widest text-white/40">
        <div className="flex gap-6 items-center">
          <span className="text-cyan-500/80 flex items-center gap-1"><Activity size={10} /> {preset.name}</span>
          <span>{preset.waveform === Waveform.DRUMS ? 'Percussion Mode' : scale}</span>
          <span>{activeTouches.size} Note(s)</span>
        </div>
        <div className="flex items-center gap-2">
          {loops.some(l => l.isPlaying) && <div className="flex items-center gap-1 mr-4"><RefreshCw size={10} className="animate-spin text-cyan-500" /> <span className="text-cyan-500">Loops Running</span></div>}
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
          <span className="opacity-60">Engine Active</span>
        </div>
      </footer>
    </div>
  );
};

const LoopItem: React.FC<{
  loop: Loop;
  index: number;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}> = ({ loop, index, onToggle, onDelete }) => {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (loop.isPlaying && loop.startTime !== undefined) {
      const updateProgress = () => {
        const now = audioEngine.currentTime;
        const duration = loop.buffer.duration;
        const elapsed = now - (loop.startTime || 0);
        const p = (elapsed % duration) / duration;
        setProgress(p);
        rafRef.current = requestAnimationFrame(updateProgress);
      };
      rafRef.current = requestAnimationFrame(updateProgress);
    } else {
      setProgress(0);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [loop.isPlaying, loop.startTime, loop.buffer.duration]);

  // SVG parameters
  const size = 40;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - progress * circumference;

  return (
     <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between group hover:border-cyan-500/30 transition-all">
      <div className="flex items-center gap-3">
        <div className="relative w-10 h-10 flex items-center justify-center">
             <svg className="absolute top-0 left-0 w-full h-full transform -rotate-90 pointer-events-none">
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="transparent"
                  stroke={loop.isPlaying ? "rgba(255, 255, 255, 0.1)" : "transparent"}
                  strokeWidth={strokeWidth}
                />
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="transparent"
                  stroke={loop.isPlaying ? "#06b6d4" : "transparent"} 
                  strokeWidth={strokeWidth}
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                />
             </svg>

            <button 
              onClick={() => onToggle(loop.id)}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all z-10 ${loop.isPlaying ? 'bg-cyan-500/20 text-cyan-500' : 'bg-white/10 text-white'}`}
            >
              {loop.isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
            </button>
        </div>
        
        <div>
          <p className="text-[10px] font-black uppercase tracking-tight">Loop {index + 1}</p>
          <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">
            {loop.buffer.duration.toFixed(1)}s • {loop.isPlaying ? 'Playing' : 'Ready'}
          </p>
        </div>
      </div>
      <button 
        onClick={() => onDelete(loop.id)}
        className="opacity-0 group-hover:opacity-100 p-2 text-white/20 hover:text-red-500 transition-all"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
};

const ControlSlider: React.FC<{label: string, value: number, min: number, max: number, step?: number, onChange: (v: number) => void}> = ({label, value, min, max, step = 1, onChange}) => (
  <div className="group">
    <div className="flex justify-between text-[10px] uppercase font-bold text-white/30 mb-2 group-hover:text-white/60 transition-colors">
      <span>{label}</span>
      <span className="font-mono text-cyan-400">{value.toFixed(2)}</span>
    </div>
    <input 
      type="range" 
      min={min} 
      max={max} 
      step={step} 
      value={value} 
      onChange={(e) => onChange(parseFloat(e.target.value))} 
      className="w-full h-1.5 rounded-lg appearance-none bg-white/5 cursor-pointer accent-cyan-500" 
    />
  </div>
);

export default App;