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
      this.shadowRoot = {
        _innerHTML: "",
        get innerHTML() {
          return this._innerHTML;
        },
        set innerHTML(value) {
          this._innerHTML = value;
          host._innerHTMLWrites += 1;
        },
        querySelector: (selector) => selector === ".button ha-icon" ? cardIcon : (selector === ".action-state" ? actionStateLabel : (selector === ".state-value" ? stateLabel : (selector === ".dimmer" ? dimmer : (selector === ".brightness-value" ? brightnessLabel : (selector === "ha-form" ? form : (selector === ".children" ? childContainer : (selector === ".header-action" ? headerButton : (selector === ".button" ? cardButton : (selector === ".name" ? nameLabel : null))))))))),
        querySelectorAll: () => [],
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
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
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
                definitions.set("hui-card-picker", class {});
                definitions.set("hui-card-element-editor", class {});
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
for (const name of ["icon_active", "icon_inactive", "color_active", "color_inactive", "binary_sensor_active_state"]) assert.ok(fieldNames().includes(name));
for (const name of ["icon", "color", "action", "show_brightness_slider"]) assert.ok(!fieldNames().includes(name));
buttonEditor.setConfig({ entity: "light.living_room", color_active: "red" });
for (const name of ["icon", "color", "action", "show_brightness_slider"]) assert.ok(fieldNames().includes(name));
for (const name of ["icon_active", "icon_inactive", "color_active", "color_inactive", "binary_sensor_active_state"]) assert.ok(!fieldNames().includes(name));
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
assert.equal(coverSchema.button_size.selector.number.mode, "slider");
assert.equal(coverModule.Card.getConfigElement, undefined);

const marketplaceEntry = await loadCard("dist/glass-cover-card.js", "glass-cover-card", "glass-cover-card-editor");
assert.ok(marketplaceEntry.definitions.has("glass-button-card"));
assert.equal(typeof marketplaceEntry.Card.getConfigForm, "function");
assert.ok(marketplaceEntry.definitions.has("glass-panel-card"));
assert.ok(marketplaceEntry.definitions.has("glass-rgb-card"));
const rgbForm = marketplaceEntry.definitions.get("glass-rgb-card").getConfigForm();
assert.equal(rgbForm.schema.filter((field) => /^preset_[1-6]$/.test(field.name) && field.selector.color_rgb).length, 6);
const rgbValidationCard = new (marketplaceEntry.definitions.get("glass-rgb-card"))();
rgbValidationCard._render = () => {};
rgbValidationCard._sync = () => {};
assert.throws(() => rgbValidationCard.setConfig({ entity: "light.test", preset_1: [256, 0, 0] }), /Preset 1/);
assert.throws(() => rgbValidationCard.setConfig({ entity: "light.test", preset_2: [1, 2] }), /Preset 2/);
rgbValidationCard.setConfig({ entity: "light.test", preset_6: [0, 128, 255] });
assert.equal(rgbValidationCard._presets[0].slot, 6);
const rgbSource = await readFile("dist/glass-rgb-card.js", "utf8");
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
assert.match(rgbSource, /<span class="turn-on-label">RGB<\/span>/);
assert.deepEqual(marketplaceEntry.customCards.map((card) => card.type).sort(), ["glass-button-card", "glass-cover-card", "glass-panel-card", "glass-rgb-card"]);
await marketplaceEntry.runSource(await readFile("dist/glass-button-card.js", "utf8"), "dist/glass-button-card.js");
assert.equal(marketplaceEntry.customCards.length, 4, "Loading standalone cards must not register duplicate card entries");

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
  ".card": {}, ".header-action": { classList: { toggle() {} } }, ".action-state": {}, ".subtitle": {},
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
assert.equal(panelCard.shadowRoot.querySelector(".header-action").classList.active, true);
assert.equal(panelCard.shadowRoot.querySelector(".action-state").textContent, "An");
const panelRenderCount = panelCard._innerHTMLWrites;
panelCard.hass = { ...panelHass, states: { "light.living_room": { state: "off", attributes: {} } } };
assert.equal(panelCard.shadowRoot.querySelector(".header-action").classList.active, false);
assert.equal(panelCard.shadowRoot.querySelector(".header-action").classList.inactive, true);
assert.equal(panelCard.shadowRoot.querySelector(".action-state").textContent, "Aus");
assert.equal(panelCard._innerHTMLWrites, panelRenderCount);
panelCard.hass = { ...panelHass, states: { "light.living_room": { state: "unknown", attributes: {} } } };
assert.equal(panelCard.shadowRoot.querySelector(".header-action").classList.inactive, false);
assert.equal(panelCard.shadowRoot.querySelector(".action-state").textContent, "");
panelCard.hass = panelHass;
assert.match(panelCard.shadowRoot.innerHTML, /Aktionen/);
assert.match(panelCard.shadowRoot.innerHTML, /Wohnzimmer/);
assert.match(panelCard.shadowRoot.innerHTML, /--header-action-size:clamp\(37\.33333333333333px,7\.333333333333333vw,58\.666666666666664px\)/);
assert.match(panelCard.shadowRoot.innerHTML, /\.header-action ha-icon \{ display:block; width:var\(--header-icon-size\); height:var\(--header-icon-size\); --mdc-icon-size:var\(--header-icon-size\); \}/);
const smallSubtitleFont = Number(panelCard.shadowRoot.innerHTML.match(/--subtitle-font:clamp\(([\d.]+)px/)?.[1]);
assert.ok(smallSubtitleFont > 14 && smallSubtitleFont < 16);
assert.equal(panelCard.shadowRoot.querySelector(".children").children.length, 1);
assert.equal(panelCard.shadowRoot.querySelector(".children").children[0].config.type, "vertical-stack");
assert.equal(panelCard.shadowRoot.querySelector(".children").children[0].config.cards.length, 2);
assert.equal(panelCard.shadowRoot.querySelector(".children").children[0].hass, panelHass);
await panelCard.setConfig({
  title: "Aktionen",
  subtitle: "Wohnzimmer",
  show_action_button: true,
  action_entity: "light.wohnzimmer",
  cards: [{ type: "custom:glass-button-card", entity: "light.living_room" }, { type: "custom:glass-button-card", entity: "light.deckenlampe" }],
});
assert.equal(panelCard.shadowRoot.querySelector(".children").children.length, 1, "Panel updates must not accumulate nested stacks");
panelCard._callHeaderAction();
assert.equal(serviceCalls.at(-1)[0], "homeassistant");
assert.equal(serviceCalls.at(-1)[1], "toggle");
assert.equal(serviceCalls.at(-1)[2].entity_id, "light.wohnzimmer");
await panelCard.setConfig({ title: "Aktionen", subtitle: "Wohnzimmer", title_size: 5, cards: [] });
assert.match(panelCard.shadowRoot.innerHTML, /--header-action-size:clamp\(56px,11vw,88px\)/);
const largeSubtitleFont = Number(panelCard.shadowRoot.innerHTML.match(/--subtitle-font:clamp\(([\d.]+)px/)?.[1]);
assert.equal(largeSubtitleFont, 22);
for (const level of [1, 2, 3, 4, 5]) {
  coverCard.setConfig({ entity: "cover.office", button_size: level });
  await panelCard.setConfig({ title: "Aktionen", button_size: level, cards: [] });
  const coverSize = coverCard.shadowRoot.innerHTML.match(/--menu-size:(clamp\([^)]*\))/)?.[1];
  const panelSize = panelCard.shadowRoot.innerHTML.match(/--header-action-size:(clamp\([^)]*\))/)?.[1];
  assert.equal(panelSize, coverSize, `Panel and cover buttons must match at size ${level}`);
}

const panelEditor = await panelCardClass.getConfigElement();
panelEditor.setConfig({ title: "Aktionen", subtitle: "Wohnzimmer", cards: [] });
const panelForm = panelEditor.shadowRoot.querySelector("ha-form");
const panelButtonSize = panelForm.schema.find((field) => field.name === "button_size");
assert.equal(panelButtonSize.selector.number.mode, "slider");
assert.equal(panelForm.computeLabel(panelButtonSize), "Button-Größe");
assert.match(panelEditor.shadowRoot.innerHTML, /ha-form/);
assert.match(panelEditor.shadowRoot.innerHTML, /hui-card-picker/);
assert.match(panelEditor.shadowRoot.innerHTML, /hui-card-element-editor/);
panelEditor._handleCardPicked({
  stopPropagation() {},
  detail: { config: { type: "custom:glass-button-card", entity: "light.deckenlampe" } },
});
assert.equal(panelEditor._config.cards.length, 1);
assert.equal(panelEditor._config.cards[0].entity, "light.deckenlampe");

console.log("OK: Marketplace entry registers all cards; standard card picker, nested-card editing, actions, and panel rendering pass");