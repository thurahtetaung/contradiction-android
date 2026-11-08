param([string]$Sdk = "$env:LOCALAPPDATA\Android\Sdk", [ValidateSet('Debug','Release')][string]$Variant = 'Release')
$ErrorActionPreference = 'Stop'
$portRoot = $PSScriptRoot
$portNode = Join-Path $portRoot '..\..\.tools\node.exe'
if (-not (Test-Path -LiteralPath $portNode)) { $portNode = (Get-Command node).Source }
& $portNode (Join-Path $portRoot 'prepare.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Asset preparation failed' }
Set-Content -LiteralPath (Join-Path $portRoot 'local.properties') -Value ('sdk.dir=' + $Sdk.Replace('\','/').Replace(':','\:'))
if (-not $env:JAVA_HOME) { $env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr' }
$portGradle = Join-Path $portRoot 'gradlew.bat'
if (-not (Test-Path -LiteralPath $portGradle)) { $portGradle = Get-ChildItem -LiteralPath "$env:USERPROFILE\.gradle\wrapper\dists" -Recurse -Filter gradle.bat | Where-Object FullName -Match 'gradle-8\.14\\bin' | Select-Object -First 1 -ExpandProperty FullName }
if (-not $portGradle) { throw 'Gradle 8.14 is required. Open this project in Android Studio or install Gradle 8.14.' }
& $portGradle -p $portRoot "assemble$Variant" "lint$Variant" --console=plain
if ($LASTEXITCODE -ne 0) { throw 'Android build failed' }
$portDist = Join-Path $portRoot 'dist'
New-Item -ItemType Directory -Path $portDist -Force | Out-Null
$portVariantLower = $Variant.ToLowerInvariant()
Copy-Item -LiteralPath (Join-Path $portRoot "app\build\outputs\apk\$portVariantLower\app-$portVariantLower.apk") -Destination (Join-Path $portDist 'Contradiction-Android-prototype.apk')
Write-Output (Join-Path $portDist 'Contradiction-Android-prototype.apk')
