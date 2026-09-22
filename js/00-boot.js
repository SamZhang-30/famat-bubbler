    /* Boot: safe storage + user preferences applied before first paint. */
    (function(){
      /* iOS Safari enlarges the whole page when focusing a small form control. This
         app uses fixed pinned bands and anchored scrollers, so that reflow makes the
         controls unusable. Limit the automatic focus zoom on iOS only; modern iOS
         still permits pinch zoom, and Android keeps its normal zoom behavior. */
      try{
        var ua = navigator.userAgent || "";
        var isiOS = /iPad|iPhone|iPod/.test(ua)
          || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
        var viewport = document.querySelector('meta[name="viewport"]');
        if (isiOS && viewport){
          var content = viewport.getAttribute("content") || "";
          if (!/maximum-scale\s*=/.test(content)){
            viewport.setAttribute("content", content + ", maximum-scale=1");
          }
        }
      }catch(_){ }

      try{ window.localStorage.getItem("__fb_probe__"); }
      catch(e){
        window.FBStorageVolatile = true;
        var mem = {};
        var shim = {
          getItem: function(k){ return Object.prototype.hasOwnProperty.call(mem,k) ? mem[k] : null; },
          setItem: function(k,v){ mem[k] = String(v); },
          removeItem: function(k){ delete mem[k]; },
          clear: function(){ mem = {}; },
          key: function(i){ return Object.keys(mem)[i] || null; }
        };
        Object.defineProperty(shim, "length", { get: function(){ return Object.keys(mem).length; } });
        try{ Object.defineProperty(window, "localStorage", { value: shim, configurable: true }); }catch(_){}
      }

      window.FBStore = {
        failed: false,
        set: function(key, value){
          try{ if(window.FBStorageVolatile)throw new Error('Storage unavailable'); localStorage.setItem(key, value); this.failed=false; return true; }
          catch(e){ this.failed=true; window.dispatchEvent(new CustomEvent("fb-storage-error",{detail:"Could not save in this browser. Download a backup before closing this tab."})); return false; }
        },
        remove: function(key){
          try{localStorage.removeItem(key);return true;}
          catch(e){this.failed=true;window.dispatchEvent(new CustomEvent("fb-storage-error",{detail:"Could not clear saved browser data."}));return false;}
        }
      };

      var KEY = "famatbubbler.prefs.v1";
      var DEFAULTS = {
        theme: "dark",          // dark | light | system
        density: "compact",     // compact | cozy | comfortable
        width: "wide",          // standard | wide | full
        accent: "#7aa2ff",
        help: true,       // compact explanatory chips are shown
        stickyHead: true,
        stickyTop: true,        // pin the page header (title, competition, setup bar)
        colSel: true,
        colTeam: true,
        colId: true,
        colAct: true,
        zebra: false,           // alternating row surface in the student list
        hideEmptyDivs: true,    // hide a division panel with no students in it
        tintStrength: "normal", // soft | normal | strong — how strong the added-row tint is
        /* Division colors, per competition rather than one global set.
           { season: { "1": "#ffd6a5", ... }, state: {...}, nationals: {...}, custom: {...} }
           Only overrides are stored; anything missing falls back to the table below.
           Regional and Statewide share "season" because they are the same divisions. */
        divColors: {}
      };
      var PALETTES = ["season", "state", "nationals", "custom"];
      // Pastels tuned for the dark surface.
      var DIV_DEFAULTS = { 1:"#ffd6a5", 2:"#b9fbc0", 3:"#bde0fe", 4:"#ffc6ff", 5:"#fff3b0", 6:"#beb0e8" };
      // On white those four wash out (relative luminance 0.72-0.89 against a 0.90 page),
      // so light mode uses darker variants of the same hues, all at luminance ~0.58 —
      // roughly the contrast Precalculus and Statistics already carry.
      var DIV_DEFAULTS_LIGHT = { 1:"#f8be78", 2:"#85dc8e", 3:"#9dcdf7", 4:"#f4b3f4", 5:"#dbc967", 6:"#cdc2ed" };
      // Multiplies the per-team row tint alpha, so the whole list gets louder or quieter at once.
      var TINT_SCALE = { soft: 0.6, normal: 1, strong: 1.5 };
      // Light mode uses gentler tints, with Soft kept perceptible.
      var LIGHT_TINT_SCALE = { soft: 0.35, normal: 0.6, strong: 1 };
      /* The catch-all, division 0 — students with no division, or one that does not
         compete. It used to share the gray above, which made "nobody has colored this
         yet" and "this is not a division" the same color, when the second of the two
         should be the quieter. So it is its own value, it is fixed, and no swatch
         reaches it: there is nothing here for a user to choose.
         Weaker means weaker against the surface it is on, which is not the same color
         in the two themes. Dark takes it down toward the panel; light takes it up
         toward the page. Both stay well clear of the dark ink the pill prints in. */
      var NA_GRAY = { dark: "#9aa3b5", light: "#dfe3ea" };
      function divTable(){
        return (resolvedTheme() === "light") ? DIV_DEFAULTS_LIGHT : DIV_DEFAULTS;
      }
      function naGray(){ return (resolvedTheme() === "light") ? NA_GRAY.light : NA_GRAY.dark; }
      /*
       * What a division is painted before anybody paints it, which for every palette
       * including Custom is the regular season's color for that division.
       *
       * Custom used to answer gray here, on the reasoning that a custom division is
       * invented and has no subject to take a hue from. But Custom does not start
       * invented. It starts as the season's six divisions, so the season's colors are
       * its starting state, and a starting state is a default rather than something
       * to go looking for and install. Answering it here means every route into Custom
       * gets it for nothing: a first visit, a reload, an undo, a loaded draft.
       */
      function divDefault(d, palette){
        // the catch-all is the same at every competition, and in every palette
        if (String(d) === "0") return naGray();
        return divTable()[d];
      }

      /* Read-only now. Nothing writes this any more: the season's colors are what a
         palette answers when it holds no override at all, so reverting clears the
         overrides instead of filling them with a word. Palettes written by the build
         that did fill them still have to read back, and they resolve to the same
         colors they always did. */
      var SEASON_SENTINEL = "season";
      function resolveDivColor(d, over){
        /* Hardcoded means hardcoded: the catch-all is answered before the stored
           overrides are consulted at all, so a value left in a palette by an older
           build — or written by a swatch that should never have existed — cannot
           repaint it. */
        if (String(d) === "0") return naGray();
        var v = (over || prefs.divColors[activePalette] || {})[d];
        if (v === SEASON_SENTINEL) return divTable()[d];
        return v || divDefault(d);
      }

      var prefs;
      try{ prefs = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || "{}")); }
      catch(e){ prefs = Object.assign({}, DEFAULTS); }

      /* divColors used to be one flat { index: hex } map shared by every competition,
         so recoloring Theta at the State convention also recolored Algebra II at a
         regular meet — they share a color index. It is keyed by palette now. An old
         flat map is read as the season palette, which is where those colors were set. */
      var dc = prefs.divColors || {};
      var looksFlat = Object.keys(dc).some(function(k){ return PALETTES.indexOf(k) < 0; });
      var next = {};
      PALETTES.forEach(function(name){
        next[name] = Object.assign({}, (!looksFlat && dc[name]) ? dc[name] : {});
      });
      if (looksFlat) next.season = Object.assign({}, dc);
      prefs.divColors = next;

      /* Which palette is on screen. The competition lives in its own key and its own
         script; this peek is only so the first paint is already the right colors
         rather than the season's. The app calls setPalette() once it has loaded for
         real, and again on every switch. */
      var PALETTE_FOR_PRESET = { regional:"season", statewide:"season", state:"state", nationals:"nationals", custom:"custom" };
      var activePalette = "season";
      try{
        var comp = JSON.parse(localStorage.getItem("famatbubbler.competition.v1") || "null");
        if (comp && PALETTE_FOR_PRESET[comp.preset]) activePalette = PALETTE_FOR_PRESET[comp.preset];
      }catch(e){}
      // Older builds stored three text modes. Both visible modes now migrate to the
      // same compact on state; only an explicit off remains off.
      if (typeof prefs.help !== "boolean") prefs.help = prefs.help !== "off";
      if (["soft","normal","strong"].indexOf(prefs.tintStrength) < 0) prefs.tintStrength = "normal";

      function resolvedTheme(){
        if (prefs.theme === "system"){
          return (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark";
        }
        return (prefs.theme === "light") ? "light" : "dark";
      }

      function apply(){
        var r = document.documentElement;
        r.dataset.theme = resolvedTheme();
        r.dataset.density = prefs.density;
        r.dataset.width = prefs.width;
        r.dataset.help = prefs.help ? "on" : "off";
        r.dataset.stickyhead = prefs.stickyHead ? "1" : "0";
        r.dataset.stickytop = prefs.stickyTop ? "1" : "0";
        r.dataset.colSel = prefs.colSel ? "1" : "0";
        r.dataset.colTeam = prefs.colTeam ? "1" : "0";
        r.dataset.colId = prefs.colId ? "1" : "0";
        r.dataset.colAct = prefs.colAct ? "1" : "0";
        r.dataset.zebra = prefs.zebra ? "1" : "0";
        r.dataset.hideempty = prefs.hideEmptyDivs ? "1" : "0";
        r.dataset.tint = prefs.tintStrength;
        var tintScale = r.dataset.theme === "light" ? LIGHT_TINT_SCALE : TINT_SCALE;
        r.style.setProperty("--tintScale", String(tintScale[prefs.tintStrength] || tintScale.normal));
        r.style.setProperty("--accent", prefs.accent || DEFAULTS.accent);
        var over = prefs.divColors[activePalette] || {};
        // from 0, so --div0 comes from the same constant as everything else
        for (var d = 0; d <= 6; d++){
          r.style.setProperty("--div" + d, resolveDivColor(d, over));
        }
      }

      function save(){
        window.FBStore.set(KEY, JSON.stringify(prefs));
      }

      window.FBPrefs = {
        DEFAULTS: DEFAULTS,
        DIV_DEFAULTS: DIV_DEFAULTS,
        DIV_DEFAULTS_LIGHT: DIV_DEFAULTS_LIGHT,
        TINT_SCALE: TINT_SCALE,
        divDefault: divDefault,
        get: function(k){ return prefs[k]; },
        all: function(){ return prefs; },
        set: function(k, v){ prefs[k] = v; save(); apply(); this._notify(k); },

        // ---- division colors, per competition ----
        paletteFor: function(preset){ return PALETTE_FOR_PRESET[preset] || "season"; },
        palette: function(){ return activePalette; },
        /** Point the CSS variables at one competition's colors. */
        setPalette: function(name){
          var next = PALETTES.indexOf(name) >= 0 ? name : "season";
          if (next === activePalette) return;
          activePalette = next;
          apply();
          this._notify("divColors");
        },
        setDivColor: function(d, v){
          /* Index 0 is the neutral gray a division wears before it is anything —
             nameless, or not competing at all. It is hardcoded in the stylesheet,
             apply() never writes it, and nothing may store over it: a value here
             would be invisible on screen and would still count as "this palette is
             customized", lighting up a revert with nothing to revert. */
          if (String(d) === "0") return;
          if (!prefs.divColors[activePalette]) prefs.divColors[activePalette] = {};
          prefs.divColors[activePalette][d] = v;
          save(); apply(); this._notify("divColors");
        },
        /* ---- one palette, whole ----
           A swatch does not write a color so much as write an *entry*: a hex, or the
           "season" sentinel, or nothing at all, where nothing means "use the built-in
           value and go on following the theme". Undo therefore cannot put a color
           back — it has to put the entry back, or the first change a user ever made
           would be undone into a hardcoded hex and the palette would read as
           customized forever after.
           So these two hand the whole map over and take it back. Whole, rather than
           one division at a time, because Revert moves all six at once and this way
           it is the same step as a single swatch rather than a second mechanism. */
        paletteSnapshot: function(name){
          return JSON.parse(JSON.stringify(prefs.divColors[name || activePalette] || {}));
        },
        restorePalette: function(name, map){
          var pal = PALETTES.indexOf(name) >= 0 ? name : activePalette;
          prefs.divColors[pal] = JSON.parse(JSON.stringify(map || {}));
          save(); apply(); this._notify("divColors");
        },
        /** True where this palette has been changed from the built-in colors. */
        divColorsCustomized: function(){
          return Object.keys(prefs.divColors[activePalette] || {}).some(function(k){ return k !== "0"; });
        },
        /** What this division is painted right now, resolved for the theme. */
        divColor: function(d){ return resolveDivColor(d); },
        /** Forget one division's color, so it goes back to the season's. */
        clearDivColor: function(d){
          var pal = prefs.divColors[activePalette];
          if (!pal || pal[d] === undefined) return;
          delete pal[d];
          save(); apply(); this._notify("divColors");
        },
        /** Put this competition's colors back to the built-in ones. */
        resetDivColors: function(){
          prefs.divColors[activePalette] = {};
          save(); apply(); this._notify("divColors");
        },
        reset: function(){
          prefs = Object.assign({}, DEFAULTS, { divColors: { season:{}, state:{}, nationals:{}, custom:{} } });
          save(); apply(); this._notify("*");
        },
        onChange: function(fn){ this._subs.push(fn); },
        _subs: [],
        _notify: function(k){ this._subs.forEach(function(f){ try{ f(k); }catch(e){} }); },
        apply: apply
      };

      apply();
      if (window.matchMedia){
        try{
          window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", function(){
            if (prefs.theme === "system"){ apply(); window.FBPrefs._notify("theme"); }
          });
        }catch(e){}
      }
    })();
