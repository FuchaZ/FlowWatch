# FlowWatch icon generator: deep-navy gradient rounded square + white donut (traffic share) + amber data point
# Color scheme matches UI (--accent #2563eb / deep #1e3a8a / amber #fbbf24)
Add-Type -AssemblyName System.Drawing

function New-RoundedRectPath {
  param($x, $y, $w, $h, $r)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = [Math]::Min($r * 2, [Math]::Min($w, $h))
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseAllFigures()
  return $path
}

$sizes = @(128, 64, 48, 32, 16)

foreach ($size in $sizes) {
  $cr = [Math]::Max(4, $size / 6)
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $bmp.SetResolution(96, 96)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.PixelOffsetMode = 'Half'

  # Deep-navy gradient background (#1E3A8A -> #2563EB, diagonal)
  $bgRect = [System.Drawing.Rectangle]::new(0, 0, $size, $size)
  $gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $bgRect,
    [System.Drawing.Color]::FromArgb(255, 30, 58, 138),
    [System.Drawing.Color]::FromArgb(255, 37, 99, 235),
    [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal
  )
  $path = New-RoundedRectPath 0 0 $size $size $cr
  $g.FillPath($gradient, $path)

  # Top-left shine
  $shineRect = [System.Drawing.RectangleF]::new(0, 0, $size, $size * 0.5)
  $shineBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $shineRect,
    [System.Drawing.Color]::FromArgb(55, 255, 255, 255),
    [System.Drawing.Color]::FromArgb(0, 255, 255, 255),
    90
  )
  $g.FillPath($shineBrush, $path)

  # Donut ring (center-ish, mimics traffic share)
  $ringCX = $size * 0.5
  $ringCY = $size * 0.54
  $ringR = $size * 0.30
  $ringW = [Math]::Max(2.0, $size * 0.115)
  $ringRect = [System.Drawing.RectangleF]::new(
    $ringCX - $ringR, $ringCY - $ringR, $ringR * 2, $ringR * 2
  )

  # Arc segments (GDI+: 0 deg = 3 o'clock, clockwise): white with varying opacity; 2 arcs for small sizes
  if ($size -ge 48) {
    $arcs = @(
      @(-90, 55, 255),
      @(-35, 85, 210),
      @(50, 130, 165)
    )
  } else {
    $arcs = @(
      @(-90, 90, 255),
      @(0, 150, 185)
    )
  }
  foreach ($arc in $arcs) {
    $pen = New-Object System.Drawing.Pen(
      [System.Drawing.Color]::FromArgb($arc[2], 255, 255, 255),
      [float]$ringW
    )
    $pen.StartCap = 'Round'
    $pen.EndCap = 'Round'
    $g.DrawArc($pen, $ringRect, [float]$arc[0], [float]$arc[1])
    $pen.Dispose()
  }

  # Center dot (semi-transparent white, hollow-donut feel)
  $centerR = [Math]::Max(1.5, $size * 0.045)
  $centerBrush = New-Object System.Drawing.SolidBrush(
    [System.Drawing.Color]::FromArgb(140, 255, 255, 255)
  )
  $g.FillEllipse($centerBrush,
    $ringCX - $centerR, $ringCY - $centerR, $centerR * 2, $centerR * 2)
  $centerBrush.Dispose()

  # Amber data point at 45 deg on the ring (echoes --peak-color)
  $gold = [System.Drawing.Color]::FromArgb(255, 251, 191, 36)
  $dotR = [Math]::Max(1.5, $size * 0.07)
  $dotAng = 45 * [Math]::PI / 180
  $dotX = $ringCX + $ringR * [Math]::Cos($dotAng)
  $dotY = $ringCY + $ringR * [Math]::Sin($dotAng)
  $goldBrush = New-Object System.Drawing.SolidBrush($gold)
  $g.FillEllipse($goldBrush,
    $dotX - $dotR, $dotY - $dotR, $dotR * 2, $dotR * 2)
  $goldBrush.Dispose()

  # Save
  $filename = if ($size -eq 128) { "icon128.png" } else { "icon$size.png" }
  $filepath = Join-Path "C:\Users\FuChaZ\Documents\Default Project\edge-traffic-monitor" $filename
  $bmp.Save($filepath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  Write-Host "Generated $filename ($size x $size)"
}

Write-Host "All icons generated."
