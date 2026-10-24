// A short-lived handoff across an audio recovery reload. Store only the piece
// identity and paused place; ordinary settings remain owned by their save path.
export const AUDIO_RECOVERY_KEY = "luma-audio-recovery";
export const AUDIO_RECOVERY_TTL_MS = 2 * 60 * 1000;
const MAX_BEAT = 10000000;
const MAX_BAR = 100000;
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value, limit) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= limit;
const seedOk = (value) =>
  value === null || (Number.isInteger(value) && value >= 1 && value <= 1e9);
const barOk = (value) =>
  Number.isInteger(value) && value >= 1 && value <= MAX_BAR;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function pieceIdentity(score) {
  if (!object(score)) return null;
  const seed = score.exercise == null ? null : score.exercise.seed;
  if (!seedOk(seed)) return null;
  if (score.id != null && score.id !== "")
    return text(score.id, 200) ? { id: score.id, seed } : null;
  return text(score.title, 500) ? { title: score.title, seed } : null;
}

function readIdentity(value) {
  if (!object(value) || !seedOk(value.seed)) return null;
  if (value.id !== undefined)
    return text(value.id, 200) ? { id: value.id, seed: value.seed } : null;
  return text(value.title, 500)
    ? { title: value.title, seed: value.seed }
    : null;
}

function validate(value, now = Date.now()) {
  if (!object(value) || value.version !== 1) return null;
  const age = now - value.createdAt;
  if (
    !Number.isSafeInteger(value.createdAt) ||
    value.createdAt < 0 ||
    !Number.isFinite(age) ||
    age < 0 ||
    age >= AUDIO_RECOVERY_TTL_MS ||
    !Number.isFinite(value.beat) ||
    value.beat < 0 ||
    value.beat > MAX_BEAT ||
    typeof value.loop !== "boolean" ||
    !barOk(value.loopA) ||
    !barOk(value.loopB) ||
    value.loopA > value.loopB
  )
    return null;
  const identity = readIdentity(value.identity);
  if (!identity) return null;
  return {
    version: 1,
    createdAt: value.createdAt,
    identity,
    beat: value.beat,
    loop: value.loop,
    loopA: value.loopA,
    loopB: value.loopB,
  };
}

export function clearAudioRecovery(storage) {
  try {
    if (typeof storage?.removeItem !== "function") return false;
    storage.removeItem(AUDIO_RECOVERY_KEY);
    return true;
  } catch {
    return false;
  }
}

// Reading does not consume a valid handoff: the normal saved-piece load may
// still be in flight. Clear it after the matching piece's place is applied.
export function readAudioRecovery(storage) {
  try {
    const raw = storage?.getItem(AUDIO_RECOVERY_KEY);
    if (raw == null) return null;
    const value =
      typeof raw === "string" && raw.length <= 4096
        ? validate(JSON.parse(raw))
        : null;
    if (!value) clearAudioRecovery(storage);
    return value;
  } catch {
    clearAudioRecovery(storage);
    return null;
  }
}

export function writeAudioRecovery(storage, score, placement) {
  try {
    const identity = pieceIdentity(score);
    if (
      !identity ||
      !object(placement) ||
      !Number.isFinite(score.duration) ||
      score.duration < 0 ||
      score.duration > MAX_BEAT ||
      !barOk(score.measures) ||
      typeof storage?.setItem !== "function"
    ) {
      clearAudioRecovery(storage);
      return false;
    }
    const loopA = clamp(
      Number.isFinite(placement.loopA) ? Math.trunc(placement.loopA) : 1,
      1,
      score.measures,
    );
    const value = {
      version: 1,
      createdAt: Date.now(),
      identity,
      beat: clamp(
        Number.isFinite(placement.beat) ? placement.beat : 0,
        0,
        score.duration,
      ),
      loop: placement.loop === true,
      loopA,
      loopB: clamp(
        Number.isFinite(placement.loopB) ? Math.trunc(placement.loopB) : loopA,
        loopA,
        score.measures,
      ),
    };
    storage.setItem(AUDIO_RECOVERY_KEY, JSON.stringify(value));
    return true;
  } catch {
    clearAudioRecovery(storage);
    return false;
  }
}

export function matchesAudioRecovery(snapshot, score) {
  const value = validate(snapshot);
  const identity = pieceIdentity(score);
  if (!value || !identity || value.identity.seed !== identity.seed) return false;
  // An ID never falls back to a coincidentally identical title. Seed matching
  // also keeps regenerated exercises with a shared title separate.
  if (value.identity.id !== undefined || identity.id !== undefined)
    return value.identity.id === identity.id;
  return value.identity.title === identity.title;
}
