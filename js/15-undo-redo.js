    // ====== Undo/redo ======
    function pushUndo(action){
      undoStack.push(action);
      if (undoStack.length > MAX_UNDO) undoStack.shift();
      redoStack.length = 0;
      persistUndoState();
      scheduleSaveCurrent();
      syncUndoUI();
    }

    /**
     * Remove one student.
     *
     * `collect` hands the diff to a caller assembling a bigger step instead of
     * pushing it as its own, and `defer` leaves the redraw to that caller — deleting
     * a selection of forty students should be one undo and one render, not forty of
     * each. The recorded index is the array position at the moment of this removal,
     * which is what makes a batch reversible: undo replays the diffs backwards, so
     * each student is put back into the list exactly as it stood when they left it.
     */
    function removeStudentByRowId(rowId, { recordUndo = true, collect = null, defer = false } = {}){
      const idx = rowIndex.get(rowId);
      if (idx == null) return;
      const s = students[idx];
      const snapshot = {
        rowId: s.rowId,
        first: s.first,
        last: s.last,
        id8: s.id8,
        included: s.included,
        team: normalizeTeamValue(s.team),
        topicTestKey: String(s.topicTestKey || ""),
      };
      const orderIndex = masterOrder.indexOf(rowId);
      bumpCountsOnRemove(s);
      students.splice(idx, 1);
      rebuildRowIndex();
      selected.delete(rowId);
      masterOrder = masterOrder.filter(id => id !== rowId);
      const diff = { type: "removeStudent", index: idx, orderIndex, snapshot };
      if (collect) collect.push(diff);
      else if (recordUndo) pushUndo({ type: "single", label: "Remove student", diff });

      if (defer) return;
      renderAllRows();
      syncAllCountersAndSummaries();
      syncSticky();
      refreshFixTeamsButtons();
    }

    /** Delete a selection as one step, so one undo brings all of them back. */
    function batchDeleteStudents(rowIds){
      const diffs = [];
      for (const rid of rowIds){
        removeStudentByRowId(rid, { recordUndo: false, collect: diffs, defer: true });
      }
      if (!diffs.length) return 0;
      pushUndo({
        type: "batch",
        label: `Delete ${diffs.length} student${diffs.length === 1 ? "" : "s"}`,
        diffs,
      });
      renderAllRows();
      syncAllCountersAndSummaries();
      syncSticky();
      refreshFixTeamsButtons();
      return diffs.length;
    }

    function setFieldValueById(fieldId, value){
      const el = document.getElementById(fieldId);
      if (!el) return;
      el.value = String(value ?? "");
      if (fieldId.startsWith("divisionLabel")){
        syncTestNamePlaceholders();
        renderAllRows();
      }
      if (fieldId.startsWith("divisionTestId")){
        syncDivisionTestIdState();
      }
      // Walking the School ID back moves every ID badge, the duplicate flags and the
      // Add Student box with it — none of which is listening for a value set in code.
      if (fieldId === "schoolId4"){
        for (const s of students) updateIdBadge(s.rowId);
        syncDuplicateUI();
        syncAddStudentSchool();
      }
      syncAllCountersAndSummaries();
      syncSticky();
    }

    /** Put one student back where they were, for both directions of the two row diffs. */
    function restoreStudentSnapshot(sn, index, orderIndex){
      const nm = (!sn.first && !sn.last) ? splitLegacyName(sn.name) : { first: sn.first, last: sn.last };
      const restored = {
        rowId: sn.rowId,
        first: String(nm.first ?? ""),
        last: String(nm.last ?? ""),
        id8: clamp8Digits(sn.id8),
        division: divisionFromId8(clamp8Digits(sn.id8)),
        included: !!sn.included,
        team: normalizeTeamValue(sn.team),
        topicTestKey: String(sn.topicTestKey ?? ""),
      };
      // A rowId is the only handle the page order, the selection and the DOM cache
      // have on a student, so nothing may ever be handed out twice. Undoing back
      // past a full snapshot can leave nextRowId pointing at a row this restore is
      // bringing back, which would give the next hand-added student the same id.
      if (restored.rowId >= nextRowId) nextRowId = restored.rowId + 1;

      const at = Math.min(Math.max(0, Number(index) || 0), students.length);
      students.splice(at, 0, restored);
      rebuildRowIndex();
      bumpCountsOnAdd(restored);
      // back into the page order at the slot they were printing from
      const orderAt = (Number(orderIndex) >= 0)
        ? Math.min(Number(orderIndex), masterOrder.length)
        : masterOrder.length;
      masterOrder.splice(orderAt, 0, restored.rowId);
      renderAllRows();
      syncAllCountersAndSummaries();
      syncSticky();
      refreshFixTeamsButtons();
    }

    function applyDiff(diff, direction){
      // direction: "undo" uses prev values; "redo" uses next values

      /* A change to the competition that cannot move a student between divisions —
         a rename, a color, the team cap, a division added but not yet fed — needs
         none of the snapshot machinery below. It carries the two competition objects
         and nothing else, which is what makes renaming a division in the editor
         instant rather than a full rebuild of every row. */
      if (diff.type === "competition"){
        const want = (direction === "undo") ? diff.prev : diff.next;
        competitionState = JSON.parse(JSON.stringify(want));
        saveCompetition();
        applyCompetitionToUI();
        return;
      }

      /* Division colors. They live in preferences rather than in the workspace, which
         is why they were the one visible change undo could not reach: press the wrong
         swatch and the only way back was to remember the old hex. They are still
         preferences — they follow the competition, not the roster, and they are not in
         a draft — but "not workspace state" was never a reason for a visible change to
         be irreversible. The step carries the palette it belongs to, so it lands on the
         right competition's colors however the stack is replayed. */
      if (diff.type === "divColors"){
        const want = (direction === "undo") ? diff.prev : diff.next;
        window.FBPrefs?.restorePalette?.(diff.palette, want);
        syncRevertColorsButtons();
        return;
      }

      if (diff.type === "removeStudent"){
        if (direction === "undo") restoreStudentSnapshot(diff.snapshot, diff.index, diff.orderIndex);
        else removeStudentByRowId(diff.snapshot.rowId, { recordUndo: false });
        return;
      }

      // the same pair, the other way round: adding one student by hand
      if (diff.type === "addStudent"){
        if (direction === "undo") removeStudentByRowId(diff.snapshot.rowId, { recordUndo: false });
        else restoreStudentSnapshot(diff.snapshot, diff.index, diff.orderIndex);
        return;
      }

      if (diff.type === "fullSnapshot"){
        const snap = (direction === "undo") ? diff.prev : diff.next;
        applyFullSnapshot(snap);
        return;
      }

      /* A competition edit that moves nobody between divisions — a rename, a bubbled
         digit, a division added with nothing in it. The whole workspace would work
         and is what this used to do, but it serializes and rebuilds every student to
         undo a typed word, which is why the editor felt slow. This carries the
         competition alone.

         The two dialogs are repainted because they may well be open: undoing a rename
         while looking at the field it was typed in has to put the old text back into
         that field, or the state and the screen disagree. */
      if (diff.type === "competition"){
        const from = (direction === "undo") ? diff.prev : diff.next;
        if (from && typeof from === "object"){
          competitionState = JSON.parse(JSON.stringify(from));
          saveCompetition();
          applyCompetitionToUI();
        }
        return;
      }

      // Sorting and dragging change the page order and nothing else, so they carry
      // the order alone. A whole-workspace snapshot would work, but it rebuilds every
      // student and drops the selection on the way — a steep price for undoing a click
      // on a heading.
      if (diff.type === "listOrder"){
        const from = (direction === "undo") ? diff.prev : diff.next;
        masterOrder = Array.isArray(from?.order) ? from.order.map(Number) : masterOrder;
        sortState = {
          col: (SORTABLE_COLUMNS.indexOf(from?.col) >= 0) ? String(from.col) : "",
          dir: (from?.dir === "up" || from?.dir === "down") ? String(from.dir) : "",
        };
        normalizeMasterOrder();
        renderAllRows();
        syncSortHeaders();
        syncAllCountersAndSummaries();
        syncSticky();
        return;
      }

      if (diff.type === "fieldEdit"){
        const from = (direction === "undo") ? diff.prev : diff.next;
        setFieldValueById(String(diff.fieldId || ""), from);
        return;
      }

      if (diff.type === "topicSettingsReset"){
        const cfg = (direction === "undo") ? diff.prevCfg : diff.nextCfg;
        const keys = (direction === "undo") ? diff.prevKeys : diff.nextKeys;
        setTopicTestConfig(cfg);
        const byId = new Map(Array.isArray(keys) ? keys.map(x => [x.rowId, String(x.topicTestKey || "")]) : []);
        for (const st of students){
          st.topicTestKey = byId.get(st.rowId) ?? "";
        }
        renderAllRows();
        return;
      }

      if (diff.type === "slotText"){
        const from = (direction === "undo") ? diff.prev : diff.next;
        const slots = loadSlots();
        const idx = Number(diff.idx);
        if (!Number.isFinite(idx) || !slots[idx]) return;
        slots[idx].text = String(from ?? "");
        saveSlots(slots);
        renderSlots();
        return;
      }

      if (diff.type === "slotName"){
        const from = (direction === "undo") ? diff.prev : diff.next;
        const slots = loadSlots();
        const idx = Number(diff.idx);
        if (!Number.isFinite(idx) || !slots[idx]) return;
        slots[idx].name = String(from ?? "");
        saveSlots(slots);
        renderSlots();
        return;
      }

      if (diff.type === "draftSlotState"){
        const from = (direction === "undo") ? diff.prev : diff.next;
        const slots = loadDraftSlots();
        const idx = Number(diff.idx);
        if (!Number.isFinite(idx) || !slots[idx]) return;
        slots[idx].state = from?.state ?? null;
        slots[idx].savedAt = Number(from?.savedAt ?? 0) || 0;
        saveDraftSlots(slots);
        renderDraftSlots();
        return;
      }

      if (diff.type === "draftSlotName"){
        const from = (direction === "undo") ? diff.prev : diff.next;
        const slots = loadDraftSlots();
        const idx = Number(diff.idx);
        if (!Number.isFinite(idx) || !slots[idx]) return;
        slots[idx].name = String(from ?? "");
        saveDraftSlots(slots);
        renderDraftSlots();
        return;
      }

      const rowId = diff.rowId;
      const s = getStudent(rowId);
      if (!s) return;

      if (diff.type === "editName"){
        const to = (direction === "undo") ? diff.prev : diff.next;
        const field = (diff.field === "last") ? "last" : "first";

        nameIndexDel(rowId, s);
        s[field] = to;
        nameIndexAdd(rowId, s);
        rerenderRow(rowId);
        return;
      }

      if (diff.type === "editId"){
        const fromId8 = (direction === "undo") ? diff.prevId8 : diff.nextId8;
        const fromDiv = (direction === "undo") ? diff.prevDiv : diff.nextDiv;

        idIndexDel(rowId, s.id8);
        const prevDiv = s.division;

        s.id8 = fromId8;
        s.division = fromDiv;
        idIndexAdd(rowId, s.id8);

        bumpCountsOnMoveDivision(s, prevDiv, s.division);

        // update row visuals without rebuilding everything
        rerenderRow(rowId);
        return;
      }

      if (diff.type === "toggleInclude"){
        const from = (direction === "undo") ? diff.prev : diff.next;
        const prev = s.included;
        s.included = from;
        bumpCountsOnIncludeChange(s, prev, s.included);
        rerenderRow(rowId);
        return;
      }

      if (diff.type === "setTeam"){
        const from = (direction === "undo") ? diff.prev : diff.next;
        const prev = s.team;
        s.team = from;
        bumpCountsOnTeamChange(s, prev, s.team);
        rerenderRow(rowId);
        return;
      }

      if (diff.type === "setTopicTest"){
        const from = (direction === "undo") ? diff.prev : diff.next;
        s.topicTestKey = String(from || "");
        rerenderRow(rowId);
        return;
      }

    }
