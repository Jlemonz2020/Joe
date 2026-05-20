param(
  [switch]$KeepUserData,
  [switch]$Silent
)

$ErrorActionPreference = 'Stop'

$appDisplayName = 'HC AI ' + [string][char]0x7F16 + [string][char]0x7A0B + [string][char]0x52A9 + [string][char]0x624B
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$installDir = Split-Path -Parent $scriptRoot
$resourcesDir = Join-Path $installDir 'resources'

function Find-AppExe {
  $expectedExe = Join-Path $installDir "$appDisplayName.exe"
  if (Test-Path -LiteralPath $expectedExe) {
    return $expectedExe
  }

  $candidate = Get-ChildItem -LiteralPath $installDir -Filter 'HC AI*.exe' -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($candidate) {
    return $candidate.FullName
  }

  return $null
}

$appExePath = Find-AppExe
$isPackagedInstall = $appExePath -and (Test-Path -LiteralPath $resourcesDir)

function Write-Step {
  param([string]$Message)
  Write-Host "[HC Uninstall] $Message"
}

function Assert-PackagedInstall {
  if ($isPackagedInstall) {
    return
  }

  Write-Step "This does not look like the packaged app folder."
  Write-Step "Refusing to remove: $installDir"
  Write-Step "Run the uninstaller from the release/win-unpacked folder or the installed app folder."
  exit 1
}

function Confirm-Uninstall {
  if ($Silent) {
    return $true
  }

  Write-Host ""
  Write-Host "This will uninstall $appDisplayName."
  Write-Host "Install directory: $installDir"
  if ($KeepUserData) {
    Write-Host "User data will be kept."
  } else {
    Write-Host "User data, API key storage, cache, and audit logs will be removed."
  }
  Write-Host ""
  $answer = Read-Host "Continue? Type Y to uninstall"
  return $answer -in @('Y', 'y')
}

function Stop-AppProcesses {
  Write-Step "Stopping running app processes..."
  $processes = Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $processPath = $null
    try {
      $processPath = $_.Path
    } catch {
      $processPath = $null
    }

    $_.ProcessName -like 'HC AI*' -or
    $_.ProcessName -eq 'hc' -or
    ($processPath -and $processPath.StartsWith($installDir, [System.StringComparison]::OrdinalIgnoreCase))
  }

  foreach ($process in $processes) {
    try {
      Stop-Process -Id $process.Id -Force -ErrorAction Stop
      Write-Step "Stopped process $($process.Id)."
    } catch {
      Write-Step "Could not stop process $($process.Id): $($_.Exception.Message)"
    }
  }
}

function Remove-IfExists {
  param([string]$Path)

  if (Test-Path -LiteralPath $Path) {
    try {
      Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
      Write-Step "Removed $Path"
    } catch {
      Write-Step "Could not remove $Path`: $($_.Exception.Message)"
    }
  }
}

function Remove-Shortcuts {
  Write-Step "Removing shortcuts..."
  $shortcutPaths = @(
    "$env:USERPROFILE\Desktop\$appDisplayName.lnk",
    "$env:PUBLIC\Desktop\$appDisplayName.lnk",
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\$appDisplayName.lnk",
    "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\$appDisplayName.lnk"
  )

  foreach ($shortcutPath in $shortcutPaths) {
    Remove-IfExists -Path $shortcutPath
  }
}

function Remove-UserData {
  if ($KeepUserData) {
    Write-Step "Keeping user data."
    return
  }

  Write-Step "Removing user data..."
  $dataPaths = @(
    "$env:APPDATA\$appDisplayName",
    "$env:APPDATA\hc",
    "$env:LOCALAPPDATA\$appDisplayName",
    "$env:LOCALAPPDATA\hc"
  )

  foreach ($dataPath in $dataPaths) {
    Remove-IfExists -Path $dataPath
  }
}

function Queue-InstallDirRemoval {
  Write-Step "Scheduling install directory removal..."
  $cleanupScript = Join-Path $env:TEMP "hc-ai-uninstall-$PID.ps1"
  $escapedInstallDir = $installDir.Replace("'", "''")
  $escapedCleanupScript = $cleanupScript.Replace("'", "''")

  @"
Start-Sleep -Seconds 2
for (`$i = 0; `$i -lt 20; `$i++) {
  try {
    if (Test-Path -LiteralPath '$escapedInstallDir') {
      Remove-Item -LiteralPath '$escapedInstallDir' -Recurse -Force -ErrorAction Stop
    }
    break
  } catch {
    Start-Sleep -Seconds 1
  }
}
Remove-Item -LiteralPath '$escapedCleanupScript' -Force -ErrorAction SilentlyContinue
"@ | Set-Content -LiteralPath $cleanupScript -Encoding UTF8

  Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    $cleanupScript
  ) -WorkingDirectory $env:TEMP
}

Assert-PackagedInstall

if (-not (Confirm-Uninstall)) {
  Write-Step "Cancelled."
  exit 0
}

Stop-AppProcesses
Remove-Shortcuts
Remove-UserData
Queue-InstallDirRemoval

Write-Host ""
Write-Step "Uninstall started. The install directory will be removed after this window closes."
if (-not $Silent) {
  Write-Host "Press Enter to close."
  Read-Host | Out-Null
}
