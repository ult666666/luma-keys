import { Fragment } from "react";

// A deliberately small text formatter. Model output remains text: no HTML,
// links, images, commands or embedded controls can be created by a reply.
// `inline code` keeps its contents literal: spans are swapped for markers
// before bold and italics are found, then put back as <code>.
const MARK = /\u0000(\d+)\u0000/g;
function withCode(text, spans, key) {
  return text.split(MARK).map((part, index) =>
    index % 2 ? (
      <code key={`${key}-c${index}`} className="chat-inline-code">
        {spans[Number(part)]}
      </code>
    ) : (
      part && <Fragment key={`${key}-t${index}`}>{part}</Fragment>
    ),
  );
}
function emphasis(source) {
  const spans = [];
  const text = source
    .replace(/\u0000/g, "")
    .replace(
      /`([^`\n]+)`/g,
      (_, body) => `\u0000${spans.push(body) - 1}\u0000`,
    );
  return text
    .split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g)
    .map((part, index) =>
      part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
        <strong key={index}>{withCode(part.slice(2, -2), spans, index)}</strong>
      ) : part.startsWith("*") && part.endsWith("*") && part.length > 2 ? (
        <em key={index}>{withCode(part.slice(1, -1), spans, index)}</em>
      ) : (
        <Fragment key={index}>{withCode(part, spans, index)}</Fragment>
      ),
    );
}
// Fenced code (```lang … ```) is cut out before paragraphs are split. While a
// reply is still streaming, an unterminated fence renders the rest as code.
export function splitFences(text) {
  const parts = [];
  const fence = /```[\w+#.-]*[ \t]*\n?([\s\S]*?)(```|$)/g;
  let last = 0;
  for (const match of text.matchAll(fence)) {
    if (match.index > last)
      parts.push({ kind: "text", body: text.slice(last, match.index) });
    parts.push({ kind: "code", body: match[1].replace(/\n$/, "") });
    last = match.index + match[0].length;
    if (!match[0].length) break;
  }
  if (last < text.length) parts.push({ kind: "text", body: text.slice(last) });
  return parts;
}
function paragraphs(text, prefix) {
  return text
    .split(/\n\s*\n/)
    .filter((block) => block.trim())
    .map((block, index) => {
      const key = `${prefix}-${index}`;
      const lines = block.replace(/^\n+|\n+$/g, "").split("\n");
      const numbered = lines.map((line) =>
        line.match(/^\s*(\d{1,2})[.)]\s+(.+)$/),
      );
      const bullets = lines.map((line) => line.match(/^\s*[-*•]\s+(.+)$/));
      if (numbered.every(Boolean))
        return (
          <ol key={key} start={Number(numbered[0][1])} dir="auto">
            {numbered.map((line, i) => (
              <li key={i} value={Number(line[1])}>
                {emphasis(line[2])}
              </li>
            ))}
          </ol>
        );
      if (bullets.every(Boolean))
        return (
          <ul key={key} dir="auto">
            {bullets.map((line, i) => (
              <li key={i}>{emphasis(line[1])}</li>
            ))}
          </ul>
        );
      return (
        <p key={key} dir="auto">
          {emphasis(lines.join("\n"))}
        </p>
      );
    });
}
// Code wraps inside the narrow chat instead of scrolling sideways; each
// line hangs its wrapped part under its own indentation (plus two columns),
// so a wrapped line never reads as a new, less-indented one.
function codeLines(body) {
  return body.split("\n").map((line, index) => {
    const indent = line.match(/^[ \t]*/)[0].replace(/\t/g, "    ").length;
    return (
      <span
        key={index}
        className="chat-code-line"
        style={{ "--hang": `${indent + 2}ch` }}
      >
        {line || " "}
      </span>
    );
  });
}
export default function CompanionReply({ text }) {
  return (
    <div className="chat-reply-copy" dir="auto">
      {splitFences(text).flatMap((part, index) =>
        part.kind === "code" ? (
          part.body.trim() ? (
            <pre key={`code-${index}`} className="chat-code" dir="ltr">
              <code>{codeLines(part.body)}</code>
            </pre>
          ) : (
            []
          )
        ) : (
          paragraphs(part.body, index)
        ),
      )}
    </div>
  );
}
