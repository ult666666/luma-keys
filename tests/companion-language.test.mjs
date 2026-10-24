import test from "node:test";
import assert from "node:assert/strict";
import {
  CONVERSATION_LANGUAGES,
  isConversationLanguage,
  conversationLanguageName,
  languageAcknowledgement,
  explicitConversationLanguage,
  conversationLanguage,
  conversationLanguagePreference,
  languageRequest,
  companionActionLabel,
  companionActionReceipt,
  localizeActionReceipt,
  replyLanguageFits,
  openedAtStart,
} from "../src/companion-language.mjs";

test("standalone language requests have a definite local acknowledgement route", () => {
  for (const input of [
    "能用中文回答我吗？",
    "请用中文回复我。",
    "可以用中文聊天吗？",
    "用中文回答",
    "Can you answer me in Chinese?",
    "Chinese please",
    "从现在开始请一直用中文回答我。",
  ]) {
    assert.equal(explicitConversationLanguage(input), "zh", input);
    assert.equal(languageRequest(input), "zh", input);
  }
  for (const input of [
    "请用英文回答我",
    "Please answer in English.",
    "English please",
    "Can you reply in English?",
    "Please speak English from now on.",
  ])
    assert.equal(languageRequest(input), "en", input);
  assert.equal(
    languageRequest("请用中文，解释这小节"),
    null,
    "mixed question is not swallowed by acknowledgement",
  );
});

test("explicit preferences survive English follow-ups, while a later switch takes precedence", () => {
  const messages = [
    { role: "user", message: "能用中文回答我吗？" },
    { role: "assistant", message: "可以。", languagePreference: "zh" },
  ];
  for (const draft of [
    "What do you mean?",
    "Next step",
    "How can I practise better?",
    "👍",
  ])
    assert.equal(conversationLanguage(messages, draft), "zh", draft);
  assert.equal(
    conversationLanguage(messages, "Please answer in English."),
    "en",
  );
  assert.equal(
    conversationLanguagePreference(
      [{ role: "assistant", languagePreference: "zh" }],
      "How are you?",
    ),
    "zh",
    "persisted preference survives a truncated model history",
  );
  assert.equal(
    conversationLanguagePreference([
      { role: "assistant", message: "Answer in English." },
    ]),
    null,
    "assistant prose cannot change a preference",
  );
});

test("ordinary language changes remain possible without an explicit preference", () => {
  const messages = [{ role: "user", message: "这首曲子好难。" }];
  assert.equal(conversationLanguage(messages, "What is rhythm?"), "en");
  assert.equal(conversationLanguage(messages, "Next step"), "zh");
  assert.equal(conversationLanguage(messages, ""), "zh");
  assert.equal(conversationLanguagePreference(messages), null);
});

test("negated and quoted language phrases do not become preferences", () => {
  for (const message of [
    "Do not answer in English",
    "不要用中文",
    'What does "answer in Chinese" mean?',
    'Translate "use English" into Chinese',
  ])
    assert.equal(explicitConversationLanguage(message), null, message);
  assert.equal(explicitConversationLanguage("不要用中文，请用英文"), "en");
  assert.equal(
    explicitConversationLanguage(
      "Please answer in English; actually use Chinese",
    ),
    "zh",
  );
  assert.equal(
    explicitConversationLanguage("How do you say hello in Chinese?"),
    null,
  );
});

test("localized proposed action labels keep edition identity and never claim execution", () => {
  const action = {
    type: "open-piece",
    bar: 49,
    label: "Open 晴天 · Chord Arrangement · bar 49",
  };
  assert.equal(
    companionActionLabel(action, "zh"),
    "打开晴天 · Chord Arrangement · 第49小节",
  );
  assert.equal(companionActionLabel(action, "en"), action.label);
  assert.equal(
    companionActionLabel(
      { type: "set-speed", speed: 0.7, label: "70% speed" },
      "zh",
    ),
    "70%速度",
  );
  assert.equal(
    companionActionReceipt({ type: "set-speed", speed: 0.7 }, "zh"),
    "速度已设为70%。",
  );
  assert.equal(
    companionActionReceipt({ type: "set-speed", speed: 0.7 }, "en"),
    null,
    "existing English receipt remains caller-owned",
  );
});

test("receipt localization cannot turn failure or an unconfirmed action into success", () => {
  const action = { type: "set-speed", speed: 0.5 };
  for (const result of [
    { applied: false, message: "The piece changed." },
    { message: "No confirmation." },
    null,
  ])
    assert.strictEqual(localizeActionReceipt(action, result, "zh"), result);
  const result = {
    applied: true,
    message: "Speed set to 50%. Ready at bars 4–5; playback is paused.",
  };
  assert.deepEqual(localizeActionReceipt(action, result, "zh"), {
    applied: true,
    message: "速度已设为50%。 已就位第4–5小节，播放暂停。",
  });
  assert.equal(
    result.message,
    "Speed set to 50%. Ready at bars 4–5; playback is paused.",
    "original result stays intact",
  );
  for (const [place, translated] of [
    ["repeat", "循环片段"],
    ["piece", "乐曲"],
  ]) {
    const reset = {
      applied: true,
      message: `Left hand selected. Returned to the start of the ${place}.`,
    };
    assert.equal(
      localizeActionReceipt({ type: "set-hand", hand: "left" }, reset, "zh")
        .message,
      `已选择左手。 已回到${translated}的开头。`,
    );
  }
  assert.equal(
    localizeActionReceipt(
      action,
      {
        applied: true,
        message: "Speed set to 50%. Your position is unchanged.",
      },
      "zh",
    ).message,
    "速度已设为50%。 当前位置不变。",
  );
});

const languageRequests = [
  ["en", "Please speak English from now on."],
  ["zh", "请以后都用简体中文回答我。"],
  ["zh-Hant", "請用繁體中文回覆我。"],
  ["ja", "日本語で答えてください。"],
  ["ko", "한국어로 답해 주세요."],
  ["es", "Respóndeme en español."],
  ["fr", "Réponds-moi en français."],
  ["de", "Bitte antworte auf Deutsch."],
  ["pt", "Responda em português, por favor."],
  ["it", "Rispondi in italiano."],
  ["ru", "Отвечай по-русски, пожалуйста."],
  ["ar", "أجب بالعربية من فضلك"],
  ["hi", "कृपया हिंदी में जवाब दें।"],
];

test("the immutable catalog and validation share exactly 13 canonical languages", () => {
  assert.deepEqual(
    Object.keys(CONVERSATION_LANGUAGES),
    languageRequests.map(([code]) => code),
  );
  assert.ok(Object.isFrozen(CONVERSATION_LANGUAGES));
  for (const [code] of languageRequests) {
    assert.ok(isConversationLanguage(code));
    assert.ok(Object.isFrozen(CONVERSATION_LANGUAGES[code]));
    assert.equal(CONVERSATION_LANGUAGES[code].code, code);
    assert.ok(CONVERSATION_LANGUAGES[code].nativeName);
    assert.equal(
      conversationLanguageName(code),
      CONVERSATION_LANGUAGES[code].name,
    );
    assert.ok(languageAcknowledgement(code).length < 80);
  }
  for (const invalid of [
    null,
    {},
    [],
    "toString",
    "__proto__",
    "constructor",
    "FR",
    "zh-CN",
    "xx",
    "",
  ]) {
    assert.equal(isConversationLanguage(invalid), false);
    assert.equal(conversationLanguageName(invalid), "English");
    assert.equal(
      companionActionReceipt({ type: "seek-bar", bar: 4 }, invalid),
      null,
    );
  }
});

test("native and named requests choose a local acknowledgement in every language", () => {
  for (const [code, request] of languageRequests) {
    assert.equal(explicitConversationLanguage(request), code, request);
    assert.equal(languageRequest(request), code, request);
    assert.equal(conversationLanguage([], request), code, request);
    assert.equal(
      languageRequest(`Please reply in ${conversationLanguageName(code)}.`),
      code,
      code,
    );
  }
  for (const request of [
    "Traditional Chinese please",
    "請以繁體中文回答我",
    "請之後使用繁體中文回覆我",
  ])
    assert.equal(languageRequest(request), "zh-Hant", request);
  assert.equal(languageRequest("Please switch to French."), "fr");
  assert.equal(languageRequest("これから日本語で話してください。"), "ja");
  assert.equal(languageRequest("앞으로 한국어로 대답해 주세요."), "ko");
  assert.equal(languageRequest("Réponds en français s’il te plaît."), "fr");
});

test("all explicit preferences survive subsequent questions and truncated history", () => {
  for (const [code, request] of languageRequests) {
    const original = [
      { role: "user", message: request },
      {
        role: "assistant",
        message: languageAcknowledgement(code),
        languagePreference: code,
      },
    ];
    const roundTrip = JSON.parse(JSON.stringify(original));
    for (const draft of [
      "Next step",
      "What do you mean?",
      "Can you find 晴天?",
      "👍",
    ]) {
      assert.equal(
        conversationLanguage(roundTrip, draft),
        code,
        `${code}: ${draft}`,
      );
      assert.equal(
        conversationLanguage(roundTrip.slice(-1), draft),
        code,
        "metadata survives a bounded model history",
      );
    }
    assert.equal(
      conversationLanguage(roundTrip, "Please reply in English."),
      "en",
    );
    assert.equal(
      conversationLanguagePreference([{ role: "assistant", message: request }]),
      null,
      "assistant prose is not a request",
    );
  }
});

test("automatic detection distinguishes native scripts and conservative Latin clues", () => {
  const examples = [
    ["ja", "この曲の練習方法を教えてください"],
    ["ja", "こんにちは"],
    ["ko", "이 곡을 어떻게 연습하면 좋을까요?"],
    ["ru", "Как мне лучше практиковаться?"],
    ["ar", "كيف أتمرن على هذه المقطوعة؟"],
    ["hi", "मैं इस धुन का अभ्यास कैसे करूँ?"],
    ["zh", "这首曲子要怎么练习？"],
    ["zh-Hant", "這首曲子要怎麼練習？"],
    ["es", "¿Cómo puedo practicar 晴天?"],
    ["fr", "Comment puis je pratiquer 晴天 ?"],
    ["de", "Wie kann ich dieses Stück üben?"],
    ["pt", "Como posso praticar 晴天?"],
    ["it", "Come posso esercitarmi con 晴天?"],
    ["en", "Can we practise 晴天 slowly?"],
  ];
  for (const [code, message] of examples) {
    assert.equal(conversationLanguage([], message), code, message);
    assert.equal(
      conversationLanguagePreference([{ role: "user", message }]),
      null,
      "automatic detection is not a saved opt-in",
    );
  }
  assert.equal(
    conversationLanguage([], "Liszt piano"),
    "en",
    "isolated title/name does not invent a language preference",
  );
});

test("brief acknowledgements do not erase the language of the last substantive turn", () => {
  const messages = [
    { role: "user", message: "Comment puis je pratiquer ?" },
    { role: "assistant", message: "..." },
    { role: "user", message: "ok" },
  ];
  for (const draft of ["Next step", "👍", "", "2", "merci"])
    assert.equal(conversationLanguage(messages, draft), "fr", draft);
  assert.equal(
    conversationLanguage(messages, "What does this marking mean?"),
    "en",
    "substantive unpinned question can switch language",
  );
  assert.equal(
    conversationLanguage(
      [{ role: "assistant", lesson: { language: "zh" } }],
      "Next step",
    ),
    "zh",
    "old lesson language remains a valid fallback",
  );
});

test("negations, quotations, translation and learning-language statements do not persist a switch", () => {
  const ignored = [
    "Do not ever speak French.",
    "No need to speak French.",
    "Please do not use French.",
    "I want to learn to speak French.",
    "I can speak Spanish.",
    "不要用繁體中文",
    "No habla en español",
    "Ne réponds pas en français",
    "Não responda em português",
    "Не отвечай по-русски",
    "Translate this into French: please answer in Spanish.",
    "请翻译“用繁體中文回答我”。",
    "Explain the phrase “reply in Korean”.",
    "She said «Réponds en français».",
    "What does 'speak Italian' mean?",
  ];
  for (const input of ignored) {
    assert.equal(explicitConversationLanguage(input), null, input);
    assert.equal(languageRequest(input), null, input);
    assert.equal(
      conversationLanguagePreference([{ role: "user", message: input }]),
      null,
      input,
    );
  }
  assert.equal(
    explicitConversationLanguage(
      "Do not use English; please reply in Spanish.",
    ),
    "es",
  );
  assert.equal(
    explicitConversationLanguage("請不要用简体中文，請用繁體中文回覆我。"),
    "zh-Hant",
  );
  assert.equal(
    explicitConversationLanguage(
      "Please answer in French; actually use Japanese.",
    ),
    "ja",
  );
});

test("mixed content keeps the question instead of consuming it as a language-only switch", () => {
  for (const [code, request] of languageRequests) {
    const mixed = `${request} What notes do I play next?`;
    assert.equal(explicitConversationLanguage(mixed), code);
    assert.equal(languageRequest(mixed), null, mixed);
  }
  assert.equal(
    languageRequest("Please speak French and explain the numbers."),
    null,
  );
});

test("all localized action families preserve score identity, exact ranges and confirmed-state details", () => {
  const original = Object.freeze({
    type: "open-piece",
    pieceId: "sunny-chords",
    scoreRevision: "rev-123",
    bar: 49,
    label: "Open 晴天 · Chord Arrangement · bar 49",
  });
  const actions = [
    original,
    { type: "seek-bar", bar: 12, label: "Go to bar 12" },
    { type: "repeat-bars", from: 4, to: 8, label: "Repeat bars 4–8" },
    { type: "set-speed", speed: 0.65, label: "65% speed" },
    ...["left", "right", "both"].map((hand) => ({
      type: "set-hand",
      hand,
      label: hand,
    })),
    ...["listen", "wait", "perform"].map((mode) => ({
      type: "set-mode",
      mode,
      label: mode,
    })),
    ...["library", "exercises", "progress", "practice"].map((view) => ({
      type: "navigate",
      view,
      label: view,
    })),
    { type: "open-settings", label: "Settings" },
    { type: "import-score", label: "Import" },
    { type: "show-help", topic: "numbers", label: "Numbers" },
    { type: "show-help", topic: "commands", label: "Help" },
  ];
  for (const [code] of languageRequests.filter(([code]) => code !== "en")) {
    assert.ok(
      companionActionLabel(original, code).includes("晴天 · Chord Arrangement"),
    );
    assert.ok(companionActionLabel(original, code).includes("49"));
    assert.ok(companionActionLabel(actions[2], code).includes("4–8"));
    assert.ok(companionActionLabel(actions[3], code).includes("65%"));
    for (const action of actions) {
      assert.equal(
        typeof companionActionLabel(action, code),
        "string",
        `${code}: ${action.type}`,
      );
      assert.equal(
        typeof companionActionReceipt(action, code),
        "string",
        `${code}: ${action.type}`,
      );
      const failed = { applied: false, message: "The score changed." };
      assert.strictEqual(localizeActionReceipt(action, failed, code), failed);
      const result = localizeActionReceipt(
        action,
        {
          applied: true,
          message:
            "Done. Ready at bars 4–8; playback is paused. Your position is unchanged.",
        },
        code,
      );
      assert.ok(result.message.includes("4–8"));
      assert.ok(!result.message.includes("undefined"));
    }
    for (const hand of ["unknown", null])
      assert.equal(
        companionActionReceipt({ type: "set-hand", hand }, code),
        null,
      );
  }
  assert.equal(original.scoreRevision, "rev-123");
  assert.equal(original.label, "Open 晴天 · Chord Arrangement · bar 49");
  assert.equal(
    companionActionLabel({ type: "delete-piece", label: "Unknown" }, "fr"),
    "Unknown",
  );
  assert.equal(companionActionReceipt({ type: "delete-piece" }, "fr"), null);
  assert.match(
    companionActionLabel({ type: "import-score" }, "zh-Hant"),
    /匯入樂譜/,
  );
});

test("negation with intervening modifiers never overwrites a saved language preference", () => {
  const existing = [
    { role: "assistant", languagePreference: "zh-Hant", message: "可以。" },
  ];
  const ignored = [
    "I do not want you to answer in French.",
    "I don't really want you to reply in Spanish.",
    "I do not want you to change to Spanish.",
    "Please do not always answer in English.",
    "Please try not to use German.",
    "I do not think you should speak Italian.",
    "It is not necessary to reply in Portuguese.",
    "请不要一直用英文回答。",
    "不要再用日语回复我。",
    "別總是用英文回答我。",
    "请不要继续使用简体中文回答。",
    "不希望你一直用韩语回答我。",
  ];
  for (const message of ignored) {
    assert.equal(explicitConversationLanguage(message), null, message);
    assert.equal(languageRequest(message), null, message);
    assert.equal(
      conversationLanguagePreference([{ role: "user", message }]),
      null,
      message,
    );
    assert.equal(
      conversationLanguagePreference(existing, message),
      "zh-Hant",
      message,
    );
    assert.equal(
      conversationLanguagePreference([...existing, { role: "user", message }]),
      "zh-Hant",
      message,
    );
  }
});

test("a positive follow-up clause still wins after a negated language request", () => {
  const requests = [
    ["Not French, use Spanish.", "es"],
    ["I do not want you to answer in French; please use Spanish.", "es"],
    ["Please do not always answer in English, but reply in Japanese.", "ja"],
    ["Don't use German. Please speak Italian.", "it"],
    ["请不要一直用英文回答，请用繁體中文回覆我。", "zh-Hant"],
    ["不要再用日语回复我，請用英文回答。", "en"],
    ["別總是用英文回答我；改用中文回答。", "zh"],
    ["Don't worry, please use French.", "fr"],
    ["Don't forget to reply in Spanish.", "es"],
  ];
  for (const [message, language] of requests) {
    assert.equal(explicitConversationLanguage(message), language, message);
    assert.equal(
      conversationLanguagePreference([{ role: "user", message }]),
      language,
      message,
    );
  }
});

test("short Chinese switch requests are acknowledged locally, never sent to the model as questions", () => {
  for (const input of ["中文", "中文吧", "你会中文吗？", "您会说中文吗", "换成中文吧", "能不能换成中文", "那就用中文吧", "好，用中文", "in Chinese please", "会说中文吗？"])
    assert.equal(languageRequest(input), "zh", input);
  for (const input of ["English", "english please", "换成英文吧", "你会英文吗？"])
    assert.equal(languageRequest(input), "en", input);
  for (const input of ["我会中文", "我不会中文", "不要用中文", "中文歌推荐一下", "这首歌的中文名是什么？", "I can speak Spanish."])
    assert.equal(languageRequest(input), null, input);
  assert.equal(explicitConversationLanguage("我会中文"), null, "a statement about the learner is not a preference");
});

test("reply language checks ignore titles, note names and code, and need enough text to decide", () => {
  assert.equal(replyLanguageFits("《Appassionata · III. Allegro ma non troppo — Presto》第153小节确实不容易，先把右手的八度单独慢练。", "zh"), true);
  assert.equal(replyLanguageFits("This line of code does not evaluate to a value. It prints the text.", "zh"), false);
  assert.equal(replyLanguageFits("这里是Presto，速度很快，可以先用Listen & follow模式听一遍。", "zh"), true);
  assert.equal(replyLanguageFits("Bar 6 of 晴天 (Sunny Day) repeats B3-D4-G4 chords.", "en", { names: ["晴天 (Sunny Day)"] }), null, "too little text so far");
  assert.equal(replyLanguageFits("Bar 6 of 晴天 (Sunny Day) repeats B3-D4-G4 chords.", "en", { names: ["晴天 (Sunny Day)"], final: true }), true);
  assert.equal(replyLanguageFits("第6小节重复B3、D4、G4的和弦，左手弹G2。", "en"), false);
  assert.equal(replyLanguageFits("Sure, start slowly with the right hand and count out loud for this bar.", "es"), false);
  assert.equal(replyLanguageFits("Claro, empieza despacio con la mano derecha y cuenta en voz alta.", "es"), true);
  assert.equal(replyLanguageFits("好的，我们先慢慢来，一次只练一小节。", "ja"), false, "Chinese is not Japanese");
  assert.equal(replyLanguageFits("Hi!", "zh"), null);
  assert.equal(replyLanguageFits("Hi!", "zh", { final: true }), false, "a finished English reply is still English");
  assert.equal(replyLanguageFits("👍 C4", "zh", { final: true }), true, "nothing language-bearing to judge");
  assert.equal(replyLanguageFits("anything", "klingon"), true);
});

test("a receipt that opened or moved the piece to bar 1 means the learner chose bar 1", () => {
  const receipt = (message) => ({ id: message, role: "assistant", source: "local", intent: "command", kind: "receipt", actions: [], scoreId: "x", message });
  assert.equal(openedAtStart([receipt("Opened Appassionata at bar 1. Press Play when ready.")]), true);
  assert.equal(openedAtStart([receipt("Opened Appassionata at bar 153. Press Play when ready.")]), false);
  assert.equal(openedAtStart([receipt("已打开乐曲，停在第1小节。")]), true);
  assert.equal(openedAtStart([receipt("已開啟樂曲，停在第1小節。")]), true);
  assert.equal(openedAtStart([receipt("曲を開きました。1小節目です。")]), true);
  assert.equal(openedAtStart([receipt("Moved to bar 1 of Appassionata.")]), true);
  // Speed or hand receipts leave the position alone; a later seek or loop moves on.
  assert.equal(openedAtStart([receipt("已打开乐曲，停在第1小节。"), receipt("速度已设为60%。")]), true);
  assert.equal(openedAtStart([receipt("已打开乐曲，停在第1小节。"), receipt("已跳到第20小节。")]), false);
  assert.equal(openedAtStart([receipt("已打开乐曲，停在第1小节。"), receipt("已设为循环第150–156小节。")]), false);
  assert.equal(openedAtStart([receipt("Opened X at bar 1. Press Play when ready."), { role: "assistant", source: "local", intent: "resume", actions: [], message: "“X” was last practiced at bar 9." }]), true);
  assert.equal(openedAtStart([]), false);
});
