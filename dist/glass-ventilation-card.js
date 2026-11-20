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
