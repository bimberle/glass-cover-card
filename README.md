# Glass Cover Card

Eine responsive Home-Assistant-Lovelace-Karte zur Steuerung einer Jalousie. Sie zeigt die Position, bietet Hoch/Stopp/Runter und ein Schnellwahlmenue. Der Lamellenregler kann in der Kartenkonfiguration ausgeblendet werden.

## Installation ueber Marketplace / HACS

Das GitHub-Repository muss **oeffentlich** sein und exakt `glass-cover-card` heissen. HACS erkennt Dashboard-Karten daran, dass eine JavaScript-Datei denselben Namen wie das Repository traegt. Die Datei `glass-cover-card.js` und `hacs.json` liegen deshalb im Repository-Hauptverzeichnis.

1. Erstelle ein oeffentliches GitHub-Repository mit dem Namen `glass-cover-card`, einer kurzen Beschreibung wie `Responsive Home Assistant blind cover card` und den Topics `home-assistant`, `lovelace`, `dashboard` und `hacs`; lade den Inhalt dieses Projekts hoch.
2. Erstelle eine GitHub-Release mit dem Tag `v1.0.0`. HACS verwendet die neueste Release als installierbare Version.
3. Oeffne in Home Assistant **Einstellungen > Marketplace** (ab Home Assistant 2026.11) beziehungsweise **HACS** (bis Home Assistant 2026.10).
4. Oeffne das Menue oben rechts und waehle **Benutzerdefinierte Repositories**.
5. Fuege `https://github.com/<dein-github-name>/glass-cover-card` hinzu und waehle den Typ **Dashboard**.
6. Suche im Marketplace/HACS nach **Glass Cover Card**, oeffne den Eintrag und installiere ihn.
7. Fuege die Karte im Dashboard-Editor als benutzerdefinierte Karte hinzu oder verwende die YAML-Konfiguration unten.

Ab Home Assistant 2026.11 werden Dashboard-Ressourcen aus `/local/community/` bereitgestellt. Falls Home Assistant die Ressource nicht automatisch registriert, fuege unter **Einstellungen > Dashboards > Ressourcen** `/local/community/glass-cover-card/glass-cover-card.js` als **JavaScript-Modul** hinzu. Bei aelteren HACS-Versionen lautet der Ressourcenpfad normalerweise `/hacsfiles/glass-cover-card.js`.

## Manuelle Installation

Alternativ kannst du `glass-cover-card.js` nach `/config/www/glass-cover-card.js` kopieren und unter **Einstellungen > Dashboards > Ressourcen** den Pfad `/local/glass-cover-card.js` als **JavaScript-Modul** registrieren.

## Kartenkonfiguration

Fuege die Karte im Dashboard-Editor hinzu:

```yaml
type: custom:glass-cover-card
entity: cover.wohnzimmer
name: Wohnzimmer
title: Beschattung
show_tilt: true
# Optional, falls die Lamellenposition von einer anderen Cover-Entitaet stammt:
# tilt_entity: cover.wohnzimmer_lamellen
```

Alternativ kann die Karte im Dashboard-Editor unter **Benutzerdefinierte Karten** ausgewaehlt und dort konfiguriert werden.

## Optionen

| Option | Standard | Beschreibung |
| --- | --- | --- |
| `entity` | erforderlich | Cover-Entitaet fuer Fahrt und Position |
| `name` | Friendly Name | Name in der Kartenueberschrift |
| `title` | `Beschattung` | Kleine Ueberschrift oberhalb des Namens |
| `show_tilt` | `true` | Lamellen-Schieberegler anzeigen oder ausblenden |
| `tilt_entity` | `entity` | Optionale Cover-Entitaet fuer die Lamellenposition |

Das Schnellwahlmenue oben rechts enthaelt **ganz hoch**, **ganz runter** und **ganz runter mit Lamellenposition 50 %**. Die kombinierte Aktion ruft erst `cover.close_cover` und danach `cover.set_cover_tilt_position` auf.

Die Cover-Integration muss die jeweiligen Home-Assistant-Dienste und Attribute unterstuetzen. Die Karte hat keine externen Abhaengigkeiten.