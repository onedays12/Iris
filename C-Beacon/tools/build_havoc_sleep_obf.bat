@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "CC=gcc"
if not "%~1"=="" set "CC=%~1"

echo [*] compiler: %CC%
"%CC%" -m64 -O2 -Wall -Wextra -Wno-cast-function-type -DWIN32_LEAN_AND_MEAN -o "%SCRIPT_DIR%havoc_sleep_obf_demo.x64.exe" "%SCRIPT_DIR%havoc_sleep_obf.c"
if errorlevel 1 (
    echo [!] build failed
    exit /b 1
)

echo [*] output: %SCRIPT_DIR%havoc_sleep_obf_demo.x64.exe
exit /b 0
