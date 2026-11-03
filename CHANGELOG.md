# Changelog

This file lists all notable changes to Star Gazer.

## [1.2.0] - 2026-11-03

### Fixed
- **"Use my GPS location" now works reliably.**
  - The app first asks for a high-accuracy GPS fix. If that times out, it retries with a quicker, coarser fix.
  - If GPS is blocked (permission denied, an embedded preview that doesn't allow location, or a page not served over HTTPS) or doesn't respond, the app explains why. It then falls back to your device's time zone, which puts you within a few hundred kilometres. That's close enough for most of the sky.
  - If location permission is turned off, the message tells you how to turn it back on.
- The place and object searches now run from the Search/Go buttons and the Enter key directly. Before, they relied on form submission, which sandboxed pages block.

### Added
- **Offline place search** covering 30,000+ cities (population 15,000 and up, from GeoNames). It works without an internet connection or an outside service. For example, you can type `Denver` or `Springfield, Illinois`. If no city matches, the app falls back to the online OpenStreetMap search.
- **Coordinate entry in the search box**, in the forms `40.71, -74.01` and `40.7N 74W`.
- **A better first-run location.** With no saved location, the app starts near you, estimated from your time zone, instead of defaulting to New York.

## [1.1.0] - 2026-11-03

### Added
- **The Milky Way**, built from a galactic-coordinate brightness model plus the brighter cloud outlines from d3-celestial. It includes the Great Rift, and it fades during twilight and in moonlight.
- **Richer stars.** Stars are drawn from colour sprites with a soft glow. The brightest stars get faint diffraction spikes, and stars twinkle, more strongly near the horizon.
- **A more natural sky.** There's a twilight glow toward the Sun, a faint airglow near the horizon at night, smoother gradients, and noise dithering to prevent colour banding.
- **A landscape silhouette:** rolling hills and a tree line along the horizon.
- **Constellation info cards.** Tap anywhere inside a constellation (not just on its lines) to open a card. It shows what the constellation represents, its mythology, what to look for, its current position, the best month to see it, the latitudes it's visible from, its brightest and named stars, and a "Center in view" button.
- **Selection highlighting.** A selected constellation's lines glow gold, and its official IAU boundary is drawn as a dashed outline.
- **Constellation links.** Star and planet cards link to the constellation they're in.
- **New View toggles:** Milky Way, twinkling stars and landscape.

### Changed
- Constellation lines now stop just short of each star so the stars stand out.

## [1.0.0] - 2026-11-03

### Added
- **The first release:** a sky view for any place and time.
  - About 5,000 stars down to magnitude 6, plus constellation lines and names.
  - The Sun, the Moon (with its correct phase) and all eight planets, positioned by Astronomy Engine.
  - Location from GPS, place search, coordinates or presets.
  - Any date or time, past or future, with step buttons and a time-lapse.
  - Drag to look around, pinch or scroll to zoom, and a phone-compass "Point" mode.
  - A "What's up" list, info cards with rise and set times, realistic daylight and twilight, and a night-vision red mode.
