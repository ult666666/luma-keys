import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  BellOff,
  Cookie,
  CornerRightDown,
  EyeOff,
  Heart,
  MessageCircle,
  MoveHorizontal,
  Music2,
} from "lucide-react";

// The companion's own little menu (right-click, a long press, Shift+F10 or
// the ContextMenu key on the companion). It opens toward the middle of the
// window, takes focus, and gives it back to the companion when it closes.

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Each companion's treat, drawn at 16 × 16: coffee beans (Beethoven), a
// praline (Mozart), a cherry tart (Liszt), a star cookie (Lang Lang), a fish
// cracker (Luma) and a strawberry mochi (Mochi).
const TREATS = {
  beethoven: (
    <>
      <ellipse cx="5.6" cy="8.6" rx="3.4" ry="4.6" transform="rotate(-24 5.6 8.6)" fill="#6b4226" />
      <path d="M4.2 5.2c1.6 2 1.4 4.6 2.6 7" stroke="#3b2414" strokeWidth=".9" fill="none" strokeLinecap="round" />
      <ellipse cx="10.8" cy="7.4" rx="3.4" ry="4.6" transform="rotate(20 10.8 7.4)" fill="#7d4f2e" />
      <path d="M11.8 3.6c-1.4 2-1.2 4.6-2.2 7.4" stroke="#3b2414" strokeWidth=".9" fill="none" strokeLinecap="round" />
    </>
  ),
  mozart: (
    <>
      <path d="M2.5 9.5a5.5 5.5 0 0 0 11 0Z" fill="#c9974f" />
      <circle cx="8" cy="8.6" r="5" fill="#5a3522" />
      <path d="M5.2 7.2c1-1.6 2.6-1.6 3.4-.4s2.2 1.2 2.9-.2" stroke="#e9c98a" strokeWidth="1.1" fill="none" strokeLinecap="round" />
    </>
  ),
  liszt: (
    <>
      <path d="M1.8 9.6h12.4l-1.6 4.2H3.4Z" fill="#c98d4f" />
      <path d="M2 9.6c1-1.8 11-1.8 12 0" fill="#e8b7a0" />
      <circle cx="8" cy="7.4" r="2.6" fill="#b3203a" />
      <path d="M8 4.8c.4-1.6 1.6-2.6 3-3" stroke="#4d7a3a" strokeWidth="1" fill="none" strokeLinecap="round" />
      <circle cx="7.2" cy="6.6" r=".7" fill="#ffd6dc" />
    </>
  ),
  langlang: (
    <>
      <path d="M8 1.6l1.9 4 4.4.5-3.3 3 .9 4.4L8 11.3l-3.9 2.2.9-4.4-3.3-3 4.4-.5Z" fill="#e2b25a" stroke="#a87a2a" strokeWidth=".8" strokeLinejoin="round" />
      <circle cx="7" cy="7.6" r=".6" fill="#a87a2a" />
      <circle cx="9.2" cy="8.6" r=".6" fill="#a87a2a" />
    </>
  ),
  cat: (
    <>
      <path d="M2.2 8c2.2-3.6 6.6-4 9-1.2l2.6-2.2-.6 3.4.6 3.4-2.6-2.2c-2.4 2.8-6.8 2.4-9-1.2Z" fill="#e39a4a" stroke="#a8642a" strokeWidth=".8" strokeLinejoin="round" />
      <circle cx="5" cy="7.4" r=".8" fill="#4b3a2a" />
      <path d="M7.4 6.2v3.6" stroke="#a8642a" strokeWidth=".7" />
    </>
  ),
  bunny: (
    <>
      <ellipse cx="8" cy="10.2" rx="5.8" ry="4.2" fill="#fbf3ea" stroke="#d9c4b4" strokeWidth=".8" />
      <path d="M5.2 7.6c0-2.6 1.4-4.2 2.8-4.2s2.8 1.6 2.8 4.2c-1.8.8-3.8.8-5.6 0Z" fill="#e2566a" />
      <path d="M6.8 3.6 8 2.2l1.2 1.4" stroke="#4d7a3a" strokeWidth="1" fill="none" strokeLinecap="round" />
      <circle cx="7" cy="5.8" r=".35" fill="#fff4d6" />
      <circle cx="9" cy="6.4" r=".35" fill="#fff4d6" />
    </>
  ),
};
/** The companion's treat as a tiny inline SVG. */
export function TreatIcon({ character = "cat", size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false" className="buddy-treat-icon">
      {TREATS[character] || TREATS.cat}
    </svg>
  );
}

export default function BuddyMenu({
  name = "Companion",
  character = "cat",
  hearts = 0,
  quiet = false,
  side = "right",
  tucked = false,
  treats = 0,
  canDance = true,
  canMove = true,
  anchor, // the companion's rect on screen
  onChoose,
  onClose,
}) {
  const ref = useRef(null);
  const [place, setPlace] = useState(null);
  const items = [
    { id: "chat", icon: MessageCircle, label: "Chat" },
    { id: "dance", icon: Music2, label: "Dance", disabled: !canDance, hint: canDance ? "" : "Not while music plays" },
    {
      id: "treat",
      icon: treats > 0 ? () => <TreatIcon character={character} size={15} /> : Cookie,
      label: `Give a treat (${treats})`,
      disabled: treats < 1,
      hint: treats < 1 ? "Earn treats by reaching your daily goal" : "",
    },
    { id: "quiet", icon: BellOff, label: "Quiet mode", checked: quiet },
    canMove && { id: "side", icon: MoveHorizontal, label: `Move to the ${side === "left" ? "right" : "left"} side` },
    { id: "tuck", icon: CornerRightDown, label: tucked ? "Come back out" : "Tuck into the corner" },
    { id: "hide", icon: EyeOff, label: "Hide companion" },
  ].filter(Boolean);

  // Open beside the companion, toward the middle of the window, clamped
  // into view once its real size is known.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) return;
    const vw = innerWidth,
      vh = innerHeight;
    const { width: w, height: h } = el.getBoundingClientRect();
    const cx = (anchor.left + anchor.right) / 2;
    const toLeft = cx > vw / 2;
    const left = clamp(toLeft ? anchor.left - 8 - w : anchor.right + 8, 8, vw - w - 8);
    // Stay below the app bar (the main navigation) whenever the window is
    // tall enough; only a very short window lets the menu reach over it.
    let bar = 0;
    for (const n of document.querySelectorAll(".app-bar, .app-nav")) bar = Math.max(bar, n.getBoundingClientRect().bottom);
    const minTop = bar + 8 + h <= vh - 8 ? bar + 8 : 8;
    const top = clamp(anchor.top + (anchor.bottom - anchor.top) / 2 - h / 2, minTop, Math.max(minTop, vh - h - 8));
    setPlace({ left, top, origin: toLeft ? "100% 50%" : "0 50%" });
  }, [anchor]);

  // Focus moves in once the menu is placed (it is hidden until then).
  const focused = useRef(false);
  useEffect(() => {
    if (!place || focused.current) return;
    focused.current = true;
    const first = ref.current?.querySelector('[role^="menuitem"]:not([aria-disabled="true"])');
    first?.focus({ preventScroll: true });
  }, [place]);
  useEffect(() => {
    const outside = (e) => {
      if (!ref.current?.contains(e.target)) onClose?.(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (delta) => {
    const list = [...ref.current.querySelectorAll('[role^="menuitem"]')];
    const at = list.indexOf(document.activeElement);
    const next = delta === "first" ? 0 : delta === "last" ? list.length - 1 : (at + delta + list.length) % list.length;
    list[next]?.focus({ preventScroll: true });
  };
  const onKeyDown = (e) => {
    const keys = {
      ArrowDown: () => move(1),
      ArrowUp: () => move(-1),
      Home: () => move("first"),
      End: () => move("last"),
      Escape: () => onClose?.(true),
      Tab: () => onClose?.(true),
    };
    if (!keys[e.key]) return;
    e.preventDefault();
    e.stopPropagation();
    keys[e.key]();
  };

  return (
    <div
      ref={ref}
      className="buddy-menu"
      role="menu"
      aria-label={`${name} options`}
      style={
        place
          ? { left: place.left, top: place.top, transformOrigin: place.origin }
          : { left: -9999, top: -9999, visibility: "hidden" }
      }
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="buddy-menu-head">
        <strong>{name}</strong>
        <span className="buddy-menu-hearts" role="img" aria-label={`Bond ${hearts} of 5`}>
          {Array.from({ length: 5 }, (_, i) => (
            <Heart key={i} size={11} strokeWidth={2.2} className={i < hearts ? "on" : ""} aria-hidden="true" />
          ))}
        </span>
      </div>
      {items.map(({ id, icon: Icon, label, disabled, hint, checked }) => (
        <button
          key={id}
          type="button"
          role={checked === undefined ? "menuitem" : "menuitemcheckbox"}
          aria-checked={checked === undefined ? undefined : checked}
          aria-disabled={disabled || undefined}
          title={hint || undefined}
          className={`buddy-menu-item${disabled ? " is-disabled" : ""}`}
          tabIndex={-1}
          onClick={() => {
            if (disabled) return;
            onChoose?.(id);
          }}
        >
          <Icon size={15} strokeWidth={1.9} aria-hidden="true" />
          <span>
            {label}
            {hint && disabled ? <small>{hint}</small> : null}
          </span>
          {checked ? <span className="buddy-menu-check" aria-hidden="true">✓</span> : null}
        </button>
      ))}
    </div>
  );
}
