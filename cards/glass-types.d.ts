export {};

declare global {
interface GlassEntityState {
  state: string;
  attributes: Record<string, any>;
}

interface GlassHass {
  states: Record<string, GlassEntityState>;
  callService(domain: string, service: string, data?: Record<string, any>): void;
}

type GlassCardConfig = Record<string, any>;

interface GlassHaFormElement extends HTMLElement {
  schema: any[];
  data: GlassCardConfig;
  hass: GlassHass | null;
  computeLabel: (field: any) => string | undefined;
  addEventListener(type: "value-changed", listener: (event: CustomEvent<{ value: GlassCardConfig }>) => void): void;
}

interface GlassHaCardPickerElement extends HTMLElement {
  hass: GlassHass | null;
  lovelace: any;
}

interface GlassHaCardEditorElement extends GlassHaCardPickerElement {
  value: GlassCardConfig;
}

interface GlassCustomCardInfo {
  type: string;
  name: string;
  description: string;
  preview?: boolean;
  version?: string;
}

  interface ShadowRoot {
    querySelector<K extends keyof HTMLElementTagNameMap>(selectors: K): HTMLElementTagNameMap[K] | null;
    querySelector<E extends Element = HTMLElement>(selectors: string): E | null;
    querySelectorAll<E extends Element = HTMLElement>(selectors: string): NodeListOf<E>;
  }

  interface Window {
    customCards: GlassCustomCardInfo[];
    loadCardHelpers(): Promise<any>;
  }

  interface HTMLElementTagNameMap {
    "ha-form": GlassHaFormElement;
    "hui-card-picker": GlassHaCardPickerElement;
    "hui-card-element-editor": GlassHaCardEditorElement;
  }
}