# Import users từ database.json lên Supabase Auth
# Cách chạy (PowerShell):
#   1. Copy .env.example → .env, dán SERVICE_ROLE_KEY
#   2. Chạy SQL supabase/migrations/001_init.sql trên Dashboard
#   3. .\scripts\import-users.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

function Load-EnvFile {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    Write-Host "Khong tim thay file .env tai: $Path" -ForegroundColor Red
    return
  }
  Get-Content $Path -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $key = $line.Substring(0, $eq).Trim().TrimStart([char]0xFEFF)
    $val = $line.Substring($eq + 1).Trim()
    if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
      $val = $val.Substring(1, $val.Length - 2)
    }
    Set-Item -Path "env:$key" -Value $val
  }
}

$envFile = Join-Path $Root ".env"
Load-EnvFile $envFile

$SupabaseUrl = if ($env:SUPABASE_URL) { $env:SUPABASE_URL } else { "https://zfawytyfeaxvrvtjvsun.supabase.co" }
$ServiceKey = $env:SUPABASE_SERVICE_ROLE_KEY

if (-not $ServiceKey -or $ServiceKey -eq "YOUR_SERVICE_ROLE_KEY") {
  Write-Host "Thieu SUPABASE_SERVICE_ROLE_KEY." -ForegroundColor Red
  Write-Host "File .env: $envFile"
  Write-Host "Copy .env.example thanh .env roi dan service_role key (day du, khong cat ngan)"
  Write-Host "Lay tai: Dashboard -> Project Settings -> API -> service_role"
  exit 1
}

if ($ServiceKey.Length -lt 30) {
  Write-Host "Canh bao: service_role key co ve qua ngan ($($ServiceKey.Length) ky tu)." -ForegroundColor Yellow
  Write-Host "Hay copy DAY DU key tu Dashboard (thuong bat dau sb_secret_ hoac eyJ...)"
}

function Resolve-Password([string]$raw) {
  $pwd = if ($null -eq $raw) { "" } else { $raw.Trim() }
  if ($pwd.Length -ge 6) {
    return @{ Password = $pwd; Mapped = $false }
  }
  return @{ Password = ("Pass" + $(if ($pwd) { $pwd } else { "01" })); Mapped = $true }
}

$users = Get-Content (Join-Path $Root "database.json") -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Host "Dang import $($users.Count) users -> $SupabaseUrl`n" -ForegroundColor Cyan

$created = 0
$skipped = 0
$failed = 0
$mappedNote = $false

foreach ($user in $users) {
  $email = [string]$user.gmail
  if (-not $email) {
    Write-Host "FAIL  (thieu gmail)" -ForegroundColor Red
    $failed++
    continue
  }

  $pwdInfo = Resolve-Password ([string]$user.password)
  if ($pwdInfo.Mapped) { $mappedNote = $true }

  $body = @{
    email         = $email.Trim()
    password      = $pwdInfo.Password
    email_confirm = $true
    user_metadata = @{
      full_name    = $(if ($user.name) { [string]$user.name } else { $email })
      employee_id  = $(if ($user.employeeId) { [string]$user.employeeId } else { $null })
      position     = $(if ($user.position) { [string]$user.position } else { $null })
      theme_color  = $(if ($user.themeColor) { [string]$user.themeColor } else { $null })
    }
  } | ConvertTo-Json -Depth 5

  try {
    $res = Invoke-RestMethod `
      -Method Post `
      -Uri "$SupabaseUrl/auth/v1/admin/users" `
      -Headers @{
        Authorization = "Bearer $ServiceKey"
        apikey        = $ServiceKey
        "User-Agent"  = "ProjectManager-Import/1.0 (powershell)"
      } `
      -ContentType "application/json; charset=utf-8" `
      -Body ([System.Text.Encoding]::UTF8.GetBytes($body))

    Write-Host "OK    $email  id=$($res.id)" -ForegroundColor Green
    $created++
  }
  catch {
    $msg = $_.ErrorDetails.Message
    if (-not $msg) { $msg = $_.Exception.Message }
    if ($msg -match "already|exists|registered|422") {
      Write-Host "SKIP  $email  ($msg)" -ForegroundColor Yellow
      $skipped++
    }
    else {
      Write-Host "FAIL  $email  $msg" -ForegroundColor Red
      $failed++
    }
  }

  Start-Sleep -Milliseconds 150
}

Write-Host "`nXong: created=$created, skipped=$skipped, failed=$failed"
if ($mappedNote) {
  Write-Host ""
  Write-Host "Mat khau trong JSON ngan hon 6 ky tu -> da map thanh Pass01" -ForegroundColor Yellow
  Write-Host "Vi du dang nhap: dang.duy.hoang@vard.com / Pass01"
}
