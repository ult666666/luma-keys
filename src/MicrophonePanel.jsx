import React, { useEffect, useState } from 'react';
import { Mic, Keyboard, VolumeX } from 'lucide-react';

export default function MicrophonePanel({ status, onStart, onStop, onMidi }) {
  const [devices, setDevices] = useState([]), [device, setDevice] = useState('');
  useEffect(() => {
    let alive = true;
    navigator.mediaDevices?.enumerateDevices().then(list => {
      if (alive) setDevices(list.filter(item => item.kind === 'audioinput'));
    }).catch(() => {});
    return () => { alive = false; };
  }, [status.phase]);
  const active = status.phase === 'listening' || status.phase === 'requesting';
  return <div className="piano-input-options">
    <section className="piano-microphone-option">
      <div className="piano-input-title"><Mic size={24}/><div><h3>Play your piano</h3><span>Microphone · Beta</span></div></div>
      <p>Play the highlighted keys. Wait mode moves on after a clear matching press; your companion follows along.</p>
      <label>Microphone<select value={device} disabled={active} onChange={e => setDevice(e.target.value)} aria-label="Microphone device">
        <option value="">System default</option>{devices.filter(d => d.deviceId && d.deviceId !== 'default').map((d,i) => <option value={d.deviceId} key={d.deviceId}>{d.label || `Microphone ${i+1}`}</option>)}
      </select></label>
      <div className="piano-mic-details"><span><VolumeX size={15}/> App sound stays off while listening.</span><span>Start with one hand, C3–C6, pedal up. Simple chords of up to three notes are supported; octave and hollow fifth chords need MIDI. Extra octave notes can be mistaken for overtones.</span><span>Audio is processed on this Mac and is not recorded. Pet tips use note information only.</span></div>
      {status.error && <p role="alert" className="piano-mic-error">{status.error}</p>}
      <button className={active ? 'secondary' : 'primary'} onClick={active ? onStop : () => onStart(device)}>{active ? 'Stop microphone' : 'Start microphone'}</button>
    </section>
    <button className="piano-midi-option secondary" onClick={onMidi}><Keyboard size={23}/><span><strong>USB / MIDI piano</strong><small>Exact key detection, all notes and chords</small></span></button>
  </div>;
}
