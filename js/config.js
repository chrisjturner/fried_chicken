/* Tunable bits of the app live here. Change a weight, get a different leaderboard. */
window.FC = window.FC || {};

FC.config = {
  appName: 'Fried Chicken Index',

  /* The metrics scored on every visit. Order here is the order everywhere else.
     `weight` feeds the overall score; `hint` shows under the slider on mobile. */
  metrics: [
    { key: 'crunch',    label: 'Crunch',      weight: 1.2, hint: 'Shatter vs sog' },
    { key: 'juiciness', label: 'Juiciness',   weight: 1.2, hint: 'Is the meat dry?' },
    { key: 'seasoning', label: 'Seasoning',   weight: 1.2, hint: 'Salt, spice, depth' },
    { key: 'batter',    label: 'Batter/Skin', weight: 1.0, hint: 'Craggy, greasy, thin?' },
    { key: 'sides',     label: 'Sides & Sauce', weight: 0.7, hint: 'Slaw, gravy, dips' },
    { key: 'value',     label: 'Value',       weight: 0.7, hint: 'Worth the money?' }
  ],

  scale: { min: 0, max: 10, step: 0.5, default: 5 },

  /* Score bands drive the colour coding of pins, chips and bars. */
  bands: [
    { min: 8.5, label: 'Elite',      class: 'band-elite' },
    { min: 7.0, label: 'Very good',  class: 'band-good' },
    { min: 5.5, label: 'Decent',     class: 'band-ok' },
    { min: 3.5, label: 'Poor',       class: 'band-poor' },
    { min: -1,  label: 'Avoid',      class: 'band-bad' }
  ],

  /* Fallback currency symbol for the price field. */
  currency: '£'
};

FC.config.metricByKey = FC.config.metrics.reduce(function (acc, m) {
  acc[m.key] = m;
  return acc;
}, {});
