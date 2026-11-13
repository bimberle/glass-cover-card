const CARD_VERSION = "1.6.1";
const BUTTON_COLORS = {
  orange: "#ff8b2b",
  white: "#f2f2f4",
  gray: "#8f9299",
  green: "#4bc785",
  red: "#f05c5c",
};
const BUTTON_COLOR_OPTIONS = [{ value: "orange", label: "Orange" }, { value: "white", label: "Weiß" }, { value: "gray", label: "Grau" }, { value: "green", label: "Grün" }, { value: "red", label: "Rot" }];
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
    this._dragging = false;
    this._brightness = 0;
    this._pendingBrightnessState = null;
    this._brightnessTimer = null;
  }

  setConfig(config) {
    window.clearTimeout(this._brightnessTimer);
    this._pendingBrightnessState = null;
    this._dragging = false;
    this._config = {
      entity: "",
      name: "",
      icon: "mdi:gesture-tap-button",
      action: "toggle",
      button_size: 5,
      show_name: true,
      show_card_frame: true,
      show_brightness_slider: true,
      color: "orange",
      ...config,
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config || !this.shadowRoot.querySelector(".button")) {
      this._render();
      return;
    }
    this._syncEntityState();
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

  static getConfigForm() {
    const schema = [
      { name: "entity", required: true, selector: { entity: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "icon_active", selector: { icon: {} } },
      { name: "color_active", selector: { select: { mode: "dropdown", options: BUTTON_COLOR_OPTIONS } } },
      { name: "icon_inactive", selector: { icon: {} } },
      { name: "color_inactive", default: "gray", selector: { select: { mode: "dropdown", options: BUTTON_COLOR_OPTIONS } } },
      { name: "binary_sensor_active_state", default: "on", selector: { select: { mode: "dropdown", options: [{ value: "on", label: "Offen" }, { value: "off", label: "Geschlossen" }] } } },
      { name: "name", selector: { text: {} } },
      {
        name: "action",
        default: "toggle",
        selector: { select: { mode: "dropdown", options: [{ value: "toggle", label: "Ein-/Ausschalten" }, { value: "more-info", label: "Mehr Informationen anzeigen" }] } },
      },
      {
        name: "color",
        default: "orange",
        selector: { select: { mode: "dropdown", options: BUTTON_COLOR_OPTIONS } },
      },
      { name: "button_size", default: 5, selector: { number: { min: 1, max: 5, step: 1, mode: "slider" } } },
      { name: "show_name", default: true, selector: { boolean: {} } },
      { name: "show_card_frame", default: true, selector: { boolean: {} } },
      { name: "show_brightness_slider", default: true, selector: { boolean: {} } },
    ];
      return {
        schema,
        computeLabel: (field) => ({
          entity: "Entität",
          icon: "Icon",
          icon_active: "Binary Sensor: Icon für aktiven Zustand",
          color_active: "Binary Sensor: Farbe für aktiven Zustand",
          icon_inactive: "Binary Sensor: Icon für inaktiven Zustand",
          color_inactive: "Binary Sensor: Farbe für inaktiven Zustand",
          binary_sensor_active_state: "Binary Sensor: Zustand mit Akzentfarbe",
          name: "Text",
          action: "Aktion",
          color: "Farbe",
          button_size: "Button-Größe",
          show_name: "Buttontext anzeigen",
          show_card_frame: "Kartenrahmen anzeigen",
          show_brightness_slider: "Helligkeitsregler anzeigen",
        })[field.name],
      };
  }

  static getStubConfig() {
    return {
      button_size: 5,
      show_name: true,
      show_card_frame: true,
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
    if (button.entity.startsWith("binary_sensor.") || (button.action || "toggle") === "more-info") {
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
    const slider = this.shadowRoot.querySelector(".dimmer");
    slider?.addEventListener("pointerdown", (event) => this._startBrightnessDrag(event));
    slider?.addEventListener("pointermove", (event) => this._moveBrightnessDrag(event));
    slider?.addEventListener("pointerup", (event) => this._endBrightnessDrag(event));
    slider?.addEventListener("pointercancel", () => { this._dragging = false; slider.classList.remove("dragging"); this._syncEntityState(); });
    slider?.addEventListener("keydown", (event) => this._brightnessKey(event));
  }

  _isDimmable(state) {
    if (this._config.show_brightness_slider === false || !this._config.entity?.startsWith("light.") || !state) return false;
    const modes = state.attributes?.supported_color_modes || [];
    return modes.some((mode) => ["brightness", "color_temp", "hs", "xy", "rgb", "rgbw", "rgbww", "white"].includes(mode)) || Boolean((state.attributes?.supported_features || 0) & 1);
  }

  _displayBrightness(value) {
    this._brightness = Math.max(0, Math.min(100, Math.round(value)));
    const slider = this.shadowRoot.querySelector(".dimmer");
    if (slider) {
      slider.style.setProperty("--brightness", this._brightness);
      slider.setAttribute("aria-valuenow", String(this._brightness));
      slider.setAttribute("aria-valuetext", `${this._brightness} %`);
    }
    const valueLabel = this.shadowRoot.querySelector(".brightness-value");
    if (valueLabel) valueLabel.textContent = `${this._brightness} %`;
  }

  _setBrightnessFromPointer(event) {
    const bounds = this.shadowRoot.querySelector(".dimmer").getBoundingClientRect();
    const angle = Math.atan2(event.clientX - (bounds.left + bounds.width / 2), -(event.clientY - (bounds.top + bounds.height / 2)));
    this._displayBrightness(((angle + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * 100);
  }

  _startBrightnessDrag(event) {
    const state = this._hass?.states?.[this._config.entity];
    if (event.button !== 0 || !this._isDimmable(state) || ["unavailable", "unknown"].includes(state.state)) return;
    event.preventDefault();
    this._dragging = true;
    event.currentTarget.classList.add("dragging");
    event.currentTarget.setPointerCapture(event.pointerId);
    this._setBrightnessFromPointer(event);
  }

  _moveBrightnessDrag(event) {
    if (this._dragging) this._setBrightnessFromPointer(event);
  }

  _endBrightnessDrag(event) {
    if (!this._dragging) return;
    this._setBrightnessFromPointer(event);
    this._dragging = false;
    event.currentTarget.classList.remove("dragging");
    this._applyBrightness();
  }

  _applyBrightness() {
    if (!this._hass || !this._config.entity) return;
    this._pendingBrightnessState = this._hass.states?.[this._config.entity] || null;
    window.clearTimeout(this._brightnessTimer);
    this._brightnessTimer = window.setTimeout(() => {
      this._pendingBrightnessState = null;
      this._syncEntityState();
    }, 2500);
    if (this._brightness === 0) this._hass.callService("light", "turn_off", { entity_id: this._config.entity });
    else this._hass.callService("light", "turn_on", { entity_id: this._config.entity, brightness_pct: this._brightness });
  }

  _brightnessKey(event) {
    const state = this._hass?.states?.[this._config.entity];
    if (!this._isDimmable(state) || ["unavailable", "unknown"].includes(state.state)) return;
    let value = this._brightness;
    if (event.key === "ArrowUp" || event.key === "ArrowRight") value += 5;
    else if (event.key === "ArrowDown" || event.key === "ArrowLeft") value -= 5;
    else if (event.key === "Home") value = 0;
    else if (event.key === "End") value = 100;
    else return;
    event.preventDefault();
    this._displayBrightness(value);
    this._applyBrightness();
  }

  _syncEntityState() {
    const button = this.shadowRoot.querySelector(".button");
    if (!button) return;
    const state = this._hass?.states?.[this._config.entity];
    const binarySensor = this._config.entity?.startsWith("binary_sensor.");
    const binaryKnown = binarySensor && ["on", "off"].includes(state?.state);
    const isActive = binarySensor ? binaryKnown && state.state === (this._config.binary_sensor_active_state === "off" ? "off" : "on") : state && !["off", "closed", "idle", "standby", "unavailable", "unknown", "not_home"].includes(state.state);
    button.classList.toggle("binary-sensor", Boolean(binarySensor));
    button.classList.toggle("active", Boolean(isActive));
    button.classList.toggle("inactive", Boolean(binarySensor ? binaryKnown && !isActive : state && ["off", "closed", "idle", "standby", "not_home"].includes(state.state)));
    const icon = this.shadowRoot.querySelector(".button ha-icon");
    if (icon) icon.setAttribute("icon", (binaryKnown ? ((isActive ? this._config.icon_active : this._config.icon_inactive) || (state.state === "on" ? this._config.icon_open : this._config.icon_closed)) : null) || this._config.icon || "mdi:gesture-tap-button");
    const dimmable = this._isDimmable(state);
    const available = !["unavailable", "unknown"].includes(state?.state);
    button.classList.toggle("dimmable", dimmable);
    const slider = this.shadowRoot.querySelector(".dimmer");
    if (slider) {
      slider.classList.toggle("visible", dimmable);
      slider.classList.toggle("inactive", Boolean(state && state.state === "off"));
      slider.classList.toggle("disabled", !available);
      slider.setAttribute("tabindex", dimmable && available ? "0" : "-1");
      slider.setAttribute("aria-hidden", String(!dimmable));
      slider.setAttribute("aria-disabled", String(!available));
    }
    if (this._pendingBrightnessState && this._pendingBrightnessState !== state) {
      this._pendingBrightnessState = null;
      window.clearTimeout(this._brightnessTimer);
    }
    if (!this._dragging && !this._pendingBrightnessState) this._displayBrightness(isActive && Number.isFinite(state?.attributes?.brightness) ? state.attributes.brightness / 255 * 100 : 0);
    const stateLabel = this.shadowRoot.querySelector(".state-value");
    if (stateLabel) stateLabel.textContent = !dimmable && ["on", "off"].includes(state?.state) ? (binarySensor ? (state.state === "on" ? "Offen" : "Geschlossen") : (state.state === "on" ? "An" : "Aus")) : "";
    const name = this._config.name || state?.attributes?.friendly_name || this._config.entity || "Button";
    button.setAttribute("aria-label", name);
    button.setAttribute("title", name);
    const label = this.shadowRoot.querySelector(".name");
    if (label && !this._config.name) label.textContent = name;
  }

  _render() {
    if (!this._config) return;
    const level = Math.min(5, Math.max(1, Number(this._config.button_size) || 5));
    const scale = 1 / 3 + ((level - 1) / 4) * (2 / 3);
    const showName = this._config.show_name !== false;
    const showCardFrame = this._config.show_card_frame !== false;
    const color = BUTTON_COLORS[this._config.color] ? this._config.color : "orange";
    const activeColor = BUTTON_COLORS[this._config.color_active] || BUTTON_COLORS[color];
    const inactiveColor = BUTTON_COLORS[this._config.color_inactive] || BUTTON_COLORS.gray;
    const state = this._hass?.states?.[this._config.entity];
    const isActive = state && !["off", "closed", "idle", "standby", "unavailable", "unknown", "not_home"].includes(state.state);
    const name = this._config.name || state?.attributes?.friendly_name || this._config.entity || "Button";
    const icon = this._config.icon || "mdi:gesture-tap-button";

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; width:100%; color:var(--primary-text-color,#f3f3f5); font-family:var(--paper-font-body1_-_font-family,"Arial",sans-serif); }
        * { box-sizing:border-box; }
        .card { width:100%; padding:clamp(16px,3vw,30px); border:1px solid rgba(255,255,255,.1); border-radius:28px; background:radial-gradient(ellipse at 50% 0,#22252a 0,#15171a 62%,#101214 100%); box-shadow:inset 0 1px 1px rgba(255,255,255,.06),0 12px 30px rgba(0,0,0,.2); }
        .card.no-frame { padding:0; border:0; border-radius:0; background:transparent; box-shadow:none; }
        .button-wrap { display:flex; flex-direction:column; align-items:center; gap:clamp(12px,2vw,20px); }
        .button-control { position:relative; width:var(--button-size); aspect-ratio:1; flex:none; }
        .button { display:grid; width:100%; height:100%; place-items:center; padding:0; border:2px solid color-mix(in srgb,var(--accent) 78%,#414348); border-radius:50%; background:linear-gradient(145deg,#222428,#131518); color:var(--accent); box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 8px 18px rgba(0,0,0,.28); transition:border-color .18s ease,color .18s ease,background .18s ease,box-shadow .18s ease,transform .18s ease; cursor:pointer; -webkit-tap-highlight-color:transparent; }
        .button:hover { transform:translateY(-2px); border-color:var(--accent); }
        .button.active { border-color:var(--accent); background:radial-gradient(circle at 50% 45%,color-mix(in srgb,var(--accent) 24%,#1c1b19),#1c1b19 72%); box-shadow:inset 0 0 24px color-mix(in srgb,var(--accent) 18%,transparent),0 0 0 1px color-mix(in srgb,var(--accent) 35%,transparent),0 8px 22px rgba(0,0,0,.3); }
        .button.inactive { color:#85878b; border-color:#45474b; }
        .button.inactive:hover { border-color:#77797d; }
        .button.binary-sensor.active { --accent:var(--sensor-active-color); color:var(--sensor-active-color); }
        .button.binary-sensor.inactive { color:var(--sensor-inactive-color); border-color:var(--sensor-inactive-color); }
        .button.binary-sensor.inactive:hover { border-color:var(--sensor-inactive-color); }
        .button.dimmable,.button.dimmable:hover { border-color:transparent; }
        .button.dimmable:hover { transform:none; }
        .button-content { display:flex; flex-direction:column; align-items:center; justify-content:center; }
        .button.dimmable ha-icon,.button:has(.state-value:not(:empty)) ha-icon { transform:scale(.7); }
        .brightness-value,.state-value { color:inherit; font-size:clamp(5px,calc(var(--button-size) * .15),17px); line-height:1; white-space:nowrap; }
        .button.binary-sensor .state-value { font-size:clamp(3px,calc(var(--button-size) * .1),11px); }
        .brightness-value { display:none; }
        .button.dimmable .brightness-value { display:block; }
        .dimmer { position:absolute; inset:0; width:100%; height:100%; overflow:hidden; visibility:hidden; pointer-events:none; touch-action:none; }
        .dimmer.visible { visibility:visible; }
        .dimmer-track,.dimmer-progress { fill:none; stroke-width:7; }
        .dimmer-track { stroke:#383a3d; }
        .dimmer-progress { stroke:var(--accent); stroke-dasharray:100; stroke-dashoffset:calc(100 - var(--brightness,0)); transform:rotate(-90deg); transform-origin:50% 50%; transition:stroke-dashoffset .45s ease; }
        .dimmer-thumb { fill:var(--accent); stroke:#c3c4c6; stroke-width:1; transform:rotate(calc(var(--brightness,0) * 3.6deg)); transform-origin:50% 50%; transition:transform .45s ease; }
        .dimmer.inactive .dimmer-thumb { fill:#77797d; stroke:#77797d; }
        .dimmer-hit { fill:none; stroke:transparent; stroke-width:16; pointer-events:stroke; cursor:pointer; }
        .dimmer.visible .dimmer-thumb { pointer-events:all; cursor:pointer; }
        .dimmer.disabled .dimmer-hit,.dimmer.disabled .dimmer-thumb { pointer-events:none; }
        .dimmer.dragging .dimmer-progress,.dimmer.dragging .dimmer-thumb { transition:none; }
        .dimmer:focus-visible { outline:2px solid var(--accent); outline-offset:3px; border-radius:50%; }
        ha-icon { display:block; --mdc-icon-size:var(--icon-size); }
        .name { max-width:100%; color:#e4e4e7; font-size:clamp(13px,2.2vw,20px); line-height:1.2; text-align:center; overflow-wrap:anywhere; }
        @media (prefers-reduced-motion:reduce) { *,*::before,*::after { transition:none !important; } }
      </style>
      <article class="card ${showCardFrame ? "" : "no-frame"}" style="--accent:${BUTTON_COLORS[color]};--sensor-active-color:${activeColor};--sensor-inactive-color:${inactiveColor};--button-size:clamp(${72 * scale}px,${15 * scale}vw,${114 * scale}px);--icon-size:clamp(${Math.min(16, 72 * scale * .48)}px,${15 * scale * .48}vw,${114 * scale * .48}px)">
        <div class="button-wrap">
          <div class="button-control">
          <button class="button ${isActive ? "active" : ""}" aria-label="${escapeHtml(name)}" title="${escapeHtml(name)}">
            <span class="button-content"><ha-icon icon="${escapeHtml(icon)}"></ha-icon><span class="brightness-value">0 %</span><span class="state-value"></span></span>
          </button>
          <svg class="dimmer" viewBox="0 0 100 100" role="slider" aria-label="Helligkeit" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-hidden="true" tabindex="-1"><circle class="dimmer-track" cx="50" cy="50" r="43"></circle><circle class="dimmer-progress" cx="50" cy="50" r="43" pathLength="100"></circle><circle class="dimmer-hit" cx="50" cy="50" r="43"></circle><circle class="dimmer-thumb" cx="50" cy="7" r="4.5"></circle></svg>
          </div>
          ${showName ? `<span class="name">${escapeHtml(name)}</span>` : ""}
        </div>
      </article>`;
    this._bindEvents();
    this._syncEntityState();
  }
}

class GlassButtonCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = "<ha-form></ha-form>";
    this._config = {};
    this._domain = null;
    this.shadowRoot.querySelector("ha-form").addEventListener("value-changed", (event) => {
      event.stopPropagation();
      this._config = { ...this._config, ...event.detail.value };
      this._syncForm();
      this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config: this._config } }));
    });
  }

  setConfig(config) {
    this._config = { ...config };
    this._syncForm();
  }

  set hass(hass) {
    this._hass = hass;
    this.shadowRoot.querySelector("ha-form").hass = hass;
  }

  _syncForm() {
    const form = this.shadowRoot.querySelector("ha-form");
    const domain = this._config.entity?.split(".")[0] || "";
    if (domain !== this._domain) {
      this._domain = domain;
      const binaryFields = ["icon_active", "icon_inactive", "color_active", "color_inactive", "binary_sensor_active_state"];
      const nonBinaryFields = ["icon", "color", "action"];
      const definition = GlassButtonCard.getConfigForm();
      form.schema = definition.schema.filter((field) => {
        if (binaryFields.includes(field.name)) return domain === "binary_sensor";
        if (nonBinaryFields.includes(field.name)) return domain !== "binary_sensor";
        if (field.name === "show_brightness_slider") return domain === "light";
        return true;
      });
      form.computeLabel = definition.computeLabel;
    }
    form.data = this._config;
    form.hass = this._hass;
  }
}

if (!customElements.get("glass-button-card")) customElements.define("glass-button-card", GlassButtonCard);
if (!customElements.get("glass-button-card-editor")) customElements.define("glass-button-card-editor", GlassButtonCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "glass-button-card")) {
  window.customCards.push({ type: "glass-button-card", name: "Glass Button Card", description: "Einzelner runder Home Assistant Button mit Icon- und Farbauswahl.", preview: true, version: CARD_VERSION });
}