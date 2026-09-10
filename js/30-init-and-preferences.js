    // ====== Init ======
    // Ensure top buttons mirror view state
    function initViewSeg(){
      setListView(loadListView(), {persist:false});
    }

    // On load
    document.addEventListener("DOMContentLoaded", () => {
      loadUndoState();
      // There is no list yet, and this block draws one at the bottom either way.
      applyCompetitionToUI({ repaintRows: false });
      setOrder(localStorage.getItem(NAME_ORDER_KEY) || "lastfirst", {persist:false});
      syncFilterPlaceholder();
      renderSlots();
      renderDraftSlots();
      renderTopicTestGrid();
      initViewSeg();
      syncTopicTestsUI();

      // Put back the workspace this browser was last in. applyFullSnapshot repaints
      // everything on its way out, so the calls below are only for the empty case.
      const restored = loadCurrent();
      if (restored){
        applyFullSnapshot(restored,{persist:false});
        storageNotice("Saved in this browser");
      } else {
        // Browsers can restore text controls across reloads independently of storage.
        // With no saved workspace, a restored school prefix must not become a setting.
        const schoolId = document.getElementById("schoolId4");
        schoolId.value = "";
        schoolId.dataset.committed = "";
        document.getElementById("addSchoolId4").value = "";
        syncAddStudentSchool();
        syncSchoolIdApply();
        // Nothing to restore, so any undo history left over belongs to a workspace
        // that no longer exists — replaying it would corrupt an empty list.
        undoStack.length = 0;
        redoStack.length = 0;
        persistUndoState();
        storageNotice("No changes made yet");
      }
      syncUndoUI();

      renderAllRows();
      syncAllCountersAndSummaries();
      syncSticky();
      refreshFixTeamsButtons();
    });

    /* ============================================================
       Preferences UI, setup-bar menus and live student search.
       Kept in its own scope so it only talks to the app through the
       DOM (buttons it clicks, attributes it sets).
       ============================================================ */
    (function(){
      const P = window.FBPrefs;
      if (!P) return;

      // Rows carry inline tints computed at render time, so a color change
      // needs a rerender: re-clicking the active view button does exactly that.
      function rerenderRows(){
        renderAllRows();
        syncAllCountersAndSummaries();
      }

      // ---------- settings modal ----------
      const back = document.getElementById("settingsModalBack");

      function syncSettingsUI(){
        document.querySelectorAll("[data-pref-seg]").forEach((seg) => {
          const key = seg.dataset.prefSeg;
          seg.querySelectorAll("button[data-val]").forEach((b) => {
            b.dataset.on = (b.dataset.val === P.get(key)) ? "1" : "0";
          });
        });
        document.querySelectorAll("[data-pref-check]").forEach((el) => {
          el.checked = !!P.get(el.dataset.prefCheck);
        });
        document.querySelectorAll("[data-pref-color]").forEach((el) => {
          el.value = P.get(el.dataset.prefColor) || "#7aa2ff";
        });
        document.querySelectorAll("[data-div-color]").forEach((el) => {
          el.value = P.divColor(el.dataset.divColor);
        });
      }

      function openSettings(){
        syncSettingsUI();
        back.style.display = "flex";
      }
      function closeSettings(){ back.style.display = "none"; disarmResetSettings(); }
      /* The app's one way in from outside this scope. Settings hands off to the
         competition dialog for the division colors, and that hand-off has to be able
         to shut this. */
      window.FBSettings = { close: closeSettings, open: openSettings };

      document.addEventListener("click", (ev) => {
        const el = ev.target.closest && ev.target.closest("[data-action]");
        const action = el && el.dataset ? el.dataset.action : "";

        // any click that is not the armed button itself puts it back to rest
        if (action !== "resetSettings") disarmResetSettings();
        if (action !== "revertCustom" && action !== "emptyCustom") disarmCustomButtons();

        if (action === "openSettings"){ openSettings(); return; }
        if (action === "closeSettings"){ closeSettings(); return; }
        if (action === "resetSettings"){
          /* The only action in the app that undo cannot reach: preferences are not
             workspace state and never entered the stack. It was styled identically to
             the four reversible danger buttons and sat one press from Done. Rather
             than adding the app's only confirmation dialog, the button now arms
             itself — one press to ask, a second to do — which is reversible by simply
             not pressing again, and needs no modal. */
          if (el.dataset.armed !== "1"){
            el.dataset.armed = "1";
            el.dataset.label = el.textContent;
            el.textContent = "Confirm (press again)";
            el.title = "This one cannot be undone. Press again to reset every preference, or click elsewhere to keep them.";
            clearTimeout(resetArmTimer);
            resetArmTimer = setTimeout(() => disarmResetSettings(), 4000);
            return;
          }
          disarmResetSettings();
          P.reset();
          syncSettingsUI();
          rerenderRows();
          toast("Preferences reset to defaults");
          return;
        }
        const segBtn = ev.target.closest && ev.target.closest("[data-pref-seg] button[data-val]");
        if (segBtn){
          P.set(segBtn.closest("[data-pref-seg]").dataset.prefSeg, segBtn.dataset.val);
          syncSettingsUI();
          return;
        }

        if (back && ev.target === back) closeSettings();
      });

      document.addEventListener("change", (ev) => {
        const t = ev.target;
        if (!t || !t.dataset) return;
        if (t.dataset.prefCheck){ P.set(t.dataset.prefCheck, !!t.checked); return; }
        if (t.dataset.prefColor){ P.set(t.dataset.prefColor, t.value); return; }
        if (t.dataset.divColor){
          /* The step spans the whole interaction, not this event: dragging through a
             picker fires `input` a hundred times and `change` once, at the end. The
             palette as it stood before the first of those is what Undo has to go back
             to, so it was captured there and is closed here — one press, one step,
             however many colors the pointer passed through on the way. */
          const before = divColorUndoBase ?? P.paletteSnapshot();
          divColorUndoBase = null;
          P.setDivColor(t.dataset.divColor, t.value);
          rerenderRows();
          // this palette now differs from the built-in set, so the revert wakes up —
          // it used to wait for something else to repaint the dialog it sits in
          syncRevertColorsButtons();
          pushDivColorUndo(before, "Set a division color");
          return;
        }
      });

      /* Where the palette stood when the pointer went into a swatch. Held across the
         drag and spent by the `change` above; null the rest of the time. */
      let divColorUndoBase = null;
      document.addEventListener("input", (ev) => {
        const t = ev.target;
        if (!t || !t.dataset) return;
        if (t.dataset.prefColor){ P.set(t.dataset.prefColor, t.value); }
        else if (t.dataset.divColor){
          // dragging through a color picker fires input, not change
          if (divColorUndoBase === null) divColorUndoBase = P.paletteSnapshot();
          P.setDivColor(t.dataset.divColor, t.value);
          syncRevertColorsButtons();
        }
      });

      /* ---------- dragging a division into place ----------
         The order the divisions are listed in is the order the Division column sorts
         by and the order the Summary panels stack in, so arranging them here is the
         only way to say what that order should be. Same interaction as the student
         list: grab the dots, drop above or below another row. */
      let dragDivId = null;
      const clearDivDropMarks = () => {
        document.querySelectorAll("#customDivList .customDivRow").forEach((el) => {
          el.classList.remove("dropBefore", "dropAfter");
        });
      };
      const endDivDrag = () => {
        dragDivId = null;
        clearDivDropMarks();
        document.querySelectorAll("#customDivList .isDragging").forEach(el => el.classList.remove("isDragging"));
      };

      document.addEventListener("dragstart", (ev) => {
        const grip = ev.target?.closest?.("[data-divgrip]");
        if (!grip) return;
        dragDivId = Number(grip.dataset.divgrip);
        const row = grip.closest(".customDivRow");
        row?.classList.add("isDragging");
        try{
          ev.dataTransfer.effectAllowed = "move";
          ev.dataTransfer.setData("text/plain", String(dragDivId));
          if (row) ev.dataTransfer.setDragImage(row, 24, row.offsetHeight / 2);
        }catch(e){}
      });

      document.addEventListener("dragover", (ev) => {
        if (dragDivId == null) return;
        const row = ev.target?.closest?.(".customDivRow");
        ev.preventDefault();
        clearDivDropMarks();
        if (!row || Number(row.dataset.divrow) === dragDivId) return;
        const r = row.getBoundingClientRect();
        row.classList.add(ev.clientY < r.top + r.height / 2 ? "dropBefore" : "dropAfter");
      });

      document.addEventListener("drop", (ev) => {
        if (dragDivId == null) return;
        ev.preventDefault();
        const row = ev.target?.closest?.(".customDivRow");
        const moving = dragDivId;
        const target = row ? Number(row.dataset.divrow) : null;
        const after = row ? (ev.clientY >= row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2) : false;
        endDivDrag();
        if (target == null || target === moving) return;

        updateCustom((next) => {
          const from = next.order.indexOf(moving);
          if (from < 0) return;
          next.order.splice(from, 1);
          let to = next.order.indexOf(target);
          if (to < 0) return;
          next.order.splice(after ? to + 1 : to, 0, moving);
        }, { repool: false, label: "Reorder divisions" });
      });

      document.addEventListener("dragend", endDivDrag);

      /* ---------- the custom competition editor's own fields ----------
         All on `change` rather than `input`: every commit re-pools the students and
         pushes an undo step, so a name typed letter by letter would be twelve of
         them. The field settles when you leave it. */
      document.addEventListener("change", (ev) => {
        const t = ev.target;
        if (!t || !t.dataset) return;

        // where one roster division lands
        if (t.dataset.customMap){
          /* Where a roster level lands. This is the only edit here that moves
             students, so it is the only one that re-pools. Un-assigning a level
             leaves the division standing and empty — deleting it as a side effect
             was the old behavior and it meant you could not park a level for a
             moment without losing the division it came from. */
          const d = Number(t.dataset.customMap);
          const to = Number(t.value) || 0;
          /* The option is disabled, so this is only reachable by a keyboard commit in
             a browser that lets one through. The rule belongs here anyway: it is the
             one place the value is written, and a rule stated only in the markup is a
             rule that holds until something else builds the markup. */
          if (to && !String(customState().divisions[to]?.name || "").trim()){
            toast("Name that division first in the Custom division editor.");
            renderCustomEditor();
            return;
          }
          updateCustom((next) => { next.map[d] = to; }, { label: "Move a roster level" });
          return;
        }

        // What a division is called. Nobody changes division, so no re-pooling.
        if (t.dataset.customName){
          if (competitionState.preset !== "custom") return;
          const id = Number(t.dataset.customName);
          const name = String(t.value || "");
          updateCustom((next) => {
            if (next.divisions[id]) next.divisions[id].name = name;
          }, { repool: false, label: "Rename a division" });
          return;
        }

        /* Which digit a division bubbles. The identity is the division, not the
           digit, so this is only a change of what column eight gets — the students
           stay exactly where they are and the list does not have to be rebuilt. The
           select only offers digits nobody else holds. */
        if (t.dataset.customDigit){
          const id = Number(t.dataset.customDigit);
          const to = Number(t.value);
          if (!Number.isFinite(to)) return;
          updateCustom((next) => {
            if (next.divisions[id]) next.divisions[id].digit = to;
          }, { repool: false, label: "Set a bubbled digit" });
          return;
        }

        /* The type-in half of People per team, for the sizes the 1-6 segment does not
           carry. Emptied means Unlimited, which is the same 0 the segment's own
           Unlimited button writes — so the box and the button are two ways to say one
           thing rather than two settings that can disagree. */
        if (t.id === "customTeamSizeInput"){
          const raw = String(t.value || "").replace(/\D/g, "").slice(0, 2);
          const n = raw ? Number(raw) : 0;
          if (!(Number.isInteger(n) && n >= 0 && n <= MAX_TEAM_SIZE)){
            renderCustomEditor();
            return;
          }
          setCustomTeamSize(n);
          return;
        }
      });

      // Digits only, as they are typed — the same treatment every other numeric box
      // in this app gets, so a letter never lands in one and then vanishes on blur.
      document.getElementById("customTeamSizeInput")?.addEventListener("input", (ev) => {
        const clean = String(ev.target.value || "").replace(/\D/g, "").slice(0, 2);
        if (ev.target.value !== clean) ev.target.value = clean;
      });

      // ---------- setup bar: one menu open at a time, click-away to close ----------
      const setupDetails = () => document.querySelectorAll(".setupBar > details");

      /* iOS clips fixed descendants of a momentum-scrolling element. The setup
         strip is intentionally a horizontal scroller, so an open menu can disappear
         behind the page content on an iPhone. Portal the open body to <body> while
         keeping its owner <details> in the setup bar. */
      const menuBody = (d) => d?._fbMenuBody || d?.querySelector(".topSectionBody");
      function portalMenu(d){
        const body = menuBody(d);
        if (!body || body.parentNode === document.body) return body;
        d._fbMenuBody = body;
        body.dataset.menuOwner = d.id;
        body.dataset.portaled = "1";
        document.body.appendChild(body);
        return body;
      }
      function unportalMenu(d){
        const body = menuBody(d);
        if (!body || body.parentNode === d) return body;
        d.appendChild(body);
        delete body.dataset.portaled;
        return body;
      }

      // Every menu opens down from its own summary and rightward from its left edge.
      // That is the default and the only thing the width can take away: the box is
      // pulled left just far enough to stay on screen, and never flipped to hang off
      // the summary's right edge, which is what used to make three of them open the
      // opposite way from the other two.
      //
      // The body is position:fixed, because the bar it lives in scrolls sideways and
      // would otherwise clip it — so both coordinates are set here rather than by CSS.
      function fitMenu(d){
        const body = menuBody(d);
        const summaryEl = d.querySelector("summary");
        if (!body || !summaryEl) return;

        const margin = 12;
        const gap = 8;
        const summary = summaryEl.getBoundingClientRect();

        // measured with left/top already applied, so only its size is read from it
        const width = body.offsetWidth;
        const maxLeft = Math.max(margin, window.innerWidth - width - margin);
        const left = Math.min(Math.max(summary.left, margin), maxLeft);

        /* Safari's keyboard changes the visual viewport and may scroll the page to
           keep a focused textarea near the keyboard. A fixed menu must not follow
           that scroll above the visible screen, so keep its top edge in the current
           viewport while retaining the summary anchor whenever there is room. */
        const viewport = window.visualViewport;
        const viewportWidth = viewport ? viewport.width : window.innerWidth;
        const viewportTop = viewport ? viewport.offsetTop : 0;
        const viewportHeight = viewport ? viewport.height : window.innerHeight;
        const minTop = viewportTop + margin;
        const maxTop = Math.max(minTop,
          viewportTop + viewportHeight - stickyBarHeight() - margin - 160);
        const top = Math.round(Math.min(Math.max(summary.bottom + gap, minTop), maxTop));
        const mobileCenter = viewportWidth <= 620;
        const finalLeft = mobileCenter
          ? Math.max(margin, (viewportWidth - width) / 2)
          : left;
        body.style.left = Math.round(finalLeft) + "px";
        body.style.right = "auto";
        body.style.top = top + "px";
        // The CSS ceiling assumes the pinned header; an unpinned one can sit anywhere
        // down the page, so the room left below the summary is what actually caps it.
        const roomBelow = viewportTop + viewportHeight - top - stickyBarHeight() - margin;
        body.style.maxHeight = Math.max(160, Math.round(roomBelow)) + "px";
        // it has a real position now, so it is allowed to be seen
        body.dataset.placed = "1";
      }

      function stickyBarHeight(){
        const foot = document.getElementById("stickyBar");
        return foot ? Math.ceil(foot.getBoundingClientRect().height) : 0;
      }

      const refitOpenMenus = () => {
        setupDetails().forEach((d) => { if (d.open) fitMenu(d); });
      };

      /** Open it and place it together, so the first frame it exists in is the right one. */
      function openMenuPlaced(d){
        setupDetails().forEach((o) => { if (o !== d) closeMenu(o); });
        d.open = true;
        portalMenu(d);
        fitMenu(d);
        // An opened menu that is scrolled off the side of the bar has no visible
        // trigger, so bring its summary into the bar before pinning the body to it.
        d.scrollIntoView({ block: "nearest", inline: "nearest" });
        fitMenu(d);
        window.FBSyncScrollFades?.();
        requestAnimationFrame(() => window.FBSyncScrollFades?.());
      }

      function closeMenu(d){
        unportalMenu(d);
        d.open = false;
        // Next time it opens it has to be placed again before it may be seen. Without
        // this, a menu opened after the window moved would flash at its old spot.
        menuBody(d)?.removeAttribute("data-placed");
      }

      /* Clicking a summary is the ordinary way in, and the one that used to flicker:
         the browser flips `open` as the click's activation behavior and queues the
         toggle event as a separate task, leaving room for a paint in between. Driving
         the open here puts the state change and the placing in one task, so there is
         no in-between to paint. The toggle listener below still runs and is still what
         catches a menu opened from code. */
      document.querySelector(".setupBar")?.addEventListener("click", (ev) => {
        const sum = ev.target.closest?.("summary");
        if (!sum) return;
        const d = sum.parentElement;
        if (!d || d.parentElement !== ev.currentTarget || d.tagName !== "DETAILS") return;
        // a locked menu cancels its own activation; do not open it out from under that
        if (ev.defaultPrevented) return;
        ev.preventDefault();
        if (d.open) closeMenu(d);
        else openMenuPlaced(d);
      });

      setupDetails().forEach((d) => {
        d.addEventListener("toggle", () => {
          if (!d.open){
            unportalMenu(d);
            menuBody(d)?.removeAttribute("data-placed");
            return;
          }
          setupDetails().forEach((o) => { if (o !== d) closeMenu(o); });
          portalMenu(d);
          fitMenu(d);
          d.scrollIntoView({ block: "nearest", inline: "nearest" });
          fitMenu(d);
          window.FBSyncScrollFades?.();
          requestAnimationFrame(() => window.FBSyncScrollFades?.());
        });
      });
      window.addEventListener("resize", refitOpenMenus);
      if (window.visualViewport){
        window.visualViewport.addEventListener("resize", refitOpenMenus, { passive: true });
        window.visualViewport.addEventListener("scroll", refitOpenMenus, { passive: true });
      }
      // A fixed body does not travel with its summary on its own: the page scrolling
      // under an unpinned header, or the bar scrolling sideways, both move one and
      // not the other.
      window.addEventListener("scroll", refitOpenMenus, { passive: true });
      document.querySelector(".setupBar")?.addEventListener("scroll", refitOpenMenus, { passive: true });

      /* The little panel hanging off the textarea's corner, closed the same two ways
         the menus above it are: click anywhere outside it, or press Escape. It lives
         inside a menu, so a click landing in the menu but outside the panel has to
         close the panel and leave the menu alone — which is why it is checked here
         rather than folded into the rule below. */
      const closeSlipAdvanced = (target) => {
        const pop = document.getElementById("slipAdvanced");
        if (pop && pop.open && !(target && target.closest && target.closest("#slipAdvanced"))) pop.open = false;
      };

      /* Opening it can put it below the fold of a menu that already scrolls, so it
         brings itself into view. "nearest" rather than "center": the textarea above it
         is the thing you are working in, and centering the panel would push that off
         the top of the menu. */
      document.getElementById("slipAdvanced")?.addEventListener("toggle", (ev) => {
        if (!ev.target.open) return;
        // The format popup is positioned without moving the parent menu.
      });

      document.addEventListener("mousedown", (ev) => {
        if (!ev.target.closest) return;
        closeSlipAdvanced(ev.target);
        // the info bubble is rendered on <body>, but belongs to whatever menu opened it
        if (ev.target.closest(".setupBar") || ev.target.closest(".topSectionBody") || ev.target.closest(".infoBubble")) return;
        setupDetails().forEach((d) => { d.open = false; });
      });

      document.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape"){
          /* One Escape, one thing closed, innermost first: with the panel open, Escape
             puts it away and leaves the menu standing, which is what someone who has
             just opened it expects. A second Escape then closes the menu. */
          const pop = document.getElementById("slipAdvanced");
          if (pop && pop.open){
            pop.open = false;
            pop.querySelector("summary")?.focus();
            return;
          }
          setupDetails().forEach((d) => { d.open = false; });
          if (back && back.style.display === "flex") closeSettings();
        }
      });

      // ---------- live search ----------
      // The pass itself is applyListVisibility, which the filters share; all that
      // belongs here is the box that feeds it.
      const search = document.getElementById("stuSearch");

      if (search){
        let viewBeforeSearch = null;
        search.addEventListener("input", () => {
          if (search.value && viewBeforeSearch === null){
            // rows have to be on screen to be found
            viewBeforeSearch = loadListView();
            if (viewBeforeSearch !== "table") setListView("table", {persist:false});
          }
          if (!search.value && viewBeforeSearch !== null){
            setListView(viewBeforeSearch, {persist:false});
            viewBeforeSearch = null;
          }
          applyListVisibility();
        });

        document.addEventListener("keydown", (ev) => {
          const t = ev.target;
          const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
          if (ev.key === "/" && !typing){
            ev.preventDefault();
            // The box lives in the table's own bar, so in Summary there is nothing to
            // focus. Bring back the view that owns it rather than swallowing the key.
            if (listView !== "table") setListView("table");
            search.focus();
            search.select();
          }
          if (ev.key === "Escape" && t === search){
            search.value = "";
            applyListVisibility();
            search.blur();
          }
        });
      }

      // ---------- help text as hover chips ----------
      // One stroke weight, one 14x14 box, currentColor — the two kinds differ only by hue.
      // A lightbulb is reserved for .helpDisclosure, where there is a longer explanation to open.
      const TIP_ICONS = {
        guide: '<svg viewBox="0 0 14 14" aria-hidden="true" focusable="false">' +
               '<path d="M4.8 5.1a2.2 2.2 0 1 1 3 2.05c-.66.3-1 .82-1 1.5v.3"/>' +
               '<path d="M6.8 11.3h.01"/></svg>',
        caution: '<svg viewBox="0 0 14 14" aria-hidden="true" focusable="false">' +
               '<path d="M7 2.6 12.5 11.6H1.5z"/>' +
               '<path d="M7 6v2.4"/><path d="M7 10.1h.01"/></svg>'
      };
      const bubble = document.createElement("div");
      bubble.className = "infoBubble";
      bubble.setAttribute("role", "tooltip");
      document.body.appendChild(bubble);
      let bubbleOwner = null;
      let bubblePinned = false;
      let issueTouchAt = 0;

      /* iOS Safari can miss a later document-level click for buttons inserted into
         a fixed, scrollable bubble. Handle the redirect where the button lives on
         touch, and suppress the synthetic click that follows it. Mouse and keyboard
         activation still use the normal delegated handler. */
      const activateIssueButton = (ev) => {
        const btn = ev.target?.closest?.('[data-action="goToIssue"]');
        if (!btn) return false;
        ev.preventDefault();
        ev.stopPropagation();
        goToIssue(String(btn.dataset.issue || ""));
        return true;
      };
      bubble.addEventListener("touchend", (ev) => {
        if (!activateIssueButton(ev)) return;
        issueTouchAt = Date.now();
      }, { passive: false });
      bubble.addEventListener("click", (ev) => {
        if (Date.now() - issueTouchAt < 700){
          const btn = ev.target?.closest?.('[data-action="goToIssue"]');
          if (btn){ ev.preventDefault(); ev.stopPropagation(); }
          return;
        }
        activateIssueButton(ev);
      });

      function positionBubble(tip, html, kind){
        const markup = (html != null) ? html : (tip._html || "");
        if (bubbleOwner !== tip || html != null) bubble.innerHTML = markup;
        bubble.dataset.kind = kind || tip.dataset.kind || "guide";
        bubble.classList.add("show");
        bubbleOwner = tip;
        const t = tip.getBoundingClientRect();
        const b = bubble.getBoundingClientRect();
        const margin = 10;
        let left = t.left;
        if (left + b.width > window.innerWidth - margin) left = window.innerWidth - b.width - margin;
        left = Math.max(margin, left);
        let top = t.bottom + 6;
        if (top + b.height > window.innerHeight - margin) top = Math.max(margin, t.top - b.height - 6);
        bubble.style.left = Math.round(left) + "px";
        bubble.style.top = Math.round(top) + "px";
        // whether any of it is still below the fold, so the fade knows to appear
        bubble.dataset.more = (bubble.scrollHeight > bubble.clientHeight + 1) ? "1" : "0";
      }
      bubble.addEventListener("scroll", () => {
        const atEnd = bubble.scrollTop + bubble.clientHeight >= bubble.scrollHeight - 1;
        bubble.dataset.more = atEnd ? "0" : "1";
      }, { passive: true });

      function showBubble(tip, {pin=false, html=null, kind=null}={}){
        positionBubble(tip, html, kind);
        bubblePinned = pin;
        bubble.dataset.pinned = pin ? "1" : "0";
        if (pin){
          // pinned bubbles can hold buttons, so they must stay put while the pointer travels
          bubble.style.pointerEvents = "auto";
        }
      }
      function hideBubble({force=false}={}){
        if (bubblePinned && !force) return;
        bubble.classList.remove("show");
        bubble.dataset.pinned = "0";
        bubblePinned = false;
        bubbleOwner = null;
      }

      function buildInfoTips(){
        document.querySelectorAll("div.smallNote, p.smallNote").forEach((note) => {
          if (note.dataset.tipDone) return;
          if (note.closest(".topSectionBody") || note.closest(".appHeader") || note.closest(".modal") || note.closest(".popover") || note.closest(".advBody")){
            note.dataset.tipDone = "1";
            return;
          }
          const html = note.innerHTML.trim();
          /* An empty note is not "done" — the list's per-column notes are written
             after this first pass and change with the competition, so one that has
             nothing to say today may have something to say after the next switch.
             Leaving it unmarked lets refreshFrom build its chip then. */
          if (!html) return;
          note.dataset.tipDone = "1";

          const kind = (note.dataset.info === "caution") ? "caution" : "guide";
          const aria = (kind === "caution") ? "Caution" : "More information";

          const tip = document.createElement("span");
          tip.className = "infoTip";
          tip.dataset.kind = kind;
          tip.tabIndex = 0;
          tip.setAttribute("role", "button");
          tip.setAttribute("aria-label", aria);
          tip.innerHTML = TIP_ICONS[kind];
          tip._html = html;
          note._tip = tip;   // so a note whose copy is rewritten can refresh its chip

          tip.addEventListener("mouseenter", () => { if (!bubblePinned) showBubble(tip); });
          tip.addEventListener("mouseleave", () => { if (bubbleOwner === tip) hideBubble(); });
          tip.addEventListener("focus", () => { if (!bubblePinned) showBubble(tip); });
          tip.addEventListener("blur", () => { if (bubbleOwner === tip) hideBubble(); });
          // Click pins the bubble open so it can be read at length or copied from.
          tip.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            if (bubblePinned && bubbleOwner === tip) hideBubble({force:true});
            else showBubble(tip, {pin:true});
          });

          // A note can name the element its chip should sit after — used where the
          // prose lives below a toolbar but the chip belongs beside the heading in it.
          const anchor = note.dataset.tipAnchor && document.getElementById(note.dataset.tipAnchor);
          if (anchor){
            anchor.insertAdjacentElement("afterend", tip);
          } else {
            note.parentElement.insertBefore(tip, note);
          }
        });
      }

      // A pinned bubble follows its chip instead of vanishing on scroll.
      // any code can drive the shared bubble, e.g. the per-row error chips
      window.FBTips = {
        show: (anchor, html, kind, pin) => showBubble(anchor, {pin: !!pin, html, kind: kind || "caution"}),
        hide: (force) => hideBubble({force: !!force}),
        isPinned: () => bubblePinned,
        ownedBy: (el) => bubbleOwner === el,
        // a note rewritten after its chip was built (the list note follows the
        // competition) has to hand the new copy over, and redraw it if it is showing
        // build any chip that did not exist at load — see buildInfoTips
        build: () => buildInfoTips(),
        refreshFrom: (note) => {
          if (!note) return;
          const html = note.innerHTML.trim();
          // a note that has just been given copy for the first time needs its chip
          if (!note._tip && html){ buildInfoTips(); }
          const tip = note._tip;
          if (!tip) return;
          // ...and one that has just been emptied should not leave a chip explaining
          // nothing beside a heading
          tip.hidden = !html;
          if (!html){
            if (bubbleOwner === tip) hideBubble({force:true});
            return;
          }
          tip._html = html;
          // The new copy has to be handed over explicitly. positionBubble repaints
          // only for a different chip or an explicit html, so redrawing the chip that
          // is already showing moved the bubble and left the old words in it — the
          // list note reads as one competition while the app is set to another.
          if (bubbleOwner === tip) showBubble(tip, {pin: bubblePinned, html: tip._html});
        }
      };

      window.addEventListener("scroll", () => {
        if (bubblePinned && bubbleOwner) positionBubble(bubbleOwner);
        else hideBubble();
      }, true);
      window.addEventListener("resize", () => {
        if (bubblePinned && bubbleOwner) positionBubble(bubbleOwner);
      });
      document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") hideBubble({force:true}); });
      document.addEventListener("mousedown", (ev) => {
        if (!bubblePinned) return;
        if (ev.target.closest && (ev.target.closest(".infoBubble") || ev.target.closest(".infoTip"))) return;
        hideBubble({force:true});
      });

      // ---------- copy a formula ----------
      async function copyText(text){
        try{
          await navigator.clipboard.writeText(text);
          return true;
        }catch(e){
          // clipboard API is unavailable over file:// in some browsers
          try{
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.setAttribute("readonly", "");
            ta.style.cssText = "position:fixed;top:-1000px;opacity:0;";
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand("copy");
            ta.remove();
            return ok;
          }catch(_){ return false; }
        }
      }

      document.addEventListener("click", async (ev) => {
        const btn = ev.target.closest && ev.target.closest(".copyBtn");
        if (!btn) return;
        ev.preventDefault();
        ev.stopPropagation();
        const block = btn.closest(".formulaBlock");
        const code = block && block.querySelector("code");
        if (!code) return;
        const ok = await copyText(code.textContent.trim());
        btn.textContent = ok ? "Copied" : "Press Ctrl+C";
        btn.dataset.copied = ok ? "1" : "0";
        if (!ok){
          const range = document.createRange();
          range.selectNodeContents(code);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
        setTimeout(() => { btn.textContent = "Copy"; btn.dataset.copied = "0"; }, 1600);
      });

      // ---------- topic tests ----------
      function syncTopicPrefixState(){
        const box = document.getElementById("topicPrefixEnabled");
        document.documentElement.dataset.noprefix = (box && !box.checked) ? "1" : "0";
        /* The Test column previews the PDF's Test field, and the prefix is part of
           that field — so switching the prefix off has to take it out of the table
           too. This used to only dim the prefix boxes on the cards, which left every
           row still showing a "Theta" that was no longer going to be printed. */
        renderAllRows();
      }
      document.addEventListener("change", (ev) => {
        if (ev.target && ev.target.id === "topicPrefixEnabled") syncTopicPrefixState();
        if (ev.target && ev.target.id === "topicTestsEnabled") syncTopicChipState();
      });

      // ---------- tabbed menu panels ----------
      // Each .tabStrip owns the .tabPanel siblings that follow it, so a menu can hold
      // several settings groups without becoming a scroll marathon.
      function selectTab(btn){
        const strip = btn.closest(".tabStrip");
        const body = strip && strip.parentElement;
        if (!strip || !body) return;
        strip.querySelectorAll(".tabBtn").forEach((b) => {
          b.setAttribute("aria-selected", b === btn ? "true" : "false");
        });
        body.querySelectorAll(":scope > .tabPanel").forEach((panel) => {
          panel.hidden = (panel.id !== btn.dataset.tab);
        });
        const menu = body.closest("details") || (body.dataset.menuOwner && document.getElementById(body.dataset.menuOwner));
        if (menu && menu.open){
          fitMenu(menu);
          window.FBSyncScrollFades?.();
          requestAnimationFrame(() => window.FBSyncScrollFades?.());
        }
        syncAddStudentForm();
      }

      document.addEventListener("click", (ev) => {
        const btn = ev.target.closest && ev.target.closest(".tabBtn");
        if (!btn) return;
        ev.preventDefault();
        selectTab(btn);
      });

      /** Open a setup menu and land on one of its tabs. */
      function openMenuTab(menuId, tabId){
        const menu = document.getElementById(menuId);
        if (!menu) return;
        setupDetails().forEach((d) => { d.open = (d === menu); });
        if (tabId){
          const btn = menuBody(menu)?.querySelector(`.tabBtn[data-tab="${tabId}"]`);
          if (btn) selectTab(btn);
        }
        fitMenu(menu);
        window.FBSyncScrollFades?.();
        requestAnimationFrame(() => window.FBSyncScrollFades?.());
        const focusable = menuBody(menu)?.querySelector(".tabPanel:not([hidden]) textarea, .tabPanel:not([hidden]) input, textarea, input");
        if (focusable) focusable.focus();
      }

      // loading a roster fills the School ID in code, which fires no input event
      document.getElementById("menuRoster")?.addEventListener("toggle", () => { syncAddStudentForm(); });

      // ---------- keyboard shortcut reference ----------
      const shortcutsBack = document.getElementById("shortcutsModalBack");
      function openShortcuts(){ if (shortcutsBack) shortcutsBack.style.display = "flex"; }
      function closeShortcuts(){ if (shortcutsBack) shortcutsBack.style.display = "none"; }

      // The modifier is Cmd on a Mac and Ctrl everywhere else; say the right one.
      (function labelModifier(){
        const isMac = /mac/i.test(navigator.platform || "");
        document.querySelectorAll("[data-mod]").forEach((el) => {
          el.textContent = isMac ? "⌘" : "Ctrl";
        });
      })();

      document.addEventListener("click", (ev) => {
        const el = ev.target.closest && ev.target.closest("[data-action]");
        const action = el && el.dataset ? el.dataset.action : "";
        if (action === "openShortcuts"){ openShortcuts(); return; }
        if (action === "closeShortcuts"){ closeShortcuts(); return; }
        if (action === "jumpToPasteRoster"){ openMenuTab("menuRoster", "secEnrollment"); return; }
        if (action === "jumpToAddStudent"){ openMenuTab("menuRoster", "secAddStudent"); return; }
        if (shortcutsBack && ev.target === shortcutsBack) closeShortcuts();
      });

      document.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape" && shortcutsBack && shortcutsBack.style.display === "flex"){
          ev.preventDefault();
          closeShortcuts();
        }
      });

      // ---------- Add Student: show the ID as it is being built ----------
      // the box and the preview under it are the same piece of state, seen twice
      function syncAddStudentForm(){
        syncAddStudentSchool();
        syncAddIdPreview();
      }

      function syncAddIdPreview(){
        const out = document.getElementById("addIdPreview");
        if (!out) return;
        // the box mirrors PDF Setup → School whenever that is set, so reading it here
        // reads the setting too, and reads what was typed while there is no setting yet
        const school = String(document.getElementById("addSchoolId4")?.value || "").replace(/\D/g, "").slice(0, 4);
        const locked = !!schoolIdSetting();
        const student = String(document.getElementById("nativeStudent3")?.value || "").replace(/\D/g, "").slice(0, 3);
        const division = String(document.getElementById("nativeAddDivision")?.value || "1");

        // composeStudentId8 zero-pads, so it always returns 8 digits; the add button's own
        // rules are what decide whether this is a real ID yet.
        if (school.length !== 4){
          out.dataset.ok = "0";
          out.textContent = locked
            ? "Set a 4-digit School ID under PDF Setup → School"
            : "Enter a 4-digit School ID to see the full ID";
          out.title = "";
          return;
        }
        if (!student){
          out.dataset.ok = "0";
          out.textContent = "Enter a Student Number to see the full ID";
          out.title = "";
          return;
        }
        out.dataset.ok = "1";
        out.textContent = `${school} + ${student.padStart(3, "0")} + ${division}  =  ${composeStudentId8(school, student, division)}`;
        out.title = "School ID + Student Number + Roster Level";
      }
      ["addSchoolId4", "nativeStudent3", "nativeAddDivision", "schoolId4"].forEach((id) => {
        const el = document.getElementById(id);
        if (el){
          el.addEventListener("input", syncAddIdPreview);
          el.addEventListener("change", syncAddIdPreview);
        }
      });

      // ---------- alerts show themselves when something writes into them ----------
      // The app sets .textContent on #error1 / #error2 from a dozen places; watching the
      // nodes keeps every one of those call sites unchanged.
      function syncAlert(el){
        const box = el && el.closest(".alert");
        if (box) box.dataset.show = el.textContent.trim() ? "1" : "0";
      }
      ["error1", "error2"].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        syncAlert(el);
        if (window.MutationObserver){
          new MutationObserver(() => syncAlert(el)).observe(el, { childList: true, characterData: true, subtree: true });
        }
      });

      /* ---------- edge fades on every scroller ----------
         Marked in the markup with data-sidescroll rather than listed here, so a
         scroller added later is wired by writing one attribute. Each reports which of
         its edges still has content past it; the CSS fades only those.

         data-vscroll adds the other axis, and only the table asks for it. The two
         tests are the same test: an edge is live when there is more than a pixel of
         travel in that direction and we are more than a pixel away from that end. For
         the table that reads exactly as the fade is meant to — the top edge clears the
         moment the first row's top is in view, the bottom edge when the last row's
         bottom is. */
      function watchSideScroll(scroller){
        if (!scroller) return null;
        const wantsY = scroller.dataset.vscroll === "mask";
        const sync = () => {
          const max = scroller.scrollWidth - scroller.clientWidth;
          const x = scroller.scrollLeft;
          const edges = [];
          if (max > 1 && x > 1) edges.push("start");
          if (max > 1 && x < max - 1) edges.push("end");
          if (wantsY){
            const maxY = scroller.scrollHeight - scroller.clientHeight;
            const y = scroller.scrollTop;
            if (maxY > 1 && y > 1) edges.push("top");
            if (maxY > 1 && y < maxY - 1) edges.push("bottom");
          }
          scroller.dataset.scroll = edges.join(" ");
        };
        scroller.addEventListener("scroll", sync, { passive: true });
        if (window.ResizeObserver){
          const ro = new ResizeObserver(sync);
          ro.observe(scroller);
          // and everything inside it, because the content is what changes width:
          // rows arriving, a competition switch dropping a column, the setup bar
          // gaining a state chip. None of those fire a window resize.
          for (const child of scroller.children) ro.observe(child);
        }
        window.addEventListener("resize", sync);
        // Once now for a box that is already overflowing, and once after layout has
        // settled — the first pass runs before fonts and the first render have given
        // the content its real width.
        sync();
        requestAnimationFrame(() => requestAnimationFrame(sync));
        return sync;
      }

      const sideSyncs = [...document.querySelectorAll("[data-sidescroll]")].map(watchSideScroll);
      /* A scroller whose contents are rebuilt wholesale — the table, the selection bar —
         can outrun the observers by a frame, so the code that rebuilds them says so. */
      window.FBSyncScrollFades = () => { for (const fn of sideSyncs) fn && fn(); };

      /* ---------- the two severity pills explain themselves on hover ----------
         Hover shows the list; clicking pins it so the "Take me to it" buttons in it
         can be reached. Unpinned it hides on the way out, which is why the pointer
         travelling from the pill to a button in the bubble has to keep it alive —
         that is what pinning is for, and why the click above pins. */
      for (const id of ["btnErrors", "btnWarnings"]){
        const pill = document.getElementById(id);
        if (!pill) continue;
        pill.addEventListener("mouseenter", () => {
          const entry = issuePillList.get(id);
          if (!entry || !entry.list.length) return;
          if (window.FBTips && !window.FBTips.isPinned()){
            window.FBTips.show(pill, issuePillHtml(entry.list, entry.word),
                               entry.word === "Error" ? "danger" : "caution", false);
          }
        });
        pill.addEventListener("mouseleave", () => {
          if (window.FBTips?.ownedBy(pill)) window.FBTips.hide(false);
        });
      }

      // ---------- keep each pinned band stacked under the one above it ----------
      // Three of them now: the page header, the list toolbar, then the column headers.
      // Every height is variable — the header wraps at narrow widths, the setup pills
      // reflow, the toolbar drops the search onto its own row — so they are measured
      // rather than guessed, and re-measured whenever either box changes size.
      /*
       * Always floor, never round. Each band pins at the sum of the ones above it, so
       * rounding a fractional height *up* parks the next band a fraction of a pixel
       * below the one it should be sitting against, and the rows scrolling underneath
       * show through the sliver. Flooring can only ever overlap instead, by less than a
       * pixel, and the upper band paints over the lower one — so the seam closes.
       *
       * Fractions are the normal case, not an edge case: any browser zoom off 100%
       * puts them in every one of these heights.
       */
      function measureStickyOffsets(){
        const root = document.documentElement;
        const head = document.getElementById("pageHead");
        if (head){
          // Not sticky (preference off, or a viewport too short for it) means it takes
          // no room off the top, and the bands below it must not be pushed down.
          const pinned = getComputedStyle(head).position === "sticky";
          const h = pinned ? Math.floor(head.getBoundingClientRect().height) : 0;
          root.style.setProperty("--pageHeadH", h + "px");
        }
        const bar = document.querySelector(".listBar");
        if (bar){
          root.style.setProperty("--listBarH", Math.floor(bar.getBoundingClientRect().height) + "px");
        }

        /* Where the table's top fade begins. The column headings are pinned to the top
           of the scroller, so a fade from its edge would take them with it — and they
           are the one thing in there that is never scrolling out of sight. The fade
           therefore starts at their lower edge, which is this.
           Ceiling, not floor, for the opposite reason to the bands above: rounding up
           can only push the ramp a fraction of a pixel further under the headings,
           where they are painting over the rows anyway, while rounding down would
           leave a sliver of unfaded row showing below them.
           Zero when the headings are not pinned — the preference is off — because then
           they scroll away like everything else and have no claim on the top. */
        const viewport = document.querySelector("#studentsRoot .tableViewport");
        if (viewport){
          const headCell = viewport.querySelector("tbody tr:first-child th");
          const pinned = headCell && getComputedStyle(headCell).position === "sticky";
          const h = pinned ? Math.ceil(headCell.getBoundingClientRect().height) : 0;
          viewport.style.setProperty("--fadeTop", h + "px");
        }

        /*
         * How tall the anchored list panel may be: the room between its top and the
         * bottom of the window, less what the body is already holding back for the
         * fixed action bar. rect.top + scrollY is the panel's offset in the document,
         * which does not move when the page scrolls — so this cannot chase its own
         * tail while it is being applied, and it stays right if the page is scrolled
         * when it runs.
         *
         * Whether the anchored layout is on at all is the stylesheet's business; the
         * panel is only a flex column inside that media query, which is what this
         * reads rather than repeating the breakpoints here.
         */
        // What the page holds back at the bottom for the fixed action bar. Measured
        // rather than assumed, so it follows the bar when it wraps or grows a progress
        // strip — and read before the panel below, whose room depends on it.
        const foot = document.getElementById("stickyBar");
        if (foot){
          root.style.setProperty("--stickyBarH", Math.ceil(foot.getBoundingClientRect().height) + "px");
        }

        const panel = document.getElementById("studentsPanel");
        if (panel){
          // Depends only on where the panel starts and how tall the window is, never
          // on the panel's own height — so the cap cannot chase itself.
          const topDoc = panel.getBoundingClientRect().top + window.scrollY;
          const bodyPad = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
          // the panel's own bottom margin sits below it and counts against the page too
          const ownMargin = parseFloat(getComputedStyle(panel).marginBottom) || 0;
          const avail = window.innerHeight - topDoc - bodyPad - ownMargin;

          // The frame's own chrome — the bar, the toolbar and the table's heading row —
          // costs about this much before a single student is drawn. Capping the panel
          // any shorter than that would anchor a box with nothing in it to scroll, so
          // the cap stops here and the page scrolls to reach what is below. A window
          // that short is the only case left where the page moves at all.
          const ANCHOR_FLOOR = 240;
          root.style.setProperty("--listMaxH", Math.max(Math.floor(avail), ANCHOR_FLOOR) + "px");
        }
      }
      window.addEventListener("resize", measureStickyOffsets);
      document.addEventListener("DOMContentLoaded", measureStickyOffsets);
      setTimeout(measureStickyOffsets, 0);
      if (window.ResizeObserver){
        const ro = new ResizeObserver(measureStickyOffsets);
        // Border box: what is measured above is getBoundingClientRect, so padding and
        // border have to count. Watching the default content box misses a band that
        // changes height by its own padding and leaves the offset below it stale.
        const observeSticky = () => {
          // Everything whose height moves the top of the list panel or the bottom of
          // the space it has: the header above it, the alert that can open between
          // them, and the action bar the body is reserving room for.
          const head = document.getElementById("pageHead");
          const bar = document.querySelector(".listBar");
          const alert = document.getElementById("alertPdf");
          const foot = document.getElementById("stickyBar");
          // ...and the column headings, whose height is where the table's top fade
          // starts. Theirs moves with the density and with the first font to land.
          const th = document.querySelector("#studentsRoot .tableViewport tbody tr:first-child th");
          if (head) ro.observe(head, { box: "border-box" });
          if (bar) ro.observe(bar, { box: "border-box" });
          if (alert) ro.observe(alert, { box: "border-box" });
          if (foot) ro.observe(foot, { box: "border-box" });
          if (th) ro.observe(th, { box: "border-box" });
        };
        document.addEventListener("DOMContentLoaded", observeSticky);
        observeSticky();
        /* Rendering the empty-state card and rendering the table can change the
           panel's intrinsic layout without changing any sticky band above it. Watch
           that subtree so the anchored window is recalculated immediately instead
           of retaining the first empty-state measurement until a refresh. */
        const listRoot = document.getElementById("studentsRoot");
        if (listRoot && window.MutationObserver){
          const listMo = new MutationObserver(() => {
            requestAnimationFrame(measureStickyOffsets);
          });
          listMo.observe(listRoot, { childList: true, subtree: true });
        }
      }
      /* The page header pins or unpins with its preference, which changes what it
         takes off the top; the column headings do the same with theirs, and their
         height is where the table's top fade starts — zero when they are not pinned.
         Density is in here as well: it does not move the headings themselves, whose
         padding and type are fixed, but it moves everything measured around them, and
         a re-measure costs one layout read. */
      P.onChange((key) => {
        if (key === "stickyTop" || key === "stickyHead" || key === "density" || key === "*"){
          measureStickyOffsets();
        }
      });

      // ---------- keep the theme button label honest ----------
      /* applyRowColors() resolves --divN once, when a row is built, and writes the
         result into the row as a literal rgba() — so anything that moves those
         variables has to rebuild the rows or they keep painting the old palette.

         "divColors" was missing here, which covered three routes at once: dragging a
         swatch (input events, no change event), reverting a palette, and switching
         competition (which swaps the whole palette). The variables updated, the rows
         did not, and a custom competition's colors stayed on screen after a revert
         back to the regional defaults. */
      P.onChange((key) => {
        if (key === "theme" || key === "tintStrength" || key === "divColors" || key === "*"){
          rerenderRows();
        }
      });
      /* The Division column is measured, and two things it is measured from move with
         the preferences: the cell inset that grows with the density, and the heading's
         own box. Neither goes through applyCompetitionToUI, so they say so here. */
      P.onChange((key) => {
        if (key === "density" || key === "*") syncDivColumnWidth();
      });
      /* The first measurement runs before the page has laid out and, on a cold load,
         before the system font is resolved — both of which report short. Measure again
         once each of those has settled. */
      document.addEventListener("DOMContentLoaded", () => {
        requestAnimationFrame(() => requestAnimationFrame(syncDivColumnWidth));
      });
      document.fonts?.ready?.then?.(() => syncDivColumnWidth());
      P.onChange(syncSettingsUI);
      document.addEventListener("DOMContentLoaded", () => {
        syncSettingsUI();
        buildInfoTips();
        syncTopicPrefixState();
        syncTopicChipState();
        syncAddStudentForm();
      });
      syncSettingsUI();
    })();
