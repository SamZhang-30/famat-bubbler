    /**
     * How it works (high level)
     *
     * Single source of truth:
     *   students: Array<Student>
     *   Student = {
     *     rowId: number,
     *     first: string,
     *     last: string,
     *     id8: string,          // digits only, max 8 chars
     *     division: number,     // derived from id8; 0 means invalid/unassigned
     *     included: boolean,
     *     team: "X"|0|1|2|3     // X omits the 9th slot, 0/1/2/3 write that digit
     *   }
     *
     * Event delegation:
     *   One click handler + one input handler on #studentsRoot.
     *   Routing uses data-action, data-rowid, data-field.
     *   No per-row listeners.
     *
     * Undo stack:
     *   undoStack: Action[] (max 50)
     *   redoStack: Action[] (optional)
     *   Action is minimal diffs, not snapshots. Batch actions store an array of per-row diffs.
     *
     * Fill Teams summary:
     *   For each division, operate on included students only.
     *   Preserve current team assignments if they do not violate constraints.
     *   Resolve overflows by moving last alphabetically out to next available slot.
     *   Fill gaps sequentially (team 1 to 4 before team 2, etc) using alpha sort by last name then first.
     *   If no teams exist at all, assign purely by alpha order into team 1, then 2, then 3 (max 4 each).
     */

    // ====== CONFIG ======
    /* The blank answer sheet used to be fetched from codehs.com and is now shipped
       with the site. It lives in js/31-template.js as a base64 data: URI, which is
       why TEMPLATE_URL is not declared here -- see that file for why. */

    // localStorage
    const ENROLLMENT_SLOT_KEY = "famatbubbler.enrollmentSlots.v1";
    const UNDO_STATE_KEY = "famatbubbler.undoState.v1";
    // The workspace you are in right now, written back as you work. The four Draft
    // slots are checkpoints you choose; this is the one you never have to remember.
    const CURRENT_KEY = "famatbubbler.current.v1";
    const NAME_ORDER_KEY = "famatbubbler.nameOrder.v1"; // "firstlast" or "lastfirst"

    const SLOT_COUNT = 3;
    // Flat glyphs rather than emoji, so the Include control follows the theme.
    // Deliberately not an <input type="checkbox">: the selection column already has one,
    // and two checkboxes per row read as the same control twice.
    const ICON_ON  = '<svg class="incGlyph" viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="M2.8 7.4 5.6 10.2 11.2 4"/></svg>';
    const ICON_OFF = '<svg class="incGlyph" viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="M4 4l6 6M10 4l-6 6"/></svg>';
    const MAX_UNDO = 20;

    const divColorVar = {
      1: "var(--div1)",
      2: "var(--div2)",
      3: "var(--div3)",
      4: "var(--div4)",
      5: "var(--div5)",
      6: "var(--div6)",
      0: "var(--div0)",
    };

