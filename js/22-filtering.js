    /* ============================================================
       Filtering the list

       Four columns hold a small, closed set of values — division, team, added,
       topic test — which is exactly the shape a tick-list can filter. A column with
       every value ticked is not filtering at all, so the state is either null (the
       column is not asking anything) or the set of values it will let through.

       What this is not: a way to choose who prints. That is the Added column, and
       filtering deliberately leaves it alone — hide a student here and they still
       come out of the printer, which is why the strip above the table says how many
       are hidden and the added count in the sticky bar never moves.
       ============================================================ */

    const FILTER_FACETS = ["division", "team", "added", "topic"];
    const FILTER_FACET_LABEL = { division: "division", team: "team", added: "added", topic: "topic test" };

    /** @type {{division:Set|null, team:Set|null, added:Set|null, topic:Set|null}} */
    let rowFilters = { division: null, team: null, added: null, topic: null };

    /** The values a facet can take right now, in the order the table sorts them. */
    function filterFacetValues(facet){
      if (facet === "division"){
        return activeDivisions().concat(0).map(d => ({ value: String(d), label: divShort(d), divPill: divColorIndex(d) }));
      }
      if (facet === "team"){
        /* Five kinds of chip where there used to be four. 0 and blank both mean the
           student is on no team, and the filter has to be able to tell them apart or
           a team-0 student matches nothing and is hidden by every team filter with no
           chip to bring them back. */
        return teamNumbers()
          .map(t => ({ value: String(t), label: `Team ${t}` }))
          .concat([
            { value: "0", label: "No team", title: "Settled: the sheet bubbles a 0 in column nine." },
            { value: "X", label: "Not decided", title: "Blank: nothing is bubbled, so it can be filled in by hand." },
          ]);
      }
      if (facet === "added"){
        return [{ value: "1", label: "Added" }, { value: "0", label: "Not added" }];
      }
      if (facet === "topic"){
        const out = getAllAvailableTopicTests()
          .slice()
          .sort((a, b) => topicRank(a.key) - topicRank(b.key))
          .map(o => ({ value: o.key, label: topicSummaryLabel(o.key) }));
        out.push({ value: "", label: "No topic test" });
        return out;
      }
      return [];
    }

    /** Which facets this competition can even offer. */
    function activeFilterFacets(){
      const out = ["division"];
      if (hasTeamSelection()) out.push("team");
      out.push("added");
      if (getTopicTestConfig().enabled) out.push("topic");
      return out;
    }

    function studentFacetValue(s, facet){
      if (facet === "division") return String(s.division);
      if (facet === "team") return String(normalizeTeamValue(s.team));
      if (facet === "added") return s.included ? "1" : "0";
      if (facet === "topic") return String(s.topicTestKey || "");
      return "";
    }

    function rowPassesFilters(s){
      for (const facet of FILTER_FACETS){
        const allowed = rowFilters[facet];
        if (!allowed) continue;
        if (!allowed.has(studentFacetValue(s, facet))) return false;
      }
      return true;
    }

    function activeFilterFacetNames(){
      return FILTER_FACETS.filter(f => rowFilters[f]).map(f => FILTER_FACET_LABEL[f]);
    }

    function clearRowFilters({ redraw = true } = {}){
      rowFilters = { division: null, team: null, added: null, topic: null };
      if (redraw){
        renderRowFilterBody();
        applyListVisibility();
      }
    }

    /**
     * A facet drops back to null the moment every one of its values is ticked, so
     * "all of them" and "not filtering" are never two different states wearing the
     * same face.
     */
    function toggleFilterValue(facet, value){
      const all = filterFacetValues(facet).map(v => v.value);
      const set = rowFilters[facet] ? new Set(rowFilters[facet]) : new Set(all);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      rowFilters[facet] = (set.size === all.length) ? null : set;
      renderRowFilterBody();
      applyListVisibility();
    }

    function setFacetAll(facet, on){
      rowFilters[facet] = on ? null : new Set();
      renderRowFilterBody();
      applyListVisibility();
    }

    function openRowFilter(){
      renderRowFilterBody();
      const back = document.getElementById("filterModalBack");
      if (back) back.style.display = "flex";
    }
    function closeRowFilter(){
      const back = document.getElementById("filterModalBack");
      if (back) back.style.display = "none";
    }

    function renderRowFilterBody(){
      const host = document.getElementById("filterBody");
      if (!host) return;
      host.innerHTML = "";

      for (const facet of activeFilterFacets()){
        const values = filterFacetValues(facet);
        if (!values.length) continue;
        const allowed = rowFilters[facet];

        const group = document.createElement("div");
        group.className = "filterGroup";

        const head = document.createElement("div");
        head.className = "filterGroupHead";
        head.innerHTML = `<h4>${escAttr(FILTER_FACET_LABEL[facet])}</h4>`
          + `<button type="button" class="mini" data-action="filterFacetAll" data-facet="${facet}">All</button>`
          + `<button type="button" class="mini" data-action="filterFacetNone" data-facet="${facet}">None</button>`;

        const chips = document.createElement("div");
        chips.className = "filterChips";
        chips.innerHTML = values.map(v => {
          const on = !allowed || allowed.has(v.value);
          const pill = (v.divPill !== undefined)
            ? `<span class="badge badgeStrong divPill" data-divpill="${v.divPill}">${escAttr(v.label)}</span>`
            : escAttr(v.label);
          const why = v.title ? ` title="${escAttr(v.title)}"` : "";
          return `<button type="button" class="filterChip" role="checkbox" aria-pressed="${on ? "true" : "false"}" aria-checked="${on ? "true" : "false"}" data-action="filterToggle" data-facet="${facet}" data-value="${escAttr(v.value)}"${why}><span class="tick" aria-hidden="true"></span>${pill}</button>`;
        }).join("");

        group.appendChild(head);
        group.appendChild(chips);
        host.appendChild(group);
      }
    }

    /* ---- what the table actually shows -----------------------------------------
       Search and filters both hide rows, and a row hidden by either is hidden. They
       are kept in one pass so neither can undo the other's work on a rerender. */

    /** "Alpha  Geometry" and "Alpha Geometry" are the same search. */
    function flatText(v){
      // folded like lc(): a name stored with a curly apostrophe is found by typing
      // a straight one, and the other way round
      return foldForCompare(v).replace(/\s+/g, " ").trim().toLowerCase();
    }

    function rowMatchesSearch(s, q){
      if (!q) return true;
      if (flatText(`${s.first} ${s.last}`).indexOf(q) >= 0) return true;
      if (String(s.id8 || "").indexOf(q) >= 0) return true;
      // the topic cell reads as one phrase, prefix and all, which is how it is searched
      const topicEl = rowEl.get(s.rowId)?.querySelector(".topicCol .topicPick");
      const topic = (topicEl && !topicEl.disabled) ? flatText(topicEl.textContent) : "";
      return !!topic && topic !== "\u2014" && topic.indexOf(q) >= 0;
    }

    function applyListVisibility(){
      const search = document.getElementById("stuSearch");
      const q = flatText(search?.value);

      // The row being typed in never disappears out from under the cursor: a name
      // half-rewritten stops matching its own search long before it is finished, and
      // hiding it there would take the focus with it. It settles on the way out.
      const editingRowId = Number(document.activeElement?.closest?.("tr[data-rowid]")?.dataset?.rowid) || 0;

      let shown = 0;
      const total = students.length;
      for (const s of students){
        const tr = rowEl.get(s.rowId);
        const hit = (s.rowId === editingRowId) || (rowPassesFilters(s) && rowMatchesSearch(s, q));
        if (hit) shown++;
        if (tr) tr.setAttribute("data-hidden", hit ? "0" : "1");
      }

      const searchCount = document.getElementById("searchCount");
      if (searchCount){
        searchCount.style.display = q ? "inline-flex" : "none";
        searchCount.textContent = `${shown} of ${total} matched`;
      }
      const searchWrap = document.getElementById("listSearchWrap");
      if (searchWrap) searchWrap.dataset.hasQuery = q ? "1" : "0";

      syncFilterIndicators(shown, total);

      // A search or a filter that matches nothing otherwise leaves a blank page with
      // the count as the only clue, and no obvious way back.
      const dead = document.getElementById("searchEmpty");
      const root = document.getElementById("studentsRoot");
      const nothing = total > 0 && shown === 0 && (!!q || activeFilterFacetNames().length > 0);
      if (dead){
        dead.hidden = !nothing;
        const term = document.getElementById("searchEmptyTerm");
        if (term) term.textContent = (nothing && q) ? `\u201c${search.value.trim()}\u201d` : "";
      }
      if (root && total) root.style.display = "";
      const table = document.querySelector(".tableScroll");
      if (table) table.hidden = nothing;
    }

    /** The button, its count, and the strip that names what is in force. */
    function syncFilterIndicators(shown, total){
      const names = activeFilterFacetNames();
      const btn = document.getElementById("btnFilter");
      if (btn){
        btn.dataset.on = names.length ? "1" : "0";
        const count = document.getElementById("filterCount");
        if (count) count.textContent = names.length ? String(names.length) : "";
      }
      const strip = document.getElementById("filterStrip");
      const text = document.getElementById("filterStripText");
      if (!strip || !text) return;
      strip.hidden = !names.length;
      if (!names.length) return;
      const hiddenAdded = students.reduce((a, s) => a + ((s.included && !rowPassesFilters(s)) ? 1 : 0), 0);
      const tail = hiddenAdded
        ? (hiddenAdded === 1
            ? ", and 1 hidden student is still added and still prints"
            : `, and ${hiddenAdded} hidden students are still added and still print`)
        : "";
      text.textContent = `Filtered by ${names.join(" and ")}: showing ${shown} of ${total}${tail}.`;
    }

    // ====== Advanced filter ======
    function getOrder(){
      const on = document.querySelector('#nameOrderToggle button[aria-pressed="true"]');
      const val = on?.dataset?.order;
      return (val === "lastfirst") ? "lastfirst" : "firstlast";
    }
    function setOrder(order, {persist=true}={}){
      const next = (order === "lastfirst") ? "lastfirst" : "firstlast";
      const btns = document.querySelectorAll("#nameOrderToggle button[data-order]");
      for (const b of btns) b.setAttribute("aria-pressed", b.dataset.order === next ? "true" : "false");
      syncFilterPlaceholder();
      if (persist){
        try{ window.FBStore.set(NAME_ORDER_KEY, next); }catch(e){}
      }
    }

    /** Shows the expected shape of a line. Placeholders never touch typed text. */
    function syncFilterPlaceholder(){
      const ta = document.getElementById("filter");
      if (!ta) return;
      const line = (getOrder() === "lastfirst") ? "LastName, FirstName" : "FirstName, LastName";
      ta.placeholder = `${line}\n${line}`;
    }

    /** Split one pasted line into name fields, honoring an explicit delimiter if given. */
    function fieldsForFilterLine(line, delimiter){
      let parts;
      if (delimiter === "whitespace") parts = line.split(/\s+/);
      else if (delimiter) parts = line.split(delimiter);
      else if (line.includes(",")) parts = line.split(",");
      else parts = line.split(/\s+/);
      return parts.map(s => s.trim()).filter(Boolean);
    }

    /**
     * Names are stored as separate first/last fields, so the order toggle can be honored
     * exactly: each adjacent split of the line's tokens is tried in the stated orientation
     * first. A line that only matches the other way round still counts, but is reported as
     * reversed. Where two students are each other's reverse, the stated order decides.
     */
    function matchRowIdsForFilterLine(line, delimiter, order){
      const fields = fieldsForFilterLine(line, delimiter);
      if (!fields.length) return { ids: [], reason: "empty" };

      // Candidate (A, B) splits: the explicit field split first, then every token split.
      const pairs = [];
      const seen = new Set();
      const addPair = (a, b) => {
        const k = `${lc(a)}>${lc(b)}`;
        if (a && b && !seen.has(k)){ seen.add(k); pairs.push([a, b]); }
      };
      if (fields.length >= 2) addPair(fields[0], fields.slice(1).join(" "));
      const tokens = fields.join(" ").split(/\s+/).filter(Boolean);
      for (let i = 1; i < tokens.length; i++){
        addPair(tokens.slice(0, i).join(" "), tokens.slice(i).join(" "));
      }

      const asStated = ([a, b]) => (order === "lastfirst") ? [b, a] : [a, b];

      // 1. the order the user says they wrote
      for (const pair of pairs){
        const [first, last] = asStated(pair);
        const ids = nameExactToRowIds.get(nameExactKey(first, last));
        if (ids && ids.size) return { ids: Array.from(ids).sort((a,b)=>a-b), reason: "" };
      }

      // 2. the other way round — still a match, but worth telling the user about
      for (const pair of pairs){
        const [first, last] = asStated(pair);
        const ids = nameExactToRowIds.get(nameExactKey(last, first));
        if (ids && ids.size) return { ids: Array.from(ids).sort((a,b)=>a-b), reason: "reversed" };
      }

      // 3. a bare surname (or first name) is fine as long as it is unambiguous
      if (tokens.length === 1){
        const t = lc(tokens[0]);
        const hits = students.filter(s => lc(s.first) === t || lc(s.last) === t).map(s => s.rowId);
        if (hits.length === 1) return { ids: hits, reason: "" };
        if (hits.length > 1) return { ids: [], reason: "ambiguous" };
      }

      return { ids: [], reason: "nomatch" };
    }

    function filterStudentList(){
      const error2 = document.getElementById("error2");
      const result = document.getElementById("filterResult");
      error2.innerHTML = "";
      if (result) result.innerHTML = "";

      const delimiter = String(document.getElementById("delimiter")?.value ?? "").trim();
      const order = getOrder();

      const diffs = [];
      const desired = new Set();
      const text = (document.getElementById("filter").value || "").trim();
      const lines = text ? text.split("\n").map(s => s.trim()).filter(Boolean) : [];

      const notMatched = [];
      const ambiguous = [];
      const reversed = [];
      let matchedCount = 0;
      let duplicateHits = 0;

      for (const line of lines){
        const { ids, reason } = matchRowIdsForFilterLine(line, delimiter, order);
        if (!ids.length){
          if (reason === "ambiguous") ambiguous.push(line);
          else if (reason !== "empty") notMatched.push(line);
          continue;
        }
        if (reason === "reversed") reversed.push(line);
        if (ids.length > 1) duplicateHits++;

        if (desired.has(ids[0])) duplicateHits++;
        desired.add(ids[0]);
        matchedCount++;
      }
      for (const s of students){
        const next = desired.has(s.rowId);
        if (s.included === next) continue;
        const prev = s.included;
        s.included = next;
        bumpCountsOnIncludeChange(s, prev, next);
        diffs.push({type:"toggleInclude",rowId:s.rowId,prev,next});
        diffs.push(...clearTeamOnRemoval(s), ...clearTopicOnRemoval(s));
        rerenderRow(s.rowId);
      }

      if (diffs.length){
        pushUndo({ type:"batch", label:"Import permission slips", diffs });
      }

      if (result){
        const badge = (text, cls) => {
          const el = document.createElement("span");
          el.className = cls ? `badge ${cls}` : "badge";
          el.textContent = text;
          result.appendChild(el);
        };
        badge(`${desired.size} student${desired.size === 1 ? "" : "s"} added`, "badgeStrong");
        badge(`${matchedCount} of ${lines.length} lines matched`);
        if (notMatched.length) badge(`${notMatched.length} unmatched`, "badgeDanger");
        if (ambiguous.length) badge(`${ambiguous.length} ambiguous`, "badgeWarn");
        if (reversed.length) badge(`${reversed.length} reversed`, "badgeWarn");
        if (duplicateHits) badge(`${duplicateHits} duplicate name${duplicateHits === 1 ? "" : "s"}`, "badgeWarn");
      }

      const other = (order === "lastfirst") ? "First, Last" : "Last, First";
      appendFilterReport(error2, "No student has this name", notMatched, "Check the spelling, or add them under Add Students \u2192 Manual.");
      appendFilterReport(error2, "More than one student matches", ambiguous, "Give both names on the line so the match is unambiguous.");
      appendFilterReport(error2, "Matched the other way round", reversed, `Switch the order toggle to ${other} if that is how your list is written.`);

      syncAllCountersAndSummaries();
      syncSticky();
      refreshFixTeamsButtons();
    }

    /** One collapsible group of problem lines inside the filter's alert box. */
    function appendFilterReport(host, title, lines, fix){
      if (!host || !lines.length) return;
      const wrap = document.createElement("details");
      if (lines.length <= 4) wrap.open = true;

      const sum = document.createElement("summary");
      sum.textContent = `${title} (${lines.length})`;
      wrap.appendChild(sum);

      const hint = document.createElement("div");
      hint.style.marginTop = "6px";
      hint.textContent = fix;
      wrap.appendChild(hint);

      const pre = document.createElement("pre");
      pre.textContent = lines.join("\n");
      wrap.appendChild(pre);

      host.appendChild(wrap);
    }

