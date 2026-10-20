# scripts/overpass-check.ps1
#
# Measures which public Overpass (OpenStreetMap) servers answer from THIS computer
# and how fast: a light query and the heavy "all categories" style query.
#
#   powershell -ExecutionPolicy Bypass -File scripts\overpass-check.ps1
#
# ASCII-only on purpose (Windows PowerShell 5.1 reads BOM-less files as ANSI).

$servers = @(
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.osm.jp/api/interpreter"
)

# Osijek centre, 5 km
$around = "(around:5000,45.5550,18.6955)"
$light = "[out:json][timeout:20];node[""amenity""=""cafe""]$around;out center tags;"
$heavy = "[out:json][timeout:25];(node[""amenity""=""cafe""]$around;way[""amenity""=""cafe""]$around;" +
         "node[""amenity""=""restaurant""]$around;way[""amenity""=""restaurant""]$around;" +
         "node[""cuisine""]$around;way[""cuisine""]$around;" +
         "node[""name""~""restoran|pizzeria|grill"",i]$around;" +
         "node[""leisure""=""park""]$around;way[""leisure""=""park""]$around;);out center tags;"

function Test-Query($url, $query) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $r = Invoke-WebRequest -Uri $url -Method Post -Body @{ data = $query } `
      -UserAgent "CroMapApp/1.0 (connectivity check)" -TimeoutSec 30 -UseBasicParsing
    $n = ([regex]::Matches($r.Content, '"type"')).Count
    return "{0,6:N1}s  HTTP {1}  {2} elements" -f $sw.Elapsed.TotalSeconds, $r.StatusCode, $n
  } catch {
    $code = ""
    if ($_.Exception.Response) { $code = "HTTP " + [int]$_.Exception.Response.StatusCode }
    return "{0,6:N1}s  FAILED {1} {2}" -f $sw.Elapsed.TotalSeconds, $code, $_.Exception.Message.Split("`n")[0]
  }
}

foreach ($s in $servers) {
  Write-Host ""
  Write-Host $s -ForegroundColor Cyan
  Write-Host ("  light: " + (Test-Query $s $light))
  Write-Host ("  heavy: " + (Test-Query $s $heavy))
}
Write-Host ""
Write-Host "Send me this whole output."
