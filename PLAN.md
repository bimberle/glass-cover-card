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

## Marketplace / HACS

- [x] `hacs.json` und passenden Dashboard-Dateinamen fuer ein Repository `glass-cover-card` vorbereiten.
- [x] Anleitung fuer ein benutzerspezifisches Marketplace-/HACS-Repository dokumentieren.
- [x] Manifest, Dateinamen und JavaScript lokal validieren.
- [ ] Oeffentliches GitHub-Repository und Release `v1.0.0` erstellen (benoetigt Freigabe zur Veroeffentlichung).
- [ ] Repository im Marketplace/HACS eintragen und Karte im Home-Assistant-Dashboard installieren.

## Notiz

Der Modus „ganz runter, Lamellen 50 %“ schliesst zuerst die Jalousie und setzt anschliessend die Lamellenposition. Home Assistant bietet fuer die beiden Cover-Dienste keine gemeinsame atomare Aktion; die Karte wartet vor dem zweiten Aufruf kurz, damit der Schliessbefehl zuerst beim Geraet ankommt.