# Catsdom – Pfoten-Puzzle

Catsdom ist ein eigenständiger Katzen-Puzzle-Prototyp mit einem 8×8-Brett,
sechs Symboltypen, Tap- und Drag-Steuerung, 3+-Erkennung, Kaskaden und Pfotenbomben.
Erfolgreiche Züge legen die aktuell aktive Katze räumlich frei. Neun Katzen werden
nacheinander entdeckt und bleiben in der lokalen 3×3-Sammlung gespeichert.
Die Bewegungswerte für Tausch, Fall und Landung sind für Web und Android zentral
gebündelt, damit sich das Spielgefühl nach Gerätetests gezielt feinjustieren lässt.

## Web-App testen

Voraussetzung: Node.js 20 oder neuer.

```bash
cd web
npm run dev
```

Danach `http://127.0.0.1:4173` im Browser öffnen.

Die Spiellogik lässt sich ohne zusätzliche Pakete testen:

```bash
cd web
npm test
```

Die Web-App ist als PWA installierbar. Auf iPad und iPhone lässt sie sich über
`Teilen → Zum Home-Bildschirm` hinzufügen und anschließend im Vollbild sowie
nach dem ersten vollständigen Laden auch offline starten.

## Katzen-Inhalte

Die neun Starter-Katzen bleiben Bestandteil der App. Weitere Katzen können über
einen kleinen, provider-neutralen JSON-Katalog veröffentlicht werden. Beim Start
verwendet Catsdom sofort den lokalen Katalog, prüft im Hintergrund auf neue
veröffentlichte Katzen und fällt ohne Internet automatisch auf den letzten
gültigen Stand zurück. Das große Katzenbild wird erst geladen, wenn diese Katze
wirklich gespielt wird, und anschließend separat offline gespeichert.

Spielstand und Bilder sind bewusst getrennt: Fortschritt hängt an einer stabilen
Katzen-ID, während eine neue Bildversion neu geladen werden darf. Dadurch gehen
Entdeckungen und bereits freigelegte Felder bei Inhalts-Updates nicht verloren.
Das Katalogformat und die vorgesehene Moderationsgrenze sind in
`web/cats/README.md` dokumentiert.

## Android-App

Das vorhandene Android-Studio-Projekt bleibt unverändert aufgebaut. Ein
Debug-Build kann im Projektordner mit `./gradlew assembleDebug` erzeugt werden.

## Veröffentlichung

Der Workflow in `.github/workflows/pages.yml` veröffentlicht den Ordner `web`
automatisch über GitHub Pages, sobald Änderungen auf `main` gepusht werden.
