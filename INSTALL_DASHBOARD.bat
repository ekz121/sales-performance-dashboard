@echo off
title Setup Sales Performance Dashboard
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-local.ps1"
