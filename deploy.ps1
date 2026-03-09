# deploy.ps1 — Build & deploy masoi-app to IIS (WWolf site)
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
$appDir       = Join-Path $scriptDir "masoi-app"
$msdeployPath = "C:\Program Files\IIS\Microsoft Web Deploy V3\msdeploy.exe"

if (-not (Test-Path $msdeployPath)) {
    Write-Host "ERROR: MSDeploy not found at $msdeployPath" -ForegroundColor Red
    exit 1
}

# ── Step 1: Build Next.js ──
if (-not $SkipBuild) {
    Write-Host "`n[1/2] Building Next.js app..." -ForegroundColor Cyan
    Push-Location $appDir
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        Write-Host "Next.js build FAILED!" -ForegroundColor Red
        exit 1
    }
    Pop-Location
    Write-Host "Next.js build OK" -ForegroundColor Green
} else {
    Write-Host "`n[1/2] Skipping build (--SkipBuild)" -ForegroundColor Yellow
}

# ── Step 2: Deploy via MSDeploy ──
Write-Host "`n[2/2] Deploying to $SiteName..." -ForegroundColor Cyan

if ($WwwrootOnly) {
    $sourceDir   = Join-Path $appDir "public"
    $destContent = "$SiteName\public"
    Write-Host "  (public only)" -ForegroundColor Yellow
} else {
    $sourceDir   = $appDir
    $destContent = $SiteName
}

$msdeployArgs = @(
    "-verb:sync",
    "-source:contentPath=`"$sourceDir`"",
    "-dest:contentPath=`"$destContent`",computerName=`"$DeployUrl`",authType=Basic,userName=`"$DeployUser`",password=`"$DeployPassword`"",
    "-allowUntrusted",
    "-skip:objectName=dirPath,absolutePath=.*\\node_modules$",
    "-skip:objectName=dirPath,absolutePath=.*\\.git$",
    "-skip:objectName=filePath,absolutePath=.*\.env\.local$",
    "-enableRule:AppOffline"
)

& $msdeployPath @msdeployArgs

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nDEPLOY THANH CONG!" -ForegroundColor Green
} else {
    Write-Host "`nDEPLOY THAT BAI! (exit code: $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
}
