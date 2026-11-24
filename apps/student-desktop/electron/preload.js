const { contextBridge, ipcRenderer } = require('electron');

/**
 * Secure Preload Script with Strict IPC Allowlist
 * Conforming to Specification Section 17
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // Session management
  startSession: (data) => ipcRenderer.invoke('session:start', data),
  endSession: (data) => ipcRenderer.invoke('session:end', data),
  getSessionState: () => ipcRenderer.invoke('session:getState'),
  captureScreen: () => ipcRenderer.invoke('screen:capture'),

  // Pairing
  redeemPairingCode: (data) => ipcRenderer.invoke('pairing:redeem', data),

  // Heartbeat & status
  getDeviceStatus: () => ipcRenderer.invoke('device:getStatus'),

  // Interaction tracking (aggregate increment from UI)
  recordInteraction: () => ipcRenderer.send('input:interaction'),

  // Event listeners for renderer
  onDistractionWarning: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('student:distraction_warning', handler);
    return () => ipcRenderer.removeListener('student:distraction_warning', handler);
  },

  onProtectionUpdated: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('device:protection_updated', handler);
    return () => ipcRenderer.removeListener('device:protection_updated', handler);
  },

  onSessionUpdated: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('session:updated', handler);
    return () => ipcRenderer.removeListener('session:updated', handler);
  },
});
