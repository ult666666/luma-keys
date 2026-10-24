import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Gamepad2, Users, Volume2 } from "lucide-react";
import { COMPANIONS, companionFor } from "./companions.mjs";
import CompanionPortrait from "./CompanionPortrait.jsx";
import CompanionPresence from "./CompanionPresence.jsx";
import CompanionRhythm from "./CompanionRhythm.jsx";

const roomLabel = {
  dry: "Dry piano · no reverb",
  room: "Room · short reverb",
  hall: "Hall · long reverb",
};

// The previewed companion crossfades in over the last one and bows.
function useLayers(id, ms = 260) {
  const [layers, setLayers] = useState({ now: id, before: null });
  useEffect(() => {
    if (id === layers.now) return;
    setLayers({ now: id, before: layers.now });
    const t = setTimeout(
      () => setLayers((l) => (l.now === id ? { now: id, before: null } : l)),
      ms,
    );
    return () => clearTimeout(t);
  }, [id]);
  return layers;
}

export default function CompanionSalon({
  current,
  onChoose,
  disabled = false,
}) {
  // Follow late settings hydration until the user actually previews someone.
  const [selection, setSelection] = useState(null);
  // Hovering or focusing a card auditions that companion without choosing.
  const [audition, setAudition] = useState(null);
  const selected = selection ?? companionFor(current).id;
  const preview = audition ?? selected;
  const [useSound, setUseSound] = useState(true);
  const [activity, setActivity] = useState("companions");
  const [mood, setMood] = useState("idle");
  const profile = companionFor(preview);
  const chosen = companionFor(selected);
  const layers = useLayers(profile.id);
  const root = useRef(null);
  // The whole dialog takes the auditioned room's palette (contract C12).
  useEffect(() => {
    const dialog = root.current?.closest(".modal");
    if (!dialog) return;
    dialog.setAttribute("data-preview-room", profile.id);
  }, [profile.id]);
  useEffect(() => {
    const dialog = root.current?.closest(".modal");
    const before = dialog?.getAttribute("data-preview-room");
    return () => {
      if (!dialog) return;
      if (before) dialog.setAttribute("data-preview-room", before);
      else dialog.removeAttribute("data-preview-room");
    };
  }, []);
  const leaveChoices = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setAudition(null);
  };
  return (
    <div className="companion-salon" data-preview={profile.id} ref={root}>
      <div className="salon-gallery">
        <section
          className="salon-room-preview"
          aria-label="Companion and colour preview"
        >
          <div className="salon-portrait-stage">
            <div className="salon-arch" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            {layers.before && layers.before !== layers.now && (
              <div
                className="salon-layer leaving"
                key={`before-${layers.before}`}
                aria-hidden="true"
                inert
              >
                <CompanionPresence
                  character={layers.before}
                  mood="idle"
                  disabled
                  className="salon-greeting"
                />
              </div>
            )}
            <div className="salon-layer entering" key={`now-${layers.now}`}>
              <CompanionPresence
                character={layers.now}
                mood={mood}
                disabled={disabled}
                className="salon-greeting"
              />
            </div>
            <div className="salon-mini-keys" aria-hidden="true">
              {Array.from({ length: 14 }, (_, i) => (
                <i key={i} />
              ))}
            </div>
          </div>
          <div className="salon-audition" aria-live="polite">
            <p className="salon-sample" key={profile.id}>
              <span className="salon-sample-name">{profile.name}</span>
              {profile.sample}
            </p>
            <span className="salon-tagline">{profile.tagline}</span>
          </div>
          <div className="salon-room-title">
            <span>{profile.roomName}</span>
            <h3>{profile.paletteName}</h3>
            <span className="salon-room-strip" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </div>
        </section>
        <section className="salon-cast" aria-label="Companion activities">
          <div
            className="salon-activity-switch"
            role="group"
            aria-label="Companion activities"
          >
            <button
              type="button"
              aria-pressed={activity === "companions"}
              onClick={() => setActivity("companions")}
            >
              <Users size={14} /> Companions
            </button>
            <button
              type="button"
              aria-pressed={activity === "rhythm"}
              onClick={() => setActivity("rhythm")}
            >
              <Gamepad2 size={14} /> Play a game
              <span className="salon-badge" aria-hidden="true">
                ♪
              </span>
            </button>
          </div>
          {activity === "rhythm" ? (
            <CompanionRhythm
              key={profile.id}
              profile={profile}
              disabled={disabled}
              onMood={setMood}
            />
          ) : (
            <div
              className="salon-choices"
              aria-label="Choose a companion"
              onPointerLeave={() => setAudition(null)}
              onBlur={leaveChoices}
            >
              {COMPANIONS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`salon-choice${selected === c.id ? " selected" : ""}${audition === c.id ? " auditioning" : ""}`}
                  data-character={c.id}
                  style={{
                    "--choice-colour": c.swatches[2],
                    "--choice-wash": c.swatches[0],
                  }}
                  aria-label={`Preview ${c.name}, ${c.tagline}`}
                  aria-describedby={
                    current === c.id ? `salon-current-${c.id}` : undefined
                  }
                  aria-pressed={selected === c.id}
                  onClick={() => setSelection(c.id)}
                  onPointerEnter={() => setAudition(c.id)}
                  onFocus={() => setAudition(c.id)}
                  disabled={disabled}
                >
                  <span className="salon-choice-check" aria-hidden="true">
                    {selected === c.id && <Check size={12} />}
                  </span>
                  {current === c.id && (
                    <span
                      className="salon-choice-current"
                      id={`salon-current-${c.id}`}
                    >
                      Current
                    </span>
                  )}
                  <span className="salon-choice-portrait">
                    <CompanionPortrait character={c.id} variant="presence" />
                  </span>
                  <strong>{c.name}</strong>
                  <small>{c.zh}</small>
                  <span className="salon-choice-tagline">{c.tagline}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
      <footer className="salon-footer">
        <label className="salon-sound-choice">
          <input
            type="checkbox"
            checked={useSound}
            onChange={(e) => setUseSound(e.target.checked)}
            aria-label="Match piano sound"
            disabled={disabled}
          />
          <Volume2 size={17} />
          <span>
            Match piano sound
            <small>
              {useSound ? roomLabel[chosen.room] : "Keep my current sound"}
            </small>
          </span>
        </label>
        <button
          className="primary salon-enter"
          onClick={(e) => {
            // The new room washes in from this button (contract C11).
            const r = e.currentTarget.getBoundingClientRect();
            onChoose(chosen.id, useSound, {
              x: Math.round(r.left + r.width / 2),
              y: Math.round(r.top + r.height / 2),
            });
          }}
          disabled={disabled}
        >
          Choose {chosen.name}
          <ArrowRight size={17} />
        </button>
      </footer>
    </div>
  );
}
