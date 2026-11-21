const CARD_VERSION = "2.0.1";
const escapePanelText = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
})[char]);

const normalizePanelConfig = (config: GlassCardConfig = {}) => {
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
  [key: string]: any;
  declare _config: GlassCardConfig | null;
  declare _hass: GlassHass | null;

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
    for (const child of this._children) child.hass = hass;
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
    await (stackCard as any).getConfigElement();
    await customElements.whenDefined("hui-stack-card-editor");
    return document.createElement("glass-panel-card-editor");
  }

  async _loadChildren() {
    const cardsConfig = this._config.cards;
    const generation = this._childrenGeneration;
    try {
      this._helpersPromise ??= window.loadCardHelpers();
      const helpers = await this._helpersPromise;
      if (!this._config || generation !== this._childrenGeneration) return;
      const container = this.shadowRoot.querySelector(".children");
      if (!container) return;
      container.replaceChildren();
      this._children = [];
      if (cardsConfig.length === 0) {
        container.innerHTML = `<div class="empty">Keine Karten konfiguriert.</div>`;
      } else {
        const stack = helpers.createCardElement({ type: "vertical-stack", cards: cardsConfig });
        stack.hass = this._hass;
        this._children = [stack];
        container.append(stack);
      }
    } catch (error) {
      const container = this.shadowRoot.querySelector(".children");
      if (container) container.textContent = `Karten konnten nicht geladen werden: ${error.message}`;
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
  [key: string]: any;

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
    if (form) form.hass = hass;
    if (stackEditor) (stackEditor as any).hass = hass;
  }

  set lovelace(lovelace) {
    this._lovelace = lovelace;
    const stackEditor = this.shadowRoot.querySelector("hui-stack-card-editor");
    if (stackEditor) (stackEditor as any).lovelace = lovelace;
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
    if (!Array.isArray(stackConfig?.cards)) return;
    this._config = { ...this._config, cards: stackConfig.cards };
    this._notifyConfig();
  }

  _syncStackEditor() {
    const editor = this.shadowRoot.querySelector("hui-stack-card-editor");
    if (!editor || !this._config) return;
    (editor as any).hass = this._hass;
    (editor as any).lovelace = this._lovelace;
    (editor as any).setConfig({ type: "vertical-stack", cards: this._config.cards });
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

if (!customElements.get("glass-panel-card")) customElements.define("glass-panel-card", GlassPanelCard);
if (!customElements.get("glass-panel-card-editor")) customElements.define("glass-panel-card-editor", GlassPanelCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "glass-panel-card")) {
  window.customCards.push({ type: "glass-panel-card", name: "Glass Panel Card", description: "Panel-Hülle für beliebig viele Lovelace-Kindkarten.", preview: true, version: CARD_VERSION });
}