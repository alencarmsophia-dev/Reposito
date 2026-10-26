// Lógica pura do resultado final (sem DOM): leitura dos JSONs do TSE, conferências de integridade,
// ligação código TSE × código IBGE, faixas de cor e textos de compartilhamento.
export const CAND = [
  { n: 'Lula', short: 'Lula', p: 'PT', num: 13, photo: '/img/cand-1.webp', col: '#ef3340' },
  { n: 'Flávio Bolsonaro', short: 'Flávio', p: 'PL', num: 22, photo: '/img/cand-2.webp', col: '#3b82f6' },
];
const SLOT = { 13: 0, 22: 1, 91: 0, 92: 1 };
export const nf = new Intl.NumberFormat('pt-BR');
export const pf = (n, d = 2) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const slug = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Lê um arquivo unificado "-u.json" do TSE. Devolve null se o formato não for o esperado.
export function parse(j) {
  if (!j || typeof j !== 'object' || !Array.isArray(j.carg)) return null;
  const c = j.carg.find((x) => Number(x.cd) === 1) || (j.carg.length === 1 ? j.carg[0] : null);
  if (!c) return null;
  const v = [0, 0];
  (c.agr || []).forEach((a) => (a.par || []).forEach((p) => (p.cand || []).forEach((x) => {
    const s = SLOT[Number(x.n)];
    if (s !== undefined) v[s] += Number(x.vap) || 0;
  })));
  const V = j.v || {}, E = j.e || {}, S = j.s || {};
  return {
    v, valid: +V.vv || 0, blank: +V.vb || 0, nul: +V.tvn || 0, tv: +V.tv || 0, te: +E.te || 0, comp: +E.c || 0, abst: +E.a || 0,
    st: +S.st || 0, ts: +S.ts || 0, final: j.tf === 's', ht: j.ht || j.hg || '', dt: j.dt || j.dg || '',
  };
}
export const total = (v) => v[0] + v[1];
export const lead = (v) => (v[0] > v[1] ? 0 : 1);
export const pct = (v) => (total(v) ? [(v[0] / total(v)) * 100, (v[1] / total(v)) * 100] : [0, 0]);
// margem em pontos percentuais (diferença entre os dois percentuais)
export const marg = (v) => (total(v) ? (Math.abs(v[0] - v[1]) / total(v)) * 100 : 0);
const BANDS = [[2, 0.36], [5, 0.52], [10, 0.68], [20, 0.84], [Infinity, 0.96]];
export const alpha = (m) => BANDS.find(([max]) => m < max)[1];

// Conferências de integridade mostradas no topo. Cada item: { ok, text }
export function checks(nat, st, ufs) {
  const sum = [0, 0];
  let got = 0;
  ufs.forEach((u) => { if (st[u]) { sum[0] += st[u].v[0]; sum[1] += st[u].v[1]; got++; } });
  const sumOk = got === ufs.length && sum[0] === nat.v[0] && sum[1] === nat.v[1];
  const allFinal = ufs.every((u) => st[u]?.final);
  return [
    { ok: nat.final, text: nat.final ? 'Totalização final do TSE' : 'Totalização ainda não marcada como final pelo TSE' },
    { ok: nat.ts > 0 && nat.st === nat.ts, text: `${pf((nat.st / (nat.ts || 1)) * 100)}% das seções totalizadas (${nf.format(nat.st)} de ${nf.format(nat.ts)})` },
    { ok: sumOk, text: sumOk ? 'Soma dos estados (e exterior) = total nacional' : got < ufs.length ? `Faltam dados de ${ufs.length - got} unidade(s) para somar` : 'Soma dos estados difere do total nacional' },
    { ok: allFinal, text: allFinal ? 'Todos os estados com totalização final' : 'Há estados sem totalização final' },
    { ok: nat.valid + nat.blank + nat.nul === nat.tv, text: 'Válidos + brancos + nulos = total de votos' },
    { ok: nat.comp + nat.abst === nat.te, text: 'Comparecimento + abstenção = eleitorado' },
  ];
}

// Liga cada município do TSE (config mun-...-cm.json) ao código IBGE (nomes do IBGE).
// Devolve { tse: {codIBGE: codTSE}, hit, total, names: {codIBGE: nome} }
export function linkCities(uf, cm, nomes) {
  const names = {}, byKey = new Map(), byName = new Map();
  (nomes || []).forEach((m) => {
    const c = String(m.id);
    names[c] = m.nome; byKey.set(c, c);
    if (!byKey.has(c.slice(0, 6))) byKey.set(c.slice(0, 6), c);
    byKey.set(c.slice(2), c);
    byName.set(norm(m.nome), c);
  });
  const mu = (cm?.abr || []).find((a) => String(a.cd).toLowerCase() === uf)?.mu || [];
  const tse = {}; let hit = 0;
  mu.forEach((m) => {
    const c = byKey.get(String(m.cdi)) || byName.get(norm(m.nm || m.ds || m.n));
    if (c) { tse[c] = String(m.cd).padStart(5, '0'); hit++; }
  });
  return { tse, hit, total: mu.length, names };
}

// Cidades com resultado: [{name, r:[a,b]}] -> contagem e maiores vantagens por lado
export function cityStats(list, n = 5) {
  const won = [0, 0], top = [[], []];
  list.forEach((c) => { if (c.r && total(c.r)) { const w = lead(c.r); won[w]++; top[w].push(c); } });
  top.forEach((a) => a.sort((x, y) => marg(y.r) - marg(x.r)));
  return { won, top: top.map((a) => a.slice(0, n)), n: won[0] + won[1] };
}

export function duelText(title, v, final, extra = []) {
  const p = pct(v), w = lead(v);
  const L = [`🗳️ ${title}`, '',
    `${final ? '✅ ' : ''}${CAND[w].n} ${final ? 'venceu' : 'lidera'}:`,
    `• ${CAND[0].n}: ${pf(p[0])}% (${nf.format(v[0])} votos)`,
    `• ${CAND[1].n}: ${pf(p[1])}% (${nf.format(v[1])} votos)`,
    `Diferença: ${nf.format(Math.abs(v[0] - v[1]))} votos (${pf(marg(v))} p.p.)`];
  return L.concat(extra).filter((x) => x !== null).join('\n');
}
