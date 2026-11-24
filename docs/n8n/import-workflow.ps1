#!/usr/bin/env pwsh
# AIPD n8n Workflow Auto-Import Script
# Logs in, imports the Parent Security Shield workflow, activates it, and verifies the webhook

$n8nBase   = "http://localhost:5678"
$email     = "parent@example.com"
$password  = "Password123!"
$workflow  = Get-Content -Raw -Path "$PSScriptRoot\aipd-parent-shield-workflow.json"

Write-Host "`n[1/5] Waiting for n8n to be ready..." -ForegroundColor Cyan
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $s = Invoke-RestMethod -Uri "$n8nBase/rest/settings" -Method GET -ErrorAction Stop
        if ($s.data) { $ready = $true; break }
    } catch {}
    Start-Sleep -Seconds 2
}
if (-not $ready) { Write-Host "[ERROR] n8n never came up." -ForegroundColor Red; exit 1 }
Write-Host "  n8n is ready!" -ForegroundColor Green

Write-Host "`n[2/5] Authenticating as owner..." -ForegroundColor Cyan
$loginBody = @{ emailOrLdapLoginId = $email; password = $password } | ConvertTo-Json
$authenticated = $false

# First try owner setup in case this is a fresh database
try {
    $setupBody = @{
        firstName = "Parent"
        lastName  = "Admin"
        email     = $email
        password  = $password
    } | ConvertTo-Json
    $setupResp = Invoke-WebRequest -Uri "$n8nBase/rest/owner/setup" `
        -Method POST `
        -ContentType "application/json" `
        -Body $setupBody `
        -SessionVariable sess `
        -ErrorAction Stop
    Write-Host "  Owner setup completed successfully!" -ForegroundColor Green
    $authenticated = $true
} catch {
    # If already setup or other error, fallback to normal login
}

if (-not $authenticated) {
    try {
        $loginResp = Invoke-WebRequest -Uri "$n8nBase/rest/login" `
            -Method POST `
            -ContentType "application/json" `
            -Body $loginBody `
            -SessionVariable sess `
            -ErrorAction Stop
        Write-Host "  Logged in! Status: $($loginResp.StatusCode)" -ForegroundColor Green
        $authenticated = $true
    } catch {
        Write-Host "[ERROR] Login failed: $_" -ForegroundColor Red
        exit 1
    }
}

# Build headers with session cookie
$cookies = $sess.Cookies.GetCookies($n8nBase)
$cookieHeader = ($cookies | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join "; "
$headers = @{ "Cookie" = $cookieHeader; "Content-Type" = "application/json" }

Write-Host "`n[3/5] Checking for existing workflow..." -ForegroundColor Cyan
$existing = Invoke-RestMethod -Uri "$n8nBase/rest/workflows" -Method GET -Headers $headers
$match = $existing.data | Where-Object { $_.name -like "*AIPD*" -or $_.name -like "*Parent Security*" }
if ($match) {
    Write-Host "  Found existing workflow: '$($match[0].name)' (id=$($match[0].id))" -ForegroundColor Yellow
    $workflowId = $match[0].id
} else {
    Write-Host "  No existing workflow found, importing..." -ForegroundColor Cyan
    $importResp = Invoke-RestMethod -Uri "$n8nBase/rest/workflows" `
        -Method POST `
        -Headers $headers `
        -Body $workflow `
        -ContentType "application/json" `
        -ErrorAction Stop
    $workflowId = $importResp.id
    Write-Host "  Imported workflow ID: $workflowId" -ForegroundColor Green
}

Write-Host "`n[4/5] Activating workflow (id=$workflowId)..." -ForegroundColor Cyan
$activateBody = @{ active = $true } | ConvertTo-Json
$activateResp = Invoke-RestMethod -Uri "$n8nBase/rest/workflows/$workflowId" `
    -Method PATCH `
    -Headers $headers `
    -Body $activateBody `
    -ContentType "application/json" `
    -ErrorAction Stop
Write-Host "  Workflow active: $($activateResp.active)" -ForegroundColor Green

Write-Host "`n[5/5] Verifying webhook endpoint..." -ForegroundColor Cyan
$testPayload = @{
    event     = "TAMPER_SUSPECTED"
    severity  = "CRITICAL"
    timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
    actor     = @{ name = "Test Parent"; role = "PARENT" }
    details   = @{ action = "Test from import script" }
    recommendedAction = "Verify device is secure"
} | ConvertTo-Json -Depth 4

try {
    $webhookResp = Invoke-RestMethod -Uri "$n8nBase/webhook/aipd-security-alert" `
        -Method POST `
        -Body $testPayload `
        -ContentType "application/json" `
        -ErrorAction Stop
    Write-Host "  Webhook LIVE! Response: $($webhookResp | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "  Webhook test warning (may still be OK): $_" -ForegroundColor Yellow
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  AIPD n8n Integration Complete!" -ForegroundColor Green
Write-Host "  Workflow ID  : $workflowId" -ForegroundColor White
Write-Host "  Webhook URL  : $n8nBase/webhook/aipd-security-alert" -ForegroundColor White
Write-Host "  n8n Dashboard: $n8nBase" -ForegroundColor White
Write-Host "========================================`n" -ForegroundColor Cyan
