/* Settings: your name, the shared Supabase connection, and import/export. */
window.FC = window.FC || {};

(function () {
  var el = FC.ui.el;

  function mount(container) {
    FC.ui.clear(container);
    var s = FC.store.settings();

    container.appendChild(el('div', { class: 'form-wrap' }, [
      el('h2', { class: 'view-title', text: 'Settings' }),

      el('section', { class: 'card' }, [
        el('h3', { class: 'card-title', text: 'You' }),
        field('Your name', s.rater, 'Shown against every visit you log', function (v) {
          FC.store.saveSettings({ rater: v.trim() });
        })
      ]),

      syncCard(s),
      dataCard(),

      el('section', { class: 'card' }, [
        el('h3', { class: 'card-title', text: 'How scoring works' }),
        el('p', { class: 'hint', text: 'Overall is a weighted average of the six metrics. Weights live in js/config.js if you want to change them.' })
      ].concat(FC.config.metrics.map(function (m) {
        return el('div', { class: 'metric-row' }, [
          el('span', { class: 'metric-label', text: m.label }),
          el('span', { class: 'muted small', text: m.hint }),
          el('span', { class: 'metric-value', text: '×' + m.weight })
        ]);
      })))
    ]));
  }

  function field(label, value, hint, onCommit, opts) {
    opts = opts || {};
    return el('label', { class: 'field' }, [
      el('span', { class: 'field-label', text: label }),
      el('input', {
        class: 'input',
        type: opts.type || 'text',
        value: value || '',
        placeholder: opts.placeholder || '',
        autocomplete: 'off',
        spellcheck: 'false',
        onchange: function (e) { onCommit(e.target.value); }
      }),
      hint ? el('span', { class: 'hint', text: hint }) : null
    ]);
  }

  function syncCard(s) {
    var status = el('p', { class: 'sync-status' });

    function paint() {
      var cur = FC.store.settings();
      if (!FC.sync.configured()) {
        status.className = 'sync-status muted small';
        status.textContent = 'Not connected — data stays on this device only.';
      } else {
        status.className = 'sync-status small ok';
        status.textContent = 'Connected' +
          (cur.lastSync ? ' · last synced ' + new Date(cur.lastSync).toLocaleString() : '');
      }
    }
    paint();

    return el('section', { class: 'card' }, [
      el('h3', { class: 'card-title', text: 'Shared sync' }),
      el('p', { class: 'hint', text: 'Paste the same two values on both phones and the laptop, and every entry syncs between you. Setup instructions are in README.md.' }),
      status,
      field('Supabase project URL', s.supabaseUrl, 'e.g. https://abcdefgh.supabase.co', function (v) {
        FC.store.saveSettings({ supabaseUrl: v.trim() });
        paint();
      }, { placeholder: 'https://xxxx.supabase.co' }),
      field('Supabase anon key', s.supabaseKey, 'The public "anon" key from Project Settings → API', function (v) {
        FC.store.saveSettings({ supabaseKey: v.trim() });
        paint();
      }, { placeholder: 'eyJhbGciOi...' }),
      el('label', { class: 'checkbox' }, [
        el('input', {
          type: 'checkbox',
          checked: s.autoSync !== false,
          onchange: function (e) { FC.store.saveSettings({ autoSync: e.target.checked }); }
        }),
        el('span', { text: 'Sync automatically after every change' })
      ]),
      el('div', { class: 'row gap' }, [
        el('button', {
          class: 'btn primary',
          onclick: function (e) {
            var btn = e.target;
            btn.disabled = true;
            btn.textContent = 'Syncing…';
            FC.sync.sync().then(function () {
              FC.app.refresh();
            }).catch(function () { /* toast already shown */ })
              .then(function () {
                btn.disabled = false;
                btn.textContent = 'Sync now';
                paint();
              });
          }
        }, 'Sync now')
      ])
    ]);
  }

  function dataCard() {
    var fileInput = el('input', {
      type: 'file',
      accept: 'application/json',
      class: 'hidden-file',
      onchange: function (e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var res = FC.store.importJson(reader.result);
            FC.app.refresh();
            FC.ui.toast('Imported ' + res.places + ' places, ' + res.visits + ' visits');
          } catch (err) {
            FC.ui.toast(err.message, 'error');
          }
        };
        reader.readAsText(file);
        e.target.value = '';
      }
    });

    var counts = FC.store.places().length + ' places · ' + FC.store.visits().length + ' visits';

    return el('section', { class: 'card' }, [
      el('h3', { class: 'card-title', text: 'Your data' }),
      el('p', { class: 'hint', text: counts + ' stored on this device.' }),
      el('div', { class: 'row gap wrap' }, [
        el('button', { class: 'btn ghost', onclick: exportFile }, 'Export JSON'),
        el('button', {
          class: 'btn ghost',
          onclick: function () { fileInput.click(); }
        }, 'Import JSON'),
        el('button', {
          class: 'btn ghost danger-text',
          onclick: function () {
            FC.ui.confirm('Erase all local data on this device? If sync is set up you can pull it back.', 'Erase')
              .then(function (ok) {
                if (!ok) return;
                FC.store.replaceAll([], []);
                FC.app.refresh();
                FC.ui.toast('Local data cleared');
              });
          }
        }, 'Clear local data')
      ]),
      fileInput
    ]);
  }

  function exportFile() {
    var blob = new Blob([FC.store.exportJson()], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'fried-chicken-index-' + FC.ui.today() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  FC.views = FC.views || {};
  FC.views.settings = { mount: mount };
})();
