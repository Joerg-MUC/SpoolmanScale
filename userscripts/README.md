# Spoolman button: print the label on the SpoolmanScale

Spoolman's own "Print labels" renders in the browser and cannot send anything to
a Bluetooth printer. This userscript adds a button next to it that asks the
SpoolmanScale (bridge firmware, see `FORK.md`) to print the selected spool's
label on its Bluetooth label printer.

The script is `spoolman-print-label.user.js`. It talks to the scale directly,
there is no server in between. It is written for Spoolman 0.27 (the SvelteKit
interface) and a German or English UI.

## What you need

- The fork firmware with the bridge on the scale (`FORK.md`)
- On the scale: a label printer chosen, Bluetooth on, the web interface enabled
  for configuration and a numeric password set (the "PIN")
- A browser with a userscript manager. This guide uses Tampermonkey in Chrome.
  Violentmonkey works the same way; for Safari use the "Userscripts" app.

## Install Tampermonkey (Chrome)

1. Open the Chrome Web Store, search for "Tampermonkey" and choose "Add to Chrome".
2. Open `chrome://extensions`, pick "Details" on Tampermonkey and switch on
   "Allow user scripts" (older Chrome: switch on "Developer mode" at the top
   right). Without this Chrome does not run any userscript.
3. Pin the extension (puzzle icon, pin) to see its icon and badge.

## Install the script

1. Click the Tampermonkey icon, then "Create a new script".
2. Replace the whole template with the content of `spoolman-print-label.user.js`
   (on macOS: `pbcopy < userscripts/spoolman-print-label.user.js`, then paste).
3. Save with `Cmd+S` (`Ctrl+S`). The script now shows in the Tampermonkey list
   as enabled.
4. Reload Spoolman and pick a spool. The button "Auf Waage drucken (#ID)"
   appears right behind "Beschriftung drucken".
5. The first click asks for the PIN of the scale and stores it in Tampermonkey
   (not in the script). Tampermonkey also asks once whether the script may
   contact the scale: allow it, preferably "Always".

## Set it to your network

At the top of the file:

- `// @match http://10.0.0.8:7912/*` is the address you open Spoolman under.
  Another host name or port needs its own `@match` line.
- `// @connect 10.0.20.250` and `const SCALE = 'http://10.0.20.250'` are the
  address of the scale.

## Workflow

```
Spoolman (browser)                       SpoolmanScale                      Printer
------------------                       -------------                      -------
1. select a spool
   URL: /?sel=spool:49
2. button appears behind
   "Beschriftung drucken"
3. click
   POST /api/label/print?spool=49  --->  4. checks: printer chosen,
   (Basic Auth with the PIN)                Bluetooth on, no tag on the
                                            reader, no job queued
   <--- 202 queued                          (else 400 / 401 / 403 / 409)
                                         5. main loop fetches spool 49
                                            from Spoolman (like "Spool by ID"),
                                            draws the label with the scale's
                                            own layout                  ---> 6. prints,
                                                                               about 9 s
6. the button polls
   GET /api/label                 --->  7. "lastPrint" is empty until the
   until "lastPrint" is set               print is through
   and shows the verdict
```

While the label prints, the spool shows on the scale's display (as with "Spool
by ID") until the idle timeout of two minutes or until it is cleared by hand.

## What the button says

| Button text | Meaning |
|-------------|---------|
| Auf Waage drucken (#49) | ready |
| Sende ... | request on its way |
| Waage: The label was sent to the printer. | done, the text is the scale's own verdict |
| An Waage geschickt (#49) | accepted, but no verdict within 30 s |
| PIN falsch | the stored PIN is dropped, the next click asks again |
| Web-Konfiguration der Waage ist aus | enable the web interface for configuration on the scale |
| Waage belegt (Tag auf dem Reader oder Auftrag läuft) | a tag is on the reader (a spool being weighed is never replaced) or a job is queued |
| Waage nicht erreichbar (Tiefschlaf? Display antippen) | see below |

## Deep sleep

In deep sleep the scale's ESP32 is off and not on the network, so the button
shows "Waage nicht erreichbar". Touch the display to wake it. For a bridge that
should always answer, set "Tiefschlaf nach (Min.)" to the last value (never) in
the scale's display settings. The scale then stays awake and draws power
continuously.

## Limits

- One button per selected spool, one label at a time (the button waits a few
  seconds after each print).
- Spoolman only: the scale fetches the spool with the lookup of "Spool by ID".
- The button finds its place by the text "Beschriftung drucken" (or "Print
  labels"). If Spoolman changes that text, the button floats at the bottom right
  of the page instead.
- Spoolman and the scale must be reachable from the browser. The script does not
  work from a phone browser without a userscript manager.
