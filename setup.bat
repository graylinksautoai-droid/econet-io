@echo off
echo ========================================
echo EcoNet Command Center Setup
echo ========================================
echo.

echo Checking system requirements...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js is installed
echo.

echo Installing frontend dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install frontend dependencies
    pause
    exit /b 1
)

echo Frontend dependencies installed successfully
echo.

echo Creating environment configuration...
if not exist .env (
    copy .env.example .env
    echo Environment file created from template
) else (
    echo Environment file already exists
)

echo.
echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Edit .env file with your API keys and configuration
echo 2. Run 'npm start' to start the development server
echo 3. Open http://localhost:5173 in your browser
echo.
echo For API integration setup, see API_INTEGRATION_GUIDE.md
echo.
pause
