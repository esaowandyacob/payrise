const { spawnSync } = require('node:child_process');
const electron = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'payrise-smoke-'));
const result = spawnSync(electron, ['.', '--smoke-test'], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 45000, env: { ...process.env, ELECTRON_RUN_AS_NODE: '', PAYRISE_SMOKE_USER_DATA: userData } });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.error) console.error(result.error.message);
// 等待主进程与子进程完成退出后重试删除，只清理由本脚本创建的临时目录。
try { fs.rmSync(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
catch (error) { console.error(`测试临时目录保留待清理：${userData} (${error.code})`); }
process.exit(result.status === 0 && result.stdout?.includes('PAYRISE_SMOKE_OK') ? 0 : 1);
