/* Glass Navigation Card — standalone JavaScript */
(() => {
  "use strict";
  const VERSION = "1.2.0";
  const COLORS = { orange: "#ff8b2b", white: "#f2f2f4", gray: "#a0a2a6", green: "#4bc785", red: "#f05c5c" };
  const POSITIONS = [
    { value: "top", label: "Oben (horizontal)" },
    { value: "bottom", label: "Unten (horizontal)" },
    { value: "left", label: "Links (vertikal)" },
    { value: "right", label: "Rechts (vertikal)" }
  ];
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const clone = value => JSON.parse(JSON.stringify(value));
  const group = item => Array.isArray(item?.children) && item.children.length > 0;
  const label = item => item.label == null ? item.name : item.label.trim();
  const matches = item => typeof item?.url === "string" && item.url.trim().startsWith("/") && location.pathname === item.url.trim().split(/[?#]/)[0];
  const branchMatches = item => matches(item) || (group(item) && item.children.some(branchMatches));

  const STYLE = `
    :host{display:block;font-family:var(--paper-font-body1_-_font-family,Arial,sans-serif);--gn-text:#f2f2f4;--gn-muted:#96999e}
    *,*::before,*::after{box-sizing:border-box}
    button{font:inherit;color:inherit;-webkit-tap-highlight-color:transparent}
    .shell{position:fixed;z-index:20;color:var(--gn-text);isolation:isolate}
    .position-top,.position-bottom{left:50%;width:max-content;max-width:calc(100vw - 28px);transform:translateX(-50%) scale(var(--nav-scale))}
    .position-top{top:max(12px,env(safe-area-inset-top));transform-origin:50% 0}
    .position-bottom{bottom:calc(env(safe-area-inset-bottom) + 12px);transform-origin:50% 100%}
    .position-left,.position-right{top:50%;width:max-content;max-width:calc(100vw - 24px);transform:translateY(-50%) scale(var(--nav-scale))}
    .position-left{left:max(12px,env(safe-area-inset-left));transform-origin:0 50%}
    .position-right{right:max(12px,env(safe-area-inset-right));transform-origin:100% 50%}
    .bar{display:flex;align-items:center;justify-content:center;gap:10px;width:max-content;max-width:100%;padding:10px 16px;border:1px solid #ffffff13;border-radius:999px;background:radial-gradient(ellipse at 25% 0%,#ffffff0c,transparent 65%),linear-gradient(145deg,rgba(23,25,24,.95),rgba(9,12,11,.97));box-shadow:0 18px 48px #0008,inset 0 1px 1px #ffffff17,inset 0 -1px 1px #ffffff06;-webkit-backdrop-filter:blur(24px) saturate(125%);backdrop-filter:blur(24px) saturate(125%)}
    .nav-item{appearance:none;position:relative;cursor:pointer;transition:color .18s,background .18s,border-color .18s,box-shadow .18s,transform .18s}
    .bar .nav-item{display:grid;place-items:center;flex:0 1 64px;width:64px;height:auto;min-width:34px;min-height:44px;aspect-ratio:1;padding:0;margin:0;border:1px solid transparent;border-radius:26px;background:transparent;box-shadow:none;color:var(--gn-text)}
    .bar .nav-item>ha-icon{display:block;width:31px;height:31px;--mdc-icon-size:31px}
    .bar .nav-item>span:not(.chevron){display:none}
    .bar .nav-item.active{border-color:color-mix(in srgb,var(--nav-color) 43%,transparent);background:radial-gradient(ellipse at 30% 12%,color-mix(in srgb,var(--nav-color) 23%,transparent),transparent 66%),linear-gradient(145deg,color-mix(in srgb,var(--nav-color) 17%,#171511),color-mix(in srgb,var(--nav-color) 7%,#10110e));color:var(--nav-color);box-shadow:inset 0 1px 2px #ffffff29,inset 0 0 14px color-mix(in srgb,var(--nav-color) 10%,transparent),0 0 22px color-mix(in srgb,var(--nav-color) 10%,transparent)}
    .bar .active>ha-icon{filter:drop-shadow(0 0 5px color-mix(in srgb,var(--nav-color) 35%,transparent))}
    .no-button-borders .bar .nav-item.active{border-color:transparent}
    .chevron{position:absolute;display:grid;place-items:center;opacity:.5}
    .bar .chevron{top:6px;right:5px;width:14px;height:14px}
    .chevron ha-icon{display:block;width:12px;height:12px;--mdc-icon-size:12px}
    .nav-separator{flex:none;width:1px;height:30px;margin:0 3px;background:linear-gradient(transparent,#ffffff29,transparent)}
    .submenu{position:absolute;width:min(470px,calc((100vw - 32px) / max(1,var(--nav-scale))));max-height:min(calc(70dvh / max(1,var(--nav-scale))),620px);padding:24px;overflow:auto;overscroll-behavior:contain;border:1px solid #ffffff16;border-radius:30px;background:radial-gradient(ellipse at 0% 0%,#ffffff0a,transparent 52%),radial-gradient(ellipse at 100% 100%,color-mix(in srgb,var(--nav-color) 3%,transparent),transparent 55%),linear-gradient(145deg,rgba(23,25,24,.97),rgba(10,13,12,.98));color:var(--gn-text);box-shadow:0 24px 70px #0009,inset 0 1px 1px #ffffff17;-webkit-backdrop-filter:blur(30px) saturate(120%);backdrop-filter:blur(30px) saturate(120%);scrollbar-width:thin;scrollbar-color:#ffffff29 transparent;animation:gn-appear .16s ease-out}
    .position-bottom .submenu{bottom:calc(100% + 18px);left:50%;transform:translateX(-50%)}
    .position-top .submenu{top:calc(100% + 18px);left:50%;transform:translateX(-50%)}
    .position-left .submenu{top:50%;left:calc(100% + 18px);transform:translateY(-50%)}
    .position-right .submenu{top:50%;right:calc(100% + 18px);transform:translateY(-50%)}
    .submenu-header{display:flex;align-items:center;gap:10px;margin:0 0 20px;padding:0 2px}
    .submenu-header h2{flex:1;min-width:0;margin:0;font-size:22px;font-weight:650;line-height:1.25;letter-spacing:-.5px;overflow-wrap:anywhere}
    .menu-back,.menu-close{display:grid;place-items:center;flex:none;width:32px;height:32px;padding:0;border:1px solid #ffffff0d;border-radius:12px;background:#ffffff08;color:var(--gn-muted);cursor:pointer}
    .menu-back ha-icon,.menu-close ha-icon{width:18px;height:18px;--mdc-icon-size:18px}
    .menu-segments{display:flex;gap:5px;width:100%;margin:0 0 18px;padding:5px;border:1px solid #ffffff0b;border-radius:19px;background:#ffffff09}
    .segment{flex:1 1 0;min-width:0;min-height:40px;padding:9px 10px;border:1px solid transparent;border-radius:14px;background:transparent;color:var(--gn-muted);font-size:14px;font-weight:600;line-height:1.25;overflow-wrap:anywhere;cursor:pointer;transition:color .18s,background .18s,border-color .18s}
    .segment.selected{border-color:color-mix(in srgb,var(--nav-color) 28%,transparent);background:linear-gradient(145deg,color-mix(in srgb,var(--nav-color) 14%,#20211d),color-mix(in srgb,var(--nav-color) 6%,#141713));color:var(--nav-color);box-shadow:inset 0 1px 1px #ffffff12,0 3px 12px #0003}
    .submenu-items{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:minmax(112px,auto);align-items:stretch;gap:10px}
    .submenu-items .nav-item{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;width:100%;min-width:0;min-height:112px;padding:18px 8px 14px;border:1px solid #ffffff11;border-radius:23px;background:linear-gradient(145deg,#ffffff09,#ffffff02);color:#e7e8e9;box-shadow:inset 0 1px 0 #ffffff06}
    .submenu-items .nav-item>ha-icon{display:block;flex:none;width:34px;height:34px;--mdc-icon-size:34px}
    .submenu-items .nav-item>span:not(.chevron){display:block;max-width:100%;color:#c3c6c8;font-size:13px;font-weight:500;line-height:1.25;text-align:center;overflow-wrap:anywhere}
    .submenu-items .nav-item.active{border-color:color-mix(in srgb,var(--nav-color) 42%,transparent);background:radial-gradient(ellipse at 30% 0%,color-mix(in srgb,var(--nav-color) 17%,transparent),transparent 75%),linear-gradient(145deg,color-mix(in srgb,var(--nav-color) 10%,#1a1b17),#121511);color:var(--nav-color);box-shadow:inset 0 1px 1px #ffffff17,0 0 20px color-mix(in srgb,var(--nav-color) 7%,transparent)}
    .submenu-items .active>ha-icon{filter:drop-shadow(0 0 6px color-mix(in srgb,var(--nav-color) 28%,transparent))}
    .submenu-items .active>span:not(.chevron){color:var(--gn-text)}
    .submenu-items .chevron{top:10px;right:10px;width:14px;height:14px;color:var(--gn-muted)}
    button:focus-visible{outline:2px solid var(--nav-color);outline-offset:4px}
    .position-left .bar,.position-right .bar{flex-direction:column;width:86px;max-height:80dvh;padding:10px;overflow:auto}
    .position-left .bar .nav-item,.position-right .bar .nav-item{flex:0 0 64px;width:64px;height:64px}
    .position-left .nav-separator,.position-right .nav-separator{width:30px;height:1px;margin:3px 0;background:linear-gradient(90deg,transparent,#ffffff29,transparent)}
    .position-left .submenu,.position-right .submenu{width:min(440px,calc((100vw - 140px) / max(1,var(--nav-scale))))}
    .position-left .submenu-items,.position-right .submenu-items{grid-template-columns:repeat(2,minmax(0,1fr))}
    @media(hover:hover){.bar .nav-item:not(.active):hover{background:#ffffff0b;color:white}.submenu-items .nav-item:not(.active):hover{transform:translateY(-2px);border-color:#ffffff24;background:#ffffff0e}.segment:not(.selected):hover{background:#ffffff0b;color:var(--gn-text)}}
    .nav-item:active{transform:scale(.96)}
    @media(max-width:520px){
      .position-top,.position-bottom{max-width:calc(100vw - 20px)}
      .bar{gap:4px;padding:8px 10px}
      .bar .nav-item{flex:0 1 54px;width:54px;min-width:30px;border-radius:21px}
      .bar .nav-item>ha-icon{width:27px;height:27px;--mdc-icon-size:27px}
      .bar .chevron{top:4px;right:3px;width:12px;height:12px}
      .bar .chevron ha-icon{width:10px;height:10px;--mdc-icon-size:10px}
      .nav-separator{height:24px;margin:0 2px}
      .submenu{width:min(420px,calc((100vw - 24px) / max(1,var(--nav-scale))));max-height:calc(65dvh / max(1,var(--nav-scale)));padding:20px 16px 16px;border-radius:27px}
      .position-bottom .submenu{bottom:calc(100% + 14px)}.position-top .submenu{top:calc(100% + 14px)}
      .submenu-header{margin-bottom:16px}.submenu-header h2{font-size:21px}
      .menu-segments{margin-bottom:14px;padding:4px;border-radius:17px}.segment{min-height:38px;padding:8px 6px;border-radius:13px;font-size:13px}
      .submenu-items{grid-auto-rows:minmax(96px,auto);gap:8px}.submenu-items .nav-item{min-height:96px;gap:10px;padding:15px 6px 12px;border-radius:20px}
      .submenu-items .nav-item>ha-icon{width:29px;height:29px;--mdc-icon-size:29px}.submenu-items .nav-item>span:not(.chevron){font-size:12px}
      .position-left .bar,.position-right .bar{width:72px;padding:8px}.position-left .bar .nav-item,.position-right .bar .nav-item{flex:0 0 54px;width:54px;height:54px}
      .position-left .submenu,.position-right .submenu{width:min(360px,calc((100vw - 126px) / max(1,var(--nav-scale))))}
    }
    @keyframes gn-appear{from{opacity:0}to{opacity:1}}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
  `;

  class GlassNavigationCard extends HTMLElement {
    [key: string]: any;

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._config = null;
      this._hass = null;
      this._menuRootIndex = null;
      this._menuPath = [];
      this._onPointer = event => {
        if (this._menuRootIndex !== null && !event.composedPath().includes(this)) this._closeMenu(false);
      };
      this._onKey = event => {
        if (event.key === "Escape" && this._menuRootIndex !== null) {
          event.preventDefault();
          this._closeMenu(true);
        }
      };
      this._onLocation = () => {
        this._menuRootIndex = null;
        this._menuPath = [];
        this._render();
      };
    }
    connectedCallback() {
      document.addEventListener("pointerdown", this._onPointer, true);
      document.addEventListener("keydown", this._onKey);
      window.addEventListener("location-changed", this._onLocation);
      window.addEventListener("popstate", this._onLocation);
      this._render();
    }
    disconnectedCallback() {
      document.removeEventListener("pointerdown", this._onPointer, true);
      document.removeEventListener("keydown", this._onKey);
      window.removeEventListener("location-changed", this._onLocation);
      window.removeEventListener("popstate", this._onLocation);
    }
    set hass(value) { this._hass = value; }
    get hass() { return this._hass; }
    static getStubConfig() {
      return {
        position: "bottom", scale: 100, color: "orange", show_button_borders: true,
        items: [
          { name: "Home", icon: "mdi:home-outline", url: "/lovelace/home" },
          { name: "Räume", icon: "mdi:sofa-outline", menu_title: "Räume", children: [
            { name: "Erdgeschoss", label: "EG", icon: "mdi:home-floor-0", default: true, children: [
              { name: "Wohnzimmer", icon: "mdi:sofa-outline", url: "/lovelace/wohnzimmer" },
              { name: "Küche", icon: "mdi:pot-steam", url: "/lovelace/kueche" },
              { name: "Esszimmer", icon: "mdi:table-chair", url: "/lovelace/esszimmer" }
            ] },
            { name: "Obergeschoss", label: "OG", icon: "mdi:home-floor-1", children: [
              { name: "Schlafzimmer", icon: "mdi:bed-king-outline", url: "/lovelace/schlafzimmer" },
              { name: "Bad", icon: "mdi:bathtub-outline", url: "/lovelace/bad" }
            ] }
          ] },
          { name: "Übersicht", icon: "mdi:view-dashboard", url: "/lovelace/uebersicht" },
          { name: "Favoriten", icon: "mdi:heart-outline", url: "/lovelace/favoriten" },
          { name: "Einstellungen", icon: "mdi:tune-variant", url: "/lovelace/einstellungen" }
        ]
      };
    }
    static getConfigForm() {
      return {
        schema: [
          { name: "items", required: true, selector: { object: { multiple: true } } },
          { name: "color", selector: { select: { mode: "dropdown", options: Object.keys(COLORS).map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) })) } } },
          { name: "position", selector: { select: { mode: "dropdown", options: POSITIONS } } },
          { name: "scale", selector: { number: { min: 70, max: 140, step: 5, mode: "slider", unit_of_measurement: "%" } } },
          { name: "show_button_borders", selector: { boolean: {} } },
          { name: "active", selector: { text: {} } }
        ],
        computeLabel: field => ({ items: "Menüpunkte", color: "Akzentfarbe", position: "Position der Navigation", scale: "Navigation skalieren", show_button_borders: "Rahmen des aktiven Hauptbuttons", active: "Aktiver Hauptpunkt (optional)" })[field.name] || field.name
      };
    }
    static getConfigElement() { return document.createElement("glass-navigation-card-editor"); }
    setConfig(config) {
      const next = { color: "orange", position: "bottom", scale: 100, active: "", show_button_borders: true, ...clone(config || {}) };
      if (!Array.isArray(next.items) || !next.items.length || next.items.every(item => item?.type === "separator")) throw new Error("Bitte mindestens einen Navigationspunkt konfigurieren.");
      if (!Object.hasOwn(COLORS, next.color)) throw new Error("Nicht unterstützte Navigationsfarbe.");
      if (!POSITIONS.some(p => p.value === next.position)) throw new Error("Ungültige Position der Navigationsleiste.");
      const scale = Number(next.scale);
      next.scale = Number.isFinite(scale) ? Math.min(140, Math.max(70, scale)) : 100;
      this._validateItems(next.items);
      this._config = next;
      this._menuRootIndex = null;
      this._menuPath = [];
      this._render();
    }
    getCardSize() { return 1; }
    _validateItems(items, depth = 0) {
      if (depth > 8) throw new Error("Navigationsmenüs dürfen höchstens acht Unterebenen tief sein.");
      let defaults = 0;
      for (const item of items) {
        if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Jeder Navigationspunkt muss ein Objekt sein.");
        if (item.type === "separator") {
          if (depth !== 0) throw new Error("Trenner sind nur in der Hauptnavigation erlaubt.");
          continue;
        }
        if (item.default === true) defaults++;
        if (typeof item.name !== "string" || !item.name.trim()) throw new Error("Jeder Navigationspunkt benötigt einen Namen.");
        if (typeof item.icon !== "string" || !item.icon.trim()) throw new Error(`Bitte ein Icon für '${item.name}' angeben.`);
        for (const field of ["label", "menu_title"]) if (item[field] != null && typeof item[field] !== "string") throw new Error(`'${field}' für '${item.name}' muss Text sein.`);
        if (item.children != null && !Array.isArray(item.children)) throw new Error(`'children' für '${item.name}' muss eine Liste sein.`);
        if (group(item)) {
          if (item.url) throw new Error(`'${item.name}' darf entweder eine URL oder Unterpunkte haben.`);
          this._validateItems(item.children, depth + 1);
        } else if (typeof item.url !== "string" || !/^(?:\/(?!\/)|https?:\/\/)/i.test(item.url.trim()) || /[\u0000-\u0020\\]/.test(item.url.trim())) {
          throw new Error(`'${item.name}' benötigt eine interne URL oder HTTP(S)-URL ohne Leerzeichen.`);
        }
      }
      if (defaults > 1) throw new Error("Pro Menüebene darf nur ein Punkt Standard sein.");
    }
    _menuModel() {
      let items = this._config?.items[this._menuRootIndex]?.children || [];
      let level = 0;
      const segments = [];
      while (items.length) {
        if (items.every(group)) {
          const matched = items.findIndex(branchMatches);
          const fallback = matched >= 0 ? matched : Math.max(0, items.findIndex(item => item.default));
          const selectedIndex = Math.min(this._menuPath[level] ?? fallback, items.length - 1);
          segments.push({ items, selectedIndex, level });
          items = items[selectedIndex].children;
          level++;
        } else if (level < this._menuPath.length && group(items[this._menuPath[level]])) {
          items = items[this._menuPath[level]].children;
          level++;
        } else break;
      }
      return { items, segments, level };
    }
    _visibleItems() { return this._menuModel().items; }
    _menuTitle() {
      const root = this._config.items[this._menuRootIndex];
      return root?.menu_title?.trim() || `${root?.name || "Menü"} wählen`;
    }
    _itemMarkup(item, index, root = false) {
      if (root && item.type === "separator") return `<span class="nav-separator" role="separator" aria-orientation="${["left", "right"].includes(this._config.position) ? "horizontal" : "vertical"}"></span>`;
      const siblings = root ? this._config.items : this._visibleItems();
      const hasMatch = siblings.some(branchMatches);
      const explicit = root && this._config.active;
      const active = root && this._menuRootIndex === index || (explicit ? explicit === item.name : branchMatches(item) || (!hasMatch && item.default === true));
      const nested = group(item);
      const arrow = root ? ({ top: "mdi:chevron-down", bottom: "mdi:chevron-up", left: "mdi:chevron-right", right: "mdi:chevron-left" })[this._config.position] : "mdi:chevron-right";
      return `<button type="button" class="nav-item ${active ? "active" : "inactive"}" data-${root ? "root" : "child"}-index="${index}" aria-label="${esc(item.name)}" title="${esc(item.name)}" ${nested ? `aria-expanded="${root && this._menuRootIndex === index}"` : active ? 'aria-current="page"' : ""}><ha-icon icon="${esc(item.icon)}"></ha-icon>${label(item) ? `<span>${esc(label(item))}</span>` : ""}${nested ? `<span class="chevron" aria-hidden="true"><ha-icon icon="${arrow}"></ha-icon></span>` : ""}</button>`;
    }
    _closeMenu(restoreFocus = false) {
      const index = this._menuRootIndex;
      this._menuRootIndex = null;
      this._menuPath = [];
      this._render();
      if (restoreFocus && index !== null) this.shadowRoot.querySelector(`[data-root-index="${index}"]`)?.focus();
    }
    _navigate(url) {
      if (/^https?:\/\//i.test(url)) { window.location.assign(url); return; }
      window.history.pushState(null, "", url);
      this._menuRootIndex = null;
      this._menuPath = [];
      window.dispatchEvent(new Event("location-changed"));
      this._render();
    }
    _bindEvents() {
      this.shadowRoot.querySelectorAll("[data-root-index]").forEach(button => button.addEventListener("click", () => {
        const index = Number(button.dataset.rootIndex);
        const item = this._config.items[index];
        if (!group(item)) return this._navigate(item.url.trim());
        this._menuRootIndex = this._menuRootIndex === index ? null : index;
        this._menuPath = [];
        this._render();
        this.shadowRoot.querySelector(`[data-root-index="${index}"]`)?.focus();
      }));
      this.shadowRoot.querySelectorAll("[data-child-index]").forEach(button => button.addEventListener("click", () => {
        const index = Number(button.dataset.childIndex);
        const item = this._visibleItems()[index];
        if (!group(item)) return this._navigate(item.url.trim());
        const model = this._menuModel();
        const resolved = this._menuPath.slice(0, model.level);
        model.segments.forEach(segment => { resolved[segment.level] = segment.selectedIndex; });
        this._menuPath = [...resolved, index];
        this._render();
        this.shadowRoot.querySelector("[data-menu-back]")?.focus();
      }));
      this.shadowRoot.querySelectorAll("[data-segment-level]").forEach(button => button.addEventListener("click", () => {
        const level = Number(button.dataset.segmentLevel);
        const resolved = this._menuPath.slice(0, level);
        this._menuModel().segments.filter(segment => segment.level < level).forEach(segment => { resolved[segment.level] = segment.selectedIndex; });
        this._menuPath = [...resolved, Number(button.dataset.segmentIndex)];
        this._render();
        this.shadowRoot.querySelector(`[data-segment-level="${level}"][data-segment-index="${button.dataset.segmentIndex}"]`)?.focus();
      }));
      this.shadowRoot.querySelector("[data-menu-close]")?.addEventListener("click", () => this._closeMenu(true));
      this.shadowRoot.querySelector("[data-menu-back]")?.addEventListener("click", () => {
        this._menuPath.pop();
        this._render();
        (this.shadowRoot.querySelector("[data-menu-back]") || this.shadowRoot.querySelector("[data-menu-close]"))?.focus();
      });
    }
    _render() {
      if (!this._config) return;
      const config = this._config;
      const model = this._menuRootIndex === null ? { items: [], segments: [] } : this._menuModel();
      const segments = model.segments.map(segment => `<div class="menu-segments" role="group" aria-label="Ebene ${segment.level + 1}">${segment.items.map((item, index) => `<button type="button" class="segment ${index === segment.selectedIndex ? "selected" : ""}" aria-pressed="${index === segment.selectedIndex}" data-segment-level="${segment.level}" data-segment-index="${index}">${esc(label(item) || item.name)}</button>`).join("")}</div>`).join("");
      const menu = this._menuRootIndex === null ? "" : `<section class="submenu" aria-label="${esc(this._menuTitle())}"><header class="submenu-header">${this._menuPath.length ? '<button type="button" class="menu-back" data-menu-back aria-label="Zurück"><ha-icon icon="mdi:chevron-left"></ha-icon></button>' : ""}<h2>${esc(this._menuTitle())}</h2><button type="button" class="menu-close" data-menu-close aria-label="Menü schließen"><ha-icon icon="mdi:close"></ha-icon></button></header>${segments}<div class="submenu-items">${model.items.map((item, index) => this._itemMarkup(item, index)).join("")}</div></section>`;
      this.shadowRoot.innerHTML = `<style>${STYLE}</style><div class="shell position-${config.position} ${config.show_button_borders ? "" : "no-button-borders"}" style="--nav-color:${COLORS[config.color]};--nav-scale:${config.scale / 100}">${menu}<nav class="bar" aria-label="Hauptnavigation">${config.items.map((item, index) => this._itemMarkup(item, index, true)).join("")}</nav></div>`;
      this._bindEvents();
    }
  }

  class GlassNavigationCardEditor extends HTMLElement {
    [key: string]: any;

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._config = GlassNavigationCard.getStubConfig();
      this._editing = false;
      this._hass = null;
      this.shadowRoot.addEventListener("click", event => this._handleClick(event));
      this.shadowRoot.addEventListener("input", event => this._handleInput(event));
      this.shadowRoot.addEventListener("change", event => this._handleInput(event));
      this._render();
    }
    setConfig(config) {
      this._config = { ...GlassNavigationCard.getStubConfig(), ...clone(config || {}) };
      if (!Array.isArray(this._config.items)) this._config.items = GlassNavigationCard.getStubConfig().items;
      this._render();
    }
    set hass(value) {
      this._hass = value;
      const form = this.shadowRoot.querySelector("ha-form");
      if (form) form.hass = value;
    }
    _emitConfig() {
      this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config: clone(this._config) } }));
    }
    _parts(path) { return path ? path.split(".").map(Number) : []; }
    _getList(path) {
      let items = this._config.items;
      for (const index of this._parts(path)) items = items[index]?.children || [];
      return items;
    }
    _getItem(path) {
      const parts = this._parts(path);
      const index = parts.pop();
      return this._getList(parts.join("."))[index];
    }
    _addButtons(path, root) {
      return `<div class="add-actions"><button type="button" data-action="add-link" data-parent="${path}">+ Link</button><button type="button" data-action="add-group" data-parent="${path}">+ Gruppe</button>${root ? `<button type="button" data-action="add-separator" data-parent="${path}">+ Trenner</button>` : ""}</div>`;
    }
    _itemList(items, path = [], root = false) {
      return items.map((item, index) => {
        const current = [...path, index];
        const value = current.join(".");
        if (item.type === "separator") return `<div class="tree-separator"><span>Trenner</span><button type="button" data-action="remove" data-path="${value}">Entfernen</button></div>`;
        const isGroup = group(item);
        const field = (name, title, content, placeholder = "") => `<label>${title}<input type="text" data-path="${value}" data-field="${name}" value="${esc(content)}" placeholder="${esc(placeholder)}"></label>`;
        return `<section class="tree-item"><div class="item-heading"><span>${isGroup ? "Gruppe" : "Link"}</span><button type="button" data-action="remove" data-path="${value}" aria-label="${esc(item.name)} entfernen">Entfernen</button></div><div class="fields">${field("name", "Name", item.name)}${field("icon", "Icon", item.icon, "mdi:home-outline")}${field("label", "Beschriftung", item.label ?? item.name, "Leer = ohne Beschriftung")}${isGroup ? field("menu_title", "Menütitel", item.menu_title ?? "") : field("url", "URL", item.url ?? "", "/lovelace/seite")}<label class="default-option"><input type="checkbox" data-path="${value}" data-field="default" ${item.default ? "checked" : ""}>Standardauswahl</label></div>${isGroup ? `<div class="children"><h4>Unterpunkte</h4>${this._itemList(item.children, current)}${this._addButtons(value, false)}</div>` : ""}</section>`;
      }).join("") + (root ? this._addButtons(path.join("."), true) : "");
    }
    _previewMarkup() {
      const items = this._config.items || [];
      const explicit = this._config.active;
      const hasMatch = items.some(branchMatches);
      return items.map(item => {
        if (item.type === "separator") return '<span class="nav-separator" role="separator"></span>';
        const active = explicit ? item.name === explicit : branchMatches(item) || (!hasMatch && item.default);
        return `<div class="nav-item ${active ? "active" : ""}" title="${esc(item.name)}"><ha-icon icon="${esc(item.icon || "mdi:link")}"></ha-icon></div>`;
      }).join("");
    }
    _updatePreview() {
      const preview = this.shadowRoot.querySelector(".preview");
      preview?.style.setProperty("--nav-color", COLORS[this._config.color] || COLORS.orange);
      preview?.classList.toggle("no-button-borders", this._config.show_button_borders === false);
      const bar = this.shadowRoot.querySelector(".preview .bar");
      if (bar) bar.innerHTML = this._previewMarkup();
    }
    _render() {
      const definition = GlassNavigationCard.getConfigForm();
      this.shadowRoot.innerHTML = `<style>${STYLE}
        :host{color:var(--primary-text-color,#eee)}
        .editor{display:grid;gap:16px}.preview{padding:16px;border:1px solid var(--divider-color,#333);border-radius:24px;background:#090c0b;overflow:auto}
        .preview-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;color:#f2f2f4}.preview-header h3{margin:0;font-size:16px}
        .preview .bar{margin:auto;width:100%;gap:4px;padding:8px}.preview .nav-item{flex:1 1 54px;max-width:64px;min-width:25px;min-height:38px;border-radius:21px}.preview .nav-item>ha-icon{width:26px;height:26px;--mdc-icon-size:26px}
        .editor-toggle,.tree button{min-height:34px;padding:6px 10px;border:1px solid var(--divider-color,#444);border-radius:10px;background:var(--secondary-background-color,#242629);color:var(--primary-text-color,#eee);cursor:pointer}
        .editor-toggle{display:grid;place-items:center;width:36px;padding:6px}.editor-toggle ha-icon{width:20px;height:20px;--mdc-icon-size:20px}
        .tree{display:grid;gap:12px}.tree h3{margin:8px 0}.tree-item{display:grid;gap:10px;padding:12px;border:1px solid var(--divider-color,#444);border-radius:16px;background:var(--card-background-color,#17191c)}
        .item-heading,.tree-separator{display:flex;align-items:center;justify-content:space-between;gap:10px}.item-heading>span{font-size:13px;color:var(--secondary-text-color,#aaa)}
        .fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.fields label{display:grid;gap:5px;min-width:0;font-size:12px;color:var(--secondary-text-color,#aaa)}
        .fields input[type=text]{width:100%;min-width:0;min-height:38px;padding:8px 10px;border:1px solid var(--divider-color,#555);border-radius:9px;background:var(--primary-background-color,#111);color:var(--primary-text-color,#eee);font:inherit;font-size:14px}
        .fields .default-option{display:flex;align-items:center;gap:8px}.children{display:grid;gap:10px;margin-left:4px;padding-left:12px;border-left:1px solid var(--divider-color,#444)}.children h4{margin:4px 0;font-size:13px;color:var(--secondary-text-color,#aaa)}.add-actions{display:flex;flex-wrap:wrap;gap:8px}
        [hidden]{display:none!important}@media(max-width:600px){.fields{grid-template-columns:1fr}.preview{padding:12px}}
      </style><section class="editor"><div class="preview ${this._config.show_button_borders === false ? "no-button-borders" : ""}" style="--nav-color:${COLORS[this._config.color] || COLORS.orange}"><div class="preview-header"><h3>Glass Navigation</h3><button type="button" class="editor-toggle" data-action="toggle-edit" aria-label="${this._editing ? "Bearbeitung abschließen" : "Karte bearbeiten"}"><ha-icon icon="${this._editing ? "mdi:check" : "mdi:pencil"}"></ha-icon></button></div><div class="bar" aria-label="Navigationsvorschau">${this._previewMarkup()}</div></div><ha-form ${this._editing ? "" : "hidden"}></ha-form><div class="tree" ${this._editing ? "" : "hidden"}><h3>Menüstruktur</h3>${this._itemList(this._config.items || [], [], true)}</div></section>`;
      const form = this.shadowRoot.querySelector("ha-form");
      form.schema = definition.schema.filter(field => field.name !== "items");
      form.data = this._config;
      form.hass = this._hass;
      form.computeLabel = definition.computeLabel;
      form.addEventListener("value-changed", event => {
        event.stopPropagation();
        this._config = { ...this._config, ...event.detail.value };
        this._updatePreview();
        this._emitConfig();
      });
    }
    _handleClick(event) {
      const button = event.composedPath().find(node => node?.dataset?.action);
      if (!button) return;
      const action = button.dataset.action;
      if (action === "toggle-edit") { this._editing = !this._editing; this._render(); return; }
      if (action === "remove") {
        const parts = this._parts(button.dataset.path);
        const index = parts.pop();
        const list = this._getList(parts.join("."));
        list.splice(index, 1);
        if (!list.length && parts.length) {
          const parent = this._getItem(parts.join("."));
          delete parent.children;
          parent.url = "/lovelace/seite";
        }
      } else {
        const list = this._getList(button.dataset.parent || "");
        if (action === "add-link") list.push({ name: "Neuer Link", icon: "mdi:link", url: "/lovelace/seite" });
        else if (action === "add-group") list.push({ name: "Neue Gruppe", icon: "mdi:folder-outline", children: [{ name: "Neuer Link", icon: "mdi:link", url: "/lovelace/seite" }] });
        else if (action === "add-separator") list.push({ type: "separator" });
        else return;
      }
      this._render();
      this._emitConfig();
    }
    _handleInput(event) {
      const input = event.composedPath().find(node => node?.dataset?.field);
      if (!input || (event.type === "input" && input.type === "checkbox") || (event.type === "change" && input.type !== "checkbox")) return;
      const item = this._getItem(input.dataset.path);
      if (!item) return;
      if (input.dataset.field === "default") {
        const parts = this._parts(input.dataset.path);
        parts.pop();
        if (input.checked) this._getList(parts.join(".")).forEach(sibling => { sibling.default = false; });
        item.default = input.checked;
        this.shadowRoot.querySelectorAll<HTMLInputElement>('input[data-field="default"]').forEach(checkbox => { checkbox.checked = !!this._getItem(checkbox.dataset.path)?.default; });
      } else item[input.dataset.field] = input.value;
      this._updatePreview();
      this._emitConfig();
    }
  }

  if (!customElements.get("glass-navigation-card")) customElements.define("glass-navigation-card", GlassNavigationCard);
  if (!customElements.get("glass-navigation-card-editor")) customElements.define("glass-navigation-card-editor", GlassNavigationCardEditor);
  window.customCards = window.customCards || [];
  const metadata = { type: "glass-navigation-card", name: "Glass Navigation Card", description: "Dunkle Glasnavigation mit warmem Aktivzustand und verschachtelten Raumkacheln.", preview: true, version: VERSION };
  const existing = window.customCards.find(card => card.type === metadata.type);
  if (existing) Object.assign(existing, metadata); else window.customCards.push(metadata);
})();