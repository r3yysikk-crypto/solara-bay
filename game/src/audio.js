// All sound is synthesised with WebAudio: no audio files, no network. The
// engine hums with speed, the siren wails two tones while the police chase,
// and crashes, doors and horns are short shaped bursts of noise or tone.
export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let started = false;

  function ensure() {
    if (started) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);

      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();

      sirenOsc = context.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();

      started = true;
      return true;
    } catch {
      return false;
    }
  }

  function resume() {
    if (context && context.state === 'suspended') context.resume();
  }

  function noiseBurst(duration, volume, filterFreq) {
    if (!context) return;
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  function tone(freq, duration, volume, type = 'sine') {
    if (!context) return;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(context.currentTime + duration);
  }

  return {
    // Called from the start button's gesture, so the browser allows sound.
    unlock() {
      if (ensure()) resume();
    },
    setEngine(speedRatio, driving) {
      if (!context) return;
      const target = driving ? 0.05 + 0.11 * speedRatio : 0.0;
      engineGain.gain.setTargetAtTime(target, context.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(46 + 150 * speedRatio, context.currentTime, 0.06);
      engineFilter.frequency.setTargetAtTime(320 + 900 * speedRatio, context.currentTime, 0.1);
    },
    setSiren(on, dt) {
      if (!context) return;
      sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, context.currentTime, 0.15);
      if (!on) return;
      sirenTimer += dt;
      if (sirenTimer > 0.42) {
        sirenTimer = 0;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.setTargetAtTime(sirenHigh ? 920 : 660, context.currentTime, 0.02);
      }
    },
    crash(strength) {
      noiseBurst(0.22, Math.min(0.5, 0.15 + strength * 0.3), 900);
      tone(70, 0.18, 0.25, 'square');
    },
    door() {
      tone(180, 0.09, 0.22, 'square');
      noiseBurst(0.06, 0.12, 1400);
    },
    horn() {
      tone(370, 0.35, 0.16, 'square');
      tone(466, 0.35, 0.12, 'square');
    },
    sirenBlip() {
      tone(880, 0.12, 0.14, 'triangle');
      tone(660, 0.12, 0.14, 'triangle');
    },
    click() {
      tone(660, 0.06, 0.15, 'sine');
    },
    busted() {
      tone(520, 0.5, 0.2, 'triangle');
      tone(392, 0.7, 0.2, 'triangle');
    },
  };
}
