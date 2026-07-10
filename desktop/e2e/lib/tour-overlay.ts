import type { Page } from "@playwright/test";

/**
 * Guided-tour overlay for the desktop (Electron) tours — mirrors web/e2e/lib/tour-overlay.js so the
 * desktop clips match the web ones. Injects a branded title card + a lower-third caption into the
 * Electron renderer page (a normal Chromium page), baked straight into the recording.
 */

const BRAND = "Pelbu";

const CSS = `
#tour-layer, #tour-layer * { box-sizing: border-box; margin: 0; }
#tour-layer { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;
  font-family: 'Noto Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
#tour-cap { position: absolute; left: 50%; bottom: 46px; transform: translateX(-50%) translateY(30px);
  display: flex; align-items: center; gap: 18px; max-width: min(900px, 84vw); padding: 18px 26px 18px 20px;
  background: linear-gradient(180deg, rgba(15,23,42,.95), rgba(11,18,32,.95));
  border: 1px solid rgba(212,175,55,.28); border-left: 4px solid #D4AF37; border-radius: 16px;
  box-shadow: 0 20px 55px rgba(0,0,0,.55); opacity: 0;
  transition: opacity .45s ease, transform .45s cubic-bezier(.22,1,.36,1);
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
#tour-cap.show { opacity: 1; transform: translateX(-50%) translateY(0); }
#tour-cap .cap-badge { flex: 0 0 auto; width: 46px; height: 46px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: radial-gradient(circle at 32% 28%, #f4de86, #D4AF37);
  color: #1a1206; font-weight: 800; font-size: 21px; box-shadow: 0 4px 16px rgba(212,175,55,.45); }
#tour-cap .cap-badge.hide { display: none; }
#tour-cap .cap-body { min-width: 0; }
#tour-cap .cap-title { color: #fff; font-weight: 700; font-size: 20px; line-height: 1.25; letter-spacing: .2px; }
#tour-cap .cap-text  { color: #cbd5e1; font-size: 15.5px; line-height: 1.45; margin-top: 4px; }
#tour-card { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
  justify-content: center; text-align: center; padding: 8vh 10vw;
  background: radial-gradient(120% 120% at 50% 30%, #16223c 0%, #0F172A 46%, #070c16 100%);
  opacity: 0; transition: opacity .5s ease; }
#tour-card.show { opacity: 1; }
#tour-card .tc-kicker { color: #D4AF37; text-transform: uppercase; letter-spacing: 4px; font-size: 15px; font-weight: 600; }
#tour-card .tc-rule { width: 56px; height: 3px; border-radius: 2px; margin: 20px 0 26px; background: linear-gradient(90deg, #D4AF37, #f4de86); }
#tour-card .tc-title { font-family: 'Noto Serif', Georgia, serif; color: #fff; font-size: 52px; font-weight: 700; line-height: 1.1; }
#tour-card .tc-sub { color: #94a3b8; font-size: 22px; margin-top: 22px; max-width: 660px; line-height: 1.4; }
#tour-card .tc-brand { position: absolute; bottom: 46px; color: #D4AF37; letter-spacing: 3px; font-size: 14px; font-weight: 600; text-transform: uppercase; }
`;

const HTML = `
  <div id="tour-card">
    <div class="tc-kicker"></div><div class="tc-rule"></div>
    <div class="tc-title"></div><div class="tc-sub"></div>
    <div class="tc-brand">◆ ${BRAND}</div>
  </div>
  <div id="tour-cap">
    <div class="cap-badge"></div>
    <div class="cap-body"><div class="cap-title"></div><div class="cap-text"></div></div>
  </div>
`;

const PAGE_SRC = `
(function () {
  if (window.__tour) return;
  var CSS = ${JSON.stringify(CSS)};
  var HTML = ${JSON.stringify(HTML)};
  var api = {};
  function q(id){ return document.getElementById(id); }
  function build(){
    if (!document.body) { document.addEventListener('DOMContentLoaded', build); return; }
    if (q('tour-layer')) return;
    var st = document.createElement('style'); st.id='tour-style'; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
    var layer = document.createElement('div'); layer.id='tour-layer'; layer.innerHTML = HTML;
    document.body.appendChild(layer);
    try { var s = sessionStorage.getItem('__tourCap'); if (s) { var c = JSON.parse(s); api.caption(c.step,c.title,c.text); } } catch(e){}
  }
  api.caption = function(step,title,text){
    build(); var cap=q('tour-cap'); if(!cap) return;
    var badge=cap.querySelector('.cap-badge');
    if (step===''||step==null){ badge.classList.add('hide'); } else { badge.classList.remove('hide'); badge.textContent=step; }
    cap.querySelector('.cap-title').textContent=title||'';
    cap.querySelector('.cap-text').textContent=text||'';
    cap.classList.add('show');
    try { sessionStorage.setItem('__tourCap', JSON.stringify({step:step,title:title,text:text})); } catch(e){}
  };
  api.hideCaption = function(){ var cap=q('tour-cap'); if(cap) cap.classList.remove('show'); try{sessionStorage.removeItem('__tourCap');}catch(e){} };
  api.card = function(kicker,title,sub){
    build(); var c=q('tour-card'); if(!c) return;
    c.querySelector('.tc-kicker').textContent=kicker||'';
    c.querySelector('.tc-title').textContent=title||'';
    c.querySelector('.tc-sub').textContent=sub||'';
    c.classList.add('show');
  };
  api.hideCard = function(){ var c=q('tour-card'); if(c) c.classList.remove('show'); };
  window.__tour = api; window.__tourBuild = build; build();
})();
`;

export async function installTour(page: Page) {
  await page.addInitScript({ content: PAGE_SRC });
}

// Inject the overlay into the CURRENT document via evaluate (call after each navigation). More robust
// than addInitScript for the Electron app, whose first window can be an unnavigated phantom.
export async function injectOverlay(page: Page) {
  await page.evaluate(PAGE_SRC as unknown as string);
}

export async function titleCard(
  page: Page,
  { kicker = "", title = "", sub = "" }: { kicker?: string; title?: string; sub?: string } = {},
  { hold = 2800 }: { hold?: number } = {},
) {
  await page.evaluate(([k, t, s]) => { (window as any).__tourBuild?.(); (window as any).__tour.card(k, t, s); }, [kicker, title, sub]);
  await page.waitForTimeout(hold);
  await page.evaluate(() => (window as any).__tour?.hideCard());
  await page.waitForTimeout(550);
}

export async function caption(
  page: Page,
  { step = "" as string | number, title = "", text = "" }: { step?: string | number; title?: string; text?: string } = {},
  hold = 2100,
) {
  await page.evaluate(([st, t, x]) => { (window as any).__tourBuild?.(); (window as any).__tour.caption(st, t, x); },
    [step === "" ? "" : String(step), title, text]);
  await page.waitForTimeout(hold);
}

export async function clearCaption(page: Page) {
  await page.evaluate(() => (window as any).__tour?.hideCaption()).catch(() => {});
}

export const beat = (page: Page, ms = 1400) => page.waitForTimeout(ms);
