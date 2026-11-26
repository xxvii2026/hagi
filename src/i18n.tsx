// Landing page languages. Swaps the page's English text for the chosen language in place,
// and puts the English back when you switch to English or leave the landing page.
import { useEffect, useState } from 'react'
import DICT from './i18n-landing.json'
import APP from './i18n-app.json'

export type Lang = 'en' | 'zh' | 'es' | 'fr'
const LANGS: { k: Lang; label: string }[] = [{ k: 'en', label: 'EN' }, { k: 'zh', label: '中文' }, { k: 'es', label: 'ES' }, { k: 'fr', label: 'FR' }]
type L3 = Exclude<Lang, 'en'>
const D = { ...(DICT as Record<string, Record<L3, string>>), ...(APP as Record<string, Record<L3, string>>) }
// Text with numbers or names in it, like "Not enough TSLA" or "2 of 3 done".
const PAT: [RegExp, (m: RegExpMatchArray) => Record<L3, string>][] = [
  [/^Not enough (\w+)$/, m => ({ zh: `${m[1]} 不足`, es: `No tienes suficiente ${m[1]}`, fr: `Pas assez de ${m[1]}` })],
  [/^You have ([\d.,]+) (\w+)$/, m => ({ zh: `你有 ${m[1]} ${m[2]}`, es: `Tienes ${m[1]} ${m[2]}`, fr: `Vous avez ${m[1]} ${m[2]}` })],
  [/^(Shield|Unshield) ([\d.,]+) (\w+)$/, m => m[1] === 'Shield' ? { zh: `存入 ${m[2]} ${m[3]}`, es: `Proteger ${m[2]} ${m[3]}`, fr: `Protéger ${m[2]} ${m[3]}` } : { zh: `取出 ${m[2]} ${m[3]}`, es: `Desproteger ${m[2]} ${m[3]}`, fr: `Retirer ${m[2]} ${m[3]}` }],
  [/^(\d+) of (\d+) done$/, m => ({ zh: `已完成 ${m[1]}/${m[2]}`, es: `${m[1]} de ${m[2]} hechos`, fr: `${m[1]} sur ${m[2]} faits` })],
  [/^(\d+) stocks$/, m => ({ zh: `${m[1]} 只股票`, es: `${m[1]} acciones`, fr: `${m[1]} actions` })],
  [/^Send to (\d+) (person|people)$/, m => ({ zh: `发送给 ${m[1]} 人`, es: `Enviar a ${m[1]} ${m[1] === '1' ? 'persona' : 'personas'}`, fr: `Envoyer à ${m[1]} ${m[1] === '1' ? 'personne' : 'personnes'}` })],
  [/^All (\d+) paid$/, m => ({ zh: `${m[1]} 人已全部付款`, es: `Los ${m[1]} pagados`, fr: `Les ${m[1]} payés` })],
  [/^Sell (\d+)%$/, m => ({ zh: `卖出 ${m[1]}%`, es: `Vender ${m[1]}%`, fr: `Vendre ${m[1]} %` })],
  [/^(\d+) pts off$/, m => ({ zh: `偏离 ${m[1]} 点`, es: `${m[1]} pts desviado`, fr: `${m[1]} pts d’écart` })],
  [/^(\d+) deposits are waiting$/, m => ({ zh: `有 ${m[1]} 笔存款待领取`, es: `Hay ${m[1]} depósitos esperando`, fr: `${m[1]} dépôts vous attendent` })],
  [/^(\$[\d.,]+) still in your wallet$/, m => ({ zh: `钱包里还有 ${m[1]}`, es: `${m[1]} aún en tu billetera`, fr: `${m[1]} encore dans votre portefeuille` })],
  [/^(\$[\d.,]+) waiting at your Ghost Address$/, m => ({ zh: `${m[1]} 在你的幽灵地址等待领取`, es: `${m[1]} esperando en tu dirección fantasma`, fr: `${m[1]} en attente à votre adresse fantôme` })],
]
const ATTRS = ['placeholder', 'aria-label', 'title']
const orig = new WeakMap<Node, string>()
const origAttr = new WeakMap<Element, Record<string, string>>()

// A saved choice wins. Otherwise follow the language the visitor's browser or phone is set to.
function load(): Lang {
  try { const v = localStorage.getItem('hagi-lang'); if (v === 'en' || v === 'zh' || v === 'es' || v === 'fr') return v } catch { /* private mode */ }
  for (const l of navigator.languages || [navigator.language]) {
    const k = (l || '').slice(0, 2).toLowerCase()
    if (k === 'zh' || k === 'es' || k === 'fr') return k
    if (k === 'en') return 'en'
  }
  return 'en'
}

function tr(s: string, lang: Lang) {
  if (lang === 'en') return s
  const k = s.trim(); const hit = D[k]?.[lang]
  if (hit) return s.replace(k, hit)
  for (const [re, f] of PAT) { const m = k.match(re); if (m) return s.replace(k, f(m)[lang]) }
  return s
}

function apply(root: Node, lang: Lang) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let n: Node | null
  while ((n = w.nextNode())) {
    const p = (n as Text).parentElement
    if (!p || p.closest('script,style,code,[data-noi18n]')) continue
    if (!orig.has(n)) orig.set(n, n.nodeValue || '')
    const want = tr(orig.get(n)!, lang)
    if (n.nodeValue !== want) n.nodeValue = want
  }
  if (root instanceof Element || root instanceof Document) {
    (root instanceof Document ? root.body : root).querySelectorAll(ATTRS.map(a => `[${a}]`).join(',')).forEach(el => {
      if (el.closest('[data-noi18n]')) return
      const o = origAttr.get(el) || {}
      ATTRS.forEach(a => { const v = el.getAttribute(a); if (v == null) return; if (!(a in o)) o[a] = v; const want = tr(o[a], lang); if (v !== want) el.setAttribute(a, want) })
      origAttr.set(el, o)
    })
  }
}

// Keeps the page in the chosen language while React re-renders parts of it.
export function useLanding(lang: Lang) {
  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang
    apply(document.body, lang)
    if (lang === 'en') return
    let busy = false
    const mo = new MutationObserver(muts => {
      if (busy) return; busy = true
      for (const m of muts) {
        if (m.type === 'characterData') { const n = m.target; if (orig.has(n) && n.nodeValue !== tr(orig.get(n)!, lang)) { orig.set(n, n.nodeValue || '') } apply(n.parentNode || document.body, lang) }
        else m.addedNodes.forEach(n => apply(n, lang))
      }
      busy = false
    })
    mo.observe(document.body, { subtree: true, childList: true, characterData: true })
    return () => { mo.disconnect(); apply(document.body, 'en'); document.documentElement.lang = 'en' }
  }, [lang])
}

export function LangSwitch() {
  const [lang, setLang] = useState<Lang>(load)
  useLanding(lang)
  const [open, setOpen] = useState(false)
  const pick = (l: Lang) => { setLang(l); setOpen(false); try { localStorage.setItem('hagi-lang', l) } catch { /* private mode */ } }
  return (
    <div className="lang" data-noi18n>
      <button className="lang-b" onClick={() => setOpen(o => !o)} aria-label="Language">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></svg>
        {LANGS.find(x => x.k === lang)!.label}
      </button>
      {open && <div className="lang-m">{LANGS.map(x => <button key={x.k} className={x.k === lang ? 'on' : ''} onClick={() => pick(x.k)}>{x.label}</button>)}</div>}
    </div>
  )
}
