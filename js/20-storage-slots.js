    // ====== Enrollment parsing and slots ======
    function defaultSlots(){
      return Array.from({length: SLOT_COUNT}, (_, i) => ({ name: `Slot ${i+1}`, text: "" }));
    }
    function loadSlots(){
      const raw = localStorage.getItem(ENROLLMENT_SLOT_KEY);
      const slots = safeParseJson(raw, null);
      if (!Array.isArray(slots) || slots.length !== SLOT_COUNT) return defaultSlots();
      return slots.map((x, i) => ({
        name: String(x?.name ?? `Slot ${i+1}`).slice(0, 40),
        text: String(x?.text ?? "")
      }));
    }
    function saveSlots(slots){
      return window.FBStore.set(ENROLLMENT_SLOT_KEY, JSON.stringify(slots));
    }
    function renderSlots(){
      const host = document.getElementById("slots");
      if (!host) return;

      const slots = loadSlots();
      host.innerHTML = "";

      slots.forEach((slot, idx) => {
        const wrap = document.createElement("div");
        wrap.className = "slot";

        const name = document.createElement("input");
        name.className = "slotName";
        name.type = "text";
        name.value = slot.name;
        name.title = "Rename this slot";
        name.dataset.prev = slot.name;
        name.addEventListener("focusin", () => {
          name.dataset.prev = String(name.value || "");
        });
        name.addEventListener("input", () => {
          const s = loadSlots();
          s[idx].name = name.value;
          if (!saveSlots(s)) return;
        });
        name.addEventListener("focusout", () => {
          const prev = String(name.dataset.prev || "");
          const next = String(name.value || "");
          if (prev === next) return;
          pushUndo({ type:"single", label:"Rename enrollment slot", diff:{ type:"slotName", idx, prev, next } });
          name.dataset.prev = next;
        });

        /* Same rule as the draft slots: an empty slot can only be saved into, so it
           is Save that carries the accent and Load and Clear that go quiet. */
        const filled = !!String(slot.text || "").trim();

        const btnSave = document.createElement("button");
        btnSave.type = "button";
        btnSave.textContent = "Save";
        if (!filled) btnSave.className = "primary";
        btnSave.title = filled
          ? "Replace the text in this slot with the current enrollment list"
          : "Save the current enrollment list into this slot";
        btnSave.addEventListener("click", () => {
          const s = loadSlots();
          const prev = String(s[idx].text || "");
          s[idx].text = document.getElementById("enrollment").value || "";
          const next = String(s[idx].text || "");
          if (!saveSlots(s)) return;
          if (prev !== next){
            pushUndo({ type:"single", label:"Overwrite enrollment slot", diff:{ type:"slotText", idx, prev, next } });
          }
          renderSlots();
          toast(next ? (filled ? "Roster slot overwritten" : "Saved to roster slot") : "Nothing to save. The enrollment box is empty");
        });

        const btnLoad = document.createElement("button");
        btnLoad.type = "button";
        btnLoad.textContent = "Load";
        if (filled) btnLoad.className = "primary";
        btnLoad.disabled = !filled;
        btnLoad.title = filled
          ? "Replace the student list with this slot's roster"
          : "Nothing saved in this slot yet";
        btnLoad.addEventListener("click", () => {
          const before = getFullSnapshot();
          clearStudents({recordUndo:false});
          const s = loadSlots();
          document.getElementById("enrollment").value = s[idx].text || "";
          readEnrollment();
          pushUndo({ type:"single", label:"Load enrollment slot", diff:{ type:"fullSnapshot", prev: before, next: getFullSnapshot() } });
          toast("Roster loaded", "undo");
        });

        const btnClear = document.createElement("button");
        btnClear.type = "button";
        btnClear.textContent = "Clear";
        btnClear.className = "danger";
        btnClear.disabled = !filled;
        btnClear.title = filled ? "Empty this slot" : "Nothing saved in this slot yet";
        btnClear.addEventListener("click", () => {
          const s = loadSlots();
          const prev = String(s[idx].text || "");
          s[idx].text = "";
          const next = "";
          if (!saveSlots(s)) return;
          if (prev !== next){
            pushUndo({ type:"single", label:"Clear enrollment slot", diff:{ type:"slotText", idx, prev, next } });
          }
          renderSlots();
        });

        /* What a saved roster is, said in the terms you saved it by: whose roster it
           is and how many students are in it. It used to count lines, which counted the
           header and any blank the paste brought with it. */
        const meta = document.createElement("div");
        meta.className = "slotMeta";
        if (!filled){
          meta.textContent = "Empty";
          meta.dataset.empty = "1";
        } else {
          const info = summarizeRosterText(slot.text);
          const bits = [];
          if (info.school) bits.push(info.school);
          bits.push(`${info.count} student${info.count === 1 ? "" : "s"}`);
          meta.textContent = bits.join(" \u00b7 ");
        }

        /* Name and the three buttons on one row, the summary on its own row under it.
           The buttons keep a fixed width and the name box takes what is left, so Save,
           Load and Clear land on the same three columns in every slot whatever the
           slot is called and whether or not it holds anything. */
        const top = document.createElement("div");
        top.className = "slotTop";
        const btns = document.createElement("div");
        btns.className = "slotBtns";
        btns.appendChild(btnSave);
        btns.appendChild(btnLoad);
        btns.appendChild(btnClear);
        top.appendChild(name);
        top.appendChild(btns);

        wrap.appendChild(top);
        wrap.appendChild(meta);

        host.appendChild(wrap);
      });
    }
    
    // ====== Draft slots (full state) ======
    function defaultDraftSlots(){
      return Array.from({length: DRAFT_SLOT_COUNT}, (_, i) => ({
        name: `Draft ${i+1}`,
        savedAt: 0,
        state: null
      }));
    }
    function loadDraftSlots(){
      const raw = localStorage.getItem(DRAFT_SLOT_KEY);
      const slots = safeParseJson(raw, null);
      if (!Array.isArray(slots) || slots.length !== DRAFT_SLOT_COUNT) return defaultDraftSlots();
      return slots.map((x, i) => ({
        name: String(x?.name ?? `Draft ${i+1}`).slice(0, 40),
        savedAt: Number(x?.savedAt ?? 0) || 0,
        state: (x && typeof x === "object") ? (x.state ?? null) : null
      }));
    }
    function saveDraftSlots(slots){
      return window.FBStore.set(DRAFT_SLOT_KEY, JSON.stringify(slots));
    }

    // ====== The current workspace, written back as you work ======
    /*
     * The same snapshot the Draft slots hold, kept under its own key and rewritten
     * shortly after every change, so a refresh — or a closed tab, or a crash — costs
     * nothing. It also squares a long-standing mismatch: the undo stack was already
     * surviving a reload while the list it described was not, which left Undo replaying
     * edits against an empty table. Now both come back or neither does.
     *
     * Debounced, because the hooks below fire on every keystroke and a snapshot walks
     * the whole roster. Writes are wrapped: a full quota or a locked-down browser must
     * not take the app down with it.
     */
    /** True only while applyFullSnapshot is putting a restored workspace back on screen. */
    let restoringCurrent = false;
    let saveCurrentTimer = null;

    let currentRevision = null;
    let currentConflict = false;
    let resettingWorkspace = false;
    function storageNotice(text, conflict=false){
      const el=document.getElementById("saveStatus");
      if(el) {el.textContent=text;el.dataset.error=(conflict || window.FBStore.failed) ? "1" : "0";}
      const box=document.getElementById("storageNotice");
      if(box){box.hidden=!conflict;}
    }
    function savedRevision(){return safeParseJson(localStorage.getItem(CURRENT_KEY),null)?.revision || null;}
    function saveCurrentNow(){
      clearTimeout(saveCurrentTimer);saveCurrentTimer=null;
      if(restoringCurrent || resettingWorkspace) return;
      if(currentConflict || savedRevision()!==currentRevision){
        currentConflict=true;storageNotice("Another tab has newer changes. Resolve before saving.",true);return;
      }
      const revision=crypto.randomUUID();
      if(window.FBStore.set(CURRENT_KEY,JSON.stringify({v:1,revision,savedAt:Date.now(),state:getFullSnapshot()}))){
        currentRevision=revision;storageNotice("Saved in this browser");
      } else storageNotice("Could not save. Download a backup.");
    }
    function scheduleSaveCurrent(){
      if(restoringCurrent || resettingWorkspace || currentConflict) return;
      clearTimeout(saveCurrentTimer);storageNotice("Saving…");saveCurrentTimer=setTimeout(saveCurrentNow,400);
    }
    function loadCurrent(){
      const parsed=safeParseJson(localStorage.getItem(CURRENT_KEY),null);
      currentRevision=parsed?.revision || null;
      return parsed?.state && typeof parsed.state === "object" ? parsed.state : null;
    }
    window.addEventListener("storage",ev=>{
      if(ev.key===CURRENT_KEY && savedRevision()!==currentRevision){
        currentConflict=true;clearTimeout(saveCurrentTimer);storageNotice("Another tab has newer changes. Resolve before saving.",true);
      }
    });
    window.addEventListener("fb-storage-error",ev=>{storageNotice(ev.detail);if(typeof toast==="function") toast(ev.detail);});

    /*
     * Which controls are *not* part of the workspace. Everything else on the page is,
     * so the rule is stated as an exclusion list: a field added later is saved by
     * default rather than quietly forgotten until someone notices.
     *
     * pushUndo already covers most edits, but the tracked text fields only commit an
     * undo step on blur — type a school name and reload without leaving the box and
     * nothing would have been written. This catches the keystrokes; the debounce means
     * the cost is one snapshot per pause however fast anyone types.
     */
    const NOT_WORKSPACE_FIELDS = [
      "#stuSearch",                                                  // a view, not data
      "#nativeAddFirst", "#nativeAddLast", "#nativeStudent3", "#nativeAddDivision",
      "#addSchoolId4",                                               // mirrors #schoolId4, which is saved
      "#schoolId4",                                                   // staged until Apply
      ".slotName",                                                   // enrollment slot names, own key
      "[data-pref-seg] button", "[data-pref-check]", "[data-pref-color]", "[data-div-color]",
      // the competition dialogs own their own persistence, through setCompetition
      "#competitionModalBack", "#customModalBack",
    ].join(", ");

    document.addEventListener("input", (ev) => {
      const t = ev.target;
      if (!t || !t.closest || t.closest(NOT_WORKSPACE_FIELDS)) return;
      scheduleSaveCurrent();
    });
    document.addEventListener("change", (ev) => {
      const t = ev.target;
      if (!t || !t.closest || t.closest(NOT_WORKSPACE_FIELDS)) return;
      scheduleSaveCurrent();
    });
    // A tab closed or backgrounded mid-debounce still gets its last edit written.
    window.addEventListener("pagehide", saveCurrentNow);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") saveCurrentNow();
    });

    
