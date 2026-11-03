# Star Gazer

A browser app that shows which constellations, stars and planets are in the sky from any place at any time.

**Live app:** https://phillipjhowe-hue.github.io/Star_Gazer/

## Features

- **Your location by GPS.** If GPS is unavailable, the app estimates your location from your time zone. You can also search 30,000+ cities offline, type in coordinates, or pick a preset (Atacama, Reykjavík, the poles and others).
- **Any date and time, past or future.** Step by an hour, a day, a week, 30 days or a year, or run a time-lapse at up to one day per second.
- **A realistic sky view.** Drag to look around, and pinch or scroll to zoom. On a phone, **Point** mode lets you aim the phone at the sky.
- **About 5,000 stars** down to magnitude 6, shown in their real colours with soft glows. The brightest stars have diffraction spikes, and stars gently twinkle (more strongly near the horizon).
- **The Milky Way**, including the Great Rift. It fades out during twilight and in moonlight.
- **Constellation lines and names.** Tap anywhere inside a constellation to highlight its lines and official boundary and open an info card. The card shows what the constellation represents, its mythology, what to look for, the best month to see it, the latitudes it's visible from and its brightest stars.
- **A landscape horizon** with hills and trees, plus twilight glow toward the Sun and faint airglow near the horizon.
- **The Sun, the Moon (with its correct phase and orientation) and all eight planets.**
- **Realistic daylight and twilight.** Stars fade in as the Sun sets, and a ground layer hides whatever is below the horizon.
- **A "What's up" list** that rates each planet as visible, low, washed out by daylight or below the horizon, and lists the constellations above the horizon. You can also search for any named star, planet or constellation.
- **Tap any object for details:** its altitude and azimuth, magnitude, distance, phase, and next rise and set times.
- **A night-vision red mode** that protects your dark-adapted eyes.

## Running it

It's a static site with no build step. Open `index.html` through any web server (for example `python3 -m http.server`), or use the GitHub Pages link above. GPS and phone-compass mode need HTTPS or localhost.

See [CHANGELOG.md](CHANGELOG.md) for the release history.

`tools/build_places.py` regenerates `cities.js` and `timezones.js`.
`tools/bundle.py` creates a single self-contained `dist/star_gazer.html`.
`tools/build_data.py` regenerates `data.js` (stars, lines, boundaries and the Milky Way model built by `tools/build_milkyway.py`) from the d3-celestial data files.

## Credits

- Planet, Sun and Moon positions, precession and nutation: [Astronomy Engine](https://github.com/cosinekitty/astronomy) by Don Cross (MIT licence).
- Star catalogue, constellation lines and boundaries: [d3-celestial](https://github.com/ofrohn/d3-celestial) by Olaf Frohn (BSD-3-Clause licence).
- Offline city list: [GeoNames](https://www.geonames.org) via [cities-json](https://github.com/lmfmaier/cities-json) (CC BY 4.0). Time-zone locations: the IANA tz database. Online fallback search: OpenStreetMap Nominatim.
