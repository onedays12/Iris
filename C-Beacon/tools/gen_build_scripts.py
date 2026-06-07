import os

def write_gbk_bat(path, content):
    content = content.replace('\r\n', '\n').replace('\n', '\r\n')
    with open(path, 'wb') as f:
        f.write(content.encode('gbk'))

def make_build_script(config, platform, vcvars_name):
    lines = [
        '@echo off',
        'set "ROOT=%~dp0"',
        'set "VSWHERE=%ProgramFiles(x86)%\\Microsoft Visual Studio\\Installer\\vswhere.exe"',
        'if not exist "%VSWHERE%" (',
        '    echo [!] vswhere.exe not found: "%VSWHERE%"',
        '    echo [!] Install Visual Studio 2017 or later.',
        '    exit /b 1',
        ')',
        'for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -property installationPath 2^>nul`) do (',
        '    call :found "%%i"',
        ')',
        'if not defined VCVARS (',
        '    echo [!] Visual Studio not found.',
        '    exit /b 1',
        ')',
        'if not exist "%VCVARS%" (',
        '    echo [!] vcvars not found: "%VCVARS%"',
        '    exit /b 1',
        ')',
        'call "%VCVARS%" >nul',
        'if errorlevel 1 exit /b %ERRORLEVEL%',
        'msbuild "%ROOT%Beacon.vcxproj" /p:Configuration=' + config + ' /p:Platform=' + platform + ' /m /v:minimal',
        'exit /b %ERRORLEVEL%',
        '',
        ':found',
        'set "VSINSTALL=%~1"',
        r'set "VCVARS=%~1\VC\Auxiliary\Build\\' + vcvars_name + '"',
        'exit /b 0',
    ]
    return '\n'.join(lines)

def make_build_all():
    lines = [
        '@echo off',
        'call "%~dp0build_dll_x64.bat"',
        'if errorlevel 1 exit /b %ERRORLEVEL%',
        'call "%~dp0build_exe_x64.bat"',
        'if errorlevel 1 exit /b %ERRORLEVEL%',
        'call "%~dp0build_dll_x86.bat"',
        'if errorlevel 1 exit /b %ERRORLEVEL%',
        'call "%~dp0build_exe_x86.bat"',
        'if errorlevel 1 exit /b %ERRORLEVEL%',
        'echo [*] all builds completed',
        'exit /b 0',
    ]
    return '\n'.join(lines)

base = os.path.dirname(os.path.abspath(__file__)) + '/../'
configs = {
    'build_dll_x64.bat': ('Release', 'x64', 'vcvars64.bat'),
    'build_dll_x86.bat': ('Release', 'Win32', 'vcvars32.bat'),
    'build_exe_x64.bat': ('ReleaseExe', 'x64', 'vcvars64.bat'),
    'build_exe_x86.bat': ('ReleaseExe', 'Win32', 'vcvars32.bat'),
}

for filename, (config, platform, vcvars_name) in configs.items():
    content = make_build_script(config, platform, vcvars_name)
    write_gbk_bat(os.path.join(base, filename), content)
    print('Written: ' + filename)

write_gbk_bat(os.path.join(base, 'build_all.bat'), make_build_all())
print('Written: build_all.bat')
