# Fork notes: NIIMBOT B1 Pro and the label bridge

This is a private fork of [SpoolmanScale](https://github.com/Niko11111/SpoolmanScale)
v0.8.3. It adds two things that are not in the upstream release. Everything else
is unchanged and keeps the upstream license (GPL-3.0-or-later).

The fork is not meant to go upstream as it is: the bridge works with Spoolman
only, while the scale supports several backends. The B1 Pro support was
reported upstream as
[issue #98](https://github.com/Niko11111/SpoolmanScale/issues/98).

## Branches

| Branch | Base | Content |
|--------|------|---------|
| `feature/niimbot-b1-pro` | upstream `main` (v0.8.3) | NIIMBOT B1 Pro as a label printer |
| `bridge/print-by-id` | `feature/niimbot-b1-pro` | the print-by-id bridge, the Spoolman userscript, plus this file (`FORK.md`) |

## NIIMBOT B1 Pro (model id 0x1001 = 4097)

The upstream driver did not know this id and stopped with "The scale does not
know this NIIMBOT model yet". The B1 Pro reports protocol 5 but needs the print
sequence niimbluelib calls the `D110M_V4` task (for every protocol version), which
none of the other NIIMBOT models here use:

- label type before density, a nine byte print start, no page start
- a thirteen byte page size, sent after a status request nobody waits for
- a heartbeat after the print end, for the printer to drop
- 300 dpi, a 567 dot head (568 dot row, as on the M2), direct thermal: no
  ribbon, so the label does not survive a dryer

The model has its own class, so the M2 (ribbon) and the B1 Pro (direct thermal)
do not accept each other's printer. Tested on a real B1 Pro. The B1, B21 and M2
sequences are unchanged. The model is marked experimental in the printer list.

### Model number and switching firmware

The printer model is stored in the scale's settings as a number. In this fork
(based on v0.8.3) the B1 Pro is 10. In upstream `dev` and in the pull request
that adds it there (#99) it is 12. After switching between this firmware and a
`dev` build the stored number is unknown to the other one, and the scale falls
back to the Phomemo M220. Choose "NIIMBOT B1 Pro" again under Printer, on the
touch screen or in the web interface: the printer address and the label size
stay. Printing before that sends Phomemo commands to the B1 Pro and fails.

## Bridge: print a spool's label over HTTP

The scale already holds the Bluetooth link to the printer. The bridge lets
something else ask for a label, for example a home automation, when the server
has no Bluetooth of its own.

```
POST /api/label/print?spool=42            label of spool 42
POST /api/label/print?spool=42&kind=1     the filament's label instead
GET  /api/label                           field "lastPrint": the last result,
                                          null until it is in; "canPrint"
```

- **Access:** the same gate as the label page: the web interface must be
  enabled for configuration, and the numeric password of the scale is sent as
  HTTP Basic Auth (any user name).
- **Answers:** `202` queued. `400` bad id (1 to 999999). `409` no printer
  chosen, Bluetooth off or stuck, a tag on the reader, or a job already queued.
  A tag on the reader is a spool being weighed, so it is never replaced.
- **Flow:** the handler only parks the id. The main loop fetches the spool from
  the backend like "Spool by ID" does, prints, and keeps the verdict for
  `lastPrint`. The spool shows on the display until the idle timeout of two
  minutes, or until it is cleared.
- **Backend:** Spoolman only, because the lookup is the one of "Spool by ID".
- **Deep sleep:** in deep sleep the scale is off the network and does not answer. Touch the display to wake it, or set "Tiefschlaf nach (Min.)" to never in the display settings for a bridge that should always be there.

Example:

```
curl -u scale:<password> -X POST "http://<scale>/api/label/print?spool=42"
curl -u scale:<password> http://<scale>/api/label
```

## Spoolman button (userscript)

`userscripts/spoolman-print-label.user.js` adds a button "Auf Waage drucken" next
to Spoolman's "Beschriftung drucken". It calls the bridge directly from the
browser. Installation with Tampermonkey, configuration and the workflow are in
`userscripts/README.md`.

## Build and install

PlatformIO, environment `wt32-sc01-plus`:

```
pio run
```

`scripts/check.sh` passes. The OTA image is
`releases/v0.8.3/ota_browser/SpoolmanScale_v0.8.3.bin`: upload it on the scale's
web interface under Firmware. The version number stays v0.8.3, so the image is
told apart by the extra printer model. "Check for updates" installs the upstream
release again and removes both changes.
