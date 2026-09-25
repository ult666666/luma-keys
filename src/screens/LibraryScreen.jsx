import { Music2, Search, Trash2, Upload, Dices } from "lucide-react";
import { keyLabel } from "../music.mjs";

const DAY = 86400000;
export function relativeDay(iso, now = Date.now()) {
  const then = new Date(iso);
  if (!Number.isFinite(+then)) return "";
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const days = Math.round((startOfToday - then) / DAY + 0.5);
  if (then >= startOfToday) return "today";
  if (days <= 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function lastRun(history, id) {
  for (let i = history.length - 1; i >= 0; i--)
    if (history[i].scoreId === id) return history[i];
  return null;
}

function PieceRow({ piece, history, current, removable, onOpen, onRemove }) {
  const last = lastRun(history, piece.id);
  const key = keyLabel(piece);
  return (
    <li className={`piece-row${current ? " current" : ""}`}>
      <div className={`piece-icon${piece.exercise ? " exercise" : ""}`}>
        {piece.exercise ? <Dices size={18} /> : <Music2 size={18} />}
      </div>
      <div className="piece-main">
        <h3>{piece.title}</h3>
        <p>{piece.description || piece.composer}</p>
        <div className="piece-tags">
          <span>{piece.source}</span>
          {!piece.reviewed && <span className="tag-warn">Review needed</span>}
          {key && <span>{key}</span>}
          <span>
            {piece.measures} {piece.measures === 1 ? "bar" : "bars"}
          </span>
          <span>♩ = {piece.bpm}</span>
          <span>{piece.notes.length} notes</span>
        </div>
      </div>
      <div className="piece-history">
        {last ? (
          <>
            <strong>{Math.round(last.accuracy)}%</strong>
            <span>
              {relativeDay(last.at)} · {Math.round(last.timing)}% on time
            </span>
          </>
        ) : (
          <span>Not graded yet</span>
        )}
      </div>
      <div className="piece-row-actions">
        <button
          type="button"
          className={current ? "primary small" : "secondary small"}
          onClick={() => onOpen(piece)}
        >
          {current ? "Reading" : "Open"}
        </button>
        {removable && (
          <button
            type="button"
            className="icon-button"
            aria-label={`Remove ${piece.title}`}
            title="Remove from library (the original import stays on disk)"
            onClick={() => onRemove(piece)}
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </li>
  );
}

export default function LibraryScreen({
  library,
  lessons,
  history,
  query,
  onQuery,
  currentId,
  onOpen,
  onRemove,
  onImport,
}) {
  const matches = (s) =>
    !query.trim() ||
    `${s.title} ${s.composer} ${s.description || ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
  const mine = library.filter(matches);
  const starters = lessons.filter(matches);
  return (
    <section className="screen library-screen" aria-label="Library">
      <header className="screen-header">
        <div>
          <h1>Library</h1>
          <p>
            {library.length
              ? `${library.length} piece${library.length === 1 ? "" : "s"} of your own, plus the starter pieces. Everything stays on this Mac.`
              : "Imported scores and kept exercises live here, next to the starter pieces."}
          </p>
        </div>
        <label className="search">
          <Search size={16} />
          <input
            placeholder="Find a piece…"
            aria-label="Find a piece"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
        </label>
      </header>
      <h2 className="section-title">Your pieces</h2>
      {mine.length ? (
        <ul className="piece-list">
          {mine.map((piece) => (
            <PieceRow
              key={piece.id}
              piece={piece}
              history={history}
              current={piece.id === currentId}
              removable
              onOpen={onOpen}
              onRemove={onRemove}
            />
          ))}
        </ul>
      ) : (
        <button type="button" className="empty-state" onClick={onImport}>
          <span>
            <Upload size={22} />
          </span>
          <strong>
            {query ? "No piece matches that search." : "Nothing here yet."}
          </strong>
          <small>
            Import a PDF, MusicXML or MIDI file, or keep an exercise you like
            from the Practice screen.
          </small>
        </button>
      )}
      <h2 className="section-title">Starter pieces</h2>
      <ul className="piece-list">
        {starters.map((piece) => (
          <PieceRow
            key={piece.id}
            piece={piece}
            history={history}
            current={piece.id === currentId}
            removable={false}
            onOpen={onOpen}
          />
        ))}
      </ul>
    </section>
  );
}
