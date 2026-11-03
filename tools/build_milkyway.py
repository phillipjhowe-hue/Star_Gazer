#!/usr/bin/env python3
"""Builds a Milky Way brightness point cloud (RA/Dec J2000) for data.js.

A smooth model in galactic coordinates (bright toward the galactic centre, with the
Great Rift) is combined with the brighter cloud outlines from d3-celestial's mw.json.
Usage: build_milkyway.py <d3-celestial/data> -> prints JSON array [[raDeg, decDeg, intensity], ...]
"""
import json, os, sys
import numpy as np
from matplotlib.path import Path

src = sys.argv[1]
mw = json.load(open(os.path.join(src, "mw.json")))
rng = np.random.default_rng(7)

# galactic -> equatorial (J2000)
Rg = np.array([[-0.0548755604, 0.4941094279, -0.8676661490],
               [-0.8734370902, -0.4448296300, -0.1980763734],
               [-0.4838350155, 0.7469822445, 0.4559837762]])

step = 1.1
pts = []
for b in np.arange(-40, 40, step):
    st = step / np.cos(np.radians(b))
    for l in np.arange(0, 360, st):
        pts.append((l + rng.uniform(-st / 3, st / 3), b + rng.uniform(-step / 3, step / 3)))
G = np.array(pts)
l, b = np.radians(G[:, 0]), np.radians(G[:, 1])
gv = np.stack([np.cos(b) * np.cos(l), np.cos(b) * np.sin(l), np.sin(b)], 1)

ev = gv @ Rg.T  # galactic -> equatorial
ra = np.degrees(np.arctan2(ev[:, 1], ev[:, 0])) % 360
dec = np.degrees(np.arcsin(np.clip(ev[:, 2], -1, 1)))

L = np.where(G[:, 0] > 180, G[:, 0] - 360, G[:, 0])  # -180..180
Bd = G[:, 1]
width = 5 + 7 * np.exp(-(L / 40) ** 2)            # thicker bulge near the centre
along = 0.35 + 0.65 * np.exp(-(L / 70) ** 2) + 0.25 * np.exp(-((np.abs(L) - 75) / 25) ** 2)  # Cygnus/Carina brightening
inten = along * np.exp(-(Bd / width) ** 2)
# Great Rift: dark lane from Cygnus (l~80) to Sagittarius (l~0), slightly north of the plane
rift = np.where((L > -5) & (L < 85), 0.55 * np.exp(-((Bd - 1.5) / 2.2) ** 2), 0)
inten *= 1 - rift
# clumpy texture
inten *= 0.75 + 0.5 * rng.random(len(inten))

# brighter structure from d3-celestial outlines (only rings that don't wrap the seam)
P = np.c_[np.where(ra > 180, ra - 360, ra), dec]
level = np.zeros(len(P))
for f in mw["features"]:
    lv = int(f["id"][2])
    if lv < 2:
        continue
    inside = np.zeros(len(P), bool)
    for poly in f["geometry"]["coordinates"]:
        for ring in poly:
            r = np.array(ring)
            if np.abs(np.diff(r[:, 0])).max() > 180:
                continue
            inside ^= Path(r).contains_points(P)
    level[inside] = np.maximum(level[inside], lv)
inten += 0.12 * np.maximum(level - 1, 0)

keep = inten > 0.06
out = [[round(float(a), 2), round(float(d), 2), round(float(min(i, 1)), 2)] for a, d, i in zip(ra[keep], dec[keep], inten[keep])]
print(json.dumps(out, separators=(",", ":")))
print(len(out), file=sys.stderr)
