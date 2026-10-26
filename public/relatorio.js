// Resultado final na página principal: conferências, mapa com zoom até as cidades, gráficos e
// compartilhamento. Dados: TSE (/api/tse) + malha municipal do IBGE (/api/ibge). Sem dependências.
import { UF_META, UF_PATHS } from './uf-paths.js';
import { CAND, nf, pf, norm, slug, parse, lead, marg, pct, total, alpha, checks, linkCities, cityStats, duelText } from './core.js';

const P = new URLSearchParams(location.search);
const ELE = /^\d+$/.test(P.get('ele') || '') ? P.get('ele') : '6258';
const E6 = 'e' + ELE.padStart(6, '0');
const T = `/api/tse/ele2026/${ELE}`;
const NS = 'http://www.w3.org/2000/svg';
const UFS = Object.keys(UF_META).filter((u) => u !== 'zz');
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fillOf = (r) => `var(--rc${lead(r)})`;

async function getJ(url, ms = 20000) {
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return { err: r.status === 404 ? 'arquivo ainda não publicado (404)' : `HTTP ${r.status}` };
    try { return { j: await r.json() }; } catch { return { err: 'resposta fora do formato JSON' }; }
  } catch (e) { return { err: e.name === 'AbortError' ? 'tempo esgotado' : 'sem conexão' }; } finally { clearTimeout(t); }
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

let nat = null; let st = {}; let cities = {}; let loading = {}; let cmP = null;
const cur = { uf: null, city: null };
const map = $('#map'), gC = document.createElementNS(NS, 'g');
gC.id = 'map-cities';
map.insertBefore(gC, $('#map-rings'));

// ---------- conferências + gráficos ----------
function msg(t) { const el = $('#data-msg'); if (el) { el.textContent = t; el.hidden = !t; } }
function renderChecks() {
  $('#checks').innerHTML = checks(nat, st, UFS.concat('zz')).map((c) => `<li class="${c.ok ? 'ok' : 'bad'}">${esc(c.text)}</li>`).join('');
}
const bar2 = (a, b) => `<div class="r-split"><i style="width:${a}%"></i><i style="width:${b}%"></i></div>`;
function renderCharts() {
  const rows = UFS.filter((u) => st[u] && total(st[u].v));
  const won = [0, 0]; rows.forEach((u) => won[lead(st[u].v)]++);
  const wp = pct(won);
  $('#won').innerHTML = `<div class="r-big"><span class="a">${won[0]}</span><span class="b">${won[1]}</span></div>${bar2(wp[0], wp[1])}<p class="r-muted">${CAND[0].short} × ${CAND[1].short}: estados e DF em que cada um ficou à frente.</p><div id="cwon"></div>`;
  renderCityWon();
  const n = nat;
  const part = [['Comparecimento', n.comp / n.te, '#22c55e'], ['Abstenção', n.abst / n.te, '#f59e0b'], ['Votos válidos', n.valid / n.tv, '#38bdf8'], ['Brancos', n.blank / n.tv, '#a78bfa'], ['Nulos', n.nul / n.tv, '#94a3b8']];
  $('#part').innerHTML = part.map(([l, p, c]) => `<div class="r-row"><span>${l}</span><div class="r-bar"><i style="width:${p * 100}%;background:${c}"></i></div><b>${pf(p * 100)}%</b></div>`).join('') +
    `<p class="r-muted">${nf.format(n.comp)} compareceram de ${nf.format(n.te)} eleitores aptos.</p>`;
  const sorted = rows.slice().sort((x, y) => (st[y].v[0] - st[y].v[1]) / total(st[y].v) - (st[x].v[0] - st[x].v[1]) / total(st[x].v));
  const mx = Math.max(...sorted.map((u) => marg(st[u].v)), 1);
  $('#margins').innerHTML = sorted.map((u) => { const m = marg(st[u].v), w = lead(st[u].v);
    return `<div class="r-mrow" data-uf="${u}" role="button" tabindex="0" aria-label="${UF_META[u].name}: ${CAND[w].short} por ${pf(m, 1)} pontos percentuais"><b>${u.toUpperCase()}</b><div class="dv"><i style="background:var(--rc${w});${w ? 'left:50%' : 'right:50%'};width:${(m / mx) * 50}%"></i></div><em>${pf(m, 1)}</em></div>`; }).join('');
  const regs = {};
  rows.forEach((u) => { const r = UF_META[u].reg; (regs[r] ||= [0, 0]); regs[r][0] += st[u].v[0]; regs[r][1] += st[u].v[1]; });
  if (st.zz) regs.Exterior = st.zz.v.slice();
  $('#regions').innerHTML = Object.entries(regs).map(([r, v]) => { const p = pct(v);
    return `<div class="r-reg"><b>${r}</b><div class="r-stack"><span style="width:${p[0]}%;background:var(--rc0)">${pf(p[0], 1)}%</span><span style="width:${p[1]}%;background:var(--rc1);justify-content:flex-end">${pf(p[1], 1)}%</span></div></div>`; }).join('');
}
function renderCityWon() {
  const el = $('#cwon'); if (!el) return;
  const t = [0, 0];
  Object.values(cities).forEach((l) => cityStats(l).won.forEach((x, i) => (t[i] += x)));
  const s = t[0] + t[1], p = pct(t);
  el.innerHTML = s ? `<div class="r-big sm"><span class="a">${nf.format(t[0])}</span><span class="b">${nf.format(t[1])}</span></div>${bar2(p[0], p[1])}<p class="r-muted">Cidades já carregadas no mapa (${nf.format(s)}). Toque em um estado para carregar as demais.</p>` : '<p class="r-muted">Toque em um estado no mapa para ver quantas cidades cada candidato venceu.</p>';
}

// ---------- zoom do mapa ----------
let vb = [0, 0, 640, 640], raf = 0;
function zoom(to, ms = 400) {
  cancelAnimationFrame(raf);
  const from = vb.slice(), t0 = performance.now(); if (reduced()) ms = 0;
  const step = (t) => {
    const k = ms ? Math.min(1, (t - t0) / ms) : 1, e = 1 - Math.pow(1 - k, 3);
    vb = from.map((x, i) => x + (to[i] - x) * e);
    map.setAttribute('viewBox', vb.map((x) => x.toFixed(2)).join(' '));
    if (k < 1) raf = requestAnimationFrame(step);
    else if (!map.classList.contains('map-zoomed')) map.classList.remove('map-clip');
  };
  map.classList.add('map-clip');
  raf = requestAnimationFrame(step);
}
const bbCache = {};
function ufBB(uf) { // caixa do estado em coordenadas do mapa principal
  if (bbCache[uf]) return bbCache[uf];
  const n = (UF_PATHS[uf].match(/-?\d+(?:\.\d+)?/g) || []).map(Number), b = [1e9, 1e9, -1e9, -1e9];
  for (let i = 0; i + 1 < n.length; i += 2) { b[0] = Math.min(b[0], n[i]); b[1] = Math.min(b[1], n[i + 1]); b[2] = Math.max(b[2], n[i]); b[3] = Math.max(b[3], n[i + 1]); }
  return (bbCache[uf] = b);
}
const square = (b, f = 1.12, add = 6, min = 0) => { const side = Math.max(Math.max(b[2] - b[0], b[3] - b[1]) * f + add, min), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2; return [cx - side / 2, cy - side / 2, side, side]; };

// ---------- cidades ----------
const MX = (lo) => ((lo * Math.PI) / 180 + 1.3) * 900;
const MY = (la) => (0.1 - Math.log(Math.tan(Math.PI / 4 + (la * Math.PI) / 360))) * 900;
function toPath(g, bb) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []; let d = '';
  for (const poly of polys) for (const ring of poly) {
    let px = 1e9, py = 1e9, f = true;
    for (const [lo, la] of ring) {
      const x = MX(lo), y = MY(la);
      if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (x > bb[2]) bb[2] = x; if (y > bb[3]) bb[3] = y;
      if (!f && Math.abs(x - px) < 0.3 && Math.abs(y - py) < 0.3) continue; // simplifica: descarta pontos colados
      d += (f ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1); f = false; px = x; py = y;
    }
    d += 'Z';
  }
  return d;
}
function prog(done, totalN, text) {
  const el = $('#city-prog'); if (!el) return;
  el.hidden = !text && done >= totalN;
  $('#city-prog-fill').style.width = (totalN ? (done / totalN) * 100 : 0) + '%';
  $('#city-prog-text').textContent = text || `Cidades: ${nf.format(done)} de ${nf.format(totalN)}`;
}
const getCM = () => (cmP ||= getJ(`${T}/config/mun-${E6}-cm.json`, 30000).then((r) => { if (r.err) cmP = null; return r; }));

function loadUF(uf, force = false) {
  if (loading[uf] && !force) return loading[uf];
  return (loading[uf] = (async () => {
    prog(0, 0, `Carregando mapa de cidades de ${UF_META[uf].name}…`);
    const id = UF_META[uf].ibge;
    const [g, n, c] = await Promise.all([getJ(`/api/ibge?t=malha&uf=${id}`, 40000), getJ(`/api/ibge?t=nomes&uf=${id}`, 40000), getCM()]);
    const fail = (t) => { msg(t); prog(0, 0, ''); delete loading[uf]; return false; };
    if (g.err) return fail(`Não consegui carregar a malha de cidades de ${UF_META[uf].name} (IBGE: ${g.err}). Toque no estado para tentar de novo.`);
    if (!Array.isArray(g.j?.features) || !g.j.features.length) return fail('A malha do IBGE veio em um formato inesperado.');
    if (c.err) return fail(`Não consegui carregar a lista de municípios do TSE (${c.err}).`);
    if (!Array.isArray(c.j?.abr)) { cmP = null; return fail('A lista de municípios do TSE veio em um formato inesperado.'); }
    const lk = linkCities(uf, c.j, n.j);
    if (!lk.total) return fail(`O TSE não listou municípios para ${uf.toUpperCase()}.`);
    if (lk.hit < lk.total * 0.9) msg(`Atenção: só ${lk.hit} de ${lk.total} cidades de ${uf.toUpperCase()} foram ligadas ao mapa.`); else msg('');
    const bb = [1e9, 1e9, -1e9, -1e9], g1 = document.createElementNS(NS, 'g'), list = [];
    g.j.features.forEach((f) => {
      const code = String(f.properties?.codarea || f.properties?.id || ''), el = document.createElementNS(NS, 'path');
      const cb = [1e9, 1e9, -1e9, -1e9], d = toPath(f.geometry || {}, cb);
      bb[0] = Math.min(bb[0], cb[0]); bb[1] = Math.min(bb[1], cb[1]); bb[2] = Math.max(bb[2], cb[2]); bb[3] = Math.max(bb[3], cb[3]);
      el.setAttribute('d', d); el.setAttribute('fill', 'var(--map-empty)'); el.dataset.i = list.length;
      g1.appendChild(el);
      list.push({ cb, code, name: lk.names[code] || 'Cidade', slug: slug(lk.names[code] || code), el, d, tse: lk.tse[code], r: null });
    });
    // alinha a malha do IBGE sobre a silhueta do estado no mapa principal (escala X/Y + deslocamento)
    const ub = ufBB(uf), sx = (ub[2] - ub[0]) / (bb[2] - bb[0]), sy = (ub[3] - ub[1]) / (bb[3] - bb[1]);
    const tf = { tx: (ub[0] + ub[2]) / 2 - sx * ((bb[0] + bb[2]) / 2), ty: (ub[1] + ub[3]) / 2 - sy * ((bb[1] + bb[3]) / 2), sx, sy };
    g1.setAttribute('transform', `translate(${((ub[0] + ub[2]) / 2 - sx * ((bb[0] + bb[2]) / 2)).toFixed(3)} ${((ub[1] + ub[3]) / 2 - sy * ((bb[1] + bb[3]) / 2)).toFixed(3)}) scale(${sx.toFixed(5)} ${sy.toFixed(5)})`);
    g1.dataset.u = uf;
    const sel = document.createElementNS(NS, 'path'); sel.setAttribute('class', 'city-sel'); g1.appendChild(sel);
    gC.querySelector(`g[data-u="${uf}"]`)?.remove(); gC.appendChild(g1);
    g1.style.display = cur.uf === uf ? '' : 'none';
    list.bb = bb; list.sel = sel; list.tf = tf; cities[uf] = list;
    const todo = list.filter((x) => x.tse), key = `r26:${ELE}:${uf}`; let cache = null;
    if (!force) { try { cache = JSON.parse(localStorage.getItem(key) || 'null'); } catch { /* sem cache */ } }
    let done = 0; const out = {}; let bad = 0;
    todo.forEach((x) => { const r = cache?.[x.code]; if (r) { x.r = r; x.el.setAttribute('fill', fillOf(r)); x.el.setAttribute('fill-opacity', alpha(marg(r))); done++; } });
    prog(done, todo.length);
    await pool(todo.filter((x) => !x.r), 12, async (x) => {
      const r = await getJ(`${T}/dados/${uf}/${uf}${x.tse}-c0001-${E6}-u.json`);
      const p = r.j ? parse(r.j) : null;
      if (p && total(p.v)) { x.r = p.v; x.el.setAttribute('fill', fillOf(p.v)); x.el.setAttribute('fill-opacity', alpha(marg(p.v))); } else bad++;
      done++; if (done % 8 === 0 || done === todo.length) { prog(done, todo.length); }
    });
    prog(done, todo.length);
    list.forEach((x) => { if (x.r) out[x.code] = x.r; });
    if (bad) msg(`${bad} cidade(s) de ${uf.toUpperCase()} sem resultado disponível no TSE agora.`);
    else if (nat?.final && !cache) { try { localStorage.setItem(key, JSON.stringify(out)); } catch { /* cota cheia */ } }
    renderCityWon(); renderCard(); fltList();
    return true;
  })());
}

// ---------- navegação (hash) ----------
function parseHash() {
  const p = location.hash.replace(/^#/, '').toLowerCase().split('/').filter(Boolean);
  if (p[0] === 'gov') return { role: 'gov' };
  if (p[0] === 'pres') p.shift();
  let uf = p[0] || null, city = p[1] || null;
  const m = /^([a-z]{2})-(.+)$/.exec(uf || ''); // formato curto: #sp-sao-paulo
  if (m && UF_META[m[1]]) { uf = m[1]; city = m[2]; }
  if (uf && !UFS.includes(uf)) uf = null;
  return { role: 'pres', uf, city: uf ? city : null };
}
function go(uf, city, replace) {
  const h = '#pres' + (uf ? '/' + uf : '') + (city ? '/' + city : '');
  if (location.hash === h) return;
  const s = { app: 1, role: 'pres', uf: uf || null, pushed: !replace && Boolean(uf) };
  history[replace ? 'replaceState' : 'pushState'](s, '', location.pathname + location.search + h);
  window.dispatchEvent(new PopStateEvent('popstate', { state: s }));
}
function mark() { document.querySelectorAll('#uf-chips button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.k || '') === (cur.uf || '')))); }
function showLayer(uf) { gC.querySelectorAll('g[data-u]').forEach((g) => { g.style.display = g.dataset.u === uf ? '' : 'none'; }); }

async function sync() {
  const r = parseHash();
  if (r.role === 'gov' || !r.uf) { if (cur.uf) resetView(); return; }
  if (r.uf !== cur.uf) { await showUF(r.uf, r.city); return; }
  if (r.city !== cur.city) pickCity(r.city);
}
function resetView() {
  cur.uf = null; cur.city = null; mark();
  map.classList.remove('map-zoomed'); document.body.classList.remove('has-zoom');
  $('#btn-back').hidden = true; $('#city-card').hidden = true; prog(1, 1, '');
  zoom([0, 0, 640, 640]);
  setTimeout(() => { if (!cur.uf) showLayer(null); }, 420);
  document.querySelectorAll('#map-paths .uf-shape').forEach((p) => p.classList.remove('city-zoom'));
}
async function showUF(uf, citySlug) {
  cur.uf = uf; cur.city = null; mark();
  map.classList.add('map-zoomed'); document.body.classList.add('has-zoom');
  $('#btn-back').hidden = false;
  document.querySelectorAll('#map-paths .uf-shape').forEach((p) => p.classList.toggle('city-zoom', p.dataset.uf === uf));
  showLayer(uf); zoom(square(ufBB(uf))); renderCard();
  const ok = await loadUF(uf);
  if (cur.uf !== uf) return;
  showLayer(uf);
  if (ok && citySlug) pickCity(citySlug); else renderCard();
}
function pickCity(citySlug) {
  const list = cities[cur.uf]; if (!list) return;
  const c = citySlug && list.find((x) => x.slug === citySlug);
  cur.city = c ? c.slug : null;
  list.sel.setAttribute('d', c ? c.d : '');
  if (c) { const { tx, ty, sx, sy } = list.tf; zoom(square([tx + sx * c.cb[0], ty + sy * c.cb[1], tx + sx * c.cb[2], ty + sy * c.cb[3]], 2.6, 4, 14)); }
  else zoom(square(ufBB(cur.uf)));
  renderCard();
}

// ---------- cartão do estado / cidade ----------
function bars(v) {
  const p = pct(v);
  return [0, 1].map((i) => `<div class="r-row"><b style="color:var(--rc${i})">${CAND[i].short}</b><div class="r-bar"><i style="width:${p[i]}%;background:var(--rc${i})"></i></div><span>${pf(p[i])}% · ${nf.format(v[i])}</span></div>`).join('');
}
function renderCard() {
  const el = $('#city-card'), uf = cur.uf;
  if (!uf) { el.hidden = true; return; }
  const list = cities[uf], r = st[uf], c = list && cur.city ? list.find((x) => x.slug === cur.city) : null;
  let h = '';
  if (c) {
    h = `<h3>${esc(c.name)} · ${uf.toUpperCase()}</h3>` + (c.r ? `${bars(c.r)}<p class="r-muted">${CAND[lead(c.r)].n} venceu por ${pf(marg(c.r))} p.p. (${nf.format(Math.abs(c.r[0] - c.r[1]))} votos de diferença)</p>` : '<p class="r-muted">Resultado desta cidade indisponível.</p>');
  } else if (r) {
    const cs = list ? cityStats(list) : null;
    h = `<h3>${UF_META[uf].name}</h3>${bars(r.v)}<p class="r-muted">${CAND[lead(r.v)].n} venceu por ${pf(marg(r.v))} p.p.${cs?.n ? ` · Cidades: ${nf.format(cs.won[0])} × ${nf.format(cs.won[1])}` : ''}</p><p class="r-muted">Toque em uma cidade no mapa ou escolha abaixo.</p>`;
  } else h = `<h3>${UF_META[uf].name}</h3><p class="r-muted">Resultado do estado indisponível.</p>`;
  if (list) h += `<label class="r-sel">Cidade <select id="city-select"><option value="">Escolher…</option>${list.filter((x) => x.r).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map((x) => `<option value="${x.slug}"${x.slug === cur.city ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>`;
  h += `<div class="r-btns"><button type="button" class="r-btn" data-share="${c ? 'city' : 'uf'}">Compartilhar ${c ? 'esta cidade' : 'este estado'}</button></div>`;
  el.innerHTML = h; el.hidden = false;
}

// ---------- eventos do mapa e dos controles ----------
gC.addEventListener('click', (e) => {
  const p = e.target.closest('path[data-i]'); if (!p) return;
  const c = cities[p.parentNode.dataset.u]?.[+p.dataset.i]; if (c) go(cur.uf, c.slug, Boolean(cur.city));
});
$('#city-card').addEventListener('change', (e) => { if (e.target.id === 'city-select') go(cur.uf, e.target.value || null, Boolean(cur.city)); });
$('#btn-back').addEventListener('click', () => go(null, null, true));
$('#uf-chips').addEventListener('click', (e) => { const k = e.target.dataset?.k; if (k === undefined) return; if (k === '') go(null, null, true); else go(k, null, Boolean(cur.uf)); });
const marginGo = (e) => { const u = e.target.closest('.r-mrow')?.dataset.uf; if (u) { go(u, null, Boolean(cur.uf)); $('#map-viewport').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' }); } };
$('#margins').addEventListener('click', marginGo);
$('#margins').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); marginGo(e); } });
$('#uf-chips').innerHTML = `<button type="button" data-k="" aria-pressed="true">Brasil</button>` + UFS.map((u) => `<button type="button" data-k="${u}" aria-pressed="false" aria-label="${UF_META[u].name}">${u.toUpperCase()}</button>`).join('');
window.addEventListener('popstate', sync);
window.addEventListener('hashchange', sync);
window.addEventListener('apuracao:rota', sync);

// ---------- filtro: estado -> cidade -> zoom ----------
const flt = { step: 'uf', uf: null };
function fltBuild() {
  const p = $('#filter-panel');
  p.innerHTML = `<div class="flt-head">${flt.step === 'city' ? '<button type="button" class="r-btn" data-f="back">← Estados</button>' : ''}<strong>${flt.step === 'city' ? esc(UF_META[flt.uf].name) + ': escolha a cidade' : 'Escolha o estado'}</strong><button type="button" class="sh-x" data-f="close" aria-label="Fechar filtro">✕</button></div>
  <label class="r-sel">Buscar <input id="flt-q" type="search" autocomplete="off" placeholder="${flt.step === 'city' ? 'Nome da cidade' : 'Nome ou sigla do estado'}"></label><div class="flt-list" id="flt-list"></div>`;
  fltList();
}
function fltList() {
  const el = $('#flt-list'); if (!el || $('#filter-panel').hidden) return;
  const q = norm($('#flt-q').value), none = '<p class="r-muted">Nada encontrado.</p>';
  if (flt.step === 'uf') { el.innerHTML = UFS.filter((u) => !q || norm(UF_META[u].name + u).includes(q)).map((u) => `<button type="button" data-f="uf:${u}">${esc(UF_META[u].name)} <small>${u.toUpperCase()}</small></button>`).join('') || none; return; }
  const list = cities[flt.uf]; if (!list) { el.innerHTML = '<p class="r-muted">Carregando as cidades…</p>'; return; }
  const rows = list.filter((c) => !q || norm(c.name).includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  el.innerHTML = rows.slice(0, 300).map((c) => `<button type="button" data-f="city:${c.slug}">${esc(c.name)}</button>`).join('') + (rows.length > 300 ? '<p class="r-muted">Mostrando 300: use a busca para achar as outras.</p>' : '') || none;
}
function fltToggle(open) {
  const p = $('#filter-panel'), b = $('#btn-filter'); p.hidden = !open; b.setAttribute('aria-expanded', String(open));
  if (open) { flt.step = cur.uf ? 'city' : 'uf'; flt.uf = cur.uf; fltBuild(); $('#flt-q').focus(); } else b.focus();
}
$('#btn-filter').addEventListener('click', () => fltToggle($('#filter-panel').hidden));
$('#filter-panel').addEventListener('input', fltList);
$('#filter-panel').addEventListener('keydown', (e) => { if (e.key === 'Escape') fltToggle(false); });
$('#filter-panel').addEventListener('click', (e) => {
  const [k, v] = (e.target.closest('[data-f]')?.dataset.f || '').split(':'); if (!k) return;
  if (k === 'close') fltToggle(false);
  else if (k === 'back') { flt.step = 'uf'; fltBuild(); }
  else if (k === 'uf') { flt.step = 'city'; flt.uf = v; fltBuild(); go(v, null, Boolean(cur.uf)); $('#flt-q').focus(); }
  else if (k === 'city') { go(flt.uf, v, Boolean(cur.city)); fltToggle(false); $('#map-viewport').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' }); }
});

// ---------- compartilhamento ----------
const SCOPES = { br: 'Brasil completo', uf: 'Este estado por completo', city: 'Esta cidade', map: 'Só o mapa' };
const TOGS = { br: ['res', 'map', 'reg', 'part', 'city'], uf: ['res', 'map', 'city'], city: ['res', 'map'], map: [] };
const TOG_L = { res: 'Resultado', map: 'Mapa', reg: 'Regiões', part: 'Participação', city: 'Cidades' };
const sh = { scope: 'br', tog: { res: true, map: true, reg: true, part: true, city: true }, cv: null, text: '', link: '', last: null };
const curCity = () => (cur.uf && cur.city ? cities[cur.uf]?.find((x) => x.slug === cur.city) : null);
const origin = () => location.origin;
function scopeOk(s) { return s === 'br' || s === 'map' || (s === 'uf' && cur.uf && st[cur.uf]) || (s === 'city' && curCity()?.r); }
function linkFor(scope) {
  if (scope === 'city' && curCity()) return `${origin()}/#pres/${cur.uf}/${cur.city}`;
  if ((scope === 'uf' || scope === 'map') && cur.uf) return `${origin()}/#pres/${cur.uf}`;
  return `${origin()}/#pres`;
}
function textFor(scope) {
  const f = nat.final, t = sh.tog;
  const link = linkFor(scope);
  const tail = ['', `Fonte: TSE · ${link}`];
  if (scope === 'city') { const c = curCity(); return duelText(`${c.name} (${cur.uf.toUpperCase()}) — 2º turno 2026`, c.r, f, tail); }
  if (scope === 'uf') {
    const cs = cities[cur.uf] ? cityStats(cities[cur.uf]) : null;
    const ex = cs?.n ? ['', `Cidades vencidas: ${CAND[0].short} ${nf.format(cs.won[0])} × ${nf.format(cs.won[1])} ${CAND[1].short}`] : [];
    return duelText(`${UF_META[cur.uf].name} — 2º turno 2026`, st[cur.uf].v, f, ex.concat(tail));
  }
  if (scope === 'map') return `🗳️ Mapa do 2º turno 2026${cur.uf ? ' — ' + UF_META[cur.uf].name : ''} (TSE)\n${link}`;
  const won = [0, 0]; UFS.forEach((u) => st[u] && total(st[u].v) && won[lead(st[u].v)]++);
  const ex = [];
  if (t.map) ex.push('', `Estados vencidos: ${CAND[0].short} ${won[0]} × ${won[1]} ${CAND[1].short}`);
  if (t.part) ex.push('', `Comparecimento: ${pf((nat.comp / nat.te) * 100)}% · Abstenção: ${pf((nat.abst / nat.te) * 100)}%`, `Brancos: ${pf((nat.blank / nat.tv) * 100)}% · Nulos: ${pf((nat.nul / nat.tv) * 100)}%`);
  return duelText(`Resultado ${f ? 'final' : 'parcial'} do 2º turno 2026 (TSE)`, nat.v, f, ex.concat(tail));
}

const imgs = {};
const loadImg = (src) => (imgs[src] ||= new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; }));
const DARK = ['#ef3340', '#3b82f6'];

async function drawCanvas(scope, t) {
  await document.fonts?.ready;
  const photos = await Promise.all(CAND.map((c) => loadImg(c.photo)));
  const W = 1080, pad = 60, cv = document.createElement('canvas'); cv.width = W; cv.height = 4600; const x = cv.getContext('2d');
  const F = (w, z) => `${w} ${z}px Geist, system-ui, sans-serif`;
  const tx = (s, X, Y, z, w, col, al = 'left') => { x.font = F(w, z); x.fillStyle = col; x.textAlign = al; x.fillText(s, X, Y); };
  const INK = '#f5f7fa', MUT = '#8a92a4';
  x.fillStyle = '#0b0d11'; x.fillRect(0, 0, W, 4600);
  [[0, DARK[0]], [W, DARK[1]]].forEach(([X, col]) => { const g = x.createRadialGradient(X, 0, 0, X, 0, 720); g.addColorStop(0, col + '4d'); g.addColorStop(1, 'transparent'); x.fillStyle = g; x.fillRect(0, 0, W, 820); });
  const bar = (Y, p0, h = 18) => { x.save(); x.beginPath(); x.roundRect(pad, Y, W - 2 * pad, h, h / 2); x.clip(); x.fillStyle = DARK[0]; x.fillRect(pad, Y, (W - 2 * pad) * p0, h); x.fillStyle = DARK[1]; x.fillRect(pad + (W - 2 * pad) * p0, Y, (W - 2 * pad) * (1 - p0), h); x.restore(); };
  const where = scope === 'city' ? `${curCity().name} · ${cur.uf.toUpperCase()}` : (scope === 'uf' || (scope === 'map' && cur.uf)) ? UF_META[cur.uf].name : 'Brasil';
  let y = 100; tx(`${nat.final ? 'RESULTADO FINAL' : 'RESULTADO PARCIAL'} · 2º TURNO 2026`, pad, y, 26, 600, MUT);
  const fit = (str, w, z, maxW) => { x.font = F(w, z); const m = x.measureText(str).width; return m > maxW ? Math.max(12, Math.floor((z * maxW) / m)) : z; };
  const txf = (str, X, Y, z, w, col, al, maxW) => tx(str, X, Y, fit(str, w, z, maxW), w, col, al);
  const ell = (str, z, w, maxW) => { x.font = F(w, z); if (x.measureText(str).width <= maxW) return str; let t = str; while (t.length > 1 && x.measureText(t + '…').width > maxW) t = t.slice(0, -1); return t.trimEnd() + '…'; };
  const duel = (v, head) => {
    const p = pct(v), w = lead(v), colW = (W - 2 * pad) / 2 - 24, cxs = [pad + colW / 2, W - pad - colW / 2];
    y += 70; txf(head, pad, y, 52, 700, INK, 'left', W - 2 * pad);
    y += 40; const cy = y + 100;
    [0, 1].forEach((i) => { const cx = cxs[i];
      x.save(); x.beginPath(); x.arc(cx, cy, 96, 0, Math.PI * 2); x.clip(); x.fillStyle = '#1a1e29'; x.fillRect(cx - 96, cy - 96, 192, 192);
      const im = photos[i]; if (im) { const s = Math.max(192 / im.width, 192 / im.height); x.drawImage(im, cx - (im.width * s) / 2, cy - 96 - (im.height * s - 192) * 0.1, im.width * s, im.height * s); }
      x.restore(); x.beginPath(); x.arc(cx, cy, 98, 0, Math.PI * 2); x.lineWidth = 6; x.strokeStyle = DARK[i]; x.stroke(); });
    y = cy + 98 + 112; [0, 1].forEach((i) => txf(pf(p[i]) + '%', cxs[i], y, 96, 700, DARK[i], 'center', colW));
    y += 50; [0, 1].forEach((i) => txf(CAND[i].n, cxs[i], y, 32, 600, INK, 'center', colW));
    y += 42; [0, 1].forEach((i) => txf(nf.format(v[i]) + ' votos', cxs[i], y, 28, 400, MUT, 'center', colW));
    y += 34; bar(y, p[0] / 100); y += 70; txf(`${CAND[w].n} ${nat.final || scope !== 'br' ? 'venceu' : 'lidera'} por ${pf(marg(v))} p.p. (${nf.format(Math.abs(v[0] - v[1]))} votos)`, pad, y, 30, 500, INK, 'left', W - 2 * pad);
  };
  const ufMap = (list, bb, hi, boxW, boxH) => { // desenha a malha de cidades do estado
    const s = Math.min(boxW / (bb[2] - bb[0]), boxH / (bb[3] - bb[1])), ox = (W - (bb[2] - bb[0]) * s) / 2, oy = y;
    x.save(); x.translate(ox - bb[0] * s, oy - bb[1] * s); x.scale(s, s);
    list.forEach((c) => { const p = new Path2D(c.d); x.globalAlpha = c.r && total(c.r) ? alpha(marg(c.r)) : 1; x.fillStyle = c.r && total(c.r) ? DARK[lead(c.r)] : '#1a1e29'; x.fill(p); x.globalAlpha = 1; x.lineWidth = 0.5 / s; x.strokeStyle = '#0b0d11'; x.stroke(p); });
    if (hi) { x.lineWidth = 4 / s; x.strokeStyle = '#fff'; x.stroke(new Path2D(hi.d)); }
    x.restore(); y += (bb[3] - bb[1]) * s;
  };
  const brMap = (size) => { const S = size / 640, ox = (W - size) / 2; x.save(); x.translate(ox, y); x.scale(S, S);
    UFS.forEach((u) => { const r = st[u], ok = r && total(r.v); x.globalAlpha = ok ? alpha(marg(r.v)) : 1; x.fillStyle = ok ? DARK[lead(r.v)] : '#1a1e29'; const p = new Path2D(UF_PATHS[u]); x.fill(p); x.globalAlpha = 1; x.strokeStyle = '#0b0d11'; x.lineWidth = 1.2; x.stroke(p); });
    x.restore(); y += size; };
  const legend = () => { y += 40; tx(CAND[0].short + '  ◀  mais forte = maior vantagem  ▶  ' + CAND[1].short, W / 2, y, 22, 400, MUT, 'center'); };

  if (scope === 'map') {
    y += 30; txf(where, pad, y + 40, 40, 700, INK, 'left', W - 2 * pad); y += 70;
    if (cur.uf && cities[cur.uf]) ufMap(cities[cur.uf], cities[cur.uf].bb, null, W - 2 * pad, 1300); else brMap(W - 2 * pad);
    legend();
  } else if (scope === 'city') {
    const c = curCity(); duel(c.r, c.name + ' · ' + cur.uf.toUpperCase());
    if (t.map && cities[cur.uf]) { y += 50; ufMap(cities[cur.uf], cities[cur.uf].bb, c, 760, 760); }
  } else if (scope === 'uf') {
    const list = cities[cur.uf], cs = list ? cityStats(list) : null;
    if (t.res) duel(st[cur.uf].v, UF_META[cur.uf].name);
    if (t.map && list) { y += 50; ufMap(list, list.bb, null, 780, 780); legend(); }
    if (t.city && cs?.n) {
      y += 80; tx('Cidades vencidas', pad, y, 34, 700, INK);
      y += 70; tx(nf.format(cs.won[0]), pad, y, 64, 700, DARK[0]); tx(nf.format(cs.won[1]), W - pad, y, 64, 700, DARK[1], 'right');
      y += 34; bar(y, cs.won[0] / cs.n);
      y += 60; tx('Maiores vantagens', pad, y, 28, 600, MUT);
      for (let k = 0; k < 5; k++) { y += 46; [0, 1].forEach((i) => { const c = cs.top[i][k]; if (!c) return; const v = `+${pf(marg(c.r), 1)}`;
        if (i) { tx(v, W - pad, y, 26, 600, DARK[1], 'right'); tx(ell(c.name, 26, 400, 360), W - pad - 120, y, 26, 400, INK, 'right'); } else { tx(ell(c.name, 26, 400, 380), pad, y, 26, 400, INK); tx(v, pad + 480, y, 26, 600, DARK[0], 'right'); } }); }
    }
  } else {
    if (t.res) duel(nat.v, `${CAND[lead(nat.v)].n} ${nat.final ? 'é o presidente eleito' : 'lidera a apuração'}`);
    if (t.map) { y += 60; brMap(760); y += 30; const won = [0, 0]; UFS.forEach((u) => st[u] && total(st[u].v) && won[lead(st[u].v)]++); tx(`Estados: ${won[0]} × ${won[1]}`, W / 2, y, 34, 700, INK, 'center'); }
    if (t.city) { const tl = [0, 0]; Object.values(cities).forEach((l) => cityStats(l).won.forEach((n, i) => (tl[i] += n))); if (tl[0] + tl[1]) { y += 70; tx(`Cidades já carregadas: ${nf.format(tl[0])} × ${nf.format(tl[1])}`, W / 2, y, 28, 500, MUT, 'center'); } }
    if (t.reg) {
      y += 80; tx('Por região', pad, y, 34, 700, INK); const regs = {};
      UFS.forEach((u) => { const r = UF_META[u].reg; (regs[r] ||= [0, 0]); regs[r][0] += st[u]?.v[0] || 0; regs[r][1] += st[u]?.v[1] || 0; });
      Object.entries(regs).forEach(([r, v]) => { const p = pct(v); y += 58; tx(r, pad, y, 26, 500, MUT); tx(`${pf(p[0], 1)}%  ×  ${pf(p[1], 1)}%`, W - pad, y, 26, 600, INK, 'right'); y += 14; bar(y, p[0] / 100, 14); y += 14; });
    }
    if (t.part) {
      y += 80; tx('Participação', pad, y, 34, 700, INK);
      [['Comparecimento', nat.comp / nat.te], ['Abstenção', nat.abst / nat.te], ['Brancos', nat.blank / nat.tv], ['Nulos', nat.nul / nat.tv]].forEach(([l, p]) => { y += 52; tx(l, pad, y, 28, 400, MUT); tx(pf(p * 100) + '%', W - pad, y, 28, 600, INK, 'right'); });
    }
  }
  y += 90; tx(`Fonte: TSE · ${nat.dt} ${nat.ht}`.trim(), W / 2, y, 22, 400, MUT, 'center');
  y += 34; tx('Resultado oficial: TSE · malha municipal: IBGE', W / 2, y, 20, 400, MUT, 'center');
  y += 34; txf('Layout e site por @surubimjulio · instagram.com/surubimjulio', W / 2, y, 22, 600, INK, 'center', W - 2 * pad); y += 50;
  const out = document.createElement('canvas'); out.width = W; out.height = y; out.getContext('2d').drawImage(cv, 0, 0, W, y, 0, 0, W, y); return out;
}

let shBuilt = false, shFocus = null, shSeq = 0;
function buildSheet() {
  if (shBuilt) return; shBuilt = true;
  const d = document.createElement('div'); d.id = 'sheet'; d.hidden = true;
  d.innerHTML = `<div class="sh-bg" data-close></div><div class="sh-box" role="dialog" aria-modal="true" aria-labelledby="sh-t" tabindex="-1">
  <header><h2 id="sh-t">Compartilhar</h2><button type="button" class="sh-x" data-close aria-label="Fechar">✕</button></header>
  <div class="sh-scope" role="radiogroup" aria-label="O que compartilhar"></div>
  <div class="sh-tog" id="sh-tog" aria-label="O que entra na imagem"></div>
  <div class="sh-prev"><canvas id="sh-cv" aria-label="Prévia da imagem a compartilhar" role="img"></canvas><p id="sh-msg" role="status"></p></div>
  <div class="sh-act">
   <button type="button" class="r-btn primary" id="sh-share">Compartilhar</button><button type="button" class="r-btn" id="sh-dl">Baixar PNG</button><button type="button" class="r-btn" id="sh-copy">Copiar texto</button>
   <a class="r-btn" data-net="whatsapp" target="_blank" rel="noopener noreferrer">WhatsApp</a><a class="r-btn" data-net="x" target="_blank" rel="noopener noreferrer">X</a><a class="r-btn" data-net="facebook" target="_blank" rel="noopener noreferrer">Facebook</a><a class="r-btn" data-net="telegram" target="_blank" rel="noopener noreferrer">Telegram</a>
  </div><pre class="sh-txt" id="sh-txt"></pre></div>`;
  document.body.appendChild(d);
  d.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeSheet();
    const r = e.target.closest('[role=radio]'); if (r && !r.disabled) { sh.scope = r.dataset.s; paintSheet(); }
  });
  d.addEventListener('change', (e) => { const k = e.target.dataset?.t; if (k) { sh.tog[k] = e.target.checked; regen(); } });
  d.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeSheet(); return; }
    if (e.key !== 'Tab') return;
    const f = [...d.querySelectorAll('button:not([disabled]),a[href],input,[role=radio]:not([disabled])')].filter((n) => n.offsetParent);
    if (!f.length) return; const a = f[0], z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  });
  $('#sh-dl').addEventListener('click', async () => { const c = await ensureCv(); if (!c) return; const a = document.createElement('a'); a.download = `resultado-${sh.scope}-2turno-2026.png`; a.href = c.toDataURL('image/png'); a.click(); });
  $('#sh-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(sh.text + ''); shMsg('Texto copiado.'); } catch { shMsg('Não consegui copiar. Selecione o texto abaixo.'); } });
  $('#sh-share').addEventListener('click', async () => {
    const c = await ensureCv(); if (!c) return;
    try {
      const blob = await new Promise((r) => c.toBlob(r, 'image/png')), file = new File([blob], 'resultado-2turno-2026.png', { type: 'image/png' });
      const data = { title: 'Resultado do 2º turno 2026', text: sh.text };
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ ...data, files: [file] });
      else if (navigator.share) { await navigator.share({ ...data, url: sh.link }); shMsg('Seu navegador não envia imagem direto: use "Baixar PNG" e anexe.'); }
      else { await navigator.clipboard.writeText(sh.text); shMsg('Compartilhamento direto indisponível. Texto copiado; use "Baixar PNG" para a imagem.'); }
    } catch (e) { if (e.name !== 'AbortError') shMsg('Não foi possível compartilhar agora.'); }
  });
}
const shMsg = (s) => { $('#sh-msg').textContent = s; };
function netLinks() {
  const t = encodeURIComponent(sh.text), u = encodeURIComponent(sh.link);
  const H = { whatsapp: `https://wa.me/?text=${t}`, x: `https://x.com/intent/tweet?text=${t}`, facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`, telegram: `https://t.me/share/url?url=${u}&text=${t}` };
  document.querySelectorAll('#sheet a[data-net]').forEach((a) => { a.href = H[a.dataset.net]; });
}
function paintSheet() {
  if (!scopeOk(sh.scope)) sh.scope = 'br';
  $('#sheet .sh-scope').innerHTML = Object.entries(SCOPES).map(([k, l]) => `<button type="button" role="radio" data-s="${k}" aria-checked="${k === sh.scope}" ${scopeOk(k) ? '' : 'disabled'} tabindex="${k === sh.scope ? 0 : -1}">${l}</button>`).join('');
  $('#sh-tog').innerHTML = TOGS[sh.scope].map((k) => `<label><input type="checkbox" data-t="${k}" ${sh.tog[k] ? 'checked' : ''}><span>${k === 'city' && sh.scope === 'uf' ? 'Cidades (contagem e maiores vantagens)' : TOG_L[k]}</span></label>`).join('');
  $('#sh-tog').hidden = !TOGS[sh.scope].length;
  regen();
}
async function ensureCv() { if (!sh.cv) await regen(); return sh.cv; }
async function regen() {
  const my = ++shSeq; sh.cv = null; shMsg('Gerando a prévia…');
  try {
    if (sh.scope === 'uf' && cur.uf && !cities[cur.uf]) { shMsg('Carregando as cidades do estado…'); await loadUF(cur.uf); }
    if (my !== shSeq) return;
    if (!scopeOk(sh.scope)) { sh.scope = 'br'; }
    sh.link = linkFor(sh.scope); sh.text = textFor(sh.scope);
    const c = await drawCanvas(sh.scope, sh.tog); if (my !== shSeq) return;
    const v = $('#sh-cv'); v.width = c.width; v.height = c.height; v.getContext('2d').drawImage(c, 0, 0);
    sh.cv = v; $('#sh-txt').textContent = sh.text; netLinks();
    shMsg('Prévia pronta. Você decide se compartilha, baixa ou ignora.');
  } catch (e) { shMsg('Não consegui gerar a imagem neste navegador.'); }
}
function openSheet(scope) {
  if (!nat) return;
  buildSheet();
  sh.scope = scopeOk(scope) ? scope : 'br';
  shFocus = document.activeElement; $('#sheet').hidden = false; document.body.classList.add('sheet-open');
  paintSheet(); $('#sheet .sh-box').focus();
}
function closeSheet() { $('#sheet').hidden = true; document.body.classList.remove('sheet-open'); shFocus?.focus?.(); }
const ctxScope = () => (curCity()?.r ? 'city' : cur.uf ? 'uf' : 'br');
// o botão Compartilhar do topo agora abre este menu (captura antes do menu antigo)
$('#btn-share-main')?.addEventListener('click', (e) => { e.stopImmediatePropagation(); e.preventDefault(); openSheet(ctxScope()); }, true);
document.addEventListener('click', (e) => { const b = e.target.closest('[data-share]'); if (b) openSheet(b.dataset.share); });

// ---------- inicialização ----------
async function loadAll() {
  msg('Carregando o resultado do TSE…');
  const keys = UFS.concat('zz'); const miss = [];
  const [br] = await Promise.all([getJ(`${T}/dados/br/br-c0001-${E6}-u.json`),
    pool(keys, 8, async (u) => { const r = await getJ(`${T}/dados/${u}/${u}-c0001-${E6}-u.json`); const p = r.j ? parse(r.j) : null; if (p) st[u] = p; else miss.push(u.toUpperCase()); })]);
  const n = br.j ? parse(br.j) : null;
  if (!n || !total(n.v)) { msg(br.err ? `Não consegui carregar o total nacional do TSE (${br.err}).` : 'O arquivo nacional do TSE veio em um formato inesperado ou sem votos.'); return false; }
  nat = n;
  msg(miss.length ? `Sem dados de: ${miss.join(', ')}. Os gráficos usam só o que o TSE entregou.` : '');
  renderChecks(); renderCharts(); return true;
}
window.addEventListener('apuracao:refresh', async () => {
  st = {}; cmP = null; const uf = cur.uf;
  if (uf) { delete cities[uf]; loading = { ...loading, [uf]: null }; gC.querySelector(`g[data-u="${uf}"]`)?.remove(); }
  if (await loadAll() && uf) { await loadUF(uf, true); sync(); }
});
(async function init() {
  const ok = await loadAll(); if (!ok) return;
  const r = parseHash(); if (r.role === 'pres' && r.uf) await showUF(r.uf, r.city);
})();
