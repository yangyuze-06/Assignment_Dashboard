// ==================== 全局状态 ====================
const API = '';
let dashboardData = null;
let classicNetworkAccess = {};
let currentTab = 'dashboard';
let scanDir = '';
let unmatchedExpanded = false;
let previewFilePath = null;        // 当前预览的文件路径
let window__analysisResults = {};  // 分析结果缓存 { idx: match_data }
let currentDetailAssignmentId = null;  // 当前作业详情页的 assignment_id
let isAdmin = false;                    // 是否为管理员模式
let announcementList = [];              // 公告编辑器列表
let annEditingIndex = -1;              // 公告编辑索引
let pendingAnnouncementImport = null;   // 拖入的公告文件预览数据
let currentThemePayload = null;          // 主题配置
let selectedThemeId = 'clean-blue';      // 当前选择的主题预设

// ==================== 全局报错通知 ====================
window.onerror = function(msg, url, line, col, err) {
  showErrorBanner('JS错误: ' + msg + ' (行' + line + ')');
};
window.onunhandledrejection = function(e) {
  showErrorBanner('请求失败: ' + (e.reason?.message || e.reason || '未知错误'));
};

function showErrorBanner(msg) {
  let banner = document.getElementById('error-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'error-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#ef4444;color:#fff;padding:10px 16px;font-size:13px;z-index:9999;display:flex;justify-content:space-between;align-items:center;font-family:monospace';
    document.body.prepend(banner);
  }
  banner.innerHTML = '<span>❌ ' + msg + '</span><span style="cursor:pointer;font-size:18px" onclick="this.parentElement.remove()">✕</span>';
  setTimeout(function() { if (banner.parentElement) banner.remove(); }, 15000);
}

function openModernFrontend() {
  window.location.href = new URL('/modern', window.location.href).href;
}

// ==================== Init ====================
async function init() {
  // 检测管理员模式
  const urlParams = new URLSearchParams(window.location.search);
  isAdmin = urlParams.get('admin') === 'true';
  if (isAdmin) {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
    initAnnounceEditor();
  }

  updateClock();
  setInterval(updateClock, 10000);
  
  // 加载扫描目录和班级配置
  try {
    const cfg = await apiGet('/api/config');
    scanDir = (cfg.scan_dirs && cfg.scan_dirs.length > 0) ? cfg.scan_dirs[0] : (cfg.scan_dir || '');
    // 动态更新文件存放路径显示
    const copyPathEl = document.getElementById('copy-path');
    if (copyPathEl && cfg.class_name) {
      const orgDir = (cfg.organized_dir || '').replace(/\\/g, '/');
      const parts = orgDir.split('/');
      const display = parts.length >= 2 ? parts.slice(-2).join('/') + '/' : cfg.class_name + '/已收作业/';
      copyPathEl.textContent = '桌面/' + cfg.class_name + '/已收作业/';
    }
    // 注入公示文件夹路径
    const expDirInput = document.getElementById('experiment-dir-input');
    if (expDirInput && cfg.experiment_dir) {
      expDirInput.value = cfg.experiment_dir;
    }
    const expEnabledToggle = document.getElementById('experiment-enabled-toggle');
    if (expEnabledToggle) expEnabledToggle.checked = !!cfg.experiment_enabled;
  } catch(e) {
    showErrorBanner('加载配置失败: ' + e.message);
  }
  await loadNetworkAccessClassic();
  
  try {
    await refreshAll();
  } catch(e) {
    showErrorBanner('加载仪表盘数据失败: ' + e.message);
  }

  // 加载公告弹窗（延迟 1 秒，确保页面完全渲染）
  setTimeout(() => { loadAndShowAnnouncements(); }, 1000);

  // 文件按钮事件委托
  document.addEventListener('click', function(e) {
    // 忽略按钮
    const ignoreBtn = e.target.closest('.ignore-btn');
    if (ignoreBtn) {
      e.stopPropagation();
      const idx = parseInt(ignoreBtn.getAttribute('data-ignore-idx'));
      if (!isNaN(idx)) ignoreUnmatchedByIdx(idx);
      return;
    }
    // 分析按钮
    const analysisBtn = e.target.closest('.analysis-btn');
    if (analysisBtn) {
      e.stopPropagation();
      const idx = parseInt(analysisBtn.getAttribute('data-analyze-idx'));
      if (!isNaN(idx)) analyzeFile(idx);
      return;
    }
    // 分析结果卡片中的确认/取消按钮
    const arBtn = e.target.closest('.ar-confirm, .ar-cancel');
    if (arBtn) {
      e.stopPropagation();
      const idx = parseInt(arBtn.getAttribute('data-ar-idx'));
      const matchIdx = parseInt(arBtn.getAttribute('data-match-idx') || '0');
      if (arBtn.classList.contains('ar-confirm')) confirmClassify(idx, matchIdx);
      else cancelAnalysis(idx);
      return;
    }
    // 标为模板按钮
    const tplBtn = e.target.closest('.template-btn');
    if (tplBtn) {
      e.stopPropagation();
      const idx = parseInt(tplBtn.getAttribute('data-template-idx'));
      if (!isNaN(idx)) markAsTemplate(idx);
      return;
    }
    // 预览按钮（未归类列表中的）
    const prevBtn = e.target.closest('.preview-btn, .preview-icon-btn');
    if (prevBtn) {
      e.stopPropagation();
      const path = prevBtn.getAttribute('data-path');
      if (path) previewFile(path);
      return;
    }
    // 文件操作按钮（打开文件/文件夹）
    const btn = e.target.closest('.file-act-btn');
    if (!btn) return;
    e.stopPropagation();
    const path = btn.getAttribute('data-path');
    if (!path) return;
    if (btn.classList.contains('open-file-btn')) openFile(path);
    else if (btn.classList.contains('open-folder-btn')) openFolder(path);
  });

  // ESC 关闭预览面板和弹窗
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      if (document.getElementById('preview-panel')?.classList.contains('open')) {
        closePreview();
      } else if (document.getElementById('student-popup')?.classList.contains('open')) {
        closeStudentPopup();
      } else if (!document.getElementById('convert-modal')?.classList.contains('hidden')) {
        closeConvertModal();
      }
    }
  });
}

async function autoRefresh() {
  if (currentTab !== 'dashboard') return;
  const url = '/api/dashboard';
  try {
    const newData = await apiGet(url);
    const oldHash = dashboardData ? dashboardData.submitted_count + '_' + dashboardData.last_scan : '';
    const newHash = newData.submitted_count + '_' + newData.last_scan;
    if (oldHash !== newHash) {
      const cacheKey = currentSubject || '__all__';
      dashboardCache[cacheKey] = newData;
      dashboardData = newData;
      renderDashboard();
    }
  } catch(e) {
    // 静默失败
  }
}

function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent =
    now.toLocaleString('zh-CN', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

// ==================== Tab切换 ====================
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const idx = {dashboard:0, assignments:1, manage:2}[tab];
  if (idx === undefined) return;
  const tabs = document.querySelectorAll('.tab');
  if (tabs[idx]) tabs[idx].classList.add('active');
  document.getElementById('tab-dashboard').classList.toggle('hidden', tab !== 'dashboard');
  document.getElementById('tab-assignments').classList.toggle('hidden', tab !== 'assignments');
  document.getElementById('tab-manage').classList.toggle('hidden', tab !== 'manage');
  if (tab === 'manage') { 
    renderStudentList(); renderKeywords(); renderAssignmentKeywords(); renderDueSettings(); renderScanDirs(); renderServerStatus(); renderThemePresets();
    // 入场交错动画
    document.querySelectorAll('.mgmt-card').forEach((card, i) => {
      card.style.animation = 'none';
      card.offsetHeight; // reflow
      card.style.animation = `fadeInUp 0.35s ease ${0.05 + i*0.06}s both`;
    });
  }
  if (tab === 'dashboard') { refreshDashboard(); }
  if (tab === 'assignments') refreshAssignments();
}

function toggleUnmatched() {
  unmatchedExpanded = !unmatchedExpanded;
  updateUnmatchedVisibility();
}

function updateUnmatchedVisibility() {
  const list = document.getElementById('unmatched-list');
  const toggle = document.getElementById('unmatched-toggle');
  if (!list || !toggle) return;
  list.classList.toggle('expanded', unmatchedExpanded);
  toggle.textContent = unmatchedExpanded ? '收起 ▲' : '展开 ▼';
}

// ==================== 监控开关 ====================
async function toggleWatch() {
  const cb = document.getElementById('watch-toggle');
  const sw = document.getElementById('watch-switch');
  const dot = document.getElementById('status-dot');
  const txt = document.getElementById('status-text');
  const enabled = cb.checked;

  sw.style.background = enabled ? 'var(--green)' : '#555';
  sw.firstElementChild.style.left = enabled ? '18px' : '2px';
  dot.className = enabled ? 'status-dot live' : 'status-dot off';
  txt.textContent = enabled ? '监控中' : '已停止';

  const cfg = await apiGet('/api/config');
  cfg.watch_enabled = enabled;
  await apiPost('/api/config/save', cfg);
}

// ==================== 数据获取 ====================
async function apiGet(path) {
  const resp = await fetch(API + path);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`API ${path} 返回 ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

async function apiPost(path, data) {
  const resp = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`API ${path} 返回 ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

async function renderThemePresets() {
  const grid = document.getElementById('theme-preset-grid');
  if (!grid) return;
  try {
    currentThemePayload = await apiGet('/api/theme');
    selectedThemeId = currentThemePayload.active || 'clean-blue';
    const presets = currentThemePayload.presets || [];
    grid.innerHTML = presets.map(p => {
      const c = p.colors || {};
      return `
        <button class="theme-preset-card ${selectedThemeId === p.id ? 'active' : ''}" onclick="selectThemePreset('${p.id}')">
          <div style="font-weight:700;font-size:13px">${escapeHtml(p.name)}</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">${escapeHtml(p.description || '')}</div>
          <div class="theme-swatches">
            <span class="theme-swatch" style="background:${c.primary || '#2563eb'}"></span>
            <span class="theme-swatch" style="background:${c.accent || '#10b981'}"></span>
            <span class="theme-swatch" style="background:${c.background || '#f8fafc'}"></span>
          </div>
        </button>
      `;
    }).join('');
  } catch (e) {
    grid.innerHTML = '<span style="color:var(--red);font-size:13px">主题加载失败：' + escapeHtml(e.message) + '</span>';
  }
}

function selectThemePreset(id) {
  selectedThemeId = id;
  document.querySelectorAll('.theme-preset-card').forEach(card => {
    card.classList.toggle('active', card.getAttribute('onclick')?.includes("'" + id + "'"));
  });
}

async function saveThemePreset() {
  if (!currentThemePayload) {
    currentThemePayload = await apiGet('/api/theme');
  }
  const payload = { ...currentThemePayload, active: selectedThemeId };
  const result = await apiPost('/api/theme/save', payload);
  currentThemePayload = result.theme || payload;
  const status = document.getElementById('theme-save-status');
  if (status) status.textContent = '已保存：刷新现代版后会继续使用当前主题';
  showToast('主题已保存', 'success');
}

let currentSubject = '';
let dashboardCache = {};
// 实验次数排序映射
const EXP_ORDER = {"第一次":1,"第二次":2,"第三次":3,"第四次":4,"第五次":5,"第六次":6,"第七次":7,"第八次":8,"第九次":9,"第十次":10,"实验一":11,"实验二":12,"实验三":13,"实验四":14,"实验五":15,"Lab1":21,"Lab2":22,"Lab3":23,"Lab4":24,"Lab5":25};

async function refreshAll() {
  const status = await apiGet('/api/status');
  document.getElementById('status-dot').className = status.watching ? 'status-dot live' : 'status-dot off';
  document.getElementById('status-text').textContent = status.watching ? '监控中' : '已停止';

  // 同步开关状态
  const cfg = await apiGet('/api/config');
  const enabled = cfg.watch_enabled !== false;
  document.getElementById('watch-toggle').checked = enabled;
  const sw = document.getElementById('watch-switch');
  sw.style.background = enabled ? 'var(--green)' : '#555';
  sw.firstElementChild.style.left = enabled ? '18px' : '2px';
  document.getElementById('status-dot').className = enabled ? 'status-dot live' : 'status-dot off';
  document.getElementById('status-text').textContent = enabled ? '监控中' : '已停止';

  await refreshDashboard();
}

async function refreshDashboard() {
  if (currentTab !== 'dashboard') return;
  const url = '/api/dashboard';
  const cacheKey = currentSubject || '__all__';

  // 科目切换时不清缓存，因为后端 /api/dashboard 返回全部数据，
  // 前端通过 currentSubject 过滤显示
  showLoading();
  try {
    dashboardData = await apiGet(url);
    dashboardCache['__all__'] = dashboardData;  // 全局缓存
  } catch(e) {
    console.error('Failed to load dashboard:', e);
  }
  hideLoading();
  renderDashboard();
}

function showLoading() {
  const grid = document.getElementById('student-grid');
  if (grid) {
    grid.style.opacity = '0.3';
    grid.style.transition = 'opacity 0.15s';
  }
}

function hideLoading() {
  const grid = document.getElementById('student-grid');
  if (grid) {
    grid.style.opacity = '1';
  }
}

function switchSubject(subj) {
  currentSubject = subj || '';
  document.getElementById('subject-selector').value = currentSubject;
  dashboardCache = {};  // 清缓存，确保重新获取数据
  refreshDashboard();
}

async function scanNow(ev) {
  const btn = (ev && ev.target) ? ev.target : document.getElementById('scan-now-btn') || document.querySelector('[onclick*="scanNow"]');
  if (!btn) return;
  btn.textContent = '扫描中...';
  btn.disabled = true;
  const result = await apiGet('/api/scan-now');
  dashboardCache = {};  // 扫描后清缓存
  if (result.new && result.new.length > 0) {
    // 统计新提交的学生
    const newStudents = {};
    for (const r of result.new) {
      if (r.student) {
        if (!newStudents[r.student]) newStudents[r.student] = [];
        newStudents[r.student].push(r.file?.name || '未知文件');
      }
    }
    const names = Object.keys(newStudents);
    if (names.length > 0) {
      let msg = '🆕 新提交：\n';
      for (const [name, files] of Object.entries(newStudents)) {
        const short = truncate(files[0], 18);
        msg += `  ${name} → ${short}${files.length > 1 ? ' 等' + files.length + '个文件' : ''}\n`;
      }
      alert(msg);
    } else {
      alert(`扫描到 ${result.scanned} 个新文件，但未能匹配到学生`);
    }
    dashboardData = await apiGet('/api/dashboard');
  } else {
    alert('没有发现新文件');
  }
  renderDashboard();
  btn.textContent = ' 立即扫描';
  btn.disabled = false;
}

async function scanExisting(ev) {
  const btn = (ev && ev.target) ? ev.target : document.getElementById('scan-existing-btn') || document.querySelector('[onclick*="scanExisting"]');
  if (!btn) return;
  btn.textContent = '扫描已有文件中...';
  btn.disabled = true;
  const result = await apiGet('/api/scan-existing');
  const dirInfo = result.dirs > 1 ? `（扫描了 ${result.dirs} 个目录）` : '';
  alert(`扫描完成${dirInfo}：共发现 ${result.scanned} 个文件，匹配到 ${result.matched} 条提交记录。`);
  dashboardCache = {};  // 扫描后清缓存
  await refreshDashboard();
  if (currentTab === 'assignments') refreshAssignments();
  btn.textContent = '📂 扫描已有文件';
  btn.disabled = false;
}

async function saveExperimentDir() {
  const input = document.getElementById('experiment-dir-input');
  const path = input.value.trim();
  if (!path) return;
  const cfg = await apiGet('/api/config');
  cfg.experiment_dir = path;
  await apiPost('/api/config/save', cfg);
  alert('公示文件夹路径已保存');
}

async function toggleExperimentEnabledClassic(enabled) {
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
      showToast(resp.msg || '公示文件夹已关闭', resp.ok === false ? 'error' : 'success');
    } catch (e) {
      showToast('已关闭，但删除文件夹失败: ' + (e.message || e), 'error');
    }
  } else {
    showToast('公示文件夹已启用', 'success');
  }
}

async function deleteExperimentDirClassic() {
  const cfg = await apiGet('/api/config');
  const expPath = cfg.experiment_dir || '当前公示文件夹';
  if (!confirm(`确定删除桌面上的公示文件夹吗？\n\n${expPath}\n\n删除后不会影响已收作业，但公示目录里的文件会被移除。`)) return;
  try {
    const resp = await apiPost('/api/experiment-dir/delete', {});
    showToast(resp.msg || '公示文件夹已删除', resp.ok === false ? 'error' : 'success');
  } catch (e) {
    showToast('删除失败: ' + (e.message || e), 'error');
  }
}

async function rescanExperiment() {
  const btn = document.querySelector('[onclick="rescanExperiment()"]');
  const msgEl = document.getElementById('experiment-rescan-msg');
  const cfg = await apiGet('/api/config');
  if (!cfg.experiment_enabled) {
    msgEl.textContent = '❌ 公示文件夹未启用';
    showToast('请先启用公示文件夹', 'error');
    return;
  }
  btn.textContent = '⏳ 回填中...';
  btn.disabled = true;
  msgEl.textContent = '';
  try {
    const result = await apiGet('/api/scan-existing?target=experiment');
    msgEl.textContent = `✅ 回填完成：扫描 ${result.scanned} 个文件，匹配 ${result.matched} 条记录`;
    dashboardCache = {};
    await refreshDashboard();
    if (currentTab === 'assignments') refreshAssignments();
  } catch(e) {
    msgEl.textContent = '❌ 回填失败: ' + e.message;
  }
  btn.textContent = '🔄 从公示目录回填已收作业';
  btn.disabled = false;
}

// ==================== Dashboard渲染 ====================
function renderDashboard() {
  if (!dashboardData) return;

  // 更新科目选择下拉框（过滤掉全部已完成的科目）
  const d = dashboardData;
  const assignments = d.assignments || [];
  const sel = document.getElementById('subject-selector');
  const allSubjects = dashboardData.subjects || [];
  // 检查某个科目是否已全部完成
  function isSubjectCompleted(subjectName) {
    const subjAsgns = assignments.filter(a => a.subject_group === subjectName);
    return subjAsgns.length > 0 && subjAsgns.every(a => a.completed);
  }
  const visibleSubjects = allSubjects.filter(s => !isSubjectCompleted(s));
  // 如果当前选中的科目已全部完成，自动切回"全部科目"
  if (currentSubject && isSubjectCompleted(currentSubject)) {
    currentSubject = '';
  }
  sel.innerHTML = '<option value="">全部科目</option>' +
    visibleSubjects.map(s => `<option value="${s}" ${s === currentSubject ? 'selected' : ''}>${s}</option>`).join('');
  const students = d.students || [];
  const status = d.assignment_status || {};
  
  // 统一判断函数：某学生是否在当前所选科目下全部完成
  function isStudentDone(sn) {
    if (currentSubject) {
      const subjAsgns = assignments.filter(a => a.subject_group === currentSubject && !a.completed);
      if (subjAsgns.length === 0) return true;
      return subjAsgns.every(a => (status[sn] || {})[a.id]);
    } else {
      const pending = assignments.filter(a => !a.completed);
      if (pending.length === 0) return true;
      return pending.every(a => (status[sn] || {})[a.id]);
    }
  }
  
  // 重新计算统计数字
  const total = students.length;
  let submitted = 0, missing = 0;
  for (const s of students) {
    if (isStudentDone(s.name)) submitted++; else missing++;
  }
  const rate = total > 0 ? Math.round((submitted / total) * 100) : 0;
  
  // 各实验/科目进度条
  if (currentSubject) {
    // 具体科目 → 显示该科目下各实验次数进度
    const subAsgns = assignments.filter(a => a.subject_group === currentSubject);
    let expHtml = '';
    subAsgns.forEach(a => {
      let expSub = 0;
      for (const sn in status) {
        if (status[sn][a.id]) expSub++;
      }
      const expRate = total > 0 ? Math.round((expSub/total)*100) : 0;
      expHtml += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:12px">
        <span style="width:40px;text-align:right;color:var(--text-secondary)">${a.experiment||a.name}</span>
        <div style="flex:1;height:12px;background:var(--red-bg);border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${expRate}%;background:${expRate>=80?'var(--green)':expRate>=40?'var(--yellow)':'var(--red)'};border-radius:4px;transition:width .3s"></div>
        </div>
        <span style="width:40px;text-align:right;font-weight:600">${expSub}/${total}</span>
      </div>`;
    });
    document.getElementById('experiment-progress-list').innerHTML = expHtml;
    document.getElementById('experiment-progress-list').style.display = 'block';
  } else {
    // 全部科目 → 按科目分组，每个科目统计"全部完成该科"的学生数
    const subjectGroups = {};
    assignments.forEach(a => {
      if (a.completed) return;
      const sg = a.subject_group || '其他';
      if (!subjectGroups[sg]) subjectGroups[sg] = [];
      subjectGroups[sg].push(a);
    });
    const subjectNames = Object.keys(subjectGroups).sort((a, b) => a.localeCompare(b, 'zh-CN'));
    let expHtml = '';
    subjectNames.forEach(sg => {
      const sgAsgns = subjectGroups[sg];
      // 该科目下，"所有实验都提交了"的学生数
      let sgDone = 0;
      for (const s of students) {
        const sn = s.name;
        if (sgAsgns.every(a => (status[sn] || {})[a.id])) sgDone++;
      }
      const sgRate = total > 0 ? Math.round((sgDone/total)*100) : 0;
      expHtml += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;font-size:12px">
        <span style="min-width:56px;text-align:right;color:var(--text-secondary)">${sg}</span>
        <div style="flex:1;height:14px;background:var(--red-bg);border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${sgRate}%;background:${sgRate>=80?'var(--green)':sgRate>=40?'var(--yellow)':'var(--red)'};border-radius:4px;transition:width .3s"></div>
        </div>
        <span style="width:40px;text-align:right;font-weight:600">${sgDone}/${total}</span>
      </div>`;
    });
    if (expHtml) {
      document.getElementById('experiment-progress-list').innerHTML = expHtml;
      document.getElementById('experiment-progress-list').style.display = 'block';
    } else {
      document.getElementById('experiment-progress-list').style.display = 'none';
    }
  }

  // Stats
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-submitted').textContent = submitted;
  document.getElementById('stat-missing').textContent = missing;
  document.getElementById('stat-rate').textContent = rate + '%';

  // Unmatched stats
  const unmatched = d.unmatched_files || [];
  const pendingArchive = d.pending_archive_files || [];
  const usCard = document.getElementById('stat-unmatched-card');
  document.getElementById('stat-unmatched').textContent = unmatched.length + pendingArchive.length;
  usCard.style.display = unmatched.length + pendingArchive.length > 0 ? '' : 'none';
  if (unmatched.length + pendingArchive.length > 0) usCard.onclick = () => {
    const us = document.getElementById('unmatched-section');
    us.scrollIntoView({ behavior: 'smooth' });
    if (!unmatchedExpanded) toggleUnmatched();
  };

  // Progress
  document.getElementById('progress-text').textContent = `${submitted}/${total}`;
  document.getElementById('progress-bar').style.width = rate + '%';

  // 截止倒计时：显示当前所选科目的截止日期
  let targetAsgn = null;
  if (currentSubject) {
    // 选了具体科目 → 找该科目下第一个有截止日期且未完成的实验
    targetAsgn = assignments.find(a =>
      a.subject_group === currentSubject && a.due && !a.completed
    ) || assignments.find(a =>
      a.subject_group === currentSubject && a.due
    );
  } else {
    // 全部科目 → 找最近截止的未完成作业
    const pending = assignments.filter(a => a.due && !a.completed);
    pending.sort((a, b) => a.due.localeCompare(b.due));
    targetAsgn = pending[0] || assignments.find(a => a.due);
  }
  document.getElementById('countdown-display').innerHTML = countdownHtml(
    targetAsgn?.due || '',
    targetAsgn?.notes || '',
    targetAsgn?.subject_group || ''
  );

  // 截止倒计时大模块 — 按科目汇总，隐藏已完成
  renderDueBigBoard(d.assignments || []);

  // Student cards
  const searchText = (document.getElementById('search-input')?.value || '').toLowerCase();
  const filter = document.getElementById('filter-select')?.value || 'all';

  let filtered = students;
  if (searchText) {
    filtered = filtered.filter(s =>
      s.name.toLowerCase().includes(searchText) ||
      (s.student_id || '').includes(searchText)
    );
  }
  if (filter === 'submitted') filtered = filtered.filter(s => isStudentDone(s.name));
  if (filter === 'not-submitted') filtered = filtered.filter(s => !isStudentDone(s.name));

  document.getElementById('grid-count').textContent = filtered.length;

  const grid = document.getElementById('student-grid');
  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty-state">暂无数据，请先添加学生</div>';
  } else {
    grid.innerHTML = filtered.map(s => {
      const isSubmitted = isStudentDone(s.name);
      const cls = isSubmitted ? 'submitted' : 'not-submitted';
      let tag;
      if (isSubmitted) {
        tag = currentSubject ? '<span class="status-tag done"> 已提交</span>' : '<span class="status-tag done"> 全部完成</span>';
      } else {
        if (currentSubject) {
          tag = '<span class="status-tag missing"> 未提交</span>';
        } else {
          // 全部科目模式：计算该学生还有几项未完成
          const pendingAsgns = assignments.filter(a => !a.completed);
          const sstatus = status[s.name] || {};
          const doneCount = pendingAsgns.filter(a => sstatus[a.id]).length;
          const remain = pendingAsgns.length - doneCount;
          tag = `<span class="status-tag missing"> 剩${remain}项</span>`;
        }
      }

      // 按科目分组 — 大号进度条展示
      const astatus = status[s.name] || {};
      
      const subjectMap = {};
      assignments.forEach(a => {
        if (a.completed) return;
        const sg = a.subject_group || '其他';
        if (!subjectMap[sg]) subjectMap[sg] = { name: sg, total: 0, done: 0 };
        subjectMap[sg].total++;
        if (astatus[a.id]) subjectMap[sg].done++;
      });
      
      const subjectsArr = Object.values(subjectMap);
      // 当选择了具体科目时，将匹配的科目排到最前面
      if (currentSubject) {
        subjectsArr.sort((a, b) => {
          if (a.name === currentSubject) return -1;
          if (b.name === currentSubject) return 1;
          return a.name.localeCompare(b.name, 'zh-CN');
        });
      } else {
        subjectsArr.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
      }

      let subjectsHtml = '';
      if (subjectsArr.length > 0) {
        subjectsHtml = '<div class="card-subjects">';
        subjectsArr.forEach(sg => {
          const pct = sg.total > 0 ? Math.round(sg.done / sg.total * 100) : 0;
          const isActive = currentSubject && sg.name === currentSubject;
          const barColor = isActive ? 'var(--accent)' : (pct >= 100 ? 'var(--green)' : (pct > 0 ? 'var(--yellow)' : 'var(--red)'));
          const txtColor = isActive ? 'var(--accent)' : (pct >= 100 ? 'var(--green)' : (pct > 0 ? 'var(--yellow)' : 'var(--red)'));
          const rowCls = isActive ? 'card-subject-row active' : (currentSubject ? 'card-subject-row dimmed' : 'card-subject-row');
          subjectsHtml += `<div class="${rowCls}">
            <span class="card-subject-name" style="color:${txtColor}">${sg.name}</span>
            <div class="card-subject-bar-wrap">
              <div class="card-subject-bar-fill" style="width:${pct}%;background:${barColor}"></div>
            </div>
            <span class="card-subject-stat" style="color:${txtColor}">${sg.done}/${sg.total}</span>
          </div>`;
        });
        subjectsHtml += '</div>';
      }

      return `
        <div class="student-card ${cls}" onclick="showStudentPopup('${escapeJs(s.name)}')">
          <div class="card-header">
            <div>
              <div class="name">${s.name}</div>
              <div class="id">${s.student_id || '-'}</div>
            </div>
            ${tag}
          </div>
          ${subjectsHtml}
        </div>
      `;
    }).join('');
  }

  // Unmatched files
  const us = document.getElementById('unmatched-section');
  document.getElementById('unmatched-count-badge').textContent = unmatched.length + pendingArchive.length;
  // 用全局数组存路径，避免 onclick 中反斜杠转义问题
  window._unmatchedPaths = unmatched.map(f => f.file_path || '');
  window._pendingArchiveFiles = pendingArchive;
  window._studentsForAssign = (d.students || []).map(s => s.name);
  if (unmatched.length > 0 || pendingArchive.length > 0) {
    us.classList.remove('hidden');
    const pendingHtml = pendingArchive.map((f, i) => {
      const c = f.classification || {};
      const assignments = (d.assignments || []).filter(a => a.subject_group === c.subject_group);
      return `<div class="unmatched-item" id="pending-item-${i}">
        <span style="flex:1;margin:0 8px"><strong style="color:var(--yellow)">待归档</strong> ${f.file_name} (${formatSize(f.size)})
          <div style="font-size:10px;color:var(--text-secondary);margin-top:3px">科目：${c.subject_group || '未识别'}；作业待确认；尚未同步公示文件夹</div>
          <div style="font-size:10px;color:var(--text-secondary)">${(c.evidence || []).join('；')}</div>
          <div class="analysis-result" id="classic-pending-analysis-${i}" style="margin-top:7px;padding:8px">
            <div style="font-size:11px;color:var(--text-secondary)">智能识别结果将在这里显示</div>
          </div>
        </span>
        <span style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">${fileActionButtons(f.file_path)}
          <button onclick="classicAnalyzePending(${i})">智能识别</button>
          <button class="ignore-btn" onclick="ignorePendingArchiveByIdx(${i})">忽略</button>
          <button onclick="classicSetPendingSubject(${i})">修改科目</button>
          <select id="classic-pending-assignment-${i}"><option value="">选择具体作业</option>${assignments.map(a => `<option value="${a.id}">${a.name || a.experiment}</option>`).join('')}</select>
          <button class="primary" onclick="classicConfirmPending(${i})">确认归档</button>
        </span>
      </div>`;
    }).join('');
    document.getElementById('unmatched-list').innerHTML = pendingHtml + unmatched.map((f, i) => `
      <div class="unmatched-item" style="animation-delay:${i*0.03}s" id="um-item-${i}">
        <input type="checkbox" class="um-checkbox" data-um-idx="${i}" onchange="updateBatchBtn()">
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0 8px"> ${f.file_name} (${formatSize(f.size)})${f.context_hint ? ' <span style="color:var(--accent);font-size:11px">[' + f.context_hint + ']</span>' : ''}
          <div style="font-size:10px;color:var(--text-secondary);margin-top:2px;display:flex;gap:10px;flex-wrap:wrap">
            <span title="扫描时间（系统检测到该文件的时间）">📥 扫描: ${formatTime(f.detected_at) || '-'}</span>
            <span title="文件最后修改时间（磁盘上的时间）">🕒 修改: ${formatTime(f.mtime) || '-'}</span>
          </div>
        </span>
        <span style="display:flex;align-items:center;gap:4px;flex-shrink:0;flex-wrap:wrap">
          <span class="um-extra-btns">
            <button class="analysis-btn" data-analyze-idx="${i}" title="智能分析文件内容">🔍</button>
            <button class="template-btn" data-template-idx="${i}" title="标为模板">📌</button>
          </span>
          ${fileActionButtons(f.file_path)}
          分配给：
          <select data-assign-idx="${i}" onchange="assignFileByIdx(this)">
            <option value="">--选择学生--</option>
            ${(d.students || []).map(s => `<option value="${s.name}">${s.name}</option>`).join('')}
          </select>
          <button class="ignore-btn" data-ignore-idx="${i}" title="忽略此文件">忽略</button>
        </span>
      </div>
    `).join('');
    // 批量工具栏可见
    document.getElementById('batch-toolbar').classList.add('visible');
    document.getElementById('batch-hint').textContent = '已选 0 个';
  } else {
    us.classList.add('hidden');
  }

  // Recent files table
  const recent = d.recent_files || [];
  if (recent.length === 0) {
    document.getElementById('file-table-body').innerHTML =
      '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:20px">暂无接收文件</td></tr>';
  } else {
    document.getElementById('file-table-body').innerHTML = recent.slice().reverse().map(r => `
      <tr>
        <td> ${r.file?.name || r.file_name || '-'}</td>
        <td>${r.student || '<span style="color:var(--yellow)">未匹配</span>'}</td>
        <td>${formatSize(r.file?.size || 0)}</td>
        <td>${formatTime(r.detected_at)}</td>
        <td style="display:flex;align-items:center;gap:4px">
          <button class="file-act-btn open-file-btn" data-path="${r.file?.path||''}" title="打开文件">📄</button>
          <button class="file-act-btn open-folder-btn" data-path="${r.file?.path||''}" title="打开文件夹">📁</button>
          <button class="preview-icon-btn" data-path="${r.file?.path||''}" title="预览文件">👁</button>
        </td>
      </tr>
    `).join('');
  }
}

function escapeJs(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n');
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function typeLabel(type) {
  const map = { changelog: '更新日志', notice: '普通公告', urgent: '紧急通知' };
  return map[type] || type || '公告';
}

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast toast-' + type + ' show';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => { toast.classList.remove('show'); }, 2500);
}

function simpleMarkdown(md) {
  if (!md) return '';
  let html = escapeHtml(md);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/^---$/gm, '<hr>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<\/li>\s*<li>/g, '</li><li>');
  return html;
}

function truncate(str, maxLen) {
  if (!str || str.length <= maxLen) return str || '';
  return str.substring(0, maxLen - 1) + '\u2026';
}

function fileActionButtons(path) {
  if (!path) return '';
  return '<button class="file-act-btn open-file-btn" data-path="' + escapeJs(path) + '" title="打开文件">📄</button>' +
    '<button class="file-act-btn open-folder-btn" data-path="' + escapeJs(path) + '" title="打开文件夹">📁</button>' +
    '<button class="preview-icon-btn" data-path="' + escapeJs(path) + '" title="预览文件">👁</button>';
}

async function withButtonLoading(btnOrFn, asyncFn) {
  // 自动管理按钮的 loading 状态
  const btn = typeof btnOrFn === 'function' ? btnOrFn() : btnOrFn;
  if (!btn) return;
  const origText = btn.textContent;
  btn.textContent = '...';
  btn.disabled = true;
  try {
    return await asyncFn();
  } finally {
    btn.textContent = origText;
    btn.disabled = false;
  }
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return size.toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

function formatTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  return d.toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
}

async function assignFile(filePath, studentName) {
  if (!studentName) return;
  await apiPost('/api/submissions/assign', { file_path: filePath, student: studentName });
  await refreshDashboard();
}

function assignFileByIdx(sel) {
  const idx = parseInt(sel.getAttribute('data-assign-idx'));
  const filePath = (window._unmatchedPaths || [])[idx];
  const studentName = sel.value;
  if (!filePath || !studentName) return;
  assignFile(filePath, studentName);
}

async function ignoreUnmatchedByIdx(idx) {
  const filePath = (window._unmatchedPaths || [])[idx];
  if (!filePath) return;
  if (!confirm('确定忽略此文件？它将不再出现在未归类列表中。')) return;
  await apiPost('/api/unmatched/ignore', { file_path: filePath });
  await refreshDashboard();
}

function getCheckedIdxs() {
  const cbs = document.querySelectorAll('.um-checkbox:checked');
  return Array.from(cbs).map(cb => parseInt(cb.getAttribute('data-um-idx'))).filter(i => !isNaN(i));
}

function updateBatchBtn() {
  const checked = getCheckedIdxs();
  document.getElementById('batch-hint').textContent = '已选 ' + checked.length + ' 个';
  const allCbs = document.querySelectorAll('.um-checkbox');
  document.getElementById('select-all-checkbox').indeterminate = checked.length > 0 && checked.length < allCbs.length;
  document.getElementById('select-all-checkbox').checked = checked.length === allCbs.length && allCbs.length > 0;
}

function toggleSelectAll() {
  const master = document.getElementById('select-all-checkbox');
  const cbs = document.querySelectorAll('.um-checkbox');
  cbs.forEach(cb => { cb.checked = master.checked; });
  updateBatchBtn();
}

async function batchIgnore() {
  const checked = getCheckedIdxs();
  if (checked.length === 0) { alert('请先勾选要忽略的文件'); return; }
  if (!confirm('确定批量忽略 ' + checked.length + ' 个文件？')) return;
  for (const idx of checked) {
    const fp = (window._unmatchedPaths || [])[idx];
    if (fp) await apiPost('/api/unmatched/ignore', { file_path: fp });
  }
  await refreshDashboard();
}

// ==================== 学生管理 ====================
async function renderStudentList() {
  const students = await apiGet('/api/students');
  document.getElementById('student-count').textContent = students.length;
  document.getElementById('student-tags').innerHTML = students.map(s => `
    <span class="student-list-tag stu-tag-item" data-name="${s.name}" data-id="${s.student_id||''}">
      ${s.name}${s.student_id ? ' (' + s.student_id + ')' : ''}
      <span class="del-btn" onclick="deleteStudent('${escapeJs(s.name)}')" title="删除">×</span>
    </span>
  `).join('') || '<span style="color:var(--text-secondary);font-size:13px">暂无学生</span>';
  // 重新应用搜索过滤
  filterStudentTags();
}

function filterStudentTags() {
  const q = (document.getElementById('student-search')?.value || '').toLowerCase();
  const tags = document.querySelectorAll('.stu-tag-item');
  tags.forEach(t => {
    const name = (t.getAttribute('data-name') || '').toLowerCase();
    const id = (t.getAttribute('data-id') || '').toLowerCase();
    t.classList.toggle('hidden-by-search', q && !name.includes(q) && !id.includes(q));
  });
  // 更新可见数量
  const visible = document.querySelectorAll('.stu-tag-item:not(.hidden-by-search)').length;
  const total = tags.length;
  if (q) {
    document.getElementById('student-count').textContent = visible + '/' + total;
  } else {
    document.getElementById('student-count').textContent = total;
  }
}

async function addStudent() {
  const name = document.getElementById('add-name').value.trim();
  const sid = document.getElementById('add-id').value.trim();
  const pinyin = document.getElementById('add-pinyin').value.trim();
  if (!name) { alert('请输入姓名'); return; }

  const data = { name };
  if (sid) data.student_id = sid;
  if (pinyin) data.pinyin = pinyin;

  await apiPost('/api/students/add', data);
  document.getElementById('add-name').value = '';
  document.getElementById('add-id').value = '';
  document.getElementById('add-pinyin').value = '';
  await renderStudentList();
  await refreshDashboard();
}

async function deleteStudent(name) {
  if (!confirm(`确定删除学生「${name}」？`)) return;
  await apiPost('/api/students/delete', { name });
  await renderStudentList();
  await refreshDashboard();
}

function previewBulkImport() {
  const text = document.getElementById('bulk-input').value.trim();
  const el = document.getElementById('bulk-preview');
  if (!el) return;
  if (!text) { el.textContent = ''; return; }
  const lines = text.split('\n').filter(l => l.trim());
  const names = lines.map(l => l.split(/[,，\t]+/)[0].trim()).filter(Boolean);
  el.textContent = `将导入 ${names.length} 名学生：${names.slice(0,5).join('、')}${names.length>5?'…':''}`;
}

async function bulkImport() {
  const text = document.getElementById('bulk-input').value.trim();
  if (!text) return;
  const lines = text.split('\n').filter(l => l.trim());
  const students = lines.map(line => {
    const parts = line.split(/[,，\t]+/);
    const s = { name: parts[0].trim() };
    if (parts[1]) s.student_id = parts[1].trim();
    if (parts[2]) s.pinyin = parts[2].trim();
    return s;
  });

  // 获取现有学生并合并
  const existing = await apiGet('/api/students');
  const existingNames = new Set(existing.map(s => s.name));
  let added = 0;
  for (const s of students) {
    if (!existingNames.has(s.name)) {
      existing.push(s);
      added++;
    }
  }
  await apiPost('/api/students/save', existing);
  document.getElementById('bulk-input').value = '';
  document.getElementById('bulk-preview').textContent = '';
  await renderStudentList();
  await refreshDashboard();
  alert(`导入完成：新增 ${added} 人，跳过 ${students.length - added} 人（已存在）`);
}

// ==================== 关键词管理 ====================
async function renderKeywords() {
  const cfg = await apiGet('/api/config');
  const keywords = cfg.file_keywords || ['作业', '报告', '论文'];
  const container = document.getElementById('keyword-tags');
  const countEl = document.getElementById('keyword-count');
  if (countEl) countEl.textContent = keywords.length;
  if (!container) return;
  container.innerHTML = keywords.map(k => `
    <span class="student-list-tag">
      ${k}
      <span class="del-btn" onclick="deleteKeyword('${escapeJs(k)}')" title="删除">×</span>
    </span>
  `).join('') || '<span style="color:var(--text-secondary);font-size:13px">暂无关键词</span>';
}

async function addKeyword() {
  const input = document.getElementById('keyword-input');
  const kw = input.value.trim();
  if (!kw) return;
  const cfg = await apiGet('/api/config');
  const keywords = cfg.file_keywords || ['作业', '报告', '论文'];
  if (!keywords.includes(kw)) {
    keywords.push(kw);
    cfg.file_keywords = keywords;
    await apiPost('/api/config/save', cfg);
    input.value = '';
    await renderKeywords();
  }
}

async function deleteKeyword(kw) {
  const cfg = await apiGet('/api/config');
  cfg.file_keywords = (cfg.file_keywords || []).filter(k => k !== kw);
  await apiPost('/api/config/save', cfg);
  await renderKeywords();
}

async function ignorePendingArchiveByIdx(idx) {
  const file = (window._pendingArchiveFiles || [])[idx];
  if (!file?.file_path) return;
  if (!confirm('确定忽略此文件？它将不再出现在待处理列表中。')) return;
  await apiPost('/api/unmatched/ignore', { file_path: file.file_path });
  await refreshDashboard();
}

async function classicAnalyzePending(idx) {
  const file = (window._pendingArchiveFiles || [])[idx];
  if (!file?.file_path) return;
  const box = document.getElementById('classic-pending-analysis-' + idx);
  if (box) box.innerHTML = '<div style="font-size:11px;color:var(--yellow)">正在分析文件名和内容...</div>';
  try {
    const result = await apiPost('/api/analyze-file', { file_path: file.file_path });
    const matches = result.matches || [];
    const best = matches[0] || {};
    if (!box) return;
    if (!matches.length || (!best.subject && !best.experiment && !best.name)) {
      box.innerHTML = '<div style="font-size:11px;color:var(--text-secondary)">未识别出明确科目或作业，请预览后手动确认。</div>';
      return;
    }
    const rows = [
      best.name && '<span>学生建议：<strong>' + escapeHtml(best.name) + '</strong></span>',
      best.subject && '<span>科目建议：<strong>' + escapeHtml(best.subject) + '</strong></span>',
      best.experiment && '<span>作业建议：<strong>' + escapeHtml(best.experiment) + '</strong></span>',
      best.content_type && '<span>类型：<strong>' + escapeHtml(best.content_type) + '</strong></span>',
      '<span>置信度：<strong>' + escapeHtml(best.confidence || 'low') + '</strong></span>'
    ].filter(Boolean).join('<span style="opacity:.45"> · </span>');
    const alternatives = matches.slice(1, 3).map(item => [item.subject, item.experiment].filter(Boolean).join(' / ')).filter(Boolean);
    box.innerHTML = '<div style="font-size:11px;display:flex;gap:5px;flex-wrap:wrap">' + rows + '</div>' + (alternatives.length ? '<div style="font-size:10px;color:var(--text-secondary);margin-top:4px">其他候选：' + escapeHtml(alternatives.join('；')) + '</div>' : '');
  } catch (e) {
    if (box) box.innerHTML = '<div style="font-size:11px;color:var(--red)">智能识别失败：' + escapeHtml(e.message || e) + '</div>';
  }
}
async function classicSetPendingSubject(idx) {
  const file = (window._pendingArchiveFiles || [])[idx];
  const subjects = [...new Set((dashboardData?.assignments || []).map(a => a.subject_group).filter(Boolean))];
  const subject = prompt('输入正确科目：\n' + subjects.join('、'), file?.classification?.subject_group || '');
  if (!file?.file_path || !subject) return;
  try {
    await apiPost('/api/submissions/set-subject', { file_path: file.file_path, subject_group: subject });
    await refreshData();
  } catch (e) { alert('修改科目失败：' + (e.message || e)); }
}
async function classicConfirmPending(idx) {
  const file = (window._pendingArchiveFiles || [])[idx];
  const select = document.getElementById('classic-pending-assignment-' + idx);
  if (!file?.file_path || !select?.value) return alert('请先选择具体作业');
  try {
    await apiPost('/api/submissions/assign-assignment', { file_path: file.file_path, assignment_id: select.value });
    await refreshData();
  } catch (e) { alert('归档失败：' + (e.message || e)); }
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

async function renderAssignmentKeywords() {
  const list = await apiGet('/api/assignments');
  const container = document.getElementById('assignment-keyword-settings');
  const countEl = document.getElementById('assignment-keyword-count');
  if (!container) return;
  window.assignmentKeywordIds = (list || []).map(a => a.id);
  if (countEl) countEl.textContent = (list || []).length;
  container.innerHTML = (list || []).map((a, i) => {
    const subject = a.subject_group || a.subject || '其他';
    const experiment = a.experiment || a.name || '';
    const keywords = (a.keywords || []).join('，');
    return `<div class="due-card assignment-keyword-row" style="animation-delay:${0.05 + i*0.04}s">
      <span class="due-subject-name">${escapeHtml(subject)}</span>
      <span class="due-count">${escapeHtml(experiment)}</span>
      <input type="text" id="assignment-keywords-${i}" value="${escapeHtml(keywords)}" placeholder="例如：${escapeHtml(subject)}，${escapeHtml(experiment)}">
    </div>`;
  }).join('') || '<span style="color:var(--text-secondary);font-size:13px">暂无作业项</span>';
}

async function saveAssignmentKeywords() {
  const cfg = await apiGet('/api/config');
  const ids = window.assignmentKeywordIds || [];
  for (let i = 0; i < ids.length; i++) {
    const input = document.getElementById('assignment-keywords-' + i);
    const target = (cfg.assignments || []).find(a => a.id === ids[i]);
    if (input && target) target.keywords = parseKeywordInput(input.value);
  }
  await apiPost('/api/config/save', cfg);
  dashboardCache = {};
  await renderAssignmentKeywords();
  if (currentTab === 'assignments') await refreshAssignments();
  await refreshDashboard();
  alert('作业关键词已保存！');
}

// ==================== 文件扫描队列管理 ====================
async function renderScanDirs() {
  try {
    const dirs = await apiGet('/api/scan-dirs');
    const container = document.getElementById('scan-dir-tags');
    const countEl = document.getElementById('scan-dir-count');
    if (countEl) countEl.textContent = dirs.length;
    if (!container) return;
    container.innerHTML = dirs.map(d => {
      const statusCls = d.exists ? 'tag-ok' : 'tag-err';
      const statusIcon = d.exists ? '✅' : '❌';
      return `
        <span class="student-list-tag ${statusCls}">
          ${statusIcon} ${escapeHtml(d.path)}
          <span class="del-btn" onclick="removeScanDir('${escapeJs(d.path)}')" title="移除">×</span>
        </span>`;
    }).join('') || '<span style="color:var(--text-secondary);font-size:13px">暂无扫描目录，请添加</span>';
  } catch (e) {
    console.error('renderScanDirs 失败:', e);
    const container = document.getElementById('scan-dir-tags');
    if (container) container.innerHTML = '<span style="color:#e74c3c">⚠ 加载扫描目录失败：' + (e.message || e) + '</span>';
  }
}

async function addScanDir() {
  const input = document.getElementById('scan-dir-input');
  const dir = input.value.trim();
  if (!dir) return;
  const result = await apiPost('/api/scan-dirs/add', { path: dir });
  if (result.ok) {
    input.value = '';
    await renderScanDirs();
  } else {
    alert(result.msg || '添加失败');
  }
}

async function removeScanDir(dir) {
  if (!confirm(`确定移除扫描目录？\n${dir}`)) return;
  const result = await apiPost('/api/scan-dirs/remove', { path: dir });
  if (result.ok) {
    await renderScanDirs();
  } else {
    alert(result.msg || '移除失败');
  }
}

async function loadNetworkAccessClassic() {
  try {
    classicNetworkAccess = await apiGet('/api/network-access');
    renderNetworkAccessClassic();
  } catch (e) {
    const note = document.getElementById('classic-network-note');
    if (note) note.textContent = '访问模式加载失败：' + (e.message || e);
  }
}
function renderNetworkAccessClassic() {
  const network = classicNetworkAccess || {};
  const local = network.is_local_request !== false;
  const toggle = document.getElementById('classic-lan-toggle');
  const pill = document.getElementById('classic-network-pill');
  const urls = document.getElementById('classic-lan-urls');
  const token = document.getElementById('classic-lan-token');
  const reset = document.getElementById('classic-lan-reset');
  const note = document.getElementById('classic-network-note');
  if (toggle) { toggle.checked = !!network.enabled; toggle.disabled = !local; }
  if (pill) pill.textContent = network.enabled ? '局域网' : '仅本机';
  if (urls) urls.innerHTML = network.enabled && (network.lan_urls || []).length
    ? (network.lan_urls || []).map(url => '<div>' + escapeHtml(url) + '</div>').join('')
    : '当前仅可通过 localhost 在本机访问';
  if (token) { token.value = local ? (network.access_token || '') : ''; token.disabled = !local; }
  if (reset) reset.disabled = !local || !network.enabled;
  if (note) note.textContent = local ? '仅适合可信私人网络，请勿做公网端口映射。' : '当前为远程访问，只能在运行服务的电脑上修改模式和口令。';
}
function toggleClassicLanToken() {
  const input = document.getElementById('classic-lan-token');
  if (input) input.type = input.type === 'password' ? 'text' : 'password';
}
async function waitForNetworkRestartClassic() {
  for (let i = 0; i < 40; i++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    try { await apiGet('/api/server-status'); location.reload(); return; } catch (e) {}
  }
  alert('重启等待超时，请检查启动窗口');
}
async function configureLanAccessClassic(enabled, regenerateToken) {
  classicNetworkAccess = await apiPost('/api/network-access/configure', { enabled, regenerate_token: !!regenerateToken });
  renderNetworkAccessClassic();
  await waitForNetworkRestartClassic();
}
async function toggleLanAccessClassic(enabled) {
  const message = enabled ? '开启局域网访问并自动重启服务？远程设备必须输入访问口令。' : '关闭后手机和其他电脑会立即断开，是否继续？';
  if (!confirm(message)) { renderNetworkAccessClassic(); return; }
  try { await configureLanAccessClassic(enabled, enabled && !classicNetworkAccess.access_token); }
  catch (e) { alert('切换失败：' + (e.message || e)); renderNetworkAccessClassic(); }
}
async function regenerateLanTokenClassic() {
  if (!confirm('重新生成后，已登录的远程设备会失效。是否继续？')) return;
  try { await configureLanAccessClassic(true, true); } catch (e) { alert('生成失败：' + (e.message || e)); }
}
async function copyClassicLanInfo() {
  if (!classicNetworkAccess.is_local_request || !classicNetworkAccess.access_token) return alert('当前没有可复制的访问口令');
  const text = `${(classicNetworkAccess.lan_urls || []).join('\n')}\n访问口令：${classicNetworkAccess.access_token}`.trim();
  await navigator.clipboard.writeText(text);
  alert('局域网地址和口令已复制');
}

// ==================== 服务器控制（仅管理员） ====================

async function renderServerStatus() {
  const badge = document.getElementById('server-status-badge');
  if (!badge) return;
  try {
    const resp = await fetch(API + '/api/server-status');
    if (resp.ok) {
      const data = await resp.json();
      badge.textContent = '🟢 运行中 (PID ' + data.pid + ')';
      badge.style.background = '#27ae60';
    } else {
      throw new Error('非 200');
    }
  } catch (e) {
    badge.textContent = '🔴 离线';
    badge.style.background = '#c0392b';
  }
}

async function restartServer() {
  if (!confirm('确定重启服务器吗？页面将自动刷新（中间会有几秒断网）。')) return;

  const btn = document.getElementById('btn-restart-server');
  const msgEl = document.getElementById('server-control-msg');
  const shutdownBtn = document.getElementById('btn-shutdown-server');
  if (btn) { btn.textContent = '...'; btn.disabled = true; }
  if (shutdownBtn) shutdownBtn.disabled = true;

  try {
    await apiPost('/api/server/restart', {});
  } catch (e) {
    // 服务器已关闭是预期行为，继续轮询
  }

  if (btn) { btn.textContent = '等待新进程就绪...'; btn.disabled = true; }
  if (msgEl) msgEl.innerHTML = '<span style="color:var(--yellow)">⏳ 正在等待新进程就绪...</span>';

  // 轮询 /api/server-status（间隔 500ms，最多 30 次 ≈ 15 秒）
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const resp = await fetch(API + '/api/server-status');
      if (resp.ok) {
        if (msgEl) msgEl.innerHTML = '<span style="color:var(--green)">✅ 新进程已就绪，即将刷新页面...</span>';
        setTimeout(() => location.reload(), 300);
        return;
      }
    } catch (e) {
      // 连接拒绝是预期，继续重试
    }
  }

  // 超时
  if (btn) { btn.textContent = '🔄 重启服务器'; btn.disabled = false; }
  if (shutdownBtn) shutdownBtn.disabled = false;
  if (msgEl) msgEl.innerHTML = '<span style="color:#e74c3c">⚠ 等待超时，请手动检查 server.py 是否启动成功</span>';
}

async function shutdownServer() {
  if (!confirm('服务将停止，需手动重新启动 server.py。\n确定要关闭吗？')) return;

  const btn = document.getElementById('btn-shutdown-server');
  const restartBtn = document.getElementById('btn-restart-server');
  const msgEl = document.getElementById('server-control-msg');
  if (btn) { btn.textContent = '正在关闭...'; btn.disabled = true; }
  if (restartBtn) restartBtn.disabled = true;

  try {
    await apiPost('/api/server/shutdown', {});
  } catch (e) {
    // 服务器已关闭是预期
  }

  if (btn) { btn.textContent = '已关闭'; btn.disabled = true; }
  if (msgEl) msgEl.innerHTML = '<span style="color:#e74c3c">⏻ 服务已停止，请手动启动 server.py</span>';

  // 更新状态徽标
  const badge = document.getElementById('server-status-badge');
  if (badge) {
    badge.textContent = '🔴 离线';
    badge.style.background = '#c0392b';
  }
}

// ==================== 作业列表管理（科目分组） ====================
async function refreshAssignments() {
  const list = await apiGet('/api/assignments');
  const cards = document.getElementById('subject-group-cards');
  if (!cards) return;
  if (!list || list.length === 0) {
    cards.innerHTML = '<div class="empty-state">未检测到作业目录，请先在管理页添加扫描目录，或检查 桌面/课程班级/作业目录/ 是否存在</div>';
    return;
  }
  
  // 按科目分组
  const groups = {};
  for (const a of list) {
    const g = a.subject_group || '其他';
    if (!groups[g]) groups[g] = { name: g, items: [], totalSubmitted: 0, totalStudents: 0 };
    groups[g].items.push(a);
    groups[g].totalSubmitted += a.submitted;
    groups[g].totalStudents += a.total;
  }
  
  // 排序：未完成科目在前，已完成科目在后；各自内部按名称排序
  const entries = Object.entries(groups).sort((a, b) => {
    const aDone = a[1].items.every(x => x.completed);
    const bDone = b[1].items.every(x => x.completed);
    if (aDone !== bDone) return aDone ? 1 : -1;
    return a[0].localeCompare(b[0], 'zh-CN');
  });
  
  let lastAllDone = null;
  cards.innerHTML = entries.map(([key, g], gi) => {
    const expCount = g.items.length;
    const stuCount = g.items[0]?.total || 0;
    const combinedRate = stuCount > 0 && expCount > 0
      ? Math.round(g.totalSubmitted / (stuCount * expCount) * 100)
      : 0;
    const allDone = g.items.every(a => a.completed);
    const firstWithDue = g.items.find(a => a.due);
    const firstDue = firstWithDue?.due || '';
    const firstNotes = firstWithDue?.notes || '';
    const firstAssignId = firstWithDue?.id || '';
    
    // 分隔线：从未完成→已完成切换时插入
    let divider = '';
    if (gi > 0 && allDone && lastAllDone === false) {
      divider = '<div class="sg-divider"><span>✓ 已完成科目</span></div>';
    }
    lastAllDone = allDone;
    
    const rateCls = combinedRate >= 100 ? 'full' : (combinedRate >= 60 ? 'high' : 'low');
    
    const expItems = g.items.map((a, ei) => {
      const erate = a.total > 0 ? Math.round(a.submitted / a.total * 100) : 0;
      const cls = erate >= 100 ? 'ok' : (erate > 0 ? 'warn' : 'bad');
      const done = a.completed;
      return `
        <div class="sg-exp-item${done?' done':''}" onclick="event.stopPropagation();showAssignmentDetail('${a.id}')" style="animation-delay:${0.1 + ei*0.04}s;${done?'opacity:0.45;text-decoration:line-through':''}">
          <span class="sg-exp-name">${a.experiment || a.name}</span>
          <span class="sg-exp-status">
            <span class="sg-exp-badge ${cls}">${erate}%</span>
            <span style="font-size:12px;color:var(--text-secondary)">${a.submitted}/${a.total}</span>
            <button class="file-act-btn" style="margin-left:4px;font-size:10px" onclick="event.stopPropagation();openFolder(folderPath('${key}','${a.experiment||''}'))" title="打开文件夹">📁</button>
            <button class="file-act-btn" style="margin-left:4px;font-size:10px" onclick="event.stopPropagation();markCompleted('${a.id}', event)" title="${done?'取消完成':'标记完成'}">${done?'↩':'✅'}</button>
            <span class="del-btn" style="margin-left:4px" onclick="event.stopPropagation();deleteAssignment('${a.id}')" title="删除">×</span>
          </span>
        </div>
      `;
    }).join('');
    
    return divider + `
      <div class="subject-group${allDone?' done':''}" id="sg-${key}" onclick="toggleSubject('${key}')" style="animation-delay:${0.08 + gi*0.12}s">
        <div class="sg-header">
          <div>
            <span class="sg-expand-arrow">▶</span>
            <span class="sg-name"> ${g.name}</span>
            <span class="sg-stats"> · ${expCount}次实验 · ${stuCount}人</span>
            <span style="margin-left:8px;cursor:pointer" onclick="event.stopPropagation();editSubjectDue('${key}')" title="设置整个科目的截止日期">${countdownHtml(firstDue, firstNotes, firstAssignId)}</span>
          </div>
          <div style="text-align:right;display:flex;align-items:center;gap:8px">
            <button class="file-act-btn" style="font-size:10px" onclick="event.stopPropagation();packSubject('${escapeJs(key)}')" title="打包下载该科目全部作业">📦 打包</button>
            <button class="file-act-btn" style="font-size:10px" onclick="event.stopPropagation();markSubjectCompleted('${key}', event)" title="${allDone?'取消完成整个科目':'全部标记完成'}">${allDone?'↩ 取消':'✅ 全部完成'}</button>
            <button class="file-act-btn" style="font-size:10px;color:var(--red)" onclick="event.stopPropagation();deleteSubject('${key}')" title="删除整个科目">🗑</button>
            <span class="sg-rate-number ${rateCls}">${combinedRate}%</span>
          </div>
        </div>
        <div class="sg-progress-wrap">
          <div class="sg-progress-fill" style="width:${combinedRate}%"></div>
        </div>
        <div class="sg-experiments">${expItems}</div>
      </div>
    `;
  }).join('');
}

function toggleSubject(key) {
  document.getElementById('sg-' + key).classList.toggle('expanded');
}

async function rescanAll(ev) {
  const btn = (ev && ev.target) ? ev.target : document.querySelector('[onclick*="rescanAll"]');
  if (!btn) return;
  btn.textContent = '扫描中...';
  btn.disabled = true;
  try {
    const result = await apiGet('/api/scan-existing');
    alert(`扫描完成：${result.scanned} 个文件，匹配 ${result.matched} 条，删除 ${result.deleted || 0} 个重复。`);
  } catch(e) {
    alert('扫描失败: ' + e.message);
  }
  dashboardCache = {};  // 扫描后清缓存
  await refreshAssignments();
  await refreshDashboard();
  btn.textContent = '🔄 重新扫描';
  btn.disabled = false;
}

async function packSubject(subjectGroup) {
  if (!subjectGroup) return;
  const url = API + '/api/pack-subject?subject_group=' + encodeURIComponent(subjectGroup);
  try {
    // 用 fetch 先检查是否有文件
    const resp = await fetch(url);
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      alert('打包失败: ' + (data.msg || resp.statusText));
      return;
    }
    // 检查是否是 ZIP（Content-Type 为 application/zip）
    const contentType = resp.headers.get('Content-Type') || '';
    if (contentType.includes('application/zip')) {
      const blob = await resp.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = subjectGroup + '_作业打包.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } else {
      const data = await resp.json();
      alert(data.msg || '打包失败');
    }
  } catch (e) {
    alert('打包请求失败: ' + e.message);
  }
}

async function showAddAssignment() {
  // 填充已有的科目作为下拉建议
  const subjects = new Set();
  for (const a of (dashboardData?.assignments || [])) {
    const sg = a.subject_group;
    if (sg && sg !== '其他') subjects.add(sg);
  }
  document.getElementById('subject-suggestions').innerHTML = [...subjects].map(s => `<option value="${s}">`).join('');
  document.getElementById('add-assignment-form').classList.remove('hidden');
}

async function addAssignment() {
  const name = document.getElementById('new-as-name').value.trim();
  if (!name) return alert('请输入作业名称');
  const subject = document.getElementById('new-as-subject').value.trim() || '其他';
  const extraKeywords = parseKeywordInput(document.getElementById('new-as-keywords')?.value || '');
  const data = {
    name: name,
    subject_group: subject,
    experiment: name,
    keywords: parseKeywordInput([subject, name, ...extraKeywords].filter(Boolean).join('，')),
    active: true,
  };
  await apiPost('/api/assignment/add', data);
  document.getElementById('add-assignment-form').classList.add('hidden');
  document.getElementById('new-as-name').value = '';
  document.getElementById('new-as-subject').value = '';
  const keywordInput = document.getElementById('new-as-keywords');
  if (keywordInput) keywordInput.value = '';

  dashboardCache = {};
  await refreshAssignments();
  await refreshDashboard();
}

async function deleteAssignment(id) {
  if (!confirm('确定删除该作业记录？')) return;
  await apiPost('/api/assignment/delete', { id });
  dashboardCache = {};
  await refreshAssignments();
  await refreshDashboard();
}

async function markCompleted(id, ev) {
  const btn = (ev && ev.target) ? ev.target : document.querySelector('[onclick*="markCompleted"]');
  if (!btn) return;
  btn.textContent = '...';
  btn.disabled = true;
  
  const cfg = await apiGet('/api/config');
  const target = (cfg.assignments || []).find(x => x.id === id);
  if (target) {
    target.completed = !target.completed;
    // 如果标记为完成，记录完成时间；否则清除时间戳
    if (target.completed) {
      target.completed_at = new Date().toISOString();
    } else {
      delete target.completed_at;
    }
    await apiPost('/api/config/save', cfg);
    dashboardCache = {};
    await refreshAssignments();
  }
  
  btn.textContent = target?.completed ? '↩' : '✅';
  btn.disabled = false;
}

async function markSubjectCompleted(subjectGroup, ev) {
  const btn = (ev && ev.target) ? ev.target : document.querySelector('[onclick*="markSubjectCompleted"]');
  if (!btn) return;
  btn.textContent = '...';
  btn.disabled = true;
  
  const cfg = await apiGet('/api/config');
  const targets = (cfg.assignments || []).filter(x => x.subject_group === subjectGroup);
  const allDone = targets.every(x => x.completed);
  const now = new Date().toISOString();
  for (const t of targets) {
    t.completed = !allDone;  // 全完成→取消，否则→全部完成
    if (t.completed) {
      t.completed_at = now;
    } else {
      delete t.completed_at;
    }
  }
  await apiPost('/api/config/save', cfg);
  dashboardCache = {};
  await refreshAssignments();
  await refreshDashboard();  // 同步仪表盘科目选择器状态
  
  btn.textContent = allDone ? '✅ 全部完成' : '↩ 取消';
  btn.disabled = false;
  showToast(allDone ? '已取消全部完成' : '科目已标记为全部完成 ✓');
}

async function deleteSubject(subjectName) {
  if (!confirm(`确定要删除科目「${subjectName}」及其所有实验记录吗？\n\n此操作不可撤销，但对应的实验文件不会被删除。`)) return;
  const resp = await apiPost('/api/subject/delete', { subject: subjectName });
  if (resp.ok) {
    dashboardCache = {};
    await refreshAssignments();
    await refreshDashboard();
    showToast('科目「' + subjectName + '」已删除');
  } else {
    alert('删除失败: ' + (resp.msg || '未知错误'));
  }
}

async function showAssignmentDetail(id) {
  currentDetailAssignmentId = id;
  document.getElementById('assignment-list').classList.add('hidden');
  document.getElementById('assignment-detail').classList.remove('hidden');

  try {
    const data = await apiGet('/api/assignment/' + id);
    if (data.error) { alert('作业不存在'); showAssignmentList(); return; }
    // 只更新标题文本节点，保留进度 span
    const sg = data.assignment.subject_group || '';
    const exp = data.assignment.experiment || '';
    const name = (sg && exp) ? (sg + exp + '实验报告提交情况') : (data.assignment.name || '作业提交详情');
    document.getElementById('ad-title').childNodes[0].textContent = name;

    // 文件夹按钮
    const folderBtn = document.getElementById('ad-folder-btn');
    if (sg && exp) {
      folderBtn.style.display = 'inline-block';
      folderBtn.setAttribute('data-folder', folderPath(sg, exp));
    } else {
      folderBtn.style.display = 'none';
    }

    document.getElementById('ad-total').textContent = data.total;
    document.getElementById('ad-done').textContent = data.submitted_count;
    document.getElementById('ad-miss').textContent = data.not_submitted_count;
    const rate = data.total > 0 ? Math.round(data.submitted_count / data.total * 100) : 0;
    document.getElementById('ad-rate').textContent = rate + '%';
    document.getElementById('ad-progress').textContent = `${data.submitted_count}/${data.total}`;
    document.getElementById('ad-progress-bar').style.width = rate + '%';

    // Missing students
    const missGrid = document.getElementById('ad-missing-grid');
    const missList = data.not_submitted || [];
    missGrid.innerHTML = missList.length > 0 ? missList.map(s => `
      <div class="student-card not-submitted">
        <div class="card-header"><div class="name">${s.name}</div><div class="id">${s.student_id || ''}</div></div>
        <div class="no-files"> 未提交</div>
      </div>
    `).join('') : '<div class="empty-state">全部已提交</div>';

    // Done students
    const doneGrid = document.getElementById('ad-done-grid');
    const doneList = data.submitted || [];
    doneGrid.innerHTML = doneList.length > 0 ? doneList.map(s => {
      const flist = (s.files || []).slice(0, 2);
      const extra = (s.files || []).length > 2 ? ` +${s.files.length-2}` : '';
      const files = flist.map(f => {
        const short = truncate(f.name, 18);
        return `<div style="font-size:11px;display:flex;align-items:center;gap:4px">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px" title="${f.name}">${short}</span>
          <button class="file-act-btn open-file-btn" data-path="${f.path}" title="打开文件" style="font-size:10px;padding:0 2px">📄</button>
          <button class="file-act-btn open-folder-btn" data-path="${f.path}" title="打开文件夹" style="font-size:10px;padding:0 2px">📁</button>
          <button class="preview-icon-btn" data-path="${f.path}" title="预览文件" style="font-size:10px;padding:0 2px">👁</button>
        </div>`;
      }).join('');
      return `
        <div class="student-card submitted">
          <div class="card-header"><div class="name">${s.name}</div><span class="status-tag done">已提交</span></div>
          <div class="id">${s.student_id || ''}</div>
          <div class="file-info">${files}${extra ? `<div style="font-size:10px;color:var(--accent)">${extra}</div>` : ''}</div>
        </div>
      `;
    }).join('') : '<div class="empty-state">暂无提交</div>';

    // 加载模板
    loadTemplates(id);
  } catch (e) {
    console.error('Assignment detail error:', e);
    alert('加载失败: ' + e.message);
    showAssignmentList();
  }
}

function showAssignmentList() {
  document.getElementById('assignment-detail').classList.add('hidden');
  document.getElementById('assignment-list').classList.remove('hidden');
}

// ==================== 学生详情弹窗 ====================
function showStudentPopup(name) {
  const d = dashboardData;
  if (!d) return;
  
  const student = (d.students || []).find(s => s.name === name);
  if (!student) return;
  
  document.getElementById('popup-name').textContent = student.name;
  document.getElementById('popup-id').textContent = '学号: ' + (student.student_id || '-');
  
  const status = d.assignment_status || {};
  const astatus = status[name] || {};
  const assignments = d.assignments || [];
  
  // 按科目分组显示
  const groups = {};
  assignments.forEach(a => {
    const sg = a.subject_group || '其他';
    if (!groups[sg]) groups[sg] = { name: sg, items: [] };
    groups[sg].items.push({ ...a, done: astatus[a.id] });
  });
  // 按实验次数排序
  Object.values(groups).forEach(g => {
    g.items.sort((a, b) => (EXP_ORDER[a.experiment] || 99) - (EXP_ORDER[b.experiment] || 99));
  });
  
  let html = '';
  Object.values(groups).forEach(sg => {
    const doneCount = sg.items.filter(a => a.done).length;
    const pct = sg.items.length > 0 ? Math.round(doneCount / sg.items.length * 100) : 0;
    const bg = pct >= 100 ? 'var(--green-bg)' : (pct > 0 ? 'var(--yellow-bg)' : 'var(--red-bg)');
    const fg = pct >= 100 ? 'var(--green)' : (pct > 0 ? 'var(--yellow)' : 'var(--red)');
    
    html += `<div style="background:var(--card-bg);border:1px solid var(--card-border);border-radius:8px;padding:12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-weight:700;font-size:14px">${sg.name}</span>
        <span style="font-size:12px;padding:2px 8px;border-radius:10px;background:${bg};color:${fg};font-weight:600">${doneCount}/${sg.items.length}</span>
      </div>`;
    
    const allFiles = d.all_files || {};
    const studentFiles = allFiles[name] || {};
    
    sg.items.forEach(a => {
      html += `<div style="padding:4px 0;font-size:13px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="color:${a.done?'var(--green)':'var(--red)'};font-size:16px">${a.done?'✓':'✗'}</span>
          <span style="flex:1">${a.experiment || a.name}</span>
          ${a.done ? '<span class="status-tag done">已交</span>' : '<span class="status-tag missing">未交</span>'}
        </div>`;
      
      // 已提交的实验显示文件列表
      if (a.done) {
        const files = studentFiles[a.id] || [];
        if (files.length > 0) {
          html += `<div style="margin-left:24px;margin-top:2px;display:flex;flex-direction:column;gap:2px">`;
          files.forEach(f => {
            const shortName = f.name.length > 28 ? f.name.substring(0,26)+'…' : f.name;
            html += `<div style="font-size:11px;color:var(--text-secondary);display:flex;align-items:center;gap:4px">
              <span title="${f.name}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px">📎 ${shortName}</span>
              <button class="file-act-btn open-file-btn" data-path="${f.path}" title="打开文件" style="font-size:10px;padding:0 4px">📄</button>
              <button class="file-act-btn open-folder-btn" data-path="${f.path}" title="打开文件夹" style="font-size:10px;padding:0 4px">📁</button>
              <button class="preview-icon-btn" data-path="${f.path}" title="预览文件" style="font-size:10px;padding:0 4px">👁</button>
            </div>`;
          });
          html += '</div>';
        }
      }
      
      html += '</div>';
    });
    
    html += '</div>';
  });
  
  document.getElementById('popup-assignments').innerHTML = html || '<div class="empty-state">暂无作业数据</div>';
  document.getElementById('student-popup').classList.remove('hidden');
}

function closeStudentPopup() {
  document.getElementById('student-popup').classList.add('hidden');
}

// ==================== 文件操作 ====================
async function openFile(path) {
  const resp = await fetch(API + '/api/open-file?path=' + encodeURIComponent(path));
  const data = await resp.json();
  if (!data.ok) alert('无法打开: ' + (data.msg || '未知错误'));
}

async function openFolder(path) {
  const resp = await fetch(API + '/api/open-folder?path=' + encodeURIComponent(path));
  const data = await resp.json();
  if (!data.ok) alert('无法打开: ' + (data.msg || '未知错误'));
}

function openDetailFolder() {
  const path = document.getElementById('ad-folder-btn').getAttribute('data-folder');
  if (path) openFolder(path);
}

function folderPath(subject, experiment) {
  // 优先使用 config 中的 organized_dir 作为基准
  const base = scanDir || '';
  if (base) {
    return base.replace(/\\/g, '/') + '/' + subject + '/' + experiment;
  }
  // 回退：从 organized_dir 推断（去掉末尾的 "已收作业"）
  const orgDir = (dashboardData?.organized_dir || '').replace(/\\/g, '/');
  if (orgDir) {
    const parent = orgDir.replace(/\/已收作业\/?$/, '');
    return parent + '/实验/' + subject + '/' + experiment;
  }
  return subject + '/' + experiment;
}

// ==================== 文件预览 ====================
async function loadDocPreview(path, body, fileName, apiBase) {
  const base = apiBase || '';
  const url = base + '/api/preview-doc?path=' + encodeURIComponent(path);
  body.innerHTML = '<div class="preview-loading-word"><div class="preview-spinner"></div><div class="plw-title">正在准备文档预览...</div><div class="plw-file">' + fileName + '</div><div class="plw-hint">首次预览会在后台生成，页面不会被卡住</div></div>';
  try {
    const resp = await fetch(url);
    if (resp.status === 200) {
      const iframe = document.createElement('iframe');
      iframe.src = url;
      iframe.allowFullscreen = true;
      iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;border-radius:8px;opacity:0;transition:opacity 0.3s';
      iframe.onload = function() { iframe.style.opacity = '1'; };
      body.innerHTML = '';
      body.style.position = 'relative';
      body.appendChild(iframe);
      return;
    }
    const queued = await resp.json();
    if (!queued.job_id) throw new Error(queued.msg || '预览任务创建失败');
    for (let i = 0; i < 120; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const statusResp = await fetch(base + '/api/preview-status?job_id=' + encodeURIComponent(queued.job_id));
      const status = await statusResp.json();
      if (status.status === 'ready') {
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.allowFullscreen = true;
        iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;border-radius:8px;opacity:0;transition:opacity 0.3s';
        iframe.onload = function() { iframe.style.opacity = '1'; };
        body.innerHTML = '';
        body.style.position = 'relative';
        body.appendChild(iframe);
        return;
      }
      if (status.status === 'error') throw new Error(status.error || '文档转换失败');
      if (i % 8 === 0) body.querySelector('.plw-hint').textContent = '正在后台转换，请稍候...';
    }
    throw new Error('预览转换超时，请尝试直接打开文件');
  } catch (e) {
    body.innerHTML = '<div class="preview-error">预览失败：' + (e.message || e) + '</div>';
  }
}
async function previewFile(path) {
  if (!path) return;
  previewFilePath = path;
  const panel = document.getElementById('preview-panel');
  const title = document.getElementById('preview-title');
  const body = document.getElementById('preview-body');

  const fileName = path.split(/[\\/]/).pop() || path;
  const ext = fileName.split('.').pop().toLowerCase();
  title.textContent = '📄 ' + fileName;
  panel.classList.add('open');

  // 获取文件大小（用于提示）
  let fileSize = '';
  try {
    const infoResp = await fetch(API + '/api/preview?path=' + encodeURIComponent(path));
    // 忽略结果，只用 _file_size hint
  } catch(e) {}

  // PDF 文件直接用浏览器原生渲染（iframe）
  if (ext === 'pdf') {
    body.innerHTML = '<div class="preview-loading-word"><div class="preview-spinner"></div><div class="plw-title">正在加载 PDF...</div><div class="plw-file">' + fileName + '</div><div class="plw-hint">大文件可能需几秒</div></div>';
    const serveUrl = API + '/api/serve-file?path=' + encodeURIComponent(path);
    const iframe = document.createElement('iframe');
    iframe.src = serveUrl;
    iframe.allowFullscreen = true;
    iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;border-radius:8px;opacity:0;transition:opacity 0.3s';
    iframe.onload = function() { iframe.style.opacity = '1'; };
    body.innerHTML = '';
    body.style.position = 'relative';
    body.appendChild(iframe);
    return;
  }

  // Word 文件（docx/doc）：转 PDF 后用 iframe 渲染，保留图表和排版
  if (ext === 'docx' || ext === 'doc') {
    body.innerHTML = '<div class="preview-loading-word"><div class="preview-spinner"></div><div class="plw-title"> 正在转换 ' + (ext.toUpperCase()) + ' 文档...</div><div class="plw-sub">通过 Microsoft Word 转为 PDF 渲染</div><div class="plw-file"> ' + fileName + '</div><div class="plw-hint"> 首次加载约需 10-15 秒，再次预览将秒开</div></div>';
    body.style.position = 'relative';
    await loadDocPreview(path, body, fileName, API);
    return;
  }

  // 图片文件直接显示
  if (['png','jpg','jpeg','gif','webp','bmp'].includes(ext)) {
    body.innerHTML = '<div class="preview-loading-word"><div class="preview-spinner"></div><div class="plw-title">加载图片...</div></div>';
    const serveUrl = API + '/api/serve-file?path=' + encodeURIComponent(path);
    setTimeout(function() {
      body.innerHTML = '<div style="text-align:center;height:100%;display:flex;align-items:center;justify-content:center"><img src="' + serveUrl + '" onerror="this.style.display=\'none\';this.parentElement.textContent=\'图片加载失败\'"></div>';
    }, 50);
    return;
  }

  // 文本文件：直接获取内容
  body.innerHTML = '<div class="preview-loading"><div class="preview-spinner" style="margin:0 auto 12px"></div>读取中...</div>';
  try {
    const resp = await fetch(API + '/api/preview?path=' + encodeURIComponent(path));
    const data = await resp.json();
    if (data.ok && data.text) {
      body.textContent = data.text;
    } else if (data.ok && !data.text) {
      body.innerHTML = '<div class="preview-empty">文件内容为空或无法提取文本</div>';
    } else {
      body.innerHTML = '<div class="preview-error">❌ ' + (data.msg || '预览失败') + '</div>';
    }
  } catch (e) {
    body.innerHTML = '<div class="preview-error">❌ 请求失败: ' + e.message + '</div>';
  }
}

function closePreview() {
  document.getElementById('preview-panel').classList.remove('open');
  previewFilePath = null;
}

// ==================== 未归类文件智能分析 ====================
async function analyzeFile(idx) {
  const filePath = (window._unmatchedPaths || [])[idx];
  if (!filePath) return;

  // 标记加载中
  const item = document.getElementById('um-item-' + idx);
  if (!item) return;  // DOM 已被刷新，放弃
  const btn = item.querySelector('.analysis-btn');
  if (btn) { btn.classList.add('loading'); btn.textContent = '⏳'; }

  try {
    const resp = await fetch(API + '/api/analyze-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_path: filePath }),
    });
    const data = await resp.json();

    // 恢复按钮
    if (btn) { btn.classList.remove('loading'); btn.textContent = '🔍'; }

    // 移除旧的分析结果
    const oldResult = item ? item.querySelector('.analysis-result') : null;
    if (oldResult) oldResult.remove();

    if (!data.ok) {
      const msg = data.msg || '分析失败';
      if (item) {
        const errDiv = document.createElement('div');
        errDiv.className = 'analysis-result';
        errDiv.style.borderColor = 'var(--red)';
        errDiv.innerHTML = '<span style="color:var(--red);flex:1">❌ ' + msg + '</span>';
        item.appendChild(errDiv);
      }
      return;
    }

    const matches = data.matches || [];
    if (matches.length === 0) {
      if (item) {
        const noDiv = document.createElement('div');
        noDiv.className = 'analysis-result';
        noDiv.innerHTML = '<span style="color:var(--text-secondary);flex:1">未识别出姓名/科目/实验信息，请手动分配</span>';
        item.appendChild(noDiv);
      }
      return;
    }

    // 缓存分析结果
    window__analysisResults[idx] = matches;

    // 渲染每个匹配结果
    matches.forEach((m, mi) => {
      if (!item) return;
      const parts = [];
      if (m.name) parts.push(m.name);
      if (m.subject) parts.push(m.subject);
      if (m.experiment) parts.push(m.experiment);
      if (m.content_type) parts.push(m.content_type);

      const suffix = parts.length > 0 ? parts.join(' ') : '未识别';
      const confidenceLabel = m.confidence === 'high' ? '高' : (m.confidence === 'medium' ? '中' : '低');
      const confColor = m.confidence === 'high' ? 'var(--green)' : (m.confidence === 'medium' ? 'var(--yellow)' : 'var(--text-secondary)');

      const resultDiv = document.createElement('div');
      resultDiv.className = 'analysis-result';
      resultDiv.innerHTML = `
        <span class="suggestion">疑似 <b>${suffix}</b> <span style="font-size:10px;color:${confColor}">[置信度:${confidenceLabel}]</span></span>
        <span class="ar-actions">
          <button class="ar-btn ar-confirm" data-ar-idx="${idx}" data-match-idx="${mi}">✅ 确认</button>
          <button class="ar-btn ar-cancel" data-ar-idx="${idx}">✕</button>
        </span>
      `;
      item.appendChild(resultDiv);
    });
  } catch (e) {
    if (btn) { btn.classList.remove('loading'); btn.textContent = '🔍'; }
    console.error('Analyze error:', e);
  }
}

function cancelAnalysis(idx) {
  const item = document.getElementById('um-item-' + idx);
  if (!item) return;
  const results = item.querySelectorAll('.analysis-result');
  results.forEach(r => r.remove());
  delete window__analysisResults[idx];
}

async function confirmClassify(idx, matchIdx) {
  const filePath = (window._unmatchedPaths || [])[idx];
  if (!filePath) return;

  const matches = window__analysisResults[idx];
  if (!matches || !matches[matchIdx]) return;
  const m = matches[matchIdx];

  // 构建新文件名: 班级名+姓名+科目+第X次 类型
  const className = (dashboardData?.class_name) || '课程班级';
  const parts = [className];
  if (m.name) parts.push(m.name);
  if (m.subject) parts.push(m.subject);
  if (m.experiment) parts.push(m.experiment);
  if (m.content_type) parts.push(m.content_type);

  const ext = filePath.split('.').pop() || 'docx';
  const newBasename = parts.join('+') + '.' + ext;

  // 尝试找到匹配的 assignment_id
  let assignmentId = '';
  if (m.subject) {
    try {
      const assgn = await apiGet('/api/assignments');
      const found = assgn.find(a =>
        (a.subject_group || '') === m.subject && (a.experiment || '') === (m.experiment || '')
      );
      if (found) assignmentId = found.id;
    } catch (e) {}
  }

  if (!confirm('确认将文件归类为:\n\n' + newBasename + '\n\n并按 ' + className + '/' + (m.subject||'未知') + '/' + (m.experiment||'') + '/' + (m.name||'未知') + '/ 归档？')) return;

  try {
    const resp = await fetch(API + '/api/confirm-classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_path: filePath,
        student_name: m.name || '未知',
        assignment_id: assignmentId,
        new_basename: newBasename,
      }),
    });
    const data = await resp.json();
    if (data.ok) {
      alert('已归档！');
      delete window__analysisResults[idx];
      await refreshDashboard();
    } else {
      alert('归档失败: ' + (data.msg || '未知错误'));
    }
  } catch (e) {
    alert('请求失败: ' + e.message);
  }
}

// ==================== 标为模板 ====================
async function markAsTemplate(idx) {
  const filePath = (window._unmatchedPaths || [])[idx];
  if (!filePath) return;

  // 先分析文件获取科目和实验信息，用于提示
  let label = '（未分析）';
  try {
    const ar = await fetch(API + '/api/analyze-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_path: filePath }),
    });
    const ad = await ar.json();
    if (ad.ok && ad.matches && ad.matches.length > 0) {
      const m = ad.matches[0];
      const parts = [];
      if (m.subject) parts.push(m.subject);
      if (m.experiment) parts.push(m.experiment);
      if (parts.length > 0) label = parts.join(' ');
    }
  } catch (e) {}

  if (!confirm('确定标记为模板？\n\n识别为：' + label + ' 模板\n\n文件将被复制到 模板/ 目录，\n并从未归类列表中移除。')) return;

  try {
    const resp = await fetch(API + '/api/mark-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_path: filePath,
        assignment_id: currentDetailAssignmentId || '',
      }),
    });
    const data = await resp.json();
    if (data.ok) {
      // 自动忽略，不再出现在未归类列表
      await apiPost('/api/unmatched/ignore', { file_path: filePath });
      await refreshDashboard();
    } else {
      alert('标记失败: ' + (data.msg || '未知错误'));
    }
  } catch (e) {
    alert('请求失败: ' + e.message);
  }
}

// ==================== 模板模块添加文件 ====================
function triggerTemplateUpload() {
  const input = document.getElementById('template-file-input');
  if (input) input.click();
}

async function handleTemplateUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (!confirm('确定将「' + file.name + '」添加为模板？')) { input.value = ''; return; }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('assignment_id', currentDetailAssignmentId || '');

  try {
    const resp = await fetch(API + '/api/upload-template', {
      method: 'POST',
      body: formData,
    });
    const data = await resp.json();
    if (data.ok) {
      loadTemplates(currentDetailAssignmentId);
    } else {
      alert('添加失败: ' + (data.msg || '未知错误'));
    }
  } catch (e) {
    alert('请求失败: ' + e.message);
  }
  input.value = '';
}

// ==================== 模板加载（作业详情页） ====================
async function loadTemplates(assignmentId) {
  const section = document.getElementById('ad-template-section');
  const listEl = document.getElementById('ad-template-list');
  if (!section || !listEl) return;

  try {
    const data = await apiGet('/api/templates?assignment_id=' + (assignmentId || ''));
    const templates = data.templates || [];

    if (templates.length === 0) {
      listEl.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:16px;font-size:13px">暂无模板，可点击「+ 添加模板」上传</div>';
      return;
    }

    listEl.innerHTML = templates.map(t => {
      const short = t.name.length > 30 ? t.name.substring(0, 28) + '…' : t.name;
      return `<div class="template-item">
        <span class="tm-name" title="${t.name}">📌 ${short}</span>
        <span class="tm-actions">
          <button class="file-act-btn open-file-btn" data-path="${t.path}" title="打开模板文件">📄</button>
          <button class="file-act-btn open-folder-btn" data-path="${t.path}" title="打开所在文件夹">📁</button>
          <button class="preview-icon-btn" data-path="${t.path}" title="预览模板">👁</button>
        </span>
      </div>`;
    }).join('');
  } catch (e) {
    listEl.innerHTML = '<div style="text-align:center;color:var(--red);padding:16px;font-size:13px">加载模板失败，请确保服务端已重启</div>';
    console.error('Load templates error:', e);
  }
}

// ==================== docx→PDF 转换弹窗 ====================
let convertFiles = [];  // { name, file: File }

function openConvertModal() {
  convertFiles = [];
  document.getElementById('convert-modal').classList.remove('hidden');
  document.getElementById('convert-file-input').value = '';
  document.getElementById('convert-result-area').classList.add('hidden');
  document.getElementById('convert-start-btn').disabled = true;
  document.getElementById('convert-file-count').textContent = '未选择文件';
  renderConvertFileList();
  setupConvertDragDrop();
}

function closeConvertModal(event) {
  if (event && event.target !== document.getElementById('convert-modal')) return;
  document.getElementById('convert-modal').classList.add('hidden');
}

function setupConvertDragDrop() {
  const dz = document.getElementById('convert-dropzone');
  dz.ondragover = function(e) { e.preventDefault(); dz.classList.add('drag-over'); };
  dz.ondragleave = function() { dz.classList.remove('drag-over'); };
  dz.ondrop = function(e) {
    e.preventDefault();
    dz.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files || []);
    addConvertFiles(files);
  };
}

function handleConvertFileSelect(input) {
  addConvertFiles(Array.from(input.files || []));
  input.value = '';
}

function addConvertFiles(files) {
  for (const f of files) {
    if (!f.name.toLowerCase().endsWith('.docx')) {
      showErrorBanner('跳过非 docx 文件: ' + f.name);
      continue;
    }
    if (convertFiles.some(cf => cf.name === f.name)) {
      showErrorBanner('文件已存在: ' + f.name);
      continue;
    }
    convertFiles.push({ name: f.name, file: f });
  }
  renderConvertFileList();
}

function removeConvertFile(idx) {
  convertFiles.splice(idx, 1);
  renderConvertFileList();
}

function renderConvertFileList() {
  const list = document.getElementById('convert-file-list');
  const btn = document.getElementById('convert-start-btn');
  const count = document.getElementById('convert-file-count');

  if (convertFiles.length === 0) {
    list.innerHTML = '';
    btn.disabled = true;
    count.textContent = '未选择文件';
  } else {
    list.innerHTML = convertFiles.map((f, i) => `
      <div class="convert-file-item">
        <span>📄</span>
        <span class="cf-name">${f.name}</span>
        <span style="font-size:11px;color:var(--text-secondary)">${formatSize(f.file.size)}</span>
        <span class="cf-remove" onclick="removeConvertFile(${i})" title="移除">✕</span>
      </div>
    `).join('');
    btn.disabled = false;
    count.textContent = `已选 ${convertFiles.length} 个文件`;
  }
}

async function startConvert() {
  if (convertFiles.length === 0) return;

  const area = document.getElementById('convert-result-area');
  const summary = document.getElementById('convert-summary');
  const resultsDiv = document.getElementById('convert-results');
  const btnAll = document.getElementById('btn-download-all');
  const startBtn = document.getElementById('convert-start-btn');

  area.classList.remove('hidden');
  summary.innerHTML = '<span style="color:var(--yellow)">⏳ 正在转换...</span>';
  resultsDiv.innerHTML = '';
  btnAll.disabled = true;
  startBtn.disabled = true;
  startBtn.textContent = '⏳ 转换中...';

  let okPaths = [];
  let results = [];

  for (let i = 0; i < convertFiles.length; i++) {
    const f = convertFiles[i];
    summary.innerHTML = `<span style="color:var(--yellow)">⏳ 正在转换 ${i+1}/${convertFiles.length}: ${f.name}</span>`;

    try {
      const form = new FormData();
      form.append('file', f.file, f.name);
      const resp = await fetch(API + '/api/convert-upload', { method: 'POST', body: form });
      const data = await resp.json();
      const item = (data.results || [])[0] || {};

      if (item.status === 'ok') {
        results.push({ name: f.name, status: 'ok', pdf_url: item.pdf_url });
        okPaths.push(item.pdf_url.replace('/api/download?path=', ''));
      } else {
        results.push({ name: f.name, status: 'error', msg: item.msg || '转换失败' });
      }
    } catch(e) {
      results.push({ name: f.name, status: 'error', msg: '网络错误: ' + e.message });
    }
  }

  // 显示结果
  const okCount = results.filter(r => r.status === 'ok').length;
  const errCount = results.filter(r => r.status !== 'ok').length;

  summary.innerHTML = `<span style="color:${errCount===0?'var(--green)':'var(--yellow)'}">✅ ${okCount} 成功 / ❌ ${errCount} 失败 / 共 ${results.length}</span>`;

  resultsDiv.innerHTML = results.map((r, i) => {
    if (r.status === 'ok') {
      return `<div class="convert-file-item">
        <span style="color:var(--green)">✅</span>
        <span class="cf-name">${r.name}</span>
        <button class="btn-download" onclick="downloadPdf('${escapeJs(r.pdf_url)}', '${escapeJs(r.name.replace('.docx','.pdf'))}')">⬇ 下载 PDF</button>
      </div>`;
    } else {
      return `<div class="convert-file-item">
        <span style="color:var(--red)">❌</span>
        <span class="cf-name">${r.name}</span>
        <span class="cf-status" style="color:var(--red)">${r.msg}</span>
      </div>`;
    }
  }).join('');

  btnAll.disabled = okCount === 0;
  if (okCount > 0) {
    btnAll.setAttribute('data-paths', okPaths.join(','));
  }
  startBtn.disabled = false;
  startBtn.textContent = '⚡ 开始转换';
}

function downloadPdf(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function downloadAllZip() {
  const btn = document.getElementById('btn-download-all');
  const paths = btn.getAttribute('data-paths') || '';
  if (!paths) return;
  const url = API + '/api/download-zip?paths=' + encodeURIComponent(paths);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'converted_pdfs.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ==================== 截止日期编辑 ====================
async function editDueDate(assignId) {
  if (!assignId) return;
  const a = (dashboardData?.assignments || []).find(x => x.id === assignId);
  if (!a) return;
  const newDue = prompt(`"${a.name}" 截止日期 (YYYY-MM-DD，留空清除):`, a.due || '');
  if (newDue === null) return; // 取消
  if (newDue.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(newDue.trim())) {
    alert('日期格式错误，请使用 YYYY-MM-DD 格式');
    return;
  }
  const notes = prompt('备注 (可选):', a.notes || '');
  if (notes === null) return;
  const cfg = await apiGet('/api/config');
  const target = (cfg.assignments || []).find(x => x.id === assignId);
  if (target) {
    target.due = newDue.trim();
    target.notes = notes.trim();
    await apiPost('/api/config/save', cfg);
    dashboardCache = {};
    await refreshDashboard();
    if (currentTab === 'assignments') refreshAssignments();
  }
}

async function editSubjectDue(subjectGroup) {
  const items = (dashboardData?.assignments || []).filter(x => x.subject_group === subjectGroup);
  const firstDue = items.find(x => x.due)?.due || '';
  const newDue = prompt(`"${subjectGroup}" 截止日期 (YYYY-MM-DD，留空清除，应用到全部 ${items.length} 次实验):`, firstDue);
  if (newDue === null) return;
  const notes = prompt('备注 (可选，同样应用到全部实验):', items.find(x => x.notes)?.notes || '');
  if (notes === null) return;
  
  const cfg = await apiGet('/api/config');
  for (const t of (cfg.assignments || [])) {
    if (t.subject_group === subjectGroup) {
      t.due = newDue.trim();
      t.notes = notes.trim();
    }
  }
  await apiPost('/api/config/save', cfg);
  dashboardCache = {};
  if (currentTab === 'assignments') refreshAssignments();
  await refreshDashboard();
}

function renderDueBigBoard(assignments) {
  // 按科目汇总，只显示有截止日期且未全部完成的
  const groups = {};
  for (const a of assignments) {
    if (a.completed || !a.due) continue;
    const sg = a.subject_group || '其他';
    if (!groups[sg]) groups[sg] = { name: sg, due: a.due, notes: a.notes || '', total: 0, done: 0 };
    groups[sg].total++;
    // 取最早的日期作为展示
    if (a.due < groups[sg].due) { groups[sg].due = a.due; groups[sg].notes = a.notes || groups[sg].notes; }
  }
  
  const entries = Object.values(groups).filter(g => g.total > 0);
  const board = document.getElementById('due-big-board');
  if (entries.length === 0) {
    board.style.display = 'none';
    return;
  }
  board.style.display = 'block';
  
  document.getElementById('due-big-list').innerHTML = entries.map(g => {
    const parts = g.due.split('-');
    const dueDate = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
    const now = new Date(); now.setHours(0,0,0,0);
    const delta = Math.round((dueDate - now) / 86400000);
    let cls = 'ok', dayText = `还剩${delta}天`;
    if (delta < 0) { cls = 'overdue'; dayText = `超期${Math.abs(delta)}天`; }
    else if (delta === 0) { cls = 'overdue'; dayText = '今天截止！'; }
    else if (delta <= 2) { cls = 'urgent'; dayText = `仅剩${delta}天`; }
    
    const dateStr = dueDate.toLocaleDateString('zh-CN', { month:'short', day:'numeric' });
    return `
      <div class="due-big-card ${cls}">
        <div class="due-subject">${g.name}</div>
        <div class="due-days" style="color:var(--${cls==='overdue'?'red':cls==='urgent'?'red':cls==='soon'?'yellow':'green'})">${dayText}</div>
        <div class="due-date">${dateStr}</div>
        ${g.notes ? `<div class="due-notes">${g.notes}</div>` : ''}
      </div>
    `;
  }).join('');
}

function countdownHtml(due, notes, assignId) {
  if (!due) return notes ? `<span class="due-badge ok">${notes}</span>` : '';
  try {
    const parts = due.split('-');
    if (parts.length < 3) return '';
    const d = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
    if (isNaN(d.getTime())) return '';
    const now = new Date(); now.setHours(0,0,0,0);
    const delta = Math.round((d - now) / 86400000);
    let cls = 'ok', text = '';
    if (delta < 0) { cls = 'overdue'; text = `已超期${Math.abs(delta)}天`; }
    else if (delta === 0) { cls = 'overdue'; text = '今天截止'; }
    else if (delta <= 2) { cls = 'soon'; text = `还剩${delta}天`; }
    else { cls = 'ok'; text = `还剩${delta}天`; }
    const clickHandler = assignId ? `onclick="event.stopPropagation();editDueDate('${assignId}')"` : '';
    let html = `<span class="due-badge ${cls}" ${clickHandler} title="点击编辑截止时间">${text}</span>`;
    if (notes) html += ` <span class="due-badge ok" style="cursor:default">${notes}</span>`;
    return html;
  } catch(e) { return ''; }
}

async function renderDueSettings() {
  const list = await apiGet('/api/assignments');
  if (!list || list.length === 0) {
    document.getElementById('due-settings-list').innerHTML = '<span style="color:var(--text-secondary);font-size:13px">暂未检测到作业</span>';
    return;
  }
  // 按科目分组，每个科目取第一个的 due/notes
  const groups = {};
  for (const a of list) {
    const sg = a.subject_group || '其他';
    if (!groups[sg]) groups[sg] = { name: sg, due: a.due || '', notes: a.notes || '', count: 0 };
    groups[sg].count++;
    if (!groups[sg].due) groups[sg].due = a.due || '';
    if (!groups[sg].notes) groups[sg].notes = a.notes || '';
  }
  document.getElementById('due-settings-list').innerHTML = Object.entries(groups).map(([name, g], i) => `
    <div class="due-card" style="animation-delay:${0.05 + i*0.06}s">
      <span class="due-subject-name">${g.name}</span>
      <span class="due-count">${g.count}次</span>
      <input type="date" id="due-${name}" value="${g.due}">
      <input type="text" id="notes-${name}" value="${g.notes.replace(/"/g,'&quot;')}" placeholder="备注…">
    </div>
  `).join('');
}

async function saveAllDue() {
  const list = await apiGet('/api/assignments');
  const cfg = await apiGet('/api/config');
  const groups = {};
  for (const a of list) { groups[a.subject_group || '其他'] = true; }
  
  for (const sg of Object.keys(groups)) {
    const dueEl = document.getElementById('due-' + sg);
    const notesEl = document.getElementById('notes-' + sg);
    if (!dueEl) continue;
    const due = dueEl.value;
    const notes = notesEl ? notesEl.value : '';
    for (const t of (cfg.assignments || [])) {
      if (t.subject_group === sg) {
        t.due = due;
        t.notes = notes;
      }
    }
  }
  await apiPost('/api/config/save', cfg);
  dashboardCache = {};
  await refreshDashboard();
  if (currentTab === 'assignments') refreshAssignments();
  alert('截止日期已保存！');
}

// ==================== System Update ====================
let latestGithubUpdate = null;
async function checkGithubUpdate() {
  const result = document.getElementById('github-update-result');
  const button = document.getElementById('github-update-download');
  if (button) button.disabled = true;
  if (result) result.textContent = '正在查询 GitHub Releases...';
  try {
    const resp = await fetch('/api/update/check', { cache: 'no-store' });
    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(data.msg || '检查更新失败');
    latestGithubUpdate = data;
    if (data.has_update) {
      if (button) button.disabled = false;
      if (result) result.textContent = `当前 v${data.current_version}，最新 v${data.latest_version}：${data.asset.name}`;
    } else if (result) {
      result.textContent = `当前已是最新版本 v${data.current_version}。`;
    }
  } catch (e) {
    if (result) result.textContent = e.message;
    showToast('检查更新失败：' + e.message, 'error');
  }
}

async function downloadGithubUpdate() {
  const info = latestGithubUpdate;
  if (!info?.has_update || !info.asset?.download_url) return showToast('请先检查更新', 'info');
  const result = document.getElementById('github-update-result');
  if (!confirm(`发现 v${info.latest_version}，确定下载并加载更新包吗？\n\n${info.asset.name}`)) return;
  try {
    if (result) result.textContent = '正在下载 GitHub 更新包...';
    const resp = await fetch(info.asset.download_url);
    if (!resp.ok) throw new Error(`下载失败（HTTP ${resp.status}）`);
    const blob = await resp.blob();
    await handleUpdateFile(new File([blob], info.asset.name, { type: 'application/zip' }));
  } catch (e) {
    if (result) result.textContent = `${e.message}。可打开 Release 页面手动下载。`;
    if (info.release_url) window.open(info.release_url, '_blank', 'noopener');
  }
}

function setupUpdateDropZone() {
  const dropZone = document.getElementById('update-drop-zone');
  if (!dropZone) return;
  
  ['dragenter', 'dragover'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.style.borderColor = 'var(--primary)';
      dropZone.style.background = 'rgba(99,102,241,0.1)';
    });
  });
  
  ['dragleave', 'drop'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.style.borderColor = '#3a3d50';
      dropZone.style.background = 'var(--bg)';
    });
  });
  
  dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleUpdateFile(files[0]);
    }
  });
}

function handleUpdateFileSelect(event) {
  const file = event.target.files[0];
  if (file) handleUpdateFile(file);
}

async function handleUpdateFile(file) {
  if (!file.name.endsWith('.zip')) {
    showUpdateResult(false, '请上传 .zip 格式的更新包');
    return;
  }
  
  const progressDiv = document.getElementById('update-progress');
  const statusText = document.getElementById('update-status-text');
  const progressBar = document.getElementById('update-progress-bar');
  const resultDiv = document.getElementById('update-result');
  
  progressDiv.classList.remove('hidden');
  resultDiv.classList.add('hidden');
  resultDiv.className = 'hidden';
  
  // 模拟进度
  statusText.textContent = '正在上传更新包...';
  progressBar.style.width = '20%';
  
  const formData = new FormData();
  formData.append('update_zip', file);
  
  try {
    statusText.textContent = '正在校验更新包...';
    progressBar.style.width = '40%';
    
    const resp = await fetch('/api/update', {
      method: 'POST',
      body: formData,
    });
    
    const data = await resp.json();
    
    if (data.ok) {
      statusText.textContent = '更新成功！服务即将重启...';
      progressBar.style.width = '100%';
      progressBar.style.background = 'var(--green)';
      showUpdateResult(true, data.msg || '更新成功');
      
      // 显示更新日志弹窗
      if (data.changelog) {
        showChangelogModal(data.changelog);
      }
      
      // 提示本次更新包含公告
      if (data.has_announcement) {
        showToast('📢 本次更新包含公告，刷新浏览器后将自动展示', 'info');
      }
      
      // 自动刷新页面
      let countdown = 5;
      const countdownEl = document.getElementById('update-status-text');
      const timer = setInterval(() => {
        countdown--;
        if (countdownEl) countdownEl.textContent = `更新成功！${countdown} 秒后自动重连...`;
        if (countdown <= 0) {
          clearInterval(timer);
          location.reload();
        }
      }, 1000);
      
      // 轮询检测服务恢复
      let retries = 0;
      const healthCheck = setInterval(async () => {
        try {
          const resp = await fetch('/api/health');
          if (resp.ok) {
            clearInterval(healthCheck);
            clearInterval(timer);
            location.reload();
          }
        } catch(e) {
          retries++;
          if (retries > 30) clearInterval(healthCheck);
        }
      }, 2000);
      
    } else {
      statusText.textContent = '更新失败';
      progressBar.style.background = 'var(--red)';
      showUpdateResult(false, data.msg || '未知错误');
    }
  } catch (e) {
    statusText.textContent = '更新失败';
    progressBar.style.background = 'var(--red)';
    showUpdateResult(false, '网络错误: ' + e.message);
  }
}

function showUpdateResult(success, msg) {
  const resultDiv = document.getElementById('update-result');
  resultDiv.classList.remove('hidden');
  resultDiv.className = success ? 'update-success' : 'update-error';
  resultDiv.style.background = success ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)';
  resultDiv.style.color = success ? 'var(--green)' : 'var(--red)';
  resultDiv.style.border = '1px solid ' + (success ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)');
  resultDiv.innerHTML = (success ? '✅ ' : '❌ ') + msg;
}

function showChangelogModal(markdown) {
  // 创建更新日志弹窗
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  
  const modal = document.createElement('div');
  modal.style.cssText = 'background:var(--card-bg);border:1px solid var(--border);border-radius:16px;padding:24px;max-width:560px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.5)';
  modal.onclick = (e) => e.stopPropagation();
  
  // 简单 Markdown 渲染
  let html = escapeHtml(markdown)
    .replace(/^### (.+)$/gm, '<h4 style="color:var(--text-primary);margin:12px 0 6px;font-size:15px">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="color:var(--primary);margin:16px 0 8px;font-size:17px">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 style="color:var(--primary);margin:0 0 12px;font-size:20px">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n- (.+)/g, '\n<li style="margin:4px 0;color:var(--text-secondary);font-size:13px">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul style="list-style:none;padding-left:0;margin:6px 0">$&</ul>')
    .replace(/---/g, '<hr style="border:none;border-top:1px solid var(--border);margin:12px 0">')
    .replace(/\n/g, '<br>');
  
  modal.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:28px">🎉</span>
        <h2 style="margin:0;font-size:18px;color:var(--text-primary)">更新完成！</h2>
      </div>
      <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;color:var(--text-secondary);font-size:20px;cursor:pointer">&times;</button>
    </div>
    <div style="font-size:13px;line-height:1.8;color:var(--text-secondary)">${html}</div>
    <div style="margin-top:20px;display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()" style="font-size:13px">知道了</button>
    </div>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

// ==================== Announcement Popup ====================
async function loadAndShowAnnouncements() {
  try {
    const data = await apiGet('/api/announcements');
    if (!data.ok || !data.announcements || data.announcements.length === 0) return;

    const currentVersion = data.version || '0.0.0';
    const dismissedVersion = localStorage.getItem('ann_dismissed_version') || '0.0.0';

    // 版本相同且已关闭过 → 不弹窗
    if (currentVersion === dismissedVersion && dismissedVersion !== '0.0.0') return;

    showAnnouncementModal(data.announcements, currentVersion);
  } catch (e) {
    console.error('加载公告失败:', e);
  }
}

function showAnnouncementModal(announcements, version, previewMode = false) {
  // 移除已有弹窗
  const existing = document.querySelector('.ann-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'ann-modal-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) closeAnnModal(); };

  const modal = document.createElement('div');
  modal.className = 'ann-modal';
  modal.onclick = (e) => e.stopPropagation();

  const itemsHtml = announcements.map((ann, i) => {
    const tagLabel = typeLabel(ann.type);
    const tagCls = 'ann-tag-' + (ann.type || 'notice');
    const contentHtml = simpleMarkdown(ann.content || '');
    return `
      <div class="ann-modal-item">
        <span class="ann-modal-tag ${tagCls}">${escapeHtml(tagLabel)}</span>
        <div class="ann-modal-title">${escapeHtml(ann.title)}</div>
        <div class="ann-modal-meta">v${escapeHtml(ann.version || '1.0.0')} · ${formatTime(ann.timestamp)} · ${escapeHtml(ann.author || '系统')}</div>
        <div class="ann-modal-content">${contentHtml}</div>
      </div>`;
  }).join('');

  modal.innerHTML = `
    <div class="ann-modal-header">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:24px">📢</span>
        <h2 style="margin:0;font-size:18px;color:var(--text)">系统公告</h2>
      </div>
      <button onclick="closeAnnModal()" style="background:none;border:none;color:var(--text-secondary);font-size:20px;cursor:pointer;line-height:1">&times;</button>
    </div>
    <div class="ann-modal-body">${itemsHtml}</div>
    <div class="ann-modal-footer">
      ${previewMode ? '<span style="font-size:12px;color:var(--text-secondary)">预览模式，不会影响用户公告状态</span>' : `<label class="dismiss-label" id="ann-dismiss-label">
        <input type="checkbox" id="ann-dismiss-check" onchange="updateAnnDismiss()">
        本次更新后不再弹出此版本公告
      </label>`}
      <button class="btn btn-primary" onclick="closeAnnModal()" style="font-size:13px">我知道了</button>
    </div>
  `;

  // 暴露版本号供 closeAnnModal 使用
  modal._annVersion = version;
  modal._annPreviewMode = previewMode;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

function closeAnnModal() {
  const overlay = document.querySelector('.ann-modal-overlay');
  if (!overlay) return;

  const modal = overlay.querySelector('.ann-modal');
  const version = modal ? modal._annVersion : '0.0.0';
  const previewMode = modal ? modal._annPreviewMode : false;
  const checked = document.getElementById('ann-dismiss-check')?.checked || false;

  if (checked && !previewMode) {
    localStorage.setItem('ann_dismissed_version', version);
  }

  overlay.remove();
}

function updateAnnDismiss() {
  // 复选框状态变更，无需额外操作，closeAnnModal 会读取
}

async function loadChangelog() {
  const preview = document.getElementById('update-changelog-preview');
  if (!preview) return;
  try {
    const data = await apiGet('/api/changelog');
    if (data.ok && data.content) {
      // 只显示最新版本（第一个 ## 之间的内容）
      const match = data.content.match(/## (.+?)(?=\n## |$)/s);
      if (match) {
        const lines = match[0].split('\n').filter(l => l.trim() && !l.startsWith('##'));
        preview.innerHTML = lines.map(l => {
          const safe = escapeHtml(l);
          if (l.trim().startsWith('###')) return '<div style="color:var(--text-primary);font-weight:600;margin-top:6px">' + escapeHtml(l.replace('###','').trim()) + '</div>';
          if (l.trim().startsWith('-')) return '<div style="padding-left:10px">' + safe + '</div>';
          return '<div>' + safe + '</div>';
        }).join('');
      } else {
        preview.innerHTML = '<span style="color:var(--text-tertiary)">暂无更新日志</span>';
      }
    }
  } catch(e) {
    preview.innerHTML = '<span style="color:var(--red)">加载失败</span>';
  }
}

// 初始化更新拖拽区
setupUpdateDropZone();
// 初始加载更新日志预览
loadChangelog();

// ==================== Tutorial Guide ====================
const TUTORIAL_STEPS = [
  {
    target: '#header-bar',
    title: '📊 监控状态栏',
    desc: '这里显示文件监控的运行状态。绿色表示正在监控，可以随时点击刷新按钮手动扫描。',
    position: 'bottom',
  },
  {
    target: '#tab-dashboard',
    title: '📈 仪表盘',
    desc: '仪表盘展示作业提交的统计概览：提交率、截止倒计时、每位学生的提交状态卡片。点击学生卡片可查看详情。',
    position: 'bottom',
  },
  {
    target: '#tab-assignments',
    title: '📋 作业列表',
    desc: '这里按科目分组展示所有作业。可以查看每个科目的提交情况、设置截止日期，还能一键打包下载作业文件。',
    position: 'bottom',
  },
  {
    target: '#tab-manage',
    title: '⚙️ 管理面板',
    desc: '管理面板用于添加学生、设置扫描目录、公示文件夹、截止日期和系统更新。新用户建议先添加学生名单，再确认扫描目录和公示文件夹路径。',
    position: 'bottom',
  },
  {
    target: '#preview-panel',
    title: '👁️ 预览面板',
    desc: '点击任意文件即可在右侧预览面板查看内容。支持 .docx、.pdf 等格式，双击文件名可直接打开原始文件。',
    position: 'left',
  },
];

let tutorialStep = 0;
let tutorialActive = false;

function startTutorial() {
  if (tutorialActive) return;
  if (localStorage.getItem('tutorial_completed') === 'true') return;
  
  tutorialActive = true;
  tutorialStep = 0;
  showTutorialStep(true);
}

function showTutorialStep(isFirst = false) {
  const oldHighlights = document.querySelectorAll('.tutorial-highlight');
  const oldBubbles = document.querySelectorAll('.tutorial-bubble');
  
  if (tutorialStep >= TUTORIAL_STEPS.length) {
    // 完成动画：所有元素淡出
    oldHighlights.forEach(el => {
      el.style.transition = 'opacity 0.35s ease-out, transform 0.35s ease-out';
      el.classList.remove('visible');
    });
    oldBubbles.forEach(el => {
      el.classList.add('removing');
    });
    setTimeout(() => {
      oldHighlights.forEach(el => el.remove());
      oldBubbles.forEach(el => el.remove());
      finishTutorial();
    }, 250);
    return;
  }
  
  const step = TUTORIAL_STEPS[tutorialStep];
  const target = document.querySelector(step.target);
  
  if (!target) {
    tutorialStep++;
    showTutorialStep();
    return;
  }
  
  // 确保目标标签页可见
  if (step.target === '#tab-manage') switchTab('manage');
  else if (step.target === '#tab-assignments') switchTab('assignments');
  else if (step.target === '#tab-dashboard') switchTab('dashboard');
  
  // 切换步骤时先移除旧元素（带动画）
  if (!isFirst && (oldHighlights.length || oldBubbles.length)) {
    oldHighlights.forEach(el => {
      el.style.transition = 'opacity 0.2s ease-in, transform 0.2s ease-in';
      el.classList.remove('visible');
    });
    oldBubbles.forEach(el => {
      el.classList.add('removing');
    });
    setTimeout(() => {
      oldHighlights.forEach(el => el.remove());
      oldBubbles.forEach(el => el.remove());
      renderTutorialStep(step, target);
    }, 220);
  } else {
    oldHighlights.forEach(el => el.remove());
    oldBubbles.forEach(el => el.remove());
    renderTutorialStep(step, target);
  }
}

function renderTutorialStep(step, target) {
  // 等待标签页切换完成
  setTimeout(() => {
    const rect = target.getBoundingClientRect();
    
    // 创建高亮框
    const highlight = document.createElement('div');
    highlight.className = 'tutorial-highlight';
    highlight.style.cssText = `
      left: ${rect.left - 6}px; top: ${rect.top - 6}px;
      width: ${rect.width + 12}px; height: ${rect.height + 12}px;
    `;
    // 保存目标元素引用，用于滚动时重新定位
    highlight._tutorialTarget = target;
    document.body.appendChild(highlight);
    
    // 注册滚动监听，实实更新高亮框位置
    if (!window._tutorialScrollBound) {
      window._tutorialScrollBound = true;
      window.addEventListener('scroll', repositionAllHighlights, { passive: true });
    }
    
    // 触发入场动画
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        highlight.classList.add('visible');
      });
    });
    
    // 创建气泡
    const bubble = document.createElement('div');
    bubble.className = 'tutorial-bubble';
    
    const stepsDots = TUTORIAL_STEPS.map((_, i) => {
      let cls = 'step-dot';
      if (i < tutorialStep) cls += ' done';
      else if (i === tutorialStep) cls += ' active';
      return `<span class="${cls}"></span>`;
    }).join('');
    
    bubble.innerHTML = `
      <span class="tutorial-counter">${tutorialStep + 1}</span>
      <div class="tutorial-steps">${stepsDots} <span style="margin-left:6px">步骤 ${tutorialStep + 1}/${TUTORIAL_STEPS.length}</span></div>
      <h4>${step.title}</h4>
      <p>${step.desc}</p>
      <div class="tutorial-actions">
        <div class="left-actions">
          <button class="btn btn-ghost" onclick="skipTutorial()" style="font-size:12px">跳过教程</button>
        </div>
        <div class="right-actions">
          ${tutorialStep > 0 ? '<button class="btn btn-ghost" onclick="prevTutorialStep()" style="font-size:12px">← 上一步</button>' : ''}
          <button class="btn btn-primary" onclick="nextTutorialStep()" style="font-size:12px">${tutorialStep < TUTORIAL_STEPS.length - 1 ? '下一步 →' : '完成 ✅'}</button>
        </div>
      </div>
    `;
    
    // 智能定位气泡
    const bubbleW = 360;
    const bubbleH = 220;
    let bLeft = rect.left + rect.width/2 - bubbleW/2;
    let bTop = rect.bottom + 16;
    
    if (step.position === 'left') {
      bLeft = Math.max(12, rect.left - bubbleW - 16);
      bTop = Math.max(12, rect.top + rect.height/2 - bubbleH/2);
    } else if (step.position === 'bottom') {
      // 检查下方空间
      if (bTop + bubbleH > window.innerHeight - 16) {
        bTop = rect.top - bubbleH - 16;
      }
      // 检查右边界
      if (bLeft + bubbleW > window.innerWidth - 12) {
        bLeft = window.innerWidth - bubbleW - 12;
      }
      // 检查左边界
      bLeft = Math.max(12, bLeft);
    }
    
    bubble.style.left = bLeft + 'px';
    bubble.style.top = bTop + 'px';
    document.body.appendChild(bubble);
    
    // 触发入场动画（延迟一点让气泡先渲染）
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bubble.classList.add('visible');
      });
    });
  }, 80);
}

function nextTutorialStep() {
  tutorialStep++;
  showTutorialStep();
}

function prevTutorialStep() {
  tutorialStep = Math.max(0, tutorialStep - 1);
  showTutorialStep();
}

function repositionAllHighlights() {
  if (!tutorialActive) return;
  requestAnimationFrame(() => {
    document.querySelectorAll('.tutorial-highlight').forEach(highlight => {
      const target = highlight._tutorialTarget;
      if (!target || !document.contains(target)) return;
      const rect = target.getBoundingClientRect();
      highlight.style.left = (rect.left - 6) + 'px';
      highlight.style.top = (rect.top - 6) + 'px';
      highlight.style.width = (rect.width + 12) + 'px';
      highlight.style.height = (rect.height + 12) + 'px';
    });
  });
}

function skipTutorial() {
  const highlights = document.querySelectorAll('.tutorial-highlight');
  const bubbles = document.querySelectorAll('.tutorial-bubble');
  highlights.forEach(el => {
    el.style.transition = 'opacity 0.2s ease-in, transform 0.2s ease-in';
    el.classList.remove('visible');
  });
  bubbles.forEach(el => el.classList.add('removing'));
  setTimeout(() => {
    highlights.forEach(el => el.remove());
    bubbles.forEach(el => el.remove());
    finishTutorial();
  }, 220);
}

function finishTutorial() {
  tutorialActive = false;
  // 移除滚动监听
  window.removeEventListener('scroll', repositionAllHighlights);
  window._tutorialScrollBound = false;
  document.querySelectorAll('.tutorial-highlight, .tutorial-bubble').forEach(el => el.remove());
  localStorage.setItem('tutorial_completed', 'true');
}

function resetTutorial() {
  localStorage.removeItem('tutorial_completed');
  tutorialStep = 0;
  tutorialActive = false;
  startTutorial();
}

// 在管理面板添加"重新观看教程"按钮
function addTutorialResetButton() {
  const manageTab = document.getElementById('tab-manage');
  if (!manageTab) return;
  // 在管理面板顶部添加
  const firstCard = manageTab.querySelector('.mgmt-card');
  if (!firstCard) return;
  // 避免重复添加
  if (document.getElementById('tutorial-reset-btn')) return;
  
  const btnRow = document.createElement('div');
  btnRow.id = 'tutorial-reset-btn';
  btnRow.style.cssText = 'margin-bottom:12px;display:flex;align-items:center;gap:8px';
  btnRow.innerHTML = `
    <button class="btn btn-ghost" onclick="resetTutorial()" style="font-size:12px">🎓 重新观看新手教程</button>
  `;
  firstCard.parentNode.insertBefore(btnRow, firstCard);
}

// ==================== Help Center ====================
const FAQ_DATA = [
  { category: '新手流程', q: '第一次安装后应该按什么顺序配置？', a: '建议按这个顺序来：\n1. 打开管理面板，先导入学生名单。\n2. 检查扫描目录，确认同学新发来的文件会落到这些目录里。\n3. 设置公示文件夹，用来集中展示和回填实验/作业文件。\n4. 检查文件类型和识别关键词，确保常用的 .docx、.pdf、.zip 等已启用。\n5. 回到仪表盘，点击「立即扫描」确认能识别文件。\n6. 如果给别人更新系统，用管理员模式的一键生成更新包。' },
  { category: '新手流程', q: '同学提交文件名有什么建议？', a: '建议统一要求文件名包含姓名、作业关键词和作业批次，例如：\n张三_第一次课程报告.docx\n李四_项目一作业.pdf\n王五_数字电子技术实验报告.docx\n系统主要靠文件名识别学生、科目和作业批次；文件名越规范，手动处理越少。' },
  { category: '新手流程', q: '新电脑上最容易漏掉什么？', a: '常见漏项有三类：\n1. 微信没有开启文件自动下载，文件消息看得到但本地目录没有文件。\n2. 安装时添加的扫描目录不是实际下载目录。\n3. 文件名没有包含「作业」「报告」「实验」等识别关键词。\n遇到问题先看管理面板里的监控目录/扫描目录是否存在，再点一次「立即扫描」。' },
  { category: '基础使用', q: '如何开始使用这个系统？', a: '首先在管理面板中添加学生名单（姓名必填，学号和拼音可选）。然后确认微信 PC 端开启了文件自动下载，系统会自动监控收到的作业文件并匹配学生。\n如果你还设置了额外扫描目录，新版本会把这些目录也纳入实时监听。' },
  { category: '基础使用', q: '仪表盘数据不更新怎么办？', a: '先点击顶部的「🔄 立即扫描」按钮手动触发扫描。\n如果仍然没有数据，依次检查：\n1. 启动窗口里的「监控目录」是否包含实际文件所在目录。\n2. 目录后面是否提示不存在。\n3. 文件名是否包含识别关键词。\n4. 文件扩展名是否在已启用文件类型中。\n5. 微信是否真的把文件下载到了本地。' },
  { category: '基础使用', q: '如何切换查看不同科目？', a: '在仪表盘页面，点击顶部的科目标签即可切换查看不同科目的提交情况。每个科目独立统计。' },
  { category: '学生管理', q: '如何批量导入学生名单？', a: '在管理面板的「批量导入」卡片中，每行输入一个学生，格式为"姓名,学号,拼音"。例如：张三,2024001,zhangsan。输入后点击导入按钮。' },
  { category: '学生管理', q: '学生姓名匹配不准确怎么办？', a: '系统通过文件名匹配学生。建议让学生提交文件时在文件名中包含自己的姓名或学号。也可以在管理面板中为每个学生添加拼音字段辅助匹配。' },
  { category: '作业设置', q: '如何设置作业截止日期？', a: '在管理面板的「截止日期设置」卡片中，为每个科目设置统一的截止日期。仪表盘会自动显示距离截止日期的倒计时。' },
  { category: '作业设置', q: '如何添加新的作业科目？', a: '在作业列表页面，点击「+ 添加作业」按钮。填写作业名称、科目、关键词等信息。系统也会自动从作业目录检测新的科目和作业。' },
  { category: '文件归类', q: '文件是如何自动归类的？', a: '系统根据文件名中的科目关键词（如"课程报告""项目作业"，也可以是"数字电子技术"等具体课程）和作业批次（如"第一次""项目一"）自动归类文件到对应目录。目录结构为：已收作业/科目/作业批次/学生姓名/。' },
  { category: '文件归类', q: '未匹配的文件怎么处理？', a: '未匹配到学生或作业的文件会显示在仪表盘底部的「未归类文件」列表中。你可以手动将其分配给对应学生，或点击忽略按钮跳过该文件。' },
  { category: '公示文件夹', q: '公示文件夹是什么？', a: '公示文件夹是一个给课程集中查看和补录文件的目录，通常放在桌面课程文件夹下，例如：桌面/课程班级/公示文件夹。\n系统会把已识别的学生文件同步一份到公示文件夹，方便你按科目和作业批次查看；同时也可以从公示文件夹回填历史文件到「已收作业」。' },
  { category: '公示文件夹', q: '公示文件夹和已收作业有什么区别？', a: '已收作业是系统内部整理目录，结构更细：科目/作业批次/学生姓名/文件。\n公示文件夹是对外查看和补录用的目录，结构更平铺：科目/作业批次/学生_文件。\n简单说：已收作业用于系统管理，公示文件夹用于课程展示和历史回填。' },
  { category: '公示文件夹', q: '什么时候需要点“从公示目录回填已收作业”？', a: '这些情况适合回填：\n1. 你手动把历史作业文件放进了公示文件夹。\n2. 旧版本已经有公示目录文件，但 submissions 记录不完整。\n3. 换电脑或重装后，需要让仪表盘重新认识公示目录中的文件。\n回填会扫描公示文件夹，尝试按文件名和目录结构匹配学生、科目和作业批次。' },
  { category: '公示文件夹', q: '公示文件夹回填会不会生成重复文件？', a: '新版已经修复公示目录自我复制问题：从公示文件夹回填时，不会再把公示目录里的文件复制回公示目录。\n如果目录里已经有类似「张三_张三_文件.docx」这样的重复前缀文件，回填会把它和「张三_文件.docx」识别为同一份文件，并清理可判定的重复项。\n重要提醒：如果你担心误删，先备份公示文件夹，再执行回填。' },
  { category: '公示文件夹', q: '公示文件夹应该怎么整理文件名？', a: '推荐格式是：学生姓名_科目_作业批次_说明，例如：\n张三_课程报告_第一次.docx\n李四_项目作业_项目一.pdf\n王五_数字电子技术_实验报告.docx\n不要手动反复加学生名前缀，例如「张三_张三_张三_报告.docx」。新版会尝试折叠重复前缀，但规范命名最稳。' },
  { category: '公示文件夹', q: '公示文件夹里同时有 docx 和 pdf 算重复吗？', a: '不一定。docx 和 pdf 通常是不同格式，系统会按文件名和扩展名分别处理。\n如果是同一份内容的 Word 和 PDF，建议保留你实际要公示或归档的版本；如果两个都需要留，就让文件名能区分用途，例如「原稿」和「导出版」。' },
  { category: '打包下载', q: '如何打包下载某个科目的所有作业？', a: '在作业列表页面，每个科目卡片右上角有「📦 打包」按钮。点击即可将当前科目所有已提交文件按科目/实验/学生结构打包为 ZIP 下载。' },
  { category: '系统更新', q: '如何更新系统到最新版本？', a: '在管理面板的「系统更新」卡片中，拖拽或点击上传 .zip 更新包。系统会自动备份当前版本、解压替换文件并重启服务。更新完成后会显示更新日志。\n如果更新包里包含公告，刷新浏览器后会自动展示公告。' },
  { category: '系统更新', q: '管理员如何生成更新包？', a: '进入管理员模式，在更新包区域填写版本号。\n如果本次要带公告或更新日志，先在公告管理里添加到公告列表，再点击生成更新包。\n生成的 zip 可以发给别人，对方拖到系统更新区域即可更新。' },
  { category: '常见问题', q: '如何让手机访问仪表盘？', a: '在管理面板开启“允许局域网访问”，确认后服务会自动重启。把显示的局域网地址和访问口令输入手机，手机和电脑必须处于同一个可信 Wi-Fi。不要把端口映射到公网。' },
  { category: '系统更新', q: '更新失败怎么办？', a: '系统会在更新前自动创建备份（保存在 backups/ 目录）。如果更新失败会自动回滚。\n如果浏览器没有自动恢复，先关闭启动窗口，再重新运行「启动作业追踪器.bat」。必要时可从 backups/ 目录手动恢复。' },
  { category: '主题与现代版', q: '现代版入口在哪里？', a: '新版现代前端入口是 /modern。旧版管理面板里的「现代版与主题」卡片也提供打开入口。\n当前阶段 /dashboard 仍是稳定旧版，/modern 用于试用和逐步补齐功能。' },
  { category: '主题与现代版', q: '主题保存后会影响哪些地方？', a: '主题配置保存在 data/config.json 的 ui_theme 字段中。现代版会完整读取主题预设并应用到页面颜色。\n旧版暂时只提供主题入口和预设保存，不大范围重绘旧界面，避免影响稳定使用。' },
  { category: '主题与现代版', q: '更新包会带上现代版文件吗？', a: '新版更新包会包含 dashboard_modern.html，因此对方更新后可以直接打开 /modern。\n主题是否随更新包发布会在后续管理员发布流程里继续完善；当前 MVP 已提供主题 API 和保存能力。' },
  { category: '常见问题', q: '为什么有些文件没有被检测到？', a: '系统只识别文件名中包含关键词（如"作业""报告""实验"等）的已启用文件类型。\n排查顺序：\n1. 文件是否真的在监控目录或扫描目录中。\n2. 文件类型是否已启用。\n3. 文件名是否包含关键词。\n4. 文件是否刚下载完成，临时文件会被跳过。\n5. 该文件是否已经被 watcher_state 记录为已知文件。' },
  { category: '常见问题', q: '如何修改班级名称和文件夹路径？', a: '班级名称和路径存储在 data/config.json 中。可以编辑 class_name 和 class_folder 字段来修改。修改后重启服务即可生效。' },
];

function renderHelpCenter() {
  const container = document.getElementById('help-center-content');
  if (!container) return;
  
  const categories = [...new Set(FAQ_DATA.map(f => f.category))];
  let html = `
    <div style="margin-bottom:12px">
      <input type="text" id="faq-search" placeholder="🔍 搜索常见问题..." 
        style="width:100%;padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:13px;box-sizing:border-box"
        oninput="filterFAQ()">
    </div>
    <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap" id="faq-categories">
      <button class="btn btn-ghost btn-sm faq-cat-btn active" onclick="filterFAQ('')" style="font-size:11px;padding:3px 8px">全部</button>
  `;
  categories.forEach(cat => {
    html += `<button class="btn btn-ghost btn-sm faq-cat-btn" onclick="filterFAQ('${escapeHtml(cat)}')" style="font-size:11px;padding:3px 8px">${cat}</button>`;
  });
  html += '</div><div id="faq-list" style="max-height:400px;overflow-y:auto">';
  
  FAQ_DATA.forEach((faq, i) => {
    html += `
      <div class="faq-item" data-category="${faq.category}" style="border-bottom:1px solid var(--border);padding:8px 0">
        <div class="faq-q" onclick="this.parentElement.classList.toggle('faq-expanded')" 
          style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;font-size:13px;color:var(--text-primary);padding:4px 0">
          <span>❓ ${faq.q}</span>
          <span style="font-size:10px;color:var(--text-tertiary)">▾</span>
        </div>
        <div class="faq-a" style="display:none;font-size:12px;color:var(--text-secondary);line-height:1.7;padding:4px 0 4px 16px;white-space:pre-line">
          ${faq.a}
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
}

function filterFAQ(category) {
  // 更新分类按钮状态
  document.querySelectorAll('.faq-cat-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent === (category || '全部'));
  });
  
  const search = (document.getElementById('faq-search')?.value || '').toLowerCase();
  document.querySelectorAll('.faq-item').forEach(item => {
    const cat = item.dataset.category;
    const q = item.querySelector('.faq-q span')?.textContent?.toLowerCase() || '';
    const a = item.querySelector('.faq-a')?.textContent?.toLowerCase() || '';
    
    let visible = true;
    if (category && cat !== category) visible = false;
    if (search && !q.includes(search) && !a.includes(search)) visible = false;
    
    item.style.display = visible ? '' : 'none';
    if (visible && search) {
      item.classList.add('faq-expanded');
    }
  });
}

// 添加 CSS 用于 faq-expanded
const faqStyle = document.createElement('style');
faqStyle.textContent = `
  .faq-item.faq-expanded .faq-a { display: block !important; }
  .faq-item.faq-expanded .faq-q span:last-child { transform: rotate(180deg); }
  .faq-cat-btn.active { background: var(--primary) !important; color: #fff !important; }
`;
document.head.appendChild(faqStyle);

// ==================== Help Center Card ====================
function addHelpCenterCard() {
  const manageTab = document.getElementById('tab-manage');
  if (!manageTab) return;
  if (document.getElementById('help-center-card')) return;
  
  const lastCard = manageTab.querySelector('.mgmt-card:last-of-type');
  const card = document.createElement('div');
  card.id = 'help-center-card';
  card.className = 'mgmt-card';
  card.innerHTML = `
    <div class="mgmt-header" onclick="this.parentElement.classList.toggle('mgmt-expanded')">
      <span class="mgmt-toggle">▸</span>
      <h3>❓ 帮助中心</h3>
    </div>
    <div class="mgmt-body" id="help-center-content"></div>
  `;
  
  if (lastCard) {
    lastCard.parentNode.insertBefore(card, lastCard.nextSibling);
  } else {
    manageTab.appendChild(card);
  }
  
  renderHelpCenter();
}

// ==================== Start ====================
// 初始化帮助中心和浮动按钮
addHelpCenterCard();
addTutorialResetButton();

// 添加帮助浮动按钮
const helpBtn = document.createElement('button');
helpBtn.className = 'help-float-btn';
helpBtn.textContent = '?';
helpBtn.title = '帮助中心';
helpBtn.onclick = () => { switchTab('manage'); document.getElementById('help-center-card')?.scrollIntoView({behavior:'smooth'}); };
document.body.appendChild(helpBtn);

// 延迟启动引导（等页面渲染完成）
setTimeout(() => {
  if (localStorage.getItem('tutorial_completed') !== 'true') {
    startTutorial();
  }
}, 1500);

// ============================================================
// 公告编辑器（仅管理员）
// ============================================================
function initAnnounceEditor() {
  const contentEl = document.getElementById('annContent');
  if (contentEl) { contentEl.addEventListener('input', updateAnnPreview); }
  setupAnnouncementImportDropZone();
  updatePackageSummary();
}

function updateAnnPreview() {
  const md = document.getElementById('annContent').value;
  const preview = document.getElementById('annPreview');
  if (!md.trim()) {
    preview.innerHTML = '<em style="color:var(--text-secondary);opacity:0.6">在左侧输入内容后此处显示预览</em>';
    return;
  }
  preview.innerHTML = simpleMarkdown(md);
}

function publishToList() {
  const title = document.getElementById('annTitle').value.trim();
  const type = document.getElementById('annType').value;
  const version = document.getElementById('annVersion').value.trim();
  const author = document.getElementById('annAuthor').value.trim();
  const content = document.getElementById('annContent').value.trim();
  if (!title) { showToast('请输入公告标题', 'error'); return; }
  if (!content) { showToast('请输入公告内容', 'error'); return; }
  const ann = { id: 'ann_' + Date.now(), title, type, version: version || '1.0.0', content, timestamp: new Date().toISOString(), author: author || '系统管理员' };
  if (annEditingIndex >= 0) {
    announcementList[annEditingIndex] = { ...ann, id: announcementList[annEditingIndex].id };
    annEditingIndex = -1;
    showToast('公告已更新', 'success');
  } else {
    announcementList.push(ann);
    showToast('公告已添加到列表', 'success');
  }
  announcementList.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  clearAnnForm();
  renderAnnouncementHistory();
}

function clearAnnForm() {
  document.getElementById('annTitle').value = '';
  document.getElementById('annType').value = 'changelog';
  document.getElementById('annVersion').value = '';
  document.getElementById('annAuthor').value = '系统管理员';
  document.getElementById('annContent').value = '';
  document.getElementById('annPreview').innerHTML = '<em style="color:var(--text-secondary);opacity:0.6">在左侧输入内容后此处显示预览</em>';
  annEditingIndex = -1;
}

function renderAnnouncementHistory() {
  const container = document.getElementById('announcementHistoryList');
  document.getElementById('annListCount').textContent = announcementList.length;
  updatePackageSummary();
  if (announcementList.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-secondary);font-size:13px">暂无公告，请在左侧编辑并点击"添加到公告列表"</div>';
    return;
  }
  container.innerHTML = announcementList.map((ann, i) => `
    <div class="ann-history-item">
      <div class="ann-meta">
        <span class="ann-tag ann-tag-${ann.type || 'notice'}">${typeLabel(ann.type)}</span>
        <span style="font-size:11px;color:var(--text-secondary)">v${ann.version || '1.0.0'}</span>
      </div>
      <div class="ann-title">${escapeHtml(ann.title)}</div>
      <div class="ann-time">${formatTime(ann.timestamp)} · ${escapeHtml(ann.author || '系统')}</div>
      <div class="ann-content-preview">${simpleMarkdown(ann.content || '（无内容）')}</div>
      <div style="margin-top:8px;display:flex;gap:6px;">
        <button class="btn btn-ghost" style="padding:4px 10px;font-size:11px;" onclick="editAnnouncement(${i})">✏️ 编辑</button>
        <button class="btn btn-ghost" style="padding:4px 10px;font-size:11px;color:var(--red);" onclick="removeAnnouncement(${i})">🗑️ 删除</button>
      </div>
    </div>
  `).join('');
}

function editAnnouncement(index) {
  const ann = announcementList[index];
  document.getElementById('annTitle').value = ann.title;
  document.getElementById('annType').value = ann.type || 'changelog';
  document.getElementById('annVersion').value = ann.version || '';
  document.getElementById('annAuthor').value = ann.author || '系统管理员';
  document.getElementById('annContent').value = ann.content || '';
  annEditingIndex = index;
  updateAnnPreview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function removeAnnouncement(index) {
  if (!confirm('确定删除这条公告吗？')) return;
  announcementList.splice(index, 1);
  if (annEditingIndex === index) { annEditingIndex = -1; clearAnnForm(); }
  else if (annEditingIndex > index) { annEditingIndex--; }
  renderAnnouncementHistory();
  showToast('公告已删除', 'info');
}

function exportAnnouncementFile() {
  if (announcementList.length === 0) { showToast('请先添加至少一条公告', 'error'); return; }
  const versions = announcementList.map(a => a.version).filter(Boolean);
  const maxVersion = versions.length > 0 ? versions.sort().reverse()[0] : '1.0.0';
  const exportData = {
    version: maxVersion,
    announcements: announcementList.map(a => ({ id: a.id, title: a.title, type: a.type || 'notice', version: a.version || maxVersion, content: a.content, timestamp: a.timestamp, author: a.author || '系统管理员' }))
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'announcement.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast(`announcement.json 已导出！${announcementList.length} 条公告`, 'success');
}

function currentAnnouncementPayload() {
  const versions = announcementList.map(a => a.version).filter(Boolean);
  const fallbackVersion = document.getElementById('pkgVersion')?.value?.trim() || '1.0.0';
  const maxVersion = versions.length > 0 ? versions.sort().reverse()[0] : fallbackVersion;
  return {
    version: maxVersion,
    announcements: announcementList.map(a => ({
      id: a.id,
      title: a.title,
      type: a.type || 'notice',
      version: a.version || maxVersion,
      content: a.content,
      timestamp: a.timestamp,
      author: a.author || '系统管理员'
    }))
  };
}

function setupAnnouncementImportDropZone() {
  const dz = document.getElementById('ann-import-drop-zone');
  if (!dz || dz._bound) return;
  dz._bound = true;
  ['dragenter', 'dragover'].forEach(evt => {
    dz.addEventListener(evt, (e) => {
      e.preventDefault(); e.stopPropagation();
      dz.style.borderColor = 'var(--primary)';
      dz.style.background = 'rgba(99,102,241,0.1)';
    });
  });
  ['dragleave', 'drop'].forEach(evt => {
    dz.addEventListener(evt, (e) => {
      e.preventDefault(); e.stopPropagation();
      dz.style.borderColor = '#3a3d50';
      dz.style.background = 'var(--bg)';
    });
  });
  dz.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) readAnnouncementImportFile(file);
  });
}

function handleAnnouncementImportSelect(event) {
  const file = event.target.files && event.target.files[0];
  if (file) readAnnouncementImportFile(file);
  event.target.value = '';
}

function readAnnouncementImportFile(file) {
  if (!file.name.toLowerCase().endsWith('.json')) {
    showToast('请拖入 announcement.json 文件', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.announcements || !Array.isArray(data.announcements)) {
        showToast('公告文件格式不正确，需要包含 announcements 数组', 'error');
        return;
      }
      pendingAnnouncementImport = {
        version: data.version || '1.0.0',
        announcements: data.announcements,
        fileName: file.name
      };
      renderAnnouncementImportPreview();
    } catch (e) {
      showToast('公告文件解析失败: ' + e.message, 'error');
    }
  };
  reader.readAsText(file, 'utf-8');
}

function renderAnnouncementImportPreview() {
  const box = document.getElementById('ann-import-preview');
  if (!box || !pendingAnnouncementImport) return;
  const p = pendingAnnouncementImport;
  const first = p.announcements[0];
  box.innerHTML = `
    <div style="padding:10px;border:1px solid var(--card-border);border-radius:8px;background:var(--bg)">
      <div style="color:var(--text);font-size:13px;margin-bottom:4px">${escapeHtml(p.fileName)} · v${escapeHtml(p.version)} · ${p.announcements.length} 条公告</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">首条：${escapeHtml(first?.title || '（无标题）')}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost" style="font-size:11px;padding:4px 10px" onclick="previewImportedAnnouncements()">预览公告弹窗</button>
        <button class="btn btn-primary" style="font-size:11px;padding:4px 10px" onclick="importPendingAnnouncements()">导入到公告列表</button>
      </div>
    </div>`;
}

function previewImportedAnnouncements() {
  if (!pendingAnnouncementImport) { showToast('请先拖入公告文件', 'error'); return; }
  showAnnouncementModal(pendingAnnouncementImport.announcements, pendingAnnouncementImport.version, true);
}

function importPendingAnnouncements() {
  if (!pendingAnnouncementImport) { showToast('请先拖入公告文件', 'error'); return; }
  const existingIds = new Set(announcementList.map(a => a.id));
  const incoming = pendingAnnouncementImport.announcements.map((a, i) => ({
    id: a.id || ('ann_import_' + Date.now() + '_' + i),
    title: a.title || '未命名公告',
    type: a.type || 'notice',
    version: a.version || pendingAnnouncementImport.version || '1.0.0',
    content: a.content || '',
    timestamp: a.timestamp || new Date().toISOString(),
    author: a.author || '系统管理员'
  })).filter(a => !existingIds.has(a.id));
  announcementList = [...announcementList, ...incoming];
  announcementList.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  renderAnnouncementHistory();
  showToast(`已导入 ${incoming.length} 条公告`, 'success');
}

function previewCurrentAnnouncements() {
  if (announcementList.length === 0) { showToast('当前公告列表为空', 'error'); return; }
  const payload = currentAnnouncementPayload();
  const version = document.getElementById('pkgVersion')?.value?.trim() || payload.version;
  showAnnouncementModal(payload.announcements, version, true);
}

function updatePackageSummary() {
  const el = document.getElementById('pkgSummary');
  if (!el) return;
  const version = document.getElementById('pkgVersion')?.value?.trim();
  const pieces = [`公告 ${announcementList.length} 条`];
  pieces.push(version ? `版本 v${version}` : '等待填写版本号');
  el.textContent = pieces.join(' · ');
}

async function buildUpdatePackage() {
  const version = document.getElementById('pkgVersion')?.value?.trim();
  const result = document.getElementById('pkgBuildResult');
  if (!version) { showToast('请填写更新版本号', 'error'); return; }
  if (announcementList.length === 0 && !confirm('当前公告列表为空，仍然生成更新包吗？')) return;
  if (result) result.textContent = '正在生成更新包...';

  try {
    const payload = currentAnnouncementPayload();
    const resp = await fetch('/api/build-update-package', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version, announcements: payload.announcements })
    });
    if (!resp.ok || !((resp.headers.get('content-type') || '').includes('application/zip'))) {
      let msg = '生成失败';
      try { const data = await resp.json(); msg = data.msg || msg; } catch(e) {}
      throw new Error(msg);
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard_update_v${version}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (result) result.textContent = `已生成 dashboard_update_v${version}.zip，包含 ${announcementList.length} 条公告。`;
    showToast('更新包已生成并开始下载', 'success');
  } catch (e) {
    if (result) result.textContent = '生成失败: ' + e.message;
    showToast('生成更新包失败: ' + e.message, 'error');
  }
}

function loadExistingAnnouncements() {
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.announcements && Array.isArray(data.announcements)) {
          const existingIds = new Set(announcementList.map(a => a.id));
          const newItems = data.announcements.filter(a => !existingIds.has(a.id));
          announcementList = [...announcementList, ...newItems];
          announcementList.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
          renderAnnouncementHistory();
          showToast(`成功加载 ${newItems.length} 条新公告`, 'success');
        } else { showToast('文件格式不正确，需要包含 announcements 数组', 'error'); }
      } catch (err) { showToast('JSON 解析失败: ' + err.message, 'error'); }
    };
    reader.readAsText(file);
  };
  input.click();
}

init();
