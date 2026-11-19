export const DEFAULT_SETTINGS = Object.freeze({
  version: 2, salary: 12000, salaryMode: 'monthly', currency: 'CNY',
  start: '09:00', end: '18:00', breakEnabled: true, breakStart: '12:00', breakEnd: '13:00',
  weekdays: [1, 2, 3, 4, 5], overrides: {}, divisor: 'calendar', fixedDays: 21.75,
  theme: 'lumen', privacy: false, pinned: true, opacity: 1,
  goalName: '给自己一份奖励', goalAmount: 3000, goalSaved: 0,
  goalStart: '', restStart: null, restEnd: null,
  overtimeMode: 'unpaid', overtimeHourly: 100, overtimeMultiplier: 1.5, overtimeRecords: []
});

// 把本地日历日期转为无时区偏移的日期键。
export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// 严格解析时刻，拒绝越界值，防止表单和持久化数据污染计薪。
export function minutes(time) {
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('时间必须为有效的 HH:MM');
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

// 校验真实公历日期，避免 JavaScript 自动把无效日期滚动到下个月。
export function validDateKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split('-').map(Number);
  return y >= 2000 && y <= 2100 && dateKey(new Date(y, m - 1, d)) === key;
}

// 生成白名单配置，所有跨进程写入均先经过此处校验。
export function validateSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('设置格式无效');
  const s = Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map(key => [key, input[key] ?? DEFAULT_SETTINGS[key]]));
  for (const key of ['salary', 'fixedDays', 'goalAmount', 'goalSaved', 'opacity']) {
    if (typeof s[key] !== 'number' || !Number.isFinite(s[key])) throw new Error(`${key} 必须是有效数字`);
  }
  if (s.salary <= 0 || s.salary > 100000000) throw new Error('薪资应大于 0 且不超过 1 亿');
  if (s.fixedDays < 1 || s.fixedDays > 31) throw new Error('月计薪天数应为 1–31');
  if (s.goalAmount <= 0 || s.goalAmount > 100000000 || s.goalSaved < 0 || s.goalSaved > 100000000) throw new Error('目标金额超出范围');
  if (s.opacity < 0.5 || s.opacity > 1) throw new Error('透明度应为 50%–100%');
  if (!['monthly', 'daily', 'hourly'].includes(s.salaryMode)) throw new Error('计薪方式无效');
  if (!['CNY', 'USD', 'EUR', 'JPY', 'HKD'].includes(s.currency)) throw new Error('货币无效');
  if (!['calendar', 'fixed'].includes(s.divisor)) throw new Error('折算方式无效');
  // 兼容首版主题名称，迁移只改变主题标识，不改变薪资或排班。
  s.theme = ({ dawn: 'lumen', midnight: 'wick', paper: 'folio' })[s.theme] ?? s.theme;
  if (!['lumen', 'folio', 'wick'].includes(s.theme)) throw new Error('主题无效');
  for (const key of ['breakEnabled', 'privacy', 'pinned']) if (typeof s[key] !== 'boolean') throw new Error(`${key} 应为布尔值`);
  if (!Array.isArray(s.weekdays) || !s.weekdays.length || s.weekdays.some(n => !Number.isInteger(n) || n < 0 || n > 6)) throw new Error('至少选择一个工作日');
  s.weekdays = [...new Set(s.weekdays)].sort();
  const start = minutes(s.start);
  let end = minutes(s.end);
  if (end === start) throw new Error('上下班时间不能相同');
  if (end < start) end += 1440;
  minutes(s.breakStart); minutes(s.breakEnd);
  if (s.breakEnabled) {
    let bs = minutes(s.breakStart), be = minutes(s.breakEnd);
    if (bs < start) bs += 1440;
    if (be <= bs % 1440) be += 1440;
    if (be <= bs) be += 1440;
    if (bs < start || be > end || be <= bs || be - bs >= end - start) throw new Error('无薪休息必须位于班次内，且不能覆盖整个班次');
  }
  if (!s.overrides || typeof s.overrides !== 'object' || Array.isArray(s.overrides) || Object.keys(s.overrides).length > 1000) throw new Error('调休日历无效');
  for (const [key, value] of Object.entries(s.overrides)) if (!validDateKey(key) || typeof value !== 'boolean') throw new Error('调休格式应为 日期=work 或 日期=off');
  s.overrides = { ...s.overrides };
  if (typeof s.goalName !== 'string' || s.goalName.length > 60) throw new Error('目标名称最多 60 字');
  if (s.goalStart && !validDateKey(s.goalStart)) throw new Error('目标开始日期无效');
  for (const key of ['restStart', 'restEnd']) if (s[key] !== null && (typeof s[key] !== 'number' || !Number.isFinite(s[key]) || s[key] < 0 || s[key] > 4133980800000)) throw new Error('休息计时无效');
  if (s.restEnd !== null && (s.restStart === null || s.restEnd < s.restStart)) throw new Error('休息结束时间无效');
  if (!['unpaid', 'hourly', 'multiplier'].includes(s.overtimeMode)) throw new Error('加班计薪方式无效');
  if (!Number.isFinite(s.overtimeHourly) || s.overtimeHourly <= 0 || s.overtimeHourly > 100000000) throw new Error('加班时薪应大于 0 且不超过 1 亿');
  if (!Number.isFinite(s.overtimeMultiplier) || s.overtimeMultiplier <= 0 || s.overtimeMultiplier > 100) throw new Error('加班倍率应大于 0 且不超过 100');
  s.overtimeRecords = validateOvertimeRecords(s.overtimeRecords, s);
  s.version = 2;
  return s;
}

// 验证加班账本的边界、费率快照与互斥区间，禁止记录重复和普通计薪重叠。
export function validateOvertimeRecords(records, s) {
  if (!Array.isArray(records) || records.length > 1000) throw new Error('加班记录最多保留 1000 条');
  const ids = new Set();
  let active = 0;
  const normalized = records.map(record => {
    if (!record || typeof record !== 'object') throw new Error('加班记录格式无效');
    const { id, start, end, limit, day, rate, currency, mode } = record;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id) || ids.has(id)) throw new Error('加班记录标识无效或重复');
    ids.add(id);
    if (!Number.isFinite(start) || start < 946684800000 || start > 4102444800000 || !Number.isFinite(limit) || limit <= start || limit - start > 86400000) throw new Error('单次加班时间须在 24 小时以内');
    if (end !== null && (!Number.isFinite(end) || end <= start || end > limit)) throw new Error('加班结束时间必须晚于开始且在上限内');
    if (end === null && ++active > 1) throw new Error('只能同时进行一次加班');
    if (currency !== s.currency) throw new Error('已有加班记录时不能切换币种，请先保留账本备份并处理原记录');
    if (!validDateKey(day) || !['unpaid','hourly','multiplier'].includes(mode) || !Number.isFinite(rate) || rate < 0 || rate > 10000000000 || (mode === 'unpaid' ? rate !== 0 : rate <= 0)) throw new Error('加班费率或归属日期无效');
    const from = new Date(start); from.setHours(0,0,0,0); from.setDate(from.getDate()-1);
    const until = end ?? limit;
    for (let d = from; d.getTime() <= until; d.setDate(d.getDate()+1)) {
      for (const [a,b] of shift(d,s).segments) if (overlapSeconds(a,b,start,until) > 0) throw new Error('加班不能与正常计薪时段重叠，请调整时间或排班');
    }
    return {id,start,end,limit,day,rate,currency,mode};
  }).sort((a,b) => a.start-b.start);
  for (let i=1; i<normalized.length; i++) if (normalized[i].start < (normalized[i-1].end ?? normalized[i-1].limit)) throw new Error('加班记录时间重叠');
  return normalized;
}

// 将凌晨的加班关联到刚结束的夜班；其他情况按开始的本地日期归属。
export function overtimeDay(s, start) {
  const day = new Date(start); day.setHours(0,0,0,0);
  const previous = new Date(day); previous.setDate(previous.getDate()-1);
  const old = shift(previous,s);
  return dateKey(old.working && old.end > day.getTime() && start >= old.end && start < shift(day,s).start ? previous : day);
}

// 计算本次费率快照；休息日的倍率仍使用该日期所在月的正常班次单价。
export function overtimeRate(s, start, mode, hourly, multiplier) {
  if (mode === 'unpaid') return 0;
  if (mode === 'hourly') {
    if (!Number.isFinite(hourly) || hourly <= 0 || hourly > 100000000) throw new Error('请输入有效加班时薪');
    return hourly;
  }
  if (mode !== 'multiplier' || !Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 100) throw new Error('请输入有效加班倍率');
  const day = new Date(`${overtimeDay(s,start)}T00:00:00`);
  const nominal = shift(day,s).nominalSeconds;
  const divisor = s.divisor === 'fixed' ? s.fixedDays : workdayCount(day,s);
  if (s.salaryMode === 'monthly' && !divisor) throw new Error('本月没有排班工作日，请使用自定义加班时薪');
  const base = s.salaryMode === 'hourly' ? s.salary : (s.salaryMode === 'monthly' ? s.salary/divisor : s.salary)*3600/nominal;
  return base*multiplier;
}

// 创建已锁定费率的加班记录，计时最多延续至下一正常计薪段或 24 小时。
export function createOvertimeRecord(s, input, now = Date.now()) {
  const {id,start,end = null} = input;
  if (!Number.isFinite(start) || start > now || start < 946684800000 || (end !== null && (!Number.isFinite(end) || end > now))) throw new Error('加班时间不能在未来');
  let limit = start+86400000;
  const day = new Date(start); day.setHours(0,0,0,0);day.setDate(day.getDate()-1);
  for (let d=day; d.getTime()<=start+86400000; d.setDate(d.getDate()+1)) {
    for(const [a,b] of shift(d,s).segments) {
      if(start>=a && start<b) throw new Error('当前属于正常计薪时段，不能重复开始加班');
      if(a>=start) limit=Math.min(limit,a);
    }
  }
  const mode=input.mode ?? s.overtimeMode;
  const record={id,start,end,limit,day:overtimeDay(s,start),rate:overtimeRate(s,start,mode,input.hourly ?? s.overtimeHourly,input.multiplier ?? s.overtimeMultiplier),currency:s.currency,mode};
  validateOvertimeRecords([...s.overtimeRecords,record],s);
  return record;
}

// 截取加班的实际时间交集，未结束记录在安全上限停止增长，保留待确认状态。
export function overtimeTotals(s, now, from = -Infinity, to = now, day = null, month = null) {
  let earned=0,seconds=0;
  for(const r of s.overtimeRecords) {
    if(day && r.day!==day || month && !r.day.startsWith(month)) continue;
    const elapsed=overlapSeconds(r.start,Math.min(r.end ?? now,r.limit,now),from,to);
    seconds+=elapsed; earned+=elapsed*r.rate/3600;
  }
  return {earned,seconds};
}

// 统一处理加班账本操作；编辑只修正时间，保留记录创建时的费率和币种。
export function changeOvertime(s, command, input = {}, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('加班操作格式无效');
  const records = s.overtimeRecords;
  const active = records.find(record => record.end === null);
  let next;
  if (command === 'start' || command === 'add') {
    if (command === 'start' && active) throw new Error('请先结束当前加班');
    if (command === 'add' && !Number.isFinite(input.end)) throw new Error('补录必须填写结束时间');
    const record = createOvertimeRecord(s, command === 'start' ? {...input,start:now,end:null} : input, now);
    next = [...records,record];
  } else if (command === 'stop') {
    if (!active || input.id !== active.id) throw new Error('当前加班已变化，请刷新后重试');
    const end = Math.min(now,active.limit);
    next = end <= active.start ? records.filter(record => record.id !== active.id) : records.map(record => record.id === active.id ? {...record,end} : record);
  } else if (command === 'update' || command === 'delete') {
    const old = records.find(record => record.id === input.id);
    if (!old) throw new Error('未找到加班记录');
    if (old.end === null) throw new Error('请先结束加班再编辑或删除');
    next = records.filter(record => record.id !== old.id);
    if (command === 'update') {
      if (!Number.isFinite(input.end)) throw new Error('请填写结束时间');
      const updated = createOvertimeRecord({...s,overtimeRecords:next}, {...input,mode:'unpaid'}, now);
      next.push({...updated,mode:old.mode,rate:old.rate});
    }
  } else throw new Error('不支持的加班操作');
  return validateSettings({...s,overtimeRecords:next});
}

// 使用本地日历构造时刻，跨日和夏令时由系统时区规则处理。
function atMinute(day, value) {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(value / 60), value % 60).getTime();
}

// 根据班次起始日确定是否计薪，手动调休优先于星期规则。
export function isWorkday(day, settings) {
  return settings.overrides[dateKey(day)] ?? settings.weekdays.includes(day.getDay());
}

// 为一个班次生成实际计薪区间，无薪休息从区间中剔除。
export function shift(day, s) {
  const startMinute = minutes(s.start);
  let endMinute = minutes(s.end);
  if (endMinute <= startMinute) endMinute += 1440;
  const start = atMinute(day, startMinute), end = atMinute(day, endMinute);
  let segments = [[start, end]];
  let nominalSeconds = (endMinute - startMinute) * 60;
  if (s.breakEnabled) {
    let bs = minutes(s.breakStart), be = minutes(s.breakEnd);
    if (bs < startMinute) bs += 1440;
    while (be <= bs) be += 1440;
    segments = [[start, atMinute(day, bs)], [atMinute(day, be), end]];
    nominalSeconds -= (be - bs) * 60;
  }
  const working = isWorkday(day, s);
  return { start, end, segments: working ? segments : [], nominalSeconds, working };
}

// 计算日历月份中由星期与调休规则共同确定的工作日数量。
export function workdayCount(day, s) {
  let count = 0;
  const year = day.getFullYear(), month = day.getMonth();
  for (let d = new Date(year, month, 1); d.getMonth() === month; d.setDate(d.getDate() + 1)) if (isWorkday(d, s)) count++;
  return count;
}

// 计算两个时间段的交集秒数，系统休眠后直接按墙钟重新计算。
function overlapSeconds(a, b, start, end) {
  return Math.max(0, Math.min(b, end) - Math.max(a, start)) / 1000;
}

// 计算指定班次在时间范围内的估算收入；月薪/日薪按班次封顶。
export function shiftEarnings(day, s, from, to) {
  const info = shift(day, s);
  if (!info.working) return { earned: 0, rate: 0, seconds: 0, paidSeconds: 0, target: 0, ...info };
  const paidSeconds = info.segments.reduce((sum, [a, b]) => sum + (b - a) / 1000, 0);
  const divisor = s.divisor === 'fixed' ? s.fixedDays : workdayCount(day, s);
  const target = s.salaryMode === 'monthly' ? s.salary / divisor : s.salaryMode === 'daily' ? s.salary : s.salary * paidSeconds / 3600;
  const rate = paidSeconds > 0 ? target / paidSeconds : 0;
  const seconds = info.segments.reduce((sum, [a, b]) => sum + overlapSeconds(a, b, from, to), 0);
  return { ...info, earned: Math.min(target, seconds * rate), rate, seconds, paidSeconds, target };
}

// 汇总日期范围内的收入，同时包含起始日前一天可能跨午夜的班次。
export function earningsBetween(s, from, to) {
  if (to <= from) return 0;
  const start = new Date(from);
  start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 1);
  let result = 0;
  for (let day = start; day.getTime() <= to; day.setDate(day.getDate() + 1)) result += shiftEarnings(day, s, from, to).earned;
  return result;
}

// 为所有窗口提供统一快照，避免不同界面各自累计造成金额漂移。
export function snapshot(s, now = new Date()) {
  const time = now.getTime(), day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const previous = new Date(day); previous.setDate(previous.getDate() - 1);
  const previousShift = shift(previous, s);
  if (previousShift.working && time < previousShift.end && time >= previousShift.start) day.setDate(day.getDate() - 1);
  const active = s.overtimeRecords.find(record => record.end === null);
  const last = s.overtimeRecords.filter(record => record.end !== null && record.end <= time).at(-1);
  const anchorRecord = active && active.start <= time && time < active.limit ? active :
    last && dateKey(new Date(last.end)) === dateKey(day) && last.day < dateKey(day) && time < shift(day,s).start ? last : null;
  if (anchorRecord) {
    const anchor = new Date(`${anchorRecord.day}T00:00:00`);
    day.setFullYear(anchor.getFullYear(),anchor.getMonth(),anchor.getDate());
  }
  const current = shiftEarnings(day, s, -Infinity, time);
  const earning = current.segments.some(([a, b]) => time >= a && time < b);
  const overtimeRunning = active && time >= active.start && time < active.limit;
  const status = active && time >= active.limit ? 'overtime-limit' : overtimeRunning ? (active.rate === 0 ? 'overtime-unpaid' : 'overtime-paid') : !current.working ? 'off' : time < current.start ? 'before' : time >= current.end ? 'after' : earning ? 'earning' : 'break';
  let monthEarned = 0;
  for (let d = new Date(day.getFullYear(), day.getMonth(), 1); d <= day; d.setDate(d.getDate() + 1)) monthEarned += shiftEarnings(d, s, -Infinity, time).earned;
  const goalFrom = s.goalStart ? new Date(`${s.goalStart}T00:00:00`).getTime() : time;
  const overtime = overtimeTotals(s,time,-Infinity,time,dateKey(day));
  const monthOvertime = overtimeTotals(s,time,-Infinity,time,null,dateKey(day).slice(0,7));
  const total = current.earned+overtime.earned;
  const worked = current.seconds+overtime.seconds;
  const goalEarned = s.goalSaved + earningsBetween(s, goalFrom, time) + overtimeTotals(s,time,goalFrom,time).earned;
  const restTo = s.restEnd ?? time;
  return {
    timestamp: time, day: dateKey(day), month: dateKey(day).slice(0, 7), status,
    today: total, regularEarned: current.earned, monthEarned: monthEarned+monthOvertime.earned, dailyTarget: current.target,
    overtimeEarned: overtime.earned, overtimeSeconds: overtime.seconds, monthOvertimeEarned: monthOvertime.earned,
    effectiveHourly: worked > 0 ? total/worked*3600 : 0, overtimeActive: active ?? null,
    overtimeRunningSeconds: active ? Math.max(0,(Math.min(time,active.limit)-active.start)/1000) : 0,
    perSecond: current.rate, activeRate: overtimeRunning ? active.rate/3600 : earning ? current.rate : 0,
    progress: current.paidSeconds ? current.seconds / current.paidSeconds : 0,
    remainingSeconds: Math.max(0, (current.end - time) / 1000), workdays: workdayCount(day, s),
    goalEarned, goalProgress: Math.min(1, goalEarned / s.goalAmount),
    restSeconds: s.restStart === null ? 0 : Math.max(0, (restTo - s.restStart) / 1000),
    restEarned: s.restStart === null ? 0 : earningsBetween(s, s.restStart, restTo) + overtimeTotals(s,time,s.restStart,restTo).earned
  };
}
