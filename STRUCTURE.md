# Where things live

This folder is the whole site. Everything in it is relative and self-contained, so
uploading `deploy/` on its own is enough to host it (GitHub Pages included).

The app is split into markup, ordered CSS and classic JavaScript files. There is no
build step. Serve this folder with `python3 -m http.server` for local testing.

The pinned PDF library is `vendor/pdf-lib-1.17.1.min.js`, with its license alongside
it. No external CDN is required. The blank answer sheet source is
`ScantronTemplate.pdf`. Runtime generation reads its embedded data URI from
`js/31-template.js`, not the standalone PDF. Regenerate the embedded copy whenever
the source template changes:

```sh
python3 - <<'PYCODE'
from pathlib import Path
import base64, re
p = Path('js/31-template.js')
s = p.read_text()
data = base64.b64encode(Path('ScantronTemplate.pdf').read_bytes()).decode('ascii')
s = re.sub(r'data:application/pdf;base64,[A-Za-z0-9+/=]+',
           'data:application/pdf;base64,' + data, s)
p.write_text(s)
PYCODE
```

The PDF builder embeds the template once and reuses it on each page. Text remains
at the selected size. Every successful export opens a preview before downloading.
Width warnings appear inside that preview. Printed registration and scanner acceptance
must still be verified against physical output.

`.nojekyll` tells GitHub Pages to serve the files as they are rather than running them
through Jekyll.

## Editing

Open the file whose name matches what you are changing and edit it. No build step —
reload the page and the change is there.

## Load order matters

The JS is still **one classic script**, just delivered in pieces. All the files share
a single global scope and run top to bottom, so **the number prefix is the load
order**. Two rules follow from that:

- A function declared in a later file is not visible to code that *runs* at the top
  level of an earlier one. (This worked when everything was one `<script>`, because
  hoisting covered the whole file.) Declarations and `addEventListener` calls are
  fine anywhere; **eager calls are not.**
- New helpers that early files call at load time go in `js/01-utils.js`.

Only one line needed moving for this: `safeParseJson` came out of the enrollment/slots
section into `js/01-utils.js`, because `loadCompetition` and `loadListView` both call
it while the page is still loading.

The CSS files are plain cascade order — same order as the original stylesheet.

## House style: punctuation in prose UI

Em dashes and semicolons are forbidden in prose the site displays: body copy, help
text, tooltips, toasts, button labels, error messages, aria-labels, and text drawn into
the PDF. Rewrite the sentence rather than swapping in a lookalike character.

En dashes and ellipses are allowed. So is a dash used as a glyph rather than as
punctuation: an empty Team or Test cell prints an em dash meaning "no value", and
`js/22-filtering.js` compares against that exact string to spot an unset topic, so if
the glyph changes, change it there too.

Derived text counts. Watch the separators, because a `join("; ")` puts a semicolon on
screen just as surely as a typed one.

None of this applies to code syntax (JS statement semicolons, CSS declarations, HTML
entities, inline style strings), nor to the character-set regexes in
`js/07-print-fields.js` and `js/29-pdf-overlay.js`, which list dashes on purpose.

The full rule, with examples, is in `CLAUDE.md` at the top of the project.

## js/

| File | What is in it |
|---|---|
| `00-boot.js` | Runs in `<head>` before first paint: localStorage shim, saved preferences, theme |
| `01-utils.js` | ID digits, division-from-ID, `safeParseJson` |
| `02-config.js` | Template URL, storage keys, icons, the "how it works" overview |
| `03-competitions.js` | The five presets and the custom competition model |
| `04-competition-editor.js` | The Custom editor dialog |
| `05-topic-tests.js` | One topic category per division |
| `06-state.js` | `students[]` and the derived caches |
| `07-print-fields.js` | What a printed field may contain |
| `08-sorting.js` | Page order and sorting |
| `09-list-display.js` | Table vs Summary view, cache maintenance |
| `10-famat-id.js` | The FAMAT ID cell |
| `11-render.js` | Drawing the student list |
| `12-summaries-duplicates.js` | Counters and duplicate detection |
| `13-warnings.js` | Overflow warnings, sticky footer state |
| `14-problems.js` | The issues list and jumping to a problem |
| `15-undo-redo.js` | Undo stack |
| `16-toast.js` | Toast |
| `17-mutations.js` | Row mutations and batch operations |
| `18-selection.js` | Selection mechanics |
| `19-fill-teams.js` | Fill Teams |
| `20-storage-slots.js` | Enrollment parsing, draft slots, the current workspace |
| `21-test-names.js` | Test names, `readEnrollment` |
| `22-filtering.js` | Row filter and the advanced filter |
| `23-team-popover.js` | Team picker |
| `24-division-change.js` | Changing a student's division |
| `25-shortcuts.js` | Keyboard shortcuts |
| `26-event-delegation.js` | The one click/keydown handler on `#studentsRoot` |
| `27-row-drag.js` | Dragging a row into place, and most other listeners |
| `28-top-level-buttons.js` | Buttons outside delegation |
| `29-pdf-overlay.js` | Building the PDF with pdf-lib, over `ScantronTemplate.pdf` |
| `30-init-and-preferences.js` | Init, the Settings UI, setup-bar menus, search |
| `31-template.js` | Embedded answer-sheet template |
| `32-interactions.js` | Modal accessibility, fixed-digit ghosts, reset, backup restore and PDF preview |

## css/

`01-tokens` `02-base` `03-surfaces` `04-controls` `05-fields` `06-badges-chips`
`07-segmented` `08-app-header` `09-setup-bar` `10-menu-tabs` `11-save-slots`
`12-answer-columns` `13-student-list` `14-sort-headings` `15-row-drag`
`16-row-actions` `17-alerts` `18-toast` `19-popovers-modals` `20-filtering`
`21-settings` `22-custom-editor` `23-topic-tests` `24-permission-slips` `25-help`
`26-optional-columns` `27-narrow` `28-refinements`

`28-refinements.css` follows the original responsive rules and must stay last.

## The old file

`earlier-versions/index-v10.html` is untouched, as the reference. It is not part of
the site and should not be uploaded. `deploy/index.html` is the one that runs now.

## Publishing

Publish only the contents of this directory. Keep `.nojekyll`, `help.html`, the
ordered JS/CSS files and `vendor/` in the published root. Do not upload `audit/`,
backups or earlier versions. All runtime links are relative, including the help page.

For a branch-based Pages source, place these contents at that branch's publishing
root. Alternatively, configure a Pages workflow to upload this directory as the
site artifact. The workspace currently has no Git metadata, so branch names,
remote configuration and deployment permissions must be established in the actual
repository before publication.

Open the eventual Pages URL and verify all local assets, a normal PDF and a topic
PDF from that URL. Run the browser regression suite in `../audit/regression.cjs`
with the workspace served at port 8765. The harness uses Playwright and system
Chrome. See `../audit/IMPLEMENTATION.md` for results and remaining release checks.
