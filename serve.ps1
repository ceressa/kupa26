# Kupa 26 yerel sunucu. Calistir: powershell -ExecutionPolicy Bypass -File serve.ps1
# Sonra tarayicida http://localhost:8026 ac. Hicbir kurulum gerektirmez.
param([int]$Port = 8026)

$root = $PSScriptRoot
$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".webmanifest" = "application/manifest+json; charset=utf-8"
  ".png"  = "image/png"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host ""
Write-Host "  Kupa 26 calisiyor:  http://localhost:$Port" -ForegroundColor Green
Write-Host "  Durdurmak icin Ctrl+C" -ForegroundColor DarkGray
Write-Host ""
Start-Process "http://localhost:$Port"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      $path = $ctx.Request.Url.AbsolutePath.TrimStart("/")
      if ([string]::IsNullOrEmpty($path)) { $path = "index.html" }
      $file = Join-Path $root $path
      if ((Test-Path $file -PathType Leaf) -and $file.StartsWith($root)) {
        $ext = [System.IO.Path]::GetExtension($file).ToLower()
        $ct = $mime[$ext]; if (-not $ct) { $ct = "application/octet-stream" }
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $ctx.Response.ContentType = $ct
        $ctx.Response.ContentLength64 = $bytes.Length
        if ($ctx.Request.HttpMethod -ne "HEAD") {
          $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
      } else {
        $ctx.Response.StatusCode = 404
      }
    } catch {}
    try { $ctx.Response.Close() } catch {}
  }
} finally {
  $listener.Stop()
}
