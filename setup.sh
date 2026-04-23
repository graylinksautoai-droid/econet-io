#!/bin/bash

echo "========================================"
echo "EcoNet Command Center Setup"
echo "========================================"
echo

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo "Node.js is installed"
echo

# Install frontend dependencies
echo "Installing frontend dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install frontend dependencies"
    exit 1
fi

echo "Frontend dependencies installed successfully"
echo

# Create environment configuration
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Environment file created from template"
else
    echo "Environment file already exists"
fi

echo
echo "========================================"
echo "Setup Complete!"
echo "========================================"
echo
echo "Next steps:"
echo "1. Edit .env file with your API keys and configuration"
echo "2. Run 'npm start' to start the development server"
echo "3. Open http://localhost:5173 in your browser"
echo
echo "For API integration setup, see API_INTEGRATION_GUIDE.md"
echo

# Make script executable
chmod +x setup.sh
