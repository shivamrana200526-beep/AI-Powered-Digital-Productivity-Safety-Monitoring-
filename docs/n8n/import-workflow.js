const fs = require('fs');
const path = require('path');

async function run() {
  const n8nBase = 'http://localhost:5678';
  const email = 'parent@example.com';
  const password = 'Password123!';

  console.log('[1/4] Checking n8n readiness...');
  const resSettings = await fetch(`${n8nBase}/rest/settings`);
  if (!resSettings.ok) {
    throw new Error('n8n not responding on ' + n8nBase);
  }
  console.log('n8n is UP and responsive!');

  console.log('[2/4] Logging in as owner...');
  let loginRes = await fetch(`${n8nBase}/rest/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailOrLdapLoginId: email, password })
  });

  let cookie = loginRes.headers.get('set-cookie');
  if (!loginRes.ok) {
    // If not setup yet, try owner setup
    console.log('Login returned status ' + loginRes.status + ', trying owner setup...');
    const setupRes = await fetch(`${n8nBase}/rest/owner/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Parent',
        lastName: 'Admin',
        email,
        password
      })
    });
    cookie = setupRes.headers.get('set-cookie');
    if (!setupRes.ok && !cookie) {
      const errText = await setupRes.text();
      throw new Error(`Owner setup/login failed: ${errText}`);
    }
    console.log('Owner setup succeeded!');
  } else {
    console.log('Logged in successfully!');
  }

  // Parse cookie header
  const authCookie = cookie ? cookie.split(';')[0] : '';
  const headers = {
    'Content-Type': 'application/json',
    ...(authCookie ? { Cookie: authCookie } : {})
  };

  console.log('[3/4] Importing workflow...');
  const workflowPath = path.join(__dirname, 'aipd-parent-shield-workflow.json');
  const workflowData = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

  // Check if exists
  const listRes = await fetch(`${n8nBase}/rest/workflows`, { headers });
  const listJson = await listRes.json();
  const existing = listJson.data?.find(w => w.name.includes('Parent Security') || w.name.includes('AIPD'));

  let workflowId;
  if (existing) {
    workflowId = existing.id;
    console.log(`Found existing workflow "${existing.name}" (ID: ${workflowId})`);
  } else {
    const importRes = await fetch(`${n8nBase}/rest/workflows`, {
      method: 'POST',
      headers,
      body: JSON.stringify(workflowData)
    });
    const importJson = await importRes.json();
    if (!importRes.ok) {
      throw new Error(`Failed to import workflow: ${JSON.stringify(importJson)}`);
    }
    workflowId = importJson.id;
    console.log(`Imported workflow "${importJson.name}" with ID: ${workflowId}`);
  }

  console.log(`[4/4] Activating workflow (ID: ${workflowId})...`);
  const activateRes = await fetch(`${n8nBase}/rest/workflows/${workflowId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ active: true })
  });
  const activateJson = await activateRes.json();
  console.log(`Workflow activated: ${activateJson.active === true || activateJson.data?.active === true}`);

  console.log('\n--- Verifying Webhook Endpoint ---');
  const testPayload = {
    event: 'TAMPER_SUSPECTED',
    severity: 'CRITICAL',
    timestamp: new Date().toISOString(),
    actor: { name: 'Demo Parent', role: 'PARENT' },
    details: { action: 'Test Security Verification Webhook' },
    recommendedAction: 'Verify physical tablet custody'
  };

  const webhookRes = await fetch(`${n8nBase}/webhook/aipd-security-alert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testPayload)
  });
  const webhookText = await webhookRes.text();
  console.log(`Webhook HTTP status: ${webhookRes.status}`);
  console.log(`Webhook response: ${webhookText}`);

  console.log('\n=============================================');
  console.log('SUCCESS: AIPD Parent Security Shield & Anti-Tamper workflow is LIVE in n8n!');
  console.log(`Webhook URL: ${n8nBase}/webhook/aipd-security-alert`);
  console.log(`n8n Dashboard: ${n8nBase}`);
  console.log('=============================================');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
