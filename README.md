# VocabSync

A minimal vocabulary notebook. Words live in a Google Spreadsheet, so the same
list appears on every device. No server of your own, no build step, no fees.

The home screen is a grid of folders, each of which can carry a photo. Inside a
folder the words are listed by themselves; tap one for its part of speech,
definition and note, or switch to **reel** and meet them one screen at a time
in random order.

## How it fits together

```
Browser  ──►  Apps Script Web App  ──►  Google Spreadsheet
static files       free API layer          the actual data
```

The spreadsheet is the source of truth. The browser keeps a local copy so the
app opens instantly and still works offline, but that copy can be evicted by
the OS at any time and is never treated as authoritative.

## Setup

### 1. Spreadsheet and backend

1. Create a Google Spreadsheet.
2. **Extensions → Apps Script**, and replace the default `Code.gs` with
   [`apps-script/Code.gs`](apps-script/Code.gs).
3. Change `PASSPHRASE` at the top to something long and random — **in the
   Apps Script editor only**. The copy in this repository is public, so the
   real passphrase must never be written into it. Leave the placeholder where
   it is.
4. Run `setup()` once from the editor and approve the permission prompt.
   Run it again after any future update to this file: it adds new columns to
   an existing sheet without disturbing the rows already in it.
5. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Copy the `/exec` URL.

### 2. Publish the front end

Push this folder to a public GitHub repository and enable **Settings → Pages →
Deploy from a branch**. Nothing needs to be configured or compiled.

### 3. Connect

Open the site. It asks for the Web App URL and the passphrase, verifies them
against the sheet, and stores them on the device.

Afterwards the same sheet is reachable from the control at the top of the
screen, as **Connection**: point the device at a different deployment,
re-enter the passphrase after changing it in `Code.gs`, or disconnect
entirely. Disconnecting clears both values from that device; the words stay in
the spreadsheet.

If the app reports that Apps Script is out of date, the deployment predates a
column the app is already using — colours, for instance, get written nowhere.
Paste the current `Code.gs`, run `setup()`, and deploy a **new version** of the
existing deployment.

Every device does this once. On iOS a page opened in Safari and the same page
launched from the Home Screen have **separate storage**, so each one needs its
own connection.

## Adding it to the iOS Home Screen

Open the site in Safari, tap Share, then **Add to Home Screen**. It then runs
full screen with no browser chrome, and gets its own icon.

Deleting the icon deletes the local cache with it. Nothing is lost — the words
are in the spreadsheet — but the app has to be connected again.

## What is in the sheet

One row per word, in a tab called `Words`:

| Column | Field | Notes |
|---|---|---|
| A | `id` | UUID, generated server-side |
| B | `word` | |
| C | `pos` | Verb / Adj / Adv / Noun / Idiom / Expression |
| D | `definition` | |
| E | `note` | |
| F | `createdAt` | ISO 8601 |
| G | `updatedAt` | ISO 8601 |
| H | `color` | `default`, `blue`, `green`, `orange`, `red`, `grey`, `purple` |
| I | `folder` | Folder name, or blank for unsorted |

`color` is one of sixteen keys — `default` plus fifteen hues. The key is what
is stored, never a hex value, so the same word picks the shade pitched for the
device's current theme.

A second tab, `Folders`, is the register of folder names — `id`, `name`,
`createdAt`, `photo`. The photo is a JPEG data URL: the app crops it square,
scales it to 320px and steps the quality down until it fits, because a cell
holds at most 50,000 characters. It is a thumbnail by design, not an archive
of the original. It exists so a folder you make on one device shows up on another
before it has any words in it. Words point at their folder by **name**, which
keeps the sheet readable by eye; renaming a folder rewrites the column.

New fields are always appended on the right. Inserting one in the middle would
shift every existing row's data into the wrong column.

`color` and `folder` both arrived after the first release. Running `setup()`
again appends the headers to an existing sheet without touching any row; words
saved before the upgrade read back with no colour, which is the default, and
`setup()` files every word that has no folder into **TOPS2026**. That step only
ever fills blanks, so it is safe to run more than once.

Dragging a word leftwards in a list moves it to a folder called **Archive**,
made on first use. It is an ordinary folder — it shows up on the grid and a
word comes back out of it the same way anything else is moved — so nothing is
ever destroyed by the gesture. Leftwards only: a rightward drag anywhere in a
folder already means "back to the grid".

Deleting a folder does not delete its words. They lose the folder name and
gather under **Unsorted**, which appears on the grid only when something is
actually in it. The colour changes the
word's own type only — never the definition, the note, or the part-of-speech
badge — and the stored value is the key rather than a hex code, so the same
word picks the right shade in light and dark.

## Updating the code

After changing any file, bump `CACHE_VERSION` in [`sw.js`](sw.js) before
pushing. Without that, devices keep serving the old version out of cache
forever.

The worker updates itself: on the next visit it caches the new shell, takes
over, and the page reloads once. There is nothing to accept.

Two rules in `sw.js` exist because breaking either one bricks the app:

- **The page and its modules must come from one cache generation.** Serving
  fresh HTML from the network while the scripts still come from the previous
  cache pairs new markup with old code, and the old code reaches for elements
  that no longer exist.
- **The updater must survive a broken release.** `start()` in
  [`js/app.js`](js/app.js) registers the worker outside the try/catch that
  wraps the interface, so the code that fetches the fix is never the code that
  just crashed.

To change `Code.gs`: **Deploy → Manage deployments →** edit the existing entry
→ Version: **New version**. That keeps the same URL. Picking "New deployment"
mints a different URL and every device would need reconnecting.

## What you should know about the security model

The deployment is published as "Anyone", which is the only setting that lets a
static page reach it. Apps Script cannot read request headers, so restricting
by domain is impossible. **The passphrase is the only thing protecting the
sheet.** Make it long, and do not put anything sensitive in there.

Leaving `DEFAULT_API_URL` empty in [`js/config.js`](js/config.js) is
deliberate: the deployment URL then never appears in the public repository at
all. Filling it in trades that for one less field during setup.

## Files

| Path | Purpose |
|---|---|
| `index.html` | Markup. No inline styles or scripts. |
| `css/theme.css` | Tokens, light/dark palette, base resets. |
| `css/layout.css` | App shell, header, word list. |
| `css/components.css` | Dialogs, forms, buttons, banners. |
| `css/animations.css` | All motion, plus the reduced-motion escape hatch. |
| `js/config.js` | Constants. |
| `js/storage.js` | Guarded localStorage wrapper. |
| `js/auth.js` | Device-local credentials. |
| `js/api.js` | Transport to Apps Script. |
| `js/store.js` | State, cache, offline outbox. |
| `js/dialog.js` | Animated open/close for `<dialog>`. |
| `js/swipe.js` | Swipe a sheet down to dismiss it. |
| `js/scroll-lock.js` | Freezes the list behind an open dialog. |
| `js/picker.js` | The app's own option list, replacing `<select>`. |
| `js/confirm.js` | Centred confirmation popup. |
| `js/toast.js` | Transient messages. |
| `js/sort.js` | List ordering and the header control. |
| `js/view.js` | Which screen is showing: the grid, or one folder. |
| `js/folder-grid.js` | The folder grid — two interlocking columns. |
| `js/folder-form.js` | Naming a folder, for create and rename. |
| `js/list.js` | The word list inside a folder. |
| `js/reel.js` | One word per screen, shuffled. |
| `js/swipe-row.js` | Drag a word leftwards to archive it. |
| `js/photo.js` | Shrinks a picked image to fit a spreadsheet cell. |
| `js/fit-text.js` | Shrinks a folder name until it fits on one line. |
| `js/nav-swipe.js` | Swipe right to leave a folder. |
| `js/detail.js` | Detail dialog. |
| `js/form.js` | Add / edit form. |
| `js/setup.js` | First-run connection sheet. |
| `js/install-hint.js` | iOS Add-to-Home-Screen nudge. |
| `js/app.js` | Bootstrap and wiring. |
| `sw.js` | Offline shell. Bump `CACHE_VERSION` on release. |
| `manifest.json` | PWA metadata. |
| `icons/icon.svg` | Source of the mark. |
| `apps-script/Code.gs` | Backend. Not served — paste into Apps Script. |

## Replacing the icon

`icons/icon.svg` is the source. iOS ignores SVG for Home Screen icons, so PNGs
at 180, 192 and 512 px are also required. Any converter works; keep the same
filenames and the background opaque, since iOS applies its own rounded mask.

## Running it locally

```
python3 -m http.server 8765
```

Then open `http://localhost:8765`. Modules and service workers need a real
origin, so opening `index.html` from the file system will not work.
