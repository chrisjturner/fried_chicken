/* Small shared UI helpers: DOM building, toasts, the bottom sheet, formatters. */
window.FC = window.FC || {};

(function () {
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === 'dataset') {
        Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
      } else {
        node.setAttribute(k, v === true ? '' : v);
      }
    });
    (Array.isArray(children) ? children : children ? [children] : [])
      .forEach(function (child) {
        if (child === null || child === undefined || child === false) return;
        node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
      });
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  var toastTimer = null;
  function toast(message, kind) {
    var host = document.getElementById('toast');
    if (!host) return;
    host.textContent = message;
    host.className = 'toast show' + (kind ? ' toast-' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { host.className = 'toast'; }, 3600);
  }

  /* ---------- formatters ---------- */

  function fmtScore(n) {
    return (n === null || n === undefined) ? '–' : n.toFixed(1);
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
    if (isNaN(d)) return iso;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function fmtPrice(n) {
    if (n === null || n === undefined || isNaN(n)) return '';
    return FC.config.currency + n.toFixed(2);
  }

  function today() {
    var d = new Date();
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function plural(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  /* Flag emoji from an ISO-3166 alpha-2 code. */
  function flag(code) {
    if (!code || code.length !== 2) return '🌍';
    return String.fromCodePoint.apply(null, code.toUpperCase().split('').map(function (c) {
      return 0x1f1e6 + c.charCodeAt(0) - 65;
    }));
  }

  /* ---------- components ---------- */

  function scoreChip(score, opts) {
    opts = opts || {};
    var band = FC.score.band(score);
    return el('span', {
      class: 'chip ' + band.class + (opts.large ? ' chip-lg' : ''),
      title: band.label
    }, fmtScore(score));
  }

  function metricBar(metric, value) {
    var pct = value === null || value === undefined
      ? 0
      : Math.max(0, Math.min(100, (value / FC.config.scale.max) * 100));
    return el('div', { class: 'metric-row' }, [
      el('span', { class: 'metric-label', text: metric.label }),
      el('span', { class: 'metric-track' }, [
        el('span', {
          class: 'metric-fill ' + FC.score.band(value).class,
          style: 'width:' + pct + '%'
        })
      ]),
      el('span', { class: 'metric-value', text: fmtScore(value) })
    ]);
  }

  function empty(title, body, action) {
    return el('div', { class: 'empty' }, [
      el('div', { class: 'empty-art', text: '🍗' }),
      el('h3', { text: title }),
      el('p', { text: body }),
      action || null
    ]);
  }

  /* ---------- bottom sheet (place detail, confirmations) ---------- */

  var sheetEl, sheetBody, sheetOnClose;

  function sheet(contentNode, opts) {
    opts = opts || {};
    sheetEl = document.getElementById('sheet');
    sheetBody = document.getElementById('sheet-body');
    clear(sheetBody).appendChild(contentNode);
    sheetEl.classList.add('open');
    sheetEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('sheet-open');
    sheetOnClose = opts.onClose || null;
  }

  function closeSheet() {
    sheetEl = sheetEl || document.getElementById('sheet');
    if (!sheetEl || !sheetEl.classList.contains('open')) return;
    sheetEl.classList.remove('open');
    sheetEl.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('sheet-open');
    if (sheetOnClose) sheetOnClose();
    sheetOnClose = null;
  }

  function confirm(message, confirmLabel) {
    return new Promise(function (resolve) {
      /* closeSheet() fires onClose, which would resolve `false` and beat the
         real choice. Guard so the first settle wins: a Delete tap resolves
         `true` before closeSheet's onClose can overwrite it. */
      var settled = false;
      var settle = function (val) {
        if (settled) return;
        settled = true;
        resolve(val);
      };
      var done = function (val) { settle(val); closeSheet(); };
      sheet(el('div', { class: 'confirm' }, [
        el('p', { text: message }),
        el('div', { class: 'row gap' }, [
          el('button', { class: 'btn ghost', onclick: function () { done(false); } }, 'Cancel'),
          el('button', { class: 'btn danger', onclick: function () { done(true); } },
            confirmLabel || 'Delete')
        ])
      ]), { onClose: function () { settle(false); } });
    });
  }

  FC.ui = {
    el: el,
    clear: clear,
    toast: toast,
    fmtScore: fmtScore,
    fmtDate: fmtDate,
    fmtPrice: fmtPrice,
    today: today,
    plural: plural,
    flag: flag,
    scoreChip: scoreChip,
    metricBar: metricBar,
    empty: empty,
    sheet: sheet,
    closeSheet: closeSheet,
    confirm: confirm
  };
})();
