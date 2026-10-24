const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
export const BACKING_STYLES = ["auto", "piano", "acoustic", "strings"];
export const defaultBacking = () => ({
  enabled: false,
  source: "score",
  style: "auto",
  volume: 0.45,
  track: null,
});
export const backingKey = (score) =>
  typeof score?.id === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(score.id)
    ? score.id
    : null;
export function readBackingMap(value) {
  const settings = {};
  if (value === undefined) return { settings, invalid: false };
  if (!object(value)) return { settings, invalid: true };
  let invalid = Object.keys(value).length > 500;
  for (const [id, raw] of Object.entries(value).slice(0, 500)) {
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(id) || !object(raw)) {
      invalid = true;
      continue;
    }
    const entry = defaultBacking();
    for (const [key, check] of Object.entries({
      enabled: (v) => typeof v === "boolean",
      source: (v) => ["score", "audio"].includes(v),
      style: (v) => BACKING_STYLES.includes(v),
      volume: (v) => Number.isFinite(v) && v >= 0 && v <= 1,
    })) {
      if (raw[key] === undefined) continue;
      if (check(raw[key])) entry[key] = raw[key];
      else invalid = true;
    }
    if (raw.track != null) {
      const t = raw.track;
      if (
        object(t) &&
        typeof t.id === "string" &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          t.id,
        ) &&
        typeof t.name === "string" &&
        t.name.length > 0 &&
        t.name.length <= 240 &&
        Number.isFinite(t.bpm) &&
        t.bpm >= 20 &&
        t.bpm <= 400 &&
        Number.isFinite(t.offset) &&
        t.offset >= 0 &&
        t.offset <= 7200 &&
        Number.isFinite(t.duration) &&
        t.duration > 0 &&
        t.duration <= 14400 &&
        t.offset < t.duration
      )
        entry.track = {
          id: t.id,
          name: t.name,
          bpm: t.bpm,
          offset: t.offset,
          duration: t.duration,
        };
      else invalid = true;
    }
    if (entry.source === "audio" && !entry.track) entry.enabled = false;
    Object.defineProperty(settings, id, {
      value: entry,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return { settings, invalid };
}
