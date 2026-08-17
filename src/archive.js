import { get, set } from './cache.js';

const API = 'https://archive.org/advancedsearch.php';
const META = 'https://archive.org/metadata';
const DL = 'https://archive.org/download';
const UA = 'Mozilla/5.0 (CzaCute/4.0)';

export async function iaSearch(q, rows = 12, sort = 'downloads desc'){
  const ck = 'iasearch:' + q + '|' + rows;
  const hit = get(ck, 6 * 3600e3);
  if (hit) return hit;

  const base = `${API}?q=${encodeURIComponent(q)}&fl[]=identifier&fl[]=title&fl[]=year&fl[]=downloads&fl[]=description&rows=${rows}&page=1&output=json${sort ? '&sort[]=' + encodeURIComponent(sort) : ''}`;
  try{
    const r = await fetch(base, { headers: { 'User-Agent': UA } });
    const j = await r.json();
    let docs = (j.response && j.response.docs) || [];
    if (!docs.length && /access-restricted-item:false/.test(q)){
      return iaSearch(q.replace(/ AND access-restricted-item:false/g, ''), rows, sort);
    }
    set(ck, docs);
    return docs;
  }catch{ return [] }
}

const PREF = ['512Kb MPEG4', 'h.264', 'MPEG4'];

function pickUrls(id, files){
  const ok = (files || []).filter(f => f && f.name && !/thumb|__ia|_ia_|archive\.org\//i.test(f.name) && /\.(mp4|webm|m4v)$/i.test(f.name));
  if (!ok.length) return [];
  ok.sort((a, b) => {
    const ra = PREF.indexOf(a.format), rb = PREF.indexOf(b.format);
    const sa = ra === -1 ? 99 : ra, sb = rb === -1 ? 99 : rb;
    if (sa !== sb) return sa - sb;
    return (a.size || 1e12) - (b.size || 1e12);
  });
  return ok.slice(0, 3).map(f => `${DL}/${encodeURIComponent(id)}/${encodeURIComponent(f.name)}`);
}

export async function resolveIaItem(iaId, extra = {}){
  const ck = 'iaitem:' + iaId;
  const hit = get(ck, 7 * 864e5);
  if (hit) return hit;
  try{
    const r = await fetch(`${META}/${iaId}`, { headers: { 'User-Agent': UA } });
    if (!r.ok) return null;
    const j = await r.json();
    const m = j.metadata || {};
    if (m['access-restricted-item'] === 'true') return null;
    const urls = pickUrls(iaId, j.files);
    if (!urls.length) return null;
    const g = Array.isArray(m.genre) ? m.genre[0] : (m.genre || '');
    const item = {
      key: 'ia:' + iaId,
      title: extra.title || m.title || iaId,
      year: extra.year || m.year || '',
      desc: (extra.desc || (m.description || '').replace(/<[^>]+>/g, ' ').trim()).slice(0, 340),
      thumb: `https://archive.org/services/img/${iaId}`,
      urls,
      genre: g,
      source: 'Internet Archive',
      downloads: Number(m.downloads) || 0
    };
    set(ck, item);
    return item;
  }catch{ return null }
}
