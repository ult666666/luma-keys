import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  Heart,
  History,
  Lock,
  MoreHorizontal,
  Minus,
  RotateCcw,
  Search,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import CompanionPortrait from "./CompanionPortrait.jsx";
import CompanionPresence from "./CompanionPresence.jsx";
import CompanionReply from "./CompanionReply.jsx";
import { companionFor } from "./companions.mjs";
import {
  appendCompanionExchange,
  planCompanionTurn,
  scoreContextId,
} from "./companion-conversation.mjs";
import {
  makeCompanionContext,
  shouldUseCompanionModel,
} from "./companion-prompt.mjs";
import { keyLabel } from "./music.mjs";
import {
  CONVERSATION_LANGUAGES,
  conversationLanguage,
  conversationLanguageName,
  conversationLanguagePreference,
  localizeActionReceipt,
} from "./companion-language.mjs";
import {
  chatCopy,
  chatGroups,
  chatSource,
  chatStarters,
  chatStatus,
  chatUiLanguage,
  readChatTextSize,
  toggleChatHeart,
  writeChatTextSize,
} from "./chat-ui.mjs";

const immediate = new Set([
  "seek-bar",
  "repeat-bars",
  "set-speed",
  "set-hand",
  "set-mode",
  "navigate",
  "open-settings",
  "import-score",
]);
const scoped = new Set([
  "seek-bar",
  "repeat-bars",
  "set-speed",
  "set-hand",
  "set-mode",
]);
const messageId = () => crypto.randomUUID();
const languageOptions = Object.values(CONVERSATION_LANGUAGES);
const lessonLanguageNotes = {
  "zh-Hant": "樂譜步驟目前使用英文或簡體中文。",
  ja: "楽譜に基づく手順は現在、英語または簡体字中国語で表示されます。",
  ko: "악보에 따른 연습 단계는 현재 영어 또는 중국어 간체로 표시됩니다.",
  es: "Los pasos basados en la partitura están en inglés o chino simplificado.",
  fr: "Les étapes de la partition sont en anglais ou en chinois simplifié.",
  de: "Die Notenanleitung ist derzeit auf Englisch oder vereinfachtem Chinesisch.",
  pt: "As etapas da partitura estão em inglês ou chinês simplificado.",
  it: "I passaggi dello spartito sono in inglese o cinese semplificato.",
  ru: "Шаги по нотам пока доступны на английском или упрощённом китайском.",
  ar: "خطوات التدريب المستندة إلى النوتة متاحة حاليًا بالإنجليزية أو الصينية المبسطة.",
  hi: "स्वरलिपि पर आधारित चरण अभी अंग्रेज़ी या सरलीकृत चीनी में उपलब्ध हैं।",
};
const starterIcons = {
  book: <BookOpen size={15} aria-hidden="true" />,
  history: <History size={15} aria-hidden="true" />,
  sparkle: <Sparkles size={15} aria-hidden="true" />,
  search: <Search size={15} aria-hidden="true" />,
  numbers: (
    <span className="chat-number-icon" aria-hidden="true">
      1–7
    </span>
  ),
};
// localStorage can be missing or throw (private windows, blocked storage).
function localStore() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export default function MaestroPanel({
  profile = companionFor("beethoven"),
  onChangeCompanion,
  pieces,
  currentScore,
  journal,
  currentBar,
  loop = null,
  resumeBar = 0,
  practiceGoal = null,
  speed,
  hand,
  mode,
  guide,
  tipsEnabled,
  onTipsChange,
  onAction,
  onBack,
  conversation,
  model,
  tonic,
  labels,
  onClose,
  onMinimize,
  minimized = false,
  suspended = false,
}) {
  const [draft, setDraft] = useState("");
  const [options, setOptions] = useState(false);
  const [unread, setUnread] = useState(false);
  const [acting, setActing] = useState(null);
  const [petReply, setPetReply] = useState("");
  const [replyMotion, setReplyMotion] = useState(false);
  const [composing, setComposing] = useState(false);
  const [textSize, setTextSize] = useState(() =>
    readChatTextSize(localStore()),
  );
  const [hearts, setHearts] = useState(() => new Set());
  const [copied, setCopied] = useState(null);
  const [announcement, setAnnouncement] = useState("");
  const [clearNotice, setClearNotice] = useState("");
  const askGeneration = useRef(0);
  const [pop, setPop] = useState(0);
  const petTimer = useRef();
  const waitingForModel = useRef(false);
  const interactionCount = useRef(0);
  const lastReply = useRef(null);
  const replyTimer = useRef();
  const copiedTimer = useRef();
  const input = useRef();
  const transcript = useRef();
  const optionsPanel = useRef();
  const optionsButton = useRef();
  const optionsByKeyboard = useRef(false);
  const atBottom = useRef(true);
  const lastScrollTop = useRef(0);
  const expectedScores = useRef(new Map());
  // Messages already on screen when the panel opened do not animate in, nor
  // does a streamed reply when it settles into the transcript.
  const openingIds = useRef(null);
  const streamedIds = useRef(new Set());
  const { messages, ready, error, update, retry } = conversation;
  if (ready && !openingIds.current)
    openingIds.current = new Set(messages.map((message) => message.id));
  useEffect(() => {
    // Keep identity guards only while their actions are still in the transcript.
    // This runs after a turn commits, so an immediate command can use its guard
    // synchronously before its receipt replaces the proposed action.
    const retainedActions = new Set(
      messages.flatMap((message) =>
        (message.actions || []).map((action) => action.id),
      ),
    );
    for (const id of expectedScores.current.keys())
      if (!retainedActions.has(id)) expectedScores.current.delete(id);
  }, [messages]);
  const { pending, failure, availability } = model;
  useEffect(() => {
    if (availability.available && !minimized && !suspended) model.warm?.();
  }, [availability.available, minimized, suspended, model.warm]);
  if (pending?.id) streamedIds.current.add(pending.id);
  const language = conversationLanguage(messages, draft);
  const traditional = language === "zh-Hant";
  const zh = language === "zh" || traditional;
  const ui = chatUiLanguage(language);
  const copy = chatCopy(language);
  const uiLang = ui === "zh" ? "zh-Hans" : ui === "zh-Hant" ? "zh-Hant" : "en";
  useEffect(() => () => {
    askGeneration.current++;
    model.cancel();
  }, [model.cancel]);
  const revision = useMemo(() => scoreContextId(currentScore), [currentScore]);
  useEffect(() => {
    askGeneration.current++;
    waitingForModel.current = false;
    model.cancel();
    setPetReply("");
  }, [revision, profile.id, model.cancel]);
  useEffect(() => {
    if (suspended || minimized) {
      askGeneration.current++;
      waitingForModel.current = false;
      model.cancel();
    }
  }, [suspended, minimized, model.cancel]);
  useEffect(() => {
    if (ready && !minimized && !suspended) input.current?.focus();
  }, [ready, minimized, suspended]);
  useEffect(() => {
    if (minimized || suspended) setOptions(false);
  }, [minimized, suspended]);
  const loopFrom = Number.isInteger(loop?.from) ? loop.from : null;
  const loopTo = Number.isInteger(loop?.to) ? loop.to : null;
  // The passage a question is about depends on the question (“bar 12”), the
  // repeat loop, the saved place and the last lesson card, so the bounded
  // model context is built per message.
  const modelContextFor = (message, history = messages) =>
    makeCompanionContext({
      currentScore,
      currentBar,
      speed,
      hand,
      mode,
      guide: { title: guide?.title, text: guide?.text },
      journal,
      tonic,
      labels,
      loop: loopFrom && loopTo ? { from: loopFrom, to: loopTo } : null,
      resumeBar,
      request: message,
      history,
      pieces,
      // Daily goal from Settings, for “how long should I practise today?”.
      goal: practiceGoal,
    });
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.kind !== "receipt");
  const currentLesson =
    lastAssistant?.lesson?.scoreRevision === revision &&
    lastAssistant?.lesson?.scoreId === (currentScore.id || null)
      ? lastAssistant
      : null;
  const chineseLesson = currentLesson?.lesson.language === "zh";
  const latestMessageId = messages.at(-1)?.id;
  const latestMessageRole = messages.at(-1)?.role;
  useEffect(() => {
    const changed = lastReply.current && lastReply.current !== latestMessageId;
    lastReply.current = latestMessageId || null;
    clearTimeout(replyTimer.current);
    setReplyMotion(false);
    if (!changed || latestMessageRole !== "assistant") return;
    setReplyMotion(true);
    replyTimer.current = setTimeout(() => setReplyMotion(false), 2400);
  }, [latestMessageId, latestMessageRole]);
  useEffect(
    () => () => {
      clearTimeout(petTimer.current);
      clearTimeout(replyTimer.current);
      clearTimeout(copiedTimer.current);
    },
    [],
  );
  // One polite line when a reply starts. The finished reply is read once,
  // when it joins the transcript log, never character by character.
  const pendingId = pending?.id || null;
  useEffect(() => {
    if (!pendingId) {
      setAnnouncement("");
      return;
    }
    const author = companionFor(pending?.companionId || profile.id);
    setAnnouncement(copy.typing(author.name, author.zh));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingId]);
  function greetPet() {
    if (zh) {
      const lines = traditional
        ? [
            "我在呢，一起慢慢練。",
            "給你一個小小的加油！",
            "難的地方，我們一小節一小節來。",
          ]
        : [
            "我在呢，一起慢慢练。",
            "给你一个小小的加油！",
            "难的地方，我们一小节一小节来。",
          ];
      setPetReply(lines[interactionCount.current++ % lines.length]);
      clearTimeout(petTimer.current);
      petTimer.current = setTimeout(() => setPetReply(""), 4000);
      return;
    }
    const lines = {
      mozart: [
        "A small bow. Ready for a little music?",
        "One hand first. I’ll keep our place.",
      ],
      beethoven: [
        "A little wave. Let’s take it one bar at a time.",
        "Tricky passage? We can slow it down.",
      ],
      langlang: [
        "Hello again! Let’s find your first notes.",
        "A relaxed hand and a little patience.",
      ],
      liszt: [
        "A bow for my duet partner.",
        "Big leaps, small steps. We have time.",
      ],
      cat: [
        "Prr. Your place is saved.",
        "One paw at a time. Or hand, in your case.",
      ],
      bunny: [
        "A little hello, just for you.",
        "Small steps. Those are my favourite.",
      ],
    }[profile.id];
    setPetReply(lines[interactionCount.current++ % lines.length]);
    clearTimeout(petTimer.current);
    petTimer.current = setTimeout(() => setPetReply(""), 4800);
  }
  const retryCurrent = useMemo(
    () =>
      !failure ||
      (failure.request.companionId === profile.id &&
        failure.request.scoreRevision === revision &&
        JSON.stringify(failure.request.body.context) ===
          JSON.stringify(modelContextFor(failure.request.body.message))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      failure,
      messages,
      profile.id,
      revision,
      currentScore,
      currentBar,
      speed,
      hand,
      mode,
      guide?.title,
      guide?.text,
      journal,
      tonic,
      labels,
      loopFrom,
      loopTo,
      resumeBar,
      pieces,
      practiceGoal,
    ],
  );
  const copyLabels = useMemo(() => {
    const titles = new Map(),
      labels = new Map();
    for (const piece of pieces) {
      const title = piece.title.trim().toLocaleLowerCase();
      if (!titles.has(title)) titles.set(title, []);
      titles.get(title).push(piece.id);
    }
    for (const ids of titles.values())
      if (ids.length > 1)
        ids
          .sort()
          .forEach((id, index) => labels.set(id, `Saved copy ${index + 1}`));
    return labels;
  }, [pieces]);
  const versions = useMemo(
    () => new Map(pieces.map((piece) => [piece.id, scoreContextId(piece)])),
    [pieces],
  );

  function scrollLatest() {
    transcript.current?.scrollTo({
      top: transcript.current.scrollHeight,
      behavior: "instant",
    });
    lastScrollTop.current = transcript.current?.scrollTop || 0;
    atBottom.current = true;
    setUnread(false);
  }
  useEffect(() => {
    const el = transcript.current;
    // Native scroll events can arrive after a streamed text commit. Detect a
    // move toward older messages directly, before the follow-bottom effect
    // can undo it. Resizing/clamping at the bottom should keep following.
    if (
      el &&
      el.scrollTop < lastScrollTop.current - 1 &&
      el.scrollHeight - el.clientHeight - el.scrollTop > 72
    )
      atBottom.current = false;
    if (atBottom.current) scrollLatest();
    else setUnread(true);
    if (el) lastScrollTop.current = el.scrollTop;
  }, [messages.at(-1)?.id, pending?.message, !!pending, ready]);
  useEffect(() => {
    // Larger text reflows every message: stay at the latest one if we were.
    if (atBottom.current) scrollLatest();
  }, [textSize]);
  useEffect(() => {
    if (!input.current) return;
    input.current.style.height = "auto";
    input.current.style.height = `${Math.min(112, Math.max(44, input.current.scrollHeight))}px`;
  }, [draft, textSize]);

  // The options popover: focus moves in when it opens; a click outside or
  // tabbing away closes it; Escape closes it and returns to ⋯ (below).
  useEffect(() => {
    if (!options) return;
    optionsPanel.current
      ?.querySelector("button, select, input")
      ?.focus({ focusVisible: optionsByKeyboard.current });
    const outside = (event) => {
      if (
        !optionsPanel.current?.contains(event.target) &&
        !optionsButton.current?.contains(event.target)
      )
        setOptions(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [options]);
  function closeOptions(focusOpener = true) {
    setOptions(false);
    if (focusOpener)
      requestAnimationFrame(() => optionsButton.current?.focus());
  }
  function onPanelKeyDown(event) {
    if (
      event.key !== "Escape" ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    // One step back at a time: the popover first, then the panel itself.
    if (options) closeOptions(true);
    else onMinimize?.({ returnFocus: true });
  }

  function chooseTextSize(value) {
    setTextSize(value);
    writeChatTextSize(localStore(), value);
  }
  function toggleHeart(id) {
    setHearts((current) => {
      const next = toggleChatHeart(
        current,
        id,
        new Set(messages.map((message) => message.id)),
      );
      return next;
    });
  }
  function newChat() {
    askGeneration.current++;
    waitingForModel.current = false;
    model.cancel();
    model.dismiss();
    update([]);
    expectedScores.current.clear();
    streamedIds.current.clear();
    openingIds.current = new Set();
    lastReply.current = null;
    clearTimeout(petTimer.current);
    clearTimeout(replyTimer.current);
    clearTimeout(copiedTimer.current);
    setDraft("");
    setPetReply("");
    setReplyMotion(false);
    setHearts(new Set());
    setCopied(null);
    setAnnouncement("");
    setClearNotice(copy.cleared);
    setUnread(false);
    setOptions(false);
    atBottom.current = true;
    input.current?.focus({ preventScroll: true });
  }
  async function copyReply(message) {
    const generation = askGeneration.current;
    const text = message.message || "";
    let done = false;
    try {
      await navigator.clipboard.writeText(text);
      done = true;
    } catch {
      const previous = document.activeElement;
      try {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.cssText = "position:fixed;opacity:0;pointer-events:none";
        document.body.append(area);
        area.select();
        done = document.execCommand("copy");
        area.remove();
      } catch {}
      previous?.focus?.();
    }
    if (!done || generation !== askGeneration.current) return;
    setCopied(message.id);
    setAnnouncement(copy.copiedAnnounce);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => {
      setCopied(null);
      setAnnouncement("");
    }, 1600);
  }

  function stale(action) {
    if (action.type === "open-piece")
      return (
        !versions.has(action.pieceId) ||
        (action.scoreRevision &&
          versions.get(action.pieceId) !== action.scoreRevision)
      );
    if (!scoped.has(action.type)) return false;
    const captured = expectedScores.current.get(action.id);
    if (captured && captured !== currentScore) return true;
    return (
      action.scoreId !== (currentScore.id || null) ||
      !action.scoreRevision ||
      action.scoreRevision !== revision
    );
  }
  function perform(action, lesson = null) {
    if (stale(action))
      return {
        message:
          "That action belongs to an earlier version of the piece. Ask again for the current score.",
        applied: false,
      };
    try {
      return localizeActionReceipt(
        action,
        onAction(action, currentScore, {
          keepConversation: !!lesson,
          lesson,
        }) || {
          message: action.label || "Done.",
          applied: true,
        },
        language,
      );
    } catch {
      return {
        message: "That action could not be completed. Your practice is paused.",
        applied: false,
      };
    }
  }
  function act(action, lesson = null) {
    if (acting || pending) return;
    setActing(action.id);
    const result = perform(action, lesson);
    update((history) => [
      ...history,
      {
        id: messageId(),
        role: "assistant",
        source: "local",
        intent: "command",
        ...(result.applied === false ? {} : { kind: "receipt" }),
        companionId: profile.id,
        ...(conversationLanguagePreference(messages)
          ? { languagePreference: conversationLanguagePreference(messages) }
          : {}),
        scoreId: currentScore.id || null,
        scoreRevision: revision,
        message: result.message,
        actions: [],
      },
    ]);
    setActing(null);
  }
  async function ask(text) {
    const value = text.trim();
    if (
      !value ||
      !ready ||
      pending ||
      waitingForModel.current ||
      value.length > 2000
    )
      return;
    const generation = ++askGeneration.current;
    setClearNotice("");
    setOptions(false);
    const context = {
      pieces,
      currentScore,
      journal,
      currentBar,
      loop: loopFrom && loopTo ? { from: loopFrom, to: loopTo } : null,
      resumeBar,
      speed,
      hand,
      mode,
      guide,
      tonic,
      labels,
      companionId: profile.id,
    };
    lastScrollTop.current = transcript.current?.scrollTop || 0;
    lastReply.current = messages.at(-1)?.id || "asked";
    let answer = planCompanionTurn(value, context, messages);
    answer = { ...answer, companionId: profile.id };
    let status = availability;
    if (
      !status.available &&
      status.reason === "checking" &&
      shouldUseCompanionModel(answer)
    ) {
      waitingForModel.current = true;
      try {
        status = await model.whenReady();
      } finally {
        if (generation === askGeneration.current) waitingForModel.current = false;
      }
    }
    if (generation !== askGeneration.current) return;
    if (status.available && shouldUseCompanionModel(answer)) {
      atBottom.current = true;
      model.send({
        message: value,
        companionId: profile.id,
        scoreId: currentScore.id || null,
        scoreRevision: revision,
        context: modelContextFor(value),
        history: messages,
      });
      setDraft("");
      input.current?.focus();
      return;
    }
    model.dismiss();
    for (const action of answer.actions || [])
      expectedScores.current.set(action.id, currentScore);
    if (
      answer.intent === "command" &&
      answer.actions?.length === 1 &&
      immediate.has(answer.actions[0].type)
    ) {
      const result = perform(answer.actions[0]);
      answer = {
        ...answer,
        message: result.message,
        actions: [],
        ...(result.applied === false ? {} : { kind: "receipt" }),
      };
    }
    atBottom.current = true;
    update((history) => appendCompanionExchange(history, value, answer));
    setDraft("");
    input.current?.focus();
  }
  function submit() {
    if (!draft.trim() || !ready || pending) return;
    setPop((n) => n + 1);
    ask(draft);
  }
  function actionCard(action, lesson = null) {
    const piece =
      action.type === "open-piece"
        ? pieces.find((p) => p.id === action.pieceId)
        : null;
    const disabled = stale(action);
    return (
      <button
        key={action.id}
        type="button"
        className="chat-action"
        disabled={disabled || !!pending || acting === action.id}
        aria-label={[action.label, copyLabels.get(action.pieceId)]
          .filter(Boolean)
          .join(" · ")}
        title={
          disabled
            ? "This piece has changed. Ask again to get a current action."
            : undefined
        }
        onClick={() => act(action, lesson)}
      >
        <span>
          <strong>{piece ? piece.title : action.label}</strong>
          {piece && (
            <small>
              {[
                copyLabels.get(piece.id),
                keyLabel(piece),
                `${piece.measures} bars`,
              ]
                .filter(Boolean)
                .join(" · ")}
              {` · ${action.bar > 1 ? `Resume at bar ${action.bar}` : "Open at bar 1"}`}
            </small>
          )}
          {disabled && <small>Piece changed · ask again</small>}
        </span>
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    );
  }

  const status = chatStatus({
    available: availability.available,
    reason: availability.reason,
    pending: !!pending,
    text: !!pending?.message,
  });
  const starters = chatStarters({
    language,
    bar: currentBar,
    model: availability.available,
  });
  const handName = copy.hands[hand] || copy.hands.both;
  const speedPercent = Math.round(speed * 100);
  const contextExtras = [
    speedPercent !== 100 ? `${speedPercent}%` : null,
    hand === "left" || hand === "right" ? copy.handShort[hand] : null,
  ].filter(Boolean);
  // “Moonlight Sonata · I. Adagio sostenuto” greets as “Moonlight Sonata”.
  const shortTitle =
    currentScore.title?.length > 28
      ? currentScore.title.split(/\s+[·—–]\s+/)[0]
      : currentScore.title;
  const contextText = [
    currentScore.title,
    copy.bar(currentBar),
    ...contextExtras,
  ].join(" · ");
  const groups = chatGroups(messages, profile.id);
  const latestReplyId = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.kind !== "receipt")?.id;
  const pendingAuthor = companionFor(pending?.companionId || profile.id);
  const availabilityNotice = {
    en: {
      appleIntelligenceNotEnabled:
        "Turn on Apple Intelligence in System Settings for conversations.",
      modelNotReady:
        "Apple’s on-device model is getting ready. Practice commands are available.",
      other: "On-device chat is unavailable. Practice commands are available.",
    },
    zh: {
      appleIntelligenceNotEnabled:
        "请在“系统设置”中打开 Apple 智能以使用对话。",
      modelNotReady: "本机模型正在准备，练习指令可以先用。",
      other: "本机聊天暂不可用，练习指令仍可使用。",
    },
    "zh-Hant": {
      appleIntelligenceNotEnabled:
        "請在「系統設定」中開啟 Apple Intelligence 以使用對話。",
      modelNotReady: "本機模型正在準備，練習指令可以先用。",
      other: "本機聊天暫時無法使用，練習指令仍可使用。",
    },
  }[ui];

  function renderMessage(message, { groupEnd, author }) {
    const source = chatSource(message);
    if (message.kind === "receipt")
      return (
        <article
          key={message.id}
          className={`chat-message chat-message-assistant chat-receipt${enters(message) ? " chat-enter" : ""}`}
          aria-label={copy.source.receipt}
        >
          <div className="chat-message-avatar" aria-hidden="true" />
          <div className="chat-message-main">
            <p className="chat-receipt-pill" dir="auto">
              <Check size={14} aria-hidden="true" />
              <span>{message.message}</span>
            </p>
          </div>
        </article>
      );
    const user = message.role === "user";
    const interrupted = message.kind === "interrupted";
    const liked = hearts.has(message.id);
    const latest = message.id === latestReplyId;
    return (
      <article
        key={message.id}
        className={`chat-message chat-message-${message.role}${groupEnd ? " is-group-end" : ""}${enters(message) ? " chat-enter" : ""}`}
        aria-label={
          user
            ? copy.you
            : [author.name, interrupted ? copy.stopped : copy.source[source]]
                .filter(Boolean)
                .join(" · ")
        }
      >
        {!user && (
          <div className="chat-message-avatar" aria-hidden="true">
            {groupEnd && (
              <span className="chat-face" data-character={author.id}>
                <CompanionPortrait character={author.id} mood="idle" />
              </span>
            )}
          </div>
        )}
        <div className="chat-message-main">
          <div className="chat-bubble" dir="auto">
            {message.lesson && (
              <div className="chat-lesson-heading">
                <span>
                  {message.lesson.language === "zh" ? "小节" : "Bar"}{" "}
                  {message.lesson.from}
                  {message.lesson.to > message.lesson.from
                    ? `–${message.lesson.to}`
                    : ""}
                </span>
                <span className="chat-lesson-steps">
                  <span aria-hidden="true">
                    {[0, 1, 2].map((step) => (
                      <i
                        key={step}
                        data-active={step === message.lesson.step}
                      />
                    ))}
                    {message.lesson.step + 1} / 3
                  </span>
                  <span className="sr-only">
                    {`Lesson step ${message.lesson.step + 1} of 3`}
                  </span>
                </span>
              </div>
            )}
            {message.lesson ? (
              <div className="chat-lesson-copy">
                {message.message
                  .split(/\n\s*\n/)
                  .filter(Boolean)
                  .map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
              </div>
            ) : message.source === "on-device" ? (
              <CompanionReply text={message.message} />
            ) : (
              <p dir="auto">{message.message}</p>
            )}
            {message.id === currentLesson?.id &&
              lessonLanguageNotes[language] && (
                <p
                  className="chat-lesson-action-note"
                  data-lesson-language-note
                >
                  {lessonLanguageNotes[language]}
                </p>
              )}
            {!!message.lesson && !!message.actions?.length && (
              <p className="chat-lesson-action-note">
                {message.lesson.language === "zh"
                  ? "设置这一段，播放保持暂停。"
                  : "Set up this passage. Playback stays paused."}
              </p>
            )}
          </div>
          {!!message.actions?.length && (
            <div
              className={`chat-actions${message.lesson ? " chat-lesson-actions" : ""}`}
              role="group"
              aria-label={
                message.lesson ? "Set up this passage" : copy.suggestions
              }
            >
              {message.actions.map((action) =>
                actionCard(action, message.lesson),
              )}
            </div>
          )}
          {!user && (
            <div
              className="chat-tools"
              data-pinned={latest || liked || interrupted ? "true" : "false"}
            >
              {interrupted ? (
                <span className="chat-source chat-source-stopped">
                  <Square size={9} fill="currentColor" aria-hidden="true" />
                  {copy.stopped}
                </span>
              ) : (
                <span className="chat-source">{copy.source[source]}</span>
              )}
              <button
                type="button"
                className="chat-tool chat-heart"
                aria-label={copy.like}
                aria-pressed={liked}
                title={liked ? copy.liked : copy.like}
                onClick={() => toggleHeart(message.id)}
              >
                <Heart
                  size={15}
                  fill={liked ? "currentColor" : "none"}
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                className="chat-tool"
                aria-label={copy.copy}
                title={copied === message.id ? copy.copied : copy.copy}
                onClick={() => copyReply(message)}
              >
                {copied === message.id ? (
                  <Check size={15} aria-hidden="true" />
                ) : (
                  <Copy size={15} aria-hidden="true" />
                )}
              </button>
            </div>
          )}
        </div>
      </article>
    );
  }
  function enters(message) {
    return (
      !!openingIds.current &&
      !openingIds.current.has(message.id) &&
      !streamedIds.current.has(message.id)
    );
  }

  return (
    <div
      className="companion-chat"
      data-companion={profile.id}
      data-text-size={textSize}
      lang={uiLang}
      onKeyDown={onPanelKeyDown}
    >
      <header className="chat-heading">
        <div className="chat-avatar">
          <CompanionPresence
            character={profile.id}
            language={language}
            className="chat-header-presence"
            mood={
              pending
                ? pending.message
                  ? "speaking"
                  : "thinking"
                : replyMotion
                  ? "happy"
                  : composing && draft.trim()
                    ? "listening"
                    : "idle"
            }
            onInteract={greetPet}
          />
          <span
            className="chat-greeting"
            role="status"
            data-visible={petReply ? "true" : "false"}
          >
            {petReply}
          </span>
        </div>
        {/* One line: the status word drops out (wraps out of sight) when a
            long name leaves no room; the dot and its tooltip remain. */}
        <div
          className="chat-identity"
          data-status={status}
          title={copy.statusLong[status]}
        >
          <h2>
            <span className="chat-name">{profile.name}</span>
            <span className="chat-name-zh" lang="zh-Hans">
              {profile.zh}
            </span>
          </h2>
          <span className="chat-status-dot" aria-hidden="true" />
          <span className="chat-status-label" aria-hidden="true">
            {copy.status[status]}
          </span>
          <span className="sr-only">{copy.statusLong[status]}</span>
        </div>
        <div className="chat-window-actions">
          <button
            type="button"
            ref={optionsButton}
            className="chat-icon-button"
            aria-label={copy.options}
            title={copy.optionsTitle}
            aria-haspopup="dialog"
            aria-expanded={options}
            aria-controls={options ? "chat-options" : undefined}
            onClick={(event) => {
              // A keyboard press (detail 0) shows the ring on the first option.
              optionsByKeyboard.current = event.detail === 0;
              setOptions((v) => !v);
            }}
          >
            <MoreHorizontal size={18} aria-hidden="true" />
          </button>
          {/* In the DOM right after ⋯, so Tab moves from it into the options. */}
          {options && (
            <div
              className="chat-options"
              id="chat-options"
              role="dialog"
              aria-label={copy.optionsTitle}
              ref={optionsPanel}
              onBlur={(event) => {
                const next = event.relatedTarget;
                if (
                  next &&
                  !optionsPanel.current?.contains(next) &&
                  next !== optionsButton.current
                )
                  setOptions(false);
              }}
            >
              <section className="chat-options-group">
                <h3>{copy.companion}</h3>
                <div className="chat-options-companion">
                  <span
                    className="chat-face"
                    data-character={profile.id}
                    aria-hidden="true"
                  >
                    <CompanionPortrait character={profile.id} mood="idle" />
                  </span>
                  <span className="chat-options-who">
                    <strong>{profile.name}</strong>
                    <small>{profile.tagline}</small>
                  </span>
                  <button
                    type="button"
                    className="chat-pill-button"
                    aria-label={copy.changeCompanion}
                    onClick={() => {
                      setOptions(false);
                      onChangeCompanion();
                    }}
                  >
                    {copy.change}
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </section>
              <section className="chat-options-group">
                <h3>{copy.conversation}</h3>
                <label className="chat-option-row chat-language">
                  <span>{copy.language}</span>
                  <select
                    aria-label="Conversation language"
                    value={language}
                    disabled={!ready || !!pending}
                    onChange={(e) => {
                      const savedDraft = draft;
                      ask(
                        `Please reply in ${conversationLanguageName(e.target.value)}.`,
                      );
                      setDraft(savedDraft);
                    }}
                  >
                    {languageOptions.map(({ code, nativeName }) => (
                      <option
                        key={code}
                        value={code}
                        lang={code === "zh" ? "zh-Hans" : code}
                      >
                        {nativeName}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset className="chat-option-row chat-text-size">
                  <legend>{copy.textSize}</legend>
                  <div className="chat-segmented">
                    {["normal", "large"].map((value) => (
                      <label key={value} data-value={value}>
                        <input
                          type="radio"
                          name="chat-text-size"
                          value={value}
                          checked={textSize === value}
                          onChange={() => chooseTextSize(value)}
                        />
                        <span>{copy[value]}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </section>
              <section className="chat-options-group">
                <h3>{copy.whilePlaying}</h3>
                <label className="chat-option-check">
                  <input
                    type="checkbox"
                    checked={tipsEnabled}
                    onChange={(e) => onTipsChange(e.target.checked)}
                    aria-label={`${profile.name} playing tips`}
                  />
                  <span>{copy.tips}</span>
                </label>
              </section>
              <p className="chat-privacy">
                <Lock size={13} aria-hidden="true" />
                <span>
                  {availability.available ? copy.privacy : copy.privacyOff}
                </span>
              </p>
              <p className="chat-fineprint">
                {[availability.available && availability.model, copy.fictional]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          )}
          <button
            type="button"
            className="chat-icon-button"
            aria-label={copy.minimize}
            title={copy.minimize}
            onClick={() => onMinimize?.()}
          >
            <Minus size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="chat-icon-button"
            aria-label={copy.close}
            title={copy.close}
            onClick={onClose}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="chat-context">
        <button
          type="button"
          className="chat-context-chip"
          onClick={onBack}
          aria-label={copy.contextLabel(
            contextText,
            currentScore.measures,
            speedPercent,
            handName,
          )}
          title={`${currentScore.title} · ${copy.bar(currentBar)} / ${currentScore.measures} · ${speedPercent}% · ${handName}`}
        >
          <BookOpen size={14} aria-hidden="true" />
          <span className="chat-context-title">{currentScore.title}</span>
          <span className="chat-context-bar">
            {contextText.slice(currentScore.title.length)}
          </span>
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="chat-session-bar">
        <span title={copy.temporaryDetail} id="chat-temporary-notice">
          <Lock size={12} aria-hidden="true" />{copy.temporary}
          <span className="sr-only">. {copy.temporaryDetail}</span>
        </span>
        <button type="button" className="chat-new" onClick={newChat}>
          <RotateCcw size={13} aria-hidden="true" />{copy.newChat}
        </button>
      </div>
      <div className="chat-body">
        <div
          className="chat-transcript"
          ref={transcript}
          tabIndex={0}
          role="region"
          aria-label={copy.log(profile.name, profile.zh)}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget || event.altKey || event.metaKey || event.ctrlKey) return;
            const el = event.currentTarget;
            const step = Math.max(40, el.clientHeight * 0.8);
            const delta = { ArrowDown: 40, ArrowUp: -40, PageDown: step, PageUp: -step }[event.key];
            if (delta === undefined && event.key !== "Home" && event.key !== "End" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            el.scrollTop = event.key === "Home" ? 0 : event.key === "End" ? el.scrollHeight : el.scrollTop + (delta ?? (event.shiftKey ? -step : step));
            lastScrollTop.current = el.scrollTop;
            atBottom.current = el.scrollHeight - el.clientHeight - el.scrollTop < 72;
            if (atBottom.current) setUnread(false);
          }}
          onScroll={() => {
            const el = transcript.current;
            lastScrollTop.current = el.scrollTop;
            atBottom.current =
              el.scrollHeight - el.clientHeight - el.scrollTop < 72;
            if (atBottom.current) setUnread(false);
          }}
        >
          {!ready && !error && (
            <p className="chat-loading" role="status">
              {copy.opening}
            </p>
          )}
          {ready && !messages.length && !pending && (
            <div className="chat-welcome">
              <CompanionPresence
                decorative
                autoWave
                character={profile.id}
                language={language}
                className="chat-welcome-figure"
              />
              <p className="chat-welcome-line">
                {copy.welcome(profile, shortTitle)}
              </p>
              <div
                className="chat-starters"
                role="group"
                aria-label={copy.suggestions}
              >
                {starters.map((starter) => (
                  <button
                    key={starter.id}
                    type="button"
                    className="chat-chip"
                    data-starter={starter.id}
                    onClick={() => {
                      if (starter.prefill) {
                        setDraft(starter.message);
                        input.current?.focus();
                      } else ask(starter.message);
                    }}
                  >
                    {starterIcons[starter.icon]}
                    <span>{starter.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div
            className="chat-log"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-label={copy.log(profile.name, profile.zh)}
            data-text-size={textSize}
          >
            {groups.map((group) => {
              const author = companionFor(group.author || profile.id);
              return group.messages.map((message, index) =>
                renderMessage(message, {
                  author,
                  groupEnd: index === group.messages.length - 1,
                }),
              );
            })}
          </div>
          {pending && (
            <article
              key={pending.id}
              className="chat-message chat-message-assistant is-group-end chat-pending chat-enter"
              aria-label={copy.replying(pendingAuthor.name, pendingAuthor.zh)}
              aria-busy="true"
            >
              <div className="chat-message-avatar" aria-hidden="true">
                <span className="chat-face" data-character={pendingAuthor.id}>
                  <CompanionPortrait
                    character={pendingAuthor.id}
                    mood="listening"
                  />
                </span>
              </div>
              <div className="chat-message-main">
                <div
                  className={`chat-bubble${pending.message ? " is-streaming" : " is-typing"}`}
                  dir="auto"
                >
                  {pending.message ? (
                    <CompanionReply text={pending.message} />
                  ) : (
                    <span className="chat-typing">
                      <i />
                      <i />
                      <i />
                      <span className="sr-only">
                        {copy.typing(pendingAuthor.name, pendingAuthor.zh)}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </article>
          )}
        </div>
        {unread && (
          <button type="button" className="chat-latest" onClick={() => { scrollLatest(); transcript.current?.focus({ preventScroll: true }); }}>
            <ArrowDown size={14} aria-hidden="true" />
            {copy.latest}
          </button>
        )}
      </div>
      {failure && !pending && (
        <div
          className="chat-notice"
          role={failure.stopped ? "status" : "alert"}
        >
          <span>
            {retryCurrent
              ? failure.stopped
                ? `${copy.stopped}.`
                : failure.message
              : copy.changed}
          </span>
          <button
            type="button"
            className="chat-notice-action"
            aria-label={copy.retryReply}
            disabled={!retryCurrent}
            onClick={() => {
              if (!retryCurrent) return;
              lastScrollTop.current = transcript.current?.scrollTop || 0;
              atBottom.current = true;
              model.retry();
            }}
          >
            <RotateCcw size={14} aria-hidden="true" />
            {copy.retry}
          </button>
          <button
            type="button"
            className="chat-icon-button chat-notice-dismiss"
            aria-label={copy.dismiss}
            onClick={model.dismiss}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      )}
      {!availability.available && availability.reason !== "checking" && (
        <div className="chat-notice chat-notice-quiet">
          <span>
            {availabilityNotice[availability.reason] ||
              availabilityNotice.other}
          </span>
          <button
            type="button"
            className="chat-notice-action"
            onClick={model.check}
          >
            {copy.checkAgain}
          </button>
        </div>
      )}
      {error && (
        <div className="chat-notice chat-notice-error" role="alert">
          <span>
            {error}
            {ready &&
              " Your conversation is still here until you close the app."}
          </span>
          <button type="button" className="chat-notice-action" onClick={retry}>
            <RotateCcw size={14} aria-hidden="true" />
            {copy.retry}
          </button>
        </div>
      )}
      {ready && messages.length > 0 && (
        <div className="chat-quick" role="group" aria-label={copy.suggestions}>
          {currentLesson ? (
            <>
              <button
                type="button"
                className="chat-chip"
                aria-disabled={pending ? "true" : undefined}
                onClick={() => ask(chineseLesson ? "下一步" : "Next step")}
              >
                {chineseLesson ? "下一步" : "Next step"}
                <ArrowRight size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="chat-chip"
                aria-disabled={pending ? "true" : undefined}
                onClick={() =>
                  ask(chineseLesson ? "简单一点" : "Make it simpler")
                }
              >
                {chineseLesson ? "简单一点" : "Make it simpler"}
              </button>
              <button
                type="button"
                className="chat-chip"
                aria-disabled={pending ? "true" : undefined}
                onClick={() =>
                  ask(chineseLesson ? "用左手练" : "Teach me the left hand")
                }
              >
                {chineseLesson ? "试试左手" : "Try left hand"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="chat-chip"
                aria-disabled={pending ? "true" : undefined}
                onClick={() =>
                  ask(zh ? "教我这一小段" : "Teach me this passage")
                }
              >
                <BookOpen size={14} aria-hidden="true" />
                {zh
                  ? traditional
                    ? "教我這一段"
                    : "教我这一段"
                  : "Teach me this passage"}
              </button>
              <button
                type="button"
                className="chat-chip"
                aria-disabled={pending ? "true" : undefined}
                onClick={() =>
                  ask(zh ? "我上次练到哪里了？" : "Where did I leave off?")
                }
              >
                <History size={14} aria-hidden="true" />
                {zh
                  ? traditional
                    ? "上次練到哪"
                    : "上次练到哪"
                  : "Where did I leave off?"}
              </button>
            </>
          )}
        </div>
      )}
      <form
        className="chat-composer"
        data-hint={composing && !draft ? "on" : "off"}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="sr-only" htmlFor="maestro-question">
          {copy.ask(profile.name, profile.zh)}
        </label>
        <div className="chat-composer-input">
          <textarea
            id="maestro-question"
            dir="auto"
            ref={input}
            value={draft}
            rows={1}
            maxLength={2000}
            disabled={!ready}
            aria-describedby="maestro-question-hint chat-temporary-notice"
            placeholder={copy.placeholder(profile)}
            onFocus={() => setComposing(true)}
            onBlur={() => setComposing(false)}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                e.nativeEvent.keyCode !== 229
              ) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button
            className={`chat-send${pending ? " chat-stop" : ""}`}
            type={pending ? "button" : "submit"}
            aria-label={pending ? copy.stop : copy.send}
            title={pending ? copy.stop : copy.send}
            disabled={!pending && (!draft.trim() || !ready)}
            data-pop={pop ? (pop % 2 ? "a" : "b") : undefined}
            onClick={pending ? model.cancel : undefined}
          >
            {pending ? (
              <Square size={12} fill="currentColor" aria-hidden="true" />
            ) : (
              <ArrowUp size={18} aria-hidden="true" />
            )}
          </button>
        </div>
        <span className="chat-hint" id="maestro-question-hint">
          <span aria-hidden="true">{copy.hint}</span>
          <span className="sr-only">{copy.hintSr}</span>
        </span>
      </form>
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement || clearNotice}
      </div>
    </div>
  );
}
