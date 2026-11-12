const CARD_VERSION = "1.0.0";
const clampColumns = (value) => Math.min(6, Math.max(1, Number(value) || 3));
const escapePanelText = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
})[char]);

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
    this._config = {
      title: "",
      subtitle: "",
      show_action_button: false,
      action_icon: "mdi:gesture-tap-button",
      action: "toggle",
      columns: 3,
      cards: [],
      ...config,
      cards: Array.isArray(config.cards) ? config.cards : [],
    };
    this._childrenGeneration += 1;
    this._children = [];
    this._renderShell();
    return this._loadChildren();
  }

  set hass(hass) {
    this._hass = hass;
    for (const child of this._children) child.hass = hass;
    this._updateActionState();
  }

  get hass() {
    return this._hass;
  }

  getCardSize() {
    return Math.max(2, Math.ceil(this._config?.cards?.length / clampColumns(this._config?.columns)) + 2);
  }

  static getStubConfig() {
    return {
      title: "Aktionen",
      subtitle: "Wohnzimmer",
      show_action_button: true,
      action_entity: "light.wohnzimmer",
      action_icon: "mdi:sofa-outline",
      action: "toggle",
      columns: 3,
      cards: [],
    };
  }

  static getConfigForm() {
    const schema = [
      { name: "title", default: "", selector: { text: {} } },
      { name: "subtitle", default: "", selector: { text: {} } },
      { name: "show_action_button", default: false, selector: { boolean: {} } },
      { name: "action_entity", selector: { entity: {} }, visible: { field: "show_action_button", value: true } },
      { name: "action_icon", selector: { icon: {} }, visible: { field: "show_action_button", value: true } },
      {
        name: "action",
        default: "toggle",
        selector: { select: { mode: "dropdown", options: [["toggle", "Ein-/Ausschalten"], ["more-info", "Mehr Informationen anzeigen"]] } },
        visible: { field: "show_action_button", value: true },
      },
      { name: "columns", default: 3, selector: { number: { min: 1, max: 6, step: 1, mode: "slider" } } },
      { name: "cards", default: [], selector: { object: {} } },
    ];
    return {
      schema,
      computeLabel: (field) => ({
        title: "Titel",
        subtitle: "Untertitel",
        show_action_button: "Button oben rechts anzeigen",
        action_entity: "Button-Entität",
        action_icon: "Button-Icon",
        action: "Button-Aktion",
        columns: "Karten pro Reihe",
        cards: "Enthaltene Karten (YAML-Liste)",
      })[field.name],
    };
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
      for (const config of cardsConfig) {
        const card = helpers.createCardElement(config);
        card.hass = this._hass;
        this._children.push(card);
        container.append(card);
      }
      this._updateActionState();
    } catch (error) {
      const container = this.shadowRoot.querySelector(".children");
      if (container) container.textContent = `Karten konnten nicht geladen werden: ${error.message}`;
    }
  }

  _callHeaderAction() {
    const entity = this._config.action_entity;
    if (!this._hass || !entity) return;
    if (this._config.action === "more-info") {
      this.dispatchEvent(new CustomEvent("hass-more-info", {
        bubbles: true,
        composed: true,
        detail: { entityId: entity },
      }));
      return;
    }
    this._hass.callService("homeassistant", "toggle", { entity_id: entity });
  }

  _updateActionState() {
    const button = this.shadowRoot.querySelector(".header-action");
    if (!button) return;
    const state = this._hass?.states?.[this._config.action_entity];
    button.classList.toggle("active", Boolean(state && !["off", "closed", "idle", "standby", "unavailable", "unknown", "not_home"].includes(state.state)));
  }

  _renderShell() {
    const title = escapePanelText(this._config.title);
    const subtitle = escapePanelText(this._config.subtitle);
    const actionVisible = this._config.show_action_button && this._config.action_entity;
    const columns = clampColumns(this._config.columns);
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; width:100%; color:var(--primary-text-color,#f3f3f5); font-family:var(--paper-font-body1_-_font-family,"Arial",sans-serif); }
        * { box-sizing:border-box; }
        .panel { width:100%; padding:clamp(20px,4vw,36px); border:1px solid rgba(255,255,255,.1); border-radius:28px; background:radial-gradient(ellipse at 48% 0,#22252a 0,#15171a 62%,#101214 100%); box-shadow:inset 0 1px 1px rgba(255,255,255,.06),0 12px 30px rgba(0,0,0,.2); }
        .header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:clamp(20px,3vw,30px); }
        .titles { min-width:0; }
        .title { margin:0; color:#9295a0; font-size:clamp(13px,2.1vw,17px); font-weight:700; line-height:1.2; text-transform:uppercase; }
        .subtitle { margin:7px 0 0; color:var(--primary-text-color,#f3f3f5); font-size:clamp(23px,4vw,34px); font-weight:700; line-height:1.1; overflow-wrap:anywhere; }
        .header-action { display:grid; flex:none; width:clamp(56px,10vw,76px); aspect-ratio:1; place-items:center; padding:0; border:2px solid #34373d; border-radius:50%; background:linear-gradient(145deg,#24272c,#141619); color:#ff8b2b; box-shadow:0 6px 15px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.05); cursor:pointer; }
        .header-action.active { border-color:#ff8b2b; color:#ff9b4a; box-shadow:inset 0 0 20px rgba(255,139,43,.12),0 0 0 1px rgba(255,139,43,.2),0 6px 15px rgba(0,0,0,.25); }
        .header-action ha-icon { --mdc-icon-size:30px; }
        .children { display:grid; grid-template-columns:repeat(${columns},minmax(0,1fr)); align-items:stretch; gap:clamp(12px,2vw,24px); }
        .children > * { min-width:0; }
        .empty { color:var(--secondary-text-color,#a0a2ad); }
        @media (max-width:640px) { .children { grid-template-columns:repeat(${Math.min(columns, 2)},minmax(0,1fr)); } }
        @media (max-width:360px) { .panel { padding:18px; } .children { grid-template-columns:1fr; } }
      </style>
      <article class="panel">
        <header class="header">
          <div class="titles">${title ? `<div class="title">${title}</div>` : ""}${subtitle ? `<h2 class="subtitle">${subtitle}</h2>` : ""}</div>
          ${actionVisible ? `<button class="header-action" aria-label="${escapePanelText(this._config.action_entity)}" title="${escapePanelText(this._config.action_entity)}"><ha-icon icon="${escapePanelText(this._config.action_icon || "mdi:gesture-tap-button")}"></ha-icon></button>` : ""}
        </header>
        <div class="children">${this._config.cards.length ? "" : `<div class="empty">Keine Karten konfiguriert.</div>`}</div>
      </article>`;
    this.shadowRoot.querySelector(".header-action")?.addEventListener("click", () => this._callHeaderAction());
  }
}

if (!customElements.get("glass-panel-card")) customElements.define("glass-panel-card", GlassPanelCard);

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "glass-panel-card")) {
  window.customCards.push({ type: "glass-panel-card", name: "Glass Panel Card", description: "Kartencontainer mit Titel, Untertitel und optionaler Aktion.", preview: true, version: CARD_VERSION });
}