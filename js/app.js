/* Wiring: tab routing, the sync indicator, and first-run setup. */
window.FC = window.FC || {};

(function () {
  var el = FC.ui.el;
  var current = null;

  var views = {
    map: { label: 'Map', icon: '🗺️' },
    list: { label: 'List', icon: '🏆' },
    add: { label: 'Add', icon: '➕' },
    settings: { label: 'Settings', icon: '⚙️' }
  };

  function goto(name) {
    if (!views[name]) name = 'map';
    current = name;

    document.querySelectorAll('.tab').forEach(function (t) {
      var active = t.dataset.view === name;
      t.classList.toggle('active', active);
      t.setAttribute('aria-current', active ? 'page' : 'false');
    });

    var container = document.getElementById('view');
    FC.views[name].mount(container);
    window.scrollTo(0, 0);

    if (location.hash !== '#' + name) {
      history.replaceState(null, '', '#' + name);
    }
  }

  /* Re-render whatever is on screen after the data changes underneath it. */
  function refresh() {
    if (current === 'map') FC.views.map.refresh();
    else if (current === 'list') FC.views.list.refresh();
    else if (current === 'settings') FC.views.settings.mount(document.getElementById('view'));
  }

  function renderTabs() {
    var nav = document.getElementById('tabs');
    FC.ui.clear(nav);
    Object.keys(views).forEach(function (key) {
      nav.appendChild(el('button', {
        class: 'tab',
        dataset: { view: key },
        onclick: function () {
          /* Tapping "Add" always starts a fresh entry unless one is in progress. */
          if (key === 'add' && current !== 'add') FC.views.add.open();
          else goto(key);
        }
      }, [
        el('span', { class: 'tab-icon', text: views[key].icon }),
        el('span', { class: 'tab-label', text: views[key].label })
      ]));
    });
  }

  function renderSyncBadge(status) {
    var badge = document.getElementById('sync-badge');
    if (!badge) return;
    if (!FC.sync.configured()) {
      badge.className = 'sync-badge local';
      badge.textContent = 'local only';
      badge.title = 'Set up sync in Settings to share with a friend';
      return;
    }
    var map = {
      syncing: ['syncing', 'syncing…'],
      synced: ['ok', 'synced'],
      error: ['err', 'offline']
    };
    var s = map[status] || ['ok', 'synced'];
    badge.className = 'sync-badge ' + s[0];
    badge.textContent = s[1];
  }

  function start() {
    renderTabs();

    document.getElementById('sheet-close').addEventListener('click', FC.ui.closeSheet);
    document.getElementById('sheet-backdrop').addEventListener('click', FC.ui.closeSheet);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') FC.ui.closeSheet();
    });

    document.getElementById('sync-badge').addEventListener('click', function () {
      if (!FC.sync.configured()) { goto('settings'); return; }
      FC.sync.sync().then(refresh).catch(function () { /* toast shown */ });
    });

    FC.sync.onChange(function (status) {
      renderSyncBadge(status);
      if (status === 'synced') refresh();
    });
    renderSyncBadge();

    var initial = (location.hash || '').replace('#', '');
    goto(views[initial] ? initial : 'map');

    /* Pull anything the other person added while we were away. */
    if (FC.sync.configured()) {
      FC.sync.sync({ quiet: true }).catch(function () { /* offline is fine */ });
    }

    /* And again whenever we come back to the tab or regain connectivity. */
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) FC.sync.nudge();
    });
    window.addEventListener('online', function () { FC.sync.nudge(); });

    registerServiceWorker();
  }

  /* Offline shell, so the form still opens in a signal-free chicken shop.
     Only available over http(s) — skipped when opened straight off the disk. */
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
    navigator.serviceWorker.register('sw.js').catch(function (err) {
      console.warn('Service worker not registered:', err);
    });
  }

  FC.app = { goto: goto, refresh: refresh, start: start };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
