@echo off
rem Rom Patch Manager. Needs Python 3 (the one romtool uses).
cd /d "%~dp0"
where py >nul 2>nul && (start "Rom Patch Manager" /min py -3 serve.py) || (start "Rom Patch Manager" /min python serve.py)
