@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo.
echo   場景單字輸入練習 — 本機伺服器
echo   ----------------------------------------
echo   網址： http://127.0.0.1:8848/
echo   關閉這個視窗就會停止伺服器。
echo.
where python >nul 2>nul
if errorlevel 1 (
  echo   找不到 python，改用直接開檔案的方式。
  echo.
  start "" "index.html"
  goto :eof
)
start "" "http://127.0.0.1:8848/"
python -m http.server 8848 --bind 127.0.0.1