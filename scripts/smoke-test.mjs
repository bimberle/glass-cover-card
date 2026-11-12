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
        classList: { toggle() {} },
        addEventListener() {},
      };
      const cardButton = {
        attributes: {},
        classList: { toggle(name, value) { this[name] = value; } },
        addEventListener() {},
        setAttribute(name, value) { this.attributes[name] = value; },
        getAttribute(name) { return this.attributes[name]; },
      };
      const nameLabel = { textContent: "" };
      this.shadowRoot = {
        _innerHTML: "",
        get innerHTML() {
          return this._innerHTML;
        },
        set innerHTML(value) {
          this._innerHTML = value;
          host._innerHTMLWrites += 1;
        },
        querySelector: (selector) => selector === ".children" ? childContainer : (selector === ".header-action" ? headerButton : (selector === ".button" ? cardButton : (selector === ".name" ? nameLabel : null))),
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

  const context = {
    HTMLElement,
    CustomEvent,
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

const buttonForm = buttonModule.Card.getConfigForm();
const buttonSchema = Object.fromEntries(buttonForm.schema.map((field) => [field.name, field]));
assert.equal(buttonSchema.entity.selector.entity !== undefined, true);
assert.equal(buttonSchema.icon.selector.icon !== undefined, true);
assert.equal(buttonSchema.color.selector.select.options.map(([value]) => value).join(","), "orange,white,gray");
assert.equal(buttonSchema.button_size.selector.number.mode, "slider");
assert.equal(buttonSchema.show_card_frame.selector.boolean !== undefined, true);
assert.equal(buttonModule.Card.getConfigElement, undefined);

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
assert.deepEqual(marketplaceEntry.customCards.map((card) => card.type).sort(), ["glass-button-card", "glass-cover-card", "glass-panel-card"]);
await marketplaceEntry.runSource(await readFile("dist/glass-button-card.js", "utf8"), "dist/glass-button-card.js");
assert.equal(marketplaceEntry.customCards.length, 3, "Loading standalone cards must not register duplicate card entries");

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
  show_action_button: true,
  action_entity: "light.living_room",
  action_icon: "mdi:sofa-outline",
  cards: [{ type: "custom:glass-button-card", entity: "light.living_room" }, { type: "custom:glass-button-card", entity: "light.deckenlampe" }],
});
panelCard.hass = panelHass;
assert.match(panelCard.shadowRoot.innerHTML, /Aktionen/);
assert.match(panelCard.shadowRoot.innerHTML, /Wohnzimmer/);
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

const panelEditor = await panelCardClass.getConfigElement();
panelEditor.setConfig({ title: "Aktionen", subtitle: "Wohnzimmer", cards: [] });
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