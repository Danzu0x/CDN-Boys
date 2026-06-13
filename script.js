const $ = (id) => document.getElementById(id);

const fmt = (s) => {
  s = Math.floor(s);
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600);  s %= 3600;
  const m = Math.floor(s / 60);    s = Math.floor(s % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
};

const esc = (str) => String(str || '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const getToken = () => localStorage.getItem('dashboard_token') || '';
const setToken = (t) => localStorage.setItem('dashboard_token', t);

const authFetch = (url, opts = {}) => {
  opts.headers = { ...(opts.headers || {}), Authorization: `Bearer ${getToken()}` };
  return fetch(url, opts);
};

const NAV_ITEMS = [
  { href: '/', icon: '◆', label: 'Overview' },
  { href: '/plugins', icon: '▤', label: 'Plugins' },
  { href: '/groups', icon: '◎', label: 'Groups' },
  { href: '/system', icon: '▣', label: 'System' },
  { href: '/console', icon: '▶', label: 'Console' },
];

function initShell() {
  const currentPath = location.pathname === '' ? '/' : location.pathname;

  const navLinks = NAV_ITEMS.map(item => {
    const active = (item.href === '/' && currentPath === '/') ||
                   (item.href !== '/' && currentPath.endsWith(item.href));
    return `<a href="${item.href}" class="${active ? 'active' : ''}">
      <span class="icon">${item.icon}</span>${item.label}
    </a>`;
  }).join('');

  document.body.insertAdjacentHTML('afterbegin', `
    <div class="topbar">
      <h1 id="bot-name-top">—</h1>
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="status-dot-group">
          <span class="dot" id="top-dot"></span>
          <span id="top-conn">—</span>
        </div>
        <button class="hamburger" id="hamburger" aria-label="Menu">
          <span></span><span></span><span></span>
        </button>
      </div>
    </div>
    <div class="overlay" id="overlay"></div>
    <nav class="sidenav" id="sidenav">${navLinks}</nav>
  `);

  const hamburger = $('hamburger');
  const sidenav   = $('sidenav');
  const overlay   = $('overlay');

  const toggleNav = () => {
    const isOpen = sidenav.classList.toggle('open');
    overlay.classList.toggle('show', isOpen);
    hamburger.classList.toggle('open', isOpen);
    document.body.classList.toggle('locked', isOpen);
  };

  hamburger.addEventListener('click', toggleNav);
  overlay.addEventListener('click', toggleNav);

  sidenav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    sidenav.classList.remove('open');
    overlay.classList.remove('show');
    hamburger.classList.remove('open');
    document.body.classList.remove('locked');
  }));
}

function pollStatus(onData) {
  const update = async () => {
    try {
      const res  = await fetch('/api/status');
      const data = await res.json();

      const nameEl = $('bot-name-top');
      if (nameEl) nameEl.textContent = data.bot.name;

      const dot      = $('top-dot');
      const connText = $('top-conn');
      if (dot)      dot.className = 'dot ' + data.bot.connection;
      if (connText) connText.textContent = data.bot.connection;

      if (onData) onData(data);
    } catch {
      const dot = $('top-dot');
      const ct  = $('top-conn');
      if (dot) dot.className = 'dot offline';
      if (ct)  ct.textContent = 'unreachable';
    }
  };
  update();
  setInterval(update, 5000);
}

function initOverview() {
  pollStatus((data) => {
    const { bot, system, process: proc } = data;

    const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
    const setClass = (id, cls) => { const el = $(id); if (el) el.className = 'value ' + cls; };

    const dot = $('dot');
    if (dot) dot.className = 'dot ' + bot.connection;
    const connText = $('conn-text');
    if (connText) { connText.className = 'value ' + bot.connection; connText.textContent = bot.connection; }

    set('owner',    bot.owner);
    set('uptime',   fmt(bot.uptime));
    set('plugins',  bot.plugins);
    set('groups',   bot.groups);
    set('messages', bot.messages);
    set('bot-footer', bot.name);

    set('platform',   `${system.platform} (${system.arch})`);
    set('node',       system.node);
    set('sys-uptime', fmt(system.uptime));
    set('mem-label',  `${system.memory.used} / ${system.memory.total} MB`);
    const memBar = $('mem-bar');
    if (memBar) memBar.style.width = system.memory.percent + '%';
    set('cpu-label', `${system.cpu.usage}%`);
    const cpuBar = $('cpu-bar');
    if (cpuBar) cpuBar.style.width = system.cpu.usage + '%';

    set('pid',        proc.pid);
    set('proc-uptime', fmt(proc.uptime));
    set('heap-used',  `${proc.memory.heapUsed} / ${proc.memory.heapTotal} MB`);
    set('rss',        `${proc.memory.rss} MB`);

    const chart = $('chart');
    if (chart) {
      const currentHour = new Date().getHours();
      const maxVal = Math.max(...bot.messageHistory, 1);
      chart.innerHTML = bot.messageHistory.map((val, hour) => {
        const height = Math.max(2, (val / maxVal) * 110);
        const isNow  = hour === currentHour;
        return `<div class="bar-col">
          <div class="bar" style="height:${height}px;opacity:${isNow ? 1 : 0.6}"></div>
          <div class="bar-hour">${String(hour).padStart(2,'0')}</div>
        </div>`;
      }).join('');
    }

    const lu = $('last-update');
    if (lu) lu.textContent = new Date().toLocaleTimeString('id-ID', { hour12: false });
  });
}

function initPlugins() {
  pollStatus((data) => {
    const bf = $('bot-footer'); if (bf) bf.textContent = data.bot.name;
    const lu = $('last-update'); if (lu) lu.textContent = new Date().toLocaleTimeString('id-ID', { hour12: false });
  });

  let allPlugins = [];

  const renderPlugins = (plugins) => {
    const container = $('plugin-list');
    if (!container) return;
    if (!plugins.length) {
      container.innerHTML = '<div class="empty">Tidak ada plugin ditemukan</div>';
      return;
    }
    container.innerHTML = `
      <table class="plugin-table">
        <thead><tr><th>Command</th><th>Category</th><th>Description</th></tr></thead>
        <tbody>
          ${plugins.map(p => `
            <tr>
              <td>${(p.command || []).map(c => `<span class="cmd">${esc(c)}</span>`).join(' ')}</td>
              <td>${(p.category || []).map(c => `<span class="tag">${esc(c)}</span>`).join('')}</td>
              <td>${esc(p.description || '-')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  };

  fetch('/api/plugins').then(r => r.json()).then(({ plugins }) => {
    allPlugins = plugins || [];
    renderPlugins(allPlugins);
  }).catch(() => {
    const el = $('plugin-list');
    if (el) el.innerHTML = '<div class="empty">Gagal memuat daftar plugin</div>';
  });

  const search = $('search');
  if (search) {
    search.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) return renderPlugins(allPlugins);
      renderPlugins(allPlugins.filter(p =>
        (p.command || []).some(c => c.toLowerCase().includes(q)) ||
        (p.category || []).some(c => c.toLowerCase().includes(q)) ||
        (p.description || '').toLowerCase().includes(q)
      ));
    });
  }
}

function initGroups() {
  pollStatus((data) => {
    const bf = $('bot-footer'); if (bf) bf.textContent = data.bot.name;
    const tg = $('total-groups'); if (tg) tg.textContent = data.bot.groups;
    const lu = $('last-update'); if (lu) lu.textContent = new Date().toLocaleTimeString('id-ID', { hour12: false });
  });

  fetch('/api/groups').then(r => r.json()).then(({ groups }) => {
    const container = $('group-list');
    if (!container) return;
    if (!groups || !groups.length) {
      container.innerHTML = '<div class="empty">Belum ada data grup</div>';
      return;
    }
    container.innerHTML = groups.map(g => `
      <div class="group-item">
        <span class="group-name">${esc(g.name || g.id)}</span>
        <span class="group-meta">${g.participants || 0} members</span>
      </div>
    `).join('');
  }).catch(() => {
    const el = $('group-list');
    if (el) el.innerHTML = '<div class="empty">Gagal memuat daftar grup</div>';
  });
}

function initSystem() {
  pollStatus((data) => {
    const { system, process: proc, bot } = data;
    const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };

    set('bot-footer', bot.name);
    set('hostname',   system.hostname);
    set('platform',   system.platform);
    set('type',       system.type);
    set('release',    system.release);
    set('arch',       system.arch);
    set('node',       system.node);
    set('sys-uptime', fmt(system.uptime));
    set('ips',        (system.ips || []).join(', ') || '—');
    set('homedir',    system.homedir);
    set('tmpdir',     system.tmpdir);

    set('cpu-model',  system.cpu.model);
    set('cpu-cores',  system.cpu.cores);
    set('cpu-speed',  `${system.cpu.speed} MHz`);
    set('loadavg',    system.cpu.loadavg.join(' / '));
    set('cpu-label',  `${system.cpu.usage}%`);
    const cpuBar = $('cpu-bar');
    if (cpuBar) cpuBar.style.width = system.cpu.usage + '%';

    set('mem-label', `${system.memory.used} / ${system.memory.total} MB (${system.memory.percent}%)`);
    const memBar = $('mem-bar');
    if (memBar) memBar.style.width = system.memory.percent + '%';

    set('pid',        proc.pid);
    set('cwd',        proc.cwd);
    set('proc-uptime', fmt(proc.uptime));
    set('rss',        `${proc.memory.rss} MB`);
    set('heap',       `${proc.memory.heapUsed} / ${proc.memory.heapTotal} MB`);
    set('last-update', new Date().toLocaleTimeString('id-ID', { hour12: false }));
  });

  const restartBtn = $('restart-btn');
  if (restartBtn) {
    restartBtn.addEventListener('click', async () => {
      let token = getToken();
      if (!token) {
        token = prompt('Masukkan Dashboard Token:');
        if (!token) return;
        setToken(token);
      }
      if (!confirm('Yakin ingin restart bot sekarang?')) return;

      restartBtn.disabled = true;
      restartBtn.textContent = 'Restarting...';

      try {
        const res = await authFetch('/api/restart', { method: 'POST' });
        if (res.status === 401) {
          localStorage.removeItem('dashboard_token');
          alert('Token salah. Coba lagi.');
          restartBtn.disabled = false;
          restartBtn.textContent = 'Restart';
          return;
        }
        const data = await res.json();
        const msg  = $('restart-msg');
        const stat = $('restart-status');
        if (msg)  msg.style.display = 'flex';
        if (stat) { stat.textContent = data.message || 'Restarting...'; stat.className = 'value online'; }
      } catch {
        restartBtn.disabled = false;
        restartBtn.textContent = 'Restart';
        alert('Gagal mengirim permintaan restart');
      }
    });
  }
}

function initConsole() {
  pollStatus((data) => {
    const bf = $('bot-footer'); if (bf) bf.textContent = data.bot.name;
    const lu = $('last-update'); if (lu) lu.textContent = new Date().toLocaleTimeString('id-ID', { hour12: false });
  });

  const output   = $('output');
  const cmdInput = $('cmd-input');

  const appendLine = (text, cls = '') => {
    if (!output) return;
    const div = document.createElement('div');
    div.className = 'line' + (cls ? ' ' + cls : '');
    div.textContent = text;
    output.appendChild(div);
    output.scrollTop = output.scrollHeight;
  };

  const runCommand = async () => {
    if (!cmdInput) return;
    const cmd = cmdInput.value.trim();
    if (!cmd) return;
    cmdInput.value = '';
    appendLine('$ ' + cmd, 'cmd');

    try {
      const res = await authFetch('/api/console', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd }),
      });
      if (res.status === 401) {
        appendLine('[Error] Token tidak valid, silakan unlock ulang', 'err');
        localStorage.removeItem('dashboard_token');
        showGate();
        return;
      }
      const data = await res.json();
      if (data.output) appendLine(data.output.trimEnd());
      if (data.error)  appendLine('[Exit] ' + data.error, 'err');
      if (!data.output && !data.error) appendLine('(no output)');
    } catch (e) {
      appendLine('[Error] ' + e.message, 'err');
    }
  };

  const runBtn   = $('run-btn');
  const clearBtn = $('clear-btn');

  if (runBtn)   runBtn.addEventListener('click', runCommand);
  if (clearBtn) clearBtn.addEventListener('click', () => { if (output) output.innerHTML = ''; });
  if (cmdInput) cmdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runCommand(); });

  const showGate = () => {
    const g = $('gate-section');
    const c = $('console-section');
    if (g) g.style.display = 'block';
    if (c) c.style.display = 'none';
  };

  const showConsole = () => {
    const g = $('gate-section');
    const c = $('console-section');
    if (g) g.style.display = 'none';
    if (c) c.style.display = 'block';
    appendLine('Console ready. Type a command and press Enter.');
    if (cmdInput) cmdInput.focus();
  };

  const checkToken = async (token) => {
    try {
      const res  = await fetch('/api/auth/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      return data.valid;
    } catch { return false; }
  };

  const unlockBtn    = $('unlock-btn');
  const tokenInput   = $('token-input');
  const gateError    = $('gate-error');

  if (unlockBtn) {
    unlockBtn.addEventListener('click', async () => {
      const token = tokenInput?.value.trim();
      if (!token) return;
      const valid = await checkToken(token);
      if (valid) { setToken(token); showConsole(); }
      else if (gateError) gateError.textContent = 'Token salah';
    });
  }

  if (tokenInput) {
    tokenInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && unlockBtn) unlockBtn.click();
    });
  }

  (async () => {
    const stored = getToken();
    if (stored) {
      const valid = await checkToken(stored);
      if (valid) return showConsole();
    }
    showGate();
  })();
}

document.addEventListener('DOMContentLoaded', () => {
  initShell();

  const path = location.pathname;

  if (path === '/' || path === '/index.html' || path === '') {
    initOverview();
  } else if (path === '/plugins') {
    initPlugins();
  } else if (path === '/groups') {
    initGroups();
  } else if (path === '/system') {
    initSystem();
  } else if (path === '/console') {
    initConsole();
  }
});
