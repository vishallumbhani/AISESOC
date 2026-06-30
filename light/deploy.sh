#!/bin/bash
# =================================================================
# AI-SecOS Enterprise Light Theme — Deploy Script
# Run from ~/ai-secos (project root)
# =================================================================
set -e

SPRINT="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(pwd)"

if [ ! -f "docker-compose.yml" ]; then
  echo "ERROR: Run from ~/ai-secos"
  exit 1
fi

echo "================================================"
echo "  AI-SecOS Enterprise Light Theme Deployment"
echo "================================================"
echo ""

# 1. Core design system files
echo "[1/5] Installing design system files..."
mkdir -p frontend/components frontend/theme

cp "$SPRINT/components/AppShell.tsx"  frontend/components/AppShell.tsx
cp "$SPRINT/styles/globals.css"       frontend/styles/globals.css
cp "$SPRINT/pages/_app.tsx"           frontend/pages/_app.tsx

echo "   ✓ AppShell.tsx"
echo "   ✓ globals.css"
echo "   ✓ _app.tsx"

# 2. Verify ErrorBoundary exists (from sprint2)
if [ ! -f "frontend/components/ErrorBoundary.tsx" ]; then
  echo "[1b] Creating ErrorBoundary.tsx..."
  cat > frontend/components/ErrorBoundary.tsx << 'EOFEB'
import React, { Component, ErrorInfo, ReactNode } from "react";
interface Props { children: ReactNode; }
interface State { error: Error | null; }
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("[ErrorBoundary]", error, info); }
  render() {
    if (this.state.error) return (
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Inter,sans-serif",background:"#f1f5f9"}}>
        <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:"0.75rem",padding:"2rem",maxWidth:"26rem",textAlign:"center"}}>
          <h2 style={{color:"#0f172a",marginBottom:"0.5rem",fontWeight:700}}>Something went wrong</h2>
          <p style={{color:"#64748b",fontSize:"0.875rem",marginBottom:"1.25rem"}}>{this.state.error.message}</p>
          <button onClick={()=>this.setState({error:null})} style={{background:"#2563eb",color:"#fff",border:"none",padding:"0.5rem 1.25rem",borderRadius:"0.5rem",cursor:"pointer",fontWeight:600}}>Try again</button>
        </div>
      </div>
    );
    return this.props.children;
  }
}
export default ErrorBoundary;
EOFEB
  echo "   ✓ ErrorBoundary.tsx created"
fi

# 3. Check lucide-react is installed
echo "[2/5] Checking lucide-react..."
if ! docker compose exec -T frontend node -e "require('lucide-react')" 2>/dev/null; then
  echo "   Installing lucide-react..."
  docker compose exec -T frontend npm install lucide-react --save 2>/dev/null || \
  docker compose run --rm frontend npm install lucide-react --save
else
  echo "   ✓ lucide-react already installed"
fi

# 4. Run the light theme conversion on all pages
echo "[3/5] Converting pages to light theme..."
cp "$SPRINT/convert_to_light.py" frontend/convert_to_light.py
cd frontend
python3 convert_to_light.py
cd "$ROOT"
echo "   ✓ Conversion complete"

# 5. Restart frontend
echo "[4/5] Restarting frontend..."
docker compose restart frontend
sleep 8

# 6. Health check
echo "[5/5] Checking frontend..."
STATUS=$(curl -sf http://localhost:3000 -o /dev/null -w "%{http_code}" 2>/dev/null || echo "000")
if [ "$STATUS" = "200" ] || [ "$STATUS" = "307" ]; then
  echo "   ✓ Frontend responding (HTTP $STATUS)"
else
  echo "   ⚠ Frontend returned HTTP $STATUS — check logs"
  docker compose logs frontend --tail=15
fi

echo ""
echo "================================================"
echo "  ✅ Light Theme Deployment COMPLETE"
echo "================================================"
echo ""
echo "  What was changed:"
echo "  • AppShell sidebar — enterprise light theme"
echo "  • globals.css — CSS variables, font (Inter), DS classes"
echo "  • _app.tsx — uses AppShell + ErrorBoundary"
echo "  • All org pages — dark classes converted to light"
echo ""
echo "  Verify at: http://192.168.116.159:3000/dashboard"
echo ""
echo "  If any page still shows dark areas, run:"
echo "  cd ~/ai-secos/frontend && python3 convert_to_light.py"
echo ""
