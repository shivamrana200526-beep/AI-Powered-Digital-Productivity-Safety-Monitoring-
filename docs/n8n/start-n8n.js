#!/usr/bin/env node
/**
 * Starts n8n on Windows and activates the AIPD Parent Security Shield workflow.
 */
import { ensureN8nLiveWorkflow } from '../../services/api/src/n8n/n8nService.js';

console.log('====================================================');
console.log('  AIPD — Starting n8n & Activating Live Workflow');
console.log('====================================================');

ensureN8nLiveWorkflow()
  .then((res) => {
    if (res.success) {
      console.log('n8n is running with live workflow at:');
      console.log(' -> Editor UI:     http://localhost:5678');
      console.log(` -> Alert Webhook: ${res.webhookUrl}`);
    } else {
      console.warn('n8n started but workflow activation returned:', res);
    }
  })
  .catch((err) => {
    console.error('Failed to start n8n live workflow:', err);
    process.exit(1);
  });
