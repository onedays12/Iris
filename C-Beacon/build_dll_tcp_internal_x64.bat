@echo off
setlocal EnableExtensions
set "SCRIPT_DIR=%~dp0"
set "PROJECT=Beacon.vcxproj"

if not exist "%SCRIPT_DIR%%PROJECT%" (
    echo [!] project not found: "%SCRIPT_DIR%%PROJECT%"
    exit /b 1
)

call "%SCRIPT_DIR%build_env.bat" x64
if errorlevel 1 exit /b %ERRORLEVEL%

pushd "%SCRIPT_DIR%"
if errorlevel 1 exit /b %ERRORLEVEL%

"%MSBUILD_EXE%" "%PROJECT%" /p:Configuration=ReleaseDllTcpExternal /p:Platform=x64 /p:InternalTransport=tcp /p:ExternalTransport= /m /v:minimal
set "BUILD_RC=%ERRORLEVEL%"
popd
exit /b %BUILD_RC%
