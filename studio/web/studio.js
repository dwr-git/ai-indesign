/* AI-InDesign — помощник и файлы на сервере внутри программы вёрстки.
 *
 * Панель в браузере разговаривает с моделью через api/assistant.php, а действия
 * выполняет в самом редакторе через window.aiindesign (apps/designcraft-web/src/web/bridge.rs):
 * те же методы, что у десктопного канала управления (crates/ui-egui/src/control.rs).
 * Файлы хранятся на вашем сервере (api/files.php), у каждого пользователя свои.
 * Шрифты: метрически совместимые открытые шрифты из папки fonts/ и шрифты организации с сервера.
 *
 * Без сборщиков и зависимостей: один файл, подключается из index.html.
 */
(() => {
  'use strict';

  const CFG = Object.assign({
    api: 'api/assistant.php',
    files: 'api/files.php',
    fonts: 'fonts/manifest.json',
    homeUrl: '../',
    labels: 'studio/ru-labels.json',
    autosaveSeconds: 60,       // автосохранение на сервер файла, который там уже лежит (0 — выключить)
    maxSteps: 40,              // шагов подряд в «Сделай» по умолчанию (в панели: шестерёнка → 10…без ограничений)
    screenshotMax: 1280,       // длинная сторона снимка экрана для модели, px
    openOnStart: false,
    filesOnStart: true,
    aiMaxChars: 60000,         // сколько символов выделенного текста (не больше) отправлять для «ИИ у выделения»
  }, window.STUDIO_CONFIG || {});
  // Страница сборки лежит в b/<номер>/ (studio/build/versioned.sh); адреса из настроек — от папки приложения.
  const fromRoot = (p) => { try { return new URL(p, window.STUDIO_ROOT || document.baseURI).href; } catch { return p; } };
  CFG.api = fromRoot(CFG.api);
  CFG.files = CFG.files ? fromRoot(CFG.files) : CFG.files;
  CFG.homeUrl = fromRoot(CFG.homeUrl || '../');
  // Редактор сам читает адрес домика из настроек.
  window.STUDIO_CONFIG = Object.assign(window.STUDIO_CONFIG || {}, { homeUrl: CFG.homeUrl });

  const READ_TOOLS = new Set(['find_commands', 'get_state', 'read_text', 'frame_details', 'look_at_screen']);
  // Никогда: файлы (их делает панель), служебное и интерфейс, печать, сценарии, внешние связи, шрифты.
  const DENY = /^(app\.|ui\.|help\.|window\.|file\.|font\.|print\.|script|book\.|package\.|library\.|links\.(relink|update|embed)|edit\.(paste|copy|cut)\b)/i;
  // Только после подтверждения пользователя.
  const CONFIRM = /^(edit\.clear|layout\.pages\.delete|layout\.parents\.delete|layout\.alternate\.delete|style\.(paragraph|character|object|cell|table)\.delete|story\.setText|find\.change|text\.delete|object\.pathfinder|type\.createOutlines|layout\.removeOverrides)/i;
  const MM = 72 / 25.4;      // пунктов в миллиметре
  const mm = (pt) => (typeof pt === 'number' ? Math.round((pt / MM) * 10) / 10 : pt);

  // ------------------------------------------------------------------ мост к редактору
  const VC = () => window.aiindesign;
  const PC = {
    ready: () => !!(VC() && typeof VC().request === 'function'),
    async call(method, params) {
      if (!PC.ready()) throw new Error('Редактор ещё загружается');
      return VC().request(method, params ?? {});
    },
    exec(id, params) {
      const p = params && typeof params === 'object' && !Array.isArray(params) ? params : {};
      return PC.call('engine.execute', { command: id, params: p });
    },
  };
  // Для своих скриптов и отладки из консоли: await aiindesignStudio.exec('layout.pages.insert', {count: 1})
  window.aiindesignStudio = { call: PC.call, exec: PC.exec };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const withTimeout = (p, ms, what) => Promise.race([p, sleep(ms).then(() => { throw new Error(what + ': нет ответа'); })]);
  const clip = (s, n) => (s.length > n ? s.slice(0, n) + '…[обрезано]' : s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('aiindesign.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('aiindesign.' + k, JSON.stringify(v)); } catch { /* приватный режим */ } },
  };

  // ------------------------------------------------------------------ русские названия
  let L = { text: {}, id: {} };
  const labelsLoaded = fetch(CFG.labels).then((r) => (r.ok ? r.json() : L)).then((j) => { L = j; }).catch(() => {});
  function ru(label) {
    if (!label) return '';
    if (L.text[label]) return L.text[label];
    const bare = label.replace(/…$/, '');
    if (bare !== label && L.text[bare]) return L.text[bare] + '…';
    return label;
  }
  const menuOf = (c) => String(c.location || c.menu || '').split('›').map((x) => x.trim()).filter(Boolean);
  const ruName = (c) => L.id[c.id] || ru(c.label);
  const ruPath = (c) => [...menuOf(c).map(ru), ruName(c)].join(' › ');

  // ------------------------------------------------------------------ поиск команд
  let catalog = null;
  let catalogAt = 0;
  async function commands() {
    if (!catalog || Date.now() - catalogAt > 30000) {
      const r = await PC.call('engine.commands');
      catalog = Array.isArray(r) ? r : (r && Array.isArray(r.commands) ? r.commands : []);
      catalogAt = Date.now();
    }
    return catalog;
  }
  // Частые просьбы → слова, которыми такие команды называются.
  const SYN = [
    [/страниц/, 'page pages'], [/добав\S* страниц|нов\S* страниц/, 'insert pages'], [/удал\S* страниц/, 'delete pages'], [/разворот/, 'spread'],
    [/мастер|шаблон\S* страниц|родительск/, 'parent parents'], [/пол[яеи]\b|поля страниц/, 'margins columns'], [/колонк|столбц/, 'columns gutter'],
    [/размер страниц|формат|а4|а5|а3/, 'page size document setup'], [/вылет|обрез/, 'bleed slug document setup'], [/направляющ|сетк/, 'guides grid'],
    [/рамк|фрейм/, 'frame'], [/текстов\S* (рамк|фрейм|блок)/, 'text frame'], [/картин|изображен|рисун|фото/, 'place graphic image fit'], [/вписа|подогна/, 'fit fitting'],
    [/обтекан/, 'text wrap'], [/связ\S* (рамк|фрейм)|перетек|цепоч/, 'thread text frames'], [/переполн|не влез/, 'overset fit'],
    [/шрифт|гарнитур/, 'font character fontFamily'], [/кегль|размер шрифта/, 'size character'], [/интерлиньяж|межстроч/, 'leading character'],
    [/трекинг|разрядк|кернинг/, 'tracking kerning character'], [/выравн\S* текст|по центру|по ширине|по левому|по правому/, 'align paragraph'],
    [/отступ|красн\S* строк/, 'indent paragraph'], [/буквиц/, 'drop cap paragraph'], [/перенос/, 'hyphenation hyphenate'],
    [/стил\S* абзац|абзацн\S* стил/, 'paragraph style'], [/символьн\S* стил|стил\S* символ/, 'character style'], [/стил\S* объект/, 'object style'], [/стил/, 'style'],
    [/цвет|образец|образц/, 'swatch color fill'], [/заливк/, 'fill swatch'], [/обводк|контур|линия/, 'stroke'], [/прозрачн|непрозрачн/, 'opacity effects'],
    [/тен[ьи]/, 'drop shadow effects'], [/скругл|угл/, 'corner options'], [/выравн\S* объект|распредел/, 'align distribute'], [/групп/, 'group'],
    [/на передний|на задний|порядок/, 'arrange front back'], [/сло[йия]/, 'layer'], [/таблиц/, 'table'], [/список|маркир|нумерац/, 'bullets numbering list'],
    [/номер\S* страниц|колонтитул/, 'page number marker section numbering'], [/оглавлен|содержан/, 'table of contents toc'], [/сноск/, 'footnote'],
    [/найти/, 'find'], [/замен/, 'change find'], [/орфограф|правопис/, 'spelling'], [/qr/, 'qr code'], [/отмен/, 'undo'], [/масштаб/, 'zoom view'],
  ];
  const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');
  async function findCommands(query) {
    const all = await commands();
    await labelsLoaded;
    const q = norm(query).trim();
    if (!q) return { results: [], hint: 'Пустой запрос' };
    const terms = new Set(q.split(/[^\p{L}\p{N}.]+/u).filter((t) => t.length > 1));
    for (const [re, words] of SYN) if (re.test(q)) words.split(' ').forEach((w) => terms.add(w));
    const scored = [];
    for (const c of all) {
      if (DENY.test(c.id)) continue;
      const name = norm(ruName(c));
      const en = norm(c.label);
      const path = norm(menuOf(c).map(ru).join(' ') + ' ' + menuOf(c).join(' '));
      const id = norm(c.id);
      let s = 0;
      if (name === q || en === q) s += 20;
      else if (name.includes(q) || en.includes(q)) s += 10;
      for (const t of terms) {
        if (name.includes(t)) s += name.startsWith(t) ? 7 : 5;
        if (en.includes(t)) s += en.startsWith(t) ? 6 : 4;
        if (id.includes(t)) s += 3;
        if (path.includes(t)) s += 1;
      }
      if (s > 0) scored.push([s + (c.params && c.params !== '{}' ? 1 : 0), c]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    const results = scored.slice(0, 10).map(([, c]) => ({
      id: c.id,
      name: ruName(c),
      menu: ruPath(c),
      shortcut: c.shortcut || undefined,
      params: c.params && c.params !== '{}' ? clip(String(c.params), 600) : undefined,
    }));
    return results.length ? { results } : { results: [], hint: 'Ничего не найдено. Попробуй другие слова, можно по-английски (например: frame, page, style, margins, swatch, columns).' };
  }

  // ------------------------------------------------------------------ состояние и снимок экрана
  // Байтовые смещения движка (UTF-8) ↔ строки JavaScript (UTF-16).
  const ENC = new TextEncoder();
  const DEC = new TextDecoder();
  const sliceBytes = (text, from, to) => DEC.decode(ENC.encode(String(text || '')).slice(from, to));
  const byteLen = (text) => ENC.encode(String(text || '')).length;
  // Рамка кратко: что это, где (мм от левого верхнего угла её страницы), какой текст.
  function itemSummary(it, page) {
    const b = Array.isArray(it.bounds) ? it.bounds : [0, 0, 0, 0];
    const x0 = page ? b[0] - page.bounds[0] : b[0];
    const o = { id: it.id, kind: it.kind, x: mm(x0), y: mm(b[1]), w: mm(b[2] - b[0]), h: mm(b[3] - b[1]) };
    if (it.name) o.name = it.name;
    if (it.story != null) o.story = it.story;
    if (it.fill) o.fill = it.fill;
    if (it.locked) o.locked = true;
    if (it.hidden) o.hidden = true;
    if (Array.isArray(it.children)) o.children = it.children.length;
    return o;
  }
  // Страница, на которой лежит рамка (по её центру по горизонтали).
  function pageOf(pages, it) {
    const b = it.bounds || [0, 0, 0, 0];
    const cx = (b[0] + b[2]) / 2;
    return pages.find((p) => cx >= p.bounds[0] && cx <= p.bounds[2]) || pages[0];
  }
  // Текущая публикация: имя, сохранена ли, страницы и рамки кратко, тексты, стили, выделение.
  async function snapshot() {
    const state = {};
    try {
      const d = await PC.call('document.inspect');
      state.title = d.title;
      state.unsaved = !!d.dirty;
      state.onServer = !!d.path && Files.isServer(d.path);
      state.pageCount = d.pageCount;
      if (d.settings) state.pageMm = { width: mm(d.settings.pageWidth), height: mm(d.settings.pageHeight), facing: !!d.settings.facingPages };
      const stories = new Map((d.stories || []).map((st) => [st.id, st]));
      const pages = [];
      state.pages = [];
      for (const sp of d.spreads || []) {
        for (const pg of sp.pages || []) pages.push({ ...pg, spread: sp.index });
        for (const pg of sp.pages || []) {
          const items = (sp.items || []).filter((it) => pageOf(sp.pages, it) === pg);
          state.pages.push({
            n: pg.index + 1, name: pg.name, spread: sp.index, parent: pg.parent || undefined,
            margins: pg.margins ? { top: mm(pg.margins.top), bottom: mm(pg.margins.bottom), inside: mm(pg.margins.inside), outside: mm(pg.margins.outside) } : undefined,
            columns: pg.columns > 1 ? pg.columns : undefined,
            items: items.slice(0, 30).map((it) => {
              const o = itemSummary(it, pg);
              const st = it.story != null ? stories.get(it.story) : null;
              if (st) { o.text = clip(String(st.preview || ''), 60); if (st.overset) o.overset = true; }
              return o;
            }),
          });
          if (state.pages.length >= 40) break;
        }
        if (state.pages.length >= 40) { state.more = `ещё страниц: ${d.pageCount - 40}`; break; }
      }
      state.paragraphStyles = (d.paragraphStyles || []).slice(0, 40);
      state.characterStyles = (d.characterStyles || []).slice(0, 30);
      state.swatches = (d.swatches || []).slice(0, 30);
      const sel = d.selection || {};
      if (sel.text) {
        state.textSelection = { story: sel.text.story, anchor: sel.text.anchor, focus: sel.text.focus };
        try {
          const st = await PC.exec('story.get', { story: sel.text.story });
          const [a, f] = [Math.min(sel.text.anchor, sel.text.focus), Math.max(sel.text.anchor, sel.text.focus)];
          if (f > a) state.textSelection.text = clip(sliceBytes(st.text, a, f), 300);
        } catch { /* не важно */ }
      }
      if (Array.isArray(sel.items) && sel.items.length) state.selectedItems = sel.items;
      if (d.tool) state.tool = d.tool;
    } catch (e) {
      state.note = 'Публикация не открыта (начальный экран). Можно создать новую: Файл › Создать › Документ.';
    }
    return state;
  }
  // Тексты публикации: все истории (или одна) целиком, с номерами абзацев.
  async function readText(storyId) {
    const d = await PC.call('document.inspect');
    const list = (d.stories || []).filter((st) => storyId == null || st.id === Number(storyId));
    if (storyId != null && !list.length) throw new Error(`Нет истории ${storyId}. Список — в get_state (story у текстовых рамок).`);
    const out = [];
    let size = 0;
    for (const st of list) {
      const full = await PC.exec('story.get', { story: st.id });
      const paras = String(full.text || '').split('\n');
      const head = `=== История ${st.id} (рамки ${(full.frames || []).join(', ')}${full.overset != null ? `; не помещается: ${full.oversetChars} симв.` : ''}) ===`;
      const body = paras.map((t, i) => `[${i}] ${t}`).join('\n');
      size += head.length + body.length;
      out.push(head + '\n' + body);
      if (size > 24000) { out.push('…дальше — read_text {story: N} для каждой истории'); break; }
    }
    return { stories: (d.stories || []).length, text: clip(out.join('\n\n'), 26000) };
  }
  // Одна рамка подробно: границы, обводка, заливка, текст её истории.
  async function frameDetails(id) {
    const d = await PC.call('document.inspect');
    for (const sp of d.spreads || []) {
      const it = (sp.items || []).find((x) => x.id === Number(id));
      if (!it) continue;
      const o = { ...itemSummary(it, pageOf(sp.pages, it)), spread: sp.index, page: (pageOf(sp.pages, it) || {}).index + 1, stroke: it.stroke, columns: it.columns };
      if (it.story != null) {
        const st = await PC.exec('story.get', { story: it.story });
        o.text = clip(String(st.text || ''), 4000);
        o.lines = st.lines;
        if (st.overset != null) o.oversetChars = st.oversetChars;
      }
      return o;
    }
    throw new Error(`Нет рамки ${id}. Список рамок — в get_state.`);
  }

  function downscale(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, CFG.screenshotMax / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.75).split(',')[1]);
      };
      img.onerror = () => reject(new Error('не удалось прочитать снимок'));
      img.src = src;
    });
  }
  async function screenshot() {
    if (!PC.ready()) return null;
    try {
      const r = await withTimeout(VC().screenshot(), 9000, 'снимок');
      const b64 = r && (r.png || r.pngBase64 || r.data);
      if (typeof b64 === 'string' && b64.length > 100) return await downscale('data:image/png;base64,' + b64);
    } catch { /* ниже */ }
    return null;
  }

  // ------------------------------------------------------------------ интерфейс
  const ICON = {
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>',
    bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>',
    hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4l6 6-9 9H5v-6z"/><path d="M12.5 5.5l6 6"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2.2a2 2 0 0 0-1.4 3.4A1.6 1.6 0 0 1 12 22z"/><circle cx="7.5" cy="10.5" r="1.2"/><circle cx="12" cy="7.5" r="1.2"/><circle cx="16.5" cy="10.5" r="1.2"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>',
    // Мозг — контур из набора Tabler Icons (MIT), нарисованный градиентом #st-brain-grad.
    brain: '<svg class="st-brain-svg" viewBox="0 0 24 24" fill="none" stroke="url(#st-brain-grad)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 13a3.5 3.5 0 0 0 -3.5 3.5v1a3.5 3.5 0 0 0 7 0v-1.8"/><path d="M8.5 13a3.5 3.5 0 0 1 3.5 3.5v1a3.5 3.5 0 0 1 -7 0v-1.8"/><path d="M17.5 16a3.5 3.5 0 0 0 0 -7h-.5"/><path d="M19 9.3v-2.8a3.5 3.5 0 0 0 -7 0"/><path d="M6.5 16a3.5 3.5 0 0 1 0 -7h.5"/><path d="M5 9.3v-2.8a3.5 3.5 0 0 1 7 0v10"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    layout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3l-8 11h6l-1 7 8-11h-6z"/></svg>',
  };
  // Живой контур: мозг градиентом и три точки на орбите, пока помощник работает.
  const BRAIN = `${ICON.brain}<b class="st-orbit" aria-hidden="true"><i></i><i></i><i></i></b>`;

  const root = document.createElement('div');
  root.id = 'studio-root';
  root.dataset.theme = 'light';
  root.innerHTML = `
    <svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><linearGradient id="st-brain-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fa2ff"/><stop offset=".55" stop-color="#9b7cf0"/><stop offset="1" stop-color="#ff77c6"/></linearGradient></defs></svg>
    <div class="st-veil" aria-hidden="true"></div>
    <div class="st-drop" aria-hidden="true"><span>Отпустите, чтобы открыть в редакторе</span></div>
    <aside class="st-panel" aria-label="Помощник">
      <header class="st-head">
        <div class="st-logo st-brain st-raised-sm" aria-hidden="true">${BRAIN}</div>
        <div class="st-title"><b>Помощник</b><small data-ref="sub">Загрузка редактора…</small></div>
        <button class="st-icon-btn" data-ref="galleryBtn" title="Быстрые задачи: страницы, рамки, колонки, экспорт…" aria-label="Быстрые задачи">${ICON.layout}</button>
        <button class="st-icon-btn" data-ref="filesBtn" title="Мои файлы (на сервере)" aria-label="Мои файлы">${ICON.folder}</button>
        <button class="st-icon-btn" data-ref="barBtn" title="Быстрая строка (Ctrl+Shift+Пробел)" aria-label="Быстрая строка">${ICON.bolt}</button>
        <div class="st-theme-wrap">
          <button class="st-icon-btn" data-ref="theme" title="Тема оформления" aria-label="Тема оформления" aria-haspopup="menu" aria-expanded="false">${ICON.palette}</button>
          <div class="st-theme-menu" data-ref="themeMenu" role="menu" hidden></div>
        </div>
        <button class="st-icon-btn" data-ref="hide" title="Свернуть панель" aria-label="Свернуть панель">${ICON.close}</button>
      </header>
      <div class="st-seg st-pressed" role="group" aria-label="Режим помощника">
        <button data-mode="advice" aria-pressed="true">${ICON.bulb}Совет</button>
        <button data-mode="act" aria-pressed="false">${ICON.hand}Сделай</button>
      </div>
      <div class="st-mode-hint" data-ref="hint"></div>
      <div class="st-log" data-ref="log" role="log" aria-live="polite"></div>
      <div class="st-composer">
        <div class="st-input st-pressed">
          <button class="st-icon-btn" data-ref="eye" aria-pressed="true" title="Показывать помощнику экран" aria-label="Показывать помощнику экран">${ICON.eye}</button>
          <textarea data-ref="input" rows="1" placeholder="Спросите или попросите…" aria-label="Сообщение помощнику"></textarea>
          <button class="st-send" data-ref="send" title="Отправить (Enter)" aria-label="Отправить">${ICON.send}</button>
        </div>
        <div class="st-foot"><span>Ctrl+Z — отменить</span><span class="st-agent-wrap"><button data-ref="agentBtn" title="Сколько шагов подряд делать и спрашивать ли перед удалением" aria-haspopup="menu" aria-expanded="false">${ICON.gear}Настройки</button><span class="st-theme-menu st-agent-menu" data-ref="agentMenu" role="menu" hidden></span></span><button data-ref="clear">Новый разговор</button></div>
      </div>
    </aside>
    <div class="st-files" data-ref="files" role="dialog" aria-modal="true" aria-label="Мои файлы" hidden>
      <div class="st-files-box">
        <header class="st-files-head">
          <b>Мои публикации</b><small data-ref="filesWho"></small>
          <button class="st-icon-btn" data-ref="filesClose" title="Закрыть (Esc)" aria-label="Закрыть">${ICON.x}</button>
        </header>
        <div class="st-files-tools">
          <input data-ref="filesSearch" type="search" placeholder="Поиск по имени" aria-label="Поиск по имени">
          <button class="st-mini" data-ref="filesNew">Новая публикация</button>
          <button class="st-mini" data-ref="filesUpload" title=".designcraft, .idml, .indd, .indt">С компьютера…</button>
        </div>
        <div class="st-files-list" data-ref="filesList"></div>
        <footer class="st-files-foot">
          <span data-ref="filesCurrent"></span>
          <button class="st-mini" data-ref="filesSaveAs">Сохранить как…</button>
          <button class="st-mini primary" data-ref="filesSave">Сохранить</button>
        </footer>
      </div>
    </div>
    <div class="st-files st-gallery" data-ref="gallery" role="dialog" aria-modal="true" aria-label="Быстрые задачи" hidden>
      <div class="st-files-box st-gallery-box">
        <header class="st-files-head">
          <b>Быстрые задачи</b>
          <small>В одно нажатие. Действуют на текущую страницу или на всю публикацию.</small>
          <button class="st-icon-btn" data-ref="galleryClose" title="Закрыть (Esc)" aria-label="Закрыть">${ICON.x}</button>
        </header>
        <div class="st-gpane"><div class="st-gtasks" data-ref="gTasks"></div></div>
      </div>
    </div>
    <div class="st-ask" data-ref="ask" role="dialog" aria-modal="true" hidden>
      <form class="st-ask-box">
        <b data-ref="askTitle"></b>
        <input data-ref="askInput" type="text" maxlength="120">
        <small data-ref="askNote"></small>
        <div class="st-row"><button type="button" class="st-mini" data-ref="askCancel">Отмена</button><button type="submit" class="st-mini primary" data-ref="askOk">OK</button></div>
      </form>
    </div>
    <button class="st-fab st-brain" data-ref="fab" title="Помощник" aria-label="Открыть помощника">${BRAIN}<span class="st-badge" aria-hidden="true"></span></button>
    <div class="st-bar" data-ref="bar" role="dialog" aria-label="Быстрая строка помощника">
      <div class="st-bar-answer" data-ref="barAnswer"></div>
      <div class="st-bar-row">
        <button class="st-bar-mode" data-ref="barMode" title="Режим: Совет или Сделай"></button>
        <input data-ref="barInput" type="text" placeholder="Что написать или поправить? Enter — отправить, Esc — закрыть" aria-label="Запрос помощнику">
        <button class="st-send" data-ref="barSend" aria-label="Отправить">${ICON.send}</button>
      </div>
    </div>`;
  const $ = (name) => root.querySelector(`[data-ref="${name}"]`);
  const log = $('log');
  const input = $('input');

  // Клавиши, набранные в панели, не должны доходить до редактора (иначе «B» выберет кисть).
  for (const type of ['keydown', 'keyup', 'keypress', 'paste', 'copy', 'cut']) {
    root.addEventListener(type, (e) => e.stopPropagation());
  }

  let mode = store.get('mode', 'advice');
  let attachScreen = store.get('eye', true);
  let busy = false;
  let stopRequested = false;
  let convo = [];

  const HINTS = {
    advice: 'Объясняю и подсказываю, ничего не меняю в публикации.',
    act: 'Делаю сам: добавляю страницы и рамки, пишу и правлю текст, настраиваю стили, поля и колонки. Всё отменяется Ctrl+Z.',
  };
  // Модель видит всю переписку. Если раньше она писала «я в режиме Совет», то по инерции продолжает
  // так отвечать и после переключения. Поэтому смена режима отмечается прямо в разговоре,
  // а каждое сообщение пользователя несёт текущий режим.
  const MODE_NOTE = {
    act: '[Режим переключён на «Сделай». Теперь ты сам выполняешь просьбы инструментами (read_text, run_command, add_text_frame…). Всё, что ты раньше писал про режим «Совет», больше не действует.]',
    advice: '[Режим переключён на «Совет». Теперь только объясняй и подсказывай, ничего не меняй в публикации.]',
  };
  const MODE_TAG = {
    act: '[Режим сейчас: «Сделай» — выполни это сам, инструментами]',
    advice: '[Режим сейчас: «Совет» — объясни, как сделать, ничего не меняя]',
  };
  function setMode(m) {
    const next = m === 'act' ? 'act' : 'advice';
    if (next !== mode && convo.length) convo.push({ role: 'user', content: MODE_NOTE[next] });
    mode = next;
    store.set('mode', mode);
    root.querySelectorAll('.st-seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    $('hint').textContent = HINTS[mode];
    const bm = root.querySelector('[data-ref="barMode"]');
    if (bm) bm.textContent = mode === 'act' ? 'Сделай' : 'Совет';
  }
  function setEye(on) {
    attachScreen = !!on;
    store.set('eye', attachScreen);
    $('eye').setAttribute('aria-pressed', String(attachScreen));
    $('eye').title = attachScreen ? 'Помощник видит экран' : 'Помощник не видит экран';
  }
  function setOpen(open) {
    root.classList.toggle('open', open);
    document.body.classList.toggle('studio-open', open);
    setTimeout(syncBackdrop, 60);
    setTimeout(syncBackdrop, 400);
    store.set('open', open);
    // eframe подхватывает новый размер canvas на следующем кадре
    window.dispatchEvent(new Event('resize'));
    if (open) { setTimeout(() => input.focus(), 200); root.classList.remove('has-hints'); }
  }
  function setBusy(on) {
    busy = on;
    root.classList.toggle('busy', on);
    $('send').innerHTML = on ? ICON.stop : ICON.send;
    $('send').title = on ? 'Остановить' : 'Отправить (Enter)';
  }
  function scroll() { log.scrollTop = log.scrollHeight; }

  function format(text) {
    // Строки списка «- …» / «* …» — с точкой; короткая строка, оканчивающаяся двоеточием, — заголовок.
    text = text.trim().split('\n').map((line) => {
      const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (li) return '\u0001' + (/^\s*\d/.test(line) ? line.trim().match(/^\d+[.)]/)[0] + ' ' : '• ') + li[1] + '\u0002';
      const head = line.match(/^\s*(?:#{1,4}\s*)?\**([^*:]{2,60}):\**\s*$/);
      if (head) return '\u0003' + head[1] + ':\u0004';
      return line.replace(/^#{1,4}\s+/, '');
    }).join('\n').replace(/\u0002\n/g, '\u0002');  // пункт списка — блок: перенос после него лишний
    let h = esc(text);
    h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    h = h.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
    h = h.replace(/\((Ctrl|Shift|Alt|Cmd|⌘|⇧|⌥)([^)\n]{0,24})\)/g, '(<kbd>$1$2</kbd>)');
    // «Изображение › Коррекция › Кривые» — путь в меню
    // Сегменты — слова через одиночные пробелы: конечный пробел не должен «съедать» разделитель.
    const C = '[^\\s›«»"():.,!?;<>&]';
    const word = `${C}+`;
    const path = new RegExp(`([А-ЯЁA-Z]${C}*(?: ${word}){0,2}(?: › ${word}(?: ${word}){0,3}){1,4})`, 'g');
    h = h.replace(path, '<span class="st-path">$1</span>');
    h = h.replace(/\u0001/g, '<span class="st-li">').replace(/\u0002/g, '</span>')
      .replace(/\u0003/g, '<span class="st-h">').replace(/\u0004/g, '</span>');
    return h;
  }
  function add(el) { log.querySelector('.st-empty')?.remove(); log.appendChild(el); scroll(); return el; }
  function msg(cls, html) { const d = document.createElement('div'); d.className = 'st-msg ' + cls; d.innerHTML = html; return add(d); }
  function typing(on) {
    log.querySelector('.st-typing')?.remove();
    if (on) { const t = document.createElement('div'); t.className = 'st-typing st-raised-sm'; t.innerHTML = '<i></i><i></i><i></i>'; add(t); }
  }

  const ACTION_TEXT = {
    find_commands: (a) => ['Ищу команду', a.query],
    get_state: () => ['Смотрю публикацию', ''],
    read_text: (a) => ['Читаю текст', a.story != null ? 'история ' + a.story : 'все истории'],
    frame_details: (a) => ['Смотрю рамку', a.id != null ? String(a.id) : ''],
    add_text_frame: (a) => ['Добавляю текстовую рамку', a.page ? 'на странице ' + a.page : ''],
    look_at_screen: () => ['Смотрю на экран', ''],
    undo: (a) => ['Отменяю', `${a.steps || 1} шаг(а)`],
  };
  function card(name, args, label) {
    const d = document.createElement('div');
    const [title, detail] = label || (ACTION_TEXT[name] ? ACTION_TEXT[name](args) : [name, '']);
    d.className = 'st-act' + (READ_TOOLS.has(name) ? ' read' : '');
    d.innerHTML = `<span class="st-dot"></span><div class="st-act-text"><b>${esc(title)}</b>${detail ? `<small>${esc(detail)}</small>` : ''}</div>`;
    return add(d);
  }
  function cardResult(d, ok, error, undoable) {
    if (!ok) {
      d.classList.add('fail');
      const s = d.querySelector('small') || d.querySelector('.st-act-text').appendChild(document.createElement('small'));
      s.textContent = error;
      return;
    }
    if (undoable) {
      const b = document.createElement('button');
      b.className = 'st-mini';
      b.textContent = 'Отменить';
      b.onclick = async () => {
        b.disabled = true;
        const steps = typeof undoable === 'number' ? undoable : 1;
        try { for (let i = 0; i < steps; i++) await PC.exec('edit.undo'); b.textContent = 'Отменено'; } catch (e) { b.textContent = 'Не вышло'; b.title = e.message; }
      };
      d.appendChild(b);
    }
  }
  // ------------------------------------------------------------------ настройки помощника
  // Сколько шагов подряд делать в «Сделай» (потом — кнопка «Продолжить») и спрашивать ли перед
  // удалением, закрытием, сбросом. Хранятся в этом браузере; меню — «Настройки» внизу панели.
  const STEP_CHOICES = [10, 25, 40, 100, 0]; // 0 — без ограничений
  const stepSetting = () => { const v = Number(store.get('agentSteps', CFG.maxSteps)); return Number.isFinite(v) && v >= 0 ? v : CFG.maxSteps; };
  const agentSteps = () => (stepSetting() > 0 ? stepSetting() : Infinity);
  const askBeforeRisky = () => store.get('agentConfirm', true) !== false;
  function renderAgentMenu() {
    const menu = $('agentMenu');
    if (!menu) return;
    const cur = stepSetting();
    menu.innerHTML = '<div class="st-menu-title">Шагов подряд в «Сделай»</div>'
      + STEP_CHOICES.map((n) => `<button role="menuitemradio" aria-checked="${n === cur}" data-steps="${n}">${n ? n : 'Без ограничений'}</button>`).join('')
      + '<hr><label class="st-menu-check"><input type="checkbox" data-k="agentConfirm"' + (askBeforeRisky() ? ' checked' : '') + '><span>Спрашивать перед удалением, закрытием и сбросом</span></label>'
      + '<label class="st-menu-check"><input type="checkbox" data-k="agentLook"' + (store.get('agentLook', true) ? ' checked' : '') + '><span>Смотреть на результат после каждой серии шагов (если включён «глаз»)</span></label>';
    menu.querySelectorAll('[data-steps]').forEach((b) => { b.onclick = () => { store.set('agentSteps', Number(b.dataset.steps)); renderAgentMenu(); }; });
    menu.querySelectorAll('input[data-k]').forEach((c) => { c.onchange = () => store.set(c.dataset.k, c.checked); });
  }
  function toggleAgentMenu(open) {
    const menu = $('agentMenu');
    if (!menu) return;
    const show = open == null ? menu.hidden : open;
    if (show) renderAgentMenu();
    menu.hidden = !show;
    $('agentBtn').setAttribute('aria-expanded', String(show));
  }
  function initAgentMenu() {
    const btn = $('agentBtn');
    if (!btn) return;
    btn.onclick = (e) => { e.stopPropagation(); toggleAgentMenu(); };
    document.addEventListener('pointerdown', (e) => {
      const menu = $('agentMenu');
      if (menu && !menu.hidden && !menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) toggleAgentMenu(false);
    }, true);
  }
  let allowAllThisTurn = false;
  let autoAllowNoted = false;
  function confirmAction(text) {
    if (!askBeforeRisky() || allowAllThisTurn) {
      if (!autoAllowNoted) {
        autoAllowNoted = true;
        msg('note', 'Необратимые действия выполняю без вопроса — так выбрано. Вернуть вопросы: «Настройки» внизу панели. Отменить шаг — Ctrl+Z.');
      }
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const d = document.createElement('div');
      d.className = 'st-confirm st-raised';
      d.innerHTML = `<p>${esc(text)}</p>`
        + '<label class="st-confirm-check"><input type="checkbox"> Больше не спрашивать (вернуть — «Настройки» внизу панели)</label>'
        + '<div class="st-row"><button class="st-mini danger" data-a="no">Не надо</button>'
        + '<button class="st-mini" data-a="all" title="Не спрашивать до конца этой просьбы">Разрешать всё в этой задаче</button>'
        + '<button class="st-mini" data-a="yes">Разрешить</button></div>';
      add(d);
      d.querySelectorAll('button').forEach((b) => {
        b.onclick = () => {
          const yes = b.dataset.a !== 'no';
          if (yes && d.querySelector('input').checked) store.set('agentConfirm', false);
          if (b.dataset.a === 'all') allowAllThisTurn = true;
          d.remove();
          resolve(yes);
        };
      });
    });
  }

  function showEmpty() {
    log.innerHTML = `<div class="st-empty">
      <h3>Чем помочь?</h3>
      <p>Спросите, где найти функцию в AI-InDesign, или попросите сверстать, переписать или оформить страницы за вас.</p>
      <button class="st-mini primary st-start-tpl">Быстрые задачи</button>
      <div class="st-chips">
        <button class="st-chip" data-act="1">Сверстай листовку А4: заголовок, текст в две колонки, место под фото. Тема: </button>
        <button class="st-chip" data-act="1">Проверь орфографию во всех текстовых рамках и исправь ошибки</button>
        <button class="st-chip" data-act="1">Поставь поля 20 мм и две колонки с промежутком 5 мм на всех страницах</button>
        <button class="st-chip">Кратко перескажи публикацию</button>
        <button class="st-chip">Как связать текстовые рамки, чтобы текст перетекал?</button>
      </div></div>`;
    const st = log.querySelector('.st-start-tpl');
    if (st) st.onclick = () => Gallery.show(true);
    log.querySelectorAll('.st-chip').forEach((c) => {
      c.onclick = () => {
        if (c.dataset.act) setMode('act');
        input.value = c.textContent;
        if (/:\s*$/.test(c.textContent)) { autosize(); input.focus(); input.setSelectionRange(input.value.length, input.value.length); return; }
        send();
      };
    });
  }

  // ------------------------------------------------------------------ инструменты для модели
  async function commandById(id) {
    const c = (await commands()).find((x) => x.id === id);
    if (!c) throw new Error(`Нет команды «${id}». Найди нужную через find_commands.`);
    if (DENY.test(id)) throw new Error('Эту команду помощнику выполнять нельзя (файлы, интерфейс и служебное делает панель или сам пользователь).');
    return c;
  }
  const short = (v) => (v === undefined || v === null ? { ok: true } : { ok: true, result: v });
  const trimJson = (v, n) => JSON.parse(clip(JSON.stringify(v), n).replace(/…\[обрезано\]$/, '') || 'null');

  // Текстовая рамка на странице: координаты в мм от левого верхнего угла страницы, текст, стиль абзаца.
  async function addTextFrame(a) {
    const d = await PC.call('document.inspect');
    const pages = [];
    for (const sp of d.spreads || []) for (const pg of sp.pages || []) pages.push({ ...pg, spread: sp.index });
    if (!pages.length) throw new Error('В публикации нет страниц');
    const n = Math.max(1, Math.min(pages.length, parseInt(a.page, 10) || 1));
    const pg = pages[n - 1];
    const num = (v, dflt) => (Number.isFinite(Number(v)) ? Number(v) : dflt);
    const m = pg.margins || { top: 36, bottom: 36, inside: 36, outside: 36 };
    const pw = pg.bounds[2] - pg.bounds[0], ph = pg.bounds[3] - pg.bounds[1];
    const left = Math.min(m.inside ?? 36, m.outside ?? 36);
    const x = num(a.x, mm(left)) * MM, y = num(a.y, mm(m.top ?? 36)) * MM;
    const w = num(a.width, mm(pw - 2 * left)) * MM, h = num(a.height, mm(ph / 3)) * MM;
    if (!(w > 1 && h > 1)) throw new Error('Ширина и высота рамки должны быть больше нуля (мм)');
    const rect = [pg.bounds[0] + x, y, pg.bounds[0] + x + w, y + h].map((v) => Math.round(v * 100) / 100);
    const p = { spread: pg.spread, rect, content: 'text' };
    if (a.text) p.text = String(a.text);
    const r = await PC.exec('frame.create', p);
    let steps = 1;
    const id = r && (r.id ?? (Array.isArray(r.ids) ? r.ids[0] : undefined));
    if (a.paragraphStyle && r && r.story != null) {
      try {
        await PC.exec('text.select', { story: r.story, anchor: 0, focus: byteLen(String(a.text || '')) });
        await PC.exec('style.paragraph.apply', { name: String(a.paragraphStyle) });
        steps++;
      } catch (e) { return { ok: true, id, story: r.story, steps, warning: 'Рамка создана, но стиль не применён: ' + e.message }; }
    }
    return { ok: true, id, story: r && r.story, steps };
  }

  async function runTool(name, args) {
    if (mode !== 'act' && !READ_TOOLS.has(name)) {
      return { ok: false, error: 'Сейчас режим «Совет»: действия выключены. Объясни пользователю, как сделать это самому, или предложи переключиться в «Сделай».' };
    }
    switch (name) {
      case 'find_commands': {
        const d = card(name, args);
        const r = await findCommands(String(args.query || ''));
        cardResult(d, true);
        return r;
      }
      case 'get_state': {
        card(name, args);
        return await snapshot();
      }
      case 'read_text': {
        const d = card(name, args);
        try { const r = await readText(args.story); cardResult(d, true); return r; } catch (e) { cardResult(d, false, e.message); return { ok: false, error: e.message }; }
      }
      case 'frame_details': {
        const d = card(name, args);
        try { const r = await frameDetails(args.id); cardResult(d, true); return short(trimJson(r, 6000)); } catch (e) { cardResult(d, false, e.message); return { ok: false, error: e.message }; }
      }
      case 'look_at_screen': {
        const d = card(name, args);
        const img = await screenshot();
        cardResult(d, !!img, 'Снимок не получился');
        return img ? { ok: true, note: 'Снимок приложен следующим сообщением.', __image: img } : { ok: false, error: 'Снимок экрана не получился' };
      }
      case 'run_command': {
        const c = await commandById(String(args.id || ''));
        if (CONFIRM.test(c.id) && !(await confirmAction(`Помощник хочет выполнить «${ruPath(c)}». Разрешить?`))) {
          card(name, args, ['Пропущено пользователем', ruPath(c)]).classList.add('fail');
          return { ok: false, error: 'Пользователь не разрешил это действие. Не повторяй его, спроси, как поступить.' };
        }
        const d = card(name, args, ['Выполняю', ruPath(c)]);
        root.classList.add('acting');
        try {
          const r = await PC.exec(c.id, args.params && typeof args.params === 'object' ? args.params : null);
          cardResult(d, true, '', !/^(select|selection\.|document\.(inspect|list|history)|story\.get|find\.(find|next)|text\.(select|place|move|exit|extend)|view\.|[a-z]+\.list\b)/.test(c.id) && !/\.list$/.test(c.id));
          return short(r && typeof r === 'object' ? trimJson(r, 3000) : r);
        } catch (e) {
          cardResult(d, false, e.message);
          return { ok: false, error: e.message, params_doc: c.params ? clip(String(c.params), 800) : undefined };
        } finally {
          root.classList.remove('acting');
        }
      }
      case 'add_text_frame': {
        const d = card(name, args);
        root.classList.add('acting');
        try { const r = await addTextFrame(args); cardResult(d, true, '', r.steps || true); delete r.steps; return r; }
        catch (e) { cardResult(d, false, e.message); return { ok: false, error: e.message }; }
        finally { root.classList.remove('acting'); }
      }
      case 'undo': {
        const n = Math.max(1, Math.min(20, parseInt(args.steps, 10) || 1));
        const d = card(name, { steps: n });
        try { for (let i = 0; i < n; i++) await PC.exec('edit.undo'); cardResult(d, true); return { ok: true }; } catch (e) { cardResult(d, false, e.message); return { ok: false, error: e.message }; }
      }
      default:
        return { ok: false, error: `Инструмента «${name}» нет. Доступны только: ${TOOL_NAMES.join(', ')}. Кликов по координатам нет: найди команду через find_commands и выполни её run_command.` };
    }
  }

  // Модель иногда пишет вызов инструмента текстом вместо tool_calls — подхватываем его.
  const TOOL_NAMES = ['find_commands', 'get_state', 'read_text', 'frame_details', 'look_at_screen', 'run_command', 'add_text_frame', 'undo'];
  function inlineCalls(text) {
    if (!text || !/[{[]/.test(text)) return [];
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return [];
    try {
      const o = JSON.parse(m[0]);
      const list = Array.isArray(o) ? o : [o];
      return list
        .filter((x) => x && TOOL_NAMES.includes(x.name))
        .map((x) => ({ function: { name: x.name, arguments: x.arguments || x.parameters || {} } }));
    } catch { return []; }
  }

  // ------------------------------------------------------------------ разговор с моделью
  // Память разговора. У модели ограниченный контекст (CTX токенов, сервер сообщает его при запуске);
  // если история не влезает, сервер модели молча отрезает её начало — вместе с задачей, и помощник
  // начинает ходить по кругу. Поэтому прошлые просьбы уходят сжато (просьба и итог, без шагов и
  // снимков), текущая — целиком; если и она не влезает, сначала сокращаются старые результаты шагов,
  // потом выпадают самые ранние шаги, но сама просьба остаётся всегда.
  let CTX = 32768;
  let turnStart = 0;
  const AUTO_STATE = /\n\n\[Состояние [^\]]*— автоматически\][\s\S]*$/;
  const AUTO_MSG = /^\[(Снимок экрана|Состояние)[^\]]*автоматически\]/;
  const plainText = (t) => String(t || '').replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<?function=[\w.-]+>[\s\S]*?(<\/function>|$)/g, '').replace(/<\/?tool_call>/g, '').trim();
  const sizeOf = (m) => String(m.content || '').length + (m.tool_calls ? JSON.stringify(m.tool_calls).length : 0) + (m.images ? m.images.length * 3500 : 0);
  function outgoing() {
    const start = Math.min(Math.max(0, turnStart), convo.length);
    const older = [];
    for (const m of convo.slice(0, start)) {
      if (m.role === 'tool') continue;
      if (m.role === 'user') {
        if (AUTO_MSG.test(String(m.content || ''))) continue;
        older.push({ role: 'user', content: clip(String(m.content || '').replace(AUTO_STATE, ''), 1500) });
      } else if (m.role === 'assistant') {
        const text = plainText(m.content);
        const names = [...new Set((m.tool_calls || []).map((c) => c.function && c.function.name).filter(Boolean))];
        const line = text ? clip(text, 1200) : (names.length ? '[Выполнено: ' + names.join(', ') + ']' : '');
        if (!line) continue;
        const last = older[older.length - 1];
        if (last && last.role === 'assistant') last.content = clip(last.content + '\n' + line, 2400);
        else older.push({ role: 'assistant', content: line });
      }
    }
    const recent = older.slice(-16);
    while (recent.length && recent[0].role !== 'user') recent.shift();
    const out = recent.concat(convo.slice(start).map((m) => ({ ...m })));
    // Только последний снимок экрана: картинки тяжёлые.
    let images = 0;
    for (let i = out.length - 1; i >= 0; i--) {
      if (!out[i].images) continue;
      if (images >= 1) delete out[i].images; else images += out[i].images.length;
    }
    const budget = Math.max(12000, Math.round(CTX * 2.6) - 22000);
    let total = out.reduce((n, m) => n + sizeOf(m), 0);
    let task = out.length - (convo.length - start); // где в out начинается текущая просьба
    // 1) прошлые просьбы, начиная с самых старых
    while (total > budget && task > 0) {
      total -= sizeOf(out.shift());
      task--;
      while (task > 0 && out[0].role !== 'user') { total -= sizeOf(out.shift()); task--; }
    }
    // 2) старые результаты шагов и устаревшие состояния текущей просьбы
    for (let i = task + 1; total > budget && i < out.length - 6; i++) {
      const m = out[i];
      if ((m.role === 'tool' || AUTO_MSG.test(String(m.content || ''))) && String(m.content || '').length > 400) {
        total -= sizeOf(m);
        m.content = clip(String(m.content), 300);
        delete m.images;
        total += sizeOf(m);
      }
    }
    // 3) самые ранние шаги текущей просьбы (целыми группами: ответ модели и результаты его шагов)
    let dropped = 0;
    while (total > budget && out.length - (task + 1) > 8) {
      let end = task + 2;
      while (end < out.length - 8 && out[end].role !== 'assistant') end++;
      const removed = out.splice(task + 1, end - (task + 1));
      if (!removed.length) break;
      dropped += removed.length;
      total -= removed.reduce((n, m) => n + sizeOf(m), 0);
    }
    if (dropped) {
      out.splice(task + 1, 0, { role: 'user', content: `[Ранние шаги этой просьбы (${dropped} сообщ.) убраны, чтобы уместиться в память модели. Что уже сделано — смотри по последнему состоянию.]` });
      if (out[task + 2] && out[task + 2].role === 'tool') out.splice(task + 2, 0, { role: 'assistant', content: '[продолжаю]' });
    }
    return out;
  }

  // Запрос к серверу помощника. Если сервер не принимает запрос со снимком экрана (nginx по
  // умолчанию берёт не больше 1 МБ и при большем просто обрывает соединение — браузер пишет
  // «Failed to fetch»), запрос повторяется без снимка, и дальше снимки не отправляются.
  const BODY_LIMIT = 900 * 1024;
  let imagesBlocked = false;
  const withoutImages = (payload) => ({ ...payload, messages: payload.messages.map((m) => { const { images, ...rest } = m; void images; return rest; }) });
  const hasImages = (payload) => payload.messages.some((m) => m.images && m.images.length);
  function tellImagesBlocked() {
    if (imagesBlocked) return;
    imagesBlocked = true;
    msg('note', 'Сервер не принял запрос со снимком экрана, поэтому помощник отвечает без него. ' +
      'Чтобы он видел экран, добавьте в nginx для api/assistant.php строку <code>client_max_body_size 20m;</code> (готовый блок — в nginx.conf.example).');
  }
  async function explainNoAnswer(seconds) {
    try {
      const r = await fetch(CFG.api, { credentials: 'same-origin', cache: 'no-store' });
      if (r.ok) {
        const when = seconds >= 1 ? ` через ${Math.round(seconds)} с` : ' сразу';
        const why = seconds >= 45
          ? 'Похоже, сервер не дождался модели: для api/assistant.php нужна строка fastcgi_read_timeout 200s; (и такой же таймаут у прокси перед сервером, если он есть).'
          : 'Обычно так бывает, когда запрос больше, чем разрешает сервер (client_max_body_size 20m; для api/assistant.php), или его блокирует защита сервера.';
        return `Сервер оборвал соединение${when} и ничего не ответил, хотя сам помощник доступен. ${why} Готовый блок — в nginx.conf.example.`;
      }
      return `Сервер помощника ответил «${r.status}». Проверьте, что PHP обрабатывает файлы в папке api/.`;
    } catch {
      return 'Нет связи с сервером помощника: страница не может достучаться до api/assistant.php. Проверьте подключение и обновите страницу.';
    }
  }
  async function postApi(payload) {
    const post = (p) => fetch(CFG.api, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
    if (imagesBlocked && hasImages(payload)) payload = withoutImages(payload);
    if (hasImages(payload) && JSON.stringify(payload).length > BODY_LIMIT) payload = withoutImages(payload);
    let r;
    const t0 = performance.now();
    const took = () => (performance.now() - t0) / 1000;
    try {
      r = await post(payload);
    } catch (e) {
      console.warn('AI-InDesign: запрос к помощнику оборвался', e);
      if (!hasImages(payload)) throw new Error(await explainNoAnswer(took()));
      try { r = await post(withoutImages(payload)); } catch { throw new Error(await explainNoAnswer(took())); }
      tellImagesBlocked();
      return r;
    }
    if (r.status === 413 && hasImages(payload)) {
      r = await post(withoutImages(payload));
      tellImagesBlocked();
    }
    return r;
  }
  async function readAnswer(r) {
    let j;
    try { j = await r.json(); } catch {
      if (r.status === 413) throw new Error('Сервер не принял такой большой запрос (413). Нужна строка client_max_body_size 20m; в nginx — см. nginx.conf.example.');
      if (r.status === 502 || r.status === 504) throw new Error(`Сервер не дождался ответа модели (${r.status}). Нужна строка fastcgi_read_timeout 200s; в nginx — см. nginx.conf.example.`);
      throw new Error(`Сервер помощника ответил не JSON (HTTP ${r.status}). Проверьте, что PHP работает в папке api/.`);
    }
    return j;
  }
  // Шлюз модели не передаёт инструменты штатно (вызовы приходят текстом) — запоминаем это.
  let textTools = store.get('textTools', false);
  async function ask() {
    const r = await postApi({ mode, messages: outgoing(), textTools });
    const j = await readAnswer(r);
    if (j && j.ok && j.textTools && !textTools) { textTools = true; store.set('textTools', true); }
    if (!j.ok) {
      const e = new Error(j.error || 'Ошибка помощника');
      e.noVision = !!j.noVision;
      throw e;
    }
    return j;
  }

  async function send(fromBar) {
    if (busy) { stopRequested = true; return; }
    const field = typeof fromBar === 'string' ? null : input;
    const text = (typeof fromBar === 'string' ? fromBar : input.value).trim();
    if (!text) return;
    if (field) { field.value = ''; autosize(); }
    setBusy(true);
    stopRequested = false;
    allowAllThisTurn = false;
    autoAllowNoted = false;
    seen = new Map();
    msg('user', esc(text));
    try {
      let state = null;
      let image = null;
      if (PC.ready()) {
        state = await snapshot().catch((e) => ({ error: e.message }));
        if (attachScreen) image = await screenshot();
      }
      turnStart = convo.length;
      convo.push({
        role: 'user',
        content: MODE_TAG[mode] + '\n' + text + '\n\n[Состояние редактора — автоматически]\n' + clip(JSON.stringify(state ?? { note: 'Редактор ещё загружается' }), 4000),
        ...(image ? { images: [image] } : {}),
      });
      await runSteps();
    } catch (e) {
      turnFailed(e);
    } finally {
      turnDone();
    }
  }
  // Продолжить ту же просьбу после остановки по числу шагов (без нового сообщения).
  async function continueTurn() {
    if (busy) return;
    setBusy(true);
    stopRequested = false;
    try { await runSteps(); } catch (e) { turnFailed(e); } finally { turnDone(); }
  }
  function turnFailed(e) {
    typing(false);
    if (e.noVision) setEye(false);
    msg('err', esc(e.message || String(e)));
  }
  function turnDone() {
    typing(false);
    setBusy(false);
    root.classList.remove('acting');
    updateBarAnswer();
  }
  // Повторы считаются за всю просьбу, в том числе после «Продолжить».
  let seen = new Map();
  async function runSteps() {
    const limit = agentSteps();
    for (let step = 0; ; step++) {
      if (stopRequested) { msg('bot', 'Остановлено.'); break; }
      if (step >= limit) {
        const d = msg('note', `Сделал ${limit} шагов подряд и остановился (так задано: «Настройки» внизу панели). `);
        const b = document.createElement('button');
        b.className = 'st-mini';
        b.textContent = 'Продолжить';
        b.onclick = () => { b.disabled = true; continueTurn(); };
        d.appendChild(b);
        break;
      }
      typing(true);
      const j = await ask();
      typing(false);
        const m = j.message || {};
        let calls = Array.isArray(m.tool_calls) ? m.tool_calls : [];
        let content = (m.content || '').replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').replace(/<think>[\s\S]*?<\/think>/g, '')
          .replace(/<?function=[\w.-]+>[\s\S]*?(<\/function>|$)/g, '').replace(/<\/?tool_call>/g, '').trim();
        if (!calls.length) {
          calls = inlineCalls(content);
          if (calls.length) content = content.replace(/\{[\s\S]*\}/, '').trim();
        }
        // «Сделай», а модель всё равно ответила как в «Совете» — одна попытка её поправить.
        if (mode === 'act' && !calls.length && step === 0 && /режим\S*\s*«?Совет/i.test(content)) {
          convo.push({ role: 'assistant', content: m.content || '' });
          convo.push({ role: 'user', content: MODE_NOTE.act + ' Выполни просьбу сейчас.' });
          continue;
        }
        convo.push({ role: 'assistant', content: m.content || '', ...(calls.length ? { tool_calls: calls } : {}) });
        if (content) msg('bot', format(content));
        if (!calls.length) break;
        let pendingImage = null;
        let acted = false;
        for (const c of calls) {
          if (stopRequested) break;
          const fname = c.function && c.function.name;
          let a = (c.function && c.function.arguments) || {};
          if (typeof a === 'string') { try { a = JSON.parse(a || '{}'); } catch { a = {}; } }
          const sig = fname + ' ' + JSON.stringify(a || {});
          const times = (seen.get(sig) || 0) + 1;
          seen.set(sig, times);
          let result;
          try { result = await runTool(fname, a || {}); } catch (e) { result = { ok: false, error: e.message || String(e) }; }
          if (result && result.__image) { pendingImage = result.__image; delete result.__image; }
          const reading = READ_TOOLS.has(fname);
          if (!reading) acted = true;
          // Одно и то же действие по кругу — подсказываем модели остановиться и проверить результат.
          if (times >= (reading ? 4 : 3)) {
            const warning = `Ты уже ${times} раз(а) вызывал ${fname} с теми же параметрами. Не повторяй. `
              + (reading ? 'Всё нужное уже получено — действуй или заверши ответ.' : 'Проверь результат (get_state или look_at_screen) и переходи к следующей части задачи; если задача выполнена — заверши её коротким итогом.');
            result = (result && typeof result === 'object' && !Array.isArray(result)) ? { ...result, warning } : { result, warning };
          }
          convo.push({ role: 'tool', tool_name: fname, content: clip(JSON.stringify(result ?? { ok: true }), 6000) });
        }
        // После действий — свежее состояние документа (и снимок, если помощнику можно смотреть
        // на экран): модель видит, что уже сделано, и не рисует одно и то же заново.
        if (acted && !stopRequested && PC.ready()) {
          const st = await snapshot().catch(() => null);
          if (!pendingImage && attachScreen && store.get('agentLook', true)) pendingImage = await screenshot().catch(() => null);
          convo.push({
            role: 'user',
            content: '[Состояние после этих шагов — автоматически]\n' + clip(JSON.stringify(st ?? {}), 3500) + (pendingImage ? '\n(снимок экрана приложен)' : ''),
            ...(pendingImage ? { images: [pendingImage] } : {}),
          });
        } else if (pendingImage) {
          convo.push({ role: 'user', content: '[Снимок экрана после действий — прислан автоматически]', images: [pendingImage] });
        }
    }
  }

  // ------------------------------------------------------------------ быстрая строка
  // Ctrl+Shift+Пробел: поле внизу над холстом. Ответ всплывает над ним; вся история — в панели.
  const bar = $('bar');
  const barInput = $('barInput');
  const barAnswer = $('barAnswer');
  function setBar(open) {
    root.classList.toggle('bar-open', open);
    if (open) { setTimeout(() => barInput.focus(), 30); updateBarAnswer(); }
  }
  function updateBarAnswer() {
    if (!root.classList.contains('bar-open')) return;
    if (busy) { barAnswer.innerHTML = '<div class="st-typing"><i></i><i></i><i></i></div>'; barAnswer.hidden = false; return; }
    const last = [...log.querySelectorAll('.st-msg.bot, .st-msg.err')].pop();
    if (!last || !barSent) { barAnswer.hidden = true; return; }
    barAnswer.hidden = false;
    barAnswer.innerHTML = `<div class="st-bar-text ${last.classList.contains('err') ? 'err' : ''}">${last.innerHTML}</div><button class="st-link" data-a="panel">Открыть в панели</button>`;
    barAnswer.querySelector('[data-a="panel"]').onclick = () => { setBar(false); setOpen(true); };
  }
  let barSent = false;
  async function sendFromBar() {
    const text = barInput.value.trim();
    if (!text || busy) return;
    barInput.value = '';
    barSent = true;
    const done = send(text);
    updateBarAnswer();
    await done;
    updateBarAnswer();
  }
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.shiftKey && (e.ctrlKey || e.metaKey) && !e.altKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      setBar(!root.classList.contains('bar-open'));
    }
  }, true);

  // ------------------------------------------------------------------ сообщения и перетаскивание
  function setBadge(on) { root.classList.toggle('has-hints', on); }
  function toast(text, error) {
    let t = root.querySelector('.st-toast');
    if (!t) { t = document.createElement('div'); t.className = 'st-toast'; root.appendChild(t); }
    t.textContent = text;
    t.classList.toggle('err', !!error);
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  // Файлы, брошенные на страницу, редактор принимает сам. Брошенные на панель помощника или край
  // страницы браузер открыл бы вместо редактора — передаём их редактору.
  const isFileDrag = (e) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  let dropHideTimer = 0;
  function showDrop(on) {
    root.classList.toggle('dropping', on);
    clearTimeout(dropHideTimer);
    if (on) dropHideTimer = setTimeout(() => root.classList.remove('dropping'), 400);
  }
  window.addEventListener('dragover', (e) => {
    if (!isFileDrag(e)) return;
    const canvas = document.getElementById('designcraft_canvas');
    if (canvas && e.target === canvas) return;
    e.preventDefault();
    showDrop(true);
  });
  window.addEventListener('drop', async (e) => {
    showDrop(false);
    if (!isFileDrag(e)) return;
    const canvas = document.getElementById('designcraft_canvas');
    if (canvas && e.target === canvas) return;
    e.preventDefault();
    const f = [...e.dataTransfer.files][0];
    if (!f || !PC.ready()) return;
    try { toast('Открываю ' + f.name); await VC().open(f.name, new Uint8Array(await f.arrayBuffer())); Files.forget(); }
    catch (err) { toast('Не удалось открыть ' + f.name + ': ' + (err.message || err), true); }
  });

  // ------------------------------------------------------------------ файлы на сервере
  // Новая пустая публикация (А4, мм) — в новой вкладке редактора.
  async function newDocument() {
    await PC.exec('file.new');
  }
  const fmtSize = (n) => (n < 1024 ? n + ' Б' : n < 1048576 ? Math.round(n / 1024) + ' КБ' : (n / 1048576).toFixed(1).replace('.', ',') + ' МБ');
  const fmtDate = (t) => {
    if (!t) return '';
    const d = new Date(t * 1000), now = new Date();
    const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return 'сегодня, ' + time;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' }) + ', ' + time;
  };
  const DOC_EXT = /\.(designcraft|idml|indd|indt)$/i;
  // Родной формат: сохраняет всё. IDML, INDD и INDT открываются, а сохраняются рядом в .designcraft.
  const NATIVE = '.designcraft';

  // Окно с одним полем: имя файла.
  function askName(title, value, note) {
    return new Promise((resolve) => {
      const box = $('ask');
      $('askTitle').textContent = title;
      $('askNote').textContent = note || '';
      const field = $('askInput');
      field.value = value || '';
      box.hidden = false;
      setTimeout(() => { field.focus(); const dot = field.value.lastIndexOf('.'); field.setSelectionRange(0, dot > 0 ? dot : field.value.length); }, 30);
      const done = (v) => { box.hidden = true; form.onsubmit = null; $('askCancel').onclick = null; box.onkeydown = null; resolve(v); };
      const form = box.querySelector('form');
      form.onsubmit = (e) => { e.preventDefault(); done(field.value.trim() || null); };
      $('askCancel').onclick = () => done(null);
      box.onkeydown = (e) => { if (e.key === 'Escape') { e.preventDefault(); done(null); } };
    });
  }

  // Копия в браузере, если сохранить на сервер не вышло (нет связи, сервер не принял файл).
  const Recovery = (() => {
    const open = () => new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('нет IndexedDB')); return; }
      const r = indexedDB.open('aiindesign', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('recovery');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const run = async (mode, fn) => {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('recovery', mode);
        const req = fn(tx.objectStore('recovery'));
        tx.oncomplete = () => { db.close(); resolve(req && req.result); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      });
    };
    return {
      put: (v) => run('readwrite', (s) => s.put(v, 'last')).catch(() => {}),
      get: () => run('readonly', (s) => s.get('last')).catch(() => null),
      clear: () => run('readwrite', (s) => s.delete('last')).catch(() => {}),
    };
  })();

  const Files = (() => {
    let list = [];
    let server = null;        // имя открытой публикации на сервере (с расширением), если она оттуда
    const known = new Set();  // имена файлов на сервере, открытые или сохранённые здесь
    let dirty = false;
    let saveAsNext = false;   // «Сохранить как» из панели
    let quietNext = false;    // автосохранение
    let saving = false;
    const api = (q) => CFG.files + (q ? '?' + q : '');
    async function json(r) {
      let j = null;
      try { j = await r.json(); } catch { /* ниже */ }
      if (!j) throw new Error(r.status === 413 ? 'Файл слишком большой для сервера: увеличьте client_max_body_size в nginx и post_max_size в PHP.' : `Сервер ответил ${r.status}: проверьте, что PHP обрабатывает api/files.php.`);
      if (!j.ok) { const e = new Error(j.error || 'Ошибка сервера'); e.exists = !!j.exists; e.login = !!j.login; throw e; }
      return j;
    }
    async function refresh() {
      const j = await json(await fetch(api(''), { credentials: 'same-origin', cache: 'no-store' }));
      list = Array.isArray(j.files) ? j.files : [];
      $('filesWho').textContent = j.user && j.user !== 'local' ? 'на сервере · пользователь ' + j.user : 'на сервере';
      return list;
    }
    const stem = (n) => String(n || '').replace(DOC_EXT, '');
    const extOf = () => NATIVE;
    const nativeName = (n) => stem(n) + NATIVE;
    // Путь документа в редакторе — имя его файла на сервере (панель ставит его через file.saveAs).
    async function setPath(name) { await PC.exec('file.saveAs', { path: name }); }
    function render() {
      const q = norm($('filesSearch').value).trim();
      const rows = list.filter((f) => !q || norm(f.name).includes(q));
      const box = $('filesList');
      if (!list.length) { box.innerHTML = '<p class="st-files-empty">Здесь будут ваши публикации. Сохраните открытую публикацию кнопкой «Сохранить» или Ctrl+S. Открыть можно файлы .designcraft, .idml, .indd и .indt.</p>'; return; }
      if (!rows.length) { box.innerHTML = '<p class="st-files-empty">Ничего не найдено.</p>'; return; }
      box.innerHTML = rows.map((f, i) => `<div class="st-file" data-i="${i}" tabindex="0">
          <span class="st-file-icon">${ICON.file}</span>
          <span class="st-file-name">${esc(f.name)}</span>
          <span class="st-file-meta">${esc(fmtDate(f.modified))} · ${esc(fmtSize(f.size))}</span>
          <span class="st-file-acts"><button class="st-link" data-a="rename">Переименовать</button><button class="st-link danger" data-a="delete">Удалить</button></span>
        </div>`).join('');
      box.querySelectorAll('.st-file').forEach((row) => {
        const f = rows[+row.dataset.i];
        row.onclick = (e) => { if (!e.target.closest('button')) load(f.name); };
        row.onkeydown = (e) => { if (e.key === 'Enter') load(f.name); };
        row.querySelector('[data-a="rename"]').onclick = () => rename(f.name);
        row.querySelector('[data-a="delete"]').onclick = () => remove(f.name);
      });
    }
    function updateFoot() {
      $('filesCurrent').textContent = server ? `Открыт «${server}»` + (dirty ? ' · есть изменения' : '') : (dirty ? 'Публикация ещё не сохранена на сервере' : '');
    }
    async function show(on = true) {
      $('files').hidden = !on;
      if (!on) return;
      $('filesList').innerHTML = '<p class="st-files-empty">Загружаю список…</p>';
      updateFoot();
      try { await refresh(); render(); } catch (e) { $('filesList').innerHTML = `<p class="st-files-empty err">${esc(e.message)}</p>`; }
      setTimeout(() => $('filesSearch').focus(), 30);
    }
    async function load(name) {
      try {
        toast('Открываю «' + name + '»…');
        const r = await fetch(api('action=load&name=' + encodeURIComponent(name)), { credentials: 'same-origin', cache: 'no-store' });
        if (!r.ok) await json(r);
        const bytes = new Uint8Array(await r.arrayBuffer());
        const before = await docCount();
        await VC().open(name, bytes);
        show(false);
        // Документ открывается на следующем кадре; потом ему ставится имя его файла на сервере.
        for (let i = 0; i < 100 && (await docCount()) <= before; i++) await sleep(100);
        if ((await docCount()) <= before) throw new Error('редактор не открыл файл (подробности — в строке состояния)');
        const native = nativeName(name);
        await setPath(native).catch(() => {});
        server = native;
        known.add(native);
        if (native !== name) toast(`Открыт «${name}». Сохраняться будет рядом, как «${native}» (родной формат). IDML — Файл › Экспорт IDML.`);
      } catch (e) { toast('Не удалось открыть: ' + e.message, true); }
    }
    async function docCount() {
      try { const ui = await PC.call('ui.inspect'); return Array.isArray(ui.documents) ? ui.documents.length : 0; } catch { return 0; }
    }
    async function upload(name, bytes, overwrite) {
      const r = await fetch(api('action=save&name=' + encodeURIComponent(name) + (overwrite ? '&overwrite=1' : '')), {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes,
      });
      return json(r);
    }
    // Сохранение из редактора (Ctrl+S, Файл › Сохранить, «Сохранить как»): публикация приходит сюда.
    async function onSave(detail) {
      const quiet = quietNext;
      const asked = saveAsNext || !!detail.saveAs;
      quietNext = false;
      saveAsNext = false;
      const bytes = detail.bytes;
      // Путь документа — имя файла на сервере, если он оттуда открыт или туда сохранён (setPath).
      const path = String(detail.path || '');
      let name = !asked && path && known.has(path) ? path : null;
      let overwrite = !!name;
      try {
        saving = true;
        if (!name) {
          if (quiet) return;
          const suggest = nativeName(path || detail.name || 'Публикация');
          name = await askName(asked ? 'Сохранить как' : 'Сохранить на сервере', suggest, 'Публикация появится в «Моих публикациях».');
          if (!name) { dirty = true; return; }
          name = nativeName(name.trim());
          if (!list.length) await refresh().catch(() => {});
          if (list.some((f) => f.name === name) && name !== server && !window.confirm(`Публикация «${name}» уже есть. Заменить её?`)) { dirty = true; return; }
          overwrite = true;
        }
        const r = await upload(name, bytes, overwrite);
        await setPath(r.name).catch(() => {});
        server = r.name;
        known.add(r.name);
        Recovery.clear();
        if (!quiet) toast('Сохранено: «' + r.name + '»');
        if (!$('files').hidden) { await refresh().catch(() => {}); render(); updateFoot(); }
      } catch (e) {
        Recovery.put({ name: name || detail.name, data: bytes, time: Date.now() });
        if (e.login) toast('Войдите в систему, чтобы сохранять публикации на сервере. Копия осталась в браузере.', true);
        else toast((quiet ? 'Автосохранение не удалось: ' : 'Не удалось сохранить: ') + e.message + '. Копия осталась в браузере.', true);
      } finally { saving = false; }
    }
    async function save(saveAs) {
      if (!PC.ready()) return;
      saveAsNext = !!saveAs;
      try { await PC.exec(saveAs ? 'app.saveDialog' : 'app.save'); } catch (e) { saveAsNext = false; toast('Не удалось сохранить: ' + e.message, true); }
    }
    async function rename(name) {
      const to0 = await askName('Переименовать', name);
      if (!to0 || to0 === name) return;
      const to = DOC_EXT.test(to0) ? to0 : to0 + extOf(name);
      try {
        await json(await fetch(api('action=rename'), { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, to }) }));
        if (known.has(name)) { known.delete(name); known.add(to); }
        if (server === name) { server = to; await setPath(to).catch(() => {}); }
        await refresh(); render(); updateFoot();
      } catch (e) { toast('Не удалось переименовать: ' + e.message, true); }
    }
    async function remove(name) {
      if (!window.confirm(`Удалить «${name}»? Файл уйдёт в корзину на сервере.`)) return;
      try {
        await json(await fetch(api('action=delete'), { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }));
        if (server === name) server = null;
        await refresh(); render();
      } catch (e) { toast('Не удалось удалить: ' + e.message, true); }
    }
    function pickLocal() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.designcraft,.idml,.indd,.indt';
      input.onchange = async () => {
        const f = input.files && input.files[0];
        if (!f) return;
        try { await VC().open(f.name, new Uint8Array(await f.arrayBuffer())); server = null; show(false); toast('Открыта «' + f.name + '». Сохраните её (Ctrl+S), чтобы она появилась в «Моих файлах».'); }
        catch (e) { toast('Не удалось открыть ' + f.name + ': ' + e.message, true); }
      };
      input.click();
    }
    async function offerRecovery() {
      const r = await Recovery.get();
      if (!r || !r.data) return;
      const when = new Date(r.time).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      const d = msg('note', `Публикацию «${esc(r.name)}» от ${esc(when)} не удалось сохранить на сервер — её копия осталась в браузере. ` +
        '<span class="st-row"><button class="st-mini" data-a="open">Открыть копию</button><button class="st-mini danger" data-a="drop">Удалить копию</button></span>');
      d.querySelector('[data-a="open"]').onclick = async () => {
        try { await VC().open(r.name, r.data); server = null; d.remove(); toast('Копия открыта. Сохраните её (Ctrl+S).'); }
        catch (e) { toast('Не удалось открыть копию: ' + e.message, true); }
      };
      d.querySelector('[data-a="drop"]').onclick = () => { Recovery.clear(); d.remove(); };
      setOpen(true);
    }
    // Раз в autosaveSeconds: публикация, которая уже лежит на сервере, сохраняется туда сама.
    async function tick() {
      for (;;) {
        await sleep(Math.max(15, CFG.autosaveSeconds || 60) * 1000);
        if (!CFG.autosaveSeconds || document.hidden || !PC.ready() || saving || !server || !dirty) continue;
        if (VC().wantsKeyboard && VC().wantsKeyboard() === false) { /* ок */ }
        quietNext = true;
        await PC.exec('app.save').catch(() => { quietNext = false; });
      }
    }
    function start() {
      VC().takesSaves = true;
      window.addEventListener('aiindesign:save', (e) => onSave(e.detail || {}));
      window.addEventListener('aiindesign:dirty', (e) => { dirty = !!(e.detail && e.detail.dirty); if (!$('files').hidden) updateFoot(); });
      $('filesBtn').onclick = () => show(true);
      $('filesClose').onclick = () => show(false);
      $('files').addEventListener('pointerdown', (e) => { if (e.target === $('files')) show(false); });
      $('files').addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('ask').hidden) { e.preventDefault(); show(false); } });
      $('filesSearch').addEventListener('input', render);
      $('filesNew').onclick = async () => { try { await newDocument(); server = null; show(false); } catch (e) { toast(e.message, true); } };
      $('filesUpload').onclick = pickLocal;
      $('filesSave').onclick = () => save(false);
      $('filesSaveAs').onclick = () => save(true);
      // Браузер не должен предлагать «Сохранить страницу как…».
      window.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 's' || e.key === 'S' || e.code === 'KeyS')) e.preventDefault(); }, true);
      offerRecovery();
      tick();
      if (CFG.filesOnStart) refresh().then((l) => { if (l.length) show(true); }).catch(() => {});
    }
    return { start, show, save, stem, current: () => server, ext: () => extOf(server), forget: () => { server = null; }, isServer: (p) => known.has(p) };
  })();

  // ------------------------------------------------------------------ шрифты
  // Метрически совместимые открытые шрифты (fonts/manifest.json: Liberation вместо Times New Roman, Arial
  // и Courier New, Carlito вместо Calibri, Caladea вместо Cambria) и шрифты организации с сервера
  // (api/files.php?action=fonts): текст в рамках переносится по тем же размерам букв, с какими его сверстали.
  const Fonts = (() => {
    let loaded = 0;
    async function add(name, url) {
      const r = await fetch(url, { credentials: 'same-origin' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const res = await VC().addFont(name, new Uint8Array(await r.arrayBuffer()));
      if (res && res.faces) loaded += res.faces;
    }
    async function start() {
      // Сначала шрифты организации (настоящие гарнитуры), потом открытые двойники.
      try {
        const j = await (await fetch(CFG.files + '?action=fonts', { credentials: 'same-origin', cache: 'no-store' })).json();
        for (const f of (j && j.ok && j.fonts) || []) {
          await add(f.name, CFG.files + '?action=font&name=' + encodeURIComponent(f.name)).catch((e) => console.warn('AI-InDesign: шрифт ' + f.name, e));
        }
      } catch { /* нет входа или сервера — только двойники */ }
      try {
        const m = await (await fetch(CFG.fonts, { cache: 'no-cache' })).json();
        for (const f of (m && m.fonts) || []) {
          await add(f.file, 'fonts/' + encodeURIComponent(f.file)).catch((e) => console.warn('AI-InDesign: шрифт ' + f.file, e));
        }
      } catch { /* сборка без шрифтов */ }
      // Открытые документы перекомпонуются с новыми шрифтами.
      if (loaded) await PC.exec('font.reload').catch(() => {});
      return loaded;
    }
    return { start, faces: () => loaded };
  })();

  // ------------------------------------------------------------------ быстрые задачи и новые публикации
  const needDoc = async () => {
    try { await PC.call('document.inspect'); } catch { throw new Error('Сначала откройте или создайте публикацию.'); }
  };
  // Быстрые задачи: те, что делаются командами, — сразу; остальные — через помощника (! — сделать, ? — объяснить).
  const page = async () => { await needDoc(); return currentPage(); };
  const TASKS = [
    ['Страницы', [
      ['Добавить страницу', 'После текущей', async () => { const n = await page(); await PC.exec('layout.pages.insert', { count: 1, after: n - 1 }); }],
      ['Добавить разворот', 'Две страницы в конец', async () => { await needDoc(); await PC.exec('layout.pages.insert', { count: 2 }); }],
      ['Поля 20 мм', 'На всех страницах', async () => { await needDoc(); await PC.exec('layout.marginsAndColumns', { margins: Math.round(20 * MM * 100) / 100 }); }],
      ['Две колонки', 'Промежуток 5 мм, на всех страницах', async () => { await needDoc(); await PC.exec('layout.marginsAndColumns', { columns: 2, gutter: Math.round(5 * MM * 100) / 100 }); }],
      ['Три колонки', 'Промежуток 5 мм, на всех страницах', async () => { await needDoc(); await PC.exec('layout.marginsAndColumns', { columns: 3, gutter: Math.round(5 * MM * 100) / 100 }); }],
    ]],
    ['Рамки', [
      ['Текстовая рамка', 'По полям текущей страницы', async () => { const n = await page(); const r = await addTextFrame({ page: n, text: 'Текст' }); if (r.id != null) await PC.exec('selection.set', { ids: [r.id] }).catch(() => {}); }],
      ['Заголовок', 'Рамка сверху текущей страницы', async () => { const n = await page(); const r = await addTextFrame({ page: n, height: 30, text: 'Заголовок' }); if (r.id != null) await PC.exec('selection.set', { ids: [r.id] }).catch(() => {}); }],
      ['Рамка под картинку', 'Половина страницы, потом Файл › Поместить', async () => {
        const n = await page();
        const d = await PC.call('document.inspect');
        const pages = []; for (const sp of d.spreads || []) for (const pg of sp.pages || []) pages.push({ ...pg, spread: sp.index });
        const pg = pages[n - 1] || pages[0];
        const m = pg.margins || { top: 36, inside: 36, outside: 36 };
        const l = Math.min(m.inside ?? 36, m.outside ?? 36);
        const w = pg.bounds[2] - pg.bounds[0];
        const r = await PC.exec('frame.create', { spread: pg.spread, rect: [pg.bounds[0] + l, m.top ?? 36, pg.bounds[2] - l, (m.top ?? 36) + (w - 2 * l) * 0.66], content: 'graphic' });
        if (r && r.id != null) await PC.exec('selection.set', { ids: [r.id] }).catch(() => {});
      }],
      ['Текст-заполнитель', 'В выбранную текстовую рамку', async () => { await needDoc(); await PC.exec('type.fillWithPlaceholder'); }],
    ]],
    ['Файл', [
      ['Сохранить на сервер', 'Ctrl+S', async () => { await Files.save(false); }],
      ['Сохранить как…', 'Под другим именем в «Моих публикациях»', async () => { await Files.save(true); }],
      ['Скачать PDF', 'Все страницы, для печати', async () => { await needDoc(); await PC.exec('app.exportPdf'); }],
      ['Скачать IDML', 'Для обмена с InDesign', async () => { await needDoc(); await PC.exec('app.exportIdml'); }],
      ['Новая публикация', 'А4, миллиметры', async () => { await newDocument(); Files.forget(); }],
    ]],
    ['Попросить помощника', [
      ['Листовка на тему', 'Заголовок, текст, место под фото', '!Сверстай на текущей странице листовку: крупный заголовок, подзаголовок, текст в две колонки и рамку под фото. Тема: '],
      ['Буклет', 'Несколько страниц с текстом', '!Сделай буклет на 4 страницы: обложка с заголовком, затем страницы с подзаголовками и текстом. Тема: '],
      ['Проверить текст', 'Опечатки, ошибки, повторы', '?Проверь текст всех рамок на опечатки, грамматические ошибки и повторы. Перечисли найденное с номерами страниц.'],
      ['Исправить ошибки', 'Во всех текстовых рамках', '!Исправь орфографические и пунктуационные ошибки во всех текстовых рамках, больше ничего не меняй. Перечисли исправления.'],
      ['Текст не влезает', 'Сократить переполненные рамки', '!Найди текстовые рамки, текст которых не помещается (overset), и сократи их текст, чтобы он влез, сохранив смысл.'],
      ['Кратко пересказать', 'О чём публикация', '?Кратко перескажи публикацию: о чём она, главные мысли.'],
      ['Перевести на английский', 'Весь текст рамок', '!Переведи текст всех текстовых рамок на английский, сохранив деление на абзацы.'],
    ]],
  ];
  const Gallery = (() => {
    function show(on = true) {
      $('gallery').hidden = !on;
      if (on) renderTasks();
    }
    function renderTasks() {
      $('gTasks').innerHTML = TASKS.map(([group, items], gi) => `<section><h4>${esc(group)}</h4><div>${items.map(([n, d], i) => `<button class="st-task" data-g="${gi}" data-i="${i}"><b>${esc(n)}</b><small>${esc(d)}</small></button>`).join('')}</div></section>`).join('');
      $('gTasks').querySelectorAll('.st-task').forEach((b) => {
        const [, , run] = TASKS[+b.dataset.g][1][+b.dataset.i];
        b.onclick = async () => {
          if (typeof run === 'string') {
            show(false);
            setOpen(true);
            setMode(run.startsWith('?') ? 'advice' : 'act');
            const text = run.replace(/^[!?]/, '');
            input.value = text;
            if (/[.:]\s*$/.test(text) && text.endsWith(': ')) { autosize(); input.focus(); input.setSelectionRange(text.length, text.length); }
            else send();
            return;
          }
          b.disabled = true;
          try { await run(); show(false); toast('Готово: ' + b.querySelector('b').textContent + '. Ctrl+Z — отменить.'); }
          catch (e) { toast(e.message, true); }
          finally { b.disabled = false; }
        };
      });
    }
    function start() {
      $('galleryBtn').onclick = () => show(true);
      $('galleryClose').onclick = () => show(false);
      $('gallery').addEventListener('pointerdown', (e) => { if (e.target === $('gallery')) show(false); });
      $('gallery').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); show(false); } });
    }
    return { start, show };
  })();

  // ------------------------------------------------------------------ ИИ у выделения
  // Кнопка «ИИ» у выделенного текста и «ИИ-помощник…» в контекстном меню текста присылают
  // событие aiindesign:ai; Ctrl+Alt+Пробел открывает то же меню над страницей. Модель видит текст всей
  // публикации (большой — частями, см. api/context.php), а работает с выделенным: текстом, фигурами
  // или — если выделен только курсор или рамка — с текстом этой рамки. Результат не попадает в
  // публикацию сам: его можно заменить, вставить после, поставить новой рамкой или скопировать.
  const AI_MENU = [
    ['Текст', [['improve', 'Улучшить текст'], ['fix_grammar', 'Исправить ошибки'], ['shorten', 'Сократить'], ['fit_frame', 'Сократить, чтобы влез в рамку'], ['rephrase', 'Переформулировать'], ['simplify', 'Упростить'], ['expand', 'Развернуть']]],
    ['Заголовки', [['title', 'Варианты заголовка'], ['subtitle', 'Варианты подзаголовка'], ['lead', 'Лид-абзац']]],
    ['Стиль', [['formalize', 'Деловой'], ['casualize', 'Разговорный'], ['marketing', 'Рекламный']]],
    ['Перевод', [['translate_ru', 'На русский'], ['translate_en', 'На английский'], ['translate_be', 'На белорусский'], ['translate_de', 'На немецкий'], ['translate_fr', 'На французский'], ['translate_es', 'На испанский'], ['translate_zh', 'На китайский']]],
    ['Проверка', [['check_spelling', 'Орфография и пунктуация'], ['check_style', 'Стиль и повторы'], ['check_facts', 'Что проверить']]],
    ['Публикация', [['summarize', 'Краткое содержание'], ['key_points', 'Главные мысли'], ['explain', 'Объяснить']]],
  ];
  // Эти операции переписывают текст: главная кнопка результата — «Заменить».
  const AI_REWRITES = /^(improve|fix_grammar|shorten|fit_frame|rephrase|simplify|expand|formalize|casualize|marketing|translate_|custom)/;
  const AI_LABEL = Object.fromEntries(AI_MENU.flatMap((g) => g[1]));

  // Markdown модели → простой HTML: абзацы, подзаголовки, списки, таблицы, полужирный и курсив.
  function mdToHtml(md) {
    const inline = (s) => esc(s)
      .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[\s(«])\*([^*\s][^*\n]*?)\*(?=[\s.,;:!?)»]|$)/g, '$1<i>$2</i>')
      .replace(/`([^`\n]+)`/g, '$1');
    const out = [];
    let list = null;
    let rows = null;
    const close = () => {
      if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; }
      if (rows) {
        const [head, ...body] = rows;
        const cells = (r, t) => r.map((c) => `<${t}>${inline(c)}</${t}>`).join('');
        out.push(`<table border="1" style="border-collapse:collapse"><thead><tr>${cells(head, 'th')}</tr></thead><tbody>${body.map((r) => `<tr>${cells(r, 'td')}</tr>`).join('')}</tbody></table>`);
        rows = null;
      }
    };
    for (const raw of String(md).replace(/\r/g, '').split('\n')) {
      const line = raw.trimEnd();
      let m;
      if (/^\s*\|.*\|\s*$/.test(line)) {
        if (list) close();
        if (/^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-')) continue; // строка-разделитель
        rows = rows || [];
        rows.push(line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      } else if ((m = line.match(/^\s*[-*•–]\s+(.*)$/))) {
        if (rows || (list && list.tag !== 'ul')) close();
        list = list || { tag: 'ul', items: [] };
        list.items.push(m[1]);
      } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
        if (rows || (list && list.tag !== 'ol')) close();
        list = list || { tag: 'ol', items: [] };
        list.items.push(m[1]);
      } else if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
        close();
        const level = Math.min(4, Math.max(2, m[1].length));
        out.push(`<h${level}>${inline(m[2].replace(/#+\s*$/, ''))}</h${level}>`);
      } else if (!line.trim()) {
        close();
      } else {
        close();
        out.push(`<p>${inline(line.trim())}</p>`);
      }
    }
    close();
    return out.join('');
  }
  const mdPlain = (md) => String(md).replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/^#{1,6}\s+/gm, '').trim();
  const mdStructured = (md) => /^\s*([-*•–]\s|\d+[.)]\s|#{1,6}\s|\|)/m.test(md);
  // Строки результата без разметки Markdown: «- пункт» → «пункт», «# Заголовок» → «Заголовок».
  const mdLines = (md) => mdPlain(md).split('\n').map((l) => l.replace(/^\s*(?:[-*•–]|\d+[.)])\s+/, '').trim()).filter(Boolean);

  const ai = { pop: null, sel: null, op: null, custom: '', result: '', abort: null };

  function aiClose() {
    if (ai.abort) ai.abort.abort();
    ai.abort = null;
    ai.pop?.remove();
    ai.pop = null;
  }
  function aiPlace(x, y) {
    const pop = ai.pop;
    const w = pop.offsetWidth; const h = pop.offsetHeight;
    const left = Math.max(8, Math.min(x, window.innerWidth - w - 8));
    const top = y + h + 8 <= window.innerHeight ? y : Math.max(8, Math.min(y - h - 12, window.innerHeight - h - 8));
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }
  const SCOPE_TEXT = { range: 'Выделено', story: 'Текст рамки', doc: 'Публикация' };
  // Что выделено: фрагмент текста (range), текст рамки с курсором или выбранной рамки (story),
  // ничего (doc — работаем с публикацией целиком). Смещения — байты UTF-8, как у движка.
  async function aiSelection() {
    const d = await PC.call('document.inspect');
    const sel = d.selection || {};
    const storyOf = async (id) => { const st = await PC.exec('story.get', { story: id }); return st; };
    if (sel.text && sel.text.story != null && !sel.text.cell) {
      const st = await storyOf(sel.text.story);
      const a = Math.min(sel.text.anchor, sel.text.focus), f = Math.max(sel.text.anchor, sel.text.focus);
      const total = byteLen(st.text);
      if (f > a) return { scope: 'range', story: st.id ?? sel.text.story, start: a, end: f, text: sliceBytes(st.text, a, f), storyText: st.text, total, overset: st.oversetChars };
      return { scope: 'story', story: st.id ?? sel.text.story, start: 0, end: total, text: String(st.text || ''), storyText: st.text, total, overset: st.oversetChars, frames: st.frames };
    }
    const ids = Array.isArray(sel.items) ? sel.items : [];
    if (ids.length === 1) {
      for (const sp of d.spreads || []) {
        const it = (sp.items || []).find((x) => x.id === ids[0]);
        if (it && it.story != null) {
          const st = await storyOf(it.story);
          const total = byteLen(st.text);
          return { scope: 'story', story: it.story, start: 0, end: total, text: String(st.text || ''), storyText: st.text, total, overset: st.oversetChars, frames: st.frames };
        }
      }
    }
    return { scope: 'doc', text: '' };
  }
  // Весь текст публикации — контекст для модели (большой сервер отдаёт частями, см. api/context.php).
  async function documentText() {
    const d = await PC.call('document.inspect');
    const parts = [];
    let size = 0;
    for (const st of d.stories || []) {
      const full = await PC.exec('story.get', { story: st.id }).catch(() => null);
      const t = String((full && full.text) || '').trim();
      if (!t) continue;
      parts.push(t);
      size += t.length;
      if (size > 400000) break;
    }
    return parts.join('\n\n');
  }
  async function aiOpen(x, y) {
    aiClose();
    if (!PC.ready()) return;
    let sel;
    try { sel = await aiSelection(); } catch { toast('Сначала откройте или создайте публикацию.', true); return; }
    sel.text = String(sel.text || '').slice(0, CFG.aiMaxChars || 60000);
    ai.sel = sel;
    const text = sel.text.trim();
    const words = text ? text.split(/\s+/).length : 0;
    const what = SCOPE_TEXT[sel.scope] || 'Публикация';
    const pop = document.createElement('div');
    pop.className = 'st-ai-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'ИИ-помощник');
    const over = sel.overset ? ` · не помещается: ${sel.overset} симв.` : '';
    pop.innerHTML = `
      <div class="st-ai-head">
        <span class="st-ai-mark">${ICON.spark}</span>
        <input class="st-ai-input" type="text" placeholder="${sel.scope === 'doc' ? 'Что сделать с публикацией?' : 'Что сделать с текстом?'}" aria-label="Свой запрос или поиск по меню" autocomplete="off">
        <button class="st-ai-x" title="Закрыть (Esc)" aria-label="Закрыть">${ICON.x}</button>
      </div>
      <div class="st-ai-scope">${text ? `${esc(what)}: <b>${esc(text.length > 70 ? text.slice(0, 70) + '…' : text)}</b> · ${words} ${plural(words, 'слово', 'слова', 'слов')}${esc(over)}` : 'Текст не выбран — работаю с публикацией целиком. Чтобы править текст, выделите его или выберите текстовую рамку.'}</div>
      <div class="st-ai-body"></div>
      <div class="st-ai-foot">Enter — свой запрос · Esc — закрыть · Ctrl+Alt+Пробел — открыть над страницей</div>`;
    root.appendChild(pop);
    ai.pop = pop;
    const input = pop.querySelector('.st-ai-input');
    pop.querySelector('.st-ai-x').onclick = aiClose;
    input.addEventListener('input', () => aiMenu(input.value));
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); aiClose(); }
      if (e.key === 'Enter' && input.value.trim()) { e.preventDefault(); aiRun('custom', input.value.trim()); }
      if (e.key === 'ArrowDown') { e.preventDefault(); pop.querySelector('.st-ai-item')?.focus(); }
    });
    pop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); aiClose(); }
      const items = [...pop.querySelectorAll('.st-ai-item')];
      const i = items.indexOf(document.activeElement);
      if (i >= 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault(); e.stopPropagation();
        (items[i + (e.key === 'ArrowDown' ? 1 : -1)] || (e.key === 'ArrowUp' ? input : items[i])).focus();
      }
    });
    aiMenu('');
    ai.anchor = [x, y];
    aiPlace(x, y);
    input.focus();
  }
  function plural(n, one, few, many) {
    const d = n % 10; const h = n % 100;
    return d === 1 && h !== 11 ? one : d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many;
  }
  function aiMenu(query) {
    const body = ai.pop?.querySelector('.st-ai-body');
    if (!body) return;
    const q = query.trim().toLowerCase();
    const noText = !(ai.sel && ai.sel.text && ai.sel.text.trim());
    const groups = AI_MENU
      .map(([g, items]) => [g, items.filter(([id, label]) => (!q || label.toLowerCase().includes(q) || g.toLowerCase().includes(q)) && !(noText && (AI_REWRITES.test(id) || id === 'title' || id === 'subtitle' || id === 'lead')) && !(id === 'fit_frame' && !(ai.sel && ai.sel.overset)))])
      .filter((g) => g[1].length);
    body.innerHTML = groups.length
      ? groups.map(([g, items]) => `<div class="st-ai-group"><div class="st-ai-gt">${esc(g)}</div><div class="st-ai-items">${items.map(([id, label]) => `<button class="st-ai-item" data-op="${id}">${esc(label)}</button>`).join('')}</div></div>`).join('')
      : `<button class="st-ai-item st-ai-custom" data-op="custom">${ICON.send}<span>Выполнить: «${esc(query.trim())}»</span></button>`;
    body.querySelectorAll('.st-ai-item').forEach((b) => {
      b.onclick = () => (b.dataset.op === 'custom' ? aiRun('custom', query.trim()) : aiRun(b.dataset.op, ''));
    });
    if (ai.anchor) aiPlace(...ai.anchor);
  }
  // Что можно сделать с результатом: [действие, подпись, главное?].
  function aiActions(op) {
    const sel = ai.sel || {};
    const has = !!(sel.text || '').trim();
    const acts = [];
    if (AI_REWRITES.test(op) && has) acts.push(['replace', sel.scope === 'range' ? 'Заменить выделенное' : 'Заменить текст рамки', true]);
    if (sel.scope !== 'doc') acts.push(['insertAfter', sel.scope === 'range' ? 'Вставить после выделенного' : 'Добавить в конец рамки', !acts.length]);
    acts.push(['newFrame', 'Новой текстовой рамкой', !acts.length]);
    return acts;
  }
  async function aiRun(op, custom) {
    if (!ai.pop) return;
    ai.op = op; ai.custom = custom;
    const body = ai.pop.querySelector('.st-ai-body');
    const title = op === 'custom' ? custom : (AI_LABEL[op] || op);
    body.innerHTML = `<div class="st-ai-res"><div class="st-ai-rt">${esc(title)}</div><div class="st-ai-wait"><div class="st-typing"><i></i><i></i><i></i></div><span>Думаю над текстом…</span><button class="st-mini" data-a="stop">Отменить</button></div></div>`;
    ai.pop.querySelector('.st-ai-foot').hidden = true;
    body.querySelector('[data-a="stop"]').onclick = () => { ai.abort?.abort(); aiMenu(ai.pop.querySelector('.st-ai-input').value); ai.pop.querySelector('.st-ai-foot').hidden = false; };
    aiPlace(...ai.anchor);
    let doc = '';
    try { doc = await documentText(); } catch { /* без контекста */ }
    const sel = ai.sel || {};
    let extra = '';
    if (op === 'fit_frame' && sel.overset) {
      const now = [...String(sel.storyText || '')].length;
      const fits = Math.max(1, now - sel.overset);
      const target = sel.scope === 'range' ? Math.max(1, [...sel.text].length - sel.overset) : fits;
      extra = `Текст должен поместиться в рамку: не длиннее ${Math.floor(target * 0.97)} символов с пробелами (сейчас ${[...sel.text].length}; в рамку помещается около ${fits} символов всего текста рамки). Сохрани деление на абзацы.`;
    }
    ai.abort = new AbortController();
    const payload = { mode: 'text', op: op === 'custom' ? '' : op, custom: op === 'custom' ? custom : '', extra, selection: sel.text || '', document: doc };
    let j;
    try {
      const r = await fetch(CFG.api, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ai.abort.signal });
      j = await readAnswer(r);
    } catch (e) {
      if (e.name === 'AbortError') return;
      j = { ok: false, error: e.message };
    }
    ai.abort = null;
    if (!ai.pop) return;
    if (!j || !j.ok) {
      body.innerHTML = `<div class="st-ai-res"><div class="st-ai-rt">${esc(title)}</div><p class="st-ai-err">${esc((j && j.error) || 'Модель не ответила.')}</p><div class="st-ai-acts"><button class="st-mini" data-a="back">Назад</button><button class="st-mini" data-a="again">Ещё раз</button></div></div>`;
    } else {
      ai.result = String(j.message?.content || '').trim();
      const ctxNote = j.context === 'windowed' ? 'публикация большая: учтены начало, заголовки и текст вокруг' : 'учтена вся публикация';
      const acts = aiActions(op);
      body.innerHTML = `<div class="st-ai-res">
        <div class="st-ai-rt">${esc(title)}<small>${esc(ctxNote)}</small></div>
        <div class="st-ai-out">${mdToHtml(ai.result) || '<p>(пустой ответ)</p>'}</div>
        <div class="st-ai-acts">
          ${acts.map(([a, label, main]) => `<button class="st-mini ${main ? 'primary' : ''}" data-a="${a}">${esc(label)}</button>`).join('')}
          <button class="st-mini" data-a="copy">Копировать</button>
          <button class="st-mini" data-a="again" title="Другой вариант">Ещё вариант</button>
          <button class="st-mini" data-a="back">Назад</button>
        </div></div>`;
    }
    body.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => aiAction(b.dataset.a); });
    aiPlace(...ai.anchor);
    body.querySelector('.primary, [data-a="again"]')?.focus();
  }
  // Текст результата для рамки: без разметки Markdown, абзацы — строками.
  const frameText = (md) => mdPlain(md).split('\n').map((l) => l.replace(/^\s*(?:[-*•–])\s+/, '• ').trimEnd()).join('\n').replace(/\n{2,}/g, '\n').trim();
  async function currentPage() {
    try { const ui = await PC.call('ui.inspect'); return Number.isInteger(ui.currentPage) ? ui.currentPage + 1 : 1; } catch { return 1; }
  }
  async function aiAction(a) {
    if (a === 'back') { aiMenu(ai.pop.querySelector('.st-ai-input').value); ai.pop.querySelector('.st-ai-foot').hidden = false; return; }
    if (a === 'again') { aiRun(ai.op, ai.custom); return; }
    if (a === 'copy') {
      const text = mdPlain(ai.result);
      try { await navigator.clipboard.writeText(text); } catch {
        const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); } catch { /* нет доступа к буферу */ }
        t.remove();
      }
      toast('Скопировано');
      return;
    }
    const sel = ai.sel || {};
    const text = frameText(ai.result);
    try {
      if (a === 'replace') {
        // Текст мог измениться, пока модель думала: заменяем, только если он на месте.
        const st = await PC.exec('story.get', { story: sel.story });
        if (sliceBytes(st.text, sel.start, sel.end) !== String(sel.storyText ? sliceBytes(sel.storyText, sel.start, sel.end) : sel.text)) {
          throw new Error('текст в рамке изменился, пока модель думала. Выделите его ещё раз');
        }
        await PC.exec('story.replaceRange', { story: sel.story, start: sel.start, end: sel.end, text });
      } else if (a === 'insertAfter') {
        const st = await PC.exec('story.get', { story: sel.story });
        const end = Math.min(sel.end, byteLen(st.text));
        await PC.exec('story.replaceRange', { story: sel.story, start: end, end, text: (end > 0 ? '\n' : '') + text });
      } else if (a === 'newFrame') {
        const r = await addTextFrame({ page: await currentPage(), text });
        if (r && r.id != null) await PC.exec('selection.set', { ids: [r.id] }).catch(() => {});
      }
      aiClose();
      toast('Готово. Отменить — Ctrl+Z');
    } catch (e) {
      toast('Не получилось: ' + e.message, true);
    }
  }
  window.addEventListener('aiindesign:ai', (e) => {
    const c = document.getElementById('designcraft_canvas');
    const r = c ? c.getBoundingClientRect() : { left: 0, top: 0 };
    const d = e.detail || {};
    aiOpen(r.left + (Number(d.x) || 0), r.top + (Number(d.y) || 0));
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.altKey && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const c = document.getElementById('designcraft_canvas');
      const r = c ? c.getBoundingClientRect() : { left: 0, top: 0, width: 800, height: 600 };
      aiOpen(r.left + Math.max(40, r.width / 2 - 200), r.top + Math.max(80, r.height / 4));
    }
  }, true);
  document.addEventListener('pointerdown', (e) => { if (ai.pop && !ai.pop.contains(e.target) && !ai.abort) aiClose(); }, true);

  // ------------------------------------------------------------------ тема
  // Тема редактора: фирменная (по умолчанию), светлая или тёмная. Панель — в тон.
  const THEMES = [['brand', 'Фирменная'], ['light', 'Светлая'], ['dark', 'Тёмная']];
  const systemDark = () => !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  function applyPanelTheme(themeId) {
    root.dataset.theme = themeId === 'brand' ? 'brand' : (themeId === 'dark' || (themeId === 'system' && systemDark()) ? 'dark' : 'light');
    document.documentElement.classList.toggle('studio-brand', themeId === 'brand');
    renderThemeMenu(themeId);
  }
  const syncBackdrop = () => {};
  function renderThemeMenu(current) {
    const menu = $('themeMenu');
    if (!menu) return;
    menu.innerHTML = THEMES.map((t) => `<button role="menuitemradio" aria-checked="${t[0] === current}" data-theme-id="${t[0]}">${esc(t[1])}</button>`).join('');
    menu.querySelectorAll('button').forEach((b) => { b.onclick = () => { toggleThemeMenu(false); setTheme(b.dataset.themeId); }; });
  }
  function toggleThemeMenu(open) {
    const menu = $('themeMenu');
    if (!menu) return;
    const show = open == null ? menu.hidden : open;
    menu.hidden = !show;
    $('theme').setAttribute('aria-expanded', String(show));
  }
  async function setTheme(themeId) {
    applyPanelTheme(themeId);
    store.set('theme', themeId);
    if (PC.ready()) await PC.exec('window.brightness', { brightness: themeId }).catch(() => {});
  }
  // Тема, которая сейчас в редакторе, как бы её ни выбрали (Окно › Яркость интерфейса, список в панели).
  async function watchTheme() {
    for (;;) {
      if (!document.hidden && PC.ready()) {
        try {
          const ui = await PC.call('ui.inspect');
          const id = ui && ui.ui && ui.ui.brightness;
          // Brand, Light, Dark; средние яркости InDesign панель показывает светлой или тёмной.
          if (typeof id === 'string') {
            const b = id.toLowerCase();
            applyPanelTheme(b === 'brand' ? 'brand' : (b.includes('dark') || b === 'highcontrast' ? 'dark' : 'light'));
          }
          // Заголовок вкладки браузера — имя публикации (окно браузера редактор сам не переименует).
          const docs = (ui && Array.isArray(ui.documents)) ? ui.documents : [];
          const cur = docs.length ? docs[docs.length - 1] : null;
          let doc = null;
          try { doc = await PC.call('document.inspect'); } catch { /* начальный экран */ }
          const t = doc ? doc.title : (cur && cur.title);
          const dirty = doc ? doc.dirty : (cur && cur.dirty);
          document.title = t ? `${t}${dirty ? ' •' : ''} — AI-InDesign` : 'AI-InDesign';
        } catch { /* не важно */ }
      }
      await sleep(2000);
    }
  }

  async function status() {
    try {
      const r = await fetch(CFG.api, { credentials: 'same-origin' });
      const j = await r.json();
      if (j.ok) {
        if (Number(j.ctx) > 0) CTX = Number(j.ctx);
        if (j.source) $('sub').title = 'Откуда взята модель: ' + j.source;
        $('sub').textContent = 'Модель: ' + j.model;
        fetch('studio/version.json', { cache: 'no-store' }).then((v) => (v.ok ? v.json() : null)).then((v) => {
          if (!v || !v.build) return;
          const d = String(v.date || '').split('-').reverse().join('.');
          $('sub').textContent = 'Модель: ' + j.model + ' · сборка ' + v.build + (d ? ' от ' + d : '');
          const pageBuild = document.documentElement.dataset.build;
          if (pageBuild && pageBuild !== String(v.build)) {
            const page = +pageBuild, server = +v.build;
            if (page > server) {
              msg('note', `Страница — от сборки ${esc(pageBuild)}, а файлы на сервере частично остались от сборки ${esc(String(v.build))}: ` +
                'программа заливки, похоже, пропустила файлы того же размера. Удалите старую папку на сервере целиком и залейте новую ' +
                '(или включите в программе «перезаписывать всегда»).');
            } else {
              msg('note', `Открыта старая копия страницы из кэша браузера (сборка ${esc(pageBuild)}), а на сервере уже сборка ${esc(String(v.build))}. Нажмите <b>Ctrl+F5</b>, чтобы загрузить новую.`);
            }
          }
        }).catch(() => {});
      }
      else $('sub').textContent = j.login ? 'Нужно войти в систему' : (j.error || 'Нет связи с помощником');
    } catch {
      $('sub').textContent = 'Нет связи с сервером помощника';
    }
  }

  function autosize() { input.style.height = 'auto'; input.style.height = Math.min(160, input.scrollHeight) + 'px'; }

  function mount() {
    document.body.appendChild(root);
    root.querySelectorAll('.st-seg button').forEach((b) => { b.onclick = () => setMode(b.dataset.mode); });
    $('eye').onclick = () => setEye(!attachScreen);
    initAgentMenu();
    $('hide').onclick = () => setOpen(false);
    $('fab').onclick = () => { setOpen(true); setBadge(false); };
    $('send').onclick = () => send();
    $('barBtn').onclick = () => setBar(!root.classList.contains('bar-open'));
    $('barSend').onclick = () => (busy ? send() : sendFromBar());
    $('barMode').onclick = () => setMode(mode === 'act' ? 'advice' : 'act');
    barInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); sendFromBar(); }
      if (e.key === 'Escape') { e.preventDefault(); setBar(false); }
    });
    $('clear').onclick = () => { if (!busy) { convo = []; showEmpty(); } };
    // Луна/солнце — между светлой и тёмной неоморфными; из фирменной — в светлую.
    $('theme').onclick = (e) => { e.stopPropagation(); toggleThemeMenu(); };
    document.addEventListener('pointerdown', (e) => { if (!e.target.closest || !e.target.closest('.st-theme-wrap')) toggleThemeMenu(false); }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleThemeMenu(false); });
    input.addEventListener('input', autosize);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
    });
    setMode(mode);
    setEye(attachScreen);
    applyPanelTheme('brand');
    showEmpty();
    status();
  }

  async function boot() {
    mount();
    // Ждём, пока WebAssembly загрузится и поставит window.aiindesign, а редактор запустится и начнёт отвечать.
    while (!PC.ready()) await sleep(200);
    for (let i = 0; i < 600; i++) {
      try { await PC.call('ui.inspect'); break; } catch { await sleep(300); }
    }
    Files.start();
    // Тема, выбранная в этом браузере раньше (редактор каждый раз начинает с фирменной).
    const saved = store.get('theme', 'brand');
    if (saved !== 'brand') setTheme(saved);
    // Шрифты — до того, как пользователь откроет публикацию (открытые потом перекомпонуются).
    const fonts = Fonts.start();
    await sleep(300);
    root.classList.add('ready');
    if (store.get('open', CFG.openOnStart)) setOpen(true);
    commands().catch(() => {});
    watchTheme();
    Gallery.start();
    fonts.then((n) => { if (n) console.info('AI-InDesign: шрифтов загружено', n); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
