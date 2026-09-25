// Refresh only ports that changed. Opening an already-connected input can emit
// statechange; that must not release notes or attach a second handler.
export function bindMIDIInputs(access, handlers) {
  const bound = new Map();
  let serial = 0,
    disposed = false;
  const remove = (input) => {
    const binding = bound.get(input);
    if (!binding) return;
    if (input.onmidimessage === binding.receive) input.onmidimessage = null;
    handlers.disconnect(binding.prefix);
    bound.delete(input);
  };
  const refresh = () => {
    if (disposed) return;
    const inputs = [...access.inputs.values()].filter(
      (input) => input.state !== "disconnected",
    );
    for (const input of bound.keys())
      if (!inputs.includes(input)) remove(input);
    for (const input of inputs) {
      if (bound.has(input)) continue;
      const prefix = `midi:${++serial}:`;
      const receive = ({ data }) => {
        if (
          disposed ||
          bound.get(input)?.receive !== receive ||
          input.state === "disconnected" ||
          !data ||
          data.length < 3
        )
          return;
        const [status, note, value] = data;
        if (
          ![status, note, value].every(Number.isInteger) ||
          status < 128 ||
          status > 255 ||
          note < 0 ||
          note > 127 ||
          value < 0 ||
          value > 127
        )
          return;
        const channel = prefix + (status & 15) + ":";
        if ((status & 240) === 144 && value > 0)
          handlers.noteOn(note, value / 127, channel + note);
        if ((status & 240) === 128 || ((status & 240) === 144 && value === 0))
          handlers.noteOff(note, channel + note);
        if ((status & 240) === 176 && note === 64)
          handlers.pedal(value >= 64, channel);
      };
      bound.set(input, { prefix, receive });
      input.onmidimessage = receive;
    }
    handlers.status(inputs.map((input) => input.name || "MIDI keyboard"));
  };
  access.onstatechange = refresh;
  refresh();
  return {
    refresh,
    dispose() {
      disposed = true;
      if (access.onstatechange === refresh) access.onstatechange = null;
      for (const input of bound.keys()) remove(input);
    },
  };
}
