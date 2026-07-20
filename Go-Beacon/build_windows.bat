@echo off
setlocal
cd /d "%~dp0"

if not exist bin mkdir bin

echo [*] Running tests...
go test ./...
if errorlevel 1 exit /b 1

echo [*] Building Go Beacon windows/amd64...
set GOOS=windows
set GOARCH=amd64
go build -trimpath -ldflags="-s -w" -o bin\beacon_http_external_windows_amd64.exe .
if errorlevel 1 exit /b 1
go build -trimpath -ldflags="-s -w" -o bin\beacon_tcp_internal_windows_amd64.exe .
if errorlevel 1 exit /b 1
go build -trimpath -ldflags="-s -w" -o bin\beacon_smb_internal_windows_amd64.exe .
if errorlevel 1 exit /b 1

echo [*] Building profile patch tool...
set GOOS=windows
set GOARCH=amd64
go build -trimpath -ldflags="-s -w" -o bin\patch_profile.exe .\tools
if errorlevel 1 exit /b 1

echo [*] Build complete.
echo     bin\beacon_http_external_windows_amd64.exe
echo     bin\beacon_tcp_internal_windows_amd64.exe
echo     bin\beacon_smb_internal_windows_amd64.exe
echo     bin\patch_profile.exe
