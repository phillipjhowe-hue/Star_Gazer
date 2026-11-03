#!/usr/bin/env python3
"""Inline CSS and JS into a single self-contained dist/star_gazer.html."""
import os
import re

root = os.path.join(os.path.dirname(__file__), "..")
read = lambda p: open(os.path.join(root, p), encoding="utf-8").read()
html = re.sub(r'\?v=[\d.]+"', '"', read("index.html"))  # drop cache-busting query strings
# the city list is lazy-loaded on the website; inline it in the single-file build
html = html.replace('<script src="app.js">', '<script src="cities.js"></script>\n<script src="app.js">')
html = html.replace('<link rel="stylesheet" href="style.css">', "<style>\n" + read("style.css") + "\n</style>")
for src in re.findall(r'<script src="([^"]+)"></script>', html):
    js = read(src).replace("</script", "<\\/script")
    html = html.replace(f'<script src="{src}"></script>', "<script>\n" + js + "\n</script>")
os.makedirs(os.path.join(root, "dist"), exist_ok=True)
with open(os.path.join(root, "dist", "star_gazer.html"), "w", encoding="utf-8") as f:
    f.write(html)
print("wrote dist/star_gazer.html", len(html), "bytes")
