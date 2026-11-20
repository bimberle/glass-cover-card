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
