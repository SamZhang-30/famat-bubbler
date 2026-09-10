    // ====== Team popover ======
    /** Under the control that opened it, and inside the window whatever that costs. */
    /** The height the pinned page header is currently taking off the top, or 0. */
    function pageHeadHeight(){
      const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--pageHeadH"));
      return Number.isFinite(v) ? v : 0;
    }

    /**
     * Put a popover against the control that opened it.
     *
     * `prefer` is the side to try first. A control in the table opens downward, the
     * way the menus pinned along the top do. The selection bar is the inverse case:
     * it sits at the foot of the window, so its pickers open upward, above the button
     * — opening down there meant clamping to the viewport, which laid the picker over
     * the bar that opened it.
     *
     * Sideways it runs rightward from the button's own left edge, and only slides
     * left when the window is too narrow to hold it there. The other side is used
     * whenever the preferred one does not fit.
     */
    function placePopoverNear(pop, el, { prefer = "down" } = {}){
      const r = el.getBoundingClientRect();
      const pad = 8;
      const gap = 6;
      const w = pop.offsetWidth, h = pop.offsetHeight;

      // rightward from the button, pulled back only as far as the window demands
      const left = Math.max(pad, Math.min(window.innerWidth - w - pad, r.left));

      // clamping to the viewport top alone would tuck a popover behind the pinned header
      const ceiling = pad + pageHeadHeight();
      const floor = window.innerHeight - h - pad;
      const above = r.top - gap - h;
      const below = r.bottom + gap;
      const fitsAbove = above >= ceiling;
      const fitsBelow = below <= floor;

      let top;
      if (prefer === "up") top = fitsAbove ? above : (fitsBelow ? below : above);
      else                 top = fitsBelow ? below : (fitsAbove ? above : below);
      top = Math.max(ceiling, Math.min(floor, top));

      pop.style.left = `${left + window.scrollX}px`;
      pop.style.top = `${top + window.scrollY}px`;
      pop.focus?.();
    }

    /** A picker opened from the selection bar belongs above it; one on a row, below. */
    function popoverSide(context){
      return (context && context.type === "batch") ? "up" : "down";
    }

    /** Redraws the picker for the competition currently set. */
    function renderTeamPopoverBody(){
      const body = document.getElementById("teamPopoverBody");
      const title = document.getElementById("teamPopoverTitle");
      if (!body) return;
      const nums = teamNumbers();
      /* Three kinds of answer, not two.
         1..n  seat this student on that team.
         0     no team, settled — the sheet bubbles a 0 in column nine, which is what
               a division that enters nobody carries. Always on offer, whatever the
               competition: "this one is not on a team" is a fact a coach can know at
               any meet, and 0 is how the sheet says it.
         blank the team is still to be decided. Nothing is bubbled, so the column can
               be filled in by hand after printing. This is the one 0 does not
               replace, and the reason both are here. */
      body.innerHTML = nums.map(t =>
          `<button type="button" data-action="pickTeam" data-team="${t}">${t}</button>`
        ).join("")
        + `<button type="button" data-action="pickTeam" data-team="0" title="No team. The sheet bubbles 0">0</button>`
        + `<button type="button" data-action="pickTeam" data-team="X" title="Team still to be decided. Nothing is bubbled">\u2014</button>`;
      if (title){
        title.innerHTML = "Set Team "
          + nums.map(t => `<span class="kbd">${t}</span>`).join("")
          + `<span class="kbd">0</span><span class="kbd">X</span>`;
      }
    }

    function openTeamPopoverNear(el, context){
      popoverContext = context;
      renderTeamPopoverBody();
      teamPopover.style.display = "block";
      placePopoverNear(teamPopover, el, { prefer: popoverSide(context) });
    }

    function closeTeamPopover(){
      teamPopover.style.display = "none";
      popoverContext = null;
    }

    function pickTeam(teamVal){
      if (!popoverContext) return;
      const next = normalizeTeamValue(teamVal);

      if (popoverContext.type === "row"){
        setTeam(popoverContext.rowId, next, {recordUndo:true, label:"Set team"});
      } else if (popoverContext.type === "batch"){
        batchSetTeam(popoverContext.rowIds, next);
      }

      closeTeamPopover();
      syncAllCountersAndSummaries();
      syncSticky();
      refreshFixTeamsButtons();
    }

