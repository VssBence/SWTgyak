@echo off
chcp 65001 >nul
title RushHour CCTV - Telepítés

echo ============================================
echo   RushHour CCTV - Automatikus telepítés
echo ============================================
echo.

:: Python ellenőrzés
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [HIBA] Python nem található!
    echo Kérlek telepítsd a Python 3.10+ verziót: https://www.python.org/downloads/
    echo FONTOS: A telepítésnél pipáld be az "Add Python to PATH" opciót!
    pause
    exit /b 1
)

echo [1/4] Python megtalálva:
python --version
echo.

:: Virtuális környezet létrehozása
if not exist ".venv" (
    echo [2/4] Virtuális környezet létrehozása...
    python -m venv .venv
    if %errorlevel% neq 0 (
        echo [HIBA] Nem sikerült létrehozni a virtuális környezetet!
        pause
        exit /b 1
    )
) else (
    echo [2/4] Virtuális környezet már létezik, kihagyás.
)
echo.

:: Függőségek telepítése
echo [3/4] Függőségek telepítése (ez pár percet vehet igénybe)...
call .venv\Scripts\activate.bat
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [HIBA] Nem sikerült a függőségek telepítése!
    pause
    exit /b 1
)
echo.

:: Output mappa létrehozása
if not exist "out_videos" (
    echo [4/4] Output mappa létrehozása...
    mkdir out_videos
) else (
    echo [4/4] Output mappa már létezik, kihagyás.
)

echo.
echo ============================================
echo   Telepítés kész!
echo ============================================
echo.
echo Indítás: futtasd a start.bat fájlt
echo.
pause
