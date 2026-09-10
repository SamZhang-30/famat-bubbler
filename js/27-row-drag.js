    /* ============================================================
       Dragging a row into place

       The drag starts on the grip, but what it carries is the row — and, if that
       row is one of several selected, all of them. Dragging one row out of a
       selection of twelve would almost always be a misclick rather than an
       intention, and moving the twelve is the thing that is tedious by any other
       means.
       ============================================================ */
    let dragRowIds = null;
    let dragOrderBefore = null;

    function clearDropMarks(){
      for (const el of studentsRoot.querySelectorAll(".dropBefore, .dropAfter")){
        el.classList.remove("dropBefore", "dropAfter");
      }
    }

    function endRowDrag(){
      if (dragRowIds){
        for (const rid of dragRowIds) rowEl.get(rid)?.classList.remove("isDragging");
      }
      dragRowIds = null;
      dragOrderBefore = null;
      delete document.documentElement.dataset.dragging;
      clearDropMarks();
    }

    studentsRoot.addEventListener("dragstart", (ev) => {
      const grip = ev.target?.closest?.("[data-grip]");
      if (!grip){
        // nothing else in the list is draggable, and a stray drag of a text
        // selection over the rows would otherwise light up the drop markers
        return;
      }
      const rowId = Number(grip.dataset.grip);
      const tr = rowEl.get(rowId);
      if (!tr) return;

      dragRowIds = (selected.has(rowId) && selected.size > 1)
        ? getPageOrder().filter(rid => selected.has(rid))
        : [rowId];
      dragOrderBefore = listOrderState();

      document.documentElement.dataset.dragging = "1";
      for (const rid of dragRowIds) rowEl.get(rid)?.classList.add("isDragging");
      try{
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", String(rowId));
        // drag the row, not the eight dots that were grabbed
        ev.dataTransfer.setDragImage(tr, 24, tr.offsetHeight / 2);
      }catch(e){}
    });

    studentsRoot.addEventListener("dragover", (ev) => {
      if (!dragRowIds) return;
      const tr = ev.target?.closest?.("tr[data-rowid]");
      ev.preventDefault();
      clearDropMarks();
      if (!tr) return;
      const rowId = Number(tr.dataset.rowid);
      if (dragRowIds.indexOf(rowId) >= 0) return;
      const r = tr.getBoundingClientRect();
      tr.classList.add(ev.clientY < r.top + r.height / 2 ? "dropBefore" : "dropAfter");
    });

    studentsRoot.addEventListener("drop", (ev) => {
      if (!dragRowIds) return;
      ev.preventDefault();
      const tr = ev.target?.closest?.("tr[data-rowid]");
      const moving = dragRowIds.slice();
      const before = dragOrderBefore;
      endRowDrag();
      if (!tr || !before) return;

      const targetRowId = Number(tr.dataset.rowid);
      const r = tr.getBoundingClientRect();
      const after = ev.clientY >= r.top + r.height / 2;
      if (!moveRowsInPageOrder(moving, targetRowId, after)) return;

      commitHandOrder(before, moving.length > 1 ? `Move ${moving.length} rows` : "Move a row");
    });

    studentsRoot.addEventListener("dragend", endRowDrag);

    document.addEventListener("click", (ev) => {
      const target = ev.target;
      if (!target) return;
      const actionEl = target.closest("[data-action]");
      const action = actionEl?.dataset?.action || "";
      if (action === "pickTeam"){
        pickTeam(actionEl.dataset.team);
        return;
      }
      if (action === "pickTopic"){
        pickTopic(actionEl.dataset.topicKey || "");
        return;
      }
      if (action === "pickDivision"){
        pickDivision(actionEl.dataset.rosterdiv);
        return;
      }
      if (divisionPopover.dataset.open === "1" && !target.closest("#divisionPopover") && !target.closest('[data-action="openDivision"]') && !target.closest('[data-action="openBatchDivision"]')){
        closeDivisionPopover();
      }
      if (teamPopover.style.display === "block" && !target.closest("#teamPopover") && !target.closest('[data-action="openTeam"]') && !target.closest('[data-action="openBatchTeam"]')){
        closeTeamPopover();
      }
      if (topicPopover.dataset.open === "1" && !target.closest("#topicPopover") && !target.closest('[data-action="openTopic"]') && !target.closest('[data-action="openBatchTopic"]')){
        closeTopicPopover();
      }
    });

    /**
     * A flagged ID box drives the shared help bubble. The problems used to ride in a
     * chip beside the digits, which made the column's width depend on how bad the row
     * was — and pushed the eighth digit out of sight on the worst ones. The box itself
     * now carries the state as a border, and says what is wrong on hover or focus.
     */
    function idBubbleFor(wrap){
      if (!wrap || !window.FBTips) return;
      const rowId = Number(wrap.dataset.rowid);
      const html = idHoverHtml(rowId);
      if (!html) return;
      const sev = wrap.dataset.sev;
      window.FBTips.show(wrap, html, sev === "fatal" ? "danger" : sev === "warn" ? "caution" : "guide", false);
    }
    studentsRoot.addEventListener("mouseover", (ev) => {
      const wrap = ev.target?.closest?.(".idFieldWrap[data-sev='fatal'], .idFieldWrap[data-sev='warn'], .idFieldWrap[data-remapped='1']");
      if (!wrap || !window.FBTips || window.FBTips.isPinned()) return;
      idBubbleFor(wrap);
    });
    studentsRoot.addEventListener("mouseout", (ev) => {
      const wrap = ev.target?.closest?.(".idFieldWrap");
      if (!wrap || !window.FBTips) return;
      if (ev.relatedTarget?.closest?.(".infoBubble")) return;
      if (wrap.contains(document.activeElement)) return;   // still being edited
      window.FBTips.hide(false);
    });
    // keyboard reach: tabbing into a flagged ID says what is wrong with it
    studentsRoot.addEventListener("focusin", (ev) => {
      const wrap = ev.target?.closest?.(".idFieldWrap[data-sev='fatal'], .idFieldWrap[data-sev='warn'], .idFieldWrap[data-remapped='1']");
      if (!wrap || window.FBTips?.isPinned()) return;
      idBubbleFor(wrap);
    });
    studentsRoot.addEventListener("focusout", (ev) => {
      if (!ev.target?.closest?.(".idFieldWrap")) return;
      if (window.FBTips?.isPinned()) return;
      window.FBTips?.hide(false);
    });

    /**
     * Open the whole ID on one row, and put the caret on the part that asked for it.
     * @param {number} rowId
     * @param {string} part  "school" | "num" | "div" | "" for the lot
     */
    function unlockIdRow(rowId, part){
      unlockedRows.add(rowId);
      rerenderRow(rowId);
      const input = rowEl.get(rowId)?.querySelector(`input[data-field="id"][data-rowid="${rowId}"]`);
      if (!input) return;
      input.focus();
      const len = input.value.length;
      const at = (a, b) => input.setSelectionRange(Math.min(a, len), Math.min(b, len));
      if (part === "school") at(0, 4);
      else if (part === "num") at(4, 7);
      else if (part === "div") at(Math.max(0, len - 1), len);
      else at(0, len);
    }

    /*
     * A single click lands the caret in the three digits you can type in, wherever in
     * the bar it fell — the outline that comes up is around the whole ID, so the click
     * should not have to be aimed. Double-clicking opens all eight, and selects the
     * part that was double-clicked, which is almost always the part being retyped.
     */
    studentsRoot.addEventListener("mousedown", (ev) => {
      const seg = ev.target?.closest?.(".idSeg");
      if (!seg) return;
      const wrap = seg.closest(".idFieldWrap");
      if (!wrap || wrap.dataset.locked !== "1") return;
      ev.preventDefault();   // a span cannot hold a caret; hand it to the field instead
      wrap.querySelector('input[data-field="idnum"]')?.focus();
    });

    studentsRoot.addEventListener("dblclick", (ev) => {
      const wrap = ev.target?.closest?.(".idFieldWrap");
      if (!wrap || wrap.dataset.locked !== "1") return;
      const part = ev.target.closest(".idSeg")?.dataset.idseg
        || (ev.target.closest(".idNum") ? "num" : "");
      unlockIdRow(Number(wrap.dataset.rowid), part);
    });

    /*
     * And the keyboard way in. The segments are deliberately not tab stops — two more
     * per row, on a list that can run to three hundred, for something almost nobody
     * does. Backspace on an already-empty student number is the gesture that means
     * "there is more of this I want to delete", so that is what opens it.
     */
    studentsRoot.addEventListener("keydown", (ev) => {
      if (ev.key !== "Backspace" && ev.key !== "Delete") return;
      const t = ev.target;
      if (!t || !t.matches?.('input[data-field="idnum"][data-rowid]')) return;
      if (t.value !== "") return;

      ev.preventDefault();
      const rowId = Number(t.dataset.rowid);
      // the field is empty, so put the ID it was emptied out of back before opening it
      const prev = String(t.dataset.last || "");
      if (prev) setIdRaw(rowId, prev, {recordUndo:false, rerender:false});
      unlockIdRow(rowId, "num");
    });

    // role="button" has to behave like one
    studentsRoot.addEventListener("keydown", (ev) => {
      const btn = ev.target?.closest?.(".includeBtn");
      if (!btn) return;
      if (ev.key !== "Enter" && ev.key !== " ") return;
      ev.preventDefault();
      // same follow-up work the click path does
      toggleInclude(Number(btn.dataset.rowid), {recordUndo:true, label:"Add or remove student"});
      syncAllCountersAndSummaries();
      syncSticky();
      refreshFixTeamsButtons();
      const again = rowEl.get(Number(btn.dataset.rowid))?.querySelector(".includeBtn");
      if (again) again.focus();
    });

    studentsRoot.addEventListener("input", (ev) => {
      const target = ev.target;
      if (!target) return;

      if (target.matches("input[data-field][data-rowid]")){
        const rowId = Number(target.dataset.rowid);
        const field = target.dataset.field;

        if (field === "first" || field === "last"){
          const s = getStudent(rowId);
          if (!s) return;
          nameIndexDel(rowId, s);
          s[field] = String(target.value || "");
          nameIndexAdd(rowId, s);
          updateNameFlags(rowId);
          updateIdBadge(rowId);
          syncAllCountersAndSummaries();
          syncSticky();
          return;
        }

        if (field === "id" || field === "idnum"){
          const cap = (field === "id") ? 8 : 3;
          const raw = String(target.value || "").replace(/\D/g, "").slice(0, cap);
          if (target.value !== raw) target.value = raw;
          // The three-digit field edits the middle of an ID, so it is put back together
          // around the segments its row was rendered with. A number still short of three
          // digits leaves the division off rather than sliding it into the wrong slot —
          // the ID reads as incomplete until blur pads it, which is what it is.
          const next = (field === "id")
            ? raw
            : (String(target.dataset.school || "") + raw.padEnd(3, "#") + String(target.dataset.div || ""));
          setIdRaw(rowId, next, {recordUndo:false, deferDivisionCommit:true, rerender:false});
          updateIdBadge(rowId);
          syncDuplicateUI();
          syncOverflowUI();
          syncAllCountersAndSummaries();
          syncSticky();
          refreshFixTeamsButtons();
          return;
        }
      }
    });

    studentsRoot.addEventListener("focusout", (ev) => {
      const target = ev.target;
      if (!target) return;
      // the row was held on screen while it was being edited; it can settle now
      if (target.matches("input[data-field][data-rowid]")) setTimeout(applyListVisibility, 0);

      // on blur, commit undo step for name/id edits using current DOM value vs stored.
      if (target.matches("input[data-field][data-rowid]")){
        const rowId = Number(target.dataset.rowid);
        const field = target.dataset.field;
        const s = getStudent(rowId);
        if (!s) return;

        if (field === "first" || field === "last"){
          const prev = s[field];
          const next = String(target.value || "");
          // If setName already synced to next during input, prev==next now. We need to reconstruct prev from last undo?
          // Simple approach: only create undo on blur by comparing to last saved value stored in dataset.
          // We'll store lastCommitted value on the input element.
          const last = target.dataset.last || prev;
          if (last !== next){
            // update name index already reflects next; create undo diff using last
            pushUndo({ type:"single", label:"Edit name", diff:{ type:"editName", rowId, field, prev:last, next } });
            target.dataset.last = next;
          } else {
            target.dataset.last = next;
          }
          syncUndoUI();
          return;
        }

        if (field === "id" || field === "idnum"){
          // A field the row rebuilt out from under is not a user leaving one; its blur
          // would commit a value that has already been superseded.
          if (!target.isConnected) return;
          const cap = (field === "id") ? 8 : 3;
          const nextRaw = String(target.value || "").replace(/\D/g, "").slice(0, cap);
          if (target.value !== nextRaw) target.value = nextRaw;

          let commit;
          if (field === "id"){
            commit = nextRaw;
          } else {
            const school = String(target.dataset.school || "");
            const div = String(target.dataset.div || "");
            // A student number is three digits. One or two are read as the leading zeros
            // being left off, the way nextFreeStudentNumber writes them; none at all is
            // not an edit, and puts the row back rather than dropping its Roster Level.
            commit = school + nextRaw.padEnd(3, "#") + div;
          }

          setIdRaw(rowId, commit, {recordUndo:false, deferDivisionCommit:false, rerender:true});
          normalizeIdOnBlur(rowId);
          // A whole ID that is usable again goes back to three-digit editing.
          if (field === "id" && String(s.id8 || "").length === 8 && unlockedRows.has(rowId)){
            unlockedRows.delete(rowId);
            rerenderRow(rowId);
          }
          const next = s.id8;
          const last = target.dataset.last || next;
          const lastDiv = Number(target.dataset.lastdiv || String(s.division));
          if (last !== next || lastDiv !== s.division){
            pushUndo({
              type:"single",
              label:"Edit ID",
              diff:{
                type:"editId",
                rowId,
                prevId8:last,
                nextId8:next,
                prevDiv:lastDiv,
                nextDiv:s.division
              }
            });
            target.dataset.last = next;
            target.dataset.lastdiv = String(s.division);
          } else {
            target.dataset.last = next;
            target.dataset.lastdiv = String(s.division);
          }
          // the commit above may have moved the student to another division
          syncAllCountersAndSummaries();
          syncSticky();
          refreshFixTeamsButtons();
          syncUndoUI();
          return;
        }
      }
    });

    studentsRoot.addEventListener("focusin", (ev) => {
      const target = ev.target;
      if (!target || !target.matches("input[data-field][data-rowid]")) return;
      const rowId = Number(target.dataset.rowid);
      const field = String(target.dataset.field || "");
      if (field === "first" || field === "last"){
        const s = getStudent(rowId);
        if (s) target.dataset.last = s[field];
      } else if (field === "id" || field === "idnum"){
        const s = getStudent(rowId);
        if (s){
          target.dataset.last = s.id8;
          target.dataset.lastdiv = String(s.division);
          if (field === "idnum"){
            // re-read rather than trust the render: a competition switch or an undo may
            // have rewritten the ID since this row was drawn
            target.dataset.school = String(s.id8 || "").slice(0, 4);
            target.dataset.div = String(s.id8 || "").charAt(7);
          }
        }
      }
    });

    /** Human names for the fields the undo stack can carry, so a tooltip never
        has to say "Edit schoolId4". A field missing from this map is not tracked. */
    const UNDO_FIELD_NAMES = {
      school: "school name",
      schoolId4: "School ID",
      filename: "file name",
      enrollment: "enrollment list",
      filter: "filter list",
      delimiter: "delimiter",
      divisionLabel1: "test name", divisionLabel2: "test name", divisionLabel3: "test name",
      divisionLabel4: "test name", divisionLabel5: "test name", divisionLabel6: "test name",
      divisionTestId1: "Test ID", divisionTestId2: "Test ID", divisionTestId3: "Test ID",
      divisionTestId4: "Test ID", divisionTestId5: "Test ID", divisionTestId6: "Test ID",
    };

    /* A Test box switches between its ghost and its own text as you type, so the
       styling that tells them apart has to keep up. */
    document.addEventListener("input", (ev) => {
      const t = ev.target;
      if (t && t.id && /^divisionLabel[1-6]$/.test(t.id)) syncTestNamePlaceholders();
      /* Digits only, and only three of them. Done here rather than left to the
         blocker: a letter typed into a numeric box is a slip, not a decision, and
         there is nothing to explain about dropping it. Length is different — one
         digit is a half-finished thought, so that one is left on screen and stopped
         at the PDF instead. */
      if (t && (t.dataset?.divtestid || t.classList?.contains("topicCodeInput"))){
        const clean = String(t.value || "").replace(/\D/g, "").slice(0, 3);
        if (clean !== t.value){
          const at = t.selectionStart;
          t.value = clean;
          try{ t.setSelectionRange(Math.min(at, clean.length), Math.min(at, clean.length)); }catch(e){}
        }
        syncDivisionTestIdState();
        syncSticky();
      }
    });

    /* ---- rejecting a character as it is typed ----------------------------------
       Capture phase, so the value is already clean by the time the field's own
       input handler reads it — the row list, the topic grid and the school box all
       store what they see there, and none of them should ever see the bad one. */

    /** Everything typed by hand that ends up drawn on a sheet. */
    const PRINTED_FIELD_SELECTOR = [
      'input[data-field="first"][data-rowid]',
      'input[data-field="last"][data-rowid]',
      "#school",
      "#nativeAddFirst",
      "#nativeAddLast",
      "#divisionLabel1", "#divisionLabel2", "#divisionLabel3",
      "#divisionLabel4", "#divisionLabel5", "#divisionLabel6",
      ".topicInput",
      ".topicPrefixInput",
      /* A custom division's name is printed text now, twice over: it is the Test field
         a student with no topic test gets, and it is the prefix on every topic test
         filed under that division. It used to be a label the app showed itself, so it
         never went through the field filter and a character the font cannot draw could
         reach the sheet from here. */
      ".customDivName",
    ].join(",");

    let rejectHintTimer = null;
    let rejectHintField = null;

    /**
     * Say what just happened. A character vanishing from under the caret with no
     * explanation reads as a broken keyboard, so the field borrows the shared bubble
     * for a moment and names the characters it would not take.
     */
    function flashFieldRejected(el, chars){
      // Only one field is ever flashing. Moving to another clears the first now
      // rather than on a timer that is about to be replaced.
      clearTimeout(rejectHintTimer);
      if (rejectHintField && rejectHintField !== el) rejectHintField.classList.remove("isRejecting");

      el.classList.remove("isRejecting");
      // reading offsetWidth restarts the animation, so a second rejection is visible
      void el.offsetWidth;
      el.classList.add("isRejecting");
      rejectHintField = el;

      const what = chars.length ? `${quoteChars(chars)} cannot go in this field. ` : "";
      window.FBTips?.show(el, `${what}${FIELD_CHARSET_NOTE}`, "caution", false);

      rejectHintTimer = setTimeout(() => {
        el.classList.remove("isRejecting");
        if (rejectHintField === el) rejectHintField = null;
        if (window.FBTips?.ownedBy(el)) window.FBTips.hide(true);
      }, 2600);
    }

    document.addEventListener("input", (ev) => {
      const el = ev.target;
      if (!el || typeof el.matches !== "function") return;
      if (!el.matches(PRINTED_FIELD_SELECTOR)) return;

      const before = String(el.value ?? "");
      const after = sanitizeFieldText(before);
      if (after === before) return;

      // Put the caret back where it was, less whatever was dropped in front of it —
      // otherwise pasting a name with one accent in it sends the caret to the end.
      const at = (typeof el.selectionStart === "number") ? el.selectionStart : before.length;
      const head = before.slice(0, at);
      const dropped = head.length - sanitizeFieldText(head).length;

      el.value = after;
      const to = Math.max(0, at - dropped);
      try{ el.setSelectionRange(to, to); }catch{ /* a field with no caret to move */ }

      // Only a character that was thrown away is worth flagging. A curly apostrophe
      // becoming a straight one is the field doing what the typist meant, silently —
      // an iPhone rewrites punctuation on nearly every word, and a red flash each
      // time would be crying wolf over nothing that was lost.
      const refused = illegalFieldChars(before);
      if (refused.length) flashFieldRejected(el, refused);
    }, true);

    function isUndoTrackedField(el){
      if (!el) return false;
      if (el.matches("#studentsRoot input[data-field]")) return false;
      if (el.matches(".slotName")) return false;
      if (el.matches(".topicInput, .topicCodeInput")) return false;
      if (!el.id) return false;
      // The search box filters the view and the Add Student form is scratch space —
      // neither is part of the workspace, so undo must not walk back through them.
      return Object.prototype.hasOwnProperty.call(UNDO_FIELD_NAMES, el.id) && el.id !== "schoolId4";
    }

    document.addEventListener("focusin", (ev) => {
      const el = ev.target;
      if (!isUndoTrackedField(el)) return;
      fieldEditSession.set(el.id, String(el.value ?? ""));
    });

    /** The 4 digits under PDF Setup → School, or "" while nothing is set there. */
    function schoolIdSetting(){
      return String(document.getElementById("schoolId4")?.value || "").replace(/\D/g, "").slice(0, 4);
    }

    /*
     * The School ID box on the Add Student form.
     *
     * Every student at a school carries the same four digits, so the number belongs to
     * the school, not to the student being typed — which is why it lives as a setting
     * under PDF Setup → School. But a first student added into an empty workspace has
     * nowhere to have set it yet, and sending someone to another menu to type four digits
     * before the form will work is the kind of errand a form should run itself.
     *
     * So the box works both ways round. With the setting filled it mirrors it, read-only:
     * nothing can be hand-added under a prefix the rest of the roster is not using, and
     * the digits are still visible where the ID is being built. With the setting empty it
     * is an ordinary field, and adding that student registers what was typed as the
     * setting — after which it grays out like any other student would have found it.
     */
    function syncAddStudentSchool(){
      const box = document.getElementById("addSchoolId4");
      if (!box) return;
      const set = schoolIdSetting();
      if (set){
        box.value = set;
        box.readOnly = true;
        box.title = "Set under PDF Setup → School. Change it there.";
      } else {
        box.readOnly = false;
        box.title = "The first four digits of every FAMAT ID at your school. Adding this student saves it under PDF Setup → School.";
      }
    }

    function committedSchoolId(){
      const el=document.getElementById("schoolId4");
      return String(el?.dataset.committed || "").replace(/\D/g, "").slice(0,4);
    }
    function syncSchoolIdApply(){
      const el=document.getElementById("schoolId4"), button=document.querySelector('[data-action="applySchoolId"]');
      if(!el||!button)return;
      const value=String(el.value||"").replace(/\D/g, "").slice(0,4);
      if(el.value!==value)el.value=value;
      button.disabled=value.length!==4 || value===committedSchoolId();
      el.setAttribute("aria-invalid",String(value.length>0&&value.length!==4));
    }
    document.getElementById("schoolId4")?.addEventListener("input", () => { syncSchoolIdApply(); syncSticky(); });
    function applySchoolIdChange(){
      const el=document.getElementById("schoolId4"), next=String(el?.value||"").replace(/\D/g, "").slice(0,4), old=committedSchoolId();
      if(!el||next.length!==4||next===old)return false;
      const before=getFullSnapshot();
      for(const s of students){
        if(String(s.id8||"").slice(0,4)!==old)continue;
        const nextId=next+String(s.id8).slice(4); s.id8=nextId; s.division=divisionFromId8(nextId);
      }
      el.dataset.committed=next;
      // The direct loop above used to leave the incremental ID index holding the
      // old full ID as well. Rebuild it before duplicate detection can inspect the
      // changed roster.
      idToRowIds.clear();
      for(const s of students) idIndexAdd(s.rowId,s.id8);
      rebuildRowIndex();renderAllRows();syncAllCountersAndSummaries();syncAddStudentSchool();syncSticky();refreshFixTeamsButtons();
      pushUndo({type:"single",label:"Apply School ID",diff:{type:"fullSnapshot",prev:before,next:getFullSnapshot()}});
      syncSchoolIdApply(); return true;
    }

    document.addEventListener("focusout", (ev) => {
      const el = ev.target;
      if (!isUndoTrackedField(el)) return;
      const before = fieldEditSession.get(el.id);
      const after = String(el.value ?? "");
      fieldEditSession.delete(el.id);
      if (before == null || before === after) return;
      pushUndo({ type:"single", label:`Edit ${UNDO_FIELD_NAMES[el.id] || "field"}`, diff:{ type:"fieldEdit", fieldId: el.id, prev: before, next: after } });
    });

    // Popover clicks
    teamPopover.addEventListener("click", (ev) => {
      const t = ev.target;
      const btn = t && t.closest("button[data-action='pickTeam']");
      if (!btn) return;
      pickTeam(btn.dataset.team);
    });

    // Click outside closes popover
    document.addEventListener("mousedown", (ev) => {
      if (teamPopover.style.display !== "block") return;
      const t = ev.target;
      if (!t) return;
      if (teamPopover.contains(t)) return;
      // allow clicking on a team button that opened it
      if (t.closest && t.closest("[data-action='openTeam']")) return;
      if (t.closest && t.closest("[data-action='openBatchTeam']")) return;
      closeTeamPopover();
    });

    /**
     * A locked menu must not open, and must say why rather than just refusing. The
     * summary keeps its keyboard focus so the explanation is reachable without a
     * mouse; only the toggle is taken away.
     */
    const TOPIC_LOCK_NOTE = '<strong>Topic tests run only at the conventions.</strong>'
      + '<br>Pick <em>FAMAT State Convention</em> or <em>MA\u0398 National Convention</em> under Competition '
      + 'to name them and assign them. Regular-season meets have one test per division, so there is nothing to choose here.';

    (function lockTopicMenu(){
      const menu = document.getElementById("menuTopics");
      if (!menu) return;
      const sum = menu.querySelector("summary");
      if (!sum) return;
      const locked = () => menu.dataset.locked === "1";
      sum.addEventListener("click", (ev) => {
        if (!locked()) return;
        ev.preventDefault();
        window.FBTips?.show(sum, TOPIC_LOCK_NOTE, "guide", true);
      });
      sum.addEventListener("keydown", (ev) => {
        if (!locked()) return;
        if (ev.key === "Enter" || ev.key === " "){
          ev.preventDefault();
          window.FBTips?.show(sum, TOPIC_LOCK_NOTE, "guide", true);
        }
      });
      sum.addEventListener("mouseenter", () => {
        if (locked() && !window.FBTips?.isPinned()) window.FBTips?.show(sum, TOPIC_LOCK_NOTE, "guide", false);
      });
      sum.addEventListener("mouseleave", () => {
        if (locked() && window.FBTips?.ownedBy(sum)) window.FBTips?.hide();
      });
    })();
