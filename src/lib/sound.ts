/**
 * Web Audio API synthesizer for sound effects
 * This allows playing audio cues dynamically without loading external MP3 files.
 */

// Simple sound synthesis using Web Audio API
export const playSound = (type: 'click' | 'success' | 'unlock' | 'levelup') => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    
    // Check if browser audio is suspended (e.g. user interaction required)
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') {
      // In some browsers we need to resume context in an interaction. 
      // But usually this will be triggered by an onClick event.
      ctx.resume();
    }
    
    const now = ctx.currentTime;
    
    if (type === 'click') {
      // Short subtle click
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);
      
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'success') {
      // Warm chime (two notes: C5 and E5)
      const notes = [
        { freq: 523.25, time: 0, dur: 0.2 }, // C5
        { freq: 659.25, time: 0.08, dur: 0.25 } // E5
      ];
      
      notes.forEach(({ freq, time, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + time);
        
        gain.gain.setValueAtTime(0, now + time);
        gain.gain.linearRampToValueAtTime(0.12, now + time + 0.02);
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
        
        // Alternating oscillator types for rich sound
        osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.06 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.25);
        
        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.25);
      });
    } else if (type === 'levelup') {
      // Rising levelup melody
      const notes = [
        { freq: 392.00, time: 0, dur: 0.1 },     // G4
        { freq: 523.25, time: 0.1, dur: 0.1 },   // C5
        { freq: 659.25, time: 0.2, dur: 0.1 },   // E5
        { freq: 783.99, time: 0.3, dur: 0.15 },  // G5
        { freq: 659.25, time: 0.45, dur: 0.15 }, // E5
        { freq: 1046.50, time: 0.6, dur: 0.4 }   // C6
      ];
      
      notes.forEach(({ freq, time, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + time);
        
        gain.gain.setValueAtTime(0, now + time);
        gain.gain.linearRampToValueAtTime(0.15, now + time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);
        
        osc.start(now + time);
        osc.stop(now + time + dur);
      });
    }
  } catch (err) {
    console.warn('Audio play failed or not supported:', err);
  }
};
