/* Source data explorer: Raw / Clean / Fact / Summary tables with search, filters, paging and CSV download. */
(function () {
    "use strict";
    var PAGE = 50;
    var FILTER_COLS = ["programme", "Programme", "topic", "outcome", "classified_by", "round_type", "company", "Stage"];
    var WIDE = { question: 1, Question: 1, "Learner's answer": 1, "Reviewer note": 1 };
    var LAYERS = [
        { id: "raw", label: "Raw", tables: function () { return window.DATA.raw; } },
        { id: "clean", label: "Clean", tables: function () { return window.DATA.clean; } },
        { id: "fact", label: "Fact", tables: function () { return { "Fact: one row per question": window.DATA.fact }; } },
        { id: "mart", label: "Summary", tables: function () { return { "Summary: programme × month × round type × topic": window.DATA.mart }; } }
    ];
    var state = { layer: "raw", table: null, search: "", filters: {}, page: 0 };
    var el = {};

    function $(id) { return document.getElementById(id); }
    function esc(v) { return String(v == null ? "" : v).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
    function layer() { return LAYERS.filter(function (l) { return l.id === state.layer; })[0]; }
    function current() {
        var tables = layer().tables();
        if (!state.table || !tables[state.table]) state.table = Object.keys(tables)[0];
        return tables[state.table];
    }

    function rowsFor(t) {
        var q = state.search.trim().toLowerCase();
        var idx = {};
        t.columns.forEach(function (c, i) { idx[c] = i; });
        return t.rows.filter(function (r) {
            for (var c in state.filters) {
                if (state.filters[c] && idx[c] != null && String(r[idx[c]]) !== state.filters[c]) return false;
            }
            if (!q) return true;
            for (var i = 0; i < r.length; i++) if (String(r[i]).toLowerCase().indexOf(q) !== -1) return true;
            return false;
        });
    }

    function renderControls() {
        el.layer.innerHTML = LAYERS.map(function (l) {
            return '<button data-l="' + l.id + '" aria-pressed="' + (l.id === state.layer) + '">' + l.label + "</button>";
        }).join("");
        var tables = layer().tables();
        current();
        el.table.innerHTML = Object.keys(tables).map(function (k) {
            return "<option" + (k === state.table ? " selected" : "") + ">" + esc(k) + "</option>";
        }).join("");
        el.search.value = state.search;
        var t = current();
        el.filters.innerHTML = FILTER_COLS.filter(function (c) { return t.columns.indexOf(c) !== -1; }).map(function (c) {
            var i = t.columns.indexOf(c);
            var vals = Array.from(new Set(t.rows.map(function (r) { return String(r[i]); }))).filter(Boolean).sort();
            if (vals.length > 80) return "";
            return '<div class="field">' + esc(c) + '<select data-c="' + esc(c) + '"><option value="">All</option>' +
                vals.map(function (v) { return "<option" + (state.filters[c] === v ? " selected" : "") + ">" + esc(v) + "</option>"; }).join("") +
                "</select></div>";
        }).join("");
    }

    function renderTable() {
        var t = current();
        var rows = rowsFor(t);
        var pages = Math.max(1, Math.ceil(rows.length / PAGE));
        state.page = Math.min(state.page, pages - 1);
        var slice = rows.slice(state.page * PAGE, state.page * PAGE + PAGE);
        var changedIdx = t.columns.indexOf("changed");
        el.count.textContent = "Showing " + (rows.length ? state.page * PAGE + 1 : 0) + "–" + (state.page * PAGE + slice.length) +
            " of " + rows.length.toLocaleString() + " rows" + (rows.length !== t.rows.length ? " (" + t.rows.length.toLocaleString() + " in the table)" : "") +
            (changedIdx !== -1 ? " · yellow cells were changed by cleaning" : "");
        var head = "<tr>" + t.columns.map(function (c) { return '<th class="' + (WIDE[c] ? "wrap" : "") + '">' + esc(c) + "</th>"; }).join("") + "</tr>";
        var body = slice.map(function (r) {
            var changed = changedIdx !== -1 ? String(r[changedIdx]).split(",") : [];
            return "<tr>" + r.map(function (v, i) {
                var col = t.columns[i];
                var cls = (WIDE[col] ? "wrap " : "") + (changed.indexOf(col) !== -1 ? "changed " : "") + (typeof v === "number" ? "num" : "");
                return '<td class="' + cls + '">' + esc(v) + "</td>";
            }).join("") + "</tr>";
        }).join("");
        el.wrap.innerHTML = "<table><thead>" + head + "</thead><tbody>" + (body || '<tr><td colspan="' + t.columns.length + '" class="muted">No rows match.</td></tr>') + "</tbody></table>";
        el.wrap.scrollTop = 0;
        el.pager.innerHTML = '<button class="btn ghost" data-p="prev"' + (state.page === 0 ? " disabled" : "") + ">← Previous</button>" +
            "<span>Page " + (state.page + 1) + " of " + pages + "</span>" +
            '<button class="btn ghost" data-p="next"' + (state.page >= pages - 1 ? " disabled" : "") + ">Next →</button>";
    }

    function render() { renderControls(); renderTable(); }

    function csv() {
        var t = current();
        var rows = rowsFor(t);
        var q = function (v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
        var text = [t.columns.map(q).join(",")].concat(rows.map(function (r) { return r.map(q).join(","); })).join("\n");
        var a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
        a.download = (state.layer + "-" + state.table).replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".csv";
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    }

    function init() {
        el = { layer: $("ex-layer"), table: $("ex-table"), search: $("ex-search"), filters: $("ex-filters"), count: $("ex-count"),
               wrap: $("ex-table-wrap"), pager: $("ex-pager") };
        el.layer.addEventListener("click", function (e) {
            var b = e.target.closest("button[data-l]");
            if (!b) return;
            state.layer = b.dataset.l; state.table = null; state.filters = {}; state.page = 0;
            render();
        });
        el.table.addEventListener("change", function () { state.table = el.table.value; state.filters = {}; state.page = 0; render(); });
        var timer;
        el.search.addEventListener("input", function () {
            clearTimeout(timer);
            timer = setTimeout(function () { state.search = el.search.value; state.page = 0; renderTable(); }, 150);
        });
        el.filters.addEventListener("change", function (e) {
            var s = e.target.closest("select[data-c]");
            if (!s) return;
            state.filters[s.dataset.c] = s.value; state.page = 0; renderTable();
        });
        el.pager.addEventListener("click", function (e) {
            var b = e.target.closest("button[data-p]");
            if (!b) return;
            state.page += b.dataset.p === "next" ? 1 : -1;
            renderTable();
        });
        $("ex-csv").addEventListener("click", csv);
        render();
    }

    /** Open a layer and table with filters set, e.g. from a bubble or a pipeline step. */
    function open(opts) {
        state.layer = opts.layer || "raw";
        state.table = opts.table || null;
        state.filters = opts.filters || {};
        state.search = opts.search || "";
        state.page = 0;
        render();
    }

    function reset() { open({ layer: "raw" }); }

    window.Explorer = { init: init, open: open, reset: reset };
})();
