export const DEFAULT_SETTINGS = Object.freeze({
  version: 1, salary: 12000, salaryMode: 'monthly', currency: 'CNY',
  start: '09:00', end: '18:00', breakEnabled: true, breakStart: '12:00', breakEnd: '13:00',
  weekdays: [1, 2, 3, 4, 5], overrides: {}, divisor: 'calendar', fixedDays: 21.75,
  theme: 'dawn', privacy: false, pinned: true, opacity: 1,
  goalName: '给自己一份奖励', goalAmount: 3000, goalSaved: 0,
  goalStart: '', restStart: null, restEnd: null
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
  if (!['dawn', 'midnight', 'paper'].includes(s.theme)) throw new Error('主题无效');
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
  s.version = 1;
  return s;
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
  const current = shiftEarnings(day, s, -Infinity, time);
  const earning = current.segments.some(([a, b]) => time >= a && time < b);
  const status = !current.working ? 'off' : time < current.start ? 'before' : time >= current.end ? 'after' : earning ? 'earning' : 'break';
  let monthEarned = 0;
  for (let d = new Date(day.getFullYear(), day.getMonth(), 1); d <= day; d.setDate(d.getDate() + 1)) monthEarned += shiftEarnings(d, s, -Infinity, time).earned;
  const goalFrom = s.goalStart ? new Date(`${s.goalStart}T00:00:00`).getTime() : time;
  const goalEarned = s.goalSaved + earningsBetween(s, goalFrom, time);
  const restTo = s.restEnd ?? time;
  return {
    timestamp: time, day: dateKey(day), month: dateKey(day).slice(0, 7), status,
    today: current.earned, monthEarned, dailyTarget: current.target,
    perSecond: current.rate, activeRate: earning ? current.rate : 0,
    progress: current.paidSeconds ? current.seconds / current.paidSeconds : 0,
    remainingSeconds: Math.max(0, (current.end - time) / 1000), workdays: workdayCount(day, s),
    goalEarned, goalProgress: Math.min(1, goalEarned / s.goalAmount),
    restSeconds: s.restStart === null ? 0 : Math.max(0, (restTo - s.restStart) / 1000),
    restEarned: s.restStart === null ? 0 : earningsBetween(s, s.restStart, restTo)
  };
}
