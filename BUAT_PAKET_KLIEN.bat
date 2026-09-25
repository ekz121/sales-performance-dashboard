@echo off
title Buat Paket Klien Sales Dashboard
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\package-client.ps1"
pause
