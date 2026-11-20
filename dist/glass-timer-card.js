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
