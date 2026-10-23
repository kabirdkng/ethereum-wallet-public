#!/bin/bash

# Redis Setup Script for Ethereum Wallet
# This script installs and starts Redis for local development

set -e

echo "================================"
echo "Redis Setup for Ethereum Wallet"
echo "================================"
echo ""

# Detect OS
OS="$(uname -s)"
case "${OS}" in
    Linux*)     MACHINE=Linux;;
    Darwin*)    MACHINE=Mac;;
    *)          MACHINE="UNKNOWN:${OS}"
esac

echo "Detected OS: $MACHINE"
echo ""

# Install Redis based on OS
if [ "$MACHINE" = "Linux" ]; then
    echo "Installing Redis on Linux..."
    
    # Check if running on Ubuntu/Debian
    if [ -f /etc/debian_version ]; then
        echo "Detected Debian/Ubuntu system"
        sudo apt-get update
        sudo apt-get install -y redis-server redis-tools
        
        # Start Redis service
        sudo systemctl start redis-server
        sudo systemctl enable redis-server
        
        echo "✓ Redis installed and started via systemd"
        echo "  Service status: sudo systemctl status redis-server"
        
    # Check if running on Fedora/RHEL/CentOS
    elif [ -f /etc/redhat-release ]; then
        echo "Detected Red Hat based system"
        sudo yum install -y redis
        sudo systemctl start redis
        sudo systemctl enable redis
        
        echo "✓ Redis installed and started via systemd"
        echo "  Service status: sudo systemctl status redis"
    else
        echo "Unsupported Linux distribution"
        echo "Please install Redis manually: https://redis.io/docs/install/install-redis/"
        exit 1
    fi
    
elif [ "$MACHINE" = "Mac" ]; then
    echo "Installing Redis on macOS..."
    
    # Check if Homebrew is installed
    if ! command -v brew &> /dev/null; then
        echo "Homebrew not found. Installing Homebrew first..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    
    # Install Redis via Homebrew
    brew install redis
    
    # Start Redis as a service
    brew services start redis
    
    echo "✓ Redis installed and started via Homebrew services"
    echo "  Service status: brew services list | grep redis"
    
else
    echo "Unsupported operating system: $MACHINE"
    echo ""
    echo "Alternative: Use Docker to run Redis"
    echo "  docker run -d -p 6379:6379 --name redis-wallet redis:7-alpine"
    exit 1
fi

echo ""
echo "================================"
echo "Testing Redis Connection..."
echo "================================"

# Wait a moment for Redis to fully start
sleep 2

# Test Redis connection
if redis-cli ping | grep -q PONG; then
    echo "✓ Redis is running and responding to ping"
else
    echo "✗ Redis is not responding. Please check the service status."
    exit 1
fi

echo ""
echo "================================"
echo "Redis Configuration"
echo "================================"
echo "Default connection: redis://localhost:6379"
echo ""
echo "Add to your .env file:"
echo "REDIS_URL=\"redis://localhost:6379\""
echo ""

# Check if .env file exists
if [ -f .env ]; then
    # Check if REDIS_URL already exists
    if grep -q "^REDIS_URL=" .env; then
        echo "✓ REDIS_URL already exists in .env"
    else
        echo "Adding REDIS_URL to .env..."
        echo "" >> .env
        echo "# Redis Cache" >> .env
        echo "REDIS_URL=\"redis://localhost:6379\"" >> .env
        echo "✓ REDIS_URL added to .env"
    fi
else
    echo "⚠ .env file not found. Please create one from .env.example"
fi

echo ""
echo "================================"
echo "Setup Complete!"
echo "================================"
echo ""
echo "Redis Commands:"
echo "  - Test connection:     redis-cli ping"
echo "  - Monitor activity:    redis-cli monitor"
echo "  - Check memory:        redis-cli INFO memory"
echo "  - Flush all data:      redis-cli FLUSHALL (dev only!)"
echo ""
echo "Restart your Next.js dev server to use Redis caching."
echo ""
