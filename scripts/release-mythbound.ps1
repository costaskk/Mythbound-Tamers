param(
  [Parameter(Mandatory=$true)][string]$Version,
  [Parameter(Mandatory=$true)][int]$VersionCode,
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
  Get-ChildItem -Recurse -Filter "*.apk" "android\app" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object FullName, LastWriteTime | Format-Table -AutoSize
  exit 1
}
$apkName = "mythbound-tamers-v$Version.apk"
Copy-Item $ApkSource $apkName -Force
$apkUrl = "https://github.com/$RepoOwner/$RepoName/releases/download/v$Version/$apkName"
if (!(Test-Path "docs")) { New-Item -ItemType Directory -Path "docs" | Out-Null }
[ordered]@{
  version = $Version
  versionCode = $VersionCode
  notes = $Notes
  apkUrl = $apkUrl
  mandatory = $false
  publishedAt = (Get-Date -Format "yyyy-MM-dd")
} | ConvertTo-Json -Depth 5 | Set-Content -Path "docs\update-manifest.json" -Encoding UTF8
Write-Host "Copied APK to $apkName and updated docs\update-manifest.json" -ForegroundColor Green
Write-Host "Run:"
Write-Host "git add ."
Write-Host "git commit -m `"Release v$Version`""
Write-Host "git push origin main"
Write-Host "gh release create v$Version `"$apkName`" --title `"Mythbound Tamers v$Version`" --notes `"$Notes`""
