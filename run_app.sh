#!/bin/bash

# Variables
NODE_VERSION="18"
PROJECT_DIR="$(pwd)"
WEB_DIR="$PROJECT_DIR/web"
PYTHON_ENV="$PROJECT_DIR/venv"
YARN_CACHE_FOLDER="$WEB_DIR/.yarn"
PIP_CACHE_DIR="$HOME/.cache/pip"

export BASE_DROPBOX_DIR="/data/label-studio-dropbox/"

# Ensure you are in the correct directory
cd $PROJECT_DIR

# Step 1: Install Node.js and Yarn (if not installed)
# if ! command -v node &> /dev/null || [[ "$(node -v)" != v$NODE_VERSION* ]]; then
#   echo "Node.js $NODE_VERSION is not installed. Please install it first."
#   exit 1
# fi

# if ! command -v yarn &> /dev/null; then
#   echo "Yarn is not installed. Installing Yarn..."
#   npm install -g yarn
# fi

# Step 2: Build frontend assets
echo "Building frontend assets..."
cd $WEB_DIR

# Fix Yarn configuration
yarn config set registry https://registry.npmjs.org/
yarn config set network-timeout 1200000

# Install frontend dependencies
yarn install --prefer-offline --no-progress --pure-lockfile --frozen-lockfile --ignore-engines --non-interactive --production=false

# Build frontend assets
# yarn run build && yarn version:libs
NODE_ENV=development yarn ls:build && nx run labelstudio:build:development

# yarn run watch

# Step 3: Set up Python environment and install dependencies
echo "Setting up Python environment..."

# Create a virtual environment
python3 -m venv $PYTHON_ENV
source $PYTHON_ENV/bin/activate

# Upgrade pip and install Poetry
pip install --upgrade pip setuptools poetry

# Install Python dependencies
poetry install

# Added Pip packages
pip install pandas matplotlib dash django-plotly-dash pandasql ffmpeg-python

# Step 4: Set up and run Django application
echo "Setting up and running the Django application..."
cd $PROJECT_DIR

# Apply migrations and collect static files
python3 label_studio/manage.py migrate
python3 label_studio/manage.py collectstatic --no-input

# Start the application
echo "Starting Label Studio..."
TOPAZ_DEBUG_MODE=true python3 label_studio/manage.py runserver 0.0.0.0:8080