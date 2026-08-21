# ATOC Lobby Display

A one-page kiosk slideshow for the monitor in the ATOC entrance. It cycles through
live satellite imagery, Colorado radar, our own campus weather station, current
conditions, research highlights, the colloquium schedule, and department notices —
45 seconds each, forever, with no clicking.

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

### Research highlights

The `"research"` list rotates: each time the highlight slide comes around it shows
the next entry, so a handful of them will carry the screen through the day.

```json
{
  "tag": "Cloud physics",
  "title": "Why Front Range hailstorms are getting bigger",
  "people": "Jane Doe · ATOC / CIRES",
  "blurb": "Two or three plain-language sentences. About 60 words is the sweet spot.",
  "image": "images/hail.jpg"
}
```

`image` is optional — either a full `https://` URL or a file you have added to an
`images/` folder in the repository. Leave it as `""` for a text-only slide.

### Colloquium schedule

Paste in the whole semester at once. Entries whose date has passed disappear on their
own, and the slide shows the next talk plus a short "also coming up" list.

```json
{
  "date": "2026-09-03",
  "time": "3:30 PM",
  "location": "SEEC Auditorium (S125)",
  "speaker": "Jane Doe",
  "affiliation": "NCAR",
  "title": "Title of the talk",
  "abstract": "Optional one-line teaser."
}
```

Dates must be `YYYY-MM-DD`.

### Department notices

The `"announcements"` list is the free-form slide — deadlines, congratulations,
field campaign updates, "the espresso machine is fixed". Each entry is a `title`
and a `body`.

---

## 4. Change the rotation

The `"slides"` array is the running order. Every slide takes:

| Field | Meaning |
|---|---|
| `id` | Any short name; only used by you |
| `type` | See the table below |
| `title` / `subtitle` | Headline and the small caps line under it |
| `duration` | Seconds on screen (45 by default) |
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
| GOES-19 GeoColor, Colorado & Northern Rockies (animated) | NOAA/NESDIS STAR |
| Colorado radar, KFTG Denver/Boulder (animated) | NOAA/NWS NEXRAD |
| Current conditions, Boulder | api.weather.gov |
| Our own weather station | willychap.github.io/weather |
| ATOC research highlight | `content.json` |
| Colorado visible satellite, high resolution | UW–Madison AOS |
| ATOC colloquium | `content.json` |
| Colorado reflectivity composite (animated, embedded) | UW–Madison AOS |
| Department notices | `content.json` |
| Day Cloud Phase Distinction RGB | UW–Madison AOS |
| GOES-19 full disk | NOAA/NESDIS STAR |
| Severe weather outlook, day 1 | NOAA/NWS SPC |
| Air Mass RGB, Southwest | UW–Madison AOS |
| GOES-19 GeoColor, CONUS | NOAA/NESDIS STAR |
| 8–14 day temperature outlook | NOAA CPC |
| ENSO forecast (El Niño / La Niña) | IRI, Columbia University |
| Atmospheric CO₂ at Mauna Loa | NOAA GML (Boulder) |

Seventeen slides at 45 seconds each is a **13-minute cycle**. If that feels long,
turn a few off with `"enabled": false` or shorten their `duration`.

Two more ship turned off: the **8–14 day precipitation outlook**, and the full
**campus weather dashboard** embedded live from `willychap.github.io/weather`.
Set `"enabled": true` on either to add it.

If a severe weather watch or warning is issued for Boulder, a red banner appears
across the top of every slide automatically.

---

## 5. Keyboard shortcuts

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

## 6. If something looks wrong

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
