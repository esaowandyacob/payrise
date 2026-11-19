const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, screen } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
let core, settings, tray, dashboard, widget, quitting = false, warning = '', storePath, heartbeat;
const smoke = process.argv.includes('--smoke-test');
let smokeDir;
if (smoke) {
  smokeDir = process.env.PAYRISE_SMOKE_USER_DATA || fs.mkdtempSync(path.join(os.tmpdir(), 'payrise-smoke-'));
  app.setPath('userData', smokeDir);
}
app.setName('Payrise');

// 原子写入私有配置文件，临时文件与目标位于同一文件系统。
function persist(next) {
  const validated = core.validateSettings(next);
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(`${storePath}.tmp`, JSON.stringify(validated, null, 2), { mode: 0o600 });
  fs.renameSync(`${storePath}.tmp`, storePath);
  settings = validated;
}

// 启动时读取用户设置，损坏文件备份后提示，避免无声覆盖。
function loadSettings() {
  const fallback = { ...core.DEFAULT_SETTINGS, goalStart: core.dateKey(new Date()) };
  if (!fs.existsSync(storePath)) { persist(fallback); return; }
  try { settings = core.validateSettings(JSON.parse(fs.readFileSync(storePath, 'utf8'))); }
  catch {
    const backup = `${storePath}.invalid-${Date.now()}.bak`;
    fs.copyFileSync(storePath, backup);
    fs.chmodSync(backup, 0o600);
    warning = '设置文件无法读取，已在本地保留备份并恢复默认值，请重新确认薪资。';
    persist(fallback);
  }
}

// 构造一个统一状态对象，让仪表盘、悬浮窗与菜单栏使用同一计薪结果。
function state() {
  return { settings, snapshot: core.snapshot(settings), warning };
}

// 采用沙箱与独立上下文创建本地窗口，并阻止远程页面与新窗口。
function createWindow(mode) {
  const floating = mode === 'widget';
  const window = new BrowserWindow({
    width: floating ? 340 : 1080, height: floating ? 230 : 800,
    minWidth: floating ? 340 : 800, minHeight: floating ? 230 : 640,
    resizable: !floating, frame: !floating, titleBarStyle: floating ? undefined : 'hiddenInset',
    title: floating ? 'Payrise · 悬浮窗' : 'Payrise · 薪光',
    backgroundColor: '#f5f3ed', show: false,
    alwaysOnTop: floating && settings.pinned, opacity: floating ? settings.opacity : 1,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, backgroundThrottling: !smoke }
  });
  // 页面没有外链导航权限，所有资源仅来自应用包。
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  window.loadFile(path.join(__dirname, '../src/renderer/index.html'), { query: { mode } });
  window.once('ready-to-show', () => { if (!smoke) window.show(); });
  // 关闭窗口时保留菜单栏入口，退出由菜单或快捷键明确触发。
  window.on('close', event => { if (!quitting && !smoke) { event.preventDefault(); window.hide(); } });
  if (floating) {
    const area = screen.getPrimaryDisplay().workArea;
    window.setPosition(area.x + area.width - 364, area.y + 40);
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  return window;
}

// 显示仪表盘并恢复应用焦点。
function showDashboard() {
  dashboard.show(); dashboard.focus();
}

// 为菜单栏创建模板图标，自动适配系统深浅色。
function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../assets/trayTemplate.png'));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Payrise · 薪光');
  tray.on('click', showDashboard);
  tray.on('right-click', () => tray.popUpContextMenu(Menu.buildFromTemplate([
    { label: '打开薪光', click: showDashboard },
    { label: '切换悬浮窗', click: () => perform('widget') },
    { label: '隐藏金额', type: 'checkbox', checked: settings.privacy, click: () => perform('privacy') },
    { type: 'separator' }, { label: '退出 Payrise', click: () => app.quit() }
  ])));
}

// 每秒从当前系统时间重算，避免休眠、隐藏窗口和后台节流造成漏算。
function broadcast() {
  const next = state();
  const symbol = { CNY: '¥', USD: '$', EUR: '€', JPY: '¥', HKD: 'HK$' }[settings.currency];
  tray?.setTitle(settings.privacy ? '••••' : `${symbol}${next.snapshot.today.toFixed(2)}`, { fontType: 'monospacedDigit' });
  for (const window of [dashboard, widget]) if (window && !window.isDestroyed()) window.webContents.send('state:update', next);
}

// 仅接受来自本应用顶层页面的 IPC，防止 iframe 或其他窗口调用特权功能。
function assertSender(event) {
  const valid = [dashboard, widget].some(window => window && event.sender === window.webContents);
  const expected = pathToFileURL(path.join(__dirname, '../src/renderer/index.html')).href;
  if (!valid || event.senderFrame !== event.sender.mainFrame || !event.senderFrame.url.startsWith(`${expected}?`)) throw new Error('来源无效');
}

// 执行固定白名单动作；休息计时只是收入子集，不额外累加工资。
function perform(action) {
  switch (action) {
    case 'dashboard': showDashboard(); break;
    case 'widget': widget.isVisible() ? widget.hide() : widget.show(); break;
    case 'privacy': persist({ ...settings, privacy: !settings.privacy }); break;
    case 'rest': {
      const active = settings.restStart !== null && settings.restEnd === null;
      persist({ ...settings, restStart: active ? settings.restStart : Date.now(), restEnd: active ? Date.now() : null });
      break;
    }
    default: throw new Error('不支持的操作');
  }
  broadcast(); return state();
}

// 注册窄化 IPC 接口，校验失败以可显示的错误返回。
function registerIPC() {
  ipcMain.handle('state:get', event => { assertSender(event); return state(); });
  ipcMain.handle('settings:save', (event, input) => {
    assertSender(event);
    try {
      // 表单不能伪造休息计时，计时字段由主进程维护。
      persist({ ...input, restStart: settings.restStart, restEnd: settings.restEnd, overtimeRecords: settings.overtimeRecords });
      warning = '';
      widget.setAlwaysOnTop(settings.pinned); widget.setOpacity(settings.opacity);
      broadcast(); return { ok: true, state: state() };
    } catch (error) { return { ok: false, error: error.message }; }
  });
  ipcMain.handle('app:action', (event, action) => { assertSender(event); return perform(action); });
  // 加班记录只由专用接口更改，标识和当前时间均由主进程产生。
  ipcMain.handle('overtime:change', (event, command, input = {}) => {
    assertSender(event);
    try {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('加班操作格式无效');
      const payload = {...input};
      if (command === 'start' || command === 'add') payload.id = randomUUID();
      persist(core.changeOvertime(settings, command, payload));
      broadcast(); return {ok:true,state:state()};
    } catch (error) { return {ok:false,error:error.message}; }
  });
}

// 在隔离配置目录中验证真实 Electron 页面、IPC 和主题，不读取真实工资。
async function runSmoke() {
  // 等待页面加载完成，避免在脚本执行前读取状态。
  async function ready(window) {
    if (window.webContents.isLoading()) await new Promise(resolve => window.webContents.once('did-finish-load', resolve));
  }
  await Promise.all([ready(dashboard), ready(widget)]);
  const result = await dashboard.webContents.executeJavaScript(`(async () => {
    const state = await window.payrise.getState();
    const saved = await window.payrise.saveSettings({...state.settings, salary: 15000, theme: 'midnight'});
    const invalid = await window.payrise.saveSettings({...state.settings, salary: -1});
    await window.payrise.action('privacy');
    const after = await window.payrise.getState();
    return {rendered: !!document.querySelector('#income'), sandboxed: typeof require === 'undefined', saved: saved.ok, rejected: !invalid.ok, theme: after.settings.theme, privacy: after.settings.privacy};
  })()`);
  const widgetMode = await widget.webContents.executeJavaScript(`document.body.dataset.mode`);
  if (!result.rendered || !result.sandboxed || !result.saved || !result.rejected || result.theme !== 'wick' || !result.privacy || widgetMode !== 'widget') throw new Error('Electron smoke failed');
  // 使用真实主题控件检查保存、双窗同步及未提交表单不被主题切换覆盖。
  for (const theme of ['lumen', 'folio', 'wick']) {
    await dashboard.webContents.executeJavaScript(`(() => {
      document.querySelector('[name="salary"]').value = '23456';
      const picker = document.querySelector('#quick-theme');
      picker.value = '${theme}'; picker.dispatchEvent(new Event('change', {bubbles: true}));
    })()`);
    for (let attempt = 0; attempt < 50; attempt++) {
      if (await dashboard.webContents.executeJavaScript(`!document.querySelector('#quick-theme').disabled && document.body.dataset.theme === '${theme}'`)) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const mainOK = await dashboard.webContents.executeJavaScript(`document.body.dataset.theme === '${theme}' && document.querySelector('[name="salary"]').value === '23456'`);
    const widgetOK = await widget.webContents.executeJavaScript(`document.body.dataset.theme === '${theme}'`);
    if (!mainOK || !widgetOK || JSON.parse(fs.readFileSync(storePath)).theme !== theme) throw new Error('Theme synchronization failed: ' + theme);
  }
  // 使用实际按钮和补录表单验证账本流程，所有日期均来自隔离测试时钟附近。
  const overtimeOK = await dashboard.webContents.executeJavaScript(`(async () => {
    const initial = (await window.payrise.getState()).settings;
    const overrides = {};
    for (let offset=-5; offset<=2; offset++) {
      const d=new Date();d.setDate(d.getDate()+offset);
      overrides[d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')]=false;
    }
    // 等待真实界面收到主进程广播，而非假设 IPC 返回即完成渲染。
    async function until(check) {
      for(let i=0;i<100;i++){if(await check())return;await new Promise(r=>setTimeout(r,30));}
      throw new Error('Overtime UI timed out: '+document.querySelector('#overtime-message').textContent);
    }
    // 本地日期输入保持秒精度。
    function local(t){const d=new Date(t);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,19);}
    let result=await window.payrise.saveSettings({...initial,privacy:false,overrides,overtimeMode:'hourly',overtimeHourly:120});
    if(!result.ok)throw new Error(result.error);
    document.querySelector('#overtime-toggle').click();
    await until(async()=>!!(await window.payrise.getState()).snapshot.overtimeActive && !document.querySelector('#overtime-toggle').disabled);
    await new Promise(r=>setTimeout(r,80));
    document.querySelector('#overtime-toggle').click();
    await until(async()=>!(await window.payrise.getState()).snapshot.overtimeActive && !document.querySelector('#overtime-toggle').disabled);
    const f=document.querySelector('#overtime-form');
    const start=Date.now()-3*86400000;
    f.elements.start.value=local(start);f.elements.end.value=local(start+3600000);
    f.elements.mode.value='hourly';f.elements.hourly.value='80';
    f.requestSubmit();
    await until(async()=>(await window.payrise.getState()).settings.overtimeRecords.length===2 && !document.querySelector('#overtime-toggle').disabled);
    let state=await window.payrise.getState();
    const record=state.settings.overtimeRecords.find(r=>r.rate===80);
    document.querySelector('button[data-action="edit"][data-id="'+record.id+'"]').click();
    f.elements.end.value=local(record.start+7200000);f.requestSubmit();
    await until(async()=>(await window.payrise.getState()).settings.overtimeRecords.find(r=>r.id===record.id).end-record.start===7200000 && !document.querySelector('#overtime-toggle').disabled);
    result=await window.payrise.saveSettings({...state.settings,overtimeRecords:[]});
    if(!result.ok || result.state.settings.overtimeRecords.length!==2)throw new Error('Stale settings overwrote overtime ledger');
    const future=await window.payrise.overtime('add',{start:Date.now()+3600000,end:Date.now()+7200000});
    if(future.ok)throw new Error('Future overtime accepted');
    const currency=await window.payrise.saveSettings({...state.settings,currency:'USD'});
    if(currency.ok)throw new Error('Currency switch accepted with ledger');
    await window.payrise.action('privacy');
    await until(()=>document.querySelector('#overtime-details').hidden && document.querySelector('#overtime-breakdown').textContent.includes('••••'));
    const diskState=await window.payrise.getState();
    return {ok:true,ids:diskState.settings.overtimeRecords.map(r=>r.id)};
  })()`);
  if (!overtimeOK.ok || JSON.parse(fs.readFileSync(storePath)).overtimeRecords.length !== 2) throw new Error('Overtime persistence failed');
  loadSettings();
  if (settings.overtimeRecords.length !== 2) throw new Error('Overtime reload failed');
  await widget.webContents.executeJavaScript(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  if (!await widget.webContents.executeJavaScript(`document.body.dataset.private === 'true' && document.querySelector('#widget-income').textContent === '••••'`)) throw new Error('Overtime widget privacy failed');
  for (const id of overtimeOK.ids) {
    const deleted = await dashboard.webContents.executeJavaScript(`window.payrise.overtime('delete', {id:${JSON.stringify(id)}})`);
    if (!deleted.ok) throw new Error('Overtime delete failed');
  }
  persist({...core.DEFAULT_SETTINGS,goalStart:core.dateKey(new Date()),theme:'wick',privacy:true});
  broadcast();
  if (process.env.PAYRISE_SMOKE_OUTPUT) {
    clearInterval(heartbeat);
    fs.mkdirSync(process.env.PAYRISE_SMOKE_OUTPUT, { recursive: true });
    for (const theme of ['lumen', 'folio', 'wick']) {
      const past = core.changeOvertime({...settings,overtimeRecords:[]},'add',{id:'history-demo',start:new Date('2026-11-18T18:00:00').getTime(),end:new Date('2026-11-18T20:00:00').getTime(),mode:'unpaid'},new Date('2026-11-19T18:00:00').getTime());
      const fixture = core.changeOvertime({...past,overtimeMode:'hourly'},'start',{id:'demo'},new Date('2026-11-19T18:00:00').getTime());
      persist({ ...fixture, theme, privacy: false, goalStart: '2026-11-18' });
      const demo = { settings, snapshot: core.snapshot(settings, new Date('2026-11-19T19:16:30')), warning: '' };
      for (const window of [dashboard, widget]) window.webContents.send('state:update', demo);
      // 等待 Chromium 提交一次绘制后捕获真实窗口，用示例工资避免隐私泄漏。
      await Promise.all([dashboard, widget].map(window => window.webContents.executeJavaScript(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)));
      const renderedTheme = await dashboard.webContents.executeJavaScript(`document.body.dataset.theme`);
      if (renderedTheme !== theme) throw new Error('Theme paint mismatch');
      fs.writeFileSync(path.join(process.env.PAYRISE_SMOKE_OUTPUT, `${theme}.png`), (await dashboard.webContents.capturePage()).toPNG());
      fs.writeFileSync(path.join(process.env.PAYRISE_SMOKE_OUTPUT, `${theme}-widget.png`), (await widget.webContents.capturePage()).toPNG());
      await dashboard.webContents.executeJavaScript(`(() => {document.querySelector('#overtime-details').open=true;document.querySelector('#overtime-details').scrollIntoView();})()`);
      await dashboard.webContents.executeJavaScript(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
      if (!await dashboard.webContents.executeJavaScript(`document.querySelectorAll('#overtime-history .overtime-row').length === 2 && document.documentElement.scrollWidth <= innerWidth`)) throw new Error('Overtime history rendering failed');
      fs.writeFileSync(path.join(process.env.PAYRISE_SMOKE_OUTPUT, `${theme}-history.png`), (await dashboard.webContents.capturePage()).toPNG());
      await dashboard.webContents.executeJavaScript(`(() => {document.querySelector('#overtime-details').open=false;window.scrollTo(0,0);})()`);
      // 最小窗口下覆盖最大金额、长目标名和所有班次状态，检查横向溢出。
      dashboard.setSize(800, 640);
      for (const status of ['before', 'earning', 'break', 'after', 'off', 'overtime-paid', 'overtime-unpaid', 'overtime-limit']) {
        const edge = { ...demo, settings: { ...settings, goalName: '愿望名称'.repeat(15) }, snapshot: { ...demo.snapshot, status, today: 100000000, goalEarned: 100000000, monthEarned: 100000000 } };
        for (const window of [dashboard, widget]) window.webContents.send('state:update', edge);
        await Promise.all([dashboard, widget].map(window => window.webContents.executeJavaScript(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)));
        for (const window of [dashboard, widget]) {
          const fits = await window.webContents.executeJavaScript(`(() => {
            const amount = document.querySelector(document.body.dataset.mode === 'widget' ? '#widget-income' : '#income');
            return document.documentElement.scrollWidth <= innerWidth && amount.scrollWidth <= amount.clientWidth + 1 && document.body.dataset.status === '${status}';
          })()`);
          if (!fits) throw new Error('Theme overflow: ' + theme + '/' + status);
        }
      }
      fs.writeFileSync(path.join(process.env.PAYRISE_SMOKE_OUTPUT, `${theme}-small.png`), (await dashboard.webContents.capturePage()).toPNG());
      fs.writeFileSync(path.join(process.env.PAYRISE_SMOKE_OUTPUT, `${theme}-large-widget.png`), (await widget.webContents.capturePage()).toPNG());
      dashboard.setSize(1080, 800);
    }
    perform('privacy');
    await Promise.all([dashboard, widget].map(window => window.webContents.executeJavaScript(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)));
    const masked = await dashboard.webContents.executeJavaScript(`document.querySelector('#income').textContent === '••••' && document.querySelector('#settings').hidden`);
    const widgetMasked = await widget.webContents.executeJavaScript(`document.querySelector('#widget-income').textContent === '••••'`);
    if (!masked || !widgetMasked) throw new Error('Privacy render failed');
    fs.writeFileSync(path.join(process.env.PAYRISE_SMOKE_OUTPUT, 'privacy.png'), (await dashboard.webContents.capturePage()).toPNG());
  }
  console.log('PAYRISE_SMOKE_OK ' + JSON.stringify({ ...result, widgetMode, overtime: overtimeOK.ok }));
}

// 初始化应用；macOS 关闭所有窗口后仍保留菜单栏。
async function boot() {
  core = await import('../src/core/earnings.js');
  storePath = path.join(app.getPath('userData'), 'settings.json');
  loadSettings();
  dashboard = createWindow('dashboard'); widget = createWindow('widget');
  registerIPC(); createTray();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Payrise', submenu: [{ role: 'about' }, { label: '显示主窗口', click: showDashboard }, { type: 'separator' }, { role: 'quit' }] },
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'zoom' }] }
  ]));
  heartbeat = setInterval(broadcast, 1000); broadcast();
  if (smoke) { try { await runSmoke(); } catch (error) { console.error(error.message); process.exitCode = 1; } finally { app.quit(); } }
}

if (!smoke && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => dashboard && showDashboard());
  app.whenReady().then(boot).catch(error => {
    console.error('Payrise startup failed:', error.message);
    if (!smoke) dialog.showErrorBox('Payrise 无法启动', error.message);
    process.exitCode = 1; app.quit();
  });
  app.on('activate', () => dashboard && showDashboard());
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => { quitting = true; clearInterval(heartbeat); });
  // Chromium 子进程退出后再由外部测试脚本清理目录，避免退出回调中的文件竞态。
}
