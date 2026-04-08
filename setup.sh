#!/bin/bash
# ============================================
# LeadScout — Full Setup Script
# ============================================
set -e

echo ""
echo "🚀 LeadScout Setup"
echo "=================="

# ====== BACKEND ======
echo ""
echo "📦 Installing Python backend dependencies..."
cd "$(dirname "$0")/backend"
pip install -r requirements.txt --break-system-packages -q

echo "✅ Backend ready."

# ====== FRONTEND ======
echo ""
echo "📦 Installing Node frontend dependencies..."
cd ../frontend
npm install --silent

echo "✅ Frontend ready."

echo ""
echo "======================================="
echo "✅ SETUP COMPLETE"
echo ""
echo "To run:"
echo ""
echo "  1. Set your config in backend/app.py:"
echo "     - MONGO_URI  (default: mongodb://localhost:27017/)"
echo "     - SERPAPI_KEY (optional, for Google Maps)"
echo ""
echo "  2. Start backend:"
echo "     cd backend && python app.py"
echo ""
echo "  3. Start frontend (new terminal):"
echo "     cd frontend && npm run dev"
echo ""
echo "  4. Open: http://localhost:3000"
echo "======================================="
