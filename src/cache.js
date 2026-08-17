import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('.cache');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

const mem = new Map();

function fileFor(key){
  return path.join(DIR, key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120) + '.json');
}

export function get(key, ttlMs){
  if (mem.has(key)){
    const { t, d } = mem.get(key);
    if (Date.now() - t < ttlMs) return d;
    mem.delete(key);
  }
  const f = fileFor(key);
  try{
    if (!fs.existsSync(f)) return null;
    const { t, d } = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (Date.now() - t < ttlMs){ mem.set(key, { t, d }); return d; }
    fs.unlinkSync(f);
  }catch{}
  return null;
}

export function set(key, data){
  mem.set(key, { t: Date.now(), d: data });
  const f = fileFor(key);
  try{ fs.writeFileSync(f, JSON.stringify({ t: Date.now(), d: data })); }catch{}
}
