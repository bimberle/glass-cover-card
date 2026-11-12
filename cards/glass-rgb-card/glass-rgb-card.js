const RGB_CARD_VERSION = "1.0.1";
const RGB_PRESETS = [[40, 35], [325, 75], [25, 100], [115, 80], [185, 100], [210, 100]];
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
      ],
      computeLabel: (field) => ({ entity: "Licht", title: "Titel", name: "Name", icon: "Icon", title_size: "Überschrift-Größe", button_size: "Button-Größe", show_presets: "Farb-Presets anzeigen" })[field.name],
    };
  }

  setConfig(config) {
    if (!config.entity) throw new Error("Bitte eine Licht-Entität auswählen.");
    const changed = this._config?.entity !== config.entity;
    this._config = { title: "RGB", title_size: 5, button_size: 5, show_presets: false, ...config };
    if (changed) { this._selected = -1; this._loadPresets(); }
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
    this._presets = RGB_PRESETS.map(([hue, saturation]) => ({ hue, saturation, brightness: 100 }));
    try {
      const saved = JSON.parse(localStorage.getItem(`glass-rgb-presets:${this._config.entity}`) || "null");
      if (Array.isArray(saved) && saved.length === RGB_PRESETS.length && saved.every((preset) => Number.isFinite(preset.hue) && Number.isFinite(preset.saturation) && Number.isFinite(preset.brightness))) this._presets = saved;
    } catch (error) { this._storageError = true; }
  }

  _savePreset() {
    if (this._selected < 0 || !this._config.show_presets) return;
    this._presets[this._selected] = { hue: this._hue, saturation: this._saturation, brightness: this._brightness, temperature: this._temperatureValue };
    try { localStorage.setItem(`glass-rgb-presets:${this._config.entity}`, JSON.stringify(this._presets)); this._storageError = false; }
    catch (error) { this._storageError = true; }
    this._updateView();
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

  _selectPreset(index, forceOn = false) {
    this._selected = index;
    const preset = this._presets[index];
    this._hue = preset.hue; this._saturation = preset.saturation; this._brightness = forceOn ? Math.max(1, preset.brightness) : preset.brightness;
    this._temperatureValue = Number.isFinite(preset.temperature) ? preset.temperature : null;
    this._updateView();
    if (this._brightness === 0) this._sendBrightness();
    else if (this._temperatureValue !== null && !this.shadowRoot.querySelector(".temperature").hidden) {
      this._markPending();
      this.shadowRoot.querySelector(".temperature input").value = this._temperatureValue;
      this._hass?.callService("light", "turn_on", { entity_id: this._config.entity, color_temp_kelvin: this._temperatureValue, brightness_pct: this._brightness });
    } else this._sendColor();
  }

  _toggleLight() {
    const state = this._hass?.states?.[this._config.entity]?.state;
    if (state === "off") this._selectPreset(0, true);
    else if (state === "on") this._hass.callService("homeassistant", "toggle", { entity_id: this._config.entity });
  }

  _setHue(event) {
    const bounds = this.shadowRoot.querySelector(".wheel").getBoundingClientRect();
    const angle = Math.atan2(event.clientX - bounds.left - bounds.width / 2, -(event.clientY - bounds.top - bounds.height / 2));
    this._hue = Math.round(((angle * 180 / Math.PI) + 360) % 360);
    this._saturation = 100;
    this._temperatureValue = null;
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
    wheel.setAttribute("aria-valuenow", String(Math.round(this._hue)));
    this.shadowRoot.querySelector(".brightness-number").textContent = `${Math.round(this._brightness)} %`;
    const arc = this.shadowRoot.querySelector(".brightness-arc");
    arc.style.setProperty("--brightness", this._brightness);
    arc.setAttribute("aria-valuenow", String(this._brightness));
    const angle = Math.PI * this._brightness / 100;
    const thumb = this.shadowRoot.querySelector(".brightness-thumb");
    thumb.setAttribute("cx", String(50 - 35 * Math.cos(angle)));
    thumb.setAttribute("cy", String(48 - 35 * Math.sin(angle)));
    const brightness = this.shadowRoot.querySelector(".brightness");
    brightness.value = this._brightness;
    brightness.style.setProperty("--brightness", `${this._brightness}%`);
    this.shadowRoot.querySelectorAll(".preset").forEach((button, index) => {
      const preset = this._presets[index];
      button.style.setProperty("--swatch", Number.isFinite(preset.temperature) ? "#f3e5c4" : `hsl(${preset.hue} ${preset.saturation}% 50%)`);
      button.setAttribute("aria-pressed", String(index === this._selected));
    });
    this.shadowRoot.querySelector(".storage-error").hidden = !this._storageError;
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
        .header-action.inactive { color:#85878b; border-color:#45474b; } .header-action ha-icon { display:block; width:46%; height:46%; --mdc-icon-size:100%; }
        .action-state { position:absolute; bottom:11%; font-size:clamp(5px,calc(var(--header-action-size) * .15),13px); line-height:1; color:inherit; }
        .controls[hidden],.temperature[hidden],.unavailable[hidden],.storage-error[hidden],.turn-on[hidden] { display:none; }
        .color-control { position:relative; width:min(100%,360px); aspect-ratio:1; margin:0 auto; }
        .controls.is-off .wheel,.controls.is-off .brightness-arc,.controls.is-off .brightness,.controls.is-off .preset { filter:grayscale(1) brightness(.65); }
        .controls.is-off .readout,.controls.is-off .brightness-arc { display:none; }
        .turn-on { position:absolute; inset:0; z-index:2; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; width:100%; height:100%; border:0; border-radius:50%; background:transparent; color:#85878b; cursor:pointer; }
        .turn-on ha-icon { display:block; width:28%; height:28%; --mdc-icon-size:100%; }
        .turn-on-label { color:inherit; font:inherit; font-size:14px; }
        .turn-on:focus-visible { outline:2px solid #ddd; outline-offset:3px; }
        .wheel { position:absolute; inset:0; overflow:hidden; border-radius:50%; background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red); touch-action:none; cursor:pointer; }
        .wheel::before { content:""; position:absolute; inset:9%; border-radius:50%; background:#15171a; pointer-events:none; }
        .wheel-marker { position:absolute; inset:0; transform:rotate(calc(var(--hue) * 1deg)); pointer-events:none; }
        .wheel-marker::after { content:""; position:absolute; width:10%; aspect-ratio:1; top:0; left:45%; border:2px solid #ddd; border-radius:50%; background:hsl(var(--hue) 100% 50%); }
        .wheel:focus-visible { outline:2px solid white; outline-offset:3px; }
        .readout { position:absolute; inset:21%; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:10px; pointer-events:none; }
        .brightness-arc { position:absolute; inset:14%; width:72%; height:72%; overflow:visible; pointer-events:none; touch-action:none; }
        .brightness-track,.brightness-progress,.brightness-hit { fill:none; stroke-width:2; }
        .brightness-track { stroke:#393a3d; } .brightness-progress { stroke:#ff8b2b; stroke-dasharray:100; stroke-dashoffset:calc(100 - var(--brightness,0)); }
        .brightness-thumb { fill:#ff8b2b; pointer-events:all; cursor:pointer; } .brightness-hit { stroke:transparent; stroke-width:10; pointer-events:stroke; cursor:pointer; }
        .brightness-number { font-size:clamp(25px,6vw,52px); font-weight:700; line-height:1; } .brightness-label { color:#a0a2ad; font-size:14px; }
        .brightness { width:75%; accent-color:#ff8b2b; pointer-events:auto; cursor:pointer; }
        .presets { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:10px; margin-top:28px; justify-items:center; }
        .preset { width:min(100%,42px); aspect-ratio:1; border:2px solid transparent; border-radius:50%; background:var(--swatch); cursor:pointer; }
        .preset[aria-pressed="true"] { outline:2px solid white; outline-offset:3px; }
        .temperature { display:flex; align-items:center; gap:12px; margin-top:28px; color:#a0a2ad; font-size:14px; }
        .temperature input { min-width:0; flex:1; accent-color:#f1f1f1; cursor:pointer; }
        .unavailable,.storage-error { color:var(--secondary-text-color,#a0a2ad); font-size:14px; }
        @media (max-width:380px) { .card { padding:18px; } .presets { gap:6px; } }
      </style>
      <article class="card" style="--subtitle-font:clamp(${22 * titleScale}px,${4.8 * titleScale}vw,${38 * titleScale}px);--header-action-size:clamp(${56 * menuScale}px,${11 * menuScale}vw,${88 * menuScale}px)">
        <header class="header"><div class="titles"><div class="title">${escapeRgb(this._config.title)}</div><h2 class="subtitle"></h2></div><button class="header-action" aria-label="Licht ein- oder ausschalten" title="Licht ein- oder ausschalten"><ha-icon icon="${escapeRgb(this._config.icon || "mdi:lightbulb-outline")}"></ha-icon><span class="action-state"></span></button></header>
        <p class="unavailable" hidden></p>
        <div class="controls" hidden><div class="color-control"><div class="wheel" role="slider" tabindex="0" aria-label="Farbton" aria-valuemin="0" aria-valuemax="359" aria-valuenow="0"><span class="wheel-marker"></span></div><svg class="brightness-arc" viewBox="0 0 100 100" aria-hidden="true"><path class="brightness-track" d="M15 48 A35 35 0 0 1 85 48"/><path class="brightness-progress" d="M15 48 A35 35 0 0 1 85 48" pathLength="100"/><path class="brightness-hit" d="M15 48 A35 35 0 0 1 85 48"/><circle class="brightness-thumb" cx="15" cy="48" r="4"/></svg><div class="readout"><strong class="brightness-number">0 %</strong><span class="brightness-label">Helligkeit</span><input class="brightness" type="range" min="0" max="100" aria-label="Helligkeit"></div><button class="turn-on" type="button" aria-label="Licht mit erstem Preset einschalten" title="Licht einschalten" hidden><ha-icon icon="${escapeRgb(this._config.icon || "mdi:lightbulb-outline")}"></ha-icon><span class="turn-on-label">RGB</span></button></div>
        ${this._config.show_presets ? `<div class="presets">${RGB_PRESETS.map((preset, index) => `<button class="preset" type="button" title="Farb-Preset ${index + 1}" aria-label="Farb-Preset ${index + 1}" aria-pressed="false"></button>`).join("")}</div><p class="storage-error" hidden>Presets konnten im Browser nicht gespeichert werden.</p>` : `<p class="storage-error" hidden></p>`}
        <div class="temperature" hidden><span>Warm</span><input type="range" aria-label="Farbtemperatur" step="50"><span>Kalt</span></div></div>
      </article>`;
    this.shadowRoot.querySelector(".header-action").addEventListener("click", () => this._toggleLight());
    this.shadowRoot.querySelector(".turn-on").addEventListener("click", () => this._toggleLight());
    const wheel = this.shadowRoot.querySelector(".wheel");
    wheel.addEventListener("pointerdown", (event) => { if (event.button !== 0 || event.target !== wheel) return; event.preventDefault(); this._dragging = true; wheel.setPointerCapture(event.pointerId); this._setHue(event); });
    wheel.addEventListener("pointermove", (event) => { if (this._dragging) this._setHue(event); });
    wheel.addEventListener("pointerup", (event) => { if (!this._dragging) return; this._setHue(event); this._dragging = false; this._savePreset(); this._sendColor(); });
    wheel.addEventListener("pointercancel", () => { this._dragging = false; this._sync(); });
    wheel.addEventListener("keydown", (event) => { if (!["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp"].includes(event.key)) return; event.preventDefault(); this._hue = (Math.round(this._hue) + (event.key === "ArrowLeft" || event.key === "ArrowDown" ? 355 : 5)) % 360; this._saturation = 100; this._temperatureValue = null; this._updateView(); this._savePreset(); this._sendColor(); });
    const arc = this.shadowRoot.querySelector(".brightness-arc");
    const setArcBrightness = (event) => { const bounds = arc.getBoundingClientRect(); const x = (event.clientX - bounds.left) / bounds.width * 100 - 50; const y = Math.max(0, 48 - (event.clientY - bounds.top) / bounds.height * 100); this._brightness = Math.round(Math.atan2(y, -x) / Math.PI * 100); this._updateView(); };
    arc.addEventListener("pointerdown", (event) => { if (event.button !== 0) return; event.preventDefault(); this._dragging = true; arc.setPointerCapture(event.pointerId); setArcBrightness(event); });
    arc.addEventListener("pointermove", (event) => { if (this._dragging) setArcBrightness(event); });
    arc.addEventListener("pointerup", (event) => { if (!this._dragging) return; setArcBrightness(event); this._dragging = false; this._savePreset(); this._sendBrightness(); });
    arc.addEventListener("pointercancel", () => { this._dragging = false; this._sync(); });
    const brightness = this.shadowRoot.querySelector(".brightness");
    brightness.addEventListener("input", () => { this._dragging = true; this._brightness = Number(brightness.value); this._updateView(); });
    brightness.addEventListener("change", () => { this._dragging = false; this._brightness = Number(brightness.value); this._savePreset(); this._sendBrightness(); });
    this.shadowRoot.querySelectorAll(".preset").forEach((button, index) => button.addEventListener("click", () => this._selectPreset(index)));
    const temperature = this.shadowRoot.querySelector(".temperature input");
    temperature.addEventListener("input", () => { this._dragging = true; });
    temperature.addEventListener("change", () => { this._dragging = false; this._temperatureValue = Number(temperature.value); this._savePreset(); this._markPending(); this._hass?.callService("light", "turn_on", { entity_id: this._config.entity, color_temp_kelvin: this._temperatureValue }); });
  }
}

if (!customElements.get("glass-rgb-card")) customElements.define("glass-rgb-card", GlassRgbCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "glass-rgb-card")) window.customCards.push({ type: "glass-rgb-card", name: "Glass RGB Card", description: "RGB-Lichtsteuerung mit optionalen Farb-Presets.", preview: true, version: RGB_CARD_VERSION });