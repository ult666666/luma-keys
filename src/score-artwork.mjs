// Artwork identifies a musical work, not a score's position in the library.
// The three Sunny Day editions have related but distinct covers. Selecting or
// sorting a score never changes its cover or modifies its edition metadata.
// Wide Continue cards crop vertically; keep the story's faces in view.
const FOCAL_POSITIONS = Object.freeze({
  appassionata: "50% 25%",
  tornado: "50% 30%",
  gymnopedie: "54% 43%",
});
const cover = (id) => Object.freeze({
  id,
  src: `/library-art/cartoon-${id}.png`,
  position: FOCAL_POSITIONS[id] || "50% 50%",
});

export const SCORE_ARTWORK = Object.freeze(Object.fromEntries([
  "appassionata", "sunny-day", "sunny-chords", "sunny-concert",
  "tornado", "truth", "moonlight", "gymnopedie", "bach-prelude",
  "first-steps", "twinkle", "ode-joy", "fur-elise",
].map((id) => [id, cover(id)])));

export const NEUTRAL_SCORE_ARTWORK = Object.freeze({
  id: "neutral",
  src: "/library-art/cartoon-neutral.png",
  position: "50% 50%",
});

const KNOWN_SCORES = new Map([
  ["35f5190a-a277-41a2-960f-635902383597", "appassionata"],
  ["fe803071-0b5a-4a0b-bd88-a33a27d1f605", "sunny-day"],
  ["e1996426-895d-4486-af35-a04ed3da4739", "sunny-chords"],
  ["5d3bcd8b-f8d9-4f0c-9dfc-ffe0ebbaa946", "sunny-concert"],
  ["94797a12-b8ed-4d4f-8537-b99c4d0ff565", "sunny-day"],
  ["tornado-gem-eop-8188", "tornado"],
  ["truth-eop-9266", "truth"],
  ["beethoven-moonlight-1-complete-mutopia-20260927", "moonlight"],
  ["satie-gymnopedie-1-complete-mutopia-20260927", "gymnopedie"],
  ["bach-bwv846-complete-mutopia-20260927", "bach-prelude"],
  ["f01bc1bd-b817-451a-8d51-18349f3fb8c2", "first-steps"],
  ["00b1cc5f-1afd-4759-a87a-4e7e11e796e2", "first-steps"],
  ["scale", "first-steps"],
  ["moon", "twinkle"],
  ["joy", "ode-joy"],
  ["elise", "fur-elise"],
]);

const normalize = (value) => typeof value === "string" ? value
  .normalize("NFKD")
  .replace(/\p{M}/gu, "")
  .toLowerCase()
  .replace(/[’‘]/g, "'")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim()
  .replace(/\s+/g, " ") : "";

function titlesFor(piece) {
  const title = typeof piece.title === "string" ? piece.title : "";
  // A work title followed by an explicit subtitle/edition is still that work.
  // Never search arbitrary prose, descriptions, or isolated mood keywords.
  const base = title.split(/\s*[·•|—–]\s*|\s+-\s+/u)[0];
  return new Set([normalize(title), normalize(base)]);
}
const oneOf = (titles, aliases) => aliases.some((alias) => titles.has(alias));
const mentions = (text, pattern) => pattern.test(text);

const SUNNY_TITLES = ["晴天", "sunny day", "晴天 sunny day", "sunny day 晴天"];
const SUNNY_VARIANTS = [
  ["sunny-chords", ["chord arrangement", "chords arrangement", "chord version", "和弦版", "和弦改编版", "和弦改編版"]],
  ["sunny-concert", ["concert arrangement", "concert version", "concert edition", "演奏版", "音乐会版", "音樂會版"]],
];
const isSunny = (id) => ["sunny-day", "sunny-chords", "sunny-concert"].includes(id);
function sunnyTitle(titles, full) {
  for (const [id, suffixes] of SUNNY_VARIANTS) {
    if (SUNNY_TITLES.some((title) => suffixes.some((suffix) =>
      full === `${title} ${suffix}` ||
      // Chinese edition labels are commonly appended without a separator.
      (/[^\x00-\x7f]/.test(suffix) && full === `${title}${suffix}`)))) return id;
  }
  return oneOf(titles, SUNNY_TITLES) ? "sunny-day" : null;
}

export function resolveScoreArtwork(piece = {}) {
  if (!piece || typeof piece !== "object") return NEUTRAL_SCORE_ARTWORK;
  // A saved edition's identity is stronger than later cosmetic title edits.
  const known = KNOWN_SCORES.get(piece.id);
  if (known) return SCORE_ARTWORK[known];
  const original = KNOWN_SCORES.get(piece.originalId);
  const titles = titlesFor(piece);
  const composer = normalize(piece.composer);
  const full = normalize(piece.title);
  const chou = mentions(composer, /\bjay chou\b|周杰伦|周杰倫/);
  const gem = mentions(`${composer} ${full}`, /\bg e m\b|\bgem\b|邓紫棋|鄧紫棋/);
  const beethoven = mentions(composer, /\bbeethoven\b|贝多芬|貝多芬/);
  const sunny = sunnyTitle(titles, full);
  // A new arrangement can retain the original PDF ID. Refine that origin
  // only for an explicitly titled Sunny Day edition; arbitrary "concert"
  // prose, descriptions and another work's title cannot change its cover.
  if (isSunny(original) && sunny && sunny !== "sunny-day" && (!composer || chou))
    return SCORE_ARTWORK[sunny];
  if (original) return SCORE_ARTWORK[original];

  if (oneOf(titles, ["appassionata", "热情奏鸣曲", "熱情奏鳴曲", "热情钢琴奏鸣曲", "熱情鋼琴奏鳴曲"]))
    return SCORE_ARTWORK.appassionata;
  if (chou && sunny) return SCORE_ARTWORK[sunny];
  if ((chou || gem) && oneOf(titles, ["龙卷风", "龍捲風", "龙卷风 tornado", "龍捲風 tornado", "tornado"]))
    return SCORE_ARTWORK.tornado;
  if (oneOf(titles, ["你离开的事实", "你離開的事實", "the truth that you leave", "你离开的事实 the truth that you leave", "你離開的事實 the truth that you leave"]))
    return SCORE_ARTWORK.truth;
  if (oneOf(titles, ["moonlight sonata", "月光奏鸣曲", "月光奏鳴曲", "moonlight sonata 月光奏鸣曲", "moonlight sonata 月光奏鳴曲"]))
    return SCORE_ARTWORK.moonlight;
  if (oneOf(titles, ["gymnopedie no 1", "gymnopedie 1", "gymnopedie n 1", "gymnopedie numero 1"]))
    return SCORE_ARTWORK.gymnopedie;
  if (oneOf(titles, ["prelude in c major bwv 846", "prelude no 1 in c major bwv 846", "bwv 846", "bwv846"]) ||
      (mentions(composer, /\bbach\b|巴赫|巴哈/) && oneOf(titles, ["prelude in c major", "prelude no 1 in c major", "c大调前奏曲", "c大調前奏曲"])))
    return SCORE_ARTWORK["bach-prelude"];
  if ((!composer || mentions(composer, /\btraditional\b|\bmozart\b|传统|傳統|民谣|民謠|民歌/)) &&
      oneOf(titles, ["twinkle little star", "twinkle twinkle little star", "小星星", "一闪一闪小星星", "一閃一閃小星星"]))
    return SCORE_ARTWORK.twinkle;
  if (beethoven && oneOf(titles, ["ode to joy", "欢乐颂", "歡樂頌"]))
    return SCORE_ARTWORK["ode-joy"];
  if (beethoven && oneOf(titles, ["fur elise", "fuer elise", "致爱丽丝", "致愛麗絲", "献给爱丽丝", "獻給愛麗絲"]))
    return SCORE_ARTWORK["fur-elise"];
  if (oneOf(titles, ["your first c major scale", "start here c major melody"]) ||
      (mentions(composer, /\bluma\b/) && oneOf(titles, ["c major scale", "c major melody"])))
    return SCORE_ARTWORK["first-steps"];
  return NEUTRAL_SCORE_ARTWORK;
}

// Retained for the current component and its data-scene integration.
export function scoreArtworkScene(piece) {
  return resolveScoreArtwork(piece).id;
}
