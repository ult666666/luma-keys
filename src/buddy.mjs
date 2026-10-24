// The roaming companion's voice. A tiny event bus lets any panel make the
// companion react ("buddySay"), and a line library keeps what it says short,
// specific to the moment and never repeated back-to-back.

const listeners = new Set();

/** Ask the companion to react. `mood` is one of idle, listening,
 * conducting or celebrate; `burst` adds a small particle effect. */
export function buddySay(text, { mood = "celebrate", ttl = 3600, burst = null } = {}) {
  if (typeof text !== "string" || !text.trim()) return;
  const event = { text: text.trim().slice(0, 140), mood, ttl, burst, at: Date.now() };
  for (const fn of listeners) {
    try {
      fn(event);
    } catch {
      /* A broken listener never stops the others. */
    }
  }
}

/** Sparse, silent microphone-practice help may appear while Wait is active.
 * Kept distinct from normal panel messages so playback still suppresses them. */
export function buddyPracticeSay(cue) {
  if (typeof cue?.text !== "string" || !cue.text.trim()) return;
  const event = { text: cue.text.trim().slice(0, 140), mood: cue.mood === "celebrate" ? "celebrate" : "listening", source: "microphone", at: Date.now() };
  for (const fn of listeners) {
    try { fn(event); } catch { /* Never interrupt the detector. */ }
  }
}

export function onBuddy(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const LINES = {
  welcome: [
    "Hi! {name} here. Shall we play {title}?",
    "Welcome back! The piano missed you.",
    "Ready when you are. {title} is on the stand.",
  ],
  "welcome:morning": ["Good morning! Fresh hands, fresh music.", "Morning! A short warm-up first?", "Morning! The piano is ready."],
  "welcome:evening": ["Good evening. Something calm tonight?", "Evening! Time for some music.", "Evening practice. Lovely."],
  "welcome:late": ["It's late. One gentle piece, then rest.", "Late session. Keep it short and soft.", "Night practice. Quietly does it."],
  "welcome:back": ["Back again today! Lovely.", "Round two today. Nice.", "Welcome back. More music?"],
  "welcome:streak": ["{n} days in a row!", "Day {n} of your streak!", "{n} days running. Nice habit."],
  "welcome:piece": ["{title}, from bar {bar}?", "We left {title} at bar {bar}.", "Bar {bar} of {title} is waiting."],
  treat: ["Yum! Thank you!", "A treat! Delicious.", "Mm! That was lovely."],
  "treat:earned": ["A treat for the jar!", "Treat earned. Nice work!", "One more in the jar."],
  levelup: ["We're getting close. ♥{n}", "♥{n}! Good friends now.", "♥{n}. Thanks for the music."],
  hello: ["I'm back!", "Hello again!", "Here I am."],
  "view:practice": ["Back to the music!", "Let's make {title} sing.", "Stand's ready, bench is warm."],
  "view:library": [
    "So many pieces… pick one that makes you smile.",
    "Library time! What are we in the mood for?",
    "Ooh, I like the covers in here.",
  ],
  "view:exercises": [
    "Warm-up? Your fingers will thank you.",
    "A quick sight-reading sprint?",
    "Short and sweet: one exercise, then music.",
  ],
  "view:progress": [
    "Look! {minutes} minutes of music so far.",
    "Every little session adds up.",
    "{minutes} minutes at the piano so far.",
  ],
  pause: ["Nice. Take a breath.", "Paused. Want to loop that bit?", "Good stopping place."],
  milestone: ["Bar {bar}! Lovely.", "Bar {bar}. Keep the line singing.", "That phrase was pretty."],
  halfway: ["Halfway there!", "Half the piece already!"],
  streak: ["{n} in a row!", "{n} right! You're on fire.", "{n} notes and counting!"],
  miss: ["Oops. Try that one again.", "Almost! Look at the next note.", "Shake it off. Next one!"],
  finish: [
    "Bravo! {title}, start to finish!",
    "That was beautiful. Encore?",
    "Applause! Take a bow.",
  ],
  "finish:ovation": ["Bravo! {acc}% on {title}!", "{acc}%, start to finish. Take a bow!", "Encore! {acc}% on {title}."],
  "finish:great": ["{acc}% on {title}. Lovely playing!", "Great run: {acc}%!", "{acc}%! That one sang."],
  "finish:good": [
    "{acc}%. A steady run. Loop bars {a}–{b} next?",
    "Good work: {acc}%. Bars {a}–{b} again, a bit slower?",
    "{acc}% on {title}. One more pass?",
  ],
  "finish:keepgoing": [
    "Good start. Try bars {a}–{b} in Wait mode next.",
    "Bars {a}–{b} at half speed will settle it.",
    "One hand at a time on bars {a}–{b}?",
  ],
  "finish:best": ["New best on {title}: {acc}%!", "A personal best: {acc}%!", "Best yet on {title}: {acc}%."],
  "miss:run": ["That passage bit back. Loop it slowly?", "Tricky spot! Try it in Wait mode.", "Those bars want a slower pass."],
  tickle: ["Hahaha! Stop, stop!", "Hehe! That tickles!", "Okay okay, you win!"],
  pet: ["Mm, that's nice.", "Aww. Thank you.", "Happy companion."],
  dizzy: ["…the room is spinning. 晕了", "Whoa. Everything's moving."],
  "quiet:on": ["Quiet mode. I'll just watch.", "Shh. Face only from now on."],
  "pokes:many": ["Okay okay, I'm awake! 好啦好啦", "That's a lot of pokes!"],
  news: ["I saved something to tell you!", "Now that you're free, a little news."],
  wake: ["*yawn* …oh! Hi again.", "I was dreaming of arpeggios.", "Mm? Are we playing?"],
  poke: [
    "Hehe, that tickles!",
    "Tricky bar? Try Wait for me.",
    "Expressive playback breathes at every phrase end.",
    "Loop two bars, then speed up a little each time.",
    "I'm {name}. {zh}!",
  ],
  "backing:open": ["Band practice! Pick a sound for {title}.", "Ooh, let's add a band!", "Who's joining us today?"],
  "backing:on": ["The band is in!", "Now you have friends playing along.", "Here we go, together!"],
  "backing:off": ["Solo piano it is.", "Just you and the keys.", "Quiet stage. I like it."],
  "backing:auto": ["I'll choose what suits this piece.", "Let the score decide!"],
  "backing:acoustic": ["Guitar, bass and a soft beat. Let's jam!", "Acoustic! Very café."],
  "backing:piano": ["A piano duet! I'll take the other hand.", "Four hands, one piano."],
  "backing:strings": ["Strings… so dreamy.", "A little orchestra hush."],
  "backing:score": ["Straight from the score. It follows your tempo.", "Written notes, your speed."],
  "backing:audio": ["Bring your own track. I'll keep time.", "A real recording? Fancy!"],
  "backing:loud": ["Whoa, the band is loud!", "Easy! My ears!"],
  "backing:soft": ["Shh… a whisper of a band.", "So soft I can barely hear it."],
  "backing:preview": ["Here's a taste…", "Listen…"],
  import: ["New music! I can't wait to read it.", "Fresh pages!"],
  goal: ["Daily goal reached!", "Goal done! Anything more is a bonus."],
  settings: ["Make it yours.", "Tweaking the studio?"],
};

const turns = new Map();

/** A line for an event, filled with context. Rotates through variants so the
 * same event never says the same thing twice in a row. */
export function buddyLine(event, context = {}) {
  const list = LINES[event];
  if (!list?.length) return "";
  const turn = turns.get(event) ?? Math.floor(Math.abs(hash(`${event}:${context.name || ""}`)) % list.length);
  turns.set(event, turn + 1);
  const template = list[turn % list.length];
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    context[key] == null || context[key] === "" ? "" : String(context[key]),
  ).replace(/\s+([.,!?])/g, "$1").replace(/\s{2,}/g, " ").trim();
}

function hash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  return h;
}

export const BUDDY_EVENTS = Object.freeze(Object.keys(LINES));
