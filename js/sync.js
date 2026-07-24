/* Optional two-way sync with Supabase over its REST API.
   Strategy: pull everything, last-write-wins merge against local, push the
   winners back. Row counts here are tiny (tens to hundreds), so a full-table
   sync is simpler and safer than tracking deltas. */
window.FC = window.FC || {};

(function () {
  var syncing = false;
  var listeners = [];

  function settings() {
    return FC.store.settings();
  }

  function configured() {
    var s = settings();
    return !!(s.supabaseUrl && s.supabaseKey);
  }

  function headers(extra) {
    var s = settings();
    return Object.assign({
      'apikey': s.supabaseKey,
      'Authorization': 'Bearer ' + s.supabaseKey,
      'Content-Type': 'application/json'
    }, extra || {});
  }

  function base() {
    return settings().supabaseUrl.replace(/\/+$/, '') + '/rest/v1';
  }

  function request(path, options) {
    return fetch(base() + path, options).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (body) {
          throw new Error('Supabase ' + res.status + ': ' + body.slice(0, 300));
        });
      }
      return res.status === 204 ? null : res.json();
    });
  }

  function pull(table) {
    return request('/' + table + '?select=*', { headers: headers() });
  }

  function push(table, rows) {
    if (!rows.length) return Promise.resolve(null);
    /* Chunk so a big first upload doesn't hit request size limits. */
    var chunks = [];
    for (var i = 0; i < rows.length; i += 100) chunks.push(rows.slice(i, i + 100));
    return chunks.reduce(function (chain, chunk) {
      return chain.then(function () {
        return request('/' + table + '?on_conflict=id', {
          method: 'POST',
          headers: headers({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
          body: JSON.stringify(chunk)
        });
      });
    }, Promise.resolve());
  }

  /* Rows that local has and remote is missing or stale on. */
  function outbound(local, remote) {
    var byId = {};
    remote.forEach(function (r) { byId[r.id] = r; });
    return local.filter(function (l) {
      var r = byId[l.id];
      return !r || (l.updated_at || '') > (r.updated_at || '');
    });
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  function emit(status, detail) {
    listeners.forEach(function (fn) { fn(status, detail); });
  }

  /* Run a full sync. Resolves with a summary; rejects with a human-readable error. */
  function sync(opts) {
    opts = opts || {};
    if (!configured()) {
      return Promise.reject(new Error('Sync is not set up yet — add your Supabase details in Settings.'));
    }
    if (syncing) return Promise.reject(new Error('Already syncing.'));

    syncing = true;
    emit('syncing');

    var localPlaces = FC.store.allPlaces();
    var localVisits = FC.store.allVisits();

    return Promise.all([pull('places'), pull('visits')])
      .then(function (res) {
        var remotePlaces = res[0] || [];
        var remoteVisits = res[1] || [];

        var mergedPlaces = FC.merge(localPlaces, remotePlaces);
        var mergedVisits = FC.merge(localVisits, remoteVisits);

        FC.store.replaceAll(mergedPlaces, mergedVisits);

        var pushPlaces = outbound(mergedPlaces, remotePlaces);
        var pushVisits = outbound(mergedVisits, remoteVisits);

        /* Places first — visits carry a foreign key to them. */
        return push('places', pushPlaces)
          .then(function () { return push('visits', pushVisits); })
          .then(function () {
            return {
              pulled: remotePlaces.length + remoteVisits.length,
              pushed: pushPlaces.length + pushVisits.length
            };
          });
      })
      .then(function (summary) {
        syncing = false;
        FC.store.saveSettings({ lastSync: FC.store.now() });
        emit('synced', summary);
        if (!opts.quiet) {
          FC.ui.toast('Synced — ' + summary.pushed + ' up, ' + summary.pulled + ' down');
        }
        return summary;
      })
      .catch(function (err) {
        syncing = false;
        emit('error', err);
        if (!opts.quiet) FC.ui.toast(friendly(err), 'error');
        throw err;
      });
  }

  function friendly(err) {
    var msg = String(err && err.message || err);
    if (/Failed to fetch|NetworkError/i.test(msg)) {
      return 'Offline — changes are saved locally and will sync later.';
    }
    if (/401|JWT|apikey/i.test(msg)) {
      return 'Supabase rejected the key — check it in Settings.';
    }
    if (/relation .* does not exist|42P01/i.test(msg)) {
      return 'Tables missing — run supabase-schema.sql in the Supabase SQL editor.';
    }
    return msg;
  }

  /* Fire-and-forget sync after a local change; silent on failure. */
  function nudge() {
    var s = settings();
    if (!configured() || s.autoSync === false || syncing) return;
    sync({ quiet: true }).catch(function () { /* offline is fine */ });
  }

  FC.sync = {
    sync: sync,
    nudge: nudge,
    configured: configured,
    onChange: onChange,
    isSyncing: function () { return syncing; },
    friendly: friendly
  };
})();
