import fs from 'node:fs';
import path from 'node:path';
import { locSearch, resolveLocItem } from './loc.js';
import { iaSearch, resolveIaItem } from './archive.js';
import { get, set } from './cache.js';

const LIB_DIR = path.resolve('library');

async function mapLimit(arr, limit, fn){
  const out = new Array(arr.length);
  let i = 0;
  async function worker(){
    while (i < arr.length){
      const idx = i++;
      out[idx] = await fn(arr[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, arr.length) }, worker));
  return out;
}

/* ---------- your local library ---------- */
export function scanLocal(){
  try{
    if (!fs.existsSync(LIB_DIR)) fs.mkdirSync(LIB_DIR, { recursive: true });
    return fs.readdirSync(LIB_DIR)
      .filter(f => /\.(mp4|webm|m4v)$/i.test(f))
      .map(f => ({
        key: 'local:' + f,
        title: f.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
        year: '', desc: 'From your personal library 💗', thumb: '',
        urls: ['/library/' + encodeURIComponent(f)],
        genre: 'Yours', source: 'Your Library'
      }));
  }catch{ return [] }
}

/* ---------- curated queries ---------- */
const CURATED = [
  'title:("night of the living dead") AND mediatype:movies AND access-restricted-item:false',
  'title:("his girl friday") AND mediatype:movies AND access-restricted-item:false',
  'title:(nosferatu) AND mediatype:movies AND access-restricted-item:false',
  'title:(metropolis) AND mediatype:movies AND access-restricted-item:false',
  'title:("a trip to the moon") AND mediatype:movies AND access-restricted-item:false',
  'title:("the general") AND mediatype:movies AND access-restricted-item:false AND year:[1920 TO 1930]',
  'title:("plan 9 from outer space") AND mediatype:movies AND access-restricted-item:false',
  'title:(detour) AND mediatype:movies AND access-restricted-item:false AND year:[1940 TO 1950]',
  'title:("cabinet of dr. caligari") AND mediatype:movies AND access-restricted-item:false',
  'title:(freaks) AND mediatype:movies AND access-restricted-item:false AND year:[1930 TO 1940]',
];

const GENRES = [
  ['🔥 Most Downloaded', 'mediatype:movies AND access-restricted-item:false', 14],
  ['🎬 Horror',  'mediatype:movies AND subject:(horror) AND access-restricted-item:false', 12],
  ['👽 Sci-Fi',  'mediatype:movies AND subject:("science fiction") AND access-restricted-item:false', 12],
  ['😂 Comedy',  'mediatype:movies AND subject:(comedy) AND access-restricted-item:false', 12],
  ['💘 Romance', 'mediatype:movies AND subject:(romance) AND access-restricted-item:false', 10],
  ['🤠 Western', 'mediatype:movies AND subject:(western) AND access-restricted-item:false', 10],
  ['🦋 Silent',  'mediatype:movies AND collection:(silent_films) AND access-restricted-item:false', 12],
  ['🌍 Docs',    'mediatype:movies AND collection:(prelinger) AND access-restricted-item:false', 10],
];

/* ---------- build all rows (server-side, cached 6h) ---------- */
export async function buildRows(){
  const rows = [];

  /* 1. your files */
  rows.push({ id: 'local', label: '💗 Your Library', source: 'Your files', items: scanLocal() });

  /* 2. Library of Congress (fast CDN) */
  for (const [id, label, q] of [
    ['loc-new',    '🇺🇸 New to the Library (LoC)', ''],
    ['loc-silent', '🦋 Silent Era (LoC)',          'silent'],
  ]){
    const raws = await locSearch(q, 24);
    const items = (await mapLimit(raws, 5, resolveLocItem)).filter(Boolean);
    rows.push({ id, label, source: 'Library of Congress', items });
  }

  /* 3. curated favorites */
  {
    const items = [], seen = new Set();
    await mapLimit(CURATED, 3, async q => {
      const docs = await iaSearch(q, 3);
      for (const d of docs){
        if (seen.has(d.identifier)) continue;
        const it = await resolveIaItem(d.identifier);
        if (it){ seen.add(d.identifier); items.push(it); return; }
      }
    });
    rows.push({ id: 'fav', label: '🎀 CzaCute Favorites', source: 'Internet Archive', items });
  }

  /* 4. genre rows */
  await mapLimit(GENRES, 3, async ([label, q, n]) => {
    const docs = await iaSearch(q, n);
    const items = (await mapLimit(docs.slice(0, 8), 4, d => resolveIaItem(d.identifier))).filter(Boolean);
    rows.push({ id: 'g:' + label, label, source: 'Internet Archive', items });
  });

  return rows;
}

/* ---------- search across both sources ---------- */
export async function search(q){
  const ck = 'search:' + q.toLowerCase();
  const hit = get(ck, 30 * 60e3);
  if (hit) return hit;

  const out = [], seen = new Set();

  /* fast source first: Library of Congress */
  const locRaws = await locSearch(q, 16);
  for (const raw of locRaws){
    const it = await resolveLocItem(raw);
    if (it && !seen.has(it.key)){ seen.add(it.key); out.push(it); }
  }

  /* fallback source: Internet Archive */
  const docs = await iaSearch(`mediatype:movies AND (${q}) AND access-restricted-item:false`, 14);
  for (const d of docs){
    const it = await resolveIaItem(d.identifier);
    if (it && !seen.has(it.key)){ seen.add(it.key); out.push(it); }
  }

  const items = out.slice(0, 40);
  set(ck, items);
  return items;
}

/* ---------- single item ---------- */
export async function getItem(key){
  if (key.startsWith('local:')) return scanLocal().find(i => i.key === key) || null;
  const ck = 'item:' + key;
  const hit = get(ck, 7 * 864e5);
  if (hit) return hit;
  let item = null;
  if (key.startsWith('loc:')) item = await resolveLocItem({ id: key.slice(4) });
  else if (key.startsWith('ia:')) item = await resolveIaItem(key.slice(3));
  if (item) set(ck, item);
  return item;
}
