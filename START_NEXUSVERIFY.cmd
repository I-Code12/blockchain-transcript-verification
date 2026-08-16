@echo off
title NexusVerify Presentation
cd /d "%~dp0"
echo.
echo  Starting the NexusVerify blockchain system...
echo  This launches Ethereum, the secure API, and the website.
echo.
node scripts\start-system.mjs
pause
