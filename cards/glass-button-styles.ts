function glassRoundButtonStyles(selector: string): string {
  return `
    ${selector} { border:var(--glass-button-border-width,2px) solid color-mix(in srgb,var(--accent) 78%,#414348); border-radius:50%; background:linear-gradient(145deg,#222428,#131518); color:var(--accent); box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 8px 18px rgba(0,0,0,.28); transition:border-color .18s ease,color .18s ease,background .18s ease,box-shadow .18s ease,transform .18s ease; cursor:pointer; -webkit-tap-highlight-color:transparent; }
    ${selector}:hover { transform:translateY(-2px); border-color:var(--accent); }
    ${selector}.active { border-color:var(--accent); background:radial-gradient(circle at 50% 45%,color-mix(in srgb,var(--accent) 24%,#1c1b19),#1c1b19 72%); box-shadow:inset 0 0 24px color-mix(in srgb,var(--accent) 18%,transparent),0 0 0 var(--glass-button-ring-width,1px) color-mix(in srgb,var(--accent) 35%,transparent),0 8px 22px rgba(0,0,0,.3); }
    ${selector}.inactive { color:#85878b; border-color:#45474b; }
    ${selector}.inactive:hover { border-color:#77797d; }
    ${selector}:focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
  `;
}