// Prepares a hand model off the main thread (hand3d-data.mjs prepareHandData:
// the mesh's edits, subdivision and sculpting, skin attributes, tangents —
// about a tenth of a second a hand), so the stage never stalls while the
// realistic hands load. One message per hand: { id, hand, url, look } →
// { id, ok, data } (transferable arrays) or { id, ok: false, error }.
import { handTemplate } from "./hand3d-rig.mjs";
import { prepareHandData, serialise } from "./hand3d-data.mjs";

self.onmessage = async (event) => {
  const { id, hand, url, look } = event.data || {};
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`hand model ${hand}: ${res.status}`);
    const { msg, transfer } = serialise(prepareHandData(handTemplate(await res.arrayBuffer(), hand), undefined, look || {}));
    self.postMessage({ id, ok: true, data: msg }, transfer);
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error?.message || error) });
  }
};
