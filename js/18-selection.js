    // ====== Selection mechanics ======
    function setSelected(rowId, on){
      if (on) selected.add(rowId);
      else selected.delete(rowId);

      const tr = rowEl.get(rowId);
      if (tr) tr.dataset.selected = on ? "1" : "0";
    }

    function clearSelection(){
      for (const rid of Array.from(selected)){
        setSelected(rid, false);
        const tr = rowEl.get(rid);
        const cb = tr ? tr.querySelector(`input[type="checkbox"][data-action="select"][data-rowid="${rid}"]`) : null;
        if (cb) cb.checked = false;
      }
      selected.clear();
      lastActiveRowId = null;
      syncSticky();
    }

    function selectAllVisible(){
      // "visible" is the point: with a filter on, this is the batch you can see
      const ids = getPageOrder().filter(rid => rowEl.get(rid)?.getAttribute("data-hidden") !== "1");
      for (const rid of ids){
        setSelected(rid, true);
        const tr = rowEl.get(rid);
        const cb = tr ? tr.querySelector(`input[type="checkbox"][data-action="select"][data-rowid="${rid}"]`) : null;
        if (cb) cb.checked = true;
      }
      syncSticky();
    }

    function selectIncluded(){
      clearSelection();
      for (const s of students){
        if (!s.included) continue;
        setSelected(s.rowId, true);
        const tr = rowEl.get(s.rowId);
        const cb = tr ? tr.querySelector(`input[type="checkbox"][data-action="select"][data-rowid="${s.rowId}"]`) : null;
        if (cb) cb.checked = true;
      }
      syncSticky();
    }

    /** Keep one row's checkbox in step with the set it was just added to or taken from. */
    function syncSelectCheckbox(rowId, on){
      const tr = rowEl.get(rowId);
      const cb = tr ? tr.querySelector(`input[type="checkbox"][data-action="select"][data-rowid="${rowId}"]`) : null;
      if (cb) cb.checked = on;
    }

    /**
     * These are tick boxes, not a file list: a plain click ticks or unticks the one
     * row it landed on and leaves every other tick alone. Nothing here clears the
     * selection behind your back, so building a batch out of rows scattered down a
     * long list never needs a modifier held for the whole job — and the accidental
     * click that used to throw away twenty ticks now costs exactly one.
     *
     * Shift is the one modifier that still means something: it fills in every row
     * between the last one clicked and this one, in whichever direction that is, on
     * top of what is already ticked. Ctrl and Cmd are harmless leftovers — they do
     * what a plain click does, which is what they were doing anyway.
     */
    function toggleSelection(rowId, {shiftKey=false}={}){
      if (shiftKey && lastActiveRowId != null && lastActiveRowId !== rowId){
        const ids = getSelectionShiftOrder();
        const a = ids.indexOf(lastActiveRowId);
        const b = ids.indexOf(rowId);
        if (a >= 0 && b >= 0){
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++){
            setSelected(ids[i], true);
            syncSelectCheckbox(ids[i], true);
          }
          lastActiveRowId = rowId;
          syncSticky();
          return;
        }
      }

      const on = !selected.has(rowId);
      setSelected(rowId, on);
      syncSelectCheckbox(rowId, on);

      // The anchor a later shift-click ranges from is always the row last clicked,
      // whether that click ticked it or unticked it.
      lastActiveRowId = rowId;
      syncSticky();
    }

