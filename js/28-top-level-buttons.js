    // ====== Top level buttons (outside delegation) ======
    document.addEventListener("click", (ev) => {
      const t = ev.target;
      const btn = t && t.closest("[data-action]");
      if (!btn) return;

      const action = btn.dataset.action;
      if (action === "applySchoolId"){ applySchoolIdChange(); return; }

      if (action === "readEnrollment"){ readEnrollment(); return; }
      if (action === "clearStudents"){
        const n = students.length;
        clearStudents();
        if (n) toast(`Cleared ${n} student${n === 1 ? "" : "s"}`, "undo");
        return;
      }

      if (action === "setListView"){
        setListView(btn.dataset.listview);
        syncSticky();
        refreshFixTeamsButtons();
        return;
      }
      if (action === "clearSearch"){
        const q = document.getElementById("stuSearch");
        if (q){
          q.value = "";
          q.dispatchEvent(new Event("input", { bubbles: true }));
          q.focus();
        }
        return;
      }

      if (action === "nativeAddStudent"){
        const errEl = document.getElementById("nativeAddError");
        if (errEl) errEl.textContent = "";
        const firstIn = String(document.getElementById("nativeAddFirst")?.value || "").trim();
        const lastIn = String(document.getElementById("nativeAddLast")?.value || "").trim();
        const s3raw = String(document.getElementById("nativeStudent3")?.value || "").trim();
        const divSel = String(document.getElementById("nativeAddDivision")?.value || "1");
        // The setting owns the School ID once it has one; until then this form does, and
        // the student being added now is the one who sets it.
        const schoolBefore = String(document.getElementById("schoolId4")?.value || "");
        const setting = schoolIdSetting();
        const typedSchool = String(document.getElementById("addSchoolId4")?.value || "").replace(/\D/g, "");
        const school4 = setting || typedSchool;
        if (school4.length !== 4){
          if (errEl) errEl.textContent = setting
            ? "The School ID under PDF Setup → School is not four digits. Fix it there."
            : "Enter all four digits of the School ID.";
          return;
        }
        /* All three digits, not just one: a partial number used to be zero-padded, so
           typing 7 quietly added student 007 and the roster grew an ID nobody meant to
           give. A short number is a half-typed one, so it waits. */
        const s3digits = s3raw.replace(/\D/g, "");
        if (s3digits.length !== 3){
          if (errEl) errEl.textContent = "Enter all three digits of the Student Number.";
          return;
        }

        const id8 = composeStudentId8(school4, s3raw, divSel);
        if (id8.length !== 8){
          if (errEl) errEl.textContent = "Could not build an 8-digit ID. Check School ID (4 digits) and Student Number (3 digits).";
          return;
        }

        // Registering it here rather than at the keystroke: a School ID typed and then
        // thought better of should leave nothing behind, so it only becomes the setting
        // once a student is really going in under it — past every check above.
        const registered = !setting;
        if (registered){
          const sid = document.getElementById("schoolId4");
          if (sid){
            sid.value = school4;
            sid.dataset.committed = school4;
            // the badges, the duplicate flags and the box on this form are all listening
            // for the event, not the value
            sid.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }
        const added = addStudent({ first: firstIn, last: lastIn, id8, included: false, team: "X" });
        rebuildRowIndex();
        resortIfSorted();
        const addDiff = {
          type: "addStudent",
          index: students.length - 1,
          orderIndex: masterOrder.indexOf(added.rowId),
          snapshot: {
            rowId: added.rowId, first: added.first, last: added.last, id8: added.id8,
            included: added.included, team: added.team, topicTestKey: added.topicTestKey,
          }
        };
        // One student and one setting arrived on the same click, so one undo takes both
        // back — otherwise the School ID would be left standing with nobody using it,
        // still graying out the box.
        pushUndo(registered
          ? { type: "batch", label: "Add student", diffs: [
              { type: "fieldEdit", fieldId: "schoolId4", prev: schoolBefore, next: school4 },
              addDiff,
            ] }
          : { type: "single", label: "Add student", diff: addDiff });
        // clearing the box in code fires nothing, so the preview under it would go on
        // reading out the student who has just left the form
        const ns3 = document.getElementById("nativeStudent3");
        if (ns3){
          ns3.value = "";
          ns3.dispatchEvent(new Event("input", { bubbles: true }));
        }
        const nf = document.getElementById("nativeAddFirst");
        const nl = document.getElementById("nativeAddLast");
        if (nf) nf.value = "";
        if (nl) nl.value = "";
        renderAllRows();
        syncAllCountersAndSummaries();
        syncSticky();
        refreshFixTeamsButtons();
        return;
      }

      if (action === "setNameOrder"){
        setOrder(btn.dataset.order);
        return;
      }

      if (action === "filterStudentList"){ filterStudentList(); return; }

      if (action === "resetTopicTests"){
        resetTopicTests();
        return;
      }

      if (action === "addTopicRow"){
        const cfg = getTopicTestConfig();
        const g = String(btn.dataset.group || "");
        cfg.visibleCounts[g] = Math.max(3, Number(cfg.visibleCounts?.[g] || 0) + 1);
        renderTopicTestGrid(cfg);
        syncTopicTestsUI();
        return;
      }

      if (action === "moveTopicTest"){
        moveTopicTest(String(btn.dataset.group || ""), Number(btn.dataset.index), Number(btn.dataset.dir));
        return;
      }

      if (action === "deleteTopicTest"){
        const g = String(btn.dataset.group || "");
        const index = Number(btn.dataset.index);
        const cfg = getTopicTestConfig();
        const { names } = topicRowArrays(cfg, g);
        const name = String(names[index - 1] ?? "").trim();
        const seated = topicTestUsage().get(topicIndexLabel(g, index)) || 0;

        /* An empty, unused row goes on the first press: there is nothing in it to
           lose. A row with a name on it, or with students sitting it, arms first —
           one press to ask, a second to do — which is the same pattern the Settings
           reset and the editor's Revert use, and is undone by simply not pressing
           again. */
        if ((name || seated) && btn.dataset.armed !== "1"){
          disarmTopicDeletes();
          btn.dataset.armed = "1";
          btn.dataset.restTitle = btn.title;
          btn.title = `Press again to delete ${name ? `"${name}"` : "this test"}`
            + (seated
                ? `. The ${seated} student${seated === 1 ? "" : "s"} on it `
                  + (cfg.tbdEnabled ? "go back to their own division's TBD." : "are left with no topic test.")
                : ".");
          clearTimeout(topicDeleteArmTimer);
          topicDeleteArmTimer = setTimeout(disarmTopicDeletes, 4000);
          return;
        }

        disarmTopicDeletes();
        deleteTopicTest(g, index);
        toast(seated
          ? `Deleted ${name ? `"${name}"` : "a topic test"} . ${seated} student${seated === 1 ? "" : "s"} moved off it`
          : `Deleted ${name ? `"${name}"` : "an empty test row"}`, "undo");
        return;
      }

      if (action === "openBatchDivision"){
        const rowIds = Array.from(selected).filter(rid => canChangeLevel(getStudent(rid)?.id8));
        if (!rowIds.length) return;
        openDivisionPopoverNear(btn, { type: "batch", rowIds });
        return;
      }

      if (action === "openBatchTopic"){
        // Only added students can hold a topic test, so a selection straddling both
        // narrows to the added half here — the picker's counts are then the number of
        // sheets it will actually change, not the number of rows highlighted.
        const rowIds = Array.from(selected).filter(rid => getStudent(rid)?.included);
        if (!rowIds.length || !getTopicTestConfig().enabled) return;
        openTopicPopoverNear(btn, { type: "batch", rowIds });
        return;
      }

      if (action === "openRowFilter"){ openRowFilter(); return; }
      if (action === "closeRowFilter"){ closeRowFilter(); return; }
      if (action === "skipToActions"){
        // an anchor to a <div> moves the scroll but not the focus, and focus is the
        // whole point of the link
        document.getElementById("btnCreateSticky")?.focus();
        return;
      }
      /* Click pins the list open, so it can be read at length and its buttons
         pressed. A second click on the same pill puts it away — the same toggle the
         help chips use, and the reason the bubble can hold controls at all. */
      if (action === "openIssues"){
        const entry = issuePillList.get(btn.id);
        if (!entry || !entry.list.length) return;
        if (window.FBTips?.isPinned() && window.FBTips.ownedBy(btn)){
          window.FBTips.hide(true);
        } else {
          window.FBTips?.show(btn, issuePillHtml(entry.list, entry.word),
                              entry.word === "Error" ? "danger" : "caution", true);
        }
        return;
      }
      if (action === "goToIssue"){ goToIssue(String(btn.dataset.issue || "")); return; }
      if (action === "clearRowFilter"){ clearRowFilters(); return; }
      if (action === "filterToggle"){
        toggleFilterValue(String(btn.dataset.facet || ""), String(btn.dataset.value ?? ""));
        return;
      }
      if (action === "filterFacetAll" || action === "filterFacetNone"){
        setFacetAll(String(btn.dataset.facet || ""), action === "filterFacetAll");
        return;
      }

      if (action === "undo"){
        undo();
        syncAllCountersAndSummaries();
        syncSticky();
        refreshFixTeamsButtons();
        return;
      }

      if (action === "redo"){
        redo();
        syncAllCountersAndSummaries();
        syncSticky();
        refreshFixTeamsButtons();
        return;
      }

      if (action === "openDup"){ openDupModal(); return; }
      if (action === "closeDup"){ closeDupModal(); return; }

      if (action === "openCompetition"){ openCompetitionModal(); return; }
      if (action === "closeCompetition"){ closeCompetitionModal(); return; }
      if (action === "jumpToTopicTests"){
        closeCompetitionModal();
        const menu = document.getElementById("menuTopics");
        if (menu && !menu.open) menu.querySelector("summary")?.click();
        return;
      }
      if (action === "openCustomEditor"){ openCustomEditor(); return; }
      if (action === "closeCustomEditor"){ closeCustomEditor(); return; }

      if (action === "resetDivColors"){
        // The button beside the swatches, taking the same route back as the swatches
        editDivColors(() => window.FBPrefs?.resetDivColors?.(),
                      `Revert ${competitionLabel()} colors`);
        renderCompetitionBody();
        renderCustomEditor();
        toast(`Colors for ${competitionLabel()} put back to the built-in set`, "undo");
        return;
      }

      if (action === "addCustomDivision"){
        /* A blank division on the lowest free digit, feeding nothing and named
           nothing. It used to conscript a roster level to attach itself to, which
           made "add a division" quietly also a reassignment; a division is its own
           thing now and waits to be filled in. */
        const divs = customDivisions();
        if (divs.length >= CUSTOM_MAX_DIVISIONS){
          toast("Six divisions is the most. There are only six roster levels to fill them.");
          return;
        }
        const freeId = CUSTOM_DIV_IDS.find(id => !divs.some(x => x.id === id));
        const freeDigit = CUSTOM_DIGITS.find(n => !divs.some(x => x.digit === n));
        /* Ids are reused: delete the division on id 3 and the next one added takes
           id 3 back. The color is stored against the id, so without this the new
           division would inherit the deleted one's color — which is the "queue" of
           colors that appeared to follow adding. A new division starts gray, always. */
        window.FBPrefs?.clearDivColor?.(freeId);
        updateCustom((next) => {
          next.divisions[freeId] = { name: "", digit: freeDigit };
          next.order.push(freeId);
        }, { repool: false, label: "Add division" });
        return;
      }

      if (action === "removeCustomDivision"){
        const id = Number(btn.dataset.id);
        if (!id) return;
        // Deleting a division moves students only if something was feeding it.
        const fed = [1,2,3,4,5,6].some(r => Number(customState().map[r]) === id);
        updateCustom((next) => {
          delete next.divisions[id];
          next.order = next.order.filter(x => x !== id);
          for (let r = 1; r <= 6; r++) if (Number(next.map[r]) === id) next.map[r] = 0;
        }, { repool: fed, label: "Remove division" });
        // the division is gone, and so is the color that belonged to it
        window.FBPrefs?.clearDivColor?.(id);
        return;
      }

      if (action === "emptyCustom"){
        if (btn.dataset.armed !== "1"){
          btn.dataset.armed = "1";
          btn.dataset.label = btn.textContent;
          btn.textContent = "Clear (press again)";
          clearTimeout(customArmTimer);
          customArmTimer = setTimeout(() => disarmCustomButtons(), 4000);
          return;
        }
        disarmCustomButtons();
        setCompetition({ preset: "custom", custom: emptyCustomCompetition() });
        // no divisions left, so no colors belonging to any: back to the defaults
        window.FBPrefs?.resetDivColors?.();
        toast("Custom competition emptied. Nothing competes yet", "undo");
        return;
      }

      if (action === "setCustomTeams"){
        const n = Number(btn.dataset.n);
        if (!(n >= 0 && n <= 9)) return;
        // The cap cannot move anybody between divisions, but it can invalidate a team
        // above it, so this one does re-pool.
        updateCustom((next) => { next.maxTeams = n; }, { label: "Set teams per division" });
        return;
      }

      /* People per team, from the segment. Nobody is moved by it — an over-full team
         is reported, not corrected, exactly as it is when a coach types a fifth name
         into a team of four — so this does not re-pool. What it does change is what
         Fill Teams would do next, and what the list flags in amber. */
      if (action === "setCustomTeamSize"){
        const n = Number(btn.dataset.n);
        if (!(Number.isInteger(n) && n >= 0 && n <= MAX_TEAM_SIZE)) return;
        setCustomTeamSize(n);
        return;
      }

      if (action === "revertCustom"){
        // the one destructive control in this dialog, so it arms before it fires —
        // the same two-press pattern the Settings reset uses, and for the same reason
        if (btn.dataset.armed !== "1"){
          btn.dataset.armed = "1";
          btn.dataset.label = btn.textContent;
          btn.textContent = "Revert (press again)";
          clearTimeout(customArmTimer);
          customArmTimer = setTimeout(() => disarmCustomButtons(), 4000);
          return;
        }
        disarmCustomButtons();
        /* The divisions and the colors together: reverting to the regular season and
           keeping whatever paint was on the old divisions leaves the right structure
           wearing the wrong colors, which is not "back to regional" in any sense a
           reader would recognise. */
        setCompetition({ preset: "custom", custom: defaultCustomCompetition() });
        // clearing the overrides is what puts the season's colors back, because that
        // is what a palette with nothing in it answers
        window.FBPrefs?.resetDivColors?.();
        renderCustomEditor();
        renderCompetitionBody();
        toast("Custom divisions and colors back to the regular season", "undo");
        return;
      }
      if (action === "pickCompetition"){
        const key = btn.dataset.comp;
        if (!key || key === competitionState.preset) return;

        /* Custom opens on the regular season's divisions, so it has to open on the
           regular season's colors too. Seeding the structure without the paint left
           six divisions named Algebra I through Statistics sitting in the gray a
           division wears when it has been invented and has no subject to take a hue
           from. Revert already did both halves, which is why that button looked like
           it fixed something rather than like it undid something.

           Only on the way in, and only into an untouched palette. Custom keeps what
           you leave in it, so a second visit must find the colors it was left with,
           and a palette someone has already painted is theirs and not ours to seed. */
        /* Custom opens on the season's colors as well as its divisions. That is not
           done here: it hangs off the palette switch instead, so that reloading into
           Custom or undoing back into it gets the same answer as pressing this. */
        setCompetition({
          preset: key,
          custom: (key === "custom")
            ? (competitionState.custom || defaultCustomCompetition())
            : competitionState.custom,
        });
        return;
      }

      if (action === "excludeDupGroup"){
        const key = btn.dataset.key || "";
        const group = getDuplicateGroups({includedOnly:true}).find(g => g.key === key);
        if (!group) return;

        // keep first by alpha name
        const rowIds = group.rowIds.slice().sort((a,b)=>cmpAlpha(getStudent(a), getStudent(b)));
        const keep = rowIds[0];
        const toExclude = rowIds.slice(1);

        const diffs = [];
        for (const rid of toExclude){
          const s = getStudent(rid);
          if (!s || !s.included) continue;
          const prev = s.included;
          s.included = false;
          bumpCountsOnIncludeChange(s, prev, false);
          diffs.push({ type:"toggleInclude", rowId: rid, prev:true, next:false });
          rerenderRow(rid);
        }
        if (diffs.length){
          pushUndo({ type:"batch", label:"Un-add duplicate IDs", diffs });
        }
        syncAllCountersAndSummaries();
        syncSticky();
        refreshFixTeamsButtons();
        openDupModal(); // refresh modal
        return;
      }

      if (action === "jumpRow"){
        const rowId = Number(btn.dataset.rowid);
        // the roll-up views have no rows to jump to, so bring the table up first
        if (listView !== "table") setListView("table");
        const tr = rowEl.get(rowId);
        if (!tr) return;
        tr.scrollIntoView({behavior:"smooth", block:"center"});
        // emphasize selection
        clearSelection();
        setSelected(rowId, true);
        const cb = tr.querySelector(`input[type="checkbox"][data-action="select"][data-rowid="${rowId}"]`);
        if (cb) cb.checked = true;
        syncSticky();
        return;
      }

      // Sticky selection actions
      if (action === "selectAllVisible"){
        selectAllVisible();
        return;
      }
      if (action === "selectIncluded"){
        selectIncluded();
        return;
      }
      if (action === "clearSelection"){
        clearSelection();
        return;
      }

      if (action === "batchDelete"){
        if (!selected.size) return;
        // No confirmation, for the same reason the row's own delete asks for none:
        // it is one undo away, and the bar says so on hover.
        batchDeleteStudents(Array.from(selected));
        return;
      }
      if (action === "batchInclude"){
        batchSetInclude(Array.from(selected), true);
        syncAllCountersAndSummaries();
        syncSticky();
        refreshFixTeamsButtons();
        return;
      }
      if (action === "batchExclude"){
        batchSetInclude(Array.from(selected), false);
        syncAllCountersAndSummaries();
        syncSticky();
        refreshFixTeamsButtons();
        return;
      }
      if (action === "openBatchTeam"){
        if (!selected.size) return;
        // only the added rows can take a team, so only they are what the picker is for
        const rowIds = Array.from(selected).filter(rid => teamIsEditable(getStudent(rid)));
        if (!rowIds.length) return;
        openTeamPopoverNear(btn, {type:"batch", rowIds});
        return;
      }

      if (action === "openFillTeams"){ openFillTeamsModal(); return; }
      if (action === "closeFillTeams"){ closeFillTeamsModal(); return; }

      // Which of the two fills the dialog is offering. Redrawing the body is the whole
      // of it: every row's state, every label and the note all read the mode.
      if (action === "setFillMode"){
        const mode = (btn.dataset.mode === "redo") ? "redo" : "keep";
        if (mode === fillTeamsMode) return;
        fillTeamsMode = mode;
        renderFillTeamsBody();
        return;
      }

      // one division, from inside the dialog. The dialog stays open: seating six
      // divisions is six clicks, and closing after each one would make it twelve.
      if (action === "fixTeamsOne"){
        fixTeamsForDivision(Number(btn.dataset.div), fillTeamsMode);
        afterTeamFill();
        return;
      }

      if (action === "fixTeamsAll"){
        fixTeamsAllDivisions(fillTeamsMode);
        afterTeamFill();
        return;
      }

      if (action === "cancelPDF"){
        cancelPdfFlag = true;
        return;
      }

      if (action === "createPDF"){
        createPDF();
        return;
      }
    });

    // Custom mapping edits commit on change, not on every keystroke: each one
    // re-buckets every student and lands on the undo stack.
    document.addEventListener("change", (ev) => {
      const t = ev.target;
      if (!t || !t.dataset) return;
      if (t.dataset.compMap === undefined) return;

      const custom = competitionState.custom
        ? JSON.parse(JSON.stringify(competitionState.custom))
        : defaultCustomCompetition();

      custom.map[t.dataset.compMap] = Number(t.value) || 1;
      setCompetition({ preset: "custom", custom });
    });

    document.addEventListener("click", (ev) => {
      const back = document.getElementById("competitionModalBack");
      if (back && ev.target === back) closeCompetitionModal();
      const customBack = document.getElementById("customModalBack");
      if (customBack && ev.target === customBack) closeCustomEditor();
      const filterBack = document.getElementById("filterModalBack");
      if (filterBack && ev.target === filterBack) closeRowFilter();
      const fillBack = document.getElementById("fillTeamsModalBack");
      if (fillBack && ev.target === fillBack) closeFillTeamsModal();
    });

    /**
     * Turning TBD on seeds every student who has no test with their own division's
     * TBD. Which category a student belongs to is not a decision — it is their
     * division — so it is not worth entering by hand; the naming is the part that
     * varies, and that is what the cards are for.
     *
     * Only when TBD is on. It used to run off the topic-tests switch itself, which
     * gave every student a marker they had not asked for the moment the feature was
     * turned on.
     */
    function seedTopicTestDefaults(){
      if (!getTopicTestConfig().tbdEnabled) return;
      const diffs = [];
      for (const st of students){
        // only students who are printing have a Test field to seed
        if (!st.included) continue;
        if (st.topicTestKey) continue;
        const g = ownTopicGroup(st.division);
        if (!g) continue;
        const next = topicIndexLabel(g, 0);
        diffs.push({ type: "setTopicTest", rowId: st.rowId, prev: "", next });
        st.topicTestKey = next;
      }
      if (diffs.length) pushUndo({ type: "batch", label: "Seed TBD topic tests", diffs });
    }

    document.getElementById("topicTestsEnabled")?.addEventListener("change", () => {
      renderTopicTestGrid();
      syncTopicTestsUI();
    });
    /* TBD is what seeds now, not the topic-tests switch. Turning it on gives every
       student with no test their own division's TBD; turning it off takes those back,
       and only those — a student sitting a named test is untouched either way. */
    document.getElementById("topicTbdEnabled")?.addEventListener("change", (ev) => {
      if (ev.target.checked){
        seedTopicTestDefaults();
      } else {
        const diffs = [];
        for (const st of students){
          if (!topicKeyIsTbd(st.topicTestKey)) continue;
          diffs.push({ type: "setTopicTest", rowId: st.rowId, prev: st.topicTestKey, next: "" });
          st.topicTestKey = "";
        }
        if (diffs.length) pushUndo({ type: "batch", label: "Clear TBD topic tests", diffs });
      }
      // Each card now lists its own TBD as its last row, so the cards have to be
      // redrawn when the switch that creates it moves. Safe here: the focus is on a
      // checkbox, not in one of the name fields a rebuild would take the caret from.
      renderTopicTestGrid();
      syncTopicTestsUI();
    });
    // The Topic column carries test names, so it does follow this field — but a full
    // list rebuild per keystroke is a visible stall on a large roster. Sanitise the
    // code inputs immediately, redraw once the typing pauses.
    let topicGridRenderTimer = null;
    document.getElementById("topicTestGrid")?.addEventListener("input", () => {
      const codeInputs = document.querySelectorAll(".topicCodeInput");
      codeInputs.forEach((inp) => {
        const clean = String(inp.value || "").replace(/\D/g, "").slice(0, 3);
        if (inp.value !== clean) inp.value = clean;
      });
      // a half-typed code blocks the PDF, so the mark and the chip keep up per keystroke
      syncDivisionTestIdState();
      syncSticky();
      clearTimeout(topicGridRenderTimer);
      topicGridRenderTimer = setTimeout(() => {
        renderAllRows();
        syncAllCountersAndSummaries();
        syncSticky();
      }, 180);
    });
