// What to tell someone when Luma Keys cannot open its Library folder, in
// plain words and with the one thing that fixes it. (Before 2.43 the app
// showed a raw stack trace and quit.) Pure, so it can be tested.
function libraryProblem(error) {
  const dir = error?.dir || "the Library folder";
  const code = error?.code || "";
  if (code === "EACCES" || code === "EPERM")
    return [
      "macOS has not let Luma Keys use this folder:",
      dir,
      "",
      "Open System Settings › Privacy & Security › Files and Folders and allow Luma Keys to use the Desktop folder. If it is already allowed, check the folder's permissions in Finder (Get Info › Sharing & Permissions).",
      "",
      "Then choose Try Again. Nothing has been changed or deleted.",
    ].join("\n");
  if (code === "EEXIST" || code === "ENOTDIR")
    return [
      "Something that is not a folder is in the way:",
      dir,
      "",
      "Rename or move that file, then choose Try Again. Nothing has been changed or deleted.",
    ].join("\n");
  if (code === "EROFS")
    return [
      "The disk that holds this folder is read-only:",
      dir,
      "",
      "Make the disk writable, then choose Try Again.",
    ].join("\n");
  return [
    "This folder could not be opened" + (code ? ` (${code})` : "") + ":",
    dir,
    "",
    "Check that it exists and that you can open it in Finder, then choose Try Again. Nothing has been changed or deleted.",
  ].join("\n");
}
module.exports = { libraryProblem };
