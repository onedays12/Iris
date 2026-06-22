@echo off
setlocal EnableExtensions
set "SCRIPT_DIR=%~dp0"

call "%SCRIPT_DIR%build_dll_x64.bat"
if errorlevel 1 exit /b %ERRORLEVEL%

call "%SCRIPT_DIR%build_exe_x64.bat"
if errorlevel 1 exit /b %ERRORLEVEL%

call "%SCRIPT_DIR%build_dll_x86.bat"
if errorlevel 1 exit /b %ERRORLEVEL%

call "%SCRIPT_DIR%build_exe_x86.bat"
if errorlevel 1 exit /b %ERRORLEVEL%

call "%SCRIPT_DIR%build_tcp_external_x64.bat"
if errorlevel 1 exit /b %ERRORLEVEL%

call "%SCRIPT_DIR%build_tcp_external_x86.bat"
if errorlevel 1 exit /b %ERRORLEVEL%

call "%SCRIPT_DIR%build_dll_tcp_external_x64.bat"
if errorlevel 1 exit /b %ERRORLEVEL%

call "%SCRIPT_DIR%build_dll_tcp_external_x86.bat"
if errorlevel 1 exit /b %ERRORLEVEL%

call "%SCRIPT_DIR%build_tcp_internal_x64.bat"
if errorlevel 1 exit /b %ERRORLEVEL%

call "%SCRIPT_DIR%build_smb_internal_x64.bat"
if errorlevel 1 exit /b %ERRORLEVEL%

call "%SCRIPT_DIR%build_tcp_internal_x86.bat"
if errorlevel 1 exit /b %ERRORLEVEL%

call "%SCRIPT_DIR%build_smb_internal_x86.bat"
if errorlevel 1 exit /b %ERRORLEVEL%

echo [*] all builds completed
exit /b 0
