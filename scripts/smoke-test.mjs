import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

async function loadCard(filePath, className, editorName) {
  const definitions = new Map();
  const customCards = [];
  const dispatchedEvents = [];

  class HTMLElement {
    attachShadow() {
      this.shadowRoot = {
        innerHTML: "",
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
    Card: vm.runInContext(className, context),
    Editor: vm.runInContext(editorName, context),
    customCards,
    dispatchedEvents,
  };
}

const buttonModule = await loadCard("dist/glass-button-card.js", "GlassButtonCard", "GlassButtonCardEditor");
const buttonCard = new buttonModule.Card();
const serviceCalls = [];
buttonCard.setConfig({
  button_size: 5,
  columns: 4,
  show_name: true,
  buttons: [
    { entity: "light.living_room", name: "Wohnzimmer", icon: "mdi:sofa-outline", action: "toggle" },
    { entity: "media_player.tv", name: "Fernsehen", icon: "mdi:television", action: "more-info" },
  ],
});
buttonCard.hass = {
  states: {
    "light.living_room": { state: "on", attributes: {} },
    "media_player.tv": { state: "off", attributes: {} },
  },
  callService: (...args) => serviceCalls.push(args),
};
assert.match(buttonCard.shadowRoot.innerHTML, /mdi:sofa-outline/);
assert.match(buttonCard.shadowRoot.innerHTML, /Wohnzimmer/);
assert.match(buttonCard.shadowRoot.innerHTML, /class="button active"/);
buttonCard._callButton(buttonCard._config.buttons[0]);
assert.equal(serviceCalls[0][0], "homeassistant");
assert.equal(serviceCalls[0][1], "toggle");
assert.equal(serviceCalls[0][2].entity_id, "light.living_room");
buttonCard._callButton(buttonCard._config.buttons[1]);
assert.equal(buttonModule.dispatchedEvents[0].type, "hass-more-info");
assert.equal(buttonModule.dispatchedEvents[0].detail.entityId, "media_player.tv");
assert.equal(buttonModule.customCards[0].type, "glass-button-card");
buttonCard.setConfig({
  button_size: 1,
  columns: 1,
  show_name: false,
  buttons: [{ entity: "light.living_room", icon: "mdi:sofa-outline" }],
});
assert.match(buttonCard.shadowRoot.innerHTML, /--columns:1;--mobile-columns:1/);
assert.match(buttonCard.shadowRoot.innerHTML, /--button-size:clamp\(24px,5vw,38px\)/);
assert.doesNotMatch(buttonCard.shadowRoot.innerHTML, /class="name"/);

const editor = new buttonModule.Editor();
editor.setConfig({ buttons: [{ entity: "light.living_room", name: "Wohnzimmer", icon: "mdi:sofa-outline" }] });
editor.hass = { states: { "light.living_room": { state: "on", attributes: {} } } };
assert.match(editor.innerHTML, /Button-Groesse/);
assert.match(editor.innerHTML, /Buttons pro Reihe/);
assert.match(editor.innerHTML, /Icon/);
assert.match(editor.innerHTML, /Button hinzufuegen/);

const coverModule = await loadCard("dist/glass-cover-card.js", "GlassCoverCard", "GlassCoverCardEditor");
const coverCard = new coverModule.Card();
coverCard.setConfig({ entity: "cover.office", show_preview: false });
coverCard.hass = {
  states: { "cover.office": { state: "open", attributes: { current_position: 45 } } },
  callService: (...args) => serviceCalls.push(args),
};
assert.match(coverCard.shadowRoot.innerHTML, /range-row/);
assert.match(coverCard.shadowRoot.innerHTML, /class="controls"/);
assert.equal(coverModule.customCards[0].type, "glass-cover-card");

console.log("OK: both cards load; button render, toggle/more-info, editor options, and cover card remain available");