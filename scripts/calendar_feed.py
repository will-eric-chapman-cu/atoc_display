"""Convert the public Google iCalendar feed into the lobby agenda's JSON."""

import argparse
import json
from datetime import UTC, datetime, time, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from time import monotonic
from urllib.parse import quote, urlsplit
from urllib.request import urlopen
from zoneinfo import ZoneInfo

import recurring_ical_events
from icalendar import Calendar


ROOT = Path(__file__).resolve().parents[1]
REFRESH_SECONDS = 10 * 60
LOOKAHEAD_DAYS = 90


def event_rows(event, today, stop, zone):
    if str(event.get("STATUS", "")).upper() == "CANCELLED":
        return
    if str(event.get("CLASS", "")).upper() in {"PRIVATE", "CONFIDENTIAL"}:
        return

    title = " ".join(str(event.get("SUMMARY", "")).split())
    if not title:
        return
    location = " ".join(str(event.get("LOCATION", "")).split())
    start, end = event.start, event.end
    if isinstance(start, datetime):
        start = start.replace(tzinfo=start.tzinfo or zone).astimezone(zone)
        end = end.replace(tzinfo=end.tzinfo or zone).astimezone(zone)
        if start.date() < stop and (start.date() >= today or end.date() >= today):
            yield {
                "date": start.date().isoformat(),
                "title": title,
                "location": location,
                "start": start.isoformat(),
                "end": end.isoformat(),
            }
        return

    day = max(start, today)
    # iCalendar all-day end dates are exclusive.
    while day < min(end, stop):
        yield {"date": day.isoformat(), "title": title, "location": location}
        day += timedelta(days=1)


def calendar_json():
    site = json.loads((ROOT / "content.json").read_text(encoding="utf-8"))["site"]
    calendar_id = site.get("googleCalendarId", "").strip()
    zone = ZoneInfo(site.get("timezone", "America/Denver"))
    now = datetime.now(zone)
    today = now.date()
    stop = today + timedelta(days=LOOKAHEAD_DAYS)
    rows = []
    if calendar_id:
        url = f"https://calendar.google.com/calendar/ical/{quote(calendar_id, safe='')}/public/basic.ics"
        with urlopen(url, timeout=10) as response:
            calendar = Calendar.from_ical(response.read())
        start_at = datetime.combine(today, time.min, zone)
        end_at = datetime.combine(stop, time.min, zone)
        for event in recurring_ical_events.of(calendar).between(start_at, end_at):
            rows.extend(event_rows(event, today, stop, zone))

    def sort_key(row):
        start = datetime.fromisoformat(row["start"]).timestamp() if "start" in row else float("-inf")
        return row["date"], start, row["title"].casefold()

    rows.sort(key=sort_key)
    return json.dumps({
        "calendarId": calendar_id,
        "timeZone": zone.key,
        "updatedAt": now.astimezone(UTC).isoformat(),
        "events": rows,
    }, ensure_ascii=False).encode("utf-8")


def serve(port):
    # Serve the same JSON path that GitHub Pages uses, with an in-memory cache.
    lock = Lock()
    cached = None
    refresh_at = 0

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(ROOT), **kwargs)

        def do_GET(self):
            nonlocal cached, refresh_at
            if urlsplit(self.path).path != "/calendar.json":
                return super().do_GET()
            with lock:
                if monotonic() >= refresh_at:
                    try:
                        cached = calendar_json()
                        refresh_at = monotonic() + REFRESH_SECONDS
                    except (OSError, ValueError) as error:
                        self.log_error("Calendar refresh failed: %s", error)
                        refresh_at = monotonic() + 60
                payload = cached
            if payload is None:
                self.send_error(503, "Calendar feed unavailable")
                return
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    with ThreadingHTTPServer(("127.0.0.1", port), Handler) as server:
        print(f"ATOC preview at http://127.0.0.1:{port}/", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    output = parser.add_mutually_exclusive_group(required=True)
    output.add_argument("--output", type=Path, help="Write calendar JSON to this file")
    output.add_argument("--serve", type=int, metavar="PORT", help="Serve a local preview")
    args = parser.parse_args()
    if args.output is not None:
        args.output.write_bytes(calendar_json())
    else:
        serve(args.serve)
