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
  [/^(\d+) of (\d+)$/, m => ({ zh: `${m[1]} / ${m[2]}`, es: `${m[1]} de ${m[2]}`, fr: `${m[1]} sur ${m[2]}` })],
  [/^(\d+) of (\d+) done$/, m => ({ zh: `已完成 ${m[1]}/${m[2]}`, es: `${m[1]} de ${m[2]} hechos`, fr: `${m[1]} sur ${m[2]} faits` })],
  [/^(\d+) stocks$/, m => ({ zh: `${m[1]} 只股票`, es: `${m[1]} acciones`, fr: `${m[1]} actions` })],
  [/^Send to (\d+) (person|people)$/, m => ({ zh: `发送给 ${m[1]} 人`, es: `Enviar a ${m[1]} ${m[1] === '1' ? 'persona' : 'personas'}`, fr: `Envoyer à ${m[1]} ${m[1] === '1' ? 'personne' : 'personnes'}` })],
  [/^All (\d+) paid$/, m => ({ zh: `${m[1]} 人已全部付款`, es: `Los ${m[1]} pagados`, fr: `Les ${m[1]} payés` })],
  [/^Sell (\d+)%$/, m => ({ zh: `卖出 ${m[1]}%`, es: `Vender ${m[1]}%`, fr: `Vendre ${m[1]} %` })],
  [/^(\d+) pts off$/, m => ({ zh: `偏离 ${m[1]} 点`, es: `${m[1]} pts desviado`, fr: `${m[1]} pts d’écart` })],
  [/^(\d+) deposits are waiting$/, m => ({ zh: `有 ${m[1]} 笔存款待领取`, es: `Hay ${m[1]} depósitos esperando`, fr: `${m[1]} dépôts vous attendent` })],
  [/^(\$[\d.,]+) still in your wallet$/, m => ({ zh: `钱包里还有 ${m[1]}`, es: `${m[1]} aún en tu billetera`, fr: `${m[1]} encore dans votre portefeuille` })],
  [/^(Shielded|Unshielded) (\w+)$/, m => m[1] === 'Shielded' ? { zh: `已存入 ${m[2]}`, es: `${m[2]} protegido`, fr: `${m[2]} protégé` } : { zh: `已取出 ${m[2]}`, es: `${m[2]} retirado`, fr: `${m[2]} retiré` }],
  [/^Sent (\w+) to (0x\S+)$/, m => ({ zh: `已发送 ${m[1]} 至 ${m[2]}`, es: `${m[1]} enviado a ${m[2]}`, fr: `${m[1]} envoyé à ${m[2]}` })],
  [/^Sent (\w+)$/, m => ({ zh: `已发送 ${m[1]}`, es: `${m[1]} enviado`, fr: `${m[1]} envoyé` })],
  [/^Swapped (\w+) for (\w+)$/, m => ({ zh: `用 ${m[1]} 兑换了 ${m[2]}`, es: `${m[1]} intercambiado por ${m[2]}`, fr: `${m[1]} échangé contre ${m[2]}` })],
  [/^Bought basket: (.+)$/, m => ({ zh: `买入组合：${m[1]}`, es: `Cesta comprada: ${m[1]}`, fr: `Panier acheté : ${m[1]}` })],
  [/^Sold basket: (.+)$/, m => ({ zh: `卖出组合：${m[1]}`, es: `Cesta vendida: ${m[1]}`, fr: `Panier vendu : ${m[1]}` })],
  [/^Sold (\d+)% of (.+)$/, m => ({ zh: `卖出 ${m[2]} 的 ${m[1]}%`, es: `Vendido ${m[1]}% de ${m[2]}`, fr: `${m[1]} % de ${m[2]} vendu` })],
  [/^Sold (\d+)%\. The USDG is in your private balance\.$/, m => ({ zh: `已卖出 ${m[1]}%。USDG 已进入你的私密余额。`, es: `Vendido ${m[1]}%. El USDG está en tu saldo privado.`, fr: `${m[1]} % vendu. Les USDG sont dans votre solde privé.` })],
  [/^(Rebalanced|Rebalancing|Selling|Buying) (.+)$/, m => { const n = m[2], v = m[1]; return v === 'Rebalanced' ? { zh: `已再平衡 ${n}`, es: `${n} rebalanceada`, fr: `${n} rééquilibré` } : v === 'Rebalancing' ? { zh: `正在再平衡 ${n}`, es: `Rebalanceando ${n}`, fr: `Rééquilibrage de ${n}` } : v === 'Selling' ? { zh: `正在卖出 ${n}`, es: `Vendiendo ${n}`, fr: `Vente de ${n}` } : { zh: `正在买入 ${n}`, es: `Comprando ${n}`, fr: `Achat de ${n}` } }],
  [/^Paid (\d+) people\. Nobody saw who sent it\.$/, m => ({ zh: `已付款给 ${m[1]} 人。没人知道是谁发的。`, es: `Pagado a ${m[1]} personas. Nadie vio quién lo envió.`, fr: `${m[1]} personnes payées. Personne n’a vu qui a envoyé.` })],
  [/^Paid (\d+) people$/, m => ({ zh: `已付款给 ${m[1]} 人`, es: `Pagado a ${m[1]} personas`, fr: `${m[1]} personnes payées` })],
  [/^Claimed (\w+) · Ghost Address$/, m => ({ zh: `已领取 ${m[1]} · 幽灵地址`, es: `${m[1]} reclamado · Dirección fantasma`, fr: `${m[1]} réclamé · Adresse fantôme` })],
  [/^Paying (\d+) of (\d+) · (.+)$/, m => ({ zh: `正在付款 ${m[1]}/${m[2]} · ${tr(m[3], 'zh')}`, es: `Pagando ${m[1]} de ${m[2]} · ${tr(m[3], 'es')}`, fr: `Paiement ${m[1]} sur ${m[2]} · ${tr(m[3], 'fr')}` })],
  [/^(\d+) (m|min|h|d) ago$/, m => ({ zh: `${m[1]} ${m[2] === 'd' ? '天' : m[2] === 'h' ? '小时' : '分钟'}前`, es: `hace ${m[1]} ${m[2]}`, fr: `il y a ${m[1]} ${m[2] === 'd' ? 'j' : m[2]}` })],
  [/^(\d+) days ago$/, m => ({ zh: `${m[1]} 天前`, es: `hace ${m[1]} días`, fr: `il y a ${m[1]} jours` })],
  [/^Up to (\d+) people( at a time\.)?$/, m => ({ zh: `每次最多 ${m[1]} 人`, es: `Hasta ${m[1]} personas${m[2] ? ' a la vez.' : ''}`, fr: `Jusqu’à ${m[1]} personnes${m[2] ? ' à la fois.' : ''}` })],
  [/^Weights must total 100% \(now (\d+)%\)$/, m => ({ zh: `权重合计必须为 100%（当前 ${m[1]}%）`, es: `Los pesos deben sumar 100% (ahora ${m[1]}%)`, fr: `Les poids doivent totaliser 100 % (actuellement ${m[1]} %)` })],
  [/^Make a drop of ([\d.,]+) (\w+)$/, m => ({ zh: `发起 ${m[1]} ${m[2]} 的空投`, es: `Hacer un drop de ${m[1]} ${m[2]}`, fr: `Faire un drop de ${m[1]} ${m[2]}` })],
  [/^(\d+) of (\d+) slices of (\w+) left\. Each one is a random size\.$/, m => ({ zh: `${m[3]} 还剩 ${m[1]}/${m[2]} 份，每份金额随机。`, es: `Quedan ${m[1]} de ${m[2]} partes de ${m[3]}. Cada una es de tamaño aleatorio.`, fr: `Il reste ${m[1]} parts de ${m[3]} sur ${m[2]}. Chacune a une taille aléatoire.` })],
  [/^(\d+) of (\d+) slices left$/, m => ({ zh: `还剩 ${m[1]}/${m[2]} 份`, es: `Quedan ${m[1]} de ${m[2]} partes`, fr: `${m[1]} parts sur ${m[2]} restantes` })],
  [/^(\d+) random slices of ([\d.,]+) (\w+)\. Whoever opens the link first gets one\.$/, m => ({ zh: `${m[2]} ${m[3]} 拆成 ${m[1]} 份随机金额，先打开链接的人先得。`, es: `${m[1]} partes aleatorias de ${m[2]} ${m[3]}. Quien abra el enlace primero se lleva una.`, fr: `${m[1]} parts aléatoires de ${m[2]} ${m[3]}. Les premiers à ouvrir le lien en ont une.` })],
  [/^Made a drop · (\d+) slices$/, m => ({ zh: `发起空投 · ${m[1]} 份`, es: `Drop creado · ${m[1]} partes`, fr: `Drop créé · ${m[1]} parts` })],
  [/^Arrives as (\w+)$/, m => ({ zh: `到账为 ${m[1]}`, es: `Llega como ${m[1]}`, fr: `Arrive en ${m[1]}` })],
  [/^Claim as (\w+)$/, m => ({ zh: `领取为 ${m[1]}`, es: `Reclamar como ${m[1]}`, fr: `Réclamer en ${m[1]}` })],
  [/^Your Ghost Swap address\. Whatever is sent here arrives as (\w+)$/, m => ({ zh: `你的幽灵兑换地址。转到这里的资产都会以 ${m[1]} 到账`, es: `Tu dirección Ghost Swap. Lo que se envíe aquí llega como ${m[1]}`, fr: `Votre adresse Ghost Swap. Tout ce qui est envoyé ici arrive en ${m[1]}` })],
  [/^Ghost Swap · (\w+) to (\w+)$/, m => ({ zh: `幽灵兑换 · ${m[1]} 换成 ${m[2]}`, es: `Ghost Swap · ${m[1]} a ${m[2]}`, fr: `Ghost Swap · ${m[1]} en ${m[2]}` })],
  [/^Swapping it into (\w+) on the way in$/, m => ({ zh: `到账途中换成 ${m[1]}`, es: `Convirtiéndolo en ${m[1]} al entrar`, fr: `Conversion en ${m[1]} à l’arrivée` })],
  [/^Slice (\d+) of (\d+) · (.+)$/, m => ({ zh: `第 ${m[1]}/${m[2]} 份 · ${tr(m[3], 'zh')}`, es: `Parte ${m[1]} de ${m[2]} · ${tr(m[3], 'es')}`, fr: `Part ${m[1]} sur ${m[2]} · ${tr(m[3], 'fr')}` })],
  [/^Taking back (\d+) left · (.+)$/, m => ({ zh: `正在收回剩余 ${m[1]} 份 · ${tr(m[2], 'zh')}`, es: `Recuperando ${m[1]} restantes · ${tr(m[2], 'es')}`, fr: `Récupération des ${m[1]} restantes · ${tr(m[2], 'fr')}` })],
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

// One language for the whole site. The translator runs once at the root, so sign-in, the intro,
// sheets, toasts and the progress window all follow it; the switcher just changes it.
let current: Lang = load()
const subs = new Set<(l: Lang) => void>()
function setGlobal(l: Lang) { current = l; try { localStorage.setItem('hagi-lang', l) } catch { /* private mode */ } subs.forEach(f => f(l)) }
function useLang(): Lang {
  const [l, set] = useState(current)
  useEffect(() => { subs.add(set); return () => { subs.delete(set) } }, [])
  return l
}
/** Mount once at the root. Docs stays English. */
export function LangRoot({ off }: { off?: boolean }) { const l = useLang(); useLanding(off ? 'en' : l); return null }

export function LangSwitch() {
  const lang = useLang()
  const [open, setOpen] = useState(false)
  const pick = (l: Lang) => { setGlobal(l); setOpen(false) }
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
