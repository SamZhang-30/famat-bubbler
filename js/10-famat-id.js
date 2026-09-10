    /* ============================================================
       The FAMAT ID cell

       An ID is the School ID (4) + the Student Number (3) + the Roster Level (1),
       and in practice only the middle three ever vary: the School ID is the same for
       everyone at a school, and the Roster Level belongs to the row's Change
       Division action, which rewrites it without disturbing the rest. So the cell
       hands you those three and shows the other five dimmed.

       "Shows" rather than "refuses", though. A pasted roster can carry the wrong
       prefix — that is what the SC warning is for — and a half-typed ID has no
       trustworthy prefix or division to dim in the first place. Both open the whole
       field: the first when you click a dimmed segment, the second on its own.
       ============================================================ */

    /** Rows whose whole ID is open for editing. Session-only: not part of a snapshot. */
    const unlockedRows = new Set();

    /** A usable ID that nobody has asked to open is edited three digits at a time. */
    function idIsLocked(student){
      return /^\d{4}[\d#]{3}\d$/.test(String(student?.id8 || "")) && !unlockedRows.has(student.rowId);
    }

    const UNLOCK_TITLE = "Double-click the ID to edit all eight digits";

    /** The grayed placeholders for however many digits are still missing. */
    function ghostHtml(rowId, typed, slots){
      const val = String(typed || "");
      return `<span class="idGhost" data-idghost="${rowId}" aria-hidden="true">`
        + `<span class="ghostTyped">${escAttr(val)}</span>`
        + `<span class="ghostRest">${"#".repeat(Math.max(0, slots - val.length))}</span></span>`;
    }

    /** The eight slots as the sheet will bubble them, shown while the ID is not being edited. */
    function idSwapInnerHtml(bubbled){
      const b = String(bubbled || "");
      return `<span class="idSeg">${escAttr(b.slice(0, 4))}</span>`
        + `${escAttr(b.slice(4, 7))}`
        + `<span class="swapDigit">${escAttr(b.charAt(7))}</span>`;
    }
    function idSwapHtml(bubbled){
      return `<span class="idSwap" aria-hidden="true">${idSwapInnerHtml(bubbled)}</span>`;
    }

    function idCellHtml(student, bubbleMark){
      const rowId = student.rowId;
      const id8 = String(student.id8 || "");

      if (idIsLocked(student)){
        const school = id8.slice(0, 4);
        const num = id8.slice(4, 7).replace(/#/g, "");
        const div = id8.charAt(7);
        return `<span class="idField">
              <span class="idSeg" data-idseg="school" data-rowid="${rowId}" title="${UNLOCK_TITLE}">${escAttr(school)}</span>
              <span class="idNum">
                ${ghostHtml(rowId, num, 3)}
                <input class="cellInput" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" data-field="idnum" data-rowid="${rowId}" data-school="${escAttr(school)}" data-div="${escAttr(div)}" data-last="${escAttr(id8)}" value="${escAttr(num)}" aria-label="Student Number for ${escAttr(displayName(student))}" autocomplete="off" spellcheck="false">
              </span>
              <span class="idSeg" data-idseg="div" data-rowid="${rowId}" title="${UNLOCK_TITLE}">${escAttr(div)}</span>
              ${bubbleMark}
            </span>`;
      }

      return `<span class="idField">
              ${ghostHtml(rowId, id8, 8)}
              <input class="cellInput" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="8" data-field="id" data-rowid="${rowId}" data-last="${escAttr(id8)}" value="${escAttr(id8)}" aria-label="FAMAT ID for ${escAttr(displayName(student))}" placeholder="" autocomplete="off" spellcheck="false">
              ${bubbleMark}
            </span>`;
    }

