param(
    [Parameter(Mandatory = $true)][uri]$Url,
    [string]$Name = 'Pixel Arcade',
    [switch]$Open
)
$ErrorActionPreference = 'Stop'
if ($Url.Scheme -notin @('http', 'https')) { throw 'Use an HTTP or HTTPS arcade URL.' }
$candidates = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
)
$edgePath = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $edgePath) { throw 'Microsoft Edge was not found.' }
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath ($Name + '.lnk')
if (Test-Path -LiteralPath $shortcutPath) { throw "Shortcut already exists: $shortcutPath" }
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $edgePath
$shortcut.Arguments = '--app="' + $Url.AbsoluteUri + '" --start-fullscreen'
$shortcut.WorkingDirectory = Split-Path -Parent $edgePath
$shortcut.Description = 'Open the arcade fullscreen without an address bar.'
$iconPath = Join-Path $PSScriptRoot '../site/library/assets/arcade-v1.ico'
if (Test-Path -LiteralPath $iconPath) { $shortcut.IconLocation = (Resolve-Path -LiteralPath $iconPath).Path }
$shortcut.Save()
Write-Output $shortcutPath
if ($Open) { Start-Process -FilePath $shortcutPath }
