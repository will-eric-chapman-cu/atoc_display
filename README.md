# ATOC Lobby Display

A one-page kiosk slideshow for the monitor in the ATOC entrance. It cycles through
live satellite imagery, Colorado radar, our own campus weather station, current
conditions, research highlights, the colloquium schedule, and department notices —
25 seconds each, forever, with no clicking.

It is plain HTML/CSS/JS on GitHub Pages. No build step, no server, no accounts, no
cost. Once it is running, the only thing anyone ever has to touch is `content.json`.

---

## 1. Put it online (about five minutes)

1. On github.com, create a new **public** repository. Name it `atoc_display`.
2. Upload every file in this folder (`index.html`, `content.json`, `README.md`,
   `.nojekyll`, and the `assets/` folder). Drag-and-drop into the web uploader works.
3. Go to **Settings → Pages**. Under *Build and deployment*, set **Source** to
   *Deploy from a branch*, branch `main`, folder `/ (root)`. Save.
4. Wait a minute, then open:

   **https://will-eric-chapman-cu.github.io/atoc_display/**

That URL is what the lobby laptop points at. Every change you commit is live within
a minute or two.

> If you would rather have the shorter address `https://will-eric-chapman-cu.github.io/`,
> name the repository `will-eric-chapman-cu.github.io` instead. Everything else is identical.

### Previewing it on your own machine first

Opening `index.html` by double-clicking it will show an empty screen — browsers block
a `file://` page from reading `content.json`. Serve it instead: in Terminal, `cd` into
this folder and run

```bash
python3 -m http.server 8000
```

then open <http://localhost:8000>. Press `Ctrl+C` when you are done.

---

## 2. Set the laptop up as a kiosk

Any laptop from the cart is plenty — the page is a few hundred KB of code. The
heaviest thing it loads is an animated satellite loop (~12 MB every 15 minutes),
so wired Ethernet or decent wifi is nice but not required.

**Before anything else:** log in as a local account that starts without a password
prompt, plug in power, and connect the monitor. Set the monitor as the primary
display so the browser opens on it.

### macOS

1. **Never sleep.** System Settings → Lock Screen: set *Turn display off on power
   adapter when inactive* to **Never**, *Start Screen Saver when inactive* to **Never**,
   and *Require password after screen saver begins* to **Never**.
   System Settings → Battery → Options: turn **Prevent automatic sleeping on power
   adapter when the display is off** on.
2. **Auto-login.** System Settings → Users & Groups → *Automatically log in as* → the kiosk account.
3. **Launch Chrome in kiosk mode.** Open Script Editor, make a new script:

   ```applescript
   do shell script "open -a 'Google Chrome' --args --kiosk --incognito --noerrdialogs \
     --disable-session-crashed-bubble --disable-infobars \
     'https://will-eric-chapman-cu.github.io/atoc_display/'"
   ```

   Save it as an **Application** called `ATOC Display`, then add it under
   System Settings → General → Login Items → *Open at Login*.
4. Optional but worth it: run `caffeinate -dimsu` in a Terminal window, or install
   Amphetamine from the App Store, as a belt-and-braces guard against sleep.

### Windows

1. **Never sleep.** Settings → System → Power: screen and sleep both **Never**
   (plugged in). Settings → Personalization → Lock screen → Screen saver: **None**.
2. **Auto-login.** Run `netplwiz`, uncheck *Users must enter a user name and password*.
3. **Launch Chrome in kiosk mode.** Right-click the desktop → New → Shortcut, with:

   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --incognito --noerrdialogs --disable-session-crashed-bubble --disable-infobars "https://will-eric-chapman-cu.github.io/atoc_display/"
   ```

   Name it `ATOC Display`. Press `Win+R`, type `shell:startup`, and drop the shortcut
   in that folder so it launches at login.

### Either way

- Close the lid only if you have set "do nothing on lid close"; otherwise leave it open
  on top of the mailbox.
- To get out of kiosk mode: `Cmd+Q` on macOS, `Alt+F4` on Windows.
- The page reloads itself at 3 AM daily, so a code or content change is picked up
  overnight even if nobody touches the machine.

---

## 3. Edit what is on the screen

Everything lives in **`content.json`**. Edit it right on github.com — click the file,
click the pencil, make the change, click *Commit changes*. The display picks it up
within ten minutes without anyone visiting the laptop.

It must stay valid JSON: text in `"double quotes"`, a comma between entries, **no**
comma after the last one. If the screen goes blank after an edit, that is almost
always a stray comma — GitHub will usually flag it in the editor.

### Highlights (awards, publications, people)

The `"research"` list feeds the **ATOC Highlights** slide. It rotates: each time the
slide comes around it shows the next entry, so a handful will carry the screen
through the day. Awards, new papers, and student news all belong here — each entry
gets the whole screen, with its picture beside it.

```json
{
  "tag": "Cloud physics",
  "title": "Why Front Range hailstorms are getting bigger",
  "people": "Jane Doe · ATOC / CIRES",
  "blurb": "Two or three plain-language sentences. About 60 words is the sweet spot.",
  "image": "images/hail.jpg"
}
```

`image` is optional — either a full `https://` URL or a file in this repository's
`images/` folder, written as `images/yourfile.jpg`. Leave it `""` for a text-only
entry, which then uses the full width. Pictures are shown whole, never cropped, so
a figure from a paper stays readable.

**Adding a picture:** drop the file into `images/` (drag it into the folder on
github.com), then reference it by name. Resize big phone photos to about 1600 px on
the long edge first — a 3 MB photo makes the page slow for no visible gain.

### Colloquium schedule

Paste in the whole semester at once. Entries whose date has passed disappear on
their own, so nothing has to be taken down after a talk. The slide shows the next
talk, and either its flyer or a short "also coming up" list.

```json
{
  "date": "2026-09-04",
  "time": "11:00 AM",
  "location": "SEEC S228 (Seivers Room)",
  "speaker": "Dr. Scott Doney",
  "affiliation": "University of Virginia",
  "title": "Marine Carbon Dioxide Removal",
  "tag": "Distinguished Lecture",
  "abstract": "Optional two-sentence teaser.",
  "image": "images/doney-seminar-flyer.jpg"
}
```

Dates must be `YYYY-MM-DD`. `tag` overrides the "Next colloquium" label — use it for
a distinguished lecture or a special seminar. `image` is optional: point it at a
flyer in `images/` and it appears beside the details. When a talk has a flyer, any
later talks move to a single line under the abstract instead of their own panel.

### Department notices

The `"announcements"` list is the free-form slide — deadlines, seminars, field
campaign updates, "the espresso machine is fixed". Each entry is a `title` and a
`body`, and may also carry an `image`.

The slide paginates: it shows a few notices at a time and moves to the next pageful
each time it comes around, so the list can grow without the text shrinking. An entry
with a picture spans the full width and counts as two slots. `perPage` on the slide
(default 4) controls how many fit on a page.

---

## 4. Change the rotation

The `"slides"` array is the running order. Every slide takes:

| Field | Meaning |
|---|---|
| `id` | Any short name; only used by you |
| `type` | See the table below |
| `title` / `subtitle` | Headline and the small caps line under it |
| `duration` | Seconds on screen. Omit it and the slide uses `defaultDuration` from `site`, which is how the deck ships. |
| `enabled` | `false` parks a slide without deleting it |
| `credit` | Small grey attribution in the bottom-right |

| `type` | What it does |
|---|---|
| `image` | Shows a live image URL. Add `src`, and `refreshMinutes` for how often to re-download it. |
| | `src` may contain `{YYYY}` `{MM}` `{M}` `{M0}`, filled in at display time for publishers who file figures under a dated path. If this month's is not up yet, last month's is used. |
| `weather` | Current conditions and forecast from the National Weather Service. |
| `station` | Our own campus weather station: latest readings plus a 24-hour temperature trace. |
| `research` | Next entry from the `research` list. |
| `colloquium` | Next upcoming talk from the `colloquia` list. |
| `list` | A grid of cards — set `"source": "announcements"` or give it its own `items`. |
| `iframe` | Embeds another web page live. Add `src`, `zoom` (e.g. `1.25`) to scale it up for a TV, and `cropTop` to trim that many of the source page's pixels off the top — useful for hiding someone else's banner and player buttons. |

**Reordering:** move the blocks around in the array.
**Turning something off:** change its `enabled` to `false`.
**Adding an image slide:** copy an existing `image` block, change `title` and `src`.
The image must be a direct link to a `.jpg`/`.png`/`.gif` that allows hotlinking —
NOAA, NASA, NCAR and NWS imagery all do.

### What is in the rotation now

| Slide | Source |
|---|---|
| GOES-19 GeoColor — Colorado & the Northern Rockies | NOAA/NESDIS STAR |
| Current Conditions — Boulder | api.weather.gov |
| Skywatch Weather Station | willychap.github.io/weather |
| ATOC Highlights | `content.json` |
| Colorado Visible Satellite — Animated | UW–Madison AOS |
| ATOC Colloquium | `content.json` |
| Colorado Reflectivity Composite — Animated | UW–Madison AOS |
| Department Notices | `content.json` |
| GOES-19 Full Disk | NOAA/NESDIS STAR |
| Severe Weather Outlook — Today | NOAA/NWS SPC |
| Mesoscale Rapid Scan — One-Minute Imagery | UW–Madison AOS |
| 8–14 Day Temperature Outlook | NOAA CPC |
| ENSO Model Skill — 22 Seasons of Forecasts | IRI, Columbia University |
| Atmospheric CO2 at Mauna Loa | NOAA GML (Boulder) |
| 8–14 Day Precipitation Outlook | NOAA CPC |

15 slides at 25 seconds is a **6-minute cycle**. No slide sets its own
`duration`, so `defaultDuration` under `site` changes the pace of the whole thing.

Currently parked (set `"enabled": true` to bring one back):

- **Colorado Radar — Denver/Boulder (KFTG)** — the NWS single-site radar; the UW composite covers the same ground
- **Colorado Visible Satellite — High Resolution** — a single still frame instead of the animated loop; lighter on an old laptop
- **Day Cloud Phase Distinction RGB** — ice cloud, water cloud and bare ground separated by color
- **Air Mass RGB — Southwest** — dry stratospheric intrusions, jet streaks and frontal boundaries
- **GOES-19 GeoColor — Continental U.S.** — the full-CONUS GeoColor still
- **ENSO Predictions Plume** — the model plume; the 22-season hindcast covers ENSO instead
- **Campus Weather Dashboard** — the full Quarto dashboard from the station, embedded live (~8 MB)

If a severe weather watch or warning is issued for Boulder, a red banner appears
across the top of every slide automatically.

---

## 5. Sending something in from your own account

Anyone with a GitHub account can propose a highlight, a notice, or a photo. You do
not need write access to this repository and you cannot break the board by trying —
changes arrive as a pull request that someone merges.

### The quick way, no terminal

1. Open **[content.json](https://github.com/will-eric-chapman-cu/atoc_display/blob/main/content.json)**.
2. Click the **pencil** icon. GitHub will say *"You need to fork this repository to
   propose changes"* — click **Fork this repository**. That is the fork; it happens
   in one click.
3. Make your edit, scroll down, click **Propose changes**, then **Create pull request**.

To include a photo this way, first open the **`images/`** folder *on your fork*,
click **Add file → Upload files**, commit it, and then reference it from
`content.json` as `images/your-file.jpg`.

### The full way: fork, branch, pull request

Everything below is copy-paste. Replace `YOUR-USERNAME` and pick your own branch name.

**1. Fork and clone.** With the [GitHub CLI](https://cli.github.com):

```bash
gh repo fork will-eric-chapman-cu/atoc_display --clone
cd atoc_display
```

Without it, click **Fork** on the repository page, then:

```bash
git clone https://github.com/YOUR-USERNAME/atoc_display.git
cd atoc_display
git remote add upstream https://github.com/will-eric-chapman-cu/atoc_display.git
```

Either way, check you have both remotes — `origin` is your fork, `upstream` is the
department copy:

```bash
git remote -v
```

**2. Branch from what is currently on the screen.**

```bash
git fetch upstream
git checkout -B highlight/your-name upstream/main
```

**3. Add a photo, resized.** A 3 MB phone photo makes the board slow and looks no
better, so scale the long edge to about 1600 px:

```bash
# macOS
sips -Z 1600 ~/Desktop/your-photo.jpg --out images/your-name-award.jpg

# Linux, with ImageMagick
convert ~/Desktop/your-photo.jpg -resize '1600x1600>' images/your-name-award.jpg
```

**4. Edit `content.json`.** For an award, a paper, or student news, add an entry to
the `"research"` list — that is the **ATOC Highlights** slide, and each entry gets
the whole screen:

```json
{
  "tag": "New publication",
  "title": "One plain-language line about the result",
  "people": "Your Name · ATOC",
  "blurb": "Two or three sentences a visitor with no atmospheric science background could follow. About 60 words.",
  "image": "images/your-name-award.jpg"
}
```

For a deadline or a seminar notice, add to `"announcements"` instead — `title` and
`body`, with an optional `image`. Leave `"image": ""` if you have no picture.

Mind the JSON: double quotes, a comma between entries, **no** comma after the last one.

**5. Check it and look at it.**

```bash
python3 -m json.tool content.json > /dev/null && echo "JSON is valid"
python3 -m http.server 8000
```

Open <http://localhost:8000/?seconds=5> and press `→` until you reach your slide.
`Ctrl+C` stops the server.

**6. Commit and push to your fork.**

```bash
git add content.json images/
git commit -m "Add highlight: Winters NSF CAREER award"
git push -u origin highlight/your-name
```

**7. Open the pull request.**

```bash
gh pr create --repo will-eric-chapman-cu/atoc_display --base main --fill
```

Or just open the URL that `git push` prints in its output — it links straight to the
"compare & pull request" page.

### After it is merged

GitHub Pages rebuilds within a minute or two. The lobby laptop re-reads `content.json`
every ten minutes and reloads itself entirely at 3 AM, so nobody has to walk over to
the mailbox and touch it.

### Keeping your fork current for next time

```bash
git checkout main
git fetch upstream
git merge --ff-only upstream/main
git push
```

### Before you open the PR

- `python3 -m json.tool content.json` runs clean.
- Photos are about 1600 px on the long edge and well under a megabyte.
- The blurb reads to someone outside the field — this screen faces the front door.
- You have the right to post the photo, and anyone in it is happy to be on a public
  screen and on a public GitHub repository.
- You have not edited anything in `assets/` unless you actually meant to change how
  the board behaves.

---

## 6. Keyboard shortcuts

Handy when someone is standing at the screen with a keyboard.

| Key | Does |
|---|---|
| `→` / `←` | Next / previous slide |
| `space` | Pause and resume |
| `f` | Toggle fullscreen |
| `r` | Reload |
| `c` | Show or hide the mouse cursor |
| click | Jump to the next slide |

Two URL switches help when you are checking something you just edited:
`?start=3` opens straight to slide 3, and `?seconds=10` runs the whole deck at ten
seconds a slide. They apply to that page load only and change nothing in `content.json`
— e.g. `…/atoc_display/?seconds=10&start=6`.

---

## 7. If something looks wrong

**One slide says "Imagery temporarily unavailable."** The upstream NOAA server is
having a moment. It fixes itself; the slideshow keeps going regardless.

**Conditions say "unavailable".** `api.weather.gov` occasionally rate-limits or the
Boulder station drops out. It recovers on the next ten-minute refresh.

**The whole screen is blank.** `content.json` has a syntax error. Open the repository's
commit history and revert the last change.

**Everything is frozen.** Press `r`, or restart the laptop — it comes back into the
slideshow on its own.

**The weather is for the wrong place.** In `content.json`, look up your coordinates at
`https://api.weather.gov/points/LAT,LON`, then copy the `gridId`, `gridX` and `gridY`
into `"gridpoint": "BOU/54,74"` and update `station` to the nearest airport code.

---

## Credits

Imagery and data from NOAA/NESDIS STAR, the National Weather Service, the Storm
Prediction Center, the Climate Prediction Center, the Space Weather Prediction Center,
and the NOAA Global Monitoring Laboratory — the last three of which are our neighbours
in Boulder. Campus observations from the ATOC weather station feed.
