/* The map's arithmetic, with no drawing in it, so the page and the tests use the same code.
 * Rules (the same ones the real dashboard uses):
 *   cleared      = 1 - issues / known, where known = questions with an outcome (answered well, or struggled)
 *   depth        = questions asked / rounds the topic came up in
 *   trend        = share of questions in the last six months against the six before, two-proportion z-test, |z| >= 1.96
 *   red ring     = worse than the programme whichever way the silent companies' questions went, with 20+ answered
 *   focus zone   = asked more than the median topic AND cleared less than the programme as a whole
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.Stats = factory();
})(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    var DAY = 86400000;
    var MIN_KNOWN = 20;      // answered questions needed before a topic gets a rate of its own
    var MIN_PLOTTED = 5;     // fewer than this and the topic is left off the map
    var TREND_Z = 1.96;
    var RADIUS = { min: 5, max: 22 };

    function isoToDay(iso) { return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY; }
    function dayToIso(day) { return new Date(day * DAY).toISOString().slice(0, 10); }

    var WINDOWS = {
        "12m": { label: "Last 12 months", from: function (end) { return end - 364; } },
        "ytd": { label: "Year to date", from: function (end) { return isoToDay(dayToIso(end).slice(0, 4) + "-01-01"); } },
        "6m": { label: "Last 6 months", from: function (end) { return end - 181; } },
        "90d": { label: "Last 90 days", from: function (end) { return end - 89; } },
        "60d": { label: "Last 60 days", from: function (end) { return end - 59; } }
    };

    function windowRange(key, asOf) {
        var end = isoToDay(asOf);
        var w = WINDOWS[key] || WINDOWS["12m"];
        return { from: dayToIso(w.from(end)), to: asOf, label: w.label };
    }

    /** Rows of the fact table that a filter keeps. `window` false skips the date cut (the trend uses its own two half-years). */
    function filterRows(rows, f, asOf, useWindow) {
        var range = windowRange(f.window, asOf);
        return rows.filter(function (r) {
            if (f.programme && r.programme !== f.programme) return false;
            if (f.roundType && f.roundType !== "All" && r.round_type !== f.roundType) return false;
            if (f.company && r.company !== f.company) return false;
            if (useWindow !== false && (r.interview_date < range.from || r.interview_date > range.to)) return false;
            return true;
        });
    }

    /** "What if every silent company's question had gone one way?" Teaching control; the default leaves them unknown. */
    function outcomeOf(r, silentAs) {
        if (r.outcome !== "silent" || !silentAs || silentAs === "excluded") return r.outcome;
        return silentAs === "cleared" ? "ok" : "issue";
    }

    function twoProportionZ(x1, n1, x0, n0) {
        if (n1 <= 0 || n0 <= 0) return null;
        var pooled = (x1 + x0) / (n1 + n0);
        var se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n0));
        if (se === 0) return 0;
        return (x1 / n1 - x0 / n0) / se;
    }

    function trendOf(recent, prior, totRecent, totPrior) {
        if (recent + prior < 30 || totRecent === 0 || totPrior === 0) return "thin";
        if (prior < 5 && recent >= 20) return "new";
        var z = twoProportionZ(recent, totRecent, prior, totPrior) || 0;
        return z >= TREND_Z ? "rising" : z <= -TREND_Z ? "falling" : "steady";
    }

    function issueRange(c) {
        var judged = c.known + c.silent;
        return { low: judged > 0 ? c.issues / judged : null, high: judged > 0 ? (c.issues + c.silent) / judged : null };
    }

    function isPriority(topic, slice, minKnown) {
        if (topic.known < (minKnown || MIN_KNOWN)) return false;
        var own = issueRange(topic), base = issueRange(slice);
        if (own.low === null || base.low === null) return false;
        return own.low > base.low && own.high > base.high;
    }

    /**
     * Everything the map draws for one slice. `rows` are fact rows as objects; `opts`:
     *   programme, window, roundType, company, silentAs, minKnown, asOf
     */
    function topicMap(rows, opts) {
        var minKnown = opts.minKnown || MIN_KNOWN;
        var inWindow = filterRows(rows, opts, opts.asOf, true);
        var forTrend = filterRows(rows, opts, opts.asOf, false);
        var end = isoToDay(opts.asOf);
        var recentFrom = dayToIso(end - 181), priorFrom = dayToIso(end - 363);

        var totals = { asked: 0, known: 0, issues: 0, silent: 0 };
        var byTopic = {};
        inWindow.forEach(function (r) {
            var o = outcomeOf(r, opts.silentAs);
            totals.asked++;
            if (o === "ok" || o === "issue") totals.known++;
            if (o === "issue") totals.issues++;
            if (o === "silent") totals.silent++;
            if (r.topic === "Other") return;
            var t = byTopic[r.topic] || (byTopic[r.topic] = { topic: r.topic, asked: 0, known: 0, issues: 0, silent: 0, rounds: {} });
            t.asked++;
            if (o === "ok" || o === "issue") t.known++;
            if (o === "issue") t.issues++;
            if (o === "silent") t.silent++;
            t.rounds[r.round_key] = 1;
        });

        var halves = { recent: 0, prior: 0, byTopic: {} };
        forTrend.forEach(function (r) {
            if (r.interview_date < priorFrom || r.interview_date > opts.asOf) return;
            var side = r.interview_date >= recentFrom ? "recent" : "prior";
            halves[side]++;
            var h = halves.byTopic[r.topic] || (halves.byTopic[r.topic] = { recent: 0, prior: 0 });
            h[side]++;
        });

        var topics = Object.keys(byTopic).map(function (k) {
            var t = byTopic[k];
            var rounds = Object.keys(t.rounds).length;
            var h = halves.byTopic[k] || { recent: 0, prior: 0 };
            return {
                topic: k, asked: t.asked, known: t.known, issues: t.issues, silent: t.silent, rounds: rounds,
                share: totals.asked ? t.asked / totals.asked : 0,
                cleared: t.known ? 1 - t.issues / t.known : null,
                depth: rounds ? t.asked / rounds : 1,
                trend: trendOf(h.recent, h.prior, halves.recent, halves.prior),
                recent: h.recent, prior: h.prior,
                solid: t.known >= minKnown,
                plotted: t.known >= MIN_PLOTTED,
                priority: isPriority(t, totals, minKnown)
            };
        }).sort(function (a, b) { return b.asked - a.asked || (a.topic < b.topic ? -1 : 1); });

        var solid = topics.filter(function (t) { return t.solid; });
        var plotted = topics.filter(function (t) { return t.plotted; });
        var average = totals.known ? 1 - totals.issues / totals.known : null;
        var medianAsked = solid.length ? median(solid.map(function (t) { return t.asked; })) : null;
        topics.forEach(function (t) {
            t.focus = t.solid && medianAsked !== null && average !== null && t.asked >= medianAsked && t.cleared < average;
        });
        var depths = solid.map(function (t) { return t.depth; });
        return {
            topics: topics, plotted: plotted, solid: solid, totals: totals, average: average, medianAsked: medianAsked,
            depthRange: depths.length ? [Math.min.apply(null, depths), Math.max.apply(null, depths)] : [1, 1],
            labelled: labelSet(solid), range: windowRange(opts.window, opts.asOf),
            trendWindow: { recentFrom: recentFrom, priorFrom: priorFrom }
        };
    }

    /** The lower median, as the dashboard takes it. */
    function median(values) {
        var s = values.slice().sort(function (a, b) { return a - b; });
        return s[Math.floor((s.length - 1) / 2)];
    }

    /** A round top for the x axis: 701 draws as 800. */
    function niceMax(maxValue) {
        var raw = maxValue * 1.08;
        var step = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 10)))) / 2;
        return Math.ceil(raw / step) * step;
    }

    /** The bottom of the y axis: a round 10% at least five points under the lowest topic. */
    function yFloor(minCleared) {
        return Math.max(0, Math.floor((minCleared - 0.05) * 10 + 1e-9) / 10);
    }

    function radiusOf(depth, range) {
        var lo = range[0], hi = range[1];
        if (!(hi > lo)) return (RADIUS.min + RADIUS.max) / 2;
        var d = Math.min(Math.max(depth, lo), hi);
        return RADIUS.min + (d - lo) / (hi - lo) * (RADIUS.max - RADIUS.min);
    }

    /** Topics that carry a label: every red one, and the eight with the most struggled questions. */
    function labelSet(solid) {
        var set = {};
        solid.filter(function (t) { return t.priority; }).forEach(function (t) { set[t.topic] = 1; });
        solid.slice().sort(function (a, b) { return b.issues - a.issues || (a.topic < b.topic ? -1 : 1); })
            .slice(0, 8).forEach(function (t) { set[t.topic] = 1; });
        return set;
    }

    return {
        MIN_KNOWN: MIN_KNOWN, MIN_PLOTTED: MIN_PLOTTED, TREND_Z: TREND_Z, RADIUS: RADIUS, WINDOWS: WINDOWS,
        windowRange: windowRange, filterRows: filterRows, twoProportionZ: twoProportionZ, trendOf: trendOf,
        issueRange: issueRange, isPriority: isPriority, topicMap: topicMap, median: median, niceMax: niceMax,
        yFloor: yFloor, radiusOf: radiusOf, labelSet: labelSet, outcomeOf: outcomeOf
    };
});
