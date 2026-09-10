    /* ============================================================
       Competition presets

       A roster is always written the same way, whatever event the sheets are
       for: the 8th digit of a FAMAT ID encodes Algebra I=1 … Statistics=6.
       What changes is where those students actually compete. At the MAΘ
       National Convention the six roster divisions roll up into three
       umbrellas, and the digit bubbled on the sheet changes with them.

       So a preset is a map from roster division to competition division. It
       decides which panel a student lands in, who they share a team with,
       which topic-test family they may take, and — via bubbledId8 — the digit
       that is actually drawn in the 8th ID column.
       ============================================================ */

    const COMPETITION_KEY = "famatbubbler.competition.v1";

    /** The 8th digit of a roster ID. Fixed; rosters never use anything else. */
    const ROSTER_DIVISIONS = {
      1: "Algebra I",
      2: "Geometry",
      3: "Algebra II",
      4: "Precalculus",
      5: "Calculus",
      6: "Statistics",
    };

    const FAMAT_SEASON = {
      topics: false,   // regular-season meets have no topic tests
      teams: true,     // and the school enters its own team per division
      teamSize: 4,     // ...of four, which is FAMAT's number and every preset's
      map:   { 1:1, 2:2, 3:3, 4:4, 5:5, 6:6 },
      names: { 1:"Algebra I", 2:"Geometry", 3:"Algebra II", 4:"Precalculus", 5:"Calculus", 6:"Statistics" },
      short: { 1:"Alg I", 2:"Geo", 3:"Alg II", 4:"Precalc", 5:"Calc", 6:"Stats" },
      // which topic-test family each competition division may sit; Open is always allowed on top
      family: { 1:"theta", 2:"theta", 3:"theta", 4:"alpha", 5:"mu", 6:"open" },
      // the division whose color represents each family on the topic cards
    };

    const COMPETITION_PRESETS = {
      /* Two meets that map divisions identically and differ only in how many teams a
         school may enter. They were one preset called "Regional / Statewide" while
         that was the whole truth; the team cap is the part that was missing, and it
         is not something a coach can work around, so it earns its own entry rather
         than a note under a shared one. */
      regional: Object.assign({
        label: "Regional",
        shortLabel: "Regional",
        note: "Regular season. Every division competes, every Roster Level is bubbled as the roster has it, and a school may enter up to three teams per division.",
      }, FAMAT_SEASON),

      statewide: Object.assign({}, FAMAT_SEASON, {
        label: "Statewide",
        shortLabel: "Statewide",
        note: "The same divisions and the same digits as a regional meet. A school enters one team per division, so only Team 1 is on offer.",
        maxTeams: 1,
      }),

      // Digits are unchanged, but Geometry and Algebra II both sit under Theta,
      // and Algebra I has no division at all.
      state: {
        label: "FAMAT State Convention",
        shortLabel: "States",
        note: "Same Roster Levels as the regular season, but renamed to Theta/Alpha/Mu/Stats. Algebra I does not compete.",
        topics: true,
        teams: false,
        map:   { 1:0, 2:2, 3:3, 4:4, 5:5, 6:6 },
        names: { 2:"Theta", 3:"Theta", 4:"Alpha", 5:"Mu", 6:"Statistics" },
        short: { 2:"Theta", 3:"Theta", 4:"Alpha", 5:"Mu", 6:"Stats" },
        family: { 2:"theta", 3:"theta", 4:"alpha", 5:"mu", 6:"open" },
        },

      // Three divisions only. Geometry and Algebra II merge into one Theta,
      // Calculus and Statistics into one Mu, and the Roster Level moves.
      nationals: {
        label: "MA\u0398 National Convention",
        shortLabel: "Nationals",
        note: "Divisions are renamed to Theta/Alpha/Mu and their digits are also remapped. Algebra I does not compete.",
        topics: true,
        teams: false,
        map:   { 1:0, 2:3, 3:3, 4:2, 5:1, 6:1 },
        names: { 1:"Mu", 2:"Alpha", 3:"Theta" },
        short: { 1:"Mu", 2:"Alpha", 3:"Theta" },
        printNames: { 1:"Mu", 2:"Alpha", 3:"Theta" },
        family: { 1:"mu", 2:"alpha", 3:"theta" },
      },
    };

    const COMPETITION_ORDER = ["regional", "statewide", "state", "nationals", "custom"];

    /** @type {{preset:string, custom:{map:Object, names:Object}}} */
    let competitionState = { preset: "regional", custom: null };
    // hoisted function declarations, so this is safe to resolve here
    competitionState = loadCompetition();

    /* ============================================================
       The custom competition

       Everything else in this dialog is a choice between four ready-made answers;
       this is the one you build. Three ideas hold it together:

         A division is an entry in `divisions`. Its key is an internal id nobody ever
         sees, so a division survives being renamed and renumbered — which is what
         lets it exist before it has a name, and lets its bubbled digit change without
         taking its students with it. Six ids, because six roster divisions can feed
         at most six distinct groups.

         `digit` is what the sheet gets, 0 through 9, and no two divisions may share
         one. It is deliberately not the identity: the old model made them the same
         thing, which capped the sheet at digits 1-6 and made "rename this division"
         and "renumber it" the same operation.

         `map` says where each roster division lands, or 0 for not competing. Several
         may land on one division; that is how a merge like Theta is expressed. A
         division with nothing mapped to it is still a division — it is just empty.
       ============================================================ */

    /* How many people sit on one team. Four everywhere FAMAT runs, which is why it
       lived as the digit 4 in the arithmetic rather than as a setting; a competition
       you invent gets to say otherwise, and 0 is the stored spelling of "no cap".
       Declared up here with the state that reads them rather than beside the
       accessors below, so nothing can reach them before they exist. */
    const DEFAULT_TEAM_SIZE = 4;
    const MAX_TEAM_SIZE = 99;

    /* Six ids, because six roster divisions can feed at most six distinct groups.
       The id is internal and never shown; `digit` is what the sheet gets. */
    const CUSTOM_DIV_IDS = [1,2,3,4,5,6];
    const CUSTOM_MAX_DIVISIONS = CUSTOM_DIV_IDS.length;
    const CUSTOM_DIGITS = [0,1,2,3,4,5,6,7,8,9];

    /**
     * A custom competition starts as a copy of the regular season — the same six
     * divisions, the same digits, the same names. Starting from something real is
     * what makes it editable: every field already holds a working answer, so the job
     * is changing one, not inventing six.
     *
     * It is saved on its own branch: switching to a preset and back finds it exactly
     * as it was left, and only the two buttons in the editor put it back.
     */
    function defaultCustomCompetition(){
      const divisions = {};
      for (const id of CUSTOM_DIV_IDS) divisions[id] = { name: FAMAT_SEASON.names[id], digit: id };
      return { divisions, order: CUSTOM_DIV_IDS.slice(), map: Object.assign({}, FAMAT_SEASON.map),
               maxTeams: 3, teamSize: DEFAULT_TEAM_SIZE };
    }

    /** No divisions at all, nothing competing: the other way to start. */
    function emptyCustomCompetition(){
      return { divisions: {}, order: [], map: { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 },
               maxTeams: 3, teamSize: DEFAULT_TEAM_SIZE };
    }

    /**
     * The custom competition as stored, with anything missing filled in and anything
     * impossible dropped. Also reads the older shape, where a division was its digit
     * and `names` was the registry.
     */
    function customState(){
      const c = competitionState.custom;
      if (!c || typeof c !== "object") return defaultCustomCompetition();

      const divisions = {};
      if (c.divisions && typeof c.divisions === "object"){
        for (const id of CUSTOM_DIV_IDS){
          const d = c.divisions[id];
          if (!d) continue;
          const digit = Number(d.digit);
          divisions[id] = {
            name: String(d.name ?? ""),
            digit: (digit >= 0 && digit <= 9) ? digit : id,
          };
        }
      } else if (c.names && typeof c.names === "object"){
        // the older shape: keys were both the id and the bubbled digit
        for (const id of CUSTOM_DIV_IDS){
          if (c.names[id] === undefined) continue;
          divisions[id] = { name: String(c.names[id] ?? ""), digit: id };
        }
      }

      const map = {};
      for (let d = 1; d <= 6; d++){
        const to = Number(c.map?.[d]) || 0;
        map[d] = divisions[to] ? to : 0;   // never point at a division that is gone
      }

      /* The order the divisions are listed in, which is also the order they sort in
         and the order their panels appear in. It is the editor's own arrangement —
         dragged by hand — rather than anything derived, because a custom competition
         has no natural sequence to fall back on: the ids are internal and the digits
         are whatever the sheet happens to want. Anything the stored order does not
         mention is appended in id order, so a division can never go missing from it. */
      const seen = new Set();
      const order = [];
      for (const id of (Array.isArray(c.order) ? c.order : [])){
        const n = Number(id);
        if (divisions[n] && !seen.has(n)){ seen.add(n); order.push(n); }
      }
      for (const id of CUSTOM_DIV_IDS) if (divisions[id] && !seen.has(id)) order.push(id);

      const cap = Number(c.maxTeams);
      /* People to a team, where 0 is the stored spelling of "no cap". A workspace
         saved before this parameter existed has no `teamSize` at all and reads back
         as four, which is what it was built under. */
      const size = Number(c.teamSize);
      return {
        divisions, order, map,
        maxTeams: (cap >= 0 && cap <= 9) ? cap : 3,
        teamSize: (Number.isFinite(size) && size >= 0 && size <= MAX_TEAM_SIZE)
          ? Math.floor(size) : DEFAULT_TEAM_SIZE,
      };
    }

    /**
     * The divisions this custom competition has, in id order.
     * @returns {{id:number, name:string, digit:number, from:number[]}[]}
     */
    function customDivisions(){
      const c = customState();
      return c.order.map(id => ({
        id,
        name: c.divisions[id].name,
        digit: c.divisions[id].digit,
        from: [1,2,3,4,5,6].filter(r => Number(c.map[r]) === id),
      }));
    }


    /**
     * What is wrong with a custom competition, in the reader's terms.
     *
     * Each of these would print sheets that cannot be told apart or cannot be read,
     * which is a fault in the setup rather than in any one student — so they block
     * the PDF outright and say so where the setup is being built. Counts of affected
     * students come along, because "two divisions" and "two divisions holding 24
     * added students" are different-sized problems.
     */
    function customProblems(state){
      const c = state || customState();
      const live = CUSTOM_DIV_IDS.filter(id => c.divisions[id]);
      const fed = new Set();
      for (let d = 1; d <= 6; d++){ const t = Number(c.map[d]) || 0; if (t) fed.add(t); }

      // how many added students would sit in a given division
      const countIn = (ids) => {
        const set = new Set(ids);
        return students.reduce((a, s) => {
          if (!s.included) return a;
          const rd = Number(String(s.id8 || "").slice(7));
          return a + (set.has(Number(c.map[rd]) || 0) ? 1 : 0);
        }, 0);
      };

      const problems = [];
      if (!fed.size){
        problems.push({ text: "No roster level competes, so there would be nothing to print." });
      }

      // two divisions on one digit: the sheets come back indistinguishable
      const byDigit = new Map();
      for (const id of live){
        const dg = c.divisions[id].digit;
        if (!byDigit.has(dg)) byDigit.set(dg, []);
        byDigit.get(dg).push(id);
      }
      for (const [dg, ids] of byDigit){
        const usedIds = ids.filter(id => fed.has(id));
        if (usedIds.length < 2) continue;
        const names = usedIds.map(id => c.divisions[id].name || "an unnamed division");
        const n = countIn(usedIds);
        problems.push({
          text: `${names.join(" and ")} both bubble ${dg}, so their sheets could not be told apart`
              + (n ? `, and ${n} added ${n === 1 ? "student is" : "students are"} in them.` : "."),
        });
      }

      // Distinct custom divisions need distinguishable labels, even with test overrides.
      const byName = new Map();
      for (const id of live){
        if (!fed.has(id)) continue;
        const nm = String(c.divisions[id].name || "").trim().toLowerCase();
        if (!nm) continue;
        if (!byName.has(nm)) byName.set(nm, []);
        byName.get(nm).push(id);
      }
      for (const [, ids] of byName){
        if (ids.length < 2) continue;
        const digits = ids.map(id => c.divisions[id].digit);
        const n = countIn(ids);
        problems.push({
          text: `Two divisions are both called "${c.divisions[ids[0]].name}" but bubble ${digits.join(" and ")}. `
              + `Give each competition division a distinct name.`
              + (n ? ` ${n} added ${n === 1 ? "student is" : "students are"} in these divisions.` : ""),
        });
      }

      // Require a usable division label independently of the printed Test override.
      for (const id of live){
        if (!fed.has(id)) continue;
        if (String(c.divisions[id].name || "").trim()) continue;
        const n = countIn([id]);
        problems.push({
          text: `A division bubbling ${c.divisions[id].digit} has no name. Name it in the Custom division editor.`
              + (n ? ` ${n} added ${n === 1 ? "student is" : "students are"} in this division.` : ""),
        });
      }
      return problems;
    }

    /**
     * A custom preset only states where each roster division goes and what the
     * resulting divisions are called; family and color assignments follow from
     * the regular-season ones traveling along with their roster division.
     */
    function buildCustomPreset(){
      const c = customState();

      // group ids, exactly as stored: a roster division lands on a division, and the
      // division decides separately what digit it bubbles
      const map = {};
      for (let d = 1; d <= 6; d++) map[d] = Number(c.map[d]) || 0;

      const family = {};
      // the lowest roster division landing in a group decides that group's family
      for (let d = 6; d >= 1; d--) if (map[d]) family[map[d]] = FAMAT_SEASON.family[d];

      const names = {}, short = {}, colorOf = {}, bubble = {};
      for (const id of c.order){
        const div = c.divisions[id];
        if (!div) continue;
        names[id] = div.name || ("Division " + id);
        short[id] = names[id];
        bubble[id] = div.digit;
        /* The color belongs to the division and to nothing else.
           It was a running slot once — first division took the first color — so
           deleting or renaming any division renumbered every one after it. Then it
           was keyed to the id but withheld until the division had a name, which
           meant typing a name snapped the color to whatever the regional palette
           happened to put at that id. Both were the color deciding itself.
           Now it is simply the id, which is fixed for the division's whole life:
           the custom palette starts every one of them gray, and the only things that
           ever move one are the swatch and the reset buttons. */
        colorOf[id] = id;
      }

      const cap = Number(c.maxTeams);
      return {
        label: "Custom", note: "Your own mapping.",
        topics: true,
        // zero teams is a convention: nobody enters one and every sheet bubbles 0
        teams: cap > 0,
        maxTeams: cap,
        teamSize: c.teamSize,
        map, names, short, family, colorOf, bubble,
        // the hand-made order; activeDivisions() falls back to roster order without it
        order: c.order.slice(),
      };
    }

    /**
     * Divisions that share a name share a panel, a team pool and a Test field —
     * Geometry and Algebra II are both Theta at State even though they keep
     * digits 2 and 3. The lowest digit carrying the name is the group's id.
     */
    function groupForBubbleDigit(t){
      t = Number(t) || 0;
      if (!t) return 0;
      const p = competitionPreset();
      // Custom mappings already contain stable division IDs. Names are labels.
      if (competitionState.preset === "custom") return p.names[t] !== undefined ? t : 0;
      const name = p.names[t];
      let group = t;
      for (const other of Object.values(p.map)){
        if (!other || p.names[other] !== name) continue;
        if (other < group) group = other;
      }
      return group;
    }
    function groupForRosterDigit(d){
      return groupForBubbleDigit(competitionPreset().map[d] || 0);
    }

    /**
     * Which --divN a division paints itself with. The umbrellas keep their
     * subject's color wherever they land: Theta is always Algebra II's blue,
     * Alpha always Precalculus's pink, Mu always Calculus's yellow.
     */
    const DIVISION_COLOR_BY_NAME = {
      "Algebra I": 1, "Geometry": 2, "Algebra II": 3,
      "Precalculus": 4, "Calculus": 5, "Statistics": 6,
      "Theta": 3, "Alpha": 4, "Mu": 5, "Open": 6,
    };
    /** Topic families take the same colors; Open stays neutral, as it always has. */

    function divColorIndex(d){
      d = Number(d) || 0;
      if (!d) return 0;
      const p = competitionPreset();
      /* A custom competition names its divisions whatever it likes and may bubble any
         digit from zero to nine, so neither the name nor the digit can pick a color.
         Each of its divisions carries its own, keyed to the division itself, and one
         with no name yet carries 0 — the neutral gray. */
      if (p.colorOf) return p.colorOf[d] ?? 0;
      return DIVISION_COLOR_BY_NAME[p.names[d]] || d;
    }

    function competitionPreset(){
      if (competitionState.preset === "custom"){
        return buildCustomPreset();
      }
      return COMPETITION_PRESETS[competitionState.preset] || COMPETITION_PRESETS.regional;
    }
    function competitionLabel(){
      return competitionState.preset === "custom" ? "Custom" : competitionPreset().label;
    }
    /* The same label for a competition held inside a saved snapshot, which is not the
       one in force. A draft slot has to name the competition it was saved under, and
       reading it must not disturb the live state. */
    function competitionLabelForState(cs){
      const preset = String(cs?.preset || "regional");
      if (preset === "custom") return "Custom";
      return (COMPETITION_PRESETS[preset] || COMPETITION_PRESETS.regional).label;
    }

    /* ---- the competition's name, said inside a sentence ---------------------------
       competitionLabel() answers "Custom", which is a heading rather than a name: it
       is what the tile in the picker says and what the chip in the setup bar shows.
       Dropped into prose it produced "does not compete at the Custom" and "pick one of
       Custom's own tests" — a proper noun that is not one.

       The four presets are proper names and take "the"; the one you build yourself is
       not named at all, so it is described instead. Both forms below are safe to drop
       straight into a sentence, which is the whole point of having them. */
    function competitionPhrase(){
      return competitionState.preset === "custom"
        ? "your custom competition"
        : `the ${competitionPreset().label}`;
    }
    /** The same phrase in the possessive: "… of the Regional's own tests". */
    function competitionPossessive(){
      return competitionState.preset === "custom"
        ? "your custom competition's"
        : `the ${competitionPreset().label}'s`;
    }
    /**
     * The same competition, named for the chip in the setup bar.
     *
     * That chip has to sit on one line beside five menus, so it takes the name a
     * coach would say out loud — Regional, Statewide, States, Nationals — while the
     * dialog keeps the official one. Falls back to the full label, so a preset that
     * never gets a short name still reads correctly rather than blank.
     */
    function competitionShortLabel(){
      if (competitionState.preset === "custom") return "Custom";
      const p = competitionPreset();
      return p.shortLabel || p.label;
    }

    /**
     * How many teams a school may enter per division here.
     *
     * Three at a regional meet, one statewide. A convention has schools enter no
     * teams at all — that is `teams: false` and hasTeamSelection() answers it — so
     * this only ever speaks for the meets where teams exist.
     */
    function maxTeams(){
      const p = competitionPreset();
      if (p.teams === false) return 0;          // a convention enters none
      const n = Number(p.maxTeams);
      return (n >= 0 && n <= 9) ? n : 3;
    }
    /** The team numbers on offer, low to high: [1,2,3] or just [1]. */
    function teamNumbers(){
      const out = [];
      for (let t = 1; t <= maxTeams(); t++) out.push(t);
      return out;
    }
    /* ---- how many people sit on one team -----------------------------------------
       Four, at every FAMAT meet there is, which is why this was written as the digit
       4 in nine places and was not a parameter at all. A custom competition is not a
       FAMAT meet, though, and the one thing a coach inventing one cannot work around
       is a team size baked into the arithmetic — so it is a number now, and the four
       is the default rather than the rule.

       Zero is the stored spelling of "no cap", because a stored Infinity does not
       survive JSON. teamSize() hands back Infinity for it, so every comparison below
       — `count > size`, `count < size`, `idx / size` — keeps working as written
       instead of growing an "unlimited" branch of its own. */
    /** People to a team here; Infinity where the competition sets no cap. */
    function teamSize(){
      const p = competitionPreset();
      const n = Number(p.teamSize);
      if (!Number.isFinite(n) || n < 0) return DEFAULT_TEAM_SIZE;
      return (n === 0) ? Infinity : Math.floor(n);
    }
    function teamSizeUnlimited(){ return !Number.isFinite(teamSize()); }
    /** Seats available in one division: the team size, as many teams as are on offer. */
    function teamSeats(){ return teamSize() * maxTeams(); }
    /** Competition divisions actually in use, low to high. */
    /**
     * Groups in the fixed subject order Algebra I -> Geometry -> Algebra II ->
     * Precalculus -> Calculus -> Statistics, keyed on the lowest roster division
     * feeding each one. Digit order would put Nationals in Mu, Alpha, Theta;
     * this keeps it Theta, Alpha, Mu, matching State and the regular season.
     */
    function activeDivisions(){
      const p = competitionPreset();
      const firstFeeder = new Map();
      for (let d = 1; d <= 6; d++){
        const g = groupForBubbleDigit(p.map[d] || 0);
        if (!g) continue;
        if (!firstFeeder.has(g)) firstFeeder.set(g, d);
      }
      /* A preset's divisions come out in roster order — Algebra I first, whatever
         digits they end up bubbling. A custom competition has no roster order to
         appeal to, because its divisions are invented, so it comes out in the order
         they are arranged in the editor. That order is what the Division column
         sorts by and what the Summary panels are stacked in. */
      if (Array.isArray(p.order) && p.order.length){
        const live = new Set(firstFeeder.keys());
        return p.order.filter(g => live.has(g));
      }
      return Array.from(firstFeeder.keys()).sort((a, b) => firstFeeder.get(a) - firstFeeder.get(b));
    }
    /** True when some roster division has no division at this competition. */
    /** Whether this competition runs topic tests at all. */
    function hasTopicTests(){ return !!competitionPreset().topics; }

    /**
     * Whether the school picks its own teams. At the State and National conventions
     * it does not: the top four individual scorers in a division are placed on the
     * school team automatically, so nobody enters a Team Number and every sheet is
     * bubbled 0 in the ninth column.
     */
    function hasTeamSelection(){ return competitionPreset().teams !== false; }

    function excludesAnyDivision(){
      const map = competitionPreset().map;
      for (let d = 1; d <= 6; d++) if (!map[d]) return true;
      return false;
    }
    function isActiveDivision(d){ return activeDivisions().indexOf(Number(d)) >= 0; }
    function divName(d){
      if (Number(d) === 0){
        return excludesAnyDivision() ? "Not Competing or Invalid ID" : "Unassigned or Invalid ID";
      }
      return competitionPreset().names[d] || ("Division " + d);
    }
    /**
     * What a division is called wherever it is named in the list — its pill, the
     * breakdown, a warning about a team. The abbreviations this used to return were
     * there to fit a narrow division column; the column is wide enough now, and
     * "Precalculus" reads better than "Precalc" in every one of those places. The
     * catch-all keeps N/A: it has no name to spell out.
     */
    /**
     * A division as a pill, wherever one is named outside the list.
     *
     * The row, the Summary heading and the filter facet were already wearing these;
     * the competition dialog was the one place a division was still plain text, in
     * the two columns that exist precisely to say which division is which. One
     * builder so they cannot drift.
     */
    function divPillHtml(group, text){
      const label = (text != null) ? text : divName(group);
      return `<span class="badge badgeStrong divPill" data-divpill="${divColorIndex(group)}">${escAttr(label)}</span>`;
    }

    function divShort(d){
      if (Number(d) === 0) return "N/A";
      return competitionPreset().names[d] || ("Division " + d);
    }

    /* ---- how wide the Division column has to be ---------------------------------
       It used to be one number, sized to "Precalculus" because that is the longest
       label any preset produces. Every other competition then paid for a word it does
       not use: the State convention's divisions are Theta, Alpha and Mu, and its
       Division column was carrying forty pixels of nothing.

       So it is measured instead, from the two things that actually have to fit:

         the widest pill  every division this competition runs, plus the catch-all,
                          because a student with a bad ID wears that one
         the heading      "Division" and its sort arrows, which is the floor — the
                          column may never be too narrow to say what it is

       The pill's own figure is its width plus the cell's left inset twice, not the
       left inset plus the right one. The pill is left-aligned, and it has to stay
       there: its left edge lines up with the heading above it and with every field in
       the columns beside it, which is the whole reason that inset is what it is. So
       the only free edge is the right one, and the width is chosen to land it the same
       distance from the column rule as the left edge is — the longest name sits
       centered in its cell without having moved. Every shorter pill then sits left in a
       column with room to spare, which is what left-aligned means.

       Measured, not calculated. The pill's padding, its border, the badge's font, the
       gap before the arrows and the cell's own inset all belong to the stylesheet, and
       a formula repeating them here would be wrong the first time any of them moved.

       The heading is measured where it stands: .sortLabel is inline-flex over nowrap
       text, so its box is its content whatever the column around it is doing. The
       pills cannot be, because .divPill is capped at the cell width and truncated —
       measuring one in place would return the width it was given rather than the width
       it wants. Those go through the off-screen bench, where that cap is lifted.
       ---------------------------------------------------------------------------- */

    /** Air around the heading, so the floor is "fits comfortably" rather than "fits". */
    const DIV_COL_HEAD_AIR = 8;
    /** A custom competition can name a division anything; past this the pill goes back
        to being truncated, which is what the ellipsis on .divPill is for. */
    const DIV_COL_MAX = 220;

    function syncDivColumnWidth(){
      const root  = document.getElementById("studentsRoot");
      const probe = document.getElementById("divWidthProbe");
      const th    = root?.querySelector("th.divCol");
      if (!root || !probe || !th) return;
      const rootStyle = getComputedStyle(root);
      const rowPad = parseFloat(rootStyle.getPropertyValue("--rowPadY")) || 4;
      const minW = 117 + (rowPad - 4);

      /* Border box, because that is what a <col> width is under table-layout: fixed.
         The column rule is the cell's own border-left and lives inside that width,
         while the right-hand rule belongs to the next column — so the left inset costs
         a pixel more than the right one, and the sums below have to say so or the pill
         lands a pixel off center. */
      const cs = getComputedStyle(th);
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;
      const rule = parseFloat(cs.borderLeftWidth) || 0;

      const label = th.querySelector(".sortLabel");
      const headW = label ? label.getBoundingClientRect().width : 0;

      const names = activeDivisions().concat(0).map(d => divShort(d));
      probe.innerHTML = names
        .map(n => `<span class="badge badgeStrong divPill">${escAttr(n)}</span>`)
        .join("");
      let widest = 0;
      for (const el of probe.children){
        widest = Math.max(widest, el.getBoundingClientRect().width);
      }
      probe.textContent = "";

      // A measurement of nothing is not a reason to collapse the column: if the bench
      // came back empty — no layout yet, a font still loading — leave what is there.
      if (!headW && !widest) return;

      // The heading keeps the cell's own two insets: it is type, like every other
      // heading in the table, and sits where they sit. The pill gets the left inset
      // twice, so its right edge lands where its left edge already is.
      const forHead  = rule + padL + headW  + DIV_COL_HEAD_AIR + padR;
      const forPills = rule + padL + widest + padL;

      const w = Math.min(DIV_COL_MAX, Math.max(minW, forHead, forPills));
      root.style.setProperty("--wDiv", Math.ceil(w) + "px");
    }
    /** Roster divisions that land in one group, in roster order. */
    function rosterDivisionsFor(group){
      const out = [];
      for (let d = 1; d <= 6; d++) if (groupForRosterDigit(d) === Number(group)) out.push(d);
      return out;
    }
    function isRemapping(){
      const map = competitionPreset().map;
      for (let d = 1; d <= 6; d++) if (map[d] !== d) return true;
      return false;
    }

    function loadCompetition(){
      const raw = safeParseJson(localStorage.getItem(COMPETITION_KEY), null);
      const preset = COMPETITION_ORDER.indexOf(raw?.preset) >= 0 ? raw.preset : "regional";
      const custom = (raw?.custom && typeof raw.custom === "object") ? raw.custom : null;
      return { preset, custom };
    }
    function saveCompetition(){
      try{ window.FBStore.set(COMPETITION_KEY, JSON.stringify(competitionState)); }catch(e){}
    }
    function cloneCompetition(){
      return JSON.parse(JSON.stringify(competitionState));
    }

    function openCompetitionModal(){
      /* Settings sends you here for the division colors, and used to leave itself
         standing open behind this one: two dialogs, one backdrop each, and Esc or a
         click away dismissing only the top one. The one that sent you steps aside. */
      window.FBSettings?.close?.();
      renderCompetitionBody();
      const back = document.getElementById("competitionModalBack");
      if (back) back.style.display = "flex";
    }
    function closeCompetitionModal(){
      lastCompetitionMigration = null;
      const back = document.getElementById("competitionModalBack");
      if (back) back.style.display = "none";
    }

    /**
     * The dialog body: the four presets, then the table that spells out what each
     * roster division becomes. The table is the point — it is the only place the
     * remapping is stated outright.
     */
    function renderCompetitionBody(){
      const host = document.getElementById("competitionBody");
      if (!host) return;

      const isCustom = competitionState.preset === "custom";
      const p = competitionPreset();

      const focusedPreset = host.contains(document.activeElement) ? document.activeElement.dataset.comp : null;
      const mappingOpen = !!host.querySelector("details[open]");
      const summaries = {
        regional: "All roster divisions. Up to three teams per division.",
        statewide: "Regional divisions. One team per division.",
        state: "Theta, Alpha, Mu and Stats. Algebra I does not compete.",
        nationals: "Theta, Alpha and Mu, with remapped digits. Algebra I does not compete.",
        custom: "Choose your divisions, roster mapping and team limits."
      };
      const opts = COMPETITION_ORDER.map((key) => {
        const preset = (key === "custom")
          ? { label: "Custom", note: "Set where each roster level competes and name the divisions." }
          : COMPETITION_PRESETS[key];
        const on = competitionState.preset === key;
        return `<button type="button" class="compOption" data-action="pickCompetition" data-comp="${key}" aria-pressed="${on ? "true" : "false"}">
            <span class="compOptName">${escAttr(preset.label)}</span>
            <span class="compOptNote">${escAttr(summaries[key])}</span>
            ${on ? '<svg class="compSelected" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="2.5" y="2.5" width="15" height="15" rx="3"/><path d="m6 10 2.5 2.5L14 7"/></svg>' : ""}
          </button>`;
      }).join("");

      /* Each row ends with the division it lands in. The color swatch used to be
         here too, once per roster row — so a division fed by two levels drew two
         identical swatches side by side, which look independent and are not. Colors
         are set once per division, in the dialog behind the button below. */
      const rows = [];
      for (let d = 1; d <= 6; d++){
        const target = p.map[d];
        const group = target ? groupForBubbleDigit(target) : 0;
        rows.push(`<tr>
            <td class="rosterCell">${escAttr(ROSTER_DIVISIONS[d])} (${d})</td>
            <td class="digitCell">${target ? String(bubbleDigitFor(target)) : "\u2014"}</td>
            <td class="nameCell">${target
              ? divPillHtml(group)
              : "<span class=\"rosterCell\">Does not compete</span>"}</td>
          </tr>`);
      }

      let report = "";
      if (lastCompetitionMigration && (lastCompetitionMigration.teams || lastCompetitionMigration.topics)){
        const bits = [];
        if (lastCompetitionMigration.teams) bits.push(`${lastCompetitionMigration.teams} team assignment${lastCompetitionMigration.teams === 1 ? "" : "s"}`);
        if (lastCompetitionMigration.topics) bits.push(`${lastCompetitionMigration.topics} topic test${lastCompetitionMigration.topics === 1 ? "" : "s"}`);
        report = `<div class="compReport">Cleared ${bits.join(" and ")} that no longer applied. Undo restores them.</div>`;
      }

      // What a switch would disturb, counted from the workspace as it stands.
      const teamed = students.reduce((a, x) => a + (normalizeTeamValue(x.team) !== "X" ? 1 : 0), 0);
      const topicked = students.reduce((a, x) => a + (x.topicTestKey ? 1 : 0), 0);
      let warn = "";
      if (students.length && (teamed || topicked)){
        const bits = [];
        if (teamed) bits.push(`${teamed} ${teamed === 1 ? "has a team" : "have teams"}`);
        if (topicked) bits.push(`${topicked} ${topicked === 1 ? "has a topic test" : "have topic tests"}`);
        warn = `<div class="compWarn">
            <svg class="glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 2.6 15 14H1z"/><path d="M8 6.6v3M8 11.6h.01"/></svg>
            <div>Switching may clear team assignments and topic tests that no longer apply.
            Of ${students.length} students loaded, ${bits.join(" and ")}. It is a single undo step.
            Open the note below for exactly what is and is not preserved.</div>
          </div>`;
      }


      const notes = [];
      notes.push("Roster levels grouped together share teams and a printed Test field.");
      // One sentence for both cases. It used to be a pair — one line for a preset that
      // remaps and another for one that does not — but saying the roster digit is kept
      // and converted covers the preset that converts nothing just as well.
      notes.push("Only the printed division digit changes. Stored roster levels stay the same.");
      notes.push(hasTeamSelection()
        ? "Column 9 uses the assigned team number, or stays blank for students without a team."
        : "Teams are chosen from individual scores after the meet. Column 9 is bubbled 0.");
      if (excludesAnyDivision()){
        notes.push("A division that does not compete is not deleted. Its students move to the \u201cNot competing\u201d panel, where they are flagged and kept out of the PDF.");
      }
      const remapNote = notes.join(" ");

      /* One way in for both jobs. Under Custom the dialog is the editor; under a
         preset it is the same list with only the swatches live. */
      const tableFoot = `<div class="compTableFoot">
          <button type="button" class="primary mini" data-action="openCustomEditor">${
            isCustom ? "Edit Divisions&hellip;" : "Division Colors&hellip;"}</button>
          <span class="compFootNote" id="compColorNote"></span>
        </div>`;

      host.innerHTML = `${warn}${report}<div class="compOptions">${opts}</div>
        ${tableFoot}
        <details class="compExplain"${mappingOpen ? " open" : ""}><summary>Division Mapping and Team Rules</summary>
        <div class="compExplainBody"><table class="compTable">
          <thead><tr><th>Roster Says</th><th class="center">Bubbles As</th><th>Grouped Under</th></tr></thead>
          <tbody>${rows.join("")}</tbody>
        </table>
        <div class="compHint">${escAttr(remapNote)}</div></div></details>`;

      syncRevertColorsButtons();
      if (focusedPreset) host.querySelector(`[data-comp="${focusedPreset}"]`)?.focus({preventScroll:true});
    }
