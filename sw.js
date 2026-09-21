/* Daynua — 설치형(PWA) + 오프라인 + 앱이 꺼져 있을 때의 알림.
   network-first, 실패하면 캐시. 알림 문구는 페이지가 남겨둔 로컬 요약으로 만든다
   (서버는 "울릴 시각"만 알고, 할 일 내용은 기기 밖으로 나가지 않는다). */
const C = 'daynua-v17';
const STATE = 'daynua-state';          // 페이지가 써 두는 오늘 요약 (지우지 않음)
const SUMMARY = '/__summary';
const SHELL = ['./', './index.html', './manifest.json', './privacy.html',
               './icon-192.png', './icon-512.png'];
/* 동기화 라이브러리도 한 벌 받아 둔다 — 오프라인으로 열어도 로그인 상태가 살아 있게.
   실패해도 설치는 계속된다 (이게 없어도 앱 본체는 뜬다). */
const VENDOR = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(C).then(async c => {
    await c.addAll(SHELL);
    await c.add(VENDOR).catch(() => {});
  }));
});

self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== C && k !== STATE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));

const pad = n => String(n).padStart(2, '0');
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let title = 'Daynua', body = '';
    try {
      const r = await (await caches.open(STATE)).match(SUMMARY);
      if (r) {
        const s = await r.json();
        title = s.title || title;
        body = s.date === localToday() ? (s.body || '') : (s.stale || '');
      }
    } catch {}
    await self.registration.showNotification(title, {
      body, icon: 'icon-192.png', badge: 'icon-192.png',
      tag: 'daynua-daily', renotify: true, data: { url: './' }
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) if ('focus' in w) return w.focus();
    return clients.openWindow('./');
  }));
});

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (e.request.url === VENDOR) {                     // 라이브러리는 캐시 우선 (오프라인 대비)
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(C).then(c => c.put(e.request, copy));
      return res;
    })));
    return;
  }
  if (u.origin !== location.origin) return;                                // supabase 호출은 그대로
  if (u.pathname === SUMMARY) return;                                      // 내부 저장소
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(r => {      // 열 때마다 최신 확인
      const copy = r.clone();
      caches.open(C).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
