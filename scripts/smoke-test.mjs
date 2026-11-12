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
      this.shadowRoot = {
        _innerHTML: "",
        get innerHTML() {
          return this._innerHTML;
        },
        set innerHTML(value) {
          this._innerHTML = value;
          host._innerHTMLWrites += 1;
        },
        querySelector: () => null,
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
    },
    window: { customCards, setTimeout, clearTimeout },
    document: { createElement: () => ({}) },
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
  name: "Wohnzimmer",
  icon: "mdi:sofa-outline",
  action: "toggle",
  button_size: 5,
  show_name: true,
  color: "orange",
});
buttonCard.hass = {
  states: { "light.living_room": { state: "on", attributes: {} } },
  callService: (...args) => serviceCalls.push(args),
};
assert.match(buttonCard.shadowRoot.innerHTML, /mdi:sofa-outline/);
assert.match(buttonCard.shadowRoot.innerHTML, /Wohnzimmer/);
assert.match(buttonCard.shadowRoot.innerHTML, /class="button active"/);
assert.match(buttonCard.shadowRoot.innerHTML, /--accent:#ff8b2b/);
assert.equal((buttonCard.shadowRoot.innerHTML.match(/class="button /g) || []).length, 1);
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
assert.deepEqual(marketplaceEntry.customCards.map((card) => card.type).sort(), ["glass-button-card", "glass-cover-card"]);
await marketplaceEntry.runSource(await readFile("dist/glass-button-card.js", "utf8"), "dist/glass-button-card.js");
assert.equal(marketplaceEntry.customCards.length, 2, "Loading both resources must not register duplicate card entries");

console.log("OK: primary Marketplace resource registers both cards; button render/actions/editor and duplicate loads pass");