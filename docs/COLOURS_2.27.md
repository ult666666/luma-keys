# Colours and workspace alignment — 2.27

The palette button in the app bar opens a compact picker beside the companion button. Choose Neutral, Sage, Lavender, Rose, Ocean or Walnut. **Match companion** follows the selected character, including Liszt's own palette. A fixed palette stays fixed when you change character. The same choices remain in Settings.

Choices apply immediately to the app chrome, Library, Exercises, Progress, conversation, keyboard materials and instrument frame. The song artwork keeps its original colours. Blue and amber still identify the two hands. Colour changes leave the current score, bar, practice hand, speed, mode and piano room setting intact; Listen continues playing.

The picker supports arrow keys, Home/End, Enter/Space and Escape. Tab returns to ordinary app controls. In a short window it scrolls to the focused colour. Keyboard input within it does not play notes or seek. Outside clicks dismiss it, and Escape returns focus to its button. Saved choices survive reopening. Reduced motion removes its entrance and transitions.

Library's header uses the available column width rather than the whole window's width. Search and the companion have explicit grid cells; the resume card and filters adapt as the column narrows. At widths of 901 pixels or more, Library reserves a separate column for open conversation. Compact windows use the existing floating conversation, with its Close/Minimize controls. The app bar gives action buttons their actual width; Import stays on one line. The picker paints above mobile navigation, and every colour uses dark readable text.

Verification and installation records are in `.qa-runs/colour-flow-2.27/`; the public evidence summary is `evidence/colour-flow-2.27-verification.json`. Native checks use separate copies of three real scores and muted output. This pass does not retrain the companion model or make a claim about physical MIDI or audible sound quality.
