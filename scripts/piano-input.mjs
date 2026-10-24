import { expect } from "@playwright/test";

// Since 2.34 "Connect piano" opens the piano-input dialog (microphone or
// USB / MIDI). A harness that wants its simulated MIDI keyboard chooses
// USB / MIDI there; the button then shows the connected input's name.
export async function connectMidi(page, name = null) {
  const connect = page.getByRole("button", {
    name: "Connect piano",
    exact: true,
  });
  await connect.click();
  const midi = page.getByRole("button", { name: /USB \/ MIDI piano/ });
  await midi.click();
  await expect(midi).toBeHidden();
  if (name) await expect(connect).toContainText(name);
  return connect;
}
