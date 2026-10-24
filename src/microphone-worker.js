import { createMicrophoneDetector } from './microphone-detector.mjs';
let detector, scope = null, barrier = 0, lastStatus = 0;
self.onmessage = ({ data }) => {
  if (data.type === 'init') {
    detector = createMicrophoneDetector({ sampleRate: data.sampleRate });
  } else if (data.type === 'target' && detector) {
    scope = data.scope;
    barrier = detector.getStatus().timeSeconds;
    detector.setExpected(data.expected || []);
  } else if (data.type === 'audio' && detector) {
    if (data.reset) { detector.reset(); barrier = 0; }
    const events = detector.process(data.samples);
    for (const event of events) {
      if (scope && data.scope === scope && detector.getStatus().supported && event.timeSeconds >= barrier)
        self.postMessage({ type: 'attack', scope, event, captureEnd: data.captureEnd });
    }
    if (performance.now() - lastStatus > 120) {
      lastStatus = performance.now();
      self.postMessage({ type: 'status', scope, status: detector.getStatus() });
    }
    self.postMessage({ type: 'ack' });
  }
};
