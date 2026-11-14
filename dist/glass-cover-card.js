(() => {
const CARD_VERSION = "1.23.6";
const clamp = (value) => Math.min(100, Math.max(0, Number(value) || 0));

class GlassCoverCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._menuOpen = false;
    this._pendingTilt = null;
    this._pendingTiltTimer = null;
    this._targetPosition = null;
    this._hassRenderKey = null;
  }

  setConfig(config) {
    if (!config?.entity) {
      throw new Error("Bitte eine Cover-Entitaet mit 'entity' angeben.");
    }
    this._config = {
      show_tilt: true,
      show_main_controls: true,
      show_close_tilt: true,
      show_action_button: true,
      show_position_slider: true,
      show_preview: true,
      invert_position: false,
      button_size: 5,
      title_size: 5,
      preview_size: 5,
      title: "Beschattung",
      ...config,
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const position = Number(hass.states?.[this._config?.entity]?.attributes?.current_position);
    if (this._targetPosition !== null && Math.abs(position - this._targetPosition) <= 1) {
      this._targetPosition = null;
    }
    const tiltEntity = this._config?.tilt_entity || this._config?.entity;
    const tilt = Number(hass.states?.[tiltEntity]?.attributes?.current_tilt_position);
    if (this._pendingTilt !== null && tilt === this._pendingTilt) {
      window.clearTimeout(this._pendingTiltTimer);
      this._pendingTilt = null;
    }
    const coverState = hass.states?.[this._config?.entity];
    const tiltState = hass.states?.[tiltEntity];
    const renderKey = JSON.stringify([
      coverState?.state,
      coverState?.attributes?.current_position,
      coverState?.attributes?.friendly_name,
      tiltState?.attributes?.current_tilt_position,
    ]);
    if (renderKey !== this._hassRenderKey) {
      this._hassRenderKey = renderKey;
      this._render();
    }
  }

  get hass() {
    return this._hass;
  }

  getCardSize() {
    return (this._config?.show_preview !== false ? 4 : 2) + (this._config?.show_tilt !== false ? 1 : 0);
  }

  static getConfigForm() {
    const schema = [
      { name: "entity", required: true, selector: { entity: { filter: { domain: "cover" } } } },
      { name: "name", selector: { text: {} } },
      { name: "title", default: "Beschattung", selector: { text: {} } },
      { name: "tilt_entity", selector: { entity: { filter: { domain: "cover" } } } },
      { name: "show_tilt", default: true, selector: { boolean: {} } },
      { name: "show_position_slider", default: true, selector: { boolean: {} } },
      { name: "show_main_controls", default: true, selector: { boolean: {} } },
      { name: "show_close_tilt", default: true, selector: { boolean: {} } },
      { name: "show_action_button", default: true, selector: { boolean: {} } },
      { name: "show_preview", default: true, selector: { boolean: {} } },
      { name: "invert_position", default: false, selector: { boolean: {} } },
      { name: "button_size", default: 5, selector: { number: { min: 1, max: 5, step: 1, mode: "slider" } } },
      { name: "title_size", default: 5, selector: { number: { min: 1, max: 5, step: 1, mode: "slider" } } },
      { name: "preview_size", default: 5, selector: { number: { min: 1, max: 5, step: 1, mode: "slider" } } },
    ];
    return {
      schema,
      computeLabel: (field) => ({
        entity: "Jalousie",
        name: "Beschriftung",
        title: "Titel",
        tilt_entity: "Lamellen-Entität",
        show_tilt: "Lamellenregler anzeigen",
        show_position_slider: "Positionsregler anzeigen",
        show_main_controls: "Hoch/Stopp/Runter anzeigen",
        show_close_tilt: "Schließen-und-Lamellen-Button anzeigen",
        show_action_button: "Schnellwahl-Button anzeigen",
        show_preview: "Vorschau und Prozentanzeige anzeigen",
        invert_position: "Position umkehren",
        button_size: "Button-Größe",
        title_size: "Beschriftungsgröße",
        preview_size: "Bild- und Prozentgröße",
      })[field.name],
    };
  }

  static getStubConfig() {
    return { entity: "cover.living_room", name: "Wohnzimmer", show_tilt: true, show_position_slider: true, show_preview: true, button_size: 5, title_size: 5, preview_size: 5 };
  }

  _state() {
    return this._hass?.states?.[this._config.entity];
  }

  _position() {
    const state = this._state();
    const value = state?.attributes?.current_position;
    return Number.isFinite(Number(value)) ? clamp(value) : (state?.state === "open" ? 100 : 0);
  }

  _tilt() {
    const entity = this._config.tilt_entity || this._config.entity;
    const value = this._hass?.states?.[entity]?.attributes?.current_tilt_position;
    return Number.isFinite(Number(value)) ? clamp(value) : 50;
  }

  _call(service, data = {}, entity = this._config.entity) {
    if (!this._hass) return;
    this._hass.callService("cover", service, { entity_id: entity, ...data });
  }

  _setPosition(value) {
    const uiPosition = clamp(value);
    const position = this._config.invert_position ? uiPosition : 100 - uiPosition;
    this._setTargetPosition(position);
    this._call("set_cover_position", { position });
    this._render();
  }

  _setTargetPosition(position) {
    this._targetPosition = clamp(position);
  }

  _setTilt(value) {
    this._pendingTilt = clamp(value);
    window.clearTimeout(this._pendingTiltTimer);
    this._pendingTiltTimer = window.setTimeout(() => {
      this._pendingTilt = null;
      this._render();
    }, 3000);
    const entity = this._config.tilt_entity || this._config.entity;
    this._call("set_cover_tilt_position", { tilt_position: this._pendingTilt }, entity);
    this._render();
  }

  _quickAction(action) {
    this._menuOpen = false;
    if (action === "open") {
      this._setTargetPosition(100);
      this._call("open_cover");
    } else if (action === "close") {
      this._setTargetPosition(0);
      this._call("close_cover");
    } else {
      this._setTargetPosition(0);
      this._setPendingTilt(50);
      this._call("close_cover");
      window.setTimeout(() => this._setTilt(50), 700);
    }
    this._render();
  }

  _setPendingTilt(value) {
    this._pendingTilt = clamp(value);
    window.clearTimeout(this._pendingTiltTimer);
    this._pendingTiltTimer = window.setTimeout(() => {
      this._pendingTilt = null;
      this._render();
    }, 3000);
  }

  _bindEvents() {
    this.shadowRoot.querySelector(".menu-toggle")?.addEventListener("click", () => {
      this._menuOpen = !this._menuOpen;
      this._render();
    });
    this.shadowRoot.querySelector("[data-action='open']")?.addEventListener("click", () => this._quickAction("open"));
    this.shadowRoot.querySelector("[data-action='close']")?.addEventListener("click", () => this._quickAction("close"));
    this.shadowRoot.querySelector("[data-action='close-tilt']")?.addEventListener("click", () => this._quickAction("close-tilt"));
    this.shadowRoot.querySelector(".raise")?.addEventListener("click", () => this._call("open_cover"));
    this.shadowRoot.querySelector(".stop")?.addEventListener("click", () => this._call("stop_cover"));
    this.shadowRoot.querySelector(".lower")?.addEventListener("click", () => this._call("close_cover"));
    this.shadowRoot.querySelector(".close-tilt")?.addEventListener("click", () => this._quickAction("close-tilt"));
    this.shadowRoot.querySelector(".position")?.addEventListener("change", (event) => this._setPosition(event.target.value));
    this.shadowRoot.querySelector(".tilt")?.addEventListener("input", (event) => this._setTilt(event.target.value));
  }

  _render() {
    if (!this._config) return;
    const position = this._position();
    const invertPosition = this._config.invert_position === true;
    const uiPosition = invertPosition ? position : 100 - position;
    const displayedPosition = Math.round(uiPosition);
    const targetUiPosition = this._targetPosition === null ? null : (invertPosition ? this._targetPosition : 100 - this._targetPosition);
    const tilt = this._pendingTilt ?? this._tilt();
    const title = this._escape(String(this._config.title ?? "Beschattung").trim());
    const name = this._escape(String(this._config.name ?? this._state()?.attributes?.friendly_name ?? this._config.entity).trim());
    const showTilt = this._config.show_tilt !== false;
    const showPositionSlider = this._config.show_position_slider !== false;
    const showMainControls = this._config.show_main_controls !== false;
    const showCloseTilt = this._config.show_close_tilt !== false;
    const showActionButton = this._config.show_action_button !== false;
    const showPreview = this._config.show_preview !== false;
    const buttonLevel = Math.min(5, Math.max(1, Number(this._config.button_size) || 5));
    const titleLevel = Math.min(5, Math.max(1, Number(this._config.title_size) || 5));
    const previewLevel = Math.min(5, Math.max(1, Number(this._config.preview_size) || 5));
    const buttonScale = 1 / 3 + ((buttonLevel - 1) / 4) * (2 / 3);
    const tiltScale = 0.625 + ((buttonLevel - 1) / 4) * 0.375;
    const menuButtonScale = 0.5 + buttonScale * 0.5;
    const titleScale = 0.65 + ((titleLevel - 1) / 4) * 0.35;
    const previewScale = 0.65 + ((previewLevel - 1) / 4) * 0.35;
    const controlsStyle = `--button-level:${buttonLevel};--control-size:clamp(${72 * buttonScale}px,${15 * buttonScale}vw,${114 * buttonScale}px);--stop-size:clamp(${78 * buttonScale}px,${16 * buttonScale}vw,${120 * buttonScale}px);--menu-size:clamp(${56 * menuButtonScale}px,${11 * menuButtonScale}vw,${88 * menuButtonScale}px);--quick-size:var(--menu-size);--title-font:clamp(${22 * titleScale}px,${4.8 * titleScale}vw,${38 * titleScale}px);--preview-width:${previewScale * 100}%;--preview-value-font:clamp(${48 * previewScale}px,${10 * previewScale}vw,${82 * previewScale}px);--tilt-icon-size:${35 * tiltScale}px;--tilt-gap:${14 * tiltScale}px;--tilt-font:clamp(${14 * tiltScale}px,${2.7 * tiltScale}vw,${21 * tiltScale}px);--tilt-track:${9 * tiltScale}px;--tilt-thumb:${30 * tiltScale}px`;
    const slats = Array.from({ length: 7 }, (_, index) => `<i style="--i:${index}"></i>`).join("");
    const targetMarker = targetUiPosition === null || Math.abs(targetUiPosition - uiPosition) <= 1 ? "" : `<span class="target-marker" style="--target:${targetUiPosition}%" aria-label="Zielposition ${Math.round(targetUiPosition)} Prozent"></span>`;

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; width:100%; color:var(--primary-text-color,#f5f5f7); font-family:var(--paper-font-body1_-_font-family, "Arial", sans-serif); }
        * { box-sizing:border-box; }
        .card { position:relative; overflow:hidden; width:100%; min-width:260px; padding:clamp(20px,4.7vw,38px); border:1px solid rgba(255,255,255,.1); border-radius:clamp(22px,4vw,36px); background:radial-gradient(ellipse at 32% 22%,#25272c 0,#17191d 43%,#101215 100%); box-shadow:inset 0 1px 1px rgba(255,255,255,.07),0 12px 30px rgba(0,0,0,.2); }
        .card.no-titles { padding-top:calc(clamp(20px,4.7vw,38px) / 2); }
        .header { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; }
        .header[hidden] { display:none; }
        .header:has(> .menu-wrap:only-child) { justify-content:flex-end; }
        .eyebrow { color:#9295a0; font-size:clamp(11px,2.1vw,15px); font-weight:700; letter-spacing:.12em; text-transform:uppercase; }
        h2 { margin:7px 0 0; font-size:var(--title-font); line-height:1.08; font-weight:700; overflow-wrap:anywhere; }
        h2:first-child { margin-top:0; }
        button { color:inherit; font:inherit; cursor:pointer; -webkit-tap-highlight-color:transparent; }
        .menu-wrap { position:relative; z-index:2; flex:none; }
        .menu-toggle,.round { display:grid; place-items:center; border-radius:50%; background:linear-gradient(145deg,#272a30,#17191d); border:2px solid #303239; box-shadow:0 6px 15px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.05); }
        .menu-toggle { width:var(--menu-size); aspect-ratio:1; color:#ff8b2b; }
        .menu-toggle svg { width:46%; height:46%; }
        .quick-menu { position:absolute; z-index:3; top:calc(100% + 10px); right:0; display:flex; flex-direction:column; align-items:center; gap:8px; max-height:0; padding:0 9px; overflow:hidden; opacity:0; transform:translateY(-12px) scaleY(.85); transform-origin:top; pointer-events:none; border:1px solid transparent; border-radius:24px; background:#17191d; box-shadow:0 10px 24px transparent; transition:max-height .32s ease,padding .32s ease,opacity .22s ease,transform .32s ease,border-color .22s ease,box-shadow .32s ease; }
        .quick-menu.open { max-height:280px; padding:10px 9px; opacity:1; transform:translateY(0) scaleY(1); pointer-events:auto; border-color:#34363c; box-shadow:0 10px 24px rgba(0,0,0,.42); }
        .quick { display:grid; place-items:center; width:var(--quick-size); aspect-ratio:1; padding:20%; border:1px solid #34363c; border-radius:50%; background:#23252a; color:#ff8b2b; flex:none; }
        .quick svg { width:100%; height:100%; }
        .visual { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(110px,.85fr); align-items:center; gap:clamp(15px,4vw,36px); margin:clamp(22px,5vw,36px) 0 25px; }
        .no-titles .visual { margin-top:calc(clamp(22px,5vw,36px) / 2); }
        .window { position:relative; width:var(--preview-width); aspect-ratio:1.14; padding:12px 8px 9px; border:7px solid #25262a; border-top-width:17px; border-bottom-width:9px; border-radius:4px; background:linear-gradient(180deg,rgba(23,25,29,.22),rgba(255,145,67,.1)),linear-gradient(130deg,#d9b78c,#6c665b 48%,#ead0a5); box-shadow:0 8px 16px #0008,inset 0 0 0 2px #090a0b; }
        .window::before { content:""; position:absolute; z-index:1; top:-18px; left:-9px; right:-9px; height:clamp(12px,2.5vw,20px); border:1px solid #4a4b51; border-radius:2px; background:linear-gradient(#303238,#191a1f); box-shadow:0 3px 8px #0008; }
        .glass { position:absolute; inset:12px 7px 8px; overflow:hidden; border:2px solid #d5b591; background:radial-gradient(ellipse at 22% 35%,#fff5cd 0 3%,transparent 23%),linear-gradient(180deg,#b8ab92,#d8bb94 52%,#87674e); }
        .glass::after { content:""; position:absolute; inset:0; opacity:.42; background:linear-gradient(100deg,transparent 35%,#fff8df 49%,transparent 62%); }
        .slats { position:absolute; z-index:2; top:0; left:0; right:0; height:calc(100% - var(--position)); overflow:hidden; transition:height .25s ease; }
        .slats i { position:absolute; left:0; right:0; top:calc(var(--i) * 13%); height:11%; border:1px solid #4b4140; border-top-color:#77706d; background:linear-gradient(180deg,#343237,#17181b 60%,#51413a); box-shadow:0 2px 3px #0008; transform:skewY(calc((var(--tilt) - 50) * .035deg)); }
        .readout { min-width:0; }
        .value { font-size:var(--preview-value-font); line-height:.95; font-weight:700; letter-spacing:-.04em; white-space:nowrap; }
        .value small { font-size:.58em; letter-spacing:0; }
        .state { margin-top:12px; color:#a0a2ad; font-size:clamp(15px,3vw,23px); }
        .range-row { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:14px; color:#a4a6b0; font-size:clamp(14px,2.8vw,21px); }
        input[type=range] { --fill:50%; width:100%; height:9px; margin:0; appearance:none; border-radius:10px; outline:none; background:linear-gradient(to right,#ff8827 0 var(--fill),#373a41 var(--fill) 100%); cursor:pointer; }
        input[type=range]::-webkit-slider-thumb { width:clamp(22px,4vw,30px); height:clamp(22px,4vw,30px); appearance:none; border:0; border-radius:50%; background:#ff8b2b; box-shadow:0 2px 8px #0008; }
        input[type=range]::-moz-range-thumb { width:clamp(22px,4vw,30px); height:clamp(22px,4vw,30px); border:0; border-radius:50%; background:#ff8b2b; box-shadow:0 2px 8px #0008; }
        .position-control { position:relative; display:flex; align-items:center; }
        .target-marker { position:absolute; left:var(--target); top:50%; width:clamp(22px,4vw,30px); aspect-ratio:1; border:2px solid #ff8b2b; border-radius:50%; background:#17191d; box-shadow:0 0 0 2px rgba(255,139,43,.18); transform:translate(-50%,-50%); pointer-events:none; }
        .controls { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); align-items:center; justify-items:center; gap:10px; margin:clamp(26px,5vw,40px) 0 0; }
        .round { width:min(var(--control-size),100%); aspect-ratio:1; padding:0; color:#e4e4e8; }
        .round svg { width:65%; height:65%; }
        .stop { width:var(--stop-size); border:3px solid #ff8b2b; color:#ff8b2b; background:radial-gradient(circle,#38251a,#17191d 74%); }
        .stop svg { width:clamp(12px,calc(var(--stop-size) * .32),38px); height:clamp(12px,calc(var(--stop-size) * .32),38px); fill:currentColor; }
        .divider { height:1px; margin:clamp(23px,4vw,32px) 0 20px; background:#303239; }
        .tilt-row { display:grid; grid-template-columns:var(--tilt-icon-size) minmax(80px,.65fr) minmax(90px,1.35fr); align-items:center; gap:var(--tilt-gap); color:#c2c3ca; font-size:var(--tilt-font); }
        .tilt-icon { width:var(--tilt-icon-size); height:var(--tilt-icon-size); color:#c2c3ca; }
        .tilt-row input[type=range] { height:var(--tilt-track); }
        .tilt-row input[type=range]::-webkit-slider-thumb { width:var(--tilt-thumb); height:var(--tilt-thumb); }
        .tilt-row input[type=range]::-moz-range-thumb { width:var(--tilt-thumb); height:var(--tilt-thumb); }
        .tilt-row[hidden] { display:none; }
        .compact .visual { display:none; }
        .compact .range-row { margin-top:clamp(24px,6vw,42px); }
        .no-titles.compact .range-row { margin-top:calc(clamp(24px,6vw,42px) / 2); }
        .no-titles.compact .controls { margin-top:calc(clamp(26px,5vw,40px) / 2); }
        @media (max-width:380px) { .card { padding:18px; } .visual { grid-template-columns:1fr .75fr; gap:13px; } .range-row { gap:8px; } .tilt-row { grid-template-columns:var(--tilt-icon-size) minmax(65px,.65fr) minmax(75px,1.35fr); gap:var(--tilt-gap); } }
        @media (prefers-reduced-motion:reduce) { *,*::before,*::after { transition:none !important; } }
      </style>
      <article class="card ${showPreview ? "" : "compact"} ${!title && !name ? "no-titles" : ""}" style="${controlsStyle}">
        <header class="header" ${!title && !name && !showActionButton ? "hidden" : ""}>
          ${title || name ? `<div>${title ? `<div class="eyebrow">${title}</div>` : ""}${name ? `<h2>${name}</h2>` : ""}</div>` : ""}
          ${showActionButton ? `<div class="menu-wrap"><button class="menu-toggle" aria-label="Schnellwahl anzeigen" aria-expanded="${this._menuOpen}">${this._icon("blinds")}</button>
            <div class="quick-menu ${this._menuOpen ? "open" : ""}" role="group" aria-label="Schnellwahl" aria-hidden="${!this._menuOpen}">
              <button class="quick" data-action="open" title="Ganz auf" aria-label="Ganz auf">${this._icon("up")}</button>
              <button class="quick" data-action="close" title="Ganz zu" aria-label="Ganz zu">${this._icon("down")}</button>
              <button class="quick" data-action="close-tilt" title="Ganz zu, Lamellen 50 Prozent (durchsichtig)" aria-label="Ganz zu, Lamellen 50 Prozent">${this._icon("half")}</button>
            </div>
          </div>` : ""}
        </header>
        <section class="visual" aria-label="Jalousienposition">
          <div class="window" style="--position:${position}%;--tilt:${tilt}"><div class="glass"></div><div class="slats">${slats}</div></div>
          <div class="readout"><div class="value">${displayedPosition}<small> %</small></div><div class="state">${invertPosition ? "geöffnet" : "geschlossen"}</div></div>
        </section>
        ${showPositionSlider ? `<div class="range-row"><span>${invertPosition ? "Zu" : "Auf"}</span><div class="position-control"><input class="position" type="range" min="0" max="100" step="1" value="${uiPosition}" aria-label="Jalousienposition" style="--fill:${uiPosition}%">${targetMarker}</div><span>${invertPosition ? "Auf" : "Zu"}</span></div>` : ""}
        ${showMainControls || showCloseTilt ? `<nav class="controls" aria-label="Jalousiensteuerung">
          ${showMainControls ? `<button class="round raise" aria-label="Hochfahren" title="Hochfahren">${this._icon("up")}</button>
          <button class="round stop" aria-label="Stoppen" title="Stoppen">${this._icon("stop")}</button>
          <button class="round lower" aria-label="Runterfahren" title="Runterfahren">${this._icon("down")}</button>` : ""}
          ${showCloseTilt ? `<button class="round close-tilt" aria-label="100 Prozent geschlossen, Lamellen 50 Prozent" title="100 % geschlossen, Lamellen 50 %">${this._icon("half")}</button>` : ""}
        </nav>` : ""}
        <div class="divider" ${showTilt ? "" : "hidden"}></div>
        <div class="tilt-row" ${showTilt ? "" : "hidden"}>
          <svg class="tilt-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M3 5h18M3 10h18M3 15h18M3 20h18"/></svg>
          <label for="tilt-slider">Lamellen</label>
          <input id="tilt-slider" class="tilt" type="range" min="0" max="100" step="1" value="${tilt}" aria-label="Lamellenposition" style="--fill:${tilt}%">
        </div>
      </article>`;
    this._bindEvents();
  }

  _escape(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
  }

  _icon(name) {
    const icons = {
      blinds: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M3 4h18M4 7h16M4 11h16M4 15h16M4 19h16M6 7v14m12-14v14"/></svg>',
      up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 15 7-7 7 7"/></svg>',
      down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 9 7 7 7-7"/></svg>',
      stop: '<svg viewBox="0 0 24 24" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>',
      half: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5h14M5 10h14M5 15h14M5 20h14"/><path d="M12 3v18" stroke-dasharray="2 3"/></svg>',
    };
    return icons[name];
  }
}

if (!customElements.get("glass-cover-card")) customElements.define("glass-cover-card", GlassCoverCard);

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "glass-cover-card")) {
  window.customCards.push({ type: "glass-cover-card", name: "Glass Cover Card", description: "Responsive Jalousiensteuerung mit optionaler Lamellensteuerung.", preview: true, version: CARD_VERSION });
}
})();

(() => {
const CARD_VERSION = "1.6.5";
const BUTTON_COLORS = {
  orange: "#ff8b2b",
  white: "#f2f2f4",
  gray: "#8f9299",
  green: "#4bc785",
  red: "#f05c5c",
};
const BUTTON_COLOR_OPTIONS = [{ value: "orange", label: "Orange" }, { value: "white", label: "Weiß" }, { value: "gray", label: "Grau" }, { value: "green", label: "Grün" }, { value: "red", label: "Rot" }];
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
})[char]);

class GlassButtonCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._dragging = false;
    this._brightness = 0;
    this._pendingBrightnessState = null;
    this._brightnessTimer = null;
  }

  setConfig(config) {
    window.clearTimeout(this._brightnessTimer);
    this._pendingBrightnessState = null;
    this._dragging = false;
    this._config = {
      entity: "",
      icon: "mdi:gesture-tap-button",
      action: "toggle",
      button_size: 5,
      show_name: true,
      show_card_frame: true,
      show_brightness_slider: true,
      color: "orange",
      ...config,
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config || !this.shadowRoot.querySelector(".button")) {
      this._render();
      return;
    }
    this._syncEntityState();
  }

  get hass() {
    return this._hass;
  }

  getCardSize() {
    return this._config?.show_name === false ? 2 : 3;
  }

  static getConfigElement() {
    return document.createElement("glass-button-card-editor");
  }

  static getConfigForm() {
    const schema = [
      { name: "entity", required: true, selector: { entity: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "icon_active", selector: { icon: {} } },
      { name: "state_active", selector: { text: {} } },
      { name: "color_active", selector: { select: { mode: "dropdown", options: BUTTON_COLOR_OPTIONS } } },
      { name: "icon_inactive", selector: { icon: {} } },
      { name: "state_inactive", selector: { text: {} } },
      { name: "color_inactive", default: "gray", selector: { select: { mode: "dropdown", options: BUTTON_COLOR_OPTIONS } } },
      { name: "binary_sensor_active_state", default: "on", selector: { select: { mode: "dropdown", options: [{ value: "on", label: "Offen" }, { value: "off", label: "Geschlossen" }] } } },
      { name: "name", selector: { text: {} } },
      {
        name: "action",
        default: "toggle",
        selector: { select: { mode: "dropdown", options: [{ value: "toggle", label: "Ein-/Ausschalten" }, { value: "more-info", label: "Mehr Informationen anzeigen" }] } },
      },
      {
        name: "color",
        default: "orange",
        selector: { select: { mode: "dropdown", options: BUTTON_COLOR_OPTIONS } },
      },
      { name: "button_size", default: 5, selector: { number: { min: 1, max: 5, step: 1, mode: "slider" } } },
      { name: "show_name", default: true, selector: { boolean: {} } },
      { name: "show_card_frame", default: true, selector: { boolean: {} } },
      { name: "show_brightness_slider", default: true, selector: { boolean: {} } },
    ];
      return {
        schema,
        computeLabel: (field) => ({
          entity: "Entität",
          icon: "Icon",
          icon_active: "Binary Sensor: Icon für aktiven Zustand",
          state_active: "Binary Sensor: Name des aktiven Zustands",
          color_active: "Binary Sensor: Farbe für aktiven Zustand",
          icon_inactive: "Binary Sensor: Icon für inaktiven Zustand",
          state_inactive: "Binary Sensor: Name des inaktiven Zustands",
          color_inactive: "Binary Sensor: Farbe für inaktiven Zustand",
          binary_sensor_active_state: "Binary Sensor: Zustand mit Akzentfarbe",
          name: "Beschriftung",
          action: "Aktion",
          color: "Farbe",
          button_size: "Button-Größe",
          show_name: "Buttontext anzeigen",
          show_card_frame: "Kartenrahmen anzeigen",
          show_brightness_slider: "Helligkeitsregler anzeigen",
        })[field.name],
      };
  }

  static getStubConfig() {
    return {
      button_size: 5,
      show_name: true,
      show_card_frame: true,
      entity: "light.wohnzimmer",
      name: "Wohnzimmer",
      icon: "mdi:sofa-outline",
      action: "toggle",
      color: "orange",
    };
  }

  _callButton() {
    const button = this._config;
    if (!this._hass || !button.entity) return;
    if (button.entity.startsWith("binary_sensor.") || (button.action || "toggle") === "more-info") {
      this.dispatchEvent(new CustomEvent("hass-more-info", {
        bubbles: true,
        composed: true,
        detail: { entityId: button.entity },
      }));
      return;
    }
    this._hass.callService("homeassistant", "toggle", { entity_id: button.entity });
  }

  _bindEvents() {
    this.shadowRoot.querySelector(".button")?.addEventListener("click", () => this._callButton());
    const slider = this.shadowRoot.querySelector(".dimmer");
    slider?.addEventListener("pointerdown", (event) => this._startBrightnessDrag(event));
    slider?.addEventListener("pointermove", (event) => this._moveBrightnessDrag(event));
    slider?.addEventListener("pointerup", (event) => this._endBrightnessDrag(event));
    slider?.addEventListener("pointercancel", () => { this._dragging = false; slider.classList.remove("dragging"); this._syncEntityState(); });
    slider?.addEventListener("keydown", (event) => this._brightnessKey(event));
  }

  _isDimmable(state) {
    if (this._config.show_brightness_slider === false || !this._config.entity?.startsWith("light.") || !state) return false;
    const modes = state.attributes?.supported_color_modes || [];
    return modes.some((mode) => ["brightness", "color_temp", "hs", "xy", "rgb", "rgbw", "rgbww", "white"].includes(mode)) || Boolean((state.attributes?.supported_features || 0) & 1);
  }

  _displayBrightness(value) {
    this._brightness = Math.max(0, Math.min(100, Math.round(value)));
    const slider = this.shadowRoot.querySelector(".dimmer");
    if (slider) {
      slider.style.setProperty("--brightness", this._brightness);
      slider.setAttribute("aria-valuenow", String(this._brightness));
      slider.setAttribute("aria-valuetext", `${this._brightness} %`);
    }
    const valueLabel = this.shadowRoot.querySelector(".brightness-value");
    if (valueLabel) valueLabel.textContent = `${this._brightness} %`;
  }

  _setBrightnessFromPointer(event) {
    const bounds = this.shadowRoot.querySelector(".dimmer").getBoundingClientRect();
    const angle = Math.atan2(event.clientX - (bounds.left + bounds.width / 2), -(event.clientY - (bounds.top + bounds.height / 2)));
    const pointerValue = ((angle + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * 100;
    if (this._dragging && this._pointerValue != null) {
      let difference = pointerValue - this._pointerValue;
      if (difference > 50) difference -= 100;
      if (difference < -50) difference += 100;
      this._dragBrightness = Math.max(0, Math.min(100, this._dragBrightness + difference));
      this._displayBrightness(this._dragBrightness);
    } else {
      this._dragBrightness = pointerValue < 1 && this._brightness > 50 ? 100 : pointerValue;
      this._displayBrightness(this._dragBrightness);
    }
    this._pointerValue = pointerValue;
  }

  _startBrightnessDrag(event) {
    const state = this._hass?.states?.[this._config.entity];
    if (event.button !== 0 || !this._isDimmable(state) || ["unavailable", "unknown"].includes(state.state)) return;
    event.preventDefault();
    this._pointerValue = null;
    this._dragging = true;
    event.currentTarget.classList.add("dragging");
    event.currentTarget.setPointerCapture(event.pointerId);
    this._setBrightnessFromPointer(event);
  }

  _moveBrightnessDrag(event) {
    if (this._dragging) this._setBrightnessFromPointer(event);
  }

  _endBrightnessDrag(event) {
    if (!this._dragging) return;
    this._setBrightnessFromPointer(event);
    this._dragging = false;
    event.currentTarget.classList.remove("dragging");
    this._applyBrightness();
  }

  _applyBrightness() {
    if (!this._hass || !this._config.entity) return;
    this._pendingBrightnessState = this._hass.states?.[this._config.entity] || null;
    window.clearTimeout(this._brightnessTimer);
    this._brightnessTimer = window.setTimeout(() => {
      this._pendingBrightnessState = null;
      this._syncEntityState();
    }, 2500);
    if (this._brightness === 0) this._hass.callService("light", "turn_off", { entity_id: this._config.entity });
    else this._hass.callService("light", "turn_on", { entity_id: this._config.entity, brightness_pct: this._brightness });
  }

  _brightnessKey(event) {
    const state = this._hass?.states?.[this._config.entity];
    if (!this._isDimmable(state) || ["unavailable", "unknown"].includes(state.state)) return;
    let value = this._brightness;
    if (event.key === "ArrowUp" || event.key === "ArrowRight") value += 5;
    else if (event.key === "ArrowDown" || event.key === "ArrowLeft") value -= 5;
    else if (event.key === "Home") value = 0;
    else if (event.key === "End") value = 100;
    else return;
    event.preventDefault();
    this._displayBrightness(value);
    this._applyBrightness();
  }

  _syncEntityState() {
    const button = this.shadowRoot.querySelector(".button");
    if (!button) return;
    const state = this._hass?.states?.[this._config.entity];
    const binarySensor = this._config.entity?.startsWith("binary_sensor.");
    const binaryKnown = binarySensor && ["on", "off"].includes(state?.state);
    const isActive = binarySensor ? binaryKnown && state.state === (this._config.binary_sensor_active_state === "off" ? "off" : "on") : state && !["off", "closed", "idle", "standby", "unavailable", "unknown", "not_home"].includes(state.state);
    button.classList.toggle("binary-sensor", Boolean(binarySensor));
    button.classList.toggle("active", Boolean(isActive));
    button.classList.toggle("inactive", Boolean(binarySensor ? binaryKnown && !isActive : state && ["off", "closed", "idle", "standby", "not_home"].includes(state.state)));
    const icon = this.shadowRoot.querySelector(".button ha-icon");
    if (icon) icon.setAttribute("icon", (binaryKnown ? ((isActive ? this._config.icon_active : this._config.icon_inactive) || (state.state === "on" ? this._config.icon_open : this._config.icon_closed)) : null) || this._config.icon || "mdi:gesture-tap-button");
    const dimmable = this._isDimmable(state);
    const available = !["unavailable", "unknown"].includes(state?.state);
    button.classList.toggle("dimmable", dimmable);
    const slider = this.shadowRoot.querySelector(".dimmer");
    if (slider) {
      slider.classList.toggle("visible", dimmable);
      slider.classList.toggle("inactive", Boolean(state && state.state === "off"));
      slider.classList.toggle("disabled", !available);
      slider.setAttribute("tabindex", dimmable && available ? "0" : "-1");
      slider.setAttribute("aria-hidden", String(!dimmable));
      slider.setAttribute("aria-disabled", String(!available));
    }
    if (this._pendingBrightnessState && this._pendingBrightnessState !== state) {
      this._pendingBrightnessState = null;
      window.clearTimeout(this._brightnessTimer);
    }
    if (!this._dragging && !this._pendingBrightnessState) this._displayBrightness(isActive && Number.isFinite(state?.attributes?.brightness) ? state.attributes.brightness / 255 * 100 : 0);
    const stateLabel = this.shadowRoot.querySelector(".state-value");
    if (stateLabel) stateLabel.textContent = !dimmable && ["on", "off"].includes(state?.state) ? (binarySensor ? ((isActive ? this._config.state_active : this._config.state_inactive) || (state.state === "on" ? "Offen" : "Geschlossen")) : (state.state === "on" ? "An" : "Aus")) : "";
    const name = String(this._config.name ?? state?.attributes?.friendly_name ?? this._config.entity ?? "Button").trim();
    const accessibleName = name || state?.attributes?.friendly_name || this._config.entity || "Button";
    button.setAttribute("aria-label", accessibleName);
    button.setAttribute("title", accessibleName);
    const label = this.shadowRoot.querySelector(".name");
    if (label && this._config.name == null) label.textContent = name;
  }

  _render() {
    if (!this._config) return;
    const level = Math.min(5, Math.max(1, Number(this._config.button_size) || 5));
    const scale = 1 / 3 + ((level - 1) / 4) * (2 / 3);
    const showName = this._config.show_name !== false;
    const showCardFrame = this._config.show_card_frame !== false;
    const color = BUTTON_COLORS[this._config.color] ? this._config.color : "orange";
    const activeColor = BUTTON_COLORS[this._config.color_active] || BUTTON_COLORS[color];
    const inactiveColor = BUTTON_COLORS[this._config.color_inactive] || BUTTON_COLORS.gray;
    const state = this._hass?.states?.[this._config.entity];
    const isActive = state && !["off", "closed", "idle", "standby", "unavailable", "unknown", "not_home"].includes(state.state);
    const name = String(this._config.name ?? state?.attributes?.friendly_name ?? this._config.entity ?? "Button").trim();
    const icon = this._config.icon || "mdi:gesture-tap-button";

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; width:100%; color:var(--primary-text-color,#f3f3f5); font-family:var(--paper-font-body1_-_font-family,"Arial",sans-serif); }
        * { box-sizing:border-box; }
        .card { width:100%; padding:clamp(16px,3vw,30px); border:1px solid rgba(255,255,255,.1); border-radius:28px; background:radial-gradient(ellipse at 50% 0,#22252a 0,#15171a 62%,#101214 100%); box-shadow:inset 0 1px 1px rgba(255,255,255,.06),0 12px 30px rgba(0,0,0,.2); }
        .card.no-frame { padding:0; border:0; border-radius:0; background:transparent; box-shadow:none; }
        .button-wrap { display:flex; flex-direction:column; align-items:center; gap:clamp(12px,2vw,20px); }
        .button-control { position:relative; width:var(--button-size); aspect-ratio:1; flex:none; }
        .button { display:grid; width:100%; height:100%; place-items:center; padding:0; border:2px solid color-mix(in srgb,var(--accent) 78%,#414348); border-radius:50%; background:linear-gradient(145deg,#222428,#131518); color:var(--accent); box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 8px 18px rgba(0,0,0,.28); transition:border-color .18s ease,color .18s ease,background .18s ease,box-shadow .18s ease,transform .18s ease; cursor:pointer; -webkit-tap-highlight-color:transparent; }
        .button:hover { transform:translateY(-2px); border-color:var(--accent); }
        .button.active { border-color:var(--accent); background:radial-gradient(circle at 50% 45%,color-mix(in srgb,var(--accent) 24%,#1c1b19),#1c1b19 72%); box-shadow:inset 0 0 24px color-mix(in srgb,var(--accent) 18%,transparent),0 0 0 1px color-mix(in srgb,var(--accent) 35%,transparent),0 8px 22px rgba(0,0,0,.3); }
        .button.inactive { color:#85878b; border-color:#45474b; }
        .button.inactive:hover { border-color:#77797d; }
        .button.binary-sensor.active { --accent:var(--sensor-active-color); color:var(--sensor-active-color); }
        .button.binary-sensor.inactive { color:var(--sensor-inactive-color); border-color:var(--sensor-inactive-color); }
        .button.binary-sensor.inactive:hover { border-color:var(--sensor-inactive-color); }
        .button.dimmable,.button.dimmable:hover { border-color:transparent; }
        .button.dimmable:hover { transform:none; }
        .button-content { display:flex; flex-direction:column; align-items:center; justify-content:center; }
        .button.dimmable ha-icon,.button:has(.state-value:not(:empty)) ha-icon { transform:scale(.7); }
        .brightness-value,.state-value { color:inherit; font-size:clamp(5px,calc(var(--button-size) * .15),17px); line-height:1; white-space:nowrap; }
        .button.binary-sensor .state-value { font-size:clamp(3px,calc(var(--button-size) * .1),11px); }
        .brightness-value { display:none; }
        .button.dimmable .brightness-value { display:block; }
        .dimmer { position:absolute; inset:0; width:100%; height:100%; overflow:hidden; visibility:hidden; pointer-events:none; touch-action:none; }
        .dimmer.visible { visibility:visible; }
        .dimmer-track,.dimmer-progress { fill:none; stroke-width:7; }
        .dimmer-track { stroke:#383a3d; }
        .dimmer-progress { stroke:var(--accent); stroke-dasharray:100; stroke-dashoffset:calc(100 - var(--brightness,0)); transform:rotate(-90deg); transform-origin:50% 50%; transition:stroke-dashoffset .45s ease; }
        .dimmer-thumb { fill:var(--accent); stroke:#c3c4c6; stroke-width:1; transform:rotate(calc(var(--brightness,0) * 3.6deg)); transform-origin:50% 50%; transition:transform .45s ease; }
        .dimmer.inactive .dimmer-thumb { fill:#77797d; stroke:#77797d; }
        .dimmer-hit { fill:none; stroke:transparent; stroke-width:16; pointer-events:stroke; cursor:pointer; }
        .dimmer.visible .dimmer-thumb { pointer-events:all; cursor:pointer; }
        .dimmer.disabled .dimmer-hit,.dimmer.disabled .dimmer-thumb { pointer-events:none; }
        .dimmer.dragging .dimmer-progress,.dimmer.dragging .dimmer-thumb { transition:none; }
        .dimmer:focus-visible { outline:2px solid var(--accent); outline-offset:3px; border-radius:50%; }
        ha-icon { display:block; --mdc-icon-size:var(--icon-size); }
        .name { max-width:100%; color:#e4e4e7; font-size:clamp(13px,2.2vw,20px); line-height:1.2; text-align:center; overflow-wrap:anywhere; }
        @media (prefers-reduced-motion:reduce) { *,*::before,*::after { transition:none !important; } }
      </style>
      <article class="card ${showCardFrame ? "" : "no-frame"}" style="--accent:${BUTTON_COLORS[color]};--sensor-active-color:${activeColor};--sensor-inactive-color:${inactiveColor};--button-size:clamp(${72 * scale}px,${15 * scale}vw,${114 * scale}px);--icon-size:clamp(${Math.min(16, 72 * scale * .48)}px,${15 * scale * .48}vw,${114 * scale * .48}px)">
        <div class="button-wrap">
          <div class="button-control">
          <button class="button ${isActive ? "active" : ""}" aria-label="${escapeHtml(name)}" title="${escapeHtml(name)}">
            <span class="button-content"><ha-icon icon="${escapeHtml(icon)}"></ha-icon><span class="brightness-value">0 %</span><span class="state-value"></span></span>
          </button>
          <svg class="dimmer" viewBox="0 0 100 100" role="slider" aria-label="Helligkeit" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-hidden="true" tabindex="-1"><circle class="dimmer-track" cx="50" cy="50" r="43"></circle><circle class="dimmer-progress" cx="50" cy="50" r="43" pathLength="100"></circle><circle class="dimmer-hit" cx="50" cy="50" r="43"></circle><circle class="dimmer-thumb" cx="50" cy="7" r="4.5"></circle></svg>
          </div>
          ${showName && name ? `<span class="name">${escapeHtml(name)}</span>` : ""}
        </div>
      </article>`;
    this._bindEvents();
    this._syncEntityState();
  }
}

class GlassButtonCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = "<ha-form></ha-form>";
    this._config = {};
    this._domain = null;
    this.shadowRoot.querySelector("ha-form").addEventListener("value-changed", (event) => {
      event.stopPropagation();
      this._config = { ...this._config, ...event.detail.value };
      this._syncForm();
      this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config: this._config } }));
    });
  }

  setConfig(config) {
    this._config = { ...config };
    this._syncForm();
  }

  set hass(hass) {
    this._hass = hass;
    this.shadowRoot.querySelector("ha-form").hass = hass;
  }

  _syncForm() {
    const form = this.shadowRoot.querySelector("ha-form");
    const domain = this._config.entity?.split(".")[0] || "";
    if (domain !== this._domain) {
      this._domain = domain;
      const binaryFields = ["icon_active", "icon_inactive", "state_active", "state_inactive", "color_active", "color_inactive", "binary_sensor_active_state"];
      const nonBinaryFields = ["icon", "color", "action"];
      const definition = GlassButtonCard.getConfigForm();
      form.schema = definition.schema.filter((field) => {
        if (binaryFields.includes(field.name)) return domain === "binary_sensor";
        if (nonBinaryFields.includes(field.name)) return domain !== "binary_sensor";
        if (field.name === "show_brightness_slider") return domain === "light";
        return true;
      });
      form.computeLabel = definition.computeLabel;
    }
    form.data = this._config;
    form.hass = this._hass;
  }
}

if (!customElements.get("glass-button-card")) customElements.define("glass-button-card", GlassButtonCard);
if (!customElements.get("glass-button-card-editor")) customElements.define("glass-button-card-editor", GlassButtonCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "glass-button-card")) {
  window.customCards.push({ type: "glass-button-card", name: "Glass Button Card", description: "Einzelner runder Home Assistant Button mit Icon- und Farbauswahl.", preview: true, version: CARD_VERSION });
}
})();

(() => {
const CARD_VERSION = "1.5.3";
const escapePanelText = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
})[char]);

class GlassPanelCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._children = [];
    this._helpersPromise = null;
    this._childrenGeneration = 0;
  }

  setConfig(config) {
    this._config = {
      title: "",
      subtitle: "",
      title_size: 5,
      button_size: 5,
      show_action_button: false,
      action_icon: "mdi:gesture-tap-button",
      action: "toggle",
      cards: [],
      ...config,
      cards: Array.isArray(config.cards) ? config.cards : [],
    };
    this._childrenGeneration += 1;
    this._children = [];
    this._renderShell();
    return this._loadChildren();
  }

  set hass(hass) {
    this._hass = hass;
    for (const child of this._children) child.hass = hass;
    this._updateActionState();
  }

  get hass() {
    return this._hass;
  }

  getCardSize() {
    return Math.max(3, (this._config?.cards?.length ?? 0) * 2 + 2);
  }

  static getStubConfig() {
    return {
      title: "Aktionen",
      subtitle: "Wohnzimmer",
      title_size: 5,
      button_size: 5,
      show_action_button: true,
      action_entity: "light.wohnzimmer",
      action_icon: "mdi:sofa-outline",
      action: "toggle",
      cards: [],
    };
  }

  static async getConfigElement() {
    const helpers = await window.loadCardHelpers();
    helpers.createCardElement({ type: "vertical-stack", cards: [] });
    await customElements.whenDefined("hui-vertical-stack-card");
    const stackCard = customElements.get("hui-vertical-stack-card");
    await stackCard.getConfigElement();
    await customElements.whenDefined("hui-card-picker");
    await customElements.whenDefined("hui-card-element-editor");
    return document.createElement("glass-panel-card-editor");
  }

  async _loadChildren() {
    const cardsConfig = this._config.cards;
    const generation = this._childrenGeneration;
    try {
      this._helpersPromise ??= window.loadCardHelpers();
      const helpers = await this._helpersPromise;
      if (!this._config || generation !== this._childrenGeneration) return;
      const container = this.shadowRoot.querySelector(".children");
      if (!container) return;
      container.replaceChildren();
      this._children = [];
      if (cardsConfig.length === 0) {
        container.innerHTML = `<div class="empty">Keine Karten konfiguriert.</div>`;
      } else {
        const stack = helpers.createCardElement({ type: "vertical-stack", cards: cardsConfig });
        stack.hass = this._hass;
        this._children = [stack];
        container.append(stack);
      }
      this._updateActionState();
    } catch (error) {
      const container = this.shadowRoot.querySelector(".children");
      if (container) container.textContent = `Karten konnten nicht geladen werden: ${error.message}`;
    }
  }

  _callHeaderAction() {
    const entity = this._config.action_entity;
    if (!this._hass || !entity) return;
    if (this._config.action === "more-info") {
      this.dispatchEvent(new CustomEvent("hass-more-info", {
        bubbles: true,
        composed: true,
        detail: { entityId: entity },
      }));
      return;
    }
    this._hass.callService("homeassistant", "toggle", { entity_id: entity });
  }

  _updateActionState() {
    const button = this.shadowRoot.querySelector(".header-action");
    if (!button) return;
    const state = this._hass?.states?.[this._config.action_entity];
    button.classList.toggle("active", Boolean(state && !["off", "closed", "idle", "standby", "unavailable", "unknown", "not_home"].includes(state.state)));
    button.classList.toggle("inactive", Boolean(state && ["off", "closed", "idle", "standby", "not_home"].includes(state.state)));
    const label = this.shadowRoot.querySelector(".action-state");
    if (label) label.textContent = ["on", "off"].includes(state?.state) ? (state.state === "on" ? "An" : "Aus") : "";
  }

  _renderShell() {
    const title = escapePanelText(String(this._config.title ?? "").trim());
    const subtitle = escapePanelText(String(this._config.subtitle ?? "").trim());
    const titleLevel = Math.min(5, Math.max(1, Number(this._config.title_size) || 5));
    const titleScale = 0.65 + ((titleLevel - 1) / 4) * 0.35;
    const buttonLevel = Math.min(5, Math.max(1, Number(this._config.button_size) || 5));
    const buttonScale = 1 / 3 + ((buttonLevel - 1) / 4) * (2 / 3);
    const menuButtonScale = 0.5 + buttonScale * 0.5;
    const actionVisible = this._config.show_action_button && this._config.action_entity;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; width:100%; color:var(--primary-text-color,#f3f3f5); font-family:var(--paper-font-body1_-_font-family,"Arial",sans-serif); }
        * { box-sizing:border-box; }
        .panel { width:100%; padding:clamp(20px,4.7vw,38px); border:1px solid rgba(255,255,255,.1); border-radius:28px; background:radial-gradient(ellipse at 48% 0,#22252a 0,#15171a 62%,#101214 100%); box-shadow:inset 0 1px 1px rgba(255,255,255,.06),0 12px 30px rgba(0,0,0,.2); }
        .header { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:clamp(20px,3vw,30px); }
        .header[hidden] { display:none; }
        .header:has(> .header-action:only-child) { justify-content:flex-end; }
        .titles { min-width:0; }
        .title { color:#9295a0; font-size:clamp(11px,2.1vw,15px); font-weight:700; letter-spacing:.12em; line-height:normal; text-transform:uppercase; }
        .subtitle { margin:7px 0 0; color:var(--primary-text-color,#f3f3f5); font-size:var(--subtitle-font); font-weight:700; line-height:1.08; overflow-wrap:anywhere; }
        .subtitle:first-child { margin-top:0; }
        .header-action { position:relative; display:grid; flex:none; width:var(--header-action-size); aspect-ratio:1; place-items:center; border:2px solid #303239; border-radius:50%; background:linear-gradient(145deg,#272a30,#17191d); color:#ff8b2b; font:inherit; box-shadow:0 6px 15px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.05); cursor:pointer; -webkit-tap-highlight-color:transparent; }
        .header-action.active { border-color:#ff8b2b; color:#ff9b4a; box-shadow:inset 0 0 20px rgba(255,139,43,.12),0 0 0 1px rgba(255,139,43,.2),0 6px 15px rgba(0,0,0,.25); }
        .header-action.inactive { color:#85878b; border-color:#45474b; }
        .header-action ha-icon { display:block; width:var(--header-icon-size); height:var(--header-icon-size); --mdc-icon-size:var(--header-icon-size); }
        .action-state { position:absolute; bottom:11%; font-size:clamp(5px,calc(var(--header-action-size) * .15),13px); line-height:1; color:inherit; }
        .children { display:block; min-width:0; }
        .children > * { min-width:0; }
        .empty { color:var(--secondary-text-color,#a0a2ad); }
        @media (max-width:380px) { .panel { padding:18px; } }
      </style>
      <article class="panel" style="--subtitle-font:clamp(${22 * titleScale}px,${4.8 * titleScale}vw,${38 * titleScale}px);--header-action-size:clamp(${56 * menuButtonScale}px,${11 * menuButtonScale}vw,${88 * menuButtonScale}px);--header-icon-size:calc((var(--header-action-size) - 16px) * .46)">
        <header class="header" ${!title && !subtitle && !actionVisible ? "hidden" : ""}>
          ${title || subtitle ? `<div class="titles">${title ? `<div class="title">${title}</div>` : ""}${subtitle ? `<h2 class="subtitle">${subtitle}</h2>` : ""}</div>` : ""}
          ${actionVisible ? `<button class="header-action" aria-label="${escapePanelText(this._config.action_entity)}" title="${escapePanelText(this._config.action_entity)}"><ha-icon icon="${escapePanelText(this._config.action_icon || "mdi:gesture-tap-button")}"></ha-icon><span class="action-state"></span></button>` : ""}
        </header>
        <div class="children">${this._config.cards.length ? "" : `<div class="empty">Keine Karten konfiguriert.</div>`}</div>
      </article>`;
    this.shadowRoot.querySelector(".header-action")?.addEventListener("click", () => this._callHeaderAction());
  }
}

const PANEL_FORM_SCHEMA = [
  { name: "title", default: "", selector: { text: {} } },
  { name: "subtitle", default: "", selector: { text: {} } },
  { name: "title_size", default: 5, selector: { number: { min: 1, max: 5, step: 1, mode: "slider" } } },
  { name: "button_size", default: 5, selector: { number: { min: 1, max: 5, step: 1, mode: "slider" } }, visible: { field: "show_action_button", value: true } },
  { name: "show_action_button", default: false, selector: { boolean: {} } },
  { name: "action_entity", selector: { entity: {} }, visible: { field: "show_action_button", value: true } },
  { name: "action_icon", selector: { icon: {} }, visible: { field: "show_action_button", value: true } },
  {
    name: "action",
    default: "toggle",
    selector: { select: { mode: "dropdown", options: [["toggle", "Ein-/Ausschalten"], ["more-info", "Mehr Informationen anzeigen"]] } },
    visible: { field: "show_action_button", value: true },
  },
];

class GlassPanelCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._lovelace = undefined;
    this._selectedCard = -1;
    this._showPicker = false;
    this._renderShell();
  }

  setConfig(config) {
    const previousCards = JSON.stringify(this._config?.cards ?? []);
    this._config = {
      title: "",
      subtitle: "",
      title_size: 5,
      button_size: 5,
      show_action_button: false,
      action_icon: "mdi:gesture-tap-button",
      action: "toggle",
      cards: [],
      ...config,
      cards: Array.isArray(config.cards) ? config.cards : [],
    };
    const form = this.shadowRoot.querySelector("ha-form");
    if (form) {
      form.schema = PANEL_FORM_SCHEMA;
      form.data = this._config;
      form.hass = this._hass;
      form.computeLabel = (field) => ({ title: "Titel", subtitle: "Beschriftung", title_size: "Beschriftungsgröße", button_size: "Button-Größe", show_action_button: "Aktionsbutton anzeigen", action_entity: "Aktions-Entität", action_icon: "Aktions-Icon", action: "Aktion" })[field.name] || field.name;
    }
    if (previousCards !== JSON.stringify(this._config.cards)) {
      this._selectedCard = Math.min(this._selectedCard, this._config.cards.length - 1);
      this._renderCardList();
    }
    this._syncCardEditor();
  }

  set hass(hass) {
    this._hass = hass;
    const form = this.shadowRoot.querySelector("ha-form");
    const picker = this.shadowRoot.querySelector("hui-card-picker");
    const cardEditor = this.shadowRoot.querySelector("hui-card-element-editor");
    if (form) form.hass = hass;
    if (picker) picker.hass = hass;
    if (cardEditor) cardEditor.hass = hass;
  }

  set lovelace(lovelace) {
    this._lovelace = lovelace;
    const picker = this.shadowRoot.querySelector("hui-card-picker");
    const cardEditor = this.shadowRoot.querySelector("hui-card-element-editor");
    if (picker) picker.lovelace = lovelace;
    if (cardEditor) cardEditor.lovelace = lovelace;
  }

  _renderShell() {
    this.shadowRoot.innerHTML = `
      <style>
        .editor { display:grid; gap:20px; }
        .cards-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .card-tabs { display:flex; flex:1; min-width:0; gap:6px; overflow-x:auto; }
        .card-order { display:flex; gap:4px; }
        button { min-height:40px; padding:8px 12px; color:var(--primary-text-color); background:var(--card-background-color,#202124); border:1px solid var(--divider-color,#555); border-radius:6px; font:inherit; cursor:pointer; }
        button[aria-pressed="true"] { border-color:var(--primary-color,#ff8b2b); }
        .card-editor[hidden],.card-picker[hidden] { display:none; }
        .card-picker { min-height:300px; }
      </style>
      <div class="editor">
        <ha-form></ha-form>
        <section class="cards-manager">
          <div class="cards-toolbar">
            <div class="card-tabs"></div>
            <div class="card-order">
              <button type="button" class="move-before" title="Karte nach links verschieben" aria-label="Karte nach links verschieben">←</button>
              <button type="button" class="move-after" title="Karte nach rechts verschieben" aria-label="Karte nach rechts verschieben">→</button>
            </div>
            <button type="button" class="remove-card" title="Ausgewählte Karte entfernen">Entfernen</button>
            <button type="button" class="add-card">Karte hinzufügen</button>
          </div>
          <hui-card-element-editor class="card-editor" hidden></hui-card-element-editor>
          <hui-card-picker class="card-picker" hide-clipboard hidden></hui-card-picker>
        </section>
      </div>`;

    this.shadowRoot.querySelector("ha-form")?.addEventListener("value-changed", (event) => this._handleFormChanged(event));
    this.shadowRoot.querySelector("hui-card-picker")?.addEventListener("config-changed", (event) => this._handleCardPicked(event));
    this.shadowRoot.querySelector("hui-card-element-editor")?.addEventListener("config-changed", (event) => this._handleChildChanged(event));
    this.shadowRoot.querySelector(".add-card")?.addEventListener("click", () => this._togglePicker());
    this.shadowRoot.querySelector(".remove-card")?.addEventListener("click", () => this._removeSelectedCard());
    this.shadowRoot.querySelector(".move-before")?.addEventListener("click", () => this._moveSelectedCard(-1));
    this.shadowRoot.querySelector(".move-after")?.addEventListener("click", () => this._moveSelectedCard(1));
  }

  _handleFormChanged(event) {
    this._config = { ...this._config, ...event.detail.value };
    this._notifyConfig();
  }

  _handleCardPicked(event) {
    event.stopPropagation();
    this._config = { ...this._config, cards: [...this._config.cards, event.detail.config] };
    this._selectedCard = this._config.cards.length - 1;
    this._showPicker = false;
    this._renderCardList();
    this._syncCardEditor();
    this._notifyConfig();
  }

  _handleChildChanged(event) {
    event.stopPropagation();
    if (this._selectedCard < 0) return;
    const cards = [...this._config.cards];
    cards[this._selectedCard] = event.detail.config ?? event.detail.value;
    this._config = { ...this._config, cards };
    this._notifyConfig();
  }

  _togglePicker() {
    this._showPicker = !this._showPicker;
    const picker = this.shadowRoot.querySelector("hui-card-picker");
    const editor = this.shadowRoot.querySelector("hui-card-element-editor");
    if (picker) {
      picker.hidden = !this._showPicker;
      picker.hass = this._hass;
      picker.lovelace = this._lovelace;
    }
    if (editor) editor.hidden = this._showPicker || this._selectedCard < 0;
  }

  _removeSelectedCard() {
    if (this._selectedCard < 0) return;
    const cards = this._config.cards.filter((_, index) => index !== this._selectedCard);
    this._config = { ...this._config, cards };
    this._selectedCard = Math.min(this._selectedCard, cards.length - 1);
    this._renderCardList();
    this._syncCardEditor();
    this._notifyConfig();
  }

  _moveSelectedCard(offset) {
    const target = this._selectedCard + offset;
    if (target < 0 || target >= this._config.cards.length) return;
    const cards = [...this._config.cards];
    [cards[this._selectedCard], cards[target]] = [cards[target], cards[this._selectedCard]];
    this._config = { ...this._config, cards };
    this._selectedCard = target;
    this._renderCardList();
    this._syncCardEditor();
    this._notifyConfig();
  }

  _selectCard(index) {
    this._selectedCard = index;
    this._showPicker = false;
    this._renderCardList();
    this._syncCardEditor();
  }

  _renderCardList() {
    const tabs = this.shadowRoot.querySelector(".card-tabs");
    if (!tabs) return;
    tabs.innerHTML = this._config.cards.map((card, index) => `<button type="button" data-card-index="${index}" aria-pressed="${index === this._selectedCard}">${escapePanelText(card.type || `Karte ${index + 1}`)}</button>`).join("");
    tabs.querySelectorAll("[data-card-index]").forEach((button) => button.addEventListener("click", () => this._selectCard(Number(button.dataset.cardIndex))));
    const picker = this.shadowRoot.querySelector("hui-card-picker");
    const editor = this.shadowRoot.querySelector("hui-card-element-editor");
    if (picker) picker.hidden = !this._showPicker;
    if (editor) editor.hidden = this._showPicker || this._selectedCard < 0;
  }

  _syncCardEditor() {
    const editor = this.shadowRoot.querySelector("hui-card-element-editor");
    if (!editor || this._selectedCard < 0) return;
    editor.hass = this._hass;
    editor.lovelace = this._lovelace;
    editor.value = this._config.cards[this._selectedCard];
    editor.hidden = this._showPicker;
  }

  _notifyConfig() {
    this.dispatchEvent(new CustomEvent("config-changed", {
      bubbles: true,
      composed: true,
      detail: { config: this._config },
    }));
  }
}

if (!customElements.get("glass-panel-card")) customElements.define("glass-panel-card", GlassPanelCard);
if (!customElements.get("glass-panel-card-editor")) customElements.define("glass-panel-card-editor", GlassPanelCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "glass-panel-card")) {
  window.customCards.push({ type: "glass-panel-card", name: "Glass Panel Card", description: "Kartencontainer mit Titel, Untertitel und optionaler Aktion.", preview: true, version: CARD_VERSION });
}
})();

(() => {
const RGB_CARD_VERSION = "1.2.2";
const RGB_PRESET_COUNT = 6;
const rgbToHs = (rgb) => {
  const [red, green, blue] = rgb.map((value) => value / 255);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const difference = maximum - minimum;
  let hue = 0;
  if (difference) {
    if (maximum === red) hue = (green - blue) / difference;
    else if (maximum === green) hue = (blue - red) / difference + 2;
    else hue = (red - green) / difference + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return [Math.round(hue), maximum ? Math.round(difference / maximum * 100) : 0];
};
const escapeRgb = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

class GlassRgbCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._stateKey = null;
    this._presets = [];
    this._selected = -1;
    this._hue = 0;
    this._saturation = 100;
    this._brightness = 0;
    this._temperatureValue = null;
    this._dragging = false;
    this._pending = false;
    this._pendingTimer = null;
  }

  static getStubConfig() { return { entity: "light.wohnzimmer", title: "RGB", turn_on_text: "RGB", title_size: 5, button_size: 5, show_action_button: true, show_presets: false }; }
  static getConfigForm() {
    return {
      schema: [
        { name: "entity", required: true, selector: { entity: { filter: { domain: "light" } } } },
        { name: "title", default: "RGB", selector: { text: {} } },
        { name: "name", selector: { text: {} } },
        { name: "icon", selector: { icon: {} } },
        { name: "turn_on_text", default: "RGB", selector: { text: {} } },
        { name: "show_action_button", default: true, selector: { boolean: {} } },
        { name: "title_size", default: 5, selector: { number: { min: 1, max: 5, step: 1, mode: "slider" } } },
        { name: "button_size", default: 5, selector: { number: { min: 1, max: 5, step: 1, mode: "slider" } } },
        { name: "show_presets", default: false, selector: { boolean: {} } },
        ...Array.from({ length: RGB_PRESET_COUNT }, (_, index) => ({ name: `preset_${index + 1}`, selector: { color_rgb: {} } })),
      ],
      computeLabel: (field) => ({ entity: "Licht", title: "Titel", name: "Beschriftung", icon: "Icon", turn_on_text: "Text unter dem Einschalt-Icon", show_action_button: "Kopfbutton anzeigen", title_size: "Beschriftungsgröße", button_size: "Button-Größe", show_presets: "Farb-Presets anzeigen" })[field.name] || (field.name.startsWith("preset_") ? `Farb-Preset ${field.name.slice(7)}` : field.name),
    };
  }

  setConfig(config) {
    if (!config.entity) throw new Error("Bitte eine Licht-Entität auswählen.");
    for (let index = 1; index <= RGB_PRESET_COUNT; index++) {
      const color = config[`preset_${index}`];
      if (color != null && (!Array.isArray(color) || color.length !== 3 || color.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255))) throw new Error(`Preset ${index} muss eine RGB-Farbe mit drei Werten von 0 bis 255 sein.`);
    }
    const changed = this._config?.entity !== config.entity;
    this._config = { title: "RGB", turn_on_text: "RGB", title_size: 5, button_size: 5, show_action_button: true, show_presets: false, ...config };
    if (changed) this._selected = -1;
    this._loadPresets();
    this._selected = -1;
    this._render();
    this._sync();
  }

  set hass(hass) {
    this._hass = hass;
    const state = hass?.states?.[this._config?.entity];
    const attributes = state?.attributes;
    const stateKey = JSON.stringify([state?.state, attributes?.friendly_name, attributes?.supported_color_modes, attributes?.brightness, attributes?.hs_color, attributes?.color_temp_kelvin, attributes?.min_color_temp_kelvin, attributes?.max_color_temp_kelvin, attributes?.min_mireds, attributes?.max_mireds]);
    if (stateKey !== this._stateKey) {
      this._stateKey = stateKey;
      this._sync();
    }
  }
  get hass() { return this._hass; }
  getCardSize() { return 5; }

  _loadPresets() {
    this._presets = Array.from({ length: RGB_PRESET_COUNT }, (_, index) => ({ slot: index + 1, rgb: this._config[`preset_${index + 1}`] })).filter((preset) => Array.isArray(preset.rgb)).map((preset) => {
      const [hue, saturation] = rgbToHs(preset.rgb);
      return { ...preset, hue, saturation };
    });
  }

  _markPending() {
    this._pending = true;
    clearTimeout(this._pendingTimer);
    this._pendingTimer = setTimeout(() => { this._pending = false; this._sync(); }, 1800);
  }

  _sendColor() {
    if (!this._hass) return;
    this._markPending();
    this._hass.callService("light", "turn_on", { entity_id: this._config.entity, hs_color: [this._hue, this._saturation], brightness_pct: Math.max(1, this._brightness) });
  }

  _sendBrightness() {
    if (!this._hass) return;
    this._markPending();
    if (this._brightness === 0) this._hass.callService("light", "turn_off", { entity_id: this._config.entity });
    else this._hass.callService("light", "turn_on", { entity_id: this._config.entity, brightness_pct: this._brightness });
  }

  _selectPreset(index) {
    this._selected = index;
    const preset = this._presets[index];
    if (!preset || !this._hass) return;
    this._hue = preset.hue; this._saturation = preset.saturation;
    this._temperatureValue = null;
    this._updateView();
    this._markPending();
    this._hass.callService("light", "turn_on", { entity_id: this._config.entity, rgb_color: preset.rgb });
  }

  _toggleLight() {
    const state = this._hass?.states?.[this._config.entity]?.state;
    if (state === "off") {
      if (this._presets.length) this._selectPreset(0);
      else this._hass.callService("light", "turn_on", { entity_id: this._config.entity });
    }
    else if (state === "on") this._hass.callService("homeassistant", "toggle", { entity_id: this._config.entity });
  }

  _setHue(event) {
    const bounds = this.shadowRoot.querySelector(".wheel").getBoundingClientRect();
    const angle = Math.atan2(event.clientX - bounds.left - bounds.width / 2, -(event.clientY - bounds.top - bounds.height / 2));
    this._hue = Math.round(((angle * 180 / Math.PI) + 360) % 360);
    this._saturation = 100;
    this._temperatureValue = null;
    this._selected = -1;
    this._updateView();
  }

  _sync() {
    if (!this._config || !this.shadowRoot.querySelector(".card")) return;
    const state = this._hass?.states?.[this._config.entity];
    const modes = state?.attributes?.supported_color_modes || [];
    const supportsColor = modes.some((mode) => ["hs", "xy", "rgb", "rgbw", "rgbww"].includes(mode));
    const supportsTemperature = modes.includes("color_temp") && modes.some((mode) => ["rgbw", "rgbww"].includes(mode));
    if (!this._dragging && !this._pending && state) {
      if (Array.isArray(state.attributes?.hs_color)) [this._hue, this._saturation] = state.attributes.hs_color;
      this._brightness = state.state === "on" && Number.isFinite(state.attributes?.brightness) ? Math.round(state.attributes.brightness / 255 * 100) : 0;
    }
    const header = this.shadowRoot.querySelector(".header-action");
    header.hidden = this._config.show_action_button === false;
    header.classList.toggle("active", state?.state === "on");
    header.classList.toggle("inactive", state?.state === "off");
    this.shadowRoot.querySelector(".action-state").textContent = state?.state === "on" ? "An" : state?.state === "off" ? "Aus" : "";
    const name = String(this._config.name ?? "").trim();
    const subtitle = this.shadowRoot.querySelector(".subtitle");
    subtitle.textContent = name;
    subtitle.hidden = !name;
    const titles = this.shadowRoot.querySelector(".titles");
    titles.hidden = !String(this._config.title ?? "").trim() && !name;
    this.shadowRoot.querySelector(".header").hidden = titles.hidden && header.hidden;
    const available = !!state && !["unavailable", "unknown"].includes(state.state);
    const controls = this.shadowRoot.querySelector(".controls");
    controls.hidden = !supportsColor || !available;
    controls.classList.toggle("is-off", state?.state === "off");
    this.shadowRoot.querySelector(".turn-on").hidden = state?.state !== "off";
    this.shadowRoot.querySelector(".turn-off").hidden = state?.state !== "on";
    this.shadowRoot.querySelector(".wheel").setAttribute("tabindex", state?.state === "off" ? "-1" : "0");
    this.shadowRoot.querySelector(".brightness").disabled = state?.state === "off";
    this.shadowRoot.querySelector(".unavailable").hidden = supportsColor && available;
    this.shadowRoot.querySelector(".unavailable").textContent = !state ? "Licht nicht gefunden." : !available ? "Licht nicht verfügbar." : "Dieses Licht unterstützt keine RGB-Farben.";
    const temp = this.shadowRoot.querySelector(".temperature");
    temp.hidden = !supportsTemperature;
    const temperatureInput = this.shadowRoot.querySelector(".temperature input");
    const min = state?.attributes?.min_color_temp_kelvin || (state?.attributes?.max_mireds ? Math.round(1000000 / state.attributes.max_mireds) : 2000);
    const max = state?.attributes?.max_color_temp_kelvin || (state?.attributes?.min_mireds ? Math.round(1000000 / state.attributes.min_mireds) : 6500);
    temperatureInput.min = min; temperatureInput.max = max;
    if (!this._pending && !this._dragging) temperatureInput.value = state?.attributes?.color_temp_kelvin || min;
    this._updateView();
  }

  _updateView() {
    const wheel = this.shadowRoot.querySelector(".wheel");
    if (!wheel) return;
    const colorControl = this.shadowRoot.querySelector(".color-control");
    colorControl.style.setProperty("--hue", this._hue);
    colorControl.style.setProperty("--saturation", `${this._saturation}%`);
    colorControl.style.setProperty("--light-level", `${Math.max(0, Math.min(100, this._brightness))}%`);
    wheel.setAttribute("aria-valuenow", String(Math.round(this._hue)));
    this.shadowRoot.querySelector(".brightness-number").textContent = `${Math.round(this._brightness)} %`;
    const brightness = this.shadowRoot.querySelector(".brightness");
    brightness.value = this._brightness;
    brightness.style.setProperty("--brightness", `${this._brightness}%`);
    this.shadowRoot.querySelectorAll(".preset").forEach((button, index) => {
      const preset = this._presets[index];
      button.style.setProperty("--swatch", `rgb(${preset.rgb.join(",")})`);
      button.setAttribute("aria-pressed", String(index === this._selected));
    });
  }

  _render() {
    const titleScale = 0.65 + ((Math.min(5, Math.max(1, Number(this._config.title_size) || 5)) - 1) / 4) * .35;
    const level = Math.min(5, Math.max(1, Number(this._config.button_size) || 5));
    const menuScale = .5 + (1 / 3 + ((level - 1) / 4) * (2 / 3)) * .5;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; width:100%; color:var(--primary-text-color,#f3f3f5); font-family:var(--paper-font-body1_-_font-family,"Arial",sans-serif); }
        * { box-sizing:border-box; }
        .card { width:100%; padding:clamp(20px,4.7vw,38px); border:1px solid rgba(255,255,255,.1); border-radius:28px; background:radial-gradient(ellipse at 48% 0,#22252a 0,#15171a 62%,#101214 100%); box-shadow:inset 0 1px 1px rgba(255,255,255,.06),0 12px 30px rgba(0,0,0,.2); }
        .header { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:clamp(20px,3vw,30px); }
        .header[hidden] { display:none; }
        .header-action[hidden] { display:none; }
        .titles[hidden],.subtitle[hidden] { display:none; }
        .header:has(> .titles[hidden]) { justify-content:flex-end; }
        .titles { min-width:0; } .title { color:#9295a0; font-size:clamp(11px,2.1vw,15px); font-weight:700; letter-spacing:.12em; line-height:normal; text-transform:uppercase; }
        .subtitle { margin:7px 0 0; color:var(--primary-text-color,#f3f3f5); font-size:var(--subtitle-font); font-weight:700; line-height:1.08; overflow-wrap:anywhere; }
        .subtitle:first-child { margin-top:0; }
        .header-action { position:relative; display:grid; flex:none; width:var(--header-action-size); aspect-ratio:1; place-items:center; border:2px solid #303239; border-radius:50%; background:linear-gradient(145deg,#272a30,#17191d); color:#ff8b2b; font:inherit; box-shadow:0 6px 15px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.05); cursor:pointer; -webkit-tap-highlight-color:transparent; }
        .header-action.active { border-color:#ff8b2b; color:#ff9b4a; box-shadow:inset 0 0 20px rgba(255,139,43,.12),0 0 0 1px rgba(255,139,43,.2),0 6px 15px rgba(0,0,0,.25); }
        .header-action.inactive { color:#85878b; border-color:#45474b; } .header-action ha-icon { display:block; width:var(--header-icon-size); height:var(--header-icon-size); --mdc-icon-size:var(--header-icon-size); }
        .action-state { position:absolute; bottom:11%; font-size:clamp(5px,calc(var(--header-action-size) * .15),13px); line-height:1; color:inherit; }
        .controls[hidden],.temperature[hidden],.unavailable[hidden],.turn-on[hidden],.turn-off[hidden] { display:none; }
        .color-control { --light-color:color-mix(in srgb,color-mix(in srgb,hsl(var(--hue,0) 100% 50%) var(--saturation,100%),white) var(--light-level,100%),black); position:relative; width:min(100%,360px); aspect-ratio:1; margin:0 auto; }
        .controls.is-off .wheel,.controls.is-off .brightness,.controls.is-off .preset { filter:grayscale(1) brightness(.65); }
        .controls.is-off .brightness-control { display:none; }
        .turn-on { position:absolute; inset:0; z-index:2; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; width:100%; height:100%; border:0; border-radius:50%; background:transparent; color:#85878b; cursor:pointer; }
        .turn-on ha-icon { display:block; width:clamp(42px,18vw,96px); height:clamp(42px,18vw,96px); --mdc-icon-size:clamp(42px,18vw,96px); }
        .turn-on-label { color:inherit; font:inherit; font-size:14px; }
        .turn-on:focus-visible { outline:2px solid #ddd; outline-offset:3px; }
        .wheel { position:absolute; inset:0; border-radius:50%; background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red); touch-action:none; cursor:pointer; }
        .wheel::before { content:""; position:absolute; inset:9%; border-radius:50%; background:#15171a; pointer-events:none; }
        .controls.is-off .wheel::before { background:#15171a; }
        .wheel-marker { position:absolute; inset:0; pointer-events:none; }
        .wheel-marker::after { content:""; position:absolute; box-sizing:border-box; width:10%; aspect-ratio:1; top:-2px; left:45%; border:2px solid #ddd; border-radius:50%; background:hsl(var(--hue) 100% 50%); transform:rotate(calc(var(--hue) * 1deg)); transform-origin:50% calc(500% + 2px); }
        .wheel:focus-visible { outline:2px solid white; outline-offset:3px; }
        .turn-off { position:absolute; inset:18%; z-index:1; display:grid; place-items:center; border:clamp(4.5px,1.5vw,9px) solid var(--light-color); border-radius:50%; background:#15171a; color:var(--light-color); cursor:pointer; }
        .turn-off ha-icon { display:block; transform:translateY(-25%); --mdc-icon-size:clamp(42px,18vw,96px); }
        .turn-off:focus-visible { outline:2px solid white; outline-offset:3px; }
        .brightness-control { position:absolute; z-index:2; top:60%; left:27%; width:46%; display:flex; flex-direction:column; align-items:center; gap:3px; color:#a0a2ad; font-size:12px; }
        .brightness { width:100%; min-width:0; margin:0; accent-color:color-mix(in srgb,hsl(var(--hue,0) 100% 50%) var(--saturation,100%),white); cursor:pointer; }
        .presets { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:10px; margin-top:28px; justify-items:center; }
        .preset { width:min(100%,42px); aspect-ratio:1; border:2px solid transparent; border-radius:50%; background:var(--swatch); cursor:pointer; }
        .preset[aria-pressed="true"] { outline:2px solid white; outline-offset:3px; }
        .temperature { display:flex; align-items:center; gap:12px; margin-top:28px; color:#a0a2ad; font-size:14px; }
        .temperature input { min-width:0; flex:1; accent-color:#f1f1f1; cursor:pointer; }
        .unavailable { color:var(--secondary-text-color,#a0a2ad); font-size:14px; }
        @media (max-width:380px) { .card { padding:18px; } .presets { gap:6px; } }
      </style>
      <article class="card" style="--subtitle-font:clamp(${22 * titleScale}px,${4.8 * titleScale}vw,${38 * titleScale}px);--header-action-size:clamp(${56 * menuScale}px,${11 * menuScale}vw,${88 * menuScale}px);--header-icon-size:calc((var(--header-action-size) - 16px) * .46)">
        <header class="header"><div class="titles">${String(this._config.title ?? "").trim() ? `<div class="title">${escapeRgb(String(this._config.title).trim())}</div>` : ""}<h2 class="subtitle" hidden></h2></div><button class="header-action" aria-label="Licht ein- oder ausschalten" title="Licht ein- oder ausschalten"><ha-icon icon="${escapeRgb(this._config.icon || "mdi:lightbulb-outline")}"></ha-icon><span class="action-state"></span></button></header>
        <p class="unavailable" hidden></p>
        <div class="controls" hidden><div class="color-control"><div class="wheel" role="slider" tabindex="0" aria-label="Farbton" aria-valuemin="0" aria-valuemax="359" aria-valuenow="0"><span class="wheel-marker"></span></div><button class="turn-off" type="button" aria-label="Licht ausschalten" title="Licht ausschalten" hidden><ha-icon icon="${escapeRgb(this._config.icon || "mdi:lightbulb-outline")}" aria-hidden="true"></ha-icon></button><button class="turn-on" type="button" aria-label="Licht mit erstem Preset einschalten" title="Licht einschalten" hidden><ha-icon icon="${escapeRgb(this._config.icon || "mdi:lightbulb-outline")}"></ha-icon>${String(this._config.turn_on_text ?? "RGB").trim() ? `<span class="turn-on-label">${escapeRgb(String(this._config.turn_on_text).trim())}</span>` : ""}</button><div class="brightness-control"><input class="brightness" type="range" min="0" max="100" aria-label="Helligkeit"><span class="brightness-number">0 %</span></div></div>
        ${this._config.show_presets && this._presets.length ? `<div class="presets">${this._presets.map((preset) => `<button class="preset" type="button" title="Farb-Preset ${preset.slot}" aria-label="Farb-Preset ${preset.slot}" aria-pressed="false"></button>`).join("")}</div>` : ""}
        <div class="temperature" hidden><span>Warm</span><input type="range" aria-label="Farbtemperatur" step="50"><span>Kalt</span></div></div>
      </article>`;
    this.shadowRoot.querySelector(".header-action").addEventListener("click", () => this._toggleLight());
    this.shadowRoot.querySelector(".turn-on").addEventListener("click", () => this._toggleLight());
    this.shadowRoot.querySelector(".turn-off").addEventListener("click", () => this._toggleLight());
    const wheel = this.shadowRoot.querySelector(".wheel");
    wheel.addEventListener("pointerdown", (event) => { if (event.button !== 0 || event.target !== wheel) return; event.preventDefault(); this._dragging = true; wheel.setPointerCapture(event.pointerId); this._setHue(event); });
    wheel.addEventListener("pointermove", (event) => { if (this._dragging) this._setHue(event); });
    wheel.addEventListener("pointerup", (event) => { if (!this._dragging) return; this._setHue(event); this._dragging = false; this._sendColor(); });
    wheel.addEventListener("pointercancel", () => { this._dragging = false; this._sync(); });
    wheel.addEventListener("keydown", (event) => { if (!["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp"].includes(event.key)) return; event.preventDefault(); this._hue = (Math.round(this._hue) + (event.key === "ArrowLeft" || event.key === "ArrowDown" ? 355 : 5)) % 360; this._saturation = 100; this._temperatureValue = null; this._selected = -1; this._updateView(); this._sendColor(); });
    const brightness = this.shadowRoot.querySelector(".brightness");
    brightness.addEventListener("input", () => { this._dragging = true; this._brightness = Number(brightness.value); this._updateView(); });
    brightness.addEventListener("change", () => { this._dragging = false; this._brightness = Number(brightness.value); this._sendBrightness(); });
    this.shadowRoot.querySelectorAll(".preset").forEach((button, index) => button.addEventListener("click", () => this._selectPreset(index)));
    const temperature = this.shadowRoot.querySelector(".temperature input");
    temperature.addEventListener("input", () => { this._dragging = true; });
    temperature.addEventListener("change", () => { this._dragging = false; this._temperatureValue = Number(temperature.value); this._selected = -1; this._updateView(); this._markPending(); this._hass?.callService("light", "turn_on", { entity_id: this._config.entity, color_temp_kelvin: this._temperatureValue }); });
  }
}

if (!customElements.get("glass-rgb-card")) customElements.define("glass-rgb-card", GlassRgbCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "glass-rgb-card")) window.customCards.push({ type: "glass-rgb-card", name: "Glass RGB Card", description: "RGB-Lichtsteuerung mit optionalen Farb-Presets.", preview: true, version: RGB_CARD_VERSION });
})();

(() => {
const ROOM_CARD_VERSION = "1.0.3";
const ROOM_TEXT_COLORS = { black: "#151515", white: "#ffffff", gray: "#a0a2a6" };
const escapeRoom = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

class GlassRoomCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
  }

  static getStubConfig() {
    return { name: "Wohnzimmer", image: "/local/glass_design/rooms/Wohnzimmer.png", height: 430, image_position: 60 };
  }

  static getConfigElement() {
    return document.createElement("glass-room-card-editor");
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "name", default: "Wohnzimmer", selector: { text: {} } },
        { name: "image", selector: { text: {} } },
        { name: "entity", selector: { entity: { filter: { domain: "sensor" } } } },
        { name: "text_color", default: "white", selector: { select: { mode: "dropdown", options: [{ value: "black", label: "Schwarz" }, { value: "white", label: "Weiß" }, { value: "gray", label: "Grau" }] } } },
        { name: "sensor_color", default: "white", selector: { select: { mode: "dropdown", options: [{ value: "black", label: "Schwarz" }, { value: "white", label: "Weiß" }, { value: "gray", label: "Grau" }] } } },
        { name: "name_size", default: 19, selector: { number: { min: 12, max: 48, step: 1, mode: "slider", unit_of_measurement: "px" } } },
        { name: "sensor_size", default: 29, selector: { number: { min: 12, max: 64, step: 1, mode: "slider", unit_of_measurement: "px" } } },
        { name: "height", default: 430, selector: { number: { min: 180, max: 800, step: 10, mode: "slider", unit_of_measurement: "px" } } },
        { name: "image_position", default: 60, selector: { number: { min: 0, max: 100, step: 1, mode: "slider", unit_of_measurement: "%" } } },
      ],
      computeLabel: (field) => ({ name: "Beschriftung", image: "Bildpfad oder Bild-URL", entity: "Sensor (optional)", text_color: "Schriftfarbe Beschriftung", sensor_color: "Schriftfarbe Sensorwert", name_size: "Beschriftungsgröße", sensor_size: "Schriftgröße Sensorwert", height: "Kartenhöhe", image_position: "Vertikaler Bildausschnitt" })[field.name],
    };
  }

  setConfig(config) {
    if (config.entity && !config.entity.startsWith("sensor.")) throw new Error("Bitte eine Sensor-Entität auswählen.");
    const image = String(config.image || "").trim();
    if (image && !/^(?:https?:\/\/|\/[^/]|\.\.?\/)/i.test(image)) throw new Error("Bitte einen lokalen Bildpfad oder eine HTTP(S)-Bild-URL angeben.");
    const nextConfig = { name: "Wohnzimmer", height: 430, image_position: 60, ...config, image };
    if (JSON.stringify(this._config) === JSON.stringify(nextConfig)) {
      this._syncSensor();
      return;
    }
    this._config = nextConfig;
    this._render();
    this._syncSensor();
  }

  set hass(hass) { this._hass = hass; this._syncSensor(); }
  get hass() { return this._hass; }
  getCardSize() { return Math.ceil(this._height() / 50); }

  _height() { return Math.min(800, Math.max(180, Number(this._config?.height) || 430)); }

  _syncSensor() {
    if (!this._config) return;
    const output = this.shadowRoot.querySelector(".sensor-value");
    if (!output) return;
    const state = this._hass?.states?.[this._config.entity];
    let value = "";
    if (this._config.entity) {
      if (!state || state.state === "unavailable") value = "Sensor nicht verfügbar";
      else if (state.state === "unknown") value = "Unbekannt";
      else value = `${state.state}${state.attributes?.unit_of_measurement ? ` ${state.attributes.unit_of_measurement}` : ""}`;
    }
    if (output.textContent !== value) output.textContent = value;
  }

  _openSensor() {
    if (!this._config?.entity) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: this._config.entity } }));
  }

  _render() {
    const position = Math.min(100, Math.max(0, Number(this._config.image_position) || 0));
    const textColor = ROOM_TEXT_COLORS[this._config.text_color] || ROOM_TEXT_COLORS.white;
    const sensorColor = ROOM_TEXT_COLORS[this._config.sensor_color] || ROOM_TEXT_COLORS.white;
    const nameSize = Math.min(48, Math.max(12, Number(this._config.name_size) || 19));
    const sensorSize = Math.min(64, Math.max(12, Number(this._config.sensor_size) || 29));
    const textShadow = this._config.text_color === "black" ? "0 1px 5px rgba(255,255,255,.55)" : "0 2px 8px rgba(0,0,0,.6)";
    const sensorShadow = this._config.sensor_color === "black" ? "0 1px 5px rgba(255,255,255,.55)" : "0 2px 8px rgba(0,0,0,.6)";
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; width:100%; min-width:0; color:var(--primary-text-color,#f2f3ef); font-family:var(--paper-font-body1_-_font-family,"Arial",sans-serif); }
        * { box-sizing:border-box; }
        .room { position:relative; display:flex; flex-direction:column; justify-content:space-between; width:100%; height:${this._height()}px; overflow:hidden; padding:18px; border:1px solid rgba(255,255,255,.08); border-radius:20px; background:#252b27; box-shadow:0 8px 24px rgba(0,0,0,.2); }
        .image { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:center ${position}%; }
        .shade { position:absolute; inset:0; background:linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,.03) 40%,rgba(0,0,0,.72)); pointer-events:none; }
        .name,.sensor-value { position:relative; margin:0; color:${textColor}; text-shadow:${textShadow}; overflow-wrap:anywhere; pointer-events:none; }
        .name { font-size:${nameSize}px; line-height:1.2; font-weight:650; }
        .sensor-value { font-size:${sensorSize}px; line-height:1.2; font-weight:600; color:${sensorColor}; text-shadow:${sensorShadow}; margin-top:auto; }
        .sensor-value:empty { display:none; }
        .sensor-action { position:absolute; inset:0; width:100%; height:100%; border:0; padding:0; border-radius:inherit; background:transparent; cursor:pointer; }
        .sensor-action:focus-visible { outline:3px solid #ff983e; outline-offset:-4px; }
      </style>
      <article class="room">
        ${this._config.image ? `<img class="image" src="${escapeRoom(this._config.image)}" alt="${escapeRoom(this._config.name)}">` : ""}
        <div class="shade"></div>
        ${this._config.entity ? `<button type="button" class="sensor-action" aria-label="${escapeRoom(this._config.name || "Raum")}: Sensordetails öffnen" title="Sensordetails öffnen"></button>` : ""}
        ${String(this._config.name ?? "").trim() ? `<h2 class="name">${escapeRoom(String(this._config.name).trim())}</h2>` : ""}
        <div class="sensor-value"></div>
      </article>`;
    this.shadowRoot.querySelector(".sensor-action")?.addEventListener("click", () => this._openSensor());
    this.shadowRoot.querySelector(".image")?.addEventListener("error", (event) => { event.currentTarget.hidden = true; });
  }
}

class GlassRoomCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = "<ha-form></ha-form>";
    const form = this.shadowRoot.querySelector("ha-form");
    const definition = GlassRoomCard.getConfigForm();
    form.schema = definition.schema;
    form.computeLabel = definition.computeLabel;
    form.addEventListener("value-changed", (event) => {
      event.stopPropagation();
      this._config = { ...this._config, ...event.detail.value };
      this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config: this._config } }));
    });
  }

  setConfig(config) {
    this._config = { ...config };
    this.shadowRoot.querySelector("ha-form").data = this._config;
  }

  set hass(hass) {
    this.shadowRoot.querySelector("ha-form").hass = hass;
  }
}

if (!customElements.get("glass-room-card")) customElements.define("glass-room-card", GlassRoomCard);
if (!customElements.get("glass-room-card-editor")) customElements.define("glass-room-card-editor", GlassRoomCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "glass-room-card")) window.customCards.push({ type: "glass-room-card", name: "Glass Room Card", description: "Raumfoto mit optionalem Sensorwert.", preview: true, version: ROOM_CARD_VERSION });
})();

(() => {
const NAV_CARD_VERSION = "1.0.6";
const NAV_COLORS = {
  orange: "#ff8b2b",
  white: "#f2f2f4",
  gray: "#a0a2a6",
  green: "#4bc785",
  red: "#f05c5c",
};
const NAV_COLOR_OPTIONS = Object.entries(NAV_COLORS).map(([value]) => ({
  value,
  label: value[0].toUpperCase() + value.slice(1),
}));
const NAV_POSITION_OPTIONS = [
  { value: "top", label: "Oben (horizontal)" },
  { value: "bottom", label: "Unten (horizontal)" },
  { value: "left", label: "Links (vertikal)" },
  { value: "right", label: "Rechts (vertikal)" },
];
const escapeNav = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})[character]);

class GlassNavigationCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._menuRootIndex = null;
    this._menuPath = [];
    this._handleDocumentPointer = (event) => {
      if (this._menuRootIndex === null || event.composedPath?.().includes(this)) return;
      this._closeMenu();
    };
    this._handleDocumentKey = (event) => {
      if (event.key === "Escape" && this._menuRootIndex !== null) {
        this._closeMenu();
      }
    };
  }

  connectedCallback() {
    document.addEventListener("pointerdown", this._handleDocumentPointer, true);
    document.addEventListener("keydown", this._handleDocumentKey);
  }

  disconnectedCallback() {
    document.removeEventListener("pointerdown", this._handleDocumentPointer, true);
    document.removeEventListener("keydown", this._handleDocumentKey);
  }

  _closeMenu() {
    this._menuRootIndex = null;
    this._menuPath = [];
    this._render();
  }

  static getStubConfig() {
    return {
      position: "bottom",
      scale: 100,
      color: "orange",
      items: [
        { name: "Home", icon: "mdi:home-outline", url: "/lovelace/home" },
        {
          name: "Räume",
          icon: "mdi:view-grid",
          menu_title: "Raum wählen",
          children: [
            {
              name: "EG",
              icon: "mdi:home-floor-0",
              default: true,
              children: [
                { name: "Küche", icon: "mdi:pot-steam", url: "/lovelace/kueche" },
                { name: "Wohnen", icon: "mdi:sofa-outline", url: "/lovelace/wohnen" },
              ],
            },
          ],
        },
        { name: "Mehr", icon: "mdi:dots-horizontal", url: "/lovelace/mehr" },
      ],
    };
  }

  static getConfigForm() {
    const schema = [
      { name: "items", required: true, selector: { object: { multiple: true } } },
      { name: "color", default: "orange", selector: { select: { mode: "dropdown", options: NAV_COLOR_OPTIONS } } },
      { name: "position", default: "bottom", selector: { select: { mode: "dropdown", options: NAV_POSITION_OPTIONS } } },
      { name: "scale", default: 100, selector: { number: { min: 70, max: 140, step: 5, mode: "slider", unit_of_measurement: "%" } } },
      { name: "active", selector: { text: {} } },
    ];
    return {
      schema,
      computeLabel: (field) => ({
        items: "Menüpunkte (verschachtelte Liste)",
        color: "Farbe für Icons und Texte",
        position: "Position der Navigationsleiste",
        scale: "Gesamte Navigation skalieren",
        active: "Aktiver Hauptpunkt (Name)",
      })[field.name],
    };
  }

  static getConfigElement() {
    return document.createElement("glass-navigation-card-editor");
  }

  setConfig(config) {
    const nextConfig = {
      color: "orange",
      position: "bottom",
      scale: 100,
      active: "",
      items: [],
      ...config,
    };
    if (!Array.isArray(nextConfig.items) || nextConfig.items.length === 0) {
      throw new Error("Bitte mindestens einen Navigationspunkt in 'items' konfigurieren.");
    }
    if (!NAV_COLORS[nextConfig.color]) throw new Error("Nicht unterstützte Navigationsfarbe.");
    if (!NAV_POSITION_OPTIONS.some(({ value }) => value === nextConfig.position)) throw new Error("Ungültige Position der Navigationsleiste.");
    const requestedScale = Number(nextConfig.scale);
    nextConfig.scale = Number.isFinite(requestedScale) ? Math.min(140, Math.max(70, requestedScale)) : 100;
    this._validateItems(nextConfig.items);
    this._config = nextConfig;
    this._menuRootIndex = null;
    this._menuPath = [];
    this._render();
  }

  getCardSize() { return 1; }

  _validateItems(items, depth = 0) {
    if (depth > 8) throw new Error("Navigationsmenüs dürfen höchstens acht Ebenen tief sein.");
    let defaultCount = 0;
    for (const item of items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Jeder Navigationspunkt muss ein Objekt sein.");
      if (item.type === "separator") {
        if (depth !== 0) throw new Error("Trenner sind nur in der Hauptnavigation erlaubt.");
        continue;
      }
      if (item.default === true) defaultCount += 1;
      if (typeof item.name !== "string" || !item.name.trim()) throw new Error("Jeder Navigationspunkt benötigt einen Namen.");
      if (item.label != null && typeof item.label !== "string") throw new Error(`'label' für '${item.name}' muss Text sein.`);
      if (typeof item.icon !== "string" || !item.icon.trim()) throw new Error(`Bitte ein Icon für '${item.name}' angeben.`);
      if (item.menu_title != null && typeof item.menu_title !== "string") throw new Error(`'menu_title' für '${item.name}' muss Text sein.`);
      const hasChildren = Array.isArray(item.children) && item.children.length > 0;
      if (hasChildren && item.url) throw new Error(`'${item.name}' darf entweder eine URL oder Unterpunkte haben, nicht beides.`);
      if (hasChildren) {
        this._validateItems(item.children, depth + 1);
        continue;
      }
      if (typeof item.url !== "string" || !item.url.trim() || !/^(?:\/(?!\/)|https?:\/\/)/i.test(item.url.trim())) {
        throw new Error(`'${item.name}' benötigt eine interne URL oder eine HTTP(S)-URL.`);
      }
    }
    if (defaultCount > 1) throw new Error("Pro Menüebene darf nur ein Punkt als Standard ausgewählt sein.");
  }

  _visibleItems() {
    return this._menuModel().items;
  }

  _menuModel() {
    let items = this._config.items[this._menuRootIndex]?.children || [];
    let level = 0;
    const segments = [];
    const isGroup = (item) => Array.isArray(item?.children) && item.children.length > 0;
    while (items.length) {
      if (items.every(isGroup)) {
        const defaultIndex = Math.max(0, items.findIndex((item) => item.default === true));
        const selectedIndex = Math.min(this._menuPath[level] ?? defaultIndex, items.length - 1);
        segments.push({ items, selectedIndex, level });
        items = items[selectedIndex].children;
        level += 1;
      } else if (level < this._menuPath.length && isGroup(items[this._menuPath[level]])) {
        items = items[this._menuPath[level]].children;
        level += 1;
      } else break;
    }
    return { items, segments, level };
  }

  _menuTitle() {
    const item = this._config.items[this._menuRootIndex];
    return item?.menu_title?.trim() || `${item?.name || "Menü"} wählen`;
  }

  _itemLabel(item) {
    return item.label == null ? item.name : item.label.trim();
  }

  _maxMenuRows(items) {
    if (!items?.length) return 1;
    const leafCount = items.filter((item) => !Array.isArray(item.children) || item.children.length === 0).length;
    const childRows = items
      .filter((item) => Array.isArray(item.children) && item.children.length > 0)
      .map((item) => this._maxMenuRows(item.children));
    return Math.max(1, Math.ceil(leafCount / 3), ...childRows);
  }

  _itemMarkup(item, index, root = false) {
    if (item.type === "separator" && root) {
      const orientation = this._config.position === "left" || this._config.position === "right" ? "horizontal" : "vertical";
      return `<span class="nav-separator" role="separator" aria-orientation="${orientation}"></span>`;
    }
    const hasChildren = Array.isArray(item.children) && item.children.length > 0;
    const url = item.url ? item.url.trim() : "";
    const siblings = root ? this._config.items : this._visibleItems();
    const hasLocationMatch = siblings.some((candidate) => candidate.url?.startsWith("/") && window.location?.pathname === candidate.url.split(/[?#]/)[0]);
    const defaultIndex = siblings.findIndex((candidate) => candidate.default === true);
    const active = (root && (this._menuRootIndex === index || this._config.active === item.name))
      || (url.startsWith("/") && window.location?.pathname === url.split(/[?#]/)[0])
      || (!hasLocationMatch && defaultIndex === index);
    const dataAttribute = root ? `data-root-index="${index}"` : `data-child-index="${index}"`;
    const label = this._itemLabel(item);
    return `<button type="button" class="nav-item ${active ? "active" : ""} ${hasChildren ? "has-children" : ""}" ${dataAttribute} ${hasChildren ? `aria-haspopup="menu" aria-expanded="${root ? this._menuRootIndex === index : false}"` : `aria-current="${active ? "page" : "false"}"`} ${!hasChildren ? `data-url="${escapeNav(url)}"` : ""} aria-label="${escapeNav(item.name)}" title="${escapeNav(item.name)}"><ha-icon icon="${escapeNav(item.icon)}"></ha-icon>${label ? `<span>${escapeNav(label)}</span>` : ""}${hasChildren ? `<span class="chevron" aria-hidden="true">${root ? "⌃" : "›"}</span>` : ""}</button>`;
  }

  _navigate(url) {
    if (/^https?:\/\//i.test(url)) {
      window.location.assign(url);
      return;
    }
    window.history.pushState(null, "", url);
    window.dispatchEvent(new Event("location-changed"));
    this._menuRootIndex = null;
    this._menuPath = [];
    this._render();
  }

  _bindEvents() {
    this.shadowRoot.querySelectorAll("[data-root-index]").forEach((button) => button.addEventListener("click", () => {
      const index = Number(button.dataset.rootIndex);
      const item = this._config.items[index];
      if (item.children?.length) {
        this._menuRootIndex = this._menuRootIndex === index ? null : index;
        this._menuPath = [];
        this._render();
      } else this._navigate(item.url.trim());
    }));
    this.shadowRoot.querySelectorAll("[data-child-index]").forEach((button) => button.addEventListener("click", () => {
      const index = Number(button.dataset.childIndex);
      const item = this._visibleItems()[index];
      if (item.children?.length) {
        const model = this._menuModel();
        this._menuPath = [...this._menuPath.slice(0, model.level), index];
        this._render();
      } else this._navigate(item.url.trim());
    }));
    this.shadowRoot.querySelectorAll("[data-segment-level]").forEach((button) => button.addEventListener("click", () => {
      const level = Number(button.dataset.segmentLevel);
      this._menuPath = [...this._menuPath.slice(0, level), Number(button.dataset.segmentIndex)];
      this._render();
    }));
    this.shadowRoot.querySelector("[data-menu-back]")?.addEventListener("click", () => {
      if (this._menuPath.length) this._menuPath.pop();
      else this._menuRootIndex = null;
      this._render();
    });
  }

  _render() {
    if (!this._config) return;
    const color = NAV_COLORS[this._config.color];
    const position = this._config.position;
    const scale = this._config.scale / 100;
    const vertical = position === "left" || position === "right";
    const rootItems = this._config.items.map((item, index) => this._itemMarkup(item, index, true)).join("");
    const menuModel = this._menuRootIndex === null ? { items: [], segments: [] } : this._menuModel();
    const menuItems = menuModel.items.map((item, index) => this._itemMarkup(item, index)).join("");
    const menuSegments = menuModel.segments.map(({ items, selectedIndex, level }) => `<div class="menu-segments" role="tablist" aria-label="Ebene ${level + 1}">${items.map((item, index) => `<button type="button" class="segment ${index === selectedIndex ? "selected" : ""}" role="tab" aria-selected="${index === selectedIndex}" data-segment-level="${level}" data-segment-index="${index}">${escapeNav(this._itemLabel(item))}</button>`).join("")}</div>`).join("");
    const menuRows = this._menuRootIndex === null ? 1 : this._maxMenuRows(this._config.items[this._menuRootIndex]?.children);
    const menu = this._menuRootIndex === null ? "" : `<section class="submenu" role="menu" aria-label="${escapeNav(this._menuTitle())}" style="--submenu-rows:${menuRows}"><header class="submenu-header"><h2>${escapeNav(this._menuTitle())}</h2></header>${menuSegments}<div class="submenu-items ${vertical ? "vertical" : ""}">${menuItems}</div></section><span class="pointer" aria-hidden="true"></span>`;

    this.shadowRoot.innerHTML = `
      <style>
        :host { --nav-color:${color}; display:block; font-family:var(--paper-font-body1_-_font-family,"Arial",sans-serif); }
        * { box-sizing:border-box; }
        button { color:inherit; font:inherit; }
        .shell { position:fixed; z-index:20; color:var(--nav-color); }
        .shell.position-top,.shell.position-bottom { left:50%; width:min(calc(100vw - 48px),748px); transform:translateX(-50%) scale(var(--nav-scale)); }
        .shell.position-top { top:max(12px,env(safe-area-inset-top)); transform-origin:50% 0; }
        .shell.position-bottom { bottom:calc(env(safe-area-inset-bottom) + 6px); transform-origin:50% 100%; }
        .shell.position-left,.shell.position-right { top:50%; width:max-content; max-width:calc(100vw - 24px); transform:translateY(-50%) scale(var(--nav-scale)); }
        .shell.position-left { left:max(12px,env(safe-area-inset-left)); transform-origin:0 50%; }
        .shell.position-right { right:max(12px,env(safe-area-inset-right)); transform-origin:100% 50%; }
        .bar { position:relative; display:flex; align-items:stretch; justify-content:space-around; gap:4px; width:100%; min-height:92px; padding:7px; border:1px solid rgba(255,255,255,.1); border-radius:50px; background:rgba(25,26,29,.94); box-shadow:0 12px 32px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.06); backdrop-filter:blur(20px); }
        .position-left .bar,.position-right .bar { flex-direction:column; width:82px; max-height:min(76dvh,680px); overflow:auto; }
        .nav-separator { flex:none; align-self:center; width:1px; height:42px; margin:0 8px; background:rgba(255,255,255,.18); }
        .position-left .nav-separator,.position-right .nav-separator { width:42px; height:1px; margin:8px 0; }
        .nav-item { position:relative; display:flex; flex:1 1 0; min-width:0; min-height:84px; flex-direction:column; align-items:center; justify-content:center; gap:4px; padding:5px 8px; border:0; border-radius:40px; background:transparent; color:#c3c4c8; opacity:.9; cursor:pointer; -webkit-tap-highlight-color:transparent; }
        .nav-item ha-icon { display:block; width:38px; height:38px; --mdc-icon-size:38px; }
        .nav-item span:not(.chevron) { max-width:100%; overflow:hidden; font-size:18px; line-height:1.15; text-align:center; text-overflow:ellipsis; white-space:nowrap; }
        .nav-item.active { background:color-mix(in srgb,var(--nav-color) 20%,transparent); color:var(--nav-color); opacity:1; }
        .bar .nav-item.active { background:transparent; box-shadow:none; }
        .position-bottom .bar .nav-item.has-children .chevron { top:-3px; right:50%; transform:translateX(50%); color:var(--nav-color); font-size:20px; }
        .nav-item:focus-visible,.menu-back:focus-visible { outline:2px solid var(--nav-color); outline-offset:2px; }
        .chevron { position:absolute; top:2px; right:12px; font-size:16px; }
        .position-left .nav-item,.position-right .nav-item { flex:none; width:100%; min-height:68px; }
        .submenu { position:absolute; width:min(720px,calc(100vw - 32px)); max-height:min(72dvh,640px); overflow:auto; padding:32px 28px 30px; border:1px solid rgba(255,255,255,.13); border-radius:28px; background:rgba(26,27,30,.97); color:var(--nav-color); box-shadow:0 16px 42px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.06); backdrop-filter:blur(24px); }
        .pointer { position:absolute; z-index:1; width:0; height:0; border:12px solid transparent; pointer-events:none; }
        .position-bottom .submenu { bottom:calc(100% + 34px); left:50%; transform:translateX(-50%); }
        .position-bottom .pointer { top:-34px; left:50%; transform:translateX(-50%); border-top-color:rgba(90,92,96,.9); }
        .position-top .submenu { top:calc(100% + 12px); left:50%; transform:translateX(-50%); }
        .position-top .pointer { top:100%; left:50%; transform:translateX(-50%); border-bottom-color:rgba(90,92,96,.9); }
        .position-left .submenu { top:50%; left:calc(100% + 12px); transform:translateY(-50%); }
        .position-left .pointer { top:50%; left:100%; transform:translateY(-50%); border-right-color:rgba(90,92,96,.9); }
        .position-right .submenu { top:50%; right:calc(100% + 12px); transform:translateY(-50%); }
        .position-right .pointer { top:50%; right:100%; transform:translateY(-50%); border-left-color:rgba(90,92,96,.9); }
        .position-left .submenu,.position-right .submenu { width:min(440px,calc(100vw - 106px)); }
        .submenu-header { display:flex; align-items:center; margin-bottom:14px; }
        .submenu-header h2 { flex:1; min-width:0; margin:0; color:#f2f2f4; font-size:34px; line-height:1.2; overflow-wrap:anywhere; }
        .menu-segments { display:flex; width:min(100%,620px); min-height:64px; gap:4px; margin:0 auto 42px; padding:3px; border:1px solid rgba(255,255,255,.05); border-radius:40px; background:rgba(112,114,119,.19); }
        .segment { flex:1 1 0; min-width:0; min-height:56px; padding:8px 12px; border:0; border-radius:32px; background:transparent; color:#c3c4c8; opacity:1; font-size:20px; font-weight:600; cursor:pointer; }
        .segment.selected { background:var(--nav-color); color:#fff; opacity:1; box-shadow:0 6px 20px color-mix(in srgb,var(--nav-color) 28%,transparent); }
        .submenu-items { --menu-row-size:clamp(72px,calc((min(720px,100vw - 32px) - 82px) / 3),144px); display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); grid-template-rows:repeat(var(--submenu-rows,1),var(--menu-row-size)); justify-items:center; gap:12px; }
        .submenu-items .nav-item { width:min(100%,144px); height:var(--menu-row-size); min-height:0; border:3px solid #3b3d42; border-radius:50%; color:#f0f0f2; opacity:.92; }
        .submenu-items .nav-item ha-icon { position:absolute; top:50%; left:50%; width:64px; height:64px; --mdc-icon-size:64px; transform:translate(-50%,-50%); }
        .submenu-items .nav-item span:not(.chevron) { position:absolute; right:8px; bottom:12%; left:8px; font-size:18px; white-space:normal; }
        .submenu-items .nav-item.active { border-color:var(--nav-color); background:color-mix(in srgb,var(--nav-color) 9%,transparent); color:var(--nav-color); box-shadow:0 0 34px color-mix(in srgb,var(--nav-color) 32%,transparent); opacity:1; }
        .submenu-items .nav-item.active span:not(.chevron) { color:#f2f2f4; }
        .submenu-items .nav-item.has-children .chevron { top:12px; right:18px; font-size:22px; }
        @media(max-width:520px) { .shell.position-bottom { bottom:calc(env(safe-area-inset-bottom) + 6px); } .position-bottom .submenu { bottom:calc(100% + 24px); } .position-bottom .pointer { top:-24px; } .bar { min-height:56px; border-radius:32px; } .bar .nav-item { min-height:46px; padding-inline:4px; } .bar .nav-item ha-icon { width:26px; height:26px; --mdc-icon-size:26px; } .bar .nav-item span:not(.chevron) { font-size:12px; } .position-left .nav-separator,.position-right .nav-separator { width:32px; } .submenu { padding:18px 14px 20px; } .submenu-header h2 { font-size:26px; } .menu-segments { width:100%; min-height:56px; margin-bottom:20px; } .segment { min-height:48px; font-size:16px; } .position-left .submenu,.position-right .submenu { width:min(440px,calc(100vw - 108px)); } .submenu-items { --menu-row-size:clamp(72px,calc((min(720px,100vw - 32px) - 42px) / 3),126px); grid-template-rows:repeat(var(--submenu-rows,1),var(--menu-row-size)); gap:6px; } .submenu-items .nav-item { width:100%; height:var(--menu-row-size); min-width:0; min-height:0; } .submenu-items .nav-item ha-icon { width:42px; height:42px; --mdc-icon-size:42px; } .submenu-items .nav-item span:not(.chevron) { right:2px; bottom:8%; left:2px; font-size:13px; } }
        @media(prefers-reduced-motion:reduce) { *,*::before,*::after { scroll-behavior:auto !important; } }
      </style>
      <div class="shell position-${position}" style="--nav-color:${color};--nav-scale:${scale}">
        ${menu}
        <nav class="bar" aria-label="Hauptnavigation">${rootItems}</nav>
      </div>`;
    this._bindEvents();
  }
}

class GlassNavigationCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._editing = false;
    this._hass = null;
    this._onClick = (event) => this._handleClick(event);
    this._onInput = (event) => this._handleInput(event);
    this._onChange = (event) => this._handleInput(event);
    this.shadowRoot.addEventListener("click", this._onClick);
    this.shadowRoot.addEventListener("input", this._onInput);
    this.shadowRoot.addEventListener("change", this._onChange);
    this._render();
  }

  _emitConfig() {
    this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config: this._config } }));
  }

  _itemList(items, path = [], root = false) {
    const rows = items.map((item, index) => {
      const itemPath = [...path, index];
      const pathValue = itemPath.join(".");
      if (item.type === "separator") {
        return `<div class="tree-separator"><span>Trenner</span><button type="button" class="remove" data-action="remove" data-path="${pathValue}" aria-label="Trenner entfernen">Entfernen</button></div>`;
      }
      const group = Array.isArray(item.children) && item.children.length > 0;
      return `<section class="tree-item ${group ? "is-group" : ""}">
        <div class="item-heading"><span class="item-kind">${group ? "Gruppe" : "Link"}</span><button type="button" class="remove" data-action="remove" data-path="${pathValue}" aria-label="${escapeNav(item.name)} entfernen">Entfernen</button></div>
        <div class="fields">
          <label>Name<input type="text" data-path="${pathValue}" data-field="name" value="${escapeNav(item.name)}"></label>
          <label>Icon<input type="text" data-path="${pathValue}" data-field="icon" value="${escapeNav(item.icon)}" placeholder="mdi:home-outline"></label>
          <label>Beschriftung<input type="text" data-path="${pathValue}" data-field="label" value="${escapeNav(item.label ?? item.name)}" placeholder="Name verwenden; leer blendet aus"></label>
          ${group ? `<label>Menütitel<input type="text" data-path="${pathValue}" data-field="menu_title" value="${escapeNav(item.menu_title ?? "")}" placeholder="${escapeNav(item.name)} wählen"></label>` : `<label>URL<input type="text" data-path="${pathValue}" data-field="url" value="${escapeNav(item.url ?? "")}" placeholder="/lovelace/seite"></label>`}
          <label class="default-option"><input type="checkbox" data-path="${pathValue}" data-field="default" ${item.default ? "checked" : ""}> Standardauswahl</label>
        </div>
        ${group ? `<div class="children"><h4>Unterpunkte</h4>${this._itemList(item.children, itemPath)}${this._addButtons(itemPath, false)}</div>` : ""}
      </section>`;
    }).join("");
    return `${rows}${root ? this._addButtons(path, true) : ""}`;
  }

  _addButtons(path, root) {
    const parentPath = path.join(".");
    return `<div class="add-actions"><button type="button" data-action="add-link" data-parent="${parentPath}">+ Link</button><button type="button" data-action="add-group" data-parent="${parentPath}">+ Gruppe</button>${root ? `<button type="button" data-action="add-separator" data-parent="${parentPath}">+ Trenner</button>` : ""}</div>`;
  }

  _previewMarkup() {
    return (this._config.items || []).map((item, index) => {
      if (item.type === "separator") return `<span class="preview-separator" role="separator"></span>`;
      const label = item.label == null ? item.name : item.label.trim();
      const active = this._config.active === item.name;
      return `<div class="preview-item ${active ? "active" : ""}"><ha-icon icon="${escapeNav(item.icon || "mdi:gesture-tap-button")}"></ha-icon>${label ? `<span>${escapeNav(label)}</span>` : ""}${item.children?.length ? `<i>${index === this._config.items.findIndex((entry) => entry.name === this._config.active) ? "⌃" : ""}</i>` : ""}</div>`;
    }).join("");
  }

  _render() {
    const definition = GlassNavigationCard.getConfigForm();
    const formSchema = definition.schema.filter((field) => field.name !== "items");
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; color:var(--primary-text-color); font-family:var(--paper-font-body1_-_font-family,Arial,sans-serif); }
        * { box-sizing:border-box; }
        .editor { display:grid; gap:16px; }
        .preview { position:relative; min-height:136px; display:flex; flex-direction:column; justify-content:space-between; gap:12px; padding:14px; border:1px solid var(--divider-color,#444); border-radius:12px; background:var(--card-background-color,#17191c); overflow:hidden; }
        .preview-header { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:38px; }
        .preview-title { margin:0; color:var(--primary-text-color,#eee); font-size:16px; font-weight:600; }
        .preview-bar { position:relative; z-index:1; display:flex; align-items:center; justify-content:space-around; gap:6px; width:100%; min-height:64px; padding:5px 12px; border:1px solid var(--divider-color,#444); border-radius:40px; background:rgba(20,21,23,.96); color:var(--primary-text-color,#eee); }
        .preview-item { position:relative; flex:1 1 0; min-width:0; display:flex; flex-direction:column; align-items:center; gap:3px; font-size:12px; }
        .preview-item ha-icon { --mdc-icon-size:24px; width:24px; height:24px; }
        .preview-item.active { color:var(--nav-color,#ff8b2b); }
        .preview-separator { flex:none; height:30px; border-left:1px solid var(--divider-color,#666); }
        .editor-toggle,.add-actions button,.remove { min-height:36px; padding:6px 12px; border:1px solid var(--divider-color,#666); border-radius:8px; background:var(--secondary-background-color,#242629); color:var(--primary-text-color,#eee); cursor:pointer; }
        .editor-toggle { display:grid; flex:none; width:38px; height:38px; min-height:0; place-items:center; padding:7px; }
        .preview:hover .editor-toggle,.preview:focus-within .editor-toggle { border-color:var(--primary-color,#03a9f4); }
        .editor-toggle ha-icon { display:block; width:20px; height:20px; --mdc-icon-size:20px; }
        .tree { display:grid; gap:12px; }
        .tree-item { display:grid; gap:10px; padding:12px; border:1px solid var(--divider-color,#555); border-radius:8px; background:var(--card-background-color,#17191c); }
        .item-heading { display:flex; align-items:center; justify-content:space-between; color:var(--primary-text-color,#eee); font-weight:600; }
        .item-kind { color:var(--secondary-text-color,#aaa); font-size:13px; }
        .fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
        .fields label { display:grid; gap:4px; min-width:0; color:var(--secondary-text-color,#aaa); font-size:12px; }
        .fields input[type=text] { width:100%; min-width:0; min-height:38px; padding:7px 9px; border:1px solid var(--divider-color,#666); border-radius:6px; background:var(--primary-background-color,#111); color:var(--primary-text-color,#eee); font:inherit; font-size:14px; }
        .fields .default-option { display:flex; align-items:center; gap:8px; }
        .children { display:grid; gap:10px; margin-left:12px; padding-left:12px; border-left:2px solid var(--divider-color,#555); }
        .children h4 { margin:2px 0; color:var(--secondary-text-color,#aaa); font-size:13px; }
        .add-actions { display:flex; flex-wrap:wrap; gap:8px; }
        ha-form[hidden],.tree[hidden] { display:none; }
        @media(max-width:600px) { .fields { grid-template-columns:1fr; } .preview { min-height:122px; padding:10px; } .preview-bar { min-height:58px; } }
      </style>
      <section class="editor">
        <div class="preview" style="--nav-color:${NAV_COLORS[this._config.color] || NAV_COLORS.orange}">
          <div class="preview-header"><h3 class="preview-title">Glass Navigation</h3><button type="button" class="editor-toggle" data-action="toggle-edit" aria-label="${this._editing ? "Bearbeitung abschließen" : "Karte bearbeiten"}" title="${this._editing ? "Bearbeitung abschließen" : "Karte bearbeiten"}"><ha-icon icon="mdi:pencil"></ha-icon></button></div>
          <nav class="preview-bar" aria-label="Navigationsvorschau">${this._previewMarkup()}</nav>
        </div>
        <ha-form ${this._editing ? "" : "hidden"}></ha-form>
        <div class="tree" ${this._editing ? "" : "hidden"}><h3>Menüstruktur</h3>${this._itemList(this._config.items || [], [], true)}</div>
      </section>`;
    const form = this.shadowRoot.querySelector("ha-form");
    form.schema = formSchema;
    form.data = this._config;
    form.hass = this._hass;
    form.computeLabel = definition.computeLabel;
    form.addEventListener("value-changed", (event) => {
      event.stopPropagation();
      this._config = { ...this._config, ...event.detail.value };
      this._updatePreview();
      this._emitConfig();
    });
  }

  _pathParts(path) { return path === "" ? [] : path.split(".").map(Number); }

  _getItem(path) {
    const parts = this._pathParts(path);
    let items = this._config.items;
    let item;
    for (const index of parts) {
      item = items[index];
      items = item?.children || [];
    }
    return item;
  }

  _getList(path) {
    const parts = this._pathParts(path);
    let items = this._config.items;
    for (const index of parts) items = items[index]?.children || [];
    return items;
  }

  _handleClick(event) {
    const button = event.composedPath?.().find((node) => node?.dataset?.action);
    if (!button) return;
    const action = button.dataset.action;
    if (action === "toggle-edit") {
      this._editing = !this._editing;
      this._render();
      return;
    }
    const path = button.dataset.parent || button.dataset.path || "";
    const list = this._getList(path);
    if (action === "remove") {
      const parts = this._pathParts(button.dataset.path);
      const index = parts.pop();
      const parent = parts.reduce((items, part) => items[part]?.children || [], this._config.items);
      parent.splice(index, 1);
    } else if (action === "add-link") {
      list.push({ name: "Neuer Link", icon: "mdi:link", url: "/lovelace/seite" });
    } else if (action === "add-group") {
      list.push({ name: "Neue Gruppe", icon: "mdi:folder-outline", children: [{ name: "Neuer Link", icon: "mdi:link", url: "/lovelace/seite" }] });
    } else if (action === "add-separator") {
      list.push({ type: "separator" });
    }
    this._render();
    this._emitConfig();
  }

  _handleInput(event) {
    const input = event.composedPath?.().find((node) => node?.dataset?.field);
    if (!input) return;
    if (event.type === "input" && input.type === "checkbox") return;
    if (event.type === "change" && input.type !== "checkbox") return;
    const item = this._getItem(input.dataset.path);
    if (!item) return;
    const field = input.dataset.field;
    if (field === "default") {
      const siblings = this._getList(this._pathParts(input.dataset.path).slice(0, -1).join("."));
      if (input.checked) siblings.forEach((sibling) => { sibling.default = false; });
      item.default = input.checked;
    } else item[field] = input.value;
    this._updatePreview();
    this._emitConfig();
  }

  _updatePreview() {
    const preview = this.shadowRoot.querySelector(".preview-bar");
    if (preview) preview.innerHTML = this._previewMarkup();
    const previewShell = this.shadowRoot.querySelector(".preview");
    if (previewShell) previewShell.style.setProperty("--nav-color", NAV_COLORS[this._config.color] || NAV_COLORS.orange);
  }

  _emitConfig() {
    this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config: this._config } }));
  }

  setConfig(config) {
    this._config = { ...GlassNavigationCard.getStubConfig(), ...config };
    if (!Array.isArray(config.items)) this._config.items = GlassNavigationCard.getStubConfig().items;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this.shadowRoot.querySelector("ha-form").hass = hass;
  }
}

if (!customElements.get("glass-navigation-card")) customElements.define("glass-navigation-card", GlassNavigationCard);
if (!customElements.get("glass-navigation-card-editor")) customElements.define("glass-navigation-card-editor", GlassNavigationCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "glass-navigation-card")) window.customCards.push({ type: "glass-navigation-card", name: "Glass Navigation Card", description: "Verschachtelte Navigation mit konfigurierbarer Position und Farbe.", preview: true, version: NAV_CARD_VERSION });
})();