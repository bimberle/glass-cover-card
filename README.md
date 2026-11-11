# Glass Cover Card

Eine responsive Home-Assistant-Lovelace-Karte zur Steuerung einer Jalousie. Sie zeigt die Position, bietet Hoch/Stopp/Runter sowie „geschlossen mit Lamellen auf 50 %“ und ein Schnellwahlmenue. Der Lamellenregler kann in der Kartenkonfiguration ausgeblendet werden.

<img src="designvorlage.png" alt="Vorschau der Glass Cover Card" width="560">

## Installation ueber Marketplace / HACS

Das GitHub-Repository muss **oeffentlich** sein und exakt `glass-cover-card` heissen. HACS erkennt Dashboard-Karten daran, dass eine JavaScript-Datei denselben Namen wie das Repository traegt. Die Datei `glass-cover-card.js` und `hacs.json` liegen deshalb im Repository-Hauptverzeichnis.

1. Das oeffentliche Repository [bimberle/glass-cover-card](https://github.com/bimberle/glass-cover-card) ist vorbereitet. Fuer ein eigenes Fork muss der Repo-Name `glass-cover-card` lauten und eine kurze Beschreibung sowie die Topics `home-assistant`, `lovelace`, `dashboard` und `hacs` gesetzt sein.
2. HACS verwendet die neueste GitHub-Release als installierbare Version. Aktuell ist `v1.6.0` veroeffentlicht.
3. Oeffne in Home Assistant **Einstellungen > Marketplace** (ab Home Assistant 2026.11) beziehungsweise **HACS** (bis Home Assistant 2026.10).
4. Oeffne das Menue oben rechts und waehle **Benutzerdefinierte Repositories**.
5. Fuege `https://github.com/bimberle/glass-cover-card` hinzu und waehle den Typ **Dashboard**.
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
show_main_controls: true
show_close_tilt: true
show_preview: true
invert_position: false
button_size: 5
title_size: 5
preview_size: 5
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
| `show_main_controls` | `true` | Buttons Hoch, Stopp und Runter anzeigen oder ausblenden |
| `show_close_tilt` | `true` | Vierten Button fuer „100 % geschlossen und Lamellen 50 %“ anzeigen oder ausblenden |
| `show_preview` | `true` | Jalousien-Vorschaubild und Prozentwert anzeigen; der Auf/Zu-Positionsslider bleibt auch bei `false` sichtbar |
| `invert_position` | `false` | Kehrt Slider-Richtung und Prozentbedeutung um. Standard: links/0 % offen, rechts/100 % geschlossen |
| `button_size` | `5` | Groesse der Steuerbuttons von `1` (ein Drittel) bis `5` (Vorlagengroesse). Die Symbole bleiben auch bei kleinen Stufen gut erkennbar; Kopfbutton und Schnellwahlbuttons skalieren gemeinsam. Die Lamellenzeile skaliert mit; Stufe `1` entspricht der frueheren Stufe `2` |
| `title_size` | `5` | Groesse der Ueberschrift von `1` (klein) bis `5` (Vorlagengroesse) |
| `preview_size` | `5` | Gemeinsame Groesse von Jalousienbild und Prozentanzeige von `1` (klein) bis `5` (Vorlagengroesse) |
| `tilt_entity` | `entity` | Optionale Cover-Entitaet fuer die Lamellenposition |

Die Steuerbuttons enthalten **hoch**, **stopp**, **runter** und **100 % geschlossen mit Lamellenposition 50 %**. Das vertikal ausfahrende Schnellwahlmenue oben rechts bietet zusaetzlich **ganz auf**, **ganz zu** und **ganz zu mit Lamellenposition 50 %**. Die kombinierte Aktion ruft erst `cover.close_cover` und danach `cover.set_cover_tilt_position` auf. Beim Setzen einer Position bleibt ein hohler Kreis am Slider als Zielmarkierung stehen, bis die Jalousie die Zielposition erreicht. In der kompakten Ansicht bleibt zwischen Ueberschrift und Positionsslider zusaetzlicher Abstand.

Die drei Standardbuttons und der Sonderbutton lassen sich unabhaengig schalten. Wenn `show_main_controls` und `show_close_tilt` beide `false` sind, wird die gesamte Buttonzeile ausgeblendet.

Die Cover-Integration muss die jeweiligen Home-Assistant-Dienste und Attribute unterstuetzen. Die Karte hat keine externen Abhaengigkeiten.