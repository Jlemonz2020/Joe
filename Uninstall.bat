@echo off
setlocal
set "APP_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%APP_DIR%uninstall\Uninstall-HC-AI-Assistant.ps1"
endlocal
