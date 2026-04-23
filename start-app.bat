@echo off
echo Starting EcoNet Application...
echo.

echo Starting Backend Server...
cd server
start "Backend Server" cmd /k "node index.js"
timeout /t 3 /nobreak >nul

echo Starting Frontend Server...
cd ..
start "Frontend Server" cmd /k "npm run dev"

echo.
echo Both servers should be starting...
echo Backend: http://localhost:5000
echo Frontend: http://localhost:5173
echo.
echo Press any key to exit...
pause >nul
