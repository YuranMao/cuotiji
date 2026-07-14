# ============================================================
#  CuoTiJi Sync Script
#  Scans data\ directory tree, uploads to Supabase
#  Usage: Right-click -> Run with PowerShell
#  Dir structure: data\ChapterName\KnowledgePoint\image.jpg
# ============================================================

$ErrorActionPreference = "Stop"
$supabaseUrl = "https://owuckenvwmdsithqvsod.supabase.co"
$supabaseKey = "sb_publishable_2Ccd-_BuUgE2RJ35YKyhBA_XhysffVW"
$restUrl = "$supabaseUrl/rest/v1"

$baseHeaders = @{
    "apikey"        = $supabaseKey
    "Authorization" = "Bearer $supabaseKey"
    "Content-Type"  = "application/json"
}
$insertHeaders = $baseHeaders.Clone()
$insertHeaders["Prefer"] = "return=representation"

$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$dataDir = Join-Path $scriptDir "data"

Write-Host "Script dir : $scriptDir" -ForegroundColor DarkGray
Write-Host "Data dir   : $dataDir" -ForegroundColor DarkGray
Write-Host ""

if (-not (Test-Path $dataDir)) {
    Write-Host "[ERROR] data folder not found!" -ForegroundColor Red
    Write-Host "Create folders like: data\Gaoshu\Jixian\problem.jpg" -ForegroundColor Yellow
    cmd /c pause | Out-Null
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  CuoTiJi Sync Tool" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ---------- 1. Fetch existing data from Supabase ----------
Write-Host "[1/5] Connecting to Supabase..." -ForegroundColor Yellow

try {
    $existingChapters = @(Invoke-RestMethod -Uri "$restUrl/chapters?select=*" -Headers $baseHeaders)
} catch {
    Write-Host "  ERROR: Cannot connect to Supabase. Check network." -ForegroundColor Red
    cmd /c pause | Out-Null
    exit 1
}
$chapterMap = @{}
foreach ($ch in $existingChapters) { $chapterMap[$ch.name] = $ch.id }

try {
    $existingKps = @(Invoke-RestMethod -Uri "$restUrl/knowledge_points?select=*" -Headers $baseHeaders)
} catch { $existingKps = @() }
$kpMap = @{}
foreach ($kp in $existingKps) { $kpMap["$($kp.chapter_id)|$($kp.name)"] = $kp.id }

try {
    $existingQuestions = @(Invoke-RestMethod -Uri "$restUrl/questions?select=knowledge_point_id,file_name" -Headers $baseHeaders)
} catch { $existingQuestions = @() }
$questionSet = @{}
foreach ($q in $existingQuestions) {
    if ($q.file_name) { $questionSet["$($q.knowledge_point_id)|$($q.file_name)"] = $true }
}

Write-Host "  Chapters: $($existingChapters.Count)  KPs: $($existingKps.Count)  Questions: $($existingQuestions.Count)" -ForegroundColor Green
Write-Host ""

# ---------- 2. Scan local directories ----------
Write-Host "[2/5] Scanning local data folder..." -ForegroundColor Yellow

$chapters = Get-ChildItem -Path $dataDir -Directory -ErrorAction SilentlyContinue
if (-not $chapters -or $chapters.Count -eq 0) {
    Write-Host "  No chapter folders found in data/ !" -ForegroundColor Red
    Write-Host "  Example: data\Gaoshu\Jixian\problem.jpg" -ForegroundColor Yellow
    cmd /c pause | Out-Null
    exit 1
}

foreach ($chDir in $chapters) {
    $kpCount = (Get-ChildItem $chDir.FullName -Directory -ErrorAction SilentlyContinue).Count
    Write-Host "  Found: $($chDir.Name) ($kpCount KPs)" -ForegroundColor DarkGray
}
Write-Host ""

$newChapters = 0; $newKps = 0; $newQuestions = 0; $totalImages = 0

# ---------- 3. Sync ----------
Write-Host "[3/5] Syncing..." -ForegroundColor Yellow

foreach ($chDir in $chapters) {
    $chapName = $chDir.Name
    if (-not $chapterMap.ContainsKey($chapName)) {
        $body = @{ name = $chapName } | ConvertTo-Json
        try {
            $res = Invoke-RestMethod -Uri "$restUrl/chapters" -Method Post -Body $body -Headers $insertHeaders
            $chapterMap[$chapName] = $res[0].id
            $newChapters++
            Write-Host "  + New chapter: $chapName" -ForegroundColor Green
        } catch {
            Write-Host "  x Chapter failed: $chapName -- $($_.Exception.Message)" -ForegroundColor Red
            continue
        }
    }
    $chapterId = $chapterMap[$chapName]

    $kpDirs = Get-ChildItem -Path $chDir.FullName -Directory -ErrorAction SilentlyContinue
    if (-not $kpDirs) { continue }

    foreach ($kpDir in $kpDirs) {
        $kpName = $kpDir.Name
        $kpKey = "$chapterId|$kpName"
        if (-not $kpMap.ContainsKey($kpKey)) {
            $body = @{ chapter_id = $chapterId; name = $kpName } | ConvertTo-Json
            try {
                $res = Invoke-RestMethod -Uri "$restUrl/knowledge_points" -Method Post -Body $body -Headers $insertHeaders
                $kpMap[$kpKey] = $res[0].id
                $newKps++
                Write-Host "    + New KP: $kpName" -ForegroundColor Green
            } catch {
                Write-Host "    x KP failed: $kpName -- $($_.Exception.Message)" -ForegroundColor Red
                continue
            }
        }
        $kpId = $kpMap[$kpKey]

        $imageFiles = Get-ChildItem -Path $kpDir.FullName -File -ErrorAction SilentlyContinue | Where-Object {
            $_.Extension -match '\.(jpg|jpeg|png|gif|webp|bmp)$'
        }
        foreach ($imgFile in $imageFiles) {
            $totalImages++
            $qKey = "$kpId|$($imgFile.Name)"
            if ($questionSet.ContainsKey($qKey)) { continue }

            try {
                $bytes = [System.IO.File]::ReadAllBytes($imgFile.FullName)
                $base64 = [System.Convert]::ToBase64String($bytes)
                $ext = $imgFile.Extension.TrimStart('.').ToLower()
                $mimeMap = @{ jpg="jpeg"; jpeg="jpeg"; png="png"; gif="gif"; webp="webp"; bmp="bmp" }
                $mime = if ($mimeMap.ContainsKey($ext)) { $mimeMap[$ext] } else { "jpeg" }
                $dataUri = "data:image/$mime;base64,$base64"

                $today = Get-Date -Format "yyyy-MM-dd"
                $body = @{
                    knowledge_point_id = $kpId
                    image_data         = $dataUri
                    first_upload_date  = $today
                    correct_count      = 0
                    wrong_count        = 0
                    review_log         = @()
                    file_name          = $imgFile.Name
                } | ConvertTo-Json -Depth 5 -Compress

                $null = Invoke-RestMethod -Uri "$restUrl/questions" -Method Post -Body $body -Headers $baseHeaders
                $questionSet[$qKey] = $true
                $newQuestions++
                Write-Host "      + Uploaded: $($imgFile.Name)" -ForegroundColor Green
            } catch {
                Write-Host "      x Upload failed: $($imgFile.Name) -- $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    }
}

# ---------- Done ----------
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Sync Complete!" -ForegroundColor Green
Write-Host "  Total images scanned: $totalImages" -ForegroundColor White
Write-Host "  New chapters: $newChapters  New KPs: $newKps  New questions: $newQuestions" -ForegroundColor White
if ($newChapters -eq 0 -and $newKps -eq 0 -and $newQuestions -eq 0) {
    Write-Host "  Nothing new to sync." -ForegroundColor Yellow
}
Write-Host "  Phone URL: https://yuranmao.github.io/cuotiji" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
cmd /c pause | Out-Null
