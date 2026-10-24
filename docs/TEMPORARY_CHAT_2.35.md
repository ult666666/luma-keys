# Temporary companion chat

The companion keeps the current conversation only in app memory. It no longer saves a transcript to the Library, browser storage, or a chat-history service. Minimizing or closing the little panel keeps the current exchange available during this app session. **New chat**, reloading, or quitting clears it. A model reply that arrives after New chat cannot restore the old conversation.

Music, practice history, saved positions, companion choice and display preferences are separate and remain saved. The pet can still help find a piece or resume practice using that musical context. Its replies still run locally; temporary chat does not add a cloud service.

## Using the panel

- **New chat** is always visible below the piece chip. It clears messages, draft, reactions and unfinished replies, then returns focus to the message box.
- Enter sends; Shift+Enter adds a line. Chinese/Japanese input composition does not accidentally send.
- Tab to the conversation to read with Arrow Up/Down, Page Up/Down, Home/End or Space. Reading older messages does not jump to a new reply. **Latest messages** brings you back and keeps keyboard focus in the conversation.
- **Options → Text size → Large** increases the text. Main header/reset controls are at least 40 px; Send/Stop is 44 px. Layouts retain the compact panel and reduced-motion support.
- Escape dismisses Options first, then minimizes the panel and returns focus. The piano keeps its own shortcuts while focus is outside chat.

## Existing history

On first launch, the app removes its old `Library/companion/conversation.json` and recognized unfinished chat-save files without reading or copying their contents. The previous history API discards any old-client writes instead of saving them. Cleanup failures appear in the panel with a retry action. The desktop app clears its old HTTP cache once; the migration marker contains only a version number. Old stored reaction identifiers are removed. New messages and reactions are never put into localStorage or sessionStorage.

The installation pass also removes the narrowly identified legacy conversation-file copies in this project's QA/update backups. It does not make another chat backup. Musical data is backed up separately.

These changes prevent application-level transcript saving. They are not a forensic secure-erasure or operating-system backup-management feature.

## Verification

Final automated results, exact package hash, cleanup counts and desktop checks are recorded in `evidence/temporary-chat-2.35-verification.json`. Native tests use synthetic messages and controlled local model responses; no personal conversation is used as a fixture and no real microphone is enabled.
