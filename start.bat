@echo off
chcp 65001 >nul
title RushHour CCTV

:: Virtuális környezet ellenőrzése
if not exist ".venv\Scripts\activate.bat" (
    echo [HIBA] Virtuális környezet nem található!
    echo Futtasd először az install.bat fájlt.
    pause
    exit /b 1
)

:: Videók mappa ellenőrzése
if not exist "videos" (
    echo [FIGYELEM] A "videos" mappa nem található!
    echo Hozd létre a mappát és helyezd bele a videófájlokat.
    pause
    exit /b 1
)

call .venv\Scripts\activate.bat

echo Backend indítása (http://localhost:5000)...
echo A frontend megnyitásához nyisd meg a frontend\index.html fájlt böngészőben.
echo Kilépés: Ctrl+C
echo.

cd backend
python app.py
