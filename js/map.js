/* The topic map: draws Stats.topicMap's output with D3. One instance per container.
 *   const m = TopicMap.create(el, { onPick: topic => ..., height: 600 });
 *   m.update(rows, opts, { spotlight: ["LLM"], zone: true });
 */
(function () {
    "use strict";
    var W = 880, H = 560, M = { top: 18, right: 150, bottom: 56, left: 62 };
    var ARROW = { rising: "↑ ", falling: "↓ ", steady: "→ ", "new": "new · ", thin: "" };
    var TREND_NAME = { rising: "asked more than six months before", falling: "asked less than six months before",
        steady: "asked about as often as six months before", "new": "new: barely asked six months before", thin: "too few questions for a trend" };

    function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
    function colourOf(trend) { return cssVar("--" + (trend === "thin" ? "steady" : trend)); }
    function shortName(t) { return t.replace(/^(DSA) · /, ""); }
    function pct(v, d) { return v == null ? "–" : (v * 100).toFixed(d == null ? 0 : d) + "%"; }

    function create(container, options) {
        options = options || {};
        var root = d3.select(container);
        var box = root.append("div").attr("class", "chart-box");
        var svg = box.append("svg").attr("viewBox", "0 0 " + W + " " + H).attr("role", "img");
        var tip = box.append("div").attr("class", "tooltip");
        var gZone = svg.append("g"), gGrid = svg.append("g"), gAxes = svg.append("g"), gRefs = svg.append("g"),
            gBubbles = svg.append("g"), gLabels = svg.append("g");
        var empty = box.append("div").attr("class", "empty").style("display", "none");
        var table = root.append("div").attr("class", "table-wrap").style("display", "none").style("margin-top", "0.6rem");
        var x = d3.scaleLinear(), y = d3.scaleLinear();
        var last = null;

        function update(rows, opts, view) {
            view = view || {};
            var m = Stats.topicMap(rows, opts);
            last = m;
            var plotted = m.plotted;
            var solid = m.solid;
            svg.attr("aria-label", (opts.programme || "All") + ": topics by questions asked against share cleared");
            if (solid.length < 3) {
                svg.style("display", "none");
                empty.style("display", null).text("Too few topics with " + Stats.MIN_KNOWN + "+ answered questions in this slice to draw a fair map. Widen the window or clear a filter.");
                renderTable(m);
                return m;
            }
            svg.style("display", null);
            empty.style("display", "none");

            var xMax = Stats.niceMax(d3.max(plotted, function (t) { return t.asked; }));
            var yMin = Stats.yFloor(d3.min(plotted, function (t) { return t.cleared; }));
            x.domain([0, xMax]).range([M.left, W - M.right]);
            y.domain([yMin, 1]).range([H - M.bottom, M.top]);
            var t = svg.transition().duration(view.instant ? 0 : 650);

            // focus zone
            var hasZone = m.average != null && m.average > yMin && m.medianAsked != null;
            var zone = gZone.selectAll("rect").data(hasZone ? [1] : []);
            zone.exit().remove();
            zone.enter().append("rect").attr("fill", cssVar("--accent-soft"))
                .merge(zone).classed("spot", !!view.zone)
                .transition(t)
                .attr("x", x(m.medianAsked)).attr("y", y(m.average))
                .attr("width", Math.max(0, x(xMax) - x(m.medianAsked))).attr("height", Math.max(0, y(yMin) - y(m.average)))
                .attr("stroke", view.zone ? cssVar("--accent") : "none").attr("stroke-width", 2);
            var zl = gZone.selectAll("text").data(hasZone ? [1] : []);
            zl.exit().remove();
            zl.enter().append("text").attr("class", "zone-label").attr("text-anchor", "end").text("Focus here")
                .merge(zl).transition(t).attr("x", x(xMax) - 10).attr("y", y(yMin) - 12);

            // grid and axes
            var yTicks = d3.range(Math.round(yMin * 10), 11).map(function (v) { return v / 10; });
            var grid = gGrid.selectAll("line").data(yTicks, function (d) { return d; });
            grid.exit().remove();
            grid.enter().append("line").attr("class", "gridline").merge(grid).transition(t)
                .attr("x1", M.left).attr("x2", W - M.right).attr("y1", function (d) { return y(d); }).attr("y2", function (d) { return y(d); });
            gAxes.selectAll("*").remove();
            gAxes.append("g").attr("class", "axis").attr("transform", "translate(0," + (H - M.bottom) + ")")
                .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format(",")).tickSizeOuter(0));
            gAxes.append("g").attr("class", "axis").attr("transform", "translate(" + M.left + ",0)")
                .call(d3.axisLeft(y).tickValues(yTicks).tickFormat(function (v) { return Math.round(v * 100) + "%"; }).tickSizeOuter(0));
            gAxes.append("text").attr("class", "ref-label").attr("x", M.left + (W - M.right - M.left) / 2).attr("y", H - 14)
                .attr("text-anchor", "middle").text("Questions asked →");
            gAxes.append("text").attr("class", "ref-label").attr("transform", "translate(18," + (M.top + (H - M.bottom - M.top) / 2) + ") rotate(-90)")
                .attr("text-anchor", "middle").text("Cleared (higher is better) →");
            gAxes.classed("spot", !!view.axes).attr("opacity", 1);

            // reference lines
            gRefs.selectAll("*").remove();
            if (m.average != null) {
                gRefs.append("line").attr("x1", M.left).attr("x2", W - M.right).attr("y1", y(m.average)).attr("y2", y(m.average))
                    .attr("stroke", cssVar("--ink-2")).attr("stroke-dasharray", "6 5").attr("stroke-width", 1.5);
                gRefs.append("text").attr("class", "ref-label").attr("x", W - M.right + 8).attr("y", y(m.average) + 4)
                    .text("Programme avg " + pct(m.average));
            }
            if (m.medianAsked != null) {
                gRefs.append("line").attr("x1", x(m.medianAsked)).attr("x2", x(m.medianAsked)).attr("y1", M.top).attr("y2", H - M.bottom)
                    .attr("stroke", cssVar("--muted")).attr("stroke-dasharray", "2 5").attr("stroke-width", 1.5);
                gRefs.append("text").attr("class", "ref-label").attr("x", x(m.medianAsked) + 6).attr("y", M.top + 14)
                    .text("median topic");
            }

            // bubbles, biggest first so small ones stay clickable
            var radius = function (d) { return Stats.radiusOf(d.depth, m.depthRange); };
            var data = plotted.slice().sort(function (a, b) { return radius(b) - radius(a); });
            var spot = view.spotlight ? new Set(view.spotlight) : null;
            svg.classed("dim", !!spot);
            var bubbles = gBubbles.selectAll("circle").data(data, function (d) { return d.topic; });
            bubbles.exit().transition(t).attr("r", 0).remove();
            var entered = bubbles.enter().append("circle").attr("class", "bubble")
                .attr("cx", function (d) { return x(d.asked); }).attr("cy", function (d) { return y(d.cleared); }).attr("r", 0)
                .on("mousemove", function (ev, d) { showTip(ev, d); })
                .on("mouseleave", function () { tip.style("opacity", 0); })
                .on("click", function (ev, d) { if (options.onPick) options.onPick(d.topic); });
            entered.merge(bubbles).order()
                .classed("spot", function (d) { return !!(spot && spot.has(d.topic)); })
                .transition(t)
                .attr("cx", function (d) { return x(d.asked); }).attr("cy", function (d) { return y(d.cleared); }).attr("r", radius)
                .attr("fill", function (d) { return d.solid ? colourOf(d.trend) : "transparent"; })
                .attr("fill-opacity", 0.72)
                .attr("stroke", function (d) { return d.priority ? cssVar("--red") : d.solid ? colourOf(d.trend) : cssVar("--steady"); })
                .attr("stroke-width", function (d) { return d.priority ? 3 : d.solid ? 1 : 1.8; })
                .attr("stroke-dasharray", function (d) { return d.solid ? null : "3 3"; });

            // labels: every red topic and the eight with the most struggled questions, placed where they fit
            gLabels.selectAll("*").remove();
            var obstacles = data.map(function (d) {
                var r = radius(d), cx = x(d.asked), cy = y(d.cleared);
                return { x0: cx - r, x1: cx + r, y0: cy - r, y1: cy + r, topic: d.topic };
            });
            var placed = [];
            var toLabel = data.filter(function (d) { return m.labelled[d.topic] || (spot && spot.has(d.topic)); })
                .sort(function (a, b) { return b.issues - a.issues; });
            toLabel.forEach(function (d) {
                var text = gLabels.append("text").attr("class", "bubble-label")
                    .classed("spot", !!(spot && spot.has(d.topic))).text((ARROW[d.trend] || "") + shortName(d.topic));
                var w = text.node().getComputedTextLength(), h = 15, r = radius(d) + 5;
                var cx = x(d.asked), cy = y(d.cleared);
                var sides = cx > x(xMax) * 0.7 ? ["left", "right", "above", "below"] : ["right", "left", "above", "below"];
                var best = null;
                for (var i = 0; i < sides.length && !best; i++) {
                    var b = boxFor(sides[i], cx, cy, r, w, h);
                    if (b.x0 < M.left || b.x1 > W - 4 || b.y0 < 2 || b.y1 > H - M.bottom) continue;
                    var clash = placed.concat(obstacles.filter(function (o) { return o.topic !== d.topic; })).some(function (o) {
                        return !(b.x1 < o.x0 || b.x0 > o.x1 || b.y1 < o.y0 || b.y0 > o.y1);
                    });
                    if (!clash) best = b;
                }
                if (!best) {
                    // nowhere free: take the side that clashes only with bubbles, never with another label
                    for (var k = 0; k < sides.length && !best; k++) {
                        var c = boxFor(sides[k], cx, cy, r, w, h);
                        if (c.x0 < M.left || c.x1 > W - 4) continue;
                        if (!placed.some(function (o) { return !(c.x1 < o.x0 || c.x0 > o.x1 || c.y1 < o.y0 || c.y0 > o.y1); })) best = c;
                    }
                }
                best = best || boxFor(sides[0], cx, cy, r, w, h);
                placed.push(best);
                text.attr("x", best.tx).attr("y", best.ty).attr("text-anchor", best.anchor).attr("opacity", 0)
                    .transition().delay(view.instant ? 0 : 450).duration(250).attr("opacity", 1);
            });

            renderTable(m);
            return m;
        }

        function boxFor(side, cx, cy, r, w, h) {
            if (side === "right") return { x0: cx + r, x1: cx + r + w, y0: cy - h / 2 - 2, y1: cy + h / 2, tx: cx + r, ty: cy + 5, anchor: "start" };
            if (side === "left") return { x0: cx - r - w, x1: cx - r, y0: cy - h / 2 - 2, y1: cy + h / 2, tx: cx - r, ty: cy + 5, anchor: "end" };
            if (side === "above") return { x0: cx - w / 2, x1: cx + w / 2, y0: cy - r - h, y1: cy - r, tx: cx, ty: cy - r - 3, anchor: "middle" };
            return { x0: cx - w / 2, x1: cx + w / 2, y0: cy + r, y1: cy + r + h, tx: cx, ty: cy + r + 12, anchor: "middle" };
        }

        function showTip(ev, d) {
            var rect = box.node().getBoundingClientRect();
            tip.html("<b>" + d.topic + "</b><br>" + d3.format(",")(d.asked) + " questions (" + pct(d.share, 1) + " of all) · " +
                pct(d.cleared) + " cleared<br>" + d.depth.toFixed(1) + " questions per round · " + d.known + " with an answer, " +
                d.silent + " company silent<br>" + (d.solid ? TREND_NAME[d.trend] : "only " + d.known + " answered: too few to rate") +
                (d.priority ? "<br><b>Worse than the programme whichever way the silences went</b>" : ""))
                .style("left", Math.min(ev.clientX - rect.left + 14, rect.width - 260) + "px")
                .style("top", (ev.clientY - rect.top + 14) + "px").style("opacity", 1);
        }

        function renderTable(m) {
            var rows = m.topics.map(function (t) {
                return "<tr><td>" + t.topic + "</td><td class='num'>" + t.asked + "</td><td class='num'>" + pct(t.cleared) +
                    "</td><td class='num'>" + t.depth.toFixed(1) + "</td><td>" + (t.solid ? t.trend : "too few") + "</td><td>" +
                    (t.focus ? "Focus here" : "") + (t.priority ? (t.focus ? " · " : "") + "worse than average" : "") + "</td></tr>";
            }).join("");
            table.html("<table><thead><tr><th>Topic</th><th class='num'>Asked</th><th class='num'>Cleared</th><th class='num'>Per round</th><th>Trend</th><th>Flags</th></tr></thead><tbody>" + rows + "</tbody></table>");
        }

        return {
            update: update,
            last: function () { return last; },
            showTable: function (on) { table.style("display", on ? null : "none"); }
        };
    }

    window.TopicMap = { create: create, shortName: shortName, TREND_NAME: TREND_NAME, ARROW: ARROW };
})();
