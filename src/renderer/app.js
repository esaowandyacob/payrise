let current;
const mode = new URLSearchParams(location.search).get('mode') || 'dashboard';
document.body.dataset.mode = mode;
const form = document.querySelector('#settings-form');
const statuses = { off: '休息日 · 好好生活', before: '还没上班 · 慢慢来', after: '本班次结束 · 辛苦了', earning: '正在积累', break: '无薪休息 · 暂停计薪' };

// 安全更新文本，不使用 HTML 插值呈现用户输入。
function text(id, value) { document.getElementById(id).textContent = value; }

// 统一金额格式，隐私模式从文本层替换数值而非仅做视觉模糊。
function money(value, digits = 2) {
  if (current.settings.privacy) return '••••';
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: current.settings.currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

// 把秒数格式化为小时、分钟与秒，不在页面累加计时。
function duration(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 3600)}:${String(Math.floor(total % 3600 / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// 把主进程快照渲染到两个视图，主题仅改变设计变量。
function render(next) {
  current = next;
  const s = next.settings, v = next.snapshot;
  document.body.dataset.theme = s.theme;
  document.body.dataset.private = String(s.privacy);
  text('income', money(v.today, 4)); text('widget-income', money(v.today, 4));
  text('status', statuses[v.status]); text('widget-status', statuses[v.status]);
  text('rate', `当前每秒 ${money(v.activeRate, 4)} · 计薪时 ${money(v.perSecond, 4)}/秒`);
  text('widget-rate', `当前 ${money(v.activeRate, 4)}/秒`);
  text('countdown', ['earning', 'break'].includes(v.status) ? `距下班 ${duration(v.remainingSeconds)}` : v.status === 'after' ? '今日进度已完成' : '收入按排班计算');
  text('day-label', `班次 ${v.day} · 已赚`);
  text('shift-note', '按排班估算；打开应用前的计薪时间也已计入。');
  document.getElementById('shift-progress').value = v.progress;
  text('month', money(v.monthEarned)); text('target', money(v.dailyTarget));
  text('month-note', `${v.month} · 按班次起始日期归属`); text('days', `当月排班 ${v.workdays} 天`);
  text('goal-name', s.goalName || '给自己一份奖励'); text('goal-value', `${money(v.goalEarned)} / ${money(s.goalAmount)}`);
  document.getElementById('goal-progress').value = s.privacy ? 0 : v.goalProgress;
  text('rest-value', money(v.restEarned, 4)); text('rest-time', `${duration(v.restSeconds)} · 仅统计计薪区间内收入`);
  text('rest', s.restStart !== null && s.restEnd === null ? '结束休息' : '开始新一次休息');
  text('privacy', s.privacy ? '显示金额' : '隐藏金额');
  text('warning', next.warning); document.getElementById('warning').hidden = !next.warning;
  // 隐私开启时同时关闭并隐藏含薪资输入的设置区。
  document.getElementById('settings').hidden = s.privacy;
}

// 仅初始化或保存完成后填充表单，定时更新不覆盖正在输入的内容。
function fillForm() {
  const s = current.settings;
  for (const field of form.elements) {
    if (!field.name) continue;
    if (field.name === 'weekdays') field.checked = s.weekdays.includes(Number(field.value));
    else if (field.name === 'overrides') field.value = Object.entries(s.overrides).map(([date, work]) => `${date}=${work ? 'work' : 'off'}`).join('\n');
    else if (field.type === 'checkbox') field.checked = s[field.name];
    else field.value = s[field.name];
  }
}

// 读取用户表单，严格解析调休日历并将最终校验交给主进程。
function collectSettings() {
  const next = { ...current.settings };
  const numeric = new Set(['salary', 'fixedDays', 'goalAmount', 'goalSaved', 'opacity']);
  for (const field of form.elements) {
    if (!field.name || ['weekdays', 'overrides'].includes(field.name)) continue;
    next[field.name] = field.type === 'checkbox' ? field.checked : numeric.has(field.name) ? Number(field.value) : field.value;
  }
  next.weekdays = [...form.querySelectorAll('[name="weekdays"]:checked')].map(field => Number(field.value));
  next.overrides = {};
  for (const line of form.elements.overrides.value.split('\n').map(value => value.trim()).filter(Boolean)) {
    const match = /^(\d{4}-\d{2}-\d{2})=(work|off)$/.exec(line);
    if (!match) throw new Error('调休日历每行格式应为 YYYY-MM-DD=work 或 YYYY-MM-DD=off');
    next.overrides[match[1]] = match[2] === 'work';
  }
  return next;
}

// 保存成功后同步所有视图；失败保留用户输入并显示原因。
async function save(event) {
  event.preventDefault();
  try {
    const result = await window.payrise.saveSettings(collectSettings());
    if (!result.ok) throw new Error(result.error);
    render(result.state); fillForm(); text('form-message', '已保存到这台 Mac');
  } catch (error) { text('form-message', error.message); }
}

// 调用白名单桌面动作，并把错误显示在当前窗口。
async function act(action) {
  try { render(await window.payrise.action(action)); }
  catch (error) { text(mode === 'widget' ? 'widget-status' : 'warning', error.message); document.getElementById('warning').hidden = false; }
}

form.addEventListener('submit', save);
document.getElementById('cancel').addEventListener('click', () => { fillForm(); text('form-message', '已恢复保存的设置'); });
for (const [id, action] of Object.entries({ privacy: 'privacy', widget: 'widget', rest: 'rest', 'widget-open': 'dashboard', 'widget-hide': 'widget', 'widget-privacy': 'privacy' })) document.getElementById(id).addEventListener('click', () => act(action));
if (window.payrise) {
  window.payrise.onState(render);
  render(await window.payrise.getState()); fillForm();
} else { text('income', '请使用 npm start 启动桌面应用'); }
