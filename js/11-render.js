    // ====== Rendering ======
    function clearTbodyKeepHeader(tbody){
      // keep first row (header) only
      while (tbody.rows.length > 1) tbody.deleteRow(1);
    }

    /* Row-action glyphs. One stroke weight and one 16x16 box, like every other
       glyph in the list, so three controls in a row read as one set. */
    const ICON_SWAP  = '<svg class="glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 5.5h8.5M9 3l2.5 2.5L9 8"/><path d="M13 10.5H4.5M7 8l-2.5 2.5L7 13"/></svg>';
    const ICON_COPY  = '<svg class="glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M5.5 5.5h7v7h-7z"/><path d="M10.5 5.5v-2h-7v7h2"/></svg>';
    const ICON_TRASH = '<svg class="glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.5 4.5h9"/><path d="M6.5 4.5V3h3v1.5"/><path d="M4.8 4.5 5.4 13h5.2l.6-8.5"/><path d="M6.8 6.8v3.8M9.2 6.8v3.8"/></svg>';

    function buildRowTr(student){
      const tr = document.createElement("tr");
      tr.dataset.rowid = String(student.rowId);
      tr.dataset.division = String(student.division);
      tr.dataset.selected = selected.has(student.rowId) ? "1" : "0";
      tr.dataset.dup = "0";
      tr.dataset.over = "0";
      /* Settled a moment later by syncBlockingRowUI, which is the only thing that
         knows about duplicates across the whole list. Seeded here so a row built
         mid-pass is never briefly ringed for a fault it does not have. */
      tr.dataset.blocking = "0";

      const divCell = `<td class="divCol">
            <span class="badge badgeStrong divPill" data-divpill="${divColorIndex(student.division)}">
              ${escAttr(divShort(student.division))}
            </span>
          </td>`;

      const idIssues = rowIssues(student);
      const idSev = rowSeverity(idIssues);
      const idTitle = "";
      // Two different locks, and they say different things: a convention bubbles 0
      // for everyone, while a student who is not in the PDF has no team at all.
      // Blank until a student is in the PDF, whatever the competition is: a team is
      // something a printed sheet carries, and a student who is not added has no
      // sheet to carry one. Being added is what settles it — at a convention it goes
      // to 0 there and then, since nobody enters teams; at a regular meet the cell
      // opens for the coach to pick. The convention used to show 0 on every row from
      // the start, which said a student was on the school's team before anyone had
      // decided they were sitting the competition at all.
      const teamUnadded = !student.included;
      const teamNoComp = !teamUnadded && !hasTeamSelection();
      const teamLocked = teamUnadded || teamNoComp;
      const teamText = teamUnadded ? "\u2014" : (teamNoComp ? "0" : teamLabel(student.team));
      const teamNote = teamNoComp ? TEAM_LOCK_NOTE
        : (hasTeamSelection() ? TEAM_UNADDED_NOTE : TEAM_UNADDED_AT_CONVENTION_NOTE);

      // The list shows the roster ID, which is what gets edited. When the
      // competition remaps the Roster Level, say so rather than leaving the
      // sheet quietly disagreeing with the table.
      const bubbled = bubbledId8(student);
      const remapped = !!bubbled && bubbled !== student.id8;
      const bubbleMark = remapped ? idSwapHtml(bubbled) : "";

      // The grip is the only thing in the row that starts a drag. Every other cell
      // holds a text field or a button, where a drag has to keep meaning "select
      // this text" — which is why the row itself is not draggable.
      const canSetDivision = canChangeLevel(student.id8);

      tr.innerHTML = `
        <td class="center gripCol">
          <span class="rowGrip" draggable="true" data-grip="${student.rowId}" role="button" tabindex="0" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" aria-label="Use Alt and arrow keys, or drag to reorder ${escAttr(displayName(student))}" title="Drag or use Alt+Up / Alt+Down to change page order">
            <svg viewBox="0 0 10 16" aria-hidden="true" focusable="false"><circle cx="3" cy="4" r="1.1"/><circle cx="7" cy="4" r="1.1"/><circle cx="3" cy="8" r="1.1"/><circle cx="7" cy="8" r="1.1"/><circle cx="3" cy="12" r="1.1"/><circle cx="7" cy="12" r="1.1"/></svg>
          </span>
        </td>
        <td class="center selCol">
          <input type="checkbox" aria-label="Select ${escAttr(displayName(student))}" data-action="select" data-rowid="${student.rowId}" ${selected.has(student.rowId) ? "checked" : ""}>
        </td>
        ${divCell}
        <td class="nameCol firstCol">
          <input class="cellInput" type="text" data-field="first" data-rowid="${student.rowId}" value="${escAttr(student.first)}" placeholder="First"${nameFlagAttrs(student, "first")}>
        </td>
        <td class="nameCol lastCol">
          <input class="cellInput" type="text" data-field="last" data-rowid="${student.rowId}" value="${escAttr(student.last)}" placeholder="Last"${nameFlagAttrs(student, "last")}>
        </td>
        <td class="topicCol">
          <button type="button" class="topicPick" data-action="openTopic" data-rowid="${student.rowId}" title="${escAttr(topicTestCellTitle(student, renderTests()))}" ${topicPickEnabled(student) ? "" : "disabled"}>${topicTestCellHtml(student, renderTests())}</button>
        </td>
        <td class="idCol">
          <div class="idFieldWrap" data-idwrap="${student.rowId}" data-rowid="${student.rowId}" data-remapped="${remapped ? "1" : "0"}" data-locked="${idIsLocked(student) ? "1" : "0"}" data-sev="${idSev}" aria-invalid="${idSev === "fatal" ? "true" : "false"}"${idTitle ? ` title="${escAttr(idTitle)}"` : ""}>
            ${idCellHtml(student, bubbleMark)}
          </div>
        </td>
        <td class="center teamCol">
          <button type="button" class="teamBtn${teamLocked ? " isLocked" : ""}" data-action="openTeam" data-rowid="${student.rowId}"${teamLocked ? ` aria-disabled="true" title="${escAttr(teamNote)}"` : ""}>${teamText}</button>
        </td>
        <td class="center incCol">
          <span class="includeBtn" role="button" tabindex="0" aria-pressed="${student.included ? "true" : "false"}" aria-label="${student.included ? "Added. Click to remove" : "Not added. Click to add"}" data-action="toggleInclude" data-rowid="${student.rowId}">${student.included ? ICON_ON : ICON_OFF}</span>
        </td>
        <td class="center actCol">
          <div class="rowActs">
            <button type="button" class="rowAct" data-action="openDivision" data-rowid="${student.rowId}"${canSetDivision ? "" : " disabled"} title="${canSetDivision ? "Move this student to another division, rewriting the Roster Level of their ID" : "Enter all eight digits of the FAMAT ID first. The Roster Level is its last one"}" aria-label="Change level">
              ${ICON_SWAP}
            </button>
            <button type="button" class="rowAct" data-action="duplicateRow" data-rowid="${student.rowId}" title="Duplicate" aria-label="Duplicate">
              ${ICON_COPY}
            </button>
            <button type="button" class="rowAct danger" data-action="deleteRow" data-rowid="${student.rowId}" title="Delete" aria-label="Delete">
              ${ICON_TRASH}
            </button>
          </div>
        </td>
      `;

      applyRowColors(tr, student);
      return tr;
    }

    /** rowIds flagged as duplicates, maintained by syncDuplicateUI. */
    let dupRowIdSet = new Set();
    /** ...and everyone sharing a student number at all, added or not. */
    let dupRowIdSetAll = new Set();

    /**
     * Every problem with one row, most blocking first. A clean row says nothing at all;
     * several problems stack rather than hiding each other behind one badge.
     */
    function rowIssues(student){
      const out = [];
      const id8 = student.id8 || "";

      const rosterDigit = (id8.length === 8) ? (id8.charCodeAt(7) - 48) : 0;
      const wellFormed = completeId(id8) && rosterDigit >= 1 && rosterDigit <= 6;

      /*
       * Worked out from the ID rather than read off the student, because the two
       * disagree for as long as a cell is being typed in. setIdRaw defers the division
       * commit while the caret is in the box — the row must not change division under
       * the person editing it — so division still holds what the *old* ID said.
       *
       * Correcting an ID that was already wrong is where that showed. The old ID left
       * division sitting at 0, the newly typed one was well formed, and this read the
       * stale 0 as "this competition has no division for it" — so a perfectly good
       * Geometry ID was accused of not competing, and the accusation cleared itself the
       * moment you clicked away and the commit landed. The topic-test checks below read
       * the same field and were wrong in the same window.
       *
       * Once committed the two agree: setIdRaw sets division to exactly this.
       */
      const division = divisionFromId8(id8);
      if (!completeId(id8)){
        out.push({
          code: "!",
          severity: student.included ? "fatal" : "warn",
          title: "Incomplete FAMAT ID",
          fix: "Fill every digit: School ID (4), Student Number (3), and Roster Level (1). Missing digits are never filled with zeros automatically."
        });
      } else if (!wellFormed){
        out.push({code:"LEVEL", severity:student.included ? "fatal" : "warn", title:"Invalid roster level digit", fix:"Use Change level in this row to choose a level from 1 to 6. It replaces the last digit automatically."});
      } else if (division === 0){
        // the ID is fine; this competition simply has no division for it
        out.push({
          code: "N/A",
          severity: student.included ? "fatal" : "warn",
          title: `${ROSTER_DIVISIONS[rosterDigit]} does not compete at ${competitionPhrase()}`,
          fix: "Remove this student from the PDF, or pick a different competition."
        });
      }
      if (dupRowIdSet.has(student.rowId)){
        out.push({
          code: "DUP",
          severity: "fatal",
          title: "This Student Number is on more than one added student",
          fix: "They would print the same bubbled ID. Un-add all but one of them, or correct the Student Numbers.",
          dup: true
        });
      } else if (dupRowIdSetAll.has(student.rowId)){
        // The same downgrade the other blockers get: it cannot break a PDF that does
        // not contain it, but it will the moment the other one is added.
        out.push({
          code: "DUP",
          severity: "warn",
          title: "Another student has this Student Number",
          fix: "Only one of them is added, so nothing is blocked yet. Adding the other would make both print the same bubbled ID.",
          dup: true
        });
      }
      // A topic test assigned under another competition stays on the student and is
      // still printed, so flag it rather than dropping it silently.
      const topicKey = String(student.topicTestKey || "");
      // read the checkbox directly: getTopicTestConfig() runs a dozen document-wide
      // queries, and rowIssues is called for every row on every render
      const topicsOn = !!document.getElementById("topicTestsEnabled")?.checked;
      if (topicKey && topicsOn){
        const group = topicGroupOfKey(topicKey);
        const ladder = topicLadderWarning(division, topicKey);
        if (ladder){
          out.push({
            code: "TT",
            severity: "warn",
            title: `${divName(division)} is sitting a ${topicGroupLabel(group)} test`,
            fix: ladder,
          });
        } else if (group && !topicGroups().includes(group)){
          // the category itself has gone — a competition switch, or a custom division
          // deleted out from under it
          out.push({
            code: "TT",
            severity: "warn",
            title: "This topic test belongs to a division that is not running",
            fix: `It was assigned under a different competition and still prints on the sheet. `
               + `Pick one of ${competitionPossessive()} own tests, or clear it.`,
          });
        } else if (group && !topicKeyIsTbd(topicKey) && !getTopicTestNameByKey(topicKey)){
          // the slot this student points at has since been emptied, so the Test field
          // prints the prefix alone while any code on it still bubbles
          out.push({
            code: "TT",
            severity: "warn",
            title: "This topic test no longer has a name",
            fix: "Its name was cleared in Topic Tests, so the sheet prints the prefix on its own. Name that test again, or pick a different one."
          });
        }
      }

      const school4 = String(document.getElementById("schoolId4")?.value || "").replace(/\D/g, "").slice(0, 4);
      if (id8.length === 8 && school4.length === 4 && id8.slice(0, 4) !== school4){
        out.push({
          code: "SC",
          severity: "warn",
          title: "Does not match the School ID in the School menu",
          fix: `The first four digits must match the School ID set in the School menu, currently ${school4}. Double-click this ID to open all eight digits and correct them, or change that setting instead.`
        });
      }

      // stable, so within a severity they stay in the order they were found
      out.sort((a, b) => (a.severity === "fatal" ? 0 : 1) - (b.severity === "fatal" ? 0 : 1));
      return out;
    }

    /**
     * A name field's own problem, if it has one. Kept apart from rowIssues on
     * purpose: that list is the ID cell's, and everything in it paints the ID box —
     * so a stray character in a surname was lighting up the FAMAT ID as though the
     * digits were wrong. A field's fault belongs to that field.
     *
     * @returns {{severity:string, chars:string[], title:string}|null}
     */
    function nameFieldIssue(student, field){
      const chars = illegalFieldChars(student?.[field]);
      if (!chars.length) return null;
      const one = chars.length === 1;
      return {
        severity: student.included ? "fatal" : "warn",
        chars,
        // a title attribute, so it reads on hover without the shared bubble
        title: `${quoteChars(chars)} cannot be printed on a sheet, and this field will `
          + `not accept ${one ? "it" : "them"}. ${one ? "It" : "They"} came in with a pasted `
          + `roster or an older draft. Retype the name. ${FIELD_CHARSET_NOTE}`
          + (student.included ? " The PDF cannot be built until it is fixed." : "")
      };
    }

    /** "fatal" if anything here blocks the PDF, else "warn", else "". */
    function rowSeverity(issues){
      if (!issues.length) return "";
      return issues.some(i => i.severity === "fatal") ? "fatal" : "warn";
    }

    /** Bubble contents for one row's problems, with a route into the duplicates modal. */
    function rowIssueBubbleHtml(rowId){
      const s = getStudent(rowId);
      if (!s) return "";
      const issues = rowIssues(s);
      if (!issues.length) return "";
      const fatal = issues.filter(i => i.severity === "fatal").length;
      const warn = issues.length - fatal;
      const bits = [];
      if (fatal) bits.push(`${fatal} fatal`);
      if (warn) bits.push(`${warn} warning${warn === 1 ? "" : "s"}`);
      // "fatal" carries the meaning once it has been spelled out here
      const head = bits.join(" \u00b7 ") + (fatal ? ". The PDF cannot be built until it is fixed" : "");
      const items = issues.map(i => {
        const sev = (i.severity === "fatal") ? "fatal" : "warn";
        return `<li data-sev="${sev}"><span class="sevTag" data-sev="${sev}">${sev === "fatal" ? "Fatal" : "Warning"}</span>`
          + `<strong>${escAttr(i.title)}</strong><br>${escAttr(i.fix)}</li>`;
      }).join("");
      return `<div class="rowErrHead" data-sev="${rowSeverity(issues)}">${escAttr(head)}</div><ul class="rowErrList">${items}</ul>`;
    }

    /**
     * Everything the ID box has to explain, as one bubble: why its digits differ from
     * the roster, then whatever is wrong with it, worst first. A native title cannot
     * carry this — and two tooltips racing each other is worse than one — so the
     * cell has no title of its own and this drives the shared bubble instead.
     */
    function idHoverHtml(rowId){
      const s = getStudent(rowId);
      if (!s) return "";
      const parts = [];

      const bubbled = bubbledId8(s);
      if (bubbled && bubbled !== s.id8){
        const rosterDigit = s.id8.charAt(7);
        const rosterName = ROSTER_DIVISIONS[Number(rosterDigit)] || "that division";
        parts.push(
          `<div class="rowErrHead">Sheet division digit converted</div>` +
          `<div class="idConvert">` +
            `<span class="idConvertKey">Roster</span><code>${escAttr(s.id8.slice(0,7))}<b>${escAttr(rosterDigit)}</b></code>` +
            `<span class="idConvertKey">Sheet</span><code>${escAttr(bubbled.slice(0,7))}<b class="swapDigit">${escAttr(bubbled.charAt(7))}</b></code>` +
          `</div>` +
          `<p style="margin:8px 0 0;">${escAttr(rosterName)} is categorized as part of the ` +
          `${escAttr(divName(s.division))} division at ${escAttr(competitionPhrase())}, which has ` +
          `sheet division digit ${escAttr(bubbled.charAt(7))}. The original roster level for ${escAttr(rosterName)} ` +
          `is still stored locally as ${escAttr(rosterDigit)} in case you need to convert it back.</p>`
        );
      }

      const issues = rowIssueBubbleHtml(rowId);
      if (issues) parts.push(parts.length ? `<hr class="bubbleRule">${issues}` : issues);
      return parts.join("");
    }

    /** The severity attributes one name input is drawn with. */
    function nameFlagAttrs(student, field){
      const issue = nameFieldIssue(student, field);
      if (!issue) return "";
      return ` data-sev="${issue.severity}" aria-invalid="${issue.severity === "fatal" ? "true" : "false"}"`
        + ` title="${escAttr(issue.title)}"`;
    }

    /**
     * Repaint the two name flags in place. Set as attributes rather than by rebuilding
     * the row, because this runs while the field is being typed in and a rebuilt input
     * takes the caret with it.
     */
    function updateNameFlags(rowId){
      const tr = rowEl.get(rowId);
      const s = getStudent(rowId);
      if (!tr || !s) return;
      for (const field of ["first", "last"]){
        const el = tr.querySelector(`input[data-field="${field}"][data-rowid="${rowId}"]`);
        if (!el) continue;
        const issue = nameFieldIssue(s, field);
        if (issue){
          el.dataset.sev = issue.severity;
          el.setAttribute("aria-invalid", issue.severity === "fatal" ? "true" : "false");
          el.title = issue.title;
        } else {
          delete el.dataset.sev;
          el.setAttribute("aria-invalid", "false");
          el.title = "";
        }
      }
    }

    function updateIdBadge(rowId){
      const tr = rowEl.get(rowId);
      const s = getStudent(rowId);
      if (!tr || !s) return;

      const wrap = tr.querySelector(`[data-idwrap="${rowId}"]`);
      if (wrap){
        const issues = rowIssues(s);
        const sev = rowSeverity(issues);
        wrap.dataset.sev = sev;
        wrap.setAttribute("aria-invalid", sev === "fatal" ? "true" : "false");
        wrap.title = "";
        if (window.FBTips?.ownedBy(wrap)){
          const html = idHoverHtml(rowId);
          if (html) window.FBTips.show(wrap, html, sev === "fatal" ? "danger" : sev === "warn" ? "caution" : "guide", window.FBTips.isPinned());
          else window.FBTips.hide(true);
        }
      }
      updateIdCell(rowId);
    }

    /**
     * The layers of one ID cell that change while it is being typed into, without
     * rebuilding the row underneath the caret: the grayed placeholders, and the
     * overlay showing what the sheet will actually bubble.
     *
     * The dimmed school and division segments are deliberately *not* redrawn here.
     * Mid-edit the stored ID is a partial string, so a segment recomputed from it
     * would flicker or briefly go blank; they are settled on blur instead, when the
     * row is rebuilt.
     */
    function updateIdCell(rowId){
      const tr = rowEl.get(rowId);
      const s = getStudent(rowId);
      if (!tr || !s) return;

      const wrap = tr.querySelector(`[data-idwrap="${rowId}"]`);
      const locked = wrap ? wrap.dataset.locked === "1" : idIsLocked(s);
      const val = String(s.id8 || "");

      const ghost = tr.querySelector(`[data-idghost="${rowId}"]`);
      if (ghost){
        // three slots when only the student number is in play, eight when all of it is
        const slots = locked ? 3 : 8;
        const typedVal = locked ? val.slice(4, 7).replace(/#/g, "") : val;
        const typed = ghost.querySelector(".ghostTyped");
        const rest = ghost.querySelector(".ghostRest");
        if (typed) typed.textContent = typedVal;
        if (rest) rest.textContent = "#".repeat(Math.max(0, slots - typedVal.length));
      }

      // keep the overlay honest while the ID is being retyped
      const swap = tr.querySelector(".idSwap");
      const bubbled = bubbledId8(s);
      const remapped = !!bubbled && bubbled !== val;
      if (wrap) wrap.dataset.remapped = remapped ? "1" : "0";
      if (swap && remapped) swap.innerHTML = idSwapInnerHtml(bubbled);
    }

    function renderAllRows(){ withRowFrame(renderAllRowsInner); }

    /**
     * There is one table, so it is drawn whichever view is on screen — the Summary
     * and Counts views only hide it, and hidden rows still have to exist for search,
     * selection and every rerenderRow that follows.
     *
     * Fast enough for 300 rows: one fragment, no per-row listeners.
     */
    function renderAllRowsInner(){
      normalizeMasterOrder();

      const tb = document.getElementById("tbodyAll");
      clearTbodyKeepHeader(tb);
      rowEl.clear();

      const frag = document.createDocumentFragment();
      for (const rowId of masterOrder){
        const s = getStudent(rowId);
        if (!s) continue;
        const tr = buildRowTr(s);
        rowEl.set(rowId, tr);
        frag.appendChild(tr);
      }
      tb.appendChild(frag);
      if (tb.rows[0]){
        tb.rows[0].style.display = students.length > 0 ? "" : "none";
      }

      syncDuplicateUI(); // marks dup rows and badges
      syncOverflowUI();  // marks overflow rows
      // the rows are new, so whatever was hiding them has to be said again
      applyListVisibility();
      // ...and the table is a new width, so the edge fades re-read it
      window.FBSyncScrollFades?.();
    }

    function rerenderRow(rowId){
      withRowFrame(() => {
        const s = getStudent(rowId);
        if (!s) return;
        const old = rowEl.get(rowId);
        if (!old) return;

        const tr = buildRowTr(s);

        old.replaceWith(tr);
        rowEl.set(rowId, tr);
        // keep selection checkbox state already in selected set
      });
    }

