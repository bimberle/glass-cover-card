# Glass Cover Card Plan

## Anforderungen

- Eine skalierende Home-Assistant-Lovelace-Karte fuer eine Jalousie.
- Titel, Status und visuelle Jalousieanzeige.
- Oben rechts ein Menue mit drei runden Schnellwahl-Buttons: ganz hoch, ganz runter sowie ganz runter mit Lamellen auf 50 %.
- Direkte Hoch-, Stopp- und Runter-Steuerung sowie ein Positionsregler.
- Die Lamellenleiste muss per Kartenoption ein- und ausgeschaltet werden koennen.
- Konfiguration und Einbindung dokumentieren.

## Umsetzung

- [x] Eigenstaendige Lovelace-Custom-Card ohne externe Laufzeitabhaengigkeiten erstellen.
- [x] Standard-Home-Assistant-Cover-Dienste fuer Position, Fahrt und Lamellen verwenden.
- [x] Schnellwahl-Menue, Positionsregler und optionale Lamellensteuerung implementieren.
- [x] Responsives Layout und deutsche Beschriftungen umsetzen.
- [x] README mit Installation, YAML-Konfiguration und Voraussetzungen verfassen.
- [x] JavaScript-Syntax und Service-Aufrufe lokal pruefen.
- [x] Prozent-/Slider-Richtung invertierbar machen und Standard auf Prozent geschlossen setzen.
- [x] Slider-Zielposition als offenen Marker bis zur gemeldeten Istposition anzeigen.
- [x] Button-Groesse 1 bis 5, skalierte Lamellenleiste und kompakte Ansicht ergaenzen.
- [x] Vertikales, animiertes Schnellwahlmenue und HACS-Vorschaubild ergaenzen.
- [x] Lamellen-Mindestgroesse, erkennbare Icons und skalierenden Kopf-/Schnellwahlbutton nachjustieren.
- [x] Positionsslider in der Kompaktansicht sichtbar lassen.
- [x] Groessenregler fuer Ueberschrift sowie Bild/Prozentanzeige hinzufuegen.
- [x] Original `designvorlage.png` in die Marketplace-Beschreibung aufnehmen.
- [x] Im Kompaktmodus mehr Abstand vor dem Positionsslider lassen.
- [x] Vierten Hauptbutton fuer geschlossen plus Lamellen 50 % ergaenzen.
- [x] Vierten Hauptbutton ueber `show_close_tilt` optional schaltbar machen.

## Marketplace / HACS

- [x] `hacs.json` und passenden Dashboard-Dateinamen fuer ein Repository `glass-cover-card` vorbereiten.
- [x] Anleitung fuer ein benutzerspezifisches Marketplace-/HACS-Repository dokumentieren.
- [x] Manifest, Dateinamen und JavaScript lokal validieren.
- [x] Oeffentliches GitHub-Repository `bimberle/glass-cover-card` und Release `v1.0.0` erstellen.
- [x] Aenderungen als Release `v1.1.0` veroeffentlichen.
- [x] Folgeaenderungen als Release `v1.2.0` veroeffentlichen.
- [x] Kompaktabstand und vierten Steuerbutton als Release `v1.3.0` veroeffentlichen.
- [ ] Optionalen vierten Steuerbutton als Release `v1.4.0` veroeffentlichen.
- [ ] Repository im Marketplace/HACS eintragen und Karte im Home-Assistant-Dashboard installieren.

## Notiz

Der Modus „ganz runter, Lamellen 50 %“ schliesst zuerst die Jalousie und setzt anschliessend die Lamellenposition. Home Assistant bietet fuer die beiden Cover-Dienste keine gemeinsame atomare Aktion; die Karte wartet vor dem zweiten Aufruf kurz, damit der Schliessbefehl zuerst beim Geraet ankommt.