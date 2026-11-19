let current;
const mode = new URLSearchParams(location.search).get('mode') || 'dashboard';
document.body.dataset.mode = mode;
const form = document.querySelector('#settings-form');
const statuses = { off: '休息日 · 好好生活', before: '还没上班 · 慢慢来', after: '本班次结束 · 辛苦了', earning: '正在积累', break: '无薪休息 · 暂停计薪', 'overtime-paid': '有偿加班中', 'overtime-unpaid': '无偿加班中', 'overtime-limit': '加班已封顶 · 请确认结束' };

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

// 按可用宽度缩小金额字号，保留完整数字，避免小窗大金额被省略。
function fitAmounts() {
  for (const id of ['income', 'widget-income']) {
    const element = document.getElementById(id);
    if (!element.clientWidth) continue;
    element.style.removeProperty('font-size');
    const base = parseFloat(getComputedStyle(element).fontSize);
    if (element.scrollWidth > element.clientWidth) element.style.fontSize = `${Math.max(12, Math.floor(base * element.clientWidth / element.scrollWidth) - 1)}px`;
  }
}

// 把主进程快照渲染到两个视图，主题仅改变设计变量。
function render(next) {
  const previousTheme = current?.settings.theme;
  current = next;
  const s = next.settings, v = next.snapshot;
  document.body.dataset.theme = s.theme;
  document.body.dataset.private = String(s.privacy);
  document.body.dataset.status = v.status;
  document.getElementById('quick-theme').value = s.theme;
  if (previousTheme !== s.theme) form.elements.theme.value = s.theme;
  text('income', money(v.today, 4)); text('widget-income', money(v.today, 4));
  text('status', statuses[v.status]); text('widget-status', statuses[v.status]);
  text('rate', `当前每秒 ${money(v.activeRate, 4)} · 正常时段 ${money(v.perSecond, 4)}/秒`);
  text('widget-rate', `当前 ${money(v.activeRate, 4)}/秒`);
  text('countdown', v.status.startsWith('overtime-') ? `本次加班 ${duration(v.overtimeRunningSeconds)}` : ['earning', 'break'].includes(v.status) ? `距下班 ${duration(v.remainingSeconds)}` : v.status === 'after' ? '今日进度已完成' : '收入按排班计算');
  text('day-label', `班次 ${v.day} · 已赚`);
  text('shift-note', '普通收入按排班估算；加班按手动记录另计。进度条仅表示普通班次。');
  renderOvertime();
  document.getElementById('shift-progress').value = v.progress;
  document.getElementById('widget-progress').value = v.progress;
  text('month', money(v.monthEarned)); text('target', money(v.dailyTarget));
  text('month-note', `${v.month} · 按班次起始日期归属`); text('days', `当月排班 ${v.workdays} 天`);
  text('goal-name', s.goalName || '给自己一份奖励'); text('goal-value', `${money(v.goalEarned)} / ${money(s.goalAmount)}`);
  document.getElementById('goal-progress').value = s.privacy ? 0 : v.goalProgress;
  text('rest-value', money(v.restEarned, 4)); text('rest-time', `${duration(v.restSeconds)} · 仅统计计薪区间内收入`);
  text('rest', s.restStart !== null && s.restEnd === null ? '结束休息' : '开始新一次休息');
  text('privacy', s.privacy ? '显示金额' : '隐藏金额');
  text('widget-privacy', s.privacy ? '显示' : '隐藏');
  document.getElementById('widget-privacy').setAttribute('aria-label', s.privacy ? '显示金额' : '隐藏金额');
  text('warning', next.warning); document.getElementById('warning').hidden = !next.warning;
  // 隐私开启时同时关闭并隐藏含薪资输入的设置区。
  document.getElementById('settings').hidden = s.privacy;
  requestAnimationFrame(fitAmounts);
}

// 顶部切换仅保存主题，其余未提交的表单输入保持原样。
async function changeTheme(event) {
  const picker = event.target;
  picker.disabled = true;
  try {
    const result = await window.payrise.saveSettings({ ...current.settings, theme: picker.value });
    if (!result.ok) throw new Error(result.error);
    render(result.state);
  } catch (error) {
    picker.value = current.settings.theme;
    text('warning', error.message); document.getElementById('warning').hidden = false;
  } finally { picker.disabled = false; }
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
  const numeric = new Set(['salary', 'fixedDays', 'goalAmount', 'goalSaved', 'opacity', 'overtimeHourly', 'overtimeMultiplier']);
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

const overtimeForm = document.getElementById('overtime-form');
let historyKey = '', overtimeBusy = false;

// 日期输入使用本地时间，保留秒数以便编辑时不丢失原记录精度。
function localInput(timestamp) {
  const d = new Date(timestamp);
  const pad = value => String(value).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// 将补录表单恢复为当前默认费率；只有用户主动重置时覆盖输入。
function resetOvertimeForm() {
  overtimeForm.reset();
  overtimeForm.elements.id.value = '';
  overtimeForm.elements.mode.value = current.settings.overtimeMode;
  overtimeForm.elements.hourly.value = current.settings.overtimeHourly;
  overtimeForm.elements.multiplier.value = current.settings.overtimeMultiplier;
  for (const name of ['mode','hourly','multiplier']) overtimeForm.elements[name].disabled = false;
  text('overtime-save','补录加班');
}

// 渲染计时与费率快照；隐私模式同时隐藏含原始金额的补录和历史区。
function renderOvertime() {
  const {settings:s,snapshot:v} = current;
  const active = v.overtimeActive;
  text('overtime-summary', `本班次加班 ${duration(v.overtimeSeconds)} · 加班收入 ${money(v.overtimeEarned)}`);
  text('overtime-breakdown', `普通收入 ${money(v.regularEarned)} · 含加班折算时薪 ${money(v.effectiveHourly)} · 本月加班 ${money(v.monthOvertimeEarned)}`);
  const labels = {unpaid:'无加班费',hourly:'自定义时薪',multiplier:'正常时薪 × 倍率'};
  text('overtime-live', active ? `本次 ${duration(v.overtimeRunningSeconds)} · ${labels[active.mode]} · ${money(active.rate)}/小时 · 最迟 ${new Date(active.limit).toLocaleString('zh-CN')} 停止累计` : `下次使用：${labels[s.overtimeMode]}。开始前可在设置中调整。`);
  text('overtime-toggle', active ? '结束加班' : '开始加班');
  document.getElementById('overtime-toggle').disabled = overtimeBusy;
  document.getElementById('overtime-details').hidden = s.privacy;
  if (active) text('widget-status', `${statuses[v.status]} · ${duration(v.overtimeRunningSeconds)}`);
  const key = JSON.stringify([s.overtimeRecords,s.privacy,s.currency]);
  if (key === historyKey) return;
  historyKey = key;
  const list = document.getElementById('overtime-history');
  list.replaceChildren();
  if (s.privacy) return;
  for (const record of [...s.overtimeRecords].reverse()) {
    const row = document.createElement('div'); row.className = 'overtime-row';
    const description = document.createElement('span');
    description.textContent = `${new Date(record.start).toLocaleString('zh-CN')} → ${record.end === null ? '进行中' : new Date(record.end).toLocaleString('zh-CN')} · 归属 ${record.day} · ${labels[record.mode]} · ${money(record.rate)}/小时${record.end === null ? '' : ` · ${duration((record.end-record.start)/1000)} · ${money((record.end-record.start)/3600000*record.rate)}`}`;
    row.append(description);
    if (record.end !== null) {
      for (const [action,label] of [['edit','编辑'],['delete','删除']]) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
        button.dataset.action = action; button.dataset.id = record.id; row.append(button);
      }
    }
    list.append(row);
  }
  if (!s.overtimeRecords.length) list.textContent = '还没有加班记录。';
}

// 串行提交账本变更，错误保留表单内容，不允许重复点击产生并发记录。
async function submitOvertime(command, payload = {}) {
  if (overtimeBusy) return false;
  overtimeBusy = true; renderOvertime();
  try {
    const result = await window.payrise.overtime(command,payload);
    if (!result.ok) throw new Error(result.error);
    render(result.state); text('overtime-message','加班记录已保存'); return true;
  } catch (error) { text('overtime-message',error.message); return false; }
  finally { overtimeBusy = false; renderOvertime(); }
}

// 开始和结束只使用主进程时间；结束携带原记录标识避免多窗口误操作。
async function toggleOvertime() {
  const active = current.snapshot.overtimeActive;
  await submitOvertime(active ? 'stop' : 'start', active ? {id:active.id} : {});
}

// 补录和时间修正使用同一表单，计费规则在主进程再次校验。
async function saveOvertime(event) {
  event.preventDefault();
  const f = overtimeForm.elements;
  const payload = {id:f.id.value,start:new Date(f.start.value).getTime(),end:new Date(f.end.value).getTime(),mode:f.mode.value,hourly:Number(f.hourly.value),multiplier:Number(f.multiplier.value)};
  if (await submitOvertime(payload.id ? 'update' : 'add',payload)) resetOvertimeForm();
}

// 历史列表使用事件委托；删除前确认，编辑始终保留原有费率。
async function historyAction(event) {
  const button = event.target.closest('button[data-id]');
  if (!button || overtimeBusy) return;
  const record = current.settings.overtimeRecords.find(item => item.id === button.dataset.id);
  if (!record) return;
  if (button.dataset.action === 'delete') {
    if (window.confirm('删除这笔加班记录？对应收入和时长将从统计中移除。')) await submitOvertime('delete',{id:record.id});
    return;
  }
  const f = overtimeForm.elements;
  f.id.value = record.id; f.start.value = localInput(record.start); f.end.value = localInput(record.end);
  f.mode.value = record.mode; f.hourly.value = record.rate;
  for (const name of ['mode','hourly','multiplier']) f[name].disabled = true;
  text('overtime-save','保存时间修正'); text('overtime-message','编辑仅修正时间，原费率保持不变。需要改费率时请删除后重新补录。');
  f.start.focus();
}

overtimeForm.addEventListener('submit',saveOvertime);
document.getElementById('overtime-toggle').addEventListener('click',toggleOvertime);
document.getElementById('overtime-reset').addEventListener('click',resetOvertimeForm);
document.getElementById('overtime-history').addEventListener('click',historyAction);
form.addEventListener('submit', save);
document.getElementById('quick-theme').addEventListener('change', changeTheme);
window.addEventListener('resize', fitAmounts);
document.getElementById('cancel').addEventListener('click', () => { fillForm(); text('form-message', '已恢复保存的设置'); });
for (const [id, action] of Object.entries({ privacy: 'privacy', widget: 'widget', rest: 'rest', 'widget-open': 'dashboard', 'widget-hide': 'widget', 'widget-privacy': 'privacy' })) document.getElementById(id).addEventListener('click', () => act(action));
if (window.payrise) {
  window.payrise.onState(render);
  render(await window.payrise.getState()); fillForm(); resetOvertimeForm();
} else { text('income', '请使用 npm start 启动桌面应用'); }
