# deploy.ps1 — Build & deploy masoi-web-app to IIS (WWolf site)
# Architecture: React (Vite) frontend + ASP.NET Core 8 backend
param(
    [string]$SiteName       = "WWolf",
    [string]$DeployUrl      = "https://deploy.giatocnguyenhuu.vn:12178/msdeploy.axd?site=WWolf",
    [string]$DeployUser     = "WDeployAdmin",
    [string]$DeployPassword = '3&BVZM$odS7X9$4h2y',
    [switch]$SkipBuild,
    [switch]$WwwrootOnly
)

$ErrorActionPreference = "Stop"
$scriptDir    = $PSScriptRoot
$frontendDir  = Join-Path $scriptDir "frontend"
$backendDir   = Join-Path $scriptDir "backend"
$wwwrootDir   = Join-Path $backendDir "wwwroot"
$publishDir   = Join-Path $backendDir "bin\publish"
$msdeployPath = "C:\Program Files\IIS\Microsoft Web Deploy V3\msdeploy.exe"

if (-not (Test-Path $msdeployPath)) {
    Write-Host "ERROR: MSDeploy not found at $msdeployPath" -ForegroundColor Red
    exit 1
}

# ── Step 1: Build frontend (Vite) → backend/wwwroot ──
if (-not $SkipBuild) {
    Write-Host "`n[1/3] Building frontend (Vite)..." -ForegroundColor Cyan
    Push-Location $frontendDir

    if (-not (Test-Path "node_modules")) {
        Write-Host "  Installing npm dependencies..." -ForegroundColor Yellow
        npm ci
        if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Host "npm ci FAILED!" -ForegroundColor Red; exit 1 }
    }

    npx vite build --outDir $wwwrootDir --emptyOutDir
    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        Write-Host "Frontend build FAILED!" -ForegroundColor Red
        exit 1
    }
    Pop-Location
    Write-Host "Frontend build OK" -ForegroundColor Green

    # ── Step 2: Publish backend (.NET) ──
    Write-Host "`n[2/3] Publishing backend (.NET)..." -ForegroundColor Cyan
    Push-Location $backendDir
    dotnet publish -c Release -o $publishDir
    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        Write-Host "Backend publish FAILED!" -ForegroundColor Red
        exit 1
    }
    Pop-Location
    Write-Host "Backend publish OK" -ForegroundColor Green
} else {
    Write-Host "`n[1/3] Skipping build (--SkipBuild)" -ForegroundColor Yellow
    Write-Host "[2/3] Skipping publish (--SkipBuild)" -ForegroundColor Yellow
}

# ── Step 3: Deploy via MSDeploy ──
Write-Host "`n[3/3] Deploying to $SiteName..." -ForegroundColor Cyan

if ($WwwrootOnly) {
    $sourceDir   = Join-Path $publishDir "wwwroot"
    $destContent = "$SiteName\wwwroot"
    Write-Host "  (wwwroot only)" -ForegroundColor Yellow
} else {
    $sourceDir   = $publishDir
    $destContent = $SiteName
}

# Ensure App_Data folder exists on server (for SQLite DB)
$appDataLocal = Join-Path $publishDir "App_Data"
if (-not (Test-Path $appDataLocal)) { New-Item -ItemType Directory -Path $appDataLocal | Out-Null }
"placeholder" | Out-File (Join-Path $appDataLocal ".keep") -Encoding utf8
Write-Host "  Creating App_Data on server..." -ForegroundColor Yellow
& $msdeployPath `
    "-verb:sync" `
    "-source:contentPath=`"$appDataLocal`"" `
    "-dest:contentPath=`"$destContent\App_Data`",computerName=`"$DeployUrl`",authType=Basic,userName=`"$DeployUser`",password=`"$DeployPassword`"" `
    "-allowUntrusted"
Remove-Item (Join-Path $appDataLocal ".keep") -Force -ErrorAction SilentlyContinue

# Deploy app_offline.htm first to stop the app, then wait for IIS to release locks
$offlineFile = Join-Path $sourceDir "app_offline.htm"
"<html><body>Updating...</body></html>" | Out-File $offlineFile -Encoding utf8

Write-Host "  Sending app_offline.htm to stop app..." -ForegroundColor Yellow
& $msdeployPath `
    "-verb:sync" `
    "-source:contentPath=`"$offlineFile`"" `
    "-dest:contentPath=`"$destContent\app_offline.htm`",computerName=`"$DeployUrl`",authType=Basic,userName=`"$DeployUser`",password=`"$DeployPassword`"" `
    "-allowUntrusted"
Start-Sleep -Seconds 10

$msdeployArgs = @(
    "-verb:sync",
    "-source:contentPath=`"$sourceDir`"",
    "-dest:contentPath=`"$destContent`",computerName=`"$DeployUrl`",authType=Basic,userName=`"$DeployUser`",password=`"$DeployPassword`"",
    "-allowUntrusted",
    "-skip:objectName=dirPath,absolutePath=.*\\node_modules$",
    "-skip:objectName=dirPath,absolutePath=.*\\.git$",
    "-skip:objectName=filePath,absolutePath=.*\.env\.local$",
    "-skip:objectName=dirPath,absolutePath=.*\\App_Data$",
    "-retryAttempts:5",
    "-retryInterval:3000"
)

& $msdeployPath @msdeployArgs
$deployExit = $LASTEXITCODE

# Remove app_offline.htm from local publish dir
Remove-Item $offlineFile -Force -ErrorAction SilentlyContinue

if ($deployExit -ne 0) {
    Write-Host "`nDEPLOY THAT BAI! (exit code: $deployExit)" -ForegroundColor Red
    exit $deployExit
}

# Remove app_offline.htm from server to bring app back online
Write-Host "Bringing app back online..." -ForegroundColor Cyan
& $msdeployPath `
    "-verb:delete" `
    "-dest:contentPath=`"$destContent\app_offline.htm`",computerName=`"$DeployUrl`",authType=Basic,userName=`"$DeployUser`",password=`"$DeployPassword`"" `
    "-allowUntrusted"

Write-Host "`nDEPLOY THANH CONG!" -ForegroundColor Green
