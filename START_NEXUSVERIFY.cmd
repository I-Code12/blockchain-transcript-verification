@echo off
title NexusVerify Presentation
cd /d "%~dp0"
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js is required. Install Node.js 22 or newer, then run this file again.
  echo  Download: https://nodejs.org/
  pause
  exit /b 1
)
echo  Preparing the NexusVerify school demonstration...
for %%D in (blockchain backend frontend) do (
  if not exist "%%D\node_modules" (
    echo  Installing %%D components for first use...
    pushd "%%D"
    call npm.cmd install --no-audit --no-fund
    if errorlevel 1 (
      popd
      echo  Setup could not complete. Check the internet connection and try again.
      pause
      exit /b 1
    )
    popd
  )
)
echo.
echo  Starting Ethereum, the secure API, and the website...
echo.
node scripts\start-system.mjs
pause
