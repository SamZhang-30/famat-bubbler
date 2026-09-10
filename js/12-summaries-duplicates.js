    // ====== Summaries and counters (from students[] only) ======
    function renderDivisionSummary(div){
      const pre = document.getElementById(`divSummary${div}`);
      if (!pre) return;

      const rowIds = Array.from(byDivision.get(div));
      const included = rowIds.map(id=>getStudent(id)).filter(s=>s && s.included);

      // The catch-all panel has no teams to seat and no tests to sit, so a team
      // grid there is four lines that can never say anything.
      if (Number(div) === 0){
        // the badge beside the heading carries the counts; this says the one thing
        // it cannot
        pre.textContent = rowIds.length
          ? "No division, so no team and no test. Fix the ID, or remove them from the PDF."
          : "";
        pre.dataset.empty = rowIds.length ? "0" : "1";
        return;
      }
      if (!included.length){
        /* The badge beside this heading already reads "0/12 added", and the panel
           header above it reads "0 of 36 added". A third sentence restating that
           number in a monospace block was the same fact three times on one screen,
           so the empty case says the one thing the badges cannot: what will appear
           here once there is something to show. */
        pre.textContent = rowIds.length
          ? "Add students to the PDF and their teams and tests appear here."
          : "";
        pre.dataset.empty = "1";
        return;
      }
      pre.dataset.empty = "0";

      function lineTeam(label, arr, cap){
        const seats = teamSize();
        const left = (cap && Number.isFinite(seats))
          ? `${label} [${arr.length}/${seats}]`
          : `${label} [${arr.length}]`;
        const names = arr.length ? arr.map(fullName).join(", ") : "None";
        return `${left} - ${names}`;
      }

      let lines;
      if (!hasTeamSelection()){
        // nobody enters a team here, so the roll is the only useful line
        const roll = included.slice().sort(cmpAlpha);
        lines = [lineTeam("Entered", roll, false)];
      } else {
        // One bucket per team this competition runs, plus the unseated. Statewide
        // enters one team, so it gets one line rather than two empty ones.
        const nums = teamNumbers();
        const byTeam = new Map(nums.map(t => [t, []]));
        const tx = [];
        for (const s of included){
          const bucket = byTeam.get(teamBucket(s.team));
          if (bucket) bucket.push(s); else tx.push(s);
        }
        for (const arr of byTeam.values()) arr.sort(cmpAlpha);
        tx.sort(cmpAlpha);

        // Before Fill Teams runs, a line of "None" per team says the same thing
        // once each, so an untouched division gets the roll instead.
        const anySeated = nums.some(t => byTeam.get(t).length);
        lines = anySeated
          ? nums.map(t => lineTeam(`Team ${t}`, byTeam.get(t), true))
          : [lineTeam("No teams filled yet", tx, false)];
        /* Whoever is left over gets their own line — but only once seating has
           started, because the untouched case above is already a list of them.
           Keyed on that rather than on the number of lines, which was the same test
           until Statewide made a one-team division produce exactly one line. */
        if (anySeated && tx.length) lines.push(lineTeam("No Team", tx, false));
      }

      // With topic tests running, who sits what is the thing worth checking before
      // printing, so the collapsed panel answers it without opening the table.
      if (topicCfgForRender().enabled){
        const byTest = new Map();
        let none = 0;
        for (const s of included){
          const key = String(s.topicTestKey || "");
          if (!key){ none++; continue; }
          if (!byTest.has(key)) byTest.set(key, []);
          byTest.get(key).push(s);
        }
        if (byTest.size){
          lines.push("");
          for (const [key, arr] of Array.from(byTest.entries()).sort((a, b) => a[0].localeCompare(b[0]))){
            arr.sort(cmpAlpha);
            lines.push(`${topicSummaryLabel(key)} [${arr.length}] - ${arr.map(fullName).join(", ")}`);
          }
          if (none) lines.push(`No topic test [${none}]`);
        }
      }
      pre.textContent = lines.join("\n");
    }

    function setDivCountersText(div, dupSet = new Set()){
      const c = divCounts.get(div);
      const el = document.getElementById(`divCounters${div}`);
      if (!el || !c) return;

      const overBits = [];
      const cap = teamSize();
      if (hasTeamSelection()){
        for (const t of teamNumbers()){
          if (c.team[t] > cap) overBits.push(`T${t} OVER`);
        }
      }

      // Only added students can block the PDF, so only they count as errors here.
      let errors = 0;
      for (const rid of byDivision.get(div)){
        const s = getStudent(rid);
        if (!s || !s.included) continue;
        if (!completeId(s.id8) || s.division === 0 || dupSet.has(rid)) errors++;
      }
      const parts = [`${c.included}/${c.total} added`];
      if (errors) parts.push(`${errors} to fix`);
      if (overBits.length) parts.push("team over");

      const notes = [];
      if (errors) notes.push(`${errors} added ${errors === 1 ? "student has" : "students have"} an ID problem`);
      if (hasTeamSelection()){
        for (const t of teamNumbers()){
          if (c.team[t] > cap) notes.push(`Team ${t} has ${c.team[t]} of ${cap}`);
        }
      }

      el.innerHTML = PERSON_GLYPH + `<span>${escAttr(parts.join(" \u00b7 "))}</span>`;
      el.className = (overBits.length || errors) ? "badge badgeWarn" : "badge";
      el.title = notes.join(", ");
    }

    function syncAllCountersAndSummaries(){ withRowFrame(syncAllCountersAndSummariesInner); }

    function syncAllCountersAndSummariesInner(){
      const dupSet = new Set();
      for (const g of getDuplicateGroups({includedOnly:true})){
        for (const rid of g.rowIds) dupSet.add(rid);
      }
      for (const d of [1,2,3,4,5,6,0]){
        setDivCountersText(d, dupSet);
        if (listView === "summary") syncRollPanel(d);
      }
      syncTotalsBadges();
      syncListEmptyState();
      applyListVisibility();
      // the seated counts on the topic cards are a per-test tally of exactly what this
      // pass has just recounted, so they are refreshed here rather than by every caller
      syncTopicUsageCounts();
    }

    /**
     * With no students at all the seven division panels are just empty boxes, so the
     * list is replaced by a card that says what to do next. Individually empty
     * divisions are flagged for the hide-empty-divisions preference.
     */
    function syncListEmptyState(){
      const none = students.length === 0;
      const empty = document.getElementById("studentsEmpty");
      const root = document.getElementById("studentsRoot");
      const dead = document.getElementById("searchEmpty");
      if (empty) empty.hidden = !none;
      if (none && dead) dead.hidden = true;
      // a live search that matches nothing owns the list's visibility until it clears
      const searchDead = !!dead && !dead.hidden;
      if (root) root.style.display = none ? "none" : "";
      for (const d of [1,2,3,4,5,6,0]){
        const panel = document.querySelector(`[data-divpanel="${d}"]`);
        if (panel) panel.dataset.empty = byDivision.get(d).size ? "0" : "1";
      }
    }

    /** The "n of m added" badge that heads each view. */
    function syncTotalsBadges(){
      const total = students.length;
      const included = students.reduce((a, s) => a + (s.included ? 1 : 0), 0);
      const text = `${included} of ${total} added`;
      for (const id of ["tableCounts", "summaryCounts"]){
        const el = document.getElementById(id);
        if (el) el.innerHTML = PERSON_GLYPH + `<span>${included}/${total} added</span>`;
      }
    }

    // ====== Duplicate detection (incremental map already exists) ======
    function getDuplicateGroups({includedOnly}){
      const byKey = new Map();
      for (const [id8, set] of idToRowIds.entries()){
        if (!id8 || !completeId(id8)) continue;
        const key = id8.slice(4, 7);
        const ids = Array.from(set);
        const filtered = includedOnly ? ids.filter(rid => getStudent(rid)?.included) : ids;
        if (!filtered.length) continue;
        if (!byKey.has(key)) byKey.set(key, new Set());
        // A row can briefly be present under two full-ID keys while a staged ID
        // edit is being committed. Count row IDs, not index entries, so one student
        // can never duplicate itself.
        for (const rid of filtered) byKey.get(key).add(rid);
      }
      const groups = [];
      for (const [key, rowSet] of byKey.entries()){
        const rowIds = Array.from(rowSet);
        if (rowIds.length >= 2) groups.push({ key, rowIds });
      }
      groups.sort((a,b) => a.key.localeCompare(b.key));
      return groups;
    }

    function countIncludedDupIds(){
      return getDuplicateGroups({includedOnly:true}).length;
    }

    function syncDuplicateUI(){ withRowFrame(syncDuplicateUIInner); }

    function syncDuplicateUIInner(){
      // mark rows duplicated among included students
      const groupsInc = getDuplicateGroups({includedOnly:true});
      const dupRowIds = new Set();
      for (const g of groupsInc){
        for (const rid of g.rowIds) dupRowIds.add(rid);
      }
      const dupRowIdsAll = new Set();
      for (const g of getDuplicateGroups({includedOnly:false})){
        for (const rid of g.rowIds) dupRowIdsAll.add(rid);
      }

      dupRowIdSet = dupRowIds;
      dupRowIdSetAll = dupRowIdsAll;
      for (const s of students){
        const tr = rowEl.get(s.rowId);
        if (!tr) continue;
        tr.dataset.dup = dupRowIds.has(s.rowId) ? "1" : "0";
        updateIdBadge(s.rowId);
      }
      // ...and the red outline that says the PDF is stuck on this row, which reads
      // the duplicate sets this pass has just written
      syncBlockingRowUI();

      /* The "View Duplicates" button that used to stand here is gone: duplicates are
         one entry in the Errors pill now, and its "Take me to it" opens this same
         modal. One route rather than two controls saying the same thing. */
    }

    function openDupModal(){
      window.FBTips?.hide(true);
      const back = document.getElementById("dupModalBack");
      const list = document.getElementById("dupList");
      const countEl = document.getElementById("dupModalCount");
      if (!back || !list || !countEl) return;

      const groupsInc = getDuplicateGroups({includedOnly:true});
      countEl.textContent = `${groupsInc.length} ID${groupsInc.length === 1 ? "" : "s"} with duplicates`;

      list.innerHTML = "";
      for (const g of groupsInc){
        const item = document.createElement("div");
        item.className = "dupItem";

        const top = document.createElement("div");
        top.className = "row";
        top.style.justifyContent = "space-between";
        top.style.alignItems = "center";

        const left = document.createElement("div");
        left.className = "row";
        left.style.gap = "8px";
        const idBadge = document.createElement("span");
        idBadge.className = "badge badgeDanger";
        idBadge.textContent = `#${g.key}`;

        left.appendChild(idBadge);

        const btnEx = document.createElement("button");
        btnEx.type = "button";
        btnEx.className = "mini";
        btnEx.textContent = "Un-add All but First";
        btnEx.dataset.action = "excludeDupGroup";
        btnEx.dataset.key = g.key;

        top.appendChild(left);
        top.appendChild(btnEx);

        const names = document.createElement("div");
        names.className = "dupNames";
        const lines = g.rowIds
          .map(rid => {
            const s = getStudent(rid);
            const div = s ? divShort(s.division) : "";
            return `${s ? displayName(s) : "(missing)"} (${div})`;
          });
        names.textContent = lines.join(" | ");

        const jumps = document.createElement("div");
        jumps.className = "row";
        jumps.style.marginTop = "8px";
        jumps.style.gap = "8px";
        for (const rid of g.rowIds){
          const s = getStudent(rid);
          const b = document.createElement("button");
          b.type = "button";
          b.className = "mini";
          b.textContent = `Jump: ${s?.first || s?.last || rid}`;
          b.dataset.action = "jumpRow";
          b.dataset.rowid = String(rid);
          jumps.appendChild(b);
        }

        item.appendChild(top);
        item.appendChild(names);
        item.appendChild(jumps);

        list.appendChild(item);
      }

      back.style.display = "flex";
    }

    function closeDupModal(){
      const back = document.getElementById("dupModalBack");
      if (back) back.style.display = "none";
    }

    /**
     * Which added rows the PDF is actually stuck on, outlined in red.
     *
     * The fields at fault already mark themselves — a red ID box, a red name field —
     * but a field's outline is only findable once you are looking at the right row,
     * and on a 200-student roster you are not. The row outline is the coarse pass:
     * scroll the list and the blocked rows are the ones ringed. Both are drawn,
     * because between them they answer "which row" and "which box in it".
     *
     * Only added students, for the same reason only they block the PDF: a fault on a
     * row that is not printing is a warning, and warnings do not get the red ring.
     */
    function rowIsBlocking(student){
      if (!student || !student.included) return false;
      if (rowIssues(student).some(i => i.severity === "fatal")) return true;
      // the name fields keep their own faults, on purpose — see nameFieldIssue
      return !!nameFieldIssue(student, "first") || !!nameFieldIssue(student, "last");
    }

    function syncBlockingRowUI(){
      for (const s of students){
        const tr = rowEl.get(s.rowId);
        if (!tr) continue;
        tr.dataset.blocking = rowIsBlocking(s) ? "1" : "0";
      }
    }
