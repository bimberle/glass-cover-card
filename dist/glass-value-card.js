const GLASS_VALUE_VERSION = "1.0.0";
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
            return `<div class="window" style="--position:${position}%"><div class="glass"><span class="slats"></span></div></div>`;
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
        .window { position:relative; width:82%; height:100%; padding:11% 8% 8%; border:6px solid #25262a; border-top-width:12px; border-bottom-width:7px; border-radius:4px; background:linear-gradient(130deg,#d9b78c,#6c665b 48%,#ead0a5); box-shadow:inset 0 0 0 2px #090a0b,0 8px 16px #0008; }
        .window::before { content:""; position:absolute; top:-13px; left:-8px; right:-8px; height:7px; border:1px solid #4a4b51; background:linear-gradient(#303238,#191a1f); }
        .glass { position:absolute; inset:10px 6px 6px; overflow:hidden; border:2px solid #d5b591; background:linear-gradient(180deg,#b8ab92,#d8bb94 52%,#87674e); }
        .slats { position:absolute; top:0; left:0; right:0; height:var(--position); background:repeating-linear-gradient(to bottom,#343237 0 8%,#77706d 9%,#17181b 12%,transparent 13%); }
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
