    // ====== Event delegation ======
    const studentsRoot = document.getElementById("studentsRoot");

    studentsRoot.addEventListener("click", (ev) => {
      const target = ev.target;
      if (!target) return;

      const actionEl = target.closest("[data-action]");
      if (!actionEl) return;

      const action = actionEl.dataset.action;

      if (action === "sortCol"){
        sortByColumn(String(actionEl.dataset.sort || ""));
        return;
      }

      if (action === "toggleDivRoll"){
        toggleDivRoll(Number(actionEl.dataset.div));
        return;
      }
      if (action === "expandAllRolls" || action === "collapseAllRolls"){
        setAllRollsOpen(action === "expandAllRolls");
        return;
      }

      if (action === "toggleInclude"){
        const rowId = Number(actionEl.dataset.rowid);
        toggleInclude(rowId, {recordUndo:true, label:"Add or remove student"});
        syncAllCountersAndSummaries();
        syncSticky();
        refreshFixTeamsButtons();
        return;
      }

      if (action === "openTeam"){
        const rowId = Number(actionEl.dataset.rowid);
        // showing the 0 it will bubble, or the dash of a student who is not printing
        if (!teamIsEditable(getStudent(rowId))) return;
        openTeamPopoverNear(actionEl, {type:"row", rowId});
        return;
      }
      if (action === "openTopic"){
        const rowId = Number(actionEl.dataset.rowid);
        const s = getStudent(rowId);
        if (!s || !topicPickEnabled(s)) return;
        openTopicPopoverNear(actionEl, {type:"row", rowId, division: s.division});
        return;
      }

      if (action === "openDivision"){
        const rowId = Number(actionEl.dataset.rowid);
        if (!canChangeLevel(getStudent(rowId)?.id8)) return;
        openDivisionPopoverNear(actionEl, {type:"row", rowId});
        return;
      }
      if (action === "duplicateRow"){
        duplicateStudent(Number(actionEl.dataset.rowid));
        return;
      }
      if (action === "deleteRow"){
        removeStudentByRowId(Number(actionEl.dataset.rowid), { recordUndo: true });
        return;
      }

      if (action === "select"){
        const rowId = Number(actionEl.dataset.rowid);
        // a plain click adds to the selection; shift fills in the range behind it
        toggleSelection(rowId, {shiftKey:ev.shiftKey});
        return;
      }

      if (action === "fixTeams"){
        fixTeamsForDivision(Number(actionEl.dataset.div));
        afterTeamFill();
        return;
      }

    });

    /** A heading is a button, so the keyboard drives it like one. */
    studentsRoot.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const th = ev.target?.closest?.("th.sortTh");
      if (!th) return;
      ev.preventDefault();
      sortByColumn(String(th.dataset.sort || ""));
    });

