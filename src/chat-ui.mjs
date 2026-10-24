// Pure helpers for the companion chat panel: interface copy, suggestions,
// status, grouping and local preferences.
// No React and no DOM, so every rule here is covered by node --test.

/** Interface language for the panel's own words (messages keep theirs). */
export function chatUiLanguage(language) {
  return language === "zh-Hant" ? "zh-Hant" : language === "zh" ? "zh" : "en";
}

const COPY = {
  en: {
    temporary: "Temporary chat",
    temporaryDetail: "Messages disappear when you quit or reload. New chat clears them now.",
    newChat: "New chat",
    cleared: "Chat cleared. Your music and progress are unchanged.",
    options: "Options",
    optionsTitle: "Conversation options",
    minimize: "Minimize",
    close: "Close",
    companion: "Companion",
    change: "Change",
    changeCompanion: "Change companion",
    conversation: "Conversation",
    language: "Language",
    textSize: "Text size",
    normal: "Normal",
    large: "Large",
    whilePlaying: "While playing",
    tips: "Show tips while playing",
    privacy:
      "Messages are temporary and disappear when you quit or reload. Replies are generated on this Mac and can be mistaken.",
    privacyOff:
      "Messages are temporary and disappear when you quit or reload. The on-device model is unavailable; practice commands still work.",
    fictional: "Companions are fictional, not the musicians themselves.",
    status: {
      ready: "On device",
      thinking: "Thinking…",
      writing: "Typing…",
      checking: "Connecting…",
      offline: "Tools only",
    },
    statusLong: {
      ready: "On-device chat is ready",
      thinking: "Thinking about a reply",
      writing: "Writing a reply",
      checking: "Connecting to the on-device model",
      offline: "On-device chat is unavailable; practice commands still work",
    },
    log: (name) => `Conversation with ${name}`,
    you: "You",
    typing: (name) => `${name} is typing…`,
    replying: (name) => `${name} is replying`,
    stopped: "Stopped",
    source: {
      "on-device": "On device",
      lesson: "From your score",
      local: "Practice tool",
      receipt: "Practice update",
    },
    copy: "Copy reply",
    copied: "Copied",
    copiedAnnounce: "Reply copied.",
    like: "Like this reply",
    liked: "Liked",
    send: "Send",
    stop: "Stop reply",
    retry: "Retry",
    retryReply: "Retry reply",
    dismiss: "Dismiss",
    checkAgain: "Check again",
    latest: "Latest messages",
    ask: (name) => `Ask ${name}`,
    placeholder: (profile) => `Ask ${profile.name}…`,
    hint: "↵ Send · Shift ↵ New line",
    hintSr: "Press Return to send, Shift Return for a new line.",
    suggestions: "Suggestions",
    // Starts with the chip's visible words (label in name), then the rest.
    contextLabel: (visible, measures, speed, hand) =>
      `${visible}. ${measures} bars. Back to Practice: ${speed}% speed, ${hand}.`,
    bar: (n) => `bar ${n}`,
    hands: { both: "both hands", left: "left hand", right: "right hand" },
    handShort: { left: "LH", right: "RH" },
    opening: "Opening conversation…",
    welcome: (profile, title) =>
      title
        ? `Hi! I’m ${profile.name}. Shall we look at “${title}” together?`
        : `Hi! I’m ${profile.name}. What shall we play today?`,
    changed:
      "Practice changed. Send a new message to use the current piece and settings.",
  },
  zh: {
    temporary: "临时聊天",
    temporaryDetail: "退出或重新载入后清空消息。点新对话可立即清空。",
    newChat: "新对话",
    cleared: "对话已清空。乐谱和练习进度保持不变。",
    options: "选项",
    optionsTitle: "对话选项",
    minimize: "最小化",
    close: "关闭",
    companion: "伙伴",
    change: "更换",
    changeCompanion: "换个伙伴",
    conversation: "对话",
    language: "语言",
    textSize: "文字大小",
    normal: "标准",
    large: "大",
    whilePlaying: "弹奏时",
    tips: "弹奏时显示提示",
    privacy:
      "消息不存入文件，退出或重新载入后清空。回复在本机生成，可能有误。",
    privacyOff:
      "消息不存入文件，退出或重新载入后清空。本机模型暂不可用，练习指令仍可使用。",
    fictional: "伙伴均为虚构角色，并非音乐家本人。",
    status: {
      ready: "在本机",
      thinking: "想一想…",
      writing: "正在写…",
      checking: "连接中…",
      offline: "仅练习工具",
    },
    statusLong: {
      ready: "本机聊天已就绪",
      thinking: "正在思考回复",
      writing: "正在写回复",
      checking: "正在连接本机模型",
      offline: "本机聊天不可用，练习指令仍可使用",
    },
    log: (name, zh) => `和${zh || name}的对话`,
    you: "你",
    typing: (name, zh) => `${zh || name}正在输入…`,
    replying: (name, zh) => `${zh || name}正在回复`,
    stopped: "已停止",
    source: {
      "on-device": "本机生成",
      lesson: "来自乐谱",
      local: "练习工具",
      receipt: "练习已更新",
    },
    copy: "复制回复",
    copied: "已复制",
    copiedAnnounce: "已复制回复。",
    like: "喜欢这条回复",
    liked: "已喜欢",
    send: "发送",
    stop: "停止回复",
    retry: "再试一次",
    retryReply: "再试一次",
    dismiss: "关闭提示",
    checkAgain: "再检查一次",
    latest: "最新消息",
    ask: (name, zh) => `问问${zh || name}`,
    placeholder: (profile) => `和${profile.zh || profile.name}聊聊…`,
    hint: "↵ 发送 · Shift ↵ 换行",
    hintSr: "按回车发送，Shift 加回车换行。",
    suggestions: "建议",
    contextLabel: (visible, measures, speed, hand) =>
      `${visible}，共 ${measures} 小节。回到练习：速度 ${speed}%，${hand}。`,
    bar: (n) => `第 ${n} 小节`,
    hands: { both: "双手", left: "左手", right: "右手" },
    handShort: { left: "左手", right: "右手" },
    opening: "正在打开对话…",
    welcome: (profile, title) =>
      title
        ? `嗨，我是${profile.zh || profile.name}！一起看看《${title}》吧？`
        : `嗨，我是${profile.zh || profile.name}！今天想弹什么？`,
    changed: "练习设置已改变。请重新发送消息，以使用当前乐谱和设置。",
  },
  "zh-Hant": {
    temporary: "暫時聊天",
    temporaryDetail: "結束或重新載入後清空訊息。點新對話可立即清空。",
    newChat: "新對話",
    cleared: "對話已清空。樂譜和練習進度保持不變。",
    options: "選項",
    optionsTitle: "對話選項",
    minimize: "最小化",
    close: "關閉",
    companion: "夥伴",
    change: "更換",
    changeCompanion: "換個夥伴",
    conversation: "對話",
    language: "語言",
    textSize: "文字大小",
    normal: "標準",
    large: "大",
    whilePlaying: "彈奏時",
    tips: "彈奏時顯示提示",
    privacy:
      "訊息不存入檔案，結束或重新載入後清空。回覆在本機產生，可能有誤。",
    privacyOff:
      "訊息不存入檔案，結束或重新載入後清空。本機模型暫不可用，練習指令仍可使用。",
    fictional: "夥伴均為虛構角色，並非音樂家本人。",
    status: {
      ready: "在本機",
      thinking: "想一想…",
      writing: "正在寫…",
      checking: "連線中…",
      offline: "僅練習工具",
    },
    statusLong: {
      ready: "本機聊天已就緒",
      thinking: "正在思考回覆",
      writing: "正在寫回覆",
      checking: "正在連線本機模型",
      offline: "本機聊天無法使用，練習指令仍可使用",
    },
    log: (name, zh) => `和${zh || name}的對話`,
    you: "你",
    typing: (name, zh) => `${zh || name}正在輸入…`,
    replying: (name, zh) => `${zh || name}正在回覆`,
    stopped: "已停止",
    source: {
      "on-device": "本機產生",
      lesson: "來自樂譜",
      local: "練習工具",
      receipt: "練習已更新",
    },
    copy: "複製回覆",
    copied: "已複製",
    copiedAnnounce: "已複製回覆。",
    like: "喜歡這則回覆",
    liked: "已喜歡",
    send: "傳送",
    stop: "停止回覆",
    retry: "再試一次",
    retryReply: "再試一次",
    dismiss: "關閉提示",
    checkAgain: "再檢查一次",
    latest: "最新訊息",
    ask: (name, zh) => `問問${zh || name}`,
    placeholder: (profile) => `和${profile.zh || profile.name}聊聊…`,
    hint: "↵ 傳送 · Shift ↵ 換行",
    hintSr: "按 Return 傳送，Shift 加 Return 換行。",
    suggestions: "建議",
    contextLabel: (visible, measures, speed, hand) =>
      `${visible}，共 ${measures} 小節。回到練習：速度 ${speed}%，${hand}。`,
    bar: (n) => `第 ${n} 小節`,
    hands: { both: "雙手", left: "左手", right: "右手" },
    handShort: { left: "左手", right: "右手" },
    opening: "正在開啟對話…",
    welcome: (profile, title) =>
      title
        ? `嗨，我是${profile.zh || profile.name}！一起看看《${title}》吧？`
        : `嗨，我是${profile.zh || profile.name}！今天想彈什麼？`,
    changed: "練習設定已改變。請重新傳送訊息，以使用目前的樂譜和設定。",
  },
};

/** The panel's own words in English, Simplified or Traditional Chinese. */
export function chatCopy(language) {
  return COPY[chatUiLanguage(language)];
}
export const CHAT_COPY_KEYS = Object.freeze(Object.keys(COPY.en));

/**
 * The one-word state beside the companion's name.
 * pending: a reply is in flight; text: it has started arriving.
 */
export function chatStatus({
  available,
  reason,
  pending = false,
  text = false,
} = {}) {
  if (pending) return text ? "writing" : "thinking";
  if (available) return "ready";
  return reason === "checking" ? "checking" : "offline";
}

/**
 * Tap-to-ask suggestions for an empty conversation, about the open piece.
 * Each entry's `message` is exactly what is sent (or, with `prefill`, put
 * in the box); phrases are ones the local planner already recognises.
 */
export function chatStarters({ language = "en", bar = 1, model = false } = {}) {
  const ui = chatUiLanguage(language);
  const n = Math.max(1, Math.round(Number(bar)) || 1);
  const rows = {
    en: [
      { id: "teach", icon: "book", message: `Teach me bar ${n}` },
      { id: "resume", icon: "history", message: "Where did I leave off?" },
      model
        ? {
            id: "focus",
            icon: "sparkle",
            message: "What should I focus on in this bar?",
          }
        : { id: "numbers", icon: "numbers", message: "Explain the numbers" },
      {
        id: "find",
        icon: "search",
        message: "find ",
        label: "Find a piece…",
        prefill: true,
      },
    ],
    zh: [
      { id: "teach", icon: "book", message: `教我第${n}小节` },
      { id: "resume", icon: "history", message: "我上次练到哪里了？" },
      model
        ? { id: "focus", icon: "sparkle", message: "这一小节要注意什么？" }
        : { id: "numbers", icon: "numbers", message: "数字是什么意思？" },
      {
        id: "find",
        icon: "search",
        message: "找 ",
        label: "找一首曲子…",
        prefill: true,
      },
    ],
    "zh-Hant": [
      { id: "teach", icon: "book", message: `教我第${n}小節` },
      { id: "resume", icon: "history", message: "我上次練到哪裡了？" },
      model
        ? { id: "focus", icon: "sparkle", message: "這一小節要注意什麼？" }
        : { id: "numbers", icon: "numbers", message: "數字是什麼意思？" },
      {
        id: "find",
        icon: "search",
        message: "找 ",
        label: "找一首曲子…",
        prefill: true,
      },
    ],
  }[ui];
  return rows.map((row) => ({ ...row, label: row.label || row.message }));
}

/** Where a reply came from, as shown under it (null: nothing to show). */
export function chatSource(message) {
  if (!message || message.role !== "assistant") return null;
  if (message.kind === "receipt") return "receipt";
  if (message.lesson) return "lesson";
  if (message.source === "on-device") return "on-device";
  return "local";
}

/**
 * Consecutive messages from the same speaker share one face and one tail.
 * Practice receipts sit on their own and never take the face.
 */
export function chatGroups(messages = [], fallbackCompanion = "") {
  const groups = [];
  for (const message of messages) {
    const author =
      message.role === "user"
        ? "user"
        : message.companionId || fallbackCompanion;
    const kind = message.kind === "receipt" ? "receipt" : "bubble";
    const last = groups.at(-1);
    if (
      last &&
      last.role === message.role &&
      last.author === author &&
      last.kind === kind
    )
      last.messages.push(message);
    else groups.push({ role: message.role, author, kind, messages: [message] });
  }
  return groups;
}

// ── Local preferences (this browser profile only) ─────────────────────────
export const CHAT_TEXT_SIZE_KEY = "luma.chat.textSize";
export const CHAT_HEARTS_KEY = "luma.chat.hearts";
const HEART_LIMIT = 200;

export function readChatTextSize(storage) {
  try {
    return storage?.getItem(CHAT_TEXT_SIZE_KEY) === "large"
      ? "large"
      : "normal";
  } catch {
    return "normal";
  }
}
export function writeChatTextSize(storage, value) {
  try {
    storage?.setItem(
      CHAT_TEXT_SIZE_KEY,
      value === "large" ? "large" : "normal",
    );
    return true;
  } catch {
    return false;
  }
}
// Old versions saved reply IDs. Remove them without loading the old values.
export function clearLegacyChatReactions(storage) {
  try { storage?.removeItem(CHAT_HEARTS_KEY); return true; }
  catch { return false; }
}
export function readChatHearts(storage) {
  clearLegacyChatReactions(storage);
  return new Set();
}
/** Toggles one reply's heart; ids no longer in the conversation are dropped. */
export function toggleChatHeart(hearts, id, liveIds = null) {
  const next = new Set(hearts);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  if (liveIds)
    for (const value of next) if (!liveIds.has(value)) next.delete(value);
  return new Set([...next].slice(-HEART_LIMIT));
}
// Compatibility for older callers: reactions are never persisted.
export function writeChatHearts(storage) {
  return clearLegacyChatReactions(storage);
}
