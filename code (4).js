const ALLOW = [/^archive\.org$/, /\.archive\.org$/, /^loc\.gov$/, /\.loc\.gov$/];
const UA = 'Mozilla/5.0 (CzaCute/4.0)';

export function isAllowed(urlStr){
  try{
    const h = new URL(urlStr).hostname.toLowerCase();
    return ALLOW.some(re => re.test(h));
  }catch{ return false }
}

/* streams a remote video through this server with Range support (seeking) */
export async function streamProxy(req, res){
  const src = req.query.src;
  if (typeof src !== 'string' || !src || !isAllowed(src)){
    return res.status(403).json({ error: 'source not allowed' });
  }

  const headers = { 'User-Agent': UA, 'Accept': '*/*' };
  const range = req.headers.range;
  if (range) headers['Range'] = range;

  try{
    const up = await fetch(src, { headers, redirect: 'follow' });
    if (!up.ok && up.status !== 206){ try{ res.status(up.status).end() }catch{} return; }

    res.status(up.status);
    const set = (k, v) => { if (v) res.setHeader(k, v) };
    set('Content-Type',  up.headers.get('content-type') || 'video/mp4');
    set('Content-Range', up.headers.get('content-range'));
    set('Content-Length', up.headers.get('content-length'));
    set('Accept-Ranges', 'bytes');
    set('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const reader = up.body.getReader();
    req.on('close', () => { reader.cancel().catch(() => {}) });

    while (true){
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  }catch(e){
    if (!res.headersSent) res.status(502).end();
    else res.end();
  }
}
