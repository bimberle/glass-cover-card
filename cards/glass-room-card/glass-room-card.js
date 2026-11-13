const ROOM_CARD_VERSION = "1.0.2";
const ROOM_TEXT_COLORS = { black: "#151515", white: "#ffffff", gray: "#a0a2a6" };
const escapeRoom = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

class GlassRoomCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
  }

  static getStubConfig() {
    return { name: "Wohnzimmer", image: "/local/glass_design/rooms/Wohnzimmer.png", height: 430, image_position: 60 };
  }

  static getConfigElement() {
    return document.createElement("glass-room-card-editor");
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "name", default: "Wohnzimmer", selector: { text: {} } },
        { name: "image", selector: { text: {} } },
        { name: "entity", selector: { entity: { filter: { domain: "sensor" } } } },
        { name: "text_color", default: "white", selector: { select: { mode: "dropdown", options: [{ value: "black", label: "Schwarz" }, { value: "white", label: "Weiß" }, { value: "gray", label: "Grau" }] } } },
        { name: "sensor_color", default: "white", selector: { select: { mode: "dropdown", options: [{ value: "black", label: "Schwarz" }, { value: "white", label: "Weiß" }, { value: "gray", label: "Grau" }] } } },
        { name: "name_size", default: 19, selector: { number: { min: 12, max: 48, step: 1, mode: "slider", unit_of_measurement: "px" } } },
        { name: "sensor_size", default: 29, selector: { number: { min: 12, max: 64, step: 1, mode: "slider", unit_of_measurement: "px" } } },
        { name: "height", default: 430, selector: { number: { min: 180, max: 800, step: 10, mode: "slider", unit_of_measurement: "px" } } },
        { name: "image_position", default: 60, selector: { number: { min: 0, max: 100, step: 1, mode: "slider", unit_of_measurement: "%" } } },
      ],
      computeLabel: (field) => ({ name: "Raumname", image: "Bildpfad oder Bild-URL", entity: "Sensor (optional)", text_color: "Schriftfarbe Raumname", sensor_color: "Schriftfarbe Sensorwert", name_size: "Schriftgröße Raumname", sensor_size: "Schriftgröße Sensorwert", height: "Kartenhöhe", image_position: "Vertikaler Bildausschnitt" })[field.name],
    };
  }

  setConfig(config) {
    if (config.entity && !config.entity.startsWith("sensor.")) throw new Error("Bitte eine Sensor-Entität auswählen.");
    const image = String(config.image || "").trim();
    if (image && !/^(?:https?:\/\/|\/[^/]|\.\.?\/)/i.test(image)) throw new Error("Bitte einen lokalen Bildpfad oder eine HTTP(S)-Bild-URL angeben.");
    const nextConfig = { name: "Wohnzimmer", height: 430, image_position: 60, ...config, image };
    if (JSON.stringify(this._config) === JSON.stringify(nextConfig)) {
      this._syncSensor();
      return;
    }
    this._config = nextConfig;
    this._render();
    this._syncSensor();
  }

  set hass(hass) { this._hass = hass; this._syncSensor(); }
  get hass() { return this._hass; }
  getCardSize() { return Math.ceil(this._height() / 50); }

  _height() { return Math.min(800, Math.max(180, Number(this._config?.height) || 430)); }

  _syncSensor() {
    if (!this._config) return;
    const output = this.shadowRoot.querySelector(".sensor-value");
    if (!output) return;
    const state = this._hass?.states?.[this._config.entity];
    let value = "";
    if (this._config.entity) {
      if (!state || state.state === "unavailable") value = "Sensor nicht verfügbar";
      else if (state.state === "unknown") value = "Unbekannt";
      else value = `${state.state}${state.attributes?.unit_of_measurement ? ` ${state.attributes.unit_of_measurement}` : ""}`;
    }
    if (output.textContent !== value) output.textContent = value;
  }

  _openSensor() {
    if (!this._config?.entity) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: this._config.entity } }));
  }

  _render() {
    const position = Math.min(100, Math.max(0, Number(this._config.image_position) || 0));
    const textColor = ROOM_TEXT_COLORS[this._config.text_color] || ROOM_TEXT_COLORS.white;
    const sensorColor = ROOM_TEXT_COLORS[this._config.sensor_color] || ROOM_TEXT_COLORS.white;
    const nameSize = Math.min(48, Math.max(12, Number(this._config.name_size) || 19));
    const sensorSize = Math.min(64, Math.max(12, Number(this._config.sensor_size) || 29));
    const textShadow = this._config.text_color === "black" ? "0 1px 5px rgba(255,255,255,.55)" : "0 2px 8px rgba(0,0,0,.6)";
    const sensorShadow = this._config.sensor_color === "black" ? "0 1px 5px rgba(255,255,255,.55)" : "0 2px 8px rgba(0,0,0,.6)";
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; width:100%; min-width:0; color:var(--primary-text-color,#f2f3ef); font-family:var(--paper-font-body1_-_font-family,"Arial",sans-serif); }
        * { box-sizing:border-box; }
        .room { position:relative; display:flex; flex-direction:column; justify-content:space-between; width:100%; height:${this._height()}px; overflow:hidden; padding:18px; border:1px solid rgba(255,255,255,.08); border-radius:20px; background:#252b27; box-shadow:0 8px 24px rgba(0,0,0,.2); }
        .image { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:center ${position}%; }
        .shade { position:absolute; inset:0; background:linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,.03) 40%,rgba(0,0,0,.72)); pointer-events:none; }
        .name,.sensor-value { position:relative; margin:0; color:${textColor}; text-shadow:${textShadow}; overflow-wrap:anywhere; pointer-events:none; }
        .name { font-size:${nameSize}px; line-height:1.2; font-weight:650; }
        .sensor-value { font-size:${sensorSize}px; line-height:1.2; font-weight:600; color:${sensorColor}; text-shadow:${sensorShadow}; margin-top:auto; }
        .sensor-value:empty { display:none; }
        .sensor-action { position:absolute; inset:0; width:100%; height:100%; border:0; padding:0; border-radius:inherit; background:transparent; cursor:pointer; }
        .sensor-action:focus-visible { outline:3px solid #ff983e; outline-offset:-4px; }
      </style>
      <article class="room">
        ${this._config.image ? `<img class="image" src="${escapeRoom(this._config.image)}" alt="${escapeRoom(this._config.name)}">` : ""}
        <div class="shade"></div>
        ${this._config.entity ? `<button type="button" class="sensor-action" aria-label="${escapeRoom(this._config.name || "Raum")}: Sensordetails öffnen" title="Sensordetails öffnen"></button>` : ""}
        ${String(this._config.name ?? "").trim() ? `<h2 class="name">${escapeRoom(String(this._config.name).trim())}</h2>` : ""}
        <div class="sensor-value"></div>
      </article>`;
    this.shadowRoot.querySelector(".sensor-action")?.addEventListener("click", () => this._openSensor());
    this.shadowRoot.querySelector(".image")?.addEventListener("error", (event) => { event.currentTarget.hidden = true; });
  }
}

class GlassRoomCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = "<ha-form></ha-form>";
    const form = this.shadowRoot.querySelector("ha-form");
    const definition = GlassRoomCard.getConfigForm();
    form.schema = definition.schema;
    form.computeLabel = definition.computeLabel;
    form.addEventListener("value-changed", (event) => {
      event.stopPropagation();
      this._config = { ...this._config, ...event.detail.value };
      this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config: this._config } }));
    });
  }

  setConfig(config) {
    this._config = { ...config };
    this.shadowRoot.querySelector("ha-form").data = this._config;
  }

  set hass(hass) {
    this.shadowRoot.querySelector("ha-form").hass = hass;
  }
}

if (!customElements.get("glass-room-card")) customElements.define("glass-room-card", GlassRoomCard);
if (!customElements.get("glass-room-card-editor")) customElements.define("glass-room-card-editor", GlassRoomCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "glass-room-card")) window.customCards.push({ type: "glass-room-card", name: "Glass Room Card", description: "Raumfoto mit optionalem Sensorwert.", preview: true, version: ROOM_CARD_VERSION });