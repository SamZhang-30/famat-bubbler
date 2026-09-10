    /* ============================================================
       Test names: an assumption you may overwrite

       Every division already implies what its Test field should say — its own name,
       plus " Individual" where the competition runs topic tests. That is an
       assumption, and it used to be written into the box as ordinary text.

       Which made it indistinguishable from something a coach had typed. Switch
       competition and the app had to overwrite it, because leaving it would print
       last competition's name; but overwriting it also threw away anything actually
       entered by hand. Either way the box was lying about where its contents came
       from.

       So the assumption is never stored. It is re-derived on demand and shown as the
       field's placeholder — visibly a ghost, and not part of the value. The value
       holds only what was typed. Clearing the box does not clear the name; it hands
       the field back to the assumption, which is then free to follow the competition
       again.
       ============================================================ */

    /** What each division's Test field says if nobody overrides it. */
    function assumedTestNames(comp){
      const keep = competitionState;
      if (comp) competitionState = comp;
      const out = [];
      try{
        const p = competitionPreset();
        for (let d = 1; d <= 6; d++){
          if (!isActiveDivision(d)){ out.push(""); continue; }
          // printNames exists where the display name uses a glyph the PDF font lacks
          const base = p.printNames?.[d] || p.names[d] || ("Division " + d);
          out.push(p.topics ? `${base} Individual` : base);
        }
      } finally {
        competitionState = keep;
      }
      return out;
    }

    /* The two boxes a division owns in the Competition dialog, found by name rather
       than by position — there are twelve inputs under #division now. */
    function divLabelInput(d){ return document.querySelector(`#division input[data-divlabel="${d}"]`); }
    function divTestIdInput(d){ return document.querySelector(`#division input[data-divtestid="${d}"]`); }

    /** Only what was typed by hand — blank where the assumption is in force. */
    function getDivisionLabelOverrides(){
      const out = [];
      for (let d = 1; d <= 6; d++) out.push(String(divLabelInput(d)?.value ?? ""));
      return out;
    }

    /* ---- the bubbled Test ID -----------------------------------------------------
       Three digits per division, in the same three columns a topic test code goes in,
       and optional: most meets bubble nothing there and the boxes start empty with a
       ### ghost saying what would go in them.

       Optional, but not partial. One or two digits is not a shorter ID, it is an ID
       somebody has started typing — bubbling it would put a digit in the wrong column
       and there is no way to tell that from the sheet afterwards. So a part-typed box
       stops the PDF, the way a part-typed FAMAT ID already does.
       ---------------------------------------------------------------------------- */

    /** What is typed, digits only. "" for a division that bubbles nothing. */
    function getDivisionTestIds(){
      const out = [];
      for (let d = 1; d <= 6; d++){
        out.push(String(divTestIdInput(d)?.value ?? "").replace(/\D/g, "").slice(0, 3));
      }
      return out;
    }

    function setDivisionTestIds(ids){
      for (let d = 1; d <= 6; d++){
        const el = divTestIdInput(d);
        if (!el) continue;
        el.value = String(ids?.[d - 1] ?? "").replace(/\D/g, "").slice(0, 3);
      }
      syncDivisionTestIdState();
    }

    /**
     * Every three-digit code that is started but not finished, from either of the two
     * places that fill those same three columns: a division's Test ID, and a topic
     * test's code. One rule, because it is one set of columns — a two-digit code
     * bubbles a digit into the wrong place whichever box it was typed into.
     *
     * A division this competition does not run is left out: its box keeps whatever is
     * typed so switching back restores it, but nothing it holds is going to be printed.
     * @returns {{where:string, value:string, el:Element|null}[]}
     */
    function testCodeProblems(){
      const out = [];
      for (let d = 1; d <= 6; d++){
        if (!isActiveDivision(d) || getTopicTestConfig().enabled) continue;
        const el = divTestIdInput(d);
        const v = String(el?.value ?? "").replace(/\D/g, "");
        if (v.length && v.length !== 3) out.push({ where: `${divShort(d)} Test ID`, value: v, el });
      }
      for (const el of (getTopicTestConfig().enabled ? document.querySelectorAll(".topicCodeInput") : [])){
        const v = String(el.value ?? "").replace(/\D/g, "");
        if (!v.length || v.length === 3) continue;
        const g = el.dataset.group || "";
        out.push({ where: `${topicGroupLabel(g)} test ${el.dataset.index || ""}`.trim(), value: v, el });
      }
      return out;
    }

    /** Mark the boxes the blocker is about, so the chip has something to point at. */
    function syncDivisionTestIdState(){
      const bad = new Set(testCodeProblems().map(x => x.el).filter(Boolean));
      for (let d = 1; d <= 6; d++){
        const el = divTestIdInput(d);
        if (el) el.dataset.bad = bad.has(el) ? "1" : "0";
      }
      for (const el of document.querySelectorAll(".topicCodeInput")){
        el.dataset.bad = bad.has(el) ? "1" : "0";
      }
    }
    /** The grid is rebuilt from scratch a lot, so its marks are reapplied with it. */
    function syncTopicCodeState(){ syncDivisionTestIdState(); }

    /**
     * The three digits one student's sheet carries in the test-code columns.
     * The same rule the Test field's text follows: a student sitting a topic test
     * carries that test's code, and everyone else carries their division's ID. A topic
     * test with no code of its own bubbles nothing — they are sitting a different test,
     * so their division's ID would be the wrong answer rather than a fallback.
     */
    function testCodeForStudent(student, testIds, cfgIn){
      const own = String(testIds?.[student.division - 1] ?? "");
      const cfg = cfgIn || getTopicTestConfig();
      if (!cfg.enabled) return own;
      if (!parseTopicKey(student.topicTestKey)) return "";
      return getTopicTestCodeByKey(student.topicTestKey);
    }

    /** What will actually print: the override where there is one, else the assumption. */
    function getDivisionLabels(){
      const over = getDivisionLabelOverrides();
      const assumed = assumedTestNames();
      return over.map((v, i) => {
        // A division this competition does not run prints nothing, whatever is still
        // typed in its box — the text is kept so switching back restores it, but it
        // is not a Test field until that division competes again.
        if (!isActiveDivision(i + 1)) return "";
        return String(v).trim() ? v : (assumed[i] || "");
      });
    }

    function setDivisionLabels(labels){
      const assumed = assumedTestNames();
      for (let i = 0; i < 6; i++){
        const el = divLabelInput(i + 1);
        if (!el) continue;
        const raw = String(labels?.[i] ?? "");
        /* A workspace saved before this existed stored the assumption as text. Read
           back as an override it would be frozen there, so anything that matches what
           this competition would have assumed anyway is taken as not-overridden. It
           reads identically either way; the difference is that it now follows. */
        el.value = (raw.trim() && raw.trim() !== String(assumed[i] || "").trim()) ? raw : "";
      }
      syncTestNamePlaceholders();
    }

    /** Puts the current assumptions into the boxes as ghosts. */
    function syncTestNamePlaceholders(){
      const assumed = assumedTestNames();
      for (let i = 0; i < 6; i++){
        const el = divLabelInput(i + 1);
        if (!el) continue;
        el.placeholder = assumed[i] || "";
        // so the box can say, quietly, which of the two it is showing
        el.dataset.assumed = String(el.value).trim() ? "0" : "1";
      }
    }
    
    function getBubblesChecked(){
      const inputs = document.getElementById("bubbles")?.getElementsByTagName("input");
      const out = [];
      for (let i = 0; i < 9; i++) out.push(!!inputs?.[i]?.checked);
      return out;
    }
    function setBubblesChecked(arr){
      const inputs = document.getElementById("bubbles")?.getElementsByTagName("input");
      for (let i = 0; i < 9; i++){
        if (inputs?.[i]) inputs[i].checked = !!arr?.[i];
      }
    }
    
    function getAdvancedSettings(){
      const order = getOrder();
      const delimiter = document.getElementById("delimiter")?.value ?? "";
      const filterText = document.getElementById("filter")?.value ?? "";
      /* Only the two setup menus that are actually <details>. This used to also read
         "secBubbles" — a tab panel, which has no open state — and "secTopics", which
         is not an id in this document at all; the menu is "menuTopics". Both were
         optional-chained, so they never threw and never worked. */
      const secFilter = document.getElementById("secFilter");
      const menuTopics = document.getElementById("menuTopics");
      return {
        order,
        delimiter,
        filterText,
        secFilterOpen: !!secFilter?.open,
        menuTopicsOpen: !!menuTopics?.open,
      };
    }
    function setAdvancedSettings(s){
      setOrder(s?.order ?? getOrder(), {persist:false});
      const delim = document.getElementById("delimiter");
      if (delim) delim.value = String(s?.delimiter ?? "");
      const filt = document.getElementById("filter");
      if (filt) filt.value = String(s?.filterText ?? "");

      const secFilter = document.getElementById("secFilter");
      const menuTopics = document.getElementById("menuTopics");
      if (secFilter) secFilter.open = !!s?.secFilterOpen;
      // older snapshots spelled this one after an id that never existed
      if (menuTopics) menuTopics.open = !!(s?.menuTopicsOpen ?? s?.secTopicsOpen);

      // migrate old snapshots that used filterOpen
      if (s && "filterOpen" in s && s.filterOpen && secFilter && !("secFilterOpen" in s)){
        secFilter.open = true;
      }
    }
    
    function getFullSnapshot(){
      const snapshot = {
        v: 1,
        savedAt: Date.now(),
    
        // text inputs
        enrollmentText: document.getElementById("enrollment")?.value ?? "",
        school: document.getElementById("school")?.value ?? "",
        schoolId4: document.getElementById("schoolId4")?.value ?? "",
        filename: document.getElementById("filename")?.value ?? "BubbledAnswerSheet",
        pdfFont: document.getElementById("pdfFont")?.value ?? "Helvetica",
    
        // settings
        competition: cloneCompetition(),
        // overrides only: the assumption is re-derived, never stored
        divisionLabels: getDivisionLabelOverrides(),
        divisionTestIds: getDivisionTestIds(),
        bubbles: getBubblesChecked(),
        advanced: getAdvancedSettings(),
        topicTests: getTopicTestConfig(),
        masterOrder: normalizeMasterOrder().slice(),
        sortState: { col: String(sortState.col || ""), dir: String(sortState.dir || "") },
    
        // core data
        students: students.map(s => ({
          rowId: Number(s.rowId),
          first: String(s.first ?? ""),
          last: String(s.last ?? ""),
          id8: String(s.id8 ?? ""),
          included: !!s.included,
          team: normalizeTeamValue(s.team),
          topicTestKey: String(s.topicTestKey ?? "")
        }))
      };
      return snapshot;
    }
    
    function applyFullSnapshot(snapshot, {persist=true}={}){
      if (!snapshot || typeof snapshot !== "object") return;

      // Everything below writes to inputs the autosave hooks are listening on, so it
      // is held off until the whole workspace is on screen and consistent.
      restoringCurrent = true;
      try{
        applyFullSnapshotInner(snapshot);
      } finally {
        restoringCurrent = false;
      }
      if (persist) saveCurrentNow();
    }

    function applyFullSnapshotInner(snapshot){

      // The competition decides what divisionFromId8 returns, so it has to be in
      // place before any student is rebuilt below. Snapshots saved before this
      // existed simply leave the current one alone.
      if (snapshot.competition && typeof snapshot.competition === "object"){
        const preset = COMPETITION_ORDER.indexOf(snapshot.competition.preset) >= 0
          ? snapshot.competition.preset
          : "regional";
        competitionState = { preset, custom: snapshot.competition.custom || null };
        saveCompetition();
        // Every student below is about to be rebuilt from the snapshot and the whole
        // table redrawn, so a repaint here would be a pass over the list this one is
        // replacing.
        applyCompetitionToUI({ repaintRows: false });
      }

      // Inputs first
      const enr = document.getElementById("enrollment");
      if (enr) enr.value = String(snapshot.enrollmentText ?? "");
      const nan = document.getElementById("nativeAddFirst");
      const nanLast = document.getElementById("nativeAddLast");
      const ns3 = document.getElementById("nativeStudent3");
      const ndv = document.getElementById("nativeAddDivision");
      if (nan) nan.value = "";
      if (nanLast) nanLast.value = "";
      if (ns3) ns3.value = "";
      if (ndv) ndv.value = "1";
      const nsid = document.getElementById("addSchoolId4");
      if (nsid) nsid.value = "";
      const nae = document.getElementById("nativeAddError");
      if (nae) nae.textContent = "";
      const sch = document.getElementById("school");
      if (sch) sch.value = String(snapshot.school ?? "");
      const sid4 = document.getElementById("schoolId4");
      if (sid4){ sid4.value = String(snapshot.schoolId4 ?? ""); sid4.dataset.committed = sid4.value.replace(/\D/g, "").slice(0,4); }
      // the box above takes whatever that setting just became, or stays open if it is empty
      syncAddStudentSchool();
      const fn = document.getElementById("filename");
      if (fn) fn.value = safePdfFilename(snapshot.filename ?? "BubbledAnswerSheet").slice(0,-4);
      if (typeof syncFilenameWidth === "function") syncFilenameWidth();
      // snapshots saved before the font was a choice simply get the one it always was,
      // and anything the select cannot offer falls back rather than blanking it
      const pf = document.getElementById("pdfFont");
      if (pf){
        const want = String(snapshot.pdfFont ?? "Helvetica");
        if(typeof syncPdfFontPicker === 'function') syncPdfFontPicker(want);
        pf.value = PDF_TEXT_FONTS.indexOf(want) >= 0 ? want : "Helvetica";
      }
    
      setDivisionLabels(snapshot.divisionLabels);
      // a workspace saved before Test IDs existed simply has none
      setDivisionTestIds(snapshot.divisionTestIds);
      setBubblesChecked(snapshot.bubbles);
      setAdvancedSettings(snapshot.advanced);
      setTopicTestConfig(snapshot.topicTests ?? null);

      masterOrder = Array.isArray(snapshot.masterOrder)
        ? snapshot.masterOrder.map(Number).filter(Number.isFinite)
        : [];
      const savedSort = snapshot.sortState;
      sortState = (savedSort && SORTABLE_COLUMNS.indexOf(savedSort.col) >= 0 && (savedSort.dir === "up" || savedSort.dir === "down"))
        ? { col: String(savedSort.col), dir: String(savedSort.dir) }
        : { col: "", dir: "" };
    
      // Rebuild students from snapshot
      const rawStudents = Array.isArray(snapshot.students) ? snapshot.students : [];
      const rebuilt = [];
    
      let maxRow = 0;
      for (const x of rawStudents){
        const rowId = Number(x?.rowId);
        if (!Number.isFinite(rowId) || rowId <= 0) continue;
    
        const id8 = clamp8Digits(x?.id8);
        const div = divisionFromId8(id8);
    
        // A draft saved before teams followed the Added column, or one hand-edited
        // since, can carry a team on a student who is not printing. The list has no
        // way to show that and no way to clear it, so it is squared here.
        const includedVal = !!x?.included;
        const teamVal = includedVal ? normalizeTeamValue(x?.team) : "X";
        // ...and the same for the topic test, which follows the same rule
        const topicVal = includedVal ? String(x?.topicTestKey ?? "") : "";
    
        // slots saved before names were split still carry a single `name`
        const nm = (!x?.first && !x?.last) ? splitLegacyName(x?.name) : { first: x?.first, last: x?.last };

        rebuilt.push({
          rowId,
          first: String(nm.first ?? ""),
          last: String(nm.last ?? ""),
          id8,
          division: div,
          included: includedVal,
          team: teamVal,
          topicTestKey: topicVal
        });
    
        if (rowId > maxRow) maxRow = rowId;
      }
    
      // Reset caches/selection/undo
      students = rebuilt;
      nextRowId = maxRow + 1;
      resetCaches();
    
      // Rebuild rowIndex + all derived caches/counts
      rebuildRowIndex();
      for (const s of students){
        bumpCountsOnAdd(s);
      }
    
      // masterOrder came off the snapshot before the students did, so square the
      // two now: rowIds the snapshot did not carry are appended, dead ones dropped.
      normalizeMasterOrder();

      syncSortHeaders();
      // How the list is drawn is a display preference, not workspace data, so it
      // survives a draft load and a competition switch alike — and re-applying it
      // catches divisions this competition has only just brought into play. It
      // redraws the rows and the counters on its way through.
      setListView(loadListView(), {persist:false});
      refreshFixTeamsButtons();
    }
    
    /** Division names for a competition, as the six positional Test Name fields. */

    /**
     * Switching competition re-buckets every student, so it runs through the
     * snapshot path: one rebuild, one undo step. Test Names are refilled from
     * the new preset, which is undone by the same step.
     */
    /**
     * A Team Number only means something inside one pool, and a topic test only
     * inside one division, so both are dropped where the switch invalidates them
     * and kept where it does not. Counts come back for the dialog to report.
     */
    function migrateStudentsForCompetition(list, next){
      const keep = competitionState;
      let teamsCleared = 0, topicsCleared = 0;
      const out = list.map((x) => {
        const id8 = clamp8Digits(x.id8);
        const oldGroup = divisionFromId8(id8);
        competitionState = next;
        const newGroup = divisionFromId8(id8);
        // read under the new competition, because it decides what the categories are
        const migratedKey = migrateTopicKey(x.topicTestKey);
        const liveGroups = topicGroups();
        competitionState = keep;

        competitionState = next;
        const seatsNow = maxTeams();
        competitionState = keep;

        const copy = Object.assign({}, x);
        const heldTeam = normalizeTeamValue(copy.team);
        /* Two ways a Team Number stops meaning anything: the student moved to a
           different pool, or the meet they moved to does not run that many teams —
           Statewide enters one per division, so a 2 or a 3 has nowhere to sit. */
        const movedPool  = (oldGroup !== newGroup);
        const beyondCap  = (typeof heldTeam === "number" && heldTeam > seatsNow);
        // 0 is not a seat, so neither of those can take it away: "not on a team" is
        // as true in the new pool as it was in the old one.
        if (heldTeam !== "X" && heldTeam !== 0 && (movedPool || beyondCap)){
          copy.team = "X";
          teamsCleared++;
        }
        /* A topic test is kept whenever the competition being switched to still has
           the category it belongs to. Nothing is dropped for being the "wrong" level
           any more — the ladder is a caution now, and one the row carries itself. */
        const key = String(migratedKey || "");
        copy.topicTestKey = key;
        if (key && liveGroups.indexOf(topicGroupOfKey(key)) < 0){
          copy.topicTestKey = "";
          topicsCleared++;
        }
        return copy;
      });
      return { students: out, teamsCleared, topicsCleared };
    }

    /** Set by setCompetition, shown once in the dialog, cleared when it closes. */
    let lastCompetitionMigration = null;

    function setCompetition(next){
      const before = getFullSnapshot();
      const migrated = migrateStudentsForCompetition(before.students || [], next);
      lastCompetitionMigration = {
        teams: migrated.teamsCleared,
        topics: migrated.topicsCleared,
      };
      const after = Object.assign({}, before, {
        competition: JSON.parse(JSON.stringify(next)),
        /* Not refilled any more. What is typed here is the coach's and survives the
           switch; what is not typed is an assumption, and assumptions re-derive
           themselves from whatever competition is now set. */
        divisionLabels: getDivisionLabelOverrides(),
        divisionTestIds: getDivisionTestIds(),
        students: migrated.students,
      });
      applyFullSnapshot(after);
      pushUndo({
        type: "single",
        label: "Change competition",
        diff: { type: "fullSnapshot", prev: before, next: getFullSnapshot() }
      });
      // applyFullSnapshot repaints the dialog before it swaps the student list in, so
      // the counts it draws are the old ones. Redraw now that the switch is complete.
      if (document.getElementById("competitionModalBack")?.style.display === "flex") renderCompetitionBody();
      if (document.getElementById("customModalBack")?.style.display === "flex") renderCustomEditor();
    }

    /* One reading of "what a roster line looks like", shared by the importer below and
       by the Saved Rosters summary, so a slot never advertises a count that loading it
       would not produce. */
    const ENROLLMENT_HEADER_RE = /^(?:Enrollment list for:|Roster:)\s*(.*?)\s*#\s*\d+/i;
    const ENROLLMENT_STUDENT_RE = /^([^,]+),\s*(.+?)\s+(Algebra II|Algebra I|Geometry|Precalculus|Calculus|Statistics)\b(.*)$/iu;
    function parseEnrollmentText(text){
      const out = {school:"",schoolId:"",students:[],rejected:[]};
      String(text || "").split(/\r?\n/).forEach((raw,i)=>{
        const line=raw.trim(); if (!line) return;
        const header=line.match(ENROLLMENT_HEADER_RE);
        if(header){out.school=header[1].trim();out.schoolId=(line.match(/#\s*(\d{4})\b/) || [])[1] || "";return;}
        if(/^Student Name\b/i.test(line)) return;
        const m=line.match(ENROLLMENT_STUDENT_RE);
        const ids=m ? m[4].trim().split(/\s+/).filter(v=>/^\d{8,9}$/.test(v)) : [];
        if(!m || !ids.length){out.rejected.push({line:i+1,text:line,reason:m ? "Expected an 8- or 9-digit roster ID after the level." : "Expected Last, First followed by a roster level and ID."});return;}
        out.students.push({last:m[1].trim(),first:m[2].trim(),id8:ids[0].slice(0,8)});
      });
      return out;
    }
    function summarizeRosterText(text){
      const parsed=parseEnrollmentText(text);
      return {school:parsed.school,count:new Set(parsed.students.map(s=>`${s.id8}|${lc(s.first)}|${lc(s.last)}`)).size};
    }

    /* Short enough to sit on one line beside the rest of a slot's summary. */
    function formatSavedAt(ts){
      if (!ts) return "";
      try{
        return new Date(ts).toLocaleString(undefined, {
          year: "numeric", month: "short", day: "numeric",
          hour: "numeric", minute: "2-digit"
        });
      } catch {
        return "saved";
      }
    }
    

    function renderDraftSlots(){
      const host = document.getElementById("draftSlots");
      if (!host) return;
    
      const slots = loadDraftSlots();
      host.innerHTML = "";
    
      slots.forEach((slot, idx) => {
        const wrap = document.createElement("div");
        wrap.className = "slot";
    
        const name = document.createElement("input");
        name.className = "slotName";
        name.type = "text";
        name.value = slot.name;
        name.title = "Rename this draft slot";
        name.dataset.prev = slot.name;
        name.addEventListener("focusin", () => {
          name.dataset.prev = String(name.value || "");
        });
        name.addEventListener("input", () => {
          const s = loadDraftSlots();
          s[idx].name = name.value;
          if (!saveDraftSlots(s)) return;
        });
        name.addEventListener("focusout", () => {
          const prev = String(name.dataset.prev || "");
          const next = String(name.value || "");
          if (prev === next) return;
          pushUndo({ type:"single", label:"Rename draft slot", diff:{ type:"draftSlotName", idx, prev, next } });
          name.dataset.prev = next;
        });
    
        /* An empty slot can only be saved into. It used to render all three buttons
           live, with Load wearing the accent — so the most prominent control in the
           menu was the one that emptied the workspace, on a row whose own metadata
           said "empty". The state each button needs is right here; the buttons say
           it now, instead of the paragraph above the slots saying it for them. */
        const filled = !!slot.state;

        const btnSave = document.createElement("button");
        btnSave.type = "button";
        btnSave.textContent = "Save";
        // on an empty slot Save is the only move, so it is the one wearing the accent
        if (!filled) btnSave.className = "primary";
        btnSave.title = filled
          ? "Replace what is in this slot with the whole current workspace"
          : "Save the whole current workspace into this slot";
        btnSave.addEventListener("click", () => {
          const s = loadDraftSlots();
          const prev = { state: s[idx].state ?? null, savedAt: Number(s[idx].savedAt ?? 0) || 0 };
          s[idx].state = getFullSnapshot();
          s[idx].savedAt = Date.now();
          const next = { state: s[idx].state, savedAt: s[idx].savedAt };
          if (!saveDraftSlots(s)) return;
          pushUndo({ type:"single", label:"Overwrite draft slot", diff:{ type:"draftSlotState", idx, prev, next } });
          renderDraftSlots();
          toast(filled ? "Draft slot overwritten" : "Saved to draft slot");
        });
    
        const btnLoad = document.createElement("button");
        btnLoad.type = "button";
        btnLoad.textContent = "Load";
        if (filled) btnLoad.className = "primary";
        btnLoad.disabled = !filled;
        btnLoad.title = filled
          ? "Replace the current workspace with this slot"
          : "Nothing saved in this slot yet";
        btnLoad.addEventListener("click", () => {
          const before = getFullSnapshot();
          const s = loadDraftSlots();
          const st = s[idx].state;
          if (!st) return;   // the button is disabled; belt and braces
          applyFullSnapshot(st);
          pushUndo({ type:"single", label:"Load draft slot", diff:{ type:"fullSnapshot", prev: before, next: getFullSnapshot() } });
          renderDraftSlots(); // refresh timestamps/metadata
          toast("Draft loaded", "undo");
        });
    
        const btnClear = document.createElement("button");
        btnClear.type = "button";
        btnClear.textContent = "Clear";
        btnClear.className = "danger";
        btnClear.disabled = !filled;
        btnClear.title = filled ? "Empty this slot" : "Nothing saved in this slot yet";
        btnClear.addEventListener("click", () => {
          const s = loadDraftSlots();
          const prev = { state: s[idx].state ?? null, savedAt: Number(s[idx].savedAt ?? 0) || 0 };
          s[idx].state = null;
          s[idx].savedAt = 0;
          const next = { state: null, savedAt: 0 };
          if (!saveDraftSlots(s)) return;
          if (prev.state !== next.state || prev.savedAt !== next.savedAt){
            pushUndo({ type:"single", label:"Clear draft slot", diff:{ type:"draftSlotState", idx, prev, next } });
          }
          renderDraftSlots();
          toast("Draft slot cleared", "undo");
        });
    
        /* A draft is a whole workspace, so the summary answers the three questions you
           ask before loading one over what you have: which competition it was set to,
           how much of it was added to the PDF, and when you took it. */
        const meta = document.createElement("div");
        meta.className = "slotMeta";

        if (!slot.state){
          meta.textContent = "Empty";
          meta.dataset.empty = "1";
        } else {
          const roster = Array.isArray(slot.state?.students) ? slot.state.students : [];
          const nStudents = roster.length;
          const nIncluded = roster.reduce((a, x) => a + (x?.included ? 1 : 0), 0);
          const bits = [
            competitionLabelForState(slot.state?.competition),
            `${nIncluded} of ${nStudents} added`,
          ];
          const when = formatSavedAt(slot.savedAt);
          if (when) bits.push(when);
          meta.textContent = bits.join(" \u00b7 ");
        }

        /* Name and the three buttons on one row, the summary on its own row under it.
           The buttons keep a fixed width and the name box takes what is left, so Save,
           Load and Clear land on the same three columns in every slot whatever the
           slot is called and whether or not it holds anything. */
        const top = document.createElement("div");
        top.className = "slotTop";
        const btns = document.createElement("div");
        btns.className = "slotBtns";
        btns.appendChild(btnSave);
        btns.appendChild(btnLoad);
        btns.appendChild(btnClear);
        top.appendChild(name);
        top.appendChild(btns);

        wrap.appendChild(top);
        wrap.appendChild(meta);
    
        host.appendChild(wrap);
      });
    }

    function rebuildRowIndex(){
      rowIndex.clear();
      for (let i = 0; i < students.length; i++){
        rowIndex.set(students[i].rowId, i);
      }
    }

    function resetCaches(){
      for (const d of [0,1,2,3,4,5,6]){
        byDivision.get(d).clear();
        divCounts.set(d, { total:0, included:0, invalidTotal:0, invalidIncluded:0,
          team:[0,0,0,0,0,0,0,0,0,0], over:[false,false,false,false,false,false,false,false,false,false], hasAnyTeam:false });
      }
      idToRowIds.clear();
      nameToRowIds.clear();
      nameExactToRowIds.clear();
      rowEl.clear();
      selected.clear();
      lastActiveRowId = null;
    }

    function addStudent({first="", last="", name="", id8="", included=false, team="X", topicTestKey=""}={}){
      const rowId = nextRowId++;
      const cleanId8 = clamp8Digits(id8);
      const div = divisionFromId8(cleanId8);

      // `name` is only accepted for data saved before the split.
      const legacy = (!first && !last && name) ? splitLegacyName(name) : null;

      const s = {
        rowId,
        first: String(legacy ? legacy.first : (first || "")),
        last: String(legacy ? legacy.last : (last || "")),
        id8: cleanId8,
        division: div,
        included: !!included,
        // a student who is not in the PDF has no team, however they arrived here
        team: included ? normalizeTeamValue(team) : "X",
        topicTestKey: String(topicTestKey || "")
      };

      students.push(s);
      rowIndex.set(rowId, students.length - 1);
      bumpCountsOnAdd(s);
      // a new student prints last until something moves them
      masterOrder.push(rowId);
      return s;
    }

    function clearStudents({recordUndo=true}={}){
      const before = getFullSnapshot();
      students = [];
      nextRowId = 1;
      masterOrder = [];
      sortState = { col: "", dir: "" };
      resetCaches();
      if (recordUndo){
        pushUndo({ type:"single", label:"Clear students", diff:{ type:"fullSnapshot", prev: before, next: getFullSnapshot() } });
      }
      renderAllRows();
      syncAllCountersAndSummaries();
      syncSticky();
    }

    function readEnrollment(options={}){
      const text=document.getElementById("enrollment").value || "";
      const parsed=parseEnrollmentText(text);
      const school=document.getElementById("school"), sid=document.getElementById("schoolId4");
      const prefix=parsed.schoolId || inferMostCommonFourDigitPrefixFromLines([],parsed.students.map(s=>s.id8));
      const differs=students.length && ((parsed.school && school.value && parsed.school!==school.value) || (prefix && sid.value && prefix!==sid.value));
      const review=document.getElementById("rosterSchoolReview");
      if(differs && !options.schoolChoice){
        review.hidden=false;
        review.innerHTML=`<strong>Review the school before adding students</strong><p>This roster names ${escAttr(parsed.school || "another school")} (${escAttr(prefix)}). Your current school is ${escAttr(school.value)} (${escAttr(sid.value)}). The School field prints on every sheet.</p><button type="button" data-action="importKeepSchool">Keep Current School</button> <button type="button" data-action="importUseSchool">Use Roster School</button>`;
        return;
      }
      review.hidden=true;
      const before=getFullSnapshot(); before.enrollmentText=text;
      const arrivalsFrom=masterOrder.length;
      const keys=new Set(students.map(s=>`${s.id8}|${lc(s.first)}|${lc(s.last)}`));
      let imported=0, existing=0;
      for(const st of parsed.students){
        const key=`${st.id8}|${lc(st.first)}|${lc(st.last)}`;
        if(keys.has(key)){existing++;continue;}
        keys.add(key);addStudent({...st,included:false,team:"X"});imported++;
      }
      if(options.schoolChoice!=="keep" && parsed.students.length){
        if(parsed.school) school.value=parsed.school;
        if(prefix){sid.value=prefix;sid.dataset.committed=prefix;}
        syncAddStudentSchool();
      }
      const arrivals=masterOrder.splice(arrivalsFrom);arrivals.sort(defaultOrderComparator);masterOrder.push(...arrivals);
      resortIfSorted();rebuildRowIndex();renderAllRows();syncAllCountersAndSummaries();syncSticky();refreshFixTeamsButtons();
      pushUndo({type:"single",label:"Load enrollment list",diff:{type:"fullSnapshot",prev:before,next:getFullSnapshot()}});
      const result=document.getElementById("rosterImportResult");
      result.innerHTML=`<p>${imported} students imported · ${existing} already listed · ${parsed.rejected.length} lines need attention. Choose who is added to the PDF next.</p>`;
      if(parsed.rejected.length) result.innerHTML+=`<details open><summary>Review skipped lines</summary><ul>${parsed.rejected.map(r=>`<li><strong>Line ${r.line}:</strong> ${escAttr(r.reason)}<br><code>${escAttr(r.text)}</code></li>`).join("")}</ul></details>`;
      syncUndoUI();
    }

    /** The lowest 3-digit student number this school is not already using. */
    function nextFreeStudentNumber(school4){
      const taken = new Set();
      for (const st of students){
        const id = String(st.id8 || "");
        if (id.length === 8 && id.slice(0, 4) === school4) taken.add(id.slice(4, 7));
      }
      for (let n = 1; n <= 999; n++){
        const key = String(n).padStart(3, "0");
        if (!taken.has(key)) return key;
      }
      return "";
    }
