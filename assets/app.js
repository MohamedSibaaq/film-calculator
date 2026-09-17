// ── State ────────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'filmCalc_v3';
const CONSENT_KEY = 'filmCalc_privacyConsent_v1';
const THEME_KEY = 'filmCalc_theme_v1';
let cfg = null;
let debouncer = null;

// Brand domain map for CDN logos (Clearbit)
const BRAND_DOMAINS = {
  'Kodak': 'kodak.com',
  'Fujifilm': 'fujifilm.com',
  'Ilford': 'ilfordphoto.com',
  'Lomography': 'lomography.com',
  'CineStill': 'cinestillfilm.com',
  'Kentmere': 'kentmere400.com',
  'Foma': 'foma.cz',
  'ADOX': 'adox.de',
  'ORWO': 'orwo.shop',
  'Rollei': 'rollei.com',
  'Harman': 'harmantechnology.com',
};

const FALLBACK = {
  site: {
    title: 'Film Cost Calculator',
    original_author: 'andikaraditya',
    original_repo: 'https://github.com/andikaraditya/film-calculator',
    fork_author: 'MohamedSibaaq',
    fork_repo: 'https://github.com/MohamedSibaaq/film-calculator',
  },
  app: { max_rolls: 10, default_rolls: 2 },
  film_formats: [
    { label: '35mm',              value: '35mm',      area_sqmm: 864    },
    { label: '35mm (Half-Frame)', value: '35mm_half', area_sqmm: 432    },
    { label: '120 - 6x4.5',      value: '120_645',   area_sqmm: 2700   },
    { label: '120 - 6x6',        value: '120_66',    area_sqmm: 3600   },
    { label: '120 - 6x7',        value: '120_67',    area_sqmm: 4200   },
    { label: '120 - 6x8',        value: '120_68',    area_sqmm: 4800   },
    { label: '120 - 6x9',        value: '120_69',    area_sqmm: 5400   },
    { label: '4x5 in',           value: '4x5',       area_sqmm: 121920 },
    { label: '8x10 in',          value: '8x10',      area_sqmm: 491520 },
  ],
  film_brands: [],
};

// ── Config load ───────────────────────────────────────────────────────────────
async function loadCfg() {
  try {
    const r = await fetch('/api/config');
    if (!r.ok) throw new Error(r.status);
    cfg = await r.json();
  } catch (e) {
    console.warn('/api/config unavailable, using fallback.', e);
    cfg = FALLBACK;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function parseNum(v) { return parseFloat(String(v).replace(/,/g,'')) || 0; }
function fmt2(n)     { return n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }
function debounceSave() {
  clearTimeout(debouncer);
  debouncer = setTimeout(saveAll, 350);
}
function getArea(val) {
  return (cfg.film_formats.find(f => f.value === val) || {}).area_sqmm || 864;
}
function getFormatLabel(val) {
  return (cfg.film_formats.find(f => f.value === val) || {}).label || val;
}
function getBrandDomain(name) {
  if (!name) return '';
  return BRAND_DOMAINS[name] || '';
}
function getBrandLogoUrl(name) {
  const domain = getBrandDomain(name);
  return domain ? `https://logo.clearbit.com/${domain}` : '';
}
function getBrandInitials(name) {
  if (!name) return '';
  return name.split(/\s+/).map(x => x[0]).join('').slice(0,2).toUpperCase();
}
function safeHref(href) {
  if (!href) return '';
  try {
    const url = new URL(href, window.location.origin);
    if (url.origin === window.location.origin) return url.href;
    if (url.protocol === 'https:' && url.hostname === 'github.com') return url.href;
  } catch {}
  return '';
}

function hasConsent() {
  return Boolean(localStorage.getItem(CONSENT_KEY));
}

function setConsent(mode) {
  localStorage.setItem(CONSENT_KEY, JSON.stringify({
    mode,
    timestamp: new Date().toISOString(),
  }));
}

function closeConsentModal() {
  const modal = document.getElementById('privacyModal');
  if (modal) modal.classList.remove('show');
}

function showConsentModalIfNeeded() {
  if (hasConsent()) return;
  const modal = document.getElementById('privacyModal');
  if (!modal) return;
  modal.classList.add('show');

  const accept = document.getElementById('consentAccept');
  const reject = document.getElementById('consentReject');
  accept.onclick = () => { setConsent('essential_only'); closeConsentModal(); };
  reject.onclick = () => { setConsent('reject_non_essential'); closeConsentModal(); };
}

function setTheme(mode) {
  const root = document.documentElement;
  root.setAttribute('data-theme', mode);
  localStorage.setItem(THEME_KEY, mode);
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.textContent = mode === 'light' ? 'Dark Mode' : 'Light Mode';
}

function initThemeToggle() {
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  setTheme(saved === 'light' ? 'light' : 'dark');
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    setTheme(current === 'dark' ? 'light' : 'dark');
  });
}

// ── Build option HTML ─────────────────────────────────────────────────────────
function fmtOptions(sel) {
  return cfg.film_formats.map(f =>
    `<option value="${esc(f.value)}"${f.value===sel?' selected':''}>${esc(f.label)}</option>`
  ).join('');
}
function brandOptions(sel) {
  const opts = (cfg.film_brands||[]).map(b =>
    `<option value="${esc(b.brand)}"${b.brand===sel?' selected':''}>${esc(b.brand)}</option>`
  ).join('');
  return `<option value="">Select brand...</option>${opts}<option value="__custom__"${sel==='__custom__'?' selected':''}>Custom (type own)…</option>`;
}
function stockOptions(brand, sel) {
  if (brand === '__custom__') return `<option value="__custom__"${sel==='__custom__'?' selected':''}>Custom (type own)…</option>`;
  const b = (cfg.film_brands||[]).find(x => x.brand === brand);
  if (!b) return '<option value="">Select brand first...</option>';
  const opts = b.films.map(f =>
    `<option value="${esc(f.name)}" data-iso="${f.iso}" data-type="${esc(f.type)}"${f.name===sel?' selected':''}>${esc(f.name)} (ISO ${f.iso})</option>`
  ).join('');
  return `<option value="">Select stock...</option>${opts}<option value="__custom__"${sel==='__custom__'?' selected':''}>Custom (type own)…</option>`;
}

// ── Badge ────────────────────────────────────────────────────────────────────
function updateBadge(form) {
  const sel   = form.querySelector('.film-stock');
  const el    = form.querySelector('.stock-meta');
  const opt   = sel.options[sel.selectedIndex];
  const type  = opt && opt.dataset.type;
  const iso   = opt && opt.dataset.iso;
  if (!type || !iso || !opt.value) { el.innerHTML=''; return; }
  const cls   = {color:'badge-color',bw:'badge-bw',slide:'badge-slide'}[type]||'badge-bw';
  const lbl   = {color:'Color',bw:'B&W',slide:'Slide'}[type]||type;
  el.innerHTML = `<span class="stock-badge ${cls}">${lbl} · ISO ${esc(iso)}</span>`;
}

function updateBrandMeta(form) {
  const brand = getEffectiveBrand(form);
  const meta = form.querySelector('.brand-meta');
  if (!meta) return;
  if (!brand) {
    meta.innerHTML = '';
    return;
  }

  const logoUrl = getBrandLogoUrl(brand);
  const initials = getBrandInitials(brand);
  meta.innerHTML = `<span class="brand-chip"><img class="brand-logo" alt="${esc(brand)} logo" loading="lazy" referrerpolicy="no-referrer"><span class="brand-fallback">${esc(initials)}</span><span>${esc(brand)}</span></span>`;

  const img = meta.querySelector('.brand-logo');
  const fallback = meta.querySelector('.brand-fallback');
  if (!img || !fallback) return;
  if (!logoUrl) {
    img.remove();
    return;
  }

  fallback.style.display = 'none';
  img.src = logoUrl;
  img.addEventListener('load', () => {
    img.style.display = 'inline-block';
    fallback.style.display = 'none';
  }, { once: true });
  img.addEventListener('error', () => {
    img.style.display = 'none';
    fallback.style.display = 'inline-grid';
  }, { once: true });
}

function renderBrandCell(brand) {
  if (!brand || brand === '—') return '—';
  const logoUrl = getBrandLogoUrl(brand);
  const initials = esc(getBrandInitials(brand));
  const safeBrand = esc(brand);
  if (!logoUrl) {
    return `<span class="brand-inline"><span class="brand-fallback-table">${initials}</span><span>${safeBrand}</span></span>`;
  }
  return `<span class="brand-inline"><img class="brand-logo-table" src="${esc(logoUrl)}" alt="${safeBrand} logo" loading="lazy" referrerpolicy="no-referrer" data-logo-fallback="true"><span class="brand-fallback-table brand-fallback-table--pending">${initials}</span><span>${safeBrand}</span></span>`;
}

function hydrateBrandLogoFallbacks(root) {
  root.querySelectorAll('img[data-logo-fallback="true"]').forEach(img => {
    const fallback = img.nextElementSibling;
    if (!fallback) return;

    const showLogo = () => {
      img.style.display = 'inline-block';
      fallback.style.display = 'none';
    };
    const showFallback = () => {
      img.style.display = 'none';
      fallback.style.display = 'inline-grid';
    };

    img.addEventListener('load', showLogo, { once: true });
    img.addEventListener('error', showFallback, { once: true });
    if (img.complete) (img.naturalWidth > 0 ? showLogo : showFallback)();
  });
}

// ── Custom brand/stock helpers ────────────────────────────────────────────────
function getEffectiveBrand(form) {
  const sel = form.querySelector('.film-brand');
  if (sel.value === '__custom__') return form.querySelector('.brand-custom-input').value.trim();
  return sel.value;
}
function getEffectiveStock(form) {
  const sel = form.querySelector('.film-stock');
  if (sel.value === '__custom__') return form.querySelector('.stock-custom-input').value.trim();
  return sel.value;
}
function syncCustomInputs(form) {
  const brandSel   = form.querySelector('.film-brand');
  const brandInput = form.querySelector('.brand-custom-input');
  const stockSel   = form.querySelector('.film-stock');
  const stockInput = form.querySelector('.stock-custom-input');
  brandInput.style.display = brandSel.value === '__custom__' ? 'block' : 'none';
  stockInput.style.display = stockSel.value === '__custom__' ? 'block' : 'none';
}

// ── Calculate ─────────────────────────────────────────────────────────────────
function calcForm(form) {
  const film = parseNum(form.querySelector('.film-price').value);
  const dev  = parseNum(form.querySelector('.dev-price').value);
  const exp  = parseInt(form.querySelector('.exposures').value)||0;
  const fmt  = form.querySelector('.film-format').value;
  const total = film + dev;
  const perExp  = exp>0 ? total/exp : null;
  const perSqmm = exp>0 ? total/(exp*getArea(fmt)) : null;
  form.querySelector('.cost').textContent       = perExp   != null ? `$${fmt2(perExp)}`     : '—';
  form.querySelector('.cost-sqmm').textContent  = perSqmm  != null ? `$${perSqmm.toFixed(6)}` : '—';
}

// ── Create card ───────────────────────────────────────────────────────────────
function getCurrentCount() { return document.querySelectorAll('.film-form').length; }

function createCard(idx, data={}) {
  const div = document.createElement('div');
  div.className = 'film-form';
  div.dataset.roll = idx;
  div.draggable = true;

  const showDel = getCurrentCount() > 0; // will be gated by updateDelBtns after

  div.innerHTML = `
    <div class="card-header">
      <input type="text" class="film-title" value="${esc(data.title||`Roll ${idx+1}`)}">
      <div class="card-actions">
        ${showDel?'<button type="button" class="btn-icon btn-del" title="Delete roll">✕</button>':''}
      </div>
    </div>
    <div class="field">
      <label class="field-label">Brand</label>
      <select class="field-input film-brand">${brandOptions(data.brand||'')}</select>
      <input type="text" class="field-input brand-custom-input" placeholder="Type brand name…" value="${esc(data.brandCustom||'')}">
      <div class="brand-meta"></div>
    </div>
    <div class="field">
      <label class="field-label">Film Stock</label>
      <select class="field-input film-stock">${stockOptions(data.brand||'',data.stock||'')}</select>
      <input type="text" class="field-input stock-custom-input" placeholder="Type stock name…" value="${esc(data.stockCustom||'')}">
      <div class="stock-meta"></div>
    </div>
    <div class="field">
      <label class="field-label">Film Format</label>
      <select class="field-input film-format">${fmtOptions(data.format||cfg.film_formats[0].value)}</select>
    </div>
    <div class="field toggle-field">
      <input type="checkbox" class="expired-flag" id="expired-${idx}" ${data.expired ? 'checked' : ''}>
      <label class="toggle-label" for="expired-${idx}">Expired Film</label>
    </div>
    <div class="field">
      <label class="field-label">Film Price</label>
      <input type="text" class="field-input film-price" placeholder="e.g. 12.50" value="${esc(data.film||'')}">
    </div>
    <div class="field">
      <label class="field-label">Dev / Scan Price</label>
      <input type="text" class="field-input dev-price" placeholder="e.g. 5.75" value="${esc(data.dev||'')}">
    </div>
    <div class="field">
      <label class="field-label">Exposures</label>
      <input type="number" class="field-input exposures" placeholder="e.g. 36" min="1" value="${esc(data.exposures||'')}">
    </div>
    <div class="result-panel">
      <div class="result-row">
        <span class="result-lbl">Cost / exposure</span>
        <span class="result-val cost">—</span>
      </div>
      <div class="result-row">
        <span class="result-lbl">Cost / sq.mm</span>
        <span class="result-val small cost-sqmm">—</span>
      </div>
    </div>
    <button type="button" class="btn btn-reset-roll">Reset Roll</button>
  `;

  // Brand → stock cascade
  const brandSel = div.querySelector('.film-brand');
  const stockSel = div.querySelector('.film-stock');
  brandSel.addEventListener('change', () => {
    stockSel.innerHTML = stockOptions(brandSel.value, '');
    syncCustomInputs(div);
    if (brandSel.value === '__custom__') div.querySelector('.brand-custom-input').focus();
    updateBrandMeta(div);
    updateBadge(div); calcForm(div); debounceSave(); updateComparison();
  });
  stockSel.addEventListener('change', () => {
    syncCustomInputs(div);
    if (stockSel.value === '__custom__') div.querySelector('.stock-custom-input').focus();
    updateBadge(div); calcForm(div); debounceSave(); updateComparison();
  });
  div.querySelector('.brand-custom-input').addEventListener('input', () => {
    updateBrandMeta(div); debounceSave(); updateComparison();
  });
  div.querySelector('.stock-custom-input').addEventListener('input', () => {
    debounceSave(); updateComparison();
  });

  updateBadge(div);
  updateBrandMeta(div);
  syncCustomInputs(div);

  // Other inputs
  const recalc = () => { calcForm(div); debounceSave(); updateComparison(); };
  div.querySelector('.film-format').addEventListener('change', recalc);
  div.querySelector('.exposures').addEventListener('input', recalc);
  div.querySelector('.expired-flag').addEventListener('change', () => { debounceSave(); updateComparison(); });
  ['.film-price','.dev-price'].forEach(sel => {
    const inp = div.querySelector(sel);
    inp.addEventListener('input', recalc);
    inp.addEventListener('blur', () => {
      const n = parseNum(inp.value);
      if (inp.value && !isNaN(n)) inp.value = fmt2(n);
      recalc();
    });
  });
  div.querySelector('.film-title').addEventListener('input', () => { debounceSave(); updateComparison(); });

  // Delete
  const delBtn = div.querySelector('.btn-del');
  if (delBtn) wireDelBtn(div, delBtn);

  // Reset roll
  div.querySelector('.btn-reset-roll').addEventListener('click', () => {
    const rollIdx = div.dataset.roll;
    if (!confirm(`Reset Roll ${+rollIdx+1}?`)) return;
    div.querySelector('.film-title').value = `Roll ${+rollIdx+1}`;
    div.querySelector('.film-price').value = '';
    div.querySelector('.dev-price').value  = '';
    div.querySelector('.exposures').value  = '';
    div.querySelector('.film-brand').value = '';
    stockSel.innerHTML = stockOptions('', '');
    div.querySelector('.brand-custom-input').value = '';
    div.querySelector('.stock-custom-input').value = '';
    syncCustomInputs(div);
    updateBrandMeta(div);
    div.querySelector('.stock-meta').innerHTML = '';
    div.querySelector('.film-format').value = cfg.film_formats[0].value;
    div.querySelector('.expired-flag').checked = false;
    calcForm(div); saveAll(); updateComparison();
  });

  calcForm(div);
  return div;
}

function wireDelBtn(form, btn) {
  btn.addEventListener('click', () => {
    const t = form.querySelector('.film-title').value;
    if (!confirm(`Delete "${t}"?`)) return;
    form.remove();
    updateAddBtn(); updateDelBtns(); renumber(); saveAll(); initDrag(); updateComparison();
  });
}

// ── Delete btn visibility ─────────────────────────────────────────────────────
function updateDelBtns() {
  const forms = [...document.querySelectorAll('.film-form')];
  forms.forEach(f => {
    let btn = f.querySelector('.btn-del');
    const actions = f.querySelector('.card-actions');
    if (forms.length > 1 && !btn) {
      btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'btn-icon btn-del'; btn.title = 'Delete roll'; btn.textContent = '✕';
      actions.appendChild(btn);
      wireDelBtn(f, btn);
    } else if (forms.length <= 1 && btn) {
      btn.remove();
    }
  });
}

function updateAddBtn() {
  const btn = document.getElementById('addRollBtn');
  const n = getCurrentCount(), max = cfg.app.max_rolls;
  btn.disabled = n >= max;
  btn.textContent = n >= max ? 'Max Rolls Reached' : '+ Add Roll';
}

function renumber() {
  document.querySelectorAll('.film-form').forEach((f,i) => {
    f.dataset.roll = i;
    const t = f.querySelector('.film-title');
    if (/^Roll \d+$/.test(t.value)) t.value = `Roll ${i+1}`;
  });
}

// ── Comparison table ──────────────────────────────────────────────────────────
function updateComparison() {
  const forms = [...document.querySelectorAll('.film-form')];
  const sec = document.getElementById('comparisonSection');
  if (forms.length < 2) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';

  const rows = forms.map(f => {
    const film = parseNum(f.querySelector('.film-price').value);
    const dev  = parseNum(f.querySelector('.dev-price').value);
    const exp  = parseInt(f.querySelector('.exposures').value)||0;
    const fmt  = f.querySelector('.film-format').value;
    const area = getArea(fmt);
    const total = film + dev;
    return {
      title:  f.querySelector('.film-title').value,
      brand:  getEffectiveBrand(f) || '—',
      stock:  getEffectiveStock(f) || '—',
      expired: f.querySelector('.expired-flag').checked,
      fmt:    getFormatLabel(fmt),
      exp,
      perExp:  exp>0 ? total/exp : null,
      perSqmm: exp>0 ? total/(exp*area) : null,
    };
  });

  const valid = rows.filter(r => r.perExp != null).map(r => r.perExp);
  const min   = valid.length ? Math.min(...valid) : null;

  const comparisonBody = document.getElementById('cmpBody');
  comparisonBody.innerHTML = rows.map(r => {
    const best = r.perExp != null && r.perExp === min && valid.length > 1;
    return `<tr class="${best?'row-best':''}">
      <td class="name">${esc(r.title)}${best?'<span class="badge-best">Best</span>':''}</td>
      <td>${renderBrandCell(r.brand)}</td>
      <td>${esc(r.stock)}</td>
      <td>${r.expired?'<span class="stock-badge badge-expired">Yes</span>':'<span class="stock-badge badge-fresh">No</span>'}</td>
      <td>${esc(r.fmt)}</td>
      <td>${r.exp||'—'}</td>
      <td class="cost-val">${r.perExp!=null?'$'+fmt2(r.perExp):'—'}</td>
      <td>${r.perSqmm!=null?'$'+r.perSqmm.toFixed(6):'—'}</td>
    </tr>`;
  }).join('');
  hydrateBrandLogoFallbacks(comparisonBody);
}

// ── Storage ───────────────────────────────────────────────────────────────────
function saveAll() {
  const data = [...document.querySelectorAll('.film-form')].map(f => ({
    title:     f.querySelector('.film-title').value,
    film:      f.querySelector('.film-price').value,
    dev:       f.querySelector('.dev-price').value,
    exposures: f.querySelector('.exposures').value,
    format:    f.querySelector('.film-format').value,
    brand:       f.querySelector('.film-brand').value,
    stock:       f.querySelector('.film-stock').value,
    brandCustom: f.querySelector('.brand-custom-input').value,
    stockCustom: f.querySelector('.stock-custom-input').value,
    expired:     f.querySelector('.expired-flag').checked,
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    const container = document.getElementById('container');
    container.innerHTML = '';
    const n = Math.min(data.length, cfg.app.max_rolls);
    for (let i=0; i<n; i++) container.appendChild(createCard(i, data[i]));
    return true;
  } catch { return false; }
}

// ── Drag and drop ─────────────────────────────────────────────────────────────
function initDrag() {
  const container = document.getElementById('container');
  let dragged = null;
  container.querySelectorAll('.film-form').forEach(f => {
    if (f._drag) return;
    f._drag = true;
    f.addEventListener('dragstart', e => { dragged=f; f.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; });
    f.addEventListener('dragend', () => { dragged=null; container.querySelectorAll('.film-form').forEach(x=>x.classList.remove('dragging')); saveAll(); updateComparison(); });
    f.addEventListener('dragover', e => {
      e.preventDefault();
      const t = e.target.closest('.film-form');
      if (!t||t===dragged) return;
      const after = e.clientY - t.getBoundingClientRect().top > t.getBoundingClientRect().height/2;
      container.insertBefore(dragged, after ? t.nextSibling : t);
    });
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot() {
  initThemeToggle();
  await loadCfg();

  // Apply site metadata
  const site = cfg.site || {};
  document.title = site.title || 'Film Cost Calculator';
  document.querySelector('.page-title').textContent = site.title || 'Film Roll Cost Calculator';

  const set = (id, href, txt) => {
    const el = document.getElementById(id);
    if (el) {
      const safe = safeHref(href);
      if (safe) el.href = safe;
      if (txt) el.textContent = txt;
    }
  };
  set('hdrGhLink',   site.fork_repo, null);
  set('origLink',    `https://github.com/${site.original_author||'andikaraditya'}`, site.original_author||'andikaraditya');
  set('forkLink',    `https://github.com/${site.fork_author||'MohamedSibaaq'}`, site.fork_author||'MohamedSibaaq');
  set('origRepoLink', site.original_repo, null);
  set('forkRepoLink', site.fork_repo, null);

  const container = document.getElementById('container');
  if (!loadFromStorage()) {
    const n = cfg.app.default_rolls || 2;
    for (let i=0; i<n; i++) container.appendChild(createCard(i));
  }

  updateAddBtn(); updateDelBtns(); initDrag(); updateComparison();

  document.getElementById('addRollBtn').addEventListener('click', () => {
    const n = getCurrentCount();
    if (n >= cfg.app.max_rolls) return;
    container.appendChild(createCard(n));
    updateAddBtn(); updateDelBtns(); initDrag(); saveAll(); updateComparison();
  });

  document.getElementById('resetAllBtn').addEventListener('click', () => {
    if (!confirm('Reset all rolls and clear saved data?')) return;
    localStorage.removeItem(STORAGE_KEY);
    container.innerHTML = '';
    const n = cfg.app.default_rolls || 2;
    for (let i=0; i<n; i++) container.appendChild(createCard(i));
    updateAddBtn(); updateDelBtns(); initDrag(); updateComparison();
  });

  // Hide loader
  const ldr = document.getElementById('loader');
  ldr.classList.add('out');
  setTimeout(() => ldr.remove(), 300);

  showConsentModalIfNeeded();
}

boot();
