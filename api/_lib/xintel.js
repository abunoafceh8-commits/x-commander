// AbuNawaf X-Intel · © 2026 أبو نواف · MIT
// طبقة جلب موحّدة متعددة المصادر لبيانات X/Twitter — تعمل من مراكز البيانات
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function jget(url, ms = 9000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json,text/html;q=0.9,*/*;q=0.8' }, signal: c.signal, redirect: 'follow' });
    return { ok: r.ok, status: r.status, text: await r.text() };
  } catch (e) {
    return { ok: false, status: 0, text: '', err: e.name };
  } finally { clearTimeout(t); }
}

/** ملف الحساب من FxTwitter — مصدر عام لا يحجب مراكز البيانات */
export async function profile(username) {
  const r = await jget(`https://api.fxtwitter.com/${encodeURIComponent(username)}`, 8000);
  if (!r.ok) return { ok: false, status: r.status };
  try {
    const d = JSON.parse(r.text);
    const u = d.user || {};
    return {
      ok: true,
      profile: {
        found: true,
        username: u.screen_name || username,
        id: u.id || null,
        name: u.name || '',
        bio: u.description || '',
        location: u.location || '',
        website: u.website?.display_url || u.website?.url || '',
        joined: u.joined || '',
        avatar: u.avatar_url || '',
        banner: u.banner_url || '',
        followers: u.followers ?? 0,
        following: u.following ?? 0,
        likes: u.likes ?? 0,
        tweets: u.tweets ?? 0,
        mediaCount: u.media_count ?? 0,
        verified: !!u.verification?.verified,
        protected: !!u.protected,
        url: u.url || `https://x.com/${username}`,
        source: 'FxTwitter'
      }
    };
  } catch { return { ok: false, status: r.status }; }
}

/** أرشيف Wayback — نطاق زمني أضيق = نتائج أسرع وأكثر ثباتًا */
export async function waybackTweets(username, limit = 40) {
  const now = new Date();
  const from = now.getFullYear() - 3;
  const urls = [
    `https://web.archive.org/cdx/search/cdx?url=twitter.com/${encodeURIComponent(username)}/status/*&output=json&limit=${limit}&from=${from}&fl=timestamp,original&collapse=urlkey&filter=statuscode:200`,
    `https://web.archive.org/cdx/search/cdx?url=x.com/${encodeURIComponent(username)}/status/*&output=json&limit=${limit}&from=${from}&fl=timestamp,original&collapse=urlkey&filter=statuscode:200`
  ];
  const out = [];
  for (const u of urls) {
    const r = await jget(u, 12000);
    if (!r.ok || !r.text.trim().startsWith('[')) continue;
    try {
      const rows = JSON.parse(r.text).slice(1);
      for (const row of rows) {
        const tid = String(row[1] || '').match(/\/status\/(\d+)/)?.[1];
        if (tid && !out.find(t => t.id === tid)) {
          out.push({
            id: tid, tweet_id: tid, text: '',
            url: `https://x.com/${username}/status/${tid}`,
            archive_url: `https://web.archive.org/web/${row[0]}/${row[1]}`,
            date: `${String(row[0]).slice(0, 4)}-${String(row[0]).slice(4, 6)}-${String(row[0]).slice(6, 8)}`,
            archived: true, source: 'Wayback'
          });
        }
      }
    } catch {}
    if (out.length >= limit) break;
  }
  return out;
}

/** الوقت من معرّف تغريدة (snowflake) */
export function tweetDate(id) {
  try { return new Date(Number(BigInt(id) >> 22n) + 1288834974657).toISOString(); } catch { return null; }
}

/**
 * تجميع نهائي: يدمج ما جلبه المعالج مع الأرشيف + بطاقة الحساب.
 * يعيد دائمًا بيانات حقيقية بدل قائمة فارغة صامتة.
 */
export async function collect(username, seen = []) {
  const [prof, wb] = await Promise.all([profile(username), seen.length ? Promise.resolve([]) : waybackTweets(username)]);
  const map = new Map();
  const push = (t) => {
    const id = t.id || t.tweet_id;
    if (!id) return;
    const prev = map.get(id) || {};
    map.set(id, { ...prev, ...t, id, tweet_id: id });
  };
  seen.forEach(push);
  wb.forEach(push);
  const tweets = [...map.values()].sort((a, b) => {
    const da = a.date || tweetDate(a.id) || '', db = b.date || tweetDate(b.id) || '';
    return db.localeCompare(da);
  });
  const sources = { timeline: seen.length, archive: wb.length, profile: prof.ok ? 1 : 0 };
  let note = '';
  if (prof.ok && prof.profile.protected) note = 'الحساب محمي (Protected): لا يمكن جلب التغريدات إلا للأصدقاء المتابعين — عُرضت بيانات الحساب العامة والأرشيف المتاح.';
  else if (!tweets.length) note = 'تعذّر على مصادر X العامة (Syndication/Archive) إرجاع تغريدات لهذا الحساب الآن — عُرضت بطاقة الحساب.';
  return { tweets, profile: prof.ok ? prof.profile : { found: false, username }, sources, note };
}
