    /* ============================================================
       Toast

       The app asks for no confirmations, on the reasoning that undo covers
       everything — which is true, and worth keeping: a confirmation people click
       through every time protects nobody. What was missing was any sign that the
       net exists. It was documented in a paragraph above the draft slots, which is
       exactly the place a paragraph cannot help.

       So a destructive or wholesale action now says what it did, and offers the way
       back in the same breath. One toast at a time, above the action bar, gone in
       six seconds; it never blocks and never needs dismissing.
       ============================================================ */
    let toastTimer = 0;
    let resetArmTimer = 0;
    let customArmTimer = 0;
    /* The topic-row deletes arm the same way, and only ever one at a time: arming a
       second while the first is still armed would leave two buttons both one press
       from firing, which is exactly the state the arming exists to prevent. */
    let topicDeleteArmTimer = 0;
    function disarmTopicDeletes(){
      clearTimeout(topicDeleteArmTimer);
      document.querySelectorAll('[data-action="deleteTopicTest"][data-armed="1"]').forEach((b) => {
        b.dataset.armed = "0";
        // the resting title names the students on this test, so it is put back rather
        // than replaced with a generic one
        b.title = b.dataset.restTitle || "Delete this test.";
      });
    }
    /** Puts the custom editor's two armed buttons back to their resting labels. */
    function disarmCustomButtons(){
      clearTimeout(customArmTimer);
      document.querySelectorAll('[data-action="revertCustom"], [data-action="emptyCustom"]').forEach((b) => {
        if (b.dataset.armed !== "1") return;
        b.dataset.armed = "0";
        b.textContent = b.dataset.label || "";
      });
    }
    /** Puts the Settings reset button back to its resting label. */
    function disarmResetSettings(){
      clearTimeout(resetArmTimer);
      const b = document.querySelector('[data-action="resetSettings"]');
      if (!b || b.dataset.armed !== "1") return;
      b.dataset.armed = "0";
      b.textContent = b.dataset.label || "Reset display settings";
      b.title = "Restore display settings to their defaults. This cannot be undone.";
    }

    /**
     * @param {string} msg   what just happened, in the past tense
     * @param {string} [kind] pass "undo" to offer the way back inline
     */
    function toast(msg, kind){
      const host = document.getElementById("toast");
      if (!host) return;
      const text = host.querySelector(".toastText");
      const act  = host.querySelector(".toastAction");
      if (text) text.textContent = String(msg || "");
      if (act) act.hidden = (kind !== "undo") || !undoStack.length;
      host.dataset.show = "1";
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { host.dataset.show = "0"; }, 6000);
    }
    function hideToast(){
      const host = document.getElementById("toast");
      if (host) host.dataset.show = "0";
      clearTimeout(toastTimer);
    }

    function undo(){
      if (!undoStack.length || pdfInProgress) return;
      const action = undoStack.pop();

      if (action.type === "batch"){
        for (let i = action.diffs.length - 1; i >= 0; i--){
          applyDiff(action.diffs[i], "undo");
        }
      } else {
        applyDiff(action.diff, "undo");
      }

      redoStack.push(action);
      persistUndoState();
      scheduleSaveCurrent();
      syncAllCountersAndSummaries();
      syncSticky();
      // the offer has been taken; leaving it on screen would invite a second press
      hideToast();
    }

    function redo(){
      if (!redoStack.length || pdfInProgress) return;
      const action = redoStack.pop();

      if (action.type === "batch"){
        for (let i = 0; i < action.diffs.length; i++){
          applyDiff(action.diffs[i], "redo");
        }
      } else {
        applyDiff(action.diff, "redo");
      }

      undoStack.push(action);
      persistUndoState();
      scheduleSaveCurrent();
      syncAllCountersAndSummaries();
      syncSticky();
    }
