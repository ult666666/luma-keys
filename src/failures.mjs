// What a failed request means to a reader (2.44). A reader's mistake (an
// invalid file or setting) stays a 400 with its own explanation; a full
// disk, a Library that cannot be written, or an unexpected fault is the
// app's side, gets its own status and plain words, and never shows a raw
// system message such as "ENOSPC: no space left on device, open '/…'".
const DISK_FULL = new Set(["ENOSPC", "EDQUOT"]);
const NO_ACCESS = new Set(["EACCES", "EPERM", "EROFS"]);
const SYSTEM = /^E[A-Z0-9]+$/;

export function describeFailure(e) {
  if (e?.code === "LIMIT_FILE_SIZE")
    return { status: 413, error: "Please use a file smaller than 30 MB." };
  if (DISK_FULL.has(e?.code))
    return {
      status: 507,
      error:
        "Your disk is full, so this could not be saved. Free some space, then try again.",
    };
  if (NO_ACCESS.has(e?.code))
    return {
      status: 503,
      error:
        "Luma Keys can't write to its Library folder. Check the folder's permissions in Finder, then try again.",
    };
  if (e?.type === "entity.too.large")
    return { status: 413, error: "That is too large to save." };
  if (e?.type === "entity.parse.failed")
    return { status: 400, error: "That request was not valid JSON." };
  if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500)
    return { status: e.status, error: String(e.message || "Request refused.") };
  if (
    (typeof e?.code === "string" && SYSTEM.test(e.code)) ||
    e instanceof TypeError ||
    e instanceof ReferenceError ||
    (Number.isInteger(e?.status) && e.status >= 500)
  )
    return {
      status: 500,
      error:
        "Something went wrong reading or saving your files. Please try again.",
    };
  // Everything else is a validation message written for the reader.
  return { status: 400, error: String(e?.message || "Something went wrong.") };
}
