/* Interview Signals: chapters, the two maps, the walkthrough, decisions and presenter tools. */
(function () {
    "use strict";
    var D = window.DATA, META = D.meta, AS_OF = META.asOf;
    function obj(t) { return t.rows.map(function (r) { var o = {}; t.columns.forEach(function (c, i) { o[c] = r[i]; }); return o; }); }
    var FACT = obj(D.fact);
    var LEARNERS = {};
    obj(D.clean.Learners).forEach(function (l) { LEARNERS[l.learner_id] = l; });
    var PROGS = META.programmes;
    var fmt = d3.format(",");
    function pct(v, d) { return v == null ? "–" : (v * 100).toFixed(d == null ? 0 : d) + "%"; }
    function $(id) { return document.getElementById(id); }
    function esc(v) { return String(v == null ? "" : v).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

    // ================================================================ chapters and navigation
    var sections = Array.prototype.slice.call(document.querySelectorAll("section.chapter"));
    var ORDER = sections.map(function (s) { return s.dataset.id; });
    var channel = "BroadcastChannel" in window ? new BroadcastChannel("interview-signals") : null;

    function route() {
        var h = location.hash.replace(/^#\/?/, "");
        var id = h.split("?")[0] || "1";
        if (ORDER.indexOf(id) === -1) id = "1";
        return { id: id, query: new URLSearchParams(h.split("?")[1] || "") };
    }
    function go(id, query) {
        var q = query ? "?" + query.toString() : "";
        if (location.hash !== "#/" + id + q) location.hash = "#/" + id + q;
        else show();
    }
    function show() {
        var r = route();
        sections.forEach(function (s) { s.classList.toggle("active", s.dataset.id === r.id); });
        document.querySelectorAll("#stepper a").forEach(function (a) {
            if (a.dataset.id === r.id) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
        });
        var s = sections[ORDER.indexOf(r.id)];
        document.title = s.dataset.title + " · Interview Signals";
        if (r.id === "4") applyQueryToMap4(r.query);
        if (r.id === "5") walkStep(walk.step, true);
        if (channel) channel.postMessage({ type: "chapter", id: r.id });
        window.scrollTo(0, 0);
    }
    function step(delta) {
        var i = ORDER.indexOf(route().id) + delta;
        if (i >= 0 && i < ORDER.length) go(ORDER[i]);
    }
    $("stepper").innerHTML = sections.map(function (s, i) {
        var n = String(i + 1);
        return '<a href="#/' + s.dataset.id + '" data-id="' + s.dataset.id + '"><span class="n">' + n + '</span><span class="label">' + esc(s.dataset.title) + "</span></a>";
    }).join("");
    window.addEventListener("hashchange", show);

    // ================================================================ chapter 1: the question
    (function () {
        var tech = FACT.filter(function (r) { return r.topic !== "Other"; });
        var silent = tech.filter(function (r) { return r.outcome === "silent"; }).length / tech.length;
        var tiles = [
            [fmt(FACT.length), "interview questions"],
            [fmt(new Set(FACT.map(function (r) { return r.learner_id; })).size), "learners"],
            [fmt(new Set(FACT.map(function (r) { return r.company; })).size), "companies"],
            [pct(silent), "never got a verdict"]
        ];
        $("kpis").innerHTML = tiles.map(function (t) { return '<div class="card kpi"><b>' + t[0] + "</b><span>" + t[1] + "</span></div>"; }).join("");
    })();

    // ================================================================ chapter 2: the data
    (function () {
        var raw = D.raw;
        var interviewTabs = Object.keys(raw).filter(function (k) { return k.indexOf("Interview Experiences") === 0; });
        var nInterview = interviewTabs.reduce(function (s, k) { return s + raw[k].rows.length; }, 0);
        var SOURCES = [
            { name: "Interview Experiences (one tab per programme)", short: "Interview notes", whoShort: "learners, after interviews", table: interviewTabs[0], rows: nInterview,
              who: "Learners, through a form after each interview", when: "Whenever they remember: days or weeks later",
              grain: "one question in one round",
              keys: "Email, Job ID, Round, Interview Date, Question, Topic (as entered), How it went, Round result",
              problems: ["Messy: rounds written ten ways, five date formats, phone numbers", "Dates in five formats, some in the future",
                         "The topic box says “misc”, “dsa” or nothing", "Form sent twice; blank questions", "Phone numbers and emails in plain sight"],
              peek: ["Round", "Interview Date", "Question", "Topic (as entered)", "Round result"] },
            { name: "Learner Master", short: "Learners", whoShort: "operations", table: "Learner Master", rows: raw["Learner Master"].rows.length,
              who: "Programme operations", when: "Daily export from the learning platform", grain: "one learner",
              keys: "Learner ID, Email, Programme, Batch, Attendance, PSP (practice score)",
              problems: ["Programme spelt “SE”, “Software Engg”, …", "Attendance as “87%”, “0.87” or “87”"],
              peek: ["Learner ID", "Programme", "Batch", "Attendance", "PSP"] },
            { name: "Jobs", short: "Jobs", whoShort: "placements team", table: "Jobs", rows: raw.Jobs.rows.length, who: "The placements team", when: "When a company shares a role",
              grain: "one job opening", keys: "Job ID, Company, Title, Programme, Posted On, City, CTC",
              problems: ["Posting dates in mixed formats"], peek: ["Job ID", "Company", "Title", "Posted On"] },
            { name: "Applications", short: "Applications", whoShort: "the careers portal", table: "Applications", rows: raw.Applications.rows.length, who: "The careers portal", when: "Automatically",
              grain: "one learner applying to one job", keys: "Application ID, Learner ID, Job ID, Applied On, Stage",
              problems: ["Tidy, but says nothing about what was asked"], peek: ["Application ID", "Learner ID", "Job ID", "Stage"] }
        ];
        $("sources").innerHTML = SOURCES.map(function (s) {
            var t = raw[s.table];
            var idx = s.peek.map(function (c) { return t.columns.indexOf(c); });
            var sample = [3, 11, 27].map(function (i) { return t.rows[i]; }).filter(Boolean);
            var peek = "<table><thead><tr>" + s.peek.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
                sample.map(function (r) { return "<tr>" + idx.map(function (i) { return '<td class="' + (t.columns[i] === "Question" ? "wrap" : "") + '">' + esc(r[i]) + "</td>"; }).join("") + "</tr>"; }).join("") +
                "</tbody></table>";
            return '<div class="card source"><h3>' + esc(s.short) + '</h3><div class="kpi"><b>' + fmt(s.rows) + "</b><span>rows · filled by " + esc(s.whoShort) +
                '</span></div><p class="small"><span class="muted">One row =</span> <b>' + esc(s.grain) + '</b></p><p class="small muted">' + esc(s.problems[0]) +
                '</p><details><summary class="small">Peek at rows</summary><div class="table-wrap">' + peek + '</div><a href="#/explorer" data-open-raw="' +
                esc(s.table) + '" class="small">All rows →</a></details></div>';
        }).join("");
        document.querySelectorAll("[data-open-raw]").forEach(function (a) {
            a.addEventListener("click", function (e) { e.preventDefault(); Explorer.open({ layer: "raw", table: a.dataset.openRaw }); go("explorer"); });
        });
        $("capture-rate").textContent = pct(META.captureRate);

        var svg = d3.select("#joins");
        var boxes = { iv: [20, 75, "Interview Experiences", "email · job ID"], lm: [380, 10, "Learner Master", "learner ID · email"],
                      jb: [380, 140, "Jobs", "job ID · company"], ap: [200, 140, "Applications", "learner ID · job ID"] };
        var link = function (a, b, label) {
            var A = boxes[a], B = boxes[b];
            var ax = A[0] + 110, ay = A[1] + 28, bx = B[0] + 110, by = B[1] + 28;
            svg.append("line").attr("x1", ax).attr("y1", ay).attr("x2", bx).attr("y2", by).attr("stroke", "#cfcabe").attr("stroke-width", 2);
            svg.append("text").attr("x", (ax + bx) / 2).attr("y", (ay + by) / 2 - 6).attr("text-anchor", "middle").attr("font-size", 12)
                .attr("fill", "#9a3412").attr("font-weight", 700).text(label);
        };
        link("iv", "lm", "email → learner");
        link("iv", "jb", "job ID");
        link("ap", "lm", "learner ID");
        link("ap", "jb", "job ID");
        Object.keys(boxes).forEach(function (k) {
            var b = boxes[k];
            var g = svg.append("g").attr("transform", "translate(" + b[0] + "," + b[1] + ")");
            g.append("rect").attr("width", 220).attr("height", 56).attr("rx", 10).attr("fill", "#fff").attr("stroke", k === "iv" ? "#c2410c" : "#cfcabe").attr("stroke-width", 2);
            g.append("text").attr("x", 12).attr("y", 23).attr("font-size", 14).attr("font-weight", 700).attr("fill", "#1b2433").text(b[2]);
            g.append("text").attr("x", 12).attr("y", 42).attr("font-size", 12).attr("fill", "#5b6474").text(b[3]);
        });
    })();

    // ================================================================ chapter 3: raw to reliable
    (function () {
        var L = {};
        META.lineage.forEach(function (l) { L[l.step] = l.rows; });
        var lin = META.lineage;
        var rawRows = lin[0].rows, clean = lin[5].rows, factRows = lin[9].rows, martRows = lin[10].rows;
        var stages = [
            { name: "Sheets", count: rawRows, note: "as typed", layer: "raw" },
            { name: "Raw", count: rawRows, note: "exact copy", layer: "raw" },
            { name: "Clean", count: clean, note: "fixed, deduped, no personal data", layer: "clean" },
            { name: "Label", count: META.classifier.rule + META.classifier.ai + META.classifier.owner, note: "a topic per question", layer: "fact" },
            { name: "Fact", count: factRows, note: "one row per question", layer: "fact" },
            { name: "Summary", count: martRows, note: "what charts read", layer: "mart" },
            { name: "Chart", count: null, note: "chapter 4", layer: null }
        ];
        $("pipeline").innerHTML = stages.map(function (s, i) {
            return (i ? '<span class="arrow" aria-hidden="true">→</span>' : "") + '<button class="stage" data-layer="' + (s.layer || "") + '"><b>' + esc(s.name) +
                '</b><span class="count">' + (s.count == null ? "→ map" : fmt(s.count)) + "</span><span>" + esc(s.note) + "</span></button>";
        }).join("");
        $("pipeline").addEventListener("click", function (e) {
            var b = e.target.closest(".stage");
            if (!b) return;
            if (!b.dataset.layer) { go("4"); return; }
            Explorer.open({ layer: b.dataset.layer });
            go("explorer");
        });
        var drops = lin.filter(function (l) { return l.rows < 0; });
        $("lineage-line").textContent = fmt(rawRows) + " rows in → " + drops.map(function (l) {
            return fmt(-l.rows) + " " + { "Exact duplicates removed (form submitted twice)": "duplicates", "Near duplicates removed (same question, stray spaces or capitals)": "near-duplicates",
                "Rows with no question removed": "blank", "Rows we could not match to a learner set aside": "unmatched" }[l.step];
        }).join(", ") + " removed → " + fmt(clean) + " clean rows. Click a step to see its table.";

        // three different kinds of mess: a company spelling, a missing round, a date format
        var BA = [];
        ["company", "round_no", "interview_date"].forEach(function (kind) {
            var hit = META.beforeAfter.filter(function (x) { return x.changed.split(",").indexOf(kind) !== -1 && BA.indexOf(x) === -1; })[0];
            if (hit) BA.push(hit);
        });
        var pairs = [["Company", "company"], ["Round", "round_type"], ["Round No", "round_no"], ["Interview Date", "interview_date"],
                     ["Round result", "outcome"], ["Email", "learner_id"]];
        var changedKey = { company: "company", round_type: "round_type", round_no: "round_no", interview_date: "interview_date" };
        $("before-after").innerHTML = "<table><thead><tr><th></th>" + pairs.map(function (p) { return "<th>" + esc(p[0]) + " → " + esc(p[1]) + "</th>"; }).join("") +
            "</tr></thead><tbody>" + BA.map(function (ex, i) {
                var ch = ex.changed.split(",");
                var before = "<tr><td class='muted'>Before</td>" + pairs.map(function (p) {
                    var v = p[0] === "Round result" ? ex.before["Round result"] + (ex.before["How it went"] ? " · " + ex.before["How it went"] : "") : ex.before[p[0]];
                    if (p[0] === "Email") v = String(v).replace(/^[^@]+/, "•••");
                    return "<td>" + esc(v === "" ? "(blank)" : v) + "</td>";
                }).join("") + "</tr>";
                var after = "<tr><td class='muted'>After</td>" + pairs.map(function (p) {
                    var v = ex.after[p[1]];
                    if (p[1] === "outcome") v = v + (ex.after.reason ? " · " + ex.after.reason : "");
                    var c = (changedKey[p[1]] && ch.indexOf(changedKey[p[1]]) !== -1) || p[1] === "outcome" || p[1] === "learner_id";
                    return '<td class="' + (c ? "changed" : "") + '">' + esc(v) + "</td>";
                }).join("") + "</tr>";
                return before + after + (i < BA.length - 1 ? "<tr><td colspan='7' style='padding:2px;background:#f3f0ea'></td></tr>" : "");
            }).join("") + "</tbody></table>";

        // live classifier: the same rules the pipeline used
        var tax = META.taxonomy;
        $("clf-programme").innerHTML = PROGS.map(function (p) { return "<option>" + esc(p) + "</option>"; }).join("");
        var examples = { "Software Engineering": ["Design a URL shortener that handles 10,000 requests a second.", "Our checkout slows down during festival sales. How would you fix it?",
                                                  "Explain closures in JavaScript.", "Why do you want to join us?"],
                         "Data Science": ["What is a p-value, in plain words?", "Our new feature lifted sales 3% last week. Is that real?", "Explain RAG and why embeddings matter."],
                         "DevOps": ["How does Kubernetes restart a failed pod?", "A server's disk filled up overnight. What do you check first?"],
                         "AI/ML": ["How would you reduce hallucinations in an LLM answer?", "Our image classifier fails on phone photos. Why?"] };
        function classify() {
            var prog = $("clf-programme").value, text = $("clf-input").value;
            var t = text.trim().toLowerCase().replace(/\s+/g, " ");
            if (!t) { $("clf-result").innerHTML = '<span class="muted">The topic appears here.</span>'; return; }
            var allowed = tax.programmes[prog];
            for (var i = 0; i < tax.order.length; i++) {
                var c = tax.order[i];
                if (!allowed[c]) continue;
                var spec = tax.concepts[c];
                var hit = null;
                for (var w = 0; w < spec.words.length && !hit; w++) {
                    var m = t.match(new RegExp(spec.words[w]));
                    if (m) hit = m;
                }
                var blocked = (spec.unless || []).some(function (u) { return new RegExp(u).test(t); });
                if (hit && !blocked) {
                    var at = hit.index, len = hit[0].length;
                    $("clf-result").innerHTML = '<span class="chip rule">Keyword rule</span> <b>' + esc(allowed[c]) + "</b><br><span class='small'>" +
                        esc(text.slice(0, at)) + "<mark>" + esc(text.slice(at, at + len)) + "</mark>" + esc(text.slice(at + len)) + "</span>";
                    return;
                }
            }
            $("clf-result").innerHTML = '<span class="chip ai">No rule matches</span> → the AI decides (about 85% right); an owner corrects its mistakes.';
        }
        function setExamples() {
            $("clf-examples").innerHTML = (examples[$("clf-programme").value] || []).map(function (q) { return "<button>" + esc(q) + "</button>"; }).join("");
        }
        $("clf-input").addEventListener("input", classify);
        $("clf-programme").addEventListener("change", function () { setExamples(); classify(); });
        $("clf-examples").addEventListener("click", function (e) {
            var b = e.target.closest("button");
            if (b) { $("clf-input").value = b.textContent; classify(); }
        });
        setExamples();
        classify();
        var C = META.classifier, total = C.rule + C.ai + C.owner;
        $("clf-stats").textContent = pct(C.rule / total) + " rules · " + pct(C.ai / total) + " AI · " + pct(C.owner / total, 1) + " owner-corrected · " + pct(C.accuracy, 0) + " right overall";
        // passing checks of one kind (one per programme) read as one line; anything else stands alone
        var groups = [];
        META.checks.forEach(function (c) {
            var kind = c.check.indexOf(": ") !== -1 ? c.check.split(": ")[1] : null;
            var g = kind && c.status === "pass" ? groups.filter(function (x) { return x.kind === kind && x.status === "pass"; })[0] : null;
            if (g) { g.items.push(c); return; }
            groups.push({ kind: kind, status: c.status, items: [c] });
        });
        $("checks").innerHTML = groups.map(function (g) {
            var c = g.items[0];
            var title = g.items.length > 1 ? g.kind.charAt(0).toUpperCase() + g.kind.slice(1) + ": every programme" : c.check;
            var value = g.items.length > 1 ? g.items.map(function (x) { return x.value; }).join(" · ") : c.value;
            return '<li title="' + esc(c.rule + ". " + c.why) + '"><span class="chip ' + c.status + '">' + c.status + "</span><div>" + esc(title) +
                '</div><span class="val">' + esc(value) + "</span></li>";
        }).join("");
    })();

    // ================================================================ the maps
    var DEFAULT4 = { programme: "Software Engineering", window: "12m", roundType: "All", company: "", silentAs: "excluded", minKnown: 20 };
    var state4 = Object.assign({}, DEFAULT4);
    var current4 = null;
    var map4 = TopicMap.create($("map4"), { onPick: function (t) { openDrawer(t, state4); } });
    var ROUND_TYPES = ["All", "Technical", "Screening", "Managerial/HR", "Assignment", "Other"];
    var companiesByVolume = d3.rollups(FACT, function (v) { return v.length; }, function (r) { return r.company; })
        .sort(function (a, b) { return b[1] - a[1]; }).map(function (d) { return d[0]; });

    function legendHtml() {
        return ["rising", "new", "falling", "steady"].map(function (k) {
            return '<span><i style="background:var(--' + k + ')"></i>' + { rising: "↑ Asked more", "new": "New", falling: "↓ Asked less", steady: "→ Steady" }[k] + "</span>";
        }).join("") + '<span>Bigger bubble: more questions per round</span><span><i class="ring"></i>Worse than average either way</span>' +
            '<span><i class="hollow"></i>Too few answers to rate</span><span><i class="zone"></i>Focus here</span>';
    }
    $("map4-legend").innerHTML = legendHtml();

    function renderFilters4() {
        $("map4-filters").innerHTML =
            '<div class="tabs" id="f-prog">' + PROGS.map(function (p) { return '<button data-v="' + esc(p) + '" aria-pressed="' + (p === state4.programme) + '">' + esc(p) + "</button>"; }).join("") + "</div>" +
            '<div class="field">Time window<select id="f-window">' + Object.keys(Stats.WINDOWS).map(function (k) {
                return '<option value="' + k + '"' + (k === state4.window ? " selected" : "") + ">" + Stats.WINDOWS[k].label + "</option>";
            }).join("") + "</select></div>" +
            '<div class="field">Round type<select id="f-round">' + ROUND_TYPES.map(function (k) {
                return "<option" + (k === state4.roundType ? " selected" : "") + ">" + k + "</option>";
            }).join("") + "</select></div>" +
            '<div class="field">Company<select id="f-company"><option value="">All companies</option>' + companiesByVolume.map(function (c) {
                return "<option" + (c === state4.company ? " selected" : "") + ">" + esc(c) + "</option>";
            }).join("") + "</select></div>";
    }
    $("map4-filters").addEventListener("click", function (e) {
        var b = e.target.closest("#f-prog button");
        if (b) { state4.programme = b.dataset.v; state4.company = ""; refresh4(); }
    });
    $("map4-filters").addEventListener("change", function (e) {
        if (e.target.id === "f-window") state4.window = e.target.value;
        if (e.target.id === "f-round") state4.roundType = e.target.value;
        if (e.target.id === "f-company") state4.company = e.target.value;
        refresh4();
    });

    var ghost = (function () {
        var by = d3.rollups(FACT.filter(function (r) { return r.topic !== "Other"; }), function (v) {
            return { n: v.length, silent: v.filter(function (r) { return r.outcome === "silent"; }).length / v.length, programme: d3.greatest(d3.rollups(v, function (x) { return x.length; }, function (r) { return r.programme; }), function (d) { return d[1]; })[0] };
        }, function (r) { return r.company; });
        return by.filter(function (d) { return d[1].n >= 40; }).sort(function (a, b) { return b[1].silent - a[1].silent; });
    })();
    var SCENES = [
        { label: "Focus zone · Software Engineering", s: { programme: "Software Engineering" } },
        { label: "LLM appears · AI/ML", s: { programme: "AI/ML" } },
        { label: "A company that goes silent", s: { programme: ghost[0][1].programme, company: ghost[0][0] } },
        { label: "Thin data · DevOps, 60 days", s: { programme: "DevOps", window: "60d" } }
    ];
    $("map4-scenes").innerHTML += SCENES.map(function (sc, i) { return '<button data-i="' + i + '">' + esc(sc.label) + "</button>"; }).join("");
    $("map4-scenes").addEventListener("click", function (e) {
        var b = e.target.closest("button[data-i]");
        if (!b) return;
        state4 = Object.assign({}, DEFAULT4, SCENES[+b.dataset.i].s);
        refresh4();
    });
    $("map4-table").addEventListener("change", function (e) { map4.showTable(e.target.checked); });

    function refresh4(instant) {
        renderFilters4();
        var opts = Object.assign({ asOf: AS_OF }, state4);
        current4 = map4.update(FACT, opts, { instant: instant });
        var m = current4;
        var focus = m.topics.filter(function (t) { return t.focus; }).sort(function (a, b) { return b.issues - a.issues; });
        $("map4-focus").innerHTML = focus.length ? focus.slice(0, 4).map(function (t) {
            return "<li><b>" + esc(t.topic) + "</b> · " + pct(t.cleared) + " cleared" + (t.priority ? " <span style='color:var(--red)' title='Worse than average either way'>●</span>" : "") + "</li>";
        }).join("") : "<li class='muted'>Nothing in the corner for this slice.</li>";
        $("map4-meta").textContent = fmt(m.totals.asked) + " questions · " + m.range.label.toLowerCase() + " · average " + pct(m.average) + " cleared";
        var busy = m.topics.filter(function (t) { return t.solid && t.asked >= m.medianAsked && t.cleared >= m.average; }).sort(function (a, b) { return b.asked - a.asked; });
        $("map4-busy").innerHTML = busy.length ? "<b>" + esc(busy[0].topic) + "</b>: asked " + fmt(busy[0].asked) + "×, " + pct(busy[0].cleared) + " cleared." : "None in this slice.";
        if (route().id === "4") {
            var q = new URLSearchParams();
            Object.keys(state4).forEach(function (k) { if (state4[k] !== DEFAULT4[k]) q.set(k, state4[k]); });
            var h = "#/4" + (q.toString() ? "?" + q.toString() : "");
            if (location.hash !== h) history.replaceState(null, "", h);
        }
    }
    function applyQueryToMap4(q) {
        var next = Object.assign({}, DEFAULT4);
        q.forEach(function (v, k) { if (k in next) next[k] = k === "minKnown" ? +v : v; });
        if (JSON.stringify(next) !== JSON.stringify(state4) || !current4) { state4 = next; refresh4(!current4); }
    }

    // drawer: the questions behind a bubble
    var drawerCtx = null;
    function openDrawer(topic, st) {
        var rows = Stats.filterRows(FACT, st, AS_OF, true).filter(function (r) { return r.topic === topic; })
            .sort(function (a, b) { return a.interview_date < b.interview_date ? 1 : -1; });
        var t = (st === state4 ? current4 : walk.map.last()).topics.filter(function (x) { return x.topic === topic; })[0];
        drawerCtx = { programme: st.programme, topic: topic };
        $("drawer-eyebrow").textContent = st.programme;
        $("drawer-title").textContent = topic;
        $("drawer-meta").textContent = t ? fmt(t.asked) + " questions · " + pct(t.cleared) + " cleared · " + t.depth.toFixed(1) + " per round · " +
            (t.solid ? TopicMap.TREND_NAME[t.trend] : "too few answers to rate") : "";
        var label = { ok: ["pass", "answered well"], issue: ["fail", "struggled"], silent: ["info", "company silent"], excluded: ["rule", "withdrew / untagged"] };
        $("drawer-body").innerHTML = rows.slice(0, 80).map(function (r) {
            var l = label[r.outcome];
            return '<div class="q"><p>' + esc(r.question) + '</p><div class="meta">' + esc(r.company) + " · " + esc(r.round_type) + " round " + r.round_no + " · " +
                esc(r.interview_date) + ' · <span class="chip ' + l[0] + '">' + l[1] + (r.reason ? " · " + r.reason : "") + "</span></div></div>";
        }).join("") + (rows.length > 80 ? '<p class="small muted">Showing 80 of ' + rows.length + ". The explorer has them all.</p>" : "");
        $("drawer").classList.add("open");
    }
    function closeDrawer() { $("drawer").classList.remove("open"); }
    $("drawer-close").addEventListener("click", closeDrawer);
    $("drawer-explore").addEventListener("click", function () {
        if (!drawerCtx) return;
        Explorer.open({ layer: "fact", filters: { programme: drawerCtx.programme, topic: drawerCtx.topic } });
        closeDrawer();
        go("explorer");
    });

    // ================================================================ chapter 5: walkthrough and caveats
    var DEFAULT5 = { programme: "Software Engineering", window: "12m", roundType: "All", company: "", silentAs: "excluded", minKnown: 20 };
    var walk = { step: 0, state: Object.assign({}, DEFAULT5) };
    walk.map = TopicMap.create($("map5"), { onPick: function (t) { openDrawer(t, walk.state); } });
    var STEPS = [
        { title: "Four things in one picture", programme: "Software Engineering", view: function () { return { axes: true }; },
          text: "Across: how often asked. Up: how often cleared. Size: questions per round. Colour: asked more or less than six months ago." },
        { title: "The corner that matters", programme: "Software Engineering", view: function (m) { return { zone: true, spotlight: m.topics.filter(function (t) { return t.focus; }).map(function (t) { return t.topic; }) }; },
          text: "Asked often AND cleared less than average. These cost the most offers." },
        { title: "Red ring: worse either way", programme: "Software Engineering", view: function (m) { return { spotlight: m.topics.filter(function (t) { return t.priority; }).map(function (t) { return t.topic; }) }; },
          text: "Worse than average even if every silent company had said yes, and even if all had said no." },
        { title: "Hollow: too little data", programme: "Software Engineering", view: function (m) { return { spotlight: m.topics.filter(function (t) { return t.plotted && !t.solid; }).map(function (t) { return t.topic; }) }; },
          text: "Too few answers to rate. A reason to collect more data, not to act." },
        { title: "Something new: LLM", programme: "AI/ML", view: function () { return { spotlight: ["LLM"] }; },
          text: "Barely asked six months ago, common now. Fine today; plan for it before it reaches the corner." }
    ];
    function walkStep(i, keepState) {
        walk.step = Math.max(0, Math.min(STEPS.length - 1, i));
        var s = STEPS[walk.step];
        if (!keepState || walk.state.programme !== s.programme) walk.state.programme = s.programme;
        var opts = Object.assign({ asOf: AS_OF }, walk.state);
        var m = Stats.topicMap(FACT, opts);
        walk.map.update(FACT, opts, s.view(m));
        $("walk").innerHTML = '<div class="step-n">Step ' + (walk.step + 1) + " of " + STEPS.length + "</div><h3>" + esc(s.title) + "</h3><p>" + esc(s.text) +
            '</p><div class="nav"><button class="btn ghost" id="walk-prev"' + (walk.step === 0 ? " disabled" : "") + '>← Back</button><button class="btn" id="walk-next"' +
            (walk.step === STEPS.length - 1 ? " disabled" : "") + ">Next →</button></div>" + '<div class="legend">' + legendHtml() + "</div>";
        $("walk-prev").onclick = function () { walkStep(walk.step - 1); };
        $("walk-next").onclick = function () { walkStep(walk.step + 1); };
        silentNote();
    }
    function silentNote() {
        var base = Stats.topicMap(FACT, Object.assign({ asOf: AS_OF }, walk.state, { silentAs: "excluded" }));
        var now = Stats.topicMap(FACT, Object.assign({ asOf: AS_OF }, walk.state));
        var red = function (m) { return m.topics.filter(function (t) { return t.priority; }).length; };
        $("silent-note").textContent = fmt(base.totals.silent) + " questions with no verdict · average " + pct(now.average) + " cleared · " + red(now) + " red rings";
    }
    $("silent-as").addEventListener("click", function (e) {
        var b = e.target.closest("button[data-v]");
        if (!b) return;
        walk.state.silentAs = b.dataset.v;
        $("silent-as").querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        walkStep(walk.step, true);
    });
    $("min-known").addEventListener("input", function (e) {
        walk.state.minKnown = +e.target.value;
        $("min-known-v").textContent = e.target.value;
        walkStep(walk.step, true);
    });
    (function () {
        var bands = [["Practice score under 50", 0, 50], ["50–65", 50, 65], ["65–80", 65, 80], ["80 and above", 80, 101]];
        var rows = bands.map(function (b) {
            var r = FACT.filter(function (q) {
                var l = LEARNERS[q.learner_id];
                return l && l.psp >= b[1] && l.psp < b[2] && (q.outcome === "ok" || q.outcome === "issue") && q.topic !== "Other";
            });
            return { label: b[0], v: r.length ? r.filter(function (q) { return q.outcome === "ok"; }).length / r.length : null, n: r.length };
        });
        var lo = d3.min(rows, function (r) { return r.v; }) - 0.05;
        $("psp-bars").innerHTML = rows.map(function (r) {
            return '<div class="bar-row"><span>' + esc(r.label) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + ((r.v - lo) / (1 - lo) * 100).toFixed(1) +
                '%"></div></div><span class="v">' + pct(r.v) + "</span></div>";
        }).join("") + '<p class="tiny muted">% cleared · bars start at ' + pct(lo) + "</p>";
        $("capture-note").textContent = "Only " + pct(META.captureRate) + " of interviews are written up.";
    })();

    // ================================================================ chapter 6: decisions
    (function () {
        var focusByProg = PROGS.map(function (p) {
            var m = Stats.topicMap(FACT, { programme: p, window: "12m", asOf: AS_OF });
            var f = m.topics.filter(function (t) { return t.focus && t.priority; }).sort(function (a, b) { return b.issues - a.issues; })[0];
            return { p: p, t: f, avg: m.average };
        }).filter(function (d) { return d.t; });
        var rising = [];
        PROGS.forEach(function (p) {
            Stats.topicMap(FACT, { programme: p, window: "12m", asOf: AS_OF }).topics.forEach(function (t) {
                if (t.trend === "new" || t.trend === "rising") rising.push({ p: p, t: t });
            });
        });
        var llm = rising.filter(function (r) { return r.t.topic === "LLM"; });
        var ghosts = ghost.slice(0, 5);
        var cards = [
            { eyebrow: "Curriculum", title: "Fix the corner topics",
              signal: focusByProg.map(function (d) { return "<b>" + esc(d.t.topic) + "</b> " + pct(d.t.cleared) + " vs " + pct(d.avg); }).join("<br>"),
              owner: "Module owners", action: "Rework the module; one mock interview on it per learner",
              measure: "Topic clear rate vs a matched cohort" },
            { eyebrow: "Partnerships", title: "Chase silent companies",
              signal: "Share of questions with no verdict:",
              bars: '<div class="bars">' + ghosts.map(function (g) {
                  return '<div class="bar-row"><span>' + esc(g[0]) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + (g[1].silent * 100).toFixed(0) +
                      '%"></div></div><span class="v">' + pct(g[1].silent) + "</span></div>";
              }).join("") + "</div>",
              owner: "Partnerships", action: "Feedback deadline, or fewer learners sent",
              measure: "Silent share next quarter" },
            { eyebrow: "Content", title: "Get ahead of LLM",
              signal: llm.map(function (r) { return "<b>" + esc(r.p) + "</b>: " + r.t.prior + " → " + r.t.recent + " questions"; }).join("<br>") + '<br><span class="tiny muted">six months before → last six months</span>',
              owner: "Content team", action: "Add an applied LLM unit now",
              measure: "LLM share and clear rate" }
        ];
        $("decisions").innerHTML = cards.map(function (c) {
            return '<div class="card decision"><div class="eyebrow">' + c.eyebrow + "</div><h3>" + esc(c.title) + '</h3><div class="small">' + c.signal + "</div>" +
                (c.bars || "") + '<div class="flow"><span class="k">Owner</span><div>' + esc(c.owner) + '</div><span class="k">Action</span><div>' +
                esc(c.action) + '</div><span class="k">Measure</span><div>' + esc(c.measure) + "</div></div></div>";
        }).join("");
    })();

    // ================================================================ summary
    (function () {
        var lin = META.lineage;
        var warns = META.checks.filter(function (c) { return c.status === "warn"; }).length;
        var focus = PROGS.map(function (p) {
            var m = Stats.topicMap(FACT, { programme: p, window: "12m", asOf: AS_OF });
            var f = m.topics.filter(function (t) { return t.focus && t.priority; }).sort(function (a, b) { return b.issues - a.issues; })[0];
            return f ? { p: p, t: f, avg: m.average } : null;
        }).filter(Boolean);
        var steps = [
            ["1", "Question", "Which three topics do we fix this quarter?", "#/1"],
            ["2", "Data", fmt(lin[0].rows) + " messy rows from four sheets", "#/2"],
            ["3", "Clean & store", fmt(lin[5].rows) + " clean rows · " + pct(META.classifier.accuracy) + " labelled right · " + warns + " warning", "#/3"],
            ["4", "Show", "One map: the corner is the action list", "#/4"],
            ["5", "Read", "Silent companies, small samples, correlation", "#/5"],
            ["6", "Decide", "Three owners, three actions, three measures", "#/6"]
        ];
        $("summary-flow").innerHTML = steps.map(function (st, i) {
            return (i ? '<span class="arrow" aria-hidden="true">→</span>' : "") + '<a class="stage" href="' + st[3] + '"><span class="n">' + st[0] + "</span><b>" + esc(st[1]) +
                "</b><span>" + esc(st[2]) + "</span></a>";
        }).join("");
        $("summary-answer").innerHTML = focus.map(function (d) {
            return "<li><b>" + esc(d.t.topic) + "</b> · " + esc(d.p) + ": " + pct(d.t.cleared) + " cleared vs " + pct(d.avg) + "</li>";
        }).join("") + "<li><b>Chase silent companies</b> · partnerships</li><li><b>Add LLM early</b> · content team</li>";
    })();

    // ================================================================ method
    (function () {
        var rules = [
            ["Cleared", "Of the questions where we know how it went, the share the learner answered well. Questions where the company went silent, or the learner withdrew, are left out."],
            ["Questions asked", "Every question logged for the topic in the window, whatever happened."],
            ["Per round", "Questions asked ÷ rounds the topic came up in. More per round means interviewers dig deeper."],
            ["Trend", "The topic’s share of questions in the last six months against the six before, tested so chance wobbles don’t count (a two-proportion test at 95%). “New”: under 5 questions before, 20+ now."],
            ["Focus here", "Asked more often than the median topic, and cleared less often than the programme as a whole."],
            ["Red ring", "Worse than the programme at both ends of the range the silent questions allow: if they had all gone well, and if they had all gone badly. Needs 20 answered questions."],
            ["Hollow bubble", "Fewer than 20 answered questions: drawn, but not rated. Fewer than 5: left off the map."],
            ["Classification", "Keyword rules first (cheap, explainable); questions no rule recognises go to an AI classifier; a module owner’s corrections override both."],
            ["Checks", "Run on every load. A failure stops the load and keeps yesterday’s numbers; a warning lets it through and tells someone."]
        ];
        $("method").innerHTML = rules.map(function (r) { return '<div class="card"><h3>' + esc(r[0]) + '</h3><p class="small">' + esc(r[1]) + "</p></div>"; }).join("");
        $("synthetic-note").textContent = "All data on this site is invented by a seeded generator (seed " + META.seed + ", as of " + AS_OF + "). Learners, companies and numbers are fictional; any resemblance to a real company or person is a coincidence. The pipeline and rules mirror how a real careers team’s analytics works.";
    })();

    // ================================================================ tools, keyboard, presenter
    var fontSize = 20;
    function setFont(v) { fontSize = Math.max(16, Math.min(26, v)); document.documentElement.style.setProperty("--base", fontSize + "px"); }
    function toggleNotes(force) {
        var on = force != null ? force : !document.body.classList.contains("show-notes");
        document.body.classList.toggle("show-notes", on);
        $("t-notes").setAttribute("aria-pressed", String(on));
    }
    function resetAll() {
        state4 = Object.assign({}, DEFAULT4);
        walk.state = Object.assign({}, DEFAULT5);
        $("silent-as").querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x.dataset.v === "excluded")); });
        $("min-known").value = 20; $("min-known-v").textContent = "20";
        $("map4-table").checked = false; map4.showTable(false);
        $("guess").value = "";
        closeDrawer();
        Explorer.reset();
        refresh4();
        walkStep(0);
        if (route().id === "4") history.replaceState(null, "", "#/4");
    }
    $("t-notes").addEventListener("click", function () { toggleNotes(); });
    $("t-reset").addEventListener("click", resetAll);
    $("t-smaller").addEventListener("click", function () { setFont(fontSize - 2); });
    $("t-bigger").addEventListener("click", function () { setFont(fontSize + 2); });
    $("t-help").addEventListener("click", function () { $("help").classList.add("open"); });
    $("help-close").addEventListener("click", function () { $("help").classList.remove("open"); });

    document.addEventListener("keydown", function (e) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        var tag = (e.target.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") { if (e.key === "Escape") e.target.blur(); return; }
        var k = e.key;
        if (k === "ArrowRight" || k === "PageDown") { step(1); e.preventDefault(); }
        else if (k === "ArrowLeft" || k === "PageUp") { step(-1); e.preventDefault(); }
        else if (/^[1-9]$/.test(k) && ORDER[+k - 1]) go(ORDER[+k - 1]);
        else if (k === "n" || k === "N") toggleNotes();
        else if (k === "r" || k === "R") resetAll();
        else if (k === "f" || k === "F") { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(function () {}); else document.exitFullscreen(); }
        else if (k === "?") $("help").classList.add("open");
        else if (k === "Escape") { $("help").classList.remove("open"); closeDrawer(); }
    });

    if (new URLSearchParams(location.search).has("presenter")) {
        document.body.classList.add("presenter");
        var started = Date.now();
        var showNotes = function (id) {
            var i = ORDER.indexOf(id), s = sections[i];
            $("p-now").textContent = s.dataset.title;
            var aside = s.querySelector("aside.notes");
            $("p-notes").innerHTML = aside ? aside.innerHTML : "";
            $("p-next").textContent = i + 1 < ORDER.length ? "Next: " + sections[i + 1].dataset.title : "Last chapter";
        };
        showNotes(route().id);
        if (channel) channel.onmessage = function (ev) { if (ev.data && ev.data.type === "chapter") showNotes(ev.data.id); };
        setInterval(function () {
            var s = Math.floor((Date.now() - started) / 1000);
            $("p-timer").textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
        }, 1000);
    }

    Explorer.init();
    if (!route().query.toString()) refresh4(true);
    walkStep(0);
    show();
})();
