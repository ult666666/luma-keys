import { EXERCISES_ID } from "./journal.mjs";

const normalize = (value) =>
  String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase();

// Saved scores take precedence over an identical starter id. Different
// arrangements with the same title remain separate scores.
export function libraryCollection(library = [], lessons = []) {
  const seen = new Set();
  const unique = (pieces) =>
    pieces.filter((piece) => {
      if (!piece?.id || seen.has(piece.id)) return false;
      seen.add(piece.id);
      return true;
    });
  const saved = unique(library);
  const starters = unique(lessons);
  return { saved, starters, all: [...saved, ...starters] };
}

// A bookmark or saved passage may create a journal entry before playback.
export function hasRecordedPractice(entry) {
  return (
    !!entry &&
    (entry.minutes > 0 || entry.sessions > 0 || entry.ranges?.length > 0)
  );
}

export function libraryView({
  library = [],
  lessons = [],
  journal,
  query = "",
  filter = "all",
  sort = "recent",
} = {}) {
  const collection = libraryCollection(library, lessons);
  const search = normalize(query.trim());
  const entry = (piece) => journal?.pieces?.[piece.id];
  const included = (piece) =>
    (!search ||
      normalize(
        `${piece.title} ${piece.composer || ""} ${piece.description || ""}`,
      ).includes(search)) &&
    (filter === "all" ||
      (filter === "practised"
        ? hasRecordedPractice(entry(piece))
        : !hasRecordedPractice(entry(piece))));
  const recency = (piece) => entry(piece)?.last || piece.createdAt || "";
  const titleOrder = (a, b) =>
    a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  const compare = (a, b) =>
    sort === "title"
      ? titleOrder(a, b)
      : sort === "composer"
        ? (a.composer || "").localeCompare(b.composer || "") || titleOrder(a, b)
        : recency(b).localeCompare(recency(a)) || titleOrder(a, b);
  const saved = collection.saved.filter(included).sort(compare);
  const starters = collection.starters.filter(included).sort(compare);
  return {
    collection,
    saved,
    starters,
    total: collection.all.length,
    visible: saved.length + starters.length,
  };
}

// The journal outlives the collection. Its aggregated exercise record is
// neither a saved score nor a removed score; retain it without inventing
// coverage for a single exercise from the union of many different studies.
export function practiceEntries(journal, pieces = []) {
  const scores = new Map(
    libraryCollection(pieces).all.map((piece) => [piece.id, piece]),
  );
  return Object.entries(journal?.pieces || {})
    .map(([id, entry]) => {
      const score = scores.get(id) || null;
      return {
        id,
        entry,
        score,
        kind: id === EXERCISES_ID ? "exercises" : score ? "piece" : "removed",
      };
    })
    .sort(
      (a, b) =>
        (b.entry.last || "").localeCompare(a.entry.last || "") ||
        a.id.localeCompare(b.id),
    );
}
