#!/usr/bin/env python3
"""Builds cities.js (offline place search) and the time-zone location table.

Usage: build_places.py <cities500.json from github.com/lmfmaier/cities-json> [min_population]
Cities: GeoNames (CC BY 4.0). Time zones: IANA tz database zone1970.tab / zone.tab (public domain).
"""
import json, os, re, sys

root = os.path.join(os.path.dirname(__file__), "..")
src = sys.argv[1]
minpop = int(sys.argv[2]) if len(sys.argv) > 2 else 15000

rows = []
for c in json.load(open(src, encoding="utf-8")):
    try:
        pop = int(c.get("pop") or 0)
    except ValueError:
        continue
    if pop < minpop:
        continue
    name = c["name"].replace("|", " ").strip()
    adm = (c.get("admin1") or "").replace("|", " ").strip()
    rows.append((pop, f'{name}|{adm}|{c["country"]}|{float(c["lat"]):.3f}|{float(c["lon"]):.3f}|{pop // 1000}'))
rows.sort(key=lambda r: -r[0])
body = "\\n".join(r[1] for r in rows).replace('"', '\\"')
with open(os.path.join(root, "cities.js"), "w", encoding="utf-8") as f:
    f.write("// Cities with population >= %d from GeoNames (CC BY 4.0), via github.com/lmfmaier/cities-json\n" % minpop)
    f.write("// name|region|country|lat|lon|population(thousands), sorted by population\n")
    f.write('var CITIES_DB = "' + body + '";\n')

def iso6709(s):
    m = re.match(r"([+-]\d{2})(\d{2})(\d{2})?([+-]\d{3})(\d{2})(\d{2})?$", s)
    la = int(m[1][1:]) + int(m[2]) / 60 + int(m[3] or 0) / 3600
    lo = int(m[4][1:]) + int(m[5]) / 60 + int(m[6] or 0) / 3600
    return round(la * (1 if m[1][0] == "+" else -1), 3), round(lo * (1 if m[4][0] == "+" else -1), 3)

tz = {}
for fn in ("zone.tab", "zone1970.tab"):
    for line in open("/usr/share/zoneinfo/" + fn):
        if line.startswith("#") or not line.strip():
            continue
        parts = line.split("\t")
        lat, lon = iso6709(parts[1])
        tz[parts[2].strip()] = [lat, lon]
with open(os.path.join(root, "timezones.js"), "w", encoding="utf-8") as f:
    f.write("// Representative coordinates for IANA time zones (tz database zone.tab / zone1970.tab, public domain)\n")
    f.write("const TZ_COORDS=" + json.dumps(tz, separators=(",", ":")) + ";\n")
print(len(rows), "cities;", len(tz), "zones")
