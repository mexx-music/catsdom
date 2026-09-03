# Catsdom – Pfoten-Puzzle

Catsdom ist ein eigenständiger Katzen-Puzzle-Prototyp mit einem 8×8-Brett,
sechs Symboltypen, Nachbar-Tausch, 3+-Erkennung, Kaskaden, Punkten und Zuglimit.

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

## Android-App

Das vorhandene Android-Studio-Projekt bleibt unverändert aufgebaut. Ein
Debug-Build kann im Projektordner mit `./gradlew assembleDebug` erzeugt werden.

## Veröffentlichung

Der Workflow in `.github/workflows/pages.yml` veröffentlicht den Ordner `web`
automatisch über GitHub Pages, sobald Änderungen auf `main` gepusht werden.
