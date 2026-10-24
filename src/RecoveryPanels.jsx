// Recovery in the app (2.44): recently removed pieces in the Library,
// earlier versions of a piece, and the settings history in Settings. Each
// restore is itself undoable: a restored version keeps the one it replaced,
// and a restored settings snapshot keeps the settings it replaced.
import { useState } from "react";
import { History, RotateCcw, Trash2 } from "lucide-react";
import "./recovery.css";

export const when = (iso) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "an earlier time";
};
const dayLabel = (day) => {
  const d = new Date(`${day}T12:00:00`);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : day;
};
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const shape = (e) =>
  [plural(e.measures, "bar"), plural(e.notes, "note")].join(" · ");

// The Library's "Recently removed": the newest ten removed pieces.
export function RecentlyRemoved({ items, busy, onRestore }) {
  if (!items?.length) return null;
  return (
    <details className="recently-removed">
      <summary>
        <Trash2 size={15} aria-hidden="true" /> Recently removed{" "}
        <span>{items.length}</span>
      </summary>
      <p className="recovery-note">
        Removed pieces are kept here (the newest ten). Restoring one brings it
        back with its practice history.
      </p>
      <ul className="recovery-list">
        {items.map((item) => (
          <li key={item.file} data-removed-id={item.id}>
            <div>
              <strong>{item.damaged ? "A damaged file" : item.title}</strong>
              <small>
                {item.damaged
                  ? "This copy cannot be read."
                  : `${item.composer ? `${item.composer} · ` : ""}${shape(item)}`}
                {" · "}removed {when(item.removedAt)}
              </small>
            </div>
            {item.damaged ? null : item.inLibrary ? (
              <span className="recovery-state">Already in your library</span>
            ) : (
              <button
                type="button"
                className="secondary small"
                disabled={busy}
                aria-label={`Restore ${item.title}`}
                onClick={() => onRestore(item)}
              >
                <RotateCcw size={14} aria-hidden="true" /> Restore
              </button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

// The body of the "Earlier versions" dialog for one piece.
export function VersionsList({ piece, versions, error, busy, onRestore }) {
  if (error) return <p role="alert">{error}</p>;
  if (!versions) return <p role="status">Looking for earlier versions…</p>;
  if (!versions.length)
    return (
      <p className="recovery-note">
        No earlier versions are kept for this piece. A version is kept each
        time its notes or details change.
      </p>
    );
  const notes = piece?.notes?.length ?? 0;
  return (
    <>
      <p className="recovery-note">
        Now: <strong>{piece?.title}</strong> · {plural(piece?.measures ?? 0, "bar")}{" "}
        · {plural(notes, "note")}. Restoring a version keeps the current one in
        this list, so you can switch back.
      </p>
      <ul className="recovery-list">
        {versions.map((v) => {
          const delta = v.damaged ? 0 : v.notes - notes;
          return (
            <li key={v.file}>
              <div>
                <strong>
                  {v.damaged
                    ? "A damaged copy"
                    : v.title !== piece?.title
                      ? v.title
                      : `Until ${when(v.replacedAt)}`}
                </strong>
                <small>
                  {v.damaged
                    ? "This copy cannot be read."
                    : `${shape(v)}${
                        delta
                          ? ` · ${plural(Math.abs(delta), "note")} ${delta > 0 ? "more" : "fewer"}`
                          : ""
                      }`}
                  {v.title !== piece?.title && !v.damaged
                    ? ` · until ${when(v.replacedAt)}`
                    : ""}
                </small>
              </div>
              {!v.damaged && (
                <button
                  type="button"
                  className="secondary small"
                  disabled={busy}
                  aria-label={`Restore the version you had until ${when(v.replacedAt)}`}
                  onClick={() => onRestore(v)}
                >
                  <RotateCcw size={14} aria-hidden="true" /> Restore
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

// Settings › Settings history: daily snapshots and the copies kept before a
// restore. Restoring asks once, inline.
export function SettingsHistory({ snapshots, busy, onRestore }) {
  const [confirm, setConfirm] = useState(null);
  if (!snapshots?.length) return null;
  const label = (s) =>
    s.kind === "day"
      ? dayLabel(s.day)
      : `Before a restore · ${when(s.at)}`;
  return (
    <section
      className="settings-section reader-settings settings-history"
      aria-label="Settings history"
    >
      <h3>
        <History size={15} /> Settings history
      </h3>
      <p className="recovery-note">
        Your settings and practice journal as they stood at the start of each
        day (the last fortnight). Restoring keeps your current settings here
        first.
      </p>
      <ul className="recovery-list">
        {snapshots.map((s) => (
          <li key={s.file}>
            <div>
              <strong>{label(s)}</strong>
              <small>
                {s.damaged
                  ? "This copy cannot be read."
                  : `${plural(s.sessions, "session")} · ${s.minutes} min · ${plural(s.pieces, "piece")} in the journal`}
              </small>
            </div>
            {s.damaged || s.issues ? (
              <span className="recovery-state">Can't be restored</span>
            ) : confirm === s.file ? (
              <span className="recovery-confirm" role="group" aria-label={`Restore ${label(s)}?`}>
                <button
                  type="button"
                  className="primary small"
                  disabled={busy}
                  onClick={() => {
                    setConfirm(null);
                    onRestore(s, label(s));
                  }}
                >
                  Replace my settings
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setConfirm(null)}
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="secondary small"
                disabled={busy}
                aria-label={`Restore settings from ${label(s)}`}
                onClick={() => setConfirm(s.file)}
              >
                <RotateCcw size={14} aria-hidden="true" /> Restore…
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
