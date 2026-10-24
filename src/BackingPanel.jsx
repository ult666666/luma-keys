import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Music2,
  Upload,
  Volume2,
  VolumeX,
  Check,
  Headphones,
  Play,
  Square,
  Sparkles,
  Guitar,
  Piano,
  Waves,
} from "lucide-react";
import { buddyLine, buddySay } from "./buddy.mjs";

const STYLES = [
  ["auto", "Match the piece", "Chosen from the score", Sparkles],
  ["acoustic", "Acoustic pop", "Guitar, bass & soft drums", Guitar],
  ["piano", "Piano duet", "The written supporting hand", Piano],
  ["strings", "Soft strings", "A quiet sustained texture", Waves],
];
const INSTRUMENTS = {
  guitar: ["Guitar", "#d49a5a"],
  bass: ["Bass", "#8a6fd1"],
  drums: ["Drums", "#d86a6a"],
  piano: ["Piano", "#5a9bd4"],
  strings: ["Strings", "#58b39a"],
};
const react = (event, context, options) =>
  buddySay(buddyLine(event, context), { mood: "celebrate", ttl: 3000, ...options });

function AlignmentNumber({ value, onCommit, valid, ...props }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const next = draft.trim() === "" ? NaN : Number(draft);
    if (Number.isFinite(next) && valid(next)) {
      onCommit(next);
      setDraft(String(next));
    } else setDraft(String(value));
  };
  return (
    <input
      {...props}
      type="number"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}
function fileDuration(file, signal) {
  return new Promise((resolve, reject) => {
    const media = new Audio(),
      url = URL.createObjectURL(file);
    const clean = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      media.onloadedmetadata = media.onerror = null;
      media.removeAttribute("src");
      media.load();
      URL.revokeObjectURL(url);
    };
    const fail = () => {
      clean();
      reject(
        Error(
          "This file could not be played. Try an MP3, WAV, M4A, OGG or FLAC file.",
        ),
      );
    };
    const abort = () => {
      clean();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const timer = setTimeout(fail, 12000);
    signal.addEventListener("abort", abort, { once: true });
    media.onloadedmetadata = () => {
      const duration = media.duration;
      media.onloadedmetadata = media.onerror = null;
      clean();
      duration > 0 && duration <= 14400 && Number.isFinite(duration)
        ? resolve(duration)
        : reject(Error("Choose an audio file up to four hours long."));
    };
    media.onerror = fail;
    media.preload = "metadata";
    media.src = url;
  });
}

// A small animated band on a stage: who is playing in this backing.
// Every instrument has a roundel; the ones in this arrangement light up.
function BandStage({ instruments, enabled, playing, source, volume }) {
  const list =
    source === "audio"
      ? ["record"]
      : instruments.length
        ? [
            ...Object.keys(INSTRUMENTS),
            ...instruments.filter((id) => !INSTRUMENTS[id]),
          ]
        : [];
  const lit = new Set(source === "audio" ? ["record"] : instruments);
  return (
    <div
      className={`band-stage${enabled ? " live" : ""}${playing ? " previewing" : ""}`}
      style={{ "--band-level": (0.35 + volume * 0.65).toFixed(2) }}
      aria-hidden="true"
    >
      <div className="band-lights">
        <i />
        <i />
        <i />
      </div>
      <div className="band-players">
        {list.length ? (
          list.map((id, i) => (
            <span
              key={id}
              className={`band-player ${id}${lit.has(id) ? " on" : " off"}`}
              style={{ "--i": i }}
            >
              <BandIcon id={id} />
            </span>
          ))
        ) : (
          <span className="band-player empty">
            <Music2 size={22} />
          </span>
        )}
      </div>
      <div className="band-meter">
        {Array.from({ length: 16 }, (_, i) => (
          <i key={i} style={{ "--i": i }} />
        ))}
      </div>
    </div>
  );
}
function BandIcon({ id }) {
  const common = {
    viewBox: "0 0 48 48",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  if (id === "guitar")
    return (
      <svg {...common}>
        <path d="M30 10l8-6 4 4-6 8" />
        <path
          className="band-body"
          d="M31 17c-4-1-7 1-8 4-4-1-9 1-11 5-3 6 1 14 8 15 5 1 10-2 11-6 1-3 0-5-1-7 3-2 4-6 1-11z"
          fill="currentColor"
          fillOpacity=".18"
        />
        <path className="band-string" d="M17 35L36 12" />
        <circle cx="22" cy="29" r="3" />
      </svg>
    );
  if (id === "bass")
    return (
      <svg {...common}>
        <path d="M33 7l6-3 3 3-4 6" />
        <path
          className="band-body"
          d="M34 13c-4 0-6 3-7 6-5-1-11 2-13 7-2 7 3 14 10 14 6 0 10-5 9-10 3-2 5-6 3-10z"
          fill="currentColor"
          fillOpacity=".18"
        />
        <path className="band-string" d="M19 36L38 11" />
        <path className="band-string two" d="M21 38L40 13" />
      </svg>
    );
  if (id === "drums")
    return (
      <svg {...common}>
        <ellipse className="band-drum" cx="24" cy="26" rx="15" ry="6" fill="currentColor" fillOpacity=".18" />
        <path d="M9 26v10c0 3 7 6 15 6s15-3 15-6V26" />
        <path className="band-stick left" d="M10 8l10 14" />
        <path className="band-stick right" d="M38 8L28 22" />
        <ellipse className="band-cymbal" cx="40" cy="14" rx="7" ry="2" />
      </svg>
    );
  if (id === "piano")
    return (
      <svg {...common}>
        <rect x="6" y="14" width="36" height="22" rx="3" fill="currentColor" fillOpacity=".12" />
        {[0, 1, 2, 3, 4, 5].map((k) => (
          <path key={k} className="band-key" style={{ "--k": k }} d={`M${12 + k * 5} 14v22`} />
        ))}
        {[0, 1, 3, 4].map((k) => (
          <rect key={k} x={13.5 + k * 5} y="14" width="3" height="12" rx="1" fill="currentColor" />
        ))}
      </svg>
    );
  if (id === "strings")
    return (
      <svg {...common}>
        <path
          className="band-body"
          d="M24 6c-4 0-5 4-4 7-4 2-5 6-3 9-3 3-3 9 1 12 3 2 9 2 12 0 4-3 4-9 1-12 2-3 1-7-3-9 1-3 0-7-4-7z"
          fill="currentColor"
          fillOpacity=".18"
        />
        <path d="M24 12v26" />
        <path className="band-bow" d="M6 30L42 20" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle className="band-record" cx="24" cy="24" r="16" fill="currentColor" fillOpacity=".16" />
      <circle cx="24" cy="24" r="10" strokeOpacity=".5" />
      <circle cx="24" cy="24" r="3" fill="currentColor" />
    </svg>
  );
}

export default function BackingPanel({
  score,
  config,
  plan,
  mode,
  onChange,
  onPreview,
  onStopPreview,
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [previewing, setPreviewing] = useState(false);
  const input = useRef(),
    request = useRef(),
    preview = useRef(),
    previewTimer = useRef(),
    volumeTalk = useRef(0);
  const context = { title: score.title };
  useEffect(
    () => () => {
      request.current?.abort();
      clearTimeout(previewTimer.current);
      onStopPreview?.();
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    const media = preview.current;
    return () => media?.pause();
  }, [config.source, config.track?.id]);
  useEffect(() => {
    if (preview.current) preview.current.volume = config.volume;
  }, [config.volume, config.track?.id, config.source]);
  const instruments = useMemo(() => {
    const found = new Set();
    for (const event of plan.events)
      found.add(
        ["kick", "snare", "hat"].includes(event.instrument)
          ? "drums"
          : event.instrument,
      );
    return ["piano", "guitar", "bass", "strings", "drums"].filter((id) =>
      found.has(id),
    );
  }, [plan.events]);
  async function upload(file) {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      setError("Choose audio smaller than 100 MB.");
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const duration = await fileDuration(file, controller.signal);
      const form = new FormData();
      form.append("audio", file);
      const response = await fetch("/api/backing-assets", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error || "Audio could not be saved.");
      if (!controller.signal.aborted)
        onChange({
          source: "audio",
          enabled: false,
          track: {
            id: result.id,
            name: result.name,
            bpm: Math.max(20, Math.min(400, score.bpm || 80)),
            offset: 0,
            duration,
          },
        });
    } catch (e) {
      if (!controller.signal.aborted) setError(e.message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function stopPreview() {
    clearTimeout(previewTimer.current);
    setPreviewing(false);
    onStopPreview?.();
  }
  async function startPreview() {
    if (previewing) return stopPreview();
    setError("");
    setPreviewing(true);
    react("backing:preview", context, { mood: "conducting", ttl: 2200 });
    try {
      const seconds = await onPreview?.();
      if (!(seconds > 0)) {
        setPreviewing(false);
        return;
      }
      clearTimeout(previewTimer.current);
      previewTimer.current = setTimeout(() => setPreviewing(false), seconds * 1000);
    } catch (e) {
      setPreviewing(false);
      setError(e.message || "The preview could not start.");
    }
  }
  function change(patch) {
    stopPreview();
    onChange(patch);
  }
  const available =
    config.source === "audio" ? !!config.track : plan.events.length > 0;
  const volumePercent = Math.round(config.volume * 100);
  return (
    <div className={`backing-panel${config.enabled ? " is-on" : ""}`}>
      <BandStage
        instruments={instruments}
        enabled={config.enabled}
        playing={previewing}
        source={config.source}
        volume={config.volume}
      />
      <div className="backing-piece">
        <span className="backing-piece-icon">
          <Music2 size={20} />
        </span>
        <div>
          <strong>{score.title}</strong>
          <span>
            {config.enabled
              ? "Playing along with you · saved for this arrangement"
              : "Saved for this arrangement"}
          </span>
        </div>
        <label className={`backing-switch${config.enabled ? " on" : ""}`}>
          <input
            type="checkbox"
            role="switch"
            aria-label="Enable accompaniment"
            checked={config.enabled}
            disabled={!available || busy}
            onChange={(e) => {
              change({ enabled: e.target.checked });
              react(e.target.checked ? "backing:on" : "backing:off", context, {
                burst: e.target.checked ? "notes" : null,
              });
            }}
          />
          <span className="backing-switch-track" aria-hidden="true">
            <span className="backing-switch-knob" />
          </span>
          <span className="backing-switch-label">
            {config.enabled ? "On" : "Off"}
          </span>
        </label>
      </div>
      <div
        className="backing-sources"
        role="group"
        aria-label="Accompaniment source"
      >
        <button
          aria-pressed={config.source === "score"}
          disabled={busy}
          onClick={() => {
            change({ source: "score" });
            if (config.source !== "score") react("backing:score", context);
          }}
        >
          <span className="backing-card-icon">
            <Music2 size={18} />
          </span>
          <span>
            <strong>From the score</strong>
            <small>Follows your practice tempo</small>
          </span>
          <span className="backing-check" aria-hidden="true">
            {config.source === "score" && <Check size={12} />}
          </span>
        </button>
        <button
          aria-pressed={config.source === "audio"}
          disabled={busy}
          onClick={() => {
            change({
              source: "audio",
              enabled: config.track ? config.enabled : false,
            });
            if (config.source !== "audio") react("backing:audio", context);
          }}
        >
          <span className="backing-card-icon">
            <Headphones size={18} />
          </span>
          <span>
            <strong>Audio recording</strong>
            <small>Use a matching backing track</small>
          </span>
          <span className="backing-check" aria-hidden="true">
            {config.source === "audio" && <Check size={12} />}
          </span>
        </button>
      </div>
      {config.source === "score" ? (
        <>
          <div
            className="backing-styles"
            role="group"
            aria-label="Backing arrangement"
          >
            {STYLES.map(([id, name, hint, Icon], i) => (
              <button
                key={id}
                style={{ "--i": i }}
                aria-pressed={config.style === id}
                onClick={() => {
                  if (config.style === id) return;
                  change({ style: id });
                  react(`backing:${id}`, context);
                }}
              >
                <span className={`backing-style-icon ${id}`}>
                  <Icon size={18} />
                </span>
                <span>
                  <strong>{name}</strong>
                  <small>{hint}</small>
                </span>
                <span className="backing-check" aria-hidden="true">
                  {config.style === id && <Check size={12} />}
                </span>
              </button>
            ))}
          </div>
          <div className="backing-note" key={plan.style + plan.label}>
            <div className="backing-note-head">
              <strong>{plan.label}</strong>
              <span className="backing-chips" aria-label="Instruments">
                {instruments.map((id) => (
                  <span
                    key={id}
                    className="backing-chip"
                    style={{ "--chip": INSTRUMENTS[id]?.[1] }}
                  >
                    <i />
                    {INSTRUMENTS[id]?.[0] || id}
                  </span>
                ))}
              </span>
            </div>
            <p>{plan.description}</p>
            <p>
              The notes come from this score. This is a practice arrangement,
              not the original studio recording.
            </p>
            {plan.warnings?.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
            {onPreview && plan.events.length > 0 && (
              <button
                type="button"
                className={`backing-preview${previewing ? " on" : ""}`}
                onClick={startPreview}
                aria-pressed={previewing}
              >
                {previewing ? <Square size={13} /> : <Play size={13} />}
                {previewing ? "Stop preview" : "Hear two bars"}
                {previewing && (
                  <span className="backing-preview-eq" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="backing-file">
          <input
            ref={input}
            type="file"
            hidden
            accept=".mp3,.wav,.m4a,.ogg,.flac"
            aria-label="Backing audio file"
            className="visually-hidden"
            onChange={(e) => {
              upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {config.track ? (
            <>
              <div className="backing-filename">
                <strong>{config.track.name}</strong>
                <button disabled={busy} onClick={() => input.current.click()}>
                  <Upload size={15} />
                  Replace audio
                </button>
              </div>
              <audio
                key={config.track.id}
                ref={preview}
                controls
                preload="metadata"
                src={`/api/backing-assets/${config.track.id}`}
                aria-label="Preview backing recording"
              />
              <div className="backing-alignment">
                <label>
                  Recording tempo{" "}
                  <span>
                    <AlignmentNumber
                      aria-label="Recording tempo"
                      min="20"
                      max="400"
                      step="0.1"
                      value={config.track.bpm}
                      valid={(n) => n >= 20 && n <= 400}
                      onCommit={(n) =>
                        onChange({ track: { ...config.track, bpm: n } })
                      }
                    />{" "}
                    BPM
                  </span>
                </label>
                <label>
                  Bar 1 starts in the audio at{" "}
                  <span>
                    <AlignmentNumber
                      aria-label="Audio start offset"
                      min="0"
                      max={Math.min(7200, config.track.duration)}
                      step="0.01"
                      value={config.track.offset}
                      valid={(n) =>
                        n >= 0 && n < config.track.duration && n <= 7200
                      }
                      onCommit={(n) =>
                        onChange({ track: { ...config.track, offset: n } })
                      }
                    />{" "}
                    sec
                  </span>
                </label>
              </div>
              <p>
                Match the tempo to the recording, then set where this score
                begins. Slower practice keeps the recording’s pitch. Use the
                same arrangement and bar order.
              </p>
              <button
                className="backing-unlink"
                disabled={busy}
                onClick={() => onChange({ track: null, enabled: false })}
              >
                Unlink this audio
              </button>
            </>
          ) : (
            <div className="backing-empty">
              <span className="backing-empty-icon">
                <Headphones size={26} />
              </span>
              <strong>Add your backing track</strong>
              <p>
                For the closest match to a particular version, use its
                instrumental audio.
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() => input.current.click()}
              >
                <Upload size={16} />
                {busy ? "Saving audio…" : "Choose audio"}
              </button>
              <small>
                MP3, WAV, M4A, OGG or FLAC · up to 100 MB · stays on this Mac
              </small>
            </div>
          )}
          {busy && config.track && <p role="status">Saving audio…</p>}
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
        </div>
      )}
      {error && config.source === "score" && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      <div className="backing-mix">
        <span className="backing-volume-icon" aria-hidden="true">
          {config.volume < 0.01 ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </span>
        <label htmlFor="backing-volume">Accompaniment volume</label>
        <input
          id="backing-volume"
          aria-label="Accompaniment volume"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={config.volume}
          style={{ "--fill": `${volumePercent}%` }}
          onChange={(e) => {
            const value = +e.target.value;
            onChange({ volume: value });
            const now = Date.now();
            if (now - volumeTalk.current > 4000) {
              if (value >= 0.95) {
                volumeTalk.current = now;
                react("backing:loud", context, { mood: "listening", ttl: 2200 });
              } else if (value > 0 && value <= 0.12) {
                volumeTalk.current = now;
                react("backing:soft", context, { mood: "listening", ttl: 2200 });
              }
            }
          }}
        />
        <output key={volumePercent}>{volumePercent}%</output>
      </div>
      <p className="backing-footnote">
        {mode === "wait"
          ? "Backing stays paused in Wait for me. Choose Listen & follow or Play in time to hear it."
          : "Starts with Play. Pauses, repeats and changes speed with your practice."}{" "}
        Your piano volume is separate.
      </p>
    </div>
  );
}
