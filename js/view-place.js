/* The place detail panel — opened from a map pin or a list row.
   Shows the rolled-up scores, then every individual visit. */
window.FC = window.FC || {};

(function () {
  var el = FC.ui.el;

  function render(placeId) {
    var place = FC.store.place(placeId);
    if (!place || place.deleted) {
      FC.ui.toast('That place is no longer here.', 'error');
      return;
    }
    var stats = FC.score.placeStats(place, FC.store.visitsForPlace(placeId));
    FC.ui.sheet(build(stats));
  }

  function build(stats) {
    var place = stats.place;

    var header = el('div', { class: 'place-head' }, [
      el('div', { class: 'place-head-main' }, [
        el('h2', { class: 'place-title', text: place.name }),
        el('p', { class: 'place-sub' }, [
          FC.ui.flag(place.country_code) + ' ' +
          [place.address, place.city, place.country].filter(Boolean).join(' · ')
        ])
      ]),
      el('div', { class: 'place-head-score' }, [
        FC.ui.scoreChip(stats.overall, { large: true }),
        el('span', { class: 'muted small', text: FC.score.band(stats.overall).label })
      ])
    ]);

    var facts = el('div', { class: 'facts' }, [
      fact(FC.ui.plural(stats.visitCount, 'visit'), 'logged'),
      fact(stats.avgPrice !== null ? FC.ui.fmtPrice(stats.avgPrice) : '–', 'avg spend'),
      fact(stats.raters.length ? stats.raters.join(' & ') : '–', 'rated by'),
      fact(stats.lastVisit ? FC.ui.fmtDate(stats.lastVisit) : '–', 'last visit')
    ]);

    var breakdown = el('div', { class: 'card' }, [
      el('h3', { class: 'card-title', text: 'Average across all visits' })
    ].concat(FC.config.metrics.map(function (m) {
      return FC.ui.metricBar(m, stats.metrics[m.key]);
    })));

    var visitsSection = el('div', { class: 'card' }, [
      el('h3', { class: 'card-title', text: FC.ui.plural(stats.visitCount, 'visit') })
    ].concat(
      stats.visits.length
        ? stats.visits.map(visitCard)
        : [el('p', { class: 'muted', text: 'No visits logged yet.' })]
    ));

    var actions = el('div', { class: 'row gap wrap sheet-actions' }, [
      el('button', {
        class: 'btn primary',
        onclick: function () {
          FC.ui.closeSheet();
          FC.views.add.open({ place: place });
        }
      }, '+ Log another visit'),
      place.lat ? el('a', {
        class: 'btn ghost',
        href: 'https://www.google.com/maps/search/?api=1&query=' +
              encodeURIComponent(place.name + ' ' + (place.city || '')) +
              '&query_place_id=',
        target: '_blank',
        rel: 'noopener'
      }, 'Directions') : null,
      el('button', {
        class: 'btn ghost danger-text',
        onclick: function () {
          FC.ui.confirm('Delete "' + place.name + '" and all its visits?').then(function (ok) {
            if (!ok) return;
            FC.store.deletePlace(place.id);
            FC.sync.nudge();
            FC.ui.closeSheet();
            FC.app.refresh();
            FC.ui.toast('Deleted ' + place.name);
          });
        }
      }, 'Delete place')
    ]);

    return el('div', { class: 'place-detail' }, [header, facts, breakdown, visitsSection, actions]);
  }

  function fact(value, label) {
    return el('div', { class: 'fact' }, [
      el('strong', { text: String(value) }),
      el('span', { class: 'muted small', text: label })
    ]);
  }

  function visitCard(visit) {
    var score = FC.score.visitScore(visit);
    var chips = FC.config.metrics.map(function (m) {
      var v = visit.scores ? visit.scores[m.key] : null;
      if (v === null || v === undefined) return null;
      return el('span', { class: 'mini-metric' }, [
        el('span', { class: 'muted', text: m.label }),
        el('strong', { text: FC.ui.fmtScore(v) })
      ]);
    }).filter(Boolean);

    return el('div', { class: 'visit' }, [
      el('div', { class: 'visit-head' }, [
        el('div', {}, [
          el('strong', { text: FC.ui.fmtDate(visit.visit_date) }),
          el('span', { class: 'muted', text: visit.rater ? ' · ' + visit.rater : '' })
        ]),
        FC.ui.scoreChip(score)
      ]),
      visit.dish || visit.price
        ? el('p', { class: 'visit-order muted small' }, [
            [visit.dish, FC.ui.fmtPrice(visit.price)].filter(Boolean).join(' · ')
          ])
        : null,
      el('div', { class: 'mini-metrics' }, chips),
      visit.notes ? el('p', { class: 'visit-notes', text: visit.notes }) : null,
      el('div', { class: 'row gap visit-actions' }, [
        el('button', {
          class: 'link-btn',
          onclick: function () {
            FC.ui.closeSheet();
            FC.views.add.open({ visit: visit });
          }
        }, 'Edit'),
        el('button', {
          class: 'link-btn danger-text',
          onclick: function () {
            FC.ui.confirm('Delete this visit?').then(function (ok) {
              if (!ok) return;
              FC.store.deleteVisit(visit.id);
              FC.sync.nudge();
              FC.app.refresh();
              render(visit.place_id);
            });
          }
        }, 'Delete')
      ])
    ]);
  }

  FC.views = FC.views || {};
  FC.views.place = { render: render };
})();
