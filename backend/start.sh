#!/usr/bin/env bash
# Medical Image Processing Demo - Backend Start Script
# Usage: bash start.sh

set -e

echo "Installing Python dependencies..."
pip install -r requirements.txt

echo "Starting FastAPI server on port 8000..."
python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload
