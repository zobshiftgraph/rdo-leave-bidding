@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
if not exist .dev.vars (
  copy .dev.vars.example .dev.vars >nul
)
echo Applying local database migrations...
call npx wrangler d1 migrations apply DB --local
echo Starting the app at http://localhost:5173
call npm run dev
