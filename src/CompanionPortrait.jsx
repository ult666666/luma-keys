import { memo } from "react";
import MaestroAvatar from "./MaestroAvatar.jsx";
import { CompanionPet } from "./screens/StudioCompanion.jsx";

// The chat's larger portrait has more readable eyes and separate waving paws.
// Small toolbar and playing-stage portraits keep their original drawing.
function PresencePet({ kind, happy, expression, className, ...props }) {
  const bunny = kind === "bunny";
  const fur = bunny ? "#f3e5d3" : "#ddb294";
  return (
    <svg
      {...props}
      viewBox="0 0 180 180"
      className={`beethoven-avatar presence-pet ${className}`}
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      <ellipse cx="91" cy="169" rx="50" ry="4" fill="#665649" opacity=".12" />
      <g
        stroke="#665448"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {bunny ? (
          <circle cx="134" cy="144" r="13" fill="#fff1df" />
        ) : (
          <path
            className="presence-pet-tail"
            d="M125 156c29 6 40-13 33-25-5-8-15-5-12 2"
            stroke={fur}
            strokeWidth="13"
          />
        )}
        <path
          d="M67 111c-15 12-23 33-17 45 6 12 30 12 41 8 15 4 39 4 43-9 4-14-4-34-19-45Z"
          fill={fur}
        />
        <path
          d="M80 122c-9 12-12 27-8 39h37c4-13 0-29-9-39Z"
          fill="#fff0d9"
          stroke="none"
        />
        <g className="presence-pet-head">
          {bunny ? (
            <>
              <g className="presence-pet-ear">
                <path d="M57 60C32 24 43 3 55 9c14 7 17 31 17 49" fill={fur} />
                <path
                  d="M58 44C48 26 48 18 51 17"
                  stroke="#d9b0a6"
                  strokeWidth="7"
                />
              </g>
              <g className="presence-pet-ear presence-pet-ear-far">
                <path
                  d="M101 57c-1-30 10-54 23-48 16 9-2 36-10 53"
                  fill={fur}
                />
                <path
                  d="M110 43c7-17 12-25 13-24"
                  stroke="#d9b0a6"
                  strokeWidth="7"
                />
              </g>
              <path
                d="M42 80c1-25 20-39 47-38 28 0 48 15 48 40 0 25-19 42-48 42-28 0-48-18-47-44Z"
                fill={fur}
              />
            </>
          ) : (
            <>
              <path
                d="M43 79 39 36q0-7 6-3l29 20q16-4 31 0l29-21q6-4 6 3l-4 48c-1 25-20 40-47 40-29 0-47-17-46-44Z"
                fill={fur}
              />
              <path d="m48 44 3 24 15-12Z" fill="#d68f7d" stroke="none" />
              <path d="m131 44-18 13 14 12Z" fill="#d68f7d" stroke="none" />
              <path
                d="m83 53 1 9m13-9-1 9"
                stroke="#b78467"
                strokeWidth="3.5"
              />
            </>
          )}
          <ellipse
            cx="89"
            cy="101"
            rx="23"
            ry="16"
            fill="#fff0d9"
            stroke="none"
          />
          <g className="presence-pet-eyes" style={{ opacity: happy ? 0 : 1 }}>
            {[68, 111].map((x) => (
              <g key={x}>
                <ellipse
                  cx={x}
                  cy="83"
                  rx="7.2"
                  ry="9"
                  fill="#fff9ed"
                  stroke="none"
                />
                <g className="presence-pupil">
                  <ellipse
                    cx={x + 0.6}
                    cy="84"
                    rx="4.6"
                    ry="6.4"
                    fill="#4b493f"
                    stroke="none"
                  />
                  <circle
                    cx={x + 2}
                    cy="81"
                    r="1.65"
                    fill="#fffdf3"
                    stroke="none"
                  />
                </g>
              </g>
            ))}
          </g>
          <g
            className="presence-pet-smile-eyes"
            opacity={happy ? 1 : 0}
            strokeWidth="2.6"
          >
            <path d="M62 84q6-8 12 0m31 0q6-8 12 0" />
          </g>
          <ellipse
            cx="59"
            cy="97"
            rx="8"
            ry="4"
            fill="#d8907b"
            opacity={happy ? ".75" : ".55"}
            stroke="none"
          />
          <ellipse
            cx="120"
            cy="97"
            rx="8"
            ry="4"
            fill="#d8907b"
            opacity={happy ? ".75" : ".55"}
            stroke="none"
          />
          <path d="m84 96 5 4 5-4Z" fill="#896453" stroke="none" />
          {expression === "speaking" && !happy ? (
            <ellipse
              className="presence-pet-mouth"
              cx="89"
              cy="107"
              rx="4"
              ry="3.4"
              fill="#896453"
              stroke="none"
            />
          ) : (
            <path
              className="presence-pet-mouth"
              d={
                expression === "thinking"
                  ? "M89 100v4m-3 4q3-2 6 0"
                  : "M89 100v5m-7 0q7 8 14 0"
              }
              strokeWidth="1.8"
            />
          )}
          {!bunny && (
            <path
              d="m56 98-16-3m16 9-15 3m82-9 16-3m-16 9 15 3"
              strokeWidth="1.2"
            />
          )}
        </g>
        <path
          d="M67 116q22 13 46 0l-4 12q-20 11-39 0Z"
          fill={bunny ? "#bf97a3" : "#93a78c"}
        />
        <path
          d="m85 127 9 1-1 16-5-3-5 2Z"
          fill={bunny ? "#caa5ad" : "#adbd9f"}
          strokeWidth="1.2"
        />
        <g className="presence-pet-paw">
          <path d="M64 130c-9-7-18-4-20 4-2 9 6 20 17 18l13-8" fill={fur} />
          <path d="m48 139 4 3m-2-8 4 3" strokeWidth="1.1" />
          <ellipse
            className="presence-pet-bean"
            cx="56"
            cy="141"
            rx="4"
            ry="4.8"
            fill="#d99d91"
            stroke="none"
            opacity=".65"
          />
        </g>
        <path d="M111 137c7 6 12 15 8 23-3 6-17 6-21 1" fill={fur} />
        <path d="m104 158 1 5m6-6 1 5" strokeWidth="1.1" />
      </g>
    </svg>
  );
}

function CompanionPortrait({
  character = "beethoven",
  mood = "idle",
  variant = "default",
  className = "",
  ...props
}) {
  if (variant === "presence" && (character === "cat" || character === "bunny"))
    return (
      <PresencePet
        {...props}
        kind={character}
        happy={mood === "celebrate"}
        expression={mood}
        className={className}
        data-character={character}
        data-mood={mood}
      />
    );
  if (character === "cat" || character === "bunny")
    return (
      <CompanionPet
        {...props}
        kind={character}
        happy={mood === "celebrate" || mood === "listening"}
        className={`beethoven-avatar salon-pet ${className}`}
        data-character={character}
        data-mood={mood}
      />
    );
  return (
    <MaestroAvatar
      {...props}
      character={character}
      mood={mood}
      className={className}
    />
  );
}
export default memo(CompanionPortrait);
