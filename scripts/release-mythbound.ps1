param(
  [Parameter(Mandatory=$true)]
  [string]$Version,

  [Parameter(Mandatory=$true)]
  [int]$VersionCode,

  [string]$Notes = "Mythbound Tamers update.",

  [string]$RepoOwner = "costaskk",

  [string]$RepoName = "Mythbound-Tamers",

  [string]$ApkSource = "android\app\build\outputs\apk\release\app-release.apk"
)

$ErrorActionPreference = "Stop"

Write-Host "== Mythbound Tamers release helper ==" -ForegroundColor Cyan
Write-Host "Version: $Version"
Write-Host "VersionCode: $VersionCode"

if (!(Test-Path $ApkSource)) {
  Write-Host "Could not find APK at: $ApkSource" -ForegroundColor Yellow
  Write-Host "Searching for APK files under android\app..."
  Get-ChildItem -Recurse -Filter "*.apk" "android\app" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object FullName, LastWriteTime | Format-Table -AutoSize
  Write-Host ""
  Write-Host "If Android Studio saved it elsewhere, rerun with:"
  Write-Host ".\scripts\release-mythbound.ps1 -Version `"$Version`" -VersionCode $VersionCode -Notes `"$Notes`" -ApkSource `"android\app\release\app-release.apk`""
  exit 1
}

$apkName = "mythbound-tamers-v$Version.apk"
Copy-Item $ApkSource $apkName -Force
Write-Host "Copied APK to $apkName" -ForegroundColor Green

$manifestPath = "docs\update-manifest.json"
$apkUrl = "https://github.com/$RepoOwner/$RepoName/releases/download/v$Version/$apkName"

$manifest = [ordered]@{
  version = $Version
  versionCode = $VersionCode
  notes = $Notes
  apkUrl = $apkUrl
  mandatory = $false
  publishedAt = (Get-Date -Format "yyyy-MM-dd")
}

if (!(Test-Path "docs")) {
  New-Item -ItemType Directory -Path "docs" | Out-Null
}

$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $manifestPath -Encoding UTF8
Write-Host "Wrote $manifestPath" -ForegroundColor Green

Write-Host ""
Write-Host "Run these commands:" -ForegroundColor Cyan
Write-Host "git add ."
Write-Host "git commit -m `"Release v$Version`""
Write-Host "git push origin main"
Write-Host "gh release create v$Version `"$apkName`" --title `"Mythbound Tamers v$Version`" --notes `"$Notes`""
Write-Host ""
Write-Host "Manifest URL:"
Write-Host "https://$RepoOwner.github.io/$RepoName/update-manifest.json"
