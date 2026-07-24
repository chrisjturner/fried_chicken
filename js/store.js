/* Local data layer. Everything lives in localStorage and is the source of truth
   for rendering; sync.js reconciles it with Supabase when configured.
   Records are never hard-deleted locally so deletions can propagate. */
window.FC = window.FC || {};

(function () {
  var KEYS = {
    places: 'fc.places',
    visits: 'fc.visits',
    settings: 'fc.settings'
  };

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      console.warn('Could not read', key, err);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.error('Could not write', key, err);
      FC.ui && FC.ui.toast('Storage full — data not saved', 'error');
    }
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function now() {
    return new Date().toISOString();
  }

  var store = {
    uuid: uuid,
    now: now,

    /* ---------- settings ---------- */

    settings: function () {
      return read(KEYS.settings, {
        rater: '',
        supabaseUrl: '',
        supabaseKey: '',
        autoSync: true
      });
    },

    saveSettings: function (patch) {
      var next = Object.assign(store.settings(), patch);
      write(KEYS.settings, next);
      return next;
    },

    /* ---------- places ---------- */

    allPlaces: function () {
      return read(KEYS.places, []);
    },

    places: function () {
      return store.allPlaces().filter(function (p) { return !p.deleted; });
    },

    place: function (id) {
      return store.allPlaces().filter(function (p) { return p.id === id; })[0] || null;
    },

    savePlace: function (place) {
      var all = store.allPlaces();
      var next = Object.assign({}, place);
      if (!next.id) next.id = uuid();
      if (!next.created_at) next.created_at = now();
      next.updated_at = now();
      if (next.deleted === undefined) next.deleted = false;

      var idx = all.findIndex(function (p) { return p.id === next.id; });
      if (idx === -1) all.push(next); else all[idx] = next;
      write(KEYS.places, all);
      return next;
    },

    deletePlace: function (id) {
      var place = store.place(id);
      if (!place) return;
      store.savePlace(Object.assign({}, place, { deleted: true }));
      /* Orphan the visits too, so they stop counting toward anything. */
      store.visitsForPlace(id).forEach(function (v) {
        store.saveVisit(Object.assign({}, v, { deleted: true }));
      });
    },

    /* Find an existing place by name+city so repeat visits don't duplicate it. */
    findPlace: function (name, city) {
      var n = (name || '').trim().toLowerCase();
      var c = (city || '').trim().toLowerCase();
      return store.places().filter(function (p) {
        return p.name.trim().toLowerCase() === n &&
               (p.city || '').trim().toLowerCase() === c;
      })[0] || null;
    },

    /* ---------- visits ---------- */

    allVisits: function () {
      return read(KEYS.visits, []);
    },

    visits: function () {
      return store.allVisits().filter(function (v) { return !v.deleted; });
    },

    visit: function (id) {
      return store.allVisits().filter(function (v) { return v.id === id; })[0] || null;
    },

    visitsForPlace: function (placeId) {
      return store.visits()
        .filter(function (v) { return v.place_id === placeId; })
        .sort(function (a, b) { return (b.visit_date || '').localeCompare(a.visit_date || ''); });
    },

    saveVisit: function (visit) {
      var all = store.allVisits();
      var next = Object.assign({}, visit);
      if (!next.id) next.id = uuid();
      if (!next.created_at) next.created_at = now();
      next.updated_at = now();
      if (next.deleted === undefined) next.deleted = false;

      var idx = all.findIndex(function (v) { return v.id === next.id; });
      if (idx === -1) all.push(next); else all[idx] = next;
      write(KEYS.visits, all);
      return next;
    },

    deleteVisit: function (id) {
      var visit = store.visit(id);
      if (!visit) return;
      store.saveVisit(Object.assign({}, visit, { deleted: true }));
    },

    /* ---------- bulk (used by sync + import/export) ---------- */

    replaceAll: function (places, visits) {
      write(KEYS.places, places);
      write(KEYS.visits, visits);
    },

    exportJson: function () {
      return JSON.stringify({
        version: 1,
        exported_at: now(),
        places: store.allPlaces(),
        visits: store.allVisits()
      }, null, 2);
    },

    /* Merge an imported dump in rather than clobbering — last write wins. */
    importJson: function (json) {
      var data = JSON.parse(json);
      if (!data || !Array.isArray(data.places) || !Array.isArray(data.visits)) {
        throw new Error('That file does not look like a Fried Chicken Index export.');
      }
      var places = FC.merge(store.allPlaces(), data.places);
      var visits = FC.merge(store.allVisits(), data.visits);
      store.replaceAll(places, visits);
      return { places: data.places.length, visits: data.visits.length };
    }
  };

  /* Last-write-wins merge of two record lists, keyed by id. */
  FC.merge = function (mine, theirs) {
    var byId = {};
    mine.forEach(function (r) { byId[r.id] = r; });
    theirs.forEach(function (r) {
      var existing = byId[r.id];
      if (!existing || (r.updated_at || '') > (existing.updated_at || '')) {
        byId[r.id] = r;
      }
    });
    return Object.keys(byId).map(function (k) { return byId[k]; });
  };

  FC.store = store;
})();
