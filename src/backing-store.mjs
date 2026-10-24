import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";

export const MAX_BACKING_BYTES = 100 * 1024 * 1024;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FORMATS = Object.freeze({
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
});
const badFile = () =>
  Object.assign(
    new Error("Choose a valid MP3, WAV, M4A, OGG or FLAC audio file."),
    { status: 400 },
  );

function displayName(original, extension) {
  // Multipart filenames may arrive as UTF-8 bytes interpreted as Latin-1.
  let name = String(original || "");
  if ([...name].every((c) => c.codePointAt(0) <= 255)) {
    const decoded = Buffer.from(name, "latin1").toString("utf8");
    if (!decoded.includes("\ufffd")) name = decoded;
  }
  name = name
    .normalize("NFC")
    .replaceAll("\\", "/")
    .split("/")
    .at(-1)
    .replace(
      /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069<>:"|?*]/g,
      "",
    )
    .replace(/^[.\s]+|[.\s]+$/g, "");
  const stem =
    name.slice(0, -path.extname(name).length).trim().slice(0, 170) ||
    "Backing track";
  return stem + extension;
}

function mp3Frame(b, offset = 0) {
  return (
    b.length >= offset + 4 &&
    b[offset] === 0xff &&
    (b[offset + 1] & 0xe0) === 0xe0 &&
    ((b[offset + 1] >> 3) & 3) !== 1 &&
    ((b[offset + 1] >> 1) & 3) === 1 &&
    b[offset + 2] >> 4 !== 15 &&
    ((b[offset + 2] >> 2) & 3) !== 3
  );
}

async function matchesFormat(file, extension) {
  const handle = await fs.open(file.path, "r");
  try {
    const header = Buffer.alloc(Math.min(4096, file.size));
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const b = header.subarray(0, bytesRead);
    if (extension === ".wav")
      return (
        b.length >= 12 &&
        ["RIFF", "RIFX", "RF64"].includes(b.toString("ascii", 0, 4)) &&
        b.toString("ascii", 8, 12) === "WAVE"
      );
    if (extension === ".flac")
      return (
        b.length >= 42 &&
        b.toString("ascii", 0, 4) === "fLaC" &&
        (b[4] & 0x7f) === 0 &&
        b.readUIntBE(5, 3) === 34
      );
    if (extension === ".ogg") {
      if (
        b.length < 28 ||
        b.toString("ascii", 0, 4) !== "OggS" ||
        b[4] !== 0 ||
        !b[26]
      )
        return false;
      const packet = 27 + b[26];
      return (
        b.subarray(packet, packet + 8).equals(Buffer.from("OpusHead")) ||
        b
          .subarray(packet, packet + 7)
          .equals(Buffer.from("\x01vorbis", "binary")) ||
        b.subarray(packet, packet + 5).equals(Buffer.from("\x7fFLAC", "binary"))
      );
    }
    if (extension === ".m4a") {
      if (b.length < 16 || b.toString("ascii", 4, 8) !== "ftyp") return false;
      const size = b.readUInt32BE(0);
      const brands = [
        "M4A ",
        "M4B ",
        "isom",
        "iso2",
        "mp41",
        "mp42",
        "qt  ",
        "dash",
      ];
      return (
        size >= 16 &&
        size <= file.size &&
        size <= b.length &&
        brands.includes(b.toString("ascii", 8, 12))
      );
    }
    if (extension === ".mp3") {
      if (mp3Frame(b)) return true;
      if (
        b.length < 10 ||
        b.toString("ascii", 0, 3) !== "ID3" ||
        ![2, 3, 4].includes(b[3]) ||
        b[4] === 0xff ||
        b.subarray(6, 10).some((x) => x & 0x80)
      )
        return false;
      const tagLength = b[6] * 2097152 + b[7] * 16384 + b[8] * 128 + b[9];
      const offset = 10 + tagLength;
      if (offset + 4 > file.size) return false;
      // Permit a footer or a little padding after an ID3 tag, then require an
      // MPEG Layer III frame. A text file containing just ID3 is not audio.
      const frames = Buffer.alloc(Math.min(4096, file.size - offset));
      const read = await handle.read(frames, 0, frames.length, offset);
      for (let i = 0; i <= read.bytesRead - 4; i++)
        if (mp3Frame(frames, i)) return true;
    }
    return false;
  } finally {
    await handle.close();
  }
}

const publicAsset = ({ id, name, mime, size }) => ({
  id,
  name,
  url: `/api/backing-assets/${id}`,
  mime,
  size,
});

export async function registerBackingRoutes(
  app,
  { dataDir, log = null, sweep = true },
) {
  const directory = path.resolve(dataDir, "accompaniment");
  // A read-only library still opens: without this folder, adding a backing
  // track fails with an error instead of the whole app failing to start.
  // (Multer is given a destination function, because a destination path is
  // created synchronously when the storage is configured.)
  const ensureDirectory = async () => {
    await fs.mkdir(directory, { recursive: true });
    const directoryStat = await fs.lstat(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink())
      throw new Error("The accompaniment folder must be a local directory.");
  };
  // (A folder that cannot be used at startup — a read-only library, a file
  // in its place, a link to somewhere else — leaves accompaniment audio
  // unavailable; it never stops the app from opening. It is checked again
  // when audio is added or played, so a repaired folder works at once.)
  let ready = true;
  try {
    await ensureDirectory();
  } catch (e) {
    ready = false;
    if (!["EACCES", "EPERM", "EROFS"].includes(e.code))
      log?.record?.("accompaniment-folder-unusable", {
        code: e.code || "not-a-local-folder",
      });
  }
  // Uploads interrupted by a quit (up to 100 MB each) leave their temporary
  // files; nothing is uploading while the app starts, so they go now.
  if (ready && sweep)
    for (const name of await fs.readdir(directory).catch(() => []))
      if (/^\.(upload|metadata)-[0-9a-f-]{36}\.tmp$/.test(name))
        await fs
          .rm(path.join(directory, name), { force: true })
          .catch(() => {});
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, done) => {
        if (ready) return done(null, directory);
        ensureDirectory().then(() => {
          ready = true;
          done(null, directory);
        }, done);
      },
      filename: (_req, _file, done) =>
        done(null, `.upload-${randomUUID()}.tmp`),
    }),
    limits: { fileSize: MAX_BACKING_BYTES, files: 1, fields: 0, parts: 1 },
    fileFilter: (_req, file, done) => {
      const extension = path.extname(file.originalname).toLowerCase();
      done(FORMATS[extension] ? null : badFile(), !!FORMATS[extension]);
    },
  }).single("audio");

  app.post("/api/backing-assets", (req, res) => {
    upload(req, res, async (uploadError) => {
      let audioPath,
        metadataPath,
        metadataTemp,
        publishedAudio = false,
        publishedMetadata = false;
      try {
        if (uploadError) {
          if (uploadError.code === "LIMIT_FILE_SIZE")
            throw Object.assign(
              new Error("Choose an audio file no larger than 100 MB."),
              { status: 413 },
            );
          throw Object.assign(uploadError, { status: 400 });
        }
        const file = req.file;
        if (!file || !file.size) throw badFile();
        const extension = path.extname(file.originalname).toLowerCase();
        if (!(await matchesFormat(file, extension))) throw badFile();
        const id = randomUUID();
        const metadata = {
          id,
          name: displayName(file.originalname, extension),
          extension,
          mime: FORMATS[extension],
          size: file.size,
        };
        audioPath = path.join(directory, id + extension);
        metadataPath = path.join(directory, id + ".json");
        metadataTemp = path.join(directory, `.metadata-${id}.tmp`);
        // Publishing a hard link is atomic and exclusive: even a pre-existing
        // UUID path cannot be replaced. Metadata is the final commit marker.
        await fs.link(file.path, audioPath);
        publishedAudio = true;
        await fs.writeFile(metadataTemp, JSON.stringify(metadata), {
          flag: "wx",
          mode: 0o600,
        });
        await fs.link(metadataTemp, metadataPath);
        publishedMetadata = true;
        res.status(201).json(publicAsset(metadata));
      } catch (error) {
        if (!publishedMetadata && publishedAudio)
          await fs.rm(audioPath, { force: true }).catch(() => {});
        if (!res.headersSent && !res.destroyed)
          res.status(error.status || 500).json({
            error: error.status
              ? error.message
              : "The audio file could not be saved. Check access to the Library folder and try again.",
          });
      } finally {
        if (req.file?.path)
          await fs.rm(req.file.path, { force: true }).catch(() => {});
        if (metadataTemp)
          await fs.rm(metadataTemp, { force: true }).catch(() => {});
      }
    });
  });

  app.get("/api/backing-assets/:id", async (req, res) => {
    const id = req.params.id;
    if (!UUID.test(id))
      return res.status(400).json({ error: "Invalid backing audio ID." });
    try {
      if (!ready) {
        await ensureDirectory().catch(() => {
          throw badFile();
        });
        ready = true;
      }
      const metadataPath = path.join(directory, id + ".json");
      const metadataStat = await fs.lstat(metadataPath);
      if (
        !metadataStat.isFile() ||
        metadataStat.isSymbolicLink() ||
        metadataStat.size > 4096
      )
        throw badFile();
      const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
      if (
        !metadata ||
        metadata.id !== id ||
        !FORMATS[metadata.extension] ||
        metadata.mime !== FORMATS[metadata.extension] ||
        !Number.isSafeInteger(metadata.size) ||
        metadata.size <= 0 ||
        metadata.size > MAX_BACKING_BYTES ||
        typeof metadata.name !== "string" ||
        metadata.name !== displayName(metadata.name, metadata.extension)
      )
        throw badFile();
      // Never accept a path from metadata. Only UUID + an allowed extension.
      const fileName = id + metadata.extension;
      const stat = await fs.lstat(path.join(directory, fileName));
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size !== metadata.size
      )
        throw badFile();
      res.type(metadata.mime);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.sendFile(
        fileName,
        {
          root: directory,
          acceptRanges: true,
          dotfiles: "deny",
          cacheControl: false,
        },
        (error) => {
          if (!error) return;
          if (res.headersSent) res.destroy(error);
          else
            res
              .status(error.status === 416 ? 416 : 404)
              .type("json")
              .json({
                error:
                  "The backing audio could not be read. Relink its original file.",
              });
        },
      );
    } catch {
      res.status(404).json({
        error:
          "The backing audio could not be found. Relink its original file.",
      });
    }
  });
}
