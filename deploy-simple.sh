#!/bin/bash

# EcoNet Simple Deployment Script (No Docker)
echo "=== EcoNet Simple Deployment ==="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    npm install -g pm2
fi

# Install dependencies
echo "Installing backend dependencies..."
cd server
npm ci --only=production
cd ..

echo "Installing frontend dependencies..."
npm ci --only=production

# Build frontend
echo "Building frontend..."
npm run build

# Start backend with PM2
echo "Starting backend server..."
pm2 start ecosystem.config.js --env production

# Setup nginx (optional)
echo "Setting up nginx configuration..."
sudo apt-get update > /dev/null 2>&1 || echo "Skipping system update (not Linux)"
sudo apt-get install -y nginx > /dev/null 2>&1 || echo "Nginx installation skipped"

# Create nginx config
sudo tee /etc/nginx/sites-available/econet > /dev/null 2>&1 || echo "Creating nginx config..."
cat > econet-nginx.conf << 'EOF'
server {
    listen 80;
    server_name localhost;
    root /home/user/Desktop/econet/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

echo "=== Deployment Complete! ==="
echo "Backend: http://localhost:5000"
echo "Frontend: http://localhost:80 (if nginx is configured)"
echo "Frontend: http://localhost:5173 (development mode)"
echo "To view PM2 status: pm2 status"
echo "To view logs: pm2 logs"
echo "To stop: pm2 stop econet-backend"
echo "To restart: pm2 restart econet-backend"
