    // ====== Keyboard shortcuts ======
    function isTypingTarget(ev){
      const t = ev.target;
      if (!t) return false;
      const tag = (t.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || t.isContentEditable) return true;
      return false;
    }

    document.addEventListener("keydown", (ev) => {
      if(ev.key !== 'Escape' && [...document.querySelectorAll('.modalBack')].some(e=>e.style.display==='flex')) return;
      // popover key handling
      if (teamPopover.style.display === "block"){
        if (ev.key === "Escape"){
          ev.preventDefault();
          closeTeamPopover();
          return;
        }
        // the numbers this competition actually offers, plus the two that are on
        // offer at every one of them: 0 for no team, X for a team not yet decided
        const isX = (ev.key === "x" || ev.key === "X");
        const isZero = (ev.key === "0");
        if (isX || isZero || teamNumbers().indexOf(Number(ev.key)) >= 0){
          ev.preventDefault();
          pickTeam(isX ? "X" : ev.key);
          return;
        }
      }
      if (topicPopover.dataset.open === "1"){
        if (ev.key === "Escape"){
          ev.preventDefault();
          closeTopicPopover();
          return;
        }
        /* No number keys any more. They only worked because every option carried the
           digit that picked it, and that chip was costing the list a column; a shortcut
           whose label has gone is a shortcut nobody can discover and everybody can hit
           by accident. Escape still closes, X still clears — both are printed on the
           list or obvious from it. */
        if (ev.key === "x" || ev.key === "X"){
          ev.preventDefault();
          pickTopic("");
          return;
        }
      }

      if (divisionPopover.dataset.open === "1"){
        if (ev.key === "Escape"){
          ev.preventDefault();
          closeDivisionPopover();
          return;
        }
        // the six roster divisions are 1 to 6, which is also the digit being written
        if (["1","2","3","4","5","6"].includes(ev.key)){
          ev.preventDefault();
          pickDivision(ev.key);
          return;
        }
      }

      // modal escape
      const back = document.getElementById("dupModalBack");
      if (back && back.style.display === "flex" && ev.key === "Escape"){
        ev.preventDefault();
        closeDupModal();
        return;
      }

      // the custom editor sits over the competition dialog, so it closes first
      const customBack = document.getElementById("customModalBack");
      if (customBack && customBack.style.display === "flex" && ev.key === "Escape"){
        ev.preventDefault();
        closeCustomEditor();
        return;
      }

      const compBack = document.getElementById("competitionModalBack");
      if (compBack && compBack.style.display === "flex" && ev.key === "Escape"){
        ev.preventDefault();
        closeCompetitionModal();
        return;
      }

      const filterBack = document.getElementById("filterModalBack");
      if (filterBack && filterBack.style.display === "flex" && ev.key === "Escape"){
        ev.preventDefault();
        closeRowFilter();
        return;
      }

      const fillBack = document.getElementById("fillTeamsModalBack");
      if (fillBack && fillBack.style.display === "flex" && ev.key === "Escape"){
        ev.preventDefault();
        closeFillTeamsModal();
        return;
      }

      if (isTypingTarget(ev)) return;

      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? ev.metaKey : ev.ctrlKey;

      if (mod && ev.key.toLowerCase() === "z"){
        ev.preventDefault();
        if (ev.shiftKey) redo();
        else undo();
        syncAllCountersAndSummaries();
        syncSticky();
        refreshFixTeamsButtons();
        return;
      }
      if (!isMac && ev.ctrlKey && ev.key.toLowerCase() === "y"){
        ev.preventDefault();
        redo();
        syncAllCountersAndSummaries();
        syncSticky();
        refreshFixTeamsButtons();
        return;
      }

      // batch shortcuts
      if (ev.key === "Escape"){
        if (selected.size){
          ev.preventDefault();
          clearSelection();
        }
        return;
      }
      if (ev.key.toLowerCase() === "a"){
        if (selected.size){
          ev.preventDefault();
          batchSetInclude(Array.from(selected), true);
          syncAllCountersAndSummaries();
          syncSticky();
          refreshFixTeamsButtons();
        }
        return;
      }
      if (ev.key.toLowerCase() === "x"){
        if (selected.size){
          ev.preventDefault();
          batchSetInclude(Array.from(selected), false);
          syncAllCountersAndSummaries();
          syncSticky();
          refreshFixTeamsButtons();
        }
        return;
      }
      if (["1","2","3"].includes(ev.key)){
        if (selected.size && hasTeamSelection() && teamNumbers().indexOf(Number(ev.key)) >= 0){
          ev.preventDefault();
          batchSetTeam(Array.from(selected), Number(ev.key));
          syncAllCountersAndSummaries();
          syncSticky();
          refreshFixTeamsButtons();
        }
        return;
      }
    });
