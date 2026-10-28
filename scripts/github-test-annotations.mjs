// Reports each failing test as a GitHub Actions error annotation. The run page
// and the checks API then name the test and its error without the full log.
// CI runs it next to the usual spec output:
//   node --test --test-reporter=spec --test-reporter-destination=stdout \
//     --test-reporter=./scripts/github-test-annotations.mjs \
//     --test-reporter-destination=stdout tests/*.test.mjs
import path from "node:path";
import { inspect } from "node:util";

const escapeData = (text) =>
  text.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
const escapeProperty = (text) =>
  escapeData(text).replaceAll(":", "%3A").replaceAll(",", "%2C");

export default async function* githubTestAnnotations(source) {
  for await (const event of source) {
    if (event.type !== "test:fail") continue;
    const { name, file, line, column, details } = event.data;
    const error = details?.error;
    // A parent whose subtests failed adds nothing: each subtest reports itself.
    if (error?.failureType === "subtestsFailed") continue;
    const cause = error?.cause ?? error;
    const message = (typeof cause === "string" ? cause : inspect(cause, { depth: 3 }))
      .split("\n")
      .slice(0, 30)
      .join("\n");
    const where = file
      ? `file=${escapeProperty(path.relative(process.cwd(), file))},line=${line ?? 1},col=${column ?? 1},`
      : "";
    yield `::error ${where}title=${escapeProperty(name)}::${escapeData(message)}\n`;
  }
}
