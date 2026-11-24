import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');
const workflowJsonPath = path.resolve(projectRoot, 'docs/n8n/aipd-parent-shield-workflow.json');

export async function isN8nResponding(baseUrl = 'http://localhost:5678') {
  try {
    const res = await fetch(`${baseUrl}/rest/settings`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function activateLiveWorkflow(baseUrl = 'http://localhost:5678') {
  const email = 'parent@example.com';
  const password = 'Password123!';

  console.log('[n8n Activator] Authenticating with n8n...');
  let loginRes = await fetch(`${baseUrl}/rest/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailOrLdapLoginId: email, password })
  });

  let cookie = loginRes.headers.get('set-cookie');
  if (!loginRes.ok) {
    const setupRes = await fetch(`${baseUrl}/rest/owner/setup`, {
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
  }

  const authCookie = cookie ? cookie.split(';')[0] : '';
  const headers = {
    'Content-Type': 'application/json',
    ...(authCookie ? { Cookie: authCookie } : {})
  };

  const listRes = await fetch(`${baseUrl}/rest/workflows`, { headers });
  const listJson = await listRes.json();
  const existing = listJson.data?.find(w => w.name && (w.name.includes('Parent Security') || w.name.includes('AIPD')));

  let workflowId;
  let isActive = false;

  if (existing) {
    workflowId = existing.id;
    isActive = existing.active;
    console.log(`[n8n Activator] Found existing workflow "${existing.name}" (ID: ${workflowId}, Active: ${isActive})`);
  } else {
    if (!fs.existsSync(workflowJsonPath)) {
      throw new Error(`Workflow template not found at: ${workflowJsonPath}`);
    }
    const workflowData = JSON.parse(fs.readFileSync(workflowJsonPath, 'utf8'));
    const createRes = await fetch(`${baseUrl}/rest/workflows`, {
      method: 'POST',
      headers,
      body: JSON.stringify(workflowData)
    });
    const createJson = await createRes.json();
    workflowId = createJson.id;
    console.log(`[n8n Activator] Imported workflow template with ID: ${workflowId}`);
  }

  if (!isActive) {
    console.log(`[n8n Activator] Activating workflow (ID: ${workflowId})...`);
    const activateRes = await fetch(`${baseUrl}/rest/workflows/${workflowId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ active: true })
    });
    const actJson = await activateRes.json();
    isActive = actJson.active === true || actJson.data?.active === true;
  }

  // Verify live webhook
  const testPayload = {
    event: 'STARTUP_VERIFICATION',
    severity: 'INFO',
    timestamp: new Date().toISOString(),
    details: { reason: 'Automated verification on server start' }
  };

  const webhookRes = await fetch(`${baseUrl}/webhook/aipd-security-alert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testPayload)
  });

  const webhookText = await webhookRes.text();
  console.log(`[n8n Activator] Live Webhook Status: ${webhookRes.status} (${webhookText})`);

  return {
    success: webhookRes.status === 200,
    workflowId,
    webhookUrl: `${baseUrl}/webhook/aipd-security-alert`
  };
}
