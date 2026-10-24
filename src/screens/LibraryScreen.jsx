import { useEffect, useId, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  FileMusic,
  Info,
  MoreHorizontal,
  Repeat2,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
  History,
} from "lucide-react";
import { keyLabel } from "../music.mjs";
import { barsCovered, formatMinutes } from "../journal.mjs";
import { describeSpot, spotLabel, troubleSpots } from "../trouble-spots.mjs";
import { CoverageBar } from "../PieceMap.jsx";
import ScoreArtwork from "./ScoreArtwork.jsx";
import { Ribbon } from "./ui.jsx";
import { RecentlyRemoved } from "../RecoveryPanels.jsx";
import { hasRecordedPractice, libraryView } from "../library-selectors.mjs";
import { pieceProgressSummary } from "../progress-summary.mjs";

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

// The last complete graded run of a piece. A run stopped early is a first
// look, not a grade, so a "0%" from a two-second stop never shows here.
function lastRun(history = [], id) {
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.scoreId === id && h.mode === "perform" && h.complete !== false)
      return h;
  }
  return null;
}

// The card's small "more" menu: Details, Open at bar, Review notes, Remove.
// Panels float over the grid, so opening one never reflows a row.
function PieceMenu({
  piece,
  practice,
  last,
  removable,
  onOpen,
  onReview,
  onRemove,
  onOpenChange,
  versionCount = 0,
  onVersions,
}) {
  const [panel, setPanel] = useState(null); // null | "menu" | "details" | "bar"
  const root = useRef(null);
  const trigger = useRef(null);
  const id = useId();
  const leftAt = practice
    ? Math.max(1, Math.min(practice.bar, piece.measures))
    : 1;
  const [bar, setBar] = useState(leftAt);
  const covered = practice ? barsCovered(practice.ranges) : 0;
  const close = (focusTrigger = true) => {
    setPanel(null);
    if (focusTrigger) trigger.current?.focus();
  };
  useEffect(() => onOpenChange?.(!!panel), [panel]);
  useEffect(() => {
    if (!panel) return;
    const away = (e) => {
      if (!root.current?.contains(e.target)) setPanel(null);
    };
    document.addEventListener("pointerdown", away);
    // Focus the first control of whatever just opened.
    const first = root.current?.querySelector(
      '.piece-popover [role="menuitem"], .piece-popover input, .piece-popover [data-autofocus]',
    );
    first?.focus();
    return () => document.removeEventListener("pointerdown", away);
  }, [panel]);
  const onKeyDown = (e) => {
    if (e.key === "Escape" && panel) {
      e.stopPropagation();
      e.preventDefault();
      close();
      return;
    }
    if (panel !== "menu") return;
    const items = [...root.current.querySelectorAll('[role="menuitem"]')];
    const at = items.indexOf(document.activeElement);
    const move = (i) => items[(i + items.length) % items.length]?.focus();
    if (e.key === "ArrowDown") (e.preventDefault(), move(at + 1));
    else if (e.key === "ArrowUp") (e.preventDefault(), move(at - 1));
    else if (e.key === "Home") (e.preventDefault(), move(0));
    else if (e.key === "End") (e.preventDefault(), move(items.length - 1));
    else if (e.key === "Tab") setPanel(null);
  };
  return (
    <div className="piece-menu" ref={root} onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        type="button"
        className="piece-more"
        aria-haspopup="menu"
        aria-expanded={panel === "menu"}
        aria-controls={panel === "menu" ? id : undefined}
        aria-label={`More for ${piece.title}`}
        title="More"
        onClick={() => setPanel((p) => (p ? null : "menu"))}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      {panel === "menu" && (
        <div
          className="piece-popover piece-menu-list"
          role="menu"
          id={id}
          aria-label={`${piece.title} actions`}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => setPanel("details")}
          >
            <Info size={14} aria-hidden="true" /> Details…
          </button>
          <button type="button" role="menuitem" onClick={() => setPanel("bar")}>
            <ArrowRight size={14} aria-hidden="true" /> Open at bar…
          </button>
          {onReview && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setPanel(null);
                onReview(piece);
              }}
            >
              <FileMusic size={14} aria-hidden="true" /> Review notes
            </button>
          )}
          {versionCount > 0 && onVersions && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setPanel(null);
                onVersions(piece);
              }}
            >
              <History size={14} aria-hidden="true" /> Earlier versions…
            </button>
          )}
          {removable && (
            <button
              type="button"
              role="menuitem"
              className="danger"
              // Only a PDF import keeps its original (Library / imports);
              // the notice after removing offers Undo either way.
              title={
                piece.originalId
                  ? "The original PDF stays in Library / imports"
                  : undefined
              }
              onClick={() => {
                setPanel(null);
                onRemove(piece);
              }}
            >
              <Trash2 size={14} aria-hidden="true" /> Remove from library
            </button>
          )}
        </div>
      )}
      {panel === "details" && (
        <div
          className="piece-popover piece-details-pop"
          role="dialog"
          aria-label={`Details for ${piece.title}`}
        >
          <div className="piece-pop-head">
            <strong>Details</strong>
            <button
              type="button"
              className="piece-pop-close"
              aria-label="Close details"
              data-autofocus
              onClick={() => close()}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          {piece.description && (
            <p className="piece-description">{piece.description}</p>
          )}
          <dl className="piece-file-details">
            <div>
              <dt>Format</dt>
              <dd>{piece.source}</dd>
            </div>
            <div>
              <dt>Tempo</dt>
              <dd>♩ = {piece.bpm}</dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd>{piece.notes.length}</dd>
            </div>
          </dl>
          <div className="piece-history">
            {practice ? (
              <>
                <CoverageBar
                  score={piece}
                  ranges={practice.ranges}
                  bar={practice.bar}
                />
                <span>
                  <strong>{formatMinutes(practice.minutes)}</strong> practised ·{" "}
                  {Math.round((covered / Math.max(1, piece.measures)) * 100)}%
                  of bars visited
                </span>
                <span>Last played {relativeDay(practice.last)}</span>
              </>
            ) : (
              <span>Not practised yet</span>
            )}
            {last && (
              <span className="piece-graded">
                Last graded run <b>{Math.round(last.accuracy)}%</b> ·{" "}
                {Math.round(last.timing)}% on time
              </span>
            )}
          </div>
        </div>
      )}
      {panel === "bar" && (
        <form
          className="piece-popover piece-bar-pop"
          role="dialog"
          aria-label={`Open ${piece.title} at a bar`}
          onSubmit={(e) => {
            e.preventDefault();
            setPanel(null);
            onOpen(
              piece,
              Math.max(1, Math.min(piece.measures, Math.round(+bar) || 1)),
            );
          }}
        >
          <label>
            <span>Open at bar</span>
            <input
              type="number"
              min="1"
              max={piece.measures}
              value={bar}
              onChange={(e) => setBar(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
            <small>of {piece.measures}</small>
          </label>
          <button type="submit" className="primary small">
            Open <ArrowRight size={13} aria-hidden="true" />
          </button>
        </form>
      )}
    </div>
  );
}

function PieceRow({
  piece,
  index,
  history,
  practice,
  arrangement,
  current,
  removable,
  onOpen,
  onReview,
  onRemove,
  versionCount,
  onVersions,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const last = lastRun(history, piece.id);
  const key = keyLabel(piece);
  const covered = practice ? barsCovered(practice.ranges) : 0;
  const leftAt = practice
    ? Math.max(1, Math.min(practice.bar, piece.measures))
    : null;
  const name = `${piece.title}${arrangement ? `, ${arrangement}` : ""}`;
  return (
    <li
      className={`piece-row piece-card${current ? " current" : ""}`}
      style={{ "--i": index }}
      data-menu-open={menuOpen || undefined}
    >
      <button
        type="button"
        className="piece-cover piece-art-open"
        tabIndex={-1}
        aria-hidden="true"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onOpen(piece)}
      >
        <ScoreArtwork piece={piece} />
        {current && <span className="piece-now">Now reading</span>}
        {practice && (
          <Ribbon
            className="piece-ribbon"
            value={covered / Math.max(1, piece.measures)}
            at={(leftAt - 0.5) / Math.max(1, piece.measures)}
          />
        )}
      </button>
      <div className="piece-main">
        {arrangement && <p className="piece-arrangement">{arrangement}</p>}
        <h3 title={piece.title}>
          <button
            type="button"
            className="piece-title-open"
            aria-label={`Open ${name}${current ? " (now reading)" : ""}`}
            onClick={() => onOpen(piece)}
          />
          <span aria-hidden="true">{piece.title}</span>
        </h3>
        <p className="piece-composer" title={piece.composer}>
          {piece.composer}
        </p>
        <p className="piece-meta">
          <span className="piece-meta-row">
            <span>
              {piece.measures} {piece.measures === 1 ? "bar" : "bars"}
            </span>
            {key && <span>{key}</span>}
            {practice && (
              <span>
                <b>{formatMinutes(practice.minutes, { short: true })}</b>
              </span>
            )}
            {practice && <span>{relativeDay(practice.last)}</span>}
          </span>
        </p>
        {!piece.reviewed && (
          <p className="piece-review-needed">Review needed</p>
        )}
        <PieceMenu
          piece={piece}
          practice={practice}
          last={last}
          removable={removable}
          onOpen={onOpen}
          onReview={onReview}
          onRemove={onRemove}
          onOpenChange={setMenuOpen}
          versionCount={versionCount}
          onVersions={onVersions}
        />
      </div>
    </li>
  );
}

// The piece to pick up again: the one open now, or the last one practised.
const lastGraded = lastRun;

// The saved place stays the primary action, including on the final bar.
function ContinueCard({
  piece,
  practice,
  current,
  history,
  onOpen,
  onOpenPassage,
}) {
  const progress = pieceProgressSummary(practice, piece);
  const bar = progress.resumeBar;
  const atFinalBar = !!practice && piece.measures > 1 && bar >= piece.measures;
  const endFrom = Math.max(1, piece.measures - 3);
  const measures = Math.max(1, piece.measures || 1);
  const covered = progress.coveredBars;
  const passages = practice?.passages || [];
  const spots = troubleSpots(practice?.spots, { measures: piece.measures });
  const graded = lastGraded(history, piece.id);
  const key = keyLabel(piece);
  return (
    <div className="continue-stage">
      <section className="continue-card" aria-label="Continue practising">
        <button
          type="button"
          className="continue-art library-feature-jacket piece-art-open"
          aria-label={`Continue ${piece.title} at bar ${bar}`}
          onClick={() => onOpen(piece, bar)}
        >
          <ScoreArtwork piece={piece} priority />
        </button>
        <div className="continue-copy">
          <span className="screen-eyebrow">
            {practice
              ? "Continue practising"
              : current
                ? "Open now"
                : "Selected piece"}
          </span>
          <h2 title={piece.title}>{piece.title}</h2>
          {piece.composer && <p>{piece.composer}</p>}
          {practice ? (
            <div className="continue-progress">
              <Ribbon
                className="continue-ribbon"
                value={covered / measures}
                at={(bar - 0.5) / measures}
                ticks={passages.map(([a]) => (a - 1) / measures)}
              />
              <small>
                Saved at bar {bar} of {measures}
                <span>{covered} bars visited</span>
              </small>
            </div>
          ) : (
            <div className="continue-progress">
              <small>
                {measures} bars{key ? ` · ${key}` : ""} · no practice recorded
              </small>
            </div>
          )}
          {practice && (
            <dl className="continue-facts">
              <div>
                <dt>recorded</dt>
                <dd>{formatMinutes(practice.minutes || 0, { short: true })}</dd>
              </div>
              <div>
                <dt>session{practice.sessions === 1 ? "" : "s"}</dt>
                <dd>{practice.sessions || 0}</dd>
              </div>
              {graded && (
                <div>
                  <dt>last graded run</dt>
                  <dd>{Math.round(graded.accuracy)}%</dd>
                </div>
              )}
              <div>
                <dt>last played</dt>
                <dd>{relativeDay(practice.last)}</dd>
              </div>
            </dl>
          )}
          <div className="continue-actions">
            <button
              type="button"
              className="primary"
              onClick={() => onOpen(piece, bar)}
            >
              {bar > 1 ? `Continue at bar ${bar}` : "Start practising"}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
            {bar > 1 && (
              <button
                type="button"
                className="continue-beginning"
                onClick={() => onOpen(piece, 1)}
              >
                <RotateCcw size={13} aria-hidden="true" /> From the beginning
              </button>
            )}
            {atFinalBar && (
              <button
                type="button"
                className="continue-beginning"
                title={`Open repeating bars ${endFrom}–${piece.measures}`}
                onClick={() => onOpenPassage(piece, endFrom, piece.measures)}
              >
                <Repeat2 size={13} aria-hidden="true" /> Review the ending
              </button>
            )}
            {passages.length > 0 && (
              <span
                className="continue-passages"
                role="group"
                aria-label="Saved passages"
              >
                {passages.slice(0, 4).map(([a, b]) => (
                  <button
                    key={`${a}-${b}`}
                    type="button"
                    title={`Open repeating bars ${a}–${b}`}
                    aria-label={`Repeat bars ${a} to ${b}`}
                    onClick={() => onOpenPassage(piece, a, b)}
                  >
                    <Repeat2 size={12} aria-hidden="true" /> {a}–{b}
                  </button>
                ))}
              </span>
            )}
            {spots.length > 0 && (
              <span
                className="continue-passages continue-spots"
                role="group"
                aria-label="Trouble spots"
              >
                <span>Drill</span>
                {spots.map((spot) => (
                  <button
                    key={`${spot.first}-${spot.last}`}
                    type="button"
                    title={`Open repeating ${spotLabel(spot)} at 70% or slower · ${describeSpot(spot)}`}
                    aria-label={`Drill ${spotLabel(spot)}, ${describeSpot(spot)}`}
                    onClick={() =>
                      onOpenPassage(piece, spot.first, spot.last, {
                        drill: true,
                      })
                    }
                  >
                    <AlertCircle size={12} aria-hidden="true" />{" "}
                    {spot.first === spot.last
                      ? spot.first
                      : `${spot.first}–${spot.last}`}
                  </button>
                ))}
              </span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

// Recently played, as small covers on a shelf (only with two or more).
function RecentShelf({ pieces, journal, heroId, onOpen }) {
  const shelf = pieces.filter((p) => p.id !== heroId).slice(0, 5);
  if (pieces.length < 2 || !shelf.length) return null;
  return (
    <nav className="recent-shelf" aria-label="Recently played">
      <span className="recent-shelf-label">Recently played</span>
      <ul>
        {shelf.map((piece) => {
          const entry = journal.pieces[piece.id];
          const measures = Math.max(1, piece.measures || 1);
          const bar = Math.max(1, Math.min(entry.bar, measures));
          return (
            <li key={piece.id}>
              <button
                type="button"
                className="recent-shelf-item"
                title={`${piece.title} · saved at bar ${bar}`}
                aria-label={`Continue ${piece.title} at bar ${bar}`}
                onClick={() => onOpen(piece, bar)}
              >
                <span className="recent-shelf-cover">
                  <ScoreArtwork piece={piece} />
                  <Ribbon
                    value={
                      Math.min(measures, barsCovered(entry.ranges)) / measures
                    }
                  />
                </span>
                <span className="recent-shelf-title">{piece.title}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default function LibraryScreen({
  library,
  lessons,
  history,
  journal,
  query,
  onQuery,
  currentId,
  onOpen,
  onOpenPassage,
  onRemove,
  onReview,
  onImport,
  removed = [],
  versions = {},
  restoring = false,
  onRestoreRemoved,
  onVersions,
}) {
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("recent");
  const searchInput = useRef(null);
  const practiced = (s) => journal.pieces[s.id];
  const {
    collection,
    saved: mine,
    starters,
    total,
    visible,
  } = libraryView({
    library,
    lessons,
    journal,
    query,
    filter,
    sort,
  });
  const searching = !!query.trim();
  const browsing = !searching && filter === "all";
  const clearFilters = () => {
    onQuery("");
    setFilter("all");
    searchInput.current?.focus();
  };
  const everything = collection.all;
  const titleGroups = new Map();
  for (const piece of everything) {
    const title = piece.title.normalize("NFKC").trim().toLocaleLowerCase();
    if (!titleGroups.has(title)) titleGroups.set(title, []);
    titleGroups.get(title).push(piece);
  }
  const arrangements = new Map();
  for (const versions of titleGroups.values()) {
    if (versions.length < 2) continue;
    versions.sort((a, b) =>
      `${a.createdAt || ""}:${a.id}`.localeCompare(
        `${b.createdAt || ""}:${b.id}`,
      ),
    );
    versions.forEach((piece, i) =>
      arrangements.set(piece.id, `Arrangement ${i + 1} of ${versions.length}`),
    );
  }
  const open = everything.find((s) => s.id === currentId);
  const playedRecently = everything
    .filter((s) => hasRecordedPractice(practiced(s)))
    .sort((a, b) => (practiced(a).last < practiced(b).last ? 1 : -1));
  const recent = playedRecently[0];
  const hero = open || recent;
  return (
    <section
      className="screen library-screen library-atelier"
      aria-label="Library"
    >
      <header className="screen-header studio-screen-header">
        <div className="studio-heading">
          <h1>Library</h1>
          <p>
            {collection.saved.length} saved · {collection.starters.length}{" "}
            starter pieces
          </p>
        </div>
        <div className="search studio-header-tools" role="search">
          <Search size={16} />
          <input
            ref={searchInput}
            placeholder="Find a piece…"
            aria-label="Find a piece"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.preventDefault();
                e.stopPropagation();
                onQuery("");
              }
            }}
          />
          {query && (
            <button
              type="button"
              className="library-search-clear"
              aria-label="Clear search"
              onClick={() => {
                onQuery("");
                searchInput.current?.focus();
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </header>
      <div className="library-toolbar">
        <div
          className="library-filters"
          role="group"
          aria-label="Filter pieces"
        >
          {[
            ["all", "All pieces"],
            ["practised", "Practised"],
            ["unplayed", "Unplayed"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="library-result-count" role="status">
          {visible} shown of {total}
        </span>
        <label className="library-sort">
          <span>Sort</span>
          <select
            aria-label="Sort pieces"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="recent">Recently played</option>
            <option value="title">Title</option>
            <option value="composer">Composer</option>
          </select>
        </label>
      </div>
      {hero && browsing && (
        <ContinueCard
          piece={hero}
          practice={practiced(hero)}
          current={hero.id === currentId}
          history={history}
          onOpen={onOpen}
          onOpenPassage={onOpenPassage}
        />
      )}
      {browsing && (
        <RecentShelf
          pieces={playedRecently}
          journal={journal}
          heroId={hero?.id}
          onOpen={onOpen}
        />
      )}
      {!mine.length && !starters.length && !browsing ? (
        <div className="empty-state static search-empty" role="status">
          <span aria-hidden="true">
            <Search size={22} />
          </span>
          <strong>
            {searching
              ? `No pieces match “${query.trim()}”.`
              : `No ${filter} pieces yet.`}
          </strong>
          <div className="search-empty-actions">
            <button
              type="button"
              className="secondary small"
              onClick={clearFilters}
            >
              Clear filters
            </button>
            <button type="button" className="primary small" onClick={onImport}>
              <Upload size={14} aria-hidden="true" /> Import a score
            </button>
          </div>
        </div>
      ) : (
        <>
          {(mine.length > 0 || browsing) && (
            <h2 className="section-title library-collection-title">
              Saved pieces <span>{mine.length}</span>
            </h2>
          )}
          {mine.length ? (
            <ul className="piece-list piece-grid">
              {mine.map((piece, i) => (
                <PieceRow
                  key={piece.id}
                  index={i}
                  piece={piece}
                  history={history}
                  practice={practiced(piece)}
                  arrangement={arrangements.get(piece.id)}
                  current={piece.id === currentId}
                  removable
                  onOpen={onOpen}
                  onReview={onReview}
                  onRemove={onRemove}
                  versionCount={versions[piece.id] || 0}
                  onVersions={onVersions}
                />
              ))}
            </ul>
          ) : (
            browsing && (
              <button type="button" className="empty-state" onClick={onImport}>
                <span>
                  <Upload size={22} />
                </span>
                <strong>No saved pieces yet.</strong>
                <small>
                  Import PDF, MusicXML or MIDI. You can also save an exercise
                  from Practice.
                </small>
              </button>
            )
          )}
          {starters.length > 0 && (
            <>
              <h2 className="section-title library-collection-title">
                Starter pieces <span>{starters.length}</span>
              </h2>
              <ul className="piece-list piece-grid">
                {starters.map((piece, i) => (
                  <PieceRow
                    key={piece.id}
                    index={mine.length + i}
                    piece={piece}
                    history={history}
                    practice={practiced(piece)}
                    arrangement={arrangements.get(piece.id)}
                    current={piece.id === currentId}
                    removable={false}
                    onOpen={onOpen}
                    onReview={onReview}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {browsing && (
        <RecentlyRemoved
          items={removed}
          busy={restoring}
          onRestore={onRestoreRemoved}
        />
      )}
    </section>
  );
}
