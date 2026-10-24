import { memo } from "react";
import "./beethoven-avatar.css";

const MOODS = new Set(["idle", "listening", "conducting", "celebrate"]);

/** Original, decorative portrait; name and state belong to its parent control. */
function BeethovenAvatar({ mood = "idle", className = "", ...props }) {
  const expression = MOODS.has(mood) ? mood : "idle";
  return (
    <svg
      {...props}
      viewBox="0 0 180 180"
      className={`beethoven-avatar${className ? ` ${className}` : ""}`}
      data-mood={expression}
      aria-hidden="true"
      focusable="false"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <ellipse cx="91" cy="172" rx="54" ry="5" fill="#718272" opacity=".14" />
      <g
        stroke="#465047"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <g className="beethoven-coat">
          <path
            d="M63 119c-10 6-13 16-14 31l-7 21c14 6 30 6 47 3 17 3 35 3 49-3l-8-23c-2-15-7-25-18-29Z"
            fill="#35483e"
          />
          <path
            d="m74 119-15 11 10 9-8 9 17 26m29-55 17 11-10 9 9 9-19 26"
            fill="#465a4b"
          />
          <path d="M83 133v38m14-35v35" stroke="#283c31" strokeWidth="1.3" />
          <circle cx="99" cy="153" r="2" fill="#b5a77e" stroke="none" />
          <circle cx="99" cy="164" r="2" fill="#b5a77e" stroke="none" />
        </g>

        <g className="beethoven-baton-arm">
          <path
            d="M59 124c-8 0-18 8-27 12l-7-13-11 5 9 20c3 5 9 4 15 1l22-9"
            fill="#3c5144"
          />
          <path d="m18 131 11-5-3-7-12 5Z" fill="#f3ead6" />
          <path
            d="M16 124c-6-2-6-8-3-11 3-4 7-3 10 1l4 8c-3 5-7 6-11 2Z"
            fill="#ebc9ad"
          />
          <path d="m21 119-9-31" stroke="#faf5e5" strokeWidth="4" />
          <path d="m21 119-9-31" stroke="#655f4c" strokeWidth="1" />
          <path d="m15 115 6 2" stroke="#bb9278" strokeWidth="1.2" />
          <path d="m43 139 10-5" stroke="#617260" strokeWidth="1.2" />
        </g>

        <g className="beethoven-score-arm">
          <path d="M119 126c10 2 18 12 23 24l-13 9-14-20" fill="#3c5144" />
          <path d="m129 150 11-5 6 8-12 6Z" fill="#f3ead6" />
          <g className="beethoven-score">
            <path
              d="M118 132c9 0 15 2 22 7l13-5 7 31-15 7c-8-5-15-7-24-7Z"
              fill="#f9f3e5"
            />
            <path d="m140 139 5 33" stroke="#b7b6a1" strokeWidth="1.2" />
            <path
              d="m125 140 10 3m-9 2 10 3m-9 2 10 3m8-8 6-2m-5 7 6-2m-5 7 6-2"
              stroke="#a6b19b"
              strokeWidth="1"
            />
            <path
              d="m130 153 1-7m17 12-1-7"
              stroke="#687660"
              strokeWidth="1.2"
            />
            <ellipse
              cx="128"
              cy="153"
              rx="2.4"
              ry="1.6"
              fill="#687660"
              stroke="none"
              transform="rotate(-15 128 153)"
            />
            <ellipse
              cx="146"
              cy="158"
              rx="2.4"
              ry="1.6"
              fill="#687660"
              stroke="none"
              transform="rotate(-15 146 158)"
            />
          </g>
          <path d="M129 156c-4-3-8-1-7 3l2 6c1 4 9 3 10-1" fill="#ebc9ad" />
          <path d="m125 159 3 5" stroke="#bb9278" strokeWidth="1.1" />
        </g>

        <path d="m72 114 17 6 18-6 6 11-17 12-11-9-9 7-9-12Z" fill="#f4eddb" />
        <g className="beethoven-scarf">
          <path
            d="M71 112c13 6 25 8 38 0l1 11c-10 8-24 9-38 1Z"
            fill="#b86856"
          />
          <path d="m88 125 10 3-5 24-7-6-6 3Z" fill="#a45345" />
          <path d="m96 125 7 3 6 14-10-1-5 4-5-17Z" fill="#c37862" />
          <path d="m78 119 9 3m10-1 6-2" stroke="#e0a188" strokeWidth="1.2" />
        </g>

        <g className="beethoven-head">
          <path
            className="beethoven-hair-back"
            d="M32 53 25 43l17-2-5-14 18 3 1-17 18 8 11-15 11 12 16-8 8 12 17-3 2 14 16 2-4 13 12 10-9 12 7 14-13 5 3 15-14 1-6 12-13-5-13 6-15-5-15 5-12-6-15 5-7-12-12-1 3-15-12-5 8-14-7-10Z"
            fill="#bdbfb1"
          />
          <path
            d="M48 63c-9-4-14 4-10 15 2 7 7 9 12 8m83-23c9-4 14 4 10 15-2 7-7 9-12 8"
            fill="#e8c3a8"
          />
          <path
            d="M49 52c4-19 24-27 42-26 26 0 44 14 43 41l-1 17c-1 22-19 34-42 34-25 0-42-13-43-34Z"
            fill="#f0d1b3"
          />
          <path
            d="M53 90c4 15 19 23 38 23s33-8 39-22c-1 17-17 28-39 28-21 0-35-10-38-29Z"
            fill="#e7bda0"
            stroke="none"
          />
          <path
            className="beethoven-hair-front"
            d="M40 78 34 66l8-17-3-10 15 1 2-17 15 8 13-16 10 9 18-8 7 13 17-1-3 12 14 6-10 10 5 17-11 18-4-26-9-17-11 1-5-14-10 11-14-4-13 11-10 12-2 27Z"
            fill="#e2e1d3"
          />
          <path
            d="M46 49 58 43l5-10m12 4 12-11m24 6 7 8m11 0-3 10m-70 8-7 15m88-18-2 14"
            stroke="#a5ad9d"
            strokeWidth="1.6"
          />
          <path d="M51 78 48 95l7 5 1-19m75-3 3 17-7 5-1-19" fill="#bfc0af" />
          <path
            d="M62 68c5-4 11-5 17-2m22 0c6-3 13-1 18 3"
            stroke="#737766"
            strokeWidth="3.8"
          />
          <g className="beethoven-eyes">
            <ellipse
              cx="73"
              cy="79"
              rx="6.8"
              ry="8"
              fill="#fff7e8"
              stroke="none"
            />
            <ellipse
              cx="109"
              cy="79"
              rx="6.8"
              ry="8"
              fill="#fff7e8"
              stroke="none"
            />
            <ellipse
              cx="74"
              cy="80"
              rx="3.8"
              ry="5.7"
              fill="#39483c"
              stroke="none"
            />
            <ellipse
              cx="110"
              cy="80"
              rx="3.8"
              ry="5.7"
              fill="#39483c"
              stroke="none"
            />
            <circle cx="75" cy="77.5" r="1.25" fill="#fffdf4" stroke="none" />
            <circle cx="111" cy="77.5" r="1.25" fill="#fffdf4" stroke="none" />
          </g>
          <g
            className="beethoven-smiling-eyes"
            stroke="#39483c"
            strokeWidth="2.8"
          >
            <path d="M67 81q6-7 12 0m24 0q6-7 12 0" />
          </g>
          <ellipse
            cx="62"
            cy="90"
            rx="7"
            ry="3.5"
            fill="#d68d77"
            opacity=".48"
            stroke="none"
          />
          <ellipse
            cx="120"
            cy="90"
            rx="7"
            ry="3.5"
            fill="#d68d77"
            opacity=".48"
            stroke="none"
          />
          <path d="m90 82-2 7 5 1" stroke="#c29476" strokeWidth="1.5" />
          <path
            className="beethoven-smile"
            d="M81 98q10 7 21-1"
            stroke="#835846"
            strokeWidth="1.9"
          />
          <path d="M86 107q5 2 10 0" stroke="#d4a68a" strokeWidth="1.2" />
        </g>
      </g>
    </svg>
  );
}

export default memo(BeethovenAvatar);
