# Install ACRYL Blends on Windows 10 or 11 (x64): download the app from a release, check its checksum, put it in place, start it.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -Command "irm <release>/install.ps1 | iex"
#
# Nothing needs an administrator, git, Node or npm: the app carries its own. What you make lives in %LOCALAPPDATA%\ACRYL Blends, never in the app's folder.
#
# Settings (environment): ACRYL_BLENDS_BASE_URL  where the release's files are (default: the script's own release);
#                         ACRYL_BLENDS_PREFIX    the folder the app goes into (default %LOCALAPPDATA%\Programs\ACRYL Blends);
#                         ACRYL_BLENDS_NO_LAUNCH=1  install and do not start.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Say($text) { Write-Host "acryl-blends: $text" }

$base = if ($env:ACRYL_BLENDS_BASE_URL) { $env:ACRYL_BLENDS_BASE_URL } else { 'https://github.com/acryldev/acryl-blends/releases/latest/download' }
if (-not [Environment]::Is64BitOperatingSystem) { throw 'acryl-blends: only 64-bit Windows is built' }
$asset = 'acryl-blends-win32-x64.zip'
$prefix = if ($env:ACRYL_BLENDS_PREFIX) { $env:ACRYL_BLENDS_PREFIX } else { Join-Path $env:LOCALAPPDATA 'Programs\ACRYL Blends' }

$work = Join-Path ([IO.Path]::GetTempPath()) ('acryl-blends-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
try {
  Say "downloading $asset"
  Invoke-WebRequest -UseBasicParsing -Uri "$base/$asset" -OutFile (Join-Path $work $asset)
  Invoke-WebRequest -UseBasicParsing -Uri "$base/SHA256SUMS" -OutFile (Join-Path $work 'SHA256SUMS')

  $line = Get-Content (Join-Path $work 'SHA256SUMS') | Where-Object { $_ -match [regex]::Escape($asset) + '$' } | Select-Object -First 1
  if (-not $line) { throw "acryl-blends: SHA256SUMS has no line for $asset" }
  $want = ($line -split '\s+')[0].ToLower()
  $got = (Get-FileHash -Algorithm SHA256 (Join-Path $work $asset)).Hash.ToLower()
  if ($want -ne $got) { throw "acryl-blends: the download is not the release's file (checksum $got, expected $want); nothing was installed" }
  Say 'checksum ok'

  if (Test-Path $prefix) {
    Say 'replacing the app that is installed (your apps and data are in the data folder and stay)'
    Remove-Item -Recurse -Force $prefix
  }
  New-Item -ItemType Directory -Path $prefix -Force | Out-Null
  Expand-Archive -Path (Join-Path $work $asset) -DestinationPath $prefix -Force
  $exe = Join-Path $prefix 'ACRYL-Blends.exe'
  if (-not (Test-Path $exe)) { throw "acryl-blends: $exe is not in the download" }

  $menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'ACRYL Blends.lnk'
  $shell = New-Object -ComObject WScript.Shell
  $link = $shell.CreateShortcut($menu)
  $link.TargetPath = $exe
  $link.WorkingDirectory = $prefix
  $link.Save()
  Say "installed $prefix (start it from the Start menu: ACRYL Blends)"
  if ($env:ACRYL_BLENDS_NO_LAUNCH -ne '1') { Start-Process -FilePath $exe }
  Say 'done'
}
finally {
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
