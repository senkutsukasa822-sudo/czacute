import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRows, search, getItem } from './src/catalog.js';
import { streamProxy } from './src/proxy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const ROW_TTL = 6 * 3600e3;

const app = express();
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.use('/library', express.static(path.join(__dirname, 'library'), { maxAge: '1d' })); /* Range requests supported natively */

/* ---------- cached rows ---------- */
let rowsCache = null, rowsAt = 0;

async function refreshRows(){
  const rows = await buildRows();
  rowsCache = rows;
  rowsAt = Date.now();
  const n = rows.reduce((s, r) => s + r.items.length, 0);
  console.log(`[czacute] catalog ready — ${rows.length} rows, ${n} titles`);
  return rows;
}

async function getRows(){
  if (rowsCache && Date.now() - rowsAt < ROW_TTL) return rowsCache;
  return refreshRows();
}

/* ---------- API ---------- */
app.get('/api/rows', async (req, res) => {
  try{ res.json({ rows: await getRows(), updated: rowsAt }); }
  catch(e){ res.status(500).json({ error: e.message }); }
});

app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ items: [] });
  try{ res.json({ items: await search(q) }); }
  catch(e){ res.status(500).json({ error: e.message }); }
});

app.get('/api/item/:key', async (req, res) => {
  const item = await getItem(decodeURIComponent(req.params.key));
  item ? res.json(item) : res.status(404).json({ error: 'not found' });
});

app.get('/api/stream', streamProxy);

app.get('/api/refresh', async (req, res) => {
  try{ await refreshRows(); res.json({ ok: true }); }
  catch(e){ res.status(500).json({ error: e.message }); }
});

app.get('/api/health', (req, res) => res.json({ ok: true, updated: rowsAt }));

/* ---------- warmup + refresh loop ---------- */
const warmup = () => refreshRows().catch(e => console.error('[czacute] warmup failed:', e.message));
warmup();
setInterval(warmup, ROW_TTL);

/* ---------- run ---------- */
if (process.argv.includes('--prefetch')){
  warmup().then(() => { console.log('[czacute] prefetch complete'); process.exit(0); });
} else {
  app.listen(PORT, () => console.log(`🎀 CzaCute running at http://localhost:${PORT}`));
}
