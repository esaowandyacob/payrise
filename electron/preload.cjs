const { contextBridge, ipcRenderer } = require('electron');

// 只向渲染页面开放固定功能，不暴露文件系统、任意 IPC 或 Node.js。
contextBridge.exposeInMainWorld('payrise', Object.freeze({
  getState: () => ipcRenderer.invoke('state:get'),
  saveSettings: settings => ipcRenderer.invoke('settings:save', settings),
  action: action => ipcRenderer.invoke('app:action', action),
  onState: callback => {
    // 过滤 Electron 事件对象，仅传递经过主进程生成的数据。
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('state:update', listener);
    return () => ipcRenderer.removeListener('state:update', listener);
  }
}));
