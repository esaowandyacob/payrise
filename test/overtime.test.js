import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,validateSettings,changeOvertime,snapshot} from '../src/core/earnings.js';
process.env.TZ='Asia/Shanghai';
// 创建独立的固定日薪测试配置。
function config(patch={}) { return validateSettings({...DEFAULT_SETTINGS,salaryMode:'daily',salary:800,...patch}); }
// 将本地测试日期转换为毫秒。
function time(value) { return new Date(value).getTime(); }
// 比较未四舍五入的估算金额。
function close(actual,expected) { assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`); }
// 创建确定时钟下的已结束记录。
function add(s,start,end,patch={}) { return changeOvertime(s,'add',{id:'record-1',start:time(start),end:time(end),...patch},time('2026-12-03T23:00:00')); }

test('无偿加班只加时间并降低折算时薪',()=>{
  const s=add(config(),'2026-11-19T18:00:00','2026-11-19T20:00:00');
  const v=snapshot(s,new Date('2026-11-19T20:00:00'));
  close(v.today,800); close(v.overtimeSeconds,7200); close(v.effectiveHourly,80); close(v.overtimeEarned,0);
});
test('倍率加班并入日月和愿望收入，休息观察值不再重复计入',()=>{
  const s=add(config({goalStart:'2026-11-19',restStart:time('2026-11-19T18:00:00'),overtimeMode:'multiplier'}),'2026-11-19T18:00:00','2026-11-19T20:00:00');
  const v=snapshot(s,new Date('2026-11-19T20:00:00'));
  close(v.today,1100); close(v.overtimeEarned,300); close(v.monthOvertimeEarned,300); close(v.goalEarned,1100); close(v.restEarned,300);
});
test('周末补录自定义时薪，普通收入为零',()=>{
  const s=add(config(),'2026-11-21T09:00:00','2026-11-21T12:00:00',{mode:'hourly',hourly:80});
  const v=snapshot(s,new Date('2026-11-21T13:00:00'));
  close(v.today,240); close(v.regularEarned,0); close(v.effectiveHourly,80);
});
test('开始结束、重启恢复与费率快照',()=>{
  let s=changeOvertime(config({overtimeMode:'multiplier'}),'start',{id:'active'},time('2026-11-19T18:00:00'));
  assert.equal(snapshot(s,new Date('2026-11-19T19:00:00')).status,'overtime-paid');
  s=validateSettings(JSON.parse(JSON.stringify({...s,salary:1600,overtimeMultiplier:3})));
  close(s.overtimeRecords[0].rate,150);
  assert.throws(()=>changeOvertime(s,'start',{id:'other'},time('2026-11-19T19:00:00')));
  assert.throws(()=>changeOvertime(s,'stop',{id:'stale'},time('2026-11-19T19:00:00')));
  s=changeOvertime(s,'stop',{id:'active'},time('2026-11-19T20:00:00'));
  close(snapshot(s,new Date('2026-11-19T20:00:00')).overtimeEarned,300);
});
test('跨午夜和跨月按加班开始日归属，结束后保留到当天上班',()=>{
  const s=add(config(),'2026-11-30T22:00:00','2026-12-01T02:00:00',{mode:'hourly',hourly:100});
  const v=snapshot(s,new Date('2026-12-01T02:00:00'));
  assert.equal(v.day,'2026-11-30'); assert.equal(v.month,'2026-11'); close(v.overtimeEarned,400);
  assert.equal(snapshot(s,new Date('2026-12-01T09:00:00')).day,'2026-12-01');
});
test('夜班后凌晨加班归属前一工作日',()=>{
  const s=add(config({start:'22:00',end:'06:00',breakEnabled:false}),'2026-11-21T06:00:00','2026-11-21T08:00:00',{mode:'multiplier',multiplier:2});
  assert.equal(s.overtimeRecords[0].day,'2026-11-20'); close(s.overtimeRecords[0].rate,200);
});
test('到次日正常计薪段停止累计，继续展示新班次收入',()=>{
  let s=changeOvertime(config({overtimeMode:'hourly',overtimeHourly:100}),'start',{id:'active'},time('2026-11-19T18:00:00'));
  assert.equal(s.overtimeRecords[0].limit,time('2026-11-20T09:00:00'));
  const v=snapshot(s,new Date('2026-11-20T10:00:00'));
  assert.equal(v.status,'overtime-limit'); assert.equal(v.day,'2026-11-20'); close(v.today,100); close(v.overtimeRunningSeconds,15*3600);
  s=changeOvertime(s,'stop',{id:'active'},time('2026-11-20T10:00:00'));
  assert.equal(s.overtimeRecords[0].end,time('2026-11-20T09:00:00'));
});
test('休息日连续记录上限为 24 小时，系统时间倒退不产生负收入',()=>{
  let s=changeOvertime(config(),'start',{id:'active'},time('2026-11-21T10:00:00'));
  assert.equal(s.overtimeRecords[0].limit,time('2026-11-22T10:00:00'));
  close(snapshot(s,new Date('2026-11-21T09:00:00')).overtimeRunningSeconds,0);
  s=changeOvertime(s,'stop',{id:'active'},time('2026-11-21T09:00:00'));
  assert.equal(s.overtimeRecords.length,0);
});
test('拒绝重叠、未来时间、无效费用和超长记录',()=>{
  const s=config();
  for(const [start,end] of [['2026-11-19T17:00:00','2026-11-19T20:00:00'],['2026-11-19T18:00:00','2026-11-20T10:00:00'],['2026-11-21T09:00:00','2026-11-22T10:00:00'],['2026-11-19T20:00:00','2026-11-19T18:00:00'],['2027-01-01T18:00:00','2027-01-01T20:00:00']]) assert.throws(()=>add(s,start,end));
  assert.throws(()=>add(s,'2026-11-19T18:00:00','2026-11-19T20:00:00',{mode:'hourly',hourly:0}));
  const recorded=add(s,'2026-11-19T18:00:00','2026-11-19T20:00:00');
  assert.throws(()=>add(recorded,'2026-11-19T19:00:00','2026-11-19T21:00:00',{id:'second'}));
  assert.throws(()=>validateSettings({...recorded,currency:'USD'}));
  assert.throws(()=>validateSettings({...recorded,end:'21:00'}));
});
test('编辑时间保留原费率，删除更新全部统计',()=>{
  let s=add(config(),'2026-11-19T18:00:00','2026-11-19T20:00:00',{mode:'multiplier',multiplier:2});
  s=changeOvertime({...s,salary:1600},'update',{id:'record-1',start:time('2026-11-19T19:00:00'),end:time('2026-11-19T20:00:00'),hourly:999},time('2026-11-19T21:00:00'));
  close(s.overtimeRecords[0].rate,200); close(snapshot(s,new Date('2026-11-19T21:00:00')).overtimeEarned,200);
  s=changeOvertime(s,'delete',{id:'record-1'}); assert.equal(s.overtimeRecords.length,0);
});
test('无排班月的倍率需要自定义时薪，午休加班限于下一计薪段',()=>{
  const overrides=Object.fromEntries(Array.from({length:30},(_,i)=>[`2026-11-${String(i+1).padStart(2,'0')}`,false]));
  assert.throws(()=>add(config({salaryMode:'monthly',overrides}),'2026-11-21T09:00:00','2026-11-21T10:00:00',{mode:'multiplier'}));
  const s=changeOvertime(config(),'start',{id:'lunch'},time('2026-11-19T12:00:00'));
  assert.equal(s.overtimeRecords[0].limit,time('2026-11-19T13:00:00'));
});
