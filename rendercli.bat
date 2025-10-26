@echo off
:: ==============================================================
::  Render CLI Installer Script for Windows
::  Author: Will Walshe
::  Description: Installs Node.js (if missing) and sets up Render CLI
:: ==============================================================
title Render CLI Setup
color 0A

echo =============================================================
echo                Render CLI Installer & Setup
echo =============================================================
echo.

:: --- Step 1: Check if Node.js is installed ---
echo Checking for Node.js installation...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js is not installed.
    echo Installing Node.js (LTS version)...
    powershell -Command "Start-Process msiexec.exe -ArgumentList '/i https://nodejs.org/dist/latest-lts/win-x64/node-v22.11.0-x64.msi /qn /norestart' -Wait"
    echo Node.js installation complete.
) else (
    echo Node.js is already installed.
)

:: --- Step 2: Ensure npm is available ---
echo.
echo Checking npm availability...
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo npm not found. Please install Node.js manually and re-run this script.
    pause
    exit /b 1
)
echo npm is available.

:: --- Step 3: Install Render CLI globally ---
echo.
echo Installing Render CLI globally...
npm install -g @renderinc/cli
if %errorlevel% neq 0 (
    echo Failed to install Render CLI. Please check your network connection.
    pause
    exit /b 1
)
echo Render CLI installed successfully.

:: --- Step 4: Verify installation ---
echo.
echo Verifying Render CLI installation...
render --version
if %errorlevel% neq 0 (
    echo Render CLI installation failed or not in PATH.
    echo Please restart your terminal and try again.
    pause
    exit /b 1
)
echo Render CLI is ready to use!

:: --- Step 5: (Optional) Log in to Render account ---
echo.
set /p loginChoice="Do you want to log in now? (y/n): "
if /I "%loginChoice%"=="y" (
    echo Opening Render login...
    render login
    echo Login process initiated. Follow the browser instructions.
) else (
    echo You can log in later by running: render login
)

echo.
echo =============================================================
echo ✅ Render CLI setup complete!
echo To verify, run: render --help
echo =============================================================
pause
exit /b 0
