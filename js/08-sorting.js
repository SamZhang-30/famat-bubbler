    /* ============================================================
       Page order, and the sorting that sets it

       masterOrder is the whole of it. Everything below either reads it — the
       table, the PDF, shift-click ranges — or rewrites it. Reading goes through
       getPageOrder, which repairs the array as it goes rather than
       trusting it: a rowId that no longer exists is dropped, and a student who
       somehow never made it in is appended. That way no code path can leave a
       student off the list by forgetting to file them.
       ============================================================ */

    /** masterOrder, minus the dead rowIds and plus anyone missing from it. */
    function getPageOrder(){
      const seen = new Set();
      const out = [];
      for (const rid of masterOrder){
        if (rowIndex.has(rid) && !seen.has(rid)){
          out.push(rid);
          seen.add(rid);
        }
      }
      for (const s of students){
        if (!seen.has(s.rowId)) out.push(s.rowId);
      }
      return out;
    }

    /** Write that repair back, so the stored order and the drawn one agree. */
    function normalizeMasterOrder(){
      masterOrder = getPageOrder();
      return masterOrder;
    }

    function getSelectionShiftOrder(){
      return getPageOrder();
    }

    /** The order the list is put in before anyone sorts it: division, then surname. */
    function defaultOrderComparator(a, b){
      const sa = getStudent(a), sb = getStudent(b);
      const d = divisionRank(sa?.division) - divisionRank(sb?.division);
      return d || cmpAlpha(sa, sb);
    }

    /* ---- how each sortable column ranks a student ------------------------------ */

    const SORTABLE_COLUMNS = ["division", "first", "last", "topic"];
    const SORT_COLUMN_LABEL = { division: "division", first: "first name", last: "last name", topic: "topic test" };

    /**
     * Divisions rank in the order their panels are listed — Algebra I, Geometry,
     * Algebra II, Precalculus, Calculus, Statistics, whatever this competition calls
     * them — with the catch-all last.
     */
    function divisionRank(div){
      const order = activeDivisions();
      const at = order.indexOf(Number(div));
      return (at >= 0) ? at : order.length;
    }

    /**
     * Where a student sits inside their division once the list is sorted by it:
     * team 1, then 2, then 3, then anyone added who has no team of their own —
     * blank at a regular meet, 0 at a convention, which come to the same standing —
     * and last the students who are not in the PDF at all.
     *
     * Not added ranks below no team because the two say different things. A blank
     * team is a seat still to fill on a sheet that is going to print; a student who
     * is not added has no sheet, so they belong past the end of the seating rather
     * than mixed into it.
     */
    function teamSortRank(student){
      if (!student?.included) return 5;
      const t = Number(student.team);
      return (t === 1 || t === 2 || t === 3) ? t : 4;
    }

    /**
     * Topic tests rank the way the Topic tests card lists them: Theta, then Alpha,
     * then Mu, then Open, and inside a family in the order the slots were filled,
     * with that family's TBD after its named tests. A student sitting no topic test
     * has nothing to rank and goes to the end.
     */
    function topicRank(key){
      const parsed = parseTopicKey(key);
      if (!parsed) return Number.MAX_SAFE_INTEGER;
      const pos = topicGroups().indexOf(parsed.group);
      if (pos < 0) return Number.MAX_SAFE_INTEGER - 1;
      // index 0 is the category's TBD, which sits under its named tests, not above them
      return pos * 1000 + (parsed.index === 0 ? 999 : parsed.index);
    }

    /**
     * The arrow turns over the column being sorted and nothing else. That matters on
     * division, where teams stay 1, 2, 3 whichever way the divisions run: the toggle
     * is asking about divisions, not about seating inside them.
     */
    function sortComparator(col, dir){
      const flip = (dir === "up") ? -1 : 1;
      if (col === "first"){
        return (a, b) => flip * lc(getStudent(a)?.first).localeCompare(lc(getStudent(b)?.first));
      }
      if (col === "last"){
        return (a, b) => flip * lc(getStudent(a)?.last).localeCompare(lc(getStudent(b)?.last));
      }
      if (col === "topic"){
        return (a, b) => flip * (topicRank(getStudent(a)?.topicTestKey) - topicRank(getStudent(b)?.topicTestKey));
      }
      if (col === "division"){
        return (a, b) => {
          const sa = getStudent(a), sb = getStudent(b);
          const d = divisionRank(sa?.division) - divisionRank(sb?.division);
          if (d) return flip * d;
          return teamSortRank(sa) - teamSortRank(sb);
        };
      }
      return () => 0;
    }

    /**
     * Sort the list, and with it the PDF.
     *
     * A heading always opens downwards, and pressing the same one again turns it
     * over; moving to another heading starts that one downwards in turn. Every one
     * of these columns is categorical enough to leave ties, and the sort is stable,
     * so ties come out in the order they were already in. That is what lets two
     * presses build one order: sort by last name, then by division, and the
     * divisions come out with their students still alphabetical inside.
     */
    function sortByColumn(col){
      if (SORTABLE_COLUMNS.indexOf(col) < 0) return;
      const before = listOrderState();

      const dir = (sortState.col === col && sortState.dir === "down") ? "up" : "down";
      sortState = { col, dir };
      masterOrder = getPageOrder().sort(sortComparator(col, dir));

      renderAllRows();
      syncSortHeaders();
      syncAllCountersAndSummaries();
      syncSticky();

      pushUndo({
        type: "single",
        label: `Sort by ${SORT_COLUMN_LABEL[col] || col}`,
        diff: { type: "listOrder", prev: before, next: listOrderState() }
      });
      syncUndoUI();
    }

    /** The page order and the arrow above it, as one undoable value. */
    function listOrderState(){
      return {
        order: normalizeMasterOrder().slice(),
        col: String(sortState.col || ""),
        dir: String(sortState.dir || ""),
      };
    }

    /**
     * Put new arrivals where the lit arrow says they belong.
     *
     * A lit arrow is a promise that the table is in that order, so anything that
     * adds students has to honor it rather than leaving them stranded at the
     * bottom. With no sort in force this does nothing, and new students simply
     * print last.
     */
    function resortIfSorted(){
      if (!sortState.col || !sortState.dir) return;
      masterOrder = getPageOrder().sort(sortComparator(sortState.col, sortState.dir));
    }

    /**
     * Move a block of rows so that it lands beside one other row.
     *
     * With a filter or a search on, the row you drop onto is only the nearest
     * *visible* neighbor: rows hidden between it and the next visible one are not
     * part of the question being asked, so they stay where they are and the block
     * lands directly against the row that was actually pointed at.
     */
    function moveRowsInPageOrder(movingIds, targetRowId, after){
      const moving = movingIds.filter(rid => rowIndex.has(rid));
      if (!moving.length) return false;
      const movingSet = new Set(moving);
      if (movingSet.has(targetRowId)) return false;

      const rest = getPageOrder().filter(rid => !movingSet.has(rid));
      let at = rest.indexOf(targetRowId);
      if (at < 0) return false;
      at += after ? 1 : 0;

      // the block keeps its own internal order, whichever way it is dragged
      const ordered = getPageOrder().filter(rid => movingSet.has(rid));
      rest.splice(at, 0, ...ordered);
      masterOrder = rest;
      return true;
    }

    /** Put a hand-placed order in force, and take the arrow off whichever heading held it. */
    function commitHandOrder(before, label){
      sortState = { col: "", dir: "" };
      renderAllRows();
      syncSortHeaders();
      syncAllCountersAndSummaries();
      syncSticky();
      pushUndo({ type: "single", label, diff: { type: "listOrder", prev: before, next: listOrderState() } });
      syncUndoUI();
    }

    /** Light the arrow that is in force, and fade the rest. */
    function syncSortHeaders(){
      for (const th of document.querySelectorAll("#studentsRoot th.sortTh")){
        const on = th.dataset.sort === sortState.col && !!sortState.dir;
        th.dataset.dir = on ? sortState.dir : "";
        th.setAttribute("aria-sort", on ? (sortState.dir === "up" ? "descending" : "ascending") : "none");
      }
    }

    function escAttr(s){
      return String(s ?? "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    }

    /** Base alpha per team, scaled by the row-tint-strength preference. */
    /**
     * How strongly an added row takes on its division color.
     *
     * The steps are far apart on purpose: the point of the tint is to make a team
     * readable down the length of a division at a glance.
     *
     * Equal steps in opacity are not equal steps to the eye. Lightness compresses at
     * the strong end and expands at the faint end, so a ladder with even gaps reads
     * as a wide jump between the top two rungs and almost nothing between the bottom
     * two. Both ladders therefore grow as they descend: the smallest gap is between
     * teams 1 and 2, the largest between team 3 and no team at all.
     *
     * The two themes get there differently. Dark keeps the division's own color and
     * varies opacity alone — the palette is pastel on a near-black panel, where a
     * little goes a long way. Light needs more opacity to register on white, and a
     * touch of extra depth in the ink to hold its edge against the panel, so its
     * color is taken down slightly first.
     *
     * Where teams are not entered there is no ladder to show, so every added row sits
     * at one fixed weight. It is not the same rung in both themes: team 2 carries it
     * on dark, team 3 on light, which is where the two land at a comparable presence
     * against their own panels.
     */
    const TEAM_TINT = {
      //                                    gaps: 0.07   0.07   0.07
      dark:  { 1: 0.30, 2: 0.23, 3: 0.16, none: 0.09, convention: 0.23 },
      //                                    gaps: 0.18   0.18   0.19
      light: { 1: 0.70, 2: 0.52, 3: 0.34, none: 0.15, convention: 0.34 },
    };

    /** Light-mode ink is taken down a little before the alpha applies. */
    const LIGHT_TINT_DARKEN = 0.90;

    function tintInkForTheme(rgb){
      if (document.documentElement.dataset.theme !== "light") return rgb;
      const down = (c) => Math.round(c * LIGHT_TINT_DARKEN);
      return { r: down(rgb.r), g: down(rgb.g), b: down(rgb.b) };
    }

    function tintAlphaForTeam(teamVal){
      const ladder = (document.documentElement.dataset.theme === "light")
        ? TEAM_TINT.light
        : TEAM_TINT.dark;
      const base = hasTeamSelection()
        ? (ladder[teamVal] ?? ladder.none)
        : ladder.convention;
      const scale = Number(getComputedStyle(document.documentElement).getPropertyValue("--tintScale")) || 1;
      return Math.min(0.9, base * scale);
    }

    function parseCssColorToRgb(cssColor){
      const c = String(cssColor || "").trim();
      if (c.startsWith("rgb(") || c.startsWith("rgba(")){
        const nums = c.replace(/^rgba?\(|\)$/g, "").split(",").map(x => x.trim());
        const r = parseFloat(nums[0]), g = parseFloat(nums[1]), b = parseFloat(nums[2]);
        if ([r,g,b].some(v => Number.isNaN(v))) return null;
        return { r, g, b };
      }
      if (c.startsWith("#")){
        const hex = c.slice(1);
        if (hex.length === 3){
          const r = parseInt(hex[0]+hex[0],16);
          const g = parseInt(hex[1]+hex[1],16);
          const b = parseInt(hex[2]+hex[2],16);
          return { r, g, b };
        }
        if (hex.length === 6){
          const r = parseInt(hex.slice(0,2),16);
          const g = parseInt(hex.slice(2,4),16);
          const b = parseInt(hex.slice(4,6),16);
          return { r, g, b };
        }
      }
      return null;
    }

    function applyRowColors(tr, student){
      if (!student.included){
        tr.style.backgroundColor = "var(--off)";
        tr.style.color = "var(--offText)";
        return;
      }
      const alpha = tintAlphaForTeam(student.team);
      const varOrFallback = divColorVar[divColorIndex(student.division)] || "rgba(255,255,255,0.06)";
      const resolved = varOrFallback.startsWith("var(")
        ? getComputedStyle(document.documentElement).getPropertyValue(varOrFallback.slice(4, -1)).trim()
        : varOrFallback;

      const raw = parseCssColorToRgb(resolved) || parseCssColorToRgb(varOrFallback);
      const rgb = raw ? tintInkForTheme(raw) : null;
      tr.style.color = "var(--text)";
      if (rgb){
        tr.style.backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
      } else {
        tr.style.backgroundColor = `rgba(255,255,255,${Math.min(alpha, 0.12)})`;
      }
    }

    function getStudent(rowId){
      const idx = rowIndex.get(rowId);
      return (idx == null) ? null : students[idx];
    }

