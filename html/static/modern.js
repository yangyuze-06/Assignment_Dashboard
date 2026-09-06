let state = { dashboard: null, assignments: [], config: null, theme: null, selectedTheme: 'clean-blue', scanDirs: [], adminUnlocked: isAdminUrl(), lowPower: localStorage.getItem('assignment-os-low-power') === '1', announcements: [], aiBrain: null, aiRules: null, aiImportPreview: null, aiTrainCandidates: [] };
const baseThemeVars = {
  '--bg': '#11110f',
  '--panel': '#1b1a18',
  '--panel-2': '#24221f',
  '--panel-3': '#2e2b27',
  '--text': '#fffaf0',
  '--muted': '#c8c0b4',
  '--faint': '#8b8378',
  '--line': 'rgba(255,255,255,.105)',
  '--line-strong': 'rgba(255,255,255,.18)'
};
const themeStyleNames = { modern: '现代风', mecha: '机甲风', 'mecha-heart': '机甲之心', minimal: '极简风', shader: '流光 Shader', paper: '纸感高级' };
const heroTitles = [
  {
    title: '让课程作业状态像一块动态控制屏。',
    caption: '提交状态、学生卡片、文件队列、作业进度和配置入口都在同一个视觉系统里流动。'
  },
  {
    title: '把提交状态变成实时可读的课程雷达。',
    caption: '谁已完成、谁还待跟进、哪些文件需要处理，一眼就能从屏幕上读出来。'
  },
  {
    title: '从文件队列到学生卡片，一屏接住所有进度。',
    caption: '未归类文件、科目作业、学生完成率和最近提交记录，被压缩进清晰的工作路径。'
  },
  {
    title: '每一份作业都有路径，每一次提交都有信号。',
    caption: '科目、作业、学生、文件四条线索联动，减少人工翻目录和反复确认。'
  },
  {
    title: '把催交、归档、打包变成一条顺滑流水线。',
    caption: '课程日常不再被文件名和聊天记录拖住，处理动作直接落在最需要的位置。'
  },
  {
    title: '数据留在本机，作业处理全程本地完成。',
    caption: '学生名单、提交记录和文件归档都在本地运行，日常统计不依赖外部平台。'
  }
];
const modernFaqData = [
  { category: '新手流程', q: '第一次安装后应该按什么顺序配置？', a: '建议按这个顺序来：\n1. 导入学生名单。\n2. 检查扫描目录是否存在。\n3. 设置公示文件夹。\n4. 检查识别关键词。\n5. 回到总览点击「立即扫描」。\n6. 到文件页处理未归类文件。' },
  { category: '新手流程', q: '同学提交文件名有什么建议？', a: '建议统一包含姓名、科目和作业批次，例如：\n张三_第一次课程报告.docx\n李四_项目一作业.pdf\n王五_数字电子技术实验报告.docx\n文件名越规范，手动分配越少。' },
  { category: '基础使用', q: '仪表盘数据不更新怎么办？', a: '先点「立即扫描」。如果仍然没有数据，依次检查：\n1. 扫描目录是否存在。\n2. 微信是否已把文件下载到本地。\n3. 文件名是否包含作业/报告/论文/项目/实验/课程设计等关键词。\n4. 文件类型是否是 docx/pdf/zip 等支持格式。\n5. 文件是否已经被处理或忽略。' },
  { category: '学生管理', q: '如何批量导入学生名单？', a: '在学生页的批量导入框中，每行输入一个学生。\n推荐格式：姓名,学号,拼音\n例如：张三,2024001,zhangsan\n只填姓名也可以。' },
  { category: '学生管理', q: '学生姓名匹配不准确怎么办？', a: '优先让同学在文件名里写姓名或学号。也可以在学生名单里补充学号和拼音，减少同名、简称或文件名不规范造成的匹配失败。' },
  { category: '作业设置', q: '如何添加新的作业？', a: '进入作业页，在新增作业区域填写作业名称、科目和作业批次/小项标题。现代版会按「科目 -> 作业」梳状结构显示。' },
  { category: '作业设置', q: '如何设置截止日期？', a: '进入管理页，在「截止日期」卡片里为每个作业设置日期和备注，然后点击保存全部。' },
  { category: '文件归类', q: '未归类文件怎么处理？', a: '进入文件页，在未归类队列中选择学生后点击分配。确定不需要的文件可以点忽略。必要时先打开文件确认内容。' },
  { category: '文件归类', q: '文件是如何自动归类的？', a: '系统根据文件名中的学生姓名/学号、科目关键词和作业批次进行匹配，归入对应作业。文件名越接近「学生_科目_批次_说明」，识别越稳。' },
  { category: '公示文件夹', q: '公示文件夹是什么？', a: '公示文件夹是给班级集中查看和历史回填用的目录，通常放在桌面班级文件夹下。系统会把已识别文件同步到这里，方便按科目和作业查看。' },
  { category: '公示文件夹', q: '什么时候需要从公示目录回填？', a: '适合这些情况：\n1. 手动放入了历史作业文件。\n2. 换电脑或重装后 submissions 记录不完整。\n3. 旧版本已有公示目录，但仪表盘没有识别。' },
  { category: '打包下载', q: '如何打包下载某个科目的作业？', a: '进入作业页，在科目卡片中点击「打包整个科目」。系统会按科目/作业/学生结构生成 ZIP。' },
  { category: '主题与新版', q: '现代版主题会保存吗？', a: '会。现代版主题预设点击后会保存到配置里，下次重启仍然使用上次选择的主题。开屏 Logo 也会跟随主题主色和强调色变化。' },
  { category: '主题与新版', q: '下次启动如何默认进入新版？', a: '打开过 /modern 后，系统会记录默认前端为 modern。重启后打开 http://localhost:18765/ 会直接进入新版；/dashboard 仍可手动进入旧版。' },
  { category: '系统更新', q: '公告管理、更新包和服务器控制在哪里？', a: '这些属于管理员工具。进入 /modern?admin=true 后会显示旧版完整工具入口；也可以直接打开 /dashboard?admin=true。普通模式下会隐藏，避免误触。' },
  { category: '常见问题', q: '如何让手机访问仪表盘？', a: '在管理页开启“允许局域网访问”，确认后服务会自动重启。把页面显示的局域网地址和访问口令发到自己的手机，在同一个可信 Wi-Fi 中打开。不要把端口映射到公网。' },
  { category: '常见问题', q: '为什么有些文件没有被检测到？', a: '常见原因：\n1. 文件不在扫描目录。\n2. 微信还没下载完成。\n3. 文件名没有关键词。\n4. 文件类型不支持。\n5. 该文件已被记录为已知文件。\n先点立即扫描，再检查管理页扫描目录。' }
];
let heroTitleIndex = 0;
let heroTitleTimer = null;
let themeSaveSerial = 0;
window._unmatchedPaths = [];
window._recentPaths = [];
window._assignmentDetailFiles = [];
window._assignmentDetailFileRecords = [];
window._previewFilePath = '';
window._activeAssignmentDetailId = '';
window._activeAssignmentDetail = null;
const COMMON_SUBJECTS = ['课程报告', '课程论文', '项目作业', '实验报告', '课程设计', '小组作业', '数字电子技术', '程序设计'];
const MODERN_GUIDE_KEY = 'assignment-os-modern-guide-completed-v1';
const modernGuideSteps = [
  {
    page: 'overview',
    selector: '#page-overview .hero',
    title: '先从总览看当天状态',
    body: '完成率、截止提醒、最近文件和待处理数量会先汇总到这里，适合每天打开后先扫一眼。'
  },
  {
    page: 'overview',
    selector: '.topbar .primary',
    title: '收到文件后立即扫描',
    body: '微信文件下载到本地后，点这里会重新检查扫描目录；整套流程默认在本机完成。'
  },
  {
    page: 'assignments',
    selector: '#assignment-create-card',
    title: '新增作业时先定好显示层级',
    body: '科目会显示成一级作业卡片，作业标题和作业批次/小项标题会进入卡片内部，关键词用于识别文件名。'
  },
  {
    page: 'assignments',
    selector: '#assignment-list',
    title: '作业卡片可以继续下钻',
    body: '点击某个作业方框会进入详情，查看已交、未交、疑似误判文件，也能做删除和“非本作业”反馈。'
  },
  {
    page: 'students',
    selector: '#student-grid',
    title: '学生卡片用来快速查漏',
    body: '每个学生的完成率和缺交科目都会在卡片里展示，适合点名核对或课后集中提醒。'
  },
  {
    page: 'files',
    selector: '#unmatched-list',
    title: '未归类文件在这里处理',
    body: '识别不准的文件会进入未归类队列，你可以预览、打开所在文件夹、手动分配或批量忽略。'
  },
  {
    page: 'help',
    selector: '#page-help .help-layout',
    title: '帮助中心可以随时重播',
    body: '常见问题、推荐配置顺序和本引导入口都在这里；以后换主题后，引导样式也会跟着主题调整。'
  }
];
let modernGuideStep = 0;
let modernGuideActive = false;
let modernGuideTarget = null;
let modernGuideTimer = null;

async function apiGet(path) {
  const resp = await fetch(path);
  if (!resp.ok) throw new Error(path + ' ' + resp.status);
  return resp.json();
}
async function apiPost(path, data) {
  const resp = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}) });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok || payload.ok === false) {
    const msg = payload.msg || payload.error || path + ' ' + resp.status;
    toast(msg);
    throw new Error(msg);
  }
  return payload;
}
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2400);
}
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}
function jsString(text) {
  return JSON.stringify(String(text == null ? '' : text));
}
function switchToClassic() {
  location.href = state.adminUnlocked ? '/dashboard?admin=true' : '/dashboard';
}
function modernTypeLabel(type) {
  return ({ changelog: '更新日志', notice: '普通公告', urgent: '紧急通知' })[type] || type || '公告';
}
function selectModernAnnType(type) {
  const select = document.getElementById('modern-ann-type');
  if (select) select.value = type || 'changelog';
  updateModernAnnTypePicker();
}
function updateModernAnnTypePicker() {
  const current = document.getElementById('modern-ann-type')?.value || 'changelog';
  document.querySelectorAll('[data-ann-type]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.annType === current);
  });
}
function simpleMarkdown(text) {
  const safe = escapeHtml(text || '');
  return safe
    .replace(/^### (.*)$/gm, '<h4>$1</h4>')
    .replace(/^## (.*)$/gm, '<h3>$1</h3>')
    .replace(/^# (.*)$/gm, '<h2>$1</h2>')
    .replace(/^- (.*)$/gm, '<div>• $1</div>')
    .replace(/\n/g, '<br>');
}
function formatTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B','KB','MB','GB'];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return size.toFixed(i ? 1 : 0) + ' ' + units[i];
}
let mechaPageTransitionSerial = 0;
function activatePage(page) {
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === 'page-' + page));
  document.querySelectorAll('.nav button').forEach(btn => btn.classList.toggle('active', btn.dataset.page === page));
  if (page === 'students') renderStudents();
}
function showPage(page) {
  const target = document.getElementById('page-' + page);
  if (!target) return;
  const current = document.querySelector('.page.active');
  const reduceMotion = state.lowPower || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.body.classList.contains('ui-mecha-heart') || reduceMotion || current === target) {
    activatePage(page);
    return;
  }
  const layer = document.getElementById('mecha-heart-transition');
  if (!layer) {
    activatePage(page);
    return;
  }
  const serial = ++mechaPageTransitionSerial;
  layer.classList.remove('is-engaging', 'is-releasing');
  void layer.offsetWidth;
  layer.classList.add('is-engaging');
  window.setTimeout(() => {
    if (serial !== mechaPageTransitionSerial) return;
    activatePage(page);
    target.classList.remove('mecha-heart-page-in');
    void target.offsetWidth;
    target.classList.add('mecha-heart-page-in');
    layer.classList.remove('is-engaging');
    layer.classList.add('is-releasing');
  }, 300);
  window.setTimeout(() => {
    if (serial !== mechaPageTransitionSerial) return;
    layer.classList.remove('is-releasing');
    target.classList.remove('mecha-heart-page-in');
  }, 820);
}
function ensureModernGuideLayer() {
  let layer = document.getElementById('modern-guide-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'modern-guide-layer';
    layer.className = 'modern-guide-layer hidden';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = `
      <div class="modern-guide-scrim" data-side="top"></div>
      <div class="modern-guide-scrim" data-side="bottom"></div>
      <div class="modern-guide-scrim" data-side="left"></div>
      <div class="modern-guide-scrim" data-side="right"></div>
      <div class="modern-guide-corner" data-corner="tl"></div>
      <div class="modern-guide-corner" data-corner="tr"></div>
      <div class="modern-guide-corner" data-corner="bl"></div>
      <div class="modern-guide-corner" data-corner="br"></div>
      <div class="modern-guide-highlight" id="modern-guide-highlight"></div>
      <div class="modern-guide-card" id="modern-guide-card"></div>
    `;
    document.body.appendChild(layer);
  }
  return {
    layer,
    highlight: document.getElementById('modern-guide-highlight'),
    card: document.getElementById('modern-guide-card')
  };
}
function maybeStartModernGuide() {
  if (localStorage.getItem(MODERN_GUIDE_KEY) === '1') return;
  if (document.querySelector('[data-modern-ann-popup]')) {
    setTimeout(() => maybeStartModernGuide(), 1200);
    return;
  }
  startModernGuide(false);
}
function replayModernGuide() {
  localStorage.removeItem(MODERN_GUIDE_KEY);
  startModernGuide(true);
}
function startModernGuide(force) {
  if (modernGuideActive) return;
  if (!force && localStorage.getItem(MODERN_GUIDE_KEY) === '1') return;
  modernGuideActive = true;
  modernGuideStep = 0;
  showModernGuideStep();
}
function showModernGuideStep() {
  if (!modernGuideActive) return;
  if (modernGuideStep >= modernGuideSteps.length) return finishModernGuide(true);
  const step = modernGuideSteps[modernGuideStep];
  if (step.page) showPage(step.page);
  clearTimeout(modernGuideTimer);
  modernGuideTimer = setTimeout(() => {
    const target = document.querySelector(step.selector);
    if (!target) {
      modernGuideStep += 1;
      showModernGuideStep();
      return;
    }
    modernGuideTarget = target;
    target.scrollIntoView({ block: 'center', inline: 'center', behavior: state.lowPower ? 'auto' : 'smooth' });
    modernGuideTimer = setTimeout(() => renderModernGuideStep(step, target), state.lowPower ? 40 : 280);
  }, 80);
}
function renderModernGuideStep(step, target) {
  if (!modernGuideActive || !target) return;
  const { layer, highlight, card } = ensureModernGuideLayer();
  layer.classList.remove('hidden');
  layer.setAttribute('aria-hidden', 'false');
  card.innerHTML = `
    <div class="modern-guide-eyebrow">Step ${modernGuideStep + 1} / ${modernGuideSteps.length}</div>
    <h3>${escapeHtml(step.title)}</h3>
    <p>${escapeHtml(step.body)}</p>
    <div class="modern-guide-progress">
      <div class="modern-guide-dots">${modernGuideSteps.map((_, i) => `<span class="modern-guide-dot ${i === modernGuideStep ? 'active' : ''}"></span>`).join('')}</div>
      <span class="pill">${Math.round(((modernGuideStep + 1) / modernGuideSteps.length) * 100)}%</span>
    </div>
    <div class="modern-guide-actions">
      <button onclick="skipModernGuide()">跳过</button>
      <button onclick="prevModernGuideStep()" ${modernGuideStep === 0 ? 'disabled' : ''}>上一步</button>
      <button class="primary" onclick="nextModernGuideStep()">${modernGuideStep === modernGuideSteps.length - 1 ? '完成' : '下一步'}</button>
    </div>
  `;
  positionModernGuide(target);
}
function positionModernGuide(target) {
  if (!modernGuideActive || !target) return;
  const { layer, highlight, card } = ensureModernGuideLayer();
  const rect = target.getBoundingClientRect();
  const pad = 10;
  const left = Math.floor(Math.max(10, rect.left - pad));
  const top = Math.floor(Math.max(10, rect.top - pad));
  const right = Math.ceil(Math.min(window.innerWidth - 10, rect.right + pad));
  const bottom = Math.ceil(Math.min(window.innerHeight - 10, rect.bottom + pad));
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  highlight.style.left = left + 'px';
  highlight.style.top = top + 'px';
  highlight.style.width = width + 'px';
  highlight.style.height = height + 'px';
  const centerX = Math.round(left + width / 2);
  const centerY = Math.round(top + height / 2);
  layer.style.setProperty('--guide-x', centerX + 'px');
  layer.style.setProperty('--guide-y', centerY + 'px');
  layer.style.setProperty('--guide-radius', '18px');
  layer.style.setProperty('--guide-top', top + 'px');
  layer.style.setProperty('--guide-left', left + 'px');
  layer.style.setProperty('--guide-right', right + 'px');
  layer.style.setProperty('--guide-bottom', bottom + 'px');
  layer.style.setProperty('--guide-height', Math.max(0, bottom - top) + 'px');
  layer.style.setProperty('--guide-bottom-top', bottom + 'px');
  layer.style.setProperty('--guide-bottom-height', Math.max(0, window.innerHeight - bottom) + 'px');
  layer.style.setProperty('--guide-right-left', right + 'px');
  layer.style.setProperty('--guide-right-width', Math.max(0, window.innerWidth - right) + 'px');

  const gap = 16;
  const cardRect = card.getBoundingClientRect();
  const cardW = cardRect.width || Math.min(380, window.innerWidth - 28);
  const cardH = cardRect.height || 260;
  let cardLeft = rect.right + gap;
  let cardTop = rect.top;
  if (cardLeft + cardW > window.innerWidth - 14) cardLeft = rect.left - cardW - gap;
  if (cardLeft < 14) cardLeft = Math.min(Math.max(rect.left, 14), window.innerWidth - cardW - 14);
  if (cardTop + cardH > window.innerHeight - 14) cardTop = rect.bottom - cardH;
  if (cardTop < 14) cardTop = 14;
  card.style.left = cardLeft + 'px';
  card.style.top = cardTop + 'px';
}
function nextModernGuideStep() {
  modernGuideStep += 1;
  showModernGuideStep();
}
function prevModernGuideStep() {
  modernGuideStep = Math.max(0, modernGuideStep - 1);
  showModernGuideStep();
}
function skipModernGuide() {
  finishModernGuide(true);
}
function finishModernGuide(save) {
  modernGuideActive = false;
  modernGuideTarget = null;
  clearTimeout(modernGuideTimer);
  if (save) localStorage.setItem(MODERN_GUIDE_KEY, '1');
  const layer = document.getElementById('modern-guide-layer');
  if (layer) {
    layer.classList.add('hidden');
    layer.setAttribute('aria-hidden', 'true');
  }
}
window.addEventListener('resize', () => positionModernGuide(modernGuideTarget));
window.addEventListener('scroll', () => positionModernGuide(modernGuideTarget), true);
document.addEventListener('keydown', e => {
  if (modernGuideActive && e.key === 'Escape') skipModernGuide();
});
document.getElementById('nav').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-page]');
  if (btn) showPage(btn.dataset.page);
});
document.getElementById('brain-tabs')?.addEventListener('click', (e) => {
  const button = e.target.closest('button[data-brain-tab]');
  if (!button) return;
  const tab = button.dataset.brainTab;
  document.querySelectorAll('#brain-tabs button').forEach(item => item.classList.toggle('active', item === button));
  document.querySelectorAll('.brain-panel').forEach(panel => panel.classList.toggle('active', panel.id === 'brain-panel-' + tab));
});

function isAdminUrl() {
  const value = new URLSearchParams(location.search).get('admin');
  return ['true', '1', 'yes', 'ture'].includes(String(value || '').toLowerCase());
}
function updateAdminMode() {
  document.body.classList.toggle('admin-mode', state.adminUnlocked);
  if (!state.adminUnlocked && document.getElementById('page-manage')?.classList.contains('active')) {
    showPage('overview');
  }
}
function updateLowPowerMode() {
  document.body.classList.toggle('low-power', state.lowPower);
  const btn = document.getElementById('power-toggle');
  if (btn) {
    btn.classList.toggle('active', state.lowPower);
    btn.textContent = state.lowPower ? '低功耗中' : '低功耗';
    btn.title = state.lowPower ? '已关闭持续动画和开屏动效' : '关闭持续动画，降低浏览器功耗';
  }
  if (state.lowPower && heroTitleTimer) {
    window.clearInterval(heroTitleTimer);
    heroTitleTimer = null;
  } else if (!state.lowPower && !heroTitleTimer) {
    initHeroTitleCycle();
  }
}
function toggleLowPower() {
  state.lowPower = !state.lowPower;
  localStorage.setItem('assignment-os-low-power', state.lowPower ? '1' : '0');
  updateLowPowerMode();
  toast(state.lowPower ? '低功耗模式已开启' : '低功耗模式已关闭');
}

function setHeroTitle(index, animated = true) {
  const titleEl = document.querySelector('#page-overview .hero h2');
  const captionEl = document.querySelector('#page-overview .hero p');
  if (!titleEl || !captionEl) return;
  const item = heroTitles[index % heroTitles.length];
  titleEl.classList.add('title-cycle');
  captionEl.classList.add('title-caption');
  if (!animated) {
    titleEl.textContent = item.title;
    captionEl.textContent = item.caption;
    return;
  }
  titleEl.classList.remove('title-enter');
  titleEl.classList.add('title-leave');
  captionEl.classList.add('caption-swap');
  window.setTimeout(() => {
    titleEl.textContent = item.title;
    captionEl.textContent = item.caption;
    titleEl.classList.remove('title-leave');
    titleEl.classList.add('title-enter');
    captionEl.classList.remove('caption-swap');
  }, 360);
  window.setTimeout(() => titleEl.classList.remove('title-enter'), 980);
}
function initHeroTitleCycle() {
  if (heroTitleTimer) window.clearInterval(heroTitleTimer);
  heroTitleIndex = 0;
  setHeroTitle(heroTitleIndex, false);
  if (state.lowPower) {
    heroTitleTimer = null;
    return;
  }
  heroTitleTimer = window.setInterval(() => {
    heroTitleIndex = (heroTitleIndex + 1) % heroTitles.length;
    setHeroTitle(heroTitleIndex, true);
  }, 6200);
}
function playBootIntro() {
  const intro = document.getElementById('boot-intro');
  if (!intro) return;
  if (state.lowPower || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    intro.remove();
    return;
  }
  intro.classList.add('play');
  window.setTimeout(() => intro.classList.add('is-hidden'), 3150);
}

function applyThemeValues(theme) {
  const preset = (theme.presets || []).find(p => p.id === theme.active);
  const colors = theme.active === 'custom' ? theme.custom : (preset?.colors || theme.custom || {});
  const style = theme.active === 'custom' ? (theme.style || 'modern') : (preset?.style || theme.style || 'modern');
  document.body.classList.remove('ui-modern', 'ui-mecha', 'ui-mecha-heart', 'ui-minimal', 'ui-shader', 'ui-paper');
  document.body.classList.add(`ui-${style}`);
  if (style === 'mecha-heart') document.body.classList.add('ui-mecha');
  Object.entries(baseThemeVars).forEach(([key, val]) => document.documentElement.style.setProperty(key, val));
  if (colors.primary) document.documentElement.style.setProperty('--primary', colors.primary);
  if (colors.accent) document.documentElement.style.setProperty('--accent', colors.accent);
  if (style !== 'modern') {
    if (colors.background) document.documentElement.style.setProperty('--bg', colors.background);
    if (colors.surface) {
      document.documentElement.style.setProperty('--panel', colors.surface);
      document.documentElement.style.setProperty('--panel-2', colors.surface);
    }
    if (colors.text) document.documentElement.style.setProperty('--text', colors.text);
    if (colors.border) {
      document.documentElement.style.setProperty('--line', colors.border);
      document.documentElement.style.setProperty('--line-strong', colors.border);
    }
  }
}
function applyTheme(theme, { animate = false } = {}) {
  const reduceMotion = state.lowPower || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!animate || reduceMotion) {
    applyThemeValues(theme);
    return;
  }

  const update = () => applyThemeValues(theme);
  if (typeof document.startViewTransition === 'function') {
    document.startViewTransition(update);
    return;
  }

  document.documentElement.classList.add('theme-transitioning');
  update();
  window.setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 460);
}
async function loadTheme() {
  const theme = await apiGet('/api/theme');
  state.theme = theme;
  state.selectedTheme = theme.active || 'clean-blue';
  applyTheme(theme);
  renderThemes();
}
function renderThemes() {
  const grid = document.getElementById('theme-grid');
  const select = document.getElementById('theme-select');
  const summary = document.getElementById('theme-summary');
  const stylePill = document.getElementById('theme-style-pill');
  const presets = state.theme?.presets || [];
  if (select) {
    select.innerHTML = presets.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');
    select.value = state.selectedTheme;
  }
  const active = presets.find(p => p.id === state.selectedTheme) || presets[0];
  if (active && summary) {
    const c = active.colors || {};
    const styleName = themeStyleNames[active.style || 'modern'] || '现代风';
    summary.innerHTML = `<div class="theme-summary-top">
      <div class="theme-summary-title">${escapeHtml(active.name)}</div>
      <span class="style-pill">${escapeHtml(styleName)}</span>
    </div>
    <div class="row-sub">${escapeHtml(active.description || '')}</div>
    <div class="swatches">
      <span class="swatch" style="background:${c.primary || '#8b5cf6'}"></span>
      <span class="swatch" style="background:${c.accent || '#22d3a6'}"></span>
      <span class="swatch" style="background:${c.background || '#11110f'}"></span>
      <span class="swatch" style="background:${c.surface || '#1b1a18'}"></span>
    </div>`;
    if (stylePill) stylePill.textContent = styleName;
  } else if (summary) {
    summary.innerHTML = '<div class="empty">暂无主题预设</div>';
    if (stylePill) stylePill.textContent = '-';
  }
  if (!grid) return;
  grid.innerHTML = presets.map(p => {
    const c = p.colors || {};
    const styleName = themeStyleNames[p.style || 'modern'] || '现代风';
    return `<button class="theme-card ${state.selectedTheme === p.id ? 'active' : ''}" onclick="selectTheme('${p.id}')">
      <div class="theme-topline"><strong>${escapeHtml(p.name)}</strong><span class="style-pill">${styleName}</span></div>
      <div class="row-sub">${escapeHtml(p.description || '')}</div>
      <div class="swatches">
        <span class="swatch" style="background:${c.primary || '#8b5cf6'}"></span>
        <span class="swatch" style="background:${c.accent || '#22d3a6'}"></span>
        <span class="swatch" style="background:${c.background || '#11110f'}"></span>
      </div>
    </button>`;
  }).join('');
}
async function selectTheme(id) {
  state.selectedTheme = id;
  applyTheme({ ...state.theme, active: id }, { animate: true });
  renderThemes();
  const serial = ++themeSaveSerial;
  try {
    const resp = await apiPost('/api/theme/save', { ...state.theme, active: id });
    if (serial !== themeSaveSerial) return;
    state.theme = resp.theme;
    state.selectedTheme = resp.theme.active;
    applyTheme(resp.theme);
    renderThemes();
    toast('主题预设已保存');
  } catch (e) {
    toast('主题保存失败：' + e.message);
  }
}
async function saveTheme() {
  const resp = await apiPost('/api/theme/save', { ...state.theme, active: state.selectedTheme });
  state.theme = resp.theme;
  state.selectedTheme = resp.theme.active;
  applyTheme(resp.theme);
  renderThemes();
  toast('主题已保存');
}

function renderModernHelp() {
  const cats = document.getElementById('modern-faq-cats');
  const list = document.getElementById('modern-faq-list');
  if (!cats || !list) return;
  const categories = [...new Set(modernFaqData.map(item => item.category))];
  cats.innerHTML = `<button class="faq-cat active" data-cat="">全部</button>` +
    categories.map(cat => `<button class="faq-cat" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`).join('');
  if (!cats._bound) {
    cats._bound = true;
    cats.addEventListener('click', (e) => {
      const btn = e.target.closest('.faq-cat');
      if (btn) modernHelpFilter(btn.dataset.cat || '');
    });
  }
  modernHelpFilter('');
}
function modernHelpFilter(category) {
  const search = (document.getElementById('modern-faq-search')?.value || '').trim().toLowerCase();
  const activeCategory = category === undefined ? (document.querySelector('.faq-cat.active')?.dataset.cat || '') : category;
  document.querySelectorAll('.faq-cat').forEach(btn => btn.classList.toggle('active', (btn.dataset.cat || '') === (activeCategory || '')));
  const list = document.getElementById('modern-faq-list');
  if (!list) return;
  const items = modernFaqData.filter(item => {
    const text = `${item.category} ${item.q} ${item.a}`.toLowerCase();
    return (!activeCategory || item.category === activeCategory) && (!search || text.includes(search));
  });
  document.getElementById('modern-faq-count').textContent = items.length + ' 条';
  list.innerHTML = items.map((item, idx) => `<div class="faq-item ${idx === 0 ? 'open' : ''}">
    <button class="faq-q" onclick="this.closest('.faq-item').classList.toggle('open')">
      <span>${escapeHtml(item.q)}</span><span>›</span>
    </button>
    <div class="faq-a"><span class="tag">${escapeHtml(item.category)}</span>
${escapeHtml(item.a)}</div>
  </div>`).join('') || '<div class="empty">没有找到相关问题</div>';
}

async function loadAll() {
  const [status, dashboard, assignments, cfg, scanDirs, network] = await Promise.all([
    apiGet('/api/status'),
    apiGet('/api/dashboard'),
    apiGet('/api/assignments'),
    apiGet('/api/config'),
    apiGet('/api/scan-dirs'),
    apiGet('/api/network-access')
  ]);
  state.dashboard = dashboard;
  if (!Array.isArray(assignments)) throw new Error('作业列表接口返回异常');
  state.assignments = assignments;
  state.config = cfg || {};
  state.scanDirs = Array.isArray(scanDirs) ? scanDirs : [];
  state.network = network || {};
  try {
    const [brain, rules] = await Promise.all([apiGet('/api/ai/brain'), apiGet('/api/ai/rules')]);
    state.aiBrain = brain || {};
    state.aiRules = rules?.rule_pack || { schema_version: 1, profile: {}, subjects: {}, types: {} };
  } catch (e) {
    state.aiBrain = { available: false, stats: {}, settings: { mode: 'off', sensitivity: .70 } };
    state.aiRules = { schema_version: 1, profile: {}, subjects: {}, types: {} };
  }
  renderAssignmentSubjectSelect();
  renderStatus(status, cfg);
  renderOverview();
  renderAssignments();
  renderStudents();
  renderFiles();
  renderScanDirs();
  renderKeywords();
  renderAssignmentKeywords();
  renderClassificationBrain();
  renderDueSettings();
  renderExperimentSettings();
  renderNetworkAccess();
  renderModernHelp();
  renderModernAnnouncementList();
  refreshServerStatus();
}
function renderStatus(status, cfg) {
  const students = state.dashboard?.students || [];
  document.getElementById('class-name').textContent = cfg.class_name || '班级作业';
  document.getElementById('watch-dot').classList.toggle('off', !status.watching);
  document.getElementById('watch-text').textContent = status.watching ? '实时监控中' : '监控已暂停';
  document.getElementById('dir-count').textContent = (status.watch_dirs || []).length + ' 个监听目录';
  document.getElementById('top-student-count').textContent = students.length + ' 名学生';
  renderRuntimeCapabilities(status);
}
function renderRuntimeCapabilities(status) {
  const note = document.getElementById('runtime-capability-note');
  if (!note) return;
  const warnings = [...(status.capabilities?.warnings || []), ...(status.wechat_discovery?.warnings || [])];
  if (status.wechat_discovery?.manual_selection_required) {
    warnings.push('未自动发现微信目录，请把微信文件目录粘贴到上方输入框手动添加。');
  }
  note.textContent = [...new Set(warnings)].join(' ');
  note.style.color = warnings.length ? 'var(--orange)' : '';
}
function activeAssignments() {
  return (state.dashboard?.assignments || []).filter(a => !a.completed);
}
function studentStats(student) {
  const assignments = activeAssignments();
  const status = state.dashboard?.assignment_status?.[student.name] || {};
  const done = assignments.filter(a => status[a.id]).length;
  const total = assignments.length;
  const pct = total ? Math.round(done / total * 100) : 100;
  return { done, total, pct, pending: assignments.filter(a => !status[a.id]) };
}
function subjectGroupsForStudent(student) {
  const status = state.dashboard?.assignment_status?.[student.name] || {};
  const groups = {};
  activeAssignments().forEach(a => {
    const name = a.subject_group || a.subject || '其他';
    groups[name] ||= { total: 0, done: 0 };
    groups[name].total++;
    if (status[a.id]) groups[name].done++;
  });
  return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'));
}
function renderOverview() {
  const d = state.dashboard;
  if (!d) return;
  const students = d.students || [];
  const stats = students.map(studentStats);
  const doneStudents = stats.filter(s => s.total > 0 && s.done === s.total).length;
  const total = students.length;
  const missing = Math.max(0, total - doneStudents);
  const rate = total ? Math.round(doneStudents / total * 100) : 0;
  document.getElementById('m-rate').textContent = rate + '%';
  document.getElementById('hero-rate').textContent = rate + '%';
  document.getElementById('hero-rate-bar').style.width = rate + '%';
  document.getElementById('m-done').textContent = doneStudents + '/' + total;
  document.getElementById('m-missing').textContent = missing;
  document.getElementById('m-unmatched').textContent = (d.unmatched_files || []).length;
  document.getElementById('m-assignments').textContent = activeAssignments().length;
  document.getElementById('signal-missing').textContent = missing;
  document.getElementById('signal-unmatched').textContent = (d.unmatched_files || []).length;
  document.getElementById('signal-assignments').textContent = activeAssignments().length;
  renderSubjectProgress();
  renderRecentFiles();
  renderDueOverview();
}
function dueStatus(due) {
  if (!due) return { label: '未设置', cls: '', days: null, sort: 99999 };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(due + 'T00:00:00');
  if (Number.isNaN(target.getTime())) return { label: '日期异常', cls: 'bad', days: null, sort: 99998 };
  const days = Math.round((target - today) / 86400000);
  if (days < 0) return { label: `逾期 ${Math.abs(days)} 天`, cls: 'bad', days, sort: days };
  if (days === 0) return { label: '今天截止', cls: 'bad', days, sort: 0 };
  if (days <= 3) return { label: `${days} 天后截止`, cls: 'orange', days, sort: days };
  return { label: `${days} 天后`, cls: 'good', days, sort: days };
}
function renderDueOverview() {
  const el = document.getElementById('due-overview-list');
  const summary = document.getElementById('due-summary');
  if (!el || !summary) return;
  const items = activeAssignments()
    .map(a => ({ ...a, _due: dueStatus(a.due || '') }))
    .filter(a => a.due)
    .sort((a, b) => a._due.sort - b._due.sort || String(a.subject_group || a.subject || '').localeCompare(String(b.subject_group || b.subject || ''), 'zh-CN'))
    .slice(0, 8);
  const urgent = items.filter(a => a._due.days != null && a._due.days <= 3).length;
  summary.textContent = items.length ? `${urgent} 项需关注` : '暂无截止日期';
  el.innerHTML = items.map(a => `<div class="due-overview-item is-${a._due.cls || 'normal'}">
    <div><div class="row-title">${escapeHtml(a.subject_group || a.subject || '其他')} · ${escapeHtml(a.experiment || a.name || '未命名作业')}</div><div class="row-sub">截止 ${escapeHtml(a.due)}${a.notes ? ' · ' + escapeHtml(a.notes) : ''}</div></div>
    <span class="pill ${a._due.cls}">${escapeHtml(a._due.label)}</span>
  </div>`).join('') || '<div class="empty">暂无截止日期。可以在管理页为每个作业设置截止时间。</div>';
}
function renderSubjectProgress() {
  const d = state.dashboard;
  const assignments = activeAssignments();
  const students = d.students || [];
  const status = d.assignment_status || {};
  const groups = {};
  assignments.forEach(a => {
    const name = a.subject_group || a.subject || '其他';
    groups[name] ||= [];
    groups[name].push(a);
  });
  const names = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  document.getElementById('subject-summary').textContent = names.length + ' 个科目';
  document.getElementById('subject-progress').innerHTML = names.map((name, idx) => {
    const items = groups[name];
    let done = 0;
    students.forEach(s => {
      if (items.every(a => status[s.name]?.[a.id])) done++;
    });
    const pct = students.length ? Math.round(done / students.length * 100) : 0;
    const cls = pct >= 80 ? 'green' : pct > 0 ? 'orange' : 'red';
    return `<div class="card material-card" style="animation-delay:${idx * 0.04}s">
      <div>
        <span class="tag ${cls}">${pct >= 80 ? 'Progress Good' : pct > 0 ? 'In Progress' : 'Needs Action'}</span>
        <h3>${escapeHtml(name)}</h3>
        <p>${items.length} 项作业，${done}/${students.length} 人完成。${pct >= 80 ? '进入收尾阶段。' : '需要持续跟进未提交同学。'}</p>
        <div class="progress"><div class="bar" style="width:${pct}%"></div></div>
      </div>
      <div class="card-foot">提交率 ${pct}% · ${items.map(a => escapeHtml(a.experiment || a.name || '')).slice(0, 3).join(' / ')}</div>
    </div>`;
  }).join('') || '<div class="empty">暂无未完成作业</div>';
}
function renderRecentFiles() {
  const recent = (state.dashboard?.recent_files || []).slice(-6).reverse();
  document.getElementById('recent-files').innerHTML = recent.map((r, i) => `<div class="row" style="animation-delay:${i * 0.03}s">
    <div><div class="row-title">${escapeHtml(r.file?.name || r.file_name || '-')}</div><div class="row-sub">${escapeHtml(r.student || '未匹配')} · ${formatTime(r.detected_at)}</div></div>
    <span class="pill">${escapeHtml(r.status || '记录')}</span>
  </div>`).join('') || '<div class="empty">暂无接收文件</div>';
}
function renderAssignments() {
  const list = state.assignments || [];
  const groups = {};
  list.forEach(a => {
    const subject = a.subject_group || a.subject || '其他';
    groups[subject] ||= [];
    groups[subject].push(a);
  });
  const orderRank = value => {
    const text = String(value || '');
    const ranks = [
      ['第一', 1], ['第1', 1], ['一次', 1],
      ['第二', 2], ['第2', 2], ['二次', 2],
      ['第三', 3], ['第3', 3], ['三次', 3],
      ['第四', 4], ['第4', 4], ['四次', 4],
      ['大作业', 90], ['课设', 95], ['课程设计', 95]
    ];
    const hit = ranks.find(([key]) => text.includes(key));
    return hit ? hit[1] : 50;
  };
  const subjectNames = Object.keys(groups).sort((a, b) => {
    const priority = {
      '课程作业': 1, '课程报告': 2, '项目作业': 3, '课程论文': 4,
      '实验报告': 5, '课程设计': 6, '小组作业': 7,
      '数字电子技术': 20, '程序设计': 21
    };
    return (priority[a] || 20) - (priority[b] || 20) || a.localeCompare(b, 'zh-CN');
  });
  window._assignmentActions = [];
  window._subjectActions = [];
  const completeEffectSubject = sessionStorage.getItem('assignment-os-subject-complete-effect') || '';
  document.getElementById('assignment-list').innerHTML = subjectNames.map((subject, i) => {
    const items = groups[subject].sort((a, b) => orderRank(a.experiment || a.name) - orderRank(b.experiment || b.name) || String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN'));
    const submitted = items.reduce((sum, a) => sum + (a.submitted || 0), 0);
    const total = items.reduce((sum, a) => sum + (a.total || 0), 0);
    const pct = total ? Math.round(submitted / total * 100) : 0;
    const cls = pct >= 100 ? 'green' : pct > 0 ? 'orange' : 'red';
    const subjectActionIndex = window._subjectActions.push(subject) - 1;
    const allDone = items.length > 0 && items.every(a => a.completed);
    const playComplete = completeEffectSubject === subject;
    return `<div class="card material-card subject-card ${allDone ? 'is-subject-complete' : ''} ${playComplete ? 'play-complete' : ''}" style="animation-delay:${i * 0.035}s">
      ${allDone ? '<div class="subject-complete-mark" aria-hidden="true">✓</div>' : ''}
      <div>
        <span class="tag ${cls}">${pct >= 100 ? 'Completed' : pct > 0 ? 'Collecting' : 'Waiting'}</span>
        <h3>${escapeHtml(subject)}</h3>
        <p>${items.length} 个作业节点 · ${submitted}/${total || 0} 人次提交 · 按科目梳状归档</p>
        <div class="progress"><div class="bar" style="width:${pct}%"></div></div>
      </div>
      <div class="file-actions">
        <button onclick="packSubjectByIndex(${subjectActionIndex})">打包整个科目</button>
        <button class="subject-complete-button ${allDone ? 'ghost' : 'primary'}" onclick="toggleSubjectCompletedByIndex(${subjectActionIndex}, ${allDone ? 'false' : 'true'})">${allDone ? '取消全科完成' : '全科完成'}</button>
        <button class="danger" onclick="deleteSubjectByIndex(${subjectActionIndex})">删除科目</button>
      </div>
      <div class="assignment-tree">${items.map(a => {
        const itemPct = a.total ? Math.round((a.submitted || 0) / a.total * 100) : 0;
        const itemCls = itemPct >= 100 ? 'green' : itemPct > 0 ? 'orange' : 'red';
        const assignmentActionIndex = window._assignmentActions.push({
          id: a.id,
          name: a.name || '',
          subject_group: a.subject_group || a.subject || subject,
          subject: a.subject || a.subject_group || subject,
          experiment: a.experiment || ''
        }) - 1;
        return `<div class="assignment-node" onclick="showAssignmentDetailByIndex(${assignmentActionIndex})">
          <div>
            <div class="node-title">${escapeHtml(a.experiment || a.name || '未命名作业')}</div>
            <div class="node-meta">${escapeHtml(a.name || '')}${a.due ? ' · 截止 ' + escapeHtml(a.due) : ''}</div>
          </div>
          <div>
            <span class="tag ${itemCls}">${a.submitted || 0}/${a.total || 0} 人提交</span>
            <div class="progress"><div class="bar" style="width:${itemPct}%"></div></div>
          </div>
          <div class="node-actions" onclick="event.stopPropagation()">
            <button onclick="showAssignmentDetailByIndex(${assignmentActionIndex})">详情</button>
            <button onclick="toggleAssignmentCompletedByIndex(${assignmentActionIndex}, ${a.completed ? 'false' : 'true'})">${a.completed ? '取消完成' : '标记完成'}</button>
            <button class="danger" onclick="deleteAssignmentByIndex(${assignmentActionIndex})">删除</button>
          </div>
        </div>`;
      }).join('')}</div>
      <div class="card-foot">${pct}% 汇总完成 · ${items.filter(a => a.completed).length}/${items.length} 个作业已标记完成</div>
    </div>`;
  }).join('') || '<div class="empty">暂无作业数据</div>';
  clearSubjectCompleteEffect(completeEffectSubject);
}
function clearSubjectCompleteEffect(completeEffectSubject) {
  if (!completeEffectSubject) return;
  sessionStorage.removeItem('assignment-os-subject-complete-effect');
  setTimeout(() => {
    document.querySelectorAll('.subject-card.play-complete').forEach(card => card.classList.remove('play-complete'));
  }, 1100);
}
function assignmentDisplayTitle(a) {
  const subject = a?.subject_group || a?.subject || '';
  const exp = a?.experiment || '';
  return [subject, exp].filter(Boolean).join(' · ') || a?.name || '作业详情';
}
function setAssignmentDetailVisible(visible) {
  const detail = document.getElementById('assignment-detail');
  const list = document.getElementById('assignment-list');
  const create = document.getElementById('assignment-create-card');
  if (detail) detail.hidden = !visible;
  if (list) list.hidden = visible;
  if (create) create.hidden = visible;
}
function scrollToAssignmentDetail() {
  const detail = document.getElementById('assignment-detail');
  if (!detail || detail.hidden) return;
  const behavior = state.lowPower ? 'auto' : 'smooth';
  requestAnimationFrame(() => {
    try {
      detail.scrollIntoView({ behavior, block: 'start', inline: 'nearest' });
    } catch (e) {
      detail.scrollIntoView();
    }
  });
}
function showAssignmentListView() {
  setAssignmentDetailVisible(false);
  window._assignmentDetailFiles = [];
  window._assignmentDetailFileRecords = [];
  window._activeAssignmentDetailId = '';
  window._activeAssignmentDetail = null;
}
async function showAssignmentDetailByIndex(index) {
  const item = window._assignmentActions?.[index];
  if (!item?.id) return toast('未找到作业项，请刷新后再试');
  await showAssignmentDetail(item.id);
}
async function showAssignmentDetail(id) {
  const detail = document.getElementById('assignment-detail');
  if (!detail) return;
  window._activeAssignmentDetailId = id;
  setAssignmentDetailVisible(true);
  detail.innerHTML = '<div class="card"><div class="empty">正在加载作业详情...</div></div>';
  scrollToAssignmentDetail();
  try {
    const data = await apiGet('/api/assignment/' + encodeURIComponent(id));
    if (data.error) throw new Error('作业不存在');
    renderAssignmentDetail(data);
    scrollToAssignmentDetail();
  } catch (e) {
    detail.innerHTML = `<div class="card"><div class="section-head"><h3>详情加载失败</h3><button onclick="showAssignmentListView()">返回列表</button></div><div class="empty">${escapeHtml(e.message || '请刷新后再试')}</div></div>`;
    scrollToAssignmentDetail();
  }
}
function renderAssignmentDetail(data) {
  const detail = document.getElementById('assignment-detail');
  const a = data.assignment || {};
  window._activeAssignmentDetail = a;
  const submitted = data.submitted || [];
  const missing = data.not_submitted || [];
  const pending = (state.dashboard?.pending_archive_files || []).filter(file => (file.classification || {}).subject_group === a.subject_group);
  const total = data.total || 0;
  const done = data.submitted_count || submitted.length;
  const miss = data.not_submitted_count || missing.length;
  const rate = total ? Math.round(done / total * 100) : 0;
  window._assignmentDetailFiles = [];
  window._assignmentDetailFileRecords = [];
  const submittedHtml = submitted.map((student, i) => {
    const files = student.files || [];
    const fileHtml = files.map(file => {
      const fileIndex = window._assignmentDetailFiles.push(file.path || '') - 1;
      window._assignmentDetailFileRecords[fileIndex] = {
        path: file.path || '',
        name: file.name || '',
        student: student.name || '',
        detected_at: file.time || ''
      };
      return `<div class="submission-file">
        <span title="${escapeHtml(file.name || '')}">${escapeHtml(file.name || '未命名文件')} · ${formatSize(file.size || 0)}</span>
        <button onclick="openDetailFile(${fileIndex})">打开</button>
        <button onclick="openDetailFolder(${fileIndex})">文件夹</button>
        <button class="danger mini-x" title="处理这条提交记录" aria-label="处理这条提交记录" onclick="deleteDetailFile(${fileIndex})">×</button>
      </div>`;
    }).join('') || '<div class="empty">暂无可打开文件记录</div>';
    return `<div class="submission-card" style="animation-delay:${i * 0.025}s">
      <div class="submission-top">
        <div><div class="node-title">${escapeHtml(student.name || '-')}</div><div class="node-meta">${escapeHtml(student.student_id || '')}${student.time ? ' · ' + formatTime(student.time) : ''}</div></div>
        <span class="tag green">${files.length} 个文件</span>
      </div>
      <div class="submission-files">${fileHtml}</div>
    </div>`;
  }).join('') || '<div class="empty">还没有学生提交这个作业</div>';
  const missingHtml = missing.map(s => `<span class="pill bad">${escapeHtml(s.name || '-')}${s.student_id ? ' · ' + escapeHtml(s.student_id) : ''}</span>`).join('') || '<span class="pill good">全部已提交</span>';
  const pendingHtml = pending.map(file => `<div class="submission-file"><span>${escapeHtml(file.file_name || '-')} · ${escapeHtml((file.classification?.evidence || []).join('；') || '等待确认具体作业')}</span><button onclick="previewFile(${jsString(file.file_path || '')})">预览</button><button onclick="openPreviewFolderByPath(${jsString(file.file_path || '')})">文件夹</button></div>`).join('') || '<div class="empty">当前科目没有待归档文件</div>';
  detail.innerHTML = `<div class="card detail-hero">
    <div>
      <div class="section-head"><span class="tag blue">Assignment Detail</span><button onclick="showAssignmentListView()">返回作业列表</button></div>
      <h2 class="detail-title">${escapeHtml(assignmentDisplayTitle(a))}</h2>
      <p>${escapeHtml(a.name || '')}${a.due ? ' · 截止 ' + escapeHtml(a.due) : ''}${a.notes ? ' · ' + escapeHtml(a.notes) : ''}</p>
      <div class="progress"><div class="bar" style="width:${rate}%"></div></div>
    </div>
    <div class="detail-summary">
      <span class="tag ${rate >= 100 ? 'green' : rate > 0 ? 'orange' : 'red'}">${rate >= 100 ? 'Completed' : rate > 0 ? 'Collecting' : 'Waiting'}</span>
      <strong>${rate}%</strong>
      <p>${done}/${total} 名学生已提交，${miss} 名仍需跟进。</p>
    </div>
  </div>
  <div class="detail-stats">
    <div class="detail-stat"><span>总人数</span><strong>${total}</strong></div>
    <div class="detail-stat"><span>已提交</span><strong>${done}</strong></div>
    <div class="detail-stat"><span>未提交</span><strong>${miss}</strong></div>
    <div class="detail-stat"><span>文件记录</span><strong>${submitted.reduce((sum, s) => sum + ((s.files || []).length), 0)}</strong></div>
  </div>
  <div class="detail-grid">
    <div class="card">
      <div class="section-head"><h3>已提交学生</h3><span class="pill good">${done} 人</span></div>
      <div class="submission-list">${submittedHtml}</div>
    </div>
    <div class="card">
      <div class="section-head"><h3>未提交学生</h3><span class="pill bad">${miss} 人</span></div>
      <div class="missing-list">${missingHtml}</div>
    </div>
  </div>
  <div class="card" style="margin-top:14px">
    <div class="section-head"><h3>待归档文件</h3><span class="pill warn">${pending.length} 个</span></div>
    <p class="row-sub">这些文件已识别当前科目，但还没有确认具体作业，因此未归档，也未同步到公示文件夹。</p>
    <div class="submission-files">${pendingHtml}</div>
  </div>`;
}
async function openPreviewFolderByPath(path) {
  if (path) await apiGet('/api/open-folder?path=' + encodeURIComponent(path));
}
function assignmentSubjectOptions() {
  const seen = new Set();
  const out = [];
  const add = value => {
    const text = String(value || '').trim();
    if (!text || text === '其他' || seen.has(text)) return;
    seen.add(text);
    out.push(text);
  };
  COMMON_SUBJECTS.forEach(add);
  for (const a of [...(state.assignments || []), ...(state.dashboard?.assignments || [])]) {
    add(a.subject_group || a.subject);
  }
  for (const a of (state.config?.assignments || [])) {
    add(a.subject_group || a.subject);
  }
  return out.sort((a, b) => {
    const ai = COMMON_SUBJECTS.indexOf(a);
    const bi = COMMON_SUBJECTS.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.localeCompare(b, 'zh-CN');
  });
}
function parseKeywordInput(text) {
  const seen = new Set();
  const out = [];
  String(text || '').split(/[\n,，、;；]+/).map(s => s.trim()).filter(Boolean).forEach(k => {
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  });
  return out;
}
function renderAssignmentSubjectSelect() {
  const select = document.getElementById('new-assignment-subject');
  if (!select) return;
  const previous = select.value;
  const options = assignmentSubjectOptions();
  select.innerHTML = `<option value="">选择科目</option>${options.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}<option value="__custom__">新建科目...</option>`;
  if (previous && [...select.options].some(o => o.value === previous)) select.value = previous;
  handleAssignmentSubjectChange();
}
function handleAssignmentSubjectChange() {
  const select = document.getElementById('new-assignment-subject');
  const custom = document.getElementById('new-assignment-subject-custom');
  if (!select || !custom) return;
  const isCustom = select.value === '__custom__';
  custom.hidden = !isCustom;
  if (isCustom) custom.focus();
}
function selectedAssignmentSubject() {
  const select = document.getElementById('new-assignment-subject');
  const custom = document.getElementById('new-assignment-subject-custom');
  if (!select) return '';
  return (select.value === '__custom__' ? custom?.value : select.value || '').trim();
}
function renderStudents() {
  const grid = document.getElementById('student-grid');
  if (!grid || !state.dashboard) return;
  const q = (document.getElementById('student-search')?.value || '').trim().toLowerCase();
  const filter = document.getElementById('student-filter')?.value || 'all';
  let students = state.dashboard.students || [];
  students = students.filter(s => !q || s.name.toLowerCase().includes(q) || String(s.student_id || '').toLowerCase().includes(q));
  students = students.filter(s => {
    const stats = studentStats(s);
    if (filter === 'done') return stats.total > 0 && stats.done === stats.total;
    if (filter === 'pending') return !(stats.total > 0 && stats.done === stats.total);
    return true;
  });
  document.getElementById('student-visible-count').textContent = students.length + ' 人';
  grid.innerHTML = students.map((s, i) => {
    const stats = studentStats(s);
    const cls = stats.pct >= 100 ? 'green' : stats.pct > 0 ? 'orange' : 'red';
    const groups = subjectGroupsForStudent(s).slice(0, 4).map(([name, g]) => {
      const pct = g.total ? Math.round(g.done / g.total * 100) : 100;
      return `<div class="mini-row"><span>${escapeHtml(name)}</span><div class="progress"><div class="bar" style="width:${pct}%"></div></div><strong>${g.done}/${g.total}</strong></div>`;
    }).join('');
    return `<div class="card student-card" style="animation-delay:${i * 0.025}s">
      <div class="student-top">
        <div><div class="avatar">${escapeHtml((s.name || '?').slice(0, 1))}</div><div class="student-name">${escapeHtml(s.name)}</div><div class="student-meta">${escapeHtml(s.student_id || '未填写学号')}</div></div>
        <div class="ring" style="--pct:${stats.pct}%"><span>${stats.pct}%</span></div>
      </div>
      <div class="mini-subjects">${groups || '<div class="row-sub">暂无作业项</div>'}</div>
      <div class="card-foot"><span class="tag ${cls}">${stats.pct >= 100 ? '已完成' : '待跟进'}</span> ${stats.done}/${stats.total} 项完成${stats.pending[0] ? ' · 缺 ' + escapeHtml(stats.pending[0].subject_group || stats.pending[0].name || '') : ''}</div>
      <div class="file-actions"><button class="danger" onclick="deleteStudent(${jsString(s.name)})">删除学生</button></div>
    </div>`;
  }).join('') || '<div class="empty">没有符合条件的学生</div>';
}
function renderFiles() {
  const pending = state.dashboard?.pending_archive_files || [];
  window._pendingArchiveFiles = pending;
  const pendingCard = document.getElementById('pending-archive-card');
  const pendingList = document.getElementById('pending-archive-list');
  const pendingCount = document.getElementById('pending-archive-count');
  if (pendingCard && pendingList && pendingCount) {
    pendingCard.hidden = pending.length === 0;
    pendingCount.textContent = pending.length + ' 个';
    const subjects = [...new Set((state.assignments || []).map(a => a.subject_group).filter(Boolean))];
    pendingList.innerHTML = pending.map((f, i) => {
      const c = f.classification || {};
      const candidates = c.candidates || [];
      const subjectOptions = subjects.map(s => `<option value="${escapeHtml(s)}" ${s === c.subject_group ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');
      const assignmentOptions = (state.assignments || []).filter(a => a.subject_group === c.subject_group).map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(assignmentDisplayTitle(a))}</option>`).join('');
      return `<div class="card material-card">
        <div><span class="tag orange">待归档</span><h3>${escapeHtml(f.file_name || '-')}</h3>
          <p>${escapeHtml(f.student || '未识别学生')} · ${formatSize(f.size || 0)}</p>
          <p class="row-sub">科目：${escapeHtml(c.subject_group || '未识别')} · 作业：待确认</p>
          <p class="row-sub">${escapeHtml((c.evidence || []).join('；') || f.context_hint || '等待人工确认')}</p>
          ${candidates.length ? `<p class="row-sub">候选：${candidates.map(x => `${escapeHtml(x.name || x.experiment || '-') } ${x.score}分`).join(' / ')}</p>` : ''}
          <div class="auto-detect-card is-empty" id="pending-analysis-${i}">
            <div class="detect-head"><span>智能识别结果</span><span class="pill">尚未分析</span></div>
            <div class="row-sub">点击“智能识别”后，建议科目和作业会显示在这里。</div>
          </div>
        </div>
        <div class="file-actions">
          <button onclick="previewPendingArchive(${i})">预览</button><button onclick="analyzePendingArchive(${i})">智能识别</button><button class="danger" onclick="ignorePendingArchive(${i})">忽略</button>
          <select id="pending-subject-${i}">${subjectOptions}</select><button onclick="setPendingSubject(${i})">修改科目</button>
          <select id="pending-assignment-${i}"><option value="">选择具体作业</option>${assignmentOptions}</select><button class="primary" onclick="confirmPendingAssignment(${i})">确认归档</button>
        </div>
      </div>`;
    }).join('');
  }
  const unmatched = state.dashboard?.unmatched_files || [];
  const students = state.dashboard?.students || [];
  window._unmatchedPaths = unmatched.map(f => f.file_path || '');
  document.getElementById('unmatched-count').textContent = unmatched.length + ' 个';
  const batchToolbar = document.getElementById('unmatched-batch-toolbar');
  const selectAll = document.getElementById('unmatched-select-all');
  if (batchToolbar) batchToolbar.hidden = unmatched.length === 0;
  if (selectAll) selectAll.checked = false;
  document.getElementById('unmatched-list').innerHTML = unmatched.slice(0, 20).map((f, i) => `<div class="card material-card" style="animation-delay:${i * 0.035}s">
    <div>
      <label class="check-line"><input type="checkbox" class="unmatched-check" value="${i}" onchange="syncUnmatchedSelectAll()"> <span class="tag red">Unmatched</span></label>
      <h3>${escapeHtml(f.file_name || '-')}</h3>
      ${renderAutoDetect(f)}
      <p>${escapeHtml(f.context_hint || '待人工判断')} · ${formatTime(f.detected_at)} · ${formatSize(f.size)}</p>
    </div>
    <div>
      <div class="assign-line">
        <select id="assign-${i}"><option value="">选择学生</option>${students.map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`).join('')}</select>
        <button class="primary" onclick="assignUnmatched(${i})">分配</button>
        <button class="danger" onclick="ignoreUnmatched(${i})">忽略</button>
      </div>
      <div class="file-actions"><button onclick="previewFileByPath(${i},'unmatched')">预览</button><button onclick="openFileByPath(${i},'unmatched')">打开</button><button onclick="openFolderByPath(${i},'unmatched')">文件夹</button></div>
    </div>
  </div>`).join('') || '<div class="empty">暂无未归类文件</div>';

  const recent = (state.dashboard?.recent_files || []).slice(-20).reverse();
  window._recentPaths = recent.map(r => r.file?.path || '');
  document.getElementById('recent-table').innerHTML = recent.map((r, i) => `<tr>
    <td>${escapeHtml(r.file?.name || r.file_name || '-')}</td>
    <td>${escapeHtml(r.student || '未匹配')}</td>
    <td>${formatTime(r.detected_at)}</td>
    <td><button onclick="previewFileByPath(${i},'recent')">预览</button> <button onclick="openFileByPath(${i},'recent')">打开</button> <button onclick="openFolderByPath(${i},'recent')">文件夹</button></td>
  </tr>`).join('') || '<tr><td colspan="4">暂无文件</td></tr>';
}
function detectContentTypeFromName(fileName) {
  const text = String(fileName || '');
  const rules = [
    ['课程报告', ['课程报告', '课程设计报告']],
    ['实验报告', ['实验报告', '实验', '实训']],
    ['大作业', ['大作业', '大作', '综合作业']],
    ['课程论文', ['课程论文', '论文']],
    ['习题', ['习题', '练习']],
    ['报告', ['报告']],
    ['作业', ['作业']]
  ];
  for (const [label, keys] of rules) {
    if (keys.some(key => text.includes(key))) return label;
  }
  return '';
}
function detectStudentFromName(fileName) {
  const text = String(fileName || '').toLowerCase();
  for (const s of state.dashboard?.students || []) {
    const candidates = [s.name, s.student_id, s.id, s.pinyin, s.alias].filter(Boolean);
    if (candidates.some(v => {
      const token = String(v).trim().toLowerCase();
      return token && text.includes(token);
    })) return s;
  }
  return null;
}
function detectAssignmentFromName(fileName) {
  const text = String(fileName || '').toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const a of state.assignments || []) {
    const tokens = [
      a.subject_group,
      a.subject,
      a.name,
      a.experiment,
      ...(Array.isArray(a.keywords) ? a.keywords : [])
    ].filter(Boolean);
    let score = 0;
    for (const raw of tokens) {
      const token = String(raw).trim().toLowerCase();
      if (!token || !text.includes(token)) continue;
      score += token.length >= 4 ? 3 : 2;
    }
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best ? { assignment: best, score: bestScore } : null;
}
function autoDetectUnmatched(file) {
  const fileName = file?.file_name || fileNameFromPath(file?.file_path || '');
  const student = detectStudentFromName(fileName);
  const assignmentHit = detectAssignmentFromName(fileName);
  const assignment = assignmentHit?.assignment || null;
  const contentType = detectContentTypeFromName(fileName);
  if (!student && !assignment && !contentType) return null;
  const signalCount = [student, assignment, contentType].filter(Boolean).length;
  const confidence = student && assignment ? 'high' : signalCount >= 2 ? 'medium' : 'low';
  return {
    student,
    assignment,
    subject: assignment?.subject_group || assignment?.subject || '',
    experiment: assignment?.experiment || assignment?.name || '',
    contentType,
    confidence,
    reason: confidence === 'high'
      ? '文件名同时命中学生与作业信息，可优先人工确认。'
      : confidence === 'medium'
        ? '文件名命中了部分关键信息，建议打开预览后确认。'
        : '只识别到弱信号，需要手动分配或忽略。'
  };
}
function renderDetectChip(label, value) {
  if (!value) return '';
  return `<span class="detect-chip"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></span>`;
}
function renderAutoDetect(file) {
  const result = autoDetectUnmatched(file);
  if (!result) {
    return `<div class="auto-detect-card is-empty">
      <div class="detect-head"><span>自动识别结果</span><span class="pill">待判断</span></div>
      <div class="row-sub">未识别出姓名、科目或作业信息，请手动分配。</div>
    </div>`;
  }
  const confText = result.confidence === 'high' ? '高' : result.confidence === 'medium' ? '中' : '低';
  const confClass = result.confidence === 'high' ? 'good' : result.confidence === 'medium' ? 'warn' : 'bad';
  const chips = [
    renderDetectChip('学生', result.student?.name || ''),
    renderDetectChip('科目', result.subject || ''),
    renderDetectChip('作业', result.experiment || ''),
    renderDetectChip('类型', result.contentType || '')
  ].join('');
  return `<div class="auto-detect-card confidence-${result.confidence}">
    <div class="detect-head"><span>自动识别结果</span><span class="pill ${confClass}">置信度 ${confText}</span></div>
    <div class="detect-chips">${chips || '<span class="row-sub">暂无可展示词条</span>'}</div>
    <div class="row-sub" style="margin-top:8px">${escapeHtml(result.reason)}</div>
  </div>`;
}
async function renderScanDirs() {
  const dirs = state.scanDirs || [];
  document.getElementById('scan-dir-list').innerHTML = dirs.map(d => {
    const isWechat = d.source === 'wechat-auto';
    const sourceText = isWechat ? '微信自动' : '手动';
    const action = isWechat ? '' : `<button class="danger" onclick="removeScanDir(${jsString(d.path)})">移除</button>`;
    return `<div class="row scan-dir-row">
    <div><div class="row-title">${escapeHtml(d.path)}</div><div class="row-sub">${d.exists ? '目录存在' : '目录不存在'} · ${sourceText}</div></div>
    <span class="scan-dir-actions"><span class="source-chip">${sourceText}</span><span class="pill ${d.exists ? 'good' : 'bad'}">${d.exists ? '可用' : '异常'}</span>${action}</span>
  </div>`;
  }).join('') || '<div class="empty">暂无扫描目录</div>';
}
async function addScanDir() {
  const input = document.getElementById('scan-dir-input');
  const path = input.value.trim();
  if (!path) return;
  const resp = await apiPost('/api/scan-dirs/add', { path });
  if (!resp.ok) return toast(resp.msg || '添加失败');
  input.value = '';
  state.scanDirs = resp.scan_dirs || await apiGet('/api/scan-dirs');
  renderScanDirs();
  toast('扫描目录已添加');
}
async function removeScanDir(path) {
  if (!path) return;
  if (!confirm('确定移除扫描目录？\n' + path)) return;
  const resp = await apiPost('/api/scan-dirs/remove', { path });
  if (!resp.ok) return toast(resp.msg || '移除失败');
  state.scanDirs = resp.scan_dirs || await apiGet('/api/scan-dirs');
  renderScanDirs();
  toast('扫描目录已移除');
}
function pathFromBucket(index, bucket) {
  return bucket === 'recent' ? window._recentPaths[index] : window._unmatchedPaths[index];
}
function syncUnmatchedSelectAll() {
  const boxes = [...document.querySelectorAll('.unmatched-check')];
  const selectAll = document.getElementById('unmatched-select-all');
  if (selectAll) selectAll.checked = boxes.length > 0 && boxes.every(box => box.checked);
}
function toggleAllUnmatched(checked) {
  document.querySelectorAll('.unmatched-check').forEach(box => { box.checked = !!checked; });
}
async function openFileByPath(index, bucket) {
  const path = pathFromBucket(index, bucket);
  if (!path) return;
  await apiGet('/api/open-file?path=' + encodeURIComponent(path));
}
async function openFolderByPath(index, bucket) {
  const path = pathFromBucket(index, bucket);
  if (!path) return;
  await apiGet('/api/open-folder?path=' + encodeURIComponent(path));
}
function fileNameFromPath(path) {
  return String(path || '').split(/[\\/]/).pop() || path || '文件';
}
function previewLoadingHtml(title, fileName, hint) {
  return `<div class="preview-loading-word">
    <div class="preview-loading-core">
      <div class="preview-spinner" aria-hidden="true"></div>
      <div class="plw-title">${escapeHtml(title)}</div>
      <div class="plw-file">${escapeHtml(fileName)}</div>
      <div class="preview-progress"><span></span></div>
      <div class="plw-hint">${escapeHtml(hint || '正在准备文件内容，请稍候。')}</div>
    </div>
  </div>`;
}
function revealPreviewFrame(body, frame) {
  body.querySelector('.preview-loading-word')?.remove();
  frame.classList.remove('is-loading');
  frame.style.height = '100%';
  frame.style.minHeight = '520px';
}
function showPreviewFrame(body, src, titleText, loadingTitle, hint) {
  body.style.whiteSpace = 'normal';
  body.innerHTML = previewLoadingHtml(loadingTitle, titleText, hint);
  const frame = document.createElement('iframe');
  frame.className = 'preview-frame is-loading';
  frame.src = src;
  frame.title = titleText;
  frame.onload = () => revealPreviewFrame(body, frame);
  frame.onerror = () => {
    body.innerHTML = '<div class="preview-error">预览加载失败，请尝试直接打开文件。</div>';
  };
  body.appendChild(frame);
}
function showPreviewImage(body, src, fileName) {
  body.style.whiteSpace = 'normal';
  body.innerHTML = previewLoadingHtml('正在加载图片预览...', fileName, '图片较大时可能需要几秒。');
  const wrap = document.createElement('div');
  wrap.style.cssText = 'height:100%;display:grid;place-items:center';
  const img = document.createElement('img');
  img.alt = fileName;
  img.src = src;
  img.onload = () => {
    body.innerHTML = '';
    wrap.appendChild(img);
    body.appendChild(wrap);
  };
  img.onerror = () => {
    body.innerHTML = '<div class="preview-error">图片加载失败，请尝试直接打开文件。</div>';
  };
}
async function previewFileByPath(index, bucket) {
  const path = pathFromBucket(index, bucket);
  await previewFile(path);
}
async function loadDocPreview(path, body, fileName) {
  const url = '/api/preview-doc?path=' + encodeURIComponent(path);
  body.innerHTML = previewLoadingHtml('正在准备文档预览...', fileName, '首次预览会在后台生成，页面不会被卡住');
  try {
    const resp = await fetch(url);
    if (resp.status === 200) {
      showPreviewFrame(body, url, fileName, '正在加载文档预览...', '浏览器正在渲染 PDF 页面。');
      return;
    }
    const queued = await resp.json();
    if (!queued.job_id) throw new Error(queued.msg || '预览任务创建失败');
    for (let i = 0; i < 120; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const statusResp = await fetch('/api/preview-status?job_id=' + encodeURIComponent(queued.job_id));
      const status = await statusResp.json();
      if (status.status === 'ready') {
        showPreviewFrame(body, url, fileName, '正在加载文档预览...', '浏览器正在渲染 PDF 页面。');
        return;
      }
      if (status.status === 'error') throw new Error(status.error || '文档转换失败');
    }
    throw new Error('预览转换超时，请尝试直接打开文件');
  } catch (e) {
    body.innerHTML = `<div class="preview-error">预览失败：${escapeHtml(e.message || e)}</div>`;
  }
}
async function previewFile(path) {
  if (!path) return toast('文件路径不存在');
  window._previewFilePath = path;
  const panel = document.getElementById('preview-panel');
  const title = document.getElementById('preview-title');
  const body = document.getElementById('preview-body');
  if (!panel || !title || !body) return;
  const fileName = fileNameFromPath(path);
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  title.textContent = fileName;
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  body.style.whiteSpace = 'pre-wrap';
  body.innerHTML = previewLoadingHtml('正在加载预览...', fileName, '正在读取文件信息。');
  if (ext === 'pdf') {
    showPreviewFrame(body, '/api/serve-file?path=' + encodeURIComponent(path), fileName, '正在加载 PDF...', '浏览器正在渲染 PDF 页面。');
    return;
  }
  if (ext === 'docx' || ext === 'doc') {
    await loadDocPreview(path, body, fileName);
    return;
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) {
    showPreviewImage(body, '/api/serve-file?path=' + encodeURIComponent(path), fileName);
    return;
  }
  try {
    const resp = await fetch('/api/preview?path=' + encodeURIComponent(path));
    const data = await resp.json();
    if (data.ok && data.text) {
      body.textContent = data.text;
    } else if (data.ok) {
      body.innerHTML = '<div class="preview-empty">文件内容为空或无法提取文本</div>';
    } else {
      body.innerHTML = `<div class="preview-error">${escapeHtml(data.msg || '预览失败')}</div>`;
    }
  } catch (e) {
    body.innerHTML = `<div class="preview-error">请求失败：${escapeHtml(e.message || e)}</div>`;
  }
}
function closePreview() {
  const panel = document.getElementById('preview-panel');
  if (panel) {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
  }
  window._previewFilePath = '';
}
async function openPreviewFile() {
  if (!window._previewFilePath) return toast('请先选择一个预览文件');
  await apiGet('/api/open-file?path=' + encodeURIComponent(window._previewFilePath));
}
async function openPreviewFolder() {
  if (!window._previewFilePath) return toast('请先选择一个预览文件');
  await apiGet('/api/open-folder?path=' + encodeURIComponent(window._previewFilePath));
}
async function openDetailFile(index) {
  const path = window._assignmentDetailFiles?.[index];
  if (!path) return toast('文件路径不存在');
  await apiGet('/api/open-file?path=' + encodeURIComponent(path));
}
async function openDetailFolder(index) {
  const path = window._assignmentDetailFiles?.[index];
  if (!path) return toast('文件路径不存在');
  await apiGet('/api/open-folder?path=' + encodeURIComponent(path));
}
async function rejectDetailFile(index) {
  const path = window._assignmentDetailFiles?.[index];
  const assignmentId = window._activeAssignmentDetailId;
  if (!path || !assignmentId) return toast('缺少作业或文件信息');
  const fileName = fileNameFromPath(path);
  const assignmentTitle = assignmentDisplayTitle(window._activeAssignmentDetail || {});
  const rejectedTerms = await askRejectTerms(fileName, assignmentTitle);
  if (rejectedTerms === null) return;
  const resp = await apiPost('/api/submissions/reject-assignment', {
    assignment_id: assignmentId,
    file_path: path,
    rejected_terms: rejectedTerms
  });
  if (!resp.ok) return toast(resp.msg || '移出失败');
  toast(rejectedTerms.length ? '已移出并记录负反馈词条' : '已移出本作业，并加入未归类队列');
  await loadAll();
  await showAssignmentDetail(assignmentId);
}
async function deleteDetailFile(index) {
  const record = window._assignmentDetailFileRecords?.[index] || {};
  const path = record.path || window._assignmentDetailFiles?.[index];
  const assignmentId = window._activeAssignmentDetailId;
  if (!path || !assignmentId) return toast('缺少作业或文件信息');
  const fileName = record.name || fileNameFromPath(path);
  const student = record.student || '该学生';
  const action = await askSubmissionDeleteAction(fileName, student);
  if (!action) return;
  if (action === 'reject') {
    await rejectDetailFile(index);
    return;
  }
  const resp = await apiPost('/api/submissions/delete', {
    assignment_id: assignmentId,
    file_path: path,
    student: record.student || '',
    detected_at: record.detected_at || '',
    reason: '重复扫描'
  });
  if (!resp.ok) return toast(resp.msg || '删除失败');
  toast('已按“重复扫描”删除这条提交记录');
  await loadAll();
  await showAssignmentDetail(assignmentId);
}
function askSubmissionDeleteAction(fileName, student) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'feedback-overlay';
    overlay.innerHTML = `<div class="feedback-modal" role="dialog" aria-modal="true">
      <div class="section-head"><h3>处理提交记录</h3><button class="ghost" data-action="cancel">取消</button></div>
      <p class="row-sub">学生：${escapeHtml(student || '该学生')}</p>
      <p class="row-sub">文件：${escapeHtml(fileName || '未命名文件')}</p>
      <p>请选择处理原因。这里都只处理系统记录，不会删除电脑上的实际文件。</p>
      <div class="file-actions" style="margin-top:14px">
        <button class="danger" data-action="duplicate">重复扫描</button>
        <button class="danger" data-action="reject">非本作业</button>
      </div>
    </div>`;
    const finish = value => {
      overlay.remove();
      resolve(value);
    };
    overlay.addEventListener('click', e => {
      if (e.target === overlay || e.target.dataset.action === 'cancel') finish(null);
      if (e.target.dataset.action === 'duplicate') finish('duplicate');
      if (e.target.dataset.action === 'reject') finish('reject');
    });
    document.body.appendChild(overlay);
  });
}
function rejectTermCandidates(fileName, assignment) {
  const seen = new Set();
  const out = [];
  const stem = fileNameFromPath(fileName).replace(/\.[^.]+$/, '');
  const add = value => {
    const text = String(value || '').trim();
    const className = String(state.config?.class_name || state.dashboard?.class_name || '').trim();
    if (className && text.startsWith(className)) return;
    if (!text || text.length < 2 || seen.has(text)) return;
    seen.add(text);
    out.push(text);
  };
  const knownTerms = [
    '课程作业', '课程报告', '项目作业', '小组作业', '课程论文', '阶段作业', '期末作业',
    '实验报告', '实训报告', '实践报告', '课程设计', '设计报告',
    '信号与系统', '计算机软件编程设计', '数字电子技术', '自动控制原理',
    '程序设计', '数电', '单片机', '自控', '电机', '电气导论', '劳动教育',
    '课程设计', '课程报告', '实验报告', '编程设计', '大作业', '课设', '报告', '实验'
  ];
  knownTerms.forEach(term => {
    if (stem.includes(term)) add(term);
  });
  (stem.match(/实验\s*[一二三四五六七八九十\d]+/g) || []).forEach(add);
  (stem.match(/第\s*[一二三四五六七八九十\d]+\s*次/g) || []).forEach(add);
  (stem.match(/[一二三四五六七八九十\d]+\s*次实验/g) || []).forEach(add);
  (state.dashboard?.students || []).forEach(s => {
    if (s.name && stem.includes(s.name)) add(s.name);
    if (s.student_id && stem.includes(String(s.student_id))) add(String(s.student_id));
  });
  const rejectedHistory = state.config?.match_feedback?.rejected || [];
  rejectedHistory.slice(-120).forEach(item => {
    (item.rejected_terms || []).forEach(term => {
      if (term && stem.includes(term)) add(term);
    });
  });
  (assignment?.negative_keywords || []).forEach(term => {
    if (term && stem.includes(term)) add(term);
  });
  stem.split(/[\s_\-—–.,，、;；()（）[\]【】]+/).forEach(add);
  (stem.match(/[\u4e00-\u9fff]{2,}/g) || []).forEach(add);
  (assignment?.keywords || []).forEach(add);
  [assignment?.subject_group, assignment?.subject, assignment?.experiment, assignment?.name].forEach(add);
  return out.slice(0, 16);
}
function askRejectTerms(fileName, assignmentTitle) {
  return new Promise(resolve => {
    const assignment = window._activeAssignmentDetail || {};
    const terms = rejectTermCandidates(fileName, assignment);
    const overlay = document.createElement('div');
    overlay.className = 'feedback-overlay';
    overlay.innerHTML = `<div class="feedback-modal" role="dialog" aria-modal="true">
      <div class="section-head"><h3>标记为非本作业</h3><button class="ghost" data-action="cancel">取消</button></div>
      <p class="row-sub">文件：${escapeHtml(fileName)}</p>
      <p class="row-sub">当前作业：${escapeHtml(assignmentTitle || '当前作业')}</p>
      <p>可选：勾选哪些词条不应该让它归到这个作业。跳过也会把文件移回未归类队列。</p>
      <div class="feedback-options">
        ${terms.map((term, i) => `<label class="feedback-option"><input type="checkbox" value="${escapeHtml(term)}" ${i === 0 ? '' : ''}>${escapeHtml(term)}</label>`).join('') || '<span class="empty">没有可推荐词条</span>'}
      </div>
      <input id="reject-custom-term" placeholder="也可以手动输入词条，多个用逗号分隔">
      <div class="file-actions" style="margin-top:14px">
        <button class="danger" data-action="confirm">移出并记录反馈</button>
        <button data-action="skip">只移出，跳过反馈</button>
      </div>
    </div>`;
    const finish = value => {
      overlay.remove();
      resolve(value);
    };
    overlay.addEventListener('click', e => {
      if (e.target === overlay || e.target.dataset.action === 'cancel') finish(null);
      if (e.target.dataset.action === 'skip') finish([]);
      if (e.target.dataset.action === 'confirm') {
        const checked = [...overlay.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
        const custom = parseKeywordInput(overlay.querySelector('#reject-custom-term')?.value || '');
        finish(parseKeywordInput([...checked, ...custom].join('，')));
      }
    });
    document.body.appendChild(overlay);
    overlay.querySelector('#reject-custom-term')?.focus();
  });
}
async function assignUnmatched(index) {
  const path = window._unmatchedPaths[index];
  const student = document.getElementById('assign-' + index)?.value;
  if (!path || !student) return toast('请选择学生');
  await apiPost('/api/submissions/assign', { file_path: path, student });
  toast('已分配给 ' + student);
  await loadAll();
}
function pendingArchiveFile(index) {
  return (window._pendingArchiveFiles || [])[index] || null;
}
async function previewPendingArchive(index) {
  const file = pendingArchiveFile(index);
  if (file?.file_path) await previewFile(file.file_path);
}
async function analyzePendingArchive(index) {
  const file = pendingArchiveFile(index);
  if (!file?.file_path) return;
  const box = document.getElementById(`pending-analysis-${index}`);
  if (box) box.innerHTML = '<div class="detect-head"><span>规则大脑结果</span><span class="pill warn">分析中</span></div><div class="row-sub">正在分析文件名、课程别名和关键词...</div>';
  try {
    const resp = await apiPost('/api/assignment/classify', { file_path: file.file_path });
    const best = resp.result || {};
    if (!box) return;
    if (!best.subject_group && !(best.subject_candidates || []).length) {
      box.className = 'auto-detect-card is-empty';
      box.innerHTML = '<div class="detect-head"><span>规则大脑结果</span><span class="pill bad">未知科目</span></div><div class="row-sub">未找到可靠课程规则，请在分类大脑中初始化新科目。</div>';
      return;
    }
    const score = Number(best.confidence || 0);
    const confidence = score >= .85 ? 'high' : score >= .70 ? 'medium' : 'low';
    const confidenceText = `${Math.round(score * 100)}%`;
    const assignment = (best.assignment_candidates || [])[0] || {};
    const chips = [renderDetectChip('科目', best.subject_group || ''), renderDetectChip('作业', assignment.name || assignment.experiment || ''), renderDetectChip('来源', best.source || 'rules')].join('');
    const alternatives = (best.subject_candidates || []).slice(1, 3).map(item => `${item.subject_group} ${Math.round(Number(item.confidence || 0) * 100)}%`);
    box.className = `auto-detect-card confidence-${confidence}`;
    box.innerHTML = `<div class="detect-head"><span>规则大脑结果</span><span class="pill ${confidence === 'high' ? 'good' : confidence === 'medium' ? 'warn' : 'bad'}">置信度 ${confidenceText}</span></div><div class="detect-chips">${chips}</div><div class="row-sub" style="margin-top:8px">${escapeHtml((best.evidence || []).join('；'))}</div>${alternatives.length ? `<div class="row-sub" style="margin-top:8px">其他候选：${escapeHtml(alternatives.join('；'))}</div>` : ''}`;
  } catch (e) {
    if (box) box.innerHTML = `<div class="detect-head"><span>智能识别结果</span><span class="pill bad">失败</span></div><div class="row-sub">${escapeHtml(e.message || e)}</div>`;
  }
}
async function setPendingSubject(index) {
  const file = pendingArchiveFile(index);
  const select = document.getElementById(`pending-subject-${index}`);
  if (!file?.file_path || !select?.value) return;
  await apiPost('/api/submissions/set-subject', { file_path: file.file_path, subject_group: select.value });
  toast('科目已更新，已重新计算作业候选。');
  await refreshAll();
}
async function confirmPendingAssignment(index) {
  const file = pendingArchiveFile(index);
  const select = document.getElementById(`pending-assignment-${index}`);
  if (!file?.file_path || !select?.value) return toast('请先选择具体作业');
  try {
    const resp = await apiPost('/api/submissions/assign-assignment', { file_path: file.file_path, assignment_id: select.value });
    toast(resp.organized_to ? '已归档并同步到公示文件夹。' : '归档完成。');
    await refreshAll();
  } catch (e) { toast('无法归档：' + (e.message || e)); }
}
async function ignorePendingArchive(index) {
  const file = pendingArchiveFile(index);
  if (!file?.file_path) return;
  if (!confirm(`确定忽略“${file.file_name || '此文件'}”？它将不再出现在待处理队列中。`)) return;
  await apiPost('/api/unmatched/ignore', { file_path: file.file_path });
  toast('已忽略文件');
  await refreshAll();
}
async function ignoreUnmatched(index) {
  const path = window._unmatchedPaths[index];
  if (!path) return;
  await apiPost('/api/unmatched/ignore', { file_path: path });
  toast('已忽略文件');
  await loadAll();
}
async function batchIgnoreUnmatched() {
  const checked = [...document.querySelectorAll('.unmatched-check:checked')].map(box => Number(box.value)).filter(Number.isInteger);
  if (!checked.length) return toast('请先勾选要忽略的文件');
  if (!confirm(`确定批量忽略 ${checked.length} 个文件？`)) return;
  let ignored = 0;
  for (const index of checked) {
    const path = window._unmatchedPaths[index];
    if (!path) continue;
    await apiPost('/api/unmatched/ignore', { file_path: path });
    ignored++;
  }
  toast(`已忽略 ${ignored} 个文件`);
  await loadAll();
}
async function scanNow() {
  const resp = await apiGet('/api/scan-now');
  toast(resp.scanned ? `扫描到 ${resp.scanned} 个新文件` : '没有发现新文件');
  await loadAll();
}
async function rescanExisting() {
  const resp = await apiGet('/api/scan-existing');
  toast(`扫描 ${resp.scanned || 0} 个文件，匹配 ${resp.matched || 0} 条`);
  await loadAll();
}

async function addStudent() {
  const name = document.getElementById('add-student-name').value.trim();
  const student_id = document.getElementById('add-student-id').value.trim();
  const pinyin = document.getElementById('add-student-pinyin').value.trim();
  if (!name) return toast('请输入学生姓名');
  const payload = { name };
  if (student_id) payload.student_id = student_id;
  if (pinyin) payload.pinyin = pinyin;
  await apiPost('/api/students/add', payload);
  document.getElementById('add-student-name').value = '';
  document.getElementById('add-student-id').value = '';
  document.getElementById('add-student-pinyin').value = '';
  toast('学生已添加');
  await loadAll();
}
async function deleteStudent(name) {
  if (!name) return;
  if (!confirm('确定删除学生「' + name + '」？')) return;
  await apiPost('/api/students/delete', { name });
  toast('学生已删除');
  await loadAll();
}
async function bulkImportStudents() {
  const text = document.getElementById('bulk-students').value.trim();
  if (!text) return toast('请先输入学生名单');
  const incoming = text.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const parts = line.split(/[,，\t]+/).map(x => x.trim());
    const item = { name: parts[0] || '' };
    if (parts[1]) item.student_id = parts[1];
    if (parts[2]) item.pinyin = parts[2];
    return item;
  }).filter(s => s.name);
  const existing = await apiGet('/api/students');
  const names = new Set(existing.map(s => s.name));
  let added = 0;
  for (const s of incoming) {
    if (!names.has(s.name)) {
      existing.push(s);
      names.add(s.name);
      added++;
    }
  }
  await apiPost('/api/students/save', existing);
  document.getElementById('bulk-students').value = '';
  toast(`导入完成：新增 ${added} 人，跳过 ${incoming.length - added} 人`);
  await loadAll();
}

async function addAssignment() {
  const name = document.getElementById('new-assignment-name').value.trim();
  const subject = selectedAssignmentSubject();
  const experiment = document.getElementById('new-assignment-exp').value.trim();
  const extraKeywords = parseKeywordInput(document.getElementById('new-assignment-keywords')?.value || '');
  if (!name || !subject) return toast('请填写作业名称和科目');
  const resp = await apiPost('/api/assignment/add', {
    name,
    subject_group: subject,
    subject,
    experiment,
    keywords: parseKeywordInput([subject, experiment, ...extraKeywords].filter(Boolean).join('，')),
    active: true
  });
  document.getElementById('new-assignment-name').value = '';
  document.getElementById('new-assignment-subject').value = '';
  document.getElementById('new-assignment-subject-custom').value = '';
  document.getElementById('new-assignment-subject-custom').hidden = true;
  document.getElementById('new-assignment-exp').value = '';
  const keywordInput = document.getElementById('new-assignment-keywords');
  if (keywordInput) keywordInput.value = '';
  toast('作业已添加');
  if (Array.isArray(resp.assignments)) {
    state.assignments = resp.assignments;
    renderAssignments();
    renderAssignmentKeywords();
    renderDueSettings();
  }
  await loadAll();
}
async function deleteAssignmentByIndex(index) {
  const item = window._assignmentActions?.[index];
  if (!item) return toast('未找到作业项，请刷新后再试');
  await deleteAssignment(item);
}
async function deleteAssignment(payload) {
  const item = typeof payload === 'object' ? payload : { id: payload };
  if (!item.id && !item.name && !item.experiment) return toast('缺少作业信息');
  if (!confirm('确定删除这个作业项？')) return;
  const resp = await apiPost('/api/assignment/delete', item);
  if (!resp.ok) return toast(resp.msg || '删除失败');
  toast(`作业已删除${resp.deleted ? '：' + resp.deleted + ' 项' : ''}`);
  await loadAll();
}
async function toggleAssignmentCompletedByIndex(index, completed) {
  const item = window._assignmentActions?.[index];
  if (!item?.id) return toast('未找到作业项，请刷新后再试');
  await toggleAssignmentCompleted(item.id, completed);
}
async function toggleAssignmentCompleted(id, completed) {
  const cfg = await apiGet('/api/config');
  const target = (cfg.assignments || []).find(a => a.id === id);
  if (!target) return toast('未找到作业项');
  target.completed = !!completed;
  target.completed_at = completed ? new Date().toISOString() : '';
  await apiPost('/api/config/save', cfg);
  toast(completed ? '已标记完成' : '已取消完成');
  await loadAll();
}
async function packSubjectByIndex(index) {
  const subject = window._subjectActions?.[index];
  if (!subject) return toast('缺少科目名称');
  await packSubject(subject);
}
async function toggleSubjectCompletedByIndex(index, completed) {
  const subject = window._subjectActions?.[index];
  if (!subject) return toast('缺少科目名称');
  const cfg = await apiGet('/api/config');
  const targets = (cfg.assignments || []).filter(a => (a.subject_group || a.subject || '其他') === subject);
  if (!targets.length) return toast('未找到科目作业');
  for (const item of targets) {
    item.completed = !!completed;
    item.completed_at = completed ? new Date().toISOString() : '';
  }
  await apiPost('/api/config/save', cfg);
  toast(completed ? '整个科目已标记完成' : '已取消整个科目完成');
  if (completed) sessionStorage.setItem('assignment-os-subject-complete-effect', subject);
  else sessionStorage.removeItem('assignment-os-subject-complete-effect');
  await loadAll();
}
async function deleteSubjectByIndex(index) {
  const subject = window._subjectActions?.[index];
  if (!subject) return toast('缺少科目名称');
  if (!confirm(`确定删除科目「${subject}」下的全部作业项？\n文件不会被删除。`)) return;
  const resp = await apiPost('/api/subject/delete', { subject });
  toast(`科目已删除${resp.deleted ? '：' + resp.deleted + ' 项' : ''}`);
  await loadAll();
}
async function packSubject(subjectGroup) {
  if (!subjectGroup) return toast('缺少科目名称');
  const resp = await fetch('/api/pack-subject?subject_group=' + encodeURIComponent(subjectGroup));
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    return toast(data.msg || '打包失败');
  }
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = subjectGroup + '_作业.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('打包下载已开始');
}

function renderKeywords() {
  const el = document.getElementById('keyword-list');
  if (!el) return;
  const keywords = state.config?.file_keywords || [];
  el.innerHTML = keywords.map(k => `<span class="chip">${escapeHtml(k)} <button onclick="deleteKeyword(${jsString(k)})">×</button></span>`).join('') || '<div class="empty">暂无关键词</div>';
}
async function addKeyword() {
  const input = document.getElementById('keyword-input');
  const kw = input.value.trim();
  if (!kw) return;
  const cfg = await apiGet('/api/config');
  cfg.file_keywords = cfg.file_keywords || [];
  if (!cfg.file_keywords.includes(kw)) cfg.file_keywords.push(kw);
  await apiPost('/api/config/save', cfg);
  input.value = '';
  toast('关键词已保存');
  await loadAll();
}
async function deleteKeyword(kw) {
  const cfg = await apiGet('/api/config');
  cfg.file_keywords = (cfg.file_keywords || []).filter(x => x !== kw);
  await apiPost('/api/config/save', cfg);
  toast('关键词已删除');
  await loadAll();
}

function renderAssignmentKeywords() {
  const el = document.getElementById('assignment-keyword-list');
  if (!el) return;
  const list = (state.config?.assignments || state.assignments || []).filter(a => a && a.id);
  window._assignmentKeywordIds = list.map(a => a.id);
  el.innerHTML = list.map((a, i) => {
    const title = assignmentDisplayTitle(a);
    const keywords = (a.keywords || []).join('，');
    return `<div class="assignment-keyword-item">
      <div><strong>${escapeHtml(title)}</strong><div class="row-sub">${escapeHtml(a.name || '')}</div></div>
      <input id="assignment-keywords-${i}" value="${escapeHtml(keywords)}" placeholder="例如：第一次，课程报告，项目作业，实验报告">
    </div>`;
  }).join('') || '<div class="empty">暂无作业项</div>';
}
async function saveAssignmentKeywords() {
  const cfg = await apiGet('/api/config');
  const ids = window._assignmentKeywordIds || [];
  for (let i = 0; i < ids.length; i++) {
    const input = document.getElementById('assignment-keywords-' + i);
    const target = (cfg.assignments || []).find(a => a.id === ids[i]);
    if (input && target) target.keywords = parseKeywordInput(input.value);
  }
  await apiPost('/api/config/save', cfg);
  toast('作业关键词已保存');
  await loadAll();
}

function renderDueSettings() {
  const el = document.getElementById('due-list');
  if (!el) return;
  const list = state.assignments || [];
  el.innerHTML = list.map(a => `<div class="due-item">
    <div><strong>${escapeHtml(a.subject_group || a.subject || '其他')}</strong><div class="row-sub">${escapeHtml(a.experiment || a.name || '')}</div></div>
    <input type="date" id="due-${escapeHtml(a.id)}" value="${escapeHtml(a.due || '')}">
    <input id="notes-${escapeHtml(a.id)}" value="${escapeHtml(a.notes || '')}" placeholder="备注">
  </div>`).join('') || '<div class="empty">暂无作业项</div>';
}
async function saveDueSettings() {
  const cfg = await apiGet('/api/config');
  for (const a of (cfg.assignments || [])) {
    const due = document.getElementById('due-' + a.id);
    const notes = document.getElementById('notes-' + a.id);
    if (due) a.due = due.value;
    if (notes) a.notes = notes.value;
  }
  await apiPost('/api/config/save', cfg);
  toast('截止日期已保存');
  await loadAll();
}

function renderExperimentSettings() {
  const input = document.getElementById('experiment-dir-input');
  if (input && state.config) input.value = state.config.experiment_dir || '';
  const toggle = document.getElementById('experiment-enabled-toggle');
  if (toggle && state.config) toggle.checked = !!state.config.experiment_enabled;
  const msg = document.getElementById('experiment-msg');
  if (msg && state.config) msg.textContent = state.config.experiment_enabled ? '已启用' : '已关闭';
}
function renderNetworkAccess() {
  const network = state.network || {};
  const enabled = !!network.enabled;
  const local = network.is_local_request !== false;
  const toggle = document.getElementById('lan-access-toggle');
  const pill = document.getElementById('network-mode-pill');
  const urls = document.getElementById('lan-url-list');
  const token = document.getElementById('lan-access-token');
  const reset = document.getElementById('lan-token-reset');
  const note = document.getElementById('network-mode-note');
  const details = document.getElementById('lan-access-details');
  if (toggle) { toggle.checked = enabled; toggle.disabled = !local; }
  if (details) {
    details.classList.toggle('is-collapsed', !enabled);
    details.setAttribute('aria-hidden', enabled ? 'false' : 'true');
  }
  if (pill) { pill.textContent = enabled ? '局域网模式' : '仅本机'; pill.className = `pill ${enabled ? 'warn' : 'good'}`; }
  if (urls) urls.innerHTML = enabled && (network.lan_urls || []).length
    ? network.lan_urls.map(url => `<div class="row"><div><div class="row-title">${escapeHtml(url)}</div><div class="row-sub">手机或其他电脑使用此地址</div></div></div>`).join('')
    : '<div class="empty">当前仅可通过 localhost 在本机访问</div>';
  if (token) { token.value = local ? (network.access_token || '') : ''; token.disabled = !local; }
  if (reset) reset.disabled = !local || !enabled;
  if (note) note.textContent = local ? '局域网模式只适合可信私人网络，请勿做公网端口映射。' : '当前从远程设备访问；只能在运行服务的电脑上修改访问模式和口令。';
}
function toggleLanTokenVisibility() {
  const input = document.getElementById('lan-access-token');
  if (input) input.type = input.type === 'password' ? 'text' : 'password';
}
async function waitForNetworkRestart() {
  toast('正在等待服务重启');
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
      await apiGet('/api/server-status');
      location.reload();
      return;
    } catch (e) {}
  }
  toast('重启等待超时，请检查启动窗口');
}
async function configureLanAccess(enabled, regenerateToken = false) {
  const response = await apiPost('/api/network-access/configure', { enabled, regenerate_token: regenerateToken });
  state.network = response;
  renderNetworkAccess();
  await waitForNetworkRestart();
}
async function toggleLanAccess(enabled) {
  const text = enabled
    ? '开启后，同一局域网设备可访问仪表盘，但必须输入访问口令。服务将自动重启，是否继续？'
    : '关闭后，手机和其他电脑会立即断开，本机仍可使用。服务将自动重启，是否继续？';
  if (!confirm(text)) { renderNetworkAccess(); return; }
  try { await configureLanAccess(enabled, enabled && !state.network?.access_token); }
  catch (e) { toast('切换失败：' + (e.message || e)); renderNetworkAccess(); }
}
async function regenerateLanToken() {
  if (!confirm('重新生成后，已登录的远程设备会失效。是否继续？')) return;
  try { await configureLanAccess(true, true); }
  catch (e) { toast('生成口令失败：' + (e.message || e)); }
}
async function copyLanAccessInfo() {
  const network = state.network || {};
  if (!network.is_local_request || !network.access_token) return toast('当前没有可复制的访问口令');
  const text = `${(network.lan_urls || []).join('\n')}\n访问口令：${network.access_token}`.trim();
  await navigator.clipboard.writeText(text);
  toast('局域网地址和口令已复制');
}
async function toggleExperimentEnabled(enabled) {
  const toggle = document.getElementById('experiment-enabled-toggle');
  const cfg = await apiGet('/api/config');
  if (!enabled) {
    const expPath = cfg.experiment_dir || '当前公示文件夹';
    if (!confirm(`确定关闭公示文件夹并删除桌面上的公示文件夹吗？\n\n${expPath}\n\n删除后不会影响已收作业，但公示目录里的文件会被移除。`)) {
      if (toggle) toggle.checked = true;
      return;
    }
  }
  cfg.experiment_enabled = !!enabled;
  if (!enabled && cfg.experiment_dir) {
    const target = String(cfg.experiment_dir).toLowerCase();
    cfg.scan_dirs = (cfg.scan_dirs || []).filter(d => String(d || '').toLowerCase() !== target);
  }
  await apiPost('/api/config/save', cfg);
  if (!enabled) {
    try {
      const resp = await apiPost('/api/experiment-dir/delete', {});
      toast(resp.msg || '公示文件夹已关闭');
    } catch (e) {
      toast('已关闭，但删除文件夹失败：' + (e.message || e));
    }
  } else {
    toast('公示文件夹已启用');
  }
  await loadAll();
}
async function deleteExperimentDirWithConfirm() {
  const cfg = await apiGet('/api/config');
  const expPath = cfg.experiment_dir || '当前公示文件夹';
  if (!confirm(`确定删除桌面上的公示文件夹吗？\n\n${expPath}\n\n删除后不会影响已收作业，但公示目录里的文件会被移除。`)) return;
  try {
    const resp = await apiPost('/api/experiment-dir/delete', {});
    toast(resp.msg || '公示文件夹已删除');
  } catch (e) {
    toast('删除失败：' + (e.message || e));
  }
  await loadAll();
}
async function saveExperimentDir() {
  const input = document.getElementById('experiment-dir-input');
  const path = input.value.trim();
  if (!path) return toast('请输入公示文件夹路径');
  const cfg = await apiGet('/api/config');
  cfg.experiment_dir = path;
  await apiPost('/api/config/save', cfg);
  toast('公示文件夹路径已保存');
  await loadAll();
}
async function rescanExperiment() {
  const msg = document.getElementById('experiment-msg');
  if (!state.config?.experiment_enabled) {
    if (msg) msg.textContent = '公示文件夹未启用';
    return toast('请先启用公示文件夹');
  }
  if (msg) msg.textContent = '回填中...';
  const resp = await apiGet('/api/scan-existing?target=experiment');
  if (resp.ok === false) {
    if (msg) msg.textContent = resp.msg || '回填失败';
    return toast(resp.msg || '回填失败');
  }
  if (msg) msg.textContent = `扫描 ${resp.scanned || 0}，匹配 ${resp.matched || 0}`;
  toast('公示目录回填完成');
  await loadAll();
}

function renderClassificationBrain() {
  const stats = document.getElementById('brain-stats');
  const flow = document.getElementById('brain-flow');
  const summary = document.getElementById('brain-summary');
  if (!stats || !flow) return;
  const brain = state.aiBrain || {};
  const brainStats = brain.stats || {};
  const rules = state.aiRules || { profile: {}, subjects: {} };
  const settings = brain.settings || { mode: 'rules', sensitivity: .70 };
  const mode = document.getElementById('brain-mode');
  const sensitivity = document.getElementById('brain-sensitivity');
  if (mode) mode.value = settings.mode || 'rules';
  if (sensitivity) sensitivity.value = Number(settings.sensitivity || .70).toFixed(2);
  updateBrainSensitivityLabel();
  if (summary) summary.textContent = brain.available === false ? '模块已降级' : (settings.mode === 'off' ? '规则已关闭' : '规则运行中');
  stats.innerHTML = [
    ['活跃课程', brainStats.active_subjects || 0],
    ['确认别名', brainStats.confirmed_aliases || 0],
    ['待归档', brainStats.pending || 0],
    ['未知 / 冲突', (brainStats.unknown || 0) + (brainStats.conflicts || 0)],
  ].map(([label, value]) => `<div class="brain-stat"><span>${label}</span><strong>${value}</strong></div>`).join('');
  const subjects = Object.entries(rules.subjects || {});
  flow.innerHTML = subjects.filter(([, item]) => item.active !== false).slice(0, 8).map(([name, item]) => {
    const count = (item.confirmed_aliases || []).length + (item.keywords || []).length;
    const width = Math.min(100, Math.max(8, count * 8));
    return `<div class="mini-row"><span>${escapeHtml(name)}</span><div class="progress"><div class="bar" style="width:${width}%"></div></div><strong>${(item.confirmed_aliases || []).length} 别名 · ${(item.keywords || []).length} 关键词</strong></div>`;
  }).join('') || '<div class="empty">还没有课程规则。进入“本学期课程”或“专业包”开始初始化。</div>';
  const semester = rules.profile?.semester || settings.active_semester || '';
  const semesterLabel = document.getElementById('brain-semester-label');
  if (semesterLabel) semesterLabel.textContent = semester || '未设置';
  const overviewSubjects = document.getElementById('brain-overview-subjects');
  if (overviewSubjects) overviewSubjects.innerHTML = subjects.filter(([, item]) => item.active !== false).map(([name]) => `<span class="chip">${escapeHtml(name)}</span>`).join('') || '<span class="row-sub">暂无活跃课程</span>';
  renderBrainCourses();
  renderBrainFeedback();
  hydrateBrainPackForm();
}

function updateBrainSensitivityLabel() {
  const input = document.getElementById('brain-sensitivity');
  const label = document.getElementById('brain-sensitivity-value');
  if (input && label) label.textContent = Number(input.value || .70).toFixed(2);
}

async function refreshClassificationBrain() {
  const [brain, rules] = await Promise.all([apiGet('/api/ai/brain'), apiGet('/api/ai/rules')]);
  state.aiBrain = brain || {};
  state.aiRules = rules?.rule_pack || state.aiRules;
  renderClassificationBrain();
  toast('分类大脑已刷新');
}

async function saveBrainSettings() {
  const mode = document.getElementById('brain-mode')?.value || 'rules';
  const sensitivity = Number(document.getElementById('brain-sensitivity')?.value || .70);
  const preset = sensitivity === .85 ? 'conservative' : sensitivity === .70 ? 'balanced' : sensitivity === .55 ? 'aggressive' : 'custom';
  const resp = await apiPost('/api/ai/settings', {
    mode, sensitivity, sensitivity_preset: preset,
    active_semester: state.aiRules?.profile?.semester || ''
  });
  state.aiBrain = { ...(state.aiBrain || {}), settings: resp.settings };
  renderClassificationBrain();
  toast('分类设置已保存');
}

function renderBrainCourses() {
  const list = document.getElementById('brain-course-list');
  if (!list) return;
  const subjects = Object.entries(state.aiRules?.subjects || {});
  window._brainCourseNames = subjects.map(([name]) => name);
  list.innerHTML = subjects.map(([name, item], index) => `<div class="brain-course-row" data-course-index="${index}">
    <label class="brain-field"><span>正式课程</span><input class="brain-course-name" value="${escapeHtml(name)}"></label>
    <label class="brain-field"><span>确认别名</span><input class="brain-course-aliases" value="${escapeHtml((item.confirmed_aliases || []).join('，'))}" placeholder="简称用逗号分隔"></label>
    <label class="brain-field"><span>AI 待确认别名</span><input class="brain-course-suggested" value="${escapeHtml((item.suggested_aliases || []).join('，'))}" placeholder="确认前不参与分类"></label>
    <label class="brain-field"><span>课程关键词</span><input class="brain-course-keywords" value="${escapeHtml((item.keywords || []).join('，'))}" placeholder="知识点用逗号分隔"></label>
    <div class="node-actions"><label title="是否参与当前分类"><input class="brain-course-active" type="checkbox" ${item.active !== false ? 'checked' : ''}> 启用</label>${(item.suggested_aliases || []).length ? `<button onclick="confirmBrainSuggested(${index})">确认联想</button>` : ''}<button class="danger" onclick="removeBrainCourse(${index})">删除</button></div>
  </div>`).join('') || '<div class="empty">暂无课程。添加课程或导入专业包后会显示在这里。</div>';
}

function collectBrainCourses() {
  const current = state.aiRules || { schema_version: 1, profile: {}, subjects: {}, types: {} };
  const subjects = {};
  document.querySelectorAll('#brain-course-list .brain-course-row').forEach(row => {
    const name = row.querySelector('.brain-course-name')?.value.trim();
    if (!name) return;
    const old = current.subjects?.[window._brainCourseNames?.[Number(row.dataset.courseIndex)]] || {};
    subjects[name] = {
      active: !!row.querySelector('.brain-course-active')?.checked,
      confirmed_aliases: parseKeywordInput(row.querySelector('.brain-course-aliases')?.value || ''),
      suggested_aliases: parseKeywordInput(row.querySelector('.brain-course-suggested')?.value || ''),
      keywords: parseKeywordInput(row.querySelector('.brain-course-keywords')?.value || ''),
      assignment_types: old.assignment_types || [],
      source: old.source || 'user_confirmed'
    };
  });
  return { ...current, subjects };
}

async function saveBrainCourses() {
  const pack = collectBrainCourses();
  const resp = await apiPost('/api/ai/rules/save', { rule_pack: pack });
  state.aiRules = resp.rule_pack;
  await refreshClassificationBrain();
  toast('课程规则已保存');
}

function addBrainCourseRow(name = '') {
  const pack = collectBrainCourses();
  let course = String(name || '').trim();
  if (!course) course = '新课程';
  let unique = course;
  let index = 2;
  while (pack.subjects[unique]) unique = course + index++;
  pack.subjects[unique] = { active: true, confirmed_aliases: [], suggested_aliases: [], keywords: [], assignment_types: [], source: 'user_confirmed' };
  state.aiRules = pack;
  renderBrainCourses();
}

function removeBrainCourse(index) {
  const name = window._brainCourseNames?.[index];
  if (!name || !confirm(`确定从规则包中删除课程“${name}”吗？\n不会删除已有作业和提交记录。`)) return;
  const pack = collectBrainCourses();
  delete pack.subjects[name];
  state.aiRules = pack;
  renderBrainCourses();
}

function confirmBrainSuggested(index) {
  const row = document.querySelector(`#brain-course-list .brain-course-row[data-course-index="${index}"]`);
  if (!row) return;
  const aliases = parseKeywordInput(row.querySelector('.brain-course-aliases')?.value || '');
  const suggested = parseKeywordInput(row.querySelector('.brain-course-suggested')?.value || '');
  row.querySelector('.brain-course-aliases').value = [...new Set([...aliases, ...suggested])].join('，');
  row.querySelector('.brain-course-suggested').value = '';
  toast('联想别名已移入确认区，保存课程后生效');
}

async function extractBrainKeywords() {
  const subject = document.getElementById('brain-train-subject')?.value.trim();
  const files = [...(document.getElementById('brain-train-files')?.files || [])];
  if (!subject || !files.length) return toast('请填写科目并选择至少一个文件');
  const resp = await apiPost('/api/ai/extract-keywords', { subject, filenames: files.map(file => file.name) });
  state.aiTrainCandidates = resp.candidates || [];
  renderBrainTrainingCandidates();
}

function renderBrainTrainingCandidates() {
  const box = document.getElementById('brain-train-candidates');
  const status = document.getElementById('brain-train-status');
  if (!box) return;
  box.innerHTML = (state.aiTrainCandidates || []).map((item, index) => `<label class="brain-candidate" title="出现 ${item.count || 1} 次">
    <input type="checkbox" data-train-index="${index}" ${item.selected ? 'checked' : ''}>
    <span>${escapeHtml(item.text)}</span><small>${escapeHtml(item.category || 'keyword')}</small>
  </label>`).join('') || '<div class="empty">没有提取到可用关键词，可以直接在课程规则中手动填写。</div>';
  if (status) status.innerHTML = `${state.aiTrainCandidates.length} 个候选 · <button class="primary" onclick="saveBrainTraining()">保存选中词条</button>`;
}

async function saveBrainTraining() {
  const subject = document.getElementById('brain-train-subject')?.value.trim();
  if (!subject) return toast('请填写正式课程名称');
  const selected = [...document.querySelectorAll('#brain-train-candidates input:checked')].map(input => state.aiTrainCandidates[Number(input.dataset.trainIndex)]).filter(Boolean);
  const pack = state.aiRules || { schema_version: 1, profile: {}, subjects: {}, types: {} };
  const current = pack.subjects?.[subject] || { active: true, confirmed_aliases: [], suggested_aliases: [], keywords: [], assignment_types: [], source: 'subject_setup' };
  current.keywords = [...new Set([...(current.keywords || []), ...selected.filter(item => item.category === 'keyword').map(item => item.text)])];
  current.assignment_types = [...new Set([...(current.assignment_types || []), ...selected.filter(item => item.category === 'assignment_type').map(item => item.text)])];
  pack.subjects = { ...(pack.subjects || {}), [subject]: current };
  const resp = await apiPost('/api/ai/rules/save', { rule_pack: pack });
  state.aiRules = resp.rule_pack;
  clearBrainTraining();
  renderClassificationBrain();
  toast(`已为“${subject}”保存规则`);
}

function clearBrainTraining() {
  const subject = document.getElementById('brain-train-subject');
  const files = document.getElementById('brain-train-files');
  if (subject) subject.value = '';
  if (files) files.value = '';
  state.aiTrainCandidates = [];
  renderBrainTrainingCandidates();
}

function hydrateBrainPackForm() {
  const profile = state.aiRules?.profile || {};
  const pairs = [['brain-pack-name', profile.name], ['brain-pack-major', profile.major], ['brain-pack-semester', profile.semester]];
  pairs.forEach(([id, value]) => { const input = document.getElementById(id); if (input && !input.value) input.value = value || ''; });
  const courses = document.getElementById('brain-pack-courses');
  if (courses && !courses.value) courses.value = Object.keys(state.aiRules?.subjects || {}).join('\n');
}

function brainCourseNamesFromForm() {
  return (document.getElementById('brain-pack-courses')?.value || '').split(/[\n,，;；]+/).map(item => item.trim()).filter(Boolean);
}

function brainKnownAliasesFromForm() {
  const result = {};
  (document.getElementById('brain-pack-aliases')?.value || '').split('\n').forEach(line => {
    const parts = line.split(/[=:：]/);
    if (parts.length < 2) return;
    const aliases = parts[0].split(/[,，、]/).map(item => item.trim()).filter(Boolean);
    const course = parts.slice(1).join('=').trim();
    if (course && aliases.length) result[course] = aliases;
  });
  return result;
}

async function generateBrainPrompt() {
  const courses = brainCourseNamesFromForm();
  if (!courses.length) return toast('请先填写本学期课程');
  const profile = {
    name: document.getElementById('brain-pack-name')?.value.trim() || '',
    major: document.getElementById('brain-pack-major')?.value.trim() || '',
    semester: document.getElementById('brain-pack-semester')?.value.trim() || ''
  };
  const resp = await apiPost('/api/ai/prompt', { profile, courses, known_aliases: brainKnownAliasesFromForm() });
  document.getElementById('brain-pack-prompt').value = resp.prompt || '';
  toast('提示词已生成');
}

async function copyBrainPrompt() {
  const text = document.getElementById('brain-pack-prompt')?.value || '';
  if (!text) return toast('请先生成提示词');
  await navigator.clipboard.writeText(text);
  toast('提示词已复制');
}

function readBrainRuleFile(input) {
  const file = input?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { document.getElementById('brain-import-json').value = String(reader.result || ''); };
  reader.readAsText(file, 'utf-8');
}

async function previewBrainImport() {
  const text = document.getElementById('brain-import-json')?.value.trim();
  if (!text) return toast('请选择或粘贴专业包 JSON');
  const resp = await apiPost('/api/ai/rules/import', { payload: text, preview: true, allowed_subjects: brainCourseNamesFromForm() });
  state.aiImportPreview = resp.rule_pack;
  const preview = document.getElementById('brain-import-preview');
  const confirmButton = document.getElementById('brain-import-confirm');
  const summary = resp.summary || {};
  const collisions = resp.collisions || [];
  if (preview) preview.innerHTML = `<strong>${summary.subjects || 0} 门课程</strong><br>${summary.confirmed_aliases || 0} 个确认别名 · ${summary.suggested_aliases || 0} 个待确认别名 · ${summary.keywords || 0} 个关键词${collisions.length ? '<br><span class="tag red">存在别名冲突，请调整 JSON</span>' : ''}`;
  if (confirmButton) confirmButton.disabled = !!collisions.length;
}

async function confirmBrainImport() {
  if (!state.aiImportPreview || !confirm('确定将预览中的专业包合并到当前规则吗？')) return;
  const resp = await apiPost('/api/ai/rules/import', { rule_pack: state.aiImportPreview, preview: false, mode: 'merge', allowed_subjects: brainCourseNamesFromForm() });
  state.aiRules = resp.rule_pack;
  state.aiImportPreview = null;
  document.getElementById('brain-import-confirm').disabled = true;
  await refreshClassificationBrain();
  toast('专业包已合并');
}

function exportBrainRules() {
  const data = JSON.stringify(state.aiRules || {}, null, 2);
  const blob = new Blob([data], { type: 'application/json;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `assignment-rules-${state.aiRules?.profile?.semester || 'current'}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function renderBrainFeedback() {
  const brain = state.aiBrain || {};
  const corrections = brain.recent_feedback || [];
  const rejected = brain.rejected || [];
  const correctionCount = document.getElementById('brain-correction-count');
  const rejectionCount = document.getElementById('brain-rejection-count');
  if (correctionCount) correctionCount.textContent = `${corrections.length} 条`;
  if (rejectionCount) rejectionCount.textContent = `${rejected.length} 条`;
  const correctionBox = document.getElementById('brain-corrections');
  if (correctionBox) correctionBox.innerHTML = corrections.map(item => `<div class="brain-feedback-item"><strong>${escapeHtml(item.to_subject || '未命名科目')}</strong><span>${escapeHtml(item.token || '')}</span><span class="pill">${item.count || 1} 次</span></div>`).join('') || '<div class="empty">还没有科目修正记忆。</div>';
  const rejectedBox = document.getElementById('brain-rejections');
  if (rejectedBox) rejectedBox.innerHTML = rejected.map(item => `<div class="brain-feedback-item"><strong>${escapeHtml(item.assignment_label || item.assignment_id || '未知作业')}</strong><span>${escapeHtml((item.rejected_terms || []).join('、') || item.file_name || '')}</span><span class="pill">已移出</span></div>`).join('') || '<div class="empty">还没有“非本作业”反馈。</div>';
}

function modernAnnouncementPayload() {
  const version = document.getElementById('modern-pkg-version')?.value?.trim()
    || document.getElementById('modern-ann-version')?.value?.trim()
    || '1.0.0';
  return {
    version,
    announcements: (state.announcements || []).map(a => ({
      id: a.id,
      title: a.title,
      type: a.type || 'notice',
      version: a.version || version,
      content: a.content || '',
      timestamp: a.timestamp || new Date().toISOString(),
      author: a.author || '系统管理员'
    }))
  };
}
function updateModernPackageSummary() {
  const el = document.getElementById('modern-pkg-summary');
  if (!el) return;
  const version = document.getElementById('modern-pkg-version')?.value?.trim();
  el.textContent = `公告 ${(state.announcements || []).length} 条${version ? ' · v' + version : ''}`;
}
function renderModernAnnouncementList() {
  const el = document.getElementById('modern-ann-list');
  if (!el) return;
  updateModernPackageSummary();
  updateModernAnnTypePicker();
  const items = state.announcements || [];
  const countEl = document.getElementById('modern-ann-queue-count');
  if (countEl) countEl.textContent = `${items.length} 条`;
  el.innerHTML = items.map((ann, i) => `<div class="ann-item" style="animation-delay:${Math.min(i * 0.045, 0.28)}s">
    <div class="ann-item-head">
      <div class="ann-item-tags"><span class="pill">${escapeHtml(modernTypeLabel(ann.type))}</span><span class="pill">v${escapeHtml(ann.version || '1.0.0')}</span></div>
      <span class="row-sub">${formatTime(ann.timestamp)}</span>
    </div>
    <h4>${escapeHtml(ann.title || '未命名公告')}</h4>
    <div class="row-sub">${escapeHtml(ann.author || '系统管理员')}</div>
    <div class="ann-preview">${simpleMarkdown(ann.content || '（无内容）')}</div>
    <div class="file-actions"><button onclick="editModernAnnouncement(${i})">编辑</button><button class="danger" onclick="removeModernAnnouncement(${i})">删除</button></div>
  </div>`).join('') || '<div class="empty">暂无公告。添加公告后可随更新包一起发布。</div>';
}
function clearModernAnnouncementForm() {
  ['modern-ann-title', 'modern-ann-content'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}
function addModernAnnouncement() {
  const title = document.getElementById('modern-ann-title')?.value?.trim();
  const type = document.getElementById('modern-ann-type')?.value || 'changelog';
  const version = document.getElementById('modern-ann-version')?.value?.trim() || document.getElementById('modern-pkg-version')?.value?.trim() || '1.0.0';
  const author = document.getElementById('modern-ann-author')?.value?.trim() || '系统管理员';
  const content = document.getElementById('modern-ann-content')?.value?.trim();
  if (!title) return toast('请填写公告标题');
  if (!content) return toast('请填写公告内容');
  state.announcements.unshift({ id: 'ann_' + Date.now(), title, type, version, author, content, timestamp: new Date().toISOString() });
  clearModernAnnouncementForm();
  renderModernAnnouncementList();
  toast('公告已加入列表');
}
function editModernAnnouncement(index) {
  const ann = state.announcements?.[index];
  if (!ann) return;
  document.getElementById('modern-ann-title').value = ann.title || '';
  document.getElementById('modern-ann-type').value = ann.type || 'notice';
  document.getElementById('modern-ann-version').value = ann.version || '';
  document.getElementById('modern-ann-author').value = ann.author || '系统管理员';
  document.getElementById('modern-ann-content').value = ann.content || '';
  updateModernAnnTypePicker();
  state.announcements.splice(index, 1);
  renderModernAnnouncementList();
}
function removeModernAnnouncement(index) {
  if (!confirm('确定删除这条公告吗？')) return;
  state.announcements.splice(index, 1);
  renderModernAnnouncementList();
}
function clearModernAnnouncements() {
  if ((state.announcements || []).length && !confirm('确定清空公告列表？')) return;
  state.announcements = [];
  renderModernAnnouncementList();
}
async function loadExistingAnnouncementsModern() {
  const data = await apiGet('/api/announcements');
  state.announcements = (data.announcements || []).map((a, i) => ({
    id: a.id || 'ann_loaded_' + i,
    title: a.title || '未命名公告',
    type: a.type || 'notice',
    version: a.version || data.version || '1.0.0',
    content: a.content || '',
    timestamp: a.timestamp || new Date().toISOString(),
    author: a.author || '系统管理员'
  }));
  const versionInput = document.getElementById('modern-pkg-version');
  if (versionInput && !versionInput.value) versionInput.value = data.version || '';
  renderModernAnnouncementList();
  toast(`已加载 ${state.announcements.length} 条公告`);
}
function previewModernAnnouncements() {
  const payload = modernAnnouncementPayload();
  if (!payload.announcements.length) return toast('当前公告列表为空');
  const overlay = document.createElement('div');
  overlay.className = 'announcement-modal-overlay';
  overlay.onclick = () => overlay.remove();
  overlay.dataset.modernAnnModal = '1';
  const modal = document.createElement('div');
  modal.className = 'announcement-modal';
  modal.onclick = e => e.stopPropagation();
  modal.innerHTML = `<div class="section-head"><h3>公告预览 · v${escapeHtml(payload.version)}</h3><button onclick="this.closest('[data-modern-ann-modal]').remove()">关闭</button></div>
    <div class="announcement-modal-list">${payload.announcements.map((ann, i) => `<div class="ann-item" style="animation-delay:${Math.min(i * 0.045, 0.28)}s"><div class="ann-item-tags"><span class="pill">${escapeHtml(modernTypeLabel(ann.type))}</span><span class="pill">v${escapeHtml(ann.version || payload.version)}</span></div><h4>${escapeHtml(ann.title)}</h4><div class="ann-preview">${simpleMarkdown(ann.content)}</div></div>`).join('')}</div>`;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}
async function buildModernUpdatePackage() {
  const version = document.getElementById('modern-pkg-version')?.value?.trim();
  const result = document.getElementById('modern-pkg-result');
  if (!version) return toast('请填写更新版本号');
  if (!(state.announcements || []).length && !confirm('当前公告列表为空，仍然生成更新包吗？')) return;
  if (result) result.textContent = '正在生成更新包...';
  const resp = await fetch('/api/build-update-package', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version, announcements: modernAnnouncementPayload().announcements })
  });
  if (!resp.ok || !((resp.headers.get('content-type') || '').includes('application/zip'))) {
    let msg = '生成失败';
    try { const data = await resp.json(); msg = data.msg || msg; } catch (e) {}
    if (result) result.textContent = msg;
    return toast('生成更新包失败：' + msg);
  }
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dashboard_update_v${version}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  if (result) result.textContent = `已生成 dashboard_update_v${version}.zip，包含 ${(state.announcements || []).length} 条公告。`;
  toast('更新包已生成');
}

let modernLatestUpdate = null;
async function checkModernUpdate() {
  const stateEl = document.getElementById('modern-update-state');
  const result = document.getElementById('modern-update-check-result');
  const button = document.getElementById('modern-update-download');
  if (stateEl) stateEl.textContent = '检查中';
  if (button) button.disabled = true;
  if (result) result.textContent = '正在查询 GitHub Releases...';
  try {
    const resp = await fetch('/api/update/check', { cache: 'no-store' });
    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(data.msg || '检查更新失败');
    modernLatestUpdate = data;
    if (data.has_update) {
      if (stateEl) stateEl.textContent = '发现新版本';
      if (button) button.disabled = false;
      if (result) result.textContent = `当前 v${data.current_version}，最新 v${data.latest_version}：${data.asset.name}`;
    } else {
      if (stateEl) stateEl.textContent = '已是最新';
      if (result) result.textContent = `当前已是最新版本 v${data.current_version}。`;
    }
  } catch (e) {
    if (stateEl) stateEl.textContent = '检查失败';
    if (result) result.textContent = e.message;
    toast('检查更新失败：' + e.message);
  }
}
async function downloadModernUpdate() {
  const info = modernLatestUpdate;
  if (!info?.has_update || !info.asset?.download_url) return toast('请先检查更新');
  const result = document.getElementById('modern-update-check-result');
  if (!confirm(`发现 v${info.latest_version}，确定下载并加载更新包吗？\n\n${info.asset.name}`)) return;
  try {
    if (result) result.textContent = '正在下载 GitHub 更新包...';
    const resp = await fetch(info.asset.download_url);
    if (!resp.ok) throw new Error(`下载失败（HTTP ${resp.status}）`);
    const blob = await resp.blob();
    await handleModernUpdateFile(new File([blob], info.asset.name, { type: 'application/zip' }));
  } catch (e) {
    if (result) result.textContent = `${e.message}。可打开 Release 页面手动下载。`;
    if (info.release_url) window.open(info.release_url, '_blank', 'noopener');
  }
}

function setupModernUpdateDropzone() {
  const zone = document.getElementById('modern-update-dropzone');
  if (!zone || zone._bound) return;
  zone._bound = true;
  ['dragenter', 'dragover'].forEach(evt => zone.addEventListener(evt, e => {
    e.preventDefault();
    zone.classList.add('drag-over');
  }));
  ['dragleave', 'drop'].forEach(evt => zone.addEventListener(evt, e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
  }));
  zone.addEventListener('drop', e => {
    const file = e.dataTransfer?.files?.[0];
    if (file) handleModernUpdateFile(file);
  });
}
function handleModernUpdateFileSelect(event) {
  const file = event.target.files?.[0];
  if (file) handleModernUpdateFile(file);
  event.target.value = '';
}
async function handleModernUpdateFile(file) {
  const stateEl = document.getElementById('modern-update-state');
  const result = document.getElementById('modern-update-result');
  const bar = document.getElementById('modern-update-bar');
  if (!file.name.toLowerCase().endsWith('.zip')) return toast('请上传 .zip 更新包');
  if (!confirm(`确定加载更新包并重启服务吗？\n\n${file.name}`)) return;
  if (stateEl) stateEl.textContent = '上传中';
  if (result) result.textContent = '正在上传并校验更新包...';
  if (bar) bar.style.width = '25%';
  const form = new FormData();
  form.append('update_zip', file);
  try {
    const resp = await fetch('/api/update', { method: 'POST', body: form });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.msg || '更新失败');
    if (bar) bar.style.width = '100%';
    if (stateEl) stateEl.textContent = '更新成功';
    if (result) result.textContent = data.msg || '更新成功，正在等待服务重启...';
    if (data.has_announcement) toast('本次更新包含公告，刷新后会自动展示');
    let retries = 0;
    const timer = setInterval(async () => {
      retries++;
      try {
        const health = await fetch('/api/health', { cache: 'no-store' });
        if (health.ok) {
          clearInterval(timer);
          location.reload();
        }
      } catch (e) {}
      if (retries > 30) clearInterval(timer);
    }, 2000);
  } catch (e) {
    if (bar) bar.style.width = '0%';
    if (stateEl) stateEl.textContent = '更新失败';
    if (result) result.textContent = '更新失败：' + (e.message || e);
    toast('更新失败：' + (e.message || e));
  }
}

async function loadAndShowModernAnnouncements() {
  try {
    const data = await apiGet('/api/announcements');
    if (!data.ok || !data.announcements?.length) return;
    const version = data.version || '0.0.0';
    const dismissed = localStorage.getItem('modern_ann_dismissed_version') || '0.0.0';
    if (version === dismissed && dismissed !== '0.0.0') return;
    showModernAnnouncementModal(data.announcements, version);
  } catch (e) {
    console.warn('公告加载失败', e);
  }
}
function showModernAnnouncementModal(announcements, version, previewMode = false) {
  document.querySelector('[data-modern-ann-popup]')?.remove();
  const overlay = document.createElement('div');
  overlay.dataset.modernAnnPopup = '1';
  overlay.className = 'announcement-modal-overlay';
  overlay.onclick = e => { if (e.target === overlay) closeModernAnnouncementModal(); };
  const modal = document.createElement('div');
  modal.className = 'announcement-modal';
  modal.dataset.version = version;
  modal.dataset.preview = previewMode ? '1' : '0';
  modal.onclick = e => e.stopPropagation();
  modal.innerHTML = `<div class="section-head"><h3>系统公告 · v${escapeHtml(version)}</h3><button onclick="closeModernAnnouncementModal()">关闭</button></div>
    <div class="announcement-modal-list">${announcements.map((ann, i) => `<div class="ann-item" style="animation-delay:${Math.min(i * 0.045, 0.28)}s"><div class="ann-item-head"><div class="ann-item-tags"><span class="pill">${escapeHtml(modernTypeLabel(ann.type))}</span><span class="pill">v${escapeHtml(ann.version || version)}</span></div><span class="row-sub">${formatTime(ann.timestamp)}</span></div><h4>${escapeHtml(ann.title || '未命名公告')}</h4><div class="row-sub">${escapeHtml(ann.author || '系统')}</div><div class="ann-preview">${simpleMarkdown(ann.content || '')}</div></div>`).join('')}</div>
    <div class="file-actions" style="justify-content:space-between;margin-top:14px">
      ${previewMode ? '<span class="row-sub">预览模式</span>' : '<label class="check-line"><input type="checkbox" id="modern-ann-dismiss-check"> 本版本不再弹出</label>'}
      <button class="primary" onclick="closeModernAnnouncementModal()">我知道了</button>
    </div>`;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}
function closeModernAnnouncementModal() {
  const overlay = document.querySelector('[data-modern-ann-popup]');
  if (!overlay) return;
  const modal = overlay.querySelector('[data-version]');
  const version = modal?.dataset.version || '0.0.0';
  const preview = modal?.dataset.preview === '1';
  if (!preview && document.getElementById('modern-ann-dismiss-check')?.checked) {
    localStorage.setItem('modern_ann_dismissed_version', version);
  }
  overlay.remove();
}

async function refreshServerStatus() {
  const el = document.getElementById('server-status');
  if (!el) return;
  try {
    const resp = await apiGet('/api/server-status');
    el.textContent = '运行中 PID ' + resp.pid;
    el.className = 'pill good';
  } catch (e) {
    el.textContent = '离线';
    el.className = 'pill bad';
  }
}
async function restartServer() {
  if (!confirm('确定重启服务器吗？')) return;
  const btn = document.getElementById('modern-restart-server');
  if (btn) { btn.disabled = true; btn.textContent = '正在重启'; }
  try { await apiPost('/api/server/restart', {}); } catch (e) {}
  toast('正在等待新服务就绪');
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
      await apiGet('/api/server-status');
      toast('服务已恢复，正在刷新页面');
      window.setTimeout(() => location.reload(), 350);
      return;
    } catch (e) {
      // 服务切换期间连接被拒绝是预期行为，继续等待。
    }
  }
  if (btn) { btn.disabled = false; btn.textContent = '重启服务'; }
  toast('重启等待超时，请检查启动窗口中的错误信息');
}
async function shutdownServer() {
  if (!confirm('确定关闭服务器吗？需要手动重新启动。')) return;
  try { await apiPost('/api/server/shutdown', {}); } catch (e) {}
  toast('服务正在关闭');
}

(async function init() {
  try {
    await loadTheme();
    updateAdminMode();
    updateLowPowerMode();
    initHeroTitleCycle();
    playBootIntro();
    await loadAll();
    setupModernUpdateDropzone();
    setTimeout(() => loadAndShowModernAnnouncements(), 900);
    setTimeout(() => maybeStartModernGuide(), 1500);
  } catch (e) {
    console.error(e);
    toast('加载失败：' + e.message);
  }
})();
