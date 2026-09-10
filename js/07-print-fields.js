    /* ============================================================
       What a printed field may contain

       Every sheet is drawn in a PDF standard font, so a name carrying an accent is
       at best a mangled glyph and at worst an exception halfway through a build.
       The fields that reach the page therefore take letters, digits, and the four
       marks real names and test titles are actually made of: space, apostrophe,
       hyphen, full stop, comma. No diacritics, no other script, no symbols — an
       "é" is not narrowed to "e", it is simply not a character these fields hold.

       Typing is where that is enforced: an invalid character never lands in a field
       you are editing, so there is nothing to find out about later. A pasted roster
       is the deliberate exception. Rewriting somebody's name on the way in would be
       a worse thing to do quietly than refusing to print it loudly, so the parser
       takes the roster as it comes — and those characters then sit on the row as a
       fatal error and hold the PDF until they are retyped.
       ============================================================ */

    /* Everything in this set is drawable by the PDF standard fonts, which is the
       only hard constraint here. The curly apostrophe and the en and em dashes are
       ordinary WinAnsi characters, so a phone that rewrites punctuation as you type
       is not producing anything the sheet cannot carry — there is nothing to fix and
       nothing to substitute. What stays out is what the font cannot draw at all, plus
       the accented letters, which it can draw but which are a different letter rather
       than a differently-shaped one. */
    /* Parentheses joined the set. A test name is the case that wanted them —
       "Sequences (no calculator)" is how a topic test is actually written down — and
       they became urgent because division names are typed by hand in the custom editor
       and flow straight into the assumed test name and into the prefix, so a division
       called "Theta (Open)" would have been refused a character at a time.
       Ordinary WinAnsi at 0x28 and 0x29, so the font draws them; the comma and the full
       stop were already in. */
    /** Global, for stripping. Its lastIndex makes it unsafe to `test` with. */
    const FIELD_CHARSET_BAD_G = /[^A-Za-z0-9 '\-.,()\u2018\u2019\u2013\u2014\u2026]/g;
    /** The same class, safe to `test` a single character or a whole string with. */
    const FIELD_CHARSET_BAD = /[^A-Za-z0-9 '\-.,()\u2018\u2019\u2013\u2014\u2026]/;
    const FIELD_CHARSET_NOTE = "These fields take letters, numbers, spaces, "
      + "apostrophes, hyphens, en and em dashes, full stops, commas, parentheses and "
      + "ellipses, and nothing else, "
      + "to keep names compatible with the FAMAT results website. Use non-diacritic letters.";

    /* ---- punctuation that is not the punctuation it looks like -------------------
       A phone rewrites what you type as you type it: the apostrophe key gives a curly
       U+2019, two hyphens give an em dash, three dots give an ellipsis. All four of
       those are drawable, so they are simply allowed and kept exactly as typed.

       What is left over is the near-misses — a prime or a backtick standing in for an
       apostrophe, a figure dash or a minus sign standing in for a hyphen, a
       non-breaking space standing in for a space. The font has no glyph for any of
       them, so the choice is between folding them to the plain mark they are imitating
       and refusing them outright. Folding wins: nobody typed U+2212 meaning anything
       other than a hyphen, and a non-breaking space silently deleted turns
       "Example High" into "ExampleHigh" with no hint of why.

       This is still a narrower act than the charset's refusal. Folding "\u2212" to "-"
       keeps the mark the typist meant; there is no equivalent move for "é", because
       "e" is a different letter and choosing it would be this program editing a name.
       Zero-width characters and the soft hyphen fold to nothing, which is already
       what they look like. */
    const TYPOGRAPHIC_FOLD = [
      // Primes, the low-9 quote, the standalone acute and the backtick: marks that get
      // pressed into service as apostrophes but are not one. The curly apostrophes
      // themselves are not here \u2014 they are in the set, and stay as typed.
      [/[\u201A\u201B\u2032\u2035\u02BC\u00B4`]/g, "'"],
      // The dashes WinAnsi has no glyph for: figure, non-breaking, en-quad-width,
      // horizontal bar, minus, and the wide forms. En and em are drawable, so they
      // are in the set and are left alone.
      [/[\u2010-\u2012\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-"],
      // non-breaking, thin, figure and ideographic spaces
      [/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " "],
      // invisible to a reader, so invisible here: soft hyphen, zero-widths, BOM
      [/[\u00AD\u200B\u200C\u200D\uFEFF]/g, ""],
    ];

    /** The same text with typographic punctuation written the plain way. */
    function foldTypographic(v){
      let out = String(v ?? "");
      for (const [re, to] of TYPOGRAPHIC_FOLD) out = out.replace(re, to);
      return out;
    }

    /* For comparison only, and one layer wider. The fields keep a curly apostrophe
       and an en dash exactly as typed, which means the same student can be spelled
       "O'Brien" on a roster and "O\u2019Brien" on a permission slip and be one person
       either way. Everything that decides identity or finds a row — the name index,
       duplicate detection, the search box, sorting — flattens those forms so the two
       spellings meet. Nothing stored or printed goes through this: it settles whether
       two strings mean the same name, never what a sheet says. */
    const COMPARE_FOLD = [
      [/[\u2018\u2019]/g, "'"],
      [/[\u2013\u2014]/g, "-"],
      [/\u2026/g, "..."],
    ];

    /** The form two strings are compared in, not the form either is kept in. */
    function foldForCompare(v){
      let out = foldTypographic(v);
      for (const [re, to] of COMPARE_FOLD) out = out.replace(re, to);
      return out;
    }

    /**
     * What a field keeps: punctuation folded to its plain form first, then anything
     * still outside the set taken out. Folding before stripping is the whole point —
     * strip first and a curly apostrophe is a deleted apostrophe.
     */
    function sanitizeFieldText(v){
      return foldTypographic(v).replace(FIELD_CHARSET_BAD_G, "");
    }
    /**
     * The distinct characters in `v` that no field may hold, in the order found.
     * Read after folding, so a stored curly apostrophe — from a roster or an older
     * draft — is not a fault to fix. It is printable, and it means what it looks like.
     */
    function illegalFieldChars(v){
      const out = [];
      for (const ch of foldTypographic(v)){
        if (FIELD_CHARSET_BAD.test(ch) && out.indexOf(ch) < 0) out.push(ch);
      }
      return out;
    }
    /** `"é", "ü"` — the offenders, quoted, for a sentence about them. */
    function quoteChars(list){
      return list.map(c => `"${c}"`).join(", ");
    }

    /* Teams run 1-9 now, because a custom competition may enter up to nine per
       division. 0 is not a team: it is the digit every sheet carries where the school
       enters none at all, and it is stored as itself so a convention's zero survives
       a round trip. Anything else is "X" — no team. */
    function normalizeTeamValue(v){
      const n = Number(v);
      if ((v === 0 || v === "0") ) return 0;
      if (Number.isInteger(n) && n >= 1 && n <= 9 && String(v).trim() !== "") return n;
      return "X";
    }
    function teamBucket(v){
      const n = Number(v);
      return (Number.isInteger(n) && n >= 1 && n <= 9) ? n : 0;
    }
    const TEAM_LOCK_NOTE = "Teams are not entered at this competition. The top individual "
      + "scorers in a division become the school team afterwards, so every sheet is bubbled 0 here.";
    const TEAM_UNADDED_NOTE = "Not added to the PDF, so there is no team to give. Add this student "
      + "first. Their team starts blank and is yours to set.";
    /* The Test cell's version of the same rule, and worded to match it: a topic test is
       something a printed sheet carries, so a student with no sheet has none to set.
       The cell used to stay live for them, which let a test be assigned to somebody who
       was not printing and then quietly do nothing — the one kind of setting that
       looks like it took and did not. */
    const TOPIC_UNADDED_NOTE = "Not added to the PDF, so there is no sheet to print a Test field on. "
      + "Add this student first. Their topic test is then yours to set.";
    // The same blank, for a competition where adding them settles it rather than
    // handing it over. Saying "yours to set" here would promise a picker that never opens.
    const TEAM_UNADDED_AT_CONVENTION_NOTE = "Not added to the PDF, so there is no Team Number yet. "
      + "Add this student and it settles at 0, which is what every sheet is bubbled at this competition.";

    /**
     * Whether this student's Team cell can be picked at all. Two things close it:
     * a competition that does not have schools enter teams, and a student who is
     * not in the PDF. The second is new, and is the same idea as the first — a
     * Team Number nobody will print is a number that can only be wrong later.
     */
    function teamIsEditable(student){
      return hasTeamSelection() && !!student?.included;
    }

    function teamLabel(v){
      const t = normalizeTeamValue(v);
      // "—" rather than "X", so a blank team is not mistaken for the row's Added state
      return t === "X" ? "—" : String(t);
    }
    function teamDigit(v){
      const t = normalizeTeamValue(v);
      return t === "X" ? "" : String(t);
    }
    /**
     * The ninth digit as it should be bubbled. A regular-season meet writes whatever
     * the coach entered, and blank for no team. A convention writes 0 for everyone,
     * because the school team there is decided by individual scores after the fact.
     * Derived rather than stored, so a student's entered team is still there when the
     * competition switches back.
     */
    function bubbledTeamDigit(student){
      if (!hasTeamSelection()) return "0";
      return teamDigit(student?.team);
    }
    /** The division a category stands for; 0 for Open. */
    function topicGroupDivision(g){
      const m = /^d(\d+)$/.exec(String(g || ""));
      return m ? Number(m[1]) : 0;
    }
    function topicGroupLabel(g){
      return (g === "open") ? "Open" : divName(topicGroupDivision(g));
    }
    function topicGroupColorIndex(g){
      return (g === "open") ? 0 : divColorIndex(topicGroupDivision(g));
    }

    /* Statistics does not run topic tests at the State convention. Hardcoded, because
       it is a rule of that competition rather than anything derivable from the
       divisions: everywhere else — Nationals, and every custom competition — a
       division gets a category because it exists. */
    function topicGroupHidden(div){
      return competitionState.preset === "state" && divName(div).trim() === "Statistics";
    }

    /**
     * The categories this competition runs, in the order its divisions are in, with
     * Open last. Divisions sharing a name share a category: at the State convention
     * two roster levels both land on "Theta", and two identical Theta cards would be
     * two places to type the same list of tests into.
     */
    function topicGroups(){
      if (!hasTopicTests()) return [];
      const out = [];
      const seen = new Set();
      for (const d of activeDivisions()){
        if (!d || topicGroupHidden(d)) continue;
        const nm = divName(d).trim().toLowerCase();
        if (!nm || (competitionState.preset !== "custom" && seen.has(nm))) continue;
        seen.add(nm);
        out.push("d" + d);
      }
      out.push("open");
      return out;
    }

    /** Which category a division's own tests are filed under, "" where it has none. */
    function ownTopicGroup(division){
      if (!division || topicGroupHidden(division)) return "";
      if (competitionState.preset === "custom") return topicGroups().includes("d" + division) ? "d" + division : "";
      const want = divName(division).trim().toLowerCase();
      return topicGroups().find(g => g !== "open" && topicGroupLabel(g).trim().toLowerCase() === want) || "";
    }

    /* ---- the convention ladder, as a warning rather than a rule -------------------
       Theta below Alpha below Mu is a FAMAT convention rule, and it is the kind of
       rule that changes: it is enforced by the people reading the sheets, not by this
       app, and a coach who has been told otherwise for their meet should not be
       stopped by a program. So nothing is forbidden — every test is selectable — and
       a student sitting below their own level is flagged amber and left alone.

       Only at the two conventions, because only they run the ladder. Statistics has no
       rung on it, and a custom competition's divisions are invented, so neither is
       ranked and neither is ever flagged. */
    function topicLadderRuns(){
      return competitionState.preset === "state" || competitionState.preset === "nationals";
    }
    /** A division's rung, or 0 for one that has none. */
    function topicLadderRank(division){
      if (!topicLadderRuns() || !division) return 0;
      return TOPIC_LADDER_RANK[divName(division).trim().toLowerCase()] || 0;
    }
    function topicGroupLadderRank(g){
      if (!topicLadderRuns() || g === "open") return 0;
      return TOPIC_LADDER_RANK[topicGroupLabel(g).trim().toLowerCase()] || 0;
    }
    /**
     * Why this pairing is worth a second look, or "" when it is not.
     * Reads as a caution on the row and blocks nothing.
     */
    function topicLadderWarning(division, key){
      if (!topicLadderRuns()) return "";
      const mine = topicLadderRank(division);
      if (!mine) return "";
      const theirs = topicGroupLadderRank(topicGroupOfKey(key));
      if (!theirs || theirs >= mine) return "";
      return `${divName(division)} is sitting a ${topicGroupLabel(topicGroupOfKey(key))} test. `
        + "At the conventions a division may usually move up into a harder test but not down into an "
        + "easier one. This does not stop the PDF, but check the latest FAMAT policies for this year "
        + "if you meant it.";
    }

    function topicIndexLabel(g, idx){
      return g ? `${g}-${idx}` : "";
    }
    function defaultTopicTestConfig(){
      const byGroup = {};
      const codeByGroup = {};
      const visibleCounts = {};
      const prefixByGroup = {};
      for (const g of topicGroups()){
        byGroup[g] = ["", "", ""];
        codeByGroup[g] = ["", "", ""];
        visibleCounts[g] = 3;
        // "" means "follow the division's name", which is what the ghost shows
        prefixByGroup[g] = "";
      }
      return { enabled: false, prefixEnabled: true, tbdEnabled: true, byGroup, codeByGroup, visibleCounts, prefixByGroup };
    }

    /**
     * What a category actually prefixes with: the override where one is typed, and the
     * division's own name otherwise.
     *
     * The name is the right default and it was being *copied* into the box, which made
     * it an override the moment it was written — rename the division and the prefix
     * went on saying the old thing. Empty means "follow the division", the ghost shows
     * what that currently is, and the PDF prints it.
     */
    function topicPrefixFor(g, cfgIn){
      const cfg = cfgIn || topicCfgForRender();
      const typed = String(cfg.prefixByGroup?.[g] ?? "").trim();
      return typed || topicGroupLabel(g);
    }
    /**
     * getTopicTestConfig rebuilds itself from a dozen document-wide queries, and the
     * student list asks for it once per row — three times per row, counting the label,
     * the tooltip and the option list. Rendering is synchronous, so one config can be
     * shared for a whole pass and dropped the moment it ends. Nothing outside a render
     * ever sees the cache: the PDF, the pickers and the settings all build their own.
     */
    let topicCfgFrame = null;
    let testNamesFrame = null;
    let topicCfgDepth = 0;
    function topicCfgForRender(){
      // Outside a pass there is nothing keeping the DOM still, so never hold on to a
      // config there — caching it would leave the next caller reading the last render.
      if (!topicCfgDepth) return getTopicTestConfig();
      return topicCfgFrame || (topicCfgFrame = getTopicTestConfig());
    }
    /** The six Test-name fields, on the same terms: cached only inside a render. */
    function renderTests(){
      if (!topicCfgDepth) return getDivisionLabels();
      return testNamesFrame || (testNamesFrame = getDivisionLabels());
    }
    function withRowFrame(fn){
      topicCfgDepth++;
      try { return fn(); }
      finally { if (--topicCfgDepth === 0){ topicCfgFrame = null; testNamesFrame = null; } }
    }

    function getTopicTestConfig(){
      const cfg = defaultTopicTestConfig();
      // a competition with no topic tests cannot have them on, whatever the box says
      cfg.enabled = hasTopicTests() && !!document.getElementById("topicTestsEnabled")?.checked;
      const prefixBox = document.getElementById("topicPrefixEnabled");
      cfg.prefixEnabled = prefixBox ? !!prefixBox.checked : true;
      const tbdBox = document.getElementById("topicTbdEnabled");
      cfg.tbdEnabled = tbdBox ? !!tbdBox.checked : true;
      for (const g of topicGroups()){
        const prefixInput = document.querySelector(`.topicPrefixInput[data-group="${g}"]`);
        if (prefixInput) cfg.prefixByGroup[g] = String(prefixInput.value ?? "").trim();
        const inputs = Array.from(document.querySelectorAll(`.topicInput[data-group="${g}"]`));
        const codeInputs = Array.from(document.querySelectorAll(`.topicCodeInput[data-group="${g}"]`));
        const entries = inputs.map(input => String(input?.value ?? "").trim());
        const codeEntries = codeInputs.map(input => String(input?.value ?? "").replace(/\D/g, "").slice(0, 3));
        while (entries.length > 3 && entries[entries.length - 1] === "") entries.pop();
        while (codeEntries.length > 3 && codeEntries[codeEntries.length - 1] === "") codeEntries.pop();
        cfg.byGroup[g] = entries.length ? entries : ["", "", ""];
        cfg.codeByGroup[g] = codeEntries.length ? codeEntries : ["", "", ""];
        cfg.visibleCounts[g] = Math.max(3, inputs.length || 0, cfg.byGroup[g].length);
      }
      return cfg;
    }

    /**
     * Read a stored config, whichever shape it is in.
     *
     * A workspace saved before categories were divisions carries byFamily/theta. The
     * four family names are matched to today's categories by label — a saved "Theta"
     * list lands on whichever division is called Theta here — and Open always has a
     * category to land on. Anything with no match is dropped rather than silently
     * filed under the wrong division.
     */
    function readTopicGroupMap(cfg, groupKey, familyKey){
      const out = {};
      const fromGroups = cfg?.[groupKey];
      if (fromGroups && typeof fromGroups === "object"){
        for (const g of topicGroups()) if (fromGroups[g] !== undefined) out[g] = fromGroups[g];
      }
      const fromFamilies = cfg?.[familyKey];
      if (fromFamilies && typeof fromFamilies === "object"){
        for (const fam of Object.keys(LEGACY_FAMILY_LABEL)){
          if (fromFamilies[fam] === undefined) continue;
          const want = LEGACY_FAMILY_LABEL[fam].toLowerCase();
          const g = (fam === "open")
            ? "open"
            : topicGroups().find(x => x !== "open" && topicGroupLabel(x).trim().toLowerCase() === want);
          if (g && out[g] === undefined) out[g] = fromFamilies[fam];
        }
      }
      return out;
    }

    function setTopicTestConfig(cfg){
      const merged = defaultTopicTestConfig();
      if (cfg && typeof cfg === "object"){
        merged.enabled = !!cfg.enabled && hasTopicTests();
        merged.prefixEnabled = (cfg.prefixEnabled === undefined) ? true : !!cfg.prefixEnabled;
        merged.tbdEnabled = (cfg.tbdEnabled === undefined) ? true : !!cfg.tbdEnabled;
        const names = readTopicGroupMap(cfg, "byGroup", "byFamily");
        const codes = readTopicGroupMap(cfg, "codeByGroup", "codeByFamily");
        const prefixes = readTopicGroupMap(cfg, "prefixByGroup", "prefixByFamily");
        const counts = readTopicGroupMap(cfg, "visibleCounts", "visibleCounts");
        for (const g of topicGroups()){
          if (prefixes[g] !== undefined){
            /* A prefix that only repeats the division's own name is not an override.
               The old build wrote the label into the box, so every saved workspace
               carries six of them; read back as overrides they would freeze the prefix
               at whatever the division used to be called. */
            const typed = String(prefixes[g] ?? "").trim();
            merged.prefixByGroup[g] = (typed && typed !== topicGroupLabel(g)) ? typed : "";
          }
          const arr = Array.isArray(names[g]) ? names[g].map(v => String(v ?? "")) : [];
          const carr = Array.isArray(codes[g]) ? codes[g].map(v => String(v ?? "").replace(/\D/g, "").slice(0, 3)) : [];
          merged.byGroup[g] = arr.length ? arr : ["", "", ""];
          merged.codeByGroup[g] = carr.length ? carr : ["", "", ""];
          const visible = Number(counts[g]);
          merged.visibleCounts[g] = Math.max(3, Number.isFinite(visible) ? visible : 0, merged.byGroup[g].length);
        }
      }
      const box = document.getElementById("topicTestsEnabled");
      if (box) box.checked = merged.enabled;
      const prefixBox = document.getElementById("topicPrefixEnabled");
      if (prefixBox) prefixBox.checked = merged.prefixEnabled;
      const tbdBox = document.getElementById("topicTbdEnabled");
      if (tbdBox) tbdBox.checked = merged.tbdEnabled;
      renderTopicTestGrid(merged);
      syncTopicTestsUI();
    }
    /* ---- one category's rows, as two arrays the same length -----------------------
       The config stores names and codes as parallel arrays and the number of rows to
       draw separately, and the three do not have to agree: getTopicTestConfig trims
       trailing blanks off the arrays, so a card showing six rows can be holding four
       names. Every edit below — delete a row, move a row — is an index operation over
       the rows as drawn, so it starts by making the three agree. */
    function topicRowArrays(cfg, g){
      const stored = Array.isArray(cfg.byGroup?.[g]) ? cfg.byGroup[g] : [];
      const storedCodes = Array.isArray(cfg.codeByGroup?.[g]) ? cfg.codeByGroup[g] : [];
      const count = Math.max(3, Number(cfg.visibleCounts?.[g]) || 0, stored.length);
      const names = [], codes = [];
      for (let i = 0; i < count; i++){
        names.push(String(stored[i] ?? ""));
        codes.push(String(storedCodes[i] ?? "").replace(/\D/g, "").slice(0, 3));
      }
      return { count, names, codes };
    }

    /**
     * Refresh the seated counts on the cards without redrawing them.
     *
     * The count changes every time anyone is given a test, and the menu it lives in
     * can be open at the time — with a caret in one of the name fields. Rebuilding the
     * grid would take that caret away mid-word, so only the badge is touched: created
     * where a test has just gained its first student, removed where it has lost its
     * last, and rewritten in between.
     */
    function syncTopicUsageCounts(){
      const host = document.getElementById("topicTestGrid");
      if (!host) return;
      const usage = topicTestUsage();
      const tbdOn = !!document.getElementById("topicTbdEnabled")?.checked;
      for (const row of host.querySelectorAll(".topicRow")){
        const g = String(row.dataset.group || "");
        const idx = Number(row.dataset.index);
        const n = usage.get(topicIndexLabel(g, idx)) || 0;
        let badge = row.querySelector(".topicUse");
        if (!badge){
          badge = document.createElement("span");
          badge.className = "topicUse";
          row.prepend(badge);
        }
        const named = String(row.querySelector(".topicInput")?.value || "").trim();
        badge.innerHTML = PERSON_GLYPH + `<span data-topic-count>${n}</span>`;
        badge.title = `${n} added ${n === 1 ? "student is" : "students are"} sitting `
          + `${named ? `"${named}"` : "this test"}. Deleting it returns them to `
          + (tbdOn ? "their own division's TBD." : "no topic test at all.");
      }
    }

    /** Test key -> how many added students are sitting it. Absent means nobody. */
    function topicTestUsage(){
      const out = new Map();
      for (const st of students){
        if (!st.included) continue;
        const key = String(st.topicTestKey || "");
        if (!key) continue;
        out.set(key, (out.get(key) || 0) + 1);
      }
      return out;
    }

    /**
     * Where a student lands when the test they were sitting is deleted.
     *
     * Their own division's TBD, which says "this one is still to be decided" — the
     * truthful answer, since the test they had has just stopped existing. Where TBD is
     * switched off there is no such thing to say, so they are left with no topic test
     * and a blank Test field, which says the same thing by printing nothing.
     */
    function topicFallbackKey(student, cfg){
      if (!cfg?.tbdEnabled) return "";
      const g = ownTopicGroup(student?.division || 0);
      return g ? topicIndexLabel(g, 0) : "";
    }

    /**
     * Write a topic-test config and move every student the change displaces, as one
     * undoable step.
     *
     * A student holds a test *key*, not a reference to a row — so deleting the second
     * test in a category renumbers the third into the second's key, and a delete that
     * only rewrote the config would silently reseat half a division onto their
     * neighbours' tests. The two halves therefore travel together, which is also what
     * makes the undo step honest: pressing Undo puts the test back and puts its
     * students back on it.
     *
     * @param {object} nextCfg    the config to write
     * @param {(key:string, student:object)=>string} remap
     *        a student's old test key -> the key they should hold now, "" to clear
     */
    function commitTopicConfig(nextCfg, remap, label){
      const prevCfg = getTopicTestConfig();
      const prevKeys = students.map(s => ({ rowId: s.rowId, topicTestKey: String(s.topicTestKey || "") }));

      setTopicTestConfig(nextCfg);
      for (const st of students){
        const was = String(st.topicTestKey || "");
        if (!was) continue;
        st.topicTestKey = String(remap(was, st) || "");
      }

      pushUndo({
        type: "single",
        label,
        diff: {
          // The same diff the reset writes: config and assignments, both directions.
          type: "topicSettingsReset",
          prevCfg,
          // read back rather than trusted, because setTopicTestConfig normalises it
          nextCfg: getTopicTestConfig(),
          prevKeys,
          nextKeys: students.map(s => ({ rowId: s.rowId, topicTestKey: String(s.topicTestKey || "") })),
        },
      });

      renderTopicTestGrid();
      renderAllRows();
      syncAllCountersAndSummaries();
      syncSticky();
    }

    /**
     * Delete one test from a category. Everything below it moves up a place, and
     * anyone sitting the deleted test falls back — see topicFallbackKey.
     */
    function deleteTopicTest(g, index){
      const cfg = getTopicTestConfig();
      const { count, names, codes } = topicRowArrays(cfg, g);
      if (!(index >= 1 && index <= count)) return;

      const clearOnly = count <= 3;
      if (clearOnly){
        names[index - 1] = "";
        codes[index - 1] = "";
      } else {
        names.splice(index - 1, 1);
        codes.splice(index - 1, 1);
      }
      cfg.byGroup[g] = names;
      cfg.codeByGroup[g] = codes;
      cfg.visibleCounts[g] = names.length;

      commitTopicConfig(cfg, (key, st) => {
        const parsed = parseTopicKey(key);
        // another category's key, or this one's TBD, which is not one of these rows
        if (!parsed || parsed.group !== g || parsed.index === 0) return key;
        if (parsed.index === index) return topicFallbackKey(st, cfg);
        return (!clearOnly && parsed.index > index) ? topicIndexLabel(g, parsed.index - 1) : key;
      }, "Delete a topic test");
    }

    /**
     * Move one test up or down its category. The order here is the order the picker
     * offers them in, which is the only reason it matters — so it is worth being able
     * to put the test everyone is sitting at the top of the list.
     */
    function moveTopicTest(g, index, delta){
      const cfg = getTopicTestConfig();
      const { count, names, codes } = topicRowArrays(cfg, g);
      const to = index + delta;
      if (!(index >= 1 && index <= count) || !(to >= 1 && to <= count)) return;

      [names[index - 1], names[to - 1]] = [names[to - 1], names[index - 1]];
      [codes[index - 1], codes[to - 1]] = [codes[to - 1], codes[index - 1]];
      cfg.byGroup[g] = names;
      cfg.codeByGroup[g] = codes;
      cfg.visibleCounts[g] = count;

      commitTopicConfig(cfg, (key) => {
        const parsed = parseTopicKey(key);
        if (!parsed || parsed.group !== g || parsed.index === 0) return key;
        if (parsed.index === index) return topicIndexLabel(g, to);
        if (parsed.index === to) return topicIndexLabel(g, index);
        return key;
      }, "Reorder topic tests");
    }

    function resetTopicTests({recordUndo=true}={}){
      const prevCfg = getTopicTestConfig();
      const prevKeys = students.map(s => ({ rowId: s.rowId, topicTestKey: String(s.topicTestKey || "") }));
      setTopicTestConfig(defaultTopicTestConfig());
      for (const s of students){
        s.topicTestKey = "";
      }
      if (recordUndo){
        pushUndo({
          type:"single",
          label:"Reset topic test settings",
          diff:{
            type:"topicSettingsReset",
            prevCfg,
            nextCfg: defaultTopicTestConfig(),
            prevKeys,
            nextKeys: students.map(s => ({ rowId: s.rowId, topicTestKey: "" })),
          }
        });
      }
      renderAllRows();
      syncAllCountersAndSummaries();
      syncSticky();
    }
    /** "d3-2" -> {group:"d3", index:2}, or null for anything that is not a test key. */
    function parseTopicKey(key){
      const m = String(key || "").match(/^(d\d+|open)-(\d+)$/);
      return m ? { group: m[1], index: Number(m[2]) } : null;
    }
    function topicGroupOfKey(key){ return parseTopicKey(key)?.group || ""; }
    function topicKeyIsTbd(key){ return parseTopicKey(key)?.index === 0; }

    /**
     * A key from an older workspace, in today's terms. "T-2" was the second Theta
     * test; it becomes the second test of whichever category is called Theta now, and
     * is dropped where none is.
     */
    function migrateTopicKey(key){
      const k = String(key || "");
      if (!k || parseTopicKey(k)) return k;
      const m = k.match(/^([TAMO])-(\d+)$/);
      if (!m) return "";
      const fam = LEGACY_FAMILY_LETTER[m[1]];
      if (!fam) return "";
      if (fam === "open") return `open-${m[2]}`;
      const want = LEGACY_FAMILY_LABEL[fam].toLowerCase();
      const g = topicGroups().find(x => x !== "open" && topicGroupLabel(x).trim().toLowerCase() === want);
      return g ? `${g}-${m[2]}` : "";
    }

    function getTopicTestNameByKey(key){
      const parsed = parseTopicKey(key);
      if (!parsed) return "";
      const cfg = topicCfgForRender();
      return String(cfg.byGroup?.[parsed.group]?.[parsed.index - 1] ?? "").trim();
    }
    function getTopicTestCodeByKey(key){
      const parsed = parseTopicKey(key);
      if (!parsed) return "";
      const cfg = getTopicTestConfig();
      return String(cfg.codeByGroup?.[parsed.group]?.[parsed.index - 1] ?? "").replace(/\D/g, "").slice(0, 3);
    }
    function getTopicOptionsForGroups(groups){
      const cfg = topicCfgForRender();
      if (!cfg.enabled) return [];
      const out = [];
      for (const g of groups){
        const arr = Array.isArray(cfg.byGroup?.[g]) ? cfg.byGroup[g] : [];
        for (let i = 0; i < arr.length; i++) {
          const name = String(arr[i] ?? "").trim();
          if (!name) continue;
          out.push({ group: g, key: topicIndexLabel(g, i + 1), name });
        }
        /* TBD: assignable before the test has a name; prints the prefix alone. One
           switch turns it on for every category, so it is on or off everywhere.
           Last in its category, not first. It is the fallback for a test nobody has
           named yet, and it was taking the slot the eye lands on first in every
           group — the least-reached-for option in the most prominent place, twice
           over. The cards in PDF Setup list it last for the same reason. */
        if (cfg.tbdEnabled) out.push({ group: g, key: topicIndexLabel(g, 0), name: "", tbd: true });
      }
      return out;
    }

    /**
     * Every test on offer to one student, in the order they should be met.
     *
     * All of them: nothing is out of bounds any more. What changes with the division
     * is the *order* — their own category first, then Open, then everyone else's — and
     * the picker shows the first two and folds the rest away. A division with no
     * category of its own (Statistics at the State convention, which does not run
     * topic tests) has nothing to lead with, so it gets the whole list at once.
     * @returns {{primary: object[], more: object[]}}
     */
    function topicOptionsForDivision(division){
      const groups = topicGroups();
      const own = ownTopicGroup(division);
      // No category of its own — Statistics at the State convention — so there is
      // nothing to lead with and nothing to fold behind it: the whole list is the
      // first thing you see.
      if (!own) return { primary: getTopicOptionsForGroups(groups), more: [] };
      const lead = [own, "open"];
      return {
        primary: getTopicOptionsForGroups(lead),
        more: getTopicOptionsForGroups(groups.filter(g => lead.indexOf(g) < 0)),
      };
    }
    function getAvailableTopicTestsForDivision(division){
      const { primary, more } = topicOptionsForDivision(division);
      return primary.concat(more);
    }
    /**
     * Whether this student's Test cell can be opened at all.
     *
     * Three ways it cannot: topic tests are off, this competition has no tests to
     * offer, or the student is not in the PDF. The third is the one that is new, and
     * it is the rule the Team cell has always followed — a student who is not
     * printing has no sheet, and a Test field is a line on a sheet. Assigning one
     * anyway used to be allowed and had no effect, which is worse than refusing.
     *
     * Asked in one place so the cell, the keyboard and the batch button can never
     * disagree about which rows are live.
     */
    function topicPickEnabled(student){
      if (!student || !student.included) return false;
      if (!topicCfgForRender().enabled) return false;
      return getAvailableTopicTestsForDivision(student.division).length > 0;
    }
    function getAllAvailableTopicTests(){
      return getTopicOptionsForGroups(topicGroups());
    }
    /**
     * What the Test cell says, as HTML.
     *
     * The cell previews the PDF's Test field, so it reads the same way the sheet
     * will: the family's own prefix, spelled out exactly as it is configured, then
     * the test's name. A student with no topic test is not blank — it shows the
     * division name that will print for them, grayed to mark it as the default
     * rather than a choice. TBD keeps its marker so it cannot be mistaken for that
     * default, since the two print the same thing.
     */
    function topicTestCellHtml(student, tests){
      const cfg = topicCfgForRender();
      if (!cfg.enabled) return '<span class="testDefault">\u2014</span>';
      /* Not added means no sheet, and the cell says the same thing the Team cell
         beside it says in that state: an em-dash in a dashed box, with the reason on
         hover. The key itself is cleared when they come out of the PDF — see
         clearTopicOnRemoval — so this is the whole truth rather than a cover over a
         value still sitting underneath. */
      if (!student.included) return '<span class="testDefault">\u2014</span>';

      /* No test assigned prints nothing.
         It used to preview the division's own Test name here, grayed, as "the default
         you fall back to" — but with topic tests running there is no such fallback:
         the sheet's Test field is the topic test, and a student without one leaves it
         blank. Showing the division name promised a line of print that was never going
         to appear, and it promised it on the majority of rows, since assigning tests is
         something you work through a division at a time.

         The em-dash is the honest preview, and it is not ambiguous: this column is
         hidden outright while topic tests are off, so an em-dash here always means
         "this sheet's Test field will be empty". */
      const key = String(student.topicTestKey || "");
      if (!key) return '<span class="testDefault">\u2014</span>';

      const group = topicGroupOfKey(key);
      const prefix = cfg.prefixEnabled ? topicPrefixFor(group, cfg) : "";
      const tag = prefix
        ? `<span class="testFam" data-divink="${topicGroupColorIndex(group)}">${escAttr(prefix)}</span> `
        : "";

      /* Wrapped, because prefix and name are one field on the sheet and have to cut
         in one place. See .topicPick .testLine. */
      if (topicKeyIsTbd(key)) return `<span class="testLine">${tag}<span class="testName isTbd">TBD</span></span>`;
      // a slot whose name has since been cleared prints the prefix alone, exactly as
      // TBD does — there is no division name left to fall back to
      const name = getTopicTestNameByKey(key);
      if (!name) return `<span class="testLine">${tag}<span class="testName isTbd">unnamed test</span></span>`;
      return `<span class="testLine">${tag}<span class="testName">${escAttr(name)}</span></span>`;
    }

    /**
     * How a test is named where it has to be told apart from its neighbors rather
     * than printed — the collapsed summary, mainly. Two families often carry the
     * same test name, so the family prefix is always shown here even when the PDF
     * prefix is switched off.
     */
    function topicSummaryLabel(key){
      const group = topicGroupOfKey(key);
      if (!group) return String(key || "");
      const prefix = topicPrefixFor(group);
      const name = topicKeyIsTbd(key) ? "TBD" : (getTopicTestNameByKey(key) || "unnamed test");
      return `${prefix} ${name}`.trim();
    }

    /** The exact string this student's Test field will carry, for the cell's tooltip. */
    function topicTestCellTitle(student, tests){
      if (!topicCfgForRender().enabled) return "Assign a topic test";
      // The same rule the Team cell follows: a student who is not printing has no
      // sheet, so there is no Test field on it to decide. Said before anything about
      // what would print, because it is the reason nothing will.
      if (!student.included) return TOPIC_UNADDED_NOTE;
      const printed = tests ? formatTestFieldForStudent(student, tests) : "";
      const head = String(student.topicTestKey || "")
        ? "Topic test. Click to change"
        : "No topic test. Click to assign one";
      return printed ? `${head}\nPrints as: ${printed}` : `${head}\nPrints a blank Test field`;
    }

    /** Full "Prefix Name" text for a student's topic test, for tooltips and the picker. */
    function topicTestFullLabel(key){
      const parsed = parseTopicKey(key);
      if (!parsed) return "";
      const cfg = topicCfgForRender();
      const prefix = cfg.prefixEnabled ? topicPrefixFor(parsed.group, cfg) : "";
      const name = parsed.index === 0 ? "" : getTopicTestNameByKey(key);
      const text = `${prefix} ${name}`.trim();
      if (text) return text;
      return parsed.index === 0 ? "TBD (no test name yet)" : "";
    }
    /**
     * @param cfgIn a topic config already read, for callers walking every student —
     *   getTopicTestConfig is a dozen document queries and does not want doing once
     *   per row. Omit it and this reads its own.
     */
    function formatTestFieldForStudent(student, tests, cfgIn){
      const idx = student.division - 1;
      const base = tests[idx] || "";
      const cfg = cfgIn || getTopicTestConfig();
      // topic tests off: the division's own Test name, as it always has been
      if (!cfg.enabled) return base;

      /* On, and no test assigned: blank.
         Falling back to the division name here was the old behavior and it was the
         wrong shape of answer. Topic tests *replace* the division Test field — that is
         what the switch does — so a student left without one has an undecided Test
         field, and a blank line is what "undecided" prints. The division name would
         print a decision nobody made, on a sheet that is going to be sat under a
         different test entirely. TBD is the way to ask for the prefix alone. */
      const parsed = parseTopicKey(student.topicTestKey);
      if (!parsed) return "";

      const isTbd = parsed.index === 0;
      const topicName = isTbd ? "" : getTopicTestNameByKey(student.topicTestKey);
      // Prefix is editable per category and can be switched off entirely; a TBD test
      // with no prefix prints a blank Test field on purpose. A named slot that has
      // since been emptied lands here too, and prints the prefix alone.
      const prefix = cfg.prefixEnabled ? topicPrefixFor(parsed.group, cfg) : "";
      return `${prefix} ${topicName}`.trim();
    }
    function setTopicTest(rowId, topicKey, {recordUndo=true, label="Set topic test"}={}){
      const s = getStudent(rowId);
      if (!s) return;
      const prev = String(s.topicTestKey || "");
      const next = String(topicKey || "");
      if (prev === next) return;
      s.topicTestKey = next;
      if (recordUndo){
        pushUndo({ type:"single", label, diff:{ type:"setTopicTest", rowId, prev, next } });
      }
      rerenderRow(rowId);
    }
    /**
     * A batch spanning several divisions cannot give every student the same test:
     * a Mu test means nothing on a Theta sheet. Rows that cannot sit it are left
     * alone rather than flagged after the fact — the picker already says how many
     * each option will reach.
     */
    function batchSetTopicTest(rowIds, topicKey){
      const next = String(topicKey || "");
      const diffs = [];
      for (const rid of rowIds){
        const s = getStudent(rid);
        // not added means no sheet, so there is nothing here to set
        if (!s || !s.included) continue;
        const prev = String(s.topicTestKey || "");
        if (prev === next) continue;
        s.topicTestKey = next;
        diffs.push({ type:"setTopicTest", rowId: rid, prev, next });
        rerenderRow(rid);
      }
      if (diffs.length){
        pushUndo({ type:"batch", label: next ? "Batch set topic" : "Batch clear topic", diffs });
      }
    }

    /** First and last are stored separately, so sorting never has to guess
        which whitespace-separated token is the surname. */
    function fullName(s){
      return `${String(s?.first ?? "").trim()} ${String(s?.last ?? "").trim()}`.trim();
    }
    function displayName(s){
      return fullName(s) || "(no name)";
    }
    /** Only used when reading data written before names were split. */
    function splitLegacyName(name){
      const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return { first:"", last:"" };
      if (parts.length === 1) return { first: parts[0], last: "" };
      return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
    }
    // Folded as well as lowered: a name is the same name whichever apostrophe or dash
    // it was typed with, so a permission-slip list pasted from a phone still matches a
    // roster pasted from a spreadsheet.
    function lc(v){ return foldForCompare(v).trim().toLowerCase(); }
    function cmpAlpha(a, b){
      const al = lc(a?.last), bl = lc(b?.last);
      if (al !== bl) return al.localeCompare(bl);
      return lc(a?.first).localeCompare(lc(b?.first));
    }
