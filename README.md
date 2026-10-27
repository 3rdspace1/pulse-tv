# Pulse Sport for Samsung TVs (TizenBrew module)

The TV guide from pulsesports.stream/guide, plus your own IPTV provider's sport channels (Xtream login), played on the TV.
Your provider login stays on the TV. The local helper in `service/` runs on the TV itself; nothing is relayed through our server.

Install: put TizenBrew on the TV once (TV in Developer Mode, then the TizenBrew Installer), then add this module in
TizenBrew's module manager and open **Pulse Sport**.

Rebuild the page after changing the guide (worker/src/tv.js) or `app/prov.js`: `node tvapp/build.mjs`.
