import { exec } from 'node:child_process';
import { EventEmitter } from 'node:events';

/**
 * Windows Active Window Monitor Bridge
 * Retrieves current foreground application, window title, and process name.
 */
export class ActiveWindowMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.intervalMs = options.intervalMs || 1500;
    this.timer = null;
    this.currentWindow = null;
    this.isRunning = false;
    this.isWindows = process.platform === 'win32';
    this.mockMode = options.mockMode || false;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[WindowMonitor] Started active window tracking.');
    this.poll();
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.timer) clearTimeout(this.timer);
    console.log('[WindowMonitor] Stopped active window tracking.');
  }

  async poll() {
    if (!this.isRunning) return;
    try {
      const windowInfo = await this.getActiveWindow();
      if (this.hasChanged(windowInfo)) {
        this.currentWindow = windowInfo;
        this.emit('window-changed', {
          eventType: 'ACTIVE_WINDOW_CHANGE',
          timestamp: new Date().toISOString(),
          processName: windowInfo.processName || '',
          applicationName: windowInfo.applicationName || windowInfo.processName || 'Unknown App',
          windowTitle: windowInfo.windowTitle || '',
        });
      }
    } catch (err) {
      // Non-fatal poll warning
    } finally {
      if (this.isRunning) {
        this.timer = setTimeout(() => this.poll(), this.intervalMs);
      }
    }
  }

  hasChanged(newWin) {
    if (!this.currentWindow) return true;
    return (
      this.currentWindow.processName !== newWin.processName ||
      this.currentWindow.windowTitle !== newWin.windowTitle
    );
  }

  /**
   * Retrieves active window details
   */
  getActiveWindow() {
    if (this.mockMode || !this.isWindows) {
      return Promise.resolve(
        this.currentWindow || {
          processName: 'code.exe',
          applicationName: 'Visual Studio Code',
          windowTitle: 'BinaryTree.java - Project',
        }
      );
    }

    return new Promise((resolve) => {
      // PowerShell script to get foreground window title and process
      const psCommand = `powershell -NoProfile -NonInteractive -Command "
        $code = @'
        using System;
        using System.Runtime.InteropServices;
        using System.Text;
        public class WinActive {
            [DllImport(\\"user32.dll\\")] public static extern IntPtr GetForegroundWindow();
            [DllImport(\\"user32.dll\\")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
            [DllImport(\\"user32.dll\\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
        }
'@
        Add-Type -TypeDefinition $code -Language CSharp
        $hwnd = [WinActive]::GetForegroundWindow()
        $sb = New-Object System.Text.StringBuilder 512
        [void][WinActive]::GetWindowText($hwnd, $sb, 512)
        $procId = 0
        [void][WinActive]::GetWindowThreadProcessId($hwnd, [ref]$procId)
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        [PSCustomObject]@{
            processName = if ($proc) { $proc.ProcessName + '.exe' } else { '' }
            applicationName = if ($proc) { $proc.Description } else { '' }
            windowTitle = $sb.ToString()
        } | ConvertTo-Json -Compress
      "`;

      exec(psCommand, { timeout: 3000 }, (error, stdout) => {
        if (error || !stdout.trim()) {
          return resolve({
            processName: 'unknown',
            applicationName: 'Active App',
            windowTitle: 'Working',
          });
        }
        try {
          const parsed = JSON.parse(stdout.trim());
          resolve({
            processName: parsed.processName || '',
            applicationName: parsed.applicationName || parsed.processName || 'App',
            windowTitle: parsed.windowTitle || '',
          });
        } catch (e) {
          resolve({
            processName: 'unknown',
            applicationName: 'Active App',
            windowTitle: 'Working',
          });
        }
      });
    });
  }

  simulateWindowChange(windowInfo) {
    this.currentWindow = windowInfo;
    this.emit('window-changed', {
      eventType: 'ACTIVE_WINDOW_CHANGE',
      timestamp: new Date().toISOString(),
      processName: windowInfo.processName || '',
      applicationName: windowInfo.applicationName || windowInfo.processName || 'App',
      windowTitle: windowInfo.windowTitle || '',
    });
  }
}

export default ActiveWindowMonitor;
