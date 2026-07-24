/* Score maths: turning raw slider values into per-visit and per-place numbers. */
window.FC = window.FC || {};

(function () {
  var cfg = FC.config;

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  /* Weighted mean of whichever metrics were actually scored on this visit. */
  function visitScore(visit) {
    if (!visit || !visit.scores) return null;
    var total = 0;
    var weight = 0;
    cfg.metrics.forEach(function (m) {
      var v = visit.scores[m.key];
      if (typeof v === 'number' && !isNaN(v)) {
        total += v * m.weight;
        weight += m.weight;
      }
    });
    if (!weight) return null;
    return round1(total / weight);
  }

  function mean(nums) {
    var vals = nums.filter(function (n) { return typeof n === 'number' && !isNaN(n); });
    if (!vals.length) return null;
    var sum = vals.reduce(function (a, b) { return a + b; }, 0);
    return round1(sum / vals.length);
  }

  /* Roll every visit to a place into one summary object used by list + map + detail. */
  function placeStats(place, visits) {
    var scored = visits.filter(function (v) { return visitScore(v) !== null; });
    var perMetric = {};
    cfg.metrics.forEach(function (m) {
      perMetric[m.key] = mean(visits.map(function (v) {
        return v.scores ? v.scores[m.key] : null;
      }));
    });

    var overall = mean(scored.map(visitScore));
    var prices = visits
      .map(function (v) { return typeof v.price === 'number' ? v.price : null; })
      .filter(function (p) { return p !== null; });

    var raters = [];
    visits.forEach(function (v) {
      var r = (v.rater || '').trim();
      if (r && raters.indexOf(r) === -1) raters.push(r);
    });

    var dates = visits.map(function (v) { return v.visit_date; }).filter(Boolean).sort();

    return {
      place: place,
      visits: visits,
      visitCount: visits.length,
      overall: overall,
      metrics: perMetric,
      avgPrice: mean(prices),
      raters: raters,
      firstVisit: dates[0] || null,
      lastVisit: dates[dates.length - 1] || null,
      band: band(overall)
    };
  }

  function band(score) {
    if (score === null || score === undefined) {
      return { label: 'Unrated', class: 'band-none' };
    }
    for (var i = 0; i < cfg.bands.length; i++) {
      if (score >= cfg.bands[i].min) return cfg.bands[i];
    }
    return cfg.bands[cfg.bands.length - 1];
  }

  /* Build stats for every non-deleted place in one pass. */
  function allStats() {
    var visitsByPlace = {};
    FC.store.visits().forEach(function (v) {
      (visitsByPlace[v.place_id] = visitsByPlace[v.place_id] || []).push(v);
    });
    return FC.store.places().map(function (p) {
      var vs = (visitsByPlace[p.id] || []).sort(function (a, b) {
        return (b.visit_date || '').localeCompare(a.visit_date || '');
      });
      return placeStats(p, vs);
    });
  }

  FC.score = {
    visitScore: visitScore,
    placeStats: placeStats,
    allStats: allStats,
    band: band,
    mean: mean,
    round1: round1
  };
})();
