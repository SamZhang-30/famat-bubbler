    /* ============================================================
       Topic tests: one category per division

       These used to be four fixed families — Theta, Alpha, Mu, Open — with a ladder
       saying who could sit what, and a caption on every card explaining which
       divisions it served. That was three descriptions of the competition's own
       divisions sitting beside the competition's own divisions, and it could not
       describe a custom one at all: invent a division called "Discrete" and its tests
       had to be filed under somebody else's name.

       So a topic-test category is a division now, and the categories are whatever
       divisions the competition runs — named, colored and ordered by the same source
       the rest of the app reads, the custom editor included. Open is the one category
       that is not a division: it belongs to nobody and is offered to everyone.

       A category key is "d<group>" or "open"; a test key is that plus "-<index>",
       where index 0 is the category's TBD.
       ============================================================ */

    /* The three controls on a topic-test row. One stroke weight and one 16x16 box,
       like every other glyph in the app; the trash can is the row-action one at the
       end of a student row, so "delete this thing" looks the same in both places. */
    const ICON_TOPIC_UP   = '<svg class="glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 10 8 6l4 4"/></svg>';
    const ICON_TOPIC_DOWN = '<svg class="glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 6l4 4 4-4"/></svg>';
    const ICON_TOPIC_DEL  = '<svg class="glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.5 4.5h9"/><path d="M6.5 4.5V3h3v1.5"/><path d="M4.8 4.5 5.4 13h5.2l.6-8.5"/></svg>';
    /* The tick on the option the student is already sitting. Same stroke the Include
       column's check uses, so the two read as one mark. Drawn on every option and
       shown by CSS on the pressed one, so the row's width never changes as the pick
       moves down the list. */
    const ICON_TOPIC_TICK = '<svg class="optTick" viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="M2.8 7.4 5.6 10.2 11.2 4"/></svg>';
    /* The convention-ladder caution, in the same triangle the help tips use — see
       TIP_ICONS.caution. A 6px dot said "status light"; this says "look at this". */
    const ICON_TOPIC_WARN = '<svg class="optWarn" viewBox="0 0 14 14" aria-hidden="true" focusable="false">'
      + '<path d="M7 2.6 12.5 11.6H1.5z"/><path d="M7 6v2.4"/><path d="M7 10.1h.01"/></svg>';

    /** Old four-family keys, for reading a workspace saved before this. */
    const LEGACY_FAMILY_LABEL = { theta: "Theta", alpha: "Alpha", mu: "Mu", open: "Open" };
    const LEGACY_FAMILY_LETTER = { T: "theta", A: "alpha", M: "mu", O: "open" };

    /** The ladder, by name, for the convention-only warning. Nothing else uses it. */
    const TOPIC_LADDER_RANK = { theta: 1, alpha: 2, mu: 3 };

