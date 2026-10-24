import { memo, useCallback, useEffect, useRef, useState } from "react";
import CompanionPortrait from "./CompanionPortrait.jsx";
import { companionFor } from "./companions.mjs";
import "./companion-presence.css";

const MOODS = new Set(["idle", "listening", "thinking", "speaking", "happy"]);

function ReactionMark({ kind }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      {kind === "heart" ? (
        <path
          d="M10 16.2 3.8 10C-.4 5.6 5.9.3 10 5.4 14.1.3 20.4 5.6 16.2 10Z"
          fill="currentColor"
        />
      ) : (
        <>
          <path
            d="M8 14V4l8-2v10"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <ellipse
            cx="5.3"
            cy="14.4"
            rx="3.3"
            ry="2.6"
            fill="currentColor"
            transform="rotate(-18 5.3 14.4)"
          />
          <ellipse
            cx="13.3"
            cy="12.4"
            rx="3.3"
            ry="2.6"
            fill="currentColor"
            transform="rotate(-18 13.3 12.4)"
          />
        </>
      )}
    </svg>
  );
}

/** Interactive chat portrait. It never starts audio, sends messages, or changes practice. */
function CompanionPresence({
  character = "beethoven",
  mood = "idle",
  language = "en",
  onInteract,
  disabled = false,
  className = "",
  // A non-interactive figure (the chat's welcome): no button, no tab stop.
  decorative = false,
  // Wave once soon after appearing (skipped with reduced motion).
  autoWave = false,
}) {
  const profile = companionFor(character);
  const expression = MOODS.has(mood) ? mood : "idle";
  const traditional = language === "zh-Hant";
  const chinese = language === "zh" || traditional;
  const hello = chinese
    ? `和${profile.zh}打${traditional ? "個" : "个"}招呼`
    : `Say hello to ${profile.name}`;
  const button = useRef(null);
  const frame = useRef(0);
  const pointer = useRef({ x: 0, y: 0 });
  const reactionTimer = useRef(null);
  const lastInteraction = useRef(-Infinity);
  const [reduced, setReduced] = useState(() =>
    typeof matchMedia === "function"
      ? matchMedia("(prefers-reduced-motion: reduce)").matches
      : true,
  );
  const [visible, setVisible] = useState(true);
  const [reaction, setReaction] = useState(false);
  const [blink, setBlink] = useState(false);
  const [greeting, setGreeting] = useState(0);
  const gesture = greeting % 2 ? "wave" : "music";

  const resetGaze = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    button.current?.style.setProperty("--presence-look-x", "0px");
    button.current?.style.setProperty("--presence-look-y", "0px");
    button.current?.style.setProperty("--presence-turn", "0deg");
  }, []);

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => {
      setReduced(media.matches);
      if (media.matches) resetGaze();
    };
    changed();
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, [resetGaze]);

  useEffect(() => {
    let onScreen = true;
    const changed = () => {
      const active = onScreen && document.visibilityState !== "hidden";
      setVisible(active);
      if (!active) resetGaze();
    };
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      changed();
    });
    if (button.current) observer.observe(button.current);
    document.addEventListener("visibilitychange", changed);
    changed();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", changed);
    };
  }, [resetGaze]);

  useEffect(() => {
    if (reduced || !visible || disabled || reaction) return;
    let timer;
    let closeTimer;
    const schedule = () => {
      // One quiet blink, then a long rest; no perpetual animation or rAF loop.
      timer = setTimeout(
        () => {
          setBlink(true);
          closeTimer = setTimeout(() => {
            setBlink(false);
            schedule();
          }, 320);
        },
        expression === "thinking" ? 6500 : 11000,
      );
    };
    schedule();
    return () => {
      clearTimeout(timer);
      clearTimeout(closeTimer);
      setBlink(false);
    };
  }, [expression, reduced, visible, disabled, reaction, profile.id]);

  useEffect(() => {
    setReaction(false);
    setGreeting(0);
    lastInteraction.current = -Infinity;
    clearTimeout(reactionTimer.current);
    resetGaze();
  }, [profile.id, resetGaze]);

  useEffect(
    () => () => {
      clearTimeout(reactionTimer.current);
      cancelAnimationFrame(frame.current);
    },
    [],
  );

  useEffect(() => {
    if (!autoWave || reduced) return;
    const start = setTimeout(() => {
      clearTimeout(reactionTimer.current);
      setReaction(true);
      setGreeting(1);
      reactionTimer.current = setTimeout(() => setReaction(false), 1450);
    }, 420);
    return () => clearTimeout(start);
  }, [autoWave, reduced, profile.id]);

  function look(event) {
    if (reduced || disabled || !visible || event.pointerType === "touch")
      return;
    pointer.current = { x: event.clientX, y: event.clientY };
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const element = button.current;
      if (!element) return;
      const bounds = element.getBoundingClientRect();
      const x = Math.max(
        -1,
        Math.min(1, ((pointer.current.x - bounds.left) / bounds.width) * 2 - 1),
      );
      const y = Math.max(
        -1,
        Math.min(1, ((pointer.current.y - bounds.top) / bounds.height) * 2 - 1),
      );
      element?.style.setProperty(
        "--presence-look-x",
        `${(x * 2.2).toFixed(2)}px`,
      );
      element?.style.setProperty(
        "--presence-look-y",
        `${(y * 1.5).toFixed(2)}px`,
      );
      element?.style.setProperty("--presence-turn", `${(x * 2).toFixed(2)}deg`);
    });
  }

  function greet() {
    if (disabled) return;
    const now = performance.now();
    // A held key or double tap should produce one greeting, not many requests.
    if (now - lastInteraction.current < 650) return;
    lastInteraction.current = now;
    clearTimeout(reactionTimer.current);
    setReaction(true);
    setGreeting((value) => value + 1);
    reactionTimer.current = setTimeout(() => setReaction(false), 1450);
    onInteract?.();
  }

  const Root = decorative ? "span" : "button";
  const interactive = decorative
    ? { "aria-hidden": "true" }
    : {
        type: "button",
        "aria-label": hello,
        title: hello,
        disabled,
        onClick: greet,
        onKeyDown: (event) => {
          if (event.repeat && (event.key === "Enter" || event.key === " "))
            event.preventDefault();
        },
        onPointerMove: look,
        onPointerLeave: resetGaze,
        onPointerCancel: resetGaze,
        onBlur: resetGaze,
      };
  return (
    <Root
      ref={button}
      className={`companion-presence${decorative ? " is-decorative" : ""}${className ? ` ${className}` : ""}`}
      data-character={profile.id}
      data-mood={expression}
      data-reaction={reaction ? "wave" : "none"}
      data-gesture={reaction ? gesture : "none"}
      data-blink={blink ? "true" : "false"}
      data-reduced-motion={reduced ? "true" : "false"}
      {...interactive}
    >
      <span className="presence-room" aria-hidden="true" />
      <span className="presence-figure" key={`${profile.id}:${greeting}`}>
        <CompanionPortrait
          character={profile.id}
          mood={reaction || expression === "happy" ? "celebrate" : expression}
          variant="presence"
        />
      </span>
      <span className="presence-mood-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <svg
        className="presence-listen-mark"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M7 6q5 4 0 8m5-11q9 7 0 14"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      {reaction && (
        <span
          key={greeting}
          className="presence-reaction-burst"
          aria-hidden="true"
        >
          <i>
            <ReactionMark kind={gesture === "music" ? "note" : "heart"} />
          </i>
          <i>
            <ReactionMark kind={gesture === "music" ? "heart" : "note"} />
          </i>
          <i>
            <ReactionMark kind={gesture === "music" ? "note" : "heart"} />
          </i>
        </span>
      )}
      <span className="presence-touch-note" aria-hidden="true">
        {reaction
          ? chinese
            ? gesture === "wave"
              ? "你好呀！"
              : traditional
                ? "一起彈吧"
                : "一起弹吧"
            : gesture === "wave"
              ? "Hello!"
              : "For you ♫"
          : chinese
            ? traditional
              ? "打個招呼"
              : "打个招呼"
            : "Say hello"}
      </span>
    </Root>
  );
}

export default memo(CompanionPresence);
