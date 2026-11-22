import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

async function loadCard(filePath, cardTag, editorTag) {
  const definitions = new Map();
  const customCards = [];
  const dispatchedEvents = [];

  class HTMLElement {
    attachShadow() {
      const host = this;
      this._innerHTMLWrites = 0;
      const childContainer = {
        children: [],
        replaceChildren() { this.children = []; },
        append(child) { this.children.push(child); },
        set textContent(value) { this._textContent = value; },
      };
      const headerButton = {
        classList: { toggle(name, value) { this[name] = value; } },
        addEventListener() {},
      };
      const actionStateLabel = { textContent: "" };
      const cardButton = {
        attributes: {},
        classList: { toggle(name, value) { this[name] = value; } },
        addEventListener() {},
        setAttribute(name, value) { this.attributes[name] = value; },
        getAttribute(name) { return this.attributes[name]; },
      };
      const nameLabel = { textContent: "" };
      const form = { addEventListener() {} };
      const stackEditor = { config: null, addEventListener() {}, setConfig(config) { this.config = config; } };
      const dimmer = {
        attributes: {},
        style: { setProperty(name, value) { this[name] = value; } },
        classList: { toggle(name, value) { this[name] = value; } },
        addEventListener() {},
        setAttribute(name, value) { this.attributes[name] = value; },
        getAttribute(name) { return this.attributes[name]; },
        getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
      };
      const brightnessLabel = { textContent: "" };
      const stateLabel = { textContent: "" };
      const cardIcon = { attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }, getAttribute(name) { return this.attributes[name]; } };
      const queryElements = {
        "hui-stack-card-editor": stackEditor,
        ".button ha-icon": cardIcon,
        ".action-state": actionStateLabel,
        ".state-value": stateLabel,
        ".dimmer": dimmer,
        ".brightness-value": brightnessLabel,
        "ha-form": form,
        ".children": childContainer,
        ".header-action": headerButton,
        ".button": cardButton,
        ".name": nameLabel,
      };
      this.shadowRoot = {
        _innerHTML: "",
        get innerHTML() {
          return this._innerHTML;
        },
        set innerHTML(value) {
          this._innerHTML = value;
          host._innerHTMLWrites += 1;
        },
        querySelector: (selector) => queryElements[selector] || null,
        querySelectorAll: () => [],
        addEventListener() {},
      };
      return this.shadowRoot;
    }

    querySelector() {
      return null;
    }

    querySelectorAll() {
      return [];
    }

    dispatchEvent(event) {
      dispatchedEvents.push(event);
      return true;
    }
  }

  class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      Object.assign(this, options);
    }
  }

  const storage = new Map();
  const context = {
    HTMLElement,
    CustomEvent,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    location: { pathname: "/" },
    customElements: {
      get: (name) => definitions.get(name),
      define: (name, value) => definitions.set(name, value),
      whenDefined: async (name) => {
        if (!definitions.has(name)) throw new Error(`Custom element not registered: ${name}`);
      },
    },
    window: {
      customCards,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      loadCardHelpers: async () => ({
        createCardElement: (config) => {
          const element = {
            config,
            set hass(value) {
              this._hass = value;
              for (const child of this._children || []) child.hass = value;
            },
            get hass() { return this._hass; },
          };
          if (config.type === "vertical-stack" && !definitions.has("hui-vertical-stack-card")) {
            class VerticalStackCard extends HTMLElement {
              setConfig(stackConfig) {
                this._config = stackConfig;
                this._children = stackConfig.cards.map((childConfig) => ({ config: childConfig }));
              }

              set hass(value) {
                this._hass = value;
                for (const child of this._children) child.hass = value;
              }

              static async getConfigElement() {
                definitions.set("hui-stack-card-editor", class {});
                return {};
              }
            }
            definitions.set("hui-vertical-stack-card", VerticalStackCard);
            Object.setPrototypeOf(element, VerticalStackCard.prototype);
            element.setConfig(config);
          }
          return element;
        },
      }),
    },
    document: { createElement: (name) => {
      const Element = definitions.get(name);
      return Element ? new Element() : {};
    } },
    console,
  };

  vm.runInNewContext(await readFile(filePath, "utf8"), context, { filename: filePath });
  return {
    Card: definitions.get(cardTag),
    Editor: definitions.get(editorTag),
    definitions,
    customCards,
    dispatchedEvents,
    runSource: (source, filename) => vm.runInNewContext(source, context, { filename }),
  };
}

const buttonModule = await loadCard("dist/glass-button-card.js", "glass-button-card", "glass-button-card-editor");
const buttonCard = new buttonModule.Card();
const serviceCalls = [];
buttonCard.setConfig({
  entity: "light.living_room",
  icon: "mdi:sofa-outline",
  action: "toggle",
  button_size: 5,
  show_name: true,
  color: "orange",
});
buttonCard.hass = {
  states: { "light.living_room": { state: "on", attributes: { friendly_name: "Wohnzimmer" } } },
  callService: (...args) => serviceCalls.push(args),
};
assert.match(buttonCard.shadowRoot.innerHTML, /mdi:sofa-outline/);
assert.equal(buttonCard.shadowRoot.querySelector(".name").textContent, "Wohnzimmer");
assert.equal(buttonCard.shadowRoot.querySelector(".button").classList.active, true);
assert.equal(buttonCard.shadowRoot.querySelector(".state-value").textContent, "An");
assert.match(buttonCard.shadowRoot.innerHTML, /--accent:#ff8b2b/);
assert.equal((buttonCard.shadowRoot.innerHTML.match(/class="button /g) || []).length, 1);
const initialButtonRenderCount = buttonCard._innerHTMLWrites;
buttonCard.hass = {
  states: {
    "light.living_room": { state: "on", attributes: { friendly_name: "Wohnzimmer" } },
    "sensor.unrelated": { state: "12", attributes: {} },
  },
  callService: (...args) => serviceCalls.push(args),
};
assert.equal(buttonCard._innerHTMLWrites, initialButtonRenderCount, "Unrelated HA state changes must not rebuild the button card DOM");
buttonCard.hass = {
  states: { "light.living_room": { state: "off", attributes: { friendly_name: "Wohnzimmerlampe" } } },
  callService: (...args) => serviceCalls.push(args),
};
assert.equal(buttonCard._innerHTMLWrites, initialButtonRenderCount, "Button entity changes must update in place");
assert.equal(buttonCard.shadowRoot.querySelector(".button").classList.active, false);
assert.equal(buttonCard.shadowRoot.querySelector(".button").classList.inactive, true);
assert.equal(buttonCard.shadowRoot.querySelector(".state-value").textContent, "Aus");
assert.equal(buttonCard.shadowRoot.querySelector(".button").getAttribute("aria-label"), "Wohnzimmerlampe");
assert.equal(buttonCard.shadowRoot.querySelector(".name").textContent, "Wohnzimmerlampe");
buttonCard._callButton();
assert.equal(serviceCalls[0][0], "homeassistant");
assert.equal(serviceCalls[0][1], "toggle");
assert.equal(serviceCalls[0][2].entity_id, "light.living_room");
buttonCard.setConfig({ entity: "media_player.tv", icon: "mdi:television", action: "more-info", color: "white" });
buttonCard.hass = {
  states: { "media_player.tv": { state: "off", attributes: {} } },
  callService: (...args) => serviceCalls.push(args),
};
assert.match(buttonCard.shadowRoot.innerHTML, /--accent:#f2f2f4/);
buttonCard._callButton();
assert.equal(buttonModule.dispatchedEvents[0].type, "hass-more-info");
assert.equal(buttonModule.dispatchedEvents[0].detail.entityId, "media_player.tv");
assert.equal(buttonModule.customCards[0].type, "glass-button-card");
buttonCard.setConfig({ entity: "light.living_room", icon: "mdi:sofa-outline", color: "gray" });
buttonCard.hass = {
  states: { "light.living_room": { state: "on", attributes: {} } },
  callService: (...args) => serviceCalls.push(args),
};
assert.match(buttonCard.shadowRoot.innerHTML, /--accent:#8f9299/);
buttonCard.setConfig({
  entity: "light.living_room",
  icon: "mdi:sofa-outline",
  button_size: 1,
  show_name: false,
  show_card_frame: false,
});
assert.match(buttonCard.shadowRoot.innerHTML, /--button-size:clamp\(24px,5vw,38px\)/);
assert.match(buttonCard.shadowRoot.innerHTML, /class="card no-frame"/);
assert.doesNotMatch(buttonCard.shadowRoot.innerHTML, /class="name"/);
buttonCard.setConfig({ entity: "light.living_room", name: "Wohnzimmer", show_name: true, show_card_frame: false });
assert.match(buttonCard.shadowRoot.innerHTML, /class="name">Wohnzimmer/);
assert.doesNotMatch(buttonCard.shadowRoot.innerHTML, /\.no-frame \.name/);

const buttonForm = buttonModule.Card.getConfigForm();
const buttonSchema = Object.fromEntries(buttonForm.schema.map((field) => [field.name, field]));
assert.equal(buttonSchema.entity.selector.entity !== undefined, true);
assert.equal(buttonForm.computeLabel(buttonSchema.name), "Beschriftung");
assert.equal(buttonSchema.icon.selector.icon !== undefined, true);
assert.equal(buttonSchema.color.selector.select.options.map(({ value }) => value).join(","), "orange,white,gray,green,red");
assert.equal(buttonSchema.color.selector.select.options.every(({ label }) => typeof label === "string" && label.length > 0), true);
assert.equal(buttonSchema.button_size.selector.number.mode, "slider");
assert.equal(buttonSchema.show_card_frame.selector.boolean !== undefined, true);
assert.equal(buttonSchema.show_brightness_slider.default, true);
assert.equal(buttonSchema.icon_active.selector.icon !== undefined, true);
assert.equal(buttonSchema.icon_inactive.selector.icon !== undefined, true);
assert.equal(buttonSchema.color_active.selector.select.options.map(({ value }) => value).join(","), "orange,white,gray,green,red");
assert.equal(buttonSchema.color_inactive.selector.select.options.map(({ value }) => value).join(","), "orange,white,gray,green,red");
assert.equal(buttonSchema.binary_sensor_active_state.selector.select.options.map(({ value }) => value).join(","), "on,off");
const buttonEditor = buttonModule.Card.getConfigElement();
buttonEditor.setConfig({ entity: "binary_sensor.door", color_active: "red", action: "toggle" });
const buttonEditorForm = buttonEditor.shadowRoot.querySelector("ha-form");
const fieldNames = () => buttonEditorForm.schema.map((field) => field.name);
for (const name of ["icon_active", "icon_inactive", "state_active", "state_inactive", "color_active", "color_inactive", "binary_sensor_active_state"]) assert.ok(fieldNames().includes(name));
for (const name of ["icon", "color", "action", "show_brightness_slider"]) assert.ok(!fieldNames().includes(name));
buttonEditor.setConfig({ entity: "light.living_room", color_active: "red" });
for (const name of ["icon", "color", "action", "show_brightness_slider"]) assert.ok(fieldNames().includes(name));
for (const name of ["icon_active", "icon_inactive", "state_active", "state_inactive", "color_active", "color_inactive", "binary_sensor_active_state"]) assert.ok(!fieldNames().includes(name));
assert.equal(buttonEditorForm.data.color_active, "red");
buttonEditor.setConfig({ entity: "switch.test" });
assert.ok(!fieldNames().includes("show_brightness_slider"));

const sensorCard = new buttonModule.Card();
sensorCard.setConfig({ entity: "binary_sensor.door", icon: "mdi:door", icon_active: "mdi:door-closed", icon_inactive: "mdi:door-open", color_active: "green", color_inactive: "red", binary_sensor_active_state: "off" });
assert.match(sensorCard.shadowRoot.innerHTML, /--sensor-active-color:#4bc785;--sensor-inactive-color:#f05c5c/);
const sensorHass = (state) => ({ states: { "binary_sensor.door": { state, attributes: {} } }, callService: (...args) => serviceCalls.push(args) });
sensorCard.hass = sensorHass("on");
const sensorCallsBefore = serviceCalls.length;
sensorCard._callButton();
assert.equal(serviceCalls.length, sensorCallsBefore);
assert.equal(buttonModule.dispatchedEvents.at(-1).type, "hass-more-info");
assert.equal(buttonModule.dispatchedEvents.at(-1).detail.entityId, "binary_sensor.door");
assert.equal(sensorCard.shadowRoot.querySelector(".button ha-icon").getAttribute("icon"), "mdi:door-open");
assert.equal(sensorCard.shadowRoot.querySelector(".button").classList.inactive, true);
assert.equal(sensorCard.shadowRoot.querySelector(".state-value").textContent, "Offen");
const sensorRenderCount = sensorCard._innerHTMLWrites;
sensorCard.hass = sensorHass("off");
assert.equal(sensorCard.shadowRoot.querySelector(".button ha-icon").getAttribute("icon"), "mdi:door-closed");
assert.equal(sensorCard.shadowRoot.querySelector(".button").classList.active, true);
assert.equal(sensorCard.shadowRoot.querySelector(".state-value").textContent, "Geschlossen");
assert.equal(sensorCard._innerHTMLWrites, sensorRenderCount);
sensorCard.hass = sensorHass("unavailable");
assert.equal(sensorCard.shadowRoot.querySelector(".button").classList.active, false);
assert.equal(sensorCard.shadowRoot.querySelector(".button").classList.inactive, false);
assert.equal(sensorCard.shadowRoot.querySelector(".button ha-icon").getAttribute("icon"), "mdi:door");
assert.equal(sensorCard.shadowRoot.querySelector(".state-value").textContent, "");
sensorCard.setConfig({ entity: "binary_sensor.door", icon: "mdi:door" });
sensorCard.hass = sensorHass("on");
assert.equal(sensorCard.shadowRoot.querySelector(".button").classList.active, true);
assert.equal(sensorCard.shadowRoot.querySelector(".button ha-icon").getAttribute("icon"), "mdi:door");
sensorCard.setConfig({ entity: "binary_sensor.door", icon_active: "mdi:door-open", icon_inactive: "mdi:door-closed", color_active: "red", color_inactive: "green" });
sensorCard.hass = sensorHass("on");
assert.equal(sensorCard.shadowRoot.querySelector(".button").classList.active, true);
assert.equal(sensorCard.shadowRoot.querySelector(".button ha-icon").getAttribute("icon"), "mdi:door-open");
sensorCard.hass = sensorHass("off");
assert.equal(sensorCard.shadowRoot.querySelector(".button").classList.inactive, true);
assert.equal(sensorCard.shadowRoot.querySelector(".button ha-icon").getAttribute("icon"), "mdi:door-closed");
assert.match(sensorCard.shadowRoot.innerHTML, /--sensor-active-color:#f05c5c;--sensor-inactive-color:#4bc785/);
for (const activeState of ["on", "off"]) {
  sensorCard.setConfig({ entity: "binary_sensor.door", binary_sensor_active_state: activeState, state_active: "Alarm", state_inactive: "Sicher" });
  sensorCard.hass = sensorHass(activeState);
  assert.equal(sensorCard.shadowRoot.querySelector(".state-value").textContent, "Alarm");
  sensorCard.hass = sensorHass(activeState === "on" ? "off" : "on");
  assert.equal(sensorCard.shadowRoot.querySelector(".state-value").textContent, "Sicher");
  sensorCard.hass = sensorHass("unknown");
  assert.equal(sensorCard.shadowRoot.querySelector(".state-value").textContent, "");
}
buttonCard.setConfig({ entity: "light.living_room", color: "green" });
assert.match(buttonCard.shadowRoot.innerHTML, /--accent:#4bc785/);
buttonCard.setConfig({ entity: "light.living_room", color: "red" });
assert.match(buttonCard.shadowRoot.innerHTML, /--accent:#f05c5c/);

const dimmerCard = new buttonModule.Card();
dimmerCard.setConfig({ entity: "light.dimmed", button_size: 1 });
assert.match(dimmerCard.shadowRoot.innerHTML, /\.brightness-value,\.state-value \{ color:inherit;/);
const dimmerState = (state, attributes) => ({ states: { "light.dimmed": { state, attributes } }, callService: (...args) => serviceCalls.push(args) });
dimmerCard.hass = dimmerState("off", { supported_color_modes: ["brightness"] });
const dimmerSlider = dimmerCard.shadowRoot.querySelector(".dimmer");
assert.equal(dimmerSlider.classList.visible, true);
assert.equal(dimmerSlider.classList.inactive, true);
assert.equal(dimmerCard.shadowRoot.querySelector(".state-value").textContent, "");
assert.equal(dimmerSlider.getAttribute("aria-valuenow"), "0");
const dimmerRenderCount = dimmerCard._innerHTMLWrites;
dimmerCard.hass = dimmerState("on", { supported_color_modes: ["brightness"], brightness: 128 });
assert.equal(dimmerCard._innerHTMLWrites, dimmerRenderCount);
assert.equal(dimmerSlider.getAttribute("aria-valuenow"), "50");
assert.equal(dimmerSlider.classList.inactive, false);
assert.equal(dimmerCard.shadowRoot.querySelector(".brightness-value").textContent, "50 %");
dimmerCard._brightnessKey({ key: "ArrowRight", preventDefault() {} });
assert.equal(serviceCalls.at(-1)[0], "light");
assert.equal(serviceCalls.at(-1)[1], "turn_on");
assert.equal(serviceCalls.at(-1)[2].brightness_pct, 55);
dimmerCard.hass = { ...dimmerCard.hass, states: { ...dimmerCard.hass.states, "sensor.other": { state: "on" } } };
assert.equal(dimmerSlider.getAttribute("aria-valuenow"), "55");
dimmerCard.hass = dimmerState("on", { supported_color_modes: ["brightness"], brightness: 140 });
assert.equal(dimmerSlider.getAttribute("aria-valuenow"), "55");
dimmerCard._brightnessKey({ key: "Home", preventDefault() {} });
assert.equal(serviceCalls.at(-1)[1], "turn_off");
dimmerCard._setBrightnessFromPointer({ clientX: 100, clientY: 50 });
assert.equal(dimmerSlider.getAttribute("aria-valuenow"), "25");
const pointerAt = (percent) => ({ clientX: 50 + 50 * Math.sin(percent / 100 * 2 * Math.PI), clientY: 50 - 50 * Math.cos(percent / 100 * 2 * Math.PI) });
dimmerCard._dragging = true;
dimmerCard._pointerValue = 98;
dimmerCard._dragBrightness = 98;
dimmerCard._setBrightnessFromPointer(pointerAt(2));
assert.equal(dimmerCard._brightness, 100, "Dragging past 100 must stop instead of wrapping to zero");
dimmerCard._setBrightnessFromPointer(pointerAt(5));
assert.equal(dimmerCard._brightness, 100);
dimmerCard._setBrightnessFromPointer(pointerAt(3));
assert.equal(dimmerCard._brightness, 98, "Reversing at the upper stop must immediately lower brightness");
dimmerCard._pointerValue = 2;
dimmerCard._dragBrightness = 2;
dimmerCard._setBrightnessFromPointer(pointerAt(98));
assert.equal(dimmerCard._brightness, 0, "Dragging past zero must not wrap to 100");
dimmerCard._setBrightnessFromPointer(pointerAt(99));
assert.equal(dimmerCard._brightness, 1);
dimmerCard._dragging = false;
dimmerCard.setConfig({ entity: "light.dimmed", show_brightness_slider: false });
assert.equal(dimmerSlider.classList.visible, false);
dimmerCard.setConfig({ entity: "light.dimmed" });
dimmerCard.hass = dimmerState("on", { supported_color_modes: ["onoff"] });
assert.equal(dimmerSlider.classList.visible, false);
dimmerCard.hass = dimmerState("unavailable", { supported_color_modes: ["brightness"] });
assert.equal(dimmerSlider.getAttribute("aria-disabled"), "true");
const callsBeforeUnavailable = serviceCalls.length;
dimmerCard._brightnessKey({ key: "End", preventDefault() {} });
assert.equal(serviceCalls.length, callsBeforeUnavailable);

const coverModule = await loadCard("dist/glass-cover-card.js", "glass-cover-card", "glass-cover-card-editor");
const coverCard = new coverModule.Card();
coverCard.setConfig({ entity: "cover.office", show_preview: false });
coverCard.hass = {
  states: { "cover.office": { state: "open", attributes: { current_position: 45 } } },
  callService: (...args) => serviceCalls.push(args),
};
assert.match(coverCard.shadowRoot.innerHTML, /range-row/);
assert.match(coverCard.shadowRoot.innerHTML, /class="controls"/);
coverCard.setConfig({ entity: "cover.office", show_preview: false, show_position_slider: false });
assert.doesNotMatch(coverCard.shadowRoot.innerHTML, /class="range-row"/);
assert.match(coverCard.shadowRoot.innerHTML, /class="controls"/);
coverCard.setConfig({ entity: "cover.office", show_preview: false });
assert.equal(coverModule.customCards[0].type, "glass-cover-card");
const initialCoverRenderCount = coverCard._innerHTMLWrites;
coverCard.hass = {
  states: {
    "cover.office": { state: "open", attributes: { current_position: 45 } },
    "sensor.unrelated": { state: "12", attributes: {} },
  },
  callService: (...args) => serviceCalls.push(args),
};
assert.equal(coverCard._innerHTMLWrites, initialCoverRenderCount, "Unrelated HA state changes must not rebuild the cover card DOM");
coverCard.hass = {
  states: { "cover.office": { state: "open", attributes: { current_position: 44 } } },
  callService: (...args) => serviceCalls.push(args),
};
assert.equal(coverCard._innerHTMLWrites, initialCoverRenderCount + 1, "Relevant cover updates must refresh the preview");
const coverForm = coverModule.Card.getConfigForm();
const coverSchema = Object.fromEntries(coverForm.schema.map((field) => [field.name, field]));
assert.equal(coverSchema.entity.selector.entity.filter.domain, "cover");
assert.equal(coverSchema.tilt_entity.selector.entity.filter.domain, "cover");
assert.equal(coverSchema.show_action_button.default, true);
assert.equal(coverSchema.show_position_slider.default, true);
assert.ok(coverSchema.title.selector.text, "Cover editor must expose a title text field");
assert.equal(coverForm.computeLabel(coverSchema.title), "Titel");
assert.equal(coverForm.computeLabel(coverSchema.name), "Beschriftung");
assert.equal(coverSchema.button_size.selector.number.mode, "slider");
assert.equal(coverModule.Card.getConfigElement, undefined);

const marketplaceEntry = await loadCard("dist/glass-cover-card.js", "glass-cover-card", "glass-cover-card-editor");
assert.ok(marketplaceEntry.definitions.has("glass-button-card"));
assert.equal(typeof marketplaceEntry.Card.getConfigForm, "function");
assert.ok(marketplaceEntry.definitions.has("glass-panel-card"));
assert.ok(marketplaceEntry.definitions.has("glass-rgb-card"));
assert.ok(marketplaceEntry.definitions.has("glass-text-card"));
assert.ok(marketplaceEntry.definitions.has("glass-value-card"));
assert.ok(marketplaceEntry.definitions.has("glass-splitter-card"));
assert.ok(marketplaceEntry.definitions.has("glass-buttons-card"));
assert.ok(marketplaceEntry.definitions.has("glass-timer-card"));
assert.ok(marketplaceEntry.definitions.has("glass-navigation-card"));
assert.ok(marketplaceEntry.definitions.has("glass-ventilation-card"));
const TimerBarCard = marketplaceEntry.definitions.get("glass-timer-bar-card");
assert.ok(TimerBarCard);
const timerForm = TimerBarCard.getConfigForm();
assert.equal(timerForm.schema[0].selector.entity.filter.domain, "timer");
const timerSchema = Object.fromEntries(timerForm.schema.map((field) => [field.name, field]));
for (const field of ["icon_size", "text_size", "button_size"]) assert.equal(timerSchema[field].selector.number.mode, "slider");
assert.equal(timerSchema.show_card_frame.selector.boolean !== undefined, true);
const timerBar = new TimerBarCard();
assert.throws(() => timerBar.setConfig({ entity: "fan.test" }), /Timer-Entität/);
assert.throws(() => timerBar.setConfig({ entity: "timer.test", duration: "00:99:00" }), /Dauer/);
timerBar.setConfig({ entity: "timer.test", name: "Stoßlüftung", duration: "00:30:00" });
const timerBarCalls = [];
const timerBarStates = { "timer.test": { state: "idle", attributes: { duration: "00:30:00" } } };
const timerBarHass = { states: timerBarStates, callService: (...args) => timerBarCalls.push(args) };
timerBar.hass = timerBarHass;
assert.match(timerBar.shadowRoot.innerHTML, /Bereit/);
assert.match(timerBar.shadowRoot.innerHTML, /Starten/);
timerBar._action("start");
assert.equal(JSON.stringify(timerBarCalls.at(-1)), JSON.stringify(["timer", "start", { entity_id: "timer.test", duration: "00:30:00" }]));
timerBarStates["timer.test"] = { state: "active", attributes: { duration: "00:30:00", finishes_at: new Date(Date.now() + 900000).toISOString() } };
timerBar.hass = timerBarHass;
assert.match(timerBar.shadowRoot.innerHTML, /Läuft/);
assert.match(timerBar.shadowRoot.innerHTML, /15:00/);
assert.ok(timerBar._progress() > 49 && timerBar._progress() <= 50);
timerBar._action("pause");
assert.equal(JSON.stringify(timerBarCalls.at(-1)), JSON.stringify(["timer", "pause", { entity_id: "timer.test" }]));
timerBarStates["timer.test"] = { state: "paused", attributes: { duration: "00:30:00", remaining: "00:12:34" } };
timerBar.hass = timerBarHass;
assert.match(timerBar.shadowRoot.innerHTML, /Pausiert/);
assert.match(timerBar.shadowRoot.innerHTML, /12:34/);
timerBar._action("resume");
assert.equal(JSON.stringify(timerBarCalls.at(-1)), JSON.stringify(["timer", "start", { entity_id: "timer.test" }]));
timerBar._action("cancel");
assert.equal(JSON.stringify(timerBarCalls.at(-1)), JSON.stringify(["timer", "cancel", { entity_id: "timer.test" }]));
timerBarStates["timer.test"] = { state: "unavailable", attributes: {} };
timerBar.hass = timerBarHass;
assert.match(timerBar.shadowRoot.innerHTML, /Nicht verfügbar/);
assert.match(timerBar.shadowRoot.innerHTML, /disabled/);
timerBar.setConfig({ entity: "timer.test", name: "Stoßlüftung", icon_size: 1, text_size: 1, button_size: 1, show_card_frame: false });
assert.match(timerBar.shadowRoot.innerHTML, /class="card no-frame"/);
assert.match(timerBar.shadowRoot.innerHTML, /\.timer-icon \{ display:grid; width:clamp\(28\.6px/);
const TimerCard = marketplaceEntry.definitions.get("glass-timer-card");
const timerAlias = new TimerCard();
timerAlias.setConfig({ entity: "timer.test" });
assert.match(timerAlias.shadowRoot.innerHTML, /class="card /);
const ButtonAlias = marketplaceEntry.definitions.get("glass-buttons-card");
const buttonAlias = new ButtonAlias();
buttonAlias.setConfig({ entity: "switch.alias", button_size: 2, show_card_frame: false });
assert.match(buttonAlias.shadowRoot.innerHTML, /class="card no-frame"/);
timerBar.disconnectedCallback();

const ValueCard = marketplaceEntry.definitions.get("glass-value-card");
const valueForm = ValueCard.getConfigForm();
const valueSchema = Object.fromEntries(valueForm.schema.map((field) => [field.name, field]));
assert.equal(valueSchema.image_size.selector.number.mode, "slider");
assert.equal(valueSchema.value_size.selector.number.mode, "slider");
const valueCard = new ValueCard();
valueCard.setConfig({ entity: "fan.living_room", name: "Lüftung" });
valueCard.hass = { states: { "fan.living_room": { state: "on", attributes: { percentage: 45 } } } };
assert.match(valueCard.shadowRoot.innerHTML, /class="visual-icon spinning" icon="mdi:fan"/);
assert.match(valueCard.shadowRoot.innerHTML, />45<small class="unit">%<\/small>/);
valueCard.setConfig({ entity: "cover.office", name: "Jalousie", visual_type: "auto" });
valueCard.hass = { states: { "cover.office": { state: "open", attributes: { current_position: 30 } } } };
assert.match(valueCard.shadowRoot.innerHTML, /class="window" style="--position:30%;--tilt:50"/);
assert.match(valueCard.shadowRoot.innerHTML, /class="glass"/);
assert.match(valueCard.shadowRoot.innerHTML, /\.glass::before \{[^}]*#323d38/);
assert.match(valueCard.shadowRoot.innerHTML, /class="slats"><i style="--i:0"><\/i>/);
assert.equal((valueCard.shadowRoot.innerHTML.match(/<i style="--i:/g) || []).length, 7);
assert.match(valueCard.shadowRoot.innerHTML, /radial-gradient\(ellipse at 70% 42%,#fff5cd/);
assert.match(valueCard.shadowRoot.innerHTML, />70<small class="unit">%<\/small>/);
valueCard.hass = { states: { "cover.office": { state: "open", attributes: { current_position: 100 } } } };
assert.match(valueCard.shadowRoot.innerHTML, /class="window" style="--position:100%;--tilt:50"/);
assert.match(valueCard.shadowRoot.innerHTML, /\.glass::before \{[^}]*#323d38/);
valueCard.setConfig({ entity: "sensor.temperature", visual_type: "image", image: "/local/temperature.png", attribute: "temperature", unit: "°C", image_size: 2, value_size: 4, show_card_frame: false });
valueCard.hass = { states: { "sensor.temperature": { state: "22.5", attributes: { temperature: 22.5 } } } };
assert.match(valueCard.shadowRoot.innerHTML, /class="card no-frame"/);
assert.match(valueCard.shadowRoot.innerHTML, /src="\/local\/temperature.png"/);
assert.match(valueCard.shadowRoot.innerHTML, />22\.5<small class="unit">°C<\/small>/);
assert.throws(() => valueCard.setConfig({ entity: "sensor.temperature", image: "javascript:alert(1)" }), /Bild/);

const SplitterCard = marketplaceEntry.definitions.get("glass-splitter-card");
const splitterForm = SplitterCard.getConfigForm();
assert.equal(splitterForm.schema.find((field) => field.name === "thickness").selector.number.max, 5);
const splitter = new SplitterCard();
splitter.setConfig({ thickness: 3, spacing: 4 });
assert.match(splitter.shadowRoot.innerHTML, /role="separator" aria-orientation="horizontal" style="height:3px"/);
assert.match(splitter.shadowRoot.innerHTML, /margin:24px 0/);

const VentilationCard = marketplaceEntry.definitions.get("glass-ventilation-card");
const ventilationForm = VentilationCard.getConfigForm();
const ventilationSchema = Object.fromEntries(ventilationForm.schema.map((field) => [field.name, field]));
assert.equal(ventilationSchema.entity.selector.entity.filter.domain, "fan");
assert.equal(ventilationSchema.timer_entity.selector.entity.filter.domain, "timer");
assert.equal(ventilationSchema.timer_duration.default, "00:30:00");
assert.equal(ventilationSchema.speed_levels.default, 3);
assert.equal(ventilationSchema.title_size.default, 5);
assert.equal(ventilationSchema.button_size.default, 5);
assert.equal(ventilationSchema.preview_size.default, 5);
assert.equal(ventilationSchema.show_preview.default, true);
assert.equal(ventilationSchema.show_button_labels.default, true);
assert.equal(ventilationSchema.show_action_button.default, true);
assert.equal(ventilationSchema.timer_text_size.default, 5);
const ventilationCalls = [];
const ventilationCard = new VentilationCard();
ventilationCard.setConfig({ entity: "fan.living_room", timer_entity: "timer.airing", timer_duration: "00:30:00", speed_levels: 3 });
ventilationCard.hass = {
  states: {
    "fan.living_room": { state: "on", attributes: { percentage: 67, percentage_step: 1, preset_mode: "Stufe 2" } },
    "timer.airing": { state: "active", attributes: { finishes_at: new Date(Date.now() + 29 * 60 * 1000 + 53 * 1000).toISOString(), duration: "00:30:00" } },
  },
  callService: (...args) => ventilationCalls.push(args),
};
const ventilationLevelsMarkup = ventilationCard.shadowRoot.innerHTML.match(/<nav class="levels"[^]*?<\/nav>/)?.[0] || "";
assert.match(ventilationCard.shadowRoot.innerHTML, /67<small> %/);
assert.match(ventilationCard.shadowRoot.innerHTML, /Stufe 2 aktiv/);
assert.match(ventilationLevelsMarkup, /<ha-icon icon="mdi:fan-off"/);
assert.match(ventilationLevelsMarkup, /<ha-icon icon="mdi:fan"/);
assert.match(ventilationCard.shadowRoot.innerHTML, /class="fan-visual is-on" style="--fan-spin-duration:1\.42s"/);
assert.match(ventilationCard.shadowRoot.innerHTML, /\.fan-visual\.is-on \.fan-rotor \{[^}]*animation:fan-spin var\(--fan-spin-duration\) linear infinite/);
assert.match(ventilationCard.shadowRoot.innerHTML, /class="fan-rotor"/);
assert.match(ventilationCard.shadowRoot.innerHTML, /class="level-label">Stufe 2/);
assert.match(ventilationCard.shadowRoot.innerHTML, /<span class="level-icon"><ha-icon icon="mdi:fan"[^>]*><\/ha-icon><\/span><sup>2<\/sup>/);
assert.match(ventilationCard.shadowRoot.innerHTML, /\.level-button sup \{[^}]*right:19%; bottom:13%; font-size:clamp\(16px,3\.2cqw,24px\)/);
assert.match(ventilationCard.shadowRoot.innerHTML, /aria-label="Lüfter"/);
assert.match(ventilationCard.shadowRoot.innerHTML, /aria-label="Timer pausieren"/);
assert.doesNotMatch(ventilationCard.shadowRoot.innerHTML, /undefined/);
assert.match(ventilationCard.shadowRoot.innerHTML, /29:53/);
assert.match(ventilationCard.shadowRoot.innerHTML, /<div class="timer-status"><strong>Stoßlüftung<\/strong><span><i><\/i><span class="timer-countdown">29:53<\/span><\/span><\/div>/);
assert.doesNotMatch(ventilationCard._timerMarkup(ventilationCard._timerState()), /Läuft/);
assert.match(ventilationCard.shadowRoot.innerHTML, /\.level-icon \{[^}]*width:65%/);
assert.match(ventilationCard.shadowRoot.innerHTML, /--level-icon-size:65px/);
assert.match(ventilationCard.shadowRoot.innerHTML, /\.level-icon ha-icon \{[^}]*--mdc-icon-size:var\(--level-icon-size\)/);
ventilationCard._hass.states["fan.living_room"].attributes.percentage = 100;
ventilationCard.hass = ventilationCard._hass;
assert.match(ventilationCard.shadowRoot.innerHTML, /--fan-spin-duration:0\.45s/);
ventilationCard._hass.states["fan.living_room"].attributes.percentage = 67;
ventilationCard.hass = ventilationCard._hass;
assert.match(ventilationCard.shadowRoot.innerHTML, /class="timer-progress"/);
ventilationCard._setFanLevel(2);
assert.equal(JSON.stringify(ventilationCalls.at(-1)), JSON.stringify(["fan", "set_percentage", { entity_id: "fan.living_room", percentage: 67 }]));
ventilationCard._timerAction("pause");
assert.equal(JSON.stringify(ventilationCalls.at(-1)), JSON.stringify(["timer", "pause", { entity_id: "timer.airing" }]));
ventilationCard._timerAction("cancel");
assert.equal(JSON.stringify(ventilationCalls.at(-1)), JSON.stringify(["timer", "cancel", { entity_id: "timer.airing" }]));
ventilationCard._timerAction("start");
assert.equal(JSON.stringify(ventilationCalls.at(-1)), JSON.stringify(["timer", "start", { entity_id: "timer.airing", duration: "00:30:00" }]));
ventilationCard.disconnectedCallback();
ventilationCard._hass = { states: { "fan.living_room": { state: "off", attributes: {} }, "timer.airing": { state: "idle", attributes: {} } } };
assert.match(ventilationCard._timerMarkup(ventilationCard._timerState()), /Starten/);
assert.throws(() => ventilationCard.setConfig({ entity: "light.living_room" }), /Fan-Entität/);
assert.throws(() => ventilationCard.setConfig({ entity: "fan.living_room", timer_entity: "light.timer" }), /Timer-Entität/);
ventilationCard._hass = { states: { "fan.living_room": { state: "off", attributes: {} }, "timer.airing": { state: "paused", attributes: { remaining: "00:12:34" } } } };
assert.match(ventilationCard._timerMarkup(ventilationCard._timerState()), /Fortsetzen/);
assert.match(ventilationCard._timerMarkup(ventilationCard._timerState()), /12:34/);
ventilationCard._hass.callService = (...args) => ventilationCalls.push(args);
ventilationCard._timerAction("start");
assert.equal(JSON.stringify(ventilationCalls.at(-1)), JSON.stringify(["timer", "start", { entity_id: "timer.airing" }]));
ventilationCard.setConfig({ entity: "fan.living_room", action_entity: "switch.test", action_icon: "mdi:power", show_button_labels: false, show_preview: false, timer_text_size: 1 });
assert.doesNotMatch(ventilationCard.shadowRoot.innerHTML, /<span class="level-label"/);
assert.doesNotMatch(ventilationCard.shadowRoot.innerHTML, /<section class="main"/);
assert.match(ventilationCard.shadowRoot.innerHTML, /icon="mdi:power"/);
assert.ok(Math.abs(Number(ventilationCard.shadowRoot.innerHTML.match(/--timer-title:([\d.]+)px/)?.[1]) - 14.4) < 0.001);
ventilationCard._toggleAction();
assert.equal(JSON.stringify(ventilationCalls.at(-1)), JSON.stringify(["homeassistant", "toggle", { entity_id: "switch.test" }]));
ventilationCard.setConfig({ entity: "fan.living_room", show_action_button: false });
assert.doesNotMatch(ventilationCard.shadowRoot.innerHTML, /<button type="button" class="header-action/);
const ventilationWithoutTimer = new VentilationCard();
ventilationWithoutTimer.setConfig({ entity: "fan.living_room" });
assert.doesNotMatch(ventilationWithoutTimer.shadowRoot.innerHTML, /class="timer-panel/);
const NavigationCard = marketplaceEntry.definitions.get("glass-navigation-card");
const navigationForm = NavigationCard.getConfigForm();
const navigationSchema = Object.fromEntries(navigationForm.schema.map((field) => [field.name, field]));
assert.equal(navigationSchema.items.selector.object.multiple, true);
assert.ok(navigationSchema.show_button_borders.selector.boolean);
assert.equal(navigationSchema.scale.selector.number.min, 70);
assert.equal(navigationSchema.scale.selector.number.max, 140);
assert.equal(navigationSchema.scale.selector.number.step, 5);
assert.ok(navigationSchema.active.selector.text);
assert.equal(navigationSchema.color.selector.select.options.map(({ value }) => value).join(","), "orange,white,gray,green,red");
assert.equal(navigationSchema.position.selector.select.options.map(({ value }) => value).join(","), "top,bottom,left,right");
assert.equal(navigationForm.computeLabel(navigationSchema.color), "Akzentfarbe");
const navigationCard = new NavigationCard();
navigationCard.setConfig({
  color: "green",
  position: "left",
  scale: 80,
  active: "Home",
  items: [
    { name: "Home", icon: "mdi:home", url: "/lovelace/home" },
    { name: "Räume", icon: "mdi:view-grid", menu_title: "Raum wählen", children: [
      { name: "UG", icon: "mdi:home-floor-b", children: [{ name: "Waschküche", icon: "mdi:washing-machine", url: "/lovelace/waschkueche" }] },
      { name: "EG", icon: "mdi:home-floor-0", default: true, children: [
        { name: "Küche", icon: "mdi:pot-steam", label: "", default: true, url: "/lovelace/kueche" },
        { name: "Wohnen", icon: "mdi:sofa", label: "Wohnbereich", url: "/lovelace/wohnen" },
        { name: "Flur", icon: "mdi:door", url: "/lovelace/flur" },
        { name: "Bad", icon: "mdi:shower", url: "/lovelace/bad" },
        { name: "Büro", icon: "mdi:desk", url: "/lovelace/buero" },
      ] },
      { name: "OG", icon: "mdi:home-floor-1", children: [{ name: "Schlafzimmer", icon: "mdi:bed", url: "/lovelace/schlafzimmer" }] },
    ] },
    { type: "separator" },
    { name: "Mehr", icon: "mdi:dots-horizontal", url: "/lovelace/mehr" },
  ],
});
assert.equal(navigationCard._config.position, "left");
assert.equal(navigationCard._config.scale, 80);
assert.equal(navigationCard._config.color, "green");
assert.equal(navigationCard._config.show_button_borders, true);
assert.match(navigationCard.shadowRoot.innerHTML, /class="shell position-left /);
assert.match(navigationCard.shadowRoot.innerHTML, /--nav-scale:0\.8/);
assert.match(navigationCard.shadowRoot.innerHTML, /\.bar \.nav-item\{display:grid;place-items:center;flex:0 1 64px/);
assert.match(navigationCard.shadowRoot.innerHTML, /\.bar \.nav-item>ha-icon\{display:block;width:31px;height:31px;--mdc-icon-size:31px\}/);
assert.match(navigationCard.shadowRoot.innerHTML, /\.no-button-borders \.bar \.nav-item\.active\{border-color:transparent\}/);
assert.match(navigationCard.shadowRoot.innerHTML, /class="nav-item active" data-root-index="0"/);
assert.match(navigationCard.shadowRoot.innerHTML, /class="nav-item inactive" data-root-index="1"/);
navigationCard._menuRootIndex = 1;
assert.equal(navigationCard._menuTitle(), "Raum wählen");
navigationCard._render();
assert.match(navigationCard.shadowRoot.innerHTML, /<span class="chevron" aria-hidden="true"><ha-icon icon="mdi:chevron-right"/);
assert.match(navigationCard.shadowRoot.innerHTML, /class="menu-segments" role="group" aria-label="Ebene 1"/);
assert.match(navigationCard.shadowRoot.innerHTML, /class="segment selected"[^>]*data-segment-index="1"/);
assert.match(navigationCard.shadowRoot.innerHTML, /class="nav-separator" role="separator" aria-orientation="horizontal"/);
assert.match(navigationCard.shadowRoot.innerHTML, /\.submenu-items\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
assert.match(navigationCard.shadowRoot.innerHTML, /\.submenu-items \.nav-item\{display:flex;flex-direction:column;align-items:center;justify-content:center/);
assert.match(navigationCard.shadowRoot.innerHTML, /\.submenu-items \.nav-item>ha-icon\{display:block;flex:none;width:34px;height:34px;--mdc-icon-size:34px\}/);
navigationCard._config.position = "bottom";
navigationCard._render();
assert.match(navigationCard.shadowRoot.innerHTML, /<span class="chevron" aria-hidden="true"><ha-icon icon="mdi:chevron-up"/);
navigationCard._config.position = "left";
navigationCard._render();
assert.match(navigationCard.shadowRoot.innerHTML, /\.position-left \.bar,\.position-right \.bar\{flex-direction:column;width:86px/);
navigationCard._menuPath = [1];
navigationCard._render();
assert.equal(navigationCard._visibleItems().length, 5, "Five rooms must fit a fixed three-column grid over two rows");
assert.match(navigationCard.shadowRoot.innerHTML, /class="nav-item active" data-child-index="0"/);
navigationCard._menuPath = [0];
navigationCard._render();
assert.match(navigationCard.shadowRoot.innerHTML, /class="segment selected"[^>]*data-segment-index="0"/);
navigationCard._menuPath = [1];
navigationCard._render();
const navigationScaleCard = new NavigationCard();
navigationScaleCard.setConfig({ scale: 200, items: [{ name: "Home", icon: "mdi:home", url: "/lovelace/home" }] });
assert.equal(navigationScaleCard._config.scale, 140);
assert.equal(navigationScaleCard._config.show_button_borders, true);
navigationScaleCard.setConfig({ scale: 0, items: [{ name: "Home", icon: "mdi:home", url: "/lovelace/home" }] });
assert.equal(navigationScaleCard._config.scale, 70);
const navigationNoBordersCard = new NavigationCard();
navigationNoBordersCard.setConfig({ show_button_borders: false, items: [{ name: "Home", icon: "mdi:home", url: "/lovelace/home" }] });
assert.match(navigationNoBordersCard.shadowRoot.innerHTML, /class="shell position-bottom no-button-borders"/);
assert.match(navigationCard.shadowRoot.innerHTML, /Küche/);
assert.match(navigationCard.shadowRoot.innerHTML, /aria-label="Küche"/);
assert.doesNotMatch(navigationCard.shadowRoot.innerHTML, /<span>Küche<\/span>/);
assert.match(navigationCard.shadowRoot.innerHTML, /<span>Wohnbereich<\/span>/);
assert.match(navigationCard.shadowRoot.innerHTML, /class="segment selected"/);
navigationCard._menuRootIndex = 1;
navigationCard._render();
navigationCard._onPointer({ composedPath: () => [{ outside: true }] });
assert.equal(navigationCard._menuRootIndex, null, "Outside pointer must close the open submenu");
navigationCard._menuRootIndex = 1;
navigationCard._render();
navigationCard._onKey({ key: "Escape", preventDefault() {} });
assert.equal(navigationCard._menuRootIndex, null, "Escape must close the open submenu");
const navigationEditor = NavigationCard.getConfigElement();
navigationEditor.setConfig({ items: NavigationCard.getStubConfig().items, position: "bottom" });
assert.match(navigationEditor.shadowRoot.innerHTML, /Karte bearbeiten/);
assert.match(navigationEditor.shadowRoot.innerHTML, /<h3>Glass Navigation<\/h3>/);
assert.match(navigationEditor.shadowRoot.innerHTML, /<div class="bar" aria-label="Navigationsvorschau">/);
assert.match(navigationEditor.shadowRoot.innerHTML, /class="editor-toggle" data-action="toggle-edit" aria-label="Karte bearbeiten"/);
assert.match(navigationEditor.shadowRoot.innerHTML, /\.editor-toggle\{display:grid;place-items:center;width:36px;padding:6px\}/);
navigationEditor._handleClick({ composedPath: () => [{ dataset: { action: "toggle-edit" } }] });
assert.match(navigationEditor.shadowRoot.innerHTML, /Menüstruktur/);
assert.match(navigationEditor.shadowRoot.innerHTML, /data-action="add-group"/);
assert.match(navigationEditor.shadowRoot.innerHTML, /aria-label="Bearbeitung abschließen"/);
assert.throws(() => navigationCard.setConfig({ items: [{ name: "Invalid", label: 42, icon: "mdi:home", url: "/home" }] }), /label.*muss Text sein/);
assert.throws(() => navigationCard.setConfig({ items: [{ name: "Bad URL", icon: "mdi:alert", url: "javascript:alert(1)" }] }), /HTTP\(S\)-URL/);
assert.throws(() => navigationCard.setConfig({ items: [{ name: "External", icon: "mdi:alert", url: "//example.com" }] }), /HTTP\(S\)-URL/);
assert.throws(() => navigationCard.setConfig({ items: [{ name: "Ambiguous", icon: "mdi:alert", url: "/home", children: [{ name: "Child", icon: "mdi:home", url: "/child" }] }] }), /entweder eine URL oder Unterpunkte/);
assert.throws(() => navigationCard.setConfig({ items: [{ name: "A", icon: "mdi:a", default: true, url: "/a" }, { name: "B", icon: "mdi:b", default: true, url: "/b" }] }), /nur ein Punkt Standard/);
const rgbForm = marketplaceEntry.definitions.get("glass-rgb-card").getConfigForm();
assert.equal(rgbForm.schema.filter((field) => /^preset_[1-6]$/.test(field.name) && field.selector.color_rgb).length, 6);
assert.equal(rgbForm.schema.find((field) => field.name === "show_action_button").default, true);
assert.equal(rgbForm.schema.find((field) => field.name === "turn_on_text").default, "RGB");
assert.equal(rgbForm.computeLabel(rgbForm.schema.find((field) => field.name === "turn_on_text")), "Text unter dem Einschalt-Icon");
assert.equal(rgbForm.computeLabel(rgbForm.schema.find((field) => field.name === "title")), "Titel");
assert.equal(rgbForm.computeLabel(rgbForm.schema.find((field) => field.name === "name")), "Beschriftung");
const rgbValidationCard = new (marketplaceEntry.definitions.get("glass-rgb-card"))();
rgbValidationCard._render = () => {};
rgbValidationCard._sync = () => {};
assert.throws(() => rgbValidationCard.setConfig({ entity: "light.test", preset_1: [256, 0, 0] }), /Preset 1/);
assert.throws(() => rgbValidationCard.setConfig({ entity: "light.test", preset_2: [1, 2] }), /Preset 2/);
rgbValidationCard.setConfig({ entity: "light.test", preset_6: [0, 128, 255] });
assert.equal(rgbValidationCard._presets[0].slot, 6);
assert.equal(rgbValidationCard._config.turn_on_text, "RGB");
rgbValidationCard.setConfig({ entity: "light.test", turn_on_text: "Einschalten" });
assert.equal(rgbValidationCard._config.turn_on_text, "Einschalten");
rgbValidationCard.setConfig({ entity: "light.test", turn_on_text: "" });
assert.equal(rgbValidationCard._config.turn_on_text, "");
const rgbSource = await readFile("dist/glass-rgb-card.js", "utf8");
assert.match(rgbSource, /turn_on_text/);
assert.doesNotMatch(rgbSource, /--mdc-icon-size:100%/);
assert.match(rgbSource, /\.header-action ha-icon \{ display:block; width:var\(--header-icon-size\); height:var\(--header-icon-size\); --mdc-icon-size:var\(--header-icon-size\); \}/);
assert.doesNotMatch(rgbSource, /class="brightness-arc"/);
assert.match(rgbSource, /<button class="turn-off"[^>]*aria-label="Licht ausschalten"/);
assert.match(rgbSource, /<button class="turn-off"[^>]*><ha-icon icon=/);
assert.match(rgbSource, /border:clamp\(4\.5px,1\.5vw,9px\)/);
assert.match(rgbSource, /\.brightness-control \{ position:absolute; z-index:2; top:60%/);
assert.match(rgbSource, /\.brightness-control \{[^}]*flex-direction:column/);
assert.match(rgbSource, /\.brightness \{[^}]*accent-color:color-mix\(in srgb,hsl\(var\(--hue,0\) 100% 50%\) var\(--saturation,100%\),white\)/);
assert.match(rgbSource, /\.turn-off ha-icon \{[^}]*--mdc-icon-size:clamp\(42px,18vw,96px\)/);
assert.match(rgbSource, /\.wheel-marker::after \{[^}]*box-sizing:border-box;[^}]*top:-2px;[^}]*transform-origin:50% calc\(500% \+ 2px\)/);
assert.match(rgbSource, /\.turn-off \{[^}]*solid var\(--light-color\);[^}]*color:var\(--light-color\)/);
assert.match(rgbSource, /<button class="turn-on"[^>]*><ha-icon icon=/);
assert.match(rgbSource, /this\._config\.turn_on_text/);
assert.match(rgbSource, /class="turn-on-label"/);
assert.deepEqual(marketplaceEntry.customCards.map((card) => card.type).sort(), ["glass-button-card", "glass-buttons-card", "glass-cover-card", "glass-navigation-card", "glass-panel-card", "glass-rgb-card", "glass-room-card", "glass-splitter-card", "glass-text-card", "glass-timer-bar-card", "glass-timer-card", "glass-value-card", "glass-ventilation-card"]);
await marketplaceEntry.runSource(await readFile("dist/glass-button-card.js", "utf8"), "dist/glass-button-card.js");
assert.equal(marketplaceEntry.customCards.length, 13, "Loading standalone cards must not register duplicate card entries");
const RoomCard = marketplaceEntry.definitions.get("glass-room-card");
const roomEditor = RoomCard.getConfigElement();
roomEditor.setConfig({ name: "Wohnzimmer", height: 430 });
const roomForm = roomEditor.shadowRoot.querySelector("ha-form");
const roomSchema = roomForm.schema;
const roomData = roomForm.data;
assert.equal(RoomCard.getConfigForm().computeLabel(roomSchema.find((field) => field.name === "name")), "Beschriftung");
const roomEditorWrites = roomEditor._innerHTMLWrites;
for (let update = 0; update < 30; update++) roomEditor.hass = { states: {} };
assert.equal(roomForm.schema, roomSchema, "Room editor must preserve its schema on hass updates");
assert.equal(roomForm.data, roomData, "Room editor must not reset edited values on hass updates");
assert.equal(roomEditor._innerHTMLWrites, roomEditorWrites, "Room editor must not recreate its form on hass updates");
const roomCard = new RoomCard();
const roomOutput = { textContent: "" };
roomCard.shadowRoot.querySelector = (selector) => selector === ".sensor-value" ? roomOutput : null;
roomCard.setConfig({ name: "Wohnzimmer", entity: "sensor.temperature", image: "/local/room.jpg", height: 430 });
const roomRenderCount = roomCard._innerHTMLWrites;
roomCard.setConfig({ name: "Wohnzimmer", entity: "sensor.temperature", image: "/local/room.jpg", height: 430 });
assert.equal(roomCard._innerHTMLWrites, roomRenderCount, "Repeated identical editor config must preserve the room image and DOM");
roomCard.hass = { states: { "sensor.temperature": { state: "22.5", attributes: { unit_of_measurement: "°C" } } } };
assert.equal(roomOutput.textContent, "22.5 °C");
assert.equal(roomCard._innerHTMLWrites, roomRenderCount);
roomCard._openSensor();
assert.equal(marketplaceEntry.dispatchedEvents.at(-1).detail.entityId, "sensor.temperature");
roomCard.hass = { states: { "sensor.temperature": { state: "unavailable", attributes: {} } } };
assert.equal(roomOutput.textContent, "Sensor nicht verfügbar");
roomCard.hass = { states: { "sensor.temperature": { state: "unknown", attributes: {} } } };
assert.equal(roomOutput.textContent, "Unbekannt");
roomCard.setConfig({ name: "Wohnzimmer", image_position: 0 });
assert.equal(roomOutput.textContent, "");
assert.doesNotMatch(roomCard.shadowRoot.innerHTML, /class="sensor-action"/);
assert.match(roomCard.shadowRoot.innerHTML, /object-position:center 0%/);
assert.equal(RoomCard.getConfigForm().schema.find((field) => field.name === "entity").required, undefined);
roomCard.setConfig({ name: "Wohnzimmer", name_size: 24, sensor_size: 36 });
assert.match(roomCard.shadowRoot.innerHTML, /\.name \{ font-size:24px/);
assert.match(roomCard.shadowRoot.innerHTML, /\.sensor-value \{ font-size:36px/);
roomCard.setConfig({ text_color: "black", sensor_color: "gray", name_size: 24, sensor_size: 36 });
assert.match(roomCard.shadowRoot.innerHTML, /\.name,\.sensor-value \{[^}]*color:#151515/);
assert.match(roomCard.shadowRoot.innerHTML, /\.sensor-value \{ font-size:36px;[^}]*color:#a0a2a6/);
assert.equal(RoomCard.getConfigForm().schema.find((field) => field.name === "sensor_color").selector.select.options.map(({ value }) => value).join(","), "black,white,gray");
roomCard.setConfig({ name_size: 100, sensor_size: 1 });
assert.match(roomCard.shadowRoot.innerHTML, /\.name \{ font-size:48px/);
assert.match(roomCard.shadowRoot.innerHTML, /\.sensor-value \{ font-size:12px/);
roomCard.setConfig({});
assert.match(roomCard.shadowRoot.innerHTML, /\.name \{ font-size:19px/);
assert.match(roomCard.shadowRoot.innerHTML, /\.sensor-value \{ font-size:29px/);
assert.equal(RoomCard.getConfigForm().schema.find((field) => field.name === "text_color").selector.select.options.map(({ value }) => value).join(","), "black,white,gray");
for (const [color, hex] of [["black", "#151515"], ["white", "#ffffff"], ["gray", "#a0a2a6"], ["invalid", "#ffffff"]]) {
  roomCard.setConfig({ name: "Wohnzimmer", text_color: color });
  assert.ok(roomCard.shadowRoot.innerHTML.includes(`color:${hex};`));
}
assert.throws(() => roomCard.setConfig({ entity: "light.test" }), /Sensor/);
assert.throws(() => roomCard.setConfig({ image: "javascript:alert(1)" }), /Bild/);

const rgbCard = new (marketplaceEntry.definitions.get("glass-rgb-card"))();
const rgbViewCard = new (marketplaceEntry.definitions.get("glass-rgb-card"))();
const rgbViewStyle = { setProperty(name, value) { this[name] = value; } };
const rgbViewNodes = {
  ".wheel": { setAttribute() {} }, ".color-control": { style: rgbViewStyle },
  ".brightness-number": {}, ".brightness": { style: { setProperty() {} } },
};
rgbViewCard.shadowRoot.querySelector = (selector) => rgbViewNodes[selector];
rgbViewCard._hue = 180;
rgbViewCard._saturation = 100;
for (const level of [0, 25, 50, 100]) {
  rgbViewCard._brightness = level;
  rgbViewCard._updateView();
  assert.equal(rgbViewStyle["--light-level"], `${level}%`);
}
const rgbUpdateCard = new (marketplaceEntry.definitions.get("glass-rgb-card"))();
rgbUpdateCard._config = { entity: "light.rgb_tv" };
let rgbUpdates = 0;
rgbUpdateCard._sync = () => { rgbUpdates += 1; };
const rgbUpdateState = { state: "on", attributes: { friendly_name: "Fernseher", supported_color_modes: ["rgb"], hs_color: [10, 100], brightness: 128 } };
rgbUpdateCard.hass = { states: { "light.rgb_tv": rgbUpdateState } };
rgbUpdateCard.hass = { states: { "light.rgb_tv": { ...rgbUpdateState, attributes: { ...rgbUpdateState.attributes } }, "sensor.other": { state: "12" } } };
assert.equal(rgbUpdates, 1, "Unrelated HA updates must not update the RGB card DOM");
rgbUpdateCard.hass = { states: { "light.rgb_tv": { ...rgbUpdateState, attributes: { ...rgbUpdateState.attributes, brightness: 200 } } } };
assert.equal(rgbUpdates, 2, "Changes to RGB brightness must update the card");
rgbCard._config = { entity: "light.rgb_test", show_presets: true, preset_1: [255, 0, 0], preset_3: [0, 255, 0] };
rgbCard._hass = { callService: (...args) => serviceCalls.push(args) };
rgbCard._updateView = () => {};
rgbCard._loadPresets();
assert.equal(rgbCard._presets.length, 2);
assert.equal(rgbCard._presets[1].slot, 3);
rgbCard._selectPreset(1);
assert.equal(serviceCalls.at(-1)[0], "light");
assert.equal(serviceCalls.at(-1)[1], "turn_on");
assert.equal(serviceCalls.at(-1)[2].rgb_color.join(","), "0,255,0");
rgbCard._hue = 120;
rgbCard._brightness = 55;
assert.equal(rgbCard._presets[1].rgb.join(","), "0,255,0");
const rgbNodes = {
  ".card": {}, ".header": {}, ".header-action": { classList: { toggle() {} } }, ".action-state": {}, ".subtitle": {}, ".titles": {},
  ".controls": { classList: { toggle(name, value) { this[name] = value; } } }, ".unavailable": {}, ".temperature": {}, ".temperature input": {},
  ".turn-on": {}, ".turn-off": {}, ".wheel": { setAttribute() {} }, ".brightness": {},
};
rgbCard.shadowRoot.querySelector = (selector) => rgbNodes[selector];
rgbCard._pending = false;
const rgbState = (modes) => ({ states: { "light.rgb_test": { state: "on", attributes: { supported_color_modes: modes, brightness: 128 } } } });
rgbCard._hass = rgbState(["rgbw", "color_temp"]);
rgbCard._sync();
assert.equal(rgbNodes[".temperature"].hidden, false);
rgbCard._pending = false;
rgbCard._hass = rgbState(["rgb", "color_temp"]);
rgbCard._sync();
assert.equal(rgbNodes[".temperature"].hidden, true);
rgbCard._hass = rgbState(["rgbw"]);
rgbCard._sync();
assert.equal(rgbNodes[".temperature"].hidden, true);
rgbCard._hass = rgbState(["onoff"]);
rgbCard._sync();
assert.equal(rgbNodes[".controls"].hidden, true);
rgbCard._hass = { states: { "light.rgb_test": { state: "off", attributes: { supported_color_modes: ["rgb"] } } }, callService: (...args) => serviceCalls.push(args) };
rgbCard._sync();
assert.equal(rgbNodes[".controls"].classList["is-off"], true);
assert.equal(rgbNodes[".turn-on"].hidden, false);
assert.equal(rgbNodes[".brightness"].disabled, true);
rgbCard._config.show_presets = false;
rgbCard._toggleLight();
assert.equal(serviceCalls.at(-1)[1], "turn_on");
assert.equal(serviceCalls.at(-1)[2].rgb_color.join(","), "255,0,0");
rgbCard._presets = [];
rgbCard._toggleLight();
assert.equal(serviceCalls.at(-1)[1], "turn_on");
assert.equal(serviceCalls.at(-1)[2].rgb_color, undefined);
rgbCard._hass = { ...rgbState(["rgb"]), callService: (...args) => serviceCalls.push(args) };
rgbCard._sync();
assert.equal(rgbNodes[".turn-on"].hidden, true);
assert.equal(rgbNodes[".brightness"].disabled, false);
rgbCard._toggleLight();
assert.equal(serviceCalls.at(-1)[0], "homeassistant");
assert.equal(serviceCalls.at(-1)[1], "toggle");
clearTimeout(rgbCard._pendingTimer);

const panelCard = new (marketplaceEntry.definitions.get("glass-panel-card"))();
const panelCardClass = marketplaceEntry.definitions.get("glass-panel-card");
assert.equal(typeof panelCardClass.getConfigElement, "function");
assert.equal(panelCardClass.getConfigForm, undefined);
const panelHass = {
  states: { "light.living_room": { state: "on", attributes: {} } },
  callService: (...args) => serviceCalls.push(args),
};
await panelCard.setConfig({
  title: "Aktionen",
  subtitle: "Wohnzimmer",
  title_size: 1,
  button_size: 1,
  show_action_button: true,
  action_entity: "light.living_room",
  action_icon: "mdi:sofa-outline",
  cards: [{ type: "custom:glass-button-card", entity: "light.living_room" }, { type: "custom:glass-button-card", entity: "light.deckenlampe" }],
});
panelCard.hass = panelHass;
assert.equal(panelCard._config.title, undefined);
assert.equal(panelCard._config.cards[0].type, "custom:glass-text-card");
assert.equal(panelCard._config.cards[0].title, "Aktionen");
assert.equal(panelCard._config.cards[0].subtitle, "Wohnzimmer");
assert.equal(panelCard._config.cards[0].title_size, 1);
assert.equal(panelCard._config.cards[0].button_size, 1);
assert.equal(panelCard._config.cards[0].action_entity, "light.living_room");
assert.doesNotMatch(panelCard.shadowRoot.innerHTML, /header-action|Aktionen|Wohnzimmer/);
assert.match(panelCard.shadowRoot.innerHTML, /class="panel"/);
assert.match(panelCard.shadowRoot.innerHTML, /--panel-padding:clamp\(20px,4\.7vw,38px\)/);
const panelRenderCount = panelCard._innerHTMLWrites;
panelCard.hass = { ...panelHass, states: { "light.living_room": { state: "off", attributes: {} } } };
assert.equal(panelCard._innerHTMLWrites, panelRenderCount);
assert.equal(panelCard.shadowRoot.querySelector(".children").children.length, 1);
assert.equal(panelCard.shadowRoot.querySelector(".children").children[0].config.type, "vertical-stack");
assert.equal(panelCard.shadowRoot.querySelector(".children").children[0].config.cards.length, 3);
assert.equal(panelCard.shadowRoot.querySelector(".children").children[0].hass, panelCard.hass);
await panelCard.setConfig({
  title: "Aktionen",
  subtitle: "Wohnzimmer",
  show_action_button: true,
  action_entity: "light.wohnzimmer",
  cards: [{ type: "custom:glass-button-card", entity: "light.living_room" }, { type: "custom:glass-button-card", entity: "light.deckenlampe" }],
});
assert.equal(panelCard.shadowRoot.querySelector(".children").children.length, 1, "Panel updates must not accumulate nested stacks");
assert.equal(panelCard._config.cards.filter((card) => card.type === "custom:glass-text-card").length, 1, "Legacy header migration must not duplicate after a second config load");

const TextCard = marketplaceEntry.definitions.get("glass-text-card");
const textCard = new TextCard();
textCard.setConfig({ title: "Aktionen", subtitle: "Wohnzimmer", title_size: 1, button_size: 1, show_action_button: true, action_entity: "light.living_room", action_icon: "mdi:sofa-outline" });
textCard.hass = panelHass;
assert.match(textCard.shadowRoot.innerHTML, /Aktionen/);
assert.match(textCard.shadowRoot.innerHTML, /Wohnzimmer/);
assert.match(textCard.shadowRoot.innerHTML, /--header-action-size:clamp\(37\.33333333333333px,7\.333333333333333vw,58\.666666666666664px\)/);
assert.equal(textCard.shadowRoot.querySelector(".header-action").classList.active, true);
assert.equal(textCard.shadowRoot.querySelector(".action-state").textContent, "An");
textCard._callAction();
assert.equal(serviceCalls.at(-1)[0], "homeassistant");
assert.equal(serviceCalls.at(-1)[1], "toggle");
assert.equal(serviceCalls.at(-1)[2].entity_id, "light.living_room");
const textSchema = Object.fromEntries(TextCard.getConfigForm().schema.map((field) => [field.name, field]));
assert.equal(textSchema.title_size.selector.number.mode, "slider");
assert.equal(textSchema.button_size.selector.number.mode, "slider");
const largeTextCard = new TextCard();
largeTextCard.setConfig({ title: "Aktionen", subtitle: "Wohnzimmer", title_size: 5 });
assert.match(largeTextCard.shadowRoot.innerHTML, /--subtitle-font:clamp\(22px/);

const panelEditor = await panelCardClass.getConfigElement();
panelEditor.setConfig({ title: "Aktionen", subtitle: "Wohnzimmer", cards: [] });
const panelForm = panelEditor.shadowRoot.querySelector("ha-form");
assert.equal(panelForm.schema.map((field) => field.name).join(","), "panel_size");
assert.equal(panelForm.schema[0].selector.number.mode, "slider");
assert.equal(panelForm.computeLabel(panelForm.schema[0]), "Panel-Größe");
assert.equal(panelEditor._config.cards[0].type, "custom:glass-text-card");
assert.match(panelEditor.shadowRoot.innerHTML, /ha-form/);
assert.match(panelEditor.shadowRoot.innerHTML, /hui-stack-card-editor/);
assert.equal(panelEditor.shadowRoot.querySelector("hui-stack-card-editor").config.type, "vertical-stack");
assert.deepEqual(panelEditor.shadowRoot.querySelector("hui-stack-card-editor").config.cards, panelEditor._config.cards);
panelEditor._handleStackChanged({
  stopPropagation() {},
  detail: { config: { type: "vertical-stack", cards: [...panelEditor._config.cards, { type: "custom:glass-button-card", entity: "light.deckenlampe" }] } },
});
assert.equal(panelEditor._config.cards.length, 2);
assert.equal(panelEditor._config.cards[1].entity, "light.deckenlampe");
const emptyPanelEditor = await panelCardClass.getConfigElement();
emptyPanelEditor.setConfig({ cards: [] });
assert.equal(emptyPanelEditor.shadowRoot.querySelector("hui-stack-card-editor").config.type, "vertical-stack");
assert.equal(emptyPanelEditor.shadowRoot.querySelector("hui-stack-card-editor").config.cards.length, 0);

coverCard.setConfig({ entity: "cover.office", title: "", name: "" });
coverCard.hass = { states: { "cover.office": { state: "open", attributes: { friendly_name: "Office", current_position: 55 } } } };
assert.doesNotMatch(coverCard.shadowRoot.innerHTML, /<div class="eyebrow">|<h2>/);
assert.match(coverCard.shadowRoot.innerHTML, /class="menu-wrap"/);
coverCard.setConfig({ entity: "cover.office", title: "", name: "", show_action_button: false });
assert.match(coverCard.shadowRoot.innerHTML, /<header class="header" hidden>/);
assert.doesNotMatch(coverCard.shadowRoot.innerHTML, /class="menu-wrap"/);
assert.match(coverCard.shadowRoot.innerHTML, /class="controls"/);
coverCard.setConfig({ entity: "cover.office" });
assert.match(coverCard.shadowRoot.innerHTML, /<div class="eyebrow">Beschattung<\/div><h2>Office<\/h2>/);
assert.match(coverCard.shadowRoot.innerHTML, /\.glass::before \{[^}]*#323d38/);
coverCard.hass = { states: { "cover.office": { state: "open", attributes: { friendly_name: "Office", current_position: 100 } } } };
assert.match(coverCard.shadowRoot.innerHTML, /class="window" style="--position:100%;--tilt:50"/);
assert.match(coverCard.shadowRoot.innerHTML, /\.glass::before \{[^}]*#323d38/);
coverCard.setConfig({ entity: "cover.office", title: " ", name: "Office" });
assert.doesNotMatch(coverCard.shadowRoot.innerHTML, /<div class="eyebrow">/);
assert.match(coverCard.shadowRoot.innerHTML, /<h2>Office<\/h2>/);

buttonCard.setConfig({ entity: "light.living_room", name: "", show_name: true });
buttonCard.hass = { states: { "light.living_room": { state: "on", attributes: { friendly_name: "Living Room" } } } };
assert.doesNotMatch(buttonCard.shadowRoot.innerHTML, /<span class="name">/);
assert.equal(buttonCard.shadowRoot.querySelector(".button").getAttribute("aria-label"), "Living Room");
buttonCard.setConfig({ entity: "light.living_room", name: "   ", show_name: true });
assert.doesNotMatch(buttonCard.shadowRoot.innerHTML, /<span class="name">/);
buttonCard.setConfig({ entity: "light.living_room" });
assert.match(buttonCard.shadowRoot.innerHTML, /<span class="name">Living Room<\/span>/);

await panelCard.setConfig({ title: " ", subtitle: "", show_action_button: false, cards: [] });
assert.match(panelCard.shadowRoot.innerHTML, /class="empty">Keine Karten konfiguriert/);
assert.doesNotMatch(panelCard.shadowRoot.innerHTML, /<header|<h2|header-action/);
await panelCard.setConfig({ title: "", subtitle: "Room", cards: [] });
assert.equal(panelCard._config.cards[0].type, "custom:glass-text-card");
assert.equal(panelCard._config.cards[0].subtitle, "Room");
assert.doesNotMatch(panelCard.shadowRoot.innerHTML, /Room|<h2/);

rgbCard._config = { ...rgbCard._config, title: "", name: "" };
rgbCard._sync();
assert.equal(rgbNodes[".subtitle"].textContent, "");
assert.equal(rgbNodes[".subtitle"].hidden, true);
assert.equal(rgbNodes[".titles"].hidden, true);
rgbCard._config.show_action_button = false;
rgbCard._sync();
assert.equal(rgbNodes[".header-action"].hidden, true);
assert.equal(rgbNodes[".header"].hidden, true);
rgbCard._config.show_action_button = true;
rgbCard._sync();
assert.equal(rgbNodes[".header"].hidden, false);
delete rgbCard._config.name;
rgbCard._sync();
assert.equal(rgbNodes[".subtitle"].textContent, "");
assert.equal(rgbNodes[".subtitle"].hidden, true);

roomCard.setConfig({ name: "", entity: "sensor.temperature" });
assert.doesNotMatch(roomCard.shadowRoot.innerHTML, /<h2 class="name">/);
assert.match(roomCard.shadowRoot.innerHTML, /<div class="sensor-value">/);
roomCard.setConfig({});
assert.match(roomCard.shadowRoot.innerHTML, /<h2 class="name">Wohnzimmer<\/h2>/);

console.log("OK: Marketplace entry registers all cards; standard card picker, nested-card editing, actions, and panel rendering pass");