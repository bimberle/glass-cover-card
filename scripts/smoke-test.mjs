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
assert.ok(marketplaceEntry.definitions.has("glass-navigation-card"));
const NavigationCard = marketplaceEntry.definitions.get("glass-navigation-card");
const navigationForm = NavigationCard.getConfigForm();
const navigationSchema = Object.fromEntries(navigationForm.schema.map((field) => [field.name, field]));
assert.equal(navigationSchema.items.selector.object.multiple, true);
assert.equal(navigationSchema.color.default, "orange");
assert.equal(navigationSchema.position.default, "bottom");
assert.equal(navigationSchema.scale.default, 100);
assert.equal(navigationSchema.scale.selector.number.min, 70);
assert.equal(navigationSchema.scale.selector.number.max, 140);
assert.equal(navigationSchema.scale.selector.number.step, 5);
assert.equal(navigationSchema.color.selector.select.options.map(({ value }) => value).join(","), "orange,white,gray,green,red");
assert.equal(navigationSchema.position.selector.select.options.map(({ value }) => value).join(","), "top,bottom,left,right");
assert.equal(navigationForm.computeLabel(navigationSchema.color), "Farbe für Icons und Texte");
const navigationCard = new NavigationCard();
navigationCard.setConfig({
  color: "green",
  position: "left",
  scale: 80,
  items: [
    { name: "Home", icon: "mdi:home", url: "/lovelace/home" },
    { name: "Räume", icon: "mdi:view-grid", menu_title: "Raum wählen", children: [
      { name: "UG", icon: "mdi:home-floor-b", children: [{ name: "Waschküche", icon: "mdi:washing-machine", url: "/lovelace/waschkueche" }] },
      { name: "EG", icon: "mdi:home-floor-0", children: [
        { name: "Küche", icon: "mdi:pot-steam", url: "/lovelace/kueche" },
        { name: "Wohnen", icon: "mdi:sofa", url: "/lovelace/wohnen" },
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
assert.match(navigationCard.shadowRoot.innerHTML, /class="shell position-left"/);
assert.match(navigationCard.shadowRoot.innerHTML, /--nav-scale:0\.8/);
navigationCard._menuRootIndex = 1;
assert.equal(navigationCard._menuTitle(), "Raum wählen");
navigationCard._render();
assert.match(navigationCard.shadowRoot.innerHTML, /class="menu-segments"/);
assert.match(navigationCard.shadowRoot.innerHTML, /class="nav-separator" role="separator" aria-orientation="horizontal"/);
assert.match(navigationCard.shadowRoot.innerHTML, /\.submenu \{[^}]*width:min\(720px/);
assert.match(navigationCard.shadowRoot.innerHTML, /\.menu-segments \{[^}]*width:min\(100%,620px\)/);
assert.match(navigationCard.shadowRoot.innerHTML, /\.submenu-items \{ display:grid; grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
assert.match(navigationCard.shadowRoot.innerHTML, /\.submenu-items \.nav-item \{ width:min\(100%,160px\)/);
assert.match(navigationCard.shadowRoot.innerHTML, /\.submenu-items \.nav-item \{[^}]*border:3px solid #3b3d42/);
assert.match(navigationCard.shadowRoot.innerHTML, /\.submenu-items \.nav-item ha-icon \{[^}]*width:72px; height:72px; --mdc-icon-size:72px;/);
assert.match(navigationCard.shadowRoot.innerHTML, /\.submenu-items \.nav-item span:not\(\.chevron\) \{[^}]*font-size:20px/);
assert.match(navigationCard.shadowRoot.innerHTML, /\.submenu-items \.nav-item span:not\(\.chevron\) \{[^}]*bottom:12%/);
assert.match(navigationCard.shadowRoot.innerHTML, /\.submenu-items \.nav-item ha-icon \{ position:absolute; top:50%; left:50%;/);
assert.match(navigationCard.shadowRoot.innerHTML, /\.submenu-items \.nav-item span:not\(\.chevron\) \{ position:absolute;/);
assert.match(navigationCard.shadowRoot.innerHTML, /\.position-bottom \.bar \.nav-item\.has-children \.chevron \{ top:-3px; right:50%; transform:translateX\(50%\)/);
assert.match(navigationCard.shadowRoot.innerHTML, /\.submenu-items \{ grid-template-columns:repeat\(3,minmax\(0,1fr\)\); gap:6px; \}/);
assert.match(navigationCard.shadowRoot.innerHTML, /\.submenu-items \.nav-item ha-icon \{ width:48px; height:48px; --mdc-icon-size:48px; \}/);
assert.match(navigationCard.shadowRoot.innerHTML, /\.submenu-items \.nav-item span:not\(\.chevron\) \{[^}]*font-size:14px/);
assert.match(navigationCard.shadowRoot.innerHTML, /\.submenu-items \.nav-item span:not\(\.chevron\) \{[^}]*bottom:8%/);
assert.match(navigationCard.shadowRoot.innerHTML, /UG/);
navigationCard._menuPath = [1];
navigationCard._render();
assert.equal(navigationCard._visibleItems().length, 5, "Five rooms must fit a fixed three-column grid over two rows");
const navigationScaleCard = new NavigationCard();
navigationScaleCard.setConfig({ scale: 200, items: [{ name: "Home", icon: "mdi:home", url: "/lovelace/home" }] });
assert.equal(navigationScaleCard._config.scale, 140);
navigationScaleCard.setConfig({ scale: 0, items: [{ name: "Home", icon: "mdi:home", url: "/lovelace/home" }] });
assert.equal(navigationScaleCard._config.scale, 70);
assert.match(navigationCard.shadowRoot.innerHTML, /Küche/);
assert.match(navigationCard.shadowRoot.innerHTML, /class="segment selected"/);
assert.throws(() => navigationCard.setConfig({ items: [{ name: "Bad URL", icon: "mdi:alert", url: "javascript:alert(1)" }] }), /HTTP\(S\)-URL/);
assert.throws(() => navigationCard.setConfig({ items: [{ name: "External", icon: "mdi:alert", url: "//example.com" }] }), /HTTP\(S\)-URL/);
assert.throws(() => navigationCard.setConfig({ items: [{ name: "Ambiguous", icon: "mdi:alert", url: "/home", children: [{ name: "Child", icon: "mdi:home", url: "/child" }] }] }), /nicht beides/);
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
assert.deepEqual(marketplaceEntry.customCards.map((card) => card.type).sort(), ["glass-button-card", "glass-cover-card", "glass-navigation-card", "glass-panel-card", "glass-rgb-card", "glass-room-card"]);
await marketplaceEntry.runSource(await readFile("dist/glass-button-card.js", "utf8"), "dist/glass-button-card.js");
assert.equal(marketplaceEntry.customCards.length, 6, "Loading standalone cards must not register duplicate card entries");
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
assert.equal(panelForm.computeLabel(panelForm.schema.find((field) => field.name === "title")), "Titel");
assert.equal(panelForm.computeLabel(panelForm.schema.find((field) => field.name === "subtitle")), "Beschriftung");
assert.match(panelEditor.shadowRoot.innerHTML, /ha-form/);
assert.match(panelEditor.shadowRoot.innerHTML, /hui-card-picker/);
assert.match(panelEditor.shadowRoot.innerHTML, /hui-card-element-editor/);
panelEditor._handleCardPicked({
  stopPropagation() {},
  detail: { config: { type: "custom:glass-button-card", entity: "light.deckenlampe" } },
});
assert.equal(panelEditor._config.cards.length, 1);
assert.equal(panelEditor._config.cards[0].entity, "light.deckenlampe");

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
assert.match(panelCard.shadowRoot.innerHTML, /<header class="header" hidden>/);
assert.doesNotMatch(panelCard.shadowRoot.innerHTML, /<div class="titles">|<h2 class="subtitle">/);
await panelCard.setConfig({ title: "", subtitle: "Room", cards: [] });
assert.doesNotMatch(panelCard.shadowRoot.innerHTML, /<div class="title">/);
assert.match(panelCard.shadowRoot.innerHTML, /<h2 class="subtitle">Room<\/h2>/);

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