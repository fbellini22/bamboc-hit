param([int]$Concurrency = 4)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$source = [IO.File]::ReadAllText((Join-Path $root 'song.js'))
$ids = @([regex]::Matches($source, 'id:\s*"([A-Za-z0-9]{22})"') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
$destination = Join-Path $root 'duration-verification.json'
$results = @()
$pool = [RunspaceFactory]::CreateRunspacePool(1, $Concurrency)
$pool.Open()
$worker = {
  param($id)
  $url = 'https://open.spotify.com/embed/track/' + $id
  $record = [ordered]@{ id=$id; source=$url; checkedAt=[DateTime]::UtcNow.ToString('o'); status='unverified'; reason=$null; httpStatus=$null; durationMs=$null }
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 25 -ErrorAction Stop
    $record.httpStatus = [int]$response.StatusCode
    $match = [regex]::Match($response.Content, '<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', [Text.RegularExpressions.RegexOptions]::Singleline)
    if (!$match.Success) { throw 'STRUCTURED_DATA_MISSING' }
    $data = $match.Groups[1].Value | ConvertFrom-Json
    $entity = $data.props.pageProps.state.data.entity
    if ($entity.id -cne $id -or $entity.uri -cne ('spotify:track:' + $id) -or $entity.type -cne 'track') { throw 'EXACT_ID_MISMATCH' }
    $duration = $entity.duration
    if ($null -eq $duration -or $duration -is [string] -or $duration -le 0 -or [Math]::Floor($duration) -ne $duration) { throw 'INVALID_DURATION' }
    $record.status = 'verified'; $record.durationMs = [long]$duration
    $record.returnedId = $entity.id; $record.returnedUri = $entity.uri
    $record.sourceField = 'props.pageProps.state.data.entity.duration'
    $record.embedPlayable = $entity.isPlayable
  } catch {
    if ($_.Exception.Response) { $record.httpStatus = [int]$_.Exception.Response.StatusCode }
    $record.reason = if ($_.Exception.Message -match '^(STRUCTURED_DATA_MISSING|EXACT_ID_MISMATCH|INVALID_DURATION)$') { $_.Exception.Message } else { 'HTTP_OR_NETWORK_FAILURE' }
  }
  # Never retain the HTML, cookies, preview URLs or unrelated Spotify metadata.
  [pscustomobject]$record
}
try {
  for ($offset=0; $offset -lt $ids.Count; $offset += $Concurrency) {
    $jobs = @()
    foreach ($id in $ids[$offset..([Math]::Min($offset+$Concurrency-1, $ids.Count-1))]) {
      $pipeline = [PowerShell]::Create(); $pipeline.RunspacePool = $pool
      [void]$pipeline.AddScript($worker.ToString()).AddArgument($id)
      $jobs += @{ Pipeline=$pipeline; Handle=$pipeline.BeginInvoke() }
    }
    foreach ($job in $jobs) { $results += @($job.Pipeline.EndInvoke($job.Handle)); $job.Pipeline.Dispose() }
    [IO.File]::WriteAllText($destination, (ConvertTo-Json -InputObject @($results) -Depth 6), [Text.UTF8Encoding]::new($false))
    Write-Output ('Checked ' + $results.Count + '/' + $ids.Count + '; verified ' + @($results | Where-Object status -eq 'verified').Count)
  }
} finally { $pool.Close(); $pool.Dispose() }
