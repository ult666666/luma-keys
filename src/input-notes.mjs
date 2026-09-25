// One sounding pitch can have several physical input owners. A key-up only
// releases its own owner; removing an entry also invalidates any pending sound.
export class InputNotes {
  entries = new Map();
  press(midi, source) {
    const held = this.entries.get(midi);
    if (held) {
      held.owners.add(source);
      return null;
    }
    const entry = { midi, owners: new Set([source]), voice: null };
    this.entries.set(midi, entry);
    return entry;
  }
  current(entry) {
    return this.entries.get(entry.midi) === entry;
  }
  discard(entry) {
    if (!this.current(entry)) return false;
    this.entries.delete(entry.midi);
    return true;
  }
  release(midi, source) {
    const entry = this.entries.get(midi);
    if (!entry || !entry.owners.delete(source) || entry.owners.size)
      return null;
    this.entries.delete(midi);
    return entry;
  }
  releaseSources(matches) {
    const released = [];
    for (const entry of this.entries.values()) {
      for (const source of entry.owners)
        if (matches(source)) entry.owners.delete(source);
      if (!entry.owners.size) {
        this.entries.delete(entry.midi);
        released.push(entry);
      }
    }
    return released;
  }
  clear() {
    const entries = [...this.entries.values()];
    this.entries.clear();
    return entries;
  }
}
