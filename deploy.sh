#!/bin/bash

# EcoNet Deployment Script
echo "=== EcoNet Deployment Script ==="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Set environment
export NODE_ENV=production

# Load production environment variables
if [ -f .env.production ]; then
    export $(cat .env.production | xargs)
    echo "Production environment variables loaded."
else
    echo "Warning: .env.production file not found. Using default values."
fi

# Build and start services
echo "Building Docker images..."
docker-compose build

echo "Starting services..."
docker-compose up -d

# Wait for services to start
echo "Waiting for services to start..."
sleep 30

# Check service status
echo "Checking service status..."
docker-compose ps

# Test backend health
echo "Testing backend health..."
if curl -f http://localhost:5000 > /dev/null 2>&1; then
    echo "Backend is healthy!"
else
    echo "Backend health check failed!"
    docker-compose logs backend
    exit 1
fi

# Test frontend health
echo "Testing frontend health..."
if curl -f http://localhost:80 > /dev/null 2>&1; then
    echo "Frontend is healthy!"
else
    echo "Frontend health check failed!"
    docker-compose logs frontend
    exit 1
fi

echo "=== Deployment Complete! ==="
echo "Frontend: http://localhost:80"
echo "Backend API: http://localhost:5000"
echo "To view logs: docker-compose logs -f"
echo "To stop: docker-compose down"
