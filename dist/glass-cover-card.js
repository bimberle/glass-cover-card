(() => {
const CARD_VERSION = "1.24.1";
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
        if (!this._hass)
            return;
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
        }
        else if (action === "close") {
            this._setTargetPosition(0);
            this._call("close_cover");
        }
        else {
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
        this.shadowRoot.querySelector(".position")?.addEventListener("change", (event) => this._setPosition(event.currentTarget.value));
        this.shadowRoot.querySelector(".tilt")?.addEventListener("input", (event) => this._setTilt(event.currentTarget.value));
    }
    _render() {
        if (!this._config)
            return;
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
        .glass { position:absolute; inset:12px 7px 8px; overflow:hidden; border:2px solid #d5b591; background:radial-gradient(ellipse at 70% 42%,#fff5cd 0 4%,#ffe4ae 12%,transparent 35%),linear-gradient(180deg,#aebac0 0%,#eac99b 48%,#f4bb72 70%,#61574c 100%); }
        .glass::before { content:""; position:absolute; inset:38% -8% -18%; background:radial-gradient(ellipse at 12% 72%,#323d38 0 12%,transparent 33%),radial-gradient(ellipse at 34% 64%,#4a4a3c 0 16%,transparent 34%),radial-gradient(ellipse at 60% 73%,#343c37 0 18%,transparent 36%),radial-gradient(ellipse at 88% 62%,#45483c 0 16%,transparent 34%),linear-gradient(178deg,transparent 0 37%,#75604b 39% 42%,#353b38 47% 100%); filter:blur(3px); }
        .glass::after { content:""; position:absolute; z-index:1; inset:0; opacity:.42; background:linear-gradient(100deg,transparent 35%,#fff8df 49%,transparent 62%); }
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
if (!customElements.get("glass-cover-card"))
    customElements.define("glass-cover-card", GlassCoverCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "glass-cover-card")) {
    window.customCards.push({ type: "glass-cover-card", name: "Glass Cover Card", description: "Responsive Jalousiensteuerung mit optionaler Lamellensteuerung.", preview: true, version: CARD_VERSION });
}

})();

(() => {
function glassRoundButtonStyles(selector) {
    return `
    ${selector} { border:var(--glass-button-border-width,2px) solid color-mix(in srgb,var(--accent) 78%,#414348); border-radius:50%; background:linear-gradient(145deg,#222428,#131518); color:var(--accent); box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 8px 18px rgba(0,0,0,.28); transition:border-color .18s ease,color .18s ease,background .18s ease,box-shadow .18s ease,transform .18s ease; cursor:pointer; -webkit-tap-highlight-color:transparent; }
    ${selector}:hover { transform:translateY(-2px); border-color:var(--accent); }
    ${selector}.active { border-color:var(--accent); background:radial-gradient(circle at 50% 45%,color-mix(in srgb,var(--accent) 24%,#1c1b19),#1c1b19 72%); box-shadow:inset 0 0 24px color-mix(in srgb,var(--accent) 18%,transparent),0 0 0 var(--glass-button-ring-width,1px) color-mix(in srgb,var(--accent) 35%,transparent),0 8px 22px rgba(0,0,0,.3); }
    ${selector}.inactive { color:#85878b; border-color:#45474b; }
    ${selector}.inactive:hover { border-color:#77797d; }
    ${selector}:focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
  `;
}

const CARD_VERSION = "1.7.0";
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
        if (!this._hass || !button.entity)
            return;
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
        if (this._config.show_brightness_slider === false || !this._config.entity?.startsWith("light.") || !state)
            return false;
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
        if (valueLabel)
            valueLabel.textContent = `${this._brightness} %`;
    }
    _setBrightnessFromPointer(event) {
        const bounds = this.shadowRoot.querySelector(".dimmer").getBoundingClientRect();
        const angle = Math.atan2(event.clientX - (bounds.left + bounds.width / 2), -(event.clientY - (bounds.top + bounds.height / 2)));
        const pointerValue = ((angle + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * 100;
        if (this._dragging && this._pointerValue != null) {
            let difference = pointerValue - this._pointerValue;
            if (difference > 50)
                difference -= 100;
            if (difference < -50)
                difference += 100;
            this._dragBrightness = Math.max(0, Math.min(100, this._dragBrightness + difference));
            this._displayBrightness(this._dragBrightness);
        }
        else {
            this._dragBrightness = pointerValue < 1 && this._brightness > 50 ? 100 : pointerValue;
            this._displayBrightness(this._dragBrightness);
        }
        this._pointerValue = pointerValue;
    }
    _startBrightnessDrag(event) {
        const state = this._hass?.states?.[this._config.entity];
        if (event.button !== 0 || !this._isDimmable(state) || ["unavailable", "unknown"].includes(state.state))
            return;
        event.preventDefault();
        this._pointerValue = null;
        this._dragging = true;
        event.currentTarget.classList.add("dragging");
        event.currentTarget.setPointerCapture(event.pointerId);
        this._setBrightnessFromPointer(event);
    }
    _moveBrightnessDrag(event) {
        if (this._dragging)
            this._setBrightnessFromPointer(event);
    }
    _endBrightnessDrag(event) {
        if (!this._dragging)
            return;
        this._setBrightnessFromPointer(event);
        this._dragging = false;
        event.currentTarget.classList.remove("dragging");
        this._applyBrightness();
    }
    _applyBrightness() {
        if (!this._hass || !this._config.entity)
            return;
        this._pendingBrightnessState = this._hass.states?.[this._config.entity] || null;
        window.clearTimeout(this._brightnessTimer);
        this._brightnessTimer = window.setTimeout(() => {
            this._pendingBrightnessState = null;
            this._syncEntityState();
        }, 2500);
        if (this._brightness === 0)
            this._hass.callService("light", "turn_off", { entity_id: this._config.entity });
        else
            this._hass.callService("light", "turn_on", { entity_id: this._config.entity, brightness_pct: this._brightness });
    }
    _brightnessKey(event) {
        const state = this._hass?.states?.[this._config.entity];
        if (!this._isDimmable(state) || ["unavailable", "unknown"].includes(state.state))
            return;
        let value = this._brightness;
        if (event.key === "ArrowUp" || event.key === "ArrowRight")
            value += 5;
        else if (event.key === "ArrowDown" || event.key === "ArrowLeft")
            value -= 5;
        else if (event.key === "Home")
            value = 0;
        else if (event.key === "End")
            value = 100;
        else
            return;
        event.preventDefault();
        this._displayBrightness(value);
        this._applyBrightness();
    }
    _syncEntityState() {
        const button = this.shadowRoot.querySelector(".button");
        if (!button)
            return;
        const state = this._hass?.states?.[this._config.entity];
        const binarySensor = this._config.entity?.startsWith("binary_sensor.");
        const binaryKnown = binarySensor && ["on", "off"].includes(state?.state);
        const isActive = binarySensor ? binaryKnown && state.state === (this._config.binary_sensor_active_state === "off" ? "off" : "on") : state && !["off", "closed", "idle", "standby", "unavailable", "unknown", "not_home"].includes(state.state);
        button.classList.toggle("binary-sensor", Boolean(binarySensor));
        button.classList.toggle("active", Boolean(isActive));
        button.classList.toggle("inactive", Boolean(binarySensor ? binaryKnown && !isActive : state && ["off", "closed", "idle", "standby", "not_home"].includes(state.state)));
        const icon = this.shadowRoot.querySelector(".button ha-icon");
        if (icon)
            icon.setAttribute("icon", (binaryKnown ? ((isActive ? this._config.icon_active : this._config.icon_inactive) || (state.state === "on" ? this._config.icon_open : this._config.icon_closed)) : null) || this._config.icon || "mdi:gesture-tap-button");
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
        if (!this._dragging && !this._pendingBrightnessState)
            this._displayBrightness(isActive && Number.isFinite(state?.attributes?.brightness) ? state.attributes.brightness / 255 * 100 : 0);
        const stateLabel = this.shadowRoot.querySelector(".state-value");
        if (stateLabel)
            stateLabel.textContent = !dimmable && ["on", "off"].includes(state?.state) ? (binarySensor ? ((isActive ? this._config.state_active : this._config.state_inactive) || (state.state === "on" ? "Offen" : "Geschlossen")) : (state.state === "on" ? "An" : "Aus")) : "";
        const name = String(this._config.name ?? state?.attributes?.friendly_name ?? this._config.entity ?? "Button").trim();
        const accessibleName = name || state?.attributes?.friendly_name || this._config.entity || "Button";
        button.setAttribute("aria-label", accessibleName);
        button.setAttribute("title", accessibleName);
        const label = this.shadowRoot.querySelector(".name");
        if (label && this._config.name == null)
            label.textContent = name;
    }
    _render() {
        if (!this._config)
            return;
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
        .button { display:grid; width:100%; height:100%; place-items:center; padding:0; }
        ${glassRoundButtonStyles(".button.glass-round-button")}
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
          <button class="button glass-round-button ${isActive ? "active" : ""}" aria-label="${escapeHtml(name)}" title="${escapeHtml(name)}">
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
                if (binaryFields.includes(field.name))
                    return domain === "binary_sensor";
                if (nonBinaryFields.includes(field.name))
                    return domain !== "binary_sensor";
                if (field.name === "show_brightness_slider")
                    return domain === "light";
                return true;
            });
            form.computeLabel = definition.computeLabel;
        }
        form.data = this._config;
        form.hass = this._hass;
    }
}
if (!customElements.get("glass-button-card"))
    customElements.define("glass-button-card", GlassButtonCard);
class GlassButtonsCard extends GlassButtonCard {
}
if (!customElements.get("glass-buttons-card"))
    customElements.define("glass-buttons-card", GlassButtonsCard);
if (!customElements.get("glass-button-card-editor"))
    customElements.define("glass-button-card-editor", GlassButtonCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "glass-button-card")) {
    window.customCards.push({ type: "glass-button-card", name: "Glass Button Card", description: "Einzelner runder Home Assistant Button mit Icon- und Farbauswahl.", preview: true, version: CARD_VERSION });
}
if (!window.customCards.some((card) => card.type === "glass-buttons-card")) {
    window.customCards.push({ type: "glass-buttons-card", name: "Glass Buttons", description: "Runder Aktionsbutton für Vertical- und Horizontal-Stacks.", preview: true, version: CARD_VERSION });
}

})();

(() => {
const CARD_VERSION = "2.0.1";
const escapePanelText = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
})[char]);
const normalizePanelConfig = (config = {}) => {
    const cards = Array.isArray(config.cards) ? [...config.cards] : [];
    const hasLegacyHeader = Boolean(String(config.title ?? "").trim() || String(config.subtitle ?? "").trim() || (config.show_action_button && config.action_entity));
    const hasTextCard = cards.some((card) => ["custom:glass-text-card", "glass-text-card"].includes(card?.type));
    if (hasLegacyHeader && !hasTextCard) {
        cards.unshift({
            type: "custom:glass-text-card",
            title: config.title ?? "",
            subtitle: config.subtitle ?? "",
            title_size: config.title_size ?? 5,
            button_size: config.button_size ?? 5,
            show_action_button: config.show_action_button ?? false,
            action_entity: config.action_entity,
            action_icon: config.action_icon ?? "mdi:gesture-tap-button",
            action: config.action ?? "toggle",
        });
    }
    const { title, subtitle, title_size, button_size, show_action_button, action_entity, action_icon, action, ...panelConfig } = config;
    return { panel_size: 5, ...panelConfig, cards };
};
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
        this._config = normalizePanelConfig(config);
        this._childrenGeneration += 1;
        this._children = [];
        this._renderShell();
        return this._loadChildren();
    }
    set hass(hass) {
        this._hass = hass;
        for (const child of this._children)
            child.hass = hass;
    }
    get hass() {
        return this._hass;
    }
    getCardSize() {
        return Math.max(1, (this._config?.cards?.length ?? 0) * 2 + 1);
    }
    static getStubConfig() {
        return { panel_size: 5, cards: [] };
    }
    static async getConfigElement() {
        const helpers = await window.loadCardHelpers();
        helpers.createCardElement({ type: "vertical-stack", cards: [] });
        await customElements.whenDefined("hui-vertical-stack-card");
        const stackCard = customElements.get("hui-vertical-stack-card");
        await stackCard.getConfigElement();
        await customElements.whenDefined("hui-stack-card-editor");
        return document.createElement("glass-panel-card-editor");
    }
    async _loadChildren() {
        const cardsConfig = this._config.cards;
        const generation = this._childrenGeneration;
        try {
            this._helpersPromise ??= window.loadCardHelpers();
            const helpers = await this._helpersPromise;
            if (!this._config || generation !== this._childrenGeneration)
                return;
            const container = this.shadowRoot.querySelector(".children");
            if (!container)
                return;
            container.replaceChildren();
            this._children = [];
            if (cardsConfig.length === 0) {
                container.innerHTML = `<div class="empty">Keine Karten konfiguriert.</div>`;
            }
            else {
                const stack = helpers.createCardElement({ type: "vertical-stack", cards: cardsConfig });
                stack.hass = this._hass;
                this._children = [stack];
                container.append(stack);
            }
        }
        catch (error) {
            const container = this.shadowRoot.querySelector(".children");
            if (container)
                container.textContent = `Karten konnten nicht geladen werden: ${error.message}`;
        }
    }
    _renderShell() {
        const level = Math.min(5, Math.max(1, Number(this._config.panel_size) || 5));
        const minPadding = 10 + level * 2;
        const maxPadding = 18 + level * 4;
        const fluidPadding = 2.5 + level * 0.44;
        this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; width:100%; color:var(--primary-text-color,#f3f3f5); font-family:var(--paper-font-body1_-_font-family,"Arial",sans-serif); }
        * { box-sizing:border-box; }
        .panel { width:100%; padding:var(--panel-padding); border:1px solid rgba(255,255,255,.1); border-radius:28px; background:radial-gradient(ellipse at 48% 0,#22252a 0,#15171a 62%,#101214 100%); box-shadow:inset 0 1px 1px rgba(255,255,255,.06),0 12px 30px rgba(0,0,0,.2); }
        .children { display:block; min-width:0; }
        .children > * { min-width:0; }
        .empty { color:var(--secondary-text-color,#a0a2ad); }
        @media (max-width:380px) { .panel { padding:var(--panel-mobile-padding); } }
      </style>
      <article class="panel" style="--panel-padding:clamp(${minPadding}px,${fluidPadding}vw,${maxPadding}px);--panel-mobile-padding:clamp(${minPadding}px,4.7vw,${maxPadding}px)">
        <div class="children">${this._config.cards.length ? "" : `<div class="empty">Keine Karten konfiguriert.</div>`}</div>
      </article>`;
    }
}
const PANEL_FORM_SCHEMA = [
    { name: "panel_size", default: 5, selector: { number: { min: 1, max: 5, step: 1, mode: "slider" } } },
];
class GlassPanelCardEditor extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this._config = null;
        this._hass = null;
        this._lovelace = undefined;
        this._renderShell();
    }
    setConfig(config) {
        this._config = normalizePanelConfig(config);
        const form = this.shadowRoot.querySelector("ha-form");
        if (form) {
            form.schema = PANEL_FORM_SCHEMA;
            form.data = this._config;
            form.hass = this._hass;
            form.computeLabel = (field) => ({ panel_size: "Panel-Größe" })[field.name] || field.name;
        }
        this._syncStackEditor();
    }
    set hass(hass) {
        this._hass = hass;
        const form = this.shadowRoot.querySelector("ha-form");
        const stackEditor = this.shadowRoot.querySelector("hui-stack-card-editor");
        if (form)
            form.hass = hass;
        if (stackEditor)
            stackEditor.hass = hass;
    }
    set lovelace(lovelace) {
        this._lovelace = lovelace;
        const stackEditor = this.shadowRoot.querySelector("hui-stack-card-editor");
        if (stackEditor)
            stackEditor.lovelace = lovelace;
    }
    _renderShell() {
        this.shadowRoot.innerHTML = `
      <style>
        .editor { display:grid; gap:20px; }
        .stack-editor { display:block; min-width:0; }
      </style>
      <div class="editor">
        <ha-form></ha-form>
        <hui-stack-card-editor class="stack-editor"></hui-stack-card-editor>
      </div>`;
        this.shadowRoot.querySelector("ha-form")?.addEventListener("value-changed", (event) => this._handleFormChanged(event));
        this.shadowRoot.querySelector("hui-stack-card-editor")?.addEventListener("config-changed", (event) => this._handleStackChanged(event));
    }
    _handleFormChanged(event) {
        this._config = { ...this._config, ...event.detail.value };
        this._notifyConfig();
    }
    _handleStackChanged(event) {
        event.stopPropagation();
        const stackConfig = event.detail.config ?? event.detail.value;
        if (!Array.isArray(stackConfig?.cards))
            return;
        this._config = { ...this._config, cards: stackConfig.cards };
        this._notifyConfig();
    }
    _syncStackEditor() {
        const editor = this.shadowRoot.querySelector("hui-stack-card-editor");
        if (!editor || !this._config)
            return;
        editor.hass = this._hass;
        editor.lovelace = this._lovelace;
        editor.setConfig({ type: "vertical-stack", cards: this._config.cards });
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
if (!customElements.get("glass-panel-card"))
    customElements.define("glass-panel-card", GlassPanelCard);
if (!customElements.get("glass-panel-card-editor"))
    customElements.define("glass-panel-card-editor", GlassPanelCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "glass-panel-card")) {
    window.customCards.push({ type: "glass-panel-card", name: "Glass Panel Card", description: "Panel-Hülle für beliebig viele Lovelace-Kindkarten.", preview: true, version: CARD_VERSION });
}

})();

(() => {
(() => {
    "use strict";
    const RGB_CARD_VERSION = "1.3.0";
    const RGB_PRESET_COUNT = 6;
    const escapeRgb = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const clamp = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
    const defaults = { title: "RGB", turn_on_text: "RGB", title_size: 4, button_size: 4, show_action_button: true, show_presets: false, show_card_border: true, compact: true };
    const rgbToHs = rgb => {
        const [r, g, b] = rgb.map(v => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), diff = max - min;
        let h = 0;
        if (diff) {
            h = max === r ? (g - b) / diff : max === g ? (b - r) / diff + 2 : (r - g) / diff + 4;
            h = (h * 60 + 360) % 360;
        }
        return [Math.round(h), max ? Math.round(diff / max * 100) : 0];
    };
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
        static getStubConfig() { return { entity: "light.wohnzimmer", ...defaults }; }
        static getConfigForm() {
            return {
                schema: [
                    { name: "entity", required: true, selector: { entity: { filter: { domain: "light" } } } },
                    { name: "title", default: "RGB", selector: { text: {} } },
                    { name: "name", selector: { text: {} } },
                    { name: "icon", selector: { icon: {} } },
                    { name: "turn_on_text", default: "RGB", selector: { text: {} } },
                    { name: "compact", default: true, selector: { boolean: {} } },
                    { name: "show_card_border", default: true, selector: { boolean: {} } },
                    { name: "show_action_button", default: true, selector: { boolean: {} } },
                    { name: "title_size", default: 4, selector: { number: { min: 1, max: 5, step: 1, mode: "slider" } } },
                    { name: "button_size", default: 4, selector: { number: { min: 1, max: 5, step: 1, mode: "slider" } } },
                    { name: "show_presets", default: false, selector: { boolean: {} } },
                    ...Array.from({ length: RGB_PRESET_COUNT }, (_, i) => ({ name: `preset_${i + 1}`, selector: { color_rgb: {} } }))
                ],
                computeLabel: field => ({ entity: "Licht", title: "Titel", name: "Beschriftung", icon: "Icon", turn_on_text: "Text unter dem Einschalt-Icon", compact: "Kompakte Darstellung", show_card_border: "Kartenrahmen anzeigen", show_action_button: "Kopfbutton anzeigen", title_size: "Beschriftungsgröße", button_size: "Button-Größe", show_presets: "Farb-Presets anzeigen" })[field.name] || (field.name.startsWith("preset_") ? `Farb-Preset ${field.name.slice(7)}` : field.name)
            };
        }
        setConfig(config) {
            if (!config?.entity || typeof config.entity !== "string" || !config.entity.startsWith("light."))
                throw new Error("Bitte eine Licht-Entität auswählen.");
            for (let i = 1; i <= RGB_PRESET_COUNT; i++) {
                const color = config[`preset_${i}`];
                if (color != null && (!Array.isArray(color) || color.length !== 3 || color.some(v => !Number.isInteger(v) || v < 0 || v > 255)))
                    throw new Error(`Preset ${i} muss drei RGB-Werte von 0 bis 255 enthalten.`);
            }
            clearTimeout(this._pendingTimer);
            this._pending = false;
            this._dragging = false;
            this._config = { ...defaults, ...config, title_size: clamp(config.title_size ?? 4, 1, 5, 4), button_size: clamp(config.button_size ?? 4, 1, 5, 4) };
            this._selected = -1;
            this._stateKey = null;
            this._loadPresets();
            this._render();
            this._sync();
        }
        connectedCallback() { this._sync(); }
        disconnectedCallback() { clearTimeout(this._pendingTimer); this._pending = false; this._dragging = false; }
        set hass(hass) {
            this._hass = hass;
            const state = hass?.states?.[this._config?.entity];
            const key = JSON.stringify([state?.state, state?.attributes]);
            if (key !== this._stateKey) {
                this._stateKey = key;
                this._sync();
            }
        }
        get hass() { return this._hass; }
        getCardSize() { return this._config?.compact !== false ? 4 : 5; }
        _state() { return this._hass?.states?.[this._config?.entity]; }
        _available() { const s = this._state(); return !!s && !['unknown', 'unavailable'].includes(s.state); }
        _loadPresets() { this._presets = Array.from({ length: RGB_PRESET_COUNT }, (_, i) => ({ slot: i + 1, rgb: this._config[`preset_${i + 1}`] })).filter(p => Array.isArray(p.rgb)).map(p => { const [hue, saturation] = rgbToHs(p.rgb); return { ...p, hue, saturation }; }); }
        _markPending() { this._pending = true; clearTimeout(this._pendingTimer); this._pendingTimer = setTimeout(() => { this._pending = false; this._sync(); }, 1800); }
        _call(service, data = {}) {
            if (!this._hass || !this._available())
                return;
            this._markPending();
            try {
                Promise.resolve(this._hass.callService("light", service, { entity_id: this._config.entity, ...data })).catch(error => this._serviceError(error));
            }
            catch (error) {
                this._serviceError(error);
            }
        }
        _serviceError(error) { clearTimeout(this._pendingTimer); this._pending = false; this._sync(); console.error("Glass RGB Card:", error); }
        _sendColor() { this._call("turn_on", { hs_color: [this._hue, this._saturation], brightness_pct: Math.max(1, this._brightness) }); }
        _sendBrightness() { this._call(this._brightness === 0 ? "turn_off" : "turn_on", this._brightness === 0 ? {} : { brightness_pct: this._brightness }); }
        _selectPreset(index) { const p = this._presets[index]; if (!p || !this._available())
            return; this._selected = index; this._hue = p.hue; this._saturation = p.saturation; this._temperatureValue = null; this._updateView(); this._call("turn_on", { rgb_color: p.rgb }); }
        _toggleLight() { const s = this._state(); if (s?.state === "off") {
            if (this._presets.length)
                this._selectPreset(0);
            else
                this._call("turn_on");
        }
        else if (s?.state === "on")
            this._call("turn_off"); }
        _setHue(event) { const b = this.shadowRoot.querySelector(".wheel").getBoundingClientRect(); const angle = Math.atan2(event.clientX - b.left - b.width / 2, -(event.clientY - b.top - b.height / 2)); this._hue = Math.round((angle * 180 / Math.PI + 360) % 360) % 360; this._saturation = 100; this._temperatureValue = null; this._selected = -1; this._updateView(); }
        _sync() {
            if (!this._config || !this.shadowRoot.querySelector('.card'))
                return;
            const s = this._state(), a = s?.attributes || {}, modes = a.supported_color_modes || [];
            const color = modes.some(m => ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'].includes(m));
            const temperature = modes.includes('color_temp');
            const available = this._available(), off = s?.state === 'off';
            const q = selector => this.shadowRoot.querySelector(selector);
            if (!this._dragging && !this._pending && s) {
                if (Array.isArray(a.hs_color))
                    [this._hue, this._saturation] = a.hs_color;
                this._brightness = s.state === 'on' ? (Number.isFinite(a.brightness) ? Math.round(a.brightness / 255 * 100) : 100) : 0;
            }
            const header = q('.header-action');
            header.hidden = this._config.show_action_button === false;
            header.disabled = !available;
            header.classList.toggle('active', s?.state === 'on');
            header.classList.toggle('inactive', off);
            q('.action-state').textContent = s?.state === 'on' ? 'An' : off ? 'Aus' : '';
            const name = String(this._config.name ?? '').trim();
            q('.subtitle').textContent = name;
            q('.subtitle').hidden = !name;
            q('.titles').hidden = !String(this._config.title ?? '').trim() && !name;
            q('.header').hidden = q('.titles').hidden && header.hidden;
            q('.controls').hidden = !color || !available;
            q('.controls').classList.toggle('is-off', off);
            q('.turn-on').hidden = !off;
            q('.turn-off').hidden = s?.state !== 'on';
            q('.wheel').tabIndex = off || !available ? -1 : 0;
            q('.wheel').setAttribute('aria-disabled', String(off || !available));
            q('.brightness').disabled = off || !available;
            q('.unavailable').hidden = color && available;
            q('.unavailable').textContent = !s ? 'Licht nicht gefunden.' : !available ? 'Licht nicht verfügbar.' : 'Dieses Licht unterstützt keine RGB-Farben.';
            q('.temperature').hidden = !temperature;
            const input = q('.temperature input');
            input.min = a.min_color_temp_kelvin || (a.max_mireds ? Math.round(1000000 / a.max_mireds) : 2000);
            input.max = a.max_color_temp_kelvin || (a.min_mireds ? Math.round(1000000 / a.min_mireds) : 6500);
            input.disabled = !available;
            if (!this._pending && !this._dragging)
                input.value = a.color_temp_kelvin || input.min;
            this._updateView();
        }
        _updateView() {
            const q = selector => this.shadowRoot.querySelector(selector), wheel = q('.wheel');
            if (!wheel)
                return;
            const control = q('.color-control');
            control.style.setProperty('--hue', this._hue);
            control.style.setProperty('--saturation', `${this._saturation}%`);
            control.style.setProperty('--light-level', `${clamp(this._brightness, 0, 100, 0)}%`);
            wheel.setAttribute('aria-valuenow', String(Math.round(this._hue) % 360));
            q('.brightness-number').textContent = `${Math.round(this._brightness)} %`;
            q('.brightness').value = this._brightness;
            this.shadowRoot.querySelectorAll('.preset').forEach((button, i) => { button.style.setProperty('--swatch', `rgb(${this._presets[i].rgb.join(',')})`); button.setAttribute('aria-pressed', String(i === this._selected)); });
        }
        _render() {
            if (!this._config)
                return;
            const c = this._config, titleScale = .65 + ((c.title_size - 1) / 4) * .35, menuScale = .5 + (1 / 3 + ((c.button_size - 1) / 4) * (2 / 3)) * .5;
            const icon = escapeRgb(c.icon || 'mdi:lightbulb-outline');
            this.shadowRoot.innerHTML = `
  <style>
   :host{display:block;width:100%;color:var(--primary-text-color,#f3f3f5);font-family:var(--paper-font-body1_-_font-family,Arial,sans-serif)}
   *{box-sizing:border-box}button,input{font:inherit}button{-webkit-tap-highlight-color:transparent}
   [hidden]{display:none!important}
   .card{--wheel-size:360px;--card-padding:clamp(20px,4.7vw,38px);--header-gap:clamp(20px,3vw,30px);--icon-size:clamp(42px,18vw,96px);--preset-size:42px;--section-gap:28px;width:100%;padding:var(--card-padding);border:1px solid #ffffff1a;border-radius:28px;background:radial-gradient(ellipse at 48% 0,#22252a 0,#15171a 62%,#101214 100%);box-shadow:inset 0 1px 1px #ffffff0f,0 12px 30px #0003}
   .card.compact{--wheel-size:290px;--card-padding:clamp(16px,3vw,24px);--header-gap:16px;--icon-size:clamp(38px,13vw,72px);--preset-size:34px;--section-gap:18px;border-radius:25px}
   /* Nur die äußere Kontur entfernen, Innenbedienung unverändert lassen. */
   .card.no-border{border-color:transparent;box-shadow:0 12px 30px #0003}
   .header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:var(--header-gap)}
   .header:has(>.titles[hidden]){justify-content:flex-end}
   .titles{min-width:0}.title{color:#9295a0;font-size:clamp(11px,2.1vw,15px);font-weight:700;letter-spacing:.12em;text-transform:uppercase;overflow-wrap:anywhere}
   .subtitle{margin:7px 0 0;font-size:var(--subtitle-font);font-weight:700;line-height:1.08;overflow-wrap:anywhere}
   .header-action{position:relative;display:grid;flex:none;place-items:center;width:var(--header-action-size);aspect-ratio:1;padding:0;border:2px solid #303239;border-radius:50%;background:linear-gradient(145deg,#272a30,#17191d);color:#ff8b2b;box-shadow:0 6px 15px #0004,inset 0 1px 0 #ffffff0d;cursor:pointer}
   .header-action.active{border-color:#ff8b2b;color:#ff9b4a;box-shadow:inset 0 0 20px #ff8b2b1f,0 0 0 1px #ff8b2b33,0 6px 15px #0004}
   .header-action.inactive{color:#85878b;border-color:#45474b}.header-action:disabled{opacity:.45;cursor:default}
   .header-action ha-icon{display:block;width:var(--header-icon-size);height:var(--header-icon-size);--mdc-icon-size:var(--header-icon-size)}
   .action-state{position:absolute;bottom:11%;font-size:clamp(5px,calc(var(--header-action-size)*.15),13px);line-height:1}
   .color-control{--light-color:color-mix(in srgb,color-mix(in srgb,hsl(var(--hue,0) 100% 50%) var(--saturation,100%),white) var(--light-level,100%),black);position:relative;width:min(100%,var(--wheel-size));aspect-ratio:1;margin:0 auto}
   .controls.is-off .wheel,.controls.is-off .brightness,.controls.is-off .preset{filter:grayscale(1) brightness(.65)}.controls.is-off .brightness-control{display:none}
   .turn-on{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;width:100%;height:100%;padding:0;border:0;border-radius:50%;background:transparent;color:#85878b;cursor:pointer}
   .turn-on ha-icon{display:block;width:var(--icon-size);height:var(--icon-size);--mdc-icon-size:var(--icon-size)}.turn-on-label{font-size:13px}
   .wheel{position:absolute;inset:0;border-radius:50%;background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red);touch-action:none;cursor:pointer}
   .wheel::before{content:'';position:absolute;inset:9%;border-radius:50%;background:#15171a;pointer-events:none}
   .wheel-marker{position:absolute;inset:0;pointer-events:none;transform:rotate(calc(var(--hue)*1deg))}
   .wheel-marker::after{content:'';position:absolute;width:10%;aspect-ratio:1;top:-2px;left:45%;border:2px solid #ddd;border-radius:50%;background:hsl(var(--hue) 100% 50%)}
   .turn-off{position:absolute;inset:18%;z-index:1;display:grid;place-items:center;padding:0;border:clamp(4px,1.3vw,8px) solid var(--light-color);border-radius:50%;background:#15171a;color:var(--light-color);cursor:pointer}
   .turn-off ha-icon{display:block;width:var(--icon-size);height:var(--icon-size);transform:translateY(-25%);--mdc-icon-size:var(--icon-size)}
   .brightness-control{position:absolute;z-index:2;top:60%;left:27%;width:46%;display:flex;flex-direction:column;align-items:center;gap:3px;color:#a0a2ad;font-size:12px}
   .brightness{width:100%;min-width:0;margin:0;accent-color:color-mix(in srgb,hsl(var(--hue,0) 100% 50%) var(--saturation,100%),white);cursor:pointer}
   .presets{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin:var(--section-gap) auto 0;max-width:var(--wheel-size);justify-items:center}
   .preset{width:min(100%,var(--preset-size));aspect-ratio:1;padding:0;border:2px solid transparent;border-radius:50%;background:var(--swatch);cursor:pointer}
   .preset[aria-pressed=true]{outline:2px solid white;outline-offset:3px}
   .temperature{display:flex;align-items:center;gap:10px;max-width:var(--wheel-size);margin:var(--section-gap) auto 0;color:#a0a2ad;font-size:13px}
   .temperature input{flex:1;min-width:0;accent-color:#f1f1f1;cursor:pointer}.unavailable{color:var(--secondary-text-color,#a0a2ad);font-size:14px}
   button:focus-visible,.wheel:focus-visible,input:focus-visible{outline:2px solid #eee;outline-offset:3px}
   @media(max-width:380px){.card{--card-padding:18px}.card.compact{--card-padding:14px}.presets{gap:6px}}
  </style>
  <article class="card ${c.compact !== false ? 'compact' : ''} ${c.show_card_border === false ? 'no-border' : ''}" style="--subtitle-font:clamp(${22 * titleScale}px,${4.8 * titleScale}vw,${38 * titleScale}px);--header-action-size:clamp(${56 * menuScale * (c.compact !== false ? .88 : 1)}px,${11 * menuScale}vw,${88 * menuScale * (c.compact !== false ? .88 : 1)}px);--header-icon-size:calc((var(--header-action-size) - 16px)*.46)">
   <header class="header"><div class="titles">${String(c.title ?? '').trim() ? `<div class="title">${escapeRgb(String(c.title).trim())}</div>` : ''}<h2 class="subtitle" hidden></h2></div><button type="button" class="header-action" aria-label="Licht ein- oder ausschalten" title="Licht ein- oder ausschalten"><ha-icon icon="${icon}"></ha-icon><span class="action-state"></span></button></header>
   <p class="unavailable" hidden></p>
   <div class="controls" hidden><div class="color-control"><div class="wheel" role="slider" tabindex="0" aria-label="Farbton" aria-valuemin="0" aria-valuemax="359" aria-valuenow="0"><span class="wheel-marker"></span></div><button type="button" class="turn-off" aria-label="Licht ausschalten" title="Licht ausschalten" hidden><ha-icon icon="${icon}" aria-hidden="true"></ha-icon></button><button type="button" class="turn-on" aria-label="Licht einschalten" title="Licht einschalten" hidden><ha-icon icon="${icon}"></ha-icon>${String(c.turn_on_text ?? 'RGB').trim() ? `<span class="turn-on-label">${escapeRgb(String(c.turn_on_text).trim())}</span>` : ''}</button><div class="brightness-control"><input class="brightness" type="range" min="0" max="100" aria-label="Helligkeit"><span class="brightness-number">0 %</span></div></div>
   ${c.show_presets && this._presets.length ? `<div class="presets">${this._presets.map(p => `<button class="preset" type="button" title="Farb-Preset ${p.slot}" aria-label="Farb-Preset ${p.slot}" aria-pressed="false"></button>`).join('')}</div>` : ''}
   <div class="temperature" hidden><span>Warm</span><input type="range" aria-label="Farbtemperatur" step="50"><span>Kalt</span></div></div>
  </article>`;
            const q = selector => this.shadowRoot.querySelector(selector);
            ['.header-action', '.turn-on', '.turn-off'].forEach(selector => q(selector).addEventListener('click', () => this._toggleLight()));
            const wheel = q('.wheel');
            wheel.addEventListener('pointerdown', e => { if (e.button !== 0 || this._state()?.state !== 'on' || !this._available())
                return; e.preventDefault(); this._dragging = true; wheel.setPointerCapture(e.pointerId); this._setHue(e); });
            wheel.addEventListener('pointermove', e => { if (this._dragging && wheel.hasPointerCapture(e.pointerId))
                this._setHue(e); });
            wheel.addEventListener('pointerup', e => { if (!this._dragging || !wheel.hasPointerCapture(e.pointerId))
                return; this._setHue(e); this._dragging = false; wheel.releasePointerCapture(e.pointerId); this._sendColor(); });
            const cancel = () => { if (this._dragging) {
                this._dragging = false;
                this._sync();
            } };
            wheel.addEventListener('pointercancel', cancel);
            wheel.addEventListener('lostpointercapture', cancel);
            wheel.addEventListener('keydown', e => { if (this._state()?.state !== 'on' || !['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'].includes(e.key))
                return; e.preventDefault(); this._hue = (Math.round(this._hue) + (['ArrowLeft', 'ArrowDown'].includes(e.key) ? 355 : 5)) % 360; this._saturation = 100; this._temperatureValue = null; this._selected = -1; this._updateView(); this._sendColor(); });
            const brightness = q('.brightness');
            brightness.addEventListener('input', () => { this._dragging = true; this._brightness = Number(brightness.value); this._updateView(); });
            brightness.addEventListener('change', () => { this._dragging = false; this._brightness = Number(brightness.value); this._sendBrightness(); });
            brightness.addEventListener('blur', cancel);
            this.shadowRoot.querySelectorAll('.preset').forEach((button, i) => button.addEventListener('click', () => this._selectPreset(i)));
            const temperature = q('.temperature input');
            temperature.addEventListener('input', () => { this._dragging = true; });
            temperature.addEventListener('change', () => { this._dragging = false; this._temperatureValue = Number(temperature.value); this._selected = -1; this._updateView(); this._call('turn_on', { color_temp_kelvin: this._temperatureValue }); });
            temperature.addEventListener('blur', cancel);
        }
    }
    if (!customElements.get('glass-rgb-card'))
        customElements.define('glass-rgb-card', GlassRgbCard);
    window.customCards = window.customCards || [];
    const metadata = { type: 'glass-rgb-card', name: 'Glass RGB Card', description: 'Kompakte RGB-Lichtsteuerung mit optionalem Kartenrahmen und Farb-Presets.', preview: true, version: RGB_CARD_VERSION };
    const existing = window.customCards.find(card => card.type === metadata.type);
    if (existing)
        Object.assign(existing, metadata);
    else
        window.customCards.push(metadata);
})();

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
        if (config.entity && !config.entity.startsWith("sensor."))
            throw new Error("Bitte eine Sensor-Entität auswählen.");
        const image = String(config.image || "").trim();
        if (image && !/^(?:https?:\/\/|\/[^/]|\.\.?\/)/i.test(image))
            throw new Error("Bitte einen lokalen Bildpfad oder eine HTTP(S)-Bild-URL angeben.");
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
        if (!this._config)
            return;
        const output = this.shadowRoot.querySelector(".sensor-value");
        if (!output)
            return;
        const state = this._hass?.states?.[this._config.entity];
        let value = "";
        if (this._config.entity) {
            if (!state || state.state === "unavailable")
                value = "Sensor nicht verfügbar";
            else if (state.state === "unknown")
                value = "Unbekannt";
            else
                value = `${state.state}${state.attributes?.unit_of_measurement ? ` ${state.attributes.unit_of_measurement}` : ""}`;
        }
        if (output.textContent !== value)
            output.textContent = value;
    }
    _openSensor() {
        if (!this._config?.entity)
            return;
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
if (!customElements.get("glass-room-card"))
    customElements.define("glass-room-card", GlassRoomCard);
if (!customElements.get("glass-room-card-editor"))
    customElements.define("glass-room-card-editor", GlassRoomCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "glass-room-card"))
    window.customCards.push({ type: "glass-room-card", name: "Glass Room Card", description: "Raumfoto mit optionalem Sensorwert.", preview: true, version: ROOM_CARD_VERSION });

})();

(() => {
function glassRoundButtonStyles(selector) {
    return `
    ${selector} { border:var(--glass-button-border-width,2px) solid color-mix(in srgb,var(--accent) 78%,#414348); border-radius:50%; background:linear-gradient(145deg,#222428,#131518); color:var(--accent); box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 8px 18px rgba(0,0,0,.28); transition:border-color .18s ease,color .18s ease,background .18s ease,box-shadow .18s ease,transform .18s ease; cursor:pointer; -webkit-tap-highlight-color:transparent; }
    ${selector}:hover { transform:translateY(-2px); border-color:var(--accent); }
    ${selector}.active { border-color:var(--accent); background:radial-gradient(circle at 50% 45%,color-mix(in srgb,var(--accent) 24%,#1c1b19),#1c1b19 72%); box-shadow:inset 0 0 24px color-mix(in srgb,var(--accent) 18%,transparent),0 0 0 var(--glass-button-ring-width,1px) color-mix(in srgb,var(--accent) 35%,transparent),0 8px 22px rgba(0,0,0,.3); }
    ${selector}.inactive { color:#85878b; border-color:#45474b; }
    ${selector}.inactive:hover { border-color:#77797d; }
    ${selector}:focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
  `;
}

/* Glass Navigation Card — standalone JavaScript */
(() => {
    "use strict";
    const VERSION = "1.2.0";
    const COLORS = { orange: "#ff8b2b", white: "#f2f2f4", gray: "#a0a2a6", green: "#4bc785", red: "#f05c5c" };
    const POSITIONS = [
        { value: "top", label: "Oben (horizontal)" },
        { value: "bottom", label: "Unten (horizontal)" },
        { value: "left", label: "Links (vertikal)" },
        { value: "right", label: "Rechts (vertikal)" }
    ];
    const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const clone = value => JSON.parse(JSON.stringify(value));
    const group = item => Array.isArray(item?.children) && item.children.length > 0;
    const label = item => item.label == null ? item.name : item.label.trim();
    const matches = item => typeof item?.url === "string" && item.url.trim().startsWith("/") && location.pathname === item.url.trim().split(/[?#]/)[0];
    const branchMatches = item => matches(item) || (group(item) && item.children.some(branchMatches));
    const STYLE = `
    :host{display:block;font-family:var(--paper-font-body1_-_font-family,Arial,sans-serif);--gn-text:#f2f2f4;--gn-muted:#96999e}
    *,*::before,*::after{box-sizing:border-box}
    button{font:inherit;color:inherit;-webkit-tap-highlight-color:transparent}
    .shell{position:fixed;z-index:20;color:var(--gn-text);isolation:isolate}
    .position-top,.position-bottom{left:50%;width:max-content;max-width:calc(100vw - 28px);transform:translateX(-50%) scale(var(--nav-scale))}
    .position-top{top:max(12px,env(safe-area-inset-top));transform-origin:50% 0}
    .position-bottom{bottom:calc(env(safe-area-inset-bottom) + 12px);transform-origin:50% 100%}
    .position-left,.position-right{top:50%;width:max-content;max-width:calc(100vw - 24px);transform:translateY(-50%) scale(var(--nav-scale))}
    .position-left{left:max(12px,env(safe-area-inset-left));transform-origin:0 50%}
    .position-right{right:max(12px,env(safe-area-inset-right));transform-origin:100% 50%}
    .bar{display:flex;align-items:center;justify-content:center;gap:10px;width:max-content;max-width:100%;padding:10px 16px;border:1px solid #ffffff13;border-radius:999px;background:radial-gradient(ellipse at 25% 0%,#ffffff0c,transparent 65%),linear-gradient(145deg,rgba(23,25,24,.95),rgba(9,12,11,.97));box-shadow:0 18px 48px #0008,inset 0 1px 1px #ffffff17,inset 0 -1px 1px #ffffff06;-webkit-backdrop-filter:blur(24px) saturate(125%);backdrop-filter:blur(24px) saturate(125%)}
    .nav-item{appearance:none;position:relative;cursor:pointer;transition:color .18s,background .18s,border-color .18s,box-shadow .18s,transform .18s}
    .bar .nav-item{display:grid;place-items:center;flex:0 1 64px;width:64px;height:auto;min-width:34px;min-height:44px;aspect-ratio:1;padding:0;margin:0;border:1px solid transparent;border-radius:26px;background:transparent;box-shadow:none;color:var(--gn-text)}
    .bar .nav-item>ha-icon{display:block;width:31px;height:31px;--mdc-icon-size:31px}
    .bar .nav-item>span:not(.chevron){display:none}
    .bar .nav-item.active{border-color:color-mix(in srgb,var(--nav-color) 43%,transparent);background:radial-gradient(ellipse at 30% 12%,color-mix(in srgb,var(--nav-color) 23%,transparent),transparent 66%),linear-gradient(145deg,color-mix(in srgb,var(--nav-color) 17%,#171511),color-mix(in srgb,var(--nav-color) 7%,#10110e));color:var(--nav-color);box-shadow:inset 0 1px 2px #ffffff29,inset 0 0 14px color-mix(in srgb,var(--nav-color) 10%,transparent),0 0 22px color-mix(in srgb,var(--nav-color) 10%,transparent)}
    .bar .active>ha-icon{filter:drop-shadow(0 0 5px color-mix(in srgb,var(--nav-color) 35%,transparent))}
    .no-button-borders .bar .nav-item.active{border-color:transparent}
    .chevron{position:absolute;display:grid;place-items:center;opacity:.5}
    .bar .chevron{top:6px;right:5px;width:14px;height:14px}
    .chevron ha-icon{display:block;width:12px;height:12px;--mdc-icon-size:12px}
    .nav-separator{flex:none;width:1px;height:30px;margin:0 3px;background:linear-gradient(transparent,#ffffff29,transparent)}
    .submenu{position:absolute;width:min(470px,calc((100vw - 32px) / max(1,var(--nav-scale))));max-height:min(calc(70dvh / max(1,var(--nav-scale))),620px);padding:24px;overflow:auto;overscroll-behavior:contain;border:1px solid #ffffff16;border-radius:30px;background:radial-gradient(ellipse at 0% 0%,#ffffff0a,transparent 52%),radial-gradient(ellipse at 100% 100%,color-mix(in srgb,var(--nav-color) 3%,transparent),transparent 55%),linear-gradient(145deg,rgba(23,25,24,.97),rgba(10,13,12,.98));color:var(--gn-text);box-shadow:0 24px 70px #0009,inset 0 1px 1px #ffffff17;-webkit-backdrop-filter:blur(30px) saturate(120%);backdrop-filter:blur(30px) saturate(120%);scrollbar-width:thin;scrollbar-color:#ffffff29 transparent;animation:gn-appear .16s ease-out}
    .position-bottom .submenu{bottom:calc(100% + 18px);left:50%;transform:translateX(-50%)}
    .position-top .submenu{top:calc(100% + 18px);left:50%;transform:translateX(-50%)}
    .position-left .submenu{top:50%;left:calc(100% + 18px);transform:translateY(-50%)}
    .position-right .submenu{top:50%;right:calc(100% + 18px);transform:translateY(-50%)}
    .submenu-header{display:flex;align-items:center;gap:10px;margin:0 0 20px;padding:0 2px}
    .submenu-header h2{flex:1;min-width:0;margin:0;font-size:22px;font-weight:650;line-height:1.25;letter-spacing:-.5px;overflow-wrap:anywhere}
    .menu-back,.menu-close{display:grid;place-items:center;flex:none;width:32px;height:32px;padding:0;border:1px solid #ffffff0d;border-radius:12px;background:#ffffff08;color:var(--gn-muted);cursor:pointer}
    .menu-back ha-icon,.menu-close ha-icon{width:18px;height:18px;--mdc-icon-size:18px}
    .menu-segments{display:flex;gap:5px;width:100%;margin:0 0 18px;padding:5px;border:1px solid #ffffff0b;border-radius:19px;background:#ffffff09}
    .segment{flex:1 1 0;min-width:0;min-height:40px;padding:9px 10px;border:1px solid transparent;border-radius:14px;background:transparent;color:var(--gn-muted);font-size:14px;font-weight:600;line-height:1.25;overflow-wrap:anywhere;cursor:pointer;transition:color .18s,background .18s,border-color .18s}
    .segment.selected{border-color:color-mix(in srgb,var(--nav-color) 28%,transparent);background:linear-gradient(145deg,color-mix(in srgb,var(--nav-color) 14%,#20211d),color-mix(in srgb,var(--nav-color) 6%,#141713));color:var(--nav-color);box-shadow:inset 0 1px 1px #ffffff12,0 3px 12px #0003}
    .submenu-items{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:minmax(112px,auto);align-items:stretch;gap:10px}
    .submenu-items .nav-item{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;width:100%;min-width:0;min-height:112px;padding:18px 8px 14px;border:1px solid #ffffff11;border-radius:23px;background:linear-gradient(145deg,#ffffff09,#ffffff02);color:#e7e8e9;box-shadow:inset 0 1px 0 #ffffff06}
    .submenu-items .nav-item>ha-icon{display:block;flex:none;width:34px;height:34px;--mdc-icon-size:34px}
    .submenu-items .nav-item>span:not(.chevron){display:block;max-width:100%;color:#c3c6c8;font-size:13px;font-weight:500;line-height:1.25;text-align:center;overflow-wrap:anywhere}
    .submenu-items .nav-item.active{border-color:color-mix(in srgb,var(--nav-color) 42%,transparent);background:radial-gradient(ellipse at 30% 0%,color-mix(in srgb,var(--nav-color) 17%,transparent),transparent 75%),linear-gradient(145deg,color-mix(in srgb,var(--nav-color) 10%,#1a1b17),#121511);color:var(--nav-color);box-shadow:inset 0 1px 1px #ffffff17,0 0 20px color-mix(in srgb,var(--nav-color) 7%,transparent)}
    .submenu-items .active>ha-icon{filter:drop-shadow(0 0 6px color-mix(in srgb,var(--nav-color) 28%,transparent))}
    .submenu-items .active>span:not(.chevron){color:var(--gn-text)}
    .submenu-items .chevron{top:10px;right:10px;width:14px;height:14px;color:var(--gn-muted)}
    button:focus-visible{outline:2px solid var(--nav-color);outline-offset:4px}
    .position-left .bar,.position-right .bar{flex-direction:column;width:86px;max-height:80dvh;padding:10px;overflow:auto}
    .position-left .bar .nav-item,.position-right .bar .nav-item{flex:0 0 64px;width:64px;height:64px}
    .position-left .nav-separator,.position-right .nav-separator{width:30px;height:1px;margin:3px 0;background:linear-gradient(90deg,transparent,#ffffff29,transparent)}
    .position-left .submenu,.position-right .submenu{width:min(440px,calc((100vw - 140px) / max(1,var(--nav-scale))))}
    .position-left .submenu-items,.position-right .submenu-items{grid-template-columns:repeat(2,minmax(0,1fr))}
    @media(hover:hover){.bar .nav-item:not(.active):hover{background:#ffffff0b;color:white}.submenu-items .nav-item:not(.active):hover{transform:translateY(-2px);border-color:#ffffff24;background:#ffffff0e}.segment:not(.selected):hover{background:#ffffff0b;color:var(--gn-text)}}
    .nav-item:active{transform:scale(.96)}
    @media(max-width:520px){
      .position-top,.position-bottom{max-width:calc(100vw - 20px)}
      .bar{gap:4px;padding:8px 10px}
      .bar .nav-item{flex:0 1 54px;width:54px;min-width:30px;border-radius:21px}
      .bar .nav-item>ha-icon{width:27px;height:27px;--mdc-icon-size:27px}
      .bar .chevron{top:4px;right:3px;width:12px;height:12px}
      .bar .chevron ha-icon{width:10px;height:10px;--mdc-icon-size:10px}
      .nav-separator{height:24px;margin:0 2px}
      .submenu{width:min(420px,calc((100vw - 24px) / max(1,var(--nav-scale))));max-height:calc(65dvh / max(1,var(--nav-scale)));padding:20px 16px 16px;border-radius:27px}
      .position-bottom .submenu{bottom:calc(100% + 14px)}.position-top .submenu{top:calc(100% + 14px)}
      .submenu-header{margin-bottom:16px}.submenu-header h2{font-size:21px}
      .menu-segments{margin-bottom:14px;padding:4px;border-radius:17px}.segment{min-height:38px;padding:8px 6px;border-radius:13px;font-size:13px}
      .submenu-items{grid-auto-rows:minmax(96px,auto);gap:8px}.submenu-items .nav-item{min-height:96px;gap:10px;padding:15px 6px 12px;border-radius:20px}
      .submenu-items .nav-item>ha-icon{width:29px;height:29px;--mdc-icon-size:29px}.submenu-items .nav-item>span:not(.chevron){font-size:12px}
      .position-left .bar,.position-right .bar{width:72px;padding:8px}.position-left .bar .nav-item,.position-right .bar .nav-item{flex:0 0 54px;width:54px;height:54px}
      .position-left .submenu,.position-right .submenu{width:min(360px,calc((100vw - 126px) / max(1,var(--nav-scale))))}
    }
    @keyframes gn-appear{from{opacity:0}to{opacity:1}}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
  `;
    class GlassNavigationCard extends HTMLElement {
        constructor() {
            super();
            this.attachShadow({ mode: "open" });
            this._config = null;
            this._hass = null;
            this._menuRootIndex = null;
            this._menuPath = [];
            this._onPointer = event => {
                if (this._menuRootIndex !== null && !event.composedPath().includes(this))
                    this._closeMenu(false);
            };
            this._onKey = event => {
                if (event.key === "Escape" && this._menuRootIndex !== null) {
                    event.preventDefault();
                    this._closeMenu(true);
                }
            };
            this._onLocation = () => {
                this._menuRootIndex = null;
                this._menuPath = [];
                this._render();
            };
        }
        connectedCallback() {
            document.addEventListener("pointerdown", this._onPointer, true);
            document.addEventListener("keydown", this._onKey);
            window.addEventListener("location-changed", this._onLocation);
            window.addEventListener("popstate", this._onLocation);
            this._render();
        }
        disconnectedCallback() {
            document.removeEventListener("pointerdown", this._onPointer, true);
            document.removeEventListener("keydown", this._onKey);
            window.removeEventListener("location-changed", this._onLocation);
            window.removeEventListener("popstate", this._onLocation);
        }
        set hass(value) { this._hass = value; }
        get hass() { return this._hass; }
        static getStubConfig() {
            return {
                position: "bottom", scale: 100, color: "orange", show_button_borders: true,
                items: [
                    { name: "Home", icon: "mdi:home-outline", url: "/lovelace/home" },
                    { name: "Räume", icon: "mdi:sofa-outline", menu_title: "Räume", children: [
                            { name: "Erdgeschoss", label: "EG", icon: "mdi:home-floor-0", default: true, children: [
                                    { name: "Wohnzimmer", icon: "mdi:sofa-outline", url: "/lovelace/wohnzimmer" },
                                    { name: "Küche", icon: "mdi:pot-steam", url: "/lovelace/kueche" },
                                    { name: "Esszimmer", icon: "mdi:table-chair", url: "/lovelace/esszimmer" }
                                ] },
                            { name: "Obergeschoss", label: "OG", icon: "mdi:home-floor-1", children: [
                                    { name: "Schlafzimmer", icon: "mdi:bed-king-outline", url: "/lovelace/schlafzimmer" },
                                    { name: "Bad", icon: "mdi:bathtub-outline", url: "/lovelace/bad" }
                                ] }
                        ] },
                    { name: "Übersicht", icon: "mdi:view-dashboard", url: "/lovelace/uebersicht" },
                    { name: "Favoriten", icon: "mdi:heart-outline", url: "/lovelace/favoriten" },
                    { name: "Einstellungen", icon: "mdi:tune-variant", url: "/lovelace/einstellungen" }
                ]
            };
        }
        static getConfigForm() {
            return {
                schema: [
                    { name: "items", required: true, selector: { object: { multiple: true } } },
                    { name: "color", selector: { select: { mode: "dropdown", options: Object.keys(COLORS).map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) })) } } },
                    { name: "position", selector: { select: { mode: "dropdown", options: POSITIONS } } },
                    { name: "scale", selector: { number: { min: 70, max: 140, step: 5, mode: "slider", unit_of_measurement: "%" } } },
                    { name: "show_button_borders", selector: { boolean: {} } },
                    { name: "active", selector: { text: {} } }
                ],
                computeLabel: field => ({ items: "Menüpunkte", color: "Akzentfarbe", position: "Position der Navigation", scale: "Navigation skalieren", show_button_borders: "Rahmen des aktiven Hauptbuttons", active: "Aktiver Hauptpunkt (optional)" })[field.name] || field.name
            };
        }
        static getConfigElement() { return document.createElement("glass-navigation-card-editor"); }
        setConfig(config) {
            const next = { color: "orange", position: "bottom", scale: 100, active: "", show_button_borders: true, ...clone(config || {}) };
            if (!Array.isArray(next.items) || !next.items.length || next.items.every(item => item?.type === "separator"))
                throw new Error("Bitte mindestens einen Navigationspunkt konfigurieren.");
            if (!Object.hasOwn(COLORS, next.color))
                throw new Error("Nicht unterstützte Navigationsfarbe.");
            if (!POSITIONS.some(p => p.value === next.position))
                throw new Error("Ungültige Position der Navigationsleiste.");
            const scale = Number(next.scale);
            next.scale = Number.isFinite(scale) ? Math.min(140, Math.max(70, scale)) : 100;
            this._validateItems(next.items);
            this._config = next;
            this._menuRootIndex = null;
            this._menuPath = [];
            this._render();
        }
        getCardSize() { return 1; }
        _validateItems(items, depth = 0) {
            if (depth > 8)
                throw new Error("Navigationsmenüs dürfen höchstens acht Unterebenen tief sein.");
            let defaults = 0;
            for (const item of items) {
                if (!item || typeof item !== "object" || Array.isArray(item))
                    throw new Error("Jeder Navigationspunkt muss ein Objekt sein.");
                if (item.type === "separator") {
                    if (depth !== 0)
                        throw new Error("Trenner sind nur in der Hauptnavigation erlaubt.");
                    continue;
                }
                if (item.default === true)
                    defaults++;
                if (typeof item.name !== "string" || !item.name.trim())
                    throw new Error("Jeder Navigationspunkt benötigt einen Namen.");
                if (typeof item.icon !== "string" || !item.icon.trim())
                    throw new Error(`Bitte ein Icon für '${item.name}' angeben.`);
                for (const field of ["label", "menu_title"])
                    if (item[field] != null && typeof item[field] !== "string")
                        throw new Error(`'${field}' für '${item.name}' muss Text sein.`);
                if (item.children != null && !Array.isArray(item.children))
                    throw new Error(`'children' für '${item.name}' muss eine Liste sein.`);
                if (group(item)) {
                    if (item.url)
                        throw new Error(`'${item.name}' darf entweder eine URL oder Unterpunkte haben.`);
                    this._validateItems(item.children, depth + 1);
                }
                else if (typeof item.url !== "string" || !/^(?:\/(?!\/)|https?:\/\/)/i.test(item.url.trim()) || /[\u0000-\u0020\\]/.test(item.url.trim())) {
                    throw new Error(`'${item.name}' benötigt eine interne URL oder HTTP(S)-URL ohne Leerzeichen.`);
                }
            }
            if (defaults > 1)
                throw new Error("Pro Menüebene darf nur ein Punkt Standard sein.");
        }
        _menuModel() {
            let items = this._config?.items[this._menuRootIndex]?.children || [];
            let level = 0;
            const segments = [];
            while (items.length) {
                if (items.every(group)) {
                    const matched = items.findIndex(branchMatches);
                    const fallback = matched >= 0 ? matched : Math.max(0, items.findIndex(item => item.default));
                    const selectedIndex = Math.min(this._menuPath[level] ?? fallback, items.length - 1);
                    segments.push({ items, selectedIndex, level });
                    items = items[selectedIndex].children;
                    level++;
                }
                else if (level < this._menuPath.length && group(items[this._menuPath[level]])) {
                    items = items[this._menuPath[level]].children;
                    level++;
                }
                else
                    break;
            }
            return { items, segments, level };
        }
        _visibleItems() { return this._menuModel().items; }
        _menuTitle() {
            const root = this._config.items[this._menuRootIndex];
            return root?.menu_title?.trim() || `${root?.name || "Menü"} wählen`;
        }
        _itemMarkup(item, index, root = false) {
            if (root && item.type === "separator")
                return `<span class="nav-separator" role="separator" aria-orientation="${["left", "right"].includes(this._config.position) ? "horizontal" : "vertical"}"></span>`;
            const siblings = root ? this._config.items : this._visibleItems();
            const hasMatch = siblings.some(branchMatches);
            const explicit = root && this._config.active;
            const active = root && this._menuRootIndex === index || (explicit ? explicit === item.name : branchMatches(item) || (!hasMatch && item.default === true));
            const nested = group(item);
            const arrow = root ? ({ top: "mdi:chevron-down", bottom: "mdi:chevron-up", left: "mdi:chevron-right", right: "mdi:chevron-left" })[this._config.position] : "mdi:chevron-right";
            return `<button type="button" class="nav-item ${active ? "active" : "inactive"}" data-${root ? "root" : "child"}-index="${index}" aria-label="${esc(item.name)}" title="${esc(item.name)}" ${nested ? `aria-expanded="${root && this._menuRootIndex === index}"` : active ? 'aria-current="page"' : ""}><ha-icon icon="${esc(item.icon)}"></ha-icon>${label(item) ? `<span>${esc(label(item))}</span>` : ""}${nested ? `<span class="chevron" aria-hidden="true"><ha-icon icon="${arrow}"></ha-icon></span>` : ""}</button>`;
        }
        _closeMenu(restoreFocus = false) {
            const index = this._menuRootIndex;
            this._menuRootIndex = null;
            this._menuPath = [];
            this._render();
            if (restoreFocus && index !== null)
                this.shadowRoot.querySelector(`[data-root-index="${index}"]`)?.focus();
        }
        _navigate(url) {
            if (/^https?:\/\//i.test(url)) {
                window.location.assign(url);
                return;
            }
            window.history.pushState(null, "", url);
            this._menuRootIndex = null;
            this._menuPath = [];
            window.dispatchEvent(new Event("location-changed"));
            this._render();
        }
        _bindEvents() {
            this.shadowRoot.querySelectorAll("[data-root-index]").forEach(button => button.addEventListener("click", () => {
                const index = Number(button.dataset.rootIndex);
                const item = this._config.items[index];
                if (!group(item))
                    return this._navigate(item.url.trim());
                this._menuRootIndex = this._menuRootIndex === index ? null : index;
                this._menuPath = [];
                this._render();
                this.shadowRoot.querySelector(`[data-root-index="${index}"]`)?.focus();
            }));
            this.shadowRoot.querySelectorAll("[data-child-index]").forEach(button => button.addEventListener("click", () => {
                const index = Number(button.dataset.childIndex);
                const item = this._visibleItems()[index];
                if (!group(item))
                    return this._navigate(item.url.trim());
                const model = this._menuModel();
                const resolved = this._menuPath.slice(0, model.level);
                model.segments.forEach(segment => { resolved[segment.level] = segment.selectedIndex; });
                this._menuPath = [...resolved, index];
                this._render();
                this.shadowRoot.querySelector("[data-menu-back]")?.focus();
            }));
            this.shadowRoot.querySelectorAll("[data-segment-level]").forEach(button => button.addEventListener("click", () => {
                const level = Number(button.dataset.segmentLevel);
                const resolved = this._menuPath.slice(0, level);
                this._menuModel().segments.filter(segment => segment.level < level).forEach(segment => { resolved[segment.level] = segment.selectedIndex; });
                this._menuPath = [...resolved, Number(button.dataset.segmentIndex)];
                this._render();
                this.shadowRoot.querySelector(`[data-segment-level="${level}"][data-segment-index="${button.dataset.segmentIndex}"]`)?.focus();
            }));
            this.shadowRoot.querySelector("[data-menu-close]")?.addEventListener("click", () => this._closeMenu(true));
            this.shadowRoot.querySelector("[data-menu-back]")?.addEventListener("click", () => {
                this._menuPath.pop();
                this._render();
                (this.shadowRoot.querySelector("[data-menu-back]") || this.shadowRoot.querySelector("[data-menu-close]"))?.focus();
            });
        }
        _render() {
            if (!this._config)
                return;
            const config = this._config;
            const model = this._menuRootIndex === null ? { items: [], segments: [] } : this._menuModel();
            const segments = model.segments.map(segment => `<div class="menu-segments" role="group" aria-label="Ebene ${segment.level + 1}">${segment.items.map((item, index) => `<button type="button" class="segment ${index === segment.selectedIndex ? "selected" : ""}" aria-pressed="${index === segment.selectedIndex}" data-segment-level="${segment.level}" data-segment-index="${index}">${esc(label(item) || item.name)}</button>`).join("")}</div>`).join("");
            const menu = this._menuRootIndex === null ? "" : `<section class="submenu" aria-label="${esc(this._menuTitle())}"><header class="submenu-header">${this._menuPath.length ? '<button type="button" class="menu-back" data-menu-back aria-label="Zurück"><ha-icon icon="mdi:chevron-left"></ha-icon></button>' : ""}<h2>${esc(this._menuTitle())}</h2><button type="button" class="menu-close" data-menu-close aria-label="Menü schließen"><ha-icon icon="mdi:close"></ha-icon></button></header>${segments}<div class="submenu-items">${model.items.map((item, index) => this._itemMarkup(item, index)).join("")}</div></section>`;
            this.shadowRoot.innerHTML = `<style>${STYLE}</style><div class="shell position-${config.position} ${config.show_button_borders ? "" : "no-button-borders"}" style="--nav-color:${COLORS[config.color]};--nav-scale:${config.scale / 100}">${menu}<nav class="bar" aria-label="Hauptnavigation">${config.items.map((item, index) => this._itemMarkup(item, index, true)).join("")}</nav></div>`;
            this._bindEvents();
        }
    }
    class GlassNavigationCardEditor extends HTMLElement {
        constructor() {
            super();
            this.attachShadow({ mode: "open" });
            this._config = GlassNavigationCard.getStubConfig();
            this._editing = false;
            this._hass = null;
            this.shadowRoot.addEventListener("click", event => this._handleClick(event));
            this.shadowRoot.addEventListener("input", event => this._handleInput(event));
            this.shadowRoot.addEventListener("change", event => this._handleInput(event));
            this._render();
        }
        setConfig(config) {
            this._config = { ...GlassNavigationCard.getStubConfig(), ...clone(config || {}) };
            if (!Array.isArray(this._config.items))
                this._config.items = GlassNavigationCard.getStubConfig().items;
            this._render();
        }
        set hass(value) {
            this._hass = value;
            const form = this.shadowRoot.querySelector("ha-form");
            if (form)
                form.hass = value;
        }
        _emitConfig() {
            this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config: clone(this._config) } }));
        }
        _parts(path) { return path ? path.split(".").map(Number) : []; }
        _getList(path) {
            let items = this._config.items;
            for (const index of this._parts(path))
                items = items[index]?.children || [];
            return items;
        }
        _getItem(path) {
            const parts = this._parts(path);
            const index = parts.pop();
            return this._getList(parts.join("."))[index];
        }
        _addButtons(path, root) {
            return `<div class="add-actions"><button type="button" data-action="add-link" data-parent="${path}">+ Link</button><button type="button" data-action="add-group" data-parent="${path}">+ Gruppe</button>${root ? `<button type="button" data-action="add-separator" data-parent="${path}">+ Trenner</button>` : ""}</div>`;
        }
        _itemList(items, path = [], root = false) {
            return items.map((item, index) => {
                const current = [...path, index];
                const value = current.join(".");
                if (item.type === "separator")
                    return `<div class="tree-separator"><span>Trenner</span><button type="button" data-action="remove" data-path="${value}">Entfernen</button></div>`;
                const isGroup = group(item);
                const field = (name, title, content, placeholder = "") => `<label>${title}<input type="text" data-path="${value}" data-field="${name}" value="${esc(content)}" placeholder="${esc(placeholder)}"></label>`;
                return `<section class="tree-item"><div class="item-heading"><span>${isGroup ? "Gruppe" : "Link"}</span><button type="button" data-action="remove" data-path="${value}" aria-label="${esc(item.name)} entfernen">Entfernen</button></div><div class="fields">${field("name", "Name", item.name)}${field("icon", "Icon", item.icon, "mdi:home-outline")}${field("label", "Beschriftung", item.label ?? item.name, "Leer = ohne Beschriftung")}${isGroup ? field("menu_title", "Menütitel", item.menu_title ?? "") : field("url", "URL", item.url ?? "", "/lovelace/seite")}<label class="default-option"><input type="checkbox" data-path="${value}" data-field="default" ${item.default ? "checked" : ""}>Standardauswahl</label></div>${isGroup ? `<div class="children"><h4>Unterpunkte</h4>${this._itemList(item.children, current)}${this._addButtons(value, false)}</div>` : ""}</section>`;
            }).join("") + (root ? this._addButtons(path.join("."), true) : "");
        }
        _previewMarkup() {
            const items = this._config.items || [];
            const explicit = this._config.active;
            const hasMatch = items.some(branchMatches);
            return items.map(item => {
                if (item.type === "separator")
                    return '<span class="nav-separator" role="separator"></span>';
                const active = explicit ? item.name === explicit : branchMatches(item) || (!hasMatch && item.default);
                return `<div class="nav-item ${active ? "active" : ""}" title="${esc(item.name)}"><ha-icon icon="${esc(item.icon || "mdi:link")}"></ha-icon></div>`;
            }).join("");
        }
        _updatePreview() {
            const preview = this.shadowRoot.querySelector(".preview");
            preview?.style.setProperty("--nav-color", COLORS[this._config.color] || COLORS.orange);
            preview?.classList.toggle("no-button-borders", this._config.show_button_borders === false);
            const bar = this.shadowRoot.querySelector(".preview .bar");
            if (bar)
                bar.innerHTML = this._previewMarkup();
        }
        _render() {
            const definition = GlassNavigationCard.getConfigForm();
            this.shadowRoot.innerHTML = `<style>${STYLE}
        :host{color:var(--primary-text-color,#eee)}
        .editor{display:grid;gap:16px}.preview{padding:16px;border:1px solid var(--divider-color,#333);border-radius:24px;background:#090c0b;overflow:auto}
        .preview-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;color:#f2f2f4}.preview-header h3{margin:0;font-size:16px}
        .preview .bar{margin:auto;width:100%;gap:4px;padding:8px}.preview .nav-item{flex:1 1 54px;max-width:64px;min-width:25px;min-height:38px;border-radius:21px}.preview .nav-item>ha-icon{width:26px;height:26px;--mdc-icon-size:26px}
        .editor-toggle,.tree button{min-height:34px;padding:6px 10px;border:1px solid var(--divider-color,#444);border-radius:10px;background:var(--secondary-background-color,#242629);color:var(--primary-text-color,#eee);cursor:pointer}
        .editor-toggle{display:grid;place-items:center;width:36px;padding:6px}.editor-toggle ha-icon{width:20px;height:20px;--mdc-icon-size:20px}
        .tree{display:grid;gap:12px}.tree h3{margin:8px 0}.tree-item{display:grid;gap:10px;padding:12px;border:1px solid var(--divider-color,#444);border-radius:16px;background:var(--card-background-color,#17191c)}
        .item-heading,.tree-separator{display:flex;align-items:center;justify-content:space-between;gap:10px}.item-heading>span{font-size:13px;color:var(--secondary-text-color,#aaa)}
        .fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.fields label{display:grid;gap:5px;min-width:0;font-size:12px;color:var(--secondary-text-color,#aaa)}
        .fields input[type=text]{width:100%;min-width:0;min-height:38px;padding:8px 10px;border:1px solid var(--divider-color,#555);border-radius:9px;background:var(--primary-background-color,#111);color:var(--primary-text-color,#eee);font:inherit;font-size:14px}
        .fields .default-option{display:flex;align-items:center;gap:8px}.children{display:grid;gap:10px;margin-left:4px;padding-left:12px;border-left:1px solid var(--divider-color,#444)}.children h4{margin:4px 0;font-size:13px;color:var(--secondary-text-color,#aaa)}.add-actions{display:flex;flex-wrap:wrap;gap:8px}
        [hidden]{display:none!important}@media(max-width:600px){.fields{grid-template-columns:1fr}.preview{padding:12px}}
      </style><section class="editor"><div class="preview ${this._config.show_button_borders === false ? "no-button-borders" : ""}" style="--nav-color:${COLORS[this._config.color] || COLORS.orange}"><div class="preview-header"><h3>Glass Navigation</h3><button type="button" class="editor-toggle" data-action="toggle-edit" aria-label="${this._editing ? "Bearbeitung abschließen" : "Karte bearbeiten"}"><ha-icon icon="${this._editing ? "mdi:check" : "mdi:pencil"}"></ha-icon></button></div><div class="bar" aria-label="Navigationsvorschau">${this._previewMarkup()}</div></div><ha-form ${this._editing ? "" : "hidden"}></ha-form><div class="tree" ${this._editing ? "" : "hidden"}><h3>Menüstruktur</h3>${this._itemList(this._config.items || [], [], true)}</div></section>`;
            const form = this.shadowRoot.querySelector("ha-form");
            form.schema = definition.schema.filter(field => field.name !== "items");
            form.data = this._config;
            form.hass = this._hass;
            form.computeLabel = definition.computeLabel;
            form.addEventListener("value-changed", event => {
                event.stopPropagation();
                this._config = { ...this._config, ...event.detail.value };
                this._updatePreview();
                this._emitConfig();
            });
        }
        _handleClick(event) {
            const button = event.composedPath().find(node => node?.dataset?.action);
            if (!button)
                return;
            const action = button.dataset.action;
            if (action === "toggle-edit") {
                this._editing = !this._editing;
                this._render();
                return;
            }
            if (action === "remove") {
                const parts = this._parts(button.dataset.path);
                const index = parts.pop();
                const list = this._getList(parts.join("."));
                list.splice(index, 1);
                if (!list.length && parts.length) {
                    const parent = this._getItem(parts.join("."));
                    delete parent.children;
                    parent.url = "/lovelace/seite";
                }
            }
            else {
                const list = this._getList(button.dataset.parent || "");
                if (action === "add-link")
                    list.push({ name: "Neuer Link", icon: "mdi:link", url: "/lovelace/seite" });
                else if (action === "add-group")
                    list.push({ name: "Neue Gruppe", icon: "mdi:folder-outline", children: [{ name: "Neuer Link", icon: "mdi:link", url: "/lovelace/seite" }] });
                else if (action === "add-separator")
                    list.push({ type: "separator" });
                else
                    return;
            }
            this._render();
            this._emitConfig();
        }
        _handleInput(event) {
            const input = event.composedPath().find(node => node?.dataset?.field);
            if (!input || (event.type === "input" && input.type === "checkbox") || (event.type === "change" && input.type !== "checkbox"))
                return;
            const item = this._getItem(input.dataset.path);
            if (!item)
                return;
            if (input.dataset.field === "default") {
                const parts = this._parts(input.dataset.path);
                parts.pop();
                if (input.checked)
                    this._getList(parts.join(".")).forEach(sibling => { sibling.default = false; });
                item.default = input.checked;
                this.shadowRoot.querySelectorAll('input[data-field="default"]').forEach(checkbox => { checkbox.checked = !!this._getItem(checkbox.dataset.path)?.default; });
            }
            else
                item[input.dataset.field] = input.value;
            this._updatePreview();
            this._emitConfig();
        }
    }
    if (!customElements.get("glass-navigation-card"))
        customElements.define("glass-navigation-card", GlassNavigationCard);
    if (!customElements.get("glass-navigation-card-editor"))
        customElements.define("glass-navigation-card-editor", GlassNavigationCardEditor);
    window.customCards = window.customCards || [];
    const metadata = { type: "glass-navigation-card", name: "Glass Navigation Card", description: "Dunkle Glasnavigation mit warmem Aktivzustand und verschachtelten Raumkacheln.", preview: true, version: VERSION };
    const existing = window.customCards.find(card => card.type === metadata.type);
    if (existing)
        Object.assign(existing, metadata);
    else
        window.customCards.push(metadata);
})();

})();

(() => {
const VENTILATION_CARD_VERSION = "1.0.0";
const clampVentilation = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const escapeVentilation = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
})[character]);
const parseDuration = (value) => {
    if (typeof value !== "string")
        return 0;
    const iso = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
    if (iso)
        return Number(iso[1] || 0) * 3600 + Number(iso[2] || 0) * 60 + Number(iso[3] || 0);
    const parts = value.split(":").map(Number);
    if (parts.some((part) => !Number.isFinite(part)))
        return 0;
    if (parts.length === 3)
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2)
        return parts[0] * 60 + parts[1];
    return parts.length === 1 ? parts[0] : 0;
};
class GlassVentilationCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this._config = null;
        this._hass = null;
        this._timerInterval = null;
    }
    static getStubConfig() {
        return {
            entity: "fan.lueftung",
            title: "Raumklima",
            name: "Lüftung",
            timer_duration: "00:30:00",
            speed_levels: 3,
            button_size: 5,
            title_size: 5,
            preview_size: 5,
        };
    }
    static getConfigForm() {
        const schema = [
            { name: "entity", required: true, selector: { entity: { filter: { domain: "fan" } } } },
            { name: "title", default: "Raumklima", selector: { text: {} } },
            { name: "name", selector: { text: {} } },
            { name: "timer_entity", selector: { entity: { filter: { domain: "timer" } } } },
            { name: "timer_duration", default: "00:30:00", selector: { text: {} } },
            { name: "speed_levels", default: 3, selector: { number: { min: 1, max: 6, step: 1, mode: "slider" } } },
            { name: "show_button_labels", default: true, selector: { boolean: {} } },
            { name: "show_preview", default: true, selector: { boolean: {} } },
            { name: "show_action_button", default: true, selector: { boolean: {} } },
            { name: "action_entity", selector: { entity: {} } },
            { name: "action_icon", selector: { icon: {} } },
            { name: "button_size", default: 5, selector: { number: { min: 1, max: 5, step: 1, mode: "slider" } } },
            { name: "title_size", default: 5, selector: { number: { min: 1, max: 5, step: 1, mode: "slider" } } },
            { name: "preview_size", default: 5, selector: { number: { min: 1, max: 5, step: 1, mode: "slider" } } },
            { name: "timer_text_size", default: 5, selector: { number: { min: 1, max: 5, step: 1, mode: "slider" } } },
        ];
        return {
            schema,
            computeLabel: (field) => ({
                entity: "Lüfter",
                title: "Titel",
                name: "Beschriftung",
                timer_entity: "Timer-Entität (optional)",
                timer_duration: "Timer-Dauer (HH:MM:SS)",
                speed_levels: "Lüftungsstufen",
                show_button_labels: "Stufenbeschriftungen anzeigen",
                show_preview: "Lüfterbild und Prozentanzeige anzeigen",
                show_action_button: "Aktionsbutton anzeigen",
                action_entity: "Aktionsentität",
                action_icon: "Aktionsicon",
                button_size: "Stufenknopf-Größe",
                title_size: "Beschriftungsgröße",
                preview_size: "Lüfter- und Prozentgröße",
                timer_text_size: "Timer-Textgröße",
            })[field.name],
        };
    }
    static getConfigElement() { return document.createElement("glass-ventilation-card-editor"); }
    setConfig(config) {
        if (!config?.entity)
            throw new Error("Bitte eine Fan-Entität angeben.");
        if (!config.entity.startsWith("fan."))
            throw new Error("Die Entität muss eine Fan-Entität sein.");
        if (config.timer_entity && !config.timer_entity.startsWith("timer."))
            throw new Error("Die Timer-Entität muss mit timer. beginnen.");
        const timerDuration = config.timer_duration ?? "00:30:00";
        if (parseDuration(timerDuration) <= 0)
            throw new Error("Die Timer-Dauer muss größer als 00:00:00 sein.");
        this._config = {
            title: "Raumklima",
            timer_duration: "00:30:00",
            speed_levels: 3,
            show_button_labels: true,
            show_preview: true,
            show_action_button: true,
            button_size: 5,
            title_size: 5,
            preview_size: 5,
            timer_text_size: 5,
            ...config,
        };
        this._config.speed_levels = clampVentilation(this._config.speed_levels, 1, 6);
        this._render();
    }
    set hass(hass) {
        this._hass = hass;
        this._render();
    }
    get hass() { return this._hass; }
    getCardSize() { return this._config?.timer_entity ? 5 : 4; }
    disconnectedCallback() {
        clearInterval(this._timerInterval);
        this._timerInterval = null;
    }
    _call(domain, service, entity, data = {}) {
        if (!this._hass || !entity)
            return;
        this._hass.callService(domain, service, { entity_id: entity, ...data });
    }
    _fanState() { return this._hass?.states?.[this._config.entity]; }
    _timerState() { return this._config.timer_entity ? this._hass?.states?.[this._config.timer_entity] : null; }
    _fanPercentage() {
        const state = this._fanState();
        if (state?.state !== "on")
            return 0;
        const percentage = Number(state.attributes?.percentage);
        return Number.isFinite(percentage) ? clampVentilation(percentage, 0, 100) : 100;
    }
    _timerRemaining() {
        const state = this._timerState();
        if (state?.state === "active" && state.attributes?.finishes_at) {
            const finish = Date.parse(state.attributes.finishes_at);
            if (Number.isFinite(finish))
                return Math.max(0, Math.ceil((finish - Date.now()) / 1000));
        }
        return parseDuration(state?.attributes?.remaining || "");
    }
    _formatTime(seconds) {
        const value = Math.max(0, Math.floor(seconds));
        const hours = Math.floor(value / 3600);
        const minutes = Math.floor((value % 3600) / 60);
        const remaining = value % 60;
        return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}` : `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
    }
    _timerProgress() {
        const total = parseDuration(this._config.timer_duration);
        if (!total)
            return 0;
        return clampVentilation((total - this._timerRemaining()) / total * 100, 0, 100);
    }
    _setFanLevel(level) {
        if (level === 0) {
            this._call("fan", "turn_off", this._config.entity);
            return;
        }
        const percentage = Math.round(level / this._config.speed_levels * 100);
        this._call("fan", "set_percentage", this._config.entity, { percentage });
    }
    _timerAction(action) {
        if (!this._config.timer_entity)
            return;
        if (action === "start")
            this._call("timer", "start", this._config.timer_entity, this._timerState()?.state === "paused" ? {} : { duration: this._config.timer_duration });
        else if (action === "pause")
            this._call("timer", "pause", this._config.timer_entity);
        else if (action === "cancel")
            this._call("timer", "cancel", this._config.timer_entity);
    }
    _timerMarkup(timerState) {
        if (!this._config.timer_entity)
            return "";
        const active = timerState?.state === "active";
        const paused = timerState?.state === "paused";
        const remaining = this._timerRemaining();
        const timerStatus = active || paused ? `${paused ? "Pausiert · " : ""}<span class="timer-countdown">${this._formatTime(remaining)}</span>` : "Bereit";
        const controls = active
            ? `<button class="timer-control pause" data-timer-action="pause" aria-label="Timer pausieren" title="Pausieren">${this._icon("pause")}</button><button class="timer-control cancel" data-timer-action="cancel" aria-label="Timer stoppen" title="Stoppen">${this._icon("stop")}</button>`
            : paused
                ? `<button class="timer-control start" data-timer-action="start" aria-label="Timer fortsetzen" title="Fortsetzen">${this._icon("play")}</button><button class="timer-control cancel" data-timer-action="cancel" aria-label="Timer stoppen" title="Stoppen">${this._icon("stop")}</button>`
                : `<button class="timer-control start" data-timer-action="start" aria-label="Timer starten" title="Starten">${this._icon("play")}</button>`;
        return `<section class="timer-panel ${active ? "is-active" : ""} ${paused ? "is-paused" : ""}" aria-label="Stoßlüftung"><div class="timer-row"><span class="timer-icon">${this._icon("timer")}</span><div class="timer-status"><strong>Stoßlüftung</strong><span>${active ? `<i></i>` : ""}${timerStatus}</span></div><div class="timer-actions">${controls}</div></div>${active ? `<div class="timer-progress"><span style="width:${this._timerProgress()}%"></span></div>` : ""}</section>`;
    }
    _bindEvents() {
        this.shadowRoot.querySelector(".header-action")?.addEventListener("click", () => this._toggleAction());
        this.shadowRoot.querySelectorAll("[data-level]").forEach((button) => button.addEventListener("click", () => this._setFanLevel(Number(button.dataset.level))));
        this.shadowRoot.querySelectorAll("[data-timer-action]").forEach((button) => button.addEventListener("click", () => this._timerAction(button.dataset.timerAction)));
    }
    _toggleAction() { this._call("homeassistant", "toggle", this._config.action_entity || this._config.entity); }
    _levelIconMarkup(isOff) {
        return `<ha-icon icon="${isOff ? "mdi:fan-off" : "mdi:fan"}" aria-hidden="true"></ha-icon>`;
    }
    _render() {
        if (!this._config)
            return;
        const fan = this._fanState();
        const timer = this._timerState();
        const name = String(this._config.name ?? fan?.attributes?.friendly_name ?? this._config.entity).trim();
        const title = String(this._config.title ?? "").trim();
        const percentage = Math.round(this._fanPercentage());
        const isOn = fan?.state === "on";
        const speedLevels = Math.round(this._config.speed_levels);
        const activeLevel = isOn ? Math.max(1, Math.round(percentage / 100 * speedLevels)) : 0;
        const spinDuration = isOn ? 2.4 - ((activeLevel - 1) / Math.max(speedLevels - 1, 1)) * 1.95 : 0;
        const buttonLevel = clampVentilation(this._config.button_size, 1, 5);
        const titleLevel = clampVentilation(this._config.title_size, 1, 5);
        const previewLevel = clampVentilation(this._config.preview_size, 1, 5);
        const buttonScale = 0.62 + ((buttonLevel - 1) / 4) * 0.38;
        const textScale = 0.72 + ((titleLevel - 1) / 4) * 0.28;
        const previewScale = 0.5 + ((previewLevel - 1) / 4) * 0.5;
        const titleFont = 32 * textScale;
        const readoutFont = 76 * previewScale;
        const titleContent = title || name
            ? `<div class="heading">${title ? `<div class="eyebrow">${escapeVentilation(title)}</div>` : ""}${name ? `<h2 style="--heading-font:${titleFont}px">${escapeVentilation(name)}</h2>` : ""}</div>`
            : "";
        const levels = Array.from({ length: speedLevels + 1 }, (_, level) => {
            const label = level === 0 ? "Aus" : `Stufe ${level}`;
            const active = level === activeLevel;
            return `<div class="level-item"><button type="button" class="level-button ${active ? "active" : ""}" data-level="${level}" aria-label="${label}" aria-pressed="${active}"><span class="level-icon">${this._levelIconMarkup(level === 0)}</span>${level > 0 ? `<sup>${level}</sup>` : ""}</button>${this._config.show_button_labels !== false ? `<span class="level-label">${label}</span>` : ""}</div>`;
        }).join("");
        const attributes = fan?.attributes || {};
        const preset = attributes.preset_mode;
        const stateText = isOn ? (preset ? `${preset} aktiv` : "Aktiv") : "Aus";
        const timerState = timer?.state || "idle";
        const timerScale = 0.6 + (clampVentilation(this._config.timer_text_size, 1, 5) - 1) * 0.1;
        const actionEntity = this._config.action_entity || this._config.entity;
        const actionOn = this._hass?.states?.[actionEntity]?.state === "on";
        const style = `--button-size:${100 * buttonScale}px;--level-icon-size:${65 * buttonScale}px;--title-font:${titleFont}px;--readout-font:${readoutFont}px;--preview-scale:${previewScale};--fan-spin-duration:${spinDuration.toFixed(2)}s;--timer-title:${24 * timerScale}px;--timer-status:${18 * timerScale}px;--timer-countdown:${30 * timerScale}px`;
        this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; width:100%; min-width:0; color:var(--primary-text-color,#f5f5f7); font-family:var(--paper-font-body1_-_font-family,"Arial",sans-serif); }
        * { box-sizing:border-box; }
        button { color:inherit; font:inherit; cursor:pointer; -webkit-tap-highlight-color:transparent; }
        .card { position:relative; container-type:inline-size; overflow:hidden; width:100%; min-width:0; padding:clamp(18px,4%,32px); border:1px solid rgba(255,255,255,.1); border-radius:clamp(22px,4vw,36px); background:radial-gradient(ellipse at 32% 22%,#25272c 0,#17191d 43%,#101215 100%); box-shadow:inset 0 1px 1px rgba(255,255,255,.07),0 12px 30px rgba(0,0,0,.2); }
        .header { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; }
        .header[hidden] { display:none; }
        .eyebrow { color:#9295a0; font-size:clamp(11px,2.1vw,15px); font-weight:700; letter-spacing:.12em; text-transform:uppercase; }
        h2 { margin:7px 0 0; color:#f5f5f7; font-size:var(--heading-font); line-height:1.04; font-weight:700; overflow-wrap:anywhere; }
        h2:first-child { margin-top:0; }
        .header-action { display:grid; flex:none; width:clamp(58px,9vw,92px); aspect-ratio:1; place-items:center; padding:0; border:2px solid #303239; border-radius:50%; background:linear-gradient(145deg,#272a30,#17191d); color:#ff8b2b; box-shadow:0 6px 15px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.05); }
        .header-action.active { border-color:#ff8b2b; box-shadow:0 0 0 1px rgba(255,139,43,.2),0 6px 15px rgba(0,0,0,.25); }
        .header-action ha-icon { display:block; width:40px; height:40px; --mdc-icon-size:40px; }
        .main { display:flex; align-items:center; justify-content:center; gap:calc(18px * var(--preview-scale)); margin:24px 0 30px; min-width:0; }
        .fan-visual { flex:0 1 calc(200px * var(--preview-scale)); min-width:0; }
        .fan-visual svg { display:block; width:100%; height:auto; }
        .fan-visual:not(.is-on) { filter:grayscale(1); }
        .fan-visual.is-on .fan-rotor { transform-box:view-box; transform-origin:94px 95px; animation:fan-spin var(--fan-spin-duration) linear infinite; }
        @keyframes fan-spin { to { transform:rotate(360deg); } }
        .readout { min-width:0; }
        .percentage { color:#f4f4f5; font-size:min(var(--readout-font), 15cqw); line-height:.95; font-weight:700; white-space:nowrap; }
        .percentage small { font-size:.58em; }
        .state { margin-top:8px; color:#9295a0; font-size:calc(26px * var(--preview-scale)); line-height:1.15; overflow-wrap:anywhere; }
        .levels { display:grid; grid-template-columns:repeat(${speedLevels + 1},minmax(0,1fr)); justify-items:center; gap:clamp(6px,1.5vw,16px); margin:0 0 26px; }
        .level-item { display:flex; width:100%; min-width:0; flex-direction:column; align-items:center; gap:9px; }
        .level-button { position:relative; display:grid; width:min(var(--button-size),100%); aspect-ratio:1; place-items:center; padding:0; border:2px solid #34363c; border-radius:50%; background:linear-gradient(145deg,#202226,#151619); color:#d5d6da; }
        .level-button.active { border-color:#ff8b2b; background:radial-gradient(circle,#3a2618,#17191d 72%); color:#ff9b35; box-shadow:0 0 24px rgba(255,139,43,.18); }
        .level-icon { position:relative; display:grid; width:65%; aspect-ratio:1; place-items:center; }
        .level-icon ha-icon { display:block; width:100%; height:100%; --mdc-icon-size:var(--level-icon-size); }
        .level-button sup { position:absolute; right:19%; bottom:13%; font-size:clamp(16px,3.2cqw,24px); font-weight:700; line-height:1; }
        .level-label { max-width:100%; font-size:clamp(10px,3cqw,18px); line-height:1.15; text-align:center; overflow-wrap:anywhere; }
        .divider { height:1px; margin:clamp(20px,3vw,30px) 0; background:#393b40; }
        .timer-panel { display:grid; gap:16px; }
        .timer-row { display:flex; min-width:0; align-items:center; gap:clamp(8px,2vw,20px); }
        .timer-icon { display:grid; flex:none; width:clamp(40px,7vw,64px); aspect-ratio:1; place-items:center; color:#92949a; }
        .timer-panel.is-active .timer-icon { color:#ff8b2b; }
        .timer-icon svg { width:100%; height:100%; fill:none; stroke:currentColor; stroke-width:1.8; }
        .timer-status { display:grid; min-width:0; flex:1; gap:4px; }
        .timer-status strong { color:#ececef; font-size:min(var(--timer-title),5cqw); line-height:1.15; overflow-wrap:normal; }
        .timer-status span { display:flex; align-items:center; gap:8px; color:#9b9da3; font-size:var(--timer-status); }
        .timer-status i { width:9px; height:9px; border-radius:50%; background:#ff8b2b; }
        .timer-countdown { font-variant-numeric:tabular-nums; white-space:nowrap; }
        .timer-actions { display:flex; flex:none; align-items:center; gap:10px; }
        .timer-control { display:grid; width:clamp(44px,6vw,64px); aspect-ratio:1; place-items:center; padding:0; border:2px solid #56585d; border-radius:50%; background:transparent; color:#d0d1d4; }
        .timer-control.cancel { border-color:#ff8b2b; color:#ff8b2b; }
        .timer-control.start { border-color:#ff8b2b; color:#ff8b2b; }
        .timer-control svg { width:54%; height:54%; fill:currentColor; }
        .timer-progress { height:10px; overflow:hidden; border-radius:99px; background:#323439; }
        .timer-progress span { display:block; height:100%; border-radius:inherit; background:#ff8b2b; transition:width .5s linear; }
        @container (max-width:550px) { .levels { gap:4px; margin-bottom:18px; } .level-button { border-width:1.5px; } .timer-row { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:8px; } .timer-actions { gap:5px; } .timer-icon { width:38px; } .timer-control { width:42px; } .divider { margin:18px 0; } }
        @media(prefers-reduced-motion:reduce) { *,*::before,*::after { animation:none !important; transition:none !important; } }
      </style>
      <article class="card" style="${style}">
        <header class="header" ${!title && !name && this._config.show_action_button === false ? "hidden" : ""}>${titleContent}${this._config.show_action_button !== false ? `<button type="button" class="header-action ${actionOn ? "active" : ""}" aria-label="Aktion schalten" title="Aktion schalten"><ha-icon icon="${escapeVentilation(this._config.action_icon || "mdi:fan")}"></ha-icon></button>` : ""}</header>
        ${this._config.show_preview !== false ? `<section class="main" aria-label="Lüftungsstatus"><div class="fan-visual ${isOn ? "is-on" : ""}" style="--fan-spin-duration:${spinDuration.toFixed(2)}s">${this._fanGraphic()}</div><div class="readout"><div class="percentage">${percentage}<small> %</small></div><div class="state">${escapeVentilation(stateText)}</div></div></section>` : ""}
        <nav class="levels" aria-label="Lüftungsstufe">${levels}</nav>
        ${this._config.timer_entity ? `<div class="divider"></div>${this._timerMarkup(timer)}` : ""}
      </article>`;
        this._bindEvents();
        if (timerState === "active") {
            this._timerInterval ??= setInterval(() => {
                const countdown = this.shadowRoot.querySelector(".timer-countdown");
                const progress = this.shadowRoot.querySelector(".timer-progress span");
                if (countdown)
                    countdown.textContent = this._formatTime(this._timerRemaining());
                if (progress)
                    progress.style.width = `${this._timerProgress()}%`;
            }, 1000);
        }
        else {
            clearInterval(this._timerInterval);
            this._timerInterval = null;
        }
    }
    _fanGraphic() {
        return `<svg viewBox="0 0 260 190" role="img" aria-label="Lüfter"><defs><radialGradient id="fan-ring"><stop stop-color="#353535"/><stop offset=".8" stop-color="#0c0c0c"/><stop offset="1" stop-color="#46372a"/></radialGradient><linearGradient id="fan-blade" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#4c4a49"/><stop offset=".68" stop-color="#222120"/><stop offset="1" stop-color="#b45b18"/></linearGradient><linearGradient id="fan-air"><stop stop-color="#b85d1b" stop-opacity=".35"/><stop offset="1" stop-color="#b85d1b" stop-opacity="0"/></linearGradient></defs><g fill="none" stroke="url(#fan-air)" stroke-width="4" stroke-linecap="round"><path d="M172 65 C205 72 211 40 256 38"/><path d="M174 95 C207 102 215 78 257 79"/><path d="M171 126 C207 135 216 110 256 112"/></g><circle cx="94" cy="95" r="87" fill="url(#fan-ring)" stroke="#544438" stroke-width="2"/><g class="fan-rotor"><g fill="url(#fan-blade)" stroke="#67605a" stroke-width="1.5"><path d="M94 93 C76 80 73 21 93 19 C115 17 141 35 148 49 C152 58 122 73 103 93 Z"/><path d="M94 93 C107 75 166 74 168 94 C170 116 152 142 138 149 C129 153 114 123 94 104 Z"/><path d="M94 95 C112 108 115 167 95 169 C73 171 47 153 40 139 C36 130 66 115 85 95 Z"/><path d="M94 95 C81 113 22 114 20 94 C18 72 36 46 50 39 C59 35 74 65 94 84 Z"/></g><circle cx="94" cy="95" r="22" fill="#292929" stroke="#685544" stroke-width="3"/><circle cx="94" cy="95" r="17" fill="#373534"/></g></svg>`;
    }
    _icon(name) {
        const icons = {
            play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
            pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
            stop: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
            timer: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6M12 2v3M18 5l2 2"/></svg>',
        };
        return icons[name];
    }
}
class GlassVentilationCardEditor extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.shadowRoot.innerHTML = "<ha-form></ha-form>";
        const form = this.shadowRoot.querySelector("ha-form");
        const definition = GlassVentilationCard.getConfigForm();
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
    set hass(hass) { this.shadowRoot.querySelector("ha-form").hass = hass; }
}
if (!customElements.get("glass-ventilation-card"))
    customElements.define("glass-ventilation-card", GlassVentilationCard);
if (!customElements.get("glass-ventilation-card-editor"))
    customElements.define("glass-ventilation-card-editor", GlassVentilationCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "glass-ventilation-card"))
    window.customCards.push({ type: "glass-ventilation-card", name: "Glass Ventilation Card", description: "Mehrstufige Lüftungssteuerung mit optionaler Timer-Steuerung.", preview: true, version: VENTILATION_CARD_VERSION });

})();

(() => {
const TIMER_BAR_VERSION = "1.1.0";
const escapeTimerBar = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);
const timerBarDuration = (value) => {
    if (typeof value !== "string")
        return 0;
    const iso = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
    if (iso)
        return Number(iso[1] || 0) * 3600 + Number(iso[2] || 0) * 60 + Number(iso[3] || 0);
    const match = value.match(/^(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
    if (!match || Number(match[2]) >= 60 || Number(match[3]) >= 60)
        return 0;
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
};
class GlassTimerBarCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this._interval = null;
    }
    static getStubConfig() { return { entity: "timer.stosslueftung", name: "Stoßlüftung" }; }
    static getConfigForm() {
        return {
            schema: [
                { name: "entity", required: true, selector: { entity: { filter: { domain: "timer" } } } },
                { name: "name", selector: { text: {} } },
                { name: "duration", selector: { text: {} } },
                { name: "icon_size", default: 5, selector: { number: { min: 1, max: 5, step: 1, mode: "slider" } } },
                { name: "text_size", default: 5, selector: { number: { min: 1, max: 5, step: 1, mode: "slider" } } },
                { name: "button_size", default: 5, selector: { number: { min: 1, max: 5, step: 1, mode: "slider" } } },
                { name: "show_card_frame", default: true, selector: { boolean: {} } },
            ],
            computeLabel: (field) => ({ entity: "Timer-Entität", name: "Beschriftung", duration: "Startdauer (HH:MM:SS, optional)", icon_size: "Icon-Größe", text_size: "Textgröße", button_size: "Button-Größe", show_card_frame: "Kartenrahmen anzeigen" })[field.name],
        };
    }
    static getConfigElement() { return document.createElement("glass-timer-bar-card-editor"); }
    setConfig(config) {
        if (typeof config?.entity !== "string" || !/^timer\.[a-z0-9_]+$/.test(config.entity))
            throw new Error("Bitte eine gültige Timer-Entität angeben.");
        if (config.duration && !timerBarDuration(config.duration))
            throw new Error("Bitte eine gültige Dauer größer als 00:00:00 angeben.");
        this._config = { icon_size: 5, text_size: 5, button_size: 5, show_card_frame: true, ...config };
        this._render();
    }
    set hass(value) { this._hass = value; this._render(); }
    get hass() { return this._hass; }
    getCardSize() { return 2; }
    connectedCallback() { this._render(); }
    disconnectedCallback() { clearInterval(this._interval); this._interval = null; }
    _state() { return this._hass?.states?.[this._config?.entity]; }
    _remaining() {
        const state = this._state();
        if (state?.state === "active" && state.attributes?.finishes_at) {
            const finish = Date.parse(state.attributes.finishes_at);
            if (Number.isFinite(finish))
                return Math.max(0, Math.ceil((finish - Date.now()) / 1000));
        }
        return Math.max(0, Math.ceil(timerBarDuration(state?.attributes?.remaining)));
    }
    _progress() {
        const total = timerBarDuration(this._state()?.attributes?.duration) || timerBarDuration(this._config.duration);
        return total ? Math.max(0, Math.min(100, this._remaining() / total * 100)) : 0;
    }
    _formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor(seconds % 3600 / 60);
        const remaining = seconds % 60;
        return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}` : `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
    }
    _action(action) {
        if (!this._hass || !this._state() || ["unavailable", "unknown"].includes(this._state().state))
            return;
        const service = action === "start" || action === "resume" ? "start" : action === "pause" ? "pause" : "cancel";
        const data = { entity_id: this._config.entity };
        if (action === "start" && this._config.duration)
            data.duration = this._config.duration;
        this._hass.callService("timer", service, data);
    }
    _updateClock() {
        const countdown = this.shadowRoot.querySelector(".countdown");
        const progress = this.shadowRoot.querySelector(".progress-fill");
        const ring = this.shadowRoot.querySelector(".timer-icon");
        if (countdown)
            countdown.textContent = this._formatTime(this._remaining());
        if (progress)
            progress.style.width = `${this._progress()}%`;
        if (ring)
            ring.style.setProperty("--progress", `${this._progress()}%`);
    }
    _render() {
        if (!this._config)
            return;
        const state = this._state();
        const active = state?.state === "active";
        const paused = state?.state === "paused";
        const running = active || paused;
        const unavailable = !state || state.state === "unavailable" || state.state === "unknown";
        const name = escapeTimerBar(this._config.name ?? state?.attributes?.friendly_name ?? "Timer");
        const status = unavailable ? "Nicht verfügbar" : active ? "Läuft" : paused ? "Pausiert" : "Bereit";
        const iconScale = 0.55 + ((Math.min(5, Math.max(1, Number(this._config.icon_size) || 5)) - 1) / 4) * 0.45;
        const textScale = 0.6 + ((Math.min(5, Math.max(1, Number(this._config.text_size) || 5)) - 1) / 4) * 0.4;
        const buttonScale = 0.6 + ((Math.min(5, Math.max(1, Number(this._config.button_size) || 5)) - 1) / 4) * 0.4;
        const frameClass = this._config.show_card_frame === false ? "no-frame" : "";
        const button = (action, icon, label) => `<button type="button" class="control ${action}" data-action="${action}" aria-label="${label}" title="${label}"><ha-icon icon="mdi:${icon}"></ha-icon></button>`;
        const controls = running
            ? `${paused ? button("resume", "play", "Fortsetzen") : button("pause", "pause", "Pausieren")}${button("cancel", "stop", "Stoppen")}`
            : `<button type="button" class="start" data-action="start" ${unavailable ? "disabled" : ""}><ha-icon icon="mdi:play"></ha-icon><span>Starten</span></button>`;
        this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; min-width:0; color:#f4f4f4; font-family:var(--paper-font-body1_-_font-family,Arial,sans-serif); }
        * { box-sizing:border-box; }
        .card { container-type:inline-size; padding:clamp(16px,3%,28px); border:1px solid #333437; border-radius:24px; background:linear-gradient(145deg,#191a1c,#111213); box-shadow:inset 0 1px 1px #ffffff0b; }
        .card.no-frame { padding:6px 0; border:0; border-radius:0; background:transparent; box-shadow:none; }
        .row { display:grid; grid-template-columns:auto minmax(0,1fr) auto auto; align-items:center; gap:clamp(12px,3%,28px); }
        .timer-icon { display:grid; width:clamp(${52 * iconScale}px,${10 * iconScale}cqw,${100 * iconScale}px); aspect-ratio:1; place-items:center; color:#858585; }
        .timer-icon.running { color:#f5f5f5; border-radius:50%; background:conic-gradient(#ff900d var(--progress),#373737 0); padding:6px; }
        .icon-inner { display:grid; width:100%; height:100%; place-items:center; }
        .timer-icon.running .icon-inner { border-radius:50%; background:#171819; }
        .timer-icon ha-icon { display:block; width:clamp(${30 * iconScale}px,${5.8 * iconScale}cqw,${58 * iconScale}px); height:clamp(${30 * iconScale}px,${5.8 * iconScale}cqw,${58 * iconScale}px); --mdc-icon-size:clamp(${30 * iconScale}px,${5.8 * iconScale}cqw,${58 * iconScale}px); }
        .label { display:grid; min-width:0; gap:5px; }
        .label strong { font-size:clamp(${17 * textScale}px,${3.8 * textScale}cqw,${30 * textScale}px); line-height:1.1; overflow-wrap:anywhere; }
        .status { display:flex; align-items:center; gap:8px; color:#919191; font-size:clamp(${14 * textScale}px,${2.7 * textScale}cqw,${21 * textScale}px); }
        .status.active::before { content:""; width:10px; height:10px; flex:none; border-radius:50%; background:#ff900d; }
        .countdown { font-size:clamp(${22 * textScale}px,${6 * textScale}cqw,${52 * textScale}px); font-weight:700; font-variant-numeric:tabular-nums; white-space:nowrap; }
        .actions { display:flex; align-items:center; gap:10px; }
        button { display:flex; align-items:center; justify-content:center; flex:none; cursor:pointer; font:inherit; -webkit-tap-highlight-color:transparent; }
        button:focus-visible { outline:2px solid white; outline-offset:3px; }
        button:disabled { opacity:.45; cursor:not-allowed; }
        .start { gap:8px; min-height:${48 * buttonScale}px; padding:0 ${20 * buttonScale}px; border:2px solid #ff900d; border-radius:999px; background:transparent; color:#ff900d; font-size:clamp(${16 * textScale}px,${3 * textScale}cqw,${22 * textScale}px); font-weight:600; }
        .start ha-icon { --mdc-icon-size:${24 * buttonScale}px; }
        .control { width:clamp(${42 * buttonScale}px,${8 * buttonScale}cqw,${70 * buttonScale}px); aspect-ratio:1; border:2px solid #38393a; border-radius:50%; background:transparent; color:#f4f4f4; }
        .control ha-icon { width:clamp(${22 * buttonScale}px,${4 * buttonScale}cqw,${36 * buttonScale}px); height:clamp(${22 * buttonScale}px,${4 * buttonScale}cqw,${36 * buttonScale}px); --mdc-icon-size:clamp(${22 * buttonScale}px,${4 * buttonScale}cqw,${36 * buttonScale}px); }
        .control.cancel { border-color:#ff900d; color:#ff900d; }
        .progress { height:8px; margin-top:18px; overflow:hidden; border-radius:99px; background:#393a3b; }
        .progress-fill { height:100%; border-radius:inherit; background:#ff900d; transition:width .5s linear; }
        @container (max-width:400px) { .row { grid-template-columns:auto minmax(0,1fr) auto; gap:10px; } .countdown { grid-column:2; grid-row:2; } .actions { grid-column:3; grid-row:1 / 3; } .timer-icon { grid-row:1 / 3; } .start { padding:0 12px; } }
        @media (prefers-reduced-motion:reduce) { .progress-fill { transition:none; } }
      </style>
      <article class="card ${frameClass}"><div class="row"><div class="timer-icon ${running ? "running" : ""}" style="--progress:${this._progress()}%"><span class="icon-inner"><ha-icon icon="mdi:timer-outline"></ha-icon></span></div><div class="label"><strong>${name}</strong><span class="status ${active ? "active" : ""}">${status}</span></div>${running ? `<span class="countdown">${this._formatTime(this._remaining())}</span>` : ""}<div class="actions">${controls}</div></div>${running ? `<div class="progress" role="progressbar" aria-label="Verbleibende Zeit"><div class="progress-fill" style="width:${this._progress()}%"></div></div>` : ""}</article>`;
        this.shadowRoot.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => this._action(button.dataset.action)));
        if (active && this.isConnected)
            this._interval ??= setInterval(() => this._updateClock(), 1000);
        else {
            clearInterval(this._interval);
            this._interval = null;
        }
    }
}
class GlassTimerBarCardEditor extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.shadowRoot.innerHTML = "<ha-form></ha-form>";
        const form = this.shadowRoot.querySelector("ha-form");
        const definition = GlassTimerBarCard.getConfigForm();
        form.schema = definition.schema;
        form.computeLabel = definition.computeLabel;
        form.addEventListener("value-changed", (event) => {
            event.stopPropagation();
            this._config = { ...this._config, ...event.detail.value };
            this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config: this._config } }));
        });
    }
    setConfig(config) { this._config = { ...config }; this.shadowRoot.querySelector("ha-form").data = this._config; }
    set hass(value) { this.shadowRoot.querySelector("ha-form").hass = value; }
}
if (!customElements.get("glass-timer-bar-card"))
    customElements.define("glass-timer-bar-card", GlassTimerBarCard);
class GlassTimerCard extends GlassTimerBarCard {
}
if (!customElements.get("glass-timer-card"))
    customElements.define("glass-timer-card", GlassTimerCard);
if (!customElements.get("glass-timer-bar-card-editor"))
    customElements.define("glass-timer-bar-card-editor", GlassTimerBarCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "glass-timer-bar-card"))
    window.customCards.push({ type: "glass-timer-bar-card", name: "Glass Timer Bar Card", description: "Timer mit Countdown und Fortschrittsanzeige.", preview: true, version: TIMER_BAR_VERSION });
if (!window.customCards.some((card) => card.type === "glass-timer-card"))
    window.customCards.push({ type: "glass-timer-card", name: "Glass Timer", description: "Timer mit Countdown, Fortschrittsanzeige und Größenoptionen.", preview: true, version: TIMER_BAR_VERSION });

})();

(() => {
const GLASS_TEXT_VERSION = "1.0.0";
const escapeGlassText = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
}[character] || character));
class GlassTextCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this._config = null;
        this._hass = null;
    }
    static getStubConfig() {
        return { title: "AKTIONEN", subtitle: "Wohnzimmer", title_size: 5, button_size: 5 };
    }
    static getConfigForm() {
        return {
            schema: [
                { name: "title", default: "", selector: { text: {} } },
                { name: "subtitle", default: "", selector: { text: {} } },
                { name: "title_size", default: 5, selector: { number: { min: 1, max: 5, step: 1, mode: "slider" } } },
                { name: "show_action_button", default: false, selector: { boolean: {} } },
                { name: "action_entity", selector: { entity: {} }, visible: { field: "show_action_button", value: true } },
                { name: "action_icon", selector: { icon: {} }, visible: { field: "show_action_button", value: true } },
                {
                    name: "action",
                    default: "toggle",
                    selector: { select: { mode: "dropdown", options: [["toggle", "Ein-/Ausschalten"], ["more-info", "Mehr Informationen anzeigen"]] } },
                    visible: { field: "show_action_button", value: true },
                },
                { name: "button_size", default: 5, selector: { number: { min: 1, max: 5, step: 1, mode: "slider" } }, visible: { field: "show_action_button", value: true } },
            ],
            computeLabel: (field) => ({
                title: "Titel",
                subtitle: "Beschriftung",
                title_size: "Beschriftungsgröße",
                show_action_button: "Aktionsbutton anzeigen",
                action_entity: "Aktions-Entität",
                action_icon: "Aktions-Icon",
                action: "Aktion",
                button_size: "Button-Größe",
            }[field.name]),
        };
    }
    static getConfigElement() { return document.createElement("glass-text-card-editor"); }
    setConfig(config) {
        this._config = { title_size: 5, button_size: 5, show_action_button: false, action: "toggle", ...config };
        this._render();
        this._syncActionState();
    }
    set hass(value) {
        this._hass = value;
        this._syncActionState();
    }
    get hass() { return this._hass; }
    getCardSize() { return 2; }
    _callAction() {
        const entity = this._config?.action_entity;
        if (!this._hass || !entity)
            return;
        if (this._config.action === "more-info") {
            this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: entity } }));
        }
        else
            this._hass.callService("homeassistant", "toggle", { entity_id: entity });
    }
    _syncActionState() {
        const button = this.shadowRoot.querySelector(".header-action");
        if (!button)
            return;
        const state = this._hass?.states?.[this._config?.action_entity || ""];
        button.classList.toggle("active", Boolean(state && !["off", "closed", "idle", "standby", "unavailable", "unknown", "not_home"].includes(state.state)));
        button.classList.toggle("inactive", Boolean(state && ["off", "closed", "idle", "standby", "not_home"].includes(state.state)));
        const label = this.shadowRoot.querySelector(".action-state");
        if (label)
            label.textContent = ["on", "off"].includes(state?.state) ? (state.state === "on" ? "An" : "Aus") : "";
    }
    _render() {
        if (!this._config)
            return;
        const title = escapeGlassText(String(this._config.title ?? "").trim());
        const subtitle = escapeGlassText(String(this._config.subtitle ?? "").trim());
        const titleScale = 0.65 + ((Math.min(5, Math.max(1, Number(this._config.title_size) || 5)) - 1) / 4) * 0.35;
        const buttonScale = 1 / 3 + ((Math.min(5, Math.max(1, Number(this._config.button_size) || 5)) - 1) / 4) * (2 / 3);
        const menuScale = 0.5 + buttonScale * 0.5;
        const actionVisible = this._config.show_action_button && this._config.action_entity;
        this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; width:100%; min-width:0; color:var(--primary-text-color,#f3f3f5); font-family:var(--paper-font-body1_-_font-family,"Arial",sans-serif); }
        * { box-sizing:border-box; }
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
        @media (max-width:380px) { .header { gap:10px; } }
      </style>
      <header class="header" ${!title && !subtitle && !actionVisible ? "hidden" : ""} style="--subtitle-font:clamp(${22 * titleScale}px,${4.8 * titleScale}vw,${38 * titleScale}px);--header-action-size:clamp(${56 * menuScale}px,${11 * menuScale}vw,${88 * menuScale}px);--header-icon-size:calc((var(--header-action-size) - 16px) * .46)">
        ${title || subtitle ? `<div class="titles">${title ? `<div class="title">${title}</div>` : ""}${subtitle ? `<h2 class="subtitle">${subtitle}</h2>` : ""}</div>` : ""}
        ${actionVisible ? `<button class="header-action" aria-label="${escapeGlassText(this._config.action_entity)}" title="${escapeGlassText(this._config.action_entity)}"><ha-icon icon="${escapeGlassText(this._config.action_icon || "mdi:gesture-tap-button")}"></ha-icon><span class="action-state"></span></button>` : ""}
      </header>`;
        this.shadowRoot.querySelector(".header-action")?.addEventListener("click", () => this._callAction());
    }
}
class GlassTextCardEditor extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.shadowRoot.innerHTML = "<ha-form></ha-form>";
        const form = this.shadowRoot.querySelector("ha-form");
        const definition = GlassTextCard.getConfigForm();
        form.schema = definition.schema;
        form.computeLabel = definition.computeLabel;
        form.addEventListener("value-changed", (event) => {
            event.stopPropagation();
            this._config = { ...this._config, ...event.detail.value };
            this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config: this._config } }));
        });
    }
    setConfig(config) { this._config = { ...config }; this.shadowRoot.querySelector("ha-form").data = this._config; }
    set hass(value) { this.shadowRoot.querySelector("ha-form").hass = value; }
}
if (!customElements.get("glass-text-card"))
    customElements.define("glass-text-card", GlassTextCard);
if (!customElements.get("glass-text-card-editor"))
    customElements.define("glass-text-card-editor", GlassTextCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "glass-text-card"))
    window.customCards.push({ type: "glass-text-card", name: "Glass Text", description: "Überschrift mit optionalem Aktionsbutton.", preview: true, version: GLASS_TEXT_VERSION });

})();

(() => {
const GLASS_VALUE_VERSION = "1.0.1";
const VALUE_VISUAL_OPTIONS = [
    { value: "auto", label: "Automatisch" },
    { value: "fan", label: "Lüfter" },
    { value: "cover", label: "Jalousie" },
    { value: "icon", label: "Icon" },
    { value: "image", label: "Bild" },
];
const escapeGlassValue = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
}[character] || character));
class GlassValueCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this._config = null;
        this._hass = null;
    }
    static getStubConfig() {
        return { entity: "fan.wohnzimmer", name: "Lüftung", visual_type: "fan", image_size: 5, value_size: 5, show_card_frame: true };
    }
    static getConfigForm() {
        return {
            schema: [
                { name: "entity", required: true, selector: { entity: {} } },
                { name: "name", selector: { text: {} } },
                { name: "visual_type", default: "auto", selector: { select: { mode: "dropdown", options: VALUE_VISUAL_OPTIONS } } },
                { name: "image", selector: { text: {} } },
                { name: "icon", selector: { icon: {} } },
                { name: "attribute", selector: { text: {} } },
                { name: "unit", selector: { text: {} } },
                { name: "image_size", default: 5, selector: { number: { min: 1, max: 5, step: 1, mode: "slider" } } },
                { name: "value_size", default: 5, selector: { number: { min: 1, max: 5, step: 1, mode: "slider" } } },
                { name: "show_card_frame", default: true, selector: { boolean: {} } },
            ],
            computeLabel: (field) => ({
                entity: "Entität",
                name: "Beschriftung",
                visual_type: "Visualisierung",
                image: "Bildpfad oder Bild-URL",
                icon: "Icon",
                attribute: "Attribut (leer verwendet den Standardwert)",
                unit: "Einheit überschreiben",
                image_size: "Bildgröße",
                value_size: "Wertgröße",
                show_card_frame: "Kartenrahmen anzeigen",
            }[field.name]),
        };
    }
    static getConfigElement() { return document.createElement("glass-value-card-editor"); }
    setConfig(config) {
        if (!config.entity)
            throw new Error("Bitte eine Entität für den Wert angeben.");
        const image = String(config.image ?? "").trim();
        if (image && !/^(?:https?:\/\/|\/[^/]|\.\.?\/)/i.test(image))
            throw new Error("Bitte einen lokalen Bildpfad oder eine HTTP(S)-Bild-URL angeben.");
        this._config = { visual_type: "auto", icon: "mdi:chart-box-outline", image_size: 5, value_size: 5, show_card_frame: true, ...config, image };
        this._render();
    }
    set hass(value) { this._hass = value; this._render(); }
    get hass() { return this._hass; }
    getCardSize() { return 2; }
    _visualType() {
        const requested = this._config.visual_type || "auto";
        if (requested !== "auto")
            return requested;
        const domain = this._config.entity?.split(".")[0];
        return domain === "fan" ? "fan" : domain === "cover" ? "cover" : this._config.image ? "image" : "icon";
    }
    _readout() {
        const state = this._hass?.states?.[this._config.entity];
        if (!state || state.state === "unavailable")
            return { value: "Nicht verfügbar", unit: "" };
        if (state.state === "unknown")
            return { value: "Unbekannt", unit: "" };
        const domain = this._config.entity.split(".")[0];
        let value;
        let unit = this._config.unit || "";
        if (this._config.attribute)
            value = state.attributes[this._config.attribute];
        else if (domain === "fan" && state.attributes.percentage != null) {
            value = state.attributes.percentage;
            unit ||= "%";
        }
        else if (domain === "cover" && Number.isFinite(Number(state.attributes.current_position))) {
            value = 100 - Number(state.attributes.current_position);
            unit ||= "%";
        }
        else
            value = state.state;
        if (value == null || value === "")
            return { value: "–", unit: "" };
        if (!this._config.unit && !unit)
            unit = String(state.attributes.unit_of_measurement || "");
        return { value: typeof value === "number" ? `${Math.round(value * 10) / 10}` : String(value), unit };
    }
    _visualMarkup(type, running) {
        if (type === "image" && this._config.image)
            return `<img class="image" src="${escapeGlassValue(this._config.image)}" alt="">`;
        if (type === "cover") {
            const position = Number(this._hass?.states?.[this._config.entity]?.attributes?.current_position) || 0;
            const slats = Array.from({ length: 7 }, (_, index) => `<i style="--i:${index}"></i>`).join("");
            return `<div class="window" style="--position:${position}%;--tilt:50"><div class="glass"></div><div class="slats">${slats}</div><span class="cords"></span></div>`;
        }
        const icon = type === "fan" ? (running ? "mdi:fan" : "mdi:fan-off") : (this._config.icon || "mdi:chart-box-outline");
        return `<ha-icon class="visual-icon ${type === "fan" && running ? "spinning" : ""}" icon="${escapeGlassValue(icon)}" aria-hidden="true"></ha-icon>`;
    }
    _render() {
        if (!this._config)
            return;
        const state = this._hass?.states?.[this._config.entity];
        const visualType = this._visualType();
        const readout = this._readout();
        const name = String(this._config.name ?? state?.attributes?.friendly_name ?? this._config.entity).trim();
        const imageScale = 0.55 + ((Math.min(5, Math.max(1, Number(this._config.image_size) || 5)) - 1) / 4) * 0.45;
        const valueScale = 0.58 + ((Math.min(5, Math.max(1, Number(this._config.value_size) || 5)) - 1) / 4) * 0.42;
        const running = state?.state === "on";
        const hasFrame = this._config.show_card_frame !== false;
        this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; width:100%; min-width:0; color:var(--primary-text-color,#f3f3f5); font-family:var(--paper-font-body1_-_font-family,"Arial",sans-serif); }
        * { box-sizing:border-box; }
        .card { display:flex; align-items:center; gap:clamp(14px,4vw,32px); width:100%; min-width:0; padding:clamp(16px,3vw,30px); border:1px solid rgba(255,255,255,.1); border-radius:28px; background:radial-gradient(ellipse at 50% 0,#22252a 0,#15171a 62%,#101214 100%); box-shadow:inset 0 1px 1px rgba(255,255,255,.06),0 12px 30px rgba(0,0,0,.2); }
        .card.no-frame { padding:8px 0; border:0; border-radius:0; background:transparent; box-shadow:none; }
        .visual { display:grid; flex:none; width:clamp(${54 * imageScale}px,${18 * imageScale}vw,${136 * imageScale}px); aspect-ratio:1; place-items:center; overflow:hidden; color:#ff8b2b; }
        .visual-icon { width:72%; height:72%; --mdc-icon-size:72%; }
        .visual-icon.spinning { animation:spin 2.4s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }
        .image { width:100%; height:100%; object-fit:contain; }
        .window { position:relative; width:100%; aspect-ratio:1.14; padding:8px 6px 6px; border:6px solid #25262a; border-top-width:13px; border-bottom-width:7px; border-radius:4px; background:linear-gradient(180deg,rgba(23,25,29,.22),rgba(255,145,67,.1)),linear-gradient(130deg,#d9b78c,#6c665b 48%,#ead0a5); box-shadow:0 8px 16px #0008,inset 0 0 0 2px #090a0b; }
        .window::before { content:""; position:absolute; z-index:3; top:-14px; left:-8px; right:-8px; height:8px; border:1px solid #4a4b51; border-radius:2px; background:linear-gradient(#303238,#191a1f); box-shadow:0 3px 8px #0008; }
        .glass { position:absolute; inset:8px 5px 6px; overflow:hidden; border:2px solid #d5b591; background:radial-gradient(ellipse at 70% 42%,#fff5cd 0 4%,#ffe4ae 12%,transparent 35%),linear-gradient(180deg,#aebac0 0%,#eac99b 48%,#f4bb72 70%,#61574c 100%); }
        .glass::before { content:""; position:absolute; inset:38% -8% -18%; background:radial-gradient(ellipse at 12% 72%,#323d38 0 12%,transparent 33%),radial-gradient(ellipse at 34% 64%,#4a4a3c 0 16%,transparent 34%),radial-gradient(ellipse at 60% 73%,#343c37 0 18%,transparent 36%),radial-gradient(ellipse at 88% 62%,#45483c 0 16%,transparent 34%),linear-gradient(178deg,transparent 0 37%,#75604b 39% 42%,#353b38 47% 100%); filter:blur(3px); }
        .glass::after { content:""; position:absolute; z-index:1; inset:0; opacity:.42; background:linear-gradient(100deg,transparent 35%,#fff8df 49%,transparent 62%); }
        .slats { position:absolute; z-index:2; top:0; left:0; right:0; height:calc(100% - var(--position)); overflow:hidden; }
        .slats i { position:absolute; left:0; right:0; top:calc(var(--i) * 13%); height:11%; border:1px solid #4b4140; border-top-color:#77706d; background:linear-gradient(180deg,#343237,#17181b 60%,#51413a); box-shadow:0 2px 3px #0008; transform:skewY(calc((var(--tilt) - 50) * .035deg)); }
        .cords { position:absolute; z-index:3; inset:0; pointer-events:none; background:linear-gradient(90deg,transparent 14%,#17171a 14.3%,#9a7857 14.7%,transparent 15.1% 84%,#18181b 84.3%,#a7835c 84.7%,transparent 85.1%); }
        .readout { min-width:0; flex:1; }
        .name { color:#9295a0; font-size:clamp(13px,2.2vw,18px); line-height:1.2; overflow-wrap:anywhere; }
        .value { margin-top:5px; font-size:clamp(${30 * valueScale}px,${8 * valueScale}vw,${66 * valueScale}px); line-height:1; font-weight:700; font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
        .unit { margin-left:.16em; color:#a0a2ad; font-size:.48em; font-weight:500; }
        @media (prefers-reduced-motion:reduce) { .visual-icon.spinning { animation:none; } }
      </style>
      <article class="card ${hasFrame ? "" : "no-frame"}">
        <div class="visual" aria-hidden="true">${this._visualMarkup(visualType, running)}</div>
        <div class="readout"><div class="name">${escapeGlassValue(name)}</div><div class="value">${escapeGlassValue(readout.value)}${readout.unit ? `<small class="unit">${escapeGlassValue(readout.unit)}</small>` : ""}</div></div>
      </article>`;
        this.shadowRoot.querySelector(".image")?.addEventListener("error", (event) => { event.currentTarget.hidden = true; });
    }
}
class GlassValueCardEditor extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.shadowRoot.innerHTML = "<ha-form></ha-form>";
        const form = this.shadowRoot.querySelector("ha-form");
        const definition = GlassValueCard.getConfigForm();
        form.schema = definition.schema;
        form.computeLabel = definition.computeLabel;
        form.addEventListener("value-changed", (event) => {
            event.stopPropagation();
            this._config = { ...this._config, ...event.detail.value };
            this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config: this._config } }));
        });
    }
    setConfig(config) { this._config = { ...config }; this.shadowRoot.querySelector("ha-form").data = this._config; }
    set hass(value) { this.shadowRoot.querySelector("ha-form").hass = value; }
}
if (!customElements.get("glass-value-card"))
    customElements.define("glass-value-card", GlassValueCard);
if (!customElements.get("glass-value-card-editor"))
    customElements.define("glass-value-card-editor", GlassValueCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "glass-value-card"))
    window.customCards.push({ type: "glass-value-card", name: "Glass Value", description: "Visualisierung und Zustandswert einer Entität.", preview: true, version: GLASS_VALUE_VERSION });

})();

(() => {
const GLASS_SPLITTER_VERSION = "1.0.0";
class GlassSplitterCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this._config = null;
    }
    static getStubConfig() { return { thickness: 1, spacing: 3 }; }
    static getConfigForm() {
        return {
            schema: [
                { name: "thickness", default: 1, selector: { number: { min: 1, max: 5, step: 1, mode: "slider" } } },
                { name: "spacing", default: 3, selector: { number: { min: 1, max: 5, step: 1, mode: "slider" } } },
            ],
            computeLabel: (field) => ({ thickness: "Linienstärke", spacing: "Abstand" }[field.name]),
        };
    }
    static getConfigElement() { return document.createElement("glass-splitter-card-editor"); }
    setConfig(config) {
        this._config = { thickness: 1, spacing: 3, ...config };
        this._render();
    }
    getCardSize() { return 1; }
    _render() {
        if (!this._config)
            return;
        const thickness = Math.min(5, Math.max(1, Number(this._config.thickness) || 1));
        const spacing = Math.min(5, Math.max(1, Number(this._config.spacing) || 3));
        this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; width:100%; }
        .splitter { height:1px; margin:${8 + spacing * 4}px 0; background:#303239; }
      </style>
      <div class="splitter" role="separator" aria-orientation="horizontal" style="height:${thickness}px"></div>`;
    }
}
class GlassSplitterCardEditor extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.shadowRoot.innerHTML = "<ha-form></ha-form>";
        const form = this.shadowRoot.querySelector("ha-form");
        const definition = GlassSplitterCard.getConfigForm();
        form.schema = definition.schema;
        form.computeLabel = definition.computeLabel;
        form.addEventListener("value-changed", (event) => {
            event.stopPropagation();
            this._config = { ...this._config, ...event.detail.value };
            this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config: this._config } }));
        });
    }
    setConfig(config) { this._config = { ...config }; this.shadowRoot.querySelector("ha-form").data = this._config; }
    set hass(value) { this.shadowRoot.querySelector("ha-form").hass = value; }
}
if (!customElements.get("glass-splitter-card"))
    customElements.define("glass-splitter-card", GlassSplitterCard);
if (!customElements.get("glass-splitter-card-editor"))
    customElements.define("glass-splitter-card-editor", GlassSplitterCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "glass-splitter-card"))
    window.customCards.push({ type: "glass-splitter-card", name: "Glass Splitter", description: "Horizontaler Trenner mit einstellbarer Stärke und Abstand.", preview: true, version: GLASS_SPLITTER_VERSION });

})();