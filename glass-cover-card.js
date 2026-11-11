const CARD_VERSION = "1.0.0";
const clamp = (value) => Math.min(100, Math.max(0, Number(value) || 0));

class GlassCoverCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._menuOpen = false;
    this._pendingPosition = null;
    this._pendingTilt = null;
    this._pendingPositionTimer = null;
    this._pendingTiltTimer = null;
  }

  setConfig(config) {
    if (!config?.entity) {
      throw new Error("Bitte eine Cover-Entitaet mit 'entity' angeben.");
    }
    this._config = {
      name: "",
      show_tilt: true,
      title: "Beschattung",
      ...config,
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const position = Number(hass.states?.[this._config?.entity]?.attributes?.current_position);
    if (this._pendingPosition !== null && position === this._pendingPosition) {
      window.clearTimeout(this._pendingPositionTimer);
      this._pendingPosition = null;
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
    return this._config?.show_tilt ? 5 : 4;
  }

  static getConfigElement() {
    return document.createElement("glass-cover-card-editor");
  }

  static getStubConfig() {
    return { entity: "cover.living_room", name: "Wohnzimmer", show_tilt: true };
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
    this._pendingPosition = clamp(value);
    window.clearTimeout(this._pendingPositionTimer);
    this._pendingPositionTimer = window.setTimeout(() => {
      this._pendingPosition = null;
      this._render();
    }, 3000);
    this._call("set_cover_position", { position: this._pendingPosition });
    this._render();
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
      this._setPendingPosition(100);
      this._call("open_cover");
    } else if (action === "close") {
      this._setPendingPosition(0);
      this._call("close_cover");
    } else {
      this._setPendingPosition(0);
      this._setPendingTilt(50);
      this._call("close_cover");
      window.setTimeout(() => this._setTilt(50), 700);
    }
    this._render();
  }

  _setPendingPosition(value) {
    this._pendingPosition = clamp(value);
    window.clearTimeout(this._pendingPositionTimer);
    this._pendingPositionTimer = window.setTimeout(() => {
      this._pendingPosition = null;
      this._render();
    }, 3000);
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
    this.shadowRoot.querySelector(".position")?.addEventListener("input", (event) => this._setPosition(event.target.value));
    this.shadowRoot.querySelector(".tilt")?.addEventListener("input", (event) => this._setTilt(event.target.value));
  }

  _render() {
    if (!this._config) return;
    const position = this._pendingPosition ?? this._position();
    const tilt = this._pendingTilt ?? this._tilt();
    const title = this._escape(this._config.title || "Beschattung");
    const name = this._escape(this._config.name || this._state()?.attributes?.friendly_name || this._config.entity);
    const isOpen = this._state()?.state === "open" || position > 0;
    const showTilt = this._config.show_tilt !== false;
    const slats = Array.from({ length: 7 }, (_, index) => `<i style="--i:${index}"></i>`).join("");
    const menu = this._menuOpen ? `
      <div class="quick-menu" role="group" aria-label="Schnellwahl">
        <button class="quick" data-action="open" title="Ganz hoch" aria-label="Ganz hoch">${this._icon("up")}</button>
        <button class="quick" data-action="close" title="Ganz runter" aria-label="Ganz runter">${this._icon("down")}</button>
        <button class="quick" data-action="close-tilt" title="Ganz runter, Lamellen 50 %" aria-label="Ganz runter, Lamellen 50 Prozent">${this._icon("half")}</button>
      </div>` : "";

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; width:100%; color:var(--primary-text-color,#f5f5f7); font-family:var(--paper-font-body1_-_font-family, "Arial", sans-serif); }
        * { box-sizing:border-box; }
        .card { position:relative; overflow:hidden; width:100%; min-width:260px; padding:clamp(20px,4.7vw,38px); border:1px solid rgba(255,255,255,.1); border-radius:clamp(22px,4vw,36px); background:radial-gradient(ellipse at 32% 22%,#25272c 0,#17191d 43%,#101215 100%); box-shadow:inset 0 1px 1px rgba(255,255,255,.07),0 12px 30px rgba(0,0,0,.2); }
        .header { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; }
        .eyebrow { color:#9295a0; font-size:clamp(11px,2.1vw,15px); font-weight:700; letter-spacing:.12em; text-transform:uppercase; }
        h2 { margin:7px 0 0; font-size:clamp(22px,4.8vw,38px); line-height:1.08; font-weight:700; overflow-wrap:anywhere; }
        button { color:inherit; font:inherit; cursor:pointer; -webkit-tap-highlight-color:transparent; }
        .menu-wrap { position:relative; z-index:2; flex:none; }
        .menu-toggle,.round { display:grid; place-items:center; border-radius:50%; background:linear-gradient(145deg,#272a30,#17191d); border:2px solid #303239; box-shadow:0 6px 15px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.05); }
        .menu-toggle { width:clamp(56px,11vw,88px); aspect-ratio:1; color:#ff8b2b; }
        .menu-toggle svg { width:46%; height:46%; }
        .quick-menu { position:absolute; right:0; top:calc(100% + 10px); display:grid; grid-template-columns:repeat(3,1fr); gap:8px; padding:9px; border:1px solid #34363c; border-radius:20px; background:#17191d; box-shadow:0 10px 24px rgba(0,0,0,.42); }
        .quick { display:grid; place-items:center; width:clamp(48px,10vw,64px); aspect-ratio:1; padding:12px; border:1px solid #34363c; border-radius:50%; background:#23252a; color:#ff8b2b; }
        .quick svg { width:100%; height:100%; }
        .visual { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(110px,.85fr); align-items:center; gap:clamp(15px,4vw,36px); margin:clamp(22px,5vw,36px) 0 25px; }
        .window { position:relative; width:100%; aspect-ratio:1.14; padding:12px 8px 9px; border:7px solid #25262a; border-top-width:17px; border-bottom-width:9px; border-radius:4px; background:linear-gradient(180deg,rgba(23,25,29,.22),rgba(255,145,67,.1)),linear-gradient(130deg,#d9b78c,#6c665b 48%,#ead0a5); box-shadow:0 8px 16px #0008,inset 0 0 0 2px #090a0b; }
        .window::before { content:""; position:absolute; z-index:1; top:-18px; left:-9px; right:-9px; height:clamp(12px,2.5vw,20px); border:1px solid #4a4b51; border-radius:2px; background:linear-gradient(#303238,#191a1f); box-shadow:0 3px 8px #0008; }
        .glass { position:absolute; inset:12px 7px 8px; overflow:hidden; border:2px solid #d5b591; background:radial-gradient(ellipse at 22% 35%,#fff5cd 0 3%,transparent 23%),linear-gradient(180deg,#b8ab92,#d8bb94 52%,#87674e); }
        .glass::after { content:""; position:absolute; inset:0; opacity:.42; background:linear-gradient(100deg,transparent 35%,#fff8df 49%,transparent 62%); }
        .slats { position:absolute; z-index:2; top:0; left:0; right:0; height:var(--position); overflow:hidden; transition:height .25s ease; }
        .slats i { position:absolute; left:0; right:0; top:calc(var(--i) * 13%); height:11%; border:1px solid #4b4140; border-top-color:#77706d; background:linear-gradient(180deg,#343237,#17181b 60%,#51413a); box-shadow:0 2px 3px #0008; transform:skewY(calc((var(--tilt) - 50) * .035deg)); }
        .readout { min-width:0; }
        .value { font-size:clamp(48px,10vw,82px); line-height:.95; font-weight:700; letter-spacing:-.04em; white-space:nowrap; }
        .value small { font-size:.58em; letter-spacing:0; }
        .state { margin-top:12px; color:#a0a2ad; font-size:clamp(15px,3vw,23px); }
        .range-row { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:14px; color:#a4a6b0; font-size:clamp(14px,2.8vw,21px); }
        input[type=range] { --fill:50%; width:100%; height:9px; margin:0; appearance:none; border-radius:10px; outline:none; background:linear-gradient(to right,#ff8827 0 var(--fill),#373a41 var(--fill) 100%); cursor:pointer; }
        input[type=range]::-webkit-slider-thumb { width:clamp(22px,4vw,30px); height:clamp(22px,4vw,30px); appearance:none; border:0; border-radius:50%; background:#ff8b2b; box-shadow:0 2px 8px #0008; }
        input[type=range]::-moz-range-thumb { width:clamp(22px,4vw,30px); height:clamp(22px,4vw,30px); border:0; border-radius:50%; background:#ff8b2b; box-shadow:0 2px 8px #0008; }
        .controls { display:grid; grid-template-columns:repeat(3,1fr); align-items:center; justify-items:center; gap:10px; margin:clamp(26px,5vw,40px) 7% clamp(23px,4vw,32px); }
        .round { width:clamp(72px,15vw,114px); aspect-ratio:1; padding:24%; color:#e4e4e8; }
        .round svg { width:100%; height:100%; }
        .stop { width:clamp(78px,16vw,120px); border:3px solid #ff8b2b; color:#ff8b2b; background:radial-gradient(circle,#38251a,#17191d 74%); }
        .stop svg { width:38%; height:38%; fill:currentColor; }
        .divider { height:1px; margin:0 0 20px; background:#303239; }
        .tilt-row { display:grid; grid-template-columns:42px minmax(80px,.65fr) minmax(90px,1.35fr); align-items:center; gap:14px; color:#c2c3ca; font-size:clamp(14px,2.7vw,21px); }
        .tilt-icon { width:35px; height:35px; color:#c2c3ca; }
        .tilt-row[hidden] { display:none; }
        @media (max-width:380px) { .card { padding:18px; } .visual { grid-template-columns:1fr .75fr; gap:13px; } .range-row { gap:8px; } .tilt-row { grid-template-columns:28px minmax(65px,.65fr) minmax(75px,1.35fr); gap:9px; } .tilt-icon { width:27px; height:27px; } }
        @media (prefers-reduced-motion:reduce) { *,*::before,*::after { transition:none !important; } }
      </style>
      <article class="card">
        <header class="header">
          <div><div class="eyebrow">${title}</div><h2>${name}</h2></div>
          <div class="menu-wrap"><button class="menu-toggle" aria-label="Schnellwahl anzeigen" aria-expanded="${this._menuOpen}">${this._icon("blinds")}</button>${menu}</div>
        </header>
        <section class="visual" aria-label="Jalousienposition">
          <div class="window" style="--position:${position}%;--tilt:${tilt}"><div class="glass"></div><div class="slats">${slats}</div></div>
          <div class="readout"><div class="value">${Math.round(position)}<small> %</small></div><div class="state">${isOpen ? "geöffnet" : "geschlossen"}</div></div>
        </section>
        <div class="range-row"><span>Zu</span><input class="position" type="range" min="0" max="100" step="1" value="${position}" aria-label="Jalousienposition" style="--fill:${position}%"><span>Auf</span></div>
        <nav class="controls" aria-label="Jalousiensteuerung">
          <button class="round raise" aria-label="Hochfahren" title="Hochfahren">${this._icon("up")}</button>
          <button class="round stop" aria-label="Stoppen" title="Stoppen">${this._icon("stop")}</button>
          <button class="round lower" aria-label="Runterfahren" title="Runterfahren">${this._icon("down")}</button>
        </nav>
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
    this._config = { show_tilt: true, ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _render() {
    if (!this._config || !this._hass) return;
    const entities = Object.keys(this._hass.states).filter((entity) => entity.startsWith("cover."));
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
      </div>`;
    this.querySelectorAll("[data-field]").forEach((input) => input.addEventListener("change", (event) => {
      const field = event.target.dataset.field;
      const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
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
window.customCards.push({ type: "glass-cover-card", name: "Glass Cover Card", description: "Responsive Jalousiensteuerung mit optionaler Lamellensteuerung.", preview: true, version: CARD_VERSION });