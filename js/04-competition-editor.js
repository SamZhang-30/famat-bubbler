    /* ============================================================
       The custom competition editor

       Everything else in this dialog is a choice between four ready-made answers.
       This is the one place you build one, so it gets its own surface and its own
       rules: a division is its bubbled digit, each roster division lands on exactly
       one of them, and several may land on the same one — which is how a merge like
       Theta is expressed.

       Every edit applies immediately and goes through setCompetition, so it re-pools
       the students and lands on the undo stack like any other switch. There is no
       Apply button because there is no draft: what you see is the competition.
       ============================================================ */

    /**
     * Commit a change to the custom competition.
     *
     * Two paths, because they cost wildly different amounts. Changing the map moves
     * students between divisions, so it goes the long way: a full snapshot, a re-pool,
     * and a rebuild of every row. Everything else — a name, a color slot, the team cap,
     * a division created but not yet fed — cannot move anybody, so it only writes the
     * competition and repaints. Both land on the undo stack; only one of them costs a
     * rebuild, which is why adding and removing divisions is no longer slow.
     *
     * @param {(state:object)=>void} mutate
     * @param {{repool?:boolean, label?:string}} [opts]
     */
    function updateCustom(mutate, opts){
      const repool = !(opts && opts.repool === false);
      const next = customState();
      mutate(next);

      if (repool){
        setCompetition({ preset: "custom", custom: next });
      } else {
        const prev = cloneCompetition();
        competitionState = { preset: "custom", custom: next };
        saveCompetition();
        applyCompetitionToUI();
        pushUndo({
          type: "single",
          label: (opts && opts.label) || "Edit custom competition",
          diff: { type: "competition", prev, next: cloneCompetition() },
        });
        syncUndoUI();
      }
      // applyCompetitionToUI repaints both dialogs, so there is nothing to do here
    }

    /**
     * Set how many people sit on one team here. 0 is "no cap".
     *
     * repool: false, because nothing about this moves a student between divisions —
     * and an over-full team is reported rather than corrected, the same way it is when
     * a fifth name is typed into a team of four by hand. What it changes is what the
     * list flags and what a Fill would do next, both of which the repaint below picks
     * up on its own.
     */
    function setCustomTeamSize(n){
      if (customState().teamSize === n) return;
      updateCustom((next) => { next.teamSize = n; }, {
        repool: false,
        label: n === 0 ? "Uncap team size" : `Set ${n} people per team`,
      });
      // The flags live in the list and the summaries, not in this dialog, so they are
      // repainted here rather than waiting for the next thing that touches a row.
      syncAllCountersAndSummaries();
      syncSticky();
    }

    function openCustomEditor(){
      renderCustomEditor();
      const back = document.getElementById("customModalBack");
      if (back) back.style.display = "flex";
    }
    function closeCustomEditor(){
      const back = document.getElementById("customModalBack");
      if (back) back.style.display = "none";
    }

    function renderCustomEditor(){
      const back = document.getElementById("customModalBack");
      if (!back) return;

      /* Every commit redraws this dialog, and a redraw replaces the field you are
         standing in — so a name typed and then tabbed out of would take the focus
         with it, and the next Tab would start again from the top of the page. The
         field is found again afterwards by what it edits rather than by identity,
         and the caret is put back where it was. */
      const act = document.activeElement;
      const focusKey = (act && back.contains(act) && act.dataset)
        ? (act.dataset.customName ? `[data-custom-name="${act.dataset.customName}"]`
          : act.dataset.customDigit ? `[data-custom-digit="${act.dataset.customDigit}"]`
          : act.dataset.customMap ? `[data-custom-map="${act.dataset.customMap}"]`
          : act.dataset.divColor ? `[data-div-color="${act.dataset.divColor}"]`
          : "")
        : "";
      const caret = (focusKey && typeof act.selectionStart === "number") ? act.selectionStart : null;

      /* The same dialog serves every competition. Under Custom it is the editor;
         under a preset it is the color picker, with everything that would rewrite a
         fixed competition simply absent. One surface, because a division's color is
         the same thing to set either way, and duplicating it produced two swatch
         UIs that drifted apart. */
      const isCustom = competitionState.preset === "custom";
      back.querySelectorAll("[data-custom-only]").forEach((el) => {
        el.hidden = (el.dataset.customOnly === "1") ? !isCustom : isCustom;
      });

      const titleEl = document.getElementById("customEditorTitle");
      if (titleEl) titleEl.textContent = isCustom ? "Custom Divisions" : `${competitionLabel()} Colors`;

      const lede = document.getElementById("customEditorLede");
      if (lede){
        lede.innerHTML = isCustom
          ? `Every change here applies at once and is kept under <strong>Custom</strong> alone.
             Switching to a preset and back finds it exactly as you left it.`
          : (window.FBPrefs.paletteFor(competitionState.preset) === "season"
            ? "Regional and Statewide share division colors. Changes and resets apply to both."
            : `Division colors apply to <strong>${escAttr(competitionLabel())}</strong> only.`);
      }

      const headEl = document.getElementById("customDivListHead");
      if (headEl) headEl.textContent = isCustom ? "The Divisions" : "Division Colors";

      const c = customState();

      /* Under a preset the list is the competition's own divisions, named once each —
         which is the other half of why this moved here. The old swatches sat in the
         competition table, one per roster row, so a merged division like Theta drew
         two identical swatches that looked independent and were not. */
      const rows = isCustom
        ? customDivisions().map(x => ({ id: x.id, name: x.name, digit: x.digit, digitLabel: x.digit, fed: x.from.length > 0 }))
        : activeDivisions().map(g => {
            const p = competitionPreset();
            const digits = [...new Set(Object.keys(p.map)
              .map(Number)
              .filter(d => groupForBubbleDigit(p.map[d] || 0) === g)
              .map(d => bubbleDigitFor(p.map[d] || 0)))].sort((a, b) => a - b);
            return { id: g, name: divName(g), digit: bubbleDigitFor(g), digitLabel: digits.join(" / "), fed: true };
          });

      // ---- problems, first, because they change what the rest means ----
      const probHost = document.getElementById("customProblems");
      if (probHost){
        const problems = isCustom ? customProblems(c) : [];
        probHost.innerHTML = problems.map(pr => `<div class="customProblem">
            <svg class="glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 2.6 15 14H1z"/><path d="M8 6.6v3M8 11.6h.01"/></svg>
            <div>${escAttr(pr.text)}</div>
          </div>`).join("");
      }

      // ---- where each roster division goes ----
      const mapHost = document.getElementById("customMapGrid");
      if (mapHost && isCustom){
        mapHost.innerHTML = [1,2,3,4,5,6].map(d => {
          const t = Number(c.map[d]) || 0;
          /* "Theta \u2192 4" rather than "Theta \u00b7 bubbles 4". Six roster levels
             times six divisions is thirty-six options, and the word was on every one
             of them; it is stated once in the section heading now and the arrow carries
             it from there.

             An unnamed division is listed but cannot be picked. A name is what prints
             in the Test field, so sending a level somewhere nameless is asking for
             blank sheets — the division is one keystroke from being a real choice, and
             saying so beats letting it be chosen and then flagging it. The one that is
             already selected stays selectable, because a select has to be able to show
             what it currently holds. */
          const opts = customDivisions().map(x => {
              const named = !!String(x.name || "").trim();
              const here = (x.id === t);
              const label = named ? x.name : "Unnamed (name it first)";
              return `<option value="${x.id}"${here ? " selected" : ""}${(!named && !here) ? " disabled" : ""}>`
                   + `${escAttr(label)} \u2192 ${x.digit}</option>`;
            }).join("");
          return `<label class="customMapRow">
              <span class="customMapFrom">${escAttr(ROSTER_DIVISIONS[d])}</span>
              <select data-custom-map="${d}" aria-label="Where ${escAttr(ROSTER_DIVISIONS[d])} competes">
                ${opts}
                <option value="0"${t ? "" : " selected"}>Does not compete</option>
              </select>
            </label>`;
        }).join("");
      }

      // ---- the divisions themselves ----
      const listHost = document.getElementById("customDivList");
      if (listHost){
        const usedDigits = rows.map(r => r.digit);
        const nameCount = new Map();
        for (const r of rows){
          const k = String(r.name || "").trim().toLowerCase();
          if (!k) continue;
          nameCount.set(k, (nameCount.get(k) || 0) + 1);
        }
        listHost.innerHTML = rows.map(r => {
          const dupName = r.fed && nameCount.get(String(r.name || "").trim().toLowerCase()) > 1;
          const dupDigit = r.fed && usedDigits.filter(n => n === r.digit).length > 1;
          const blank = r.fed && !String(r.name || "").trim();
          const bad = isCustom && (dupName || dupDigit || blank);
          // a digit is on offer if nobody else holds it
          const free = CUSTOM_DIGITS.filter(n => n === r.digit || !usedDigits.includes(n));
          /* Always a live picker, named or not. A new division starts gray because
             the custom palette has no color for it yet, not because it is being
             withheld — there is nothing to wait for, and a swatch you cannot press
             on a row you have just created reads as broken. */
          const swatch = `<input type="color" class="swatchInput" data-div-color="${divColorIndex(r.id)}"
                      aria-label="Color for ${escAttr(r.name || "this division")}"
                      title="Color for ${escAttr(r.name || "this division")}">`;
          /* Only under Custom: a preset's divisions come out in roster order and are
             not the user's to arrange. The grip is the same one the student list
             uses, so "drag this by its dots to move it" means one thing in this app. */
          const grip = isCustom
            ? `<span class="rowGrip customDivGrip" draggable="true" data-divgrip="${r.id}"
                     role="button" tabindex="-1" aria-label="Drag to reorder ${escAttr(r.name || "this division")}"
                     title="Drag to reorder"><svg viewBox="0 0 10 16" aria-hidden="true" focusable="false"><circle cx="3" cy="4" r="1.1"/><circle cx="7" cy="4" r="1.1"/><circle cx="3" cy="8" r="1.1"/><circle cx="7" cy="8" r="1.1"/><circle cx="3" cy="12" r="1.1"/><circle cx="7" cy="12" r="1.1"/></svg></span>`
            : "";
          return `<div class="customDivRow" data-divrow="${r.id}" data-bad="${bad ? "1" : "0"}">
              ${grip}${swatch}
              ${isCustom
                ? `<input type="text" class="customDivName" data-custom-name="${r.id}"
                          value="${escAttr(r.name)}" placeholder="Division name"
                          aria-label="Name for this division">`
                : `<span class="customDivFixed">${escAttr(r.name)}</span>`}
              <span class="customDivArrow" aria-hidden="true">\u2192</span>
              ${isCustom
                ? `<select class="customDivDigit" data-custom-digit="${r.id}" aria-label="Bubbled digit for ${escAttr(r.name || "this division")}">
                     ${free.map(n => `<option value="${n}"${n === r.digit ? " selected" : ""}>${n}</option>`).join("")}
                   </select>`
                : `<span class="customDivFixedDigit">${r.digitLabel || r.digit}</span>`}
              ${isCustom
                ? `<button type="button" class="mini danger" data-action="removeCustomDivision" data-id="${r.id}"
                           title="Delete this division. Any roster level on it stops competing.">Remove</button>`
                : ""}
            </div>`;
        }).join("") || `<div class="compFootNote">${isCustom
            ? "No divisions yet. Add one, then send roster levels to it above."
            : "No divisions in use."}</div>`;
      }

      // ---- teams ----
      if (isCustom){
        document.querySelectorAll("#customTeamSeg button[data-n]").forEach((b) => {
          b.dataset.on = (Number(b.dataset.n) === c.maxTeams) ? "1" : "0";
        });

        /* People per team. The section goes quiet rather than away when nobody enters
           a team at all: a control that vanishes explains nothing, and this one has
           something to say — that the cap above it is what made it irrelevant. */
        const sizeSection = document.getElementById("customTeamSizeSection");
        const sizeOff = (c.maxTeams === 0);
        if (sizeSection) sizeSection.dataset.off = sizeOff ? "1" : "0";
        document.querySelectorAll("#customTeamSizeSeg button[data-n]").forEach((b) => {
          b.dataset.on = (Number(b.dataset.n) === c.teamSize) ? "1" : "0";
          b.disabled = sizeOff;
        });
        const sizeInput = document.getElementById("customTeamSizeInput");
        // Never written while it is the field being typed in: renderCustomEditor runs
        // on every commit, and rewriting the box under the caret would fight the typing.
        if (sizeInput && document.activeElement !== sizeInput){
          sizeInput.value = c.teamSize ? String(c.teamSize) : "";
        }
        if (sizeInput){
          sizeInput.disabled = sizeOff;
          sizeInput.placeholder = c.teamSize ? "##" : "\u221e";
        }
        const sizeNote = document.getElementById("customTeamSizeNote");
        if (sizeNote){
          sizeNote.textContent = sizeOff
            ? "No teams are entered here, so there is nothing to size."
            : (c.teamSize === 0
                ? "No cap. A team holds as many as you seat on it, and none is ever reported as over-full."
                : `A team over ${c.teamSize} is flagged in the list and in the summary.`);
        }

        const tn = document.getElementById("customTeamNote");
        if (tn){
          tn.textContent = (c.maxTeams === 0)
            ? "Nobody enters a team: the Team column locks and every sheet is bubbled 0, as at a convention."
            : (c.teamSize === 0
                ? `${c.maxTeams === 1 ? "One team" : c.maxTeams + " teams"} per division, with no cap on how many sit on one.`
                : `${c.teamSize} to a team, so ${c.maxTeams * c.teamSize} seats per division.`);
        }
      }

      // ---- the colors revert, which has to read live rather than at render time ----
      syncRevertColorsButtons();

      // the swatches are rebuilt each time, so hand them their values
      back.querySelectorAll("[data-div-color]").forEach((el) => {
        el.value = window.FBPrefs.divColor(el.dataset.divColor);
      });

      if (focusKey){
        const again = back.querySelector(focusKey);
        if (again){
          again.focus({preventScroll:true});
          if (caret != null && typeof again.setSelectionRange === "function"){
            try{ again.setSelectionRange(caret, caret); }catch(e){}
          }
        }
      }
    }

    /**
     * Run an edit to the current palette as one undo step.
     *
     * Every route into the colors goes through here — a swatch settling, Revert, the
     * per-competition reset — so there is one place that knows how to take one back
     * and one place that decides what the step is called.
     * @param {() => void} mutate does the actual change through FBPrefs
     * @param {string} label what Undo will offer to reverse
     */
    function pushDivColorUndo(prev, label){
      const P = window.FBPrefs;
      if (!P || !prev) return;
      const palette = P.palette();
      const next = P.paletteSnapshot(palette);
      // A picker opened and closed on the color it already had is not an edit.
      if (JSON.stringify(prev) === JSON.stringify(next)) return;
      pushUndo({ type: "single", label, diff: { type: "divColors", palette, prev, next } });
      syncUndoUI();
    }
    /** The same step, for the changes that happen in one go rather than over a drag. */
    function editDivColors(mutate, label){
      const P = window.FBPrefs;
      if (!P) return;
      const prev = P.paletteSnapshot();
      mutate();
      pushDivColorUndo(prev, label);
    }

    /**
     * The revert-colors buttons, wherever they are, enabled exactly when there is
     * something to revert. Called from the color inputs themselves as well as from a
     * render, because a swatch change does not redraw the dialog it sits in — which
     * is why the button used to stay grayed out until something else repainted it.
     */
    function syncRevertColorsButtons(){
      const on = !!window.FBPrefs?.divColorsCustomized?.();
      const sharedSeason = window.FBPrefs?.paletteFor(competitionState.preset) === "season";
      document.querySelectorAll('[data-action="resetDivColors"]').forEach((b) => {
        b.disabled = !on;
        b.title = sharedSeason
          ? (on ? "Reset division colors for both Regional and Statewide" : "Regional and Statewide use the built-in colors")
          : on
          ? `Put ${competitionPossessive()} division colors back to the built-in set`
          : `Built-in colors are in use at ${competitionPhrase()}`;
      });
      const note = document.getElementById("compColorNote");
      if (note){
        /* "affects Custom only" reads oddly for the one competition that is already
           entirely yours, so it names what is actually shared instead: the colors. */
        const custom = competitionState.preset === "custom";
        note.textContent = sharedSeason
          ? (on ? "Custom colors shared by Regional and Statewide. Resetting applies to both."
                : "Regional and Statewide share this palette. Changes apply to both.")
          : custom
          ? "Set division names, bubbled digits, roster mappings, team limits and colors."
          : (on ? `Colors here are your own. Reverting affects ${competitionLabel()} only.`
                : `Built-in colors. Any change is kept for ${competitionLabel()} alone.`);
      }
    }

    /**
     * Repaint everything that names a division.
     *
     * "Everything" includes the student rows, which is the part this used to leave
     * out. A row's Division cell carries divShort() as text and divColorIndex() as an
     * attribute, and its ID cell carries the digit the competition bubbles — all three
     * baked in when the row was built. Renaming a division in the custom editor, or
     * moving the digit it bubbles, changes the competition without moving a single
     * student between divisions, so nothing was rebuilding the rows and the table went
     * on showing the old name until the page was reloaded. Undoing such an edit went
     * the same way, for the same reason.
     *
     * @param {{repaintRows?: boolean}} [opts] repaintRows:false for the two callers
     *   that are about to draw every row themselves; leaving it on there would render
     *   the table twice, the first time against a student list that is on its way out.
     */
    function applyCompetitionToUI(opts){
      const repaintRows = !(opts && opts.repaintRows === false);
      const p = competitionPreset();
      const remaps = isRemapping();

      // the colors follow the competition, so the palette is switched with it
      window.FBPrefs?.setPalette?.(window.FBPrefs.paletteFor(competitionState.preset));
      // ...and so do the Test-field ghosts, which are derived, not stored
      syncTestNamePlaceholders();

      /* Whatever changed the competition — a preset button, an edit in the custom
         editor, an undo, a draft being loaded — the two dialogs that show it are
         repainted from here. Undo used to restore the state correctly and leave the
         open editor showing the old answer, which reads exactly like undo being
         broken. Only redraw what is on screen; these are not cheap. */
      if (document.getElementById("competitionModalBack")?.style.display === "flex") renderCompetitionBody();
      if (document.getElementById("customModalBack")?.style.display === "flex") renderCustomEditor();

      const valueEl = document.getElementById("compValue");
      if (valueEl){
        valueEl.textContent = competitionShortLabel();
        // the chip is abbreviated, so the full name is one hover away
        valueEl.title = competitionLabel();
      }

      // The two shortcut rows that name team keys: how many there are is the
      // competition's business, so the modal is redrawn with it rather than listing
      // three and being wrong statewide.
      const teamKeys = teamNumbers().map(t => `<span class="kbd">${t}</span>`).join("");
      const scBatch = document.getElementById("scBatchTeamKeys");
      if (scBatch) scBatch.innerHTML = teamKeys;
      const scPick = document.getElementById("scTeamPickerKeys");
      if (scPick) scPick.innerHTML = teamKeys + '<span class="kbd">0</span><span class="kbd">X</span>';

      // division panels: rename, and drop the ones this competition does not use
      for (let d = 1; d <= 6; d++){
        const title = document.querySelector(`[data-divtitle="${d}"]`);
        if (title){
          title.textContent = divName(d);
          title.dataset.divcolor = String(divColorIndex(d));
          title.dataset.divpill  = String(divColorIndex(d));
        }
        const panel = document.querySelector(`[data-divpanel="${d}"]`);
        if (panel){
          panel.dataset.unused = isActiveDivision(d) ? "0" : "1";
          panel.dataset.divcolor = String(divColorIndex(d));
        }
      }
      // the catch-all panel collects excluded divisions too, so it is renamed with them
      const zeroTitle = document.querySelector('[data-divtitle="0"]');
      if (zeroTitle) zeroTitle.textContent = divName(0);

      // the markup lists panels by digit; reorder to the subject order above
      const byDiv = document.getElementById("divScroll");
      if (byDiv){
        for (const d of activeDivisions().concat(0)){
          const panel = byDiv.querySelector(`[data-divpanel="${d}"]`);
          if (panel) byDiv.appendChild(panel);
        }
      }

      // Test names: caption each field with the roster divisions feeding it, so a
      // merged group says so outright, and hide the divisions not in use
      for (let d = 1; d <= 6; d++){
        const cap = document.querySelector(`[data-divcaption="${d}"]`);
        if (cap){
          // Lead with the division this field is for, because that is what the field
          // is. It used to lead with the group's internal id — the lowest digit in the
          // group — which read as a bubbled Roster Level, so a merged field looked as though
          // "2" had swallowed "3". Nobody's digit changes here; only the name does.
          const feeders = rosterDivisionsFor(d).map(r => ROSTER_DIVISIONS[r]);
          const label = divName(d);
          // say where the students come from only where the name does not already say it
          const sameName = (!feeders.length || (feeders.length === 1 && feeders[0] === label));
          cap.innerHTML = divPillHtml(d) + (sameName ? "" : `<span class="capFrom">${escAttr(feeders.join(", "))}</span>`);
        }
        /* The caption is a pill, so it is not a label a screen reader can read out for
           the two boxes under it. They name themselves instead, and the name is the
           division's, which is the thing that just changed. */
        const nameBox = divLabelInput(d);
        if (nameBox) nameBox.setAttribute("aria-label", `Test name printed for ${divName(d)}`);
        const idBox = divTestIdInput(d);
        if (idBox) idBox.setAttribute("aria-label", `Test code bubbled for ${divName(d)}`);
        const field = document.querySelector(`[data-divfield="${d}"]`);
        if (field) field.hidden = !isActiveDivision(d);
      }
      // Keep the Test Names fields in the same order as the first Division sort.
      const testFields = document.getElementById("division");
      if (testFields){
        const active = activeDivisions();
        for (const d of active.concat([1,2,3,4,5,6].filter(d => !active.includes(d)))){
          const field = testFields.querySelector(`[data-divfield="${d}"]`);
          if (field) testFields.appendChild(field);
        }
      }

      // Topic tests only exist at the conventions. The menu stays in place at a
      // regular meet rather than vanishing — a menu that comes and goes is harder to
      // learn than one that is visibly unavailable and says why.
      const topicsOn = hasTopicTests();
      const topicMenu = document.getElementById("menuTopics");
      if (topicMenu){
        topicMenu.dataset.locked = topicsOn ? "0" : "1";
        const sum = topicMenu.querySelector("summary");
        if (sum) sum.setAttribute("aria-disabled", topicsOn ? "false" : "true");
        if (!topicsOn){
          topicMenu.open = false;
          const box = document.getElementById("topicTestsEnabled");
          if (box) box.checked = false;
        }
      }

      // Teams are not entered at a convention, so the whole apparatus steps aside
      document.documentElement.dataset.noteams = hasTeamSelection() ? "0" : "1";
      syncListNote();
      syncTopicChipState();

      // Add Student picks a roster division, so it always lists all six —
      // but it should say where each one lands when the competition remaps
      const addSel = document.getElementById("nativeAddDivision");
      if (addSel){
        for (const opt of addSel.options){
          const rd = Number(opt.value);
          const base = `${ROSTER_DIVISIONS[rd]} (${rd})`;
          const target = p.map[rd];
          if (!remaps && !excludesAnyDivision()) opt.textContent = base;
          else if (!target) opt.textContent = `${base} (not competing)`;
          else {
            const moved = (target !== rd) ? `, bubbles ${target}` : "";
            opt.textContent = `${base} \u2192 ${divName(groupForBubbleDigit(target))}${moved}`;
          }
        }
      }


      // which divisions run decides which part-typed Test IDs are worth stopping for
      syncDivisionTestIdState();

      // the pills this competition draws are the ones the column has to fit
      syncDivColumnWidth();

      /* And the rows themselves, which is where those pills are. The counters and
         summaries come along because they are keyed to the competition too — how many
         teams a division runs decides how many lines its roll has. */
      if (repaintRows){
        renderAllRows();
        syncAllCountersAndSummaries();
        refreshFixTeamsButtons();
      }

      renderTopicTestGrid();
      renderCompetitionBody();
    }

    /**
     * The note under the list toolbar, and the whole of what the chip beside the
     * heading shows. It runs to a screenful, and which of its parts apply changes
     * with the competition: teams are seated at a regular meet and locked at a
     * convention, the Roster Level is remapped under some presets and not others,
     * the Test column is there only when topic tests are on. Run together as one
     * block that was a wall whose middle moved every time the competition did.
     *
     * So it is built as sections, headed by the column each one explains and ordered
     * the way those columns sit in the table. A section that does not apply is left
     * out rather than reworded, and every section that stays keeps its heading and
     * its place — the competition changes what a section says, not where it is.
     */
    function syncListNote(){
      /* One note, six sections, each headed by the column it is about.
         It replaced a 314-word wall that ran to 881px inside a 418px hover bubble —
         less than half of it reachable, and no scrollbar to say so. Every section
         below is short enough that the whole note now fits the bubble at once, and a
         section with nothing to say at this competition is simply not built. */
      const el = document.getElementById("listNote");
      if (!el) return;

      const section = (heading, body) => `<h4 class="tipSection">${heading}</h4><p>${body}</p>`;
      const parts = [];

      parts.push(section("Order",
        `Rows print in the order you see them. Click a heading to sort, or drag a row by
         its grip to place it by hand.`));

      parts.push(section("Added",
        `This column alone decides who is in the PDF. Search and filters change what you
         can see, never who prints.`));

      // only where the sheet is bubbled something other than what the roster says
      if (isRemapping()){
        parts.push(section("Division",
          `This competition bubbles a different division digit than the roster level digit.
           The ID shows what the sheet will get. Click into it to see the roster ID
           underneath.`));
      }

      // only when there is a Test column to describe
      if (topicCfgForRender().enabled){
        parts.push(section("Test",
          `The topic test this student sits, which is what prints in the Test field. Topic tests
           replace the division names entirely: a student with none assigned prints a
           <strong>blank</strong> Test field, shown here as &mdash;. Only a student who is added
           can hold one.`));
      }

      parts.push(section("FAMAT ID",
        `Type the three-digit Student Number. The digits either side are dimmed because they
         are set elsewhere: School ID in PDF Setup, the Roster Level by
         <strong>Change level</strong> on the row. Double-click to unlock all eight.`));

      parts.push(section("Team", hasTeamSelection()
        ? `Only a student who is added can hold a team. This competition runs
           <strong>${maxTeams() === 1 ? "one team" : maxTeams() + " teams"}</strong> per division,
           ${teamSizeUnlimited() ? "with no cap on how many sit on one" : `<strong>${teamSize()}</strong> to a team`}.
           <strong>Fill Teams</strong> seats them down the list, keeping assignments
           that already fit.`
        : `Not entered at ${escAttr(competitionPhrase())}. The top scorers become
           the team afterwards. Every sheet is bubbled 0, and the column stays so that 0 is
           not a surprise.`));

      parts.push(section("Errors",
        `An outlined field has a problem: <span class="sevKey" data-sev="fatal">red</span>
         stops the PDF, <span class="sevKey" data-sev="warn">amber</span> is worth a look.
         Hover it to see what and why.`));

      el.innerHTML = parts.join("");
      window.FBTips?.refreshFrom?.(el);
    }

    /**
     * The settings swatches list the colors actually in use, named by the division
     * using them. The row is built lazily the first time Settings opens, so this has
     * to run from there as well as on every competition change — otherwise the six
     * regular-season subject names sit there for good.
     */
    /* The swatches live in the competition dialog now, beside the divisions they
       color, and renderCompetitionBody draws them — so the standalone row that used
       to sit in Settings, and the label logic that named it, are gone with it. */

    /**
     * The ID as it should be bubbled: the roster ID with its Roster Level
     * replaced by the division this competition puts the student in. Under any
     * preset that does not remap, this returns the roster ID unchanged.
     */
    function bubbledId8(student){
      const id8 = String(student?.id8 || "");
      if (id8.length !== 8) return id8;
      const rosterDigit = id8.charCodeAt(7) - 48;
      const p = competitionPreset();
      const group = p.map[rosterDigit] || 0;
      if (!group) return id8;
      return id8.slice(0, 7) + String(bubbleDigitFor(group));
    }

    /**
     * The digit a division puts in column eight.
     *
     * For every built-in preset a division's group id and its bubbled digit are the
     * same number, which is why this was invisible until custom competitions were
     * allowed to bubble 0-9. `bubble` is the divergence, and only a custom preset
     * carries one.
     */
    function bubbleDigitFor(group){
      const p = competitionPreset();
      const g = Number(group) || 0;
      if (!g) return 0;
      return (p.bubble && p.bubble[g] !== undefined) ? Number(p.bubble[g]) : g;
    }
    
    const DRAFT_SLOT_KEY = "famatbubbler.draftSlots.v1";
    const DRAFT_SLOT_COUNT = 4;
