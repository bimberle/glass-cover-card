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
window.customCards.push({ type: "glass-button-card", name: "Glass Button Card", description: "Runde, nebeneinander angeordnete Home Assistant Buttons mit Icon-Auswahl.", preview: true, version: CARD_VERSION });