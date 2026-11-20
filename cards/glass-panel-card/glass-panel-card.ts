const CARD_VERSION = "2.0.0";
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
    await customElements.whenDefined("hui-card-picker");
    await customElements.whenDefined("hui-card-element-editor");
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
    this._selectedCard = -1;
    this._showPicker = false;
    this._renderShell();
  }

  setConfig(config) {
    const previousCards = JSON.stringify(this._config?.cards ?? []);
    this._config = normalizePanelConfig(config);
    const form = this.shadowRoot.querySelector("ha-form");
    if (form) {
      form.schema = PANEL_FORM_SCHEMA;
      form.data = this._config;
      form.hass = this._hass;
      form.computeLabel = (field) => ({ panel_size: "Panel-Größe" })[field.name] || field.name;
    }
    if (previousCards !== JSON.stringify(this._config.cards)) {
      this._selectedCard = Math.min(this._selectedCard, this._config.cards.length - 1);
      this._renderCardList();
    }
    this._syncCardEditor();
  }

  set hass(hass) {
    this._hass = hass;
    const form = this.shadowRoot.querySelector("ha-form");
    const picker = this.shadowRoot.querySelector("hui-card-picker");
    const cardEditor = this.shadowRoot.querySelector("hui-card-element-editor");
    if (form) form.hass = hass;
    if (picker) picker.hass = hass;
    if (cardEditor) cardEditor.hass = hass;
  }

  set lovelace(lovelace) {
    this._lovelace = lovelace;
    const picker = this.shadowRoot.querySelector("hui-card-picker");
    const cardEditor = this.shadowRoot.querySelector("hui-card-element-editor");
    if (picker) picker.lovelace = lovelace;
    if (cardEditor) cardEditor.lovelace = lovelace;
  }

  _renderShell() {
    this.shadowRoot.innerHTML = `
      <style>
        .editor { display:grid; gap:20px; }
        .cards-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .card-tabs { display:flex; flex:1; min-width:0; gap:6px; overflow-x:auto; }
        .card-order { display:flex; gap:4px; }
        button { min-height:40px; padding:8px 12px; color:var(--primary-text-color); background:var(--card-background-color,#202124); border:1px solid var(--divider-color,#555); border-radius:6px; font:inherit; cursor:pointer; }
        button[aria-pressed="true"] { border-color:var(--primary-color,#ff8b2b); }
        .card-editor[hidden],.card-picker[hidden] { display:none; }
        .card-picker { min-height:300px; }
      </style>
      <div class="editor">
        <ha-form></ha-form>
        <section class="cards-manager">
          <div class="cards-toolbar">
            <div class="card-tabs"></div>
            <div class="card-order">
              <button type="button" class="move-before" title="Karte nach links verschieben" aria-label="Karte nach links verschieben">←</button>
              <button type="button" class="move-after" title="Karte nach rechts verschieben" aria-label="Karte nach rechts verschieben">→</button>
            </div>
            <button type="button" class="remove-card" title="Ausgewählte Karte entfernen">Entfernen</button>
            <button type="button" class="add-card">Karte hinzufügen</button>
          </div>
          <hui-card-element-editor class="card-editor" hidden></hui-card-element-editor>
          <hui-card-picker class="card-picker" hide-clipboard hidden></hui-card-picker>
        </section>
      </div>`;

    this.shadowRoot.querySelector("ha-form")?.addEventListener("value-changed", (event) => this._handleFormChanged(event));
    this.shadowRoot.querySelector("hui-card-picker")?.addEventListener("config-changed", (event) => this._handleCardPicked(event));
    this.shadowRoot.querySelector("hui-card-element-editor")?.addEventListener("config-changed", (event) => this._handleChildChanged(event));
    this.shadowRoot.querySelector(".add-card")?.addEventListener("click", () => this._togglePicker());
    this.shadowRoot.querySelector(".remove-card")?.addEventListener("click", () => this._removeSelectedCard());
    this.shadowRoot.querySelector(".move-before")?.addEventListener("click", () => this._moveSelectedCard(-1));
    this.shadowRoot.querySelector(".move-after")?.addEventListener("click", () => this._moveSelectedCard(1));
  }

  _handleFormChanged(event) {
    this._config = { ...this._config, ...event.detail.value };
    this._notifyConfig();
  }

  _handleCardPicked(event) {
    event.stopPropagation();
    this._config = { ...this._config, cards: [...this._config.cards, event.detail.config] };
    this._selectedCard = this._config.cards.length - 1;
    this._showPicker = false;
    this._renderCardList();
    this._syncCardEditor();
    this._notifyConfig();
  }

  _handleChildChanged(event) {
    event.stopPropagation();
    if (this._selectedCard < 0) return;
    const cards = [...this._config.cards];
    cards[this._selectedCard] = event.detail.config ?? event.detail.value;
    this._config = { ...this._config, cards };
    this._notifyConfig();
  }

  _togglePicker() {
    this._showPicker = !this._showPicker;
    const picker = this.shadowRoot.querySelector("hui-card-picker");
    const editor = this.shadowRoot.querySelector("hui-card-element-editor");
    if (picker) {
      picker.hidden = !this._showPicker;
      picker.hass = this._hass;
      picker.lovelace = this._lovelace;
    }
    if (editor) editor.hidden = this._showPicker || this._selectedCard < 0;
  }

  _removeSelectedCard() {
    if (this._selectedCard < 0) return;
    const cards = this._config.cards.filter((_, index) => index !== this._selectedCard);
    this._config = { ...this._config, cards };
    this._selectedCard = Math.min(this._selectedCard, cards.length - 1);
    this._renderCardList();
    this._syncCardEditor();
    this._notifyConfig();
  }

  _moveSelectedCard(offset) {
    const target = this._selectedCard + offset;
    if (target < 0 || target >= this._config.cards.length) return;
    const cards = [...this._config.cards];
    [cards[this._selectedCard], cards[target]] = [cards[target], cards[this._selectedCard]];
    this._config = { ...this._config, cards };
    this._selectedCard = target;
    this._renderCardList();
    this._syncCardEditor();
    this._notifyConfig();
  }

  _selectCard(index) {
    this._selectedCard = index;
    this._showPicker = false;
    this._renderCardList();
    this._syncCardEditor();
  }

  _renderCardList() {
    const tabs = this.shadowRoot.querySelector(".card-tabs");
    if (!tabs) return;
    tabs.innerHTML = this._config.cards.map((card, index) => `<button type="button" data-card-index="${index}" aria-pressed="${index === this._selectedCard}">${escapePanelText(card.type || `Karte ${index + 1}`)}</button>`).join("");
    tabs.querySelectorAll<HTMLButtonElement>("[data-card-index]").forEach((button) => button.addEventListener("click", () => this._selectCard(Number(button.dataset.cardIndex))));
    const picker = this.shadowRoot.querySelector("hui-card-picker");
    const editor = this.shadowRoot.querySelector("hui-card-element-editor");
    if (picker) picker.hidden = !this._showPicker;
    if (editor) editor.hidden = this._showPicker || this._selectedCard < 0;
  }

  _syncCardEditor() {
    const editor = this.shadowRoot.querySelector("hui-card-element-editor");
    if (!editor || this._selectedCard < 0) return;
    editor.hass = this._hass;
    editor.lovelace = this._lovelace;
    editor.value = this._config.cards[this._selectedCard];
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