    /* ============================================================
       How the list is shown

       Two ways to look at the same students:

         table    every student, in page order, editable
         summary  a card per division, opening on its team and topic roll

       There used to be four. A table per division went when order became a
       property of the whole list; a Counts view went when it turned out to be
       Summary with every card shut, which the cards can say for themselves.

       The view is one value. viewMode and listView were two names for the same
       state back when the layout toggle and the collapse presets were separate
       controls, and keeping them in step was busywork.
       ============================================================ */

    const LIST_VIEW_KEY = "famatbubbler.listView.v1";
    const LIST_VIEWS = ["table", "summary"];

    /** @type {"table"|"summary"} */
    let listView = loadListView();

    function loadListView(){
      const saved = localStorage.getItem(LIST_VIEW_KEY);
      if (LIST_VIEWS.indexOf(saved) >= 0) return saved;
      // "counts" was Summary with everything shut, and the rest were the table
      return (saved === "counts") ? "summary" : "table";
    }

    function setListView(mode, {persist=true}={}){
      listView = (LIST_VIEWS.indexOf(mode) >= 0) ? mode : "table";
      if (persist){
        try{ window.FBStore.set(LIST_VIEW_KEY, listView); }catch(e){}
      }
      // CSS decides what that means: hidden in one view, and a flex column in the
      // other once the panel is anchored to the window.
      const root = document.getElementById("studentsRoot");
      if (root) root.dataset.view = listView;
      syncListViewSeg();
      renderAllRows();
      syncAllCountersAndSummaries();
      syncSticky();
    }

    /** Light up the view that is on screen. */
    function syncListViewSeg(){
      const seg = document.getElementById("viewSeg");
      if (!seg) return;
      for (const b of seg.querySelectorAll("button[data-listview]")){
        const on = (b.dataset.listview === listView);
        b.dataset.on = on ? "1" : "0";
        b.setAttribute("aria-pressed", on ? "true" : "false");
      }
    }

    /* ---- opening and closing one division's roll -------------------------------
       Reading a roll is worth a scroll; seven of them at once is not, so each card
       keeps its own state and remembers it. Shutting all seven is the view that
       used to be called Counts. */

    const DIV_ROLL_KEY = "famatbubbler.divRoll.v1";

    function loadRollMap(){
      try{
        const obj = JSON.parse(localStorage.getItem(DIV_ROLL_KEY) || "{}");
        return (obj && typeof obj === "object") ? obj : {};
      } catch { return {}; }
    }
    function isRollOpen(div){
      return loadRollMap()[String(div)] !== false;   // a card opens until told not to
    }
    function setRollOpen(div, open){
      const m = loadRollMap();
      m[String(div)] = !!open;
      try{ window.FBStore.set(DIV_ROLL_KEY, JSON.stringify(m)); }catch(e){}
      syncRollPanel(div);
    }
    function toggleDivRoll(div){
      setRollOpen(div, !isRollOpen(div));
    }
    function setAllRollsOpen(open){
      const m = loadRollMap();
      for (const d of [1,2,3,4,5,6,0]) m[String(d)] = !!open;
      try{ window.FBStore.set(DIV_ROLL_KEY, JSON.stringify(m)); }catch(e){}
      for (const d of [1,2,3,4,5,6,0]) syncRollPanel(d);
    }

    /** Paint one card to match its stored state, filling the roll if it is opening. */
    function syncRollPanel(div){
      const panel = document.querySelector(`[data-divpanel="${div}"]`);
      if (!panel) return;
      const open = isRollOpen(div);
      panel.dataset.rollopen = open ? "1" : "0";
      // a shut card's roll is never read, so it is only built when it opens
      if (open) renderDivisionSummary(div);
      const btn = panel.querySelector(`.divToggle[data-div="${div}"]`);
      if (btn){
        const name = panel.querySelector(".divTitle")?.textContent.trim() || ("division " + div);
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        btn.setAttribute("aria-label", (open ? "Close " : "Open ") + name);
        btn.title = (open ? "Close " : "Open ") + name;
      }
    }

    // ====== Cache maintenance ======
    function idxAdd(map, key, rowId){
      let s = map.get(key);
      if (!s){
        s = new Set();
        map.set(key, s);
      }
      s.add(rowId);
    }
    function idxDel(map, key, rowId){
      const s = map.get(key);
      if (!s) return;
      s.delete(rowId);
      if (s.size === 0) map.delete(key);
    }

    /** Key is order-independent, so a pasted "Smith, Jordan" and "Jordan Smith" both hit. */
    /** Key is order-independent, so a pasted "Smith, Jordan" and "Jordan Smith" both hit. */
    function namePairKey(first, last){
      return [lc(first), lc(last)].filter(Boolean).sort().join("|");
    }
    function nameExactKey(first, last){
      const f = lc(first), l = lc(last);
      return (f || l) ? `${f}|${l}` : "";
    }
    function nameIndexAdd(rowId, s){
      const key = namePairKey(s?.first, s?.last);
      if (key) idxAdd(nameToRowIds, key, rowId);
      const exact = nameExactKey(s?.first, s?.last);
      if (exact) idxAdd(nameExactToRowIds, exact, rowId);
    }
    function nameIndexDel(rowId, s){
      const key = namePairKey(s?.first, s?.last);
      if (key) idxDel(nameToRowIds, key, rowId);
      const exact = nameExactKey(s?.first, s?.last);
      if (exact) idxDel(nameExactToRowIds, exact, rowId);
    }

    function idIndexAdd(rowId, id8){
      const key = String(id8 || "");
      if (!key) return;
      idxAdd(idToRowIds, key, rowId);
    }
    function idIndexDel(rowId, id8){
      const key = String(id8 || "");
      if (!key) return;
      idxDel(idToRowIds, key, rowId);
    }

    function recalcDivOverflows(div){
      const c = divCounts.get(div);
      c.over = [false,false,false,false,false,false,false,false,false,false];
      const cap = teamSize();
      for (const t of teamNumbers()){
        if (c.team[t] > cap) c.over[t] = true;
      }
    }

    function bumpCountsOnAdd(student){
      // division sets
      byDivision.get(student.division).add(student.rowId);

      // totals
      const c = divCounts.get(student.division);
      c.total += 1;
      if (student.division === 0) c.invalidTotal += 1;

      if (student.included) c.included += 1;
      if (student.included && student.division === 0) c.invalidIncluded += 1;

      c.team[teamBucket(student.team)] += 1;
      if (student.team === 1 || student.team === 2 || student.team === 3) c.hasAnyTeam = true;

      recalcDivOverflows(student.division);

      // indexes
      nameIndexAdd(student.rowId, student);
      idIndexAdd(student.rowId, student.id8);
    }

    function recomputeHasAnyTeam(div){
      const c = divCounts.get(div);
      if (!c) return;
      let any = false;
      for (const rid of byDivision.get(div)){
        const s = getStudent(rid);
        if (s && (s.team === 1 || s.team === 2 || s.team === 3)){
          any = true;
          break;
        }
      }
      c.hasAnyTeam = any;
    }

    function bumpCountsOnRemove(student){
      byDivision.get(student.division).delete(student.rowId);

      const c = divCounts.get(student.division);
      c.total -= 1;
      if (student.division === 0) c.invalidTotal -= 1;

      if (student.included) c.included -= 1;
      if (student.included && student.division === 0) c.invalidIncluded -= 1;

      c.team[teamBucket(student.team)] -= 1;
      recalcDivOverflows(student.division);
      recomputeHasAnyTeam(student.division);

      nameIndexDel(student.rowId, student);
      idIndexDel(student.rowId, student.id8);
    }

    function bumpCountsOnMoveDivision(student, prevDiv, nextDiv){
      if (prevDiv === nextDiv) return;

      byDivision.get(prevDiv).delete(student.rowId);
      byDivision.get(nextDiv).add(student.rowId);

      const a = divCounts.get(prevDiv);
      const b = divCounts.get(nextDiv);

      a.total -= 1;
      b.total += 1;

      // invalidTotal is only division 0
      if (prevDiv === 0) a.invalidTotal -= 1;
      if (nextDiv === 0) b.invalidTotal += 1;

      if (student.included){
        a.included -= 1;
        b.included += 1;

        if (prevDiv === 0) a.invalidIncluded -= 1;
        if (nextDiv === 0) b.invalidIncluded += 1;
      }

      // team counts move as well
      a.team[teamBucket(student.team)] -= 1;
      b.team[teamBucket(student.team)] += 1;

      recalcDivOverflows(prevDiv);
      recalcDivOverflows(nextDiv);
    }

    function bumpCountsOnIncludeChange(student, prevIncluded, nextIncluded){
      if (prevIncluded === nextIncluded) return;
      const c = divCounts.get(student.division);
      if (nextIncluded) c.included += 1;
      else c.included -= 1;

      if (student.division === 0){
        if (nextIncluded) c.invalidIncluded += 1;
        else c.invalidIncluded -= 1;
      }
    }

    function bumpCountsOnTeamChange(student, prevTeam, nextTeam){
      if (prevTeam === nextTeam) return;
      const c = divCounts.get(student.division);
      c.team[teamBucket(prevTeam)] -= 1;
      c.team[teamBucket(nextTeam)] += 1;
      if (nextTeam === 1 || nextTeam === 2 || nextTeam === 3) c.hasAnyTeam = true;
      recalcDivOverflows(student.division);
    }

