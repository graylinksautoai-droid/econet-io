# EcoNet Simple Deployment Script (PowerShell - No Docker)

Write-Host "=== EcoNet Simple Deployment ===" -ForegroundColor Green

# Check if Node.js is installed
try {
    node --version | Out-Null
    Write-Host "Node.js is installed" -ForegroundColor Green
} catch {
    Write-Host "Node.js is not installed. Please install Node.js first." -ForegroundColor Red
    exit 1
}

# Check if PM2 is installed
try {
    pm2 --version | Out-Null
    Write-Host "PM2 is installed" -ForegroundColor Green
} catch {
    Write-Host "Installing PM2..." -ForegroundColor Blue
    npm install -g pm2
}

# Install dependencies
Write-Host "Installing backend dependencies..." -ForegroundColor Blue
Set-Location server
npm ci --only=production
Set-Location ..

Write-Host "Installing frontend dependencies..." -ForegroundColor Blue
npm ci --only=production

# Build frontend
Write-Host "Building frontend..." -ForegroundColor Blue
npm run build

# Start backend with PM2
Write-Host "Starting backend server..." -ForegroundColor Blue
pm2 start ecosystem.config.js --env production

# Wait for backend to start
Write-Host "Waiting for backend to start..." -ForegroundColor Blue
Start-Sleep -Seconds 10

# Test backend health
Write-Host "Testing backend health..." -ForegroundColor Blue
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5000" -TimeoutSec 10
    if ($response.StatusCode -eq 200) {
        Write-Host "Backend is healthy!" -ForegroundColor Green
    } else {
        Write-Host "Backend health check failed!" -ForegroundColor Red
    }
} catch {
    Write-Host "Backend health check failed!" -ForegroundColor Red
}

# Create simple web server for frontend (since nginx setup is complex on Windows)
Write-Host "Starting frontend server..." -ForegroundColor Blue
$frontendJob = Start-Job -ScriptBlock {
    Set-Location $args[0]
    npx serve dist -l 80
} -ArgumentList (Get-Location)

Write-Host "=== Deployment Complete! ===" -ForegroundColor Green
Write-Host "Backend API: http://localhost:5000" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:80" -ForegroundColor Cyan
Write-Host "Alternative Frontend: http://localhost:5173 (development mode)" -ForegroundColor Cyan
Write-Host "" -ForegroundColor Gray
Write-Host "Management Commands:" -ForegroundColor Yellow
Write-Host "View PM2 status: pm2 status" -ForegroundColor Gray
Write-Host "View logs: pm2 logs" -ForegroundColor Gray
Write-Host "Stop backend: pm2 stop econet-backend" -ForegroundColor Gray
Write-Host "Restart backend: pm2 restart econet-backend" -ForegroundColor Gray
Write-Host "Stop frontend: Stop-Job -Name Job1" -ForegroundColor Gray
