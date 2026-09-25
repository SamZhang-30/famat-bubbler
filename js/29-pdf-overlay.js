    // ====== PDF overlay (pdf-lib) ======
    function yFlip(page, yFromTop){
      return page.getHeight() - yFromTop;
    }

    /* The three written lines all start at the same left edge and are set in the same
       size. Named once so the width pre-flight below measures exactly the box the text
       is actually drawn into — the two cannot drift apart. */
    const FIELD_X = 169.7;
    const FIELD_SIZE = 11.5;
    const FIELD_RIGHT = 350;
    const FIELD_RIGHT_MARGIN = 24;   // the sheet's own right edge, kept clear

    /* The sheet is not centered on its own page, and never has been. Measured off the
       template's ink — every painted path, transformed through its own matrices, with
       the white background rectangle left out because it is not something you can see
       — the artwork spans x 5.86 to 582.03 on a 612pt page. That is 5.86pt of paper on
       the left and 29.97pt on the right, so it sits 24.12pt left of center. Half of
       that, moved right, evens the two margins up at about 17.9pt each.

       The move is made by shifting the page box, not the drawing. Sliding the origin
       left by this much carries the template artwork and everything drawn on top of it
       rightward together, in one operation, and no coordinate anywhere else has to know
       it happened. The page stays exactly 612x792 — all that changes is where the paper
       sits underneath the content.

       Measured against sheet version 2018.B. A different template would need measuring
       again; set this to 0 to put the sheet back where it was. */
    const SHEET_X_SHIFT = 12.06;

    /**
     * Fonts for the written fields. Custom fonts are bundled locally and embedded.
     * Character validation remains unchanged for FAMAT compatibility.
     */
    const PDF_TEXT_FONTS = [
      "RobotoCondensed", "RobotoCondensedBold",
      "Helvetica", "HelveticaBold", "HelveticaOblique", "HelveticaBoldOblique",
      "TimesRoman", "TimesRomanBold", "TimesRomanItalic", "TimesRomanBoldItalic",
      "Courier", "CourierBold", "CourierOblique", "CourierBoldOblique",
    ];
    function filterFilenameCharacters(value){
      return String(value ?? "").replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, "");
    }
    function safePdfFilename(value){
      let name = filterFilenameCharacters(value).trim();
      // Remove trailing dots/spaces and repeated extensions before adding our own.
      name = name.replace(/[. ]+$/g, "");
      while(/\.pdf$/i.test(name)) name = name.slice(0, -4).replace(/[. ]+$/g, "");
      if(!name) name = "BubbledAnswerSheet";
      if(/^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/i.test(name)) name = "_" + name;
      return name + ".pdf";
    }
    function pdfFontKey(){
      const v = String(document.getElementById("pdfFont")?.value || "");
      return PDF_TEXT_FONTS.indexOf(v) >= 0 ? v : "Helvetica";
    }
    const PDF_CUSTOM_FONT_FILES = {
      RobotoCondensed: "fonts/RobotoCondensed-Regular.ttf",
      RobotoCondensedBold: "fonts/RobotoCondensed-Bold.ttf",
    };
    const pdfFontBytes = new Map();
    async function embedPdfTextFont(doc, key){
      const path = PDF_CUSTOM_FONT_FILES[key];
      if(!path) return doc.embedFont(PDFLib.StandardFonts[key] || PDFLib.StandardFonts.Helvetica);
      if(!window.fontkit) throw new Error("The PDF font library could not load. Reload the page and try again.");
      doc.registerFontkit(window.fontkit);
      if(!pdfFontBytes.has(path)){
        const encoded = window.FAMAT_PDF_FONT_DATA?.[key];
        if(!encoded) throw new Error("The bundled PDF font is missing. Restore the fonts folder and reload the page.");
        pdfFontBytes.set(path, Uint8Array.from(atob(encoded), character => character.charCodeAt(0)));
      }
      return doc.embedFont(await pdfFontBytes.get(path), { subset: true });
    }

    function drawName(page, font, text){
      page.drawText(text ?? "", { x: FIELD_X, y: yFlip(page, 111.3), size: FIELD_SIZE, font });
    }
    function drawSchool(page, font, text){
      page.drawText(text ?? "", { x: FIELD_X, y: yFlip(page, 131.5), size: FIELD_SIZE, font });
    }
    function getTestCodeBubbleConfig(){
      return {
        text: {
          x: 105.34,
          yFromTop: 437.1,
          size: 20,
          sepX: 16.9,
        },
        bubble: {
          startX: 110.87,
          yZeroFromTop: 453.5,
          stepX: 16.7,
          stepY: 15.26,
          radius: 6.4,
          nudgeY: 0,
        },
      };
    }

    function drawTest(page, font, text){
      page.drawText(text ?? "", { x: FIELD_X, y: yFlip(page, 151.9), size: FIELD_SIZE, font });
    }

    function drawTopicTestCode(page, font, code3, cfg){
      const { rgb } = PDFLib;
      const code = String(code3 || "").replace(/\D/g, "").slice(0, 3);
      if (!code) return;

      const textStepX = Number.isFinite(cfg.text?.sepX) ? cfg.text.sepX : cfg.bubble.stepX;
      for (let i = 0; i < code.length; i++){
        const ch = code.charAt(i);
        const digit = ch.charCodeAt(0) - 48;
        if (digit < 0 || digit > 9) continue;
        const tx = cfg.text.x + (textStepX * i);
        const ty = yFlip(page, cfg.text.yFromTop);
        page.drawText(ch, { x: tx, y: ty, size: cfg.text.size, font, color: rgb(0, 0, 0) });

        const bx = cfg.bubble.startX + (cfg.bubble.stepX * i);
        const by = yFlip(page, cfg.bubble.yZeroFromTop + (cfg.bubble.stepY * digit) + cfg.bubble.nudgeY);
        page.drawCircle({ x: bx, y: by, size: cfg.bubble.radius, color: rgb(0, 0, 0), opacity: 0.75 });
      }
    }

    function drawID(page, font, id9, bubbles) {
      const { rgb } = PDFLib;

      const CALIBRATE = false;

      const DIG = {
        startX: 106,
        stepX: 17,
        useManualX: true,
        manualX: [105.6, 122.29, 138.98, 156, 173.02, 189.37, 206.05, 223.4, 240.64],
        // Courier's visible numeral ink sits slightly left of its advance box.
        inkNudgeX: 0.5,
        yFromTop: 214.7,
        size: 18,
      };

      const BUB = {
        startX: 110.74,
        stepX: 17.01,
        useManualX: false,
        manualX: [110, 127, 144, 161, 178, 195, 212, 229, 246],
        yZeroFromTop: 211 + 19.6,
        stepY: 15.36,
        nudgeY: 0,
        perColNudgeX: [0.1, 0, -0.6, -0.9, -0.5, -1, -1.8, -1.8, -1],
        radius: 6.63,
      };

      function digitX(i) {
        return DIG.useManualX ? DIG.manualX[i] : DIG.startX + DIG.stepX * i;
      }
      function bubbleX(i) {
        const base = BUB.useManualX ? BUB.manualX[i] : BUB.startX + BUB.stepX * i;
        const nudge = BUB.perColNudgeX?.[i] ?? 0;
        return base + nudge;
      }
      function drawCrosshair(x, y, size = 4) {
        page.drawLine({ start: { x: x - size, y }, end: { x: x + size, y }, thickness: 0.6, color: rgb(1,0,0), opacity: 0.6 });
        page.drawLine({ start: { x, y: y - size }, end: { x, y: y + size }, thickness: 0.6, color: rgb(1,0,0), opacity: 0.6 });
      }

      for (let i = 0; i < id9.length && i < 9; i++) {
        if (!bubbles[i]) continue;

        const ch = id9.charAt(i);

        const dx = digitX(i) + DIG.inkNudgeX;
        const dy = yFlip(page, DIG.yFromTop);

        page.drawText(ch, { x: dx, y: dy, size: DIG.size, font, color: rgb(0, 0, 0) });
        if (CALIBRATE) drawCrosshair(dx + 5.4, dy + 5.6);

        const digit = ch.charCodeAt(0) - "0".charCodeAt(0);
        if (digit < 0 || digit > 9) continue;

        const bx = bubbleX(i);
        const byFromTop = BUB.yZeroFromTop + BUB.stepY * digit + BUB.nudgeY;
        const by = yFlip(page, byFromTop);

        page.drawCircle({ x: bx, y: by, size: BUB.radius, color: rgb(0, 0, 0), opacity: 0.75 });
        if (CALIBRATE) drawCrosshair(bx, by);
      }
    }

    /**
     * Slide one page's contents rightward by moving the paper under them.
     * Runs before anything is drawn, though it would work just as well after: the box
     * is the frame, and the frame moves everything inside it at once.
     */
    function centerSheetOnPage(page){
      if (!SHEET_X_SHIFT) return;
      const mb = page.getMediaBox();
      const cb = page.getCropBox();
      page.setMediaBox(mb.x - SHEET_X_SHIFT, mb.y, mb.width, mb.height);
      // getCropBox falls back to the media box, so this only bites when the template
      // really does carry a different one — and then it has to travel too, or it
      // would crop the sheet back to where it started.
      if (cb.x !== mb.x || cb.y !== mb.y || cb.width !== mb.width || cb.height !== mb.height){
        page.setCropBox(cb.x - SHEET_X_SHIFT, cb.y, cb.width, cb.height);
      }
    }

    function drawPage(page, font, idFont, student, id9, school, tests, bubbles, testCodeCfg, testIds){
      const divisionLabel = formatTestFieldForStudent(student, tests);
      const topicCode = testCodeForStudent(student, testIds);
      drawName(page, font, fullName(student));
      drawSchool(page, font, school);
      drawTest(page, font, divisionLabel);
      drawID(page, idFont, id9, bubbles);
      drawTopicTestCode(page, idFont, topicCode, testCodeCfg);
    }

    async function fetchTemplatePdfBytes(){
      const resp = await fetch(TEMPLATE_URL);
      if (!resp.ok) throw new Error("Template fetch failed: HTTP " + resp.status);

      const bytes = await resp.arrayBuffer();
      const head = new TextDecoder().decode(new Uint8Array(bytes.slice(0, 5)));
      if (head !== "%PDF-") throw new Error("Template did not load as a PDF.");

      return bytes;
    }

    function showProgress(total, current){
      const wrap = document.getElementById("progressWrap");
      const text = document.getElementById("progressText");
      const fill = document.getElementById("progressFill");
      if (!wrap || !text || !fill) return;

      wrap.style.display = "flex";
      text.textContent = `Page ${current} of ${total}`;
      const pct = total ? Math.round((current / total) * 100) : 0;
      fill.style.width = `${pct}%`;
    }
    function hideProgress(){
      const wrap = document.getElementById("progressWrap");
      const fill = document.getElementById("progressFill");
      if (wrap) wrap.style.display = "none";
      if (fill) fill.style.width = "0%";
    }

    /**
     * pdf-lib's standard fonts are WinAnsi-encoded and throw on anything outside
     * it (Greek, CJK, and so on). Catching that here names the offending text
     * instead of surfacing a raw encoding exception mid-generation.
     */
    const WINANSI_CHAR = /^[\x20-\x7E\u00A0-\u00FF\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178]$/;
    function unprintableChars(text){
      const bad = [];
      for (const ch of String(text ?? "")){
        if (!WINANSI_CHAR.test(ch) && bad.indexOf(ch) < 0) bad.push(ch);
      }
      return bad;
    }
    /** @returns {string} an explanation, or "" when everything can be drawn. */
    function checkPrintable(entries){
      const chars = [];
      const where = [];
      for (const [label, text] of entries){
        const bad = unprintableChars(text);
        if (!bad.length) continue;
        for (const c of bad) if (chars.indexOf(c) < 0) chars.push(c);
        if (where.indexOf(label) < 0) where.push(label);
      }
      if (!chars.length) return "";
      return `The PDF font cannot draw ${chars.map(c => `"${c}"`).join(", ")}. `
        + `Found in: ${where.slice(0, 6).join(" / ")}${where.length > 6 ? ` and ${where.length - 6} more` : ""}. `
        + "Replace those characters with plain letters.";
    }

    /**
     * The three written lines do not wrap — they are drawn at a fixed point and run on.
     * That was safe while the font was always Helvetica; now that the font is a choice,
     * and Courier is roughly a fifth wider at the same size, an overrun is worth saying
     * out loud. It is ugly rather than wrong, so this warns and the PDF is still built.
     * @returns {string} an explanation, or "" when everything fits.
     */
    function checkFieldWidths(font, avail, entries){
      const over = [];
      for (const [label, text] of entries){
        const t = String(text ?? "");
        if (!t) continue;
        let w;
        try{ w = font.widthOfTextAtSize(t, FIELD_SIZE); }
        catch{ continue; }   // an unencodable character is the other check's business
        if (w > avail) over.push(label);
      }
      if (!over.length) return "";
      return `${over.length} line${over.length === 1 ? "" : "s"} ${over.length === 1 ? "is" : "are"} too long for the space on the sheet in this font `
        + `and will run past the end: ${over.slice(0, 6).join(" / ")}${over.length > 6 ? ` and ${over.length - 6} more` : ""}. `
        + "Pick a narrower font in PDF Setup \u2192 Text Font, or shorten the text.";
    }

    async function createPDF(){
      const error1 = document.getElementById("error1");
      error1.textContent = "";

      const reason = pdfBlockReason();
      if (reason){
        error1.textContent = reason.detail;
        syncSticky();
        return;
      }

      try{
        pdfInProgress = true;
        cancelPdfFlag = false;
        syncSticky();
        refreshFixTeamsButtons();

        const { PDFDocument, StandardFonts } = PDFLib;

        const templateBytes = await fetchTemplatePdfBytes();
        const templateDoc = await PDFDocument.load(templateBytes);

        const outDoc = await PDFDocument.create();
        const [templatePage] = await outDoc.embedPdf(templateBytes, [0]);
        // The written lines follow the PDF Setup choice; the bubbled digits stay
        // monospaced whatever it is, because they are aligned to the sheet's columns.
        const font = await embedPdfTextFont(outDoc, pdfFontKey());
        const idFont = await outDoc.embedFont(StandardFonts.Courier);

        const school = document.getElementById("school").value || "";

        const bubbles = [];
        const bubbleInputs = document.getElementById("bubbles").getElementsByTagName("input");
        for (let i = 0; i < 9; i++) bubbles.push(bubbleInputs[i].checked);

        /* getDivisionLabels(), not the raw boxes. What is typed there is the
           *override*; an empty box means the division prints the name this competition
           assumes for it, which is what its ghost has been showing all along. Reading
           the values straight off the inputs printed a blank Test field for every
           division nobody had typed a name into — which is all six of them until
           somebody does. */
        const tests = getDivisionLabels();
        const testIds = getDivisionTestIds();
        const testCodeCfg = getTestCodeBubbleConfig();

        const filename = safePdfFilename(document.getElementById("filename").value);

        // The list on screen is the page order, so the pages are cut from it
        // directly rather than from the order students happened to be entered in.
        const includedStudents = getPageOrder()
          .map(rid => getStudent(rid))
          .filter(s => s && s.included);

        // pre-flight: a character the font cannot encode would throw mid-run. The
        // charset rule above is the stricter of the two and pdfBlockReason has
        // already stopped anything failing it; this stays as the last word on what
        // the font itself will actually accept.
        const printChecks = pdfTextEntries();
        const printProblem = checkPrintable(printChecks);
        if (printProblem){
          error1.textContent = printProblem;
          pdfInProgress = false;
          hideProgress();
          syncSticky();
          refreshFixTeamsButtons();
          return;
        }
        // Not a blocker, so it is held back and reported against the file it describes.
        const widthWarning = checkFieldWidths(
          font,
          FIELD_RIGHT - FIELD_X,
          printChecks
        );
        const total = includedStudents.length;
        if (!total){
          error1.textContent = "Nothing to print. Add at least one student to the PDF first.";
          pdfInProgress = false;
          hideProgress();
          syncSticky();
          refreshFixTeamsButtons();
          return;
        }

        let done = 0;
        showProgress(total, done);

        for (const s of includedStudents){
          if (cancelPdfFlag){
            error1.textContent = "Canceled. No file was saved.";
            return;
          }

          const id8 = s.id8;
          if (!completeId(id8) || s.division === 0){
            // should be impossible due to blocker, but keep safe
            continue;
          }

          const id9 = bubbledId8(s) + bubbledTeamDigit(s);

          const page = outDoc.addPage([templatePage.width, templatePage.height]);
          page.drawPage(templatePage);
          centerSheetOnPage(page);

          drawPage(page, font, idFont, s, id9, school, tests, bubbles, testCodeCfg, testIds);

          done++;
          if (done % 2 === 0){
            showProgress(total, done);
            await new Promise(requestAnimationFrame);
          }
        }

        showProgress(total, done);

        if (done === 0){
          pdfInProgress = false;
          hideProgress();
          syncSticky();
          refreshFixTeamsButtons();
          return;
        }

        if(cancelPdfFlag) {error1.textContent="Canceled. No file was saved.";return;}
        const outBytes = await outDoc.save();
        if(cancelPdfFlag) {error1.textContent="Canceled. No file was saved.";return;}
        const blob = new Blob([outBytes], { type: "application/pdf" });
        const outUrl = URL.createObjectURL(blob);

        // Every successful export opens the rendered sheets for review. Downloading
        // is an explicit action in the preview, so a normal export and an overlong
        // export follow the same safe path.
        error1.textContent = widthWarning || "";
        showPdfPreview(outUrl,filename,widthWarning || "");

      } catch (err){
        error1.textContent = "Could not build the PDF: " + String(err && err.message ? err.message : err);
      } finally {
        pdfInProgress = false;
        cancelPdfFlag = false;
        hideProgress();
        syncSticky();
        refreshFixTeamsButtons();
      }
    }
