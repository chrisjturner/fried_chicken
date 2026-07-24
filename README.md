# 🍗 Fried Chicken Index

A two-person fried chicken rating log. Score every visit on six metrics, see the
results on a drill-down world map, and sort the leaderboard however you like.

No build step, no framework, no npm — it's plain HTML, CSS and JavaScript. Open
`index.html` and it works.

## What's in it

**Log a visit** — search for the shop by name (it looks up real coordinates from
OpenStreetMap, so you don't type addresses), pick the date, drag six sliders,
add notes. Visiting somewhere you've already rated? Tap its chip and it attaches
a second visit to the same place rather than duplicating it.

**Map** — starts at the world, one pin per country carrying that country's
average. Tap a country to break it into cities, tap a city to see the individual
shops, tap a shop for its full scorecard. There's a tappable list under the map
at every level, because pins are fiddly on a phone.

**List** — every place ranked. Sort by overall, by any single metric, by price,
by most recent or most visited. Filter by country, city, or by which of you
rated it — that last one re-scores everything from just that person's visits, so
you can settle arguments properly.

## The metrics

| Metric | Weight | What it's asking |
|---|---|---|
| Crunch | 1.2 | Shatter vs sog |
| Juiciness | 1.2 | Is the meat dry? |
| Seasoning | 1.2 | Salt, spice, depth |
| Batter/Skin | 1.0 | Craggy, greasy, thin? |
| Sides & Sauce | 0.7 | Slaw, gravy, dips |
| Value | 0.7 | Worth the money? |

Each is 0–10 in half-point steps. **Overall** is the weighted average — the
things that make chicken good count more than the things around it.

Change any of this in [`js/config.js`](js/config.js): rename a metric, change a
weight, add a seventh, adjust the score bands that drive the colours. Existing
entries keep whatever they were scored on.

## Running it

Double-click `index.html`. That's genuinely it — it runs straight off the disk.

To use it on your phones and share data, put it online. Free option, using this
repo:

1. Push this folder to GitHub.
2. Repo → **Settings → Pages** → Source: `main`, folder `/ (root)`.
3. Open the URL it gives you on your phone → **Share → Add to Home Screen**.

It then behaves like an app: full screen, its own icon, and it still opens and
saves entries with no signal (they sync when you're back online).

## Sharing data between the two of you

Out of the box everything is stored in your own browser and goes nowhere. To
sync, both of you point the app at one free Supabase project:

1. Make a free project at [supabase.com](https://supabase.com).
2. **SQL Editor** → paste all of [`supabase-schema.sql`](supabase-schema.sql) →
   Run.
3. **Project Settings → API** → copy the **Project URL** and the **anon public**
   key.
4. In the app: **Settings → Shared sync** → paste both. Do this on every device,
   using the same two values.

After that it syncs on launch, after every save, and whenever you reopen the tab.
The badge in the top right shows the state — tap it to sync by hand.

### How the sync behaves

- Everything is written locally first, so the app never blocks on the network.
  Offline entries upload next time you're connected.
- Conflicts resolve last-write-wins per record. If you both edit the *same
  visit* at the same time, the later save wins. Editing different visits, or
  both adding visits to the same place, is always safe.
- Deletes are soft, so they propagate instead of reappearing from the other
  device.

### A note on the key

The anon key lets anyone holding it read and write your two tables — the app has
no login, which is what keeps it this simple. That's fine for a shared project
between two people, but treat the key like a password: don't commit it to a
public repo or paste it into a public page. Each of you enters it once in
Settings, where it stays in your own browser.

If you'd rather lock it down, turn on Supabase Auth and swap the `true` in the
policies at the bottom of `supabase-schema.sql` for `auth.uid() is not null`.

## Backups

**Settings → Your data** exports everything as JSON and imports it back. Import
merges rather than overwrites, so it doubles as a way to hand data to someone
who isn't set up with sync yet.

## Known rough edges

- **One currency.** Prices are all shown with the symbol in `js/config.js`
  (£ by default) — a $22 meal in New York displays as £22.00. Fine for
  comparing, wrong if you want real totals.
- **Small shops aren't always in OpenStreetMap.** If the search finds nothing,
  the last option in the result list adds the place by hand, and you can type
  the city and country yourself. It just won't have a map pin.
- **Places with no coordinates don't appear on the map** — they're still in the
  list and still count toward every average.
- **No photos yet.** Deliberate: images would need real file storage and would
  bloat the sync.

## Files

```
index.html              app shell
assets/styles.css       all styling
js/config.js            metrics, weights, score bands  ← tweak this
js/store.js             localStorage read/write + merge
js/score.js             score maths and aggregation
js/sync.js              Supabase two-way sync
js/geo.js               OpenStreetMap place lookup
js/ui.js                DOM helpers, toasts, bottom sheet
js/view-*.js            the four tabs + the place detail panel
js/app.js               routing and startup
sw.js                   offline cache
supabase-schema.sql     run this in Supabase
```
