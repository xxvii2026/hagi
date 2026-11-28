// The Oculus (oculus.hagitrade.xyz): a round window into HELL. Counts every $HAGI burned, live from the chain.
import { useEffect, useRef, useState } from 'react'
import { Mark } from '../ui'
import './oculus.css'

const SCAN = 'https://robin.etherscan.io'
const CA = '0x4643d8eaa4adc2ce361331b831ea6335742a29a1'
type Feed = { start: number; supply: number; burned: number; circulating: number; burns: { tx: string; amount: number; at: string }[]; at: number }

const full = (v: number) => Math.round(v).toLocaleString('en-US')
const day = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function useCount(target: number) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf = 0; const from = v, t0 = performance.now()
    const step = (t: number) => { const k = Math.min(1, (t - t0) / 2600); setV(from + (target - from) * (1 - Math.pow(1 - k, 4))); if (k < 1) raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf)
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps
  return v
}

// Looking down the pit: fire runs along the walls and falls toward a dark centre.
const FRAG = `precision highp float;uniform vec2 R;uniform float T;
float h(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float n(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*n(p);p=p*2.03+7.1;a*=.5;}return s;}
void main(){vec2 p=(gl_FragCoord.xy*2.-R)/min(R.x,R.y);float r=length(p),a=atan(p.y,p.x);
 float d=.42/(r+.07);vec3 q=vec3(cos(a)*1.7,sin(a)*1.7,d*1.3-T*.42);
 float w=fbm(q*1.5+vec3(0,0,T*.12));float f=fbm(q*1.25+w*1.1);float g=fbm(q*3.1-w*.7);
 float wall=smoothstep(.2,.7,r);
 f=smoothstep(.34,.82,f*.72+g*.28);f=f*f*(.35+.95*wall)+.16*smoothstep(.72,1.,r)*w;
 vec3 c=mix(vec3(.02,.014,.06),vec3(.3,.02,.07),smoothstep(.0,.2,f));
 c=mix(c,vec3(.86,.16,.04),smoothstep(.16,.5,f));c=mix(c,vec3(1.,.5,.1),smoothstep(.46,.8,f));c=mix(c,vec3(1.,.84,.5),smoothstep(.85,1.15,f));
 c+=vec3(.04,.05,.17)*(1.-wall)*(.4+.6*w);c*=smoothstep(.0,.3,r)*.6+.4;
 c*=1.-smoothstep(.88,1.,r)*.8;gl_FragColor=vec4(c,1.);}`

function Pit() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current!; const gl = cv.getContext('webgl', { antialias: false, alpha: false }); if (!gl) return
    const sh = (t: number, src: string) => { const s = gl.createShader(t)!; gl.shaderSource(s, src); gl.compileShader(s); return s }
    const pr = gl.createProgram()!
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}')); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(pr)
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return
    gl.useProgram(pr); cv.classList.add('on')
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const uR = gl.getUniformLocation(pr, 'R'), uT = gl.getUniformLocation(pr, 'T')
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0, seen = true
    const io = new IntersectionObserver(e => { seen = e[0].isIntersecting }); io.observe(cv)
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw); if (!seen) return
      const s = Math.round(cv.clientWidth * Math.min(1.25, devicePixelRatio || 1))
      if (cv.width !== s) { cv.width = cv.height = s; gl.viewport(0, 0, s, s) }
      gl.uniform2f(uR, s, s); gl.uniform1f(uT, still ? 3 : t / 1000); gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); io.disconnect() }
  }, [])
  return <canvas ref={ref} className="oc-pit" />
}

// Embers drifting up out of the window and across the page.
function Embers() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const cv = ref.current!, g = cv.getContext('2d')!
    const P = Array.from({ length: 70 }, () => ({ x: 0, y: 0, v: 0, s: 0, p: Math.random() * 6.28, l: Math.random() }))
    const spawn = (o: typeof P[0]) => { const a = Math.random() * 6.28, r = Math.random() * .3; o.x = .5 + Math.cos(a) * r * (cv.height / cv.width); o.y = .5 + Math.sin(a) * r * .5; o.v = .04 + Math.random() * .1; o.s = 1 + Math.random() * 2.4; o.l = 0 }
    P.forEach(o => { spawn(o); o.l = Math.random() })
    let raf = 0, last = performance.now()
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw)
      const w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== w) { cv.width = w; cv.height = h }
      const dt = Math.min(.05, (t - last) / 1000); last = t
      g.clearRect(0, 0, w, h); g.globalCompositeOperation = 'lighter'
      for (const o of P) {
        o.l += dt * .16; o.y -= o.v * dt; o.x += Math.sin(t / 900 + o.p) * .0004
        if (o.l > 1 || o.y < -.05) spawn(o)
        const al = Math.sin(Math.PI * o.l) * .9
        g.fillStyle = `rgba(255,${150 + Math.round(80 * (1 - o.l))},${70 + Math.round(60 * (1 - o.l))},${al})`
        g.beginPath(); g.arc(o.x * w, o.y * h, o.s, 0, 7); g.fill()
      }
    }
    raf = requestAnimationFrame(draw); return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={ref} className="oc-embers" />
}

export default function Oculus() {
  const [f, setF] = useState<Feed | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    document.title = 'The Oculus · Hagi'; document.body.style.background = '#05060f'; document.documentElement.style.overflowX = document.body.style.overflowX = 'hidden'
    const load = () => fetch('/api/hell').then(r => r.ok ? r.json() : Promise.reject()).then(j => { setF(j); setErr(false) }).catch(() => setErr(true))
    load(); const t = setInterval(load, 30000); return () => clearInterval(t)
  }, [])
  const burned = useCount(f?.burned ?? 0)
  const pct = f ? (f.burned / f.start) * 100 : 0
  const ring = f ? `${pct.toFixed(2)}% OF ALL $HAGI IS GONE  ✦  ${full(f.circulating)} REMAIN  ✦  WHAT FALLS IN NEVER COMES BACK  ✦  ` : 'WHAT FALLS IN NEVER COMES BACK  ✦  WHAT FALLS IN NEVER COMES BACK  ✦  '

  return (
    <div className="oc">
      <header><a href="https://hagitrade.xyz" className="oc-lg"><Mark leaf="#ffffff" block="#8f9fdc" size={26} />hagi</a><a className="oc-buy" href={`https://ponsfamily.com/launchpad/${CA}`} target="_blank" rel="noopener noreferrer">Buy $HAGI</a></header>

      <section className="oc-hero">
        <Embers />
        <div className="oc-rays" />
        <div className="oc-eye">
          <svg className="oc-ring" viewBox="0 0 1000 1000" aria-hidden="true"><defs><path id="oc-c" d="M500 500 m-468 0 a468 468 0 1 1 936 0 a468 468 0 1 1 -936 0" /></defs>
            <text><textPath href="#oc-c" textLength="2920" lengthAdjust="spacing">{ring}</textPath></text></svg>
          <div className="oc-rim"><Pit />
            <div className="oc-coin"><i><Mark leaf="#e9ecf7" block="#8f9fdc" size={34} /></i></div>
            <div className="oc-mid">
              <div className="oc-num">{f ? full(burned) : err ? '–' : ''}</div>
              <div className="oc-unit">$HAGI burned</div>
            </div>
          </div>
        </div>
        <h1>The Oculus</h1>
        <p>A window into HELL. Every $HAGI that falls in is gone for good.</p>
      </section>

      <section className="oc-fuse">
        <div className="oc-line"><i style={{ width: `${f ? Math.max(1.2, pct) : 0}%` }} /><b style={{ right: `${f ? Math.max(1.2, pct) : 0}%` }} /></div>
        <div className="oc-ends"><div><b>1,000,000,000</b><span>at launch</span></div><div><b>{f ? pct.toFixed(2) + '%' : '–'}</b><span>burned away</span></div></div>
      </section>

      <section className="oc-log">
        <h2>What fell in</h2>
        {f?.burns.map((b, i) => (
          <a className="oc-row" key={b.tx} href={`${SCAN}/tx/${b.tx}`} target="_blank" rel="noopener noreferrer" style={{ animationDelay: `${i * 80}ms` }}>
            <b>{full(b.amount)}</b><span>{b.at ? day(b.at) : ''}</span><em>View tx ↗</em></a>
        ))}
        {f && f.burns.length === 0 && <p className="oc-empty">The fire is lit. Each burn will be listed here.</p>}
        {err && <p className="oc-empty">Can’t reach Robinhood Chain right now. Trying again in a bit.</p>}
      </section>

      <footer>Read live from the $HAGI contract <a href={`${SCAN}/token/${CA}`} target="_blank" rel="noopener noreferrer">{CA.slice(0, 6)}…{CA.slice(-4)}</a></footer>
    </div>
  )
}
