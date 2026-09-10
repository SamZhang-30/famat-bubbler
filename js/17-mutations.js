    // ====== Mutations (with diffs) ======
    function setIdRaw(rowId, raw, {recordUndo=true, label="Edit ID", deferDivisionCommit=false, rerender=true}={}){
      const s = getStudent(rowId);
      if (!s) return;

      const nextId8 = clamp8Digits(raw);
      const nextDiv = divisionFromId8(nextId8);

      const prevId8 = s.id8;
      const prevDiv = s.division;

      if (prevId8 === nextId8 && prevDiv === nextDiv) return;

      idIndexDel(rowId, s.id8);
      s.id8 = nextId8;
      if (!deferDivisionCommit){
        s.division = nextDiv;
      }
      idIndexAdd(rowId, s.id8);

      if (!deferDivisionCommit){
        bumpCountsOnMoveDivision(s, prevDiv, nextDiv);
      }

      if (recordUndo){
        pushUndo({ type:"single", label, diff:{ type:"editId", rowId, prevId8, nextId8, prevDiv, nextDiv } });
      }

      // A new division does not move the row: where a student prints is the list's
      // own order, and rewriting an ID is no reason to reshuffle the stack.
      // Update row visuals and division badge
      if (rerender) rerenderRow(rowId);
    }

    /** Put whichever field the row ended up with back in step with the stored ID. */
    function normalizeIdOnBlur(rowId){
      const tr = rowEl.get(rowId);
      const s = getStudent(rowId);
      if (!tr || !s) return;
      const id8 = String(s.id8 || "");

      const full = tr.querySelector(`input[data-field="id"][data-rowid="${rowId}"]`);
      if (full){
        full.value = id8;
        return;
      }
      const num = tr.querySelector(`input[data-field="idnum"][data-rowid="${rowId}"]`);
      if (num){
        num.value = id8.slice(4, 7).replace(/#/g, "");
        num.dataset.school = id8.slice(0, 4);
        num.dataset.div = id8.charAt(7);
      }
    }

    /**
     * Taking a student out of the PDF empties their team, and the two travel as one
     * undo step so putting them back restores both. Nothing else remembers the old
     * number on purpose: a student who leaves and comes back is a student whose seat
     * has been given away, and quietly handing it back would seat five on a team of
     * four without anyone having clicked anything.
     * @returns {Array} the diffs this clearing produced, ready to join a step
     */
    function clearTeamOnRemoval(s){
      if (!s || s.included) return [];
      const prev = s.team;
      const next = "X";
      if (prev === next) return [];
      s.team = next;
      bumpCountsOnTeamChange(s, prev, next);
      return [{ type:"setTeam", rowId: s.rowId, prev, next }];
    }

    /**
     * The topic test goes the same way the team does when a student comes out of the
     * PDF, and for the same reason: both are decisions about a printed sheet, and a
     * student who is not printing has none. Left behind, the key would be a value the
     * row cannot show and the picker cannot reach, quietly reappearing if they were
     * ever added back.
     *
     * Returned as diffs rather than applied silently, so the clear rides on the same
     * undo step as the removal that caused it — one click, one Undo.
     */
    function clearTopicOnRemoval(s){
      if (!s || s.included) return [];
      const prev = String(s.topicTestKey || "");
      if (!prev) return [];
      s.topicTestKey = "";
      return [{ type:"setTopicTest", rowId: s.rowId, prev, next: "" }];
    }

    function toggleInclude(rowId, {recordUndo=true, label="Add or remove student"}={}){
      const s = getStudent(rowId);
      if (!s) return;
      const prev = s.included;
      const next = !prev;

      s.included = next;
      bumpCountsOnIncludeChange(s, prev, next);
      const teamDiffs = [...clearTeamOnRemoval(s), ...clearTopicOnRemoval(s)];

      if (recordUndo){
        const own = { type:"toggleInclude", rowId, prev, next };
        // one click, one undo — even when it moved two fields
        if (teamDiffs.length) pushUndo({ type:"batch", label, diffs: [own, ...teamDiffs] });
        else pushUndo({ type:"single", label, diff: own });
      }

      rerenderRow(rowId);
    }

    function setTeam(rowId, nextTeam, {recordUndo=true, label="Set team"}={}){
      const s = getStudent(rowId);
      if (!s) return;
      // the cell is locked either way; this is the guard behind the locked cell
      if (!teamIsEditable(s)) return;
      const teamVal = normalizeTeamValue(nextTeam);
      const prev = s.team;
      const next = teamVal;

      if (prev === next) return;

      s.team = next;
      bumpCountsOnTeamChange(s, prev, next);

      if (recordUndo){
        pushUndo({ type:"single", label, diff:{ type:"setTeam", rowId, prev, next } });
      }

      rerenderRow(rowId);
    }

    // ====== Batch operations ======
    function batchSetInclude(rowIds, included){
      const diffs = [];
      for (const rid of rowIds){
        const s = getStudent(rid);
        if (!s) continue;
        if (s.included === included) continue;
        const prev = s.included;
        s.included = included;
        bumpCountsOnIncludeChange(s, prev, included);
        diffs.push({ type:"toggleInclude", rowId: rid, prev, next: included });
        diffs.push(...clearTeamOnRemoval(s), ...clearTopicOnRemoval(s));
        rerenderRow(rid);
      }
      if (diffs.length){
        pushUndo({ type:"batch", label: included ? "Batch add" : "Batch remove", diffs });
      }
    }

    function batchSetTeam(rowIds, teamVal){
      const diffs = [];
      for (const rid of rowIds){
        const s = getStudent(rid);
        if (!s) continue;
        // a selection is rarely all added; the rows that are not simply sit this out
        if (!teamIsEditable(s)) continue;
        const prev = s.team;
        const next = normalizeTeamValue(teamVal);
        if (prev === next) continue;
        s.team = next;
        bumpCountsOnTeamChange(s, prev, next);
        diffs.push({ type:"setTeam", rowId: rid, prev, next });
        rerenderRow(rid);
      }
      if (diffs.length){
        pushUndo({ type:"batch", label: "Batch set team", diffs });
      }
    }

