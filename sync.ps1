# ============================================================
#  错题集同步脚本
#  扫描 data\ 目录，上传到 Supabase，手机端自动同步
#  目录结构：data\章节名\知识点名\错题图片.jpg
#  用法：右键 -> 使用 PowerShell 运行，或在终端输入 .\sync.ps1
# ============================================================

$supabaseUrl = "https://owuckenvwmdsithqvsod.supabase.co"
$supabaseKey = "sb_publishable_2Ccd-_BuUgE2RJ35YKyhBA_XhysffVW"
$restUrl = "$supabaseUrl/rest/v1"

$headers = @{
    "apikey"        = $supabaseKey
    "Authorization" = "Bearer $supabaseKey"
    "Content-Type"  = "application/json"
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path $scriptDir "data"

if (-not (Test-Path $dataDir)) {
    Write-Host "[错误] data 目录不存在: $dataDir" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  错题集同步工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ---------- 1. 从 Supabase 拉取已有数据 ----------
Write-Host "[1/5] 正在连接 Supabase..." -ForegroundColor Yellow

try {
    $existingChapters = @(Invoke-RestMethod -Uri "$restUrl/chapters?select=*" -Headers $headers)
} catch {
    $existingChapters = @()
}
$chapterMap = @{}
foreach ($ch in $existingChapters) { $chapterMap[$ch.name] = $ch.id }

try {
    $existingKps = @(Invoke-RestMethod -Uri "$restUrl/knowledge_points?select=*" -Headers $headers)
} catch {
    $existingKps = @()
}
$kpMap = @{}
foreach ($kp in $existingKps) { $kpMap["$($kp.chapter_id)|$($kp.name)"] = $kp.id }

try {
    $existingQuestions = @(Invoke-RestMethod -Uri "$restUrl/questions?select=knowledge_point_id,file_name" -Headers $headers)
} catch {
    $existingQuestions = @()
}
$questionSet = @{}
foreach ($q in $existingQuestions) {
    if ($q.file_name) {
        $questionSet["$($q.knowledge_point_id)|$($q.file_name)"] = $true
    }
}

Write-Host "  已有章节: $($existingChapters.Count)  知识点: $($existingKps.Count)  错题: $($existingQuestions.Count)" -ForegroundColor Green
Write-Host ""

# ---------- 2. 扫描目录 ----------
Write-Host "[2/5] 正在扫描本地目录..." -ForegroundColor Yellow

$chapters = Get-ChildItem -Path $dataDir -Directory
if ($chapters.Count -eq 0) {
    Write-Host "  data 目录下没有章节文件夹，请先创建目录结构！" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}

$newChapters = 0
$newKps = 0
$newQuestions = 0

# ---------- 3. 创建章节 ----------
Write-Host "[3/5] 正在同步章节..." -ForegroundColor Yellow

foreach ($chDir in $chapters) {
    $chapName = $chDir.Name
    if (-not $chapterMap.ContainsKey($chapName)) {
        $body = @{ name = $chapName } | ConvertTo-Json
        try {
            $res = Invoke-RestMethod -Uri "$restUrl/chapters" -Method Post -Body $body -Headers $headers
            $chapterMap[$chapName] = $res.id
            $newChapters++
            Write-Host "  + 新建章节: $chapName" -ForegroundColor Green
        } catch {
            Write-Host "  x 创建章节失败: $chapName — $_" -ForegroundColor Red
            continue
        }
    }
    $chapterId = $chapterMap[$chapName]

    # ---------- 4. 创建知识点 ----------
    $kpDirs = Get-ChildItem -Path $chDir.FullName -Directory
    foreach ($kpDir in $kpDirs) {
        $kpName = $kpDir.Name
        $kpKey = "$chapterId|$kpName"
        if (-not $kpMap.ContainsKey($kpKey)) {
            $body = @{ chapter_id = $chapterId; name = $kpName } | ConvertTo-Json
            try {
                $res = Invoke-RestMethod -Uri "$restUrl/knowledge_points" -Method Post -Body $body -Headers $headers
                $kpMap[$kpKey] = $res.id
                $newKps++
                Write-Host "    + 新建知识点: $kpName" -ForegroundColor Green
            } catch {
                Write-Host "    x 创建知识点失败: $kpName — $_" -ForegroundColor Red
                continue
            }
        }
        $kpId = $kpMap[$kpKey]

        # ---------- 5. 上传错题图片 ----------
        $imageFiles = Get-ChildItem -Path $kpDir.FullName -File | Where-Object {
            $_.Extension -match '\.(jpg|jpeg|png|gif|webp|bmp)$'
        }
        foreach ($imgFile in $imageFiles) {
            $qKey = "$kpId|$($imgFile.Name)"
            if ($questionSet.ContainsKey($qKey)) { continue }

            try {
                $bytes = [System.IO.File]::ReadAllBytes($imgFile.FullName)
                $base64 = [System.Convert]::ToBase64String($bytes)
                $ext = $imgFile.Extension.TrimStart('.')
                $mimeMap = @{ jpg="jpeg"; jpeg="jpeg"; png="png"; gif="gif"; webp="webp"; bmp="bmp" }
                $mime = $mimeMap[$ext]
                $dataUri = "data:image/$mime;base64,$base64"

                $today = Get-Date -Format "yyyy-MM-dd"
                $body = @{
                    knowledge_point_id = $kpId
                    image_data         = $dataUri
                    first_upload_date  = $today
                    review_count       = 0
                    review_dates       = @()
                    file_name          = $imgFile.Name
                } | ConvertTo-Json -Depth 3

                Invoke-RestMethod -Uri "$restUrl/questions" -Method Post -Body $body -Headers $headers | Out-Null
                $questionSet[$qKey] = $true
                $newQuestions++
                Write-Host "      + 上传: $($imgFile.Name)" -ForegroundColor Green
            } catch {
                Write-Host "      x 上传失败: $($imgFile.Name) — $_" -ForegroundColor Red
            }
        }
    }
}

# ---------- 完成 ----------
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  同步完成！" -ForegroundColor Green
Write-Host "  新建章节: $newChapters  新建知识点: $newKps  新上传错题: $newQuestions" -ForegroundColor White
Write-Host "  手机访问: https://yuranmao.github.io/cuotiji" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Read-Host "按回车退出"
