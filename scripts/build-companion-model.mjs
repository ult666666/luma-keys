import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.platform !== "darwin") {
  throw Error(
    "The on-device companion helper must be built on macOS with the macOS 26 SDK.",
  );
}
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(stdout.trim())
        : reject(Error(stderr.trim() || `${command} failed (${code}).`)),
    );
  });
}
const sdk = await run("xcrun", ["--sdk", "macosx", "--show-sdk-path"]);
const arch = process.arch === "arm64" ? "arm64" : "x86_64";
const output = path.join(root, "engines/companion-model");
const temporary = `${output}.building-${process.pid}`;
const cache = path.join(root, ".qa-runs/conversation-2.9/swift-module-cache");
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.mkdir(cache, { recursive: true });
try {
  await run("xcrun", [
    "swiftc",
    "-parse-as-library",
    "-O",
    "-sdk",
    sdk,
    "-target",
    `${arch}-apple-macosx13.0`,
    "-module-cache-path",
    cache,
    "-Xlinker",
    "-weak_framework",
    "-Xlinker",
    "FoundationModels",
    path.join(root, "native/CompanionModel.swift"),
    "-o",
    temporary,
  ]);
  const loadCommands = await run("otool", ["-l", temporary]);
  if (
    !/cmd LC_LOAD_WEAK_DYLIB\s+cmdsize \d+\s+name .*FoundationModels\.framework\//.test(
      loadCommands,
    )
  )
    throw Error(
      "FoundationModels must be weak linked so older macOS versions can report unavailable.",
    );
  await fs.chmod(temporary, 0o755);
  await fs.rename(temporary, output);
  console.log(
    `Built engines/companion-model (${arch}, macOS 13+, FoundationModels weak linked).`,
  );
} finally {
  await fs.rm(temporary, { force: true });
}
