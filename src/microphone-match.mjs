export function microphoneMatches(event, expected) {
  const wanted = [...new Set(expected)].sort((a,b) => a-b);
  const heard = [...new Set(event?.notes || [])].sort((a,b) => a-b);
  return event?.type === 'attack' && event.expectedMatch === true && wanted.length > 0 &&
    heard.length === wanted.length && heard.every((note,i) => note === wanted[i]);
}

export function microphoneTargetMessage(status) {
  const reasons = {
    'outside-range': 'These notes are outside C3–C6. Choose a beginner exercise or use MIDI.',
    'too-many-notes': 'This chord has more than three notes. Try one hand or use MIDI.',
    'overlapping-harmonics': 'Octave chords need MIDI for a reliable check. Try one hand.',
    'ambiguous-harmonics': 'This chord is hard to separate by sound. Try one hand or use MIDI.',
  };
  return reasons[status?.unsupportedReason] || '';
}
