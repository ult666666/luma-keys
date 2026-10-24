// Conversation language is separate from score language and executable actions.
// Only an explicit request becomes a saved preference.
const languageRows = [
  ["en", "English", "English", "Of course. I’ll reply in English."],
  ["zh", "Simplified Chinese", "简体中文", "可以，我会用简体中文回复。"],
  ["zh-Hant", "Traditional Chinese", "繁體中文", "可以，我會用繁體中文回覆。"],
  ["ja", "Japanese", "日本語", "はい、日本語でお答えします。"],
  ["ko", "Korean", "한국어", "네, 한국어로 답할게요."],
  ["es", "Spanish", "Español", "Claro, responderé en español."],
  ["fr", "French", "Français", "Bien sûr, je répondrai en français."],
  ["de", "German", "Deutsch", "Gern, ich antworte auf Deutsch."],
  ["pt", "Portuguese", "Português", "Claro, vou responder em português."],
  ["it", "Italian", "Italiano", "Certo, risponderò in italiano."],
  ["ru", "Russian", "Русский", "Хорошо, буду отвечать по-русски."],
  ["ar", "Arabic", "العربية", "بالطبع، سأجيب بالعربية."],
  ["hi", "Hindi", "हिन्दी", "ज़रूर, मैं हिंदी में जवाब दूँगा।"],
];
export const CONVERSATION_LANGUAGES = Object.freeze(
  Object.fromEntries(
    languageRows.map(([code, name, nativeName]) => [
      code,
      Object.freeze({ code, name, nativeName }),
    ]),
  ),
);
export const isConversationLanguage = (code) =>
  typeof code === "string" && Object.hasOwn(CONVERSATION_LANGUAGES, code);
export const conversationLanguageName = (code) =>
  isConversationLanguage(code) ? CONVERSATION_LANGUAGES[code].name : "English";
export const languageAcknowledgement = (code) =>
  (languageRows.find((row) => row[0] === code) || languageRows[0])[3];
const text = (value) =>
  typeof value === "string" ? value.normalize("NFKC").trim() : "";

const aliases = {
  en: "English|英文|英语|英語",
  zh: "(?:simplified\\s+)?(?:Chinese|Mandarin)|简体(?:中文|汉语)?|簡體(?:中文|漢語)?|中文|汉语|漢語",
  "zh-Hant":
    "traditional\\s+(?:Chinese|Mandarin)|繁体(?:中文|汉语)?|繁體(?:中文|漢語)?",
  ja: "Japanese|日本語|日语|日語",
  ko: "Korean|한국어|韓国語|韩语|韓語",
  es: "Spanish|español|西班牙语|西班牙語",
  fr: "French|français|法语|法語",
  de: "German|Deutsch|德语|德語",
  pt: "Portuguese|português|葡萄牙语|葡萄牙語",
  it: "Italian|italiano|意大利语|義大利語",
  ru: "Russian|русский|русском|俄语|俄語",
  ar: "Arabic|العربية|阿拉伯语|阿拉伯語",
  hi: "Hindi|हिंदी|हिन्दी|印地语|印地語",
};
const requestPatterns = [];
for (const [code, alias] of Object.entries(aliases)) {
  const name = `(?:${alias})`;
  // Deliberately require a request verb or a polite language-only request.
  requestPatterns.push([
    code,
    new RegExp(
      `\\b(?:answer|reply|respond|speak|talk|chat|continue|write|text)(?:\\s+(?:to|with|me|us|only|back))*\\s+in\\s+${name}(?![\\p{L}\\p{M}])|\\b(?:use|speak|switch(?:\\s+(?:it|this|us|things))?(?:\\s+(?:over|back))?\\s+to|change(?:\\s+(?:it|this))?(?:\\s+(?:over|back))?\\s+to|go\\s+back\\s+to|back\\s+to)\\s+${name}(?![\\p{L}\\p{M}])|${name}\\s+(?:please|from now on|from now|from here on|only|instead)\\b`,
      "giu",
    ),
  ]);
  // “can we do this in Mandarin?”, “let's keep going in English”, “explain
  // it in Chinese”, “in English from now on”.
  requestPatterns.push([
    code,
    new RegExp(
      // A general “do this in X” is the whole request; “explain this bar in
      // X” keeps its question, so only “in X” is the language part.
      `\\b(?:do|doing|go|keep going|carry on|continue|have)\\b(?:\\s+(?:this|it|that|everything|things|the rest|our chat|this chat|the conversation|this conversation|us|it all))*\\s+in\\s+${name}(?![\\p{L}\\p{M}])|(?<=(?<!\\b(?:not|never|don't|dont)\\s+)\\b(?:explain|tell me|describe|teach me|talk me through|walk me through|say|do)\\b[^.?!\\n]{1,60}\\s)in\\s+${name}(?![\\p{L}\\p{M}])|^in\\s+${name}\\s+(?:from now on|from now|from here on|going forward|onwards|instead|only)\\b`,
      "giu",
    ),
  ]);
  requestPatterns.push([
    code,
    new RegExp(
      `(?:改用|使用|用|说|說|讲|講|以)${name}(?:(?:来|來)?(?:跟我|和我|同我|对我|對我|给我|給我)?(?:回答|回复|回覆|回应|回應|聊天|聊|说|說|讲|講|交流|沟通|溝通)(?:话|話|吧)?)?|${name}(?:回答|回复|回覆|回应|回應)`,
      "giu",
    ),
  ]);
  // “换成中文吧”, “你会中文吗？”, “会说英文吗”: a switch or an offer to switch.
  // A subject other than “you” (“我会中文”) stays a statement about the user.
  requestPatterns.push([
    code,
    new RegExp(
      `(?:换|換|切换|切換|改|转|轉)(?:成|到|为|為|回)?${name}|(?:你|您)(?:会|會|能|可以)(?:说|說|讲|講|用)?${name}|^(?:会|會)(?:说|說|讲|講)${name}`,
      "giu",
    ),
  ]);
  // A bare language name is a request on its own: “中文”, “English?”, “in Chinese please”.
  requestPatterns.push([
    code,
    new RegExp(`^(?:in\\s+)?${name}(?:\\s*(?:吧|呢|啊|呀|please|可以吗|可以嗎|行吗|行嗎|好吗|好嗎|可以|行|ok|okay))?[\\s.!?。！？~～]*$`, "giu"),
  ]);
}
requestPatterns.push(
  [
    "ja",
    /日本語(?:で(?:答えて|回答して|返答して|返事して|話して|会話して|お願いし|お願い)?(?:ください|下さい|します|ます)?|に(?:して|切り替えて)(?:ください)?)/gu,
  ],
  [
    "ko",
    /한국어로\s*(?:(?:대답|답|응답|이야기|말|대화)(?:해\s*주세요|해주세요|해\s*줘|해줘|하세요|하기|해)|부탁(?:해요|합니다)|해\s*주세요)/gu,
  ],
  [
    "es",
    /\b(?:responde|respóndeme|responda|contesta|contéstame|habla|hable)(?:\s+(?:solo|sólo|por favor))*\s+en\s+español\b|\bespañol\s*,?\s*por favor\b/giu,
  ],
  [
    "fr",
    /\b(?:réponds|répondez|répondre|parle|parlez)(?:[-\s]moi)?(?:\s+s['’]il (?:vous|te) plaît)?\s+en\s+français\b|\bfrançais\s*,?\s*s['’]il (?:vous|te) plaît\b/giu,
  ],
  [
    "de",
    /\b(?:antworte|antworten sie|sprich|sprechen sie|schreibe|schreib)(?:\s+(?:mir|bitte|ab jetzt|nur))*\s+(?:auf\s+)?Deutsch\b|\bDeutsch\s+bitte\b|\bauf\s+Deutsch\s+bitte\b/giu,
  ],
  [
    "pt",
    /\b(?:responda|responde|responda-me|fale|fala)(?:\s+(?:só|apenas|por favor))*\s+(?:em\s+)?português\b|\bportuguês\s*,?\s*por favor\b/giu,
  ],
  [
    "it",
    /\b(?:rispondi|risponda|parla|parli)(?:mi)?(?:\s+per favore)?\s+in\s+italiano\b|\bitaliano\s*,?\s*per favore\b/giu,
  ],
  [
    "ru",
    /(?:отвечай|ответь|отвечайте|говори|говорите|пиши|пишите)(?:\s+мне)?\s+(?:по[-\s]?русски|на\s+русском(?:\s+языке)?)|(?:по[-\s]?русски|на\s+русском)\s*,?\s*пожалуйста/giu,
  ],
  [
    "ar",
    /(?:أجب|اجب|رد|تحدث|تكلّم|تكلم)\s*(?:عليّ?\s*)?(?:باللغة\s+العربية|بالعربية)|(?:باللغة\s+العربية|بالعربية)\s*(?:من فضلك|لو سمحت)/gu,
  ],
  [
    "hi",
    /(?:हिंदी|हिन्दी)\s*में\s*(?:(?:जवाब|उत्तर|बात)\s*(?:दें|दीजिए|दो|करें|करो)|बोलें|बोलो|बताइए)/gu,
  ],
);

function unquoted(value) {
  // Translation requests describe text; they do not change future replies.
  if (
    /^(?:please\s+)?(?:translate\b|how do you say\b|what does\b)|^(?:请|請)?(?:翻译|翻譯|解释|解釋)|^(?:traduce|traduisez|traduis|übersetze|traduza|traduci)\b|^(?:переведи|переведите|ترجم)|翻訳して|번역해|अनुवाद\s*(?:करो|करें)/iu.test(
      value,
    )
  )
    return "";
  return value.replace(
    /"[^"\n]*"|“[^”\n]*”|「[^」\n]*」|『[^』\n]*』|«[^»\n]*»|(?<![\p{L}\p{N}])'[^'\n]*'(?![\p{L}\p{N}])/gu,
    (quoted) => " ".repeat(quoted.length),
  );
}
// Typed names of languages, for typo tolerance: “englsh”, “chinse”,
// “mandrin”. Only a word close to one of these (and starting with the same
// letter) is read as that name.
const LANGUAGE_WORDS = ["English", "Chinese", "Mandarin", "Japanese", "Korean", "Spanish", "French", "German", "Portuguese", "Italian", "Russian", "Arabic", "Hindi", "Traditional", "Simplified"];
function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = next;
    }
  }
  return row[b.length];
}
/** The text with near-miss spellings of language names corrected. */
export function correctLanguageNames(value) {
  // Plain ASCII words only: native names (“português”) stay as typed.
  return String(value ?? "").replace(/(?<![\p{L}\p{M}])[A-Za-z]{4,14}(?![\p{L}\p{M}])/gu, (word) => {
    const lower = word.toLowerCase();
    // Native names written in ASCII (“italiano”, “deutsch”) are not typos.
    if (/^(?:italiano|espanol|francais|deutsch|portugues|nihongo|russkiy|hangugeo|putonghua|zhongwen|hanyu|yingyu)$/.test(lower)) return word;
    for (const name of LANGUAGE_WORDS) {
      const target = name.toLowerCase();
      if (lower === target) return word;
      if (lower[0] !== target[0] || Math.abs(lower.length - target.length) > 2) continue;
      if (editDistance(lower, target) <= (target.length >= 7 ? 2 : 1)) return name;
    }
    return word;
  });
}
function requests(value) {
  const input = unquoted(correctLanguageNames(text(value)));
  const choices = [];
  for (const [language, pattern] of requestPatterns)
    for (const match of input.matchAll(pattern)) {
      const before = input.slice(Math.max(0, match.index - 64), match.index);
      if (
        // Keep negation attached to this request. Known intervening modifiers
        // cover “do not want you to …” without suppressing a later positive
        // clause such as “not French; please use Spanish”.
        /(?:^|[^\p{L}\p{M}])(?:don't|don’t|do not|never|not|no need to)(?:\s+(?:ever|please|only|just|really|actually|still|always|again|want|wish|need|ask|expect|allow|think|you|us|anyone|to|should|would|could|can|must|necessary|keep|on|continue|start))*\s*$|(?:^|[^\p{L}\p{M}])(?:no|non|ne|não|não quero|nicht|не|لا|मत)(?:\s+(?:please|only|just|bitte))?\s*$|(?:不要|别|別|不用|不想|不希望|不需要|不必)(?:再|一直|总是|總是|继续|繼續|始终|始終|只|老是|还|還|总|總|都|让你|讓你|你|您)*\s*$/iu.test(
          before,
        )
      )
        continue;
      // “explain it in Chinese” matched only “in Chinese”: a negation of the
      // verb before it (“don't explain it in Chinese”) cancels it too.
      if (/^in\s/i.test(match[0]) && /(?:^|[^\p{L}\p{M}])(?:don't|don’t|dont|do not|never|not|no need to)(?![\p{L}\p{M}])[^.?!;\n]*$/iu.test(before))
        continue;
      if (
        /\b(?:learn(?:ing)?|study(?:ing)?|practi[cs](?:e|ing)|able|used)\s+(?:how\s+)?to\s*$|\b(?:I|she|he|we|they)\s+(?:can|could|often|usually)\s*$/iu.test(
          before,
        )
      )
        continue;
      // French/German negation can occur after the request verb.
      const after = input.slice(
        match.index + match[0].length,
        match.index + match[0].length + 16,
      );
      if (/^\s+(?:pas|nicht)\b/iu.test(after)) continue;
      choices.push({
        language,
        index: match.index,
        end: match.index + match[0].length,
      });
    }
  // A longer match at the same location keeps Traditional Chinese specific.
  return choices
    .filter(
      (choice) =>
        !choices.some(
          (other) =>
            other.language !== choice.language &&
            other.index <= choice.index &&
            other.end >= choice.end &&
            other.end - other.index > choice.end - choice.index,
        ),
    )
    .sort((a, b) => b.index - a.index || b.end - a.end);
}
export function explicitConversationLanguage(value) {
  return requests(value)[0]?.language || null;
}

export function conversationLanguagePreference(messages = [], draft = "") {
  const requested = explicitConversationLanguage(draft);
  if (requested) return requested;
  for (const entry of (Array.isArray(messages) ? messages : [])
    .slice()
    .reverse()) {
    if (entry?.role === "user") {
      const preference = explicitConversationLanguage(entry.message);
      if (preference) return preference;
    }
    if (isConversationLanguage(entry?.languagePreference))
      return entry.languagePreference;
  }
  return null;
}

function detectedLanguage(value) {
  const input = text(value);
  // Kana takes precedence over shared kanji. A Chinese song title alone must not
  // outweigh a substantive Latin-language question around it.
  const scriptCounts = [
    [
      "ja",
      (input.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) || []).length,
    ],
    ["ko", (input.match(/\p{Script=Hangul}/gu) || []).length],
    ["ru", (input.match(/\p{Script=Cyrillic}/gu) || []).length],
    ["ar", (input.match(/\p{Script=Arabic}/gu) || []).length],
    ["hi", (input.match(/\p{Script=Devanagari}/gu) || []).length],
  ].sort((a, b) => b[1] - a[1]);
  const latin = (input.match(/\p{Script=Latin}/gu) || []).length;
  if (scriptCounts[0][1] > 0 && scriptCounts[0][1] * 2 > latin)
    return scriptCounts[0][0];
  const han = (input.match(/\p{Script=Han}/gu) || []).length;
  if (han * 2 > latin)
    return /[體說這個練習樂譜請謝簡為麼會學彈難嗎聲繼續從開關與時還點節麼]/u.test(
      input,
    )
      ? "zh-Hant"
      : "zh";
  if (!latin && !scriptCounts[0][1]) return null;
  // Common function words plus distinctive vocabulary. A single surname or
  // title is insufficient to override the default English interpretation.
  const lexical = [
    [
      "es",
      /\b(?:cómo|puedo|quiero|estoy|gracias|practicar|despacio|ayúdame|necesito|canción|español)\b/giu,
    ],
    [
      "fr",
      /\b(?:comment|puis|je|suis|voudrais|merci|bonjour|pratiquer|lentement|français|aidez|peux)\b/giu,
    ],
    [
      "de",
      /\b(?:ich|wie|kann|möchte|bitte|danke|üben|langsam|deutsch|dieses)\b/giu,
    ],
    [
      "pt",
      /\b(?:como|posso|quero|estou|obrigad[oa]|praticar|devagar|preciso|português|você)\b/giu,
    ],
    [
      "it",
      /\b(?:come|posso|voglio|sono|grazie|esercitarmi|lentamente|aiutami|italiano|questo)\b/giu,
    ],
  ]
    .map(([code, pattern]) => [code, (input.match(pattern) || []).length])
    .sort((a, b) => b[1] - a[1]);
  return lexical[0][1] >= 2 && lexical[0][1] > lexical[1][1]
    ? lexical[0][0]
    : "en";
}
const briefFollowup =
  /^(?:ok(?:ay)?|yes|no|thanks|thank you|next(?: step)?|simpler|again|\d+|好|好的|谢谢|謝謝|下一步|再来|再來|はい|いいえ|ありがとう|次|もう一度|네|아니요|감사합니다|다음|다시|sí|gracias|siguiente|oui|merci|suivant|ja|danke|weiter|sim|obrigad[oa]|próximo|sì|grazie|avanti|да|нет|спасибо|дальше|نعم|شكرا|شكرًا|التالي|हाँ|धन्यवाद|अगला)[.!?。？！،\s]*$/iu;
export function conversationLanguage(messages = [], draft = "") {
  const preference = conversationLanguagePreference(messages, draft);
  if (preference) return preference;
  const input = text(draft);
  if (!briefFollowup.test(input) && detectedLanguage(input))
    return detectedLanguage(input);
  for (const entry of (Array.isArray(messages) ? messages : [])
    .slice()
    .reverse()) {
    if (
      entry?.role === "user" &&
      !briefFollowup.test(text(entry.message)) &&
      detectedLanguage(entry.message)
    )
      return detectedLanguage(entry.message);
    if (isConversationLanguage(entry?.lesson?.language))
      return entry.lesson.language;
  }
  return detectedLanguage(input) || "en";
}

/** Only standalone language changes are consumed locally; keep mixed questions. */
export function languageRequest(value) {
  const input = correctLanguageNames(text(value));
  const choices = requests(input);
  if (!choices.length) return null;
  // Overlapping phrasings of the same request (“in Chinese please” also
  // contains “Chinese please”): any one standing alone is a switch.
  return choices
    .filter((choice) => choice.language === choices[0].language)
    .some((choice) => standalone(input, choice))
    ? choices[0].language
    : null;
}
function standalone(input, choice) {
  const before = input.slice(0, choice.index).trim();
  const after = input.slice(choice.end).trim();
  const prefix =
    /^(?:(?:please|pls|plz|from now on|ok(?:ay)?|so|then|hey|yo|hi|hmm+|um+|actually|also|and|now|lol|haha|oh|ah|sorry|wait|let'?s|lets|let us|can u|could u|would u|will u|can we please|could we please|de ahora en adelante|à partir de maintenant|ab jetzt|a partir de agora|d’ora in poi|теперь|с этого момента|من الآن فصاعدًا|अब से|can you|could you|would you|will you|can we|could we|i'd like you to|i’d like you to|i would like you to|i want you to|i need you to|por favor|s'il vous plaît|s’il vous plaît|s'il te plaît|s’il te plaît|bitte|per favore|пожалуйста|من فضلك|لو سمحت|कृपया)[,，\s]*|(?:从现在开始|從現在開始|从现在起|從現在起|これから|今後は|앞으로|지금부터|이제|之後|之后|今后|今後|那就|那么|那麼|那|就|好吧|好的|好|行|嗯|还是|還是|麻烦|麻煩|你|您|可以|能不能|能否|可不可以|能|请|請|以后|以後|接下来|接下來|都|只|一直|跟我|和我|同我|对我|對我|给我|給我|陪我|我想|我要|我希望|希望|我们|我們|咱们|咱們)[,，、\s]*)*$/iu;
  const suffix =
    /^(?:(?:please|pls|plz|from now on|from now|from here on|going forward|onwards|for now|for the rest|thanks|thank you|thx|lol|haha|if you can|if possible|only|with me|to me|for me|instead|again|now|too|from here|ok(?:ay)?|por favor|s'il vous plaît|s’il vous plaît|s'il te plaît|s’il te plaît|bitte|per favore|пожалуйста|من فضلك|لو سمحت)|(?:我吧|我|吧|就好|就行|好吗|好嗎|可以吗|可以嗎|行吗|行嗎|吗|嗎|呢|啊|呀|哦|喔|요|세요)|[.!?。？！,，،؛।~～\s])*$/iu;
  return prefix.test(before) && suffix.test(after);
}

// Labels propose an action; receipts are used only after confirmed execution.
// Score titles and numbers are never translated or inferred.
const copy = {
  zh: {
    open: "打开",
    bar: (n) => `第${n}小节`,
    seek: (n) => `到第${n}小节`,
    repeat: (n) => `循环第${n}小节`,
    speed: (n) => `${n}%速度`,
    hands: ["只练左手", "只练右手", "双手一起"],
    handNames: ["左手", "右手", "双手"],
    modes: ["示范播放", "等我弹对", "演奏模式"],
    modeNames: ["示范播放", "等我弹对", "演奏"],
    nav: ["打开曲库", "打开练习", "查看练习记录", "打开练琴界面"],
    navDone: [
      "已打开曲库。",
      "已打开练习。",
      "已打开练习记录。",
      "已打开练琴界面。",
    ],
    settings: "打开设置",
    import: "导入乐谱",
    numbers: "查看数字说明",
    help: "查看操作说明",
    opened: (n) => `已打开乐曲，停在第${n}小节。`,
    sought: (n) => `已跳到第${n}小节。`,
    repeated: (n) => `已设为循环第${n}小节。`,
    sped: (n) => `速度已设为${n}%。`,
    hand: (n) => `已选择${n}。`,
    mode: (n) => `已切换到${n}模式。`,
    settingsDone: "已打开设置。",
    importDone: "已打开导入窗口。",
    helpDone: "已打开说明。",
    ready: (n) => `已就位第${n}小节，播放暂停。`,
    reset: (r) => `已回到${r ? "循环片段" : "乐曲"}的开头。`,
    unchanged: "当前位置不变。",
  },
  "zh-Hant": {
    open: "開啟",
    bar: (n) => `第${n}小節`,
    seek: (n) => `到第${n}小節`,
    repeat: (n) => `循環第${n}小節`,
    speed: (n) => `${n}%速度`,
    hands: ["只練左手", "只練右手", "雙手一起"],
    handNames: ["左手", "右手", "雙手"],
    modes: ["示範播放", "等我彈對", "演奏模式"],
    modeNames: ["示範播放", "等我彈對", "演奏"],
    nav: ["開啟曲庫", "開啟練習", "查看練習紀錄", "開啟練琴畫面"],
    navDone: [
      "已開啟曲庫。",
      "已開啟練習。",
      "已開啟練習紀錄。",
      "已開啟練琴畫面。",
    ],
    settings: "開啟設定",
    import: "匯入樂譜",
    numbers: "查看數字說明",
    help: "查看操作說明",
    opened: (n) => `已開啟樂曲，停在第${n}小節。`,
    sought: (n) => `已跳到第${n}小節。`,
    repeated: (n) => `已設為循環第${n}小節。`,
    sped: (n) => `速度已設為${n}%。`,
    hand: (n) => `已選擇${n}。`,
    mode: (n) => `已切換到${n}模式。`,
    settingsDone: "已開啟設定。",
    importDone: "已開啟匯入視窗。",
    helpDone: "已開啟說明。",
    ready: (n) => `已就位第${n}小節，播放暫停。`,
    reset: (r) => `已回到${r ? "循環片段" : "樂曲"}的開頭。`,
    unchanged: "目前位置不變。",
  },
  ja: {
    open: "開く",
    bar: (n) => `${n}小節目`,
    seek: (n) => `${n}小節目へ`,
    repeat: (n) => `${n}小節を繰り返す`,
    speed: (n) => `速度 ${n}%`,
    hands: ["左手のみ", "右手のみ", "両手"],
    modes: ["お手本を聴く", "正しい音を待つ", "演奏"],
    nav: ["曲一覧", "練習", "練習記録", "練習画面"],
    settings: "設定",
    import: "楽譜を読み込む",
    numbers: "数字の説明",
    help: "操作の説明",
    opened: (n) => `曲を開きました。${n}小節目です。`,
    sought: (n) => `${n}小節目に移動しました。`,
    repeated: (n) => `${n}小節の繰り返しを設定しました。`,
    sped: (n) => `速度を${n}%に設定しました。`,
    hand: (n) => `${n}を選びました。`,
    mode: (n) => `「${n}」に切り替えました。`,
    done: (n) => `「${n}」を開きました。`,
    ready: (n) => `${n}小節で一時停止しています。`,
    reset: (r) => `${r ? "繰り返し範囲" : "曲"}の最初に戻りました。`,
    unchanged: "位置は変わりません。",
  },
  ko: {
    open: "열기",
    bar: (n) => `${n}마디`,
    seek: (n) => `${n}마디로 이동`,
    repeat: (n) => `${n}마디 반복`,
    speed: (n) => `속도 ${n}%`,
    hands: ["왼손만", "오른손만", "양손"],
    modes: ["시범 듣기", "맞는 음 기다리기", "연주"],
    nav: ["곡 목록", "연습", "연습 기록", "연습 화면"],
    settings: "설정",
    import: "악보 가져오기",
    numbers: "숫자 설명",
    help: "사용법",
    opened: (n) => `곡을 열었습니다. ${n}마디입니다.`,
    sought: (n) => `${n}마디로 이동했습니다.`,
    repeated: (n) => `${n}마디 반복을 설정했습니다.`,
    sped: (n) => `속도를 ${n}%로 설정했습니다.`,
    hand: (n) => `${n} 연습을 선택했습니다.`,
    mode: (n) => `${n} 모드로 바꿨습니다.`,
    done: (n) => `${n} 화면을 열었습니다.`,
    ready: (n) => `${n}마디에서 일시 정지했습니다.`,
    reset: (r) => `${r ? "반복 구간" : "곡"}의 처음으로 돌아갔습니다.`,
    unchanged: "위치는 그대로입니다.",
  },
  es: {
    open: "Abrir",
    bar: (n) => `compás ${n}`,
    seek: (n) => `Ir al compás ${n}`,
    repeat: (n) => `Repetir compases ${n}`,
    speed: (n) => `Velocidad ${n}%`,
    hands: ["Solo mano izquierda", "Solo mano derecha", "Ambas manos"],
    modes: ["Escuchar", "Esperar la nota correcta", "Interpretar"],
    nav: ["Biblioteca", "Ejercicios", "Registro de práctica", "Práctica"],
    settings: "Ajustes",
    import: "Importar partitura",
    numbers: "Explicar los números",
    help: "Ayuda",
    opened: (n) => `Pieza abierta en el compás ${n}.`,
    sought: (n) => `En el compás ${n}.`,
    repeated: (n) => `Repetición configurada: compases ${n}.`,
    sped: (n) => `Velocidad ajustada al ${n}%.`,
    hand: (n) => `Selección: ${n}.`,
    mode: (n) => `Modo: ${n}.`,
    done: (n) => `Abierto: ${n}.`,
    ready: (n) => `Listo en los compases ${n}; reproducción en pausa.`,
    reset: (r) => `De vuelta al inicio de ${r ? "la repetición" : "la pieza"}.`,
    unchanged: "La posición no ha cambiado.",
  },
  fr: {
    open: "Ouvrir",
    bar: (n) => `mesure ${n}`,
    seek: (n) => `Aller à la mesure ${n}`,
    repeat: (n) => `Répéter les mesures ${n}`,
    speed: (n) => `Vitesse ${n}%`,
    hands: ["Main gauche seule", "Main droite seule", "Les deux mains"],
    modes: ["Écouter", "Attendre la bonne note", "Jouer"],
    nav: ["Bibliothèque", "Exercices", "Historique de pratique", "Pratique"],
    settings: "Réglages",
    import: "Importer une partition",
    numbers: "Expliquer les chiffres",
    help: "Aide",
    opened: (n) => `Morceau ouvert à la mesure ${n}.`,
    sought: (n) => `À la mesure ${n}.`,
    repeated: (n) => `Répétition définie : mesures ${n}.`,
    sped: (n) => `Vitesse réglée à ${n}%.`,
    hand: (n) => `Sélection : ${n}.`,
    mode: (n) => `Mode : ${n}.`,
    done: (n) => `Ouvert : ${n}.`,
    ready: (n) => `Aux mesures ${n} ; lecture en pause.`,
    reset: (r) => `Retour au début ${r ? "de la répétition" : "du morceau"}.`,
    unchanged: "La position est inchangée.",
  },
  de: {
    open: "Öffnen",
    bar: (n) => `Takt ${n}`,
    seek: (n) => `Zu Takt ${n}`,
    repeat: (n) => `Takte ${n} wiederholen`,
    speed: (n) => `Tempo ${n}%`,
    hands: ["Nur linke Hand", "Nur rechte Hand", "Beide Hände"],
    modes: ["Anhören", "Auf richtige Note warten", "Spielen"],
    nav: ["Bibliothek", "Übungen", "Übungsverlauf", "Üben"],
    settings: "Einstellungen",
    import: "Noten importieren",
    numbers: "Zahlen erklären",
    help: "Hilfe",
    opened: (n) => `Stück bei Takt ${n} geöffnet.`,
    sought: (n) => `Bei Takt ${n}.`,
    repeated: (n) => `Wiederholung für Takte ${n} eingestellt.`,
    sped: (n) => `Tempo auf ${n}% eingestellt.`,
    hand: (n) => `Auswahl: ${n}.`,
    mode: (n) => `Modus: ${n}.`,
    done: (n) => `Geöffnet: ${n}.`,
    ready: (n) => `Bei Takten ${n}; Wiedergabe pausiert.`,
    reset: (r) => `Zurück zum Anfang ${r ? "der Wiederholung" : "des Stücks"}.`,
    unchanged: "Die Position bleibt unverändert.",
  },
  pt: {
    open: "Abrir",
    bar: (n) => `compasso ${n}`,
    seek: (n) => `Ir ao compasso ${n}`,
    repeat: (n) => `Repetir compassos ${n}`,
    speed: (n) => `Velocidade ${n}%`,
    hands: ["Só mão esquerda", "Só mão direita", "Ambas as mãos"],
    modes: ["Ouvir", "Esperar a nota certa", "Tocar"],
    nav: ["Biblioteca", "Exercícios", "Histórico de prática", "Prática"],
    settings: "Configurações",
    import: "Importar partitura",
    numbers: "Explicar os números",
    help: "Ajuda",
    opened: (n) => `Peça aberta no compasso ${n}.`,
    sought: (n) => `No compasso ${n}.`,
    repeated: (n) => `Repetição definida: compassos ${n}.`,
    sped: (n) => `Velocidade definida para ${n}%.`,
    hand: (n) => `Seleção: ${n}.`,
    mode: (n) => `Modo: ${n}.`,
    done: (n) => `Aberto: ${n}.`,
    ready: (n) => `Nos compassos ${n}; reprodução pausada.`,
    reset: (r) => `De volta ao início ${r ? "da repetição" : "da peça"}.`,
    unchanged: "A posição não mudou.",
  },
  it: {
    open: "Apri",
    bar: (n) => `battuta ${n}`,
    seek: (n) => `Vai alla battuta ${n}`,
    repeat: (n) => `Ripeti le battute ${n}`,
    speed: (n) => `Velocità ${n}%`,
    hands: ["Solo mano sinistra", "Solo mano destra", "Entrambe le mani"],
    modes: ["Ascolta", "Attendi la nota giusta", "Suona"],
    nav: ["Libreria", "Esercizi", "Registro di pratica", "Pratica"],
    settings: "Impostazioni",
    import: "Importa spartito",
    numbers: "Spiega i numeri",
    help: "Aiuto",
    opened: (n) => `Brano aperto alla battuta ${n}.`,
    sought: (n) => `Alla battuta ${n}.`,
    repeated: (n) => `Ripetizione impostata: battute ${n}.`,
    sped: (n) => `Velocità impostata al ${n}%.`,
    hand: (n) => `Selezione: ${n}.`,
    mode: (n) => `Modalità: ${n}.`,
    done: (n) => `Aperto: ${n}.`,
    ready: (n) => `Alle battute ${n}; riproduzione in pausa.`,
    reset: (r) =>
      `Ritorno all’inizio ${r ? "della ripetizione" : "del brano"}.`,
    unchanged: "La posizione non è cambiata.",
  },
  ru: {
    open: "Открыть",
    bar: (n) => `такт ${n}`,
    seek: (n) => `К такту ${n}`,
    repeat: (n) => `Повторять такты ${n}`,
    speed: (n) => `Скорость ${n}%`,
    hands: ["Только левая рука", "Только правая рука", "Обе руки"],
    modes: ["Слушать", "Ждать верную ноту", "Играть"],
    nav: ["Библиотека", "Упражнения", "История занятий", "Практика"],
    settings: "Настройки",
    import: "Импорт нот",
    numbers: "Объяснить цифры",
    help: "Справка",
    opened: (n) => `Пьеса открыта на такте ${n}.`,
    sought: (n) => `Переход к такту ${n}.`,
    repeated: (n) => `Повтор тактов ${n} настроен.`,
    sped: (n) => `Скорость установлена на ${n}%.`,
    hand: (n) => `Выбрано: ${n}.`,
    mode: (n) => `Режим: ${n}.`,
    done: (n) => `Открыто: ${n}.`,
    ready: (n) => `Такты ${n}; воспроизведение на паузе.`,
    reset: (r) => `Возврат к началу ${r ? "повтора" : "пьесы"}.`,
    unchanged: "Позиция не изменилась.",
  },
  ar: {
    open: "فتح",
    bar: (n) => `المازورة ${n}`,
    seek: (n) => `اذهب إلى المازورة ${n}`,
    repeat: (n) => `تكرار الموازير ${n}`,
    speed: (n) => `السرعة ${n}%`,
    hands: ["اليد اليسرى فقط", "اليد اليمنى فقط", "كلتا اليدين"],
    modes: ["استماع", "انتظار النغمة الصحيحة", "عزف"],
    nav: ["المكتبة", "التمارين", "سجل التدريب", "التدريب"],
    settings: "الإعدادات",
    import: "استيراد النوتة",
    numbers: "شرح الأرقام",
    help: "المساعدة",
    opened: (n) => `فُتحت المقطوعة عند المازورة ${n}.`,
    sought: (n) => `تم الانتقال إلى المازورة ${n}.`,
    repeated: (n) => `تم ضبط تكرار الموازير ${n}.`,
    sped: (n) => `ضُبطت السرعة على ${n}%.`,
    hand: (n) => `تم اختيار: ${n}.`,
    mode: (n) => `الوضع: ${n}.`,
    done: (n) => `تم فتح: ${n}.`,
    ready: (n) => `الموازير ${n} جاهزة؛ التشغيل متوقف مؤقتًا.`,
    reset: (r) => `تم الرجوع إلى بداية ${r ? "التكرار" : "المقطوعة"}.`,
    unchanged: "لم يتغير الموضع.",
  },
  hi: {
    open: "खोलें",
    bar: (n) => `माप ${n}`,
    seek: (n) => `माप ${n} पर जाएँ`,
    repeat: (n) => `माप ${n} दोहराएँ`,
    speed: (n) => `गति ${n}%`,
    hands: ["केवल बायाँ हाथ", "केवल दायाँ हाथ", "दोनों हाथ"],
    modes: ["सुनें", "सही स्वर की प्रतीक्षा", "बजाएँ"],
    nav: ["संग्रह", "अभ्यास", "अभ्यास का रिकॉर्ड", "बजाने का अभ्यास"],
    settings: "सेटिंग्स",
    import: "स्वरलिपि आयात करें",
    numbers: "अंकों का अर्थ",
    help: "मदद",
    opened: (n) => `रचना माप ${n} पर खुली है।`,
    sought: (n) => `माप ${n} पर आ गए हैं।`,
    repeated: (n) => `माप ${n} का दोहराव तय किया गया।`,
    sped: (n) => `गति ${n}% कर दी गई।`,
    hand: (n) => `चुना गया: ${n}।`,
    mode: (n) => `मोड: ${n}।`,
    done: (n) => `खोला गया: ${n}।`,
    ready: (n) => `माप ${n} तैयार हैं; प्लेबैक रुका है।`,
    reset: (r) => `${r ? "दोहराव" : "रचना"} की शुरुआत पर लौट आए हैं।`,
    unchanged: "स्थिति नहीं बदली है।",
  },
};
const handIndex = (hand) => ["left", "right", "both"].indexOf(hand);
const modeIndex = (mode) => ["listen", "wait", "perform"].indexOf(mode);
const viewIndex = (view) =>
  ["library", "exercises", "progress", "practice"].indexOf(view);
const rangeOf = (action) =>
  action.from === action.to ? `${action.from}` : `${action.from}–${action.to}`;
export function companionActionLabel(action, language = "en") {
  const c = isConversationLanguage(language) ? copy[language] : null;
  if (!c) return action.label;
  switch (action.type) {
    case "open-piece": {
      if (
        typeof action.label !== "string" ||
        !/^(?:Open|Resume|Start)\s/.test(action.label)
      )
        return action.label;
      const title = action.label
        .replace(/^(?:Open|Resume|Start)\s+/, "")
        .replace(/\s*·\s*bar\s+\d+\s*$/i, "");
      return `${c.open}${language.startsWith("zh") ? "" : " "}${title} · ${c.bar(action.bar)}`;
    }
    case "seek-bar":
      return c.seek(action.bar);
    case "repeat-bars":
      return c.repeat(rangeOf(action));
    case "set-speed":
      return c.speed(Math.round(action.speed * 100));
    case "set-hand":
      return c.hands[handIndex(action.hand)] || action.label;
    case "set-mode":
      return c.modes[modeIndex(action.mode)] || action.label;
    case "navigate":
      return c.nav[viewIndex(action.view)] || action.label;
    case "open-settings":
      return c.settings;
    case "import-score":
      return c.import;
    case "show-help":
      return action.topic === "numbers" ? c.numbers : c.help;
    default:
      return action.label;
  }
}
/** Call only after the UI has actually executed the validated action. */
export function companionActionReceipt(action, language = "en") {
  const c = isConversationLanguage(language) ? copy[language] : null;
  if (!c) return null;
  switch (action.type) {
    case "open-piece":
      return c.opened(action.bar);
    case "seek-bar":
      return c.sought(action.bar);
    case "repeat-bars":
      return c.repeated(rangeOf(action));
    case "set-speed":
      return c.sped(Math.round(action.speed * 100));
    case "set-hand": {
      const name = (c.handNames || c.hands)[handIndex(action.hand)];
      return name ? c.hand(name) : null;
    }
    case "set-mode": {
      const name = (c.modeNames || c.modes)[modeIndex(action.mode)];
      return name ? c.mode(name) : null;
    }
    case "navigate": {
      const index = viewIndex(action.view);
      return c.nav[index] ? c.navDone?.[index] || c.done(c.nav[index]) : null;
    }
    case "open-settings":
      return c.settingsDone || c.done(c.settings);
    case "import-score":
      return c.importDone || c.done(c.import);
    case "show-help":
      return c.helpDone || c.done(c.help);
    default:
      return null;
  }
}
/** True when the newest action receipt about this score says the learner
 * opened it at bar 1 themselves (“Opened … at bar 1.”, “已打开乐曲，停在第1小节。”).
 * The piece then really is at its start, even though a saved place exists. */
export function openedAtStart(history) {
  const list = Array.isArray(history) ? history : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (m?.role !== "assistant" || m.kind !== "receipt" || typeof m.message !== "string") continue;
    for (const [pattern, kind] of positionReceipts()) {
      const found = m.message.match(pattern);
      if (found) return kind === "position" && found[1] === "1";
    }
    // Speed, hand, mode and navigation receipts leave the position alone.
  }
  return false;
}
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let receiptPatterns = null;
/** Opening at / moving to a bar (“position”) and setting a loop (“loop”), in
 * the app's English receipts and every localized receipt. */
function positionReceipts() {
  if (receiptPatterns) return receiptPatterns;
  receiptPatterns = [
    [/^Opened .+ at bar (\d+)\./s, "position"],
    [/^Moved to bar (\d+) of /s, "position"],
    [/^Repeating bars (\d+)/s, "loop"],
  ];
  for (const code of Object.keys(copy))
    for (const [type, kind] of [["open-piece", "position"], ["seek-bar", "position"], ["repeat-bars", "loop"]]) {
      const template = companionActionReceipt({ type, bar: 987654, from: 987654, to: 987654 }, code);
      if (template?.includes("987654"))
        receiptPatterns.push([new RegExp(`^${escapeRegExp(template).replace("987654", kind === "loop" ? "(\\d+)(?:–\\d+)?" : "(\\d+)")}`, "s"), kind]);
    }
  return receiptPatterns;
}
export function localizeActionReceipt(action, result, language = "en") {
  const c = isConversationLanguage(language) ? copy[language] : null;
  if (!c || !result || result.applied !== true) return result;
  const message = companionActionReceipt(action, language);
  if (!message) return result;
  const ready =
    typeof result.message === "string" &&
    result.message.match(
      /Ready at bars? (\d+)(?:–(\d+))?; playback is paused\./,
    );
  const reset =
    typeof result.message === "string" &&
    result.message.match(/Returned to the start of the (repeat|piece)\./);
  const unchanged =
    typeof result.message === "string" &&
    result.message.includes("Your position is unchanged.");
  return {
    ...result,
    message:
      message +
      (ready
        ? ` ${c.ready(`${ready[1]}${ready[2] ? `–${ready[2]}` : ""}`)}`
        : "") +
      (reset ? ` ${c.reset(reset[1] === "repeat")}` : "") +
      (unchanged ? ` ${c.unchanged}` : ""),
  };
}

// ---------------------------------------------------------------------------
// Reply-language check. Used to keep history replays and generated replies in
// the conversation's language. Titles, composers, note names, numbers, code
// and quoted text are removed first so “《Appassionata》第153小节” still reads
// as Chinese and “Bar 6 of 晴天” still reads as English. Returns true/false, or
// null when there is not yet enough text to decide.
// companion-local-runtime.mjs carries a byte-for-byte copy of this logic
// (it ships as a single standalone file); tests keep the two in step.
const LATIN_STOPWORDS = {
  en: /\b(?:the|and|you|your|is|are|to|of|this|that|it|with|for|on|in|can|try|let's|i'm|it's)\b/giu,
  es: /\b(?:el|la|los|las|que|de|y|en|es|por|para|con|una|tu|te|lo|muy|pero|como)\b/giu,
  fr: /\b(?:le|la|les|des|que|de|et|en|est|pour|avec|une|tu|vous|ce|pas|sur|mais)\b/giu,
  de: /\b(?:der|die|das|und|ist|mit|für|ein|eine|du|nicht|zu|den|dem|auf|es|wir)\b/giu,
  pt: /\b(?:os|as|que|de|em|é|para|com|um|uma|você|não|do|da|mais|mas)\b/giu,
  it: /\b(?:il|che|di|è|per|con|una|non|del|della|lo|gli|più|ma|sono)\b/giu,
};
export function replyLanguageProfile(value, names = []) {
  let text = typeof value === "string" ? value : "";
  for (const name of [...names]
    .filter((n) => typeof n === "string" && n.trim().length >= 2)
    .sort((a, b) => b.length - a.length))
    text = text.split(name.trim()).join(" ");
  text = text
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/《[^》\n]*》|“[^”\n]*”|「[^」\n]*」|『[^』\n]*』|"[^"\n]*"/g, " ")
    .replace(/(?<![\p{L}])[A-G](?:#|b|♯|♭)?-?\d(?![\p{L}\p{N}])/gu, " ")
    .replace(/\b(?:BPM|bpm|MIDI|PDF|MusicXML|OK|ok|Op|No)\b/g, " ");
  const count = (pattern) => (text.match(pattern) || []).length;
  const latinWords = text.match(/\p{Script=Latin}[\p{Script=Latin}'’-]*/gu) || [];
  return {
    han: count(/\p{Script=Han}/gu),
    kana: count(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu),
    hangul: count(/\p{Script=Hangul}/gu),
    cyrillic: count(/\p{Script=Cyrillic}+/gu),
    arabic: count(/\p{Script=Arabic}+/gu),
    devanagari: count(/\p{Script=Devanagari}+/gu),
    latinWords: latinWords.length,
    stopwords: Object.fromEntries(
      Object.entries(LATIN_STOPWORDS).map(([code, pattern]) => [code, count(pattern)]),
    ),
  };
}
export function replyLanguageFits(value, language, { names = [], final = false } = {}) {
  if (!isConversationLanguage(language)) return true;
  const p = replyLanguageProfile(value, names);
  const cjk = p.han + p.kana + p.hangul;
  const other = p.cyrillic + p.arabic + p.devanagari;
  const units = cjk + other + p.latinWords;
  if (units < (final ? 1 : 8)) return final ? true : null;
  switch (language) {
    case "zh":
    case "zh-Hant":
      return p.han >= p.latinWords && p.kana * 3 <= p.han && p.hangul === 0;
    case "ja":
      return p.kana >= 1 && p.kana + p.han >= p.latinWords;
    case "ko":
      return p.hangul >= p.latinWords;
    case "ru":
      return p.cyrillic >= p.latinWords;
    case "ar":
      return p.arabic >= p.latinWords;
    case "hi":
      return p.devanagari >= p.latinWords;
    case "en":
      return cjk + other <= p.latinWords &&
        !(p.stopwords.en === 0 && Object.entries(p.stopwords).some(([code, n]) => code !== "en" && n >= 4));
    default: {
      // Spanish, French, German, Portuguese, Italian: reject a CJK reply or a
      // reply that is plainly English.
      if (cjk + other > p.latinWords) return false;
      const own = p.stopwords[language] || 0;
      return !(p.stopwords.en >= 4 && own * 3 < p.stopwords.en);
    }
  }
}
