@echo off
set "ROOT=\\wsl.localhost\Ubuntu\home\manofneptune2792\Projects\Multitool"
set /a TRIES=0

:waitpath
if exist "%ROOT%\helper\server.py" goto ready
set /a TRIES+=1
if %TRIES% GEQ 30 exit /b 1
ping -n 3 127.0.0.1 >nul
goto waitpath

:ready
py -3 -c "import socket;s=socket.socket();r=s.connect_ex(('127.0.0.1',8765));s.close();raise SystemExit(0 if r==0 else 1)"
if %ERRORLEVEL%==0 exit /b 0
start "" pyw -3 "%ROOT%\helper\server.py"
