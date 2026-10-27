@echo off
cd /d "%~dp0"
echo Menginstal library yang dibutuhkan...
python -m pip install -r requirements.txt
echo.
echo Selesai. Jalankan "Jalankan.bat" untuk membuka aplikasi.
pause
