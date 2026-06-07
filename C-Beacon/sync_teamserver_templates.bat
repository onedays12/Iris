@echo off
setlocal EnableExtensions
set "SCRIPT_DIR=%~dp0"
set "TEAMSERVER_DIR=%~1"

if "%TEAMSERVER_DIR%"=="" (
    set "TEAMSERVER_DIR=%SCRIPT_DIR%..\..\..\go\TeamServer"
)

set "DEST=%TEAMSERVER_DIR%\static\beacon_templates\C-Beacon"

if not exist "%DEST%\" (
    echo [!] C-Beacon template directory not found: "%DEST%"
    exit /b 1
)

REM 1. Build all targets
call "%SCRIPT_DIR%build_all.bat"
if errorlevel 1 exit /b %ERRORLEVEL%

REM 2. Patch reflective DLLs (x64 + x86)
echo [*] Patching reflective DLLs...
set "PATCHER=%SCRIPT_DIR%tools\patch_reflective_stub\PatchBeacon.exe"

"%PATCHER%" "%SCRIPT_DIR%x64\Release\Beacon_amd64.dll" "%SCRIPT_DIR%x64\Release\beacon_windows_amd64.dll" REFLoader
if errorlevel 1 (
    echo [!] Patch x64 DLL failed
    exit /b 1
)

"%PATCHER%" "%SCRIPT_DIR%x86\Release\Beacon_x86.dll" "%SCRIPT_DIR%x86\Release\beacon_windows_x86.dll" REFLoader
if errorlevel 1 (
    echo [!] Patch x86 DLL failed
    exit /b 1
)

REM 3. Copy all artifacts to C-Beacon
echo [*] Copying to %DEST%...

copy /Y "%SCRIPT_DIR%x64\Release\beacon_windows_amd64.dll"                "%DEST%\" >nul
copy /Y "%SCRIPT_DIR%x86\Release\beacon_windows_x86.dll"                  "%DEST%\" >nul
copy /Y "%SCRIPT_DIR%x64\ReleaseExe\beacon_windows_amd64.exe"             "%DEST%\" >nul
copy /Y "%SCRIPT_DIR%x86\ReleaseExe\beacon_windows_x86.exe"               "%DEST%\" >nul
copy /Y "%SCRIPT_DIR%x64\ReleaseExeTcpInternal\beacon_tcp_internal_amd64.exe"  "%DEST%\" >nul
copy /Y "%SCRIPT_DIR%x86\ReleaseExeTcpInternal\beacon_tcp_internal_x86.exe"    "%DEST%\" >nul
copy /Y "%SCRIPT_DIR%x64\ReleaseExeSmbInternal\beacon_smb_internal_amd64.exe"  "%DEST%\" >nul
copy /Y "%SCRIPT_DIR%x86\ReleaseExeSmbInternal\beacon_smb_internal_x86.exe"    "%DEST%\" >nul

echo [*] All templates synced to "%DEST%"
exit /b 0
