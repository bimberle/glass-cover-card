const NAV_CARD_VERSION = "1.0.5";
const NAV_COLORS = {
  orange: "#ff8b2b",
  white: "#f2f2f4",
  gray: "#a0a2a6",
  green: "#4bc785",
  red: "#f05c5c",
};
const NAV_COLOR_OPTIONS = Object.entries(NAV_COLORS).map(([value]) => ({
  value,
  label: value[0].toUpperCase() + value.slice(1),
}));
const NAV_POSITION_OPTIONS = [
  { value: "top", label: "Oben (horizontal)" },
  { value: "bottom", label: "Unten (horizontal)" },
  { value: "left", label: "Links (vertikal)" },
  { value: "right", label: "Rechts (vertikal)" },
];
const escapeNav = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})[character]);

class GlassNavigationCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._menuRootIndex = null;
    this._menuPath = [];
    this._handleDocumentPointer = (event) => {
      if (this._menuRootIndex === null || event.composedPath?.().includes(this)) return;
      this._closeMenu();
    };
    this._handleDocumentKey = (event) => {
      if (event.key === "Escape" && this._menuRootIndex !== null) {
        this._closeMenu();
      }
    };
  }

  connectedCallback() {
    document.addEventListener("pointerdown", this._handleDocumentPointer, true);
    document.addEventListener("keydown", this._handleDocumentKey);
  }

  disconnectedCallback() {
    document.removeEventListener("pointerdown", this._handleDocumentPointer, true);
    document.removeEventListener("keydown", this._handleDocumentKey);
  }

  _closeMenu() {
    this._menuRootIndex = null;
    this._menuPath = [];
    this._render();
  }

  static getStubConfig() {
    return {
      position: "bottom",
      scale: 100,
      color: "orange",
      items: [
        { name: "Home", icon: "mdi:home-outline", url: "/lovelace/home" },
        {
          name: "Räume",
          icon: "mdi:view-grid",
          menu_title: "Raum wählen",
          children: [
            {
              name: "EG",
              icon: "mdi:home-floor-0",
              default: true,
              children: [
                { name: "Küche", icon: "mdi:pot-steam", url: "/lovelace/kueche" },
                { name: "Wohnen", icon: "mdi:sofa-outline", url: "/lovelace/wohnen" },
              ],
            },
          ],
        },
        { name: "Mehr", icon: "mdi:dots-horizontal", url: "/lovelace/mehr" },
      ],
    };
  }

  static getConfigForm() {
    const schema = [
      { name: "items", required: true, selector: { object: { multiple: true } } },
      { name: "color", default: "orange", selector: { select: { mode: "dropdown", options: NAV_COLOR_OPTIONS } } },
      { name: "position", default: "bottom", selector: { select: { mode: "dropdown", options: NAV_POSITION_OPTIONS } } },
      { name: "scale", default: 100, selector: { number: { min: 70, max: 140, step: 5, mode: "slider", unit_of_measurement: "%" } } },
      { name: "active", selector: { text: {} } },
    ];
    return {
      schema,
      computeLabel: (field) => ({
        items: "Menüpunkte (verschachtelte Liste)",
        color: "Farbe für Icons und Texte",
        position: "Position der Navigationsleiste",
        scale: "Gesamte Navigation skalieren",
        active: "Aktiver Hauptpunkt (Name)",
      })[field.name],
    };
  }

  static getConfigElement() {
    return document.createElement("glass-navigation-card-editor");
  }

  setConfig(config) {
    const nextConfig = {
      color: "orange",
      position: "bottom",
      scale: 100,
      active: "",
      items: [],
      ...config,
    };
    if (!Array.isArray(nextConfig.items) || nextConfig.items.length === 0) {
      throw new Error("Bitte mindestens einen Navigationspunkt in 'items' konfigurieren.");
    }
    if (!NAV_COLORS[nextConfig.color]) throw new Error("Nicht unterstützte Navigationsfarbe.");
    if (!NAV_POSITION_OPTIONS.some(({ value }) => value === nextConfig.position)) throw new Error("Ungültige Position der Navigationsleiste.");
    const requestedScale = Number(nextConfig.scale);
    nextConfig.scale = Number.isFinite(requestedScale) ? Math.min(140, Math.max(70, requestedScale)) : 100;
    this._validateItems(nextConfig.items);
    this._config = nextConfig;
    this._menuRootIndex = null;
    this._menuPath = [];
    this._render();
  }

  getCardSize() { return 1; }

  _validateItems(items, depth = 0) {
    if (depth > 8) throw new Error("Navigationsmenüs dürfen höchstens acht Ebenen tief sein.");
    let defaultCount = 0;
    for (const item of items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Jeder Navigationspunkt muss ein Objekt sein.");
      if (item.type === "separator") {
        if (depth !== 0) throw new Error("Trenner sind nur in der Hauptnavigation erlaubt.");
        continue;
      }
      if (item.default === true) defaultCount += 1;
      if (typeof item.name !== "string" || !item.name.trim()) throw new Error("Jeder Navigationspunkt benötigt einen Namen.");
      if (item.label != null && typeof item.label !== "string") throw new Error(`'label' für '${item.name}' muss Text sein.`);
      if (typeof item.icon !== "string" || !item.icon.trim()) throw new Error(`Bitte ein Icon für '${item.name}' angeben.`);
      if (item.menu_title != null && typeof item.menu_title !== "string") throw new Error(`'menu_title' für '${item.name}' muss Text sein.`);
      const hasChildren = Array.isArray(item.children) && item.children.length > 0;
      if (hasChildren && item.url) throw new Error(`'${item.name}' darf entweder eine URL oder Unterpunkte haben, nicht beides.`);
      if (hasChildren) {
        this._validateItems(item.children, depth + 1);
        continue;
      }
      if (typeof item.url !== "string" || !item.url.trim() || !/^(?:\/(?!\/)|https?:\/\/)/i.test(item.url.trim())) {
        throw new Error(`'${item.name}' benötigt eine interne URL oder eine HTTP(S)-URL.`);
      }
    }
    if (defaultCount > 1) throw new Error("Pro Menüebene darf nur ein Punkt als Standard ausgewählt sein.");
  }

  _visibleItems() {
    return this._menuModel().items;
  }

  _menuModel() {
    let items = this._config.items[this._menuRootIndex]?.children || [];
    let level = 0;
    const segments = [];
    const isGroup = (item) => Array.isArray(item?.children) && item.children.length > 0;
    while (items.length) {
      if (items.every(isGroup)) {
        const defaultIndex = Math.max(0, items.findIndex((item) => item.default === true));
        const selectedIndex = Math.min(this._menuPath[level] ?? defaultIndex, items.length - 1);
        segments.push({ items, selectedIndex, level });
        items = items[selectedIndex].children;
        level += 1;
      } else if (level < this._menuPath.length && isGroup(items[this._menuPath[level]])) {
        items = items[this._menuPath[level]].children;
        level += 1;
      } else break;
    }
    return { items, segments, level };
  }

  _menuTitle() {
    const item = this._config.items[this._menuRootIndex];
    return item?.menu_title?.trim() || `${item?.name || "Menü"} wählen`;
  }

  _itemLabel(item) {
    return item.label == null ? item.name : item.label.trim();
  }

  _maxMenuRows(items) {
    if (!items?.length) return 1;
    const leafCount = items.filter((item) => !Array.isArray(item.children) || item.children.length === 0).length;
    const childRows = items
      .filter((item) => Array.isArray(item.children) && item.children.length > 0)
      .map((item) => this._maxMenuRows(item.children));
    return Math.max(1, Math.ceil(leafCount / 3), ...childRows);
  }

  _itemMarkup(item, index, root = false) {
    if (item.type === "separator" && root) {
      const orientation = this._config.position === "left" || this._config.position === "right" ? "horizontal" : "vertical";
      return `<span class="nav-separator" role="separator" aria-orientation="${orientation}"></span>`;
    }
    const hasChildren = Array.isArray(item.children) && item.children.length > 0;
    const url = item.url ? item.url.trim() : "";
    const siblings = root ? this._config.items : this._visibleItems();
    const hasLocationMatch = siblings.some((candidate) => candidate.url?.startsWith("/") && window.location?.pathname === candidate.url.split(/[?#]/)[0]);
    const defaultIndex = siblings.findIndex((candidate) => candidate.default === true);
    const active = (root && (this._menuRootIndex === index || this._config.active === item.name))
      || (url.startsWith("/") && window.location?.pathname === url.split(/[?#]/)[0])
      || (!hasLocationMatch && defaultIndex === index);
    const dataAttribute = root ? `data-root-index="${index}"` : `data-child-index="${index}"`;
    const label = this._itemLabel(item);
    return `<button type="button" class="nav-item ${active ? "active" : ""} ${hasChildren ? "has-children" : ""}" ${dataAttribute} ${hasChildren ? `aria-haspopup="menu" aria-expanded="${root ? this._menuRootIndex === index : false}"` : `aria-current="${active ? "page" : "false"}"`} ${!hasChildren ? `data-url="${escapeNav(url)}"` : ""} aria-label="${escapeNav(item.name)}" title="${escapeNav(item.name)}"><ha-icon icon="${escapeNav(item.icon)}"></ha-icon>${label ? `<span>${escapeNav(label)}</span>` : ""}${hasChildren ? `<span class="chevron" aria-hidden="true">${root ? "⌃" : "›"}</span>` : ""}</button>`;
  }

  _navigate(url) {
    if (/^https?:\/\//i.test(url)) {
      window.location.assign(url);
      return;
    }
    window.history.pushState(null, "", url);
    window.dispatchEvent(new Event("location-changed"));
    this._menuRootIndex = null;
    this._menuPath = [];
    this._render();
  }

  _bindEvents() {
    this.shadowRoot.querySelectorAll("[data-root-index]").forEach((button) => button.addEventListener("click", () => {
      const index = Number(button.dataset.rootIndex);
      const item = this._config.items[index];
      if (item.children?.length) {
        this._menuRootIndex = this._menuRootIndex === index ? null : index;
        this._menuPath = [];
        this._render();
      } else this._navigate(item.url.trim());
    }));
    this.shadowRoot.querySelectorAll("[data-child-index]").forEach((button) => button.addEventListener("click", () => {
      const index = Number(button.dataset.childIndex);
      const item = this._visibleItems()[index];
      if (item.children?.length) {
        const model = this._menuModel();
        this._menuPath = [...this._menuPath.slice(0, model.level), index];
        this._render();
      } else this._navigate(item.url.trim());
    }));
    this.shadowRoot.querySelectorAll("[data-segment-level]").forEach((button) => button.addEventListener("click", () => {
      const level = Number(button.dataset.segmentLevel);
      this._menuPath = [...this._menuPath.slice(0, level), Number(button.dataset.segmentIndex)];
      this._render();
    }));
    this.shadowRoot.querySelector("[data-menu-back]")?.addEventListener("click", () => {
      if (this._menuPath.length) this._menuPath.pop();
      else this._menuRootIndex = null;
      this._render();
    });
  }

  _render() {
    if (!this._config) return;
    const color = NAV_COLORS[this._config.color];
    const position = this._config.position;
    const scale = this._config.scale / 100;
    const vertical = position === "left" || position === "right";
    const rootItems = this._config.items.map((item, index) => this._itemMarkup(item, index, true)).join("");
    const menuModel = this._menuRootIndex === null ? { items: [], segments: [] } : this._menuModel();
    const menuItems = menuModel.items.map((item, index) => this._itemMarkup(item, index)).join("");
    const menuSegments = menuModel.segments.map(({ items, selectedIndex, level }) => `<div class="menu-segments" role="tablist" aria-label="Ebene ${level + 1}">${items.map((item, index) => `<button type="button" class="segment ${index === selectedIndex ? "selected" : ""}" role="tab" aria-selected="${index === selectedIndex}" data-segment-level="${level}" data-segment-index="${index}">${escapeNav(this._itemLabel(item))}</button>`).join("")}</div>`).join("");
    const menuRows = this._menuRootIndex === null ? 1 : this._maxMenuRows(this._config.items[this._menuRootIndex]?.children);
    const menu = this._menuRootIndex === null ? "" : `<section class="submenu" role="menu" aria-label="${escapeNav(this._menuTitle())}" style="--submenu-rows:${menuRows}"><header class="submenu-header"><h2>${escapeNav(this._menuTitle())}</h2></header>${menuSegments}<div class="submenu-items ${vertical ? "vertical" : ""}">${menuItems}</div></section><span class="pointer" aria-hidden="true"></span>`;

    this.shadowRoot.innerHTML = `
      <style>
        :host { --nav-color:${color}; display:block; font-family:var(--paper-font-body1_-_font-family,"Arial",sans-serif); }
        * { box-sizing:border-box; }
        button { color:inherit; font:inherit; }
        .shell { position:fixed; z-index:20; color:var(--nav-color); }
        .shell.position-top,.shell.position-bottom { left:50%; width:min(calc(100vw - 48px),748px); transform:translateX(-50%) scale(var(--nav-scale)); }
        .shell.position-top { top:max(12px,env(safe-area-inset-top)); transform-origin:50% 0; }
        .shell.position-bottom { bottom:calc(env(safe-area-inset-bottom) + 6px); transform-origin:50% 100%; }
        .shell.position-left,.shell.position-right { top:50%; width:max-content; max-width:calc(100vw - 24px); transform:translateY(-50%) scale(var(--nav-scale)); }
        .shell.position-left { left:max(12px,env(safe-area-inset-left)); transform-origin:0 50%; }
        .shell.position-right { right:max(12px,env(safe-area-inset-right)); transform-origin:100% 50%; }
        .bar { position:relative; display:flex; align-items:stretch; justify-content:space-around; gap:4px; width:100%; min-height:92px; padding:7px; border:1px solid rgba(255,255,255,.1); border-radius:50px; background:rgba(25,26,29,.94); box-shadow:0 12px 32px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.06); backdrop-filter:blur(20px); }
        .position-left .bar,.position-right .bar { flex-direction:column; width:82px; max-height:min(76dvh,680px); overflow:auto; }
        .nav-separator { flex:none; align-self:center; width:1px; height:42px; margin:0 8px; background:rgba(255,255,255,.18); }
        .position-left .nav-separator,.position-right .nav-separator { width:42px; height:1px; margin:8px 0; }
        .nav-item { position:relative; display:flex; flex:1 1 0; min-width:0; min-height:84px; flex-direction:column; align-items:center; justify-content:center; gap:4px; padding:5px 8px; border:0; border-radius:40px; background:transparent; color:#c3c4c8; opacity:.9; cursor:pointer; -webkit-tap-highlight-color:transparent; }
        .nav-item ha-icon { display:block; width:38px; height:38px; --mdc-icon-size:38px; }
        .nav-item span:not(.chevron) { max-width:100%; overflow:hidden; font-size:18px; line-height:1.15; text-align:center; text-overflow:ellipsis; white-space:nowrap; }
        .nav-item.active { background:color-mix(in srgb,var(--nav-color) 20%,transparent); color:var(--nav-color); opacity:1; }
        .bar .nav-item.active { background:transparent; box-shadow:none; }
        .position-bottom .bar .nav-item.has-children .chevron { top:-3px; right:50%; transform:translateX(50%); color:var(--nav-color); font-size:20px; }
        .nav-item:focus-visible,.menu-back:focus-visible { outline:2px solid var(--nav-color); outline-offset:2px; }
        .chevron { position:absolute; top:2px; right:12px; font-size:16px; }
        .position-left .nav-item,.position-right .nav-item { flex:none; width:100%; min-height:68px; }
        .submenu { position:absolute; width:min(720px,calc(100vw - 32px)); max-height:min(72dvh,640px); overflow:auto; padding:32px 28px 30px; border:1px solid rgba(255,255,255,.13); border-radius:28px; background:rgba(26,27,30,.97); color:var(--nav-color); box-shadow:0 16px 42px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.06); backdrop-filter:blur(24px); }
        .pointer { position:absolute; z-index:1; width:0; height:0; border:12px solid transparent; pointer-events:none; }
        .position-bottom .submenu { bottom:calc(100% + 34px); left:50%; transform:translateX(-50%); }
        .position-bottom .pointer { top:-34px; left:50%; transform:translateX(-50%); border-top-color:rgba(90,92,96,.9); }
        .position-top .submenu { top:calc(100% + 12px); left:50%; transform:translateX(-50%); }
        .position-top .pointer { top:100%; left:50%; transform:translateX(-50%); border-bottom-color:rgba(90,92,96,.9); }
        .position-left .submenu { top:50%; left:calc(100% + 12px); transform:translateY(-50%); }
        .position-left .pointer { top:50%; left:100%; transform:translateY(-50%); border-right-color:rgba(90,92,96,.9); }
        .position-right .submenu { top:50%; right:calc(100% + 12px); transform:translateY(-50%); }
        .position-right .pointer { top:50%; right:100%; transform:translateY(-50%); border-left-color:rgba(90,92,96,.9); }
        .position-left .submenu,.position-right .submenu { width:min(440px,calc(100vw - 106px)); }
        .submenu-header { display:flex; align-items:center; margin-bottom:14px; }
        .submenu-header h2 { flex:1; min-width:0; margin:0; color:#f2f2f4; font-size:34px; line-height:1.2; overflow-wrap:anywhere; }
        .menu-segments { display:flex; width:min(100%,620px); min-height:64px; gap:4px; margin:0 auto 42px; padding:3px; border:1px solid rgba(255,255,255,.05); border-radius:40px; background:rgba(112,114,119,.19); }
        .segment { flex:1 1 0; min-width:0; min-height:56px; padding:8px 12px; border:0; border-radius:32px; background:transparent; color:#c3c4c8; opacity:1; font-size:20px; font-weight:600; cursor:pointer; }
        .segment.selected { background:var(--nav-color); color:#fff; opacity:1; box-shadow:0 6px 20px color-mix(in srgb,var(--nav-color) 28%,transparent); }
        .submenu-items { --menu-row-size:clamp(72px,calc((min(720px,100vw - 32px) - 82px) / 3),144px); display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); grid-template-rows:repeat(var(--submenu-rows,1),var(--menu-row-size)); justify-items:center; gap:12px; }
        .submenu-items .nav-item { width:min(100%,144px); height:var(--menu-row-size); min-height:0; border:3px solid #3b3d42; border-radius:50%; color:#f0f0f2; opacity:.92; }
        .submenu-items .nav-item ha-icon { position:absolute; top:50%; left:50%; width:64px; height:64px; --mdc-icon-size:64px; transform:translate(-50%,-50%); }
        .submenu-items .nav-item span:not(.chevron) { position:absolute; right:8px; bottom:12%; left:8px; font-size:18px; white-space:normal; }
        .submenu-items .nav-item.active { border-color:var(--nav-color); background:color-mix(in srgb,var(--nav-color) 9%,transparent); color:var(--nav-color); box-shadow:0 0 34px color-mix(in srgb,var(--nav-color) 32%,transparent); opacity:1; }
        .submenu-items .nav-item.active span:not(.chevron) { color:#f2f2f4; }
        .submenu-items .nav-item.has-children .chevron { top:12px; right:18px; font-size:22px; }
        @media(max-width:520px) { .shell.position-bottom { bottom:calc(env(safe-area-inset-bottom) + 6px); } .position-bottom .submenu { bottom:calc(100% + 24px); } .position-bottom .pointer { top:-24px; } .bar { min-height:56px; border-radius:32px; } .bar .nav-item { min-height:46px; padding-inline:4px; } .bar .nav-item ha-icon { width:26px; height:26px; --mdc-icon-size:26px; } .bar .nav-item span:not(.chevron) { font-size:12px; } .position-left .nav-separator,.position-right .nav-separator { width:32px; } .submenu { padding:18px 14px 20px; } .submenu-header h2 { font-size:26px; } .menu-segments { width:100%; min-height:56px; margin-bottom:20px; } .segment { min-height:48px; font-size:16px; } .position-left .submenu,.position-right .submenu { width:min(440px,calc(100vw - 108px)); } .submenu-items { --menu-row-size:clamp(72px,calc((min(720px,100vw - 32px) - 42px) / 3),126px); grid-template-rows:repeat(var(--submenu-rows,1),var(--menu-row-size)); gap:6px; } .submenu-items .nav-item { width:100%; height:var(--menu-row-size); min-width:0; min-height:0; } .submenu-items .nav-item ha-icon { width:42px; height:42px; --mdc-icon-size:42px; } .submenu-items .nav-item span:not(.chevron) { right:2px; bottom:8%; left:2px; font-size:13px; } }
        @media(prefers-reduced-motion:reduce) { *,*::before,*::after { scroll-behavior:auto !important; } }
      </style>
      <div class="shell position-${position}" style="--nav-color:${color};--nav-scale:${scale}">
        ${menu}
        <nav class="bar" aria-label="Hauptnavigation">${rootItems}</nav>
      </div>`;
    this._bindEvents();
  }
}

class GlassNavigationCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._editing = false;
    this._hass = null;
    this._onClick = (event) => this._handleClick(event);
    this._onInput = (event) => this._handleInput(event);
    this._onChange = (event) => this._handleInput(event);
    this.shadowRoot.addEventListener("click", this._onClick);
    this.shadowRoot.addEventListener("input", this._onInput);
    this.shadowRoot.addEventListener("change", this._onChange);
    this._render();
  }

  _emitConfig() {
    this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config: this._config } }));
  }

  _itemList(items, path = [], root = false) {
    const rows = items.map((item, index) => {
      const itemPath = [...path, index];
      const pathValue = itemPath.join(".");
      if (item.type === "separator") {
        return `<div class="tree-separator"><span>Trenner</span><button type="button" class="remove" data-action="remove" data-path="${pathValue}" aria-label="Trenner entfernen">Entfernen</button></div>`;
      }
      const group = Array.isArray(item.children) && item.children.length > 0;
      return `<section class="tree-item ${group ? "is-group" : ""}">
        <div class="item-heading"><span class="item-kind">${group ? "Gruppe" : "Link"}</span><button type="button" class="remove" data-action="remove" data-path="${pathValue}" aria-label="${escapeNav(item.name)} entfernen">Entfernen</button></div>
        <div class="fields">
          <label>Name<input type="text" data-path="${pathValue}" data-field="name" value="${escapeNav(item.name)}"></label>
          <label>Icon<input type="text" data-path="${pathValue}" data-field="icon" value="${escapeNav(item.icon)}" placeholder="mdi:home-outline"></label>
          <label>Beschriftung<input type="text" data-path="${pathValue}" data-field="label" value="${escapeNav(item.label ?? item.name)}" placeholder="Name verwenden; leer blendet aus"></label>
          ${group ? `<label>Menütitel<input type="text" data-path="${pathValue}" data-field="menu_title" value="${escapeNav(item.menu_title ?? "")}" placeholder="${escapeNav(item.name)} wählen"></label>` : `<label>URL<input type="text" data-path="${pathValue}" data-field="url" value="${escapeNav(item.url ?? "")}" placeholder="/lovelace/seite"></label>`}
          <label class="default-option"><input type="checkbox" data-path="${pathValue}" data-field="default" ${item.default ? "checked" : ""}> Standardauswahl</label>
        </div>
        ${group ? `<div class="children"><h4>Unterpunkte</h4>${this._itemList(item.children, itemPath)}${this._addButtons(itemPath, false)}</div>` : ""}
      </section>`;
    }).join("");
    return `${rows}${root ? this._addButtons(path, true) : ""}`;
  }

  _addButtons(path, root) {
    const parentPath = path.join(".");
    return `<div class="add-actions"><button type="button" data-action="add-link" data-parent="${parentPath}">+ Link</button><button type="button" data-action="add-group" data-parent="${parentPath}">+ Gruppe</button>${root ? `<button type="button" data-action="add-separator" data-parent="${parentPath}">+ Trenner</button>` : ""}</div>`;
  }

  _previewMarkup() {
    return (this._config.items || []).map((item, index) => {
      if (item.type === "separator") return `<span class="preview-separator" role="separator"></span>`;
      const label = item.label == null ? item.name : item.label.trim();
      const active = this._config.active === item.name;
      return `<div class="preview-item ${active ? "active" : ""}"><ha-icon icon="${escapeNav(item.icon || "mdi:gesture-tap-button")}"></ha-icon>${label ? `<span>${escapeNav(label)}</span>` : ""}${item.children?.length ? `<i>${index === this._config.items.findIndex((entry) => entry.name === this._config.active) ? "⌃" : ""}</i>` : ""}</div>`;
    }).join("");
  }

  _render() {
    const definition = GlassNavigationCard.getConfigForm();
    const formSchema = definition.schema.filter((field) => field.name !== "items");
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; color:var(--primary-text-color); font-family:var(--paper-font-body1_-_font-family,Arial,sans-serif); }
        * { box-sizing:border-box; }
        .editor { display:grid; gap:16px; }
        .preview { position:relative; min-height:110px; display:flex; align-items:flex-end; padding:16px; border:1px solid var(--divider-color,#444); border-radius:12px; background:var(--card-background-color,#17191c); overflow:hidden; }
        .preview-content { position:absolute; inset:0; display:grid; place-items:center; color:var(--secondary-text-color,#999); font-size:14px; }
        .preview-bar { position:relative; z-index:1; display:flex; align-items:center; justify-content:space-around; gap:6px; width:100%; min-height:64px; padding:5px 12px; border:1px solid var(--divider-color,#444); border-radius:40px; background:rgba(20,21,23,.96); color:var(--primary-text-color,#eee); }
        .preview-item { position:relative; flex:1 1 0; min-width:0; display:flex; flex-direction:column; align-items:center; gap:3px; font-size:12px; }
        .preview-item ha-icon { --mdc-icon-size:24px; width:24px; height:24px; }
        .preview-item.active { color:var(--nav-color,#ff8b2b); }
        .preview-separator { flex:none; height:30px; border-left:1px solid var(--divider-color,#666); }
        .editor-toggle,.add-actions button,.remove { min-height:36px; padding:6px 12px; border:1px solid var(--divider-color,#666); border-radius:8px; background:var(--secondary-background-color,#242629); color:var(--primary-text-color,#eee); cursor:pointer; }
        .editor-toggle { position:absolute; z-index:2; top:8px; right:8px; display:grid; width:38px; height:38px; min-height:0; place-items:center; padding:7px; opacity:0; pointer-events:none; transition:opacity .15s ease; }
        .preview:hover .editor-toggle,.preview:focus-within .editor-toggle { opacity:1; pointer-events:auto; }
        .editor-toggle ha-icon { display:block; width:20px; height:20px; --mdc-icon-size:20px; }
        .tree { display:grid; gap:12px; }
        .tree-item { display:grid; gap:10px; padding:12px; border:1px solid var(--divider-color,#555); border-radius:8px; background:var(--card-background-color,#17191c); }
        .item-heading { display:flex; align-items:center; justify-content:space-between; color:var(--primary-text-color,#eee); font-weight:600; }
        .item-kind { color:var(--secondary-text-color,#aaa); font-size:13px; }
        .fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
        .fields label { display:grid; gap:4px; min-width:0; color:var(--secondary-text-color,#aaa); font-size:12px; }
        .fields input[type=text] { width:100%; min-width:0; min-height:38px; padding:7px 9px; border:1px solid var(--divider-color,#666); border-radius:6px; background:var(--primary-background-color,#111); color:var(--primary-text-color,#eee); font:inherit; font-size:14px; }
        .fields .default-option { display:flex; align-items:center; gap:8px; }
        .children { display:grid; gap:10px; margin-left:12px; padding-left:12px; border-left:2px solid var(--divider-color,#555); }
        .children h4 { margin:2px 0; color:var(--secondary-text-color,#aaa); font-size:13px; }
        .add-actions { display:flex; flex-wrap:wrap; gap:8px; }
        ha-form[hidden],.tree[hidden] { display:none; }
        @media(max-width:600px) { .fields { grid-template-columns:1fr; } .preview { min-height:96px; padding:10px; } .preview-bar { min-height:58px; } }
        @media(hover:none) { .editor-toggle { opacity:1; pointer-events:auto; } }
      </style>
      <section class="editor">
        <div class="preview" style="--nav-color:${NAV_COLORS[this._config.color] || NAV_COLORS.orange}">
          <div class="preview-content">Vorschau der Navigationsleiste</div>
          <button type="button" class="editor-toggle" data-action="toggle-edit" aria-label="${this._editing ? "Bearbeitung abschließen" : "Karte bearbeiten"}" title="${this._editing ? "Bearbeitung abschließen" : "Karte bearbeiten"}"><ha-icon icon="mdi:pencil"></ha-icon></button>
          <nav class="preview-bar" aria-label="Navigationsvorschau">${this._previewMarkup()}</nav>
        </div>
        <ha-form ${this._editing ? "" : "hidden"}></ha-form>
        <div class="tree" ${this._editing ? "" : "hidden"}><h3>Menüstruktur</h3>${this._itemList(this._config.items || [], [], true)}</div>
      </section>`;
    const form = this.shadowRoot.querySelector("ha-form");
    form.schema = formSchema;
    form.data = this._config;
    form.hass = this._hass;
    form.computeLabel = definition.computeLabel;
    form.addEventListener("value-changed", (event) => {
      event.stopPropagation();
      this._config = { ...this._config, ...event.detail.value };
      this._updatePreview();
      this._emitConfig();
    });
  }

  _pathParts(path) { return path === "" ? [] : path.split(".").map(Number); }

  _getItem(path) {
    const parts = this._pathParts(path);
    let items = this._config.items;
    let item;
    for (const index of parts) {
      item = items[index];
      items = item?.children || [];
    }
    return item;
  }

  _getList(path) {
    const parts = this._pathParts(path);
    let items = this._config.items;
    for (const index of parts) items = items[index]?.children || [];
    return items;
  }

  _handleClick(event) {
    const button = event.composedPath?.().find((node) => node?.dataset?.action);
    if (!button) return;
    const action = button.dataset.action;
    if (action === "toggle-edit") {
      this._editing = !this._editing;
      this._render();
      return;
    }
    const path = button.dataset.parent || button.dataset.path || "";
    const list = this._getList(path);
    if (action === "remove") {
      const parts = this._pathParts(button.dataset.path);
      const index = parts.pop();
      const parent = parts.reduce((items, part) => items[part]?.children || [], this._config.items);
      parent.splice(index, 1);
    } else if (action === "add-link") {
      list.push({ name: "Neuer Link", icon: "mdi:link", url: "/lovelace/seite" });
    } else if (action === "add-group") {
      list.push({ name: "Neue Gruppe", icon: "mdi:folder-outline", children: [{ name: "Neuer Link", icon: "mdi:link", url: "/lovelace/seite" }] });
    } else if (action === "add-separator") {
      list.push({ type: "separator" });
    }
    this._render();
    this._emitConfig();
  }

  _handleInput(event) {
    const input = event.composedPath?.().find((node) => node?.dataset?.field);
    if (!input) return;
    if (event.type === "input" && input.type === "checkbox") return;
    if (event.type === "change" && input.type !== "checkbox") return;
    const item = this._getItem(input.dataset.path);
    if (!item) return;
    const field = input.dataset.field;
    if (field === "default") {
      const siblings = this._getList(this._pathParts(input.dataset.path).slice(0, -1).join("."));
      if (input.checked) siblings.forEach((sibling) => { sibling.default = false; });
      item.default = input.checked;
    } else item[field] = input.value;
    this._updatePreview();
    this._emitConfig();
  }

  _updatePreview() {
    const preview = this.shadowRoot.querySelector(".preview-bar");
    if (preview) preview.innerHTML = this._previewMarkup();
    const previewShell = this.shadowRoot.querySelector(".preview");
    if (previewShell) previewShell.style.setProperty("--nav-color", NAV_COLORS[this._config.color] || NAV_COLORS.orange);
  }

  _emitConfig() {
    this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config: this._config } }));
  }

  setConfig(config) {
    this._config = { ...GlassNavigationCard.getStubConfig(), ...config };
    if (!Array.isArray(config.items)) this._config.items = GlassNavigationCard.getStubConfig().items;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this.shadowRoot.querySelector("ha-form").hass = hass;
  }
}

if (!customElements.get("glass-navigation-card")) customElements.define("glass-navigation-card", GlassNavigationCard);
if (!customElements.get("glass-navigation-card-editor")) customElements.define("glass-navigation-card-editor", GlassNavigationCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "glass-navigation-card")) window.customCards.push({ type: "glass-navigation-card", name: "Glass Navigation Card", description: "Verschachtelte Navigation mit konfigurierbarer Position und Farbe.", preview: true, version: NAV_CARD_VERSION });