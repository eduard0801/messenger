@echo off
title Messenger
echo ========================================
echo   Messenger - Auto Start
echo ========================================
echo.

cd /d "%~dp0"

if not exist "backend\package.json" (
    echo ERROR: backend folder not found!
    echo Put this start.bat inside the messenger folder.
    pause
    exit /b 1
)

echo [Backend] Checking dependencies...
cd backend
if not exist "node_modules" (
    echo Installing backend packages...
    call npm install
    if errorlevel 1 (
        echo Backend install failed!
        pause
        exit /b 1
    )
)
echo Starting backend...
start "Backend" cmd /k "npm start"
cd ..

timeout /t 3 >nul

echo [Frontend] Checking dependencies...
cd frontend
if not exist "node_modules" (
    echo Installing frontend packages...
    call npm install
    if errorlevel 1 (
        echo Frontend install failed!
        pause
        exit /b 1
    )
)
echo Starting frontend...
start "Frontend" cmd /k "npm run dev"
cd ..

echo.
echo ========================================
echo   Done! Opening browser...
echo ========================================
timeout /t 4 >nul
start http://localhost:5173

echo.
echo Two windows opened (Backend + Frontend).
echo Do not close them while using the messenger.
echo.
pause
