const RGB_CARD_VERSION = "1.1.0";
const RGB_PRESET_COUNT = 6;
const rgbToHs = (rgb) => {
  const [red, green, blue] = rgb.map((value) => value / 255);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const difference = maximum - minimum;
  let hue = 0;
  if (difference) {
    if (maximum === red) hue = (green - blue) / difference;
    else if (maximum === green) hue = (blue - red) / difference + 2;
    else hue = (red - green) / difference + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return [Math.round(hue), maximum ? Math.round(difference / maximum * 100) : 0];
};
const escapeRgb = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

class GlassRgbCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._stateKey = null;
    this._presets = [];
    this._selected = -1;
    this._hue = 0;
    this._saturation = 100;
    this._brightness = 0;
    this._temperatureValue = null;
    this._dragging = false;
    this._pending = false;
    this._pendingTimer = null;
  }

  static getStubConfig() { return { entity: "light.wohnzimmer", title: "RGB", title_size: 5, button_size: 5, show_presets: false }; }
  static getConfigForm() {
    return {
      schema: [
        { name: "entity", required: true, selector: { entity: { filter: { domain: "light" } } } },
        { name: "title", default: "RGB", selector: { text: {} } },
        { name: "name", selector: { text: {} } },
        { name: "icon", selector: { icon: {} } },
        { name: "title_size", default: 5, selector: { number: { min: 1, max: 5, step: 1, mode: "slider" } } },
        { name: "button_size", default: 5, selector: { number: { min: 1, max: 5, step: 1, mode: "slider" } } },
        { name: "show_presets", default: false, selector: { boolean: {} } },
        ...Array.from({ length: RGB_PRESET_COUNT }, (_, index) => ({ name: `preset_${index + 1}`, selector: { color_rgb: {} } })),
      ],
      computeLabel: (field) => ({ entity: "Licht", title: "Titel", name: "Name", icon: "Icon", title_size: "Überschrift-Größe", button_size: "Button-Größe", show_presets: "Farb-Presets anzeigen" })[field.name] || (field.name.startsWith("preset_") ? `Farb-Preset ${field.name.slice(7)}` : field.name),
    };
  }

  setConfig(config) {
    if (!config.entity) throw new Error("Bitte eine Licht-Entität auswählen.");
    for (let index = 1; index <= RGB_PRESET_COUNT; index++) {
      const color = config[`preset_${index}`];
      if (color != null && (!Array.isArray(color) || color.length !== 3 || color.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255))) throw new Error(`Preset ${index} muss eine RGB-Farbe mit drei Werten von 0 bis 255 sein.`);
    }
    const changed = this._config?.entity !== config.entity;
    this._config = { title: "RGB", title_size: 5, button_size: 5, show_presets: false, ...config };
    if (changed) this._selected = -1;
    this._loadPresets();
    this._selected = -1;
    this._render();
    this._sync();
  }

  set hass(hass) {
    this._hass = hass;
    const state = hass?.states?.[this._config?.entity];
    const attributes = state?.attributes;
    const stateKey = JSON.stringify([state?.state, attributes?.friendly_name, attributes?.supported_color_modes, attributes?.brightness, attributes?.hs_color, attributes?.color_temp_kelvin, attributes?.min_color_temp_kelvin, attributes?.max_color_temp_kelvin, attributes?.min_mireds, attributes?.max_mireds]);
    if (stateKey !== this._stateKey) {
      this._stateKey = stateKey;
      this._sync();
    }
  }
  get hass() { return this._hass; }
  getCardSize() { return 5; }

  _loadPresets() {
    this._presets = Array.from({ length: RGB_PRESET_COUNT }, (_, index) => ({ slot: index + 1, rgb: this._config[`preset_${index + 1}`] })).filter((preset) => Array.isArray(preset.rgb)).map((preset) => {
      const [hue, saturation] = rgbToHs(preset.rgb);
      return { ...preset, hue, saturation };
    });
  }

  _markPending() {
    this._pending = true;
    clearTimeout(this._pendingTimer);
    this._pendingTimer = setTimeout(() => { this._pending = false; this._sync(); }, 1800);
  }

  _sendColor() {
    if (!this._hass) return;
    this._markPending();
    this._hass.callService("light", "turn_on", { entity_id: this._config.entity, hs_color: [this._hue, this._saturation], brightness_pct: Math.max(1, this._brightness) });
  }

  _sendBrightness() {
    if (!this._hass) return;
    this._markPending();
    if (this._brightness === 0) this._hass.callService("light", "turn_off", { entity_id: this._config.entity });
    else this._hass.callService("light", "turn_on", { entity_id: this._config.entity, brightness_pct: this._brightness });
  }

  _selectPreset(index) {
    this._selected = index;
    const preset = this._presets[index];
    if (!preset || !this._hass) return;
    this._hue = preset.hue; this._saturation = preset.saturation;
    this._temperatureValue = null;
    this._updateView();
    this._markPending();
    this._hass.callService("light", "turn_on", { entity_id: this._config.entity, rgb_color: preset.rgb });
  }

  _toggleLight() {
    const state = this._hass?.states?.[this._config.entity]?.state;
    if (state === "off") {
      if (this._presets.length) this._selectPreset(0);
      else this._hass.callService("light", "turn_on", { entity_id: this._config.entity });
    }
    else if (state === "on") this._hass.callService("homeassistant", "toggle", { entity_id: this._config.entity });
  }

  _setHue(event) {
    const bounds = this.shadowRoot.querySelector(".wheel").getBoundingClientRect();
    const angle = Math.atan2(event.clientX - bounds.left - bounds.width / 2, -(event.clientY - bounds.top - bounds.height / 2));
    this._hue = Math.round(((angle * 180 / Math.PI) + 360) % 360);
    this._saturation = 100;
    this._temperatureValue = null;
    this._selected = -1;
    this._updateView();
  }

  _sync() {
    if (!this._config || !this.shadowRoot.querySelector(".card")) return;
    const state = this._hass?.states?.[this._config.entity];
    const modes = state?.attributes?.supported_color_modes || [];
    const supportsColor = modes.some((mode) => ["hs", "xy", "rgb", "rgbw", "rgbww"].includes(mode));
    const supportsTemperature = modes.includes("color_temp") && modes.some((mode) => ["rgbw", "rgbww"].includes(mode));
    if (!this._dragging && !this._pending && state) {
      if (Array.isArray(state.attributes?.hs_color)) [this._hue, this._saturation] = state.attributes.hs_color;
      this._brightness = state.state === "on" && Number.isFinite(state.attributes?.brightness) ? Math.round(state.attributes.brightness / 255 * 100) : 0;
    }
    const header = this.shadowRoot.querySelector(".header-action");
    header.classList.toggle("active", state?.state === "on");
    header.classList.toggle("inactive", state?.state === "off");
    this.shadowRoot.querySelector(".action-state").textContent = state?.state === "on" ? "An" : state?.state === "off" ? "Aus" : "";
    this.shadowRoot.querySelector(".subtitle").textContent = this._config.name || state?.attributes?.friendly_name || this._config.entity;
    const available = !!state && !["unavailable", "unknown"].includes(state.state);
    const controls = this.shadowRoot.querySelector(".controls");
    controls.hidden = !supportsColor || !available;
    controls.classList.toggle("is-off", state?.state === "off");
    this.shadowRoot.querySelector(".turn-on").hidden = state?.state !== "off";
    this.shadowRoot.querySelector(".turn-off").hidden = state?.state !== "on";
    this.shadowRoot.querySelector(".wheel").setAttribute("tabindex", state?.state === "off" ? "-1" : "0");
    this.shadowRoot.querySelector(".brightness").disabled = state?.state === "off";
    this.shadowRoot.querySelector(".unavailable").hidden = supportsColor && available;
    this.shadowRoot.querySelector(".unavailable").textContent = !state ? "Licht nicht gefunden." : !available ? "Licht nicht verfügbar." : "Dieses Licht unterstützt keine RGB-Farben.";
    const temp = this.shadowRoot.querySelector(".temperature");
    temp.hidden = !supportsTemperature;
    const temperatureInput = this.shadowRoot.querySelector(".temperature input");
    const min = state?.attributes?.min_color_temp_kelvin || (state?.attributes?.max_mireds ? Math.round(1000000 / state.attributes.max_mireds) : 2000);
    const max = state?.attributes?.max_color_temp_kelvin || (state?.attributes?.min_mireds ? Math.round(1000000 / state.attributes.min_mireds) : 6500);
    temperatureInput.min = min; temperatureInput.max = max;
    if (!this._pending && !this._dragging) temperatureInput.value = state?.attributes?.color_temp_kelvin || min;
    this._updateView();
  }

  _updateView() {
    const wheel = this.shadowRoot.querySelector(".wheel");
    if (!wheel) return;
    wheel.style.setProperty("--hue", this._hue);
    wheel.style.setProperty("--saturation", `${this._saturation}%`);
    wheel.setAttribute("aria-valuenow", String(Math.round(this._hue)));
    this.shadowRoot.querySelector(".brightness-number").textContent = `${Math.round(this._brightness)} %`;
    const brightness = this.shadowRoot.querySelector(".brightness");
    brightness.value = this._brightness;
    brightness.style.setProperty("--brightness", `${this._brightness}%`);
    this.shadowRoot.querySelectorAll(".preset").forEach((button, index) => {
      const preset = this._presets[index];
      button.style.setProperty("--swatch", `rgb(${preset.rgb.join(",")})`);
      button.setAttribute("aria-pressed", String(index === this._selected));
    });
  }

  _render() {
    const titleScale = 0.65 + ((Math.min(5, Math.max(1, Number(this._config.title_size) || 5)) - 1) / 4) * .35;
    const level = Math.min(5, Math.max(1, Number(this._config.button_size) || 5));
    const menuScale = .5 + (1 / 3 + ((level - 1) / 4) * (2 / 3)) * .5;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; width:100%; color:var(--primary-text-color,#f3f3f5); font-family:var(--paper-font-body1_-_font-family,"Arial",sans-serif); }
        * { box-sizing:border-box; }
        .card { width:100%; padding:clamp(20px,4.7vw,38px); border:1px solid rgba(255,255,255,.1); border-radius:28px; background:radial-gradient(ellipse at 48% 0,#22252a 0,#15171a 62%,#101214 100%); box-shadow:inset 0 1px 1px rgba(255,255,255,.06),0 12px 30px rgba(0,0,0,.2); }
        .header { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:clamp(20px,3vw,30px); }
        .titles { min-width:0; } .title { color:#9295a0; font-size:clamp(11px,2.1vw,15px); font-weight:700; letter-spacing:.12em; line-height:normal; text-transform:uppercase; }
        .subtitle { margin:7px 0 0; color:var(--primary-text-color,#f3f3f5); font-size:var(--subtitle-font); font-weight:700; line-height:1.08; overflow-wrap:anywhere; }
        .header-action { position:relative; display:grid; flex:none; width:var(--header-action-size); aspect-ratio:1; place-items:center; border:2px solid #303239; border-radius:50%; background:linear-gradient(145deg,#272a30,#17191d); color:#ff8b2b; font:inherit; box-shadow:0 6px 15px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.05); cursor:pointer; -webkit-tap-highlight-color:transparent; }
        .header-action.active { border-color:#ff8b2b; color:#ff9b4a; box-shadow:inset 0 0 20px rgba(255,139,43,.12),0 0 0 1px rgba(255,139,43,.2),0 6px 15px rgba(0,0,0,.25); }
        .header-action.inactive { color:#85878b; border-color:#45474b; } .header-action ha-icon { display:block; width:var(--header-icon-size); height:var(--header-icon-size); --mdc-icon-size:var(--header-icon-size); }
        .action-state { position:absolute; bottom:11%; font-size:clamp(5px,calc(var(--header-action-size) * .15),13px); line-height:1; color:inherit; }
        .controls[hidden],.temperature[hidden],.unavailable[hidden],.turn-on[hidden],.turn-off[hidden] { display:none; }
        .color-control { position:relative; width:min(100%,360px); aspect-ratio:1; margin:0 auto; }
        .controls.is-off .wheel,.controls.is-off .brightness,.controls.is-off .preset { filter:grayscale(1) brightness(.65); }
        .controls.is-off .brightness-control { display:none; }
        .turn-on { position:absolute; inset:0; z-index:2; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; width:100%; height:100%; border:0; border-radius:50%; background:transparent; color:#85878b; cursor:pointer; }
        .turn-on ha-icon { display:block; width:28%; height:28%; --mdc-icon-size:100%; }
        .turn-on-label { color:inherit; font:inherit; font-size:14px; }
        .turn-on:focus-visible { outline:2px solid #ddd; outline-offset:3px; }
        .wheel { position:absolute; inset:0; overflow:hidden; border-radius:50%; background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red); touch-action:none; cursor:pointer; }
        .wheel::before { content:""; position:absolute; inset:9%; border-radius:50%; background:color-mix(in srgb,hsl(var(--hue,0) 100% 50%) var(--saturation,100%),white); pointer-events:none; }
        .controls.is-off .wheel::before { background:#15171a; }
        .wheel-marker { position:absolute; inset:0; transform:rotate(calc(var(--hue) * 1deg)); pointer-events:none; }
        .wheel-marker::after { content:""; position:absolute; width:10%; aspect-ratio:1; top:0; left:45%; border:2px solid #ddd; border-radius:50%; background:hsl(var(--hue) 100% 50%); }
        .wheel:focus-visible { outline:2px solid white; outline-offset:3px; }
        .turn-off { position:absolute; inset:12%; z-index:1; border:0; border-radius:50%; background:transparent; cursor:pointer; }
        .turn-off:focus-visible { outline:2px solid white; outline-offset:3px; }
        .brightness-control { display:flex; align-items:center; gap:12px; margin:20px auto 0; width:min(100%,360px); color:#a0a2ad; font-size:14px; }
        .brightness { min-width:0; flex:1; accent-color:#ff8b2b; cursor:pointer; }
        .presets { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:10px; margin-top:28px; justify-items:center; }
        .preset { width:min(100%,42px); aspect-ratio:1; border:2px solid transparent; border-radius:50%; background:var(--swatch); cursor:pointer; }
        .preset[aria-pressed="true"] { outline:2px solid white; outline-offset:3px; }
        .temperature { display:flex; align-items:center; gap:12px; margin-top:28px; color:#a0a2ad; font-size:14px; }
        .temperature input { min-width:0; flex:1; accent-color:#f1f1f1; cursor:pointer; }
        .unavailable { color:var(--secondary-text-color,#a0a2ad); font-size:14px; }
        @media (max-width:380px) { .card { padding:18px; } .presets { gap:6px; } }
      </style>
      <article class="card" style="--subtitle-font:clamp(${22 * titleScale}px,${4.8 * titleScale}vw,${38 * titleScale}px);--header-action-size:clamp(${56 * menuScale}px,${11 * menuScale}vw,${88 * menuScale}px);--header-icon-size:calc((var(--header-action-size) - 16px) * .46)">
        <header class="header"><div class="titles"><div class="title">${escapeRgb(this._config.title)}</div><h2 class="subtitle"></h2></div><button class="header-action" aria-label="Licht ein- oder ausschalten" title="Licht ein- oder ausschalten"><ha-icon icon="${escapeRgb(this._config.icon || "mdi:lightbulb-outline")}"></ha-icon><span class="action-state"></span></button></header>
        <p class="unavailable" hidden></p>
        <div class="controls" hidden><div class="color-control"><div class="wheel" role="slider" tabindex="0" aria-label="Farbton" aria-valuemin="0" aria-valuemax="359" aria-valuenow="0"><span class="wheel-marker"></span></div><button class="turn-off" type="button" aria-label="Licht ausschalten" title="Licht ausschalten" hidden></button><button class="turn-on" type="button" aria-label="Licht mit erstem Preset einschalten" title="Licht einschalten" hidden><ha-icon icon="${escapeRgb(this._config.icon || "mdi:lightbulb-outline")}"></ha-icon><span class="turn-on-label">RGB</span></button></div><div class="brightness-control"><input class="brightness" type="range" min="0" max="100" aria-label="Helligkeit"><span class="brightness-number">0 %</span></div>
        ${this._config.show_presets && this._presets.length ? `<div class="presets">${this._presets.map((preset) => `<button class="preset" type="button" title="Farb-Preset ${preset.slot}" aria-label="Farb-Preset ${preset.slot}" aria-pressed="false"></button>`).join("")}</div>` : ""}
        <div class="temperature" hidden><span>Warm</span><input type="range" aria-label="Farbtemperatur" step="50"><span>Kalt</span></div></div>
      </article>`;
    this.shadowRoot.querySelector(".header-action").addEventListener("click", () => this._toggleLight());
    this.shadowRoot.querySelector(".turn-on").addEventListener("click", () => this._toggleLight());
    this.shadowRoot.querySelector(".turn-off").addEventListener("click", () => this._toggleLight());
    const wheel = this.shadowRoot.querySelector(".wheel");
    wheel.addEventListener("pointerdown", (event) => { if (event.button !== 0 || event.target !== wheel) return; event.preventDefault(); this._dragging = true; wheel.setPointerCapture(event.pointerId); this._setHue(event); });
    wheel.addEventListener("pointermove", (event) => { if (this._dragging) this._setHue(event); });
    wheel.addEventListener("pointerup", (event) => { if (!this._dragging) return; this._setHue(event); this._dragging = false; this._sendColor(); });
    wheel.addEventListener("pointercancel", () => { this._dragging = false; this._sync(); });
    wheel.addEventListener("keydown", (event) => { if (!["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp"].includes(event.key)) return; event.preventDefault(); this._hue = (Math.round(this._hue) + (event.key === "ArrowLeft" || event.key === "ArrowDown" ? 355 : 5)) % 360; this._saturation = 100; this._temperatureValue = null; this._selected = -1; this._updateView(); this._sendColor(); });
    const brightness = this.shadowRoot.querySelector(".brightness");
    brightness.addEventListener("input", () => { this._dragging = true; this._brightness = Number(brightness.value); this._updateView(); });
    brightness.addEventListener("change", () => { this._dragging = false; this._brightness = Number(brightness.value); this._sendBrightness(); });
    this.shadowRoot.querySelectorAll(".preset").forEach((button, index) => button.addEventListener("click", () => this._selectPreset(index)));
    const temperature = this.shadowRoot.querySelector(".temperature input");
    temperature.addEventListener("input", () => { this._dragging = true; });
    temperature.addEventListener("change", () => { this._dragging = false; this._temperatureValue = Number(temperature.value); this._selected = -1; this._updateView(); this._markPending(); this._hass?.callService("light", "turn_on", { entity_id: this._config.entity, color_temp_kelvin: this._temperatureValue }); });
  }
}

if (!customElements.get("glass-rgb-card")) customElements.define("glass-rgb-card", GlassRgbCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "glass-rgb-card")) window.customCards.push({ type: "glass-rgb-card", name: "Glass RGB Card", description: "RGB-Lichtsteuerung mit optionalen Farb-Presets.", preview: true, version: RGB_CARD_VERSION });