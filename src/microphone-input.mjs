/** Explicit, local-only capture. Stop invalidates every pending permission,
 * worker result and target; it never persists a device or permission choice. */
export function createMicrophoneInput({
  onStatus = () => {}, onAttack = () => {},
  media = globalThis.navigator?.mediaDevices,
  makeContext = () => new AudioContext({ latencyHint: 'interactive' }),
  makeWorker = () => new Worker(new URL('./microphone-worker.js', import.meta.url), { type: 'module' }),
  makeNode = (ctx) => new AudioWorkletNode(ctx, 'luma-piano-capture'),
} = {}) {
  let generation = 0, stream, context, worker, node, source, scope = null;
  let phase = 'off', pending = 0, barrier = 0, serial = 0, detector = null, targetKey = null, expected = [];
  let queued = null, gap = false;
  const emit = (extra = {}) => onStatus({ phase, detector, ...extra });
  function stop() {
    generation++; scope = null; targetKey = null; pending = 0; barrier = 0; expected = []; queued = null; gap = false;
    if (node) node.port.onmessage = null;
    source?.disconnect(); node?.disconnect(); worker?.terminate();
    stream?.getTracks().forEach(track => track.stop());
    context?.close().catch(() => {});
    stream = context = worker = node = source = null;
    detector = null; phase = 'off'; emit();
  }
  function fail(error) {
    stop(); phase = 'error';
    const message = error?.name === 'NotAllowedError'
      ? 'Microphone access was not allowed. Enable Luma Keys in System Settings → Privacy & Security → Microphone, then retry.'
      : error?.name === 'NotFoundError' ? 'No microphone found. Connect one, then retry.'
      : error?.message || 'The microphone stopped. Reconnect it, then retry.';
    emit({ error: message });
  }
  function sendAudio(data) {
    const end = data.start + data.samples.length / context.sampleRate;
    if (data.start < barrier || end < context.currentTime - 0.3) { gap = true; return; }
    if (pending >= 4) {
      if (queued) gap = true;
      queued = data;
      return;
    }
    pending++;
    worker.postMessage({ type: 'audio', samples: data.samples, scope, reset: gap, captureEnd: end }, [data.samples.buffer]);
    gap = false;
  }
  async function start(deviceId = '') {
    stop(); const token = generation; phase = 'requesting'; emit();
    try {
      if (!media?.getUserMedia) throw Error('Microphone practice needs the desktop app or a secure browser.');
      const granted = await media.getUserMedia({ audio: {
        channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      }, video: false });
      if (token !== generation) { granted.getTracks().forEach(t => t.stop()); return false; }
      stream = granted; context = makeContext();
      for (const track of stream.getAudioTracks()) track.onended = () => { if (token === generation) fail(Error('Microphone disconnected. Reconnect it, then retry.')); };
      await context.audioWorklet.addModule('/microphone-worklet.js');
      if (token !== generation) return false;
      worker = makeWorker(); worker.postMessage({ type: 'init', sampleRate: context.sampleRate });
      worker.postMessage({ type: 'target', scope, expected });
      worker.onerror = () => { if (token === generation) fail(Error('The note listener stopped. Please retry.')); };
      worker.onmessage = ({ data }) => {
        if (token !== generation) return;
        if (data.type === 'ack') {
          pending = Math.max(0, pending - 1);
          if (queued) { const latest = queued; queued = null; sendAudio(latest); }
          return;
        }
        if (data.type === 'status' && data.scope === scope) { detector = data.status; emit(); }
        if (data.type === 'attack' && scope && data.scope === scope &&
            data.captureEnd >= context.currentTime - 0.3) onAttack(data.event, scope);
      };
      node = makeNode(context); source = context.createMediaStreamSource(stream);
      source.connect(node); node.connect(context.destination);
      node.port.onmessage = ({ data }) => {
        if (token !== generation) return;
        // Retain only the newest waiting chunk during a UI/worker stall.
        // Gaps warm the detector again instead of replaying stale keystrokes.
        sendAudio(data);
      };
      await context.resume();
      if (token !== generation) return false;
      phase = 'listening'; emit(); return true;
    } catch (error) { if (token === generation) fail(error); return false; }
  }
  function setTarget(key, notes = []) {
    if (key === targetKey) return scope;
    expected = [...notes];
    targetKey = key; scope = key == null ? null : `${generation}:${++serial}:${key}`;
    if (queued) { queued = null; gap = true; }
    barrier = context?.currentTime || 0;
    worker?.postMessage({ type: 'target', scope, expected });
    return scope;
  }
  return { start, stop, setTarget, getState: () => ({ phase, scope, detector, pending, tracks: stream?.getAudioTracks().filter(t => t.readyState === 'live').length || 0 }) };
}
