import config from '@aipd/config';

/**
 * Event-Driven Context Capture Engine with Strict Cooldown Debounce
 * Specification Section 6.5 & 19
 */
export class ContextCapture {
  constructor(options = {}) {
    this.cooldownMs = options.cooldownMs || config.contextCaptureCooldownMs;
    this.lastCaptureTime = 0;
    this.desktopCapturer = options.desktopCapturer || null;
  }

  setCapturer(capturer) {
    this.desktopCapturer = capturer;
  }

  /**
   * Checks if capture is allowed under the cooldown policy
   */
  canCapture() {
    const now = Date.now();
    return (now - this.lastCaptureTime) >= this.cooldownMs;
  }

  /**
   * Captures screen context if cooldown allows
   * @param {string} triggerReason - e.g. 'WINDOW_CHANGE', 'BASELINE', 'PERIODIC_2MIN'
   * @returns {Promise<string|null>} Base64 data URL or null if suppressed by cooldown
   */
  async captureScreenContext(triggerReason = 'WINDOW_CHANGE') {
    const isPriorityCapture = triggerReason === 'BASELINE' ||
      triggerReason.includes('PERIODIC') ||
      triggerReason.includes('WINDOW_SWITCH') ||
      triggerReason.includes('EXPLICIT') ||
      triggerReason.includes('SAFETY');
    if (!isPriorityCapture && !this.canCapture()) {
      return null;
    }

    this.lastCaptureTime = Date.now();

    try {
      if (this.desktopCapturer) {
        const sources = await this.desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 1280, height: 720 }, // High-definition real screenshot
        });

        if (sources.length > 0) {
          const thumbnail = sources[0].thumbnail;
          return thumbnail.toDataURL();
        }
      }

      // Fallback/Synthetic minimal image for test/mock environments
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    } catch (err) {
      console.warn(`[ContextCapture] Capture failed: ${err.message}`);
      return null;
    }
  }
}

export default ContextCapture;
