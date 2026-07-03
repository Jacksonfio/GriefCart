@echo off
cd /d "%~dp0"
echo Starting GriefCart dev server...
echo Open http://localhost:5173 in your browser
start http://localhost:5173
npm run dev
pause
