const CARD_VERSION = "1.1.0";
const BUTTON_COLORS = {
  orange: "#ff8b2b",
  white: "#f2f2f4",
  gray: "#8f9299",
};
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
      entity: "",
      name: "",
      icon: "mdi:gesture-tap-button",
      action: "toggle",
      button_size: 5,
      show_name: true,
      color: "orange",
      ...config,
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
      show_name: true,
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
    this.shadowRoot.querySelector(".button")?.addEventListener("click", () => this._callButton());
  }

  _render() {
    if (!this._config) return;
    const level = Math.min(5, Math.max(1, Number(this._config.button_size) || 5));
    const scale = 1 / 3 + ((level - 1) / 4) * (2 / 3);
    const showName = this._config.show_name !== false;
    const color = BUTTON_COLORS[this._config.color] ? this._config.color : "orange";
    const state = this._hass?.states?.[this._config.entity];
    const isActive = state && !["off", "closed", "idle", "standby", "unavailable", "unknown", "not_home"].includes(state.state);
    const name = this._config.name || state?.attributes?.friendly_name || this._config.entity || "Button";
    const icon = this._config.icon || "mdi:gesture-tap-button";

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; width:100%; color:var(--primary-text-color,#f3f3f5); font-family:var(--paper-font-body1_-_font-family,"Arial",sans-serif); }
        * { box-sizing:border-box; }
        .card { width:100%; padding:clamp(16px,3vw,30px); border:1px solid rgba(255,255,255,.1); border-radius:28px; background:radial-gradient(ellipse at 50% 0,#22252a 0,#15171a 62%,#101214 100%); box-shadow:inset 0 1px 1px rgba(255,255,255,.06),0 12px 30px rgba(0,0,0,.2); }
        .button-wrap { display:flex; flex-direction:column; align-items:center; gap:clamp(12px,2vw,20px); }
        .button { display:grid; width:var(--button-size); aspect-ratio:1; place-items:center; padding:0; border:2px solid color-mix(in srgb,var(--accent) 78%,#414348); border-radius:50%; background:linear-gradient(145deg,#222428,#131518); color:var(--accent); box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 8px 18px rgba(0,0,0,.28); transition:border-color .18s ease,color .18s ease,background .18s ease,box-shadow .18s ease,transform .18s ease; cursor:pointer; -webkit-tap-highlight-color:transparent; }
        .button:hover { transform:translateY(-2px); border-color:var(--accent); }
        .button.active { border-color:var(--accent); background:radial-gradient(circle at 50% 45%,color-mix(in srgb,var(--accent) 24%,#1c1b19),#1c1b19 72%); box-shadow:inset 0 0 24px color-mix(in srgb,var(--accent) 18%,transparent),0 0 0 1px color-mix(in srgb,var(--accent) 35%,transparent),0 8px 22px rgba(0,0,0,.3); }
        ha-icon { display:block; --mdc-icon-size:var(--icon-size); }
        .name { max-width:100%; color:#e4e4e7; font-size:clamp(13px,2.2vw,20px); line-height:1.2; text-align:center; overflow-wrap:anywhere; }
        @media (prefers-reduced-motion:reduce) { *,*::before,*::after { transition:none !important; } }
      </style>
      <article class="card" style="--accent:${BUTTON_COLORS[color]};--button-size:clamp(${72 * scale}px,${15 * scale}vw,${114 * scale}px);--icon-size:clamp(${Math.min(16, 72 * scale * .48)}px,${15 * scale * .48}vw,${114 * scale * .48}px)">
        <div class="button-wrap">
          <button class="button ${isActive ? "active" : ""}" aria-label="${escapeHtml(name)}" title="${escapeHtml(name)}">
            <ha-icon icon="${escapeHtml(icon)}"></ha-icon>
          </button>
          ${showName ? `<span class="name">${escapeHtml(name)}</span>` : ""}
        </div>
      </article>`;
    this._bindEvents();
  }
}

class GlassButtonCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = {
      entity: "",
      name: "",
      icon: "mdi:gesture-tap-button",
      action: "toggle",
      button_size: 5,
      show_name: true,
      color: "orange",
      ...config,
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
    const entityOptions = (selected) => `<option value="">Entitaet auswaehlen</option>${entities.map((entity) => `<option value="${escapeHtml(entity)}" ${entity === selected ? "selected" : ""}>${escapeHtml(entity)}</option>`).join("")}`;
    const iconOptions = (selected) => [...new Set([selected, ...BUTTON_ICONS])].filter(Boolean).map((icon) => `<option value="${escapeHtml(icon)}" ${icon === selected ? "selected" : ""}>${escapeHtml(icon)}</option>`).join("");

    this.innerHTML = `
      <style>
        .form { display:grid; gap:14px; padding:12px 0; }
        label { display:grid; gap:6px; min-width:0; }
        input,select,button { min-height:40px; padding:8px 10px; color:var(--primary-text-color); background:var(--input-fill-color,#202124); border:1px solid var(--divider-color,#555); border-radius:4px; font:inherit; }
        .check { display:flex; align-items:center; gap:9px; }
        .icon-preview { align-self:center; justify-self:start; width:28px; height:28px; --mdc-icon-size:28px; }
      </style>
      <div class="form">
        <label>Entitaet<select data-setting="entity">${entityOptions(this._config.entity)}</select></label>
        <label>Icon<select data-setting="icon">${iconOptions(this._config.icon || "mdi:gesture-tap-button")}</select><ha-icon class="icon-preview" icon="${escapeHtml(this._config.icon || "mdi:gesture-tap-button")}"></ha-icon></label>
        <label>Text<input data-setting="name" value="${escapeHtml(this._config.name || "")}" placeholder="Anzeigename oder Friendly Name"></label>
        <label>Aktion<select data-setting="action"><option value="toggle" ${this._config.action !== "more-info" ? "selected" : ""}>Ein-/Ausschalten</option><option value="more-info" ${this._config.action === "more-info" ? "selected" : ""}>Mehr Informationen anzeigen</option></select></label>
        <label>Farbe<select data-setting="color"><option value="orange" ${!BUTTON_COLORS[this._config.color] || this._config.color === "orange" ? "selected" : ""}>Orange</option><option value="white" ${this._config.color === "white" ? "selected" : ""}>Weiss</option><option value="gray" ${this._config.color === "gray" ? "selected" : ""}>Grau</option></select></label>
        <label>Button-Groesse (${size})<input data-setting="button_size" type="range" min="1" max="5" step="1" value="${size}"></label>
        <label class="check"><input data-setting="show_name" type="checkbox" ${this._config.show_name !== false ? "checked" : ""}> Buttontexte anzeigen</label>
      </div>`;

    this.querySelectorAll("[data-setting]").forEach((input) => input.addEventListener("change", (event) => {
      const { setting } = event.target.dataset;
      const value = event.target.type === "checkbox" ? event.target.checked : (event.target.type === "range" ? Number(event.target.value) : event.target.value);
      this._update({ [setting]: value });
    }));
  }
}

if (!customElements.get("glass-button-card")) customElements.define("glass-button-card", GlassButtonCard);
if (!customElements.get("glass-button-card-editor")) customElements.define("glass-button-card-editor", GlassButtonCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "glass-button-card")) {
  window.customCards.push({ type: "glass-button-card", name: "Glass Button Card", description: "Einzelner runder Home Assistant Button mit Icon- und Farbauswahl.", preview: true, version: CARD_VERSION });
}