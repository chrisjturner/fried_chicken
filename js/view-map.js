/* The map view. Drills down World → Country → City → Place.
   Each level aggregates the level below it into one marker, so the world view
   shows a single pin per country carrying that country's average score. */
window.FC = window.FC || {};

(function () {
  var el = FC.ui.el;
  var map = null;
  var markerLayer = null;
  var mapEl = null;
  var state = { level: 'world', country: null, city: null };
  var lastStats = [];

  /* The Leaflet container is created once and moved between mounts. Rebuilding
     it each time would leave the Map instance bound to a detached node, which
     silently drops every marker. */
  function mapNode() {
    if (!mapEl) mapEl = el('div', { class: 'map', id: 'leaflet-map' });
    return mapEl;
  }

  function mount(container) {
    FC.ui.clear(container);

    var breadcrumb = el('nav', { class: 'breadcrumb', id: 'map-breadcrumb' });
    var panel = el('div', { class: 'map-panel', id: 'map-panel' });

    container.appendChild(el('div', { class: 'map-wrap' }, [breadcrumb, mapNode(), panel]));

    if (typeof L === 'undefined') {
      FC.ui.clear(mapNode()).appendChild(el('div', { class: 'map-offline' }, [
        el('p', { text: 'The map library could not load (you may be offline).' }),
        el('p', { class: 'muted small', text: 'Everything else still works — try the List tab.' })
      ]));
      renderPanel();
      return;
    }

    if (!map) {
      map = L.map(mapNode(), { zoomControl: true, worldCopyJump: true }).setView([25, 5], 2);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        maxZoom: 19
      }).addTo(map);

      /* Leaflet caches the container size; it has to be told when that changes. */
      window.addEventListener('resize', function () {
        if (map && document.body.contains(map.getContainer())) map.invalidateSize();
      });
    }

    if (!markerLayer) markerLayer = L.layerGroup().addTo(map);

    /* Re-measure on every mount — on first paint the container may not have
       been laid out yet, and its width changes across the desktop breakpoint. */
    setTimeout(function () { if (map) map.invalidateSize(); }, 0);

    refresh();
  }

  function refresh() {
    lastStats = FC.score.allStats();

    /* Drop out of a drilldown if its last place was deleted. */
    if (state.level !== 'world' && !groupsFor('world').some(function (g) {
      return g.key === state.country;
    })) {
      state = { level: 'world', country: null, city: null };
    }

    renderBreadcrumb();
    renderMarkers();
    renderPanel();
  }

  /* ---------- grouping ---------- */

  function inScope() {
    return lastStats.filter(function (s) {
      var p = s.place;
      if (state.country && (p.country_code || p.country) !== state.country) return false;
      if (state.city && (p.city || 'Unknown') !== state.city) return false;
      return true;
    });
  }

  function groupsFor(level) {
    var source = level === 'world' ? lastStats : inScope();
    var buckets = {};

    source.forEach(function (s) {
      var p = s.place;
      var key, label, sublabel;
      if (level === 'world') {
        key = p.country_code || p.country || 'Unknown';
        label = p.country || 'Unknown';
        sublabel = FC.ui.flag(p.country_code);
      } else {
        key = p.city || 'Unknown';
        label = p.city || 'Unknown';
        sublabel = p.country || '';
      }
      var b = buckets[key] || (buckets[key] = {
        key: key, label: label, sublabel: sublabel, stats: []
      });
      b.stats.push(s);
    });

    return Object.keys(buckets).map(function (k) {
      var b = buckets[k];
      var rated = b.stats.filter(function (s) { return s.overall !== null; });
      b.overall = FC.score.mean(rated.map(function (s) { return s.overall; }));
      b.placeCount = b.stats.length;
      b.visitCount = b.stats.reduce(function (n, s) { return n + s.visitCount; }, 0);
      b.coords = centroid(b.stats);
      return b;
    }).sort(function (a, b) {
      return (b.overall === null ? -1 : b.overall) - (a.overall === null ? -1 : a.overall);
    });
  }

  function located(stats) {
    return stats.filter(function (s) {
      return typeof s.place.lat === 'number' && typeof s.place.lng === 'number';
    });
  }

  function centroid(stats) {
    var pts = located(stats);
    if (!pts.length) return null;
    var lat = 0, lng = 0;
    pts.forEach(function (s) { lat += s.place.lat; lng += s.place.lng; });
    return [lat / pts.length, lng / pts.length];
  }

  /* ---------- rendering ---------- */

  function renderBreadcrumb() {
    var host = document.getElementById('map-breadcrumb');
    if (!host) return;
    FC.ui.clear(host);

    var crumbs = [{ label: '🌍 World', to: { level: 'world', country: null, city: null } }];
    if (state.country) {
      var countryLabel = (lastStats.filter(function (s) {
        return (s.place.country_code || s.place.country) === state.country;
      })[0] || {}).place;
      crumbs.push({
        label: FC.ui.flag(state.country) + ' ' + (countryLabel ? countryLabel.country : state.country),
        to: { level: 'country', country: state.country, city: null }
      });
    }
    if (state.city) {
      crumbs.push({ label: state.city, to: null });
    }

    crumbs.forEach(function (c, i) {
      if (i) host.appendChild(el('span', { class: 'crumb-sep', text: '›' }));
      host.appendChild(c.to
        ? el('button', {
            class: 'crumb' + (i === crumbs.length - 1 ? ' current' : ''),
            onclick: function () { go(c.to); }
          }, c.label)
        : el('span', { class: 'crumb current', text: c.label }));
    });
  }

  function go(next) {
    state = Object.assign({ level: 'world', country: null, city: null }, next);
    renderBreadcrumb();
    renderMarkers();
    renderPanel();
    fitToScope();
  }

  function pinIcon(text, score, kind) {
    var band = FC.score.band(score);
    return L.divIcon({
      className: '',
      html: '<div class="pin ' + band.class + ' pin-' + kind + '">' +
            '<span class="pin-score">' + FC.ui.fmtScore(score) + '</span>' +
            '<span class="pin-label">' + escapeHtml(text) + '</span></div>',
      iconSize: null,
      iconAnchor: [0, 0]
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderMarkers() {
    if (!map || !markerLayer) return;
    markerLayer.clearLayers();

    if (state.level === 'world' || state.level === 'country') {
      var level = state.level === 'world' ? 'world' : 'country';
      groupsFor(level).forEach(function (g) {
        if (!g.coords) return;
        var label = (level === 'world' ? g.sublabel + ' ' : '') + g.label +
                    ' · ' + FC.ui.plural(g.placeCount, 'place');
        L.marker(g.coords, { icon: pinIcon(label, g.overall, 'group') })
          .addTo(markerLayer)
          .on('click', function () {
            go(level === 'world'
              ? { level: 'country', country: g.key, city: null }
              : { level: 'city', country: state.country, city: g.key });
          });
      });
    } else {
      located(inScope()).forEach(function (s) {
        L.marker([s.place.lat, s.place.lng], { icon: pinIcon(s.place.name, s.overall, 'place') })
          .addTo(markerLayer)
          .on('click', function () { FC.views.place.render(s.place.id); });
      });
    }
  }

  function fitToScope() {
    if (!map) return;
    var pts = located(state.level === 'world' ? lastStats : inScope())
      .map(function (s) { return [s.place.lat, s.place.lng]; });

    if (!pts.length) return;
    if (pts.length === 1) {
      map.setView(pts[0], state.level === 'city' ? 15 : 11);
    } else {
      map.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 15 });
    }
  }

  /* The tap-friendly companion list under the map — pins are fiddly on a phone. */
  function renderPanel() {
    var host = document.getElementById('map-panel');
    if (!host) return;
    FC.ui.clear(host);

    if (!lastStats.length) {
      host.appendChild(FC.ui.empty(
        'No places yet',
        'Log your first fried chicken and it will appear on the map.',
        el('button', {
          class: 'btn primary',
          onclick: function () { FC.app.goto('add'); }
        }, 'Add a place')
      ));
      return;
    }

    if (state.level === 'city') {
      var scope = inScope().sort(byOverall);
      host.appendChild(el('h3', { class: 'panel-title', text: FC.ui.plural(scope.length, 'place') + ' in ' + state.city }));
      scope.forEach(function (s) {
        host.appendChild(row(
          s.place.name,
          FC.ui.plural(s.visitCount, 'visit') + (s.avgPrice !== null ? ' · ' + FC.ui.fmtPrice(s.avgPrice) : ''),
          s.overall,
          function () { FC.views.place.render(s.place.id); }
        ));
      });
      return;
    }

    var level = state.level === 'world' ? 'world' : 'country';
    var groups = groupsFor(level);
    host.appendChild(el('h3', {
      class: 'panel-title',
      text: level === 'world' ? 'Countries' : 'Cities'
    }));
    groups.forEach(function (g) {
      host.appendChild(row(
        (level === 'world' ? g.sublabel + '  ' : '') + g.label,
        FC.ui.plural(g.placeCount, 'place') + ' · ' + FC.ui.plural(g.visitCount, 'visit'),
        g.overall,
        function () {
          go(level === 'world'
            ? { level: 'country', country: g.key, city: null }
            : { level: 'city', country: state.country, city: g.key });
        }
      ));
    });
  }

  function byOverall(a, b) {
    return (b.overall === null ? -1 : b.overall) - (a.overall === null ? -1 : a.overall);
  }

  function row(title, sub, score, onClick) {
    return el('button', { class: 'panel-row', onclick: onClick }, [
      el('span', { class: 'panel-row-main' }, [
        el('strong', { text: title }),
        el('span', { class: 'muted small', text: sub })
      ]),
      FC.ui.scoreChip(score)
    ]);
  }

  FC.views = FC.views || {};
  FC.views.map = { mount: mount, refresh: refresh };
})();
