# ============================================================
# Roboflow Object Detection → CSV outputs for Excel
# MacBook Pro / macOS PowerShell version
# ============================================================

# ===================== CONFIG =====================

# Roboflow API key
# For trial only. Regenerate this key later because it has been shared.
$apiKey = "Jvth0xeXg7kR3sW7KO8m"

# Folder containing your test frames/images
# 🟨 REPLACE THIS with your actual Mac folder path
$inFolder = "/Users/elenamichajlowska/Documents/ALAMATA/Clients/Platformation/1st-demo-19 May/frames"

# Include images inside subfolders?
$includeSubfolders = $false

# Output CSV files
$outDetections = Join-Path $inFolder "roboflow_predictions_detections-demo1.csv"
$outSummary    = Join-Path $inFolder "roboflow_predictions_per_image-demo2.csv"

# Roboflow model endpoint
$modelId = "my-first-project-6rjsc/4"

# Roboflow endpoint type
$endpointType = "serverless"

# Confidence threshold
$minProb = 0.25


# ===================== BUILD ENDPOINT =====================

$confidencePct = [math]::Round($minProb * 100)
$predictUrl = ""

if ($endpointType -eq "serverless") {
    $predictUrl = "https://serverless.roboflow.com/$modelId" + "?api_key=$apiKey&format=json&confidence=$confidencePct"
}

if ($endpointType -eq "detect") {
    $predictUrl = "https://detect.roboflow.com/$modelId" + "?api_key=$apiKey&format=json&confidence=$confidencePct"
}

if ([string]::IsNullOrWhiteSpace($predictUrl)) {
    Write-Error "Invalid endpoint type. Use 'serverless' or 'detect'."
    exit
}


# ===================== BASIC CHECKS =====================

if ([string]::IsNullOrWhiteSpace($apiKey)) {
    Write-Error "API key is empty."
    exit
}

if ([string]::IsNullOrWhiteSpace($modelId)) {
    Write-Error "ModelId is empty."
    exit
}

if (-not (Test-Path $inFolder)) {
    Write-Error "Input folder does not exist: $inFolder"
    exit
}


# ===================== INIT =====================

$detections = New-Object System.Collections.Generic.List[object]
$summary    = New-Object System.Collections.Generic.List[object]

if ($includeSubfolders) {
    $allFiles = Get-ChildItem -Path $inFolder -File -Recurse
}

if (-not $includeSubfolders) {
    $allFiles = Get-ChildItem -Path $inFolder -File
}

$images = $allFiles | Where-Object {
    $_.Extension.ToLower() -in @(".jpg", ".jpeg", ".png")
}

Write-Host "Found $($images.Count) image(s) in '$inFolder'."

if ($images.Count -eq 0) {
    Write-Warning "No .jpg/.jpeg/.png files found."
    exit
}


# ===================== PROCESS IMAGES =====================

foreach ($imgItem in $images) {

    $imgPath = $imgItem.FullName
    Write-Host "Processing: $($imgItem.Name)"

    # Send image to Roboflow
    try {
        $bytes  = [System.IO.File]::ReadAllBytes($imgPath)
        $base64 = [System.Convert]::ToBase64String($bytes)

        $headers = @{
            "Content-Type" = "application/x-www-form-urlencoded"
        }

        $resp = Invoke-RestMethod -Method Post -Uri $predictUrl -Headers $headers -Body $base64
    }
    catch {
        Write-Warning "Prediction failed for: $imgPath"
        Write-Warning $_.Exception.Message

        $summary.Add([pscustomobject]@{
            Image          = $imgItem.Name
            FullPath       = $imgPath
            NumDetections  = 0
            TopTag         = $null
            TopProb        = $null
            ImageWidth_px  = $null
            ImageHeight_px = $null
        })

        continue
    }

    # Use image dimensions from Roboflow response
    $imgW = $resp.image.width
    $imgH = $resp.image.height

    if ($null -eq $imgW -or $null -eq $imgH) {
        Write-Warning "Image dimensions missing from Roboflow response for $imgPath. Skipping."
        continue
    }

    if ($null -eq $resp.predictions) {
        $preds = @()
    }

    if ($null -ne $resp.predictions) {
        $preds = @($resp.predictions | Where-Object {
            [double]$_.confidence -ge $minProb
        })
    }

    foreach ($p in $preds) {

        # Roboflow returns centre x/y + width/height in pixels
        $centerX = [double]$p.x
        $centerY = [double]$p.y
        $rawW    = [double]$p.width
        $rawH    = [double]$p.height

        # Convert centre-based box to corners
        $Xmin = [math]::Round($centerX - ($rawW / 2))
        $Ymin = [math]::Round($centerY - ($rawH / 2))
        $Xmax = [math]::Round($centerX + ($rawW / 2))
        $Ymax = [math]::Round($centerY + ($rawH / 2))

        # Clamp to image boundaries
        $Xmin = [math]::Max(0, [math]::Min($Xmin, $imgW))
        $Ymin = [math]::Max(0, [math]::Min($Ymin, $imgH))
        $Xmax = [math]::Max(0, [math]::Min($Xmax, $imgW))
        $Ymax = [math]::Max(0, [math]::Min($Ymax, $imgH))

        $BoxW = $Xmax - $Xmin
        $BoxH = $Ymax - $Ymin
        $Area = $BoxW * $BoxH

        if ($BoxW -le 0 -or $BoxH -le 0) {
            continue
        }

        # Normalised Custom Vision-style coordinates
        $Left_norm   = $Xmin / $imgW
        $Top_norm    = $Ymin / $imgH
        $Width_norm  = $BoxW / $imgW
        $Height_norm = $BoxH / $imgH

        # Roboflow class/tag extraction
        $tag = $null

        if ($p.PSObject.Properties["class"]) {
            $tag = $p.PSObject.Properties["class"].Value
        }

        if ([string]::IsNullOrWhiteSpace($tag) -and $p.PSObject.Properties["class_name"]) {
            $tag = $p.PSObject.Properties["class_name"].Value
        }

        if ([string]::IsNullOrWhiteSpace($tag)) {
            $tag = "unknown"
        }

        $detections.Add([pscustomobject]@{
            Image          = $imgItem.Name
            FullPath       = $imgPath
            Tag            = $tag
            Probability    = [math]::Round([double]$p.confidence, 4)
            Left_norm      = [math]::Round($Left_norm, 6)
            Top_norm       = [math]::Round($Top_norm, 6)
            Width_norm     = [math]::Round($Width_norm, 6)
            Height_norm    = [math]::Round($Height_norm, 6)
            Xmin_px        = $Xmin
            Ymin_px        = $Ymin
            Xmax_px        = $Xmax
            Ymax_px        = $Ymax
            BoxWidth_px    = $BoxW
            BoxHeight_px   = $BoxH
            BoxArea_px     = $Area
            ImageWidth_px  = $imgW
            ImageHeight_px = $imgH
        })
    }

    # Per-image summary
    $count = $preds.Count

    if ($count -gt 0) {
        $top = $preds | Sort-Object confidence -Descending | Select-Object -First 1

        $topTag = $null

        if ($top.PSObject.Properties["class"]) {
            $topTag = $top.PSObject.Properties["class"].Value
        }

        if ([string]::IsNullOrWhiteSpace($topTag) -and $top.PSObject.Properties["class_name"]) {
            $topTag = $top.PSObject.Properties["class_name"].Value
        }

        if ([string]::IsNullOrWhiteSpace($topTag)) {
            $topTag = "unknown"
        }

        $summary.Add([pscustomobject]@{
            Image          = $imgItem.Name
            FullPath       = $imgPath
            NumDetections  = $count
            TopTag         = $topTag
            TopProb        = [math]::Round([double]$top.confidence, 4)
            ImageWidth_px  = $imgW
            ImageHeight_px = $imgH
        })
    }

    if ($count -eq 0) {
        $summary.Add([pscustomobject]@{
            Image          = $imgItem.Name
            FullPath       = $imgPath
            NumDetections  = 0
            TopTag         = $null
            TopProb        = $null
            ImageWidth_px  = $imgW
            ImageHeight_px = $imgH
        })
    }
}


# ===================== SAVE CSVs =====================

$detections | Export-Csv -Path $outDetections -NoTypeInformation -Encoding UTF8
$summary    | Export-Csv -Path $outSummary -NoTypeInformation -Encoding UTF8

Write-Host "Saved detections to: $outDetections"
Write-Host "Saved per-image summary to: $outSummary"
Write-Host "Done."
