import { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import CompanionPresence from "../CompanionPresence.jsx";
import { companionFor } from "../companions.mjs";
import { HeaderSeat } from "./StudioCompanion.jsx";
import "../library-companion.css";

// A small greeting beside the collection. A touch is just a greeting;
// opening the conversation is a separate, explicit action.
export default function LibraryCompanion({ character = "beethoven", onTalk }) {
  const profile = companionFor(character);
  const [greeting, setGreeting] = useState(0);
  const [greeted, setGreeted] = useState(false);
  const timer = useRef(null);
  useEffect(() => {
    setGreeted(false);
    clearTimeout(timer.current);
    return () => clearTimeout(timer.current);
  }, [character]);
  function greet() {
    clearTimeout(timer.current);
    setGreeting((value) => value + 1);
    setGreeted(true);
    timer.current = setTimeout(() => setGreeted(false), 1900);
  }
  return (
    <div
      className="library-companion-visit"
      data-greeting={greeted ? "yes" : "no"}
    >
      <div className="library-companion-portrait">
        <span className="library-companion-orbit" aria-hidden="true" />
        <HeaderSeat />
        <CompanionPresence character={character} onInteract={greet} />
        {greeted && (
          <span
            key={greeting}
            className="library-greeting-petals"
            aria-hidden="true"
          >
            <i />
            <i />
            <i />
          </span>
        )}
      </div>
      {onTalk ? (
        <button
          type="button"
          className="library-companion-talk"
          onClick={onTalk}
          aria-label={`Talk with ${profile.name}`}
          title={`Open ${profile.name}'s conversation`}
        >
          <span>{profile.name}</span>
          <MessageCircle size={14} strokeWidth={1.5} />
        </button>
      ) : (
        <span className="library-companion-name">{profile.name}</span>
      )}
      <span
        className="library-companion-announcement"
        role="status"
        aria-live="polite"
      >
        {greeted ? `${profile.name} waves hello.` : ""}
      </span>
    </div>
  );
}
