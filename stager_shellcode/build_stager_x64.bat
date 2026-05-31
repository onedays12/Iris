@echo off
setlocal

set "ROOT=%~dp0"
set "VCVARS=D:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat"
set "EXE=%ROOT%x64\Release\stager_windows_amd64.exe"
set "BIN=%ROOT%x64\Release\stager_windows_amd64.bin"

if not exist "%VCVARS%" (
  echo [-] vcvars64.bat not found: %VCVARS%
  exit /b 1
)

call "%VCVARS%" >nul || exit /b 1
msbuild "%ROOT%stager_shellcode.vcxproj" /t:Rebuild /p:Configuration=Release /p:Platform=x64 /p:TargetName=stager_windows_amd64 /m /v:minimal || exit /b 1

go run "%ROOT%tools\extract_text\main.go" -in "%EXE%" -out "%BIN%" || exit /b 1
if exist "%ROOT%x64\Release\stager_shellcode.exe" del /q "%ROOT%x64\Release\stager_shellcode.exe"
if exist "%ROOT%x64\Release\stager_template_x64.bin" del /q "%ROOT%x64\Release\stager_template_x64.bin"
if exist "%ROOT%x64\Release\stager_windows_amd64.pdb" del /q "%ROOT%x64\Release\stager_windows_amd64.pdb"
echo [+] stager template: %BIN%
