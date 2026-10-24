import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { randomUUID } from "node:crypto";
import express from "express";
import {
  registerBackingRoutes,
  MAX_BACKING_BYTES,
} from "../src/backing-store.mjs";
import { startServer } from "../server.mjs";
import { demos } from "../src/music.mjs";

function wav() {
  const b = Buffer.alloc(60);
  b.write("RIFF", 0);
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(16, 40);
  b.writeInt16LE(4096, 44);
  return b;
}
function ogg(codec = "OpusHead") {
  const b = Buffer.alloc(47);
  b.write("OggS", 0);
  b[5] = 2;
  b[26] = 1;
  b[27] = 19;
  b.write(codec, 28);
  b[36] = 1;
  return b;
}
function flac() {
  const b = Buffer.alloc(42);
  b.write("fLaC");
  b[4] = 0x80;
  b.writeUIntBE(34, 5, 3);
  return b;
}
function m4a(brand = "M4A ") {
  const b = Buffer.alloc(32);
  b.writeUInt32BE(24, 0);
  b.write("ftyp", 4);
  b.write(brand, 8);
  b.write("isommp42", 16);
  b.writeUInt32BE(8, 24);
  b.write("mdat", 28);
  return b;
}
async function setup(t, full = false) {
  await fs.mkdir(".qa-runs", { recursive: true });
  const root = await fs.mkdtemp(path.resolve(".qa-runs/backing-store-"));
  const dataDir = path.join(root, ".isolated", "Library");
  await fs.mkdir(dataDir, { recursive: true });
  let server, shutdown;
  if (full) ({ server, shutdown } = await startServer({ port: 0, dataDir }));
  else {
    const app = express();
    await registerBackingRoutes(app, { dataDir });
    server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
  }
  t.after(async () => {
    await shutdown?.();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  return {
    root,
    dataDir,
    directory: path.join(dataDir, "accompaniment"),
    base: `http://127.0.0.1:${server.address().port}`,
  };
}
const upload = (base, name, bytes, field = "audio") => {
  const form = new FormData();
  form.append(field, new Blob([bytes], { type: "text/plain" }), name);
  return fetch(base + "/api/backing-assets", { method: "POST", body: form });
};
async function cleanTemps(directory) {
  for (let i = 0; i < 40; i++) {
    const names = await fs.readdir(directory);
    if (!names.some((n) => n.endsWith(".tmp"))) return names;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail("An upload temporary file remained after its request finished");
}

test("backing storage accepts five audio signatures, preserves bytes and serves byte ranges and HEAD", async (t) => {
  const { base, directory } = await setup(t);
  const cases = [
    ["piano.MP3", await fs.readFile("public/samples/C4.mp3"), "audio/mpeg"],
    ["piano.wav", wav(), "audio/wav"],
    ["piano.m4a", m4a(), "audio/mp4"],
    ["piano.ogg", ogg(), "audio/ogg"],
    ["piano.flac", flac(), "audio/flac"],
  ];
  const ids = new Set();
  for (const [name, bytes, mime] of cases) {
    const response = await upload(base, name, bytes);
    assert.equal(response.status, 201, await response.clone().text());
    const asset = await response.json();
    assert.deepEqual(Object.keys(asset).sort(), [
      "id",
      "mime",
      "name",
      "size",
      "url",
    ]);
    assert.match(asset.id, /^[0-9a-f-]{36}$/);
    assert.ok(!ids.has(asset.id));
    ids.add(asset.id);
    assert.equal(asset.mime, mime);
    assert.equal(asset.size, bytes.length);
    assert.equal(asset.url, `/api/backing-assets/${asset.id}`);
    let r = await fetch(base + asset.url);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), mime);
    assert.equal(r.headers.get("accept-ranges"), "bytes");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), bytes);
    r = await fetch(base + asset.url, { headers: { Range: "bytes=4-15" } });
    assert.equal(r.status, 206);
    assert.equal(r.headers.get("content-range"), `bytes 4-15/${bytes.length}`);
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), bytes.subarray(4, 16));
    r = await fetch(base + asset.url, { method: "HEAD" });
    assert.equal(r.status, 200);
    assert.equal(+r.headers.get("content-length"), bytes.length);
    assert.equal(await r.text(), "");
  }
  assert.equal(
    (await cleanTemps(directory)).length,
    10,
    "Only five original files and five metadata files remain",
  );
});

test("display filenames are safe, Unicode survives, and relinking preserves the prior asset", async (t) => {
  const { base, directory } = await setup(t);
  const name = "../../folder\\晴天<take>:?.WAV";
  const first = await (await upload(base, name, wav())).json();
  assert.equal(first.name, "晴天take.wav");
  const second = await (await upload(base, name, wav())).json();
  assert.notEqual(first.id, second.id);
  assert.equal((await fetch(base + first.url)).status, 200);
  assert.equal((await fetch(base + second.url)).status, 200);
  assert.equal((await cleanTemps(directory)).length, 4);
  const metadata = JSON.parse(
    await fs.readFile(path.join(directory, first.id + ".json"), "utf8"),
  );
  assert.equal(metadata.name, first.name);
  assert.equal(metadata.extension, ".wav");
  assert.equal(metadata.size, wav().length);
});

test("bad extensions, misleading signatures, empty or malformed uploads leave no assets or temporaries", async (t) => {
  const { base, directory } = await setup(t);
  const cases = [
    ["text.wav", Buffer.from("<html>not audio</html>")],
    ["text.mp3", Buffer.from("ID3")],
    ["wav.mp3", wav()],
    ["video.ogg", ogg("\x80theora")],
    ["image.m4a", m4a("avif")],
    ["text.flac", Buffer.from("fLaCnot a stream info block")],
    ["empty.wav", Buffer.alloc(0)],
    ["audio.exe", wav()],
    ["track", wav()],
  ];
  for (const [name, bytes] of cases) {
    const r = await upload(base, name, bytes);
    assert.equal(r.status, 400, `${name}: ${await r.text()}`);
    assert.deepEqual(await cleanTemps(directory), []);
  }
  assert.equal((await upload(base, "track.wav", wav(), "score")).status, 400);
  assert.equal(
    (
      await fetch(base + "/api/backing-assets", {
        method: "POST",
        body: new FormData(),
      })
    ).status,
    400,
  );
  const two = new FormData();
  two.append("audio", new Blob([wav()]), "first.wav");
  two.append("audio", new Blob([wav()]), "second.wav");
  assert.equal(
    (await fetch(base + "/api/backing-assets", { method: "POST", body: two }))
      .status,
    400,
  );
  assert.deepEqual(await cleanTemps(directory), []);
});

function sizedMultipart(base, size) {
  const boundary = "luma-backing-size-boundary";
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="large.wav"\r\nContent-Type: audio/wav\r\n\r\n`,
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  const zeroes = Buffer.alloc(256 * 1024),
    header = wav();
  async function* body() {
    yield prefix;
    yield header;
    for (let left = size - header.length; left > 0; left -= zeroes.length)
      yield zeroes.subarray(0, Math.min(left, zeroes.length));
    yield suffix;
  }
  return fetch(base + "/api/backing-assets", {
    method: "POST",
    body: body(),
    duplex: "half",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(prefix.length + size + suffix.length),
    },
  });
}

test("the 100 MiB streaming limit accepts its boundary and gives a correct oversize error with cleanup", async (t) => {
  const { base, directory } = await setup(t);
  assert.equal(MAX_BACKING_BYTES, 100 * 1024 * 1024);
  let r = await sizedMultipart(base, MAX_BACKING_BYTES);
  assert.equal(r.status, 201, await r.clone().text());
  const asset = await r.json();
  assert.equal(asset.size, MAX_BACKING_BYTES);
  const before = (await cleanTemps(directory)).sort();
  r = await sizedMultipart(base, MAX_BACKING_BYTES + 1);
  assert.equal(r.status, 413);
  const error = (await r.json()).error;
  assert.match(error, /100 MB/);
  assert.doesNotMatch(error, /30 MB/);
  assert.deepEqual((await cleanTemps(directory)).sort(), before);
});

test("invalid IDs, forged metadata and symlinks cannot serve unrelated files", async (t) => {
  const { base, directory, root } = await setup(t);
  const secret = path.join(root, "unrelated.txt");
  await fs.writeFile(secret, "unrelated private bytes");
  for (const id of [
    "preferences",
    "..%2funrelated.txt",
    "..%5cunrelated.txt",
    "not-a-uuid",
    randomUUID() + ".json",
  ]) {
    const r = await fetch(base + "/api/backing-assets/" + id);
    assert.equal(r.status, 400, id);
    assert.doesNotMatch(await r.text(), /unrelated private bytes/);
  }
  assert.equal(
    (await fetch(base + "/api/backing-assets/" + randomUUID())).status,
    404,
  );
  const asset = await (await upload(base, "safe.wav", wav())).json();
  const metadataPath = path.join(directory, asset.id + ".json"),
    audioPath = path.join(directory, asset.id + ".wav");
  const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
  await fs.writeFile(
    metadataPath,
    JSON.stringify({ ...metadata, extension: "/../../unrelated.txt" }),
  );
  assert.equal((await fetch(base + asset.url)).status, 404);
  await fs.writeFile(
    metadataPath,
    JSON.stringify({ ...metadata, filename: secret, path: secret }),
  );
  assert.deepEqual(
    Buffer.from(await (await fetch(base + asset.url)).arrayBuffer()),
    wav(),
    "Untrusted path fields are ignored",
  );
  await fs.rm(audioPath);
  await fs.symlink(secret, audioPath);
  assert.equal((await fetch(base + asset.url)).status, 404);
  await fs.rm(metadataPath);
  await fs.symlink(secret, metadataPath);
  assert.equal((await fetch(base + asset.url)).status, 404);
  assert.equal(await fs.readFile(secret, "utf8"), "unrelated private bytes");
});

test("aborted multipart uploads remove their partially written file", async (t) => {
  const { base, directory } = await setup(t);
  const boundary = "luma-aborted-upload";
  const req = http.request(base + "/api/backing-assets", {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
  });
  req.on("error", () => {});
  req.write(
    `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="unfinished.wav"\r\n\r\n`,
  );
  req.write(wav());
  req.write(Buffer.alloc(65536));
  for (let i = 0; i < 40 && !(await fs.readdir(directory)).length; i++)
    await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(
    (await fs.readdir(directory)).length,
    1,
    "An owned partial upload exists before abort",
  );
  req.destroy();
  assert.deepEqual(await cleanTemps(directory), []);
});

test("registered app routes preserve legacy library bytes, exclude asset metadata, and retain local-origin policy", async (t) => {
  const { base, dataDir, directory } = await setup(t, true);
  const legacy = '{"theme":"rose","pet":"bunny"}\n';
  await fs.writeFile(path.join(dataDir, "preferences.json"), legacy);
  const score = { ...demos()[0], id: "backing-legacy-score" };
  const scoreBytes = JSON.stringify(score);
  await fs.writeFile(path.join(dataDir, score.id + ".json"), scoreBytes);
  const first = await (await upload(base, "pop backing.wav", wav())).json();
  assert.ok(first.id);
  const library = await (await fetch(base + "/api/library")).json();
  assert.equal(library.scores.length, 1);
  assert.deepEqual(library.issues, []);
  assert.equal(
    await fs.readFile(path.join(dataDir, "preferences.json"), "utf8"),
    legacy,
  );
  assert.equal(
    await fs.readFile(path.join(dataDir, score.id + ".json"), "utf8"),
    scoreBytes,
  );
  assert.equal(
    (
      await fetch(base + first.url, {
        headers: { Origin: "https://untrusted.example" },
      })
    ).status,
    403,
  );
  const r = await fetch(base + first.url, {
    headers: { Range: "bytes=99999-" },
  });
  assert.equal(r.status, 416);
  assert.equal(r.headers.get("content-range"), `bytes */${wav().length}`);
  assert.match(r.headers.get("content-type"), /application\/json/);
  const app = express();
  await registerBackingRoutes(app, { dataDir });
  const reopened = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  try {
    assert.deepEqual(
      Buffer.from(
        await (
          await fetch(`http://127.0.0.1:${reopened.address().port}` + first.url)
        ).arrayBuffer(),
      ),
      wav(),
    );
  } finally {
    await new Promise((resolve) => reopened.close(resolve));
  }
  assert.equal((await cleanTemps(directory)).length, 2);
});
