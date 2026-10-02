# VOR Trainer

Interactive VOR radio-navigation trainer with CDI, RMI and HSI. Runs in the browser, no install.

Move the aircraft on a chart around a VOR station and watch the instruments respond.

**Try it online:** https://resorek.github.io/NAV-Instruments-CDI-RMI-HSI/

## Run it locally

Download the repository (Code → Download ZIP), unzip it and open `index.html` in any modern browser (Chrome, Edge, Firefox, Safari). Everything works offline: no server, no build step, no dependencies.

## What's inside

- **Chart** with a VOR / VOR-DME station drawn in ICAO style: compass rose with the magnetic-north arrow, radial line, selected-course (OBS) line.
- **CDI**: course deviation indicator with OBS knob and TO/FROM flag. 1 dot = 2°, full scale = 10°.
- **RMI**: two needles (VOR / ADF switchable) on a heading card, with DME-L / DME-R windows.
- **HSI**: course pointer, deviation bar and TO/FROM indicator on a heading card, plus a heading bug.
- **Readouts**: HDG, RB, QDR, QDM and DME.
- **Simple flight**: ground speed and time acceleration; Reset returns the aircraft to where it was before you pressed Fly.

## Controls

| Action | Control |
|---|---|
| Move the aircraft | drag it, or double-click on the map |
| Turn the aircraft | drag the circle ahead of the nose, `←` / `→` (Shift = 10°), or mouse wheel over the aircraft |
| Zoom the map | mouse wheel over the map |
| Fly / stop | `Space` or the Fly button |
| Course (OBS / CRS) | drag the knob or scroll over the CDI / HSI (Shift = 10°) |
| Heading bug | drag the HSI HDG knob; click it to sync the bug to the current heading |
| RMI needle source | click the RMI knobs (VOR ↔ ADF) |

## Simplifications

- Magnetic variation is 0°, so map north is magnetic north.
- The aircraft flies at a fixed 5,000 ft, so DME shows slant range (about 0.8 NM directly over the station).
- No wind yet.
- There is no NDB on the map yet, so an RMI needle set to ADF has no signal and parks at 3 o'clock.

## Files

| File | Contents |
|---|---|
| `index.html` | page layout and controls |
| `style.css` | styling |
| `app.js` | map, aircraft, flight and VOR receiver logic |
| `cdi.js`, `rmi.js`, `hsi.js` | the instruments |
