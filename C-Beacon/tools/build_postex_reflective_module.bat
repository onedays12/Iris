@echo off
setlocal EnableExtensions
set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."
set "ARCH=%~1"

if "%ARCH%"=="" set "ARCH=x64"
if /i not "%ARCH%"=="x64" if /i not "%ARCH%"=="x86" if /i not "%ARCH%"=="all" (
    echo [!] unsupported arch: "%ARCH%"
    echo Usage: %~nx0 [x64^|x86^|all]
    exit /b 1
)

if /i "%ARCH%"=="all" (
    call "%~f0" x64
    if errorlevel 1 exit /b %ERRORLEVEL%
    call "%~f0" x86
    exit /b %ERRORLEVEL%
)

call "%ROOT_DIR%\build_env.bat" %ARCH%
if errorlevel 1 exit /b %ERRORLEVEL%

set "OUT=postex_reflective_module.%ARCH%.dll"
set "MOD_OBJ=postex_reflective_module.%ARCH%.obj"
set "REF_OBJ=reflective_loader.%ARCH%.obj"
set "OUTLIB=postex_reflective_module.%ARCH%.lib"
set "EXP=postex_reflective_module.%ARCH%.exp"

echo [*] building postex_reflective_module %ARCH%
pushd "%SCRIPT_DIR%"
cl /nologo /W3 /O2 /MT /GS- /guard:cf- /utf-8 /DWIN32_LEAN_AND_MEAN /DBEACON_DLL_BUILD /I"..\include" /c postex_reflective_module.c /Fo"%MOD_OBJ%"
if errorlevel 1 (
    set "BUILD_RC=%ERRORLEVEL%"
    popd
    exit /b %BUILD_RC%
)
cl /nologo /W3 /O2 /MT /GS- /guard:cf- /utf-8 /DWIN32_LEAN_AND_MEAN /DBEACON_DLL_BUILD /DBEACON_REFLECTIVE_NO_STOMP /I"..\include" /c "..\src\loader\reflective_loader.c" /Fo"%REF_OBJ%"
if errorlevel 1 (
    set "BUILD_RC=%ERRORLEVEL%"
    popd
    exit /b %BUILD_RC%
)
link /nologo /DLL /OUT:"%OUT%" "%MOD_OBJ%" "%REF_OBJ%"
set "BUILD_RC=%ERRORLEVEL%"
popd
if not "%BUILD_RC%"=="0" exit /b %BUILD_RC%

if exist "%SCRIPT_DIR%%MOD_OBJ%" del /f /q "%SCRIPT_DIR%%MOD_OBJ%" >nul 2>nul
if exist "%SCRIPT_DIR%%REF_OBJ%" del /f /q "%SCRIPT_DIR%%REF_OBJ%" >nul 2>nul
if exist "%SCRIPT_DIR%%OUTLIB%" del /f /q "%SCRIPT_DIR%%OUTLIB%" >nul 2>nul
if exist "%SCRIPT_DIR%%EXP%" del /f /q "%SCRIPT_DIR%%EXP%" >nul 2>nul
echo [*] output: "%SCRIPT_DIR%%OUT%"
exit /b 0
