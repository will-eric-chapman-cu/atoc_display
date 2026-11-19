/* ATOC lobby display — vanilla JS, no build step, no dependencies.
   Everything an editor needs to change lives in content.json. */

'use strict';

const $ = (sel) => document.querySelector(sel);
const stage = $('#stage');

const params = new URLSearchParams(location.search);
/* ?seconds=10 overrides every slide's duration for this page load only — for
   flicking through the whole deck without touching content.json. */
const secondsOverride = Number(params.get('seconds')) > 0 ? Number(params.get('seconds')) : null;

const state = {
  content: null,
  contentRaw: '',
  slides: [],
  index: -1,
  timerId: null,
  paused: false,
  newsIndex: 0,
  newsTimerId: null,
  sidebarDay: '',
  calendar: null,
  calendarUnavailable: false,
  cursors: {},          // per-slide rotation cursor (research highlight 1, then 2, ...)
  wx: { obs: null, forecast: null, fetchedAt: 0 },
  station: { rows: null, fetchedAt: 0 },
  startedAt: Date.now(),
  codeVersion: null,     // source of the page's own files, for auto-refresh
  reloadWhenIdle: false,
};

/* ------------------------------------------------------------------ utils */

const clean = (s) => String(s == null ? '' : s);

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/* Bust the cache only once per refresh window, so a 10 MB satellite loop is
   downloaded on a schedule rather than on every single rotation. */
function versioned(src, refreshMinutes) {
  const m = Number(refreshMinutes) > 0 ? Number(refreshMinutes) : 10;
  const bucket = Math.floor(Date.now() / (m * 60000));
  return src + (src.includes('?') ? '&' : '?') + 'v=' + bucket;
}

/* Some publishers file their figures under a dated path that rolls over, so a src
   may carry placeholders:
     {YYYY} 2026   {MM} 09   {M} 9   {M0} 8 (zero-indexed, as IRI numbers months)
     {RUN}   the latest six-hourly model cycle in UTC, as YYYYMMDDHH
     {FRAME} a forecast hour from the slide's "frames" list, zero-padded to three
   Returns an ordered list of candidates to try: the current month then the previous
   one, the current cycle then the one before it, and each frame in turn. CU-WRF
   keeps figures only for the run in progress and writes them as the model runs, so
   the newest cycle may not have reached a given hour yet — hence the fallbacks. */
function datedSources(src, frames) {
  if (!/\{(YYYY|MM|M|M0|RUN|FRAME)\}/.test(src)) return [src];

  const byMonth = (d) => (u) => u
    .replace(/\{YYYY\}/g, String(d.getFullYear()))
    .replace(/\{MM\}/g, String(d.getMonth() + 1).padStart(2, '0'))
    .replace(/\{M0\}/g, String(d.getMonth()))
    .replace(/\{M\}/g, String(d.getMonth() + 1));

  const now = new Date();
  const months = [now, new Date(now.getFullYear(), now.getMonth() - 1, 1)];

  // Model cycles run on six-hourly UTC boundaries.
  const cycle = new Date(now);
  cycle.setUTCMinutes(0, 0, 0);
  cycle.setUTCHours(Math.floor(cycle.getUTCHours() / 6) * 6);
  const runs = [0, 6].map((back) => {
    const d = new Date(cycle.getTime() - back * 3600000);
    return d.getUTCFullYear()
      + String(d.getUTCMonth() + 1).padStart(2, '0')
      + String(d.getUTCDate()).padStart(2, '0')
      + String(d.getUTCHours()).padStart(2, '0');
  });

  const frameList = (Array.isArray(frames) && frames.length ? frames : [0])
    .map((f) => String(f).padStart(3, '0'));

  const out = [];
  const hasRun = src.includes('{RUN}');
  for (const run of (hasRun ? runs : [null])) {
    for (const frame of (src.includes('{FRAME}') ? frameList : [null])) {
      let u = src;
      if (run !== null) u = u.replace(/\{RUN\}/g, run);
      if (frame !== null) u = u.replace(/\{FRAME\}/g, frame);
      out.push(byMonth(months[0])(u));
      if (!hasRun) out.push(byMonth(months[1])(u));   // month fallback only
    }
  }
  return out.slice(0, 4);              // stay inside the render guard
}

function loadImage(src, timeoutMs) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let timer = null;
    const done = (fn, arg) => { clearTimeout(timer); fn(arg); };
    img.decoding = 'async';
    img.alt = '';
    img.onload = () => done(resolve, img);
    img.onerror = () => done(reject, new Error('image failed: ' + src));
    timer = setTimeout(() => {
      img.src = '';                   // cancel the in-flight request
      reject(new Error('image timed out: ' + src));
    }, timeoutMs || IMAGE_TIMEOUT_MS);
    img.src = src;
  });
}

const IMAGE_TIMEOUT_MS = 8000;
const RENDER_TIMEOUT_MS = 20000;

/* Last line of defence: no renderer may wedge the rotation, whatever it awaits. */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('render timed out: ' + label)), ms)),
  ]);
}

async function getJSON(url, timeoutMs = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(url + ' -> HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function flash(msg) {
  const box = $('#status');
  box.textContent = msg;
  box.hidden = false;
  clearTimeout(flash._t);
  flash._t = setTimeout(() => { box.hidden = true; }, 1400);
}

/* --------------------------------------------------------------- unit conv */

const cToF = (c) => (c == null ? null : c * 9 / 5 + 32);
const kmhToMph = (k) => (k == null ? null : k * 0.621371);
const mToMi = (m) => (m == null ? null : m / 1609.34);
const paToInHg = (p) => (p == null ? null : p / 3386.39);
const round = (n, d = 0) => (n == null ? null : Number(n.toFixed(d)));

const COMPASS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
const bearing = (deg) => (deg == null ? '' : COMPASS[Math.round(deg / 22.5) % 16]);

/* -------------------------------------------------------------- clock/date */

function tickClock() {
  const tz = state.content?.site?.timezone || 'America/Denver';
  const now = new Date();
  $('#clock-time').textContent = now.toLocaleTimeString('en-US',
    { hour: 'numeric', minute: '2-digit', timeZone: tz });
  $('#clock-date').textContent = now.toLocaleDateString('en-US',
    { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz });
}

/* ------------------------------------------------------------ content load */

async function loadContent(isRefresh) {
  const res = await fetch('content.json?v=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('content.json -> HTTP ' + res.status);
  const raw = await res.text();
  if (isRefresh && raw === state.contentRaw) return false;  // unchanged
  const content = JSON.parse(raw);
  state.contentRaw = raw;
  state.content = content;
  state.slides = slidesInRegion('main');
  buildDots();
  refreshSidebar();
  return true;
}

/* ------------------------------------------------------------------ alerts */

async function refreshAlerts() {
  const cfg = state.content?.weather || {};
  if (cfg.showAlerts === false) return;
  const bar = $('#alertbar');
  try {
    const lat = cfg.lat ?? 40.0076, lon = cfg.lon ?? -105.2659;
    const data = await getJSON(`https://api.weather.gov/alerts/active?point=${lat},${lon}`);
    const feats = (data.features || []).filter((f) => {
      const sev = f.properties?.severity;
      return sev === 'Extreme' || sev === 'Severe' || sev === 'Moderate';
    });
    if (!feats.length) { bar.hidden = true; return; }
    const p = feats[0].properties;
    bar.replaceChildren(
      el('span', 'ab-tag', p.severity === 'Moderate' ? 'NWS Advisory' : 'NWS Alert'),
      el('span', null, clean(p.event) + (p.areaDesc ? ' — ' + p.areaDesc.split(';')[0].trim() : ''))
    );
    bar.hidden = false;
  } catch (err) {
    console.warn('alerts', err);       // never let a failed alert fetch break the loop
    bar.hidden = true;
  }
}

/* ----------------------------------------------------------------- weather */

async function refreshWeather(force) {
  const cfg = state.content?.weather || {};
  const maxAge = (cfg.refreshMinutes || 10) * 60000;
  if (!force && Date.now() - state.wx.fetchedAt < maxAge) return;

  const station = cfg.station || 'KBDU';
  const grid = cfg.gridpoint || 'BOU/54,74';
  const [obs, fc] = await Promise.allSettled([
    getJSON(`https://api.weather.gov/stations/${station}/observations/latest`),
    getJSON(`https://api.weather.gov/gridpoints/${grid}/forecast`),
  ]);
  if (obs.status === 'fulfilled') state.wx.obs = obs.value.properties;
  if (fc.status === 'fulfilled') state.wx.forecast = fc.value.properties;
  if (obs.status === 'fulfilled' || fc.status === 'fulfilled') state.wx.fetchedAt = Date.now();
  if (obs.status === 'rejected') console.warn('obs', obs.reason);
  if (fc.status === 'rejected') console.warn('forecast', fc.reason);
}

function renderWeather(slide) {
  const cfg = state.content?.weather || {};
  const o = state.wx.obs;
  const periods = state.wx.forecast?.periods || [];
  const body = el('div', 'wx');

  // --- current conditions ---
  const now = el('div', 'wx-now');
  if (o) {
    const t = round(cToF(o.temperature?.value));
    const temp = el('div', 'wx-temp');
    temp.append(document.createTextNode(t == null ? '--' : String(t)));
    const sup = el('sup', null, '°F');
    temp.append(sup);
    now.append(temp);
    now.append(el('div', 'wx-cond', clean(o.textDescription) || 'Conditions unavailable'));
    now.append(el('div', 'wx-place', cfg.stationName || 'Boulder, Colorado'));

    const feels = o.windChill?.value ?? o.heatIndex?.value ?? null;
    const rows = [
      ['Feels like', feels != null ? round(cToF(feels)) + '°F' : '—'],
      ['Dew point', o.dewpoint?.value != null ? round(cToF(o.dewpoint.value)) + '°F' : '—'],
      ['Wind', o.windSpeed?.value != null
        ? (round(kmhToMph(o.windSpeed.value)) === 0
            ? 'Calm'
            : bearing(o.windDirection?.value) + ' ' + round(kmhToMph(o.windSpeed.value)) + ' mph')
        : '—'],
      ['Gusts', o.windGust?.value != null ? round(kmhToMph(o.windGust.value)) + ' mph' : '—'],
      ['Humidity', o.relativeHumidity?.value != null ? round(o.relativeHumidity.value) + '%' : '—'],
      ['Pressure', o.barometricPressure?.value != null ? round(paToInHg(o.barometricPressure.value), 2) + ' in' : '—'],
      ['Visibility', o.visibility?.value != null ? round(mToMi(o.visibility.value), 1) + ' mi' : '—'],
      ['Observed', o.timestamp
        ? new Date(o.timestamp).toLocaleTimeString('en-US',
            { hour: 'numeric', minute: '2-digit', timeZone: cfg.timezone || 'America/Denver' })
        : '—'],
    ];
    const grid = el('div', 'wx-grid');
    for (const [k, v] of rows) {
      const row = el('div');
      row.append(el('span', null, k), el('b', null, String(v)));
      grid.append(row);
    }
    now.append(grid);
  } else {
    now.append(el('div', 'empty', 'Live conditions unavailable'));
  }

  // --- short-term forecast ---
  const fc = el('div', 'wx-fc');
  if (periods.length) {
    for (const p of periods.slice(0, 4)) {
      const row = el('div', 'fc-row' + (p.number === 1 ? ' now' : ''));
      row.append(el('div', 'fc-name', clean(p.name)));
      row.append(el('div', 'fc-temp', p.temperature + '°'));
      row.append(el('div', 'fc-text', clean(p.detailedForecast || p.shortForecast)));
      fc.append(row);
    }
  } else {
    fc.append(el('div', 'empty', 'Forecast unavailable'));
  }

  body.append(now, fc);
  return frame(slide, body, cfg.credit || 'Source: NOAA / National Weather Service, Boulder (api.weather.gov)');
}


/* ------------------------------------------------- campus weather station */
/* Reads the JSON published by the ATOC station feed (willychap.github.io/weather).
   Rows look like: {datetime:"2026-08-21T13:10:00", temp_f, humidity, dew_point_f,
   wind_speed, wind_gust, wind_dir, pressure_mb, rain_in, solar_rad}. */

async function refreshStation(force) {
  const cfg = state.content?.station || {};
  const url = cfg.url;
  if (!url) return;
  const maxAge = (cfg.refreshMinutes || 15) * 60000;
  if (!force && state.station.rows && Date.now() - state.station.fetchedAt < maxAge) return;
  const raw = await getJSON(url, 30000);
  if (!Array.isArray(raw) || !raw.length) return;

  // The feed is appended in batches and is not strictly ordered, so stamp,
  // sort and de-duplicate before anything downstream trusts "the last row".
  const seen = new Set();
  const rows = [];
  for (const r of raw) {
    const d = parseStamp(r.datetime);
    if (!d) continue;
    const t = d.getTime();
    if (seen.has(t)) continue;
    seen.add(t);
    rows.push({ ...r, t });
  }
  rows.sort((a, b) => a.t - b.t);
  if (rows.length) {
    state.station.rows = rows;
    state.station.fetchedAt = Date.now();
  }
}

// "2026-08-21T13:10:00" is local wall-clock time with no zone; parse it as such.
function parseStamp(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(clean(s));
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

/* Round tick values sitting inside the plotted range, so the axis reads 70/80/90
   rather than 68.4/79.1. Ticks are placed within a lightly padded data range
   rather than the range being snapped out to the ticks — otherwise a high of
   90.1 would stretch the axis to 100 and waste half the panel. */
function niceTicks(lo, hi, target) {
  const raw = ((hi - lo) || 1) / (target || 5);
  const steps = [0.5, 1, 2, 5, 10, 20, 25, 50, 100];
  let step = steps.reduce((best, s) => (Math.abs(s - raw) < Math.abs(best - raw) ? s : best), steps[0]);
  let ticks = [];
  for (;;) {
    ticks = [];
    const first = Math.ceil(lo / step) * step;
    for (let v = first; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
    const next = steps[steps.indexOf(step) + 1];
    if (ticks.length <= 8 || !next) break;
    step = next;
  }
  return ticks;
}

/* Time is the x-axis, not sample index: the station record has gaps, and
   spacing points evenly would bend the diurnal cycle out of shape. Gaps longer
   than `gapMinutes` break the line rather than being bridged by a fake segment.
   The SVG is deliberately stretched to fill its box, so anything that must not
   distort — axis labels, gridlines, the "now" dot — is HTML positioned over it. */
function sparkline(points, gapMinutes, unit) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 1000, H = 260, pad = 14;
  const wrap = el('div', 'spark-wrap');
  const axis = el('div', 'spark-axis');
  const plot = el('div', 'spark-plot');
  wrap.append(axis, plot);

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'spark');
  plot.append(svg);
  if (points.length < 2) return wrap;

  const vs = points.map((p) => p.v);
  const dLo = Math.min(...vs), dHi = Math.max(...vs);
  const headroom = ((dHi - dLo) || 1) * 0.08;
  const lo = dLo - headroom, hi = dHi + headroom;
  const ticks = niceTicks(lo, hi);
  const span = (hi - lo) || 1;
  const t0 = points[0].t, t1 = points[points.length - 1].t;
  const tSpan = (t1 - t0) || 1;
  const x = (t) => pad + ((t - t0) / tSpan) * (W - pad * 2);
  const y = (v) => H - pad - ((v - lo) / span) * (H - pad * 2);
  const pct = (v) => (y(v) / H * 100).toFixed(2) + '%';
  const gapMs = (gapMinutes || 30) * 60000;

  for (const v of ticks) {
    const line = el('div', 'spark-grid');
    line.style.top = pct(v);
    plot.append(line);
    const label = el('span', null, Math.round(v) + (unit || ''));
    label.style.top = pct(v);
    axis.append(label);
  }

  let line = '', area = '', segStart = null, prev = null;
  const closeSeg = () => {
    if (segStart != null && prev != null && segStart !== prev) {
      area += ` L ${x(prev).toFixed(1)} ${H} L ${x(segStart).toFixed(1)} ${H} Z`;
    }
  };
  for (const p of points) {
    const isBreak = prev == null || p.t - prev > gapMs;
    if (isBreak) { closeSeg(); segStart = p.t; area += ` M ${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`; }
    else { area += ` L ${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`; }
    line += ` ${isBreak ? 'M' : 'L'} ${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`;
    prev = p.t;
  }
  closeSeg();

  const areaEl = document.createElementNS(NS, 'path');
  areaEl.setAttribute('d', area.trim());
  areaEl.setAttribute('class', 'spark-area');
  svg.append(areaEl);

  const lineEl = document.createElementNS(NS, 'path');
  lineEl.setAttribute('d', line.trim());
  lineEl.setAttribute('class', 'spark-line');
  lineEl.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(lineEl);

  const last = points[points.length - 1];
  const dot = el('div', 'spark-now');
  dot.style.left = (x(last.t) / W * 100).toFixed(2) + '%';
  dot.style.top = pct(last.v);
  plot.append(dot);
  return wrap;
}

function renderStation(slide) {
  const cfg = state.content?.station || {};
  const rows = state.station.rows;
  if (!rows || !rows.length) {
    return frame(slide, el('div', 'empty', 'Station data unavailable'), cfg.credit || slide.credit);
  }

  const last = rows[rows.length - 1];
  const lastTime = new Date(last.t);
  const cutoff = last.t - (cfg.hours || 24) * 3600000;

  // trailing window, thinned to keep the SVG small
  const recent = rows.filter((r) => r.t >= cutoff && r.temp_f != null);
  const step = Math.max(1, Math.floor(recent.length / 200));
  const pts = recent
    .filter((_, i) => i % step === 0 || i === recent.length - 1)
    .map((r) => ({ t: r.t, v: r.temp_f }));

  const temps = recent.map((r) => r.temp_f);
  const hi = temps.length ? Math.max(...temps) : null;
  const lo = temps.length ? Math.min(...temps) : null;

  // rain since local midnight (the feed reports per-interval increments)
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const rain = rows.reduce((sum, r) => (r.t >= midnight.getTime() && r.rain_in ? sum + r.rain_in : sum), 0);

  const body = el('div', 'stn');

  const now = el('div', 'wx-now');
  const temp = el('div', 'wx-temp');
  temp.append(document.createTextNode(last.temp_f == null ? '--' : String(Math.round(last.temp_f))));
  temp.append(el('sup', null, '°F'));
  now.append(temp);
  const windTxt = last.wind_speed == null ? '—'
    : (last.wind_speed === 0 ? 'Calm' : `${clean(last.wind_dir)} ${Math.round(last.wind_speed)} mph`);
  now.append(el('div', 'wx-cond', windTxt === 'Calm' ? 'Wind calm' : 'Wind ' + windTxt));
  now.append(el('div', 'wx-place', cfg.name || 'ATOC campus weather station'));

  const rowsOut = [
    ['Humidity', last.humidity != null ? Math.round(last.humidity) + '%' : '—'],
    ['Dew point', last.dew_point_f != null ? Math.round(last.dew_point_f) + '°F' : '—'],
    ['Gusts', last.wind_gust != null ? Math.round(last.wind_gust) + ' mph' : '—'],
    ['Pressure', last.pressure_mb != null ? last.pressure_mb.toFixed(1) + ' mb' : '—'],
    ['Solar', last.solar_rad != null ? Math.round(last.solar_rad) + ' W/m²' : '—'],
    ['Rain today', rain.toFixed(2) + ' in'],
    [(cfg.hours || 24) + ' h high', hi != null ? Math.round(hi) + '°F' : '—'],
    [(cfg.hours || 24) + ' h low', lo != null ? Math.round(lo) + '°F' : '—'],
  ];
  const grid = el('div', 'wx-grid');
  for (const [k, v] of rowsOut) {
    const r = el('div');
    r.append(el('span', null, k), el('b', null, String(v)));
    grid.append(r);
  }
  now.append(grid);

  const chart = el('div', 'card stn-chart');
  const ch = el('div', 'stn-chart-head');
  ch.append(el('h3', null, 'Temperature, past ' + (cfg.hours || 24) + ' hours'));
  ch.append(el('div', 'stn-range', (lo != null ? Math.round(lo) : '--') + '° to ' + (hi != null ? Math.round(hi) : '--') + '°'));
  chart.append(ch);
  chart.append(sparkline(pts, cfg.gapMinutes || 30, '°'));
  const foot = el('div', 'stn-foot');
  foot.append(el('span', null, lastTime
    ? 'Last reading ' + lastTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : ''));
  foot.append(el('span', null, cfg.linkLabel || ''));
  chart.append(foot);

  body.append(now, chart);
  return frame(slide, body, cfg.credit || slide.credit);
}

/* ------------------------------------------------------------ embedded page */

function renderFrame(slide) {
  const wrap = el('div', 'iframe-wrap');
  const f = document.createElement('iframe');
  f.src = slide.src;
  f.loading = 'eager';
  f.setAttribute('scrolling', 'no');
  const z = Number(slide.zoom) > 0 ? Number(slide.zoom) : 1;
  // cropTop hides the embedded page's own banner and player buttons, which are
  // noise on a screen nobody can click. Measured in the source page's own pixels:
  // translateY runs before scale(), so it crops exactly that much off the top.
  const crop = Number(slide.cropTop) > 0 ? Number(slide.cropTop) : 0;
  if (z !== 1 || crop) {
    f.style.width = (100 / z) + '%';
    f.style.height = `calc(${100 / z}% + ${crop}px)`;
    f.style.transform = `scale(${z}) translateY(${-crop}px)`;
    f.style.transformOrigin = '0 0';
  }
  wrap.append(f);
  return frame(slide, wrap, slide.credit);
}

/* ---------------------------------------------------------------- renderers */

/* Advance a rotating list one item each time its slide comes around. */
function nextItem(key, list) {
  if (!list || !list.length) return null;
  const i = state.cursors[key] == null ? 0 : state.cursors[key];
  state.cursors[key] = (i + 1) % list.length;
  return list[i];
}

function frame(slide, bodyNode, captionText) {
  const sec = el('section', 'slide');
  const head = el('div', 'slide-head');
  const h = el('h1', 'slide-title', clean(slide.title));
  head.append(h);
  if (slide.subtitle) head.append(el('div', 'slide-sub', slide.subtitle));
  const body = el('div', 'slide-body');
  body.append(bodyNode);
  sec.append(head, body);
  sec.dataset.caption = captionText || slide.credit || '';
  return sec;
}

async function renderImage(slide) {
  const wrap = el('div', 'img-wrap' + (slide.fit === 'cover' ? ' cover' : ''));
  let loaded = null;
  for (const candidate of datedSources(slide.src, slide.frames)) {
    const src = versioned(candidate, slide.refreshMinutes);
    try {
      loaded = { img: await loadImage(src), src };
      break;
    } catch (err) {
      console.warn(err);              // try the next candidate, e.g. last month's figure
    }
  }
  if (loaded) {
    if (slide.fit !== 'cover' && slide.backdrop !== false) {
      const bg = new Image();          // same URL, so this comes straight from cache
      bg.className = 'img-bg';
      bg.alt = '';
      bg.src = loaded.src;
      wrap.append(bg);
    }
    wrap.append(loaded.img);
  } else {
    wrap.append(el('div', 'img-fail', 'Imagery temporarily unavailable.\n' + (slide.title || '')));
  }
  return frame(slide, wrap, slide.credit);
}

async function renderResearch(slide) {
  const item = nextItem('research', current(state.content?.research));
  if (!item) return frame(slide, el('div', 'empty', 'No research highlights yet.'), slide.credit);

  const split = el('div', 'split' + (item.image ? '' : ' no-media'));
  const card = el('div', 'card main');
  if (item.tag) card.append(el('div', 'tag', item.tag));
  card.append(el('h2', 'lede', clean(item.title)));
  if (item.people) card.append(el('div', 'byline', clean(item.people)));
  card.append(el('p', 'prose', clean(item.blurb)));
  split.append(card);

  if (item.image) {
    const media = el('div', 'media');
    try { media.append(await loadImage(item.image)); } catch (err) { console.warn(err); }
    split.append(media);
  }
  return frame(slide, split, item.credit || slide.credit);
}

/* Dates in content.json are plain YYYY-MM-DD; parse as local noon so the day
   never slips a square backwards across a timezone boundary. */
function parseDay(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(d).trim());
  if (!m) return null;
  const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return day.getFullYear() === Number(m[1]) && day.getMonth() === Number(m[2]) - 1
    && day.getDate() === Number(m[3]) ? day : null;
}

/* Use the display's timezone even when previewing it from another location. */
function displayToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: state.content?.site?.timezone || 'America/Denver',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (name) => parts.find((p) => p.type === name).value;
  return parseDay(`${part('year')}-${part('month')}-${part('day')}`);
}

function dayKey(day) {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

/* Highlights and notices may carry "until": "YYYY-MM-DD". They show through
   the end of that day and then retire themselves, the way past colloquia do.
   A malformed date keeps the item visible: a typo should be seen, not vanish. */
function current(list) {
  const today = displayToday();
  return (list || []).filter((it) => {
    if (!it || !it.until) return true;
    const d = parseDay(it.until);
    return !d || d >= today;
  });
}

function upcoming(list) {
  const cutoff = displayToday();
  return (list || [])
    .map((c) => ({ ...c, _d: parseDay(c.date) }))
    .filter((c) => c._d && c._d >= cutoff)
    .sort((a, b) => a._d - b._d);
}

async function renderColloquium(slide) {
  const list = upcoming(state.content?.colloquia);
  if (!list.length) {
    return frame(slide,
      el('div', 'empty', 'Colloquium schedule resumes soon — see atoc.colorado.edu'),
      slide.credit);
  }
  const next = list[0];
  const later = list.slice(1, 5);
  // The right-hand panel shows the flyer when there is one, otherwise what is
  // coming up after this talk.
  const hasPanel = Boolean(next.image) || later.length > 0;
  const split = el('div', hasPanel ? 'split' : 'split no-media');

  const card = el('div', 'card main');
  card.append(el('div', 'tag', next.tag || 'Next colloquium'));
  const when = el('div', 'when');
  when.append(el('span', 'chip gold',
    next._d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })));
  if (next.time) when.append(el('span', 'chip', next.time));
  if (next.location) when.append(el('span', 'chip', next.location));
  card.append(when);
  card.append(el('h2', 'lede', clean(next.title)));
  const who = [clean(next.speaker), clean(next.affiliation)].filter(Boolean).join(' · ');
  if (who) card.append(el('div', 'byline', who));
  if (next.abstract) card.append(el('p', 'prose', clean(next.abstract)));

  // With a flyer taking the panel, later talks still get a line under the text.
  if (next.image && later.length) {
    const also = el('div', 'also');
    also.append(el('b', null, 'Also coming up: '));
    also.append(document.createTextNode(later.map((c) =>
      c._d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      + ' ' + clean(c.speaker || c.title)).join(' · ')));
    card.append(also);
  }
  split.append(card);

  if (next.image) {
    const media = el('div', 'media');
    try { media.append(await loadImage(next.image)); } catch (err) { console.warn(err); }
    split.append(media);
  } else if (later.length) {
    const rest = el('div', 'card upnext');
    rest.append(el('h3', null, 'Also coming up'));
    for (const c of later) {
      const u = el('div', 'u');
      u.append(el('b', null, c._d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        + ' — ' + clean(c.speaker || c.title)));
      u.append(el('span', null, clean(c.title && c.speaker ? c.title : c.affiliation || '')));
      rest.append(u);
    }
    split.append(rest);
  }
  return frame(slide, split, slide.credit);
}

function renderList(slide) {
  const raw = current(slide.source === 'announcements' ? state.content?.announcements : slide.items);
  // Blank-but-present entries (a lone space, say) should not render an empty card.
  const items = raw.filter((it) => clean(it.title).trim() || clean(it.body).trim() || it.image);
  if (!items.length) {
    return frame(slide, el('div', 'empty', 'Nothing posted right now.'), slide.credit);
  }

  const per = Number(slide.perPage) > 0 ? Number(slide.perPage) : 4;
  const pages = [];
  let page = [], used = 0;
  for (const it of items) {
    const cost = it.image ? 2 : 1;
    if (page.length && used + cost > per) { pages.push(page); page = []; used = 0; }
    page.push(it);
    used += cost;
  }
  if (page.length) pages.push(page);

  const key = 'list:' + (slide.id || 'x');
  const at = state.cursors[key] == null ? 0 : state.cursors[key];
  state.cursors[key] = (at + 1) % pages.length;
  const shown = pages[at % pages.length];

  const featured = shown.filter((it) => it.image);
  const rest = shown.filter((it) => !it.image);

  const list = el('div', 'list');
  list.style.gridTemplateColumns = rest.length > 1 ? 'repeat(2, minmax(0,1fr))' : 'minmax(0,1fr)';
  if (featured.length && rest.length) {
    // The featured row carries a photo or a flyer, so give it most of the panel.
    list.style.gridTemplateRows = `2.2fr repeat(${Math.ceil(rest.length / 2)}, 1fr)`;
  }

  for (const it of featured) {
    const card = el('div', 'card feat');
    const img = new Image();
    img.src = it.image;
    img.alt = '';
    img.onerror = () => img.remove();     // a missing photo must not blank the notice
    card.append(img);
    const txt = el('div', 'feat-text');
    txt.append(el('h3', null, clean(it.title)));
    if (it.body) txt.append(el('p', null, clean(it.body)));
    card.append(txt);
    list.append(card);
  }
  for (const it of rest) {
    const card = el('div', 'card');
    card.append(el('h3', null, clean(it.title)));
    if (it.body) card.append(el('p', null, clean(it.body)));
    list.append(card);
  }

  const cap = pages.length > 1
    ? `${slide.credit ? slide.credit + ' · ' : ''}${at + 1} of ${pages.length}`
    : slide.credit;
  return frame(slide, list, cap);
}

/* ------------------------------------------------------- persistent sidebar */

function slidesInRegion(region) {
  return (state.content?.slides || []).filter((s) => s.enabled !== false && (s.region || 'main') === region);
}

function newsItems() {
  return slidesInRegion('news').flatMap((slide) => {
    const items = slide.type === 'research' ? state.content?.research
      : slide.source === 'announcements' ? state.content?.announcements : slide.items;
    return current(items).filter((item) => item && clean(item.title).trim())
      .map((item) => ({ ...item, label: item.tag || (slide.type === 'research' ? 'Research & people' : 'Department notice') }));
  });
}

function renderNews() {
  clearTimeout(state.newsTimerId);
  const items = newsItems();
  const target = $('#news-content');
  const dots = $('#news-dots');
  target.replaceChildren();
  dots.replaceChildren();
  $('#news-count').textContent = items.length ? `${state.newsIndex % items.length + 1} / ${items.length}` : '';
  if (!items.length) {
    target.append(el('p', 'sidebar-empty', 'No department news posted right now.'));
    return;
  }

  state.newsIndex %= items.length;
  const item = items[state.newsIndex];
  const article = el('article', 'news-item');
  if (item.image) {
    const media = el('div', 'news-media');
    const image = new Image();
    image.alt = ''; // The adjacent title describes this news item.
    image.onload = () => {
      const ratio = image.naturalWidth / image.naturalHeight;
      article.classList.toggle('news-with-portrait', ratio < 1.2);
    };
    image.onerror = () => {
      media.remove();
      article.classList.remove('news-with-portrait');
    };
    media.append(image);
    article.append(media);
    image.src = item.image;
  }
  const copy = el('div', 'news-copy');
  copy.append(el('div', 'news-label', clean(item.label)), el('h3', 'news-title', clean(item.title)));
  if (item.people) copy.append(el('p', 'news-byline', clean(item.people)));
  if (item.blurb || item.body) copy.append(el('p', 'news-summary', clean(item.blurb || item.body)));
  article.append(copy);
  target.append(article);

  items.forEach((_, index) => dots.append(el('span', 'news-dot' + (index === state.newsIndex ? ' on' : ''))));
  if (items.length > 1 && !state.paused) {
    const duration = Number(state.content?.site?.newsDuration) || 20;
    state.newsTimerId = setTimeout(() => { state.newsIndex++; renderNews(); }, Math.max(5, duration) * 1000);
  }
}

function calendarEvents() {
  const colloquia = slidesInRegion('calendar').some((s) => s.type === 'colloquium')
    ? state.content?.colloquia || [] : [];
  return [...colloquia, ...(state.content?.calendar || [])]
    .filter((item) => item && item.enabled !== false)
    .map((item) => ({ ...item, _d: parseDay(item.date) }))
    .filter((item) => item._d)
    .sort((a, b) => a._d - b._d);
}

function matchesCalendar(snapshot) {
  return snapshot && snapshot.calendarId === state.content.site?.googleCalendarId?.trim()
    && snapshot.timeZone === (state.content.site?.timezone || 'America/Denver');
}

async function refreshCalendar() {
  if (!state.content.site?.googleCalendarId?.trim()) return;
  try {
    const snapshot = await getJSON('calendar.json?v=' + Date.now());
    if (!matchesCalendar(snapshot) || !Array.isArray(snapshot.events)) {
      throw new Error('Invalid calendar data');
    }
    state.calendar = snapshot;
    state.calendarUnavailable = false;
  } catch (error) {
    state.calendarUnavailable = true;
    console.warn('calendar refresh', error);
  }
  renderCalendar();
}

function renderCalendar() {
  const target = $('#calendar-content');
  const status = $('#calendar-status');
  const previousScroll = target.scrollTop;
  const today = dayKey(displayToday());
  const live = matchesCalendar(state.calendar) ? state.calendar : null;
  const configured = Boolean(state.content.site?.googleCalendarId?.trim());
  const now = Date.now();
  const groups = new Map();
  for (const event of live?.events || calendarEvents()) {
    if (event.end && Date.parse(event.end) <= now) continue;
    if (!event.end && event.date < today) continue;
    const day = event.date < today ? today : event.date;
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(event);
  }

  status.textContent = '';
  if (live && (state.calendarUnavailable || now - Date.parse(live.updatedAt) > 60 * 60000)) {
    status.textContent = 'Last synced ' + new Date(live.updatedAt).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: live.timeZone,
    });
  } else if (configured && !live && groups.size) {
    status.textContent = 'Local schedule';
  }

  if (!groups.size) {
    let message = 'No upcoming events.';
    if (configured && !live) {
      message = state.calendarUnavailable ? 'Calendar temporarily unavailable.' : 'Loading events…';
    }
    target.replaceChildren(el('p', 'sidebar-empty', message));
    return;
  }

  const agenda = document.createDocumentFragment();
  const timeFmt = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: state.content.site?.timezone || 'America/Denver',
  });
  for (const [day, events] of groups) {
    const date = parseDay(day);
    const group = el('section', 'agenda-day');
    const heading = el('h3', 'agenda-date' + (day === today ? ' today' : ''));
    heading.append(el('span', 'agenda-day-number', date.getDate()));
    heading.append(el('span', 'agenda-day-label', date.toLocaleDateString('en-US', { month: 'short' })
      + ' · ' + (day === today ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short' }))));
    const list = el('ul', 'agenda-events');
    for (const event of events) {
      const row = el('li', 'agenda-event');
      let time = event.time || 'All day';
      if (event.start) {
        const start = new Date(event.start);
        const end = new Date(event.end);
        time = end > start ? timeFmt.formatRange(start, end) : timeFmt.format(start);
        time = time.replace(/:00\b/g, '');
      }
      const details = el('div', 'agenda-details');
      details.append(el('div', 'agenda-title', clean(event.title || event.speaker)));
      if (event.location) {
        const location = el('div', 'agenda-location', event.location);
        location.title = event.location;
        details.append(location);
      }
      row.append(el('span', 'agenda-time', time), details);
      list.append(row);
    }
    group.append(heading, list);
    agenda.append(group);
  }
  target.replaceChildren(agenda);
  target.scrollTop = previousScroll;
}

function refreshSidebar() {
  state.sidebarDay = dayKey(displayToday());
  renderNews();
  renderCalendar();
}

const RENDERERS = {
  image: renderImage,
  weather: (s) => refreshWeather(false).then(() => renderWeather(s)),
  station: (s) => refreshStation(false).catch((e) => console.warn('station', e)).then(() => renderStation(s)),
  iframe: async (s) => renderFrame(s),
  research: renderResearch,
  colloquium: renderColloquium,
  list: async (s) => renderList(s),
};

/* ---------------------------------------------------------- rotation engine */

function buildDots() {
  const dots = $('#dots');
  dots.replaceChildren(...state.slides.map(() => el('span', 'dot')));
}

function markDots(i) {
  [...$('#dots').children].forEach((d, k) => d.classList.toggle('on', k === i));
}

function runProgress(ms) {
  const fill = $('#progress-fill');
  fill.style.transition = 'none';
  fill.style.width = '0%';
  void fill.offsetWidth;                       // force reflow before animating
  fill.style.transition = `width ${ms}ms linear`;
  fill.style.width = '100%';
}

function pauseProgress(on) {
  const fill = $('#progress-fill');
  if (on) {
    const w = getComputedStyle(fill).width;
    fill.style.transition = 'none';
    fill.style.width = w;
  }
}

async function show(i) {
  if (!state.slides.length) {
    const node = frame({ title: 'Weather & science' }, el('div', 'empty', 'No main slides enabled.'), '');
    node.classList.add('in');
    stage.replaceChildren(node);
    $('#caption').textContent = '';
    $('#progress-fill').style.width = '0%';
    return;
  }
  if (state.reloadWhenIdle) { location.reload(); return; }
  state.index = ((i % state.slides.length) + state.slides.length) % state.slides.length;
  const slide = state.slides[state.index];
  const render = RENDERERS[slide.type] || renderList;

  let node;
  try {
    node = await withTimeout(render(slide), RENDER_TIMEOUT_MS, slide.id || slide.type);
  } catch (err) {
    console.error('render failed', slide, err);
    node = frame(slide, el('div', 'empty', 'Content temporarily unavailable.'), '');
  }

  const old = stage.querySelector('.slide.in');
  stage.append(node);
  void node.offsetWidth;
  node.classList.add('in');
  if (old) {
    old.classList.remove('in');
    setTimeout(() => old.remove(), 900);
  }
  // Anything left behind by an aborted transition.
  [...stage.querySelectorAll('.slide')].slice(0, -2).forEach((n) => n.remove());

  $('#caption').textContent = node.dataset.caption || '';
  markDots(state.index);

  const ms = (secondsOverride || slide.duration || state.content?.site?.defaultDuration || 45) * 1000;
  runProgress(ms);
  clearTimeout(state.timerId);
  if (!state.paused) state.timerId = setTimeout(() => show(state.index + 1), ms);
  else pauseProgress(true);
}

function advance(delta) {
  clearTimeout(state.timerId);
  show(state.index + delta);
}

function togglePause() {
  state.paused = !state.paused;
  renderNews();
  if (state.paused) {
    clearTimeout(state.timerId);
    pauseProgress(true);
    flash('Paused');
  } else {
    flash('Resumed');
    advance(1);
  }
}

/* ------------------------------------------------------- burn-in mitigation */

function drift() {
  const n = $('#drift');
  const r = () => (Math.random() * 2 - 1) * 6;   // ±6 px
  n.style.transform = `translate(${r().toFixed(1)}px, ${r().toFixed(1)}px)`;
}

/* ------------------------------------------------------------------- keys */

document.addEventListener('keydown', (e) => {
  if (e.target === $('#calendar-content') && ['PageUp', 'PageDown', ' '].includes(e.key)) return;
  switch (e.key) {
    case 'ArrowRight': case 'PageDown': case 'n': advance(1); break;
    case 'ArrowLeft': case 'PageUp': case 'p': advance(-1); break;
    case ' ': e.preventDefault(); togglePause(); break;
    case 'r': location.reload(); break;
    case 'f':
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
      break;
    case 'c': document.body.style.cursor = document.body.style.cursor === 'auto' ? 'none' : 'auto'; break;
  }
});
// Tapping the main panel advances its slideshow without changing the sidebar.
$('#main-panel').addEventListener('click', () => advance(1));
$('#news-panel').addEventListener('click', () => { state.newsIndex++; renderNews(); });

/* ------------------------------------------------------------- auto refresh */

/* content.json is re-read on its own, but a change to the page's own code only
   arrives with a reload. Compare those files and reload when they change, so
   a push reaches the kiosk without anyone walking over to it. The reload waits
   for the next slide change rather than cutting one off mid-view. */
const CODE_FILES = ['', 'assets/app.js', 'assets/style.css'];

async function codeVersion() {
  const parts = await Promise.all(CODE_FILES.map(async (f) => {
    try {
      const res = await fetch(f + '?v=' + Date.now(), { cache: 'no-store' });
      // A calendar-only deployment can change HTTP headers for the whole site.
      return res.ok ? await res.text() : null;
    } catch (err) {
      return null;                    // a failed check must never trigger a reload
    }
  }));
  return parts.some((p) => p === null) ? null : parts.join('|');
}

async function checkForUpdate() {
  const now = await codeVersion();
  if (!now) return;
  if (!state.codeVersion) { state.codeVersion = now; return; }
  if (now !== state.codeVersion) {
    console.info('new version published — reloading at the next slide');
    state.reloadWhenIdle = true;
  }
}

/* ------------------------------------------------------------------- boot */

async function boot() {
  tickClock();
  setInterval(tickClock, 10000);
  setInterval(drift, 8 * 60000);

  try {
    await loadContent(false);
    tickClock();
  } catch (err) {
    console.error(err);
    // A slide is invisible until it is faded in, so this one has to be shown by
    // hand — the rotation that normally does it never starts.
    const msg = location.protocol === 'file:'
      ? 'This page has to be served over http, not opened straight from the file system. '
        + 'In Terminal: cd into this folder, run  python3 -m http.server 8000  and open localhost:8000. '
        + 'On GitHub Pages it just works.'
      : 'Could not load content.json — it is missing, or it has a syntax error. '
        + 'Check the most recent commit.';
    const node = frame({ title: 'Display not started', subtitle: 'Nothing is broken on the screen itself' },
      el('div', 'empty boot-error', msg), '');
    stage.append(node);
    void node.offsetWidth;
    node.classList.add('in');
    return;
  }

  refreshAlerts();
  refreshCalendar();
  // Retire expired news and advance the calendar at midnight without a reload.
  setInterval(() => {
    if (dayKey(displayToday()) !== state.sidebarDay) refreshSidebar();
  }, 60000);
  refreshWeather(true).catch((e) => console.warn(e));
  refreshStation(true).catch((e) => console.warn('station', e));
  setInterval(() => refreshAlerts(), 5 * 60000);
  setInterval(() => refreshWeather(true).catch((e) => console.warn(e)), 10 * 60000);
  setInterval(() => refreshStation(true).catch((e) => console.warn('station', e)), 15 * 60000);

  // Pick up edits pushed to GitHub without anyone touching the laptop.
  setInterval(() => {
    loadContent(true).then((changed) => { if (changed) console.info('content.json updated'); })
      .catch((e) => console.warn('content refresh', e))
      .finally(refreshCalendar);
  }, 10 * 60000);

  // Watch for a newly published version, and reload nightly regardless: that
  // also clears anything the browser has leaked over a day on screen.
  const every = (state.content?.site?.updateCheckMinutes || 5) * 60000;
  checkForUpdate();
  setInterval(checkForUpdate, every);

  setInterval(() => {
    const h = new Date().getHours();
    if (h === 3 && Date.now() - state.startedAt > 6 * 3600000) location.reload();
  }, 10 * 60000);

  // ?start=4 jumps straight to a slide — handy when previewing one you just edited.
  const start = Number(params.get('start') || 0);
  show(Number.isFinite(start) ? start : 0);
}

boot();
