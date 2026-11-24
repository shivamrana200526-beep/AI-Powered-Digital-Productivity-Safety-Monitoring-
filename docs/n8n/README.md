# AIPD + n8n Parent Security Automation

This directory contains the ready-to-use n8n workflow to receive real-time anti-tamper alerts and security notifications from AIPD.

## Quick Setup (3 Steps)

### 1. Launch n8n
Run in any terminal:
```bash
npx n8n
```
Open `http://localhost:5678` in your browser.

### 2. Import the Workflow
1. In n8n, click **Workflows** -> **Import from File...**
2. Select [`aipd-parent-shield-workflow.json`](./aipd-parent-shield-workflow.json).
3. Click **Save** and toggle the workflow to **Active**.

### 3. Configure AIPD `.env`
In `d:/AIPD/.env`, add:
```env
N8N_SECURITY_WEBHOOK_URL=http://localhost:5678/webhook/aipd-security-alert
```

## Adding Notification Destinations (Discord, Telegram, WhatsApp, Email)
In the n8n canvas:
- Connect the **Format Urgent Message** node to:
  - **Discord Webhook Node**: Paste your Discord channel webhook URL.
  - **Telegram Node**: Send an instant direct message to your phone.
  - **Email (SMTP/Gmail/Resend) Node**: Send an alert email to the parent.
