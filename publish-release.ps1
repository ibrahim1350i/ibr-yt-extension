param(
    [Parameter(Mandatory=$true)]
    [string]$Version,
    [string]$Notes = ""
)

$ExtDir = $PSScriptRoot
$ZipPath = "$env:TEMP\ibr-extension-$Version.zip"

Write-Host "`n Eklenti Surumu Yayinlaniyor: $Version" -ForegroundColor Cyan

Set-Location $ExtDir

# 1. manifest.json version guncelle
$manifest = Get-Content "$ExtDir\manifest.json" -Raw | ConvertFrom-Json
$manifest.version = $Version -replace "^v", ""
$manifest | ConvertTo-Json -Depth 10 | Set-Content "$ExtDir\manifest.json" -Encoding UTF8
Write-Host "manifest.json guncellendi: $($manifest.version)" -ForegroundColor Green

# 2. Git commit ve push
git add .
git commit -m "Release $Version"
git push origin main
Write-Host "GitHub push edildi" -ForegroundColor Green

# 3. Zip olustur
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path "$ExtDir\*" -DestinationPath $ZipPath -Force
Write-Host "Zip olusturuldu" -ForegroundColor Green

# 4. GitHub Release olustur
$releaseNotes = if ($Notes) { $Notes } else { "Chrome eklentisi $Version surumu." }
gh release create $Version $ZipPath --repo ibrahim1350i/ibr-yt-extension --title "$Version" --notes $releaseNotes
Write-Host "GitHub Release olusturuldu: $Version" -ForegroundColor Green

Remove-Item $ZipPath -Force
Write-Host "`nTamamlandi! https://github.com/ibrahim1350i/ibr-yt-extension/releases/tag/$Version" -ForegroundColor Magenta
