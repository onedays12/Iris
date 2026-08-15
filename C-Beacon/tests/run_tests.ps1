[CmdletBinding()]
param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug",
    [switch]$BuildOnly
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "BeaconTests.vcxproj"
$binary = Join-Path $PSScriptRoot ("..\x64\{0}\tests\BeaconTests.exe" -f $Configuration)

$msbuildPath = $null
$msbuildCommand = Get-Command msbuild -ErrorAction SilentlyContinue
if ($msbuildCommand) {
    $msbuildPath = $msbuildCommand.Source
}
if (-not $msbuildPath) {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vswhere) {
        $installationPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
        if ($installationPath) {
            $candidate = Join-Path $installationPath "MSBuild\Current\Bin\MSBuild.exe"
            if (Test-Path $candidate) {
                $msbuildPath = $candidate
            }
        }
    }
}

if (-not $msbuildPath) {
    throw "MSBuild was not found. Run this script from a Visual Studio Developer PowerShell or install the C++ workload."
}

& $msbuildPath $project /m /t:Build /p:Configuration=$Configuration /p:Platform=x64 /nologo
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

if ($BuildOnly) {
    exit 0
}

if (-not (Test-Path $binary)) {
    throw "Test binary was not produced: $binary"
}

& $binary
exit $LASTEXITCODE
