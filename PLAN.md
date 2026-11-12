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
- [x] Standardbuttons ueber `show_main_controls` optional schaltbar machen und Zeile bei deaktivierten Gruppen ausblenden.
- [x] Abstand unter der Buttonreihe vor die Lamellen-Trennlinie verschieben und Repo-Vorschaubild kleiner anzeigen.
- [x] Repository in getrennte Quellenordner pro Karte strukturieren.
- [x] Glass Button Card mit Buttonliste, Entity-/Icon-/Text-/Aktionauswahl, Größenstufen und Spaltenoption erstellen.
- [x] HACS-kompatiblen Build nach `dist/` sowie Smoke-Tests für beide Karten ergänzen.
- [x] README mit Buttonkartenbeispiel, Iconauswahl und Mehrkarten-Ressourcen aktualisieren.
- [x] Beide Karten ueber die automatisch erkannte HACS-Einstiegsressource registrieren und Mehrfachregistrierungen verhindern.
- [x] Marketplace-Bildlinks auf absolute Raw-GitHub-URLs umstellen und Updatehinweis fuer v1.7.0 ergaenzen.

## Marketplace / HACS

- [x] `hacs.json` und passenden Dashboard-Dateinamen fuer ein Repository `glass-cover-card` vorbereiten.
- [x] Anleitung fuer ein benutzerspezifisches Marketplace-/HACS-Repository dokumentieren.
- [x] Manifest, Dateinamen und JavaScript lokal validieren.
- [x] Oeffentliches GitHub-Repository `bimberle/glass-cover-card` und Release `v1.0.0` erstellen.
- [x] Aenderungen als Release `v1.1.0` veroeffentlichen.
- [x] Folgeaenderungen als Release `v1.2.0` veroeffentlichen.
- [x] Kompaktabstand und vierten Steuerbutton als Release `v1.3.0` veroeffentlichen.
- [x] Optionalen vierten Steuerbutton als Release `v1.4.0` veroeffentlichen.
- [x] Buttongruppen-Konfiguration als Release `v1.5.0` veroeffentlichen.
- [x] Abstands- und Bildgroessenkorrektur als Release `v1.6.0` veroeffentlichen.
- [x] Glass Button Card und Mehrkartenpaket als Release `v1.7.0` veroeffentlichen.
- [x] Ressourcen- und Marketplace-Bildkorrektur als Release `v1.8.0` veroeffentlichen.
- [x] Glass Button Card auf genau einen Button pro Karte umstellen.
- [x] Orange als Standard sowie Weiss und Grau als Akzentfarben anbieten.
- [x] Button-Smoke-Test auf Einzelbutton-Konfiguration umstellen.
- [x] Einzelbutton- und Farbauswahl (Orange standardmaessig, Weiss oder Grau) als Release `v1.9.0` veroeffentlichen.
- [x] Option fuer rahmenlose Buttondarstellung in Stacks mit nur Kreis/Icon ergaenzen.
- [x] Rahmenlose Darstellung als Release `v1.10.0` veroeffentlichen.
- [x] Beide Karteneditoren auf Home Assistants native Formularfelder umstellen.
- [x] Editor-DOM-Neuaufbau bei allgemeinen HA-Updates verhindern und Cover-Renders auf relevante Zustandsänderungen begrenzen.
- [x] Native Editorformulare und Cover-Renderkorrektur als Release `v1.11.0` veroeffentlichen.
- [x] Glass Panel Card mit Titel, Untertitel, optionalem Aktionsbutton und verschachtelten Karten umsetzen.
- [x] Containerkarte in den gemeinsamen Marketplace-Einstieg integrieren und testen.
- [x] Panel-Editor auf Home Assistant Standard-Card-Picker und Child-Card-Editor umstellen.
- [x] Panel-Inhalt wie ein vertikaler Stack anordnen; horizontale Reihen ueber die Standardkarte `horizontal-stack` konfigurieren.
- [x] Panel-Inhalt in einem echten HA-Vertical-Stack rendern und Child-Stack-Akkumulation testen.
- [x] Panel-Stack-Groessenfix als Release `v1.14.0` veroeffentlichen.
- [x] Glass Button Card bei nicht relevanten Stateupdates ohne Shadow-DOM-Neuaufbau aktualisieren.
- [x] Renderzaehler-Regressionstest fuer fremde und relevante Entityupdates ergaenzen.
- [ ] Renderstabilisierung als Release `v1.15.0` veroeffentlichen.
- [ ] Repository im Marketplace/HACS eintragen und Karte im Home-Assistant-Dashboard installieren.

## Notiz

Der Modus „ganz runter, Lamellen 50 %“ schliesst zuerst die Jalousie und setzt anschliessend die Lamellenposition. Home Assistant bietet fuer die beiden Cover-Dienste keine gemeinsame atomare Aktion; die Karte wartet vor dem zweiten Aufruf kurz, damit der Schliessbefehl zuerst beim Geraet ankommt.