# ATOC Lobby Display

A one-page kiosk dashboard for the monitor in the ATOC entrance, with three areas
that stay visible together:

- **Left:** live satellite imagery, Colorado radar, the campus weather station, and
  current conditions rotate every 25 seconds.
- **Top right — ATOC News:** research highlights and department notices rotate
  independently every 20 seconds.
- **Bottom right — ATOC Calendar:** upcoming events from the official Google Calendar.

The agenda groups upcoming events by date and shows their times and locations.
Add or edit events in Google Calendar. The sync script converts the public
calendar identified by `site.googleCalendarId` into `calendar.json`, and the
display checks that file every 10 minutes. The lobby display needs no Google
login. Without a configured Google calendar, the agenda uses `colloquia` and
optional entries in the `calendar` array in `content.json`.

---

## 1. Publish with GitHub Pages

1. Push the project to the repository's `main` branch.
2. Under **Settings → Pages → Build and deployment**, choose **GitHub Actions**
   as the source.
3. In **Actions**, enable workflows if your fork has them disabled, then run
   **Publish ATOC display**. The workflow shows the site's URL after deployment.

For an existing site, the repository maintainer only needs to switch the Pages
source to **GitHub Actions** and run the workflow once. The existing Pages URL
continues to work. The workflow adds the `calendar.json` file used by the agenda.

The workflow publishes on pushes to `main` and is scheduled to refresh the
calendar every 15 minutes. GitHub controls when scheduled runs actually start.
If a public repository goes 60 days without activity, GitHub disables its
scheduled workflows. You can re-enable them in **Actions**.

### Previewing it on your own machine first

From this folder, use Python 3.11 or newer to run the preview with live calendar data.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r scripts/calendar-requirements.txt
.venv/bin/python scripts/calendar_feed.py --serve 8000
```

Open <http://127.0.0.1:8000/>. Press `Ctrl+C` when you are done.

---

## 2. Set the laptop up as a kiosk

Any laptop from the cart is plenty — the page is a few hundred KB of code. The
heaviest things it loads are the embedded UW animation loops, which fetch a few dozen
frames each time they come around, so decent wifi helps but wired Ethernet is not
required.

**Before anything else:** log in as a local account that starts without a password
prompt, plug in power, and connect the monitor. Set the monitor as the primary
display so the browser opens on it.

**How updates reach the screen.** After each deployment, the kiosk picks up
edits to highlights, notices, and slides when it reads `content.json` again
within ten minutes. The live agenda updates from Google Calendar on its own
schedule. Changes to the page
itself — `index.html`, `assets/app.js`, `assets/style.css` — are caught by a version
check every five minutes, and the screen then reloads at the next slide change rather
than interrupting one mid-view. `"updateCheckMinutes"` under `site` changes how often
it looks; a failed check never triggers a reload.

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

Choose where to add an item based on where you want it to appear.

| To add… | Edit… | It appears in… |
|---|---|---|
| An award, publication, or research highlight | `research` in `content.json` | ATOC News |
| A department notice, deadline, or flyer | `announcements` in `content.json` | ATOC News |
| A weather map, chart, live feed, or other large slide | `slides` in `content.json` | The main panel by default |
| An event with a date and time | The public ATOC Google Calendar | ATOC Calendar |

News entries rotate automatically from their lists. Add `until` to retire an
item after a given date. A public event can also have a separate News entry if
you want to feature its flyer or give it more visibility.

To edit `content.json` on GitHub, open the file, click the pencil, and save
your changes.

It must stay valid JSON: text in `"double quotes"`, a comma between entries, **no**
comma after the last one. If the screen goes blank after an edit, that is almost
always a stray comma — GitHub will usually flag it in the editor.

### Highlights (awards, publications, people)

The `"research"` list feeds the **ATOC News** panel at the top right. It rotates
through highlights and department notices independently of the main slideshow.
Awards, new papers, and student news all belong here. Portrait and square photos
sit beside the headline. Wide photos use the full width above it. Longer text is
shortened to fit the panel.

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

**Anything with a deadline can retire itself.** Add `"until": "2026-09-18"` to a
highlight or a notice and it shows through the end of that day, then drops out on its
own — the same way a colloquium disappears after its date. Use it for sales,
broadcasts, and application deadlines, so nobody has to remember to take them down.
A mistyped date keeps the item on screen rather than silently hiding it.

### Manual colloquium schedule

The `colloquia` list supplies the manual agenda and the optional full
colloquium slide. The manual agenda drops past events automatically.

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

Dates must be `YYYY-MM-DD`. The manual agenda shows upcoming dates, titles,
times, and locations. `tag`, `abstract`, and `image` are retained for the full
colloquium slide if you move it back into the main panel with `"region": "main"`.

### Department notices

The `"announcements"` list feeds the news panel — deadlines, seminars, field
campaign updates, "the espresso machine is fixed". Each entry is a `title` and a
`body`, and may also carry an `image`. One item is shown at a time alongside the
research highlights. An optional `until` date retires a notice automatically.

If you move this list into the main panel with `"region": "main"`, it paginates
into cards instead. `perPage` on that slide (default 4) controls how many fit.

---

## 4. Change the rotation

The `"slides"` array is the running order. Slides without a `region`, or with
`"region": "main"`, appear in the main panel. Research and announcement slides use
`"region": "news"` to feed the top-right panel; the colloquium slide uses
`"region": "calendar"` to feed the manual calendar view. These sidebar entries do
not also appear in the main slideshow. `enabled: false` disables an entry in
either region.

`site.defaultDuration` sets the main slideshow's pace and `site.newsDuration` sets
the news rotation's pace, in seconds. The sidebar refreshes along with
`content.json`, and date-based expiry updates at midnight in
`site.timezone`. On small screens, the three panels stack for previewing.

Every slide takes:

| Field | Meaning |
|---|---|
| `id` | Any short name; only used by you |
| `type` | See the table below |
| `region` | Omit it or use `"main"` for the main panel. `"news"` routes research and list entries to News. `"calendar"` routes the colloquium list to the manual agenda. |
| `title` / `subtitle` | Headline and the small caps line under it |
| `duration` | Seconds on screen. Omit it and the slide uses `defaultDuration` from `site`, which is how the deck ships. |
| `enabled` | `false` parks a slide without deleting it |
| `credit` | Small grey attribution in the bottom-right |

| `type` | What it does |
|---|---|
| `image` | Shows a live image URL. Add `src`, and `refreshMinutes` for how often to re-download it. |
| | `src` may contain `{YYYY}` `{MM}` `{M}` `{M0}` for publishers who file figures under a dated path, and `{RUN}` `{FRAME}` for model output — `{RUN}` is the latest six-hourly UTC cycle, `{FRAME}` a forecast hour from the slide's `frames` list. Candidates are tried in order, so the display falls back to the previous month, the previous run, or a shorter lead time when the newest figure is not out yet. |
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

### What rotates in the main panel

| Slide | Source |
|---|---|
| Current Conditions — Boulder | api.weather.gov |
| CU-WRF Forecast — 250-hPa Jet Stream | CU-WRF · McKenzie Larson |
| Skywatch Weather Station | willychap.github.io/weather |
| Colorado Visible Satellite — Animated | UW–Madison AOS |
| Colorado Reflectivity Composite — Animated | UW–Madison AOS |
| CU-WRF Forecast — 500-hPa Vorticity | CU-WRF · McKenzie Larson |
| GOES-19 Full Disk | NOAA/NESDIS STAR |
| Severe Weather Outlook — Today | NOAA/NWS SPC |
| Mesoscale Rapid Scan — One-Minute Imagery | UW–Madison AOS |
| 8–14 Day Temperature Outlook | NOAA CPC |
| 8–14 Day Precipitation Outlook | NOAA CPC |

The main panel has 11 slides at 25 seconds, for a cycle of about **4½ minutes**.
Set `site.defaultDuration` to change the pace of the main panel.

Currently parked (set `"enabled": true` to bring one back):

- **GOES-19 GeoColor — Colorado & the Northern Rockies** — the 600 px GeoColor GIF loop (~12 MB); the UW Colorado visible loop covers the same area at higher resolution
- **Colorado Radar — Denver/Boulder (KFTG)** — the NWS single-site radar; the UW composite covers the same ground
- **Colorado Visible Satellite — High Resolution** — a single still frame instead of the animated loop; lighter on an old laptop
- **Day Cloud Phase Distinction RGB** — ice cloud, water cloud and bare ground separated by color
- **Air Mass RGB — Southwest** — dry stratospheric intrusions, jet streaks and frontal boundaries
- **GOES-19 GeoColor — Continental U.S.** — the full-CONUS GeoColor still
- **ENSO Predictions Plume** — the ENSO model plume — parked while ensoforecast2.iri.columbia.edu is unresponsive
- **ENSO Model Skill — 22 Seasons of Forecasts** — the 22-season ENSO hindcast — parked with the same host outage
- **Atmospheric CO2 at Mauna Loa** — monthly Mauna Loa CO₂ record
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
the `"research"` list — each entry appears in the **ATOC News** panel:

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
.venv/bin/python scripts/calendar_feed.py --serve 8000
```

Open <http://127.0.0.1:8000/> and click **ATOC News** until your entry appears.
To check main slides, use the arrow keys. `Ctrl+C` stops the server.

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

The **Publish ATOC display** workflow rebuilds GitHub Pages. The lobby laptop re-reads `content.json`
every ten minutes, and watches its own files for a new version — publish a change to
the page itself and the screen reloads at the next slide change, usually within about
five minutes. Nobody has to walk over to the mailbox and touch it. It also reloads
outright at 3 AM, which clears anything the browser has leaked over a day on screen.

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
| `space` | Pause and resume the main slideshow and news rotation |
| `f` | Toggle fullscreen |
| `r` | Reload |
| `c` | Show or hide the mouse cursor |
| click main panel | Jump to the next main slide |
| click news panel | Show the next news item |

Two URL switches help when you are checking something you just edited:
`?start=3` opens straight to slide 3, and `?seconds=10` runs the whole deck at ten
seconds a slide. They apply to that page load only and change nothing in `content.json`
— e.g. `…/atoc_display/?seconds=10&start=6`.

---

## 7. If something looks wrong

**One slide says "Imagery temporarily unavailable."** The upstream server is having a
moment. It fixes itself; the slideshow keeps going regardless. A source that stalls
without ever answering is given eight seconds before the slide gives up, so a dead
host costs a short pause, not a frozen board.

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
