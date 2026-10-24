import { memo, useCallback, useState } from "react";

import { resolveScoreArtwork } from "../score-artwork.mjs";
export { scoreArtworkScene } from "../score-artwork.mjs";

export default memo(function ScoreArtwork({
  piece,
  className = "",
  priority = false,
}) {
  const { id: scene, src, position } = resolveScoreArtwork(piece);
  const [failedSrc, setFailedSrc] = useState(null);
  // The picture fades in once decoded; a cached image may finish before
  // React attaches onLoad, so the ref checks `complete` too.
  const [loadedSrc, setLoadedSrc] = useState(null);
  const loaded = loadedSrc === src;
  const imageRef = useCallback(
    (img) => {
      if (img?.complete && img.naturalWidth > 0) setLoadedSrc(src);
    },
    [src],
  );
  return (
    <div
      className={`score-artwork ${className}`}
      data-scene={scene}
      style={{ "--artwork-position": position }}
      aria-hidden="true"
    >
      {failedSrc !== src ? (
        <img
          src={src}
          alt=""
          width="1536"
          height="1024"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          draggable="false"
          ref={imageRef}
          data-loaded={loaded || undefined}
          onLoad={() => setLoadedSrc(src)}
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <svg
          className="score-artwork-fallback"
          viewBox="0 0 480 300"
          focusable="false"
        >
          <circle cx="335" cy="94" r="54" fill="var(--jacket-wash)" />
          <path
            d="M66 250h348M150 218v-95c0-47 64-50 64-90l150 112v73Z"
            fill="var(--jacket-block)"
          />
          <path
            d="M138 199h236v24H138zM155 223v33m198-33v33"
            fill="var(--jacket-paper)"
            stroke="var(--jacket-ink)"
            strokeWidth="3"
          />
          <path
            d="M172 200v22m23-22v22m23-22v22m23-22v22m23-22v22m23-22v22m23-22v22m23-22v22m23-22v22"
            stroke="var(--jacket-ink)"
            strokeWidth="2"
          />
        </svg>
      )}
    </div>
  );
});
