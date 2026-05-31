@echo off
setlocal

set "ROOT=%~dp0"
set "VCVARS=D:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars32.bat"
set "EXE=%ROOT%x86\Release\stager_windows_32.exe"
set "BIN=%ROOT%x86\Release\stager_windows_32.bin"

if not exist "%VCVARS%" (
  echo [-] vcvars32.bat not found: %VCVARS%
  exit /b 1
)

call "%VCVARS%" >nul || exit /b 1
msbuild "%ROOT%stager_shellcode.vcxproj" /t:Rebuild /p:Configuration=Release /p:Platform=Win32 /p:TargetName=stager_windows_32 /p:OutDir="%ROOT%x86\Release\\" /p:IntDir="%ROOT%stager_shellcode\x86\Release\\" /m /v:minimal || exit /b 1

go run "%ROOT%tools\extract_text\main.go" -in "%EXE%" -out "%BIN%" || exit /b 1
if exist "%ROOT%x86\Release\stager_shellcode_32.exe" del /q "%ROOT%x86\Release\stager_shellcode_32.exe"
if exist "%ROOT%x86\Release\stager_template_x86.bin" del /q "%ROOT%x86\Release\stager_template_x86.bin"
if exist "%ROOT%x86\Release\stager_windows_32.pdb" del /q "%ROOT%x86\Release\stager_windows_32.pdb"
echo [+] stager template: %BIN%
