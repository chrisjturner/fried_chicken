/* The leaderboard. Sort by overall or by any single metric, filter by place. */
window.FC = window.FC || {};

(function () {
  var el = FC.ui.el;

  var sorts = [{ key: 'overall', label: 'Best overall' }]
    .concat(FC.config.metrics.map(function (m) {
      return { key: m.key, label: m.label };
    }))
    .concat([
      { key: 'value_price', label: 'Cheapest' },
      { key: 'recent', label: 'Most recent' },
      { key: 'visits', label: 'Most visited' },
      { key: 'name', label: 'A–Z' }
    ]);

  var state = { sort: 'overall', country: '', city: '', rater: '', query: '' };

  function mount(container) {
    FC.ui.clear(container);
    container.appendChild(el('div', { class: 'list-wrap' }, [
      el('div', { class: 'controls', id: 'list-controls' }),
      el('div', { class: 'list', id: 'list-body' })
    ]));
    refresh();
  }

  function refresh() {
    renderControls();
    renderList();
  }

  function allStats() {
    return FC.score.allStats();
  }

  function renderControls() {
    var host = document.getElementById('list-controls');
    if (!host) return;
    FC.ui.clear(host);

    var stats = allStats();
    var countries = unique(stats.map(function (s) { return s.place.country; }));
    var cities = unique(stats
      .filter(function (s) { return !state.country || s.place.country === state.country; })
      .map(function (s) { return s.place.city; }));
    var raters = unique(FC.store.visits().map(function (v) { return v.rater; }));

    host.appendChild(el('input', {
      class: 'input search',
      type: 'search',
      placeholder: 'Search places…',
      value: state.query,
      oninput: function (e) { state.query = e.target.value; renderList(); }
    }));

    host.appendChild(el('div', { class: 'control-grid' }, [
      select('Sort by', state.sort, sorts.map(function (s) {
        return { value: s.key, label: s.label };
      }), function (v) { state.sort = v; renderList(); }),

      select('Country', state.country, [{ value: '', label: 'All countries' }].concat(
        countries.map(function (c) { return { value: c, label: c }; })
      ), function (v) { state.country = v; state.city = ''; refresh(); }),

      select('City', state.city, [{ value: '', label: 'All cities' }].concat(
        cities.map(function (c) { return { value: c, label: c }; })
      ), function (v) { state.city = v; renderList(); }),

      select('Rated by', state.rater, [{ value: '', label: 'Everyone' }].concat(
        raters.map(function (r) { return { value: r, label: r }; })
      ), function (v) { state.rater = v; renderList(); })
    ]));
  }

  function select(label, value, options, onChange) {
    return el('label', { class: 'field compact' }, [
      el('span', { class: 'field-label', text: label }),
      el('select', {
        class: 'input',
        onchange: function (e) { onChange(e.target.value); }
      }, options.map(function (o) {
        return el('option', { value: o.value, selected: o.value === value }, o.label);
      }))
    ]);
  }

  function unique(values) {
    var seen = [];
    values.forEach(function (v) {
      if (v && seen.indexOf(v) === -1) seen.push(v);
    });
    return seen.sort();
  }

  /* When filtering by rater, recompute each place from only that person's visits. */
  function scopedStats() {
    var stats = state.rater
      ? FC.store.places().map(function (p) {
          var vs = FC.store.visitsForPlace(p.id).filter(function (v) {
            return v.rater === state.rater;
          });
          return FC.score.placeStats(p, vs);
        }).filter(function (s) { return s.visitCount > 0; })
      : allStats();

    var q = state.query.trim().toLowerCase();

    return stats.filter(function (s) {
      var p = s.place;
      if (state.country && p.country !== state.country) return false;
      if (state.city && p.city !== state.city) return false;
      if (q) {
        var hay = [p.name, p.city, p.country, p.address].filter(Boolean).join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function sortStats(stats) {
    var key = state.sort;
    var copy = stats.slice();

    /* Unrated places always sink to the bottom rather than sorting as zero. */
    function nullLast(getter) {
      return function (a, b) {
        var av = getter(a);
        var bv = getter(b);
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        return bv - av;
      };
    }

    if (key === 'overall') copy.sort(nullLast(function (s) { return s.overall; }));
    else if (key === 'name') copy.sort(function (a, b) {
      return a.place.name.localeCompare(b.place.name);
    });
    else if (key === 'visits') copy.sort(function (a, b) { return b.visitCount - a.visitCount; });
    else if (key === 'recent') copy.sort(function (a, b) {
      return (b.lastVisit || '').localeCompare(a.lastVisit || '');
    });
    else if (key === 'value_price') copy.sort(function (a, b) {
      if (a.avgPrice === null) return 1;
      if (b.avgPrice === null) return -1;
      return a.avgPrice - b.avgPrice;
    });
    else copy.sort(nullLast(function (s) { return s.metrics[key]; }));

    return copy;
  }

  function renderList() {
    var host = document.getElementById('list-body');
    if (!host) return;
    FC.ui.clear(host);

    var stats = sortStats(scopedStats());

    if (!stats.length) {
      host.appendChild(FC.ui.empty(
        FC.store.places().length ? 'Nothing matches' : 'No places yet',
        FC.store.places().length
          ? 'Try clearing a filter or the search box.'
          : 'Add your first fried chicken place to start the leaderboard.',
        FC.store.places().length ? null : el('button', {
          class: 'btn primary',
          onclick: function () { FC.app.goto('add'); }
        }, 'Add a place')
      ));
      return;
    }

    var sortLabel = (sorts.filter(function (s) { return s.key === state.sort; })[0] || {}).label;
    host.appendChild(el('p', {
      class: 'muted small list-count',
      text: FC.ui.plural(stats.length, 'place') + ' · sorted by ' + sortLabel.toLowerCase()
    }));

    stats.forEach(function (s, i) {
      host.appendChild(listRow(s, i + 1));
    });
  }

  function listRow(s, rank) {
    var p = s.place;
    /* When sorting by a single metric, surface that metric next to the overall. */
    var highlight = FC.config.metricByKey[state.sort];

    return el('button', {
      class: 'list-row',
      onclick: function () { FC.views.place.render(p.id); }
    }, [
      el('span', { class: 'rank ' + (rank <= 3 ? 'rank-top' : ''), text: '#' + rank }),
      el('span', { class: 'list-main' }, [
        el('strong', { class: 'list-name', text: p.name }),
        el('span', { class: 'muted small' }, [
          FC.ui.flag(p.country_code) + ' ' +
          [p.city, p.country].filter(Boolean).join(', ') +
          ' · ' + FC.ui.plural(s.visitCount, 'visit') +
          (s.avgPrice !== null ? ' · ' + FC.ui.fmtPrice(s.avgPrice) : '')
        ]),
        highlight
          ? el('span', { class: 'muted small' },
              highlight.label + ': ' + FC.ui.fmtScore(s.metrics[highlight.key]))
          : null
      ]),
      FC.ui.scoreChip(s.overall, { large: true })
    ]);
  }

  FC.views = FC.views || {};
  FC.views.list = { mount: mount, refresh: refresh };
})();
