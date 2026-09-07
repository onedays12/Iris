$ErrorActionPreference = 'Continue'
$p = 'C:\Users\Public\Documents\My Pictures'
Write-Host '=== My Pictures ==='
Write-Host ("exists=" + (Test-Path -LiteralPath $p))
$item = Get-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue
if ($item) {
  Write-Host ("attrs=" + $item.Attributes)
  Write-Host ("linktype=" + $item.LinkType)
  Write-Host ("target=" + ($item.Target -join ','))
}
Write-Host '=== dir /AL Public Documents ==='
cmd /c 'dir /AL "C:\Users\Public\Documents"'
Write-Host '=== Get-ChildItem My Pictures ==='
try {
  $c = Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop
  Write-Host ("count=" + $c.Count)
} catch {
  Write-Host ("gci err=" + $_.Exception.Message)
}
Write-Host '=== icacls My Pictures ==='
icacls $p
Write-Host '=== Program Files count ==='
try {
  Write-Host ((Get-ChildItem -LiteralPath 'C:\Program Files' | Measure-Object).Count)
} catch {
  Write-Host $_.Exception.Message
}
Write-Host '=== FindFirstFileW via cmd dir ==='
cmd /c 'dir /b "C:\Users\Public\Documents\My Pictures"'
cmd /c 'dir /b "C:\Program Files"' | Select-Object -First 3
