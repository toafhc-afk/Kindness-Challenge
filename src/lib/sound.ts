/**
 * Web Audio API synthesizer for sound effects
 * This allows playing audio cues dynamically without loading external MP3 files.
 */

let sharedCtx: AudioContext | null = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!sharedCtx) {
    sharedCtx = new AudioContextClass();
  }
  // Try to resume if suspended
  if (sharedCtx.state === 'suspended') {
    sharedCtx.resume().catch(() => {});
  }
  return sharedCtx;
}

// User-gesture helper to unlock audio on mobile
export const unlockAudio = () => {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
};

export const playSound = (type: 'click' | 'success' | 'unlock' | 'levelup') => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    
    const now = ctx.currentTime;
    
    if (type === 'click') {
      // Short subtle click
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.1);
      
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'success') {
      // Warm chime (two notes: C5 and E5)
      const notes = [
        { freq: 523.25, time: 0, dur: 0.25 }, // C5
        { freq: 659.25, time: 0.08, dur: 0.35 } // E5
      ];
      
      notes.forEach(({ freq, time, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + time);
        
        gain.gain.setValueAtTime(0, now + time);
        gain.gain.linearRampToValueAtTime(0.4, now + time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);
        
        osc.start(now + time);
        osc.stop(now + time + dur);
      });
    } else if (type === 'unlock') {
      // Ascending major pentatonic scale fanfare
      const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C4, E4, G4, C5, E5, G5, C6
      
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.35, now + idx * 0.06 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.3);
        
        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.3);
      });
    } else if (type === 'levelup') {
      // Rising levelup melody
      const notes = [
        { freq: 392.00, time: 0, dur: 0.12 },     // G4
        { freq: 523.25, time: 0.12, dur: 0.12 },   // C5
        { freq: 659.25, time: 0.24, dur: 0.12 },   // E5
        { freq: 783.99, time: 0.36, dur: 0.18 },  // G5
        { freq: 659.25, time: 0.54, dur: 0.18 }, // E5
        { freq: 1046.50, time: 0.72, dur: 0.55 }   // C6
      ];
      
      notes.forEach(({ freq, time, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + time);
        
        gain.gain.setValueAtTime(0, now + time);
        gain.gain.linearRampToValueAtTime(0.45, now + time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);
        
        osc.start(now + time);
        osc.stop(now + time + dur);
      });
    }
  } catch (err) {
    console.warn('Audio play failed or not supported:', err);
  }
};
