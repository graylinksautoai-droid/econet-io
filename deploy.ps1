# EcoNet Deployment Script (PowerShell)

Write-Host "=== EcoNet Deployment Script ===" -ForegroundColor Green

# Check if Docker is installed
try {
    docker --version | Out-Null
    Write-Host "Docker is installed" -ForegroundColor Green
} catch {
    Write-Host "Docker is not installed. Please install Docker first." -ForegroundColor Red
    exit 1
}

# Check if Docker Compose is installed
try {
    docker-compose --version | Out-Null
    Write-Host "Docker Compose is installed" -ForegroundColor Green
} catch {
    Write-Host "Docker Compose is not installed. Please install Docker Compose first." -ForegroundColor Red
    exit 1
}

# Set environment
$env:NODE_ENV = "production"

# Load production environment variables
if (Test-Path .env.production) {
    Get-Content .env.production | ForEach-Object {
        if ($_ -match '^([^=]+)=(.*)$') {
            [Environment]::SetEnvironmentVariable($matches[1], $matches[2])
        }
    }
    Write-Host "Production environment variables loaded." -ForegroundColor Green
} else {
    Write-Host "Warning: .env.production file not found. Using default values." -ForegroundColor Yellow
}

# Build and start services
Write-Host "Building Docker images..." -ForegroundColor Blue
docker-compose build

Write-Host "Starting services..." -ForegroundColor Blue
docker-compose up -d

# Wait for services to start
Write-Host "Waiting for services to start..." -ForegroundColor Blue
Start-Sleep -Seconds 30

# Check service status
Write-Host "Checking service status..." -ForegroundColor Blue
docker-compose ps

# Test backend health
Write-Host "Testing backend health..." -ForegroundColor Blue
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5000" -TimeoutSec 10
    if ($response.StatusCode -eq 200) {
        Write-Host "Backend is healthy!" -ForegroundColor Green
    } else {
        throw "Backend returned status code: $($response.StatusCode)"
    }
} catch {
    Write-Host "Backend health check failed!" -ForegroundColor Red
    docker-compose logs backend
    exit 1
}

# Test frontend health
Write-Host "Testing frontend health..." -ForegroundColor Blue
try {
    $response = Invoke-WebRequest -Uri "http://localhost:80" -TimeoutSec 10
    if ($response.StatusCode -eq 200) {
        Write-Host "Frontend is healthy!" -ForegroundColor Green
    } else {
        throw "Frontend returned status code: $($response.StatusCode)"
    }
} catch {
    Write-Host "Frontend health check failed!" -ForegroundColor Red
    docker-compose logs frontend
    exit 1
}

Write-Host "=== Deployment Complete! ===" -ForegroundColor Green
Write-Host "Frontend: http://localhost:80" -ForegroundColor Cyan
Write-Host "Backend API: http://localhost:5000" -ForegroundColor Cyan
Write-Host "To view logs: docker-compose logs -f" -ForegroundColor Gray
Write-Host "To stop: docker-compose down" -ForegroundColor Gray
