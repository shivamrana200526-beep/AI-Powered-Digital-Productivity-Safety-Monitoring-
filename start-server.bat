@echo off
title AIPD - AI Study & Safety Coach (with Live n8n Workflow)
cls
echo =====================================================================
echo   AIPD - AI Productivity ^& Safety Monitoring System
echo   Starting Node.js Backend, Real-time Engine, and n8n Workflow...
echo =====================================================================
echo.

cd /d "%~dp0"

:: Check and reclaim port 4000 if occupied
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4000 ^| findstr LISTENING') do (
    echo [Port Recovery] Reclaiming port 4000 from stale process PID %%a...
    taskkill /F /PID %%a >nul 2>&1
)

:: Start the unified server orchestrator
node scripts/start-all.js

pause
