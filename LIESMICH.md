# Beats Workspace — Mobile-App & PWA

Die App ist für mobile Browser (iPhone/iPad Safari, Android Chrome/Edge) optimiert und als Progressive Web App (PWA) installierbar.

## Was sich geändert hat

- **Mobile-first, responsives Layout:** Viewport-Meta-Tag, berührungsfreundliche Buttons (mindestens 44 × 44 px), kein horizontales Scrollen.
- **Navigation auf schmalen Bildschirmen:** ausklappbare Sidebar (Hamburger-Menü) sowie eine feste untere Navigation (Home, Kanäle, Nachrichten, Anrufe, Notizen).
- **PWA:** `manifest.webmanifest` (Name, Kurzname, Start-URL, Standalone-Modus, Theme-Farbe, Icons 192 und 512 px) plus `sw.js` Service Worker mit Offline-Cache für alle App-Dateien.
- **Apple-"Zum Home-Bildschirm"-Meta-Tags** sind in `index.html` hinterlegt.
- **Nur relative Pfade:** Die App läuft auf jedem Webserver und in jedem Unterordner (z. B. `meinserver.de/beats-workspace/`).
- **Bestehende Funktionen bleiben unverändert:** Kanäle, Direktnachrichten, Nachrichten, Antworten, Reaktionen, Dateianhänge (simuliert), Notizen, Huddles (simuliert) und die lokale Speicherung im Browser (localStorage).

## Lokale Nutzung im WLAN (Handy / Tablet öffnen)

1. Den Ordner `beats-workspace` auf einem Computer im selben WLAN über einen Webserver bereitstellen, zum Beispiel (im Ordner `beats-workspace` ausgeführt):
   - Python: `python -m http.server 8000`
   - Node.js: `npx serve .`
   - PHP: `php -S 0.0.0.0:8000`
2. Die lokale IP-Adresse des Computers herausfinden (Windows: `ipconfig`, macOS/Linux: `ifconfig` oder `ip addr`), zum Beispiel `192.168.178.45`.
3. Handy oder Tablet in dasselbe WLAN einwählen und im Browser öffnen:

   ```
   http://<IP-Adresse>:8000
   ```

   (Port anpassen, falls ein anderer verwendet wird.)

Weder Computer noch Handy dürfen eine Firewall haben, die den Port blockiert, und beide Geräte müssen im gleichen WLAN hängen.

## Installation auf dem Home-Bildschirm

### iPhone / iPad (Safari)
1. Die App-URL in **Safari** öffnen (nicht in Chrome oder anderen Browsern).
2. Auf die **Teilen-Taste** (Quadrat mit Pfeil nach oben) tippen.
3. **"Zum Home-Bildschirm"** auswählen und bestätigen.
4. Das App-Symbol erscheint auf dem Home-Bildschirm. Die App startet dann im Vollbild-Modus (ohne Browser-Adressleiste) und nutzt die Theme-Farbe.

### Android (Chrome / Edge)
1. Die App-URL in **Chrome** öffnen.
2. Menü (⋮) → **"Zum Startbildschirm hinzufügen"** bzw. **"App installieren"**.
3. Bestätigen. Das Symbol erscheint auf dem Startbildschirm bzw. im App-Drawer.

## Offline-Nutzung

Nach dem ersten Besuch cached der Service Worker (`sw.js`) alle App-Dateien (HTML, CSS, JavaScript, Bilder/Icons, Manifest). Die App lässt sich danach auch ohne Internetverbindung öffnen. Nachrichten, Kanäle, Dateien und Notizen werden lokal im Browser gespeichert (localStorage) und bleiben erhalten.

## Wichtige Hinweise für den lokalen WLAN-Test

- Über `http://<IP>` im WLAN funktioniert die App selbst auf allen Geräten vollständig.
- Viele Browser verlangen für den Service-Worker und den automatischen "Installieren"-Prompt einen **sicheren Kontext (HTTPS oder localhost)**. Auf Android kann der Installations-Prompt und der Offline-Cache über eine WLAN-IP mit `http://` daher erst nach einem HTTPS-Zugang (z. B. über einen Tunnel-Dienst) oder direkt bei einem auf dem Gerät selbst laufenden Server (`localhost`) erscheinen.
- Auf dem iPhone wird die App über Safari unabhängig von HTTPS zum Home-Bildschirm hinzugefügt.
- Alle Pfade in der App sind relativ, daher funktioniert die Nutzung aus einem Unterordner eines Webservers ohne Anpassungen.

## Dateien in `beats-workspace`

- `index.html` — App-Hauptdatei (PWA-Meta-Tags, Service-Worker-Registrierung, Bottom-Navigation)
- `manifest.webmanifest` — PWA-Manifest
- `sw.js` — Service Worker mit Offline-Cache
- `assets/icon-192.svg`, `assets/icon-512.svg` — PWA-Icons (können jederzeit durch PNG-Dateien gleichen Namens ersetzt werden)
- `assets/logo.svg` — App-Logo (wird auch als `apple-touch-icon` verwendet)
- `css/style.css`, `css/components.css` — Styles (responsiv, mobile-first)
- `js/data.js`, `js/storage.js`, `js/ui.js`, `js/app.js` — Anwendungscode (bestehende Funktionen unverändert)

## Schnellstart (Windows-PC)
1. Doppelklick auf `start-app.cmd` in diesem Ordner. Beim ersten Mal fragt Windows evtl., ob Node im privaten Netzwerk kommunizieren darf: «Zulassen».
2. Das Fenster zeigt eine Adresse wie `http://192.168.x.x:8080`. Diese auf dem Handy (gleiches WLAN) in Safari bzw. Chrome öffnen.
3. Zum Home-Bildschirm hinzufügen (iPhone: Teilen > «Zum Home-Bildschirm»).

Hinweis: Der Offline-Modus (Service Worker) funktioniert nur über HTTPS oder auf `localhost`. Über die WLAN-Adresse läuft die App normal, nur nicht offline. Für vollen Offline-Betrieb später auf einem Server mit HTTPS hosten.
