@echo off
rem Starts Cedar Bear locally at http://cedarbear.localhost (no hosts-file changes needed:
rem browsers resolve *.localhost to this computer). Close this window to stop the server.
cd /d "%~dp0"
set PORT=80
set HOST=127.0.0.1
echo.
echo   Cedar Bear is starting...
echo   Open:  http://cedarbear.localhost
echo   Admin: http://cedarbear.localhost/admin
echo.
start "" http://cedarbear.localhost
"C:\Program Files\nodejs\node.exe" server\index.js
pause
