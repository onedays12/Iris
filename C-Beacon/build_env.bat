@echo off
rem Prepare a Visual Studio C++ build environment for this repository.
rem Usage: call "%~dp0build_env.bat" x64|x86

set "BUILD_ARCH=%~1"
if "%BUILD_ARCH%"=="" (
    echo [!] missing build architecture. Use x64 or x86.
    exit /b 1
)
if /i not "%BUILD_ARCH%"=="x64" if /i not "%BUILD_ARCH%"=="x86" (
    echo [!] unsupported build architecture: "%BUILD_ARCH%"
    echo [!] use x64 or x86.
    exit /b 1
)

if /i "%VSCMD_ARG_TGT_ARCH%"=="%BUILD_ARCH%" (
    where msbuild >nul 2>nul
    if errorlevel 1 goto find_vs
    where cl >nul 2>nul
    if not errorlevel 1 (
        set "MSBUILD_EXE=msbuild"
        exit /b 0
    )
)

:find_vs
set "VSINSTALL="
if defined VSINSTALLDIR if exist "%VSINSTALLDIR%\VC\Auxiliary\Build\vcvarsall.bat" (
    set "VSINSTALL=%VSINSTALLDIR%"
)

if defined VSINSTALL goto have_vsinstall

set "VSWHERE="
if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not defined VSWHERE if exist "%ProgramFiles%\Microsoft Visual Studio\Installer\vswhere.exe" set "VSWHERE=%ProgramFiles%\Microsoft Visual Studio\Installer\vswhere.exe"

if not defined VSWHERE (
    echo [!] vswhere.exe not found.
    echo [!] Install Visual Studio 2017 or later, or run from a Developer Command Prompt.
    exit /b 1
)

for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.Component.MSBuild -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2^>nul`) do (
    set "VSINSTALL=%%i"
)

if not defined VSINSTALL (
    echo [!] Visual Studio with MSBuild and C++ tools was not found.
    echo [!] Install "Desktop development with C++" or Visual Studio Build Tools.
    exit /b 1
)

:have_vsinstall
set "VCVARSALL=%VSINSTALL%\VC\Auxiliary\Build\vcvarsall.bat"
if not exist "%VCVARSALL%" (
    echo [!] vcvarsall.bat not found: "%VCVARSALL%"
    exit /b 1
)

call "%VCVARSALL%" %BUILD_ARCH% >nul 2>nul
if errorlevel 1 exit /b %ERRORLEVEL%

if exist "%VSINSTALL%\MSBuild\Current\Bin\MSBuild.exe" (
    set "MSBUILD_EXE=%VSINSTALL%\MSBuild\Current\Bin\MSBuild.exe"
) else (
    set "MSBUILD_EXE=msbuild"
)

exit /b 0
