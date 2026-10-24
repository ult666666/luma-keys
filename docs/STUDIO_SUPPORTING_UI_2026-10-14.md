# Supporting studio pages · 14 October 2026

This change refines Exercises, Library and Progress within the existing React 19 interface. It uses the existing serif type, room palette, illustrated score covers, native controls and persistence model. Page-level decorative companion instances are removed; the application shell owns the persistent companion entry point.

## Exercises

Auto settings are resolved with the existing exercise generator before starting. A seed is held for the page visit and passed to Start, so the visible hand, bar count, key, meter and tempo match the generated study. This changes neither the generator nor its rules. A new visit gets a new study; Progress can still reopen an exact historical exercise. Custom choices, reset, all twelve levels, level advice and double-click start remain available.

The resolved values form a compact starting-settings block. The curriculum lists hand and length beside each lesson, and the selected state retains a strong outline and filled level number.

## Library and history definitions

`library-selectors.mjs` defines the collection and filtered results. A saved score and a starter with the same id appear once, with the saved score taking precedence. Different arrangements sharing a title remain separate. The header distinguishes saved scores from starter pieces, and the filter row says how many results are shown out of the complete collection.

In the reviewed fixture, 10 saved scores plus 4 built-in starter pieces explain the previous 10/14 count difference. Progress counts practice records, which may also include removed scores and the single aggregated generated-exercise record. Those are not the same quantity as available Library scores. No stored counts or journal records are rewritten to make the totals agree.

A saved passage alone does not count as practice for the Practised filter. Recorded time, sessions or visited-bar ranges provide evidence of activity. Library Continue now preserves the saved bar even at the end of a score; restarting and reviewing the ending remain separate explicit actions.

## Progress

Practice history and its Continue/drill actions precede activity charts. The page labels recorded time, visited bars and saved position separately from graded accuracy. Recorded coverage includes listening, so it is not presented as mastery. A generated-exercise entry is combined exercise history, not a removed piece or a single study's coverage. Removed records retain their original history. An absent historical completion flag is no longer labelled “stopped early”; only an explicit false flag supplies that evidence.

The empty state leads to Library, and generated-exercise history leads to Exercises. A zero streak is omitted. Graded runs, recent results, calendar, level data and saved-position actions remain available.

## Verification

- Four new selector checks were run failing first, then passing: unique collection identities, bookmark-only entries, combined normalized search/filter counts without mutation, and available/removed/aggregated history distinctions.
- The selector, progress-summary and exercise suites pass together: 17 checks. Log: `.qa-runs/studio-2026-10-14/supporting-tests.log`.
- Normal-size supporting-page captures at 1280×800, 1440×900 and 1728×1117 are in `.qa-runs/studio-2026-10-14/supporting-ui/`. Layout review covered readable selected settings, visible Start at 1280×800, full illustration loading and the compact Continue card.
- Matched final before/after captures at 1440×900 and 1280×800 are in `.qa-runs/studio-2026-10-14/before/` and `after/`, named `exercises-*`, `library-*` and `progress-*`. The before build comes from the preserved baseline source at port 5178. Both runs use Twinkle as the initial open score through an in-memory settings response, wait for settings/library loading, then verify the current page again after transitions and image decoding.
- Final interaction sweep passed with no page errors. It checked a Level 7 Auto preview against the generated score's visible F-major/3/4/72 BPM/eight-bar metadata, Chinese search results, Escape search clearing, menu Escape and focus restoration, the calendar switch, and no page overflow at a 720×450 CSS viewport (the effective layout size of a 1440×900 window at 200% browser zoom). `supporting-ui/results.json` records the actual values. A CSS `zoom: 2` diagnostic is retained separately; it is not represented as native browser zoom validation.
- An in-memory settings response supplied a synthetic history of one available score, one removed score and aggregated exercises. The history checks passed, including four visited bars independent of a saved final position, and Continue opening that final bar rather than restarting. Evidence: `supporting-ui/history-results.json`, `progress-history-1440.png`, and `library-final-bar-1440.png`. No fixture file was changed by this check.
- The initial interaction attempt was interrupted by a development hot reload; its diagnostic is retained in `supporting-ui/failure.txt`. Initial baseline capture attempts also encountered a cold navigation timeout and a settings-restoration race. The final matched capture run passed with explicit loading and post-transition page checks.
- The React best-practices checklist was applied to the three edited components: no new event listeners or effects, random seed uses lazy state, derived collection data remains pure, buttons and disclosures retain native keyboard behavior, and changed selections have accessible state.

Development preview is the isolated server at `http://127.0.0.1:5188`. Review scripts suppress API writes; no installed application or personal Library was changed. The root studio verification notes record final cross-page interaction, zoom, before/after and build results.
