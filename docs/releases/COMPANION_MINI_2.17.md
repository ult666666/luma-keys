# Mini companion · 2.17

Open the companion beside the music. The conversation is now a compact side panel, with no dimmed backdrop or locked main screen. On wide windows, the score makes room for it; on smaller windows it floats above the lower part of the app. Opening it pauses playback once. You can then use Play, browse Library or play a MIDI keyboard while the conversation stays open.

## Small gestures, useful controls

- Touch the portrait, or focus it and press Enter or Space, for a heart-wave or a musical greeting. The pet also reacts while you type and while it prepares a reply.
- Use the minus button to tuck the panel into a small pet tab. Your unfinished draft stays there.
- Use the × button or Escape to close it. Keyboard focus returns to a visible opener.
- The dots menu contains companion selection, English/中文, playing tips and conversation controls.
- Decorative gestures finish quickly. Reduced Motion keeps the feedback still.

Typing, composing Chinese text, and using chat buttons do not trigger the computer-piano shortcuts. Enter sends; Shift+Enter makes a new line. Tab can leave the panel normally. Closing, minimizing, changing the piece or opening a dialog stops an unfinished model reply.

## Language and conversation

`能用中文回答我吗？` now receives a short Chinese acknowledgement. The selected language stays with later replies, even when you type a follow-up in English. Ask `Please reply in English` or use the menu to switch back. The choice is saved with the conversation.

Practice questions, saved places, written notes, repeat ranges, speed and hand selection use the app's score data and existing validated actions. General conversation uses the Mac's on-device model. Its prompt now asks for a short, direct response, with less raw score data in the conversation. The output budget is smaller, and detected repeated sentences stop with a visible interruption instead of continuing indefinitely.

For example, “I only have five minutes to practise” offers the first written action in the current bar, plus a one-bar repeat option. “More simply, with just one suggestion” stays with that written action. The “Both hands” filter is no longer presented to the model as evidence that both hands have notes.

This update changes the interface, routing, prompts and response handling; it does not retrain the model. General replies may still be basic, slow or mistaken, and the Apple model can sometimes decline an ordinary question. Interrupted or declined replies remain visible as errors with retry controls. The characters are fictional companions, and generated prose does not execute app actions.

## Evidence

The development record is in `.qa-runs/companion-mini-2.17/`. It separates controlled streaming tests from real Apple-model replies and retains unsuccessful attempts. The installation summary is saved in `evidence/companion-mini-2.17-verification.json` after final acceptance.
