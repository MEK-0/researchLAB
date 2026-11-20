// Yalnızca uygulamanın kendi ekranları (loading/problem, file://) için köprü.
// Main process her mesajda gönderenin file:// olduğunu ayrıca denetler.
const { contextBridge, ipcRenderer } = require('electron');
if (location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('rl', {
    retry: () => ipcRenderer.send('rl:retry'),
    chooseRepo: () => ipcRenderer.send('rl:choose-repo'),
    quit: () => ipcRenderer.send('rl:quit'),
    openLog: name => ipcRenderer.send('rl:open-log', name),
  });
}
