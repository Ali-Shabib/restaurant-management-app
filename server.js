/*
(plain Node.js, no Express)
 */

const http = require('http');
const fs = require('fs/promises');
const fssync = require('fs');
const path = require('path');
const pug = require('pug');

const PORT = Number(process.env.PORT || 2406);
const ROOT = __dirname;
const CLIENT_DIR = path.join(ROOT, 'client');
const REST_DIR = path.join(ROOT, 'restaurants');
const TEMPLATES_DIR = path.join(ROOT, 'templates');
const statsTemplate = pug.compileFile(path.join(TEMPLATES_DIR, 'stats.pug'));

const HEADER_HTML =
  '<header><nav>' +
  '<a href="/">Home</a> | ' +
  '<a href="/order.html">Order Form</a> | ' +
  '<a href="/stats">Restaurant Stats</a>' +
  '</nav><hr></header>';

const restaurantsById = new Map();
const restaurantsList = [];
const stats = new Map();

/* helpers */
function safeJoin(base, p) {
  if (!p) return null;
  const full = path.join(base, p);
  if (!full.startsWith(base)) return null;
  return full;
}
function getMime(ext) {
  const m = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.svg': 'image/svg+xml'
  };
  return m[ext] || 'application/octet-stream';
}
function findItemInRestaurant(r, itemId) {
  if (!r || !r.menu) return null;
  const key = String(itemId);
  for (const cat of Object.values(r.menu)) {
    if (Object.prototype.hasOwnProperty.call(cat, key)) return cat[key];
  }
  return null;
}
function calcTotals(subtotal, deliveryFee) {
  const tax = subtotal * 0.13;
  const total = subtotal + tax + deliveryFee;
  return { subtotal, tax, delivery: deliveryFee, total };
}
function updateStats(restaurantId, items, totals) {
  const id = String(restaurantId);
  const st = stats.get(id);
  if (!st) return;
  st.orders += 1;
  st.totalSum += totals.total;
  for (const it of items) {
    const k = String(it.itemId);
    const q = Number(it.qty) || 0;
    st.itemUnits[k] = (st.itemUnits[k] || 0) + q;
  }
}
function lookupItemName(r, itemId) {
  if (!itemId) return '—';
  const key = String(itemId);
  for (const cat of Object.values(r.menu || {})) {
    if (Object.prototype.hasOwnProperty.call(cat, key)) return cat[key].name;
  }
  return '—';
}
function computeStatsView() {
  const out = [];
  for (const [id, r] of restaurantsById.entries()) {
    const st = stats.get(id);
    const orders = st ? st.orders : 0;
    const average = orders ? (st.totalSum / orders) : 0;
    let popularId = null;
    if (st && st.itemUnits) {
      const entries = Object.entries(st.itemUnits);
      entries.sort(function (a, b) {
        if (b[1] !== a[1]) return b[1] - a[1];
        const an = lookupItemName(r, a[0]);
        const bn = lookupItemName(r, b[0]);
        if (an !== bn) return an.localeCompare(bn);
        return String(a[0]).localeCompare(String(b[0]));
      });
      if (entries.length) popularId = entries[0][0];
    }
    out.push({
      id: r.id,
      name: r.name,
      totalOrders: orders,
      averageTotal: average,
      mostPopular: lookupItemName(r, popularId)
    });
  }
  return out;
}
async function readJsonBody(req) {
  return await new Promise(function (resolve, reject) {
    let data = '';
    req.on('data', function (chunk) {
      data += chunk;
      if (data.length > 1e6) { reject(new Error('Payload too large')); req.destroy(); }
    });
    req.on('end', function () {
      try { resolve(JSON.parse(data || '{}')); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

/* startup */
async function loadRestaurants() {
  const files = await fs.readdir(REST_DIR);
  const jsonFiles = files.filter(function (f) { return f.endsWith('.json'); });
  restaurantsById.clear(); restaurantsList.length = 0; stats.clear();
  for (const file of jsonFiles) {
    const text = await fs.readFile(path.join(REST_DIR, file), 'utf-8');
    const data = JSON.parse(text);
    const id = String(data.id);
    restaurantsById.set(id, data);
    restaurantsList.push({ id: data.id, name: data.name });
    stats.set(id, { orders: 0, totalSum: 0, itemUnits: {} });
  }
  restaurantsList.sort(function (a, b) { return a.id - b.id; });
  console.log(
    'Loaded ' + restaurantsList.length + ' restaurant(s):',
    restaurantsList.map(function (r) { return r.id + ':' + r.name; }).join(', ')
  );
}

/* server */
const server = http.createServer(async function (req, res) {
  try {
    const urlPath = req.url.split('?')[0];

    // /
    if (req.method === 'GET' && urlPath === '/') {
      const home =
        HEADER_HTML +
        '<main class="container">' +
        '  <link rel="stylesheet" href="/style.css">' +
        '  <div class="card">' +
        '    <h1>Restaurant Ordering System</h1>' +
        '    <p class="muted" style="text-align:center">' +
        '      Use the Order Form to place an order. Totals are computed on the server; results appear on the Stats page.' +
        '    </p>' +
        '    <p style="text-align:center;margin-top:10px;">' +
        '      <a class="btn" href="/order.html">Open Order Form</a> ' +
        '      <a class="btn btn-dark" href="/stats">View Stats</a>' +
        '    </p>' +
        '  </div>' +
        '</main>';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(home);
      return;
    }

    // /stats (Pug)
    if (req.method === 'GET' && urlPath === '/stats') {
      const entries = computeStatsView();
      const html = statsTemplate({ headerHTML: HEADER_HTML, entries: entries });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    // APIs
    if (req.method === 'GET' && urlPath === '/api/restaurants') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(restaurantsList));
      return;
    }
    {
      const m = urlPath.match(/^\/api\/restaurants\/(\d+)$/);
      if (req.method === 'GET' && m) {
        const data = restaurantsById.get(m[1]);
        if (!data) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'not found' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
        return;
      }
    }
    if (req.method === 'POST' && urlPath === '/api/orders') {
      try {
        const body = await readJsonBody(req);
        const restaurantId = String(body.restaurantId);
        const r = restaurantsById.get(restaurantId);
        if (!r) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'Invalid restaurant' }));
          return;
        }
        const items = Array.isArray(body.items) ? body.items : [];
        if (!items.length) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'Empty order' }));
          return;
        }
        let subtotal = 0;
        for (const it of items) {
          const itemId = String(it.itemId);
          const qty = Number(it.qty);
          if (!Number.isInteger(qty) || qty < 1) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, error: 'Invalid quantity' }));
            return;
          }
          const item = findItemInRestaurant(r, itemId);
          if (!item) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, error: 'Invalid item ' + itemId }));
            return;
          }
          subtotal += item.price * qty;
        }
        if (subtotal < r.min_order) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'Minimum order is ' + r.min_order }));
          return;
        }
        const totals = calcTotals(subtotal, r.delivery_fee);
        updateStats(restaurantId, items, totals);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, totals: totals }));
        return;
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
        return;
      }
    }

    // static
    const requestFile =
      urlPath === '/orderform.html' ? 'order.html' :
      (urlPath.startsWith('/') ? urlPath.slice(1) : urlPath);
    if (req.method === 'GET') {
      const safe = safeJoin(CLIENT_DIR, decodeURIComponent(requestFile));
      if (safe && fssync.existsSync(safe) && fssync.statSync(safe).isFile()) {
        res.writeHead(200, { 'Content-Type': getMime(path.extname(safe).toLowerCase()) });
        fssync.createReadStream(safe).pipe(res);
        return;
      }
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server error');
  }
});

/* boot */
(async function () {
  await loadRestaurants();
  server.listen(PORT, function () {
    console.log('Server listening on http://localhost:' + PORT);
  });
})();
