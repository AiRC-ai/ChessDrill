// This document is loaded with sandbox="allow-scripts" and no allow-same-origin.
// Chess.com's JSONP code can read neither the parent page nor its saved data.
window.addEventListener('message', event => {
  if (event.source !== window.parent) return;
  const {token, url: value} = event.data || {};
  if (typeof token !== 'string' || !/^[0-9a-f]{32}$/i.test(token)) return;
  let url;
  try {
    url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'api.chess.com' || url.port ||
        url.username || url.password || url.search || url.hash ||
        !/^\/pub\/player\/[a-z0-9_-]{2,30}(?:\/games\/(?:archives|\d{4}\/(?:0[1-9]|1[0-2])))?$/.test(url.pathname)) return;
  } catch { return; }
  const callback = `chessStudio_${token}`;
  const script = document.createElement('script');
  const send = (ok, payload) => {
    window.parent.postMessage({token, ok, payload}, '*');
    script.remove();
    delete window[callback];
  };
  window[callback] = payload => send(true, payload);
  script.onerror = () => send(false);
  script.referrerPolicy = 'no-referrer';
  url.searchParams.set('callback', callback);
  script.src = url.href;
  document.head.appendChild(script);
}, {once:true});
