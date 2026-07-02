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

REM 2. Patch reflective DLLs
echo [*] Patching reflective DLLs...
set "PATCHER=%SCRIPT_DIR%tools\patch_reflective_stub\PatchBeacon.exe"

REM HTTP external DLL
"%PATCHER%" "%SCRIPT_DIR%x64\Release\beacon_http_windows_amd64.dll" "%SCRIPT_DIR%x64\Release\beacon_http_windows_amd64_patched.dll" REFLoader
if errorlevel 1 (
    echo [!] Patch HTTP x64 DLL failed
    exit /b 1
)

"%PATCHER%" "%SCRIPT_DIR%x86\Release\beacon_http_windows_x86.dll" "%SCRIPT_DIR%x86\Release\beacon_http_windows_x86_patched.dll" REFLoader
if errorlevel 1 (
    echo [!] Patch HTTP x86 DLL failed
    exit /b 1
)

REM TCP external DLL
"%PATCHER%" "%SCRIPT_DIR%x64\ReleaseDllTcpExternal\beacon_tcp_windows_amd64.dll" "%SCRIPT_DIR%x64\ReleaseDllTcpExternal\beacon_tcp_windows_amd64_patched.dll" REFLoader
if errorlevel 1 (
    echo [!] Patch TCP x64 DLL failed
    exit /b 1
)

"%PATCHER%" "%SCRIPT_DIR%x86\ReleaseDllTcpExternal\beacon_tcp_windows_x86.dll" "%SCRIPT_DIR%x86\ReleaseDllTcpExternal\beacon_tcp_windows_x86_patched.dll" REFLoader
if errorlevel 1 (
    echo [!] Patch TCP x86 DLL failed
    exit /b 1
)

REM TCP internal DLL
"%PATCHER%" "%SCRIPT_DIR%x64\ReleaseDllTcpExternalTcpInternal\beacon_tcp_internal_amd64.dll" "%SCRIPT_DIR%x64\ReleaseDllTcpExternalTcpInternal\beacon_tcp_internal_amd64_patched.dll" REFLoader
if errorlevel 1 (
    echo [!] Patch TCP internal x64 DLL failed
    exit /b 1
)

"%PATCHER%" "%SCRIPT_DIR%x86\ReleaseDllTcpExternalTcpInternal\beacon_tcp_internal_x86.dll" "%SCRIPT_DIR%x86\ReleaseDllTcpExternalTcpInternal\beacon_tcp_internal_x86_patched.dll" REFLoader
if errorlevel 1 (
    echo [!] Patch TCP internal x86 DLL failed
    exit /b 1
)

REM SMB internal DLL
"%PATCHER%" "%SCRIPT_DIR%x64\ReleaseDllTcpExternalSmbInternal\beacon_smb_internal_amd64.dll" "%SCRIPT_DIR%x64\ReleaseDllTcpExternalSmbInternal\beacon_smb_internal_amd64_patched.dll" REFLoader
if errorlevel 1 (
    echo [!] Patch SMB internal x64 DLL failed
    exit /b 1
)

"%PATCHER%" "%SCRIPT_DIR%x86\ReleaseDllTcpExternalSmbInternal\beacon_smb_internal_x86.dll" "%SCRIPT_DIR%x86\ReleaseDllTcpExternalSmbInternal\beacon_smb_internal_x86_patched.dll" REFLoader
if errorlevel 1 (
    echo [!] Patch SMB internal x86 DLL failed
    exit /b 1
)

REM 3. Copy all artifacts to C-Beacon
echo [*] Copying to %DEST%...

REM HTTP external: patched DLL + EXE (x64 + x86)
copy /Y "%SCRIPT_DIR%x64\Release\beacon_http_windows_amd64_patched.dll"    "%DEST%\beacon_http_windows_amd64.dll" >nul
copy /Y "%SCRIPT_DIR%x86\Release\beacon_http_windows_x86_patched.dll"      "%DEST%\beacon_http_windows_x86.dll" >nul
copy /Y "%SCRIPT_DIR%x64\ReleaseExe\beacon_http_windows_amd64.exe"         "%DEST%\" >nul
copy /Y "%SCRIPT_DIR%x86\ReleaseExe\beacon_http_windows_x86.exe"           "%DEST%\" >nul

REM TCP external: patched DLL + EXE (x64 + x86)
copy /Y "%SCRIPT_DIR%x64\ReleaseDllTcpExternal\beacon_tcp_windows_amd64_patched.dll"  "%DEST%\beacon_tcp_windows_amd64.dll" >nul
copy /Y "%SCRIPT_DIR%x86\ReleaseDllTcpExternal\beacon_tcp_windows_x86_patched.dll"    "%DEST%\beacon_tcp_windows_x86.dll" >nul
copy /Y "%SCRIPT_DIR%x64\ReleaseExeTcpExternal\beacon_tcp_windows_amd64.exe"           "%DEST%\" >nul
copy /Y "%SCRIPT_DIR%x86\ReleaseExeTcpExternal\beacon_tcp_windows_x86.exe"             "%DEST%\" >nul

REM TCP internal: patched DLL + EXE (x64 + x86)
copy /Y "%SCRIPT_DIR%x64\ReleaseDllTcpExternalTcpInternal\beacon_tcp_internal_amd64_patched.dll"  "%DEST%\beacon_tcp_internal_amd64.dll" >nul
copy /Y "%SCRIPT_DIR%x86\ReleaseDllTcpExternalTcpInternal\beacon_tcp_internal_x86_patched.dll"    "%DEST%\beacon_tcp_internal_x86.dll" >nul
copy /Y "%SCRIPT_DIR%x64\ReleaseExeTcpInternal\beacon_tcp_internal_amd64.exe"  "%DEST%\" >nul
copy /Y "%SCRIPT_DIR%x86\ReleaseExeTcpInternal\beacon_tcp_internal_x86.exe"    "%DEST%\" >nul

REM SMB internal: patched DLL + EXE (x64 + x86)
copy /Y "%SCRIPT_DIR%x64\ReleaseDllTcpExternalSmbInternal\beacon_smb_internal_amd64_patched.dll"  "%DEST%\beacon_smb_internal_amd64.dll" >nul
copy /Y "%SCRIPT_DIR%x86\ReleaseDllTcpExternalSmbInternal\beacon_smb_internal_x86_patched.dll"    "%DEST%\beacon_smb_internal_x86.dll" >nul
copy /Y "%SCRIPT_DIR%x64\ReleaseExeSmbInternal\beacon_smb_internal_amd64.exe"  "%DEST%\" >nul
copy /Y "%SCRIPT_DIR%x86\ReleaseExeSmbInternal\beacon_smb_internal_x86.exe"    "%DEST%\" >nul

echo [*] All templates synced to "%DEST%"
exit /b 0
