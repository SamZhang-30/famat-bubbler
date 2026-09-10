    /* ============================================================
       Everything wrong with this workspace, by severity

       There used to be two things at the foot of the page and neither knew about the
       other: one red chip carrying the *first* blocker it found, and one amber badge
       carrying the *first* over-full team it found. Between them they could report two
       of any number of problems, in no stated order, and the red one changed its
       wording as you fixed things — so "1 duplicate ID" turning into "3 unprintable
       fields" read as a new fault appearing rather than as the next one surfacing.

       Both are replaced by a count per severity. An error stops the PDF; a warning is
       worth a look and stops nothing. Each is one pill, each pill says how many, and
       pressing it lists them with a way to reach each one. Nothing is hidden behind
       anything else, which is the part the old chips could not do at all.

       Every entry is {id, title, detail, goto} — goto being a token goToIssue()
       knows how to act on, so the list and the jump can never disagree about where a
       problem lives.
       ============================================================ */

    /** Everything stopping the PDF, worst-first. Empty means it can be built. */
    function pdfBlockers(){
      const out = [];

      const incomplete = students.filter(s => s.included && !completeId(s.id8));
      const invalidLevel = students.filter(s => s.included && completeId(s.id8) && !/^[1-6]$/.test(s.id8[7]));
      const excluded = students.filter(s => s.included && completeId(s.id8) && /^[1-6]$/.test(s.id8[7]) && !divisionFromId8(s.id8));
      if (incomplete.length) out.push({id:"ids",short:`${incomplete.length} incomplete ID${incomplete.length === 1 ? "" : "s"}`,detail:"Fill every missing digit. School ID has four digits, Student Number has three, and Roster Level has one. Missing digits are not automatically zero-filled.",goto:{kind:"rows",rowIds:incomplete.map(s=>s.rowId)}});
      if (invalidLevel.length) out.push({id:"levels",short:`${invalidLevel.length} invalid roster level${invalidLevel.length === 1 ? "" : "s"}`,detail:"The last digit must be a roster level from 1 to 6. Use Change level on the student row to assign it automatically.",goto:{kind:"level",rowIds:invalidLevel.map(s=>s.rowId)}});
      if (excluded.length) out.push({id:"excluded",short:`${excluded.length} student${excluded.length === 1 ? "" : "s"} cannot compete`,detail:"These roster levels do not compete in the selected competition. Remove these students from the PDF or choose a different competition.",goto:{kind:"rows",rowIds:excluded.map(s=>s.rowId)}});

      /* A custom competition that would misprint blocks the PDF outright, the same
         as a broken ID does. It is listed before the duplicate-ID pass because it
         is a fault in the setup rather than in one student, and fixing it may change
         which students are in conflict at all. */
      if (competitionState.preset === "custom"){
        const problems = customProblems();
        if (problems.length){
          out.push({
            id: "custom",
            short: `Custom setup: ${problems.length} to fix`,
            detail: problems.map(x => x.text).join(" ")
              + " Open Competition → Edit divisions to correct it.",
            custom: true,
            goto: { kind: "customEditor" },
          });
        }
      }

      /* A half-typed Test ID would bubble digits into the wrong columns, and nothing
         on the printed sheet would say so. Same class of fault as an incomplete FAMAT
         ID, and stopped the same way. */
      const badIds = testCodeProblems();
      if (badIds.length){
        const where = badIds.map(x => `${x.where} ("${x.value}")`);
        out.push({
          id: "codes",
          short: `${badIds.length} incomplete test code${badIds.length === 1 ? "" : "s"}`,
          detail: "A bubbled test code is three digits or nothing at all, and "
            + `${badIds.length === 1 ? "one box has" : `${badIds.length} boxes have`} part of one typed: `
            + `${where.join(" / ")}. Finish ${badIds.length === 1 ? "it" : "them"} or clear the box. `
            + "Division codes are under Competition, topic test codes under Topic Tests.",
          goto: { kind: "testCodes" },
        });
      }

      const dupInc = countIncludedDupIds();
      if (dupInc > 0){
        out.push({
          id: "dups",
          short: `${dupInc} duplicate ID${dupInc === 1 ? "" : "s"}`,
          detail: `${dupInc} Student Number${dupInc === 1 ? " is" : "s are"} used by more than one added student, so they would print the same bubbled ID. Correct the numbers, or un-add all but one of each.`,
          goto: { kind: "duplicates" },
        });
      }

      // Only a pasted roster or a draft saved elsewhere can get one of these in;
      // the fields themselves refuse them. Fatal rather than silently rewritten,
      // because the fix is somebody deciding how a name should be spelled here.
      const badFields = charsetProblems();
      if (badFields.length){
        const chars = [];
        for (const f of badFields) for (const c of f.chars) if (chars.indexOf(c) < 0) chars.push(c);
        // A one-off label already names the student or the field it sits on. A repeat
        // is a shared line — a division's Test name, on every sheet in the division —
        // which has no single owner, so that one is named by the text itself.
        const where = badFields.map(f => f.count > 1
          ? `"${f.text}" (on ${f.count} sheets)`
          : f.label);
        out.push({
          id: "charset",
          short: `${badFields.length} unprintable field${badFields.length === 1 ? "" : "s"}`,
          detail: `${quoteChars(chars)} cannot be printed on a sheet. ${FIELD_CHARSET_NOTE} `
            + `Found in: ${where.slice(0, 6).join(" / ")}${where.length > 6 ? ` and ${where.length - 6} more` : ""}. `
            + "Retype those. A pasted roster or an older draft is the only way they get in, "
            + "because the fields themselves refuse them.",
          goto: { kind: "rows" },
        });
      }

      return out;
    }

    /**
     * Everything worth a second look that stops nothing.
     *
     * Row-level cautions are counted by kind rather than listed one per student: on a
     * 200-student roster "43 students have an ID that does not match the School ID" is
     * one problem with one fix, and forty-three lines of it would bury the other two.
     */
    function pdfWarnings(){
      const out = [];

      const over = teamOverflows();
      if (over.length){
        const where = over.map(o => `${divShort(o.div)} Team ${o.team} has ${o.count} of ${o.cap}`);
        out.push({
          id: "teamOver",
          short: `${over.length} over-full team${over.length === 1 ? "" : "s"}`,
          detail: `${where.join(" / ")}. Nothing is stopped and the sheets still print, but the `
            + "Team Numbers are what the meet reads off them. Move somebody, or run Fill Teams to "
            + "reseat the division.",
          goto: { kind: "overTeams" },
        });
      }

      /* The rest come off the rows themselves, so the pill and the row's own amber
         mark are always describing the same set. Grouped by the code the row issue
         carries, which is exactly "what kind of problem is this". */
      const byCode = new Map();
      for (const s of students){
        for (const issue of rowIssues(s)){
          if (issue.severity !== "warn") continue;
          const key = String(issue.code || "?");
          if (!byCode.has(key)) byCode.set(key, { title: issue.title, fix: issue.fix, rowIds: [] });
          byCode.get(key).rowIds.push(s.rowId);
        }
        for (const field of ["first", "last"]){
          const issue = nameFieldIssue(s, field);
          if (!issue || issue.severity !== "warn") continue;
          if (!byCode.has("NM")) byCode.set("NM", { title: "A name holds a character a sheet cannot print", fix: issue.title, rowIds: [] });
          byCode.get("NM").rowIds.push(s.rowId);
        }
      }
      for (const [code, group] of byCode){
        // the same row can carry two of one kind (both names); count students, not hits
        const rowIds = Array.from(new Set(group.rowIds));
        const n = rowIds.length;
        out.push({
          id: `row:${code}`,
          short: n === 1 ? group.title : `${n} students: ${group.title.charAt(0).toLowerCase()}${group.title.slice(1)}`,
          detail: `${group.title}. ${group.fix}`,
          goto: { kind: "rows", rowIds },
        });
      }

      return out;
    }

    /**
     * Why the PDF cannot be built, as a chip-sized `short` and a full `detail`.
     * Returns null when nothing is blocking it.
     *
     * The first of pdfBlockers(), kept because the two callers that want *a* reason
     * rather than all of them — the disabled Create PDF button's tooltip, and the
     * alert the build itself writes — read better with one sentence than with five.
     */
    function pdfBlockReason(){
      const all = pdfBlockers();
      return all.length ? all[0] : null;
    }

    /* ============================================================
       Taking the reader to the problem

       Every entry in either severity list carries a `goto` token, and this is the one
       place that knows what to do with one. It is purely navigational: it reads the
       same predicates the lists are built from, opens whatever has to be open to make
       the fault visible, and changes nothing about who is added or what gets printed.

       Rows are the interesting case, because a problem is usually several of them. So
       a row jump cycles: each press shows the next one down the list and says which of
       how many you are looking at, which is also how you find out that fixing one has
       left two.
       ============================================================ */

    /** Where each issue's row cycle has got to, keyed by issue id. */
    const issueCursors = new Map();
    let locateTimer = 0;

    /** rowIds of every added student the blockers are complaining about, in list order. */
    function blockingRowIds(){
      const ids = [];
      const invalid = students.filter(s => s.included && (!completeId(s.id8) || s.division === 0));
      if (invalid.length) return invalid.map(s => s.rowId);
      for (const g of getDuplicateGroups({includedOnly:true})){
        for (const rid of g.rowIds) ids.push(rid);
      }
      return ids;
    }

    /** Every added student on an over-full team, so the amber pill can walk them. */
    function overTeamRowIds(){
      const ids = [];
      for (const o of teamOverflows()){
        for (const rid of byDivision.get(o.div)){
          const s = getStudent(rid);
          if (s && s.included && s.team === o.team) ids.push(rid);
        }
      }
      return ids;
    }

    /**
     * Put the list in a state where a given row can actually be seen: the table
     * rather than Summary, and nothing hidden behind a search or a filter.
     * @returns {boolean} whether anything had to be undone to get there — which is
     *   also whether the scroll should be instant, since a smooth scroll toward a row
     *   that has just moved lands somewhere else.
     */
    function revealListForJump(){
      if (listView !== "table") setListView("table");
      let unhid = false;
      const search = document.getElementById("stuSearch");
      if (search && search.value){
        search.value = "";
        search.dispatchEvent(new Event("input", { bubbles: true }));
        unhid = true;
      }
      if (activeFilterFacetNames().length){ clearRowFilters(); unhid = true; }
      return unhid;
    }

    /** Scroll one row into view and flash it. */
    function flashRow(rid, instant){
      const tr = rowEl.get(rid);
      if (!tr) return false;
      try{ tr.scrollIntoView({ block: "center", behavior: instant ? "auto" : "smooth" }); }
      catch(e){ tr.scrollIntoView(); }
      document.querySelectorAll('tr[data-locate="1"]').forEach(r => { r.dataset.locate = "0"; });
      tr.dataset.locate = "1";
      clearTimeout(locateTimer);
      locateTimer = setTimeout(() => { tr.dataset.locate = "0"; }, 1600);
      return true;
    }

    /**
     * Show the reader where one issue lives.
     * @param {string} id the issue's id, which is also its row cursor's key
     */
    function goToIssue(id){
      const issue = [...pdfBlockers(), ...pdfWarnings()].find(x => x.id === id);
      if (!issue) return;
      const goto = issue.goto || {};
      if (goto.kind === "level"){
        window.FBTips?.hide(true);
        revealListForJump();
        const rid = goto.rowIds[0];
        flashRow(rid, true);
        const button = rowEl.get(rid)?.querySelector('[data-action="openDivision"]');
        if (button){ button.focus({preventScroll:true}); openDivisionPopoverNear(button,{type:"row",rowId:rid}); }
        return;
      }


      // A fault in the competition setup is not in any one row, so "show me" opens the
      // place it can actually be fixed instead of hunting the list.
      if (goto.kind === "customEditor"){
        window.FBTips?.hide(true);
        openCompetitionModal();
        openCustomEditor();
        return;
      }
      if (goto.kind === "duplicates"){
        window.FBTips?.hide(true);
        openDupModal();
        return;
      }
      // Half-typed test codes live in two different menus, so it opens the one the
      // first bad box is actually in rather than guessing.
      if (goto.kind === "testCodes"){
        window.FBTips?.hide(true);
        const first = testCodeProblems()[0];
        if (first?.el){
          const menu = first.el.closest("details.topSection");
          if (menu){
            document.querySelectorAll(".setupBar > details").forEach((d) => { d.open = (d === menu); });
          } else {
            openCompetitionModal();
          }
          /* After the menu has been placed, not just after the next frame: opening one
             runs fitMenu, which moves the box this field is in, and a focus landing
             mid-move is a focus the browser takes straight back off again. */
          setTimeout(() => {
            first.el.scrollIntoView({ block: "center" });
            first.el.focus?.();
            first.el.select?.();
          }, 60);
        }
        return;
      }

      // ---- the row cycles ----
      const ids = Array.isArray(goto.rowIds) && goto.rowIds.length
        ? goto.rowIds
        : (goto.kind === "overTeams" ? overTeamRowIds() : blockingRowIds());
      if (!ids.length) return;

      const instant = revealListForJump();

      // order the hits the way the list is ordered, so repeat presses walk downward
      const order = new Map(masterOrder.map((rid, i) => [rid, i]));
      const sorted = ids.slice().sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));

      let cursor = issueCursors.get(id) || 0;
      if (cursor >= sorted.length) cursor = 0;
      const rid = sorted[cursor];
      issueCursors.set(id, (cursor + 1) % sorted.length);

      if (!flashRow(rid, instant)) return;

      const n = sorted.length;
      toast(n === 1
        ? `Showing the row: ${issue.short}`
        : `Showing ${cursor + 1} of ${n}: ${issue.short}`);
    }


    function syncSticky(){
      const included = students.reduce((a,s)=>a+(s.included?1:0),0);

      const stats = document.getElementById("stickyStats");
      if (stats) stats.textContent = `${included} added`;

      const errors = pdfBlockers();
      const btn = document.getElementById("btnCreateSticky");
      if (btn){
        btn.disabled = errors.length > 0 || pdfInProgress || included === 0;
        btn.textContent = "Create PDF";
        document.documentElement.dataset.generating = pdfInProgress ? "1" : "0";
        btn.title = errors.length ? errors[0].detail : "";
      }

      /* syncOverflowUI is what teams overflow into, and pdfWarnings reads its answer,
         so the counts are taken after it has run rather than before. */
      syncSelectionUI();
      syncUndoUI();
      syncDuplicateUI();
      syncOverflowUI();
      syncIssuePills(errors, pdfWarnings());
    }

    /* ---- the two counts at the foot of the page ----------------------------------
       A pill appears only when it has something to count. Zero errors is not a state
       worth a green badge: the page's own answer to "can I print this" is the Create
       PDF button being pressable, and a second control saying the same thing quietly
       is one more thing to read every time you look down there. */
    function syncIssuePills(errors, warnings){
      const paint = (btnId, countId, labelId, list, word) => {
        const el = document.getElementById(btnId);
        if (!el) return;
        const n = list.length;
        el.style.display = n ? "inline-flex" : "none";
        const count = document.getElementById(countId);
        if (count) count.textContent = String(n);
        const label = document.getElementById(labelId);
        // "1 Error" rather than "1 Errors"; the number lives in the pill beside it
        if (label) label.textContent = (n === 1) ? word : `${word}s`;
        el.setAttribute("aria-label", `${n} ${n === 1 ? word.toLowerCase() : word.toLowerCase() + "s"}. Press to list ${n === 1 ? "it" : "them"}`);
        el.title = list.map(x => x.short).join("\n");
        if (!n){
          issuePillList.delete(btnId);
          if (window.FBTips?.ownedBy(el)) window.FBTips.hide(true);
        } else if (window.FBTips?.ownedBy(el)){
          // the bubble is open on this pill right now, so it follows the change
          window.FBTips.show(el, issuePillHtml(list, word), word === "Error" ? "danger" : "caution", window.FBTips.isPinned());
        }
        issuePillList.set(btnId, { list, word });
      };
      paint("btnErrors", "btnErrorsCount", "btnErrorsLabel", errors, "Error");
      paint("btnWarnings", "btnWarningsCount", "btnWarningsLabel", warnings, "Warning");
    }

    /** What each pill is currently counting, so hover and click can read it back. */
    const issuePillList = new Map();

    /**
     * One pill's contents, as the shared bubble draws them: a line per problem, each
     * with the sentence explaining it and a button that goes there.
     *
     * Every problem gets its own line. The old chip showed one at a time and swapped
     * it as you worked, which meant you could never see that there were three — and
     * the two that were not showing were not hidden on purpose, they were simply
     * covered up by the one that was.
     */
    function issuePillHtml(list, word){
      const head = `${list.length} ${list.length === 1 ? word.toLowerCase() : word.toLowerCase() + "s"}`
        + (word === "Error" ? ". The PDF cannot be built until these are fixed" : ". Nothing is stopped");
      const items = list.map(x =>
        `<li data-sev="${word === "Error" ? "fatal" : "warn"}">`
        + `<strong>${escAttr(x.short)}</strong><br>${escAttr(x.detail)}`
        + `<button type="button" class="mini issueGo" data-action="goToIssue" data-issue="${escAttr(x.id)}" aria-label="Go to ${escAttr(x.short)}" title="Go to issue"><span aria-hidden="true">↗</span></button>`
        + `</li>`
      ).join("");
      return `<div class="rowErrHead" data-sev="${word === "Error" ? "fatal" : "warn"}">${escAttr(head)}</div>`
           + `<ul class="rowErrList issueList">${items}</ul>`;
    }

    function syncSelectionUI(){
      const n = selected.size;
      const show = (n > 0);

      const overlay = document.getElementById("stickySelectionOverlay");
      if (overlay) overlay.classList.toggle("show", show);

      const bar = document.getElementById("stickyBatchMenus");
      if (bar){
        bar.style.display = show ? "inline-flex" : "none";
        // it was display:none a moment ago, so its width is only knowable now
        if (show) requestAnimationFrame(() => window.FBSyncScrollFades?.());
      }

      const badge = document.getElementById("selectionBadge");
      if (badge){
        badge.style.display = show ? "inline-flex" : "none";
        badge.textContent = `${n} selected`;
      }

      /* The three pickers stay in place and go dim when there is nothing for them to
         do, rather than appearing and disappearing under the pointer. Each says why
         on hover, which a missing button cannot do. */
      const teamBtn = document.getElementById("btnBatchTeam");
      if (teamBtn){
        const canTeam = hasTeamSelection();
        teamBtn.disabled = !canTeam;
        teamBtn.title = canTeam
          ? `Seat the selected students on a team (${teamNumbers().join(", ")})`
          : TEAM_LOCK_NOTE;
      }

      const topicBtn = document.getElementById("btnBatchTopic");
      if (topicBtn){
        const topicsOn = getTopicTestConfig().enabled;
        const addedInSel = Array.from(selected).filter(rid => getStudent(rid)?.included).length;
        const canTopic = topicsOn && addedInSel > 0;
        topicBtn.disabled = !canTopic;
        topicBtn.title = !topicsOn
          ? "Topic tests are off. Turn them on under Topic Tests to assign one."
          : (addedInSel === 0
              ? "None of the selected students is added to the PDF, so none has a sheet to print a Test field on."
              : (addedInSel < selected.size
                  ? `Give the ${addedInSel} added of the ${selected.size} selected a topic test`
                  : "Give the selected students a topic test"));
      }
    }


    function syncUndoUI(){
      const btnUndo = document.getElementById("btnUndo");
      const btnRedo = document.getElementById("btnRedo");
      const last = undoStack.length ? undoStack[undoStack.length - 1] : null;
      const next = redoStack.length ? redoStack[redoStack.length - 1] : null;

      if (btnUndo){
        btnUndo.disabled = !last || pdfInProgress;
        btnUndo.title = last ? `Undo: ${last.label}` : "Nothing to undo";
      }
      if (btnRedo){
        btnRedo.disabled = !next || pdfInProgress;
        btnRedo.title = next ? `Redo: ${next.label}` : "Nothing to redo";
      }
    }

    function persistUndoState(){
      if(currentConflict || savedRevision()!==currentRevision) return;
      try{
        window.FBStore.set(UNDO_STATE_KEY, JSON.stringify({
          undoStack: undoStack.slice(-MAX_UNDO),
          redoStack: redoStack.slice(-MAX_UNDO),
        }));
      } catch {}
    }

    function loadUndoState(){
      try{
        const raw = localStorage.getItem(UNDO_STATE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        const undo = Array.isArray(parsed?.undoStack) ? parsed.undoStack.slice(-MAX_UNDO) : [];
        const redo = Array.isArray(parsed?.redoStack) ? parsed.redoStack.slice(-MAX_UNDO) : [];
        undoStack.length = 0;
        redoStack.length = 0;
        undoStack.push(...undo);
        redoStack.push(...redo);
      } catch {
        undoStack.length = 0;
        redoStack.length = 0;
      }
    }

