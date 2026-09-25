import React from "react";
export default function Pet({ kind = "cat", happy = false, large = false }) {
  return (
    <div className={`pet ${large ? "large" : ""} ${happy ? "happy" : ""}`}>
      <svg
        viewBox="0 0 240 200"
        role="img"
        aria-label={
          kind === "bunny" ? "Mochi the moon bunny" : "Luma the cosmic cat"
        }
      >
        <defs>
          <radialGradient id="body" cx="36%" cy="22%" r="85%">
            <stop stopColor="#f3ffef" />
            <stop offset=".48" stopColor="#b4e7d2" />
            <stop offset="1" stopColor="#6aa89b" />
          </radialGradient>
          <radialGradient id="halo">
            <stop stopColor="#b9f2d4" stopOpacity=".23" />
            <stop offset="1" stopColor="#9bf2cc" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ear">
            <stop stopColor="#e8def9" />
            <stop offset="1" stopColor="#a1c3c0" />
          </linearGradient>
        </defs>
        <ellipse cx="120" cy="110" rx="115" ry="90" fill="url(#halo)" />
        <ellipse
          cx="120"
          cy="171"
          rx="61"
          ry="9"
          fill="#040907"
          opacity=".35"
        />
        <g className="pet-body">
          <path
            d="M160 140 Q206 167 191 119 Q187 100 179 114"
            fill="none"
            stroke="#9bd2be"
            strokeWidth="18"
            strokeLinecap="round"
          />
          {kind === "bunny" ? (
            <>
              <ellipse
                cx="94"
                cy="61"
                rx="18"
                ry="49"
                fill="url(#body)"
                transform="rotate(-10 94 61)"
              />
              <ellipse
                cx="149"
                cy="61"
                rx="18"
                ry="49"
                fill="url(#body)"
                transform="rotate(10 149 61)"
              />
              <ellipse cx="94" cy="53" rx="8" ry="29" fill="url(#ear)" />
              <ellipse cx="149" cy="53" rx="8" ry="29" fill="url(#ear)" />
            </>
          ) : (
            <>
              <path d="M65 94 L65 39 Q68 27 80 38 L105 66" fill="url(#body)" />
              <path
                d="M137 65 L163 38 Q177 27 178 43 L177 102"
                fill="url(#body)"
              />
              <path
                d="M73 71 L74 43 L94 67 M148 68 L166 43 L169 76"
                fill="url(#ear)"
              />
            </>
          )}
          <path
            d="M61 110 C57 70 88 57 121 57 C161 57 182 82 182 115 C185 152 162 167 121 167 C81 167 59 152 61 110"
            fill="url(#body)"
          />
          <ellipse
            cx="120"
            cy="138"
            rx="34"
            ry="25"
            fill="#e4f9db"
            opacity=".45"
          />
          <ellipse
            cx="83"
            cy="116"
            rx="12"
            ry="6"
            fill="#eea8c5"
            opacity=".65"
          />
          <ellipse
            cx="159"
            cy="116"
            rx="12"
            ry="6"
            fill="#eea8c5"
            opacity=".65"
          />
          <g fill="#244338" className="pet-eyes">
            {happy ? (
              <>
                <path
                  d="M87 105 Q96 96 103 105 M137 105 Q145 96 153 105"
                  fill="none"
                  stroke="#244338"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </>
            ) : (
              <>
                <ellipse cx="96" cy="104" rx="5" ry="8" />
                <ellipse cx="145" cy="104" rx="5" ry="8" />
                <circle cx="97" cy="101" r="1.6" fill="white" />
                <circle cx="146" cy="101" r="1.6" fill="white" />
              </>
            )}
          </g>
          <path
            d="M115 116 Q120 121 125 116 M120 119 Q117 126 112 122 M120 119 Q123 126 128 122"
            fill="none"
            stroke="#426452"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <ellipse cx="90" cy="160" rx="17" ry="8" fill="#bde8cf" />
          <ellipse cx="151" cy="160" rx="17" ry="8" fill="#bde8cf" />
          <path
            d="M117 69 L120 62 L124 69 L131 72 L124 75 L120 82 L117 75 L110 72Z"
            fill="#f9f6d0"
          />
          <ellipse
            cx="120"
            cy="34"
            rx="44"
            ry="11"
            fill="none"
            stroke="#d5dcad"
            strokeWidth="2"
            transform="rotate(-12 120 34)"
            opacity=".7"
          />
        </g>
        <g fill="#d9f5be">
          <path d="M35 85 l3 -8 3 8 8 3 -8 3 -3 8 -3 -8 -8 -3Z" />
          <path d="M202 61 l2 -5 2 5 5 2 -5 2 -2 5 -2 -5 -5 -2Z" />
          <circle cx="199" cy="150" r="2" />
          <circle cx="49" cy="135" r="2" />
        </g>
      </svg>
    </div>
  );
}
