# Mein Hub

GitHub-Pages-Version von „Mein Hub“.

## Dateien

- `index.html` – Webseite
- `style.css` – Design
- `script.js` – Funktionen

## GitHub Pages aktivieren

1. Repository auf GitHub erstellen.
2. Diese drei Dateien direkt ins Repository hochladen.
3. **Settings → Pages** öffnen.
4. Bei **Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: **main**
   - Folder: **/(root)**
5. Speichern.
6. Nach dem Deployment ist die Seite über deine GitHub-Pages-Adresse erreichbar.

## Wichtig zur Anmeldung / Daten

Diese Version speichert Benutzer, Aufgaben, Kalender usw. mit `localStorage`.
Das bedeutet: Die Daten sind **nur im jeweiligen Browser/Gerät** gespeichert und werden nicht zwischen verschiedenen Besuchern synchronisiert.

Außerdem ist das aktuelle Dev-Passwort im JavaScript sichtbar. Für eine echte öffentliche Webseite ist das **nicht sicher**. Für eine echte Benutzeranmeldung mit gemeinsamen Daten brauchst du ein Backend bzw. einen Auth-/Datenbankdienst.
