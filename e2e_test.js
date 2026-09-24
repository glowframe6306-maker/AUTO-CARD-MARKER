const fs = require('fs');
(async () => {
  function safeLog(label, obj) {
    console.log('--- ' + label + ' ---');
    try { console.log(JSON.stringify(obj, null, 2)); } catch (e) { console.log(String(obj)); }
  }

  const backend = 'http://localhost:8000';

  // 1. Health
  try {
    const h = await (await fetch(`${backend}/health`)).json();
    safeLog('HEALTH', h);
  } catch (e) {
    safeLog('HEALTH_ERROR', String(e));
    process.exit(1);
  }

  // Helper create registration
  async function createRegistration(suffix) {
    const rc = `E2E_RRC_${suffix}`;
    const email = `e2e_${suffix}@example.com`;
    const body = { name: 'E2E Approval Test', rcStudentId: rc, email, dob: '2000-01-01', password: 'Muhammadh Imran254263854452000@#@#@#' };
    try {
      const res = await fetch(`${backend}/api/registrations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) {
        safeLog(`REG_CREATE_ERROR_${suffix}`, { status: res.status, body: data });
        return null;
      }
      safeLog(`REG_CREATED_${suffix}`, { rc, email, response: data });
      return { rc, email, resp: data };
    } catch (e) {
      safeLog(`REG_CREATE_EXCEPTION_${suffix}`, String(e));
      return null;
    }
  }

  const suffix = Date.now();
  const reg1 = await createRegistration(suffix);
  if (!reg1) { process.exit(1); }

  // Owner login
  let ownerToken;
  try {
    const loginRes = await fetch(`${backend}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: 'owner', password: 'Muhammadh Imran254263854452000@#@#@#' }) });
    const loginData = await loginRes.json();
    if (!loginRes.ok) { safeLog('OWNER_LOGIN_FAIL', { status: loginRes.status, body: loginData }); process.exit(1); }
    safeLog('OWNER_LOGIN', { isOwner: loginData.isOwner, roles: loginData.roles });
    ownerToken = loginData.token;
  } catch (e) { safeLog('OWNER_LOGIN_ERROR', String(e)); process.exit(1); }

  // Get pending approvals
  let approvals;
  try {
    const res = await fetch(`${backend}/api/approvals/pending`, { headers: { Authorization: `Bearer ${ownerToken}` } });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) { safeLog('APPROVALS_FAIL', { status: res.status, body: data }); process.exit(1); }
    approvals = data.value || data;
    safeLog('APPROVALS_LIST', approvals);
  } catch (e) { safeLog('APPROVALS_ERROR', String(e)); process.exit(1); }

  // Find related approval
  const pendingItem = approvals.find(it => it.targetType === 'REGISTRATION' && ((it.newValue && it.newValue.rcStudentId === reg1.rc) || String(it.targetId) === String(reg1.resp.id)));
  if (!pendingItem) { safeLog('PENDING_NOT_FOUND', { rc: reg1.rc }); process.exit(1); }
  safeLog('PENDING_FOUND', { requestId: pendingItem.requestId, targetId: pendingItem.targetId });

  // Approve
  try {
    const res = await fetch(`${backend}/api/approvals/review/${pendingItem.requestId}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` }, body: JSON.stringify({ approved: true, reviewReason: 'E2E approve' }) });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) { safeLog('APPROVE_FAIL', { status: res.status, body: data }); process.exit(1); }
    safeLog('APPROVE_RESP', data);
  } catch (e) { safeLog('APPROVE_ERROR', String(e)); process.exit(1); }

  // Check registration details
  try {
    const res = await fetch(`${backend}/api/registrations/${pendingItem.targetId}`, { headers: { Authorization: `Bearer ${ownerToken}` } });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) { safeLog('REG_DETAILS_FAIL', { status: res.status, body: data }); process.exit(1); }
    safeLog('REG_DETAILS_AFTER_APPROVE', data);
  } catch (e) { safeLog('REG_DETAILS_ERROR', String(e)); process.exit(1); }

  // Login as approved user
  try {
    const res = await fetch(`${backend}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: reg1.rc, password: 'Muhammadh Imran254263854452000@#@#@#' }) });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) { safeLog('APPROVED_USER_LOGIN_FAIL', { status: res.status, body: data }); process.exit(1); }
    safeLog('APPROVED_USER_LOGIN', { accountId: reg1.rc });
  } catch (e) { safeLog('APPROVED_USER_LOGIN_ERROR', String(e)); process.exit(1); }

  // Create second registration for decline
  const reg2 = await createRegistration(suffix + 1);
  if (!reg2) { process.exit(1); }

  // Refresh approvals and find reg2
  try {
    const res = await fetch(`${backend}/api/approvals/pending`, { headers: { Authorization: `Bearer ${ownerToken}` } });
    const data = await res.json().catch(()=>({}));
    const list = data.value || data;
    const p2 = list.find(it => it.targetType === 'REGISTRATION' && ((it.newValue && it.newValue.rcStudentId === reg2.rc) || String(it.targetId) === String(reg2.resp.id)));
    if (!p2) { safeLog('PENDING2_NOT_FOUND', { rc: reg2.rc }); process.exit(1); }
    safeLog('PENDING2_FOUND', { requestId: p2.requestId, targetId: p2.targetId });

    // Decline
    const res2 = await fetch(`${backend}/api/approvals/review/${p2.requestId}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` }, body: JSON.stringify({ approved: false, reviewReason: 'E2E decline' }) });
    const data2 = await res2.json().catch(()=>({}));
    if (!res2.ok) { safeLog('DECLINE_FAIL', { status: res2.status, body: data2 }); process.exit(1); }
    safeLog('DECLINE_RESP', data2);

    // Check reg2 details
    const reg2det = await (await fetch(`${backend}/api/registrations/${p2.targetId}`, { headers: { Authorization: `Bearer ${ownerToken}` } })).json();
    safeLog('REG2_DETAILS_AFTER_DECLINE', reg2det);

    // Attempt login for declined user (should fail)
    const loginDecline = await fetch(`${backend}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: reg2.rc, password: 'Muhammadh Imran254263854452000@#@#@#' }) });
    if (loginDecline.ok) { const d = await loginDecline.json().catch(()=>({})); safeLog('DECLINED_USER_LOGIN_UNEXPECTED', { accountId: reg2.rc }); process.exit(1); } else { const d = await loginDecline.json().catch(()=>({})); safeLog('DECLINED_USER_LOGIN_FAIL_EXPECTED', { status: loginDecline.status, body: d }); }
  } catch (e) { safeLog('DECLINE_FLOW_ERROR', String(e)); process.exit(1); }

  // Security test: member cannot approve
  try {
    const memberLogin = await fetch(`${backend}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: 'member01', password: 'Muhammadh Imran254263854452000@#@#@#' }) });
    const memberData = await memberLogin.json().catch(()=>({}));
    if (!memberLogin.ok) { safeLog('MEMBER_LOGIN_FAIL', { status: memberLogin.status, body: memberData }); } else {
      safeLog('MEMBER_LOGIN', { accountId: 'member01' });
      const memberToken = memberData.token;
      // Create reg3
      const reg3 = await createRegistration(suffix + 2);
      if (!reg3) { process.exit(1); }
      // find reg3
      const res = await fetch(`${backend}/api/approvals/pending`, { headers: { Authorization: `Bearer ${ownerToken}` } });
      const data = await res.json().catch(()=>({}));
      const list = data.value || data;
      const p3 = list.find(it => it.targetType === 'REGISTRATION' && ((it.newValue && it.newValue.rcStudentId === reg3.rc) || String(it.targetId) === String(reg3.resp.id)));
      if (!p3) { safeLog('PENDING3_NOT_FOUND', { rc: reg3.rc }); process.exit(1); }
      // member tries to approve
      const attempt = await fetch(`${backend}/api/approvals/review/${p3.requestId}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberToken}` }, body: JSON.stringify({ approved: true, reviewReason: 'malicious' }) });
      const attemptBody = await attempt.json().catch(()=>({}));
      if (attempt.ok) { safeLog('MEMBER_APPROVE_UNEXPECTED', { requestId: p3.requestId }); process.exit(1); } else { safeLog('MEMBER_APPROVE_BLOCKED', { status: attempt.status, body: attemptBody }); }
    }
  } catch (e) { safeLog('MEMBER_TEST_ERROR', String(e)); }

  // Builds
  try {
    const { execSync } = require('child_process');
    execSync('npm run build', { cwd: 'frontend', stdio: 'inherit' });
    safeLog('FRONTEND_BUILD', { success: true });
  } catch (e) { safeLog('FRONTEND_BUILD_FAIL', String(e)); }

  try {
    const { execSync } = require('child_process');
    execSync('npm run build', { cwd: 'backend', stdio: 'inherit' });
    safeLog('BACKEND_BUILD', { success: true });
  } catch (e) { safeLog('BACKEND_BUILD_FAIL', String(e)); }

  safeLog('E2E_COMPLETED', { note: 'All done' });
})();

