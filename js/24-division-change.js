    /* ============================================================
       Changing a student's division

       There is no division field to edit: a roster division *is* the eighth digit
       of the FAMAT ID, and the six on offer are the six a roster can state. Picking
       one rewrites that digit, which is exactly what typing over it by hand does —
       so it travels the same setIdRaw path, lands in the same undo step, and a
       competition that remaps digits re-derives the sheet's from it as usual.
       ============================================================ */
    let divisionPopoverContext = null;   // {type:"row", rowId} or {type:"batch", rowIds}

    function openDivisionPopoverNear(el, context){
      divisionPopoverContext = context;

      const rowIds = (context.type === "row") ? [context.rowId] : context.rowIds;
      // one shared digit shows as the current pick; a mixed batch shows none
      const digits = new Set(rowIds.map(rid => {
        const id8 = String(getStudent(rid)?.id8 || "");
        return id8.length === 8 ? id8.charCodeAt(7) - 48 : 0;
      }));
      const current = (digits.size === 1) ? Array.from(digits)[0] : 0;

      const title = document.getElementById("divisionPopoverTitle");
      if (title){
        title.textContent = (context.type === "batch")
          ? `Change Level (${rowIds.length} selected)`
          : "Change Level";
      }

      const body = document.getElementById("divisionPopoverBody");
      if (body){
        /* The cell this edits shows the competition's name for the division
           ("Theta"); the option that produces it is a roster name ("Geometry").
           Naming only one of the two left the user to bridge the gap from a
           paragraph in another dialog, so each option names both wherever they
           differ — and where two roster divisions land on the same competition
           name, that is now visible in the list rather than surprising. */
        body.innerHTML = [1,2,3,4,5,6].map(d => {
          const roster = ROSTER_DIVISIONS[d];
          const lands = divName(groupForRosterDigit(d));
          const excluded = !activeDivisions().includes(groupForRosterDigit(d));
          /* The chip used to appear only where the competition renamed the division, so
             it showed up at the conventions and nowhere else. Its color is worth having
             at every competition, so there is always one now.

             Where the two names agree, which is every competition that renames nothing,
             the chip carries the roster name itself rather than sitting beside a plain
             copy of it. Where they differ the roster name stays plain and the chip shows
             what it lands on, so the row still reads "this one, which becomes that one".
             A division that does not compete gets the warning instead: there is no
             competition division to put on a chip. */
          const renamed = !!lands && lands !== roster;
          const head = (!excluded && !renamed)
            ? `<span class="pickName">${divPillHtml(groupForRosterDigit(d), roster)}</span>`
            : `<span class="pickName">${escAttr(roster)}</span>`;
          const tail = excluded
            ? `<span class="pickAside pickAsideWarn">does not compete</span>`
            : (renamed ? `<span class="pickAside">${divPillHtml(groupForRosterDigit(d))}</span>` : "");
          return `<button type="button" data-action="pickDivision" data-rosterdiv="${d}" aria-pressed="${d === current ? "true" : "false"}">`
               + `${head}${tail}</button>`;
        }).join("");
      }

      divisionPopover.dataset.open = "1";
      placePopoverNear(divisionPopover, el, { prefer: popoverSide(context) });
    }

    function closeDivisionPopover(){
      divisionPopover.dataset.open = "0";
      divisionPopoverContext = null;
    }

    function pickDivision(rosterDigit){
      if (!divisionPopoverContext) return;
      const digit = Number(rosterDigit);
      if (!(digit >= 1 && digit <= 6)) return;

      const rowIds = (divisionPopoverContext.type === "row")
        ? [divisionPopoverContext.rowId]
        : divisionPopoverContext.rowIds;
      closeDivisionPopover();

      // Each student keeps their own first seven digits; only the eighth moves.
      const diffs = [];
      for (const rid of rowIds){
        const s = getStudent(rid);
        const id8 = String(s?.id8 || "");
        if (!canChangeLevel(id8) || id8.charCodeAt(7) - 48 === digit) continue;
        const nextId8 = id8.slice(0, 7) + String(digit);
        const prevDiv = s.division;
        setIdRaw(rid, nextId8, { recordUndo: false });
        diffs.push({ type: "editId", rowId: rid, prevId8: id8, nextId8, prevDiv, nextDiv: s.division });
      }
      if (!diffs.length) return;

      pushUndo(diffs.length === 1
        ? { type: "single", label: "Change level", diff: diffs[0] }
        : { type: "batch", label: `Change level (${diffs.length})`, diffs });

      syncAllCountersAndSummaries();
      syncSticky();
      refreshFixTeamsButtons();
    }

    /** A copy of one student, under the next student number this school has free. */
    function duplicateStudent(rowId){
      const from = getStudent(rowId);
      if (!from) return;
      const school4 = String(from.id8 || "").slice(0, 4);
      const free = (school4.length === 4) ? nextFreeStudentNumber(school4) : "";
      // a copy shares everything but the student number, which has to be unique
      const copy = addStudent({
        first: from.first, last: from.last,
        id8: free ? school4 + free + String(from.id8.charAt(7)) : "",
        included: false, team: "X", topicTestKey: from.topicTestKey,
      });
      rebuildRowIndex();

      // a copy is easiest to find directly under the student it came from
      masterOrder = masterOrder.filter(rid => rid !== copy.rowId);
      const at = masterOrder.indexOf(rowId);
      masterOrder.splice(at >= 0 ? at + 1 : masterOrder.length, 0, copy.rowId);

      pushUndo({
        type: "single", label: "Duplicate student",
        diff: { type: "addStudent", index: students.length - 1, orderIndex: masterOrder.indexOf(copy.rowId), snapshot: {
          rowId: copy.rowId, first: copy.first, last: copy.last, id8: copy.id8,
          included: copy.included, team: copy.team, topicTestKey: copy.topicTestKey } }
      });

      renderAllRows();
      syncAllCountersAndSummaries();
      syncSticky();
      refreshFixTeamsButtons();
    }

    function renderTopicTestGrid(cfgOverride){
      const host = document.getElementById("topicTestGrid");
      if (!host) return;
      const scrollHost = host.closest(".topSectionBody");
      const savedScrollTop = scrollHost ? scrollHost.scrollTop : 0;
      // Read before clearing: with no override the config comes out of these very
      // inputs, and emptying the host first hands it a grid with nothing in it.
      const cfg = cfgOverride || getTopicTestConfig();
      // Read once for the whole grid rather than per row: it is a walk of the roster,
      // and there are up to seven cards of at least three rows each.
      const usage = topicTestUsage();
      host.innerHTML = "";

      /* One card per category, in the competition's own order. There is no longer a
         card for a category this competition does not run — there is no such thing:
         the categories *are* its divisions, so a card exists exactly as long as the
         division does. What was a hidden card holding somebody else's tests is now a
         list that came back from the stored config only if its division did. */
      for (const g of topicGroups()){
        const label = topicGroupLabel(g);
        const colorIdx = topicGroupColorIndex(g);
        const card = document.createElement("div");
        card.className = "topicCard";
        card.dataset.group = g;

        const head = document.createElement("div");
        head.className = "topicHead";
        if (colorIdx){
          card.style.setProperty("--famColor", `var(--div${colorIdx})`);
          card.style.background = `color-mix(in srgb, var(--div${colorIdx}) 7%, var(--panel2))`;
        }

        /* The heading is the division pill, because the category is the division. Open
           keeps the plain badge: it belongs to no division and has no color of its own. */
        const title = document.createElement("span");
        title.className = "badge badgeStrong divPill";
        title.textContent = label;
        if (colorIdx) title.dataset.divpill = String(colorIdx);
        head.appendChild(title);

        /* The prefix box ghosts the division's name rather than holding a copy of it.
           Empty means "whatever this division is called", so renaming a custom division
           moves its prefix with it and the PDF prints the new name. */
        const prefixWrap = document.createElement("label");
        prefixWrap.className = "topicPrefixField";
        prefixWrap.innerHTML = `Prefix <input type="text" class="topicPrefixInput" data-group="${escAttr(g)}"`
          + ` value="${escAttr(String(cfg.prefixByGroup?.[g] ?? ""))}" placeholder="${escAttr(label)}"`
          + ` title="Leave it blank to print the division's own name, which is what the ghost shows.">`;
        head.appendChild(prefixWrap);
        card.appendChild(head);

        const rows = document.createElement("div");
        rows.className = "topicRows";
        const { count: visibleCount, names: existing, codes: existingCodes } = topicRowArrays(cfg, g);
        for (let i = 0; i < visibleCount; i++){
          const idx = i + 1;
          const key = topicIndexLabel(g, idx);
          const seated = usage.get(key) || 0;
          const named = String(existing[i] ?? "").trim();
          const row = document.createElement("div");
          row.className = "topicRow";
          row.dataset.group = g;
          row.dataset.index = String(idx);
          const useTitle = seated
            ? `${seated} added ${seated === 1 ? "student is" : "students are"} sitting `
              + `${named ? `"${named}"` : "this test"}. Deleting it returns ${seated === 1 ? "them" : "them"} to `
              + (cfg.tbdEnabled ? "their own division's TBD." : "no topic test at all.")
            : "";
          row.innerHTML = `<span class="topicUse" data-empty="${seated ? "0" : "1"}" title="${seated} added students assigned to this test">${PERSON_GLYPH}<span data-topic-count>${seated}</span></span>`
            + `<input type="text" class="topicInput" data-group="${escAttr(g)}" data-index="${idx}" value="${escAttr(existing[i] ?? "")}" placeholder="Test name">`
            + `<input type="text" class="topicCodeInput" inputmode="numeric" data-group="${escAttr(g)}" data-index="${idx}" value="${escAttr(existingCodes[i] ?? "")}" maxlength="3" placeholder="###" title="Optional. Three digits, bubbled on the sheet.">`

            + `<span class="topicRowActs">`
              + `<button type="button" class="topicRowBtn" data-action="moveTopicTest" data-group="${escAttr(g)}" data-index="${idx}" data-dir="-1"`
              + `${idx === 1 ? " disabled" : ""} aria-label="Move up" title="Move this test up the list">${ICON_TOPIC_UP}</button>`
              + `<button type="button" class="topicRowBtn" data-action="moveTopicTest" data-group="${escAttr(g)}" data-index="${idx}" data-dir="1"`
              + `${idx === visibleCount ? " disabled" : ""} aria-label="Move down" title="Move this test down the list">${ICON_TOPIC_DOWN}</button>`
              + `<button type="button" class="topicRowBtn isDanger" data-action="deleteTopicTest" data-group="${escAttr(g)}" data-index="${idx}"`
              + ` aria-label="Delete this test" title="${escAttr(visibleCount <= 3
                  ? "Clear this test and its code. Assigned students move to TBD or blank."
                  : "Delete this test. Assigned students move to TBD or blank.")}">${ICON_TOPIC_DEL}</button>`
            + `</span>`;
          rows.appendChild(row);
        }

        /* TBD sits last and has a read-only field spanning the space occupied by a
           named test's name, code, and actions. */
        if (cfg.tbdEnabled){
          const tbdKey = topicIndexLabel(g, 0);
          const tbdSeated = usage.get(tbdKey) || 0;
          const tbdRow = document.createElement("div");
          tbdRow.className = "topicRow topicTbdRow";
          tbdRow.dataset.group = g;
          tbdRow.dataset.index = "0";
          const tbdUseTitle = tbdSeated
            ? `${tbdSeated} added ${tbdSeated === 1 ? "student is" : "students are"} on this division's TBD.`
            : "";
          tbdRow.innerHTML = `<span class="topicUse" data-empty="${tbdSeated ? "0" : "1"}">${PERSON_GLYPH}<span data-topic-count>${tbdSeated}</span></span>`
            + `<span class="topicTbdField"><span class="topicTbdName">TBD</span>`
            + `<span class="topicTbdNote">prints the prefix alone</span></span>`
            ;
          rows.appendChild(tbdRow);
        }
        card.appendChild(rows);

        const addBtnRow = document.createElement("div");
        addBtnRow.className = "row";
        addBtnRow.style.marginTop = "10px";
        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "mini";
        addBtn.dataset.action = "addTopicRow";
        addBtn.dataset.group = g;
        addBtn.textContent = "Add Another Test";
        addBtnRow.appendChild(addBtn);
        /* "Remove Empty Row" used to live here, because a row could only be taken off
           the bottom of the list and only while it was blank. Every row has its own
           delete now, which can reach the middle of the list and knows what to do with
           the students on it — so the button that could do neither is gone. */
        card.appendChild(addBtnRow);

        host.appendChild(card);
      }
      syncTopicCodeState();
      if (scrollHost){
        scrollHost.scrollTop = savedScrollTop;
        requestAnimationFrame(() => { scrollHost.scrollTop = savedScrollTop; });
      }
    }

    /**
     * The one place the PDF Setup chip is written. It used to be set from whichever
     * caller happened to run, and applyFullSnapshot repaints the menu before it puts
     * the restored config back — so undoing a competition change left the chip saying
     * the opposite of what the list was doing.
     */
    function syncTopicChipState(){
      const chip = document.getElementById("topicChipState");
      if (!chip) return;
      const on = hasTopicTests() && !!document.getElementById("topicTestsEnabled")?.checked;
      chip.hidden = !hasTopicTests();
      // the menu beside it is already called Topic tests
      chip.textContent = on ? "On" : "Off";
      chip.dataset.on = on ? "1" : "0";
    }

    function syncTopicTestsUI(){
      const enabled = hasTopicTests() && !!document.getElementById("topicTestsEnabled")?.checked;
      const defaults=document.getElementById("compNames");
      if(defaults)defaults.dataset.topicMode=enabled?"1":"0";
      document.querySelectorAll("#division input").forEach(input=>{input.disabled=enabled;});
      const help=document.getElementById("divisionTestHelp");
      if(help)help.innerHTML=enabled
        ? "<strong>Individual test fields are inactive.</strong> Topic Tests supplies the printed test name and code for every student. Unassigned students print neither. Turn Topic Tests off to edit these saved defaults."
        : "<strong>Printed in the PDF’s Test field.</strong> One name and optional code per division, used when Topic Tests is off.";
      syncTopicChipState();
      const box = document.getElementById("topicTestsBox");
      if (box) box.style.display = enabled ? "block" : "none";
      document.documentElement.classList.toggle("no-topic-tests", !enabled);
      syncListNote();   // the note's Test section follows this switch
      renderAllRows();
      syncAllCountersAndSummaries();
      syncSticky();
    }

    // what the panel is pinned to, kept so it can be re-measured after it is drawn
    let topicPopoverAnchor = null;

    function closeTopicPopover(){
      topicPopover.style.display = "none";
      topicPopover.dataset.open = "0";
      topicPopoverContext = null;
      topicPopoverAnchor = null;
    }

    function openTopicPopoverNear(el, context){
      const isBatch = context.type === "batch";
      /* Everything is on offer to everybody now. What the student's division decides
         is the order: their own category, then Open, then a "More" fold holding the
         rest. A batch straddles divisions and has no single "own", so it opens flat. */
      const split = isBatch
        ? { primary: getAllAvailableTopicTests(), more: [] }
        : topicOptionsForDivision(getStudent(context.rowId)?.division || 0);
      let options = split.primary.concat(split.more);

      if (isBatch){
        const rows = (context.rowIds || []).map(getStudent).filter(Boolean);
        context.total = rows.length;
      }
      if (!options.length) return;
      // the keyboard reads this list, so it can never disagree with what is drawn
      context.options = options;
      topicPopoverContext = context;
      topicPopoverAnchor = el;

      const title = document.getElementById("topicPopoverTitle");
      const body = document.getElementById("topicPopoverBody");
      if (title){
        const own = isBatch ? "" : ownTopicGroup(getStudent(context.rowId)?.division || 0);
        title.textContent = isBatch
          ? `Set Topic Test (${context.total} Selected)`
          : (own ? `Set Topic Test (${topicGroupLabel(own)})` : "Set Topic Test");
      }
      if (body){
        body.innerHTML = "";
        /* pRow pCol is the Change Level picker's own list: a column of full-width,
           left-aligned buttons with a 4px gap and an accent pressed state. This list
           is the same control doing the same job, so it is drawn by the same rules
           rather than by a private set that happened to look like nothing else. */
        body.className = "pRow pCol topicPopoverList";

        /* Which one the student is already on. A batch only has an answer when every
           selected row agrees; a mixed batch shows no tick, because there is nothing
           true to tick. Read once, not per row. */
        const currentKey = (() => {
          if (!isBatch) return String(getStudent(context.rowId)?.topicTestKey || "");
          const keys = new Set((context.rowIds || [])
            .map(rid => String(getStudent(rid)?.topicTestKey || "")));
          return (keys.size === 1) ? Array.from(keys)[0] : null;
        })();

        /* No numbers down the side. They were a keyboard shortcut wearing a chip, and
           the chip cost more than the shortcut was worth: 40px of every row given to a
           digit, a second left edge for the names to start at, and a label that read
           as part of the test's name until you worked out it was not. What guides the
           eye instead is the thing the list is actually organised by — the division —
           and that is the heading pill. */
        const drawOption = (host, opt) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "topicOptionBtn";
          b.dataset.action = "pickTopic";
          b.dataset.topicKey = opt.key;
          /* The picker never used to say which test the student already had, so the
             only way to check an assignment was to close it and read the cell behind
             it. Same attribute the division picker uses, so it inherits that accent. */
          b.setAttribute("aria-pressed", (currentKey !== null && opt.key === currentKey) ? "true" : "false");
          /* TBD names no test — "prefix only" is what it does, not part of what it is
             called, so it goes in the aside every other picker in this app puts a
             qualifier in rather than in brackets after the name. */
          const name = opt.tbd ? "TBD" : opt.name;
          const aside = opt.tbd ? '<span class="pickAside">prefix only</span>' : "";
          /* The amber dot is the same caution the row carries: at a convention, a
             division sitting below its own level. Nothing is disabled by it. */
          const why = isBatch ? "" : topicLadderWarning(getStudent(context.rowId)?.division || 0, opt.key);
          const warn = why ? ICON_TOPIC_WARN : "";
          b.innerHTML = `<span class="optName${opt.tbd ? " isTbd" : ""}">${escAttr(name)}</span>`
            + `${aside}${warn}${ICON_TOPIC_TICK}`;
          const full = topicTestFullLabel(opt.key) || opt.name || "";
          b.title = why ? `${full}\n\n${why}` : full;
          host.appendChild(b);
        };

        // The heading is the division's own pill, which is what a division looks like
        // everywhere else in this app. It is also the only pilled thing in the list, so
        // every plain word left in it starts at one x.
        const drawGroupHeading = (host, g) => {
          const h = document.createElement("div");
          h.className = "topicOptGroup";
          h.innerHTML = `<span class="badge badgeStrong divPill" data-divpill="${topicGroupColorIndex(g)}">${escAttr(topicGroupLabel(g))}</span>`;
          host.appendChild(h);
        };

        const drawRun = (host, list) => {
          let last = "";
          for (const opt of list){
            if (opt.group !== last){ last = opt.group; drawGroupHeading(host, opt.group); }
            drawOption(host, opt);
          }
        };

        /* The way out leads the list. "No topic test" is the right answer for anyone
           who should not be sitting one, and it used to be the last thing in a
           scroller — under a fade, past every category. Nothing above it now. */
        const clear = document.createElement("button");
        clear.type = "button";
        clear.className = "topicOptionBtn topicOptClear";
        clear.dataset.action = "pickTopic";
        clear.dataset.topicKey = "";
        // "no test" is a state a student can be in, so it ticks like any other choice
        clear.setAttribute("aria-pressed", (currentKey !== null && currentKey === "") ? "true" : "false");
        clear.innerHTML = `<span class="optName">No topic test</span>${ICON_TOPIC_TICK}`;
        clear.title = "Clear topic test";
        body.appendChild(clear);

        const sep = document.createElement("div");
        sep.className = "topicClearSep";
        sep.setAttribute("aria-hidden", "true");
        body.appendChild(sep);

        /* A section of the list, under a heading that folds it. A fold changes the
           panel's height after it has been placed, so every one of them re-measures
           against the window rather than overflowing it. */
        const drawSection = (label, list, open) => {
          const det = document.createElement("details");
          det.className = "topicSection";
          det.open = open;
          const sum = document.createElement("summary");
          sum.textContent = label;
          det.appendChild(sum);
          const inner = document.createElement("div");
          inner.className = "topicSectionList";
          drawRun(inner, list);
          det.appendChild(inner);
          det.addEventListener("toggle", () => sizeTopicPopover());
          body.appendChild(det);
        };

        /* The two categories a student is actually expected to sit — their own and
           Open — are what the picker opens on. A batch straddles divisions, so it has
           no "recommended" to name and gets the flat list it always got. */
        if (isBatch || !split.more.length){
          drawRun(body, split.primary);
        } else {
          drawSection("Recommended", split.primary, true);
        }

        /* The rest, folded. A picker that opened on twenty tests from five divisions
           made the student's own three hard to find; a picker that only ever showed
           those three made the other seventeen unreachable. The fold is both — and it
           starts shut, because the point of it is that the list opens short. */
        if (split.more.length) drawSection(`More tests (${split.more.length})`, split.more, false);

      }
      topicPopover.dataset.open = "1";
      topicPopover.style.display = "flex";
      sizeTopicPopover();
      topicPopover.focus?.();
    }

    /* Size and place it against the room the window actually leaves, and drop it
       above the row when there is more space up there. A fixed height put Open below
       the fold for any student near the bottom of the window.

       This is its own function because the popover's content is not fixed once it is
       drawn: opening the More fold can double it, and the window can be resized under
       it. Both re-run this, so the panel is never taller than the viewport and the
       list starts scrolling exactly when it stops fitting. */
    function sizeTopicPopover(){
      const el = topicPopoverAnchor;
      if (!el || !el.isConnected || topicPopover.dataset.open !== "1") return;
      const body = document.getElementById("topicPopoverBody");

      /* Measuring means taking the cap off, which lets the scroller collapse to its
         content — and a scroller with nothing to scroll forgets where it was, so
         every fold you opened threw the list back to the top. Hold the offset over
         the measurement and put it back under the new cap. */
      const keepTop = body ? body.scrollTop : 0;
      topicPopover.style.maxHeight = "";
      const r = el.getBoundingClientRect();
      const pad = 8;
      const gap = 6;
      const roomBelow = window.innerHeight - r.bottom - gap - pad;
      const roomAbove = r.top - gap - pad;
      const wanted = topicPopover.scrollHeight;
      // Same rule as the other two: from the selection bar it goes up unless there is
      // genuinely no room up there; from a row it goes down unless above is roomier.
      const isBatch = topicPopoverContext?.type === "batch";
      const below = isBatch
        ? (roomAbove < 150 && roomBelow > roomAbove)
        : ((wanted <= roomBelow) || (roomBelow >= roomAbove));
      // never taller than the window itself, whichever way it opens
      const room = Math.max(150, Math.min(below ? roomBelow : roomAbove,
                                          window.innerHeight - 2 * pad));
      topicPopover.style.maxHeight = `${room}px`;

      const height = Math.min(wanted, room);
      const left = Math.max(pad, Math.min(window.innerWidth - topicPopover.offsetWidth - pad, r.left));
      const top = below ? (r.bottom + gap) : Math.max(pad, r.top - gap - height);
      topicPopover.style.left = `${left + window.scrollX}px`;
      topicPopover.style.top = `${top + window.scrollY}px`;

      if (body){
        body.scrollTop = Math.min(keepTop, Math.max(0, body.scrollHeight - body.clientHeight));
        body.dataset.more = (body.scrollHeight > body.clientHeight + 1) ? "1" : "0";
      }
    }

    // the window moving under an open picker is the same problem as its content
    // growing inside one: re-measure rather than leave it hanging off the edge
    window.addEventListener("resize", () => sizeTopicPopover());

    function pickTopic(topicKey){
      if (!topicPopoverContext) return;
      if (topicPopoverContext.type === "row"){
        setTopicTest(topicPopoverContext.rowId, topicKey, {recordUndo:true, label:"Set topic test"});
      } else if (topicPopoverContext.type === "batch"){
        batchSetTopicTest(topicPopoverContext.rowIds, topicKey);
      }
      closeTopicPopover();
      syncAllCountersAndSummaries();
      syncSticky();
    }
