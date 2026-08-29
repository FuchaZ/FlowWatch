# FlowWatch icon generator: light neutral rounded square + steel-blue donut ring + warm-sand data point
# Color scheme matches UI (patina default: panel #ffffff / accent #315f9f / sand #c19b5c)
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

  # Light neutral gradient background (#FFFFFF -> #E4E4E4, diagonal)
  $bgRect = [System.Drawing.Rectangle]::new(0, 0, $size, $size)
  $gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $bgRect,
    [System.Drawing.Color]::FromArgb(255, 255, 255, 255),
    [System.Drawing.Color]::FromArgb(255, 226, 226, 226),
    [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal
  )
  $path = New-RoundedRectPath 0 0 $size $size $cr
  $g.FillPath($gradient, $path)

  # Top-left shine
  $shineRect = [System.Drawing.RectangleF]::new(0, 0, $size, $size * 0.5)
  $shineBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $shineRect,
    [System.Drawing.Color]::FromArgb(10, 255, 255, 255),
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

  # Arc segments (GDI+: 0 deg = 3 o'clock, clockwise): steel-blue with varying opacity; 2 arcs for small sizes
  if ($size -ge 48) {
    $arcs = @(
      @(-90, 55, 250),
      @(-35, 85, 195),
      @(50, 130, 140)
    )
  } else {
    $arcs = @(
      @(-90, 90, 245),
      @(0, 150, 165)
    )
  }
  foreach ($arc in $arcs) {
    $pen = New-Object System.Drawing.Pen(
      [System.Drawing.Color]::FromArgb($arc[2], 49, 95, 159),
      [float]$ringW
    )
    $pen.StartCap = 'Round'
    $pen.EndCap = 'Round'
    $g.DrawArc($pen, $ringRect, [float]$arc[0], [float]$arc[1])
    $pen.Dispose()
  }

  # Center dot (semi-transparent steel-blue, hollow-donut feel)
  $centerR = [Math]::Max(1.5, $size * 0.045)
  $centerBrush = New-Object System.Drawing.SolidBrush(
    [System.Drawing.Color]::FromArgb(120, 49, 95, 159)
  )
  $g.FillEllipse($centerBrush,
    $ringCX - $centerR, $ringCY - $centerR, $centerR * 2, $centerR * 2)
  $centerBrush.Dispose()

  # Warm-sand data point at 45 deg on the ring (echoes --download-color)
  $gold = [System.Drawing.Color]::FromArgb(255, 185, 138, 63)
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
  $filepath = Join-Path $PSScriptRoot $filename
  $bmp.Save($filepath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  Write-Host "Generated $filename ($size x $size)"
}

Write-Host "All icons generated."
