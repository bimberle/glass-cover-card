# Glass Cover Cards

Eine Sammlung responsiver Home-Assistant-Lovelace-Karten. Die Kartenquellen liegen getrennt unter `cards/<kartenname>/`; `npm run build` legt die HACS-Dateien gemeinsam in `dist/` ab.

## Entwicklung

```sh
npm run build
npm test
```

Die Quellen der vier Karten liegen jeweils in `cards/<kartenname>/`. Die gebauten `dist/*.js`-Dateien werden mit versioniert, damit HACS sie direkt aus einer GitHub-Release installieren kann.

## Karten

### Glass Cover Card

<img src="https://raw.githubusercontent.com/bimberle/glass-cover-card/main/designvorlage.png" alt="Vorschau der Glass Cover Card" width="50%">

Steuert eine Jalousie mit Positionsregler, Hoch/Stopp/Runter, optionaler Lamellenleiste und Schnellwahl.

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
# Optional: getrennte Entitaet fuer die Lamellenposition
# tilt_entity: cover.wohnzimmer_lamellen
```

### Glass Button Card

<img src="https://raw.githubusercontent.com/bimberle/glass-cover-card/main/glass-button-card-preview.jpg" alt="Vorschau der Glass Button Card" width="50%">

Jede Karte zeigt genau einen grossen runden Button. Fuer mehrere Bedienelemente fuegst du mehrere Glass Button Cards nebeneinander ins Dashboard ein. Entitaet, Icon, Text, Aktion, Groesse und Akzentfarbe sind pro Karte einstellbar.

```yaml
type: custom:glass-button-card
entity: light.wohnzimmer
name: Wohnzimmer
icon: mdi:sofa-outline
action: toggle
button_size: 5
show_name: true
color: orange
show_card_frame: true
```

Im visuellen Editor waehlst du Entitaet, Icon, Text, Aktion und Farbe aus. Dimmbare Lichter zeigen automatisch einen Helligkeitsring: Ziehen am Ring aendert die Helligkeit, ein Klick in der Mitte fuehrt weiterhin die gewaehlte Aktion aus. Beim Einschalten bewegt sich der Ring zur gemeldeten Helligkeit. Mit `show_brightness_slider: false` laesst sich der Ring ausblenden. Fuer mehrere Buttons legst du mehrere einzelne Karten im Dashboard-Raster nebeneinander an.

Fuer einen Button ohne Kartenrahmen, z. B. in einem `horizontal-stack`, setze `show_card_frame: false`. Dann bleiben der Kreis, das Icon und gegebenenfalls der Helligkeitsregler sichtbar; der Buttontext wird in dieser Ansicht ausgeblendet.

```yaml
type: horizontal-stack
cards:
  - type: custom:glass-button-card
    entity: light.wohnzimmer
    icon: mdi:sofa-outline
    show_card_frame: false
  - type: custom:glass-button-card
    entity: light.deckenlampe
    icon: mdi:lightbulb-outline
    show_card_frame: false
```

  ### Glass RGB Card

  Steuert ein farbfaehiges Licht ueber einen Farbkreis und einen Helligkeitsregler. Die Mitte schaltet das Licht ein oder aus; bis zu sechs Farb-Presets koennen in der Kartenkonfiguration festgelegt werden. Fuer RGBW- und RGBWW-Leuchten mit Farbtemperatur steht zusaetzlich ein Warm/Kalt-Regler bereit. Ein Beispiel und alle Optionen findest du unter [Glass RGB Card](#glass-rgb-card-1).

## Installation ueber Marketplace / HACS

Das oeffentliche Repository heisst weiterhin `glass-cover-card`, damit HACS die gleichnamige Einstiegskarte erkennt. Die automatisch geladene `glass-cover-card.js` registriert alle vier Karten. Bei gleicher `button_size` verwenden Panel- und Cover-Karte dieselbe Größe und Position für den Kopfbutton. `title_size` skaliert die große Unterüberschrift. Die Panelkarte nutzt Home Assistants Standard-Kartenpicker und rendert ihre Inhalte in einem nativen Vertical Stack. Die aktuelle Repository-Version ist `v1.20.2`.

1. Oeffne in Home Assistant **Einstellungen > Marketplace** (ab Home Assistant 2026.11) beziehungsweise **HACS** (bis Home Assistant 2026.10).
2. Oeffne das Menue oben rechts und waehle **Benutzerdefinierte Repositories**.
3. Fuege `https://github.com/bimberle/glass-cover-card` hinzu und waehle den Typ **Dashboard**.
4. Suche nach **Glass Cover Cards**, oeffne den Eintrag und installiere ihn.
5. Lade die Dashboard-Ressource neu. Die Ressource `glass-cover-card.js` registriert `custom:glass-cover-card`, `custom:glass-button-card`, `custom:glass-panel-card` und `custom:glass-rgb-card`.

  - Home Assistant 2026.11+: `/local/community/glass-cover-card/glass-cover-card.js`
  - Aeltere HACS-Versionen: `/hacsfiles/glass-cover-card.js`

Fuege danach im Dashboard-Editor eine benutzerdefinierte Karte mit `type: custom:glass-button-card` hinzu.

**Schon v1.7.0 bis v1.20.1 installiert?** Aktualisiere auf v1.20.2 und lade die Repository-Dateien in Marketplace/HACS erneut herunter.

## Manuelle Installation

Kopiere `glass-cover-card.js` aus `dist/` nach `/config/www/` und registriere `/local/glass-cover-card.js` unter **Einstellungen > Dashboards > Ressourcen** als **JavaScript-Modul**. Die Datei enthaelt alle vier Karten. Optional kann fuer eine isolierte Buttonkarten-Installation stattdessen nur `glass-button-card.js` kopiert und `/local/glass-button-card.js` registriert werden.

## Optionen

### Glass Button Card

| Option | Standard | Beschreibung |
| --- | --- | --- |
| `entity` | erforderlich | Entitaet, die der Button schaltet oder deren Details eroeffnet |
| `icon` | `mdi:gesture-tap-button` | Ein MDI-Icon, z. B. `mdi:sofa-outline`, `mdi:lightbulb-outline` oder `mdi:television` |
| `icon_active` | `icon` | Icon des aktiven Zustands bei `binary_sensor` |
| `icon_inactive` | `icon` | Icon des inaktiven Zustands bei `binary_sensor` |
| `color_active` | `color` | Farbe des aktiven Zustands bei `binary_sensor` |
| `color_inactive` | `gray` | Farbe des inaktiven Zustands bei `binary_sensor` |
| `binary_sensor_active_state` | `on` | Aktiver Zustand bei `binary_sensor`: `on` (offen) oder `off` (geschlossen) |
| `name` | Friendly Name | Buttontext; kann mit `show_name: false` ausgeblendet werden |
| `action` | `toggle` | `toggle` schaltet die Entitaet; `more-info` oeffnet deren Detaildialog |
| `button_size` | `5` | Groesse von `1` (ein Drittel) bis `5` (entspricht den grossen Jalousiebuttons) |
| `show_name` | `true` | Buttontext ein- oder ausblenden, solange der Kartenrahmen sichtbar ist |
| `color` | `orange` | Akzentfarbe `orange`, `white`, `gray`, `green` oder `red` |
| `show_card_frame` | `true` | Kartenrahmen, Hintergrund und Außenabstand anzeigen; `false` zeigt nur Kreis und Icon und blendet den Text aus |
| `show_brightness_slider` | `true` | Helligkeitsring bei dimmbaren Lichtern anzeigen; `false` deaktiviert ihn |

Orange ist die Standardfarbe. Eingeschaltete Buttons zeigen die gewaehlte Farbe, ausgeschaltete sind grau. Bei Ein/Aus-Entitaeten ohne Helligkeitsring erscheint zusaetzlich der Zustand im Button.

Fuer einen Tuer- oder Fensterkontakt zeigt `on` offen und `off` geschlossen an. Die Binary-Sensor-Einstellungen sind im Editor bei allen Entitaeten sichtbar, wirken aber nur bei `binary_sensor`. Andere Sensortypen koennen `on` und `off` anders interpretieren. Fuer Sensoren eignet sich `more-info` als Aktion:

```yaml
type: custom:glass-button-card
entity: binary_sensor.haustuer
icon_active: mdi:door-open
color_active: red
icon_inactive: mdi:door-closed
color_inactive: green
binary_sensor_active_state: 'on'
action: more-info
```

### Glass RGB Card

Steuert Farbton und Helligkeit eines farbfaehigen Lichts. Der innere Ring und das Lampenicon zeigen die gewaehlte Farbe entsprechend der Helligkeit an. Ein Klick auf die Mitte oder den Kopfbutton schaltet das Licht ein oder aus. Beim Einschalten wird das erste konfigurierte Preset verwendet, falls vorhanden; andernfalls stellt Home Assistant den letzten Lichtzustand wieder her. Bis zu sechs Farben lassen sich in der Kartenkonfiguration festlegen. Das Veraendern der Regler ueberschreibt diese Presets nicht. Die Farbtemperatur erscheint nur, wenn die Leuchte RGBW oder RGBWW und Farbtemperatur unterstuetzt.

Frueher im Browser gespeicherte Presets werden nicht mehr verwendet; lege die gewuenschten Farben in der Kartenkonfiguration neu fest.

```yaml
type: custom:glass-rgb-card
entity: light.wohnzimmer
title: RGB
name: Sofa
icon: mdi:lightbulb-outline
title_size: 5
button_size: 5
show_presets: true
preset_1: [255, 0, 0]
preset_2: [0, 180, 255]
```

| Option | Standard | Beschreibung |
| --- | --- | --- |
| `entity` | erforderlich | Farbfähige Licht-Entitaet |
| `title` | `RGB` | Kleine Kopfzeile |
| `name` | Friendly Name | Grosse Ueberschrift |
| `icon` | `mdi:lightbulb-outline` | Icon des Schaltbuttons |
| `title_size` | `5` | Groesse der Ueberschrift von `1` bis `5` |
| `button_size` | `5` | Groesse des Kopfbuttons von `1` bis `5` |
| `show_presets` | `false` | Konfigurierte Farb-Presets anzeigen |
| `preset_1` bis `preset_6` | keine | Optionale RGB-Farbe als Liste mit drei Werten von `0` bis `255` |

### Glass Panel Card

Container mit Titel und Untertitel, optionalem runden Aktionsbutton oben rechts und einer Liste beliebiger Home-Assistant-Karten. Die enthaltenen Karten koennen direkt als Liste angegeben werden, zum Beispiel mit mehreren Glass Button Cards:

```yaml
type: custom:glass-panel-card
title: Aktionen
subtitle: Wohnzimmer
title_size: 5
show_action_button: true
action_entity: light.wohnzimmer
action_icon: mdi:sofa-outline
action: toggle
cards:
  - type: vertical-stack
    cards:
      - type: custom:glass-button-card
        entity: light.wohnzimmer
        icon: mdi:sofa-outline
        show_card_frame: false
      - type: custom:glass-button-card
        entity: light.deckenlampe
        icon: mdi:lightbulb-outline
        show_card_frame: false
      - type: custom:glass-button-card
        entity: media_player.fernseher
        icon: mdi:television
        action: more-info
        show_card_frame: false
```

Im Bearbeitungsmodus wählst du über **Karte hinzufügen** den normalen Home-Assistant-Kartenpicker. Dort stehen alle Standard- und Custom Cards zur Auswahl. Die ausgewählte Karte lässt sich danach mit ihrem Standardeditor konfigurieren; Karten können entfernt, ausgewählt und sortiert werden. Der Panelinhalt ist vertikal gestapelt. Für nebeneinanderliegende Karten fügst du darin einen normalen `horizontal-stack` oder `grid` ein.

| Option | Standard | Beschreibung |
| --- | --- | --- |
| `title` | leer | Kleine obere Überschrift, zum Beispiel `AKTIONEN` |
| `subtitle` | leer | Größere Überschrift unter dem Titel |
| `title_size` | `5` | Größe der großen Unterüberschrift wie bei der Cover Card von `1` (klein) bis `5` (Vorlagengröße) |
| `show_action_button` | `false` | Runden Button rechts oben anzeigen; bei Ein/Aus-Entitaeten zeigt er den Zustand und ist ausgeschaltet grau |
| `button_size` | `5` | Größe des Aktionsbuttons von `1` bis `5`, entsprechend der Cover Card |
| `action_entity` | keine | Entität für den Aktionsbutton |
| `action_icon` | `mdi:gesture-tap-button` | Icon des Aktionsbuttons |
| `action` | `toggle` | Entität umschalten oder mit `more-info` deren Details öffnen |
| `cards` | `[]` | Liste beliebiger Lovelace-Kartenkonfigurationen |

### Glass Cover Card

| Option | Standard | Beschreibung |
| --- | --- | --- |
| `entity` | erforderlich | Cover-Entitaet fuer Fahrt und Position |
| `name` | Friendly Name | Name in der Kartenueberschrift |
| `title` | `Beschattung` | Kleine Ueberschrift oberhalb des Namens |
| `show_tilt` | `true` | Lamellen-Schieberegler anzeigen oder ausblenden |
| `show_main_controls` | `true` | Buttons Hoch, Stopp und Runter anzeigen oder ausblenden |
| `show_close_tilt` | `true` | Vierten Button fuer „100 % geschlossen und Lamellen 50 %“ anzeigen oder ausblenden |
| `show_preview` | `true` | Vorschaubild und Prozentwert anzeigen; Positionsslider bleibt sichtbar |
| `invert_position` | `false` | Slider-Richtung und Prozentbedeutung umkehren |
| `button_size` | `5` | Groesse der Steuerbuttons von `1` bis `5` |
| `title_size` | `5` | Groesse der Ueberschrift von `1` bis `5` |
| `preview_size` | `5` | Groesse von Jalousienbild und Prozentanzeige von `1` bis `5` |
| `tilt_entity` | `entity` | Optionale Cover-Entitaet fuer die Lamellenposition |

Die Cover-Integration muss die jeweiligen Home-Assistant-Dienste und Attribute unterstuetzen. Es gibt keine externen Build-Abhaengigkeiten; zum Erzeugen von `dist/` wird Node.js benoetigt.