// Local, deterministic command planning. This module only describes actions;
// it cannot run code, access files, change settings, or start playback.
const normal = (value) => String(value ?? "")
  .normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
  .replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const compact = (value) => normal(value).replace(/\s+/g, "");
const barsIn = (piece) => Number.isInteger(piece?.measures) && piece.measures > 0 ? piece.measures : 0;
const own = (object, key) => object && Object.hasOwn(object, key) ? object[key] : null;
const practiceFor = (piece, journal) => own(journal?.pieces, piece?.id) || null;
const practiced = (practice) => Boolean(practice && (
  practice.sessions > 0 || practice.minutes > 0 || practice.ranges?.length > 0
));
const lastTime = (practice) => Date.parse(practice?.last) || 0;
const titleOf = (piece) => piece?.title || "Untitled score";
const result = (message, actions = [], intent = "command", extra = {}) => ({ message, actions, intent, ...extra });

function available(pieces) {
  const ids = new Set();
  return (Array.isArray(pieces) ? pieces : []).filter((piece) => {
    if (!piece || typeof piece.id !== "string" || !piece.id || typeof piece.title !== "string" || ids.has(piece.id)) return false;
    ids.add(piece.id);
    return true;
  });
}

// The same words in the library's two languages: work names, form names,
// edition words and composers. A piece's search text gains the other
// language's words, so “月光”, “巴赫”, “音乐会版” or “tornado” find whatever the
// library itself calls that piece. Dictionary words only, never the
// learner's particular titles.
const WORD_ALIASES = [
  ["moonlight", ["月光", "月光奏鸣曲", "月光奏鳴曲"]], ["appassionata", ["热情", "熱情", "热情奏鸣曲", "熱情奏鳴曲"]],
  ["pathetique", ["悲怆", "悲愴"]], ["waldstein", ["黎明", "华伦斯坦", "華倫斯坦"]], ["elise", ["爱丽丝", "愛麗絲"]],
  ["gymnopedie", ["吉诺佩蒂", "金诺佩蒂", "吉诺佩第", "吉諾佩蒂", "金諾佩蒂", "裸体舞曲", "裸體舞曲"]],
  ["well tempered", ["平均律"]], ["turkish", ["土耳其"]], ["twinkle", ["小星星"]], ["ode to joy", ["欢乐颂", "歡樂頌"]],
  ["sunny day", ["晴天"]], ["tornado", ["龙卷风", "龍捲風"]], ["canon", ["卡农", "卡農"]], ["clair de lune", ["月光曲"]],
  ["prelude", ["前奏曲"]], ["sonata", ["奏鸣曲", "奏鳴曲"]], ["sonatina", ["小奏鸣曲", "小奏鳴曲"]], ["nocturne", ["夜曲"]],
  ["waltz", ["圆舞曲", "圓舞曲"]], ["minuet", ["小步舞曲"]], ["etude", ["练习曲", "練習曲"]], ["march", ["进行曲", "進行曲"]],
  ["fugue", ["赋格", "賦格"]], ["rhapsody", ["狂想曲"]], ["scale", ["音阶", "音階"]], ["melody", ["旋律"]],
  ["concert", ["音乐会", "音樂會", "演奏会", "演奏會"]], ["chord", ["和弦"]], ["easy", ["简易", "簡易", "简单", "簡單"]],
  ["beethoven", ["贝多芬", "貝多芬"]], ["mozart", ["莫扎特"]], ["bach", ["巴赫"]], ["chopin", ["肖邦", "蕭邦"]],
  ["satie", ["萨蒂", "薩蒂"]], ["liszt", ["李斯特"]], ["debussy", ["德彪西"]], ["schubert", ["舒伯特"]], ["schumann", ["舒曼"]],
  ["haydn", ["海顿", "海頓"]], ["tchaikovsky", ["柴可夫斯基"]], ["brahms", ["勃拉姆斯"]], ["rachmaninoff", ["拉赫玛尼诺夫"]],
  ["hisaishi", ["久石让", "久石讓"]], ["clementi", ["克莱门蒂"]], ["czerny", ["车尔尼", "車爾尼"]], ["grieg", ["格里格"]],
  ["ravel", ["拉威尔"]], ["pachelbel", ["帕赫贝尔"]], ["handel", ["亨德尔"]], ["vivaldi", ["维瓦尔第"]], ["mendelssohn", ["门德尔松"]],
  ["jay chou", ["周杰伦", "周杰倫", "杰伦", "杰倫", "周董"]], ["g e m", ["邓紫棋", "鄧紫棋"]], ["pianoboy", ["高至豪"]],
];
const COMPOSER_KEYS = new Set(["beethoven", "mozart", "bach", "chopin", "satie", "liszt", "debussy", "schubert", "schumann", "haydn", "tchaikovsky", "brahms", "rachmaninoff", "hisaishi", "clementi", "czerny", "grieg", "ravel", "pachelbel", "handel", "vivaldi", "mendelssohn", "jay chou", "g e m", "pianoboy"]);
/** A composer's names in both languages (“Bach”, “巴赫”), from the library's
 * composer text; empty when the composer is not a known one. */
export function composerNames(composer) {
  const first = normal(String(composer || "").split(/\s+[·•]\s+/)[0]);
  const names = new Set();
  for (const [english, chinese] of WORD_ALIASES)
    if (COMPOSER_KEYS.has(english) && (new RegExp(`(?:^|\\s)${english}(?=\\s|$)`).test(first) || chinese.some((c) => first.includes(c)))) {
      if (english !== "g e m") names.add(english.replace(/\b\p{L}/gu, (c) => c.toUpperCase()));
      chinese.slice(0, 2).forEach((c) => names.add(c));
    }
  return [...names];
}
// Words in a typed title that do not pick one piece: “the Satie one”, “this
// arrangement”, “晴天那个音乐会版本”.
const QUERY_FILLER = new Set([
  "the", "a", "an", "my", "your", "our", "this", "that", "these", "those", "it", "its", "one", "ones", "piece", "pieces",
  "song", "songs", "tune", "music", "score", "sheet", "version", "edition", "arrangement", "arr", "movement", "mvt", "mov",
  "thing", "stuff", "please", "again", "now", "then", "lol", "in", "on", "of", "for", "to", "at", "by", "from", "with",
  "and", "or", "no", "op", "nr", "number", "i", "ii", "iii", "iv", "me", "current", "same", "whole", "called", "named",
  "titled", "so", "far", "yet", "there", "here", "open", "opened", "today", "last", "time", "work", "works",
]);
const ZH_QUERY_FILLER = /这一?首|這一?首|那一?首|这个|這個|那个|那個|这份|這份|那份|这部|這部|那部|当前的?|當前的?|现在的?|現在的?|曲子|歌曲|乐谱|樂譜|谱子|譜子|钢琴曲|鋼琴曲|改编|改編|编曲|編曲|版本|版|首|的/g;
const DEMONSTRATIVE = /\b(?:this|that|current|the same)\b|这|這|当前|當前|现在|現在/;
const expandWords = (text) => {
  const extra = [];
  for (const [english, chinese] of WORD_ALIASES) {
    if (new RegExp(`(?:^|\\s)${english}(?=\\s|$)`).test(text)) extra.push(...chinese);
    else if (chinese.some((word) => text.includes(word))) extra.push(english);
  }
  return extra.length ? `${text} ${extra.join(" ")}` : text;
};
/** A piece's title and composer in both languages, for matching. */
const searchText = (piece) => expandWords(`${normal(piece.title)} ${normal(piece.composer)}`);
// A short Latin word (“k”, “no”, “c”) must be a whole word: “k” is not
// inside “Allegro ma non troppo”'s every k.
const contains = (hay, token) => /^[a-z0-9]{1,2}$/.test(token)
  ? new RegExp(`(?:^|\\s)${token}(?=\\s|$)`).test(hay)
  : hay.includes(token) || (/\p{Script=Han}/u.test(token) && compact(hay).includes(token));
/** The words of a typed title that can pick a piece, in the library's terms. */
function queryTokens(query) {
  const text = normal(String(query ?? "").slice(0, 500).replace(ZH_QUERY_FILLER, " "));
  return text.split(/\s+/).filter((token) => token && !QUERY_FILLER.has(token));
}
/** True when a typed reference names no piece at all: “this one”, “这首”. */
export function fillerOnlyReference(query) {
  return Boolean(String(query ?? "").trim()) && !queryTokens(query).length;
}
/** Title and composer search; accents, punctuation, case, filler words and
 * the other language's names are ignored. */
export function searchMaestroPieces(query, pieces = [], journal = {}) {
  const found = searchTitles(query, pieces, journal);
  if (found.length || !queryTokens(query).length) return found;
  // Filler that is part of the title itself (“Song Without Words”) and a
  // Chinese name of a work the library spells in English.
  return searchTitles(query, pieces, journal, false);
}
function searchTitles(query, pieces, journal, dropFiller = true) {
  const raw = normal(String(query ?? "").slice(0, 500)).replace(/的/g, " ").trim();
  const tokens = dropFiller ? queryTokens(query) : raw.split(/\s+/).filter(Boolean);
  const needle = dropFiller ? tokens.join(" ") : raw;
  const packed = compact(needle);
  if (String(query ?? "").trim() && !needle) return [];
  return available(pieces).map((piece) => {
    const title = normal(piece.title);
    const all = searchText(piece);
    let match = 0;
    if (!needle) match = 1;
    else if (title === needle || title === raw) match = 100;
    else if (compact(title) === packed || compact(title) === compact(raw)) match = 95;
    else if (packed.length >= 3 && title.includes(needle)) match = 90;
    else if (tokens.every((token) => contains(title, token))) match = 80;
    else if (tokens.every((token) => contains(all, token))) match = 70;
    else if (packed.length >= 3 && compact(all).includes(packed)) match = 60;
    return { piece, practice: practiceFor(piece, journal), match };
  }).filter((entry) => entry.match > 0).sort((a, b) =>
    b.match - a.match || lastTime(b.practice) - lastTime(a.practice) ||
    titleOf(a.piece).localeCompare(titleOf(b.piece), "en") || a.piece.id.localeCompare(b.piece.id, "en")
  );
}
// Famous works a learner may name that a library often lacks: naming one is
// a real title, not stray words around a question.
const FAMOUS_WORKS = /f[uü]r elise|elise|canon in d|pachelbel|clair de lune|turkish march|alla turca|river flows|comptine|liebestraum|campanella|bumblebee|kiss the rain|nocturne|waltz|etude|[ée]tude|rhapsody|concerto|symphony|fugue|minuet|sonatina|sonata|prelude|invention|mazurka|polonaise|ballade|impromptu|berceuse|gavotte|toccata|致爱丽丝|献给爱丽丝|卡农|月光曲|土耳其|你的心河|梦中的婚礼|夢中的婚禮|天空之城|菊次郎|野蜂飞舞|狂想曲|夜曲|圆舞曲|圓舞曲|练习曲|練習曲|前奏曲|奏鸣曲|奏鳴曲|协奏曲|協奏曲|交响曲|交響曲|小步舞曲|变奏曲|變奏曲|组曲|組曲|进行曲|進行曲/i;
/** A leftover that reads as a title the learner typed on purpose: quoted,
 * framed (“the piece called …”), a known work or form name, or capitalised
 * Latin words. Stray words (“忘了”, “lol”) are not. */
function titleLike(query, framed = false) {
  const text = String(query ?? "").trim();
  if (!queryTokens(text).length) return false;
  if (framed || /^[“"《「『'].+[”"》」』']$/.test(text) || FAMOUS_WORKS.test(text)) return true;
  return /(?:^|\s)\p{Lu}[\p{Ll}\p{M}]+/u.test(text) && /\p{Script=Latin}{3,}/u.test(text);
}
/**
 * What a typed piece reference points at:
 *   { kind: "matches", matches }  library pieces it names,
 *   { kind: "current" }           the open piece (“this one”, its composer,
 *                                 words that only describe it, or stray words),
 *   { kind: "missing", title }    a real title the library does not have.
 */
export function resolveMaestroPiece(query, context = {}, { framed = false } = {}) {
  const text = String(query ?? "").trim();
  if (!text || fillerOnlyReference(text)) return { kind: "current" };
  const current = context.currentScore;
  const matches = searchMaestroPieces(text, context.pieces, context.journal);
  if (matches.length) {
    // “this Beethoven piece”, “这首巴赫”: a demonstrative keeps the open
    // piece when it is one of the matches.
    const open = current && matches.find((m) => m.piece.id === current.id);
    if (open && matches.length > 1 && DEMONSTRATIVE.test(text)) return { kind: "current", matches: [open] };
    return { kind: "matches", matches };
  }
  if (current && queryTokens(text).every((token) => contains(searchText(current), token))) return { kind: "current" };
  return titleLike(text, framed) ? { kind: "missing", title: text } : { kind: "current", unresolved: text };
}
/** Library pieces a free-text message names by a distinctive word of their
 * title, a common name of the work or their composer: “is the gymnopedie
 * harder than the bach prelude?” names two. At most `limit`, best first. */
export function mentionedMaestroPieces(message, pieces = [], { limit = 3 } = {}) {
  const text = expandWords(normal(String(message ?? "").slice(0, 2000)));
  const own = available(pieces).filter((p) => p.source !== "Lesson" && !p.exercise);
  const said = (key) => /\p{Script=Han}/u.test(key) ? text.includes(key) : new RegExp(`(?:^|\\s)${key}(?=\\s|$)`).test(text);
  // Each key is a group of synonyms (“moonlight”, “月光”), counted once.
  const groupsOf = (piece) => {
    const title = normal(piece.title), composer = normal(String(piece.composer || "").split(/\s+[·•]\s+/)[0]);
    const groups = [];
    const aliased = new Set();
    for (const [english, chinese] of WORD_ALIASES)
      if (!MENTION_STOP.has(english) && (new RegExp(`(?:^|\\s)${english}(?=\\s|$)`).test(`${title} ${composer}`) || chinese.some((w) => `${title}${composer}`.includes(w)))) {
        groups.push([english, ...chinese]);
        [english, ...english.split(" "), ...chinese].forEach((w) => aliased.add(w));
      }
    for (const word of `${title} ${composer}`.split(/\s+/))
      if (!aliased.has(word) && ((/^\p{Script=Latin}{4,}$/u.test(word) && !MENTION_STOP.has(word)) || /^\d{3,}$/.test(word))) groups.push([word]);
    for (const run of `${piece.title} ${String(piece.composer || "").split(/\s+[·•]\s+/)[0]}`.match(/\p{Script=Han}{2,}/gu) || [])
      if (![...aliased].some((w) => /\p{Script=Han}/u.test(w) && run.includes(w))) groups.push([run]);
    return groups;
  };
  const work = (piece) => normal(String(piece.title).split(/\s*(?:·|•|\(|（|—|–|\s-\s)\s*/u)[0]);
  const families = new Map();
  for (const piece of own) {
    const hits = groupsOf(piece).filter((group) => group.some(said)).length;
    if (!hits) continue;
    // Edition words (“concert”, “和弦”) never name a piece alone, but they
    // tell the editions of one work apart.
    const edition = EDITION_WORDS.some((word) => contains(searchText(piece), word) && said(word)) ? 0.5 : 0;
    const key = work(piece);
    if (!families.has(key)) families.set(key, []);
    families.get(key).push({ piece, score: hits + edition });
  }
  // Within one work the best-named editions; different works all count.
  let found = [...families.values()].flatMap((family) => {
    const best = Math.max(...family.map((f) => f.score));
    return family.filter((f) => f.score === best);
  });
  // “周杰伦的晴天”: the composer alone does not name his other songs.
  if (found.length > limit) {
    const top = Math.max(...found.map((f) => f.score));
    found = found.filter((f) => f.score === top);
  }
  // A word many pieces share (the composer of four songs) names none of them.
  return found.length > limit ? [] : found.sort((a, b) => b.score - a.score).map((f) => f.piece);
}
const EDITION_WORDS = ["concert", "chord", "easy", "音乐会", "音樂會", "演奏会", "和弦", "简易", "简单"];
// Title words too common to name a piece in a sentence.
const MENTION_STOP = new Set([
  "major", "minor", "piano", "sonata", "arrangement", "version", "edition", "chord", "concert", "melody", "start", "here",
  "keys", "luma", "first", "notes", "your", "that", "this", "with", "from", "leave", "truth", "allegro", "adagio", "presto",
  "andante", "sostenuto", "troppo", "everyonepiano", "mutopia", "public", "domain", "complete", "scale", "easy", "march",
  "prelude in", "johann", "ludwig", "sebastian", "erik", "wolfgang", "amadeus", "frederic", "franz", "claude", "pyotr",
  "chou", "sunny", "movement", "opus", "number", "song", "songs", "tune", "music", "score", "little", "star",
]);

/** A saved position is practice history, not just a saved passage bookmark. */
export function resumeMaestroPiece(piece, journal = {}) {
  if (!piece) return null;
  const practice = practiceFor(piece, journal);
  const hasPractice = practiced(practice);
  const count = barsIn(piece);
  const saved = Number.isFinite(practice?.bar) ? Math.trunc(practice.bar) : 1;
  return { piece, practice, hasPractice, bar: hasPractice ? Math.max(1, Math.min(count || 1, saved)) : 1 };
}

export function latestMaestroPractice(pieces = [], journal = {}) {
  return available(pieces).map((piece) => resumeMaestroPiece(piece, journal))
    .filter((entry) => entry.hasPractice)
    .sort((a, b) => lastTime(b.practice) - lastTime(a.practice) || a.piece.id.localeCompare(b.piece.id, "en"))[0] || null;
}

const ENGLISH_NUMBERS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const ENGLISH_TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
function englishNumber(text) {
  if (ENGLISH_NUMBERS.includes(text)) return ENGLISH_NUMBERS.indexOf(text);
  const hundred = text.match(/^(?:a |one )?hundred(?:\s+(?:and\s+)?(.+))?$/);
  if (hundred) return hundred[1] ? 100 + englishNumber(hundred[1]) : 100;
  const tens = text.match(/^(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\s-]+(one|two|three|four|five|six|seven|eight|nine))?$/);
  return tens ? ENGLISH_TENS[tens[1]] + (tens[2] ? ENGLISH_NUMBERS.indexOf(tens[2]) : 0) : NaN;
}
function number(value) {
  const text = String(value).trim().toLowerCase().replace(/^百分之/, "");
  if (/^\d+$/.test(text)) return Number(text);
  if (/^[a-z][a-z\s-]*$/.test(text)) return englishNumber(text.replace(/\s+/g, " "));
  if (!/^[零〇一二两兩三四五六七八九十百千]+$/.test(text)) return NaN;
  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (!/[十百千]/.test(text)) return Number([...text].map((char) => digits[char]).join(""));
  let sum = 0, digit = 0, lastUnit = Infinity;
  for (const char of text) {
    const unit = { 十: 10, 百: 100, 千: 1000 }[char];
    if (unit) {
      if (unit >= lastUnit) return NaN;
      sum += (digit || 1) * unit;
      digit = 0;
      lastUnit = unit;
    } else digit = digits[char];
  }
  return sum + digit;
}

// Politeness, interjections and soft particles around a command are not part
// of it: “could you please slow it down?”, “ok, let's take it from the top”,
// “可以慢一点吗”, “那就从头开始吧”. “呢” stays: “左手呢？” asks about the left
// hand, it does not select it. “Right” is never an interjection here: it
// starts “right hand”.
// Greetings, fillers and forms of address before a request are not part of
// it either: “yo where'd I stop”, “hey Mozart, slower”, “老师，慢一点”, “嗯那个…”.
const COMPANION_NAMES = "beethoven|mozart|liszt|lang\\s*lang|langlang|luma|mochi|maestro|teacher|sir|coach|buddy";
const ZH_COMPANION_NAMES = "贝多芬|貝多芬|莫扎特|李斯特|郎朗|露玛|露瑪|麻薯";
const FILLER_EN = "(?:ok(?:ay)?|okie|okey|kk|k|cool|nice|great|awesome|perfect|sweet|neat|wow|whoa|omg|ugh|gosh|alright|all right|aight|so|well|now|and|then|also|anyway|anyways|btw|actually|honestly|hmm*|hm+|um+|uh+|erm*|er|oh+|ah+|welp|yo|hey|hi|hello|hiya|oi|bro|dude|lol|lmao|haha+|hah|yes|yeah|yep|yup|sure)(?=[\\s,，.!！:]|$)[\\s,，.!！:]*";
const VOCATIVE_EN = `(?:(?:hey|yo|hi|hello|ok(?:ay)?|so|dear)\\s+)?(?:mr\\.?\\s+)?(?:${COMPANION_NAMES})\\s*(?:[,，:：!！]+\\s*|\\s+(?=(?:where|what|which|can|could|please|let|loop|repeat|go|jump|skip|slow|speed|play|open|find|show|take|bring|set|switch|use|just|only|left|right|both|resume|continue|teach)\\b))`;
const FRAME_EN = "(?:(?:can|could|would|will) you(?:\\s+please)?|(?:can|could|shall|should|may) we|how about we|why don'?t we|i (?:want|would like|'d like|wanna|need) to|i'?d like to|let'?s|let us|we should|maybe we (?:could|should|can)|please)\\s+";
const VOCATIVE_ZH = `(?:(?:${ZH_COMPANION_NAMES})(?:老师|老師|大师|大師|先生)?(?=[，,：:！!、\\s]|老师|老師)|老师|老師|大师|大師)[\\s，,：:！!、]*`;
const POLITE_ZH = "(?:请问|請問|请你?|請你?|麻烦(?:你)?|麻煩(?:你)?|幫我|帮我|能不能|能否|可不可以|可以|那就|那么|那麼)[\\s,，]*";
const FILLER_ZH = "(?:好的|好吧|嗯+|噢|哦|哎呀|哎哟|哎|唉|诶|欸|嘿|喂|哈喽|嗨|哈哈+|呃|额|那个|那個|对了|對了|话说|話說)[\\s,，、！!]*|好[\\s,，]+";
const LEAD_IN = new RegExp(`^(?:${FILLER_EN}|${VOCATIVE_EN}|${FRAME_EN}|${VOCATIVE_ZH}|${POLITE_ZH}|${FILLER_ZH})+`, "i");
// Only what never carries meaning (greetings, fillers, forms of address):
// “shall we”, “帮我” and “can you” stay for planners that read them.
const LEAD_IN_LIGHT = new RegExp(`^(?:${FILLER_EN}|${VOCATIVE_EN}|${VOCATIVE_ZH}|${FILLER_ZH})+`, "i");
// Courtesies and fillers after it: “loop 150 through 152 for me”, “open
// the Bach then”, “left hand pls lol”, “慢一点吧谢谢”.
const TAIL = /(?:(?<!\bwait)[,，]?\s+for (?:me|us)|[,，]?\s+(?:please|for now|for a bit|for a while|for a sec|for a second|this time|thanks|thank you|real quick|quickly|right now|now|then|lol|lmao|haha+|if you can|if you could|if possible|ok(?:ay)?|yeah|thx|ty|mate|bro|dude)|\s*[\p{Extended_Pictographic}\u{FE0F}‍]+|(?:谢谢|謝謝|好吗|好嗎|好不好|行吗|行嗎|可以吗|可以嗎|一下吧|吧|呗|唄|吗|嗎|呀|啊|啦|哦|喔|嘛|哈))+$/iu;
// Everyday spellings of the same words: “waaay”, “lemme”, “pls”, “lefty”.
const SLANG = [
  [/\blemme\b/gi, "let me"], [/\bgimme\b/gi, "give me"], [/\bwanna\b/gi, "want to"], [/\bgonna\b/gi, "going to"],
  [/\bgotta\b/gi, "got to"], [/\bkinda\b/gi, "kind of"], [/\bsorta\b/gi, "sort of"], [/\bdunno\b/gi, "don't know"],
  [/\b(?:pls|plz|plez|pleez|plis)\b/gi, "please"], [/\b(?:thx|thnx|tnx)\b/gi, "thanks"], [/\bu\b/gi, "you"], [/\bur\b/gi, "your"],
  [/\brn\b/gi, "right now"], [/\btho\b/gi, "though"], [/\b(?:wher|whre|wehre|whr)\b/gi, "where"], [/\bwat\b/gi, "what"],
  [/\bteh\b/gi, "the"], [/\b(?:smth|sth|somethin)\b/gi, "something"], [/\babt\b/gi, "about"], [/\b(?:cuz|coz)\b/gi, "because"],
  [/\blefty\b|\blefthand\b|\bleft-hand\b/gi, "left hand"], [/\brighty\b|\brighthand\b|\bright-hand\b/gi, "right hand"],
  [/\bthru\b/gi, "through"],
];
/** The same request with everyday spellings evened out. Text only: no word
 * is guessed, and anything it does not know stays as typed. */
export function normalizeRequestText(value) {
  let text = String(value ?? "").slice(0, 2000).normalize("NFKC").replace(/[’‘]/g, "'");
  // “waaay”, “slooow”, “pleeease”; “iii” stays a movement number.
  text = text.replace(/([a-hj-z])\1{2,}/gi, "$1");
  for (const [pattern, replacement] of SLANG) text = text.replace(pattern, replacement);
  // 小结 (a summary) typed for 小节 (a bar) next to a bar number.
  // “做个小结” (make a summary) stays.
  text = text.replace(/(?<=[\d零〇一二两兩三四五六七八九十百第几幾这這那上下每]|[\d零〇一二两兩三四五六七八九十百几幾这這那每][个個])\s*小(?:结|結)/g, "小节");
  return text;
}
/** The request without greetings, fillers, forms of address and courtesies
 * around it. Never empty when the input was not: a lone “ok” stays “ok”. */
export function stripRequestFrame(value, { light = false } = {}) {
  const text = String(value ?? "").trim();
  let out = text.replace(/[.!?。？！~～…\s]+$/gu, "");
  for (let i = 0; i < 4; i++) {
    const next = out.replace(light ? LEAD_IN_LIGHT : LEAD_IN, "").replace(TAIL, "").replace(/[.!?。？！~～…,，\s]+$/gu, "").trim();
    if (next === out) break;
    out = next;
  }
  return out || text.replace(/[.!?。？！~～…]+$/gu, "").trim();
}
const cleanRequest = (text) => stripRequestFrame(normalizeRequestText(String(text ?? "").slice(0, 500)));
// The same request, lower-cased with punctuation as spaces but “%” kept.
const loose = (request) => request.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
  .replace(/[^\p{L}\p{N}%]+/gu, " ").trim();
const LOCAL_ONLY = "Local tools do not support open-ended chat. I can find saved scores and set up practice. Try “find 晴天”, “where did I stop?”, “repeat bars 4–8” or “slower”.";

function pieceChoices(matches, journal, resume) {
  return matches.map(({ piece }) => {
    const entry = resumeMaestroPiece(piece, journal);
    const bar = resume ? entry.bar : 1;
    return { type: "open-piece", pieceId: piece.id, bar,
      label: `${resume && entry.hasPractice ? "Resume" : "Open"} ${titleOf(piece)} · bar ${bar}` };
  });
}

function choosePiece(query, context, resume = false) {
  // “the piece called …” or a quoted title: typed on purpose.
  const framed = /^(?:the\s+)?(?:piece|song|score)(?:\s+(?:called|named|titled))?\s+\S/i.test(query) || /^[“"《「『]/.test(query);
  const intent = resume ? "resume" : "search";
  let matches;
  if (resume) {
    // A resume question is about saved practice. Words that name no piece
    // (“忘了”, “this arrangement”, the open piece's composer) mean the open
    // piece; only a real title the library lacks gets the import offer.
    const ref = resolveMaestroPiece(query, context, { framed });
    if (ref.kind === "current") return resumeCurrent(context, false, true);
    if (ref.kind === "missing") {
      const fallback = resumeCurrent(context);
      const saved = fallback.actions.find((a) => a.type === "open-piece" && a.bar > 1);
      return result(
        saved
          ? `No saved piece matches “${query}”. Your latest saved place is “${titleOf(fallback.piece)}” at bar ${saved.bar}.`
          : `No saved piece matches “${query}”. Import its PDF, MusicXML or MIDI to add it.`,
        [...(saved ? [saved] : []), { type: "import-score", label: "Import a score" }], intent, { matches: [] },
      );
    }
    matches = ref.matches;
  } else {
    matches = searchMaestroPieces(query, context.pieces, context.journal);
    // Try the title intact first: “Song Without Words” may itself be the title.
    if (!matches.length) {
      const title = query.replace(/^(?:the\s+)?(?:piece|song)(?:\s+(?:called|named|titled))?\s+|^(?:the|a|an|my)\s+(?=\S)/i, "").trim();
      if (title !== query) {
        query = title;
        matches = searchMaestroPieces(query, context.pieces, context.journal);
      }
    }
  }
  if (!matches.length) return result(
    `No saved piece matches “${query}”. Import its PDF, MusicXML or MIDI to add it.`,
    [{ type: "import-score", label: "Import a score" }], intent, { matches: [] },
  );
  const actions = pieceChoices(matches, context.journal, resume);
  const entry = resumeMaestroPiece(matches[0].piece, context.journal);
  // Several editions: their saved places, so the choice is informed.
  const places = resume && matches.length > 1
    ? ` Saved places: ${matches.slice(0, 4).map(({ piece }) => {
      const saved = resumeMaestroPiece(piece, context.journal);
      return `“${titleOf(piece)}” ${saved.hasPractice ? `bar ${saved.bar}` : "not practised yet"}`;
    }).join("; ")}.`
    : "";
  return result(matches.length > 1
    ? `${matches.length} saved pieces match. Choose a version below.${places}`
    : resume && !entry.hasPractice
      ? noPlaceYet(entry.piece, context)
      : resume
        ? `“${titleOf(entry.piece)}” was last practiced at bar ${entry.bar}.`
        : `Found “${titleOf(entry.piece)}” in your library.`,
  resume && matches.length === 1 && !entry.hasPractice ? [...actions, ...latestElsewhere(entry.piece, context).actions] : actions,
  intent, { matches });
}
/** The most recent saved place in another piece, as a sentence and a button. */
function latestElsewhere(piece, context) {
  const latest = latestMaestroPractice(context.pieces, context.journal);
  if (!latest || latest.piece.id === piece?.id) return { text: "", actions: [] };
  return {
    text: ` Your most recent saved place is “${titleOf(latest.piece)}” at bar ${latest.bar}.`,
    actions: [{ type: "open-piece", pieceId: latest.piece.id, bar: latest.bar, label: `Resume ${titleOf(latest.piece)} · bar ${latest.bar}` }],
  };
}
const noPlaceYet = (piece, context) =>
  `No saved practice position for “${titleOf(piece)}”. You can start at bar 1.${latestElsewhere(piece, context).text}`;

function resumeCurrent(context, latest = false, explicitCurrent = false) {
  let entry = latest ? null : resumeMaestroPiece(context.currentScore, context.journal);
  if (latest || (!explicitCurrent && !entry?.hasPractice)) entry = latestMaestroPractice(context.pieces, context.journal) || entry;
  if (!entry) return result("There is no saved practice position yet. Open a piece from the library.", [{ type: "navigate", view: "library", label: "Open library" }], "resume");
  const piece = entry.piece;
  const action = typeof piece.id === "string" && available(context.pieces).some((p) => p.id === piece.id)
    ? { type: "open-piece", pieceId: piece.id, bar: entry.bar, label: `${entry.hasPractice ? "Resume" : "Start"} ${titleOf(piece)} · bar ${entry.bar}` }
    : { type: "seek-bar", bar: entry.bar, label: `Go to bar ${entry.bar}` };
  // This piece has no saved place yet: say so, and where the latest one is.
  const elsewhere = entry.hasPractice ? { actions: [] } : latestElsewhere(piece, context);
  return result(entry.hasPractice
    ? `“${titleOf(piece)}” was last practiced at bar ${entry.bar}.`
    : noPlaceYet(piece, context), [action, ...elsewhere.actions], "resume", { piece });
}
/** “Where was I in X?” for a named piece, from any caller (a follow-up
 * “and moonlight?” after a resume answer). */
export function resumeMaestroQuery(query, context = {}) {
  return choosePiece(String(query ?? "").trim(), context, true);
}
/** “find X” for a named piece, from any caller. */
export function findMaestroQuery(query, context = {}) {
  return choosePiece(String(query ?? "").trim(), context, false);
}

// Pronouns, time words and particles around a Chinese resume question are
// not a title: “我上次练到哪里了” asks about the saved place, not a piece “我”.
const ZH_RESUME_FILLER = /^(?:我们|我們|咱们|咱們|咱|我|你|的|这首曲子|這首曲子|这首歌|這首歌|这首|這首|这个|這個|这份乐谱|這份樂譜|当前|當前|现在|現在|上一次|上次|上回|之前|刚才|剛才|最后|最後|昨天|今天|最近|曲子|乐曲|樂曲|还|還|又|都|是|在|一共|总共|總共|进度|進度|位置|地方)/;
// Trailing pronouns, time words and “the progress/place”: “晴天我练到哪了”,
// “我在晴天里练到哪了”, “继续上次的进度”.
const ZH_RESUME_TAIL = /(?:的|上一次|上次|上回|之前|刚才|剛才|我们|我們|咱们|咱們|我|你|里|裡|进度|進度|位置|地方|那里|那裡)+$/;
function zhResumeQuery(value) {
  let query = String(value || "").trim(), previous;
  // “继续最近的曲子” / “上次那首”: the most recently practised piece.
  if (/^(?:我们|我們|我)?(?:最近|上次|上一次|上回)(?:的|那)?(?:曲子|那首|一首|首|练的|練的|弹的|彈的)(?:曲子)?$/.test(query)) return "最近";
  do {
    previous = query;
    query = query.replace(ZH_RESUME_FILLER, "").replace(ZH_RESUME_TAIL, "").trim();
  } while (query && query !== previous);
  return query;
}
// Sentence-final particles after a Chinese question: “上回我弹到哪儿啦？”.
const ZH_END = "(?:了)?(?:呢|啊|呀|吗|嗎|啦|哇|嘞|咯|哈|呐|喔|哦|来着|來著)*";
const ZH_WHERE = "(?:哪里|哪裡|哪儿|哪兒|哪|什么地方|什麼地方|哪个地方|哪個地方|第几小节|第幾小節|第几节|第幾節|哪一?小节|哪一?小節|哪一?段|多少小节|多少小節|哪一部分)";
// The piece is named before the question (“晴天我练到哪了”)…
const ZH_RESUME_BEFORE = [
  new RegExp(`^(.*?)(?:练|練|弹|彈|学|學|看)(?:到|至)(?:了)?${ZH_WHERE}${ZH_END}$`),
  new RegExp(`^(.*?)(?:停在|停到|停)(?:了)?${ZH_WHERE}${ZH_END}$`),
];
// … but an earlier sentence is not a title: “这首一共多少小节？我现在弹到哪了？”
// searched for “多少小节?我现在”, “这首好难。我上次练到哪了？” for “好难。”. A
// title alone before the question (“晴天，我上次练到哪了？”) still names it.
const ZH_NOT_A_TITLE = /多少|几|幾|什么|什麼|怎么|怎麼|吗|嗎|呢|好|难|難|累|有|是|很|太|真|想|要|会|會|能|可以|觉得|覺得|喜欢|喜歡/;
function zhResumeClauseQuery(before) {
  const clauses = String(before || "").split(/[。！？!?；;，,、\n]+/);
  const query = zhResumeQuery(clauses.pop());
  if (query) return query;
  while (clauses.length) {
    const previous = clauses.pop().trim();
    if (!previous) continue;
    return ZH_NOT_A_TITLE.test(previous) ? "" : zhResumeQuery(previous);
  }
  return "";
}
const ZH_RESUME = [
  // “继续练晴天”, “接着上次练”; not “继续说” (keep talking) or “继续教” (the lesson).
  /^(?:继续|繼續|接着|接著)(?!(?:说|說|讲|講|聊|教|解释|解釋|下一步|往下讲|往下講))(?:上次的?|上回的?|刚才的?|剛才的?)?(?:练习|練習|弹奏|彈奏|练|練|弹|彈)?(?:上次的?)?\s*(.*)$/,
  /^(?:从|從)(?:上次|上回|刚才|剛才|之前)(?:的地方|停下的地方|停的地方|停下来的地方|停下來的地方|那里|那裡)?(?:继续|繼續|开始|開始)(?:练|練|弹|彈)?(.*)$/,
  /^(?:带我|帶我)?(?:回到|回去|返回)(?:我)?(?:上次|上回|之前)(?:练到|練到|弹到|彈到|停下来|停下來|停下|停)?的?(?:地方|位置|小节|小節)()$/,
];
// Time phrases and pronoun clauses inside an English resume question are not a
// title: “what bar was I on last time I played this?”, “where was I yesterday
// in this one?”, “which bar did I get to when I last practised it?”.
const EN_RESUME_TIME = /\s*\b(?:(?:the\s+)?last\s+time(?:\s+(?:i|we)\s+(?:played|practi[cs]ed|was playing|were playing|was practi[cs]ing|were practi[cs]ing|worked on|opened|looked at|tried|did)(?:\s+(?:this one|that one|this piece|that piece|this song|that song|the piece|the song|it|this|that))?)?|when\s+(?:i|we)\s+(?:last\s+)?(?:played|practi[cs]ed|stopped|was playing|were playing)(?:\s+(?:this one|this piece|this song|the piece|the song|it|this|that))?(?:\s+last)?|(?:earlier\s+)?today|yesterday|(?:this|last)\s+(?:morning|afternoon|evening|night|week|session)|in\s+(?:my|our|the)\s+last\s+session|the\s+other\s+day|before|earlier|previously|so\s+far|recently)\b/gi;
const HERE_WORDS = /\b(?:it|this|this one|this piece|this song|this movement)\b/i;
/** What an English resume question names after its verb: a title, or the
 * open piece (“this one”, “the one I was playing”), or nothing. */
function enResumeQuery(value) {
  const q = String(value || "").trim().replace(/^(?:in|on|with|for|of|at)\s+/i, "").replace(/\s+(?:please|again|now)$/i, "").trim();
  if (!q) return "";
  if (/^(?:it|this|that|this one|that one|the one|this piece|that piece|the piece|this song|that song|the song|this movement|the movement|this score|the score|here|current|the current one|the current piece|current piece|my piece|the same piece|this thing)$/i.test(q)) return "this";
  // A clause (“the one I was playing”, “what I played”) points at the open piece.
  if (/\b(?:i|we|my|me|played|playing|practi[cs]ed|practi[cs]ing|was|were|am|is|are|did|do)\b/i.test(q)) return "this";
  return q;
}
/** “Where did I stop?” in its common English and Chinese forms; null otherwise. */
function resumeRequest(request) {
  let removed = "";
  const english = request
    .replace(/\bwhere'd\b/gi, "where did")
    .replace(/[?.!]+$/, "")
    .replace(EN_RESUME_TIME, (found) => {
      removed += ` ${found}`;
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();
  const where = "(?:where\\s+(?:i|we)\\s+(?:was|were|stopped|left off|left it|got to|got up to|ended up|finished)|(?:which|what)\\s+(?:bar|measure|part|spot)\\s+(?:i|we)\\s+(?:was|were|stopped|left off|got to|got up to|ended up)(?:\\s+(?:on|at|in|up to))?)";
  const saved = "(?:my|the)\\s+(?:saved|last)\\s+(?:place|position|bar|spot)";
  const stopVerb = "(?:leave off|left off|leave it|left it|leave things|left things|stop|stopped|get|got|get up to|got up to|get to|got to|come|came|end up|ended up|finish|finished|reach|reached|make it|made it)";
  const en =
    english.match(/^(?:resume|continue|pick up|carry on)(?:\s+(?:playing|practicing|practising))?(?:\s+(?:where (?:i|we) (?:left off|stopped|were)|from where (?:i|we) (?:left off|stopped)|from last time|from my saved (?:place|bar|position|spot)))?(?:\s+(?:with|on|in))?(?:\s+(.+))?$/i)
    || english.match(new RegExp(`^(?:so\\s+)?(?:where|how far)\\s+(?:did|have|had)\\s+(?:i|we)\\s+${stopVerb}(?:\\s+(?:at|to|up to))?(?:\\s+(?:in|on|with|for)\\s+(.+))?$`, "i"))
    || english.match(/^where\s+(?:was i|were we|am i|are we)(?:\s+(?:up to|at))?(?:\s+(?:in|on|with)\s+(.+))?$/i)
    // “where did I leave the concert arrangement?”: the piece as the object.
    || english.match(/^where\s+(?:did|have|had)\s+(?:i|we)\s+(?:leave|left|stop|stopped)\s+(?!off\b|it\b|things\b)(?:with\s+|in\s+|on\s+)?(.+)$/i)
    // “what bar was I on”, “which measure did I get to”, “what bar am I up to”;
    // not “what bar am I on” (the playhead on screen).
    || english.match(new RegExp(`^(?:what|which)\\s+(?:bar|measure|part|spot|section)\\s+(?:(?:was i|were we|did i|did we|have i|have we|had i|had we)(?:\\s+(?:on|at|in|up to|${stopVerb}(?:\\s+(?:at|on|in|to))?))?|(?:am i|are we)\\s+up to)(?:\\s+(?:in|on|with|for)\\s+(.+))?$`, "i"))
    || english.match(/^(?:what(?:'s| is| was)|where(?:'s| is))\s+my\s+(?:saved|last)\s+(?:place|position|bar|spot)(?:\s+(?:in|on|for)\s+(.+))?$/i)
    || english.match(/^(?:my\s+)?(?:saved|last)\s+(?:place|position|spot)$/i)
    // “remind me where I was”, “do you remember where I left off?”
    || english.match(new RegExp(`^(?:remind me|tell me|show me|do you (?:remember|know))\\s+(?:of\\s+)?(?:${where}|${saved})(?:\\s+(?:in|on|with)\\s+(.+))?$`, "i"))
    // “take me back to where I stopped”, “back to my saved spot”
    || english.match(new RegExp(`^(?:(?:take|bring|get|send)\\s+me\\s+|go\\s+)?(?:back\\s+)?to\\s+(?:${where}|${saved})(?:\\s+(?:in|on)\\s+(.+))?$`, "i"))
    || english.match(/^what\s+(?:was|were)\s+(?:i|we)\s+(?:working on|practi[cs]ing|playing|learning)(?:\s+(?:in|on)\s+(.+))?$/i);
  if (en) return { query: enResumeQuery(en[1]) || (HERE_WORDS.test(removed) ? "this" : "") };
  for (const pattern of ZH_RESUME_BEFORE) {
    const zh = request.match(pattern);
    if (zh) return { query: zhResumeClauseQuery(zh[1]) };
  }
  for (const pattern of ZH_RESUME) {
    const zh = request.match(pattern);
    if (zh) return { query: zhResumeQuery(zh[1]) };
  }
  return null;
}

// ------------------------------------------------------------ commands ---
// Each parser returns null when the text is not that kind of command, so a
// sentence that merely ends in “小节” or starts with “play” or “show me”
// reaches the conversation instead of a validation error or an import offer.

// Screen names that work alone (“progress”), and more that need a verb
// (“show me the score”, “打开乐谱”): a bare “music” is not a request.
const BARE_VIEWS = {
  library: "library", "my library": "library", "曲库": "library", "曲庫": "library", "音乐库": "library", "音樂庫": "library",
  exercises: "exercises", exercise: "exercises", "练习": "exercises", "練習": "exercises",
  progress: "progress", "my progress": "progress", "进度": "progress", "進度": "progress",
};
const VIEWS = {
  ...BARE_VIEWS,
  "sight reading": "exercises", stats: "progress", statistics: "progress", "practice history": "progress", "practice log": "progress",
  "练习记录": "progress", "練習紀錄": "progress", "练琴记录": "progress", "練琴紀錄": "progress",
  practice: "practice", "practice view": "practice", "practice screen": "practice", score: "practice", "sheet music": "practice", music: "practice",
  "练琴界面": "practice", "練琴畫面": "practice", "乐谱": "practice", "樂譜": "practice", "谱子": "practice", "譜子": "practice",
};
function navigationRequest(command) {
  const view = command
    .replace(/^(?:(?:open|show(?: me)?|go(?: back)? to|back to|take me to|switch to|bring up|view|see)\s+)(?:the\s+|my\s+)?/, "")
    .replace(/^(?:打开|打開|查看|去|进入|進入|回到|切换到|切換到|看看|看一下)(?:我的)?/, "")
    .replace(/\s+(?:page|screen|tab|view)$/, "")
    .replace(/(?:的)?(?:页面|頁面|界面|画面|畫面|页|頁)$/, "");
  if (view !== command && Object.hasOwn(VIEWS, view)) return VIEWS[view];
  return Object.hasOwn(BARE_VIEWS, command) ? BARE_VIEWS[command] : null;
}

/** “left hand only”, “just the right hand”, “只弹右手”, “右手单独练”. */
function handRequest(command) {
  const en = command
    .replace(/(?:\s+(?:please|now|for now|for a bit|for a while|again|from here|this time|instead|then|for this|for this bar|for this passage|for a sec|for a second))+$/, "")
    .match(/^(?:(?:let me|let s|i want to|i ll|i will|i d like to|i need to|i m going to|time to|we ll)\s+)?(?:(?:just\s+|only\s+)?(?:practi[cs]e|play|use|try|do|switch to|change to|go|go with|go to|work on|stick to|focus on|start with|give me)\s+)?(?:with\s+)?(?:just\s+|only\s+)?(?:the\s+|my\s+)?(?:(left|right)\s+hand(?:\s+(?:only|alone|on its own|by itself|part|separately|side))?|(left|right)\s+(?:only|alone|side|side only|part)|(lh|rh)(?:\s+only)?|(both hands(?:\s+together)?|both|hands together|two hands|together))(?:\s+(?:only|alone|part))?$/);
  if (en && (en[1] || en[2] || en[3] || en[4] !== "together" || /^(?:play|practi[cs]e|go|try|do)\b/.test(command)))
    return en[1] || en[2] || (en[3] ? (en[3] === "lh" ? "left" : "right") : "both");
  // “just the left”, “only my right”: the hand without the word “hand”.
  const bare = command.match(/^(?:(?:let me|i want to|i ll)\s+)?(?:(?:practi[cs]e|play|try|do|use)\s+)?(?:just|only)\s+(?:the\s+|my\s+)?(left|right)$/);
  if (bare) return bare[1];
  const zh = command.match(/^(?:我(?:想|要)?|我们|我們)?(?:只|单独|單獨|先|就|光|单|單|再)*(?:要|用|练|練|弹|彈|换成|換成|换|換|改成|切换到|切換到|切到|来|來)?(?:一下)?(左手|右手|双手|雙手|两手|兩手|两只手|兩隻手|左右手)(?:的)?(?:部分|声部|聲部)?(?:一起|合起来|合起來)?(?:单独|單獨)?(?:练|練|弹|彈|练习|練習|来|來)?(?:一下|一遍|就好|就行|试试|試試)?$/);
  if (!zh) return null;
  return { 左手: "left", 右手: "right" }[zh[1]] || "both";
}

const MODES = {
  listen: "listen", "listen follow": "listen", "listen and follow": "listen", "listen mode": "listen", "listen follow mode": "listen",
  "听示范": "listen", "聽示範": "listen", "示范播放": "listen", "示範播放": "listen",
  "wait for me": "wait", "wait mode": "wait", "wait for me mode": "wait", "等我": "wait", "等待模式": "wait", "等我弹对": "wait", "等我彈對": "wait", "等我模式": "wait",
  "play in time": "perform", "perform mode": "perform", "play in time mode": "perform", "节奏练习": "perform", "節奏練習": "perform", "演奏模式": "perform",
};

/** A practice mode, with or without a frame: “switch to wait for me mode”,
 * “turn on listen and follow”, “听一下示范”, “切换到等我模式”. */
function modeRequest(command) {
  if (Object.hasOwn(MODES, command)) return MODES[command];
  const en = command
    .replace(/^(?:(?:switch|change|go|turn on|put it|set it|use|start|enable|try|do|let s use|let s do)\s+(?:to\s+|into\s+|on\s+|in\s+)?)?(?:the\s+)?/, "")
    .replace(/(?:\s+(?:mode|please|now|again|instead))+$/, "")
    .trim();
  if (Object.hasOwn(MODES, en)) return MODES[en];
  const zh = command
    .replace(/^(?:我(?:想|要)?|我们|我們)?(?:切换到|切換到|换成|換成|改成|用|开启|開啟|打开|打開|进入|進入|开|開)?/, "")
    .replace(/(?:模式)$/, "")
    .replace(/一下|一遍/g, "");
  if (/^(?:听|聽)?(?:示范|示範)(?:播放)?$|^(?:听|聽)(?:一下)?(?:示范|示範)$/.test(zh)) return "listen";
  if (/^等(?:我|待)(?:弹对|彈對)?(?:再走|再继续|再繼續)?$/.test(zh)) return "wait";
  if (/^(?:节奏练习|節奏練習|演奏|跟拍)$/.test(zh)) return "perform";
  return null;
}

const ZH_NUMBER = "百分之[零〇一二两兩三四五六七八九十百]+|[零〇一二两兩三四五六七八九十百千\\d]+";
// The words that only frame a speed value: “play it at …”, “take this down
// to …”, “cut the speed in …”, “go back to …”. What is left is the value.
const SPEED_FRAME = /^(?:(?:go|switch|change|set|put|bring|turn|drop|lower|reduce|slow|cut|take|get|bump|raise|increase|play|practi[cs]e|try|do|run|keep|make|have|use|move)\s+)?(?:(?:it|this|that|things|everything|the (?:piece|passage|bar|loop|song|music|section|speed|tempo|playback)|this (?:bar|passage|part|piece|song|one|section|loop))\s+)?(?:(?:back|down|up|all the way|right)\s+)*(?:(?:to|at|in|on|with)\s+)?(?:a\s+)?/;
const speedCore = (t) => t.replace(SPEED_FRAME, "")
  // “like 50”, “around seventy”: a hedge before the value.
  .replace(/^(?:(?:like|around|about|roughly|approximately|maybe|say|something like|somewhere around|just)\s+)+/, "")
  .replace(/(?:\s+(?:please|now|again|instead|for (?:now|a bit|a while|me|this)|this time|from here|or so|ish))+$/, "").trim();
const ENGLISH_VALUE = /\b(?:(?:a|one)\s+hundred(?:\s+(?:and\s+)?(?:five|ten|fifteen|twenty(?:[\s-]five)?))?|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\s-](?:one|two|three|four|five|six|seven|eight|nine))?)\b/g;
/** “slow it way down, like 50”, “bring it to around 70 please”, “速度大概六十”:
 * a speed word and exactly one value, in a request rather than a question
 * or a statement. { pct }, a bigger { step }, or null. */
function looseSpeed(request) {
  const t = loose(request);
  const zhText = String(request);
  // “bring it down to 65” names no speed word, but only speed takes a value.
  if (!/\b(?:slow(?:er|ly)?|speed|tempo|pace|fast(?:er)?)\b|\b(?:down|up)\s+to\b|速度|放慢|调慢|調慢|加快|调快|調快|慢|快/.test(t)) return null;
  // Bars, beats, BPM, counts and time are other numbers; questions,
  // negations and statements (“this is slow”) are not requests.
  if (/\b(?:bars?|measures?|beats?|bpm|minutes?|mins?|seconds?|secs?|times?|notes?|fingers?|hands?|days?|weeks?|hours?|volume|loud(?:er)?|quiet(?:er)?|soft(?:er)?|octaves?)\b|小节|小節|拍|分钟|分鐘|遍|次|天|周|週|小时|小時|节拍器|節拍器/.test(t)) return null;
  if (/^(?:why|how|what|when|where|which|is|are|was|were|does|do|did|should|would|will|can it|could it|isn t|wasn t|i think|it s|this is|that s)\b|为什么|為什麼|是不是|会不会|會不會|怎么|怎麼|吗$|嗎$|太慢|太快/.test(t)) return null;
  if (/\b(?:don t|do not|not|never|no need|stop|too)\b|不要|别|別|不用|不想/.test(t)) return null;
  const values = [
    ...[...t.matchAll(/(?<![\d.])(\d{1,3})(?![\d.])/g)].map((m) => Number(m[1])),
    ...[...t.matchAll(ENGLISH_VALUE)].map((m) => number(m[0].replace(/-/g, " "))),
    ...[...zhText.matchAll(/[零〇一二两兩三四五六七八九十百]+(?!点|點|些|下|会|會|半)/g)].map((m) => number(m[0])).filter((n) => n >= 10),
  ].filter(Number.isFinite);
  // “tempo 70” is often a metronome mark (BPM), not a percentage.
  if (values.length === 1 && values[0] >= 10 && !(/\btempo\b/.test(t) && !/%/.test(t))) return { pct: values[0] };
  if (values.length) return null;
  // No value: an intensified request (“slow it waaay down”, “much faster”).
  const more = /\b(?:way|much|a lot|lots|loads|a bunch|really)\b/.test(t) ? 2 : 1;
  if (/^(?:slow|go|take|bring|make|turn|play|get|keep)\b.*\b(?:down|slower)\b|^(?:way|much|a lot|even|really)\s+slower\b/.test(t)) return { step: -more };
  if (/^(?:speed|go|take|bring|make|turn|play|get|pick)\b.*\b(?:up|faster)\b|^(?:way|much|a lot|even|really)\s+faster\b/.test(t)) return { step: more };
  // “could the tempo go a notch lower maybe”, “speed a bit higher”.
  if (/\b(?:tempo|speed|pace)\b/.test(t)) {
    if (/\b(?:lower|slower|down|less|decrease|reduce)\b/.test(t)) return { step: -more };
    if (/\b(?:higher|faster|up|increase|quicker)\b/.test(t)) return { step: more };
  }
  return null;
}
/** Named speeds in English: half, a quarter, three quarters, full/normal. */
function namedSpeed(t) {
  const core = speedCore(t);
  const noun = "(?:\\s+(?:the\\s+)?(?:speed|tempo|pace))";
  if (new RegExp(`^(?:half${noun}?|(?:the\\s+)?(?:speed|tempo)\\s+in\\s+half|halve(?:\\s+(?:it|this|the\\s+(?:speed|tempo)))?)$`).test(core)) return 50;
  if (new RegExp(`^(?:a\\s+)?quarter${noun}$`).test(core)) return 25;
  if (new RegExp(`^three(?:\\s+|-)quarters?${noun}$`).test(core)) return 75;
  if (new RegExp(`^(?:the\\s+)?(?:normal|full|original|regular|written|real|usual|proper)${noun}$`).test(core)) return 100;
  // Out of range on purpose: the caller explains the 25–125% limits.
  if (new RegExp(`^(?:double|twice)${noun}?$|^twice as fast$`).test(core)) return 200;
  return null;
}
/** Named speeds in Chinese: 半速, 一半的速度, 速度减半, 慢一半, 原速, 正常速度. */
function namedSpeedZh(request) {
  const r = String(request).replace(/[\s，,。！!？?~～]/g, "")
    .replace(/^(?:我(?:想|要)?|我们|我們|咱们|咱們)/, "")
    .replace(/(?:吧|呢|啊|呀|好吗|好嗎|可以吗|可以嗎|行吗|行嗎)$/, "");
  if (/^(?:把)?(?:速度|节奏|節奏|播放速度)?(?:调|調|降|放|改|变|變)?(?:成|到|为|為)?(?:一半|减半|減半|半速)$/.test(r) ||
      /^(?:用|以|按|按照)?(?:一半|半)(?:的)?(?:速度|节奏|節奏|速)(?:来|來)?(?:练|練|弹|彈|练习|練習|播放|过|過)?(?:一下|一遍)?$/.test(r) ||
      /^半速(?:练|練|弹|彈|练习|練習|播放)?(?:一下|一遍)?$/.test(r) ||
      /^(?:速度|节奏|節奏)?(?:再)?(?:慢|放慢|降|降低|减|減)(?:到|成)?一半$/.test(r))
    return 50;
  if (/^(?:恢复|恢復|回到|调回|調回|改回|换回|換回|用|以)?(?:原速|原来的速度|原來的速度|正常速度|正常的速度|全速|原本的速度)(?:来|來)?(?:练|練|弹|彈|播放)?$/.test(r))
    return 100;
  return null;
}
/** A speed request: { pct } for an exact value, { step: -1 | 1 } for slower or
 * faster; null when the text is not about playback speed. */
function speedRequest(text, command) {
  // “sixty percent” and “60 per cent” are “60%”.
  const request = text.replace(/\s*\b(?:percent|per\s*cent)\b/gi, "%");
  const t = loose(request);
  if (/^(?:(?:a\s+)?(?:little|bit|tad|touch)\s+|a\s+(?:little\s+)?bit\s+|even\s+|much\s+)?slower(?:\s+(?:again|please|still))?$|^(?:slow|turn)\s+(?:it\s+|this\s+|things\s+|the (?:speed|tempo)\s+)?down(?:\s+(?:a\s+)?(?:little|bit|tad|touch)(?:\s+(?:more|bit))?)?(?:\s+(?:again|please|more))?$|^(?:make|play|take)\s+(?:it|this|things)\s+(?:a\s+)?(?:(?:little|bit|tad)\s+)?(?:bit\s+)?slower$|^(?:go|play)\s+slower$|^(?:reduce|lower|decrease)\s+the\s+(?:speed|tempo)$/.test(command)
    || /^(?:再|稍微|稍稍|稍|把速度|速度|节奏|節奏)?(?:调|調|放|弄|变|變|再)?慢(?:一点点|一點點|一点|一點|点|點|一些|些|一下)(?:儿|兒)?$|^(?:放慢|调慢|調慢|减速|減速|降速|降低速度)(?:速度)?(?:一点|一點|一些|一下)?$/.test(command))
    return { step: -1 };
  if (/^(?:(?:a\s+)?(?:little|bit|tad|touch)\s+|a\s+(?:little\s+)?bit\s+|even\s+|much\s+)?faster(?:\s+(?:again|please|still))?$|^(?:speed|turn)\s+(?:it\s+|this\s+|things\s+|the (?:speed|tempo)\s+)?up(?:\s+(?:a\s+)?(?:little|bit|tad|touch)(?:\s+(?:more|bit))?)?(?:\s+(?:again|please|more))?$|^(?:make|play|take)\s+(?:it|this|things)\s+(?:a\s+)?(?:(?:little|bit|tad)\s+)?(?:bit\s+)?faster$|^(?:go|play)\s+faster$|^(?:increase|raise)\s+the\s+(?:speed|tempo)$/.test(command)
    || /^(?:再|稍微|稍稍|稍|把速度|速度|节奏|節奏)?(?:调|調|放|弄|变|變|再)?快(?:一点点|一點點|一点|一點|点|點|一些|些|一下)(?:儿|兒)?$|^(?:加快|调快|調快|加速|提速|提高速度)(?:速度)?(?:一点|一點|一些|一下)?$/.test(command))
    return { step: 1 };
  const named = namedSpeed(t) ?? namedSpeedZh(request);
  if (named) return { pct: named };
  const by = t.match(/^(?:(?:slow|bring|turn|take|go)\s+(?:it\s+|this\s+|the (?:speed|tempo)\s+)?down|(?:reduce|lower|decrease|drop|cut)(?:\s+(?:it|this|the (?:speed|tempo)))?|(?:go\s+)?slower)\s+by\s+(\d{1,2})\s*%?$|^(\d{1,2})\s*%\s+slower$/)
    || t.match(/^(?:(?:speed|bring|turn|take)\s+(?:it\s+|this\s+|the (?:speed|tempo)\s+)?up|(?:increase|raise|bump)(?:\s+(?:it|this|the (?:speed|tempo)))?|(?:go\s+)?faster)\s+by\s+(\d{1,2})\s*%?$|^(\d{1,2})\s*%\s+faster$/);
  const byZh = String(request).replace(/\s/g, "").match(new RegExp(`^(?:再|把速度|速度)?(?:放慢|调慢|調慢|降低|降|慢|减|減)(${ZH_NUMBER})\\s*%?$|^(?:再|把速度|速度)?(?:加快|调快|調快|提高|提|快|加)(${ZH_NUMBER})\\s*%?$`));
  if (by || byZh) {
    const slower = by ? /slow|down|reduce|lower|decrease|drop|cut|slower/.test(by[0]) && !/faster|up|increase|raise|bump/.test(by[0]) : Boolean(byZh[1]);
    const amount = number(by ? by[1] || by[2] : byZh[1] || byZh[2]);
    if (Number.isInteger(amount) && amount > 0) return { delta: slower ? -amount : amount };
  }
  // Signs and decimals stay with the exact forms below, which refuse them
  // (“speed -25%”, “speed 0.75”); the loose form would drop them.
  const core = /[-+−]\s*\d|\d\s*\.\s*\d/.test(request) ? "" : speedCore(t);
  const value =
    // “play it at 80%”, “drop it to 50 percent”, “take this down to sixty percent”
    core.match(/^(\d{1,3}|[a-z]+(?:[\s-][a-z]+)?)\s*%(?:\s+(?:speed|tempo|pace|of the (?:speed|tempo)))?$/)
    || core.match(/^(?:speed|tempo)\s+(?:of\s+)?(\d{1,3})\s*%$/) ||
    // “speed 75%”, “set speed to 75”, “speed to sixty”
    request.match(/^(?:(?:set|change|put|bring|turn|drop|lower|raise|reduce|increase|bump|take|get)\s+(?:the\s+)?)?(?:practice\s+|playback\s+)?speed(?:\s+(?:down|up))?(?:\s+(?:to|at))?(?:\s+(?:about|around|roughly|like|approximately|maybe|just))?\s+([-+]?\d+(?:\.\d+)?|[a-z]+(?:[\s-][a-z]+)?)\s*(?:%|percent|per\s*cent)?$/i)
    // “make it 60% speed”, “play at 80 percent”, “at 60%”, “75% speed”
    || t.match(/^(?:(?:set|change|put|make|turn|bring|drop|lower|raise|reduce|increase|bump|take|get)\s+(?:it|this|the\s+(?:speed|tempo))\s+(?:(?:down|up)\s+)?(?:to\s+|at\s+)?|(?:play|practi[cs]e|go|run|try)\s+(?:it\s+|this\s+)?at\s+|at\s+)?(\d{1,3}|[a-z]+(?:[\s-][a-z]+)?)\s*(?:%|percent|per cent)(?:\s+(?:speed|tempo|of the (?:speed|tempo)))?$/)
    // “把速度调到60%”, “速度调成百分之五十”, “调速到七十五”
    || request.match(new RegExp(`^(?:把|将|將)?(?:练习|練習|播放)?(?:速度|节奏|節奏|速率|调速|調速)(?:调到|調到|调成|調成|调为|調為|改到|改成|改为|改為|设为|設為|设成|設成|设置为|設置為|设到|設到|放到|降到|提到|到|为|為|是)?\\s*(${ZH_NUMBER})\\s*%?$`))
    // “用70%的速度练”, “以百分之六十的速度弹”
    || request.match(new RegExp(`^(?:用|以|按|按照)\\s*(${ZH_NUMBER})\\s*%?\\s*(?:的)?(?:速度|节奏|節奏)(?:来|來)?(?:练|練|弹|彈|练习|練習)?$`))
    || request.match(new RegExp(`^(${ZH_NUMBER})\\s*%\\s*(?:的)?(?:速度)?$`));
  if (!value) return looseSpeed(request);
  return { pct: number(value[1].replace(/%$/, "").trim()) };
}

/** “Back to the beginning”, “from the top”, “start over”, “回到开头”, “从头开始”:
 * "start"; “go to the end”, “最后一小节”: "end"; null otherwise. A direction
 * word plus a place word, in either language, with or without a verb. */
function edgeRequest(request) {
  // “bar -1”, “bar 1.5”: signs and decimals are invalid bar numbers, not bar 1.
  if (/[-+−]\s*\d|\d\s*\.\s*\d/.test(request)) return null;
  const t = loose(request).replace(/(?:\s+(?:please|again|now|for me|once more))+$/, "");
  const start = "(?:very\\s+)?(?:beginning|start|top|opening|first (?:bar|measure)|(?:bar|measure) (?:one|1))";
  const ofPiece = "(?:\\s+(?:of|in)\\s+(?:the|this|my)\\s+(?:piece|song|score|music|movement|sonata))?";
  const move = "(?:go|jump|skip|seek|move|head|rewind|return|take me|bring me|get me|send me|take us|bring us|get us|go all the way|go right)";
  if (new RegExp(`^(?:${move}\\s+)?(?:(?:right|all the way)\\s+)?(?:back\\s+)?(?:to\\s+)?(?:the\\s+)?${start}${ofPiece}$`).test(t)) return "start";
  if (new RegExp(`^(?:(?:take|play|do|run|try|practi[cs]e|start|begin|restart|go|read)(?:\\s+(?:it|this|that|them|the (?:piece|song|whole thing)))?\\s+)?(?:(?:again|over|once more)\\s+)?from\\s+(?:the\\s+)?${start}${ofPiece}$`).test(t)) return "start";
  if (/^(?:start|begin)\s+(?:(?:it|this|the (?:piece|song|music))\s+)?(?:over|again|afresh|from scratch)(?:\s+from\s+the\s+(?:very\s+)?(?:top|beginning|start))?$|^restart(?:\s+(?:it|this|the (?:piece|song|music)))?(?:\s+from\s+the\s+(?:very\s+)?(?:top|beginning|start))?$|^(?:back\s+to\s+)?square one$/.test(t)) return "start";
  if (new RegExp(`^(?:${move}\\s+)?(?:(?:right|all the way)\\s+)?(?:to\\s+)?(?:the\\s+)?(?:very\\s+)?(?:end|last (?:bar|measure)|final (?:bar|measure))${ofPiece}$`).test(t)) return "end";
  const z = String(request).replace(/[\s，,。！!？?~～]/g, "")
    .replace(/^(?:我们|我們|咱们|咱們|我(?:想|要)?|那就|那|好)/, "")
    .replace(/(?:吧|呢|啊|呀|哈|好吗|好嗎)$/, "");
  if (/^(?:回到|回|跳到|跳回|返回|去|到|退回|倒回)(?:最)?(?:开头|開頭|开始|開始|起点|起點|第一小节|第一小節|第1小节|第1小節|最前面|头|頭)(?:的地方|那里|那裡)?$/.test(z) ||
      /^(?:从|從)(?:最)?(?:头|頭|开头|開頭|最开始|最開始|第一小节|第一小節|第1小节|第1小節)(?:再)?(?:开始|開始|来|來|重新来|重新來)?(?:练|練|弹|彈|练习|練習|播放|过|過|看)?(?:一遍|一次|一下|起)?$/.test(z) ||
      /^(?:重新开始|重新開始|重来|重來|从头再来|從頭再來)(?:练|練|弹|彈|一遍)?$/.test(z))
    return "start";
  if (/^(?:跳到|去|到|回到)?(?:最后|最後)(?:一)?(?:个|個)?(?:小节|小節)$|^(?:跳到|去|到)(?:结尾|結尾|最后|最後|末尾)$/.test(z)) return "end";
  return null;
}

/** Bars to move from the playhead (negative: back), or null. */
function stepRequest(request) {
  if (/[-+−]\s*\d|\d\s*\.\s*\d/.test(request)) return null;
  const t = loose(request).replace(/(?:\s+(?:please|now|again|for me))+$/, "")
    .replace(/\ba couple(?: of)?\b/g, "two").replace(/\b(?:a|one) single\b/g, "one");
  const count = "(\\S+(?:[\\s-]\\S+)?)";
  const unit = "(?:bars?|measures?)";
  const way = "(back|backward|backwards|forward|forwards|ahead|on|later|earlier)";
  // [direction word, count]: “skip ahead 2 bars”, “go back a bar”, “jump
  // two bars ahead”, “2 bars back”, “skip 3 bars”, “back up one bar”.
  let en = t.match(new RegExp(`^(?:(?:go|jump|skip|move|step|head|take me|bring me|rewind)\\s+)${way}\\s+(?:by\\s+)?${count}\\s+${unit}$`));
  if (!en) {
    const after = t.match(new RegExp(`^(?:(?:go|jump|skip|move|step|head)\\s+)?${count}\\s+${unit}\\s+${way}$`))
      || t.match(new RegExp(`^(?:go\\s+)?(back)\\s+up\\s+${count}\\s+${unit}$`));
    const skip = t.match(new RegExp(`^skip\\s+(?:over\\s+)?${count}\\s+${unit}$`));
    en = after ? (after.length === 3 && /^(?:back|backward|backwards|forward|forwards|ahead|on|later|earlier)$/.test(after[2]) ? [after[0], after[2], after[1]] : [after[0], after[1], after[2]])
      : skip ? [skip[0], "forward", skip[1]] : null;
  }
  en ||= t.match(/^(?:(?:go|jump|skip|move|take me|bring me)\s+)?(?:on\s+)?to\s+the\s+(next|previous|prior)\s+(?:bar|measure)$/)
    || t.match(new RegExp(`^(back|forward|ahead)\\s+${count}\\s+${unit}$`));
  if (en) {
    const direction = /^(?:back|backward|backwards|previous|prior|earlier)$/.test(en[1]) ? -1 : 1;
    const n = en[2] === undefined ? 1 : number(en[2] === "a" || en[2] === "one" ? "1" : en[2]);
    return Number.isInteger(n) && n >= 1 ? direction * n : null;
  }
  const z = String(request).replace(/[\s，,。！!？?~～]/g, "").replace(/(?:吧|呢|啊|呀)$/, "");
  const zh = z.match(/^(?:跳到|去|到|转到|轉到|前往|翻到|移到)(下|上)(?:一)?(?:个|個)?(?:小节|小節)$/)
    // In a score “往后” is later and “往前” earlier (往后翻 turns forward);
    // “跳过” skips ahead. The receipt names the bar it lands on.
    || z.match(new RegExp(`^(?:再)?(往回|退回|后退|後退|倒退|回退|往前|往下|向下|前进|前進|往后|往後|向后|向後|跳过|跳過)(?:再)?(?:跳|走|移|翻|退)?(?:过|過)?(${ZH_NUMBER})(?:个|個)?(?:小节|小節)$`))
    || z.match(new RegExp(`^(?:再)?(跳)(?:过|過)?(${ZH_NUMBER})(?:个|個)?(?:小节|小節)$`));
  if (zh) {
    if (zh[1] === "下") return 1;
    if (zh[1] === "上") return -1;
    const n = number(zh[2]);
    return Number.isInteger(n) && n >= 1 ? (/^(?:往下|向下|前进|前進|往后|往後|向后|向後|跳过|跳過|跳)$/.test(zh[1]) ? n : -n) : null;
  }
  return null;
}

/** Bar positions: “go to bar 12”, “start from bar 10”, “从第10小节开始”,
 * “loop the next four bars”, “重复这一小节”. Null when the text only
 * mentions a bar (“我总是弹错这个小节”, “讲讲第153小节”). */
function barRequest(request, context) {
  const edge = edgeRequest(request);
  if (edge) {
    const count = barsIn(context.currentScore);
    if (!count) return result("Open a score before choosing a bar.", [{ type: "navigate", view: "library", label: "Open library" }]);
    const bar = edge === "start" ? 1 : count;
    return result(`Go to bar ${bar}.`, [{ type: "seek-bar", bar, label: `Go to bar ${bar}` }]);
  }
  // Relative moves from the playhead: “go back two bars”, “skip ahead 4
  // measures”, “go to the next bar”, “跳到下一小节”, “往回两小节”.
  const step = stepRequest(request);
  if (step !== null) {
    const count = barsIn(context.currentScore);
    if (!count) return result("Open a score before choosing a bar.", [{ type: "navigate", view: "library", label: "Open library" }]);
    const from = Number.isFinite(context.currentBar) ? Math.trunc(context.currentBar) : NaN;
    const bar = from + step;
    if (!Number.isInteger(bar) || bar < 1 || bar > count) return result(`Use whole bar numbers from 1 to ${count}.`);
    return result(`Go to bar ${bar}.`, [{ type: "seek-bar", bar, label: `Go to bar ${bar}` }]);
  }
  // English bar values: digits (even invalid ones, which get a clear error)
  // or number words. “bar 153 is hard” is a remark, not a command, unless
  // an explicit verb such as “go to” makes it one.
  const numeric = (value) => /^[-+]?\d+(?:\.\d+)?$/.test(value) || Number.isInteger(number(value)) ||
    /^(?:this|the current|current)(?:\s+(?:bar|measure|one))?$/i.test(value);
  const goEn = request.match(/^(?:((?:go|jump|skip|seek|move|take me|bring me|head)(?:\s+(?:back|ahead|forward|straight|up|down|on|over))?(?:\s+to)?)\s+)?(?:the\s+)?(?:bar|measure)\s+(.+)$/i);
  const startEn = request.match(/^(?:(?:start|begin|play|practi[cs]e|continue|resume|pick up|go|carry on|restart)(?:\s+(?:it|again|playing|practicing|practising))?\s+(?:from|at)\s+(?:the\s+)?(?:bar|measure)\s+|(?:from|at)\s+(?:bar|measure)\s+)(.+)$/i);
  const go =
    (goEn && (goEn[1] || numeric(goEn[2].trim())) ? [goEn[0], goEn[2]] : null)
    || (startEn && numeric(startEn[1].trim()) ? startEn : null)
    || request.match(new RegExp(`^(?:去|到|跳到|跳去|跳至|转到|轉到|前往|回到|移到|定位到|切到|翻到)?\\s*第?\\s*(${ZH_NUMBER})\\s*(?:小节|小節)$`))
    || request.match(new RegExp(`^(?:我(?:想|要)?|我们|我們|咱们|咱們)?(?:从|從|在)\\s*第?\\s*(${ZH_NUMBER})\\s*(?:小节|小節)\\s*(?:开始|開始|起|继续|繼續|接着|接著)(?:练|練|弹|彈|练习|練習|看)?(?:起来|起來)?$`));
  const repeat =
    request.match(/^(?:repeat|loop)\s+(?:the\s+)?(?:bars?\s+|measures?\s+)?(.+)$/i)
    || request.match(/^(?:重复|重複|循环|循環|反复|反複)(?:播放|练习|練習|练|練|弹|彈)?(?:一下)?\s*(.+)$/)
    || request.match(/^(?:把)?(.+?)(?:重复|重複|循环|循環|反复|反複)(?:播放|练习|練習|弹|彈|练|練)?(?:一下|起来|起來|几遍|幾遍|几次|幾次)?$/);
  if (!go && !repeat) return null;
  const count = barsIn(context.currentScore);
  // Not clamped: a playhead outside this score is a stale context, and the
  // range check below refuses it instead of looping a different bar.
  const playhead = Number.isFinite(context.currentBar) ? Math.trunc(context.currentBar) : NaN;
  const loop = context.loop && Number.isInteger(context.loop.from) && Number.isInteger(context.loop.to) ? context.loop : null;
  let first, last;
  if (repeat && !/\p{Script=Han}/u.test(repeat[1]) && !/\d|\b(?:this|current|here|next|following|coming|last|previous|preceding|these|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b/i.test(repeat[1]))
    return null;
  if (repeat) {
    const value = repeat[1].replace(/[\s,，]+$/, "").replace(/(?:帮我|幫我|给我|給我|替我)$/, "").replace(/^(?:给我|給我|帮我|幫我|替我)?把(?=\S)/, "").replace(/^from\s+(?:(?:bars?|measures?)\s+)?(?=\S*\d|\S+\s+(?:to|through|-|–))/i, "").trim();
    const han = /\p{Script=Han}/u.test(value);
    const zhFew = value.match(/^(?:这|這)(两|兩|三|四|五|六|七|八)(?:个|個)?(?:小节|小節)$/);
    const lower = value.toLowerCase();
    const relative = lower.match(/^(?:the\s+)?(next|following|coming|last|previous|preceding|these|this)\s+(\S+)\s+(?:bars|measures)$/);
    const zhRange = value.match(new RegExp(`^第?\\s*(${ZH_NUMBER})\\s*(?:小节|小節)?\\s*(?:到|至|-|–|—|~|～)\\s*第?\\s*(${ZH_NUMBER})\\s*(?:小节|小節)?$`));
    const zhOne = value.match(new RegExp(`^第?\\s*(${ZH_NUMBER})\\s*(?:小节|小節)?$`));
    if (/^(?:this|the current|current|this one|here)(?:\s+(?:bar|measure|one))?$|^(?:这|這|当前|當前|目前|现在|現在)(?:一|个|個)?(?:小节|小節)$/.test(lower)) first = last = playhead;
    else if (/^(?:this|the current)\s+(?:passage|section|part|phrase)$|^(?:这|這)(?:一)?(?:段|部分|几小节|幾小節|几个小节|幾個小節)$/.test(lower))
      [first, last] = loop ? [loop.from, loop.to] : [playhead, playhead];
    else if (zhFew) [first, last] = loop && loop.to - loop.from + 1 === number(zhFew[1]) ? [loop.from, loop.to] : [playhead, playhead + number(zhFew[1]) - 1];
    else if (relative) {
      const n = number(relative[2]);
      if (!Number.isInteger(n) || n < 1) return result(`Use whole bar numbers from 1 to ${count || 1}, with the first bar before the last.`);
      [first, last] = /^(?:last|previous|preceding)$/.test(relative[1]) ? [playhead - n + 1, playhead] : [playhead, playhead + n - 1];
    } else if (han) {
      // A Chinese sentence that only mentions bars is not a loop command.
      if (zhRange) [first, last] = [number(zhRange[1]), number(zhRange[2])];
      else if (zhOne) first = last = number(zhOne[1]);
      else return null;
    } else {
      const pair = value.replace(/(?:小节|小節)$/g, "").split(/\s*(?:[–—~～-]|\bto\b|\bthrough\b|\bthru\b|\band\b|至|到)\s*/i);
      if (pair.length > 2) first = NaN;
      else [first, last] = [number(pair[0]), number(pair[1] ?? pair[0])];
    }
  } else {
    const value = go[1].trim();
    first = last = /^(?:this|the current|current)(?:\s+(?:bar|measure|one))?$/i.test(value) ? playhead : number(value);
  }
  if (!count) return result("Open a score before choosing a bar.", [{ type: "navigate", view: "library", label: "Open library" }]);
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last < first || last > count)
    return result(`Use whole bar numbers from 1 to ${count}${repeat ? ", with the first bar before the last" : ""}.`);
  return repeat
    ? result(`Repeat ${first === last ? `bar ${first}` : `bars ${first}–${last}`}.`, [{ type: "repeat-bars", from: first, to: last, label: `Repeat bars ${first}–${last}` }])
    : result(`Go to bar ${first}.`, [{ type: "seek-bar", bar: first, label: `Go to bar ${first}` }]);
}

/** “Play this bar”, “play it for me”, “弹给我听”: the app's Listen & follow
 * plays the written music; the companion only sets it up. */
function listenRequest(request, context) {
  const en = request.match(/^(?:play|perform|demonstrate|demo)\s+(it|this|that|this (?:bar|measure|passage|section|part|phrase|one|piece|song)|the (?:bar|passage|piece|song)|it again|this again)(?:\s+(?:for me|again|once))*$|^(?:let me hear|i want to hear|can i hear|show me how (?:it|this) sounds|how does (?:it|this) sound)(?:\s+(it|this|this bar|this passage|the passage|this piece|the piece))?$/i);
  const zh = request.match(/^(?:弹|彈|示范|示範|演示|播放)(?:一下|一遍|一次)?(这|這)?(?:一)?(小节|小節|段|首)?(?:给我听|給我聽)?(?:听|聽)?(?:一下|一遍)?$|^(?:给我|給我)(?:弹|彈|示范|示範|演示)(?:一下|一遍|一次)?(这|這)?(?:一)?(小节|小節|段|首)?(?:听听|聽聽|听|聽)?$|^(?:我)?(?:想|要)?(?:听|聽)(?:听|聽|一下)?(这|這)(?:一)?(小节|小節|段|首)$/);
  if (!en && !(zh && /给|給|听|聽|示范|示範|演示|一下|一遍|这|這/.test(request))) return null;
  const what = en ? String(en[1] || en[2] || "it").toLowerCase() : zh.slice(1).filter(Boolean).join("");
  const wholePiece = /piece|song|首/.test(what);
  const bar = Math.max(1, Math.min(barsIn(context.currentScore) || 1, Math.trunc(context.currentBar) || 1));
  const actions = [];
  const loop = context.loop && Number.isInteger(context.loop.from) ? context.loop : null;
  if (!wholePiece && !loop && /bar|measure|小节|小節/.test(what) && barsIn(context.currentScore))
    actions.push({ type: "repeat-bars", from: bar, to: bar, label: `Repeat bars ${bar}–${bar}` });
  if (context.mode !== "listen") actions.push({ type: "set-mode", mode: "listen", label: "Listen & follow" });
  const where = loop ? `bars ${loop.from}–${loop.to}` : `bar ${bar}`;
  return result(actions.length
    ? `Listen & follow plays the written notes for you: set it up below, then press Play to hear ${wholePiece ? "the piece" : where}.`
    : `Listen & follow is on: press Play to hear ${wholePiece ? "the piece" : where}.`, actions);
}

// A remainder after “show me / play / open …” that is a pronoun or a
// description, not a title: never offer to import it.
const NOT_A_TITLE = /^(?:it|this|that|these|those|here|there|me|my|your|our|him|her|them|something|anything|everything|nothing|some|any|more|again|how|what|where|why|when|who|which|whether|if|all|for me|the (?:score|notes?|music|sheet|bars?|measures?|passage|section|part|raw|next|last|first|left|right|same|previous|current|whole|rest|beginning|end|ending|start|data|chords?|melody|tune|rhythm|fingering|pedal|tempo|speed|key|progress|library|settings|way)\b|a (?:bar|passage|section|note|chord|scale|demo|song|piece|tune|melody|bit|little)\b|(?:这|這|那|它|一下|一遍|给我|給我|什么|什麼|哪|我的|你的|一些|点|點|别的|別的|首歌|首曲子))/i;

// Words around a typed title that do not change which piece it is.
const TITLE_FILLER = new Set(["the", "a", "an", "my", "piece", "song", "one", "version", "edition", "arrangement", "please", "music", "score", "by", "of", "no", "op", "movement", "mvt", "i", "ii", "iii", "iv"]);
const ZH_TITLE_FILLER = /(?:的|吧|呢|啊|呀|嘛|那首|这首|這首|首|曲子|歌曲|歌|钢琴曲|鋼琴曲|版本|版|第[一二三四五六七八九十\d]+(?:乐章|樂章)|乐章|樂章|奏鸣曲|奏鳴曲)/g;
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Han text of `rest` with every run of 2+ characters that also occurs in
 * `source` removed: “龙卷风 邓紫棋” is all title, “晴天真好听” leaves “真好听”. */
function withoutShared(rest, source) {
  let out = "";
  for (let i = 0; i < rest.length; ) {
    let length = 0;
    for (let n = Math.min(16, rest.length - i); n >= 2; n--) {
      const part = rest.slice(i, i + n);
      if (/^\p{Script=Han}+$/u.test(part) && source.includes(part)) {
        length = n;
        break;
      }
    }
    out += length ? " " : rest[i];
    i += length || 1;
  }
  return out;
}
/** A title typed on its own (“晴天”, “the Moonlight one”, “龙卷风邓紫棋版”), as
 * opposed to a sentence that mentions one (“热情奏鸣曲我现在在153小节附近…”,
 * “Gymnopédie is so calm”). Only the former is a search without a verb. */
function titleOnly(query, context) {
  const matches = searchMaestroPieces(query, context.pieces, context.journal);
  if (!matches.length) return true;
  let rest = normal(query);
  // A common name of the work in the other language is part of the title.
  for (const [, chinese] of WORD_ALIASES) for (const word of chinese) rest = rest.split(word).join(" ");
  const names = matches.slice(0, 3).map(({ piece }) => normal(`${piece.title} ${piece.composer || ""}`)).join(" ");
  rest = withoutShared(rest, names.replace(/\s+/g, ""));
  for (const word of [...new Set(names.split(/\s+/))].filter((w) => w && !/\p{Script=Han}/u.test(w)).sort((a, b) => b.length - a.length))
    rest = rest.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(word)}(?![\\p{L}\\p{N}])`, "gu"), " ");
  const words = rest.replace(ZH_TITLE_FILLER, " ").split(/\s+/).filter((w) => w && !TITLE_FILLER.has(w));
  const han = (words.join("").match(/\p{Script=Han}/gu) || []).length;
  return han === 0 && words.filter((w) => !/\p{Script=Han}/u.test(w)).length <= 1;
}

/** An allowlisted action plan. Unknown text becomes a local title search.
 * “ugh this is so hard, slow it down” and “烦死了，慢一点” end in a command:
 * when the whole message is none, its last clause may be one. */
export function planMaestroCommand(text, context = {}) {
  const plan = planCommand(text, context);
  if (!((plan.intent === "help" && !plan.actions.length) || (plan.intent === "search" && !plan.matches?.length))) return plan;
  const clauses = String(text ?? "").slice(0, 500).split(/[,，。;；!！?？\n]+|\s+(?:but|so|and then)\s+/i).map((c) => c.trim()).filter(Boolean);
  if (clauses.length < 2) return plan;
  const last = planCommand(clauses.at(-1), context);
  return last.intent === "command" && last.actions?.length === 1 && CLAUSE_COMMANDS.has(last.actions[0].type) ? last : plan;
}
const CLAUSE_COMMANDS = new Set(["seek-bar", "repeat-bars", "set-speed", "set-hand", "set-mode"]);
function planCommand(text, context = {}) {
  const request = cleanRequest(text);
  const command = normal(request);
  if (!command) return result("Find a piece, resume practice, or ask to change a bar, hand or speed.", [], "help");
  if (/^(?:help|commands|what can you do|how does this work|帮助|幫助|怎么用|怎麼用)$/.test(command))
    return result("Try “find Für Elise”, “resume”, “go to bar 8”, “repeat bars 4–8”, “slower” or “right hand”.", [{ type: "show-help", topic: "commands", label: "Command guide" }], "help");
  if (/^(?:explain (?:the )?numbers|what (?:do|are) (?:the |these )?numbers(?: mean)?|numbers|数字是什么意思|數字是什麼意思|解释数字|解釋數字|数字|數字)$/.test(command))
    return result("Score and key numbers 1–7 name pitches (Do–Ti). Hand numbers 1–5 name fingers; 1 is the thumb. The pitch label, such as C4, identifies the exact key.", [{ type: "show-help", topic: "numbers", label: "Number guide" }], "help");

  const view = navigationRequest(command);
  if (view) return result(`Open ${view}.`, [{ type: "navigate", view, label: `Open ${view}` }]);
  const settings = command.replace(/^(?:open|show(?: me)?|go to|take me to)\s+(?:the\s+)?|^(?:打开|打開|查看|去|进入|進入)/, "");
  if (["settings", "设置", "設定", "設置"].includes(settings)) return result("Open settings.", [{ type: "open-settings", label: "Open settings" }]);
  if (["import", "import a score", "import score", "导入", "導入", "导入乐谱", "導入樂譜"].includes(command)) return result("Choose a PDF, MusicXML or MIDI file.", [{ type: "import-score", label: "Import a score" }]);

  const hand = handRequest(command);
  if (hand) {
    const label = hand === "both" ? "Both hands" : `${hand === "left" ? "Left" : "Right"} hand`;
    return result(`Practice with ${label.toLowerCase()}.`, [{ type: "set-hand", hand, label }]);
  }
  const mode = modeRequest(command);
  if (mode) {
    const label = { listen: "Listen & follow", wait: "Wait for me", perform: "Play in time" }[mode];
    return result(`Use ${label}.`, [{ type: "set-mode", mode, label }]);
  }

  const speed = speedRequest(request, command);
  if (speed) {
    const old = Number.isFinite(context.speed) ? Math.max(0.25, Math.min(1.25, Math.round(context.speed * 20) / 20)) : 0.75;
    const pct = speed.step ? Math.max(25, Math.min(125, Math.round(old * 100) + speed.step * 5))
      // A relative change by an amount (“10% slower”) is checked like a value.
      : speed.delta ? Math.round(old * 100) + speed.delta : speed.pct;
    if (!Number.isInteger(pct) || pct < 25 || pct > 125 || pct % 5) return result("Choose a speed from 25% to 125% in steps of 5%, for example “speed 75%”.");
    if (speed.step && pct === Math.round(old * 100)) return result(`Speed is already ${pct}%, the ${speed.step < 0 ? "minimum" : "maximum"}.`);
    return result(`Set practice speed to ${pct}%.`, [{ type: "set-speed", speed: pct / 100, label: `${pct}% speed` }]);
  }

  // Exact bar commands first: “continue from bar 30” is a position, not a
  // resume of a piece called “from bar 30”. Questions such as
  // “我上次练到第几小节” name no bar number and pass through.
  const bars = barRequest(request, context);
  if (bars) return bars;

  const resume = resumeRequest(request);
  if (resume || /^(?:上次练到哪|上次練到哪|从上次继续|從上次繼續)$/.test(command)) {
    const query = resume?.query || "";
    const which = normal(query);
    if (/^(?:latest|last piece|most recent|most recent piece|last session|最近|最近的曲子|最近练的|最近練的|上次|上次的曲子)$/.test(which)) return resumeCurrent(context, true);
    if (!which || /^(?:it|this|this one|this piece|the piece|this song|current|current piece|here|where i left off|from where i left off|这首|這首|这个|這個|当前|當前)$/.test(which)) return resumeCurrent(context, false, Boolean(which && !which.includes("left off")));
    return choosePiece(query, context, true);
  }

  const listen = listenRequest(request, context);
  if (listen) return listen;

  const search = request.match(/^(?:find|search(?:\s+for)?|look for|look up|open|load|play|show me|bring up)\s+(.+)$/i)
    || request.match(/^(?:查找|搜索|搜尋|寻找|尋找|打开|打開|播放|找|搜)\s*(.+)$/);
  // “打开那首龙卷风”: a demonstrative before a title is not part of it.
  let query = (search?.[1]?.trim() || request).replace(/^(?:那首|这首|這首|那个|那個|这个|這個|那一首|这一首)(?=\S)/, "");
  // “something by Chopin”, “贝多芬的曲子”: the composer is the query.
  const by = query.match(/^(?:something|anything|a piece|a song|pieces|songs|music|works?)\s+(?:by|from)\s+(.+)$/i)
    || query.match(/^(.{2,40}?)的(?:曲子|作品|歌|钢琴曲|鋼琴曲)$/);
  if (by) query = by[1].trim();
  else if (search && NOT_A_TITLE.test(query)) return result(LOCAL_ONLY, [], "help");
  if (!search && !by) {
    // “我想弹晴天”, “练龙卷风”: a Chinese practise verb before a title.
    const play = request.match(/^(?:我(?:想|要)|我们|我們|咱们|咱們)?(?:来|來)?(?:弹|彈|练|練|练习|練習)(?:一下|一首)?\s*(.+)$/);
    if (play && searchMaestroPieces(play[1], context.pieces, context.journal).length && titleOnly(play[1], context))
      return choosePiece(play[1].trim(), context);
    // Without a search verb only a title typed on its own is a search; one
    // or two Latin letters (“k”, “c”) are not a title.
    if (/^\p{Script=Latin}{1,2}$/u.test(query) || !titleOnly(query, context)) return result(LOCAL_ONLY, [], "help");
  }
  return choosePiece(query, context);
}
