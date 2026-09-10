    /* ============================================================
       Fill Teams

       Teams filled in the order the list is in. How many teams there are, and how
       many sit on each, are both the competition's: three teams of four at a regional
       meet, one team statewide, and whatever a custom competition says.

       "The order the list is in" is the point of this, and the only thing about it
       that is a decision rather than arithmetic. It used to be alphabetical, which
       meant the seating had nothing to do with anything on screen: the list could be
       sorted by division, dragged into a hand-made order, or sorted by name in the
       other direction, and the fill ignored all of it. Now it walks that division's
       students top to bottom exactly as the table shows them — which is also the
       order their pages come out of the PDF — so the way to put a particular four on
       team 1 is to put them at the top, by dragging or by sorting on a column.

       Only students who are added to the PDF are here at all. Somebody who is not
       printing has no team by definition now, and seating them would be undone the
       moment the fill ran again.
       ============================================================ */

    /**
     * One division's added students, in list order, top to bottom.
     * Empty when the division has nobody in the PDF — which is not an error, just
     * a division with nothing to seat.
     */
    function fillOrderForDivision(div){
      const inDiv = byDivision.get(div);
      if (!inDiv || !inDiv.size) return [];
      const out = [];
      for (const rid of getPageOrder()){
        if (!inDiv.has(rid)) continue;
        const s = getStudent(rid);
        if (s && s.included) out.push(s);
      }
      return out;
    }

    function isDivisionOptimal(div){
      if (div === 0) return true;

      const inc = fillOrderForDivision(div);
      if (!inc.length) return true;

      // Seated as far as this competition's seats allow; anyone past them is meant
      // to stay unseated, so a division with 14 students and 12 seated is done.
      const nums = teamNumbers();
      const seats = teamSeats();
      const size = teamSize();
      const counts = [0,0,0,0,0,0,0,0,0,0];
      let seated = 0;
      for (const s of inc){
        const t = teamBucket(s.team);
        if (t){ counts[t] += 1; seated += 1; }
      }
      if (seated !== Math.min(seats, inc.length)) return false;
      // nobody may sit on a team this competition does not run, and none may be over size
      for (const t of [1,2,3,4,5,6,7,8,9]){
        if (counts[t] > size) return false;
        if (counts[t] > 0 && nums.indexOf(t) < 0) return false;
      }
      // sequential fill: each team full before the next one is started
      for (let i = 1; i < nums.length; i++){
        if (counts[nums[i]] > 0 && counts[nums[i-1]] < size) return false;
      }

      /* ...and everyone past the last seat is on a settled 0 rather than a blank,
         because that is what the fill would leave them on. Without this the dialog
         would call a division done while the fill still had blanks to close, and
         pressing the button would have moved something after all. */
      for (const s of inc){
        if (!teamBucket(s.team) && s.team !== 0) return false;
      }

      return true;
    }

    /**
     * What one division's teams should be after a fill, as rowId -> 0..9, where 0 is
     * no team. Pure: it reads the division and returns a plan, and touching nothing
     * is what lets the same code serve one division and all six.
     *
     * 0 is an answer here, not an absence. Only added students are in this map, and a
     * fill is a decision about all of them: the ones the seats reached get a team, and
     * the ones they did not are on no team — which is what a bubbled 0 says on the
     * sheet. Leaving those blank instead would say "still to be decided" about a
     * question the fill has just decided, and would leave a coach to work out by hand
     * which of the blanks were deliberate. The way to say "decide this later" is to
     * not run the fill, or to blank the cell afterwards.
     *
     * A division nobody has seated yet is simply dealt out, a team's worth at a time,
     * down the list. Where teams are already partly entered the existing picks are kept
     * as far as they fit — the fill is a way to finish a job by hand, not to overrule
     * it — and only overflow past the team size, gaps below it, and out-of-order teams
     * are moved.
     *
     * How many teams there are to fill is the competition's business, not this
     * function's: at a regional meet nums is [1,2,3], statewide it is [1]. Every step
     * below walks that list rather than counting to three, so the one-team case is
     * the same algorithm with a shorter list, not a special case.
     *
     * @param {"keep"|"redo"} [mode] "keep" is the above. "redo" throws the existing
     *   picks away and deals the division again from the top — which is not a second
     *   algorithm but the same one entering by the door an untouched division already
     *   uses, so the two can never drift apart.
     */
    function computeTeamFill(div, mode){
      const inc = fillOrderForDivision(div);
      const desired = new Map();
      if (!inc.length) return desired;

      const nums = teamNumbers();
      const seats = teamSeats();
      const size = teamSize();

      // "X" is the no-team marker; seed it as 0, or `desired.get(id) || 0` yields
      // the truthy string and the fill steps below never treat it as a gap.
      // A team the competition no longer runs is seeded as 0 for the same reason.
      for (const s of inc){
        const t = teamBucket(s.team);
        desired.set(s.rowId, (t && nums.indexOf(t) >= 0) ? t : 0);
      }

      // A redo says "there is nothing here to keep", which is exactly what the branch
      // below already knows how to do. The seeding above is overwritten wholesale in
      // that branch, so it costs nothing to have run.
      const anyTeam = (mode === "redo")
        ? false
        : inc.some(s => (desired.get(s.rowId) || 0) !== 0);

      const counts = () => {
        const c = [0,0,0,0,0,0,0,0,0,0];
        for (const s of inc) c[desired.get(s.rowId) || 0] += 1;
        return c;
      };
      const nextAvailableSlotTeam = () => {
        const c = counts();
        for (const t of nums) if (c[t] < size) return t;
        return 0;
      };

      if (!anyTeam){
        // Nothing entered: straight down the list, a team's worth at a time, until
        // the seats run out. Anyone past them is left without a team.
        let idx = 0;
        for (const s of inc){
          // With no cap the divide is idx/Infinity, which is 0 for everyone: an
          // uncapped competition seats the whole division on team 1, which is what
          // "each team full before the next is started" means when none ever fills.
          desired.set(s.rowId, (idx < seats) ? nums[Math.floor(idx / size)] : 0);
          idx++;
        }
        return desired;
      }

      // Step 1: resolve overflows per team, moving the lowest in the list out first
      for (const teamNum of nums){
        while (true){
          const c = counts();
          if (c[teamNum] <= size) break;

          const members = inc.filter(s => desired.get(s.rowId) === teamNum);
          const toMove = members[members.length - 1];   // lowest down the list
          const slot = nextAvailableSlotTeam();
          if (slot === 0){
            desired.set(toMove.rowId, 0);
            break;
          }
          // nextAvailableSlotTeam already enforces sequential fill by construction
          desired.set(toMove.rowId, slot);
        }
      }

      // Step 2: fill the gaps, keeping existing picks. Unseated students come first;
      // failing that, someone is pulled down from a later team, which is the same
      // sequential rule read backwards.
      for (const teamNum of nums){
        while (true){
          const c = counts();
          if (c[teamNum] >= size) break;
          const candidates = inc.filter(s => {
            const t = desired.get(s.rowId) || 0;
            if (t === 0) return true;
            return t > teamNum;      // only ever pull down from a later team
          });
          if (!candidates.length) break;
          desired.set(candidates[0].rowId, teamNum);
        }
      }

      // Step 3: no team started while the one before it is short
      while (true){
        let moved = false;
        const c = counts();
        for (let i = 1; i < nums.length; i++){
          const here = nums[i], prev = nums[i-1];
          if (c[here] > 0 && c[prev] < size){
            const from = inc.find(s => desired.get(s.rowId) === here);
            if (!from) continue;
            desired.set(from.rowId, prev);
            moved = true;
            break;
          }
        }
        if (!moved) break;
      }

      // Step 4: any seat still open goes to the next unseated student down the list
      while (true){
        const slot = nextAvailableSlotTeam();
        if (slot === 0) break;
        const x = inc.find(s => (desired.get(s.rowId) || 0) === 0);
        if (!x) break;
        desired.set(x.rowId, slot);
      }

      return desired;
    }

    /**
     * Whether running the fill over this division in this mode would move anybody.
     * The honest test, and the only one available under "redo": a division can be
     * validly seated and still not be seated the way a fresh deal down the list
     * would seat it, which is the whole reason a redo exists.
     */
    function fillWouldChange(div, mode){
      const inc = fillOrderForDivision(div);
      if (!inc.length) return false;
      const desired = computeTeamFill(div, mode);
      for (const [rowId, slot] of desired){
        const s = getStudent(rowId);
        if (!s) continue;
        if (s.team !== slot) return true;
      }
      return false;
    }

    /** One question, asked the same way by the dialog, its buttons and the fill. */
    function fillHasWork(div, mode){
      if (!div) return false;
      if (!fillOrderForDivision(div).length) return false;
      // "keep" has a cheaper answer that says the same thing — a division already
      // seated the way the rules want is one the fill has nothing to move.
      return (mode === "redo") ? fillWouldChange(div, "redo") : !isDivisionOptimal(div);
    }

    /**
     * Run the fill over some divisions and land the whole lot on one undo step —
     * one click, one Undo, whether it moved one division or six.
     * @returns {number} how many students changed team
     */
    function applyTeamFill(divs, label, mode){
      const diffs = [];
      for (const div of divs){
        if (!div) continue;
        if (!fillHasWork(div, mode)) continue;

        const desired = computeTeamFill(div, mode);
        for (const [rowId, slot] of desired){
          const s = getStudent(rowId);
          if (!s) continue;
          // The slot is the answer, 0 included: see computeTeamFill on why the fill
          // writes a settled 0 rather than leaving a blank behind.
          const next = slot;
          if (s.team === next) continue;
          const prev = s.team;
          s.team = next;
          bumpCountsOnTeamChange(s, prev, next);
          diffs.push({ type:"setTeam", rowId, prev, next });
          rerenderRow(rowId);
        }
      }
      if (diffs.length) pushUndo({ type:"batch", label, diffs });
      return diffs.length;
    }

    /* The undo step says which of the two ran, because they are not the same step to
       take back: one finished a job, the other threw one away. */
    function fixTeamsForDivision(div, mode){
      if (!div) return 0;
      const verb = (mode === "redo") ? "Redo" : "Fill";
      return applyTeamFill([div], `${verb} teams (${divShort(div)})`, mode);
    }

    function fixTeamsAllDivisions(mode){
      const verb = (mode === "redo") ? "Redo" : "Fill";
      return applyTeamFill([1,2,3,4,5,6], `${verb} teams (all divisions)`, mode);
    }

    /** Everything a fill click has to touch afterwards, in one place.
        refreshFixTeamsButtons redraws the dialog too, when it is the thing open. */
    function afterTeamFill(){
      syncAllCountersAndSummaries();
      syncSticky();
      refreshFixTeamsButtons();
    }

    /* ---- the Fill Teams dialog -------------------------------------------------
       The button used to do the whole roster on one click, with the rules only in a
       tooltip. Seating twelve people per division is not a thing to do by accident,
       and the rules are worth more than a tooltip's worth of room — so the button
       opens this, and the one-click buttons live in here where the explanation is.

       What the dialog shows is a state per division, not an explanation per division.
       The rules are in the paragraph at the top, said once; each row below is a pill,
       a glyph and a count, and a reader scanning six of them is looking for the ones
       that are still the accent color. */

    /** Which of the two fills the dialog is offering. Not persisted: it describes what
        you are about to do, not how you like the app set up, and a redo left armed
        from last week is the one setting here that could quietly cost work. */
    let fillTeamsMode = "keep";

    /** ready = pressing it would move somebody. done = it would not. empty = nobody to
        move. Only "ready" is pressable, and only "ready" is lit. */
    const FILL_STATE_GLYPH = {
      done:  `<svg class="glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.4 8.4 6.5 11.5 12.6 5"/></svg>`,
      ready: `<svg class="glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.6 8h9"/><path d="M8.4 4.6 11.8 8l-3.4 3.4"/></svg>`,
      empty: `<svg class="glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.6 8h8.8"/></svg>`,
    };

    function fillTeamsDivisionState(div){
      const inc = fillOrderForDivision(div);
      return {
        div,
        added: inc.length,
        total: byDivision.get(div)?.size || 0,
        left: fillHasWork(div, fillTeamsMode),
        // as many seats as the competition runs; anyone past them is not a problem,
        // just not seated
        seats: Math.min(teamSeats(), inc.length),
      };
    }

    function renderFillTeamsBody(){
      const host = document.getElementById("fillTeamsDivs");
      if (!host) return;
      const redo = (fillTeamsMode === "redo");
      const noTeams = document.documentElement.dataset.noteams === "1";

      const divs = activeDivisions().filter(d => d >= 1 && d <= 6);
      host.innerHTML = divs.map((d) => {
        const st = fillTeamsDivisionState(d);
        const state = !st.added ? "empty" : (st.left ? "ready" : "done");
        // Numbers, not sentences. The sentence is in the paragraph above, and these
        // six lines only have to differ from each other.
        const label = (state === "empty") ? "Nobody added"
                    : (state === "done")  ? `${st.seats} of ${st.added} seated`
                                          : `Seats ${st.seats} of ${st.added}`;
        const why = (state === "empty")
          ? "Nobody in this division is added to the PDF."
          : (state === "done")
            ? (redo ? "Dealing this division again would land on exactly what is there."
                    : "Already seated this way. Nothing to change.")
            : (redo
                ? `Deal all ${st.added} added ${st.added === 1 ? "student" : "students"} again from the top, keeping nothing.`
                : `Seat ${st.seats} of ${st.added} added ${st.added === 1 ? "student" : "students"}, in list order.`);
        const off = (state !== "ready" || noTeams || pdfInProgress) ? " disabled" : "";
        return `<button type="button" class="fillRow" data-action="fixTeamsOne" data-div="${d}"
                  data-state="${state}"${off} title="${escAttr(why)}">
            ${divPillHtml(d, divShort(d))}
            <span class="fillRowState">${FILL_STATE_GLYPH[state]}<span>${escAttr(label)}</span></span>
          </button>`;
      }).join("");

      // the mode segment, and what each half of it means
      for (const b of document.querySelectorAll("#fillModeSeg button[data-mode]")){
        b.dataset.on = (b.dataset.mode === fillTeamsMode) ? "1" : "0";
        b.disabled = noTeams;
      }
      const modeNote = document.getElementById("fillModeNote");
      if (modeNote){
        modeNote.textContent = redo
          ? "Every division is dealt again from the top of the list. Teams entered by hand are lost, but Undo brings them back."
          : "Teams already entered are kept wherever they still fit. Only gaps, overflow and out-of-order teams move.";
      }

      // how many seats there are is the competition's, so the dialog says which it is
      const seatsNote = document.getElementById("fillTeamsSeats");
      if (seatsNote){
        seatsNote.textContent = teamSizeUnlimited()
          ? (maxTeams() === 1
              ? "This competition enters one team per division and sets no cap on its size, so every added student is seated on it."
              : `This competition enters ${maxTeams()} teams per division and sets no cap on their size, so every added student is seated on Team 1.`)
          : (maxTeams() === 1
              ? `This competition enters one team per division, so ${teamSize()} students are seated and the rest are left without a team.`
              : `This competition enters ${maxTeams()} teams of ${teamSize()} per division, so nobody past ${teamSeats()} is seated.`);
      }

      const anyLeft = divs.some(d => fillHasWork(d, fillTeamsMode));
      const all = document.getElementById("btnFillTeamsAll");
      if (all){
        all.textContent = redo ? "Redo Every Division" : "Fill Every Division";
        all.disabled = noTeams || !anyLeft || pdfInProgress;
        if (noTeams) all.title = TEAM_LOCK_NOTE;
      }
      const note = document.getElementById("fillTeamsAllNote");
      if (note){
        note.textContent = anyLeft
          ? "Runs every division above that still has something to change."
          : (redo ? "Dealing again would change nothing anywhere."
                  : "Every division is already seated this way.");
      }
    }

    function openFillTeamsModal(){
      window.FBTips?.hide(true);
      // Back to "add to existing" every time it opens. The destructive half of the
      // switch is a decision about this fill, not a setting, and one left armed from
      // the last visit would be the one control here that loses work silently.
      fillTeamsMode = "keep";
      renderFillTeamsBody();
      const back = document.getElementById("fillTeamsModalBack");
      if (back) back.style.display = "flex";
    }

    function closeFillTeamsModal(){
      const back = document.getElementById("fillTeamsModalBack");
      if (back) back.style.display = "none";
    }

    // ====== Div counters button enable/disable ======
    function refreshFixTeamsButtons(){
      /* At a convention nobody enters teams, so these do nothing — but they stay put
         and go quiet rather than vanishing, which is the rule the Team column beside
         them already follows. A disabled button holds the toolbar's shape and can
         still say why; a removed one reflows the toolbar and explains nothing. */
      const noTeams = document.documentElement.dataset.noteams === "1";

      // by division view buttons
      for (const d of [1,2,3,4,5,6]){
        const btns = document.querySelectorAll(`button[data-action="fixTeams"][data-div="${d}"]`);
        const disabled = isDivisionOptimal(d);
        for (const b of btns){
          b.disabled = noTeams || disabled || pdfInProgress;
          if (noTeams) b.title = TEAM_LOCK_NOTE;
        }
      }
      // the button that opens the dialog is always live; the dialog says what is left
      const g = document.querySelector(`button[data-action="openFillTeams"]`);
      if (g){
        g.disabled = noTeams || pdfInProgress;
        if (noTeams) g.title = TEAM_LOCK_NOTE;
      }
      // and if that dialog is what is open, it is showing state that just moved.
      // renderFillTeamsBody settles every control inside it, Fill Every Division
      // included, so there is nothing to set here first and then set again.
      if (document.getElementById("fillTeamsModalBack")?.style.display === "flex"){
        renderFillTeamsBody();
      } else {
        const all = document.getElementById("btnFillTeamsAll");
        if (all){
          all.disabled = noTeams || all.disabled;
          if (noTeams) all.title = TEAM_LOCK_NOTE;
        }
      }
    }

