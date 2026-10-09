/**
 * ROTEADOR — hash routing simples: #/rota/param?query
 */
const routes = [];

export function route(pattern, handler) {
  const keys = [];
  const rx = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
  routes.push({ rx, keys, handler });
}

export function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs)) };
}

export function buildHash(path, query = {}) {
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
  return `#${path}${qs ? `?${qs}` : ''}`;
}

export function startRouter(onNotFound) {
  const resolve = () => {
    const { path, query } = parseHash();
    for (const r of routes) {
      const m = path.match(r.rx);
      if (m) {
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        r.handler({ params, query, path });
        return;
      }
    }
    onNotFound({ path, query });
  };
  window.addEventListener('hashchange', resolve);
  resolve();
}
