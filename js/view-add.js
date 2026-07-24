/* The entry form — the bit that has to work one-handed on a phone in a queue.
   Handles both "new visit" and "edit existing visit". */
window.FC = window.FC || {};

(function () {
  var el = FC.ui.el;
  var cfg = FC.config;

  /* Working copy of whatever is being edited. */
  var form = null;
  var refs = {};
  var searchTimer = null;

  function blank() {
    var scores = {};
    cfg.metrics.forEach(function (m) { scores[m.key] = cfg.scale.default; });
    return {
      visitId: null,
      place: null,          // {id?, name, address, city, country, country_code, lat, lng}
      visit_date: FC.ui.today(),
      rater: FC.store.settings().rater || '',
      dish: '',
      price: '',
      notes: '',
      scores: scores
    };
  }

  /* Called from the nav tab, from "log another visit", and from "edit". */
  function open(opts) {
    opts = opts || {};
    form = blank();

    if (opts.visit) {
      var v = opts.visit;
      var p = FC.store.place(v.place_id);
      form = {
        visitId: v.id,
        place: p ? Object.assign({}, p) : null,
        visit_date: v.visit_date || FC.ui.today(),
        rater: v.rater || '',
        dish: v.dish || '',
        price: v.price === null || v.price === undefined ? '' : String(v.price),
        notes: v.notes || '',
        scores: Object.assign(blank().scores, v.scores || {})
      };
    } else if (opts.place) {
      form.place = Object.assign({}, opts.place);
    }

    FC.app.goto('add');
  }

  function mount(container) {
    if (!form) form = blank();
    refs = {};
    FC.ui.clear(container);
    container.appendChild(el('div', { class: 'form-wrap' }, [
      el('h2', { class: 'view-title', text: form.visitId ? 'Edit visit' : 'New visit' }),
      placeSection(),
      whenSection(),
      orderSection(),
      scoresSection(),
      notesSection(),
      submitBar()
    ]));
    updateLiveScore();
  }

  /* ---------- 1. which place ---------- */

  function placeSection() {
    var results = el('div', { class: 'search-results', id: 'place-results' });
    refs.results = results;

    var chosen = el('div', { class: 'chosen-place', id: 'chosen-place' });
    refs.chosen = chosen;

    var input = el('input', {
      class: 'input',
      type: 'search',
      id: 'place-search',
      placeholder: 'e.g. Chick King, Peckham',
      autocomplete: 'off',
      oninput: function (e) { onSearchInput(e.target.value); }
    });
    refs.search = input;

    var section = el('section', { class: 'card' }, [
      el('h3', { class: 'card-title', text: 'Where' }),
      el('div', { class: 'search-box' }, [
        input,
        el('button', {
          class: 'btn ghost small',
          type: 'button',
          title: 'Use my current location',
          onclick: useLocation
        }, '📍')
      ]),
      el('p', { class: 'hint', text: 'Search by name, or pick one you have already rated.' }),
      recentPlaceChips(),
      results,
      chosen
    ]);

    renderChosen();
    return section;
  }

  function recentPlaceChips() {
    var places = FC.store.places().sort(function (a, b) {
      return (b.updated_at || '').localeCompare(a.updated_at || '');
    }).slice(0, 8);

    if (!places.length) return null;

    return el('div', { class: 'chip-row' }, places.map(function (p) {
      return el('button', {
        class: 'chip-btn',
        type: 'button',
        onclick: function () { choose(Object.assign({}, p)); }
      }, p.name);
    }));
  }

  function onSearchInput(value) {
    clearTimeout(searchTimer);
    var q = value.trim();

    /* Show matching places we already know about immediately — no network needed. */
    var local = q.length >= 2 ? FC.store.places().filter(function (p) {
      return p.name.toLowerCase().indexOf(q.toLowerCase()) !== -1;
    }).slice(0, 4) : [];

    renderResults(local.map(function (p) {
      return { known: true, place: p };
    }), q.length >= 3 ? 'searching' : null);

    if (q.length < 3) return;

    searchTimer = setTimeout(function () {
      FC.geo.search(q).then(function (found) {
        renderResults(
          local.map(function (p) { return { known: true, place: p }; })
            .concat(found.map(function (f) { return { known: false, place: f }; })),
          null,
          q
        );
      }).catch(function (err) {
        renderResults(local.map(function (p) { return { known: true, place: p }; }), null, q, err);
      });
    }, 450);
  }

  function renderResults(items, status, query, error) {
    var host = refs.results;
    if (!host) return;
    FC.ui.clear(host);

    items.forEach(function (item) {
      var p = item.place;
      host.appendChild(el('button', {
        class: 'result',
        type: 'button',
        onclick: function () { choose(Object.assign({}, p)); }
      }, [
        el('span', { class: 'result-main' }, [
          el('strong', { text: p.name }),
          el('span', {
            class: 'muted small',
            text: [p.address, p.city, p.country].filter(Boolean).join(', ')
          })
        ]),
        item.known ? el('span', { class: 'tag', text: 'rated' }) : null
      ]));
    });

    if (status === 'searching') {
      host.appendChild(el('p', { class: 'muted small pad', text: 'Searching the map…' }));
    }
    if (error) {
      host.appendChild(el('p', { class: 'muted small pad', text: 'Map search unavailable — you can still type the details in below.' }));
    }
    if (query && !items.length && !status && !error) {
      host.appendChild(el('button', {
        class: 'result',
        type: 'button',
        onclick: function () { choose({ name: query, city: '', country: '' }); }
      }, [
        el('span', { class: 'result-main' }, [
          el('strong', { text: 'Use "' + query + '"' }),
          el('span', { class: 'muted small', text: 'add it manually, no map pin' })
        ])
      ]));
    }
  }

  function useLocation() {
    FC.ui.toast('Finding you…');
    FC.geo.locate()
      .then(function (pos) { return FC.geo.reverse(pos.lat, pos.lng); })
      .then(function (r) {
        choose({
          name: refs.search && refs.search.value.trim() ? refs.search.value.trim() : r.name,
          address: r.address,
          city: r.city,
          country: r.country,
          country_code: r.country_code,
          lat: r.lat,
          lng: r.lng
        });
        FC.ui.toast('Pinned to ' + (r.city || 'your location'));
      })
      .catch(function (err) { FC.ui.toast(err.message, 'error'); });
  }

  function choose(place) {
    form.place = place;
    if (refs.search) refs.search.value = '';
    FC.ui.clear(refs.results);
    renderChosen();
  }

  function renderChosen() {
    var host = refs.chosen;
    if (!host) return;
    FC.ui.clear(host);
    if (!form.place) return;

    var p = form.place;
    host.appendChild(el('div', { class: 'chosen' }, [
      el('div', { class: 'chosen-main' }, [
        el('strong', { text: p.name }),
        el('span', { class: 'muted small', text: [p.address, p.city, p.country].filter(Boolean).join(', ') || 'No location set' }),
        p.id ? el('span', { class: 'tag', text: 'existing place' }) : null
      ]),
      el('button', {
        class: 'link-btn',
        type: 'button',
        onclick: function () { form.place = null; renderChosen(); }
      }, 'Change')
    ]));

    /* Let people fix a missing city/country by hand — the search does not always
       resolve a small takeaway. */
    if (!p.id) {
      host.appendChild(el('div', { class: 'control-grid' }, [
        textField('Name', p.name, function (v) { p.name = v; }),
        textField('City', p.city, function (v) { p.city = v; }),
        textField('Country', p.country, function (v) {
          p.country = v;
          if (!p.country_code) p.country_code = '';
        })
      ]));
    }
  }

  function textField(label, value, onInput, opts) {
    opts = opts || {};
    return el('label', { class: 'field compact' }, [
      el('span', { class: 'field-label', text: label }),
      el('input', Object.assign({
        class: 'input',
        type: opts.type || 'text',
        value: value === null || value === undefined ? '' : value,
        placeholder: opts.placeholder || '',
        inputmode: opts.inputmode || null,
        oninput: function (e) { onInput(e.target.value); }
      }, opts.attrs || {}))
    ]);
  }

  /* ---------- 2. when / who ---------- */

  function whenSection() {
    var knownRaters = [];
    FC.store.visits().forEach(function (v) {
      if (v.rater && knownRaters.indexOf(v.rater) === -1) knownRaters.push(v.rater);
    });
    var myName = FC.store.settings().rater;
    if (myName && knownRaters.indexOf(myName) === -1) knownRaters.unshift(myName);

    var raterInput = el('input', {
      class: 'input',
      type: 'text',
      value: form.rater,
      placeholder: 'Your name',
      oninput: function (e) { form.rater = e.target.value; }
    });
    refs.rater = raterInput;

    return el('section', { class: 'card' }, [
      el('h3', { class: 'card-title', text: 'When & who' }),
      el('div', { class: 'control-grid' }, [
        el('label', { class: 'field compact' }, [
          el('span', { class: 'field-label', text: 'Date of visit' }),
          el('input', {
            class: 'input',
            type: 'date',
            value: form.visit_date,
            max: FC.ui.today(),
            onchange: function (e) { form.visit_date = e.target.value; }
          })
        ]),
        el('label', { class: 'field compact' }, [
          el('span', { class: 'field-label', text: 'Rated by' }),
          raterInput
        ])
      ]),
      knownRaters.length ? el('div', { class: 'chip-row' }, knownRaters.map(function (r) {
        return el('button', {
          class: 'chip-btn',
          type: 'button',
          onclick: function () { form.rater = r; raterInput.value = r; }
        }, r);
      })) : null
    ]);
  }

  /* ---------- 3. what you ordered ---------- */

  function orderSection() {
    return el('section', { class: 'card' }, [
      el('h3', { class: 'card-title', text: 'The order' }),
      el('div', { class: 'control-grid' }, [
        textField('Dish', form.dish, function (v) { form.dish = v; },
          { placeholder: '3 wings & fries' }),
        textField('Price (' + cfg.currency + ')', form.price, function (v) { form.price = v; },
          { type: 'number', inputmode: 'decimal', placeholder: '8.50', attrs: { step: '0.01', min: '0' } })
      ])
    ]);
  }

  /* ---------- 4. the scores ---------- */

  function scoresSection() {
    return el('section', { class: 'card' }, [
      el('h3', { class: 'card-title', text: 'Scores' }),
      el('p', { class: 'hint', text: '0 = never again, 10 = life changing.' })
    ].concat(cfg.metrics.map(slider)));
  }

  function slider(metric) {
    var value = form.scores[metric.key];
    var out = el('output', { class: 'slider-value', text: FC.ui.fmtScore(value) });

    var input = el('input', {
      class: 'slider',
      type: 'range',
      min: cfg.scale.min,
      max: cfg.scale.max,
      step: cfg.scale.step,
      value: value,
      'aria-label': metric.label,
      oninput: function (e) {
        var v = parseFloat(e.target.value);
        form.scores[metric.key] = v;
        out.textContent = FC.ui.fmtScore(v);
        paint(input, v);
        updateLiveScore();
      }
    });

    paint(input, value);

    return el('div', { class: 'slider-row' }, [
      el('div', { class: 'slider-head' }, [
        el('span', { class: 'slider-label' }, [
          el('strong', { text: metric.label }),
          el('span', { class: 'muted small', text: metric.hint })
        ]),
        out
      ]),
      input
    ]);
  }

  /* Colour the filled portion of the track to match the score band. */
  function paint(input, value) {
    var pct = ((value - cfg.scale.min) / (cfg.scale.max - cfg.scale.min)) * 100;
    input.style.setProperty('--fill', pct + '%');
    input.className = 'slider ' + FC.score.band(value).class;
  }

  function updateLiveScore() {
    if (!refs.live) return;
    var score = FC.score.visitScore({ scores: form.scores });
    refs.live.textContent = FC.ui.fmtScore(score);
    refs.live.className = 'live-score ' + FC.score.band(score).class;
  }

  /* ---------- 5. notes ---------- */

  function notesSection() {
    return el('section', { class: 'card' }, [
      el('h3', { class: 'card-title', text: 'Notes' }),
      el('textarea', {
        class: 'input textarea',
        rows: 4,
        placeholder: 'Brine? Gravy? Queue out the door? Anything worth remembering.',
        oninput: function (e) { form.notes = e.target.value; }
      }, form.notes)
    ]);
  }

  /* ---------- 6. save ---------- */

  function submitBar() {
    var live = el('span', { class: 'live-score' });
    refs.live = live;

    return el('div', { class: 'submit-bar' }, [
      el('div', { class: 'live' }, [
        el('span', { class: 'muted small', text: 'This visit' }),
        live
      ]),
      el('div', { class: 'row gap' }, [
        form.visitId ? el('button', {
          class: 'btn ghost',
          type: 'button',
          onclick: function () { form = null; FC.app.goto('list'); }
        }, 'Cancel') : null,
        el('button', { class: 'btn primary', type: 'button', onclick: save }, 'Save visit')
      ])
    ]);
  }

  function save() {
    if (!form.place || !(form.place.name || '').trim()) {
      FC.ui.toast('Pick or name a place first.', 'error');
      var s = document.getElementById('place-search');
      if (s) s.focus();
      return;
    }
    if (!form.visit_date) {
      FC.ui.toast('Add the date you visited.', 'error');
      return;
    }

    /* Reuse an existing place record when the name+city already exist, so two
       people logging the same shop end up on one entry. */
    var p = form.place;
    var existing = p.id ? FC.store.place(p.id) : FC.store.findPlace(p.name, p.city);

    var placeRecord = FC.store.savePlace(Object.assign({}, existing || {}, {
      id: (existing && existing.id) || p.id || null,
      name: (p.name || '').trim(),
      address: p.address || (existing && existing.address) || '',
      city: (p.city || (existing && existing.city) || '').trim(),
      country: (p.country || (existing && existing.country) || '').trim(),
      country_code: p.country_code || (existing && existing.country_code) || '',
      lat: typeof p.lat === 'number' ? p.lat : (existing && existing.lat) || null,
      lng: typeof p.lng === 'number' ? p.lng : (existing && existing.lng) || null,
      deleted: false
    }));

    var price = parseFloat(form.price);
    FC.store.saveVisit({
      id: form.visitId,
      place_id: placeRecord.id,
      rater: (form.rater || '').trim(),
      visit_date: form.visit_date,
      scores: form.scores,
      dish: (form.dish || '').trim(),
      price: isNaN(price) ? null : price,
      notes: (form.notes || '').trim(),
      deleted: false
    });

    /* Remember the name so the next entry pre-fills it. */
    if ((form.rater || '').trim()) {
      FC.store.saveSettings({ rater: form.rater.trim() });
    }

    var wasEdit = !!form.visitId;
    form = null;
    FC.sync.nudge();
    FC.app.refresh();
    FC.app.goto('list');
    FC.ui.toast(wasEdit ? 'Visit updated' : 'Logged ' + placeRecord.name);
  }

  FC.views = FC.views || {};
  FC.views.add = { mount: mount, open: open, reset: function () { form = null; } };
})();
