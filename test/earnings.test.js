import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, validateSettings, snapshot, shiftEarnings, workdayCount, earningsBetween } from '../src/core/earnings.js';
process.env.TZ = 'Asia/Shanghai';

// 为各边界场景生成互不共享可变对象的测试配置。
function config(overrides = {}) { return validateSettings({ ...DEFAULT_SETTINGS, salaryMode: 'daily', salary: 800, ...overrides }); }

// 浮点计算采用合理误差，金额只在显示时四舍五入。
function close(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`); }

test('晚启动照常补算，午休冻结，下班封顶', () => {
  const s = config();
  close(snapshot(s, new Date('2026-11-19T08:00:00')).today, 0);
  close(snapshot(s, new Date('2026-11-19T10:00:00')).today, 100);
  close(snapshot(s, new Date('2026-11-19T12:30:00')).today, 300);
  assert.equal(snapshot(s, new Date('2026-11-19T12:30:00')).activeRate, 0);
  close(snapshot(s, new Date('2026-11-19T14:00:00')).today, 400);
  close(snapshot(s, new Date('2026-11-19T23:00:00')).today, 800);
});
test('跨午夜班次归属上一工作日，周六凌晨仍计周五班次', () => {
  const s = config({ start: '22:00', end: '06:00', breakStart: '02:00', breakEnd: '03:00', salary: 700 });
  const v = snapshot(s, new Date('2026-11-21T01:00:00'));
  assert.equal(v.day, '2026-11-20'); close(v.today, 300); close(v.perSecond, 100 / 3600);
  assert.equal(snapshot(s, new Date('2026-11-21T02:30:00')).status, 'break');
});
test('跨月夜班使用起始月份的工作日折算', () => {
  const s = config({ salaryMode: 'monthly', salary: 22000, start: '22:00', end: '06:00', breakEnabled: false, weekdays: [0,1,2,3,4,5,6] });
  const v = snapshot(s, new Date('2026-12-01T02:00:00'));
  assert.equal(v.month, '2026-11'); close(v.today, 22000 / 30 / 2);
});
test('调休优先级和当月工作日口径一致', () => {
  const s = config({ overrides: { '2026-11-21': true, '2026-11-23': false } });
  assert.equal(workdayCount(new Date('2026-11-19'), s), 21);
  close(snapshot(s, new Date('2026-11-21T18:00:00')).today, 800);
  assert.equal(snapshot(s, new Date('2026-11-23T10:00:00')).status, 'off');
});
test('月薪日历折算，整月累计等于月薪', () => {
  const s = config({ salaryMode: 'monthly', salary: 12000 });
  close(snapshot(s, new Date('2026-11-30T23:00:00')).monthEarned, 12000);
});
test('固定计薪天数不冒充实际月薪总额', () => {
  const s = config({ salaryMode: 'monthly', salary: 12000, divisor: 'fixed', fixedDays: 21.75 });
  close(snapshot(s, new Date('2026-11-30T23:00:00')).monthEarned, 12000 / 21.75 * 21);
});
test('时薪只计算实际计薪区间，休息金额不重复加入工资', () => {
  const start = new Date('2026-11-19T11:30:00').getTime(), end = new Date('2026-11-19T13:30:00').getTime();
  const s = config({ salaryMode: 'hourly', salary: 100, restStart: start, restEnd: end });
  close(earningsBetween(s, start, end), 100);
  const v = snapshot(s, new Date('2026-11-19T14:00:00'));
  close(v.restEarned, 100); close(v.today, 400);
});
test('愿望从指定日期累加，未来开始日不提前计薪', () => {
  close(snapshot(config({goalStart: '2026-11-19', goalSaved: 100}), new Date('2026-11-19T10:00:00')).goalEarned, 200);
  close(snapshot(config({goalStart: '2026-11-20', goalSaved: 100}), new Date('2026-11-19T10:00:00')).goalEarned, 100);
});
test('非法时间、数字、日期与越界午休被拒绝', () => {
  for (const patch of [{salary:-1},{salary:NaN},{start:'25:00'},{end:'09:00'},{weekdays:[]},{breakStart:'08:00'},{breakEnd:'20:00'},{theme:'../../test'},{overrides:{'2026-02-30':true}},{privacy:'yes'}]) assert.throws(() => config(patch));
});
test('调休字段白名单不允许未知属性传入持久化层', () => {
  assert.equal(config({ injected: 'value' }).injected, undefined);
});
test('夏令时跳过一小时：时薪按实际时长，日薪仍按班次封顶', () => {
  process.env.TZ = 'America/New_York';
  try {
    const day = new Date(2026, 2, 8);
    const s = config({start:'00:00',end:'08:00',breakEnabled:false,weekdays:[0],salaryMode:'hourly',salary:100});
    close(shiftEarnings(day, s, -Infinity, Infinity).earned, 700);
    close(shiftEarnings(day, config({...s,salaryMode:'daily',salary:800}), -Infinity, Infinity).earned, 800);
  } finally { process.env.TZ = 'Asia/Shanghai'; }
});

test('主题迁移保留工资与排班，新主题不改变计薪结果', () => {
  const now = new Date('2026-11-19T14:00:00');
  const base = snapshot(config(), now);
  for (const [oldTheme, theme] of [['dawn','lumen'],['paper','folio'],['midnight','wick']]) {
    const migrated = config({theme:oldTheme});
    assert.equal(migrated.theme, theme);
    assert.deepEqual(snapshot(migrated, now), base);
    assert.equal(config({theme}).theme, theme);
  }
});

test('哆啦A梦主题保持计薪快照一致', () => {
  const now = new Date('2026-11-19T19:00:00');
  const base = config();
  assert.equal(config({theme:'doraemon'}).theme,'doraemon');
  assert.deepEqual(snapshot({...base,theme:'doraemon'},now),snapshot(base,now));
});
