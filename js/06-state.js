    // ====== STATE: source of truth ======
    /** @type {Array<{rowId:number,first:string,last:string,id8:string,division:number,included:boolean,team:"X"|0|1|2|3,topicTestKey:string}>} */
    let students = [];
    let nextRowId = 1;

    // ====== Derived caches (incremental) ======
    // rowId -> index in students[]
    const rowIndex = new Map();

    // division -> Set<rowId>
    const byDivision = new Map([[0,new Set()],[1,new Set()],[2,new Set()],[3,new Set()],[4,new Set()],[5,new Set()],[6,new Set()]]);

    // id8 -> Set<rowId>
    const idToRowIds = new Map();

    // counts per division
    const divCounts = new Map(); // div -> {total,included,invalidTotal,invalidIncluded,team:[x,t1,t2,t3],over:[bool..],hasAnyTeam:boolean}
    for (const d of [0,1,2,3,4,5,6]){
      divCounts.set(d, {
        total: 0,
        included: 0,
        invalidTotal: 0,
        invalidIncluded: 0,
        // one slot per team plus index 0, which is X or the convention's 0
        team: [0,0,0,0,0,0,0,0,0,0],
        over: [false,false,false,false,false,false,false,false,false,false],
        hasAnyTeam: false,
      });
    }

    // name index for filtering (lowercase exact -> Set<rowId>)
    const nameToRowIds = new Map();

    // "first|last" -> Set<rowId>, used when the stated name order should win
    const nameExactToRowIds = new Map();

    // DOM row cache
    const rowEl = new Map(); // rowId -> <tr>

    // selection
    const selected = new Set(); // rowId
    let lastActiveRowId = null;

    /* ------------------------------------------------------------------
       The one order

       The unified table's row order is the order the PDF prints its pages in.
       There is only ever this one array: sorting a column rewrites it, dragging
       a row in the list editor rewrites it, and adding or removing a student
       adds to or takes from it. Nothing derives a second ordering from the
       students array, so the list on screen and the stack coming out of the
       printer can never disagree.
       ------------------------------------------------------------------ */
    /** @type {number[]} every rowId, in page order */
    let masterOrder = [];

    /** Which heading is sorting the table, and which way. "" is untouched order. */
    let sortState = { col: "", dir: "" };   // dir: "down" | "up"

    // undo/redo
    const undoStack = [];
    const redoStack = [];
    const fieldEditSession = new Map();

    // popover state
    const teamPopover = document.getElementById("teamPopover");
    const topicPopover = document.getElementById("topicPopover");
    const divisionPopover = document.getElementById("divisionPopover");
    let popoverContext = null; // {type:"row", rowId} or {type:"batch", rowIds:number[]}
    let topicPopoverContext = null; // {type:"row", rowId, families:string[]} or {type:"batch", rowIds:number[], families:string[]}

    // pdf progress cancel
    let cancelPdfFlag = false;
    let pdfInProgress = false;

