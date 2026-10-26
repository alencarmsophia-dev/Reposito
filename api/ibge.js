// Proxy do IBGE (malha de municípios + nomes). Os dados quase não mudam: cache longo na borda.
const H = 'https://servicodados.ibge.gov.br/api/';
function urlFor(t, uf) {
  if (!/^\d{2}$/.test(uf || '')) return null;
  if (t === 'malha') return `${H}v3/malhas/estados/${uf}?formato=application/vnd.geo+json&intrarregiao=municipio&qualidade=minima`;
  if (t === 'nomes') return `${H}v1/localidades/estados/${uf}/municipios`;
  return null;
}
module.exports = async function handler(req, res) {
  const url = urlFor(req.query.t, req.query.uf);
  if (!url) { res.status(400).send('{"error":"parametros"}'); return; }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', r.status === 200 ? 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800' : 's-maxage=10');
    res.status(r.status).send(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.setHeader('cache-control', 's-maxage=5');
    res.status(502).send('{"error":"upstream_unreachable"}');
  }
};
module.exports.urlFor = urlFor;
