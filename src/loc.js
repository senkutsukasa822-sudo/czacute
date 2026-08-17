import { get, set } from './cache.js';

const COLLECTION = 'https://www.loc.gov/collections/national-screening-room/';
const UA = 'Mozilla/5.0 (CzaCute/4.0)';

const norm = v => Array.isArray(v) ? v.join(' ') : (v || '');
const strip = s => String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/* search within the National Screening Room collection */
export async function locSearch(q = '', c = 24){
  const ck = 'locsearch:' + (q || '*') + '|' + c;
  const hit = get(ck, 6 * 3600e3);
  if (hit) return hit;

  const url = new URL(COLLECTION);
  url.searchParams.set('fo', 'json');
  url.searchParams.set('c', String(c));
  url.searchParams.set('at', 'results,pagination');
  url.searchParams.set('sb', 'date');
  url.searchParams.set('so', 'desc');
  if (q) url.searchParams.set('q', q);

  try{
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) return [];
    const j = await r.json();
    const raws = (j.results || []).filter(x => x && x.id);
    set(ck, raws);
    return raws;
  }catch{ return [] }
}

function videosOf(raw){
  const files = (raw.resources || []).flatMap(res => (res.files || []));
  return files
    .filter(f => /video\//.test(f.mimetype || '') || /\.mp4$/i.test(f.url || ''))
    .sort((a, b) => (a.size || 1e15) - (b.size || 1e15))   /* smallest = fastest start */
    .slice(0, 3)
    .map(f => f.url);
}

/* resolve one search result into a playable item (uses embedded resources, else fetches the item page once — cached 7 days) */
export async function resolveLocItem(raw){
  const id = norm(raw.id);
  if (!id) return null;

  const ck = 'locitem:' + id;
  const hit = get(ck, 7 * 864e5);
  if (hit) return hit;

  let data = raw;
  let urls = videosOf(raw);
  if (!urls.length){
    try{
      const r = await fetch(id + '?fo=json', { headers: { 'User-Agent': UA } });
      if (r.ok) data = await r.json();
      urls = videosOf(data);
    }catch{}
  }
  if (!urls.length) return null;

  const item = {
    key: 'loc:' + id,
    title: strip(norm(data.title)) || id,
    year: norm(data.date) || '',
    desc: strip(norm(data.description)).slice(0, 340),
    thumb: norm(data.image_url),
    urls,
    genre: 'Public Domain',
    source: 'Library of Congress'
  };
  set(ck, item);
  return item;
}
