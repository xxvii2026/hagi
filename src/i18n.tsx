// Landing page languages. Swaps the page's English text for the chosen language in place,
// and puts the English back when you switch to English or leave the landing page.
import { useEffect, useState } from 'react'
import DICT from './i18n-landing.json'

export type Lang = 'en' | 'zh' | 'es' | 'fr'
const LANGS: { k: Lang; label: string }[] = [{ k: 'en', label: 'EN' }, { k: 'zh', label: '中文' }, { k: 'es', label: 'ES' }, { k: 'fr', label: 'FR' }]
const D = DICT as Record<string, Record<Exclude<Lang, 'en'>, string>>
const ATTRS = ['placeholder', 'aria-label', 'title']
const orig = new WeakMap<Node, string>()
const origAttr = new WeakMap<Element, Record<string, string>>()

function load(): Lang { try { const v = localStorage.getItem('hagi-lang'); return (['zh', 'es', 'fr'].includes(v || '') ? v : 'en') as Lang } catch { return 'en' } }

function tr(s: string, lang: Lang) {
  if (lang === 'en') return s
  const k = s.trim(); const hit = D[k]?.[lang]
  return hit ? s.replace(k, hit) : s
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
