/**
 * Vivo Assistant — admin UI theme.
 *
 * Brand palette (Brand Guidelines V2):
 *   Navy   #011640   Green  #04d98b   Teal #026a60
 *   Lime   #abdf2c   Yellow #f2e205
 */

export const BRAND = {
  navy: '#011640',
  green: '#04d98b',
  teal: '#026a60',
  lime: '#abdf2c',
  yellow: '#f2e205',
} as const;

const ANIME_CDN = 'https://cdn.jsdelivr.net/npm/animejs@3.2.2/lib/anime.min.js';

/** Vivo logomark (V + gradient swoosh + o). `primary` is the main fill color. */
export function logomarkSvg(primary: string, size = 40, cls = ''): string {
  return `<svg class="${cls}" width="${size}" height="${(size * 0.56).toFixed(0)}" viewBox="20 90 1000 560" xmlns="http://www.w3.org/2000/svg" aria-label="Vivo">
  <path fill="${primary}" d="M86.63,150.32h0c-38.5,21.33-52.07,70.44-30.3,109.69l173.35,314.35c21.77,39.25,70.46,53.85,108.96,32.52h0c38.5-21.33,52.07-70.44,30.3-109.69L195.76,182.77c-21.77-39.25-70.63-53.77-109.13-32.44Z"/>
  <path fill="${primary}" d="M723.35,110.39c-152.14.81-274.82,124.8-274.01,276.94.81,152.14,124.8,274.82,276.94,274.01,152.14-.81,274.82-124.8,274.01-276.94-.81-152.14-123.25-274.82-276.94-274.01ZM725.42,500.14c-63.11.34-114.55-50.56-114.88-113.67-.34-63.11,50.56-114.55,113.67-114.88,63.11-.34,114.55,50.56,114.88,113.67.34,63.11-50.56,114.55-113.67,114.88Z"/>
  <path fill="#04d98b" d="M875.62,216.78c-5.19,32.51-27.77,59.76-67.58,66.9-9.25,1.66-14.59,1.78-25.04.23-7.03-1.04-18.83-5.52-25.1-7.21-6.85-2.19-13.98-3.39-21.51-4.25-2.98-.34-9.11-.63-10.94-.65s-4.3.04-6,.12c-2.59-.01-8.51.73-9.56.86-8.37.96-15.65,2.85-23.6,5.57-2.46.87-6.64,2.6-8.11,3.28-4.15,1.89-7.53,3.61-11.2,5.74-4.82,2.76-9.1,5.73-13.25,9.02-3.86,3.06-8.43,7.37-8.43,7.37-.79.76-1.72,1.71-2.66,2.67-1.04,1.01-3.84,4.11-5.06,5.52-.32.36-1.3,1.56-1.62,1.97-2.81,3.21-7.32,10.04-8.21,11.44-.99,1.57-2.38,3.93-3.41,5.77-16.54,29.4-83.94,149.99-121.27,215.96-8.92,15.76-11.86,20.94-21.2,37.53-21.21,37.69-50.17,80.93-127.22,80.93-69.45,0-98.77-43.06-133.85-107.13,0,0,72.51,37.11,124.95-61.26,57.97-108.72,111.69-199.43,122.48-218.6,15.08-26.79,81.19-168.66,255.25-168.66,40.7,0,66.69,7.17,91.47,15.49,2.42.81,7.97,2.67,11.32,4.15,4.05,1.79,6.64,2.99,9.55,4.66,27.64,15.82,45.4,47.57,39.81,82.58Z"/>
</svg>`;
}

const ICONS = {
  chats:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  tickets:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><path d="M13 5v2M13 17v2M13 11v2"/></svg>',
  logout:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
} as const;

const SHELL_CSS = `
  :root {
    --navy: ${BRAND.navy};
    --navy-2: #052457;
    --green: ${BRAND.green};
    --teal: ${BRAND.teal};
    --bg: #f4f7fb;
    --card: #ffffff;
    --text: #0e1b33;
    --muted: #6b7a93;
    --border: #e5eaf2;
    --grad: linear-gradient(90deg, ${BRAND.teal}, ${BRAND.green} 55%, ${BRAND.lime});
    --shadow: 0 1px 2px rgba(1, 22, 64, .05), 0 8px 24px -12px rgba(1, 22, 64, .12);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px; line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  a { color: inherit; text-decoration: none; }

  .layout { display: flex; min-height: 100vh; }

  /* ---------- Sidebar ---------- */
  aside.sidebar {
    width: 236px; flex-shrink: 0; background: var(--navy); color: #fff;
    display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh;
  }
  .sidebar .brand {
    display: flex; align-items: center; gap: 10px; padding: 22px 20px 18px;
  }
  .sidebar .brand .wordmark { font-size: 17px; font-weight: 700; letter-spacing: .2px; }
  .sidebar .brand .wordmark small {
    display: block; font-size: 10.5px; font-weight: 500; letter-spacing: .12em;
    text-transform: uppercase; color: rgba(255,255,255,.55);
  }
  .sidebar .brand-rule { height: 2px; margin: 0 20px 14px; border-radius: 2px; background: var(--grad); opacity: .9; }
  .sidebar nav { display: flex; flex-direction: column; gap: 2px; padding: 0 12px; }
  .sidebar nav a {
    display: flex; align-items: center; gap: 11px; padding: 10px 12px; border-radius: 9px;
    color: rgba(255,255,255,.72); font-weight: 500; font-size: 13.5px;
    transition: background .15s, color .15s;
  }
  .sidebar nav a:hover { background: rgba(255,255,255,.07); color: #fff; }
  .sidebar nav a.active { background: rgba(4,217,139,.14); color: #fff; }
  .sidebar nav a.active svg { color: var(--green); }
  .sidebar .spacer { flex: 1; }
  .sidebar .foot { padding: 14px 12px 18px; border-top: 1px solid rgba(255,255,255,.08); }
  .sidebar .foot a {
    display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 9px;
    color: rgba(255,255,255,.6); font-size: 13px; transition: background .15s, color .15s;
  }
  .sidebar .foot a:hover { background: rgba(255,255,255,.07); color: #fff; }

  /* ---------- Main ---------- */
  main.content { flex: 1; min-width: 0; padding: 30px 38px 48px; max-width: 1180px; }
  .pagehead { margin-bottom: 22px; }
  .pagehead .crumb { font-size: 12.5px; color: var(--muted); margin-bottom: 6px; }
  .pagehead .crumb a { color: var(--teal); font-weight: 500; }
  .pagehead .crumb a:hover { color: var(--green); }
  .pagehead h1 { font-size: 21px; font-weight: 700; margin: 0; letter-spacing: -.01em; }
  .pagehead p.sub { margin: 4px 0 0; color: var(--muted); font-size: 13px; }

  .card {
    background: var(--card); border: 1px solid var(--border); border-radius: 14px;
    padding: 22px 24px; margin: 14px 0; box-shadow: var(--shadow);
  }
  .card h2 { font-size: 15px; font-weight: 600; margin: 0 0 6px; }
  .muted { color: var(--muted); font-weight: 400; font-size: 12.5px; }

  .badge {
    display: inline-flex; align-items: center; gap: 5px; background: #eafcf4; color: #027a52;
    border: 1px solid #c6f2e0; border-radius: 99px; padding: 2px 10px; font-size: 11.5px;
    font-weight: 600; margin-right: 6px;
  }
  .badge.none { background: #f2f5f9; color: #93a1b5; border-color: var(--border); }
  .badge.neutral { background: #eef3fb; color: #33507e; border-color: #dbe6f5; }

  /* ---------- Users list ---------- */
  .userrow { display: flex; justify-content: space-between; align-items: center; gap: 16px; transition: border-color .15s, transform .15s; }
  .userrow:hover { border-color: #bfead9; }
  .userrow h2 a:hover { color: var(--teal); }
  .userrow .go { color: var(--teal); font-weight: 600; font-size: 13px; }
  .userrow .go:hover { color: var(--green); }

  /* ---------- Chat ---------- */
  .chat { display: flex; flex-direction: column; gap: 4px; margin-top: 18px; }
  .msg { display: flex; gap: 10px; margin-top: 10px; max-width: 78%; }
  .msg.user { align-self: flex-end; flex-direction: row-reverse; }
  .avatar {
    width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0; display: flex;
    align-items: center; justify-content: center; margin-top: 2px;
  }
  .avatar.bot { background: var(--navy); }
  .avatar.user-av { background: #dbe6f5; color: #33507e; font-size: 12px; font-weight: 700; }
  .bubble {
    padding: 10px 14px; border-radius: 14px; font-size: 13.5px; line-height: 1.5;
    white-space: pre-wrap; word-break: break-word;
  }
  .msg.user .bubble { background: var(--navy); color: #fff; border-bottom-right-radius: 4px; }
  .msg.bot .bubble { background: #fff; border: 1px solid var(--border); border-bottom-left-radius: 4px; box-shadow: 0 1px 2px rgba(1,22,64,.04); }
  .meta { font-size: 11px; color: #9aa8bd; margin-top: 3px; }
  .msg.user .meta { text-align: right; }
  .chip {
    display: inline-block; background: #eafcf4; border: 1px solid #c6f2e0; border-radius: 5px;
    padding: 0 6px; font-family: ui-monospace, monospace; font-size: 10px; color: #027a52;
  }
  .chatwrap { background: #f8fafd; border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px 22px; }

  /* ---------- Stats ---------- */
  .stats { display: flex; gap: 12px; flex-wrap: wrap; margin: 4px 0 6px; }
  .stat {
    flex: 1; min-width: 130px; background: var(--card); border: 1px solid var(--border);
    border-radius: 13px; padding: 14px 18px 13px; box-shadow: var(--shadow);
    position: relative; overflow: hidden; transition: transform .15s, border-color .15s;
  }
  .stat::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 3px; background: var(--grad); opacity: 0; transition: opacity .15s; }
  .stat:hover { transform: translateY(-1px); border-color: #bfead9; }
  .stat:hover::before, .stat.active::before { opacity: 1; }
  .stat.active { border-color: var(--green); }
  .stat strong { font-size: 24px; display: block; font-weight: 700; letter-spacing: -.02em; }
  .stat span { font-size: 12px; color: var(--muted); font-weight: 500; }

  /* ---------- Tables ---------- */
  table.tickets { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  table.tickets th {
    text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: .08em;
    color: #93a1b5; font-weight: 600; padding: 8px 12px; border-bottom: 1px solid var(--border);
  }
  table.tickets td { padding: 12px; border-bottom: 1px solid #eef2f8; vertical-align: top; }
  table.tickets tr:last-child td { border-bottom: 0; }
  table.tickets tr:hover td { background: #f8fbfa; }
  table.tickets a { font-weight: 600; }
  table.tickets a:hover { color: var(--teal); }

  .pill {
    display: inline-flex; align-items: center; gap: 5px; border-radius: 99px; padding: 2.5px 10px;
    font-size: 11.5px; font-weight: 600; white-space: nowrap;
  }
  .pill::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .pill.p-urgent { background: #fdeaea; color: #b42222; }
  .pill.p-high { background: #fdf0e3; color: #b45d0d; }
  .pill.p-medium { background: #fdf8dc; color: #927607; }
  .pill.p-low { background: #f2f5f9; color: #6b7a93; }
  .pill.s-open { background: #e7effc; color: #1d54c4; }
  .pill.s-in_progress { background: #fdf4dd; color: #a06a08; }
  .pill.s-resolved { background: #e2f9ef; color: #067a4e; }
  .pill.s-closed { background: #eceff4; color: #5b6779; }

  /* ---------- Ticket detail ---------- */
  .detailgrid { display: grid; grid-template-columns: 1.6fr 1fr; gap: 14px; align-items: start; }
  @media (max-width: 900px) { .detailgrid { grid-template-columns: 1fr; } }
  .desc {
    background: #f8fafd; border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px;
    white-space: pre-wrap; word-break: break-word; line-height: 1.55; font-size: 13.5px;
  }
  .timeline { margin: 14px 0 2px; padding: 0; list-style: none; }
  .timeline li { position: relative; padding: 0 0 12px 22px; font-size: 12.5px; color: var(--muted); }
  .timeline li::before {
    content: ''; position: absolute; left: 4px; top: 5px; width: 8px; height: 8px;
    border-radius: 50%; background: var(--green);
  }
  .timeline li::after {
    content: ''; position: absolute; left: 7.5px; top: 15px; bottom: 0; width: 1px; background: var(--border);
  }
  .timeline li:last-child::after { display: none; }
  .timeline li.warn::before { background: #e8b40b; }

  form.ticket label {
    display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .07em;
    color: #93a1b5; font-weight: 600; margin: 16px 0 5px;
  }
  form.ticket select, form.ticket textarea {
    width: 100%; font: inherit; font-size: 13.5px; padding: 9px 11px; color: var(--text);
    border: 1px solid #d7dfeb; border-radius: 9px; background: #fff; transition: border-color .15s, box-shadow .15s;
  }
  form.ticket select:focus, form.ticket textarea:focus {
    outline: none; border-color: var(--green); box-shadow: 0 0 0 3px rgba(4,217,139,.15);
  }
  form.ticket textarea { min-height: 74px; resize: vertical; }
  form.ticket button {
    margin-top: 18px; width: 100%; background: var(--navy); color: #fff; border: 0;
    border-radius: 9px; padding: 11px 22px; font: inherit; font-size: 14px; font-weight: 600;
    cursor: pointer; transition: background .15s, transform .1s;
  }
  form.ticket button:hover { background: var(--navy-2); }
  form.ticket button:active { transform: scale(.99); }
  .hint { font-size: 12px; color: var(--muted); margin-top: 5px; }

  .flash {
    display: flex; align-items: center; gap: 10px; background: #e2f9ef; border: 1px solid #b5ecd4;
    color: #05603d; border-radius: 11px; padding: 12px 16px; margin: 14px 0; font-weight: 500; font-size: 13.5px;
  }

  .fade-in { opacity: 0; transform: translateY(8px); }
  @media (prefers-reduced-motion: reduce) { .fade-in { opacity: 1; transform: none; } }
`;

const SHELL_SCRIPT = `
  (function () {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll('.fade-in').forEach(function (el) { el.style.opacity = 1; el.style.transform = 'none'; });
      return;
    }
    function run() {
      if (!window.anime) {
        document.querySelectorAll('.fade-in').forEach(function (el) { el.style.opacity = 1; el.style.transform = 'none'; });
        return;
      }
      anime({
        targets: '.fade-in',
        opacity: [0, 1],
        translateY: [8, 0],
        duration: 420,
        delay: anime.stagger(45, { start: 40 }),
        easing: 'easeOutCubic',
      });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
  })();
`;

export interface ShellOptions {
  title: string;
  active: 'chats' | 'tickets';
  heading: string;
  subtitle?: string;
  crumb?: string; // pre-built HTML, already escaped
  body: string;
}

export function adminShell(opts: ShellOptions): string {
  const nav = [
    { key: 'chats', href: '/admin', icon: ICONS.chats, label: 'Conversaciones' },
    { key: 'tickets', href: '/admin/tickets', icon: ICONS.tickets, label: 'Tickets' },
  ]
    .map(
      (item) =>
        `<a href="${item.href}" class="${opts.active === item.key ? 'active' : ''}">${item.icon}<span>${item.label}</span></a>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${opts.title} — Vivo Assistant</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <style>${SHELL_CSS}</style>
  </head>
  <body>
    <div class="layout">
      <aside class="sidebar">
        <div class="brand">
          ${logomarkSvg('#ffffff', 46)}
          <div class="wordmark">Vivo Assistant<small>Panel de administración</small></div>
        </div>
        <div class="brand-rule"></div>
        <nav>${nav}</nav>
        <div class="spacer"></div>
        <div class="foot"><a href="/admin/logout">${ICONS.logout}<span>Cerrar sesión</span></a></div>
      </aside>
      <main class="content">
        <div class="pagehead fade-in">
          ${opts.crumb ? `<div class="crumb">${opts.crumb}</div>` : ''}
          <h1>${opts.heading}</h1>
          ${opts.subtitle ? `<p class="sub">${opts.subtitle}</p>` : ''}
        </div>
        ${opts.body}
      </main>
    </div>
    <script src="${ANIME_CDN}" defer></script>
    <script>window.addEventListener('load', function(){${SHELL_SCRIPT}});</script>
  </body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Login page                                                          */
/* ------------------------------------------------------------------ */

const LOGIN_CSS = `
  :root { --navy: ${BRAND.navy}; --green: ${BRAND.green}; }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--navy); color: #fff; display: flex; align-items: center; justify-content: center;
    overflow: hidden;
  }
  canvas#bg { position: fixed; inset: 0; width: 100%; height: 100%; }
  .veil {
    position: fixed; inset: 0;
    background: radial-gradient(ellipse at 50% 42%, rgba(1,22,64,0) 0%, rgba(1,22,64,.55) 68%, rgba(1,22,64,.9) 100%);
    pointer-events: none;
  }
  .panel {
    position: relative; width: min(400px, calc(100vw - 40px)); padding: 44px 40px 38px;
    background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.13);
    border-radius: 20px; backdrop-filter: blur(22px); -webkit-backdrop-filter: blur(22px);
    box-shadow: 0 24px 80px -24px rgba(0,0,0,.55);
    text-align: center; opacity: 0;
  }
  .panel .accent {
    position: absolute; top: 0; left: 40px; right: 40px; height: 2px; border-radius: 2px;
    background: linear-gradient(90deg, ${BRAND.teal}, ${BRAND.green} 55%, ${BRAND.lime});
  }
  .logo { margin-bottom: 10px; }
  h1 { font-size: 21px; font-weight: 700; margin: 4px 0 2px; letter-spacing: -.01em; }
  p.sub { margin: 0 0 28px; font-size: 13px; color: rgba(255,255,255,.55); }
  form { text-align: left; }
  label { display: block; font-size: 11px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: rgba(255,255,255,.5); margin-bottom: 7px; }
  input[type=password] {
    width: 100%; font: inherit; font-size: 15px; color: #fff; padding: 12px 14px;
    background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.16); border-radius: 11px;
    transition: border-color .2s, box-shadow .2s, background .2s;
  }
  input[type=password]::placeholder { color: rgba(255,255,255,.3); }
  input[type=password]:focus {
    outline: none; border-color: var(--green); background: rgba(255,255,255,.09);
    box-shadow: 0 0 0 3px rgba(4,217,139,.22);
  }
  button {
    width: 100%; margin-top: 18px; padding: 12px; font: inherit; font-size: 14.5px; font-weight: 600;
    color: #01261a; background: linear-gradient(100deg, ${BRAND.green}, #2fe3a0);
    border: 0; border-radius: 11px; cursor: pointer;
    box-shadow: 0 8px 24px -8px rgba(4,217,139,.55);
    transition: filter .15s, transform .1s;
  }
  button:hover { filter: brightness(1.06); }
  button:active { transform: scale(.985); }
  .error {
    display: flex; align-items: center; gap: 8px; background: rgba(255,90,90,.12);
    border: 1px solid rgba(255,110,110,.3); color: #ffb3b3; border-radius: 10px;
    padding: 10px 13px; font-size: 13px; margin-bottom: 18px;
  }
  .foot { margin-top: 26px; font-size: 11.5px; color: rgba(255,255,255,.35); }
  @media (prefers-reduced-motion: reduce) { .panel { opacity: 1 !important; } }
`;

/**
 * Animated brand background: floating gradient orbs on the corporate navy,
 * drawn on canvas, plus anime.js entrance choreography for the panel.
 */
const LOGIN_SCRIPT = `
  (function () {
    var COLORS = ['${BRAND.teal}', '${BRAND.green}', '${BRAND.lime}', '#0b2f6b'];
    var canvas = document.getElementById('bg');
    var ctx = canvas.getContext('2d');
    var orbs = [];
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function resize() {
      canvas.width = window.innerWidth * devicePixelRatio;
      canvas.height = window.innerHeight * devicePixelRatio;
    }
    window.addEventListener('resize', resize);
    resize();

    for (var i = 0; i < 7; i++) {
      orbs.push({
        x: Math.random(), y: Math.random(),
        r: 0.16 + Math.random() * 0.2,
        dx: (Math.random() - 0.5) * 0.00022,
        dy: (Math.random() - 0.5) * 0.00018,
        color: COLORS[i % COLORS.length],
        alpha: 0.1 + Math.random() * 0.12,
      });
    }

    function frame() {
      var w = canvas.width, h = canvas.height, m = Math.max(w, h);
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      orbs.forEach(function (o) {
        if (!reduced) {
          o.x += o.dx; o.y += o.dy;
          if (o.x < -0.2 || o.x > 1.2) o.dx *= -1;
          if (o.y < -0.2 || o.y > 1.2) o.dy *= -1;
        }
        var g = ctx.createRadialGradient(o.x * w, o.y * h, 0, o.x * w, o.y * h, o.r * m);
        g.addColorStop(0, o.color + Math.round(o.alpha * 255).toString(16).padStart(2, '0'));
        g.addColorStop(1, o.color + '00');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      });
      if (!reduced) requestAnimationFrame(frame);
    }
    frame();

    function enter() {
      var panel = document.querySelector('.panel');
      if (reduced || !window.anime) { panel.style.opacity = 1; return; }
      anime.timeline({ easing: 'easeOutCubic' })
        .add({ targets: '.panel', opacity: [0, 1], translateY: [22, 0], scale: [0.97, 1], duration: 620 })
        .add({ targets: '.logo svg path', opacity: [0, 1], translateY: [8, 0], delay: anime.stagger(90), duration: 420 }, '-=380')
        .add({ targets: ['.panel h1', '.panel .sub', '.panel form', '.panel .foot'], opacity: [0, 1], translateY: [8, 0], delay: anime.stagger(60), duration: 380 }, '-=300');
      var err = document.querySelector('.error');
      if (err) anime({ targets: err, translateX: [0, -7, 6, -4, 3, 0], duration: 480, easing: 'easeInOutSine', delay: 500 });
    }
    if (document.readyState === 'complete') enter();
    else window.addEventListener('load', enter);
  })();
`;

export function loginPage(error?: string): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Iniciar sesión — Vivo Assistant</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <style>${LOGIN_CSS}</style>
  </head>
  <body>
    <canvas id="bg"></canvas>
    <div class="veil"></div>
    <div class="panel">
      <div class="accent"></div>
      <div class="logo">${logomarkSvg('#ffffff', 96)}</div>
      <h1>Vivo Assistant</h1>
      <p class="sub">Panel de administración</p>
      ${error ? `<div class="error">⚠ ${error}</div>` : ''}
      <form method="post" action="/admin/login">
        <label for="key">Clave de acceso</label>
        <input id="key" type="password" name="key" placeholder="••••••••••••" autocomplete="current-password" autofocus required />
        <button type="submit">Entrar al panel</button>
      </form>
      <div class="foot">Acceso restringido · Alto Tráfico</div>
    </div>
    <script src="${ANIME_CDN}"></script>
    <script>${LOGIN_SCRIPT}</script>
  </body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Public (OAuth result) pages                                         */
/* ------------------------------------------------------------------ */

export function publicPage(title: string, message: string, ok = true): string {
  const accent = ok
    ? `linear-gradient(90deg, ${BRAND.teal}, ${BRAND.green} 55%, ${BRAND.lime})`
    : 'linear-gradient(90deg, #b45d0d, #e8b40b)';
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} — Vivo Assistant</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
        font-family: 'Inter', -apple-system, system-ui, sans-serif; background: ${BRAND.navy};
        background-image: radial-gradient(ellipse 80% 60% at 70% -10%, rgba(4,217,139,.16), transparent),
                          radial-gradient(ellipse 60% 50% at 10% 110%, rgba(2,106,96,.25), transparent);
      }
      .card {
        background: #fff; border-radius: 18px; padding: 44px 46px 38px; max-width: 460px; margin: 20px;
        box-shadow: 0 24px 80px -24px rgba(0,0,0,.5); text-align: center; position: relative; overflow: hidden;
      }
      .card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px;
        background: ${accent}; }
      h1 { font-size: 19px; margin: 18px 0 10px; color: #0e1b33; letter-spacing: -.01em; }
      p { color: #6b7a93; line-height: 1.55; margin: 0; font-size: 14px; }
    </style>
  </head>
  <body>
    <div class="card">
      ${logomarkSvg(BRAND.navy, 84)}
      <h1>${title}</h1>
      <p>${message}</p>
    </div>
  </body>
</html>`;
}
