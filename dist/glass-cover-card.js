(() => {
const CARD_VERSION = "1.8.0";
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
  }

  setConfig(config) {
    if (!config?.entity) {
      throw new Error("Bitte eine Cover-Entitaet mit 'entity' angeben.");
    }
    this._config = {
      name: "",
      show_tilt: true,
      show_main_controls: true,
      show_close_tilt: true,
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
    this._render();
  }

  get hass() {
    return this._hass;
  }

  getCardSize() {
    return (this._config?.show_preview !== false ? 4 : 2) + (this._config?.show_tilt !== false ? 1 : 0);
  }

  static getConfigElement() {
    return document.createElement("glass-cover-card-editor");
  }

  static getStubConfig() {
    return { entity: "cover.living_room", name: "Wohnzimmer", show_tilt: true, show_preview: true, button_size: 5, title_size: 5, preview_size: 5 };
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
    const title = this._escape(this._config.title || "Beschattung");
    const name = this._escape(this._config.name || this._state()?.attributes?.friendly_name || this._config.entity);
    const showTilt = this._config.show_tilt !== false;
    const showMainControls = this._config.show_main_controls !== false;
    const showCloseTilt = this._config.show_close_tilt !== false;
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
        .header { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; }
        .eyebrow { color:#9295a0; font-size:clamp(11px,2.1vw,15px); font-weight:700; letter-spacing:.12em; text-transform:uppercase; }
        h2 { margin:7px 0 0; font-size:var(--title-font); line-height:1.08; font-weight:700; overflow-wrap:anywhere; }
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
        @media (max-width:380px) { .card { padding:18px; } .visual { grid-template-columns:1fr .75fr; gap:13px; } .range-row { gap:8px; } .tilt-row { grid-template-columns:var(--tilt-icon-size) minmax(65px,.65fr) minmax(75px,1.35fr); gap:var(--tilt-gap); } }
        @media (prefers-reduced-motion:reduce) { *,*::before,*::after { transition:none !important; } }
      </style>
      <article class="card ${showPreview ? "" : "compact"}" style="${controlsStyle}">
        <header class="header">
          <div><div class="eyebrow">${title}</div><h2>${name}</h2></div>
          <div class="menu-wrap"><button class="menu-toggle" aria-label="Schnellwahl anzeigen" aria-expanded="${this._menuOpen}">${this._icon("blinds")}</button>
            <div class="quick-menu ${this._menuOpen ? "open" : ""}" role="group" aria-label="Schnellwahl" aria-hidden="${!this._menuOpen}">
              <button class="quick" data-action="open" title="Ganz auf" aria-label="Ganz auf">${this._icon("up")}</button>
              <button class="quick" data-action="close" title="Ganz zu" aria-label="Ganz zu">${this._icon("down")}</button>
              <button class="quick" data-action="close-tilt" title="Ganz zu, Lamellen 50 Prozent (durchsichtig)" aria-label="Ganz zu, Lamellen 50 Prozent">${this._icon("half")}</button>
            </div>
          </div>
        </header>
        <section class="visual" aria-label="Jalousienposition">
          <div class="window" style="--position:${position}%;--tilt:${tilt}"><div class="glass"></div><div class="slats">${slats}</div></div>
          <div class="readout"><div class="value">${displayedPosition}<small> %</small></div><div class="state">${invertPosition ? "geöffnet" : "geschlossen"}</div></div>
        </section>
        <div class="range-row"><span>${invertPosition ? "Zu" : "Auf"}</span><div class="position-control"><input class="position" type="range" min="0" max="100" step="1" value="${uiPosition}" aria-label="Jalousienposition" style="--fill:${uiPosition}%">${targetMarker}</div><span>${invertPosition ? "Auf" : "Zu"}</span></div>
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

class GlassCoverCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { show_tilt: true, show_main_controls: true, show_close_tilt: true, ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _render() {
    if (!this._config || !this._hass) return;
    const entities = Object.keys(this._hass.states).filter((entity) => entity.startsWith("cover."));
    const size = Math.min(5, Math.max(1, Number(this._config.button_size) || 5));
    const titleSize = Math.min(5, Math.max(1, Number(this._config.title_size) || 5));
    const previewSize = Math.min(5, Math.max(1, Number(this._config.preview_size) || 5));
    this.innerHTML = `
      <style>
        .form { display:grid; gap:12px; padding:12px 0; }
        label { display:grid; gap:6px; }
        input,select { min-height:40px; padding:8px; color:var(--primary-text-color); background:var(--input-fill-color,#202124); border:1px solid var(--divider-color,#555); border-radius:4px; font:inherit; }
        .check { display:flex; align-items:center; gap:9px; }
      </style>
      <div class="form">
        <label>Jalousie-Entitaet<select data-field="entity"><option value="">Entitaet auswaehlen</option>${entities.map((entity) => `<option value="${entity}" ${this._config.entity === entity ? "selected" : ""}>${entity}</option>`).join("")}</select></label>
        <label>Anzeigename<input data-field="name" value="${this._escape(this._config.name || "")}" placeholder="Wohnzimmer"></label>
        <label>Lamellen-Entitaet (optional)<select data-field="tilt_entity"><option value="">Gleiche Entitaet verwenden</option>${entities.map((entity) => `<option value="${entity}" ${this._config.tilt_entity === entity ? "selected" : ""}>${entity}</option>`).join("")}</select></label>
        <label class="check"><input data-field="show_tilt" type="checkbox" ${this._config.show_tilt !== false ? "checked" : ""}> Lamellenregler anzeigen</label>
        <label class="check"><input data-field="show_main_controls" type="checkbox" ${this._config.show_main_controls !== false ? "checked" : ""}> Buttons Hoch, Stopp und Runter anzeigen</label>
        <label class="check"><input data-field="show_close_tilt" type="checkbox" ${this._config.show_close_tilt !== false ? "checked" : ""}> Button „geschlossen + Lamellen 50 %“ anzeigen</label>
        <label class="check"><input data-field="show_preview" type="checkbox" ${this._config.show_preview !== false ? "checked" : ""}> Vorschau und Prozentanzeige anzeigen</label>
        <label class="check"><input data-field="invert_position" type="checkbox" ${this._config.invert_position === true ? "checked" : ""}> Slider und Prozentanzeige umkehren</label>
        <label>Button-Groesse (${size})<input data-field="button_size" type="range" min="1" max="5" step="1" value="${size}"></label>
        <label>Ueberschrift-Groesse (${titleSize})<input data-field="title_size" type="range" min="1" max="5" step="1" value="${titleSize}"></label>
        <label>Bild- und Prozentgroesse (${previewSize})<input data-field="preview_size" type="range" min="1" max="5" step="1" value="${previewSize}"></label>
      </div>`;
    this.querySelectorAll("[data-field]").forEach((input) => input.addEventListener("change", (event) => {
      const field = event.target.dataset.field;
      const value = event.target.type === "checkbox" ? event.target.checked : (event.target.type === "range" ? Number(event.target.value) : event.target.value);
      this._config = { ...this._config, [field]: value };
      this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config: this._config } }));
    }));
  }

  _escape(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
  }
}

if (!customElements.get("glass-cover-card")) customElements.define("glass-cover-card", GlassCoverCard);
if (!customElements.get("glass-cover-card-editor")) customElements.define("glass-cover-card-editor", GlassCoverCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "glass-cover-card")) {
  window.customCards.push({ type: "glass-cover-card", name: "Glass Cover Card", description: "Responsive Jalousiensteuerung mit optionaler Lamellensteuerung.", preview: true, version: CARD_VERSION });
}
})();

(() => {
const CARD_VERSION = "1.0.0";
const BUTTON_ICONS = [
  "mdi:sofa-outline",
  "mdi:lightbulb-outline",
  "mdi:blinds-horizontal",
  "mdi:television",
  "mdi:power",
  "mdi:fan",
  "mdi:lock-outline",
  "mdi:home-outline",
  "mdi:lamp",
  "mdi:ceiling-light",
  "mdi:window-shutter",
  "mdi:curtains",
  "mdi:volume-high",
  "mdi:music",
  "mdi:play",
  "mdi:pause",
  "mdi:weather-sunny",
  "mdi:weather-night",
  "mdi:fire",
  "mdi:water",
  "mdi:coffee",
  "mdi:door",
  "mdi:garage",
  "mdi:robot-vacuum",
  "mdi:lightning-bolt",
  "mdi:air-conditioner",
];

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
  }

  setConfig(config) {
    this._config = {
      buttons: [],
      button_size: 5,
      columns: 4,
      show_name: true,
      ...config,
      buttons: Array.isArray(config.buttons) ? config.buttons : [],
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
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

  static getStubConfig() {
    return {
      button_size: 5,
      columns: 4,
      show_name: true,
      buttons: [
        { entity: "", name: "Wohnzimmer", icon: "mdi:sofa-outline", action: "toggle" },
        { entity: "", name: "Licht", icon: "mdi:lightbulb-outline", action: "toggle" },
        { entity: "", name: "Jalousie", icon: "mdi:blinds-horizontal", action: "toggle" },
        { entity: "", name: "Fernsehen", icon: "mdi:television", action: "toggle" },
      ],
    };
  }

  _callButton(button) {
    if (!this._hass || !button.entity) return;
    if ((button.action || "toggle") === "more-info") {
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
    this.shadowRoot.querySelectorAll("[data-button-index]").forEach((element) => {
      element.addEventListener("click", () => this._callButton(this._config.buttons[Number(element.dataset.buttonIndex)]));
    });
  }

  _render() {
    if (!this._config) return;
    const level = Math.min(5, Math.max(1, Number(this._config.button_size) || 5));
    const scale = 1 / 3 + ((level - 1) / 4) * (2 / 3);
    const columns = Math.min(8, Math.max(1, Number(this._config.columns) || 4));
    const showName = this._config.show_name !== false;
    const iconScale = 0.48;
    const mobileColumns = Math.min(columns, 2);
    const buttons = this._config.buttons.map((button, index) => {
      const state = this._hass?.states?.[button.entity];
      const isActive = state && !["off", "closed", "idle", "standby", "unavailable", "unknown", "not_home"].includes(state.state);
      const name = button.name || state?.attributes?.friendly_name || button.entity || "Button";
      const icon = button.icon || "mdi:gesture-tap-button";
      return `<button class="button ${isActive ? "active" : ""}" data-button-index="${index}" aria-label="${escapeHtml(name)}" title="${escapeHtml(name)}">
        <span class="icon"><ha-icon icon="${escapeHtml(icon)}"></ha-icon></span>
        ${showName ? `<span class="name">${escapeHtml(name)}</span>` : ""}
      </button>`;
    }).join("");

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; width:100%; color:var(--primary-text-color,#f3f3f5); font-family:var(--paper-font-body1_-_font-family,"Arial",sans-serif); }
        * { box-sizing:border-box; }
        .card { width:100%; padding:clamp(16px,3vw,30px); border:1px solid rgba(255,255,255,.1); border-radius:28px; background:radial-gradient(ellipse at 50% 0,#22252a 0,#15171a 62%,#101214 100%); box-shadow:inset 0 1px 1px rgba(255,255,255,.06),0 12px 30px rgba(0,0,0,.2); }
        .buttons { display:grid; grid-template-columns:repeat(var(--columns),minmax(0,1fr)); align-items:start; justify-items:center; gap:clamp(12px,2.6vw,32px); }
        .button { display:flex; width:100%; min-width:0; flex-direction:column; align-items:center; gap:clamp(12px,2vw,20px); padding:0; border:0; background:transparent; color:inherit; font:inherit; cursor:pointer; -webkit-tap-highlight-color:transparent; }
        .icon { display:grid; width:min(var(--button-size),100%); aspect-ratio:1; place-items:center; border:2px solid #414348; border-radius:50%; background:linear-gradient(145deg,#222428,#131518); color:#d5d5d8; box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 8px 18px rgba(0,0,0,.28); transition:border-color .18s ease,color .18s ease,background .18s ease,box-shadow .18s ease,transform .18s ease; }
        .button:hover .icon { transform:translateY(-2px); border-color:#686a70; }
        .button.active .icon { border-color:#ff8b2b; color:#ff963d; background:radial-gradient(circle at 50% 45%,#342316,#1c1b19 72%); box-shadow:inset 0 0 24px rgba(255,139,43,.12),0 0 0 1px rgba(255,139,43,.2),0 8px 22px rgba(0,0,0,.3); }
        ha-icon { display:block; --mdc-icon-size:var(--icon-size); }
        .name { max-width:100%; color:#e4e4e7; font-size:clamp(13px,2.2vw,20px); line-height:1.2; text-align:center; overflow-wrap:anywhere; }
        @media (max-width:640px) { .buttons { grid-template-columns:repeat(var(--mobile-columns),minmax(0,1fr)); } }
        @media (max-width:360px) { .buttons { grid-template-columns:1fr; } }
        @media (prefers-reduced-motion:reduce) { *,*::before,*::after { transition:none !important; } }
      </style>
      <article class="card" style="--columns:${columns};--mobile-columns:${mobileColumns};--button-size:clamp(${72 * scale}px,${15 * scale}vw,${114 * scale}px);--icon-size:clamp(${Math.min(16, 72 * scale * iconScale)}px,${15 * scale * iconScale}vw,${114 * scale * iconScale}px)">
        <div class="buttons">${buttons}</div>
      </article>`;
    this._bindEvents();
  }
}

class GlassButtonCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = {
      buttons: [],
      button_size: 5,
      columns: 4,
      show_name: true,
      ...config,
      buttons: Array.isArray(config.buttons) ? config.buttons.map((button) => ({ action: "toggle", icon: "mdi:gesture-tap-button", ...button })) : [],
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _update(patch) {
    this._config = { ...this._config, ...patch };
    this._notify();
    this._render();
  }

  _updateButton(index, patch) {
    const buttons = this._config.buttons.map((button, buttonIndex) => buttonIndex === index ? { ...button, ...patch } : button);
    this._update({ buttons });
  }

  _notify() {
    this.dispatchEvent(new CustomEvent("config-changed", {
      bubbles: true,
      composed: true,
      detail: { config: this._config },
    }));
  }

  _render() {
    if (!this._config || !this._hass) return;
    const entities = Object.keys(this._hass.states || {}).sort();
    const size = Math.min(5, Math.max(1, Number(this._config.button_size) || 5));
    const columns = Math.min(8, Math.max(1, Number(this._config.columns) || 4));
    const entityOptions = (selected) => `<option value="">Entitaet auswaehlen</option>${entities.map((entity) => `<option value="${escapeHtml(entity)}" ${entity === selected ? "selected" : ""}>${escapeHtml(entity)}</option>`).join("")}`;
    const iconOptions = (selected) => [...new Set([selected, ...BUTTON_ICONS])].filter(Boolean).map((icon) => `<option value="${escapeHtml(icon)}" ${icon === selected ? "selected" : ""}>${escapeHtml(icon)}</option>`).join("");
    const buttonRows = this._config.buttons.map((button, index) => `
      <fieldset class="button-config">
        <legend>Button ${index + 1}</legend>
        <label>Entitaet<select data-field="entity" data-index="${index}">${entityOptions(button.entity)}</select></label>
        <label>Icon<select data-field="icon" data-index="${index}">${iconOptions(button.icon || "mdi:gesture-tap-button")}</select><ha-icon class="icon-preview" icon="${escapeHtml(button.icon || "mdi:gesture-tap-button")}"></ha-icon></label>
        <label>Text<input data-field="name" data-index="${index}" value="${escapeHtml(button.name || "")}" placeholder="Anzeigename oder Friendly Name"></label>
        <label>Aktion<select data-field="action" data-index="${index}"><option value="toggle" ${button.action !== "more-info" ? "selected" : ""}>Ein-/Ausschalten</option><option value="more-info" ${button.action === "more-info" ? "selected" : ""}>Mehr Informationen anzeigen</option></select></label>
        <button type="button" class="remove" data-remove="${index}" aria-label="Button ${index + 1} entfernen">Entfernen</button>
      </fieldset>`).join("");

    this.innerHTML = `
      <style>
        .form { display:grid; gap:14px; padding:12px 0; }
        label { display:grid; gap:6px; min-width:0; }
        input,select,button { min-height:40px; padding:8px 10px; color:var(--primary-text-color); background:var(--input-fill-color,#202124); border:1px solid var(--divider-color,#555); border-radius:4px; font:inherit; }
        input[type=checkbox] { width:20px; min-height:20px; }
        .check { display:flex; align-items:center; gap:9px; }
        .button-config { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr)); gap:10px; padding:12px; border:1px solid var(--divider-color,#555); border-radius:6px; }
        legend { padding:0 6px; color:var(--secondary-text-color,#aaa); }
        .icon-preview { align-self:center; justify-self:start; width:28px; height:28px; --mdc-icon-size:28px; }
        .remove { grid-column:1/-1; justify-self:end; color:var(--error-color,#f66); }
        .add { justify-self:start; }
      </style>
      <div class="form">
        <label>Button-Groesse (${size})<input data-setting="button_size" type="range" min="1" max="5" step="1" value="${size}"></label>
        <label>Buttons pro Reihe (${columns})<input data-setting="columns" type="range" min="1" max="8" step="1" value="${columns}"></label>
        <label class="check"><input data-setting="show_name" type="checkbox" ${this._config.show_name !== false ? "checked" : ""}> Buttontexte anzeigen</label>
        ${buttonRows}
        <button type="button" class="add">Button hinzufuegen</button>
      </div>`;

    this.querySelectorAll("[data-setting]").forEach((input) => input.addEventListener("change", (event) => {
      const { setting } = event.target.dataset;
      const value = event.target.type === "checkbox" ? event.target.checked : Number(event.target.value);
      this._update({ [setting]: value });
    }));
    this.querySelectorAll("[data-field]").forEach((input) => input.addEventListener("change", (event) => {
      const index = Number(event.target.dataset.index);
      const { field } = event.target.dataset;
      this._updateButton(index, { [field]: event.target.value });
    }));
    this.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", (event) => {
      const index = Number(event.currentTarget.dataset.remove);
      this._update({ buttons: this._config.buttons.filter((_, buttonIndex) => buttonIndex !== index) });
    }));
    this.querySelector(".add")?.addEventListener("click", () => {
      this._update({ buttons: [...this._config.buttons, { entity: "", name: "", icon: BUTTON_ICONS[0], action: "toggle" }] });
    });
  }
}

if (!customElements.get("glass-button-card")) customElements.define("glass-button-card", GlassButtonCard);
if (!customElements.get("glass-button-card-editor")) customElements.define("glass-button-card-editor", GlassButtonCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "glass-button-card")) {
  window.customCards.push({ type: "glass-button-card", name: "Glass Button Card", description: "Runde, nebeneinander angeordnete Home Assistant Buttons mit Icon-Auswahl.", preview: true, version: CARD_VERSION });
}
})();