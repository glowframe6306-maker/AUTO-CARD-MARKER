# E2E test script for registrations + approvals
# Does not print passwords or tokens.

function SafeWrite($label, $obj = $null) {
  Write-Output "--- $label ---"
  if ($null -ne $obj) {
    try { $obj | ConvertTo-Json -Depth 5 } catch { $obj }
  }
}

# 1. Health check
try {
  $health = Invoke-WebRequest -Uri 'http://localhost:8000/health' -UseBasicParsing -ErrorAction Stop
  SafeWrite 'HEALTH' @{ status = $health.StatusCode; body = ($health.Content | ConvertFrom-Json -ErrorAction SilentlyContinue) }
} catch {
  SafeWrite 'HEALTH_ERROR' $_.Exception.Message
  exit 1
}

# Helper to create unique registration
function CreateRegistration($suffix) {
  $rc = "E2E_RRC_$suffix"
  $email = "e2e_$suffix@example.com"
  $body = @{ name = 'E2E Approval Test'; rcStudentId = $rc; email = $email; dob = '2000-01-01'; password = 'TestPassword123!' } | ConvertTo-Json
  try {
    $resp = Invoke-RestMethod -Uri 'http://localhost:8000/api/registrations' -Method POST -ContentType 'application/json' -Body $body -ErrorAction Stop
    SafeWrite "REG_CREATED_$suffix" $resp
    return @{ rc=$rc; email=$email; resp=$resp }
  } catch {
    SafeWrite "REG_CREATE_ERROR_$suffix" (try { $_.Exception.Response.GetResponseStream() | ForEach-Object { $sr = New-Object System.IO.StreamReader($_); $sr.ReadToEnd() } } catch { $_.Exception.Message })
    return $null
  }
}

# 2. Create registration 1
$time = [int][double]::Parse((Get-Date -UFormat %s))
$reg1 = CreateRegistration($time)
if (-not $reg1) { Write-Output 'REG1 FAILED'; exit 1 }

# 3. Owner login (do not print token)
try {
  $ownerCred = @{ accountId = 'owner'; password = 'ChangeMe123!' } | ConvertTo-Json
  $ownerLogin = Invoke-RestMethod -Uri 'http://localhost:8000/api/auth/login' -Method POST -ContentType 'application/json' -Body $ownerCred -ErrorAction Stop
  SafeWrite 'OWNER_LOGIN' @{ isOwner = $ownerLogin.isOwner; roles = $ownerLogin.roles }
  $ownerToken = $ownerLogin.token
} catch {
  SafeWrite 'OWNER_LOGIN_ERROR' $_.Exception.Message
  exit 1
}

# 4. Owner: get pending approvals
try {
  $approvals = Invoke-RestMethod -Uri 'http://localhost:8000/api/approvals/pending' -Method GET -Headers @{ Authorization = "Bearer $ownerToken" } -ErrorAction Stop
  SafeWrite 'APPROVALS_LIST' $approvals
} catch {
  SafeWrite 'APPROVALS_LIST_ERROR' (try { $_.Exception.Response.GetResponseStream() | ForEach-Object { $sr = New-Object System.IO.StreamReader($_); $sr.ReadToEnd() } } catch { $_.Exception.Message })
  exit 1
}

# Find approval related to reg1
$pendingItem = $null
# approvals may be an object with 'value' array or an array directly
if ($approvals -is [System.Collections.IEnumerable]) {
  $list = $approvals
} elseif ($approvals.value) {
  $list = $approvals.value
} else {
  $list = @()
}

foreach ($item in $list) {
  if ($item.targetType -eq 'REGISTRATION') {
    if ($item.newValue.rcStudentId -eq $reg1.rc -or $item.targetId -eq ($reg1.resp.id | Out-String).Trim()) { $pendingItem = $item; break }
  }
}

if (-not $pendingItem) { SafeWrite 'PENDING_ITEM_NOT_FOUND' @{ rc = $reg1.rc }; exit 1 }
SafeWrite 'PENDING_ITEM_FOUND' @{ requestId = $pendingItem.requestId; targetId = $pendingItem.targetId }

# 5. Approve the request
try {
  $approveBody = @{ approved = $true; reviewReason = 'E2E approve' } | ConvertTo-Json
  $approveResp = Invoke-RestMethod -Uri "http://localhost:8000/api/approvals/review/$($pendingItem.requestId)" -Method POST -ContentType 'application/json' -Headers @{ Authorization = "Bearer $ownerToken" } -Body $approveBody -ErrorAction Stop
  SafeWrite 'APPROVE_RESP' $approveResp
} catch {
  SafeWrite 'APPROVE_ERROR' (try { $_.Exception.Response.GetResponseStream() | ForEach-Object { $sr = New-Object System.IO.StreamReader($_); $sr.ReadToEnd() } } catch { $_.Exception.Message })
  exit 1
}

# 6. Verify registration status (owner-only)
try {
  $regDetails = Invoke-RestMethod -Uri "http://localhost:8000/api/registrations/$($pendingItem.targetId)" -Method GET -Headers @{ Authorization = "Bearer $ownerToken" } -ErrorAction Stop
  SafeWrite 'REG_DETAILS_AFTER_APPROVE' $regDetails
} catch {
  SafeWrite 'REG_DETAILS_ERROR' $_.Exception.Message
  exit 1
}

# 7. Login as approved user (accountId is rc)
try {
  $loginBody = @{ accountId = $reg1.rc; password = 'TestPassword123!' } | ConvertTo-Json
  $loginResp = Invoke-RestMethod -Uri 'http://localhost:8000/api/auth/login' -Method POST -ContentType 'application/json' -Body $loginBody -ErrorAction Stop
  SafeWrite 'APPROVED_USER_LOGIN' @{ success = $true; accountId = $reg1.rc }
} catch {
  SafeWrite 'APPROVED_USER_LOGIN_FAILED' (try { $_.Exception.Response.GetResponseStream() | ForEach-Object { $sr = New-Object System.IO.StreamReader($_); $sr.ReadToEnd() } catch { $_.Exception.Message })
  exit 1
}

# 8. Create second registration for decline test
$time2 = [int][double]::Parse((Get-Date -UFormat %s)) + 1
$reg2 = CreateRegistration($time2)
if (-not $reg2) { Write-Output 'REG2 FAILED'; exit 1 }

# get pending approvals again
$approvals2 = Invoke-RestMethod -Uri 'http://localhost:8000/api/approvals/pending' -Method GET -Headers @{ Authorization = "Bearer $ownerToken" }
# find reg2 item
$pending2 = $null
foreach ($item in ($approvals2.value | ForEach-Object { $_ })) {
  if ($item.targetType -eq 'REGISTRATION' -and ($item.newValue.rcStudentId -eq $reg2.rc -or $item.targetId -eq ($reg2.resp.id | Out-String).Trim())) { $pending2 = $item; break }
}
if (-not $pending2) { SafeWrite 'PENDING2_NOT_FOUND' @{ rc = $reg2.rc }; exit 1 }
SafeWrite 'PENDING2_FOUND' @{ requestId = $pending2.requestId; targetId = $pending2.targetId }

# Decline
try {
  $declineBody = @{ approved = $false; reviewReason = 'E2E decline' } | ConvertTo-Json
  $declineResp = Invoke-RestMethod -Uri "http://localhost:8000/api/approvals/review/$($pending2.requestId)" -Method POST -ContentType 'application/json' -Headers @{ Authorization = "Bearer $ownerToken" } -Body $declineBody -ErrorAction Stop
  SafeWrite 'DECLINE_RESP' $declineResp
} catch {
  SafeWrite 'DECLINE_ERROR' (try { $_.Exception.Response.GetResponseStream() | ForEach-Object { $sr = New-Object System.IO.StreamReader($_); $sr.ReadToEnd() } } catch { $_.Exception.Message })
  exit 1
}

# Verify reg2 status
try {
  $reg2Details = Invoke-RestMethod -Uri "http://localhost:8000/api/registrations/$($pending2.targetId)" -Method GET -Headers @{ Authorization = "Bearer $ownerToken" } -ErrorAction Stop
  SafeWrite 'REG2_DETAILS_AFTER_DECLINE' $reg2Details
} catch {
  SafeWrite 'REG2_DETAILS_ERROR' $_.Exception.Message
  exit 1
}

# Verify login fails for reg2
try {
  $login2Body = @{ accountId = $reg2.rc; password = 'TestPassword123!' } | ConvertTo-Json
  $login2Resp = Invoke-RestMethod -Uri 'http://localhost:8000/api/auth/login' -Method POST -ContentType 'application/json' -Body $login2Body -ErrorAction Stop
  SafeWrite 'DECLINED_USER_LOGIN_UNEXPECTED' @{ accountId = $reg2.rc }
  exit 1
} catch {
  SafeWrite 'DECLINED_USER_LOGIN_EXPECTED_FAIL' (try { $_.Exception.Response.GetResponseStream() | ForEach-Object { $sr = New-Object System.IO.StreamReader($_); $sr.ReadToEnd() } catch { $_.Exception.Message })
}

# 9. Security test: ensure normal member cannot approve
try {
  $memberLogin = Invoke-RestMethod -Uri 'http://localhost:8000/api/auth/login' -Method POST -ContentType 'application/json' -Body (ConvertTo-Json @{ accountId = 'member01'; password = 'ChangeMe123!' }) -ErrorAction Stop
  SafeWrite 'MEMBER_LOGIN' @{ accountId = 'member01'; ok = $true }
  $memberToken = $memberLogin.token
  # create third registration
  $time3 = [int][double]::Parse((Get-Date -UFormat %s)) + 2
  $reg3 = CreateRegistration($time3)
  # find reg3 pending
  $approvals3 = Invoke-RestMethod -Uri 'http://localhost:8000/api/approvals/pending' -Method GET -Headers @{ Authorization = "Bearer $ownerToken" }
  $pending3 = $approvals3.value | Where-Object { $_.targetType -eq 'REGISTRATION' -and $_.newValue.rcStudentId -eq $reg3.rc } | Select-Object -First 1
  if (-not $pending3) { SafeWrite 'PENDING3_NOT_FOUND' @{ rc = $reg3.rc }; exit 1 }
  # member attempts to approve
  try {
    Invoke-RestMethod -Uri "http://localhost:8000/api/approvals/review/$($pending3.requestId)" -Method POST -ContentType 'application/json' -Headers @{ Authorization = "Bearer $memberToken" } -Body (ConvertTo-Json @{ approved = $true; reviewReason = 'malicious' }) -ErrorAction Stop
    SafeWrite 'MEMBER_APPROVE_UNEXPECTED' @{ requestId = $pending3.requestId }
    exit 1
  } catch {
    SafeWrite 'MEMBER_APPROVE_BLOCKED' (try { $_.Exception.Response.GetResponseStream() | ForEach-Object { $sr = New-Object System.IO.StreamReader($_); $sr.ReadToEnd() } catch { $_.Exception.Message })
  }
} catch {
  SafeWrite 'MEMBER_LOGIN_ERROR' $_.Exception.Message
}

# 10. Builds
try {
  Push-Location 'frontend'
  npm.cmd run build --silent
  Pop-Location
  SafeWrite 'FRONTEND_BUILD' @{ success = $true }
} catch {
  SafeWrite 'FRONTEND_BUILD_FAIL' $_.Exception.Message
}

try {
  Push-Location 'backend'
  npm.cmd run build --silent
  Pop-Location
  SafeWrite 'BACKEND_BUILD' @{ success = $true }
} catch {
  SafeWrite 'BACKEND_BUILD_FAIL' $_.Exception.Message
}

Write-Output 'E2E_SCRIPT_COMPLETED'
