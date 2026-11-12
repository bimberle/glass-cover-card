# Glass Cover Cards

Eine Sammlung responsiver Home-Assistant-Lovelace-Karten. Die Kartenquellen liegen getrennt unter `cards/<kartenname>/`; `npm run build` legt die HACS-Dateien gemeinsam in `dist/` ab.

## Entwicklung

```sh
npm run build
npm test
```

`cards/glass-cover-card/` und `cards/glass-button-card/` enthalten die jeweiligen Quellen. Die gebauten `dist/*.js`-Dateien werden mit versioniert, damit HACS sie direkt aus einer GitHub-Release installieren kann.

## Karten

### Glass Cover Card

![Vorschau der Glass Cover Card](https://raw.githubusercontent.com/bimberle/glass-cover-card/main/designvorlage.png)

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

![Vorschau der Glass Button Card](https://raw.githubusercontent.com/bimberle/glass-cover-card/main/glass-button-card-preview.jpg)

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

Im visuellen Editor waehlst du Entitaet, Icon, Text, Aktion und Farbe aus. Fuer mehrere Buttons legst du mehrere einzelne Karten im Dashboard-Raster nebeneinander an.

Fuer einen Button ohne Kartenrahmen, z. B. in einem `horizontal-stack`, setze `show_card_frame: false`. Dann bleiben nur der Kreis und das Icon sichtbar; der Text wird in dieser Ansicht ausgeblendet.

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

## Installation ueber Marketplace / HACS

Das oeffentliche Repository heisst weiterhin `glass-cover-card`, damit HACS die gleichnamige Einstiegskarte erkennt. Die automatisch geladene `glass-cover-card.js` registriert alle drei Karten. Die Panel-Kopfzeile entspricht der Cover Card; `title_size` skaliert die große Unterüberschrift. Die Panelkarte nutzt Home Assistants Standard-Kartenpicker und rendert ihre Inhalte in einem nativen Vertical Stack. Die aktuelle Repository-Version ist `v1.17.0`.

1. Oeffne in Home Assistant **Einstellungen > Marketplace** (ab Home Assistant 2026.11) beziehungsweise **HACS** (bis Home Assistant 2026.10).
2. Oeffne das Menue oben rechts und waehle **Benutzerdefinierte Repositories**.
3. Fuege `https://github.com/bimberle/glass-cover-card` hinzu und waehle den Typ **Dashboard**.
4. Suche nach **Glass Cover Cards**, oeffne den Eintrag und installiere ihn.
5. Lade die Dashboard-Ressource neu. Die Ressource `glass-cover-card.js` registriert `custom:glass-cover-card`, `custom:glass-button-card` und `custom:glass-panel-card`.

  - Home Assistant 2026.11+: `/local/community/glass-cover-card/glass-cover-card.js`
  - Aeltere HACS-Versionen: `/hacsfiles/glass-cover-card.js`

Fuege danach im Dashboard-Editor eine benutzerdefinierte Karte mit `type: custom:glass-button-card` hinzu.

**Schon v1.7.0 bis v1.16.0 installiert?** Aktualisiere auf v1.17.0 und lade die Repository-Dateien in Marketplace/HACS erneut herunter.

## Manuelle Installation

Kopiere `glass-cover-card.js` aus `dist/` nach `/config/www/` und registriere `/local/glass-cover-card.js` unter **Einstellungen > Dashboards > Ressourcen** als **JavaScript-Modul**. Die Datei enthaelt beide Karten. Optional kann fuer eine isolierte Buttonkarten-Installation stattdessen nur `glass-button-card.js` kopiert und `/local/glass-button-card.js` registriert werden.

## Optionen

### Glass Button Card

| Option | Standard | Beschreibung |
| --- | --- | --- |
| `entity` | erforderlich | Entitaet, die der Button schaltet oder deren Details eroeffnet |
| `icon` | `mdi:gesture-tap-button` | Ein MDI-Icon, z. B. `mdi:sofa-outline`, `mdi:lightbulb-outline` oder `mdi:television` |
| `name` | Friendly Name | Buttontext; kann mit `show_name: false` ausgeblendet werden |
| `action` | `toggle` | `toggle` schaltet die Entitaet; `more-info` oeffnet deren Detaildialog |
| `button_size` | `5` | Groesse von `1` (ein Drittel) bis `5` (entspricht den grossen Jalousiebuttons) |
| `show_name` | `true` | Buttontext ein- oder ausblenden, solange der Kartenrahmen sichtbar ist |
| `color` | `orange` | Akzentfarbe `orange`, `white` oder `gray` |
| `show_card_frame` | `true` | Kartenrahmen, Hintergrund und Außenabstand anzeigen; `false` zeigt nur Kreis und Icon und blendet den Text aus |

Orange ist die Standardfarbe. Mit `color: white` oder `color: gray` kannst du das Design aendern.

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
| `show_action_button` | `false` | Runden Button rechts oben anzeigen |
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