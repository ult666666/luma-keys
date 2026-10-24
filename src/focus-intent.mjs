// How the focused control got its focus. Space plays and pauses everywhere
// except in a text field; a button the reader reached with Tab keeps Space
// (that is how keyboard users press it), but a button that was merely
// clicked does not, so clicking Wait and then pressing Space plays instead
// of pressing Wait again. `:focus-visible` cannot tell the two apart once a
// key is down, so the last input before each focus is remembered here.

const byPointer = new WeakSet();
let lastPointer = -Infinity,
  lastKey = -Infinity;
const MODIFIERS = new Set(["Shift", "Meta", "Control", "Alt", "CapsLock"]);

/** Note a pointer press (a mouse or touch down). */
export function notePointer(now) {
  lastPointer = now;
}
/** Note a key press; modifiers alone do not move focus. */
export function noteKey(key, now) {
  if (!MODIFIERS.has(key)) lastKey = now;
}
/** Call on every focus change: remembers whether a pointer caused it. */
export function noteFocus(el) {
  if (!el || typeof el !== "object") return;
  if (lastPointer > lastKey) byPointer.add(el);
  else byPointer.delete(el);
}
/** Mark a control as pointer-focused, e.g. after focus is handed back to
 * the button that was clicked to open a dialog. */
export function markPointerFocus(el) {
  if (el && typeof el === "object") byPointer.add(el);
}
export const focusedByPointer = (el) =>
  !!el && typeof el === "object" && byPointer.has(el);

/** Hand focus back to `el` the way it was first reached: a clicked button
 * gets focus back without a focus ring and stays "clicked" for Space. */
export function restoreFocus(el, pointer, options = {}) {
  if (!el?.focus) return;
  el.focus(pointer ? { ...options, focusVisible: false } : options);
  if (pointer) markPointerFocus(el);
}

const CONTROL =
  "button, a[href], input, select, summary, [role=button], [role=tab], [role=radio], [role=switch], [role=checkbox], [role=menuitem], [role=menuitemcheckbox]";
const NON_TEXT_INPUTS = new Set([
  "range",
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "color",
]);

/** Who a key press over `target` belongs to:
 * "text"    a text field keeps every key;
 * "control" a control reached with the keyboard keeps Space (and its own
 *           keys), so it can be pressed;
 * "app"     the shortcut applies. */
export function keyOwner(target, { code = "", pointer = false } = {}) {
  if (!target || typeof target !== "object") return "app";
  const tag = target.tagName || "";
  if (target.isContentEditable || tag === "TEXTAREA") return "text";
  if (tag === "INPUT" && !NON_TEXT_INPUTS.has(target.type)) return "text";
  // A list keeps its letters (type-ahead); Space opens it only when it was
  // reached with the keyboard.
  if (tag === "SELECT" && !(code === "Space" && pointer)) return "text";
  if (code !== "Space") return "app";
  const control = target.closest?.(CONTROL);
  return control && !pointer ? "control" : "app";
}

/** Listen on a window for the input that precedes each focus change. */
export function installFocusIntent(win) {
  const now = () => win.performance?.now?.() ?? Date.now();
  const down = () => notePointer(now());
  const key = (e) => noteKey(e.key, now());
  const focus = (e) => noteFocus(e.target);
  win.addEventListener("pointerdown", down, true);
  win.addEventListener("keydown", key, true);
  win.addEventListener("focusin", focus, true);
  return () => {
    win.removeEventListener("pointerdown", down, true);
    win.removeEventListener("keydown", key, true);
    win.removeEventListener("focusin", focus, true);
  };
}
