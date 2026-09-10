    // ====== Utilities ======
    function clamp8Digits(raw){
      return String(raw ?? "").replace(/[^0-9#]/g, "").slice(0, 8);
    }
    /** Roster digit -> the division group this competition puts that student in. */
    function divisionFromId8(id8){
      if (!completeId(id8)) return 0;
      const d = id8.charCodeAt(7) - 48;
      if (d < 1 || d > 6) return 0;
      return groupForRosterDigit(d);
    }
    /** 8-digit ID: School ID (4) + Student Number (3) + Roster Level (1–6). */
    function composeStudentId8(schoolRaw, studentRaw, divisionNum){
      const s4 = String(schoolRaw ?? "").replace(/\D/g, "").padStart(4, "0").slice(-4);
      let s3 = String(studentRaw ?? "").replace(/\D/g, "");
      if (s3.length > 3) s3 = s3.slice(-3);
      s3 = s3.padStart(3, "0");
      const d = Math.min(6, Math.max(1, Number(divisionNum) || 1));
      return (s4 + s3 + String(d)).slice(0, 8);
    }
    /**
     * The School ID every student here shares, taken as the commonest prefix.
     *
     * It used to re-read the raw text looking for a literal eight-digit run, which
     * is a stricter idea of "an ID" than the student parser's — that one joins the
     * last three tokens of the line and strips non-digits. A roster the parser
     * accepted could therefore load every student correctly and still leave School ID
     * blank, which then flagged rows for a reason nobody could trace. So it counts the
     * IDs that were actually parsed: one definition of an ID, held in one place.
     *
     * @param {string[]} _lines kept for call-site compatibility; no longer read.
     * @param {string[]} id8s   the eight-digit IDs this import produced.
     */
    function inferMostCommonFourDigitPrefixFromLines(_lines, id8s){
      const counts = new Map();
      for (const id8 of (id8s || [])){
        if (String(id8).length !== 8) continue;
        const p = String(id8).slice(0, 4);
        counts.set(p, (counts.get(p) || 0) + 1);
      }
      let best = "";
      let bestN = 0;
      for (const [p, n] of counts.entries()){
        if (n > bestN || (n === bestN && p.localeCompare(best) < 0)){
          best = p;
          bestN = n;
        }
      }
      return best;
    }
    /* Moved here from the enrollment/slots section: the competition and list-view
       loaders below run while this file's script is still the only one parsed, so
       this helper has to be declared in a file that loads before them. */
    function safeParseJson(s, fallback){
      try{ return JSON.parse(s); } catch { return fallback; }
    }

    function completeId(id){ return /^\d{8}$/.test(String(id || "")); }
    function canChangeLevel(id){ return /^\d{7}[\d#]?$/.test(String(id || "")); }
    const PERSON_GLYPH = '<svg class="personGlyph" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="4.5" r="2.5"/><path d="M3 14v-1.5a5 5 0 0 1 10 0V14"/></svg>';
