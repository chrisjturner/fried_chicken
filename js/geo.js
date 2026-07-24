/* Place lookup via OpenStreetMap's Nominatim — no API key, no account.
   Used by the add form so a place gets coordinates, city and country from one
   search box instead of four fields typed on a phone. */
window.FC = window.FC || {};

(function () {
  var ENDPOINT = 'https://nominatim.openstreetmap.org/search';
  var REVERSE = 'https://nominatim.openstreetmap.org/reverse';
  var cache = {};
  var lastCall = 0;

  /* Nominatim asks for max 1 request/second. Space calls out rather than
     hammering it while someone types. */
  function throttle() {
    var wait = Math.max(0, 1100 - (Date.now() - lastCall));
    lastCall = Date.now() + wait;
    return new Promise(function (resolve) { setTimeout(resolve, wait); });
  }

  function cityOf(address) {
    if (!address) return '';
    var city = address.city || address.town || address.village || address.suburb ||
               address.municipality || address.county || address.state || '';
    /* OSM labels several metro counties "Greater X"; group them under X so the
       map reads "London" rather than "Greater London". */
    return city.replace(/^Greater\s+/i, '');
  }

  function toResult(item) {
    var a = item.address || {};
    /* Nominatim puts the venue name in `name` for POIs; fall back to the first
       chunk of the display name. */
    var name = item.name || (item.display_name || '').split(',')[0];
    var streetBits = [a.house_number, a.road].filter(Boolean).join(' ');
    /* Include the suburb — it is what tells two branches of the same chain apart. */
    return {
      name: name,
      address: [streetBits, a.suburb, a.postcode].filter(Boolean).join(', ') ||
               (item.display_name || '').split(',').slice(1, 3).join(',').trim(),
      display_name: item.display_name,
      city: cityOf(a),
      country: a.country || '',
      country_code: (a.country_code || '').toUpperCase(),
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon)
    };
  }

  function query(params) {
    var url = ENDPOINT + '?format=jsonv2&addressdetails=1&' + params;
    return throttle()
      .then(function () { return fetch(url, { headers: { 'Accept': 'application/json' } }); })
      .then(function (res) {
        if (!res.ok) throw new Error('Lookup failed (' + res.status + ')');
        return res.json();
      })
      .then(function (items) {
        return (items || []).map(toResult).filter(function (r) {
          return !isNaN(r.lat) && !isNaN(r.lng);
        });
      });
  }

  /* Nominatim resolves "<shop>, <city>" but usually not "<shop>, <suburb>".
     Split the query so the area can be geocoded separately and used to bias
     the shop search — "Morleys, Peckham" finds nothing, "Morleys" near
     Peckham's coordinates finds plenty. */
  function splitQuery(q) {
    if (q.indexOf(',') !== -1) {
      var parts = q.split(',');
      return { name: parts.shift().trim(), area: parts.join(',').trim() };
    }
    var words = q.split(/\s+/);
    if (words.length < 2) return null;
    return { name: words.slice(0, -1).join(' '), area: words[words.length - 1] };
  }

  function nearArea(name, area) {
    return query('limit=1&q=' + encodeURIComponent(area)).then(function (places) {
      if (!places.length) return [];
      var lat = places[0].lat;
      var lng = places[0].lng;
      var d = 0.09; /* roughly a 10km box — a sane "same part of town" radius */
      var viewbox = [lng - d, lat + d, lng + d, lat - d].join(',');
      return query('limit=8&bounded=1&viewbox=' + viewbox + '&q=' + encodeURIComponent(name));
    });
  }

  function search(raw) {
    var q = (raw || '').trim();
    if (q.length < 3) return Promise.resolve([]);
    if (cache[q]) return Promise.resolve(cache[q]);

    return query('limit=8&q=' + encodeURIComponent(q))
      .then(function (results) {
        if (results.length) return results;

        /* Nothing matched the phrase as written — try name-near-area. */
        var split = splitQuery(q);
        return split ? nearArea(split.name, split.area) : [];
      })
      .then(function (results) {
        cache[q] = results;
        return results;
      });
  }

  /* Turn a dropped pin / device location into city + country. */
  function reverse(lat, lng) {
    var url = REVERSE + '?format=jsonv2&addressdetails=1&lat=' + lat + '&lon=' + lng;
    return throttle()
      .then(function () { return fetch(url, { headers: { 'Accept': 'application/json' } }); })
      .then(function (res) {
        if (!res.ok) throw new Error('Lookup failed (' + res.status + ')');
        return res.json();
      })
      .then(function (item) {
        var r = toResult(item);
        r.lat = lat;
        r.lng = lng;
        return r;
      });
  }

  function locate() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) {
        reject(new Error('This device has no location support.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        function (pos) { resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
        function (err) {
          reject(new Error(err.code === 1
            ? 'Location permission denied.'
            : 'Could not get your location.'));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  FC.geo = { search: search, reverse: reverse, locate: locate };
})();
