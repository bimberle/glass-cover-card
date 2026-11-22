(() => {
"use strict";
const RGB_CARD_VERSION = "1.3.0";
const RGB_PRESET_COUNT = 6;
const escapeRgb = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const clamp = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
const defaults = {title:"RGB",turn_on_text:"RGB",title_size:4,button_size:4,show_action_button:true,show_presets:false,show_card_border:true,compact:true};
const rgbToHs = rgb => {
 const [r,g,b]=rgb.map(v=>v/255), max=Math.max(r,g,b), min=Math.min(r,g,b), diff=max-min;
 let h=0;
 if(diff){h=max===r?(g-b)/diff:max===g?(b-r)/diff+2:(r-g)/diff+4;h=(h*60+360)%360;}
 return [Math.round(h),max?Math.round(diff/max*100):0];
};
class GlassRgbCard extends HTMLElement {
 [key:string]:any;
 constructor(){
  super();this.attachShadow({mode:"open"});this._config=null;this._hass=null;this._stateKey=null;this._presets=[];this._selected=-1;this._hue=0;this._saturation=100;this._brightness=0;this._temperatureValue=null;this._dragging=false;this._pending=false;this._pendingTimer=null;
 }
 static getStubConfig(){return {entity:"light.wohnzimmer",...defaults};}
 static getConfigForm(){return {
  schema:[
   {name:"entity",required:true,selector:{entity:{filter:{domain:"light"}}}},
   {name:"title",default:"RGB",selector:{text:{}}},
   {name:"name",selector:{text:{}}},
   {name:"icon",selector:{icon:{}}},
   {name:"turn_on_text",default:"RGB",selector:{text:{}}},
   {name:"compact",default:true,selector:{boolean:{}}},
   {name:"show_card_border",default:true,selector:{boolean:{}}},
   {name:"show_action_button",default:true,selector:{boolean:{}}},
   {name:"title_size",default:4,selector:{number:{min:1,max:5,step:1,mode:"slider"}}},
   {name:"button_size",default:4,selector:{number:{min:1,max:5,step:1,mode:"slider"}}},
   {name:"show_presets",default:false,selector:{boolean:{}}},
   ...Array.from({length:RGB_PRESET_COUNT},(_,i)=>({name:`preset_${i+1}`,selector:{color_rgb:{}}}))
  ],
  computeLabel:field=>({entity:"Licht",title:"Titel",name:"Beschriftung",icon:"Icon",turn_on_text:"Text unter dem Einschalt-Icon",compact:"Kompakte Darstellung",show_card_border:"Kartenrahmen anzeigen",show_action_button:"Kopfbutton anzeigen",title_size:"Beschriftungsgröße",button_size:"Button-Größe",show_presets:"Farb-Presets anzeigen"})[field.name]||(field.name.startsWith("preset_")?`Farb-Preset ${field.name.slice(7)}`:field.name)
 };}
 setConfig(config){
  if(!config?.entity || typeof config.entity!=="string" || !config.entity.startsWith("light.")) throw new Error("Bitte eine Licht-Entität auswählen.");
  for(let i=1;i<=RGB_PRESET_COUNT;i++){
   const color=config[`preset_${i}`];
   if(color!=null&&(!Array.isArray(color)||color.length!==3||color.some(v=>!Number.isInteger(v)||v<0||v>255)))throw new Error(`Preset ${i} muss drei RGB-Werte von 0 bis 255 enthalten.`);
  }
  clearTimeout(this._pendingTimer);this._pending=false;this._dragging=false;
  this._config={...defaults,...config,title_size:clamp(config.title_size??4,1,5,4),button_size:clamp(config.button_size??4,1,5,4)};
  this._selected=-1;this._stateKey=null;this._loadPresets();this._render();this._sync();
 }
 connectedCallback(){this._sync();}
 disconnectedCallback(){clearTimeout(this._pendingTimer);this._pending=false;this._dragging=false;}
 set hass(hass){
  this._hass=hass;const state=hass?.states?.[this._config?.entity];
  const key=JSON.stringify([state?.state,state?.attributes]);
  if(key!==this._stateKey){this._stateKey=key;this._sync();}
 }
 get hass(){return this._hass;}
 getCardSize(){return this._config?.compact!==false?4:5;}
 _state(){return this._hass?.states?.[this._config?.entity];}
 _available(){const s=this._state();return !!s&&!['unknown','unavailable'].includes(s.state);}
 _loadPresets(){this._presets=Array.from({length:RGB_PRESET_COUNT},(_,i)=>({slot:i+1,rgb:this._config[`preset_${i+1}`]})).filter(p=>Array.isArray(p.rgb)).map(p=>{const [hue,saturation]=rgbToHs(p.rgb);return {...p,hue,saturation};});}
 _markPending(){this._pending=true;clearTimeout(this._pendingTimer);this._pendingTimer=setTimeout(()=>{this._pending=false;this._sync();},1800);}
 _call(service,data={}){
  if(!this._hass||!this._available())return;
  this._markPending();
  try{
   Promise.resolve(this._hass.callService("light",service,{entity_id:this._config.entity,...data})).catch(error=>this._serviceError(error));
  }catch(error){this._serviceError(error);}
 }
 _serviceError(error){clearTimeout(this._pendingTimer);this._pending=false;this._sync();console.error("Glass RGB Card:",error);}
 _sendColor(){this._call("turn_on",{hs_color:[this._hue,this._saturation],brightness_pct:Math.max(1,this._brightness)});}
 _sendBrightness(){this._call(this._brightness===0?"turn_off":"turn_on",this._brightness===0?{}:{brightness_pct:this._brightness});}
 _selectPreset(index){const p=this._presets[index];if(!p||!this._available())return;this._selected=index;this._hue=p.hue;this._saturation=p.saturation;this._temperatureValue=null;this._updateView();this._call("turn_on",{rgb_color:p.rgb});}
 _toggleLight(){const s=this._state();if(s?.state==="off"){if(this._presets.length)this._selectPreset(0);else this._call("turn_on");}else if(s?.state==="on")this._call("turn_off");}
 _setHue(event){const b=this.shadowRoot.querySelector(".wheel").getBoundingClientRect();const angle=Math.atan2(event.clientX-b.left-b.width/2,-(event.clientY-b.top-b.height/2));this._hue=Math.round((angle*180/Math.PI+360)%360)%360;this._saturation=100;this._temperatureValue=null;this._selected=-1;this._updateView();}
 _sync(){
  if(!this._config||!this.shadowRoot.querySelector('.card'))return;
  const s=this._state(),a=s?.attributes||{},modes=a.supported_color_modes||[];
  const color=modes.some(m=>['hs','xy','rgb','rgbw','rgbww'].includes(m));
  const temperature=modes.includes('color_temp');
  const available=this._available(),off=s?.state==='off';
  const q=selector=>this.shadowRoot.querySelector(selector);
  if(!this._dragging&&!this._pending&&s){
   if(Array.isArray(a.hs_color))[this._hue,this._saturation]=a.hs_color;
   this._brightness=s.state==='on'?(Number.isFinite(a.brightness)?Math.round(a.brightness/255*100):100):0;
  }
  const header=q('.header-action');header.hidden=this._config.show_action_button===false;header.disabled=!available;header.classList.toggle('active',s?.state==='on');header.classList.toggle('inactive',off);
  q('.action-state').textContent=s?.state==='on'?'An':off?'Aus':'';
  const name=String(this._config.name??'').trim();q('.subtitle').textContent=name;q('.subtitle').hidden=!name;
  q('.titles').hidden=!String(this._config.title??'').trim()&&!name;q('.header').hidden=q('.titles').hidden&&header.hidden;
  q('.controls').hidden=!color||!available;q('.controls').classList.toggle('is-off',off);
  q('.turn-on').hidden=!off;q('.turn-off').hidden=s?.state!=='on';
  q('.wheel').tabIndex=off||!available?-1:0;q('.wheel').setAttribute('aria-disabled',String(off||!available));
  q('.brightness').disabled=off||!available;
  q('.unavailable').hidden=color&&available;q('.unavailable').textContent=!s?'Licht nicht gefunden.':!available?'Licht nicht verfügbar.':'Dieses Licht unterstützt keine RGB-Farben.';
  q('.temperature').hidden=!temperature;
  const input=q('.temperature input');
  input.min=a.min_color_temp_kelvin||(a.max_mireds?Math.round(1000000/a.max_mireds):2000);
  input.max=a.max_color_temp_kelvin||(a.min_mireds?Math.round(1000000/a.min_mireds):6500);
  input.disabled=!available;
  if(!this._pending&&!this._dragging)input.value=a.color_temp_kelvin||input.min;
  this._updateView();
 }
 _updateView(){
  const q=selector=>this.shadowRoot.querySelector(selector),wheel=q('.wheel');if(!wheel)return;
  const control=q('.color-control');control.style.setProperty('--hue',this._hue);control.style.setProperty('--saturation',`${this._saturation}%`);control.style.setProperty('--light-level',`${clamp(this._brightness,0,100,0)}%`);
  wheel.setAttribute('aria-valuenow',String(Math.round(this._hue)%360));
  q('.brightness-number').textContent=`${Math.round(this._brightness)} %`;q('.brightness').value=this._brightness;
  this.shadowRoot.querySelectorAll('.preset').forEach((button,i)=>{button.style.setProperty('--swatch',`rgb(${this._presets[i].rgb.join(',')})`);button.setAttribute('aria-pressed',String(i===this._selected));});
 }
 _render(){
  if(!this._config)return;
  const c=this._config,titleScale=.65+((c.title_size-1)/4)*.35,menuScale=.5+(1/3+((c.button_size-1)/4)*(2/3))*.5;
  const icon=escapeRgb(c.icon||'mdi:lightbulb-outline');
  this.shadowRoot.innerHTML=`
  <style>
   :host{display:block;width:100%;color:var(--primary-text-color,#f3f3f5);font-family:var(--paper-font-body1_-_font-family,Arial,sans-serif)}
   *{box-sizing:border-box}button,input{font:inherit}button{-webkit-tap-highlight-color:transparent}
   [hidden]{display:none!important}
   .card{--wheel-size:360px;--card-padding:clamp(20px,4.7vw,38px);--header-gap:clamp(20px,3vw,30px);--icon-size:clamp(42px,18vw,96px);--preset-size:42px;--section-gap:28px;width:100%;padding:var(--card-padding);border:1px solid #ffffff1a;border-radius:28px;background:radial-gradient(ellipse at 48% 0,#22252a 0,#15171a 62%,#101214 100%);box-shadow:inset 0 1px 1px #ffffff0f,0 12px 30px #0003}
   .card.compact{--wheel-size:290px;--card-padding:clamp(16px,3vw,24px);--header-gap:16px;--icon-size:clamp(38px,13vw,72px);--preset-size:34px;--section-gap:18px;border-radius:25px}
   /* Nur die äußere Kontur entfernen, Innenbedienung unverändert lassen. */
   .card.no-border{border-color:transparent;box-shadow:0 12px 30px #0003}
   .header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:var(--header-gap)}
   .header:has(>.titles[hidden]){justify-content:flex-end}
   .titles{min-width:0}.title{color:#9295a0;font-size:clamp(11px,2.1vw,15px);font-weight:700;letter-spacing:.12em;text-transform:uppercase;overflow-wrap:anywhere}
   .subtitle{margin:7px 0 0;font-size:var(--subtitle-font);font-weight:700;line-height:1.08;overflow-wrap:anywhere}
   .header-action{position:relative;display:grid;flex:none;place-items:center;width:var(--header-action-size);aspect-ratio:1;padding:0;border:2px solid #303239;border-radius:50%;background:linear-gradient(145deg,#272a30,#17191d);color:#ff8b2b;box-shadow:0 6px 15px #0004,inset 0 1px 0 #ffffff0d;cursor:pointer}
   .header-action.active{border-color:#ff8b2b;color:#ff9b4a;box-shadow:inset 0 0 20px #ff8b2b1f,0 0 0 1px #ff8b2b33,0 6px 15px #0004}
   .header-action.inactive{color:#85878b;border-color:#45474b}.header-action:disabled{opacity:.45;cursor:default}
   .header-action ha-icon{display:block;width:var(--header-icon-size);height:var(--header-icon-size);--mdc-icon-size:var(--header-icon-size)}
   .action-state{position:absolute;bottom:11%;font-size:clamp(5px,calc(var(--header-action-size)*.15),13px);line-height:1}
   .color-control{--light-color:color-mix(in srgb,color-mix(in srgb,hsl(var(--hue,0) 100% 50%) var(--saturation,100%),white) var(--light-level,100%),black);position:relative;width:min(100%,var(--wheel-size));aspect-ratio:1;margin:0 auto}
   .controls.is-off .wheel,.controls.is-off .brightness,.controls.is-off .preset{filter:grayscale(1) brightness(.65)}.controls.is-off .brightness-control{display:none}
   .turn-on{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;width:100%;height:100%;padding:0;border:0;border-radius:50%;background:transparent;color:#85878b;cursor:pointer}
   .turn-on ha-icon{display:block;width:var(--icon-size);height:var(--icon-size);--mdc-icon-size:var(--icon-size)}.turn-on-label{font-size:13px}
   .wheel{position:absolute;inset:0;border-radius:50%;background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red);touch-action:none;cursor:pointer}
   .wheel::before{content:'';position:absolute;inset:9%;border-radius:50%;background:#15171a;pointer-events:none}
   .wheel-marker{position:absolute;inset:0;pointer-events:none;transform:rotate(calc(var(--hue)*1deg))}
   .wheel-marker::after{content:'';position:absolute;width:10%;aspect-ratio:1;top:-2px;left:45%;border:2px solid #ddd;border-radius:50%;background:hsl(var(--hue) 100% 50%)}
   .turn-off{position:absolute;inset:18%;z-index:1;display:grid;place-items:center;padding:0;border:clamp(4px,1.3vw,8px) solid var(--light-color);border-radius:50%;background:#15171a;color:var(--light-color);cursor:pointer}
   .turn-off ha-icon{display:block;width:var(--icon-size);height:var(--icon-size);transform:translateY(-25%);--mdc-icon-size:var(--icon-size)}
   .brightness-control{position:absolute;z-index:2;top:60%;left:27%;width:46%;display:flex;flex-direction:column;align-items:center;gap:3px;color:#a0a2ad;font-size:12px}
   .brightness{width:100%;min-width:0;margin:0;accent-color:color-mix(in srgb,hsl(var(--hue,0) 100% 50%) var(--saturation,100%),white);cursor:pointer}
   .presets{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin:var(--section-gap) auto 0;max-width:var(--wheel-size);justify-items:center}
   .preset{width:min(100%,var(--preset-size));aspect-ratio:1;padding:0;border:2px solid transparent;border-radius:50%;background:var(--swatch);cursor:pointer}
   .preset[aria-pressed=true]{outline:2px solid white;outline-offset:3px}
   .temperature{display:flex;align-items:center;gap:10px;max-width:var(--wheel-size);margin:var(--section-gap) auto 0;color:#a0a2ad;font-size:13px}
   .temperature input{flex:1;min-width:0;accent-color:#f1f1f1;cursor:pointer}.unavailable{color:var(--secondary-text-color,#a0a2ad);font-size:14px}
   button:focus-visible,.wheel:focus-visible,input:focus-visible{outline:2px solid #eee;outline-offset:3px}
   @media(max-width:380px){.card{--card-padding:18px}.card.compact{--card-padding:14px}.presets{gap:6px}}
  </style>
  <article class="card ${c.compact!==false?'compact':''} ${c.show_card_border===false?'no-border':''}" style="--subtitle-font:clamp(${22*titleScale}px,${4.8*titleScale}vw,${38*titleScale}px);--header-action-size:clamp(${56*menuScale*(c.compact !== false ? .88 : 1)}px,${11*menuScale}vw,${88*menuScale*(c.compact !== false ? .88 : 1)}px);--header-icon-size:calc((var(--header-action-size) - 16px)*.46)">
   <header class="header"><div class="titles">${String(c.title??'').trim()?`<div class="title">${escapeRgb(String(c.title).trim())}</div>`:''}<h2 class="subtitle" hidden></h2></div><button type="button" class="header-action" aria-label="Licht ein- oder ausschalten" title="Licht ein- oder ausschalten"><ha-icon icon="${icon}"></ha-icon><span class="action-state"></span></button></header>
   <p class="unavailable" hidden></p>
   <div class="controls" hidden><div class="color-control"><div class="wheel" role="slider" tabindex="0" aria-label="Farbton" aria-valuemin="0" aria-valuemax="359" aria-valuenow="0"><span class="wheel-marker"></span></div><button type="button" class="turn-off" aria-label="Licht ausschalten" title="Licht ausschalten" hidden><ha-icon icon="${icon}" aria-hidden="true"></ha-icon></button><button type="button" class="turn-on" aria-label="Licht einschalten" title="Licht einschalten" hidden><ha-icon icon="${icon}"></ha-icon>${String(c.turn_on_text??'RGB').trim()?`<span class="turn-on-label">${escapeRgb(String(c.turn_on_text).trim())}</span>`:''}</button><div class="brightness-control"><input class="brightness" type="range" min="0" max="100" aria-label="Helligkeit"><span class="brightness-number">0 %</span></div></div>
   ${c.show_presets&&this._presets.length?`<div class="presets">${this._presets.map(p=>`<button class="preset" type="button" title="Farb-Preset ${p.slot}" aria-label="Farb-Preset ${p.slot}" aria-pressed="false"></button>`).join('')}</div>`:''}
   <div class="temperature" hidden><span>Warm</span><input type="range" aria-label="Farbtemperatur" step="50"><span>Kalt</span></div></div>
  </article>`;
  const q=selector=>this.shadowRoot.querySelector(selector);
  ['.header-action','.turn-on','.turn-off'].forEach(selector=>q(selector).addEventListener('click',()=>this._toggleLight()));
  const wheel=q('.wheel');
  wheel.addEventListener('pointerdown',e=>{if(e.button!==0||this._state()?.state!=='on'||!this._available())return;e.preventDefault();this._dragging=true;wheel.setPointerCapture(e.pointerId);this._setHue(e);});
  wheel.addEventListener('pointermove',e=>{if(this._dragging&&wheel.hasPointerCapture(e.pointerId))this._setHue(e);});
  wheel.addEventListener('pointerup',e=>{if(!this._dragging||!wheel.hasPointerCapture(e.pointerId))return;this._setHue(e);this._dragging=false;wheel.releasePointerCapture(e.pointerId);this._sendColor();});
  const cancel=()=>{if(this._dragging){this._dragging=false;this._sync();}};wheel.addEventListener('pointercancel',cancel);wheel.addEventListener('lostpointercapture',cancel);
  wheel.addEventListener('keydown',e=>{if(this._state()?.state!=='on'||!['ArrowLeft','ArrowDown','ArrowRight','ArrowUp'].includes(e.key))return;e.preventDefault();this._hue=(Math.round(this._hue)+(['ArrowLeft','ArrowDown'].includes(e.key)?355:5))%360;this._saturation=100;this._temperatureValue=null;this._selected=-1;this._updateView();this._sendColor();});
  const brightness=q('.brightness');brightness.addEventListener('input',()=>{this._dragging=true;this._brightness=Number(brightness.value);this._updateView();});brightness.addEventListener('change',()=>{this._dragging=false;this._brightness=Number(brightness.value);this._sendBrightness();});brightness.addEventListener('blur',cancel);
  this.shadowRoot.querySelectorAll('.preset').forEach((button,i)=>button.addEventListener('click',()=>this._selectPreset(i)));
  const temperature=q('.temperature input');temperature.addEventListener('input',()=>{this._dragging=true;});temperature.addEventListener('change',()=>{this._dragging=false;this._temperatureValue=Number(temperature.value);this._selected=-1;this._updateView();this._call('turn_on',{color_temp_kelvin:this._temperatureValue});});temperature.addEventListener('blur',cancel);
 }
}
if(!customElements.get('glass-rgb-card'))customElements.define('glass-rgb-card',GlassRgbCard);
window.customCards=window.customCards||[];
const metadata={type:'glass-rgb-card',name:'Glass RGB Card',description:'Kompakte RGB-Lichtsteuerung mit optionalem Kartenrahmen und Farb-Presets.',preview:true,version:RGB_CARD_VERSION};
const existing=window.customCards.find(card=>card.type===metadata.type);if(existing)Object.assign(existing,metadata);else window.customCards.push(metadata);
})();