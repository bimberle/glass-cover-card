interface GlassTextConfig extends GlassCardConfig {
  title?: string;
  subtitle?: string;
  title_size?: number;
  button_size?: number;
  show_action_button?: boolean;
  action_entity?: string;
  action_icon?: string;
  action?: "toggle" | "more-info";
}

const GLASS_TEXT_VERSION = "1.0.0";
const escapeGlassText = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
}[character] || character));

class GlassTextCard extends HTMLElement {
  [key: string]: any;
  declare _config: GlassTextConfig | null;
  declare _hass: GlassHass | null;

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
      computeLabel: (field: { name: string }) => ({
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

  setConfig(config: GlassTextConfig) {
    this._config = { title_size: 5, button_size: 5, show_action_button: false, action: "toggle", ...config };
    this._render();
    this._syncActionState();
  }

  set hass(value: GlassHass | null) {
    this._hass = value;
    this._syncActionState();
  }

  get hass() { return this._hass; }
  getCardSize() { return 2; }

  _callAction() {
    const entity = this._config?.action_entity;
    if (!this._hass || !entity) return;
    if (this._config.action === "more-info") {
      this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: entity } }));
    } else this._hass.callService("homeassistant", "toggle", { entity_id: entity });
  }

  _syncActionState() {
    const button = this.shadowRoot.querySelector<HTMLButtonElement>(".header-action");
    if (!button) return;
    const state = this._hass?.states?.[this._config?.action_entity || ""];
    button.classList.toggle("active", Boolean(state && !["off", "closed", "idle", "standby", "unavailable", "unknown", "not_home"].includes(state.state)));
    button.classList.toggle("inactive", Boolean(state && ["off", "closed", "idle", "standby", "not_home"].includes(state.state)));
    const label = this.shadowRoot.querySelector(".action-state");
    if (label) label.textContent = ["on", "off"].includes(state?.state) ? (state.state === "on" ? "An" : "Aus") : "";
  }

  _render() {
    if (!this._config) return;
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
  [key: string]: any;

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

  setConfig(config: GlassTextConfig) { this._config = { ...config }; this.shadowRoot.querySelector("ha-form").data = this._config; }
  set hass(value: GlassHass | null) { this.shadowRoot.querySelector("ha-form").hass = value; }
}

if (!customElements.get("glass-text-card")) customElements.define("glass-text-card", GlassTextCard);
if (!customElements.get("glass-text-card-editor")) customElements.define("glass-text-card-editor", GlassTextCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "glass-text-card")) window.customCards.push({ type: "glass-text-card", name: "Glass Text", description: "Überschrift mit optionalem Aktionsbutton.", preview: true, version: GLASS_TEXT_VERSION });