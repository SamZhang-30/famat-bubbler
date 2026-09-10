    // ====== Overflow warnings ======
    /**
     * Every team carrying more than the competition seats, as one list.
     * Read twice: once to mark the rows, once by the warnings pill at the foot of
     * the page — so the mark and the count can never disagree about how many.
     */
    function teamOverflows(){
      const cap = teamSize();
      const out = [];
      if (!hasTeamSelection() || !Number.isFinite(cap)) return out;
      for (const d of [1,2,3,4,5,6]){
        const c = divCounts.get(d);
        if (!c) continue;
        for (const t of teamNumbers()){
          if (c.team[t] > cap) out.push({ div: d, team: t, count: c.team[t], cap });
        }
      }
      return out;
    }

    function syncOverflowUI(){
      // The mark goes on every member of an over-full team, and it lands on the Team
      // cell rather than on the row: the students are fine, the seat count is not.
      const over = teamOverflows();
      const overRowIds = new Set();
      for (const o of over){
        for (const rid of byDivision.get(o.div)){
          const s = getStudent(rid);
          if (s && s.included && s.team === o.team) overRowIds.add(rid);
        }
      }

      for (const s of students){
        const tr = rowEl.get(s.rowId);
        if (!tr) continue;
        tr.dataset.over = overRowIds.has(s.rowId) ? "1" : "0";
      }

      /* The amber badge that used to stand in the action bar naming the first
         over-full team is gone. It could only ever report one of them, and it sat
         beside a red chip that could only ever report one blocker — two controls, two
         arbitrary firsts. Over-full teams are one entry in the Warnings pill now, and
         that entry names every one of them. */
    }

    // ====== Sticky footer state ======
    function computeInvalidIncluded(){
      return students.reduce((a,s)=>a+(s.included && (!completeId(s.id8) || s.division === 0) ? 1 : 0), 0);
    }

    /**
     * Every line of text this workspace would draw on a sheet, labeled by where it
     * comes from. One list, so the character check, the width check and the builder
     * are all looking at exactly the same strings — a division name nobody sits is
     * not on it, and a topic test that resolves back to a division name appears as
     * the division name it resolves to.
     */
    function pdfTextEntries(){
      const tests = getDivisionLabels();
      // read once and handed down: getTopicTestConfig is a dozen document queries,
      // and this runs from syncSticky on every keystroke
      const cfg = getTopicTestConfig();
      const out = [["School name", document.getElementById("school")?.value || ""]];
      for (const rid of getPageOrder()){
        const s = getStudent(rid);
        if (!s || !s.included) continue;
        out.push([`Name of ${displayName(s)}`, fullName(s)]);
        out.push([`Test field for ${displayName(s)}`, formatTestFieldForStudent(s, tests, cfg)]);
      }
      return out;
    }

    /**
     * Those same lines, paired with the characters in them a sheet cannot carry —
     * grouped by the text rather than by the line. One bad division name is one
     * thing to fix, not one per sheet in the division.
     */
    function charsetProblems(){
      const byText = new Map();
      for (const [label, text] of pdfTextEntries()){
        const chars = illegalFieldChars(text);
        if (!chars.length) continue;
        const seen = byText.get(text);
        if (seen) seen.count++;
        else byText.set(text, { text, label, chars, count: 1 });
      }
      return Array.from(byText.values());
    }

