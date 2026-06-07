@echo off
setlocal
cd /d "%~dp0"

if not exist bin mkdir bin

echo [*] go mod tidy
go mod tidy
if errorlevel 1 exit /b 1

echo [*] go build
go build -o bin\cascade_proto.exe .
if errorlevel 1 exit /b 1

echo.
echo Build complete:
echo   bin\cascade_proto.exe
