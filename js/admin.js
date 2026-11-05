/**
 * ApplyFlow Admin — 관리자 페이지 메인 로직
 * 문항 설계, 신청 현황, AI 심사, 이메일 발송 관리
 */

// ============================================
// 설정
// ============================================

// Google Apps Script 웹 앱 URL — localStorage에서 불러오거나 빈 문자열
let APPS_SCRIPT_URL = localStorage.getItem('applyflow_apps_script_url') || '';

// 관리자 비밀번호는 브라우저를 닫으면 사라지는 sessionStorage에만 둔다.
// 예전 버전이 localStorage에 남긴 값은 지운다.
localStorage.removeItem('applyflow_admin_pw');

// ============================================
// 상태
// ============================================

const adminState = {
  password: sessionStorage.getItem('applyflow_admin_pw') || '',
  applications: [],
  reviews: [],
  config: null,
  activeTab: 'design',
  confirmedQuestions: [],
  sortColumn: null,
  sortDirection: 'asc',
  designConversation: [],
  reviewConversation: []
};

// ChatUI 인스턴스
let designChat = null;
let reviewChat = null;

// ============================================
// 초기화
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // 이미 로그인된 상태면 바로 메인 표시
  if (adminState.password) {
    showMainUI();
  }
});

function showMainUI() {
  document.getElementById('loginModal').classList.add('hidden');
  document.getElementById('adminMain').style.display = 'flex';

  // ChatUI 인스턴스 생성
  designChat = new ChatUI('#designChatArea', {
    aiAvatar: '🤖',
    userAvatar: '👨‍💼',
    typingDelay: 500
  });

  reviewChat = new ChatUI('#reviewChatArea', {
    aiAvatar: '🤖',
    userAvatar: '👨‍💼',
    typingDelay: 500
  });

  // 초기 AI 인사
  designChat.addAIMessage(
    '안녕하세요! 문항 설계를 도와드리겠습니다.\n\n' +
    '지원자에게 물어볼 질문을 함께 만들어 볼까요? 어떤 역량이나 자질을 평가하고 싶은지 알려주세요.\n\n' +
    '예시:\n' +
    '- "교육 콘텐츠 기획 능력을 평가하고 싶어"\n' +
    '- "5개 정도의 질문을 만들어줘"\n' +
    '- "기존 질문을 더 구체적으로 다듬어줘"',
    { animate: false }
  );

  reviewChat.addAIMessage(
    '심사 결과에 대해 궁금한 점을 물어보세요.\n\n' +
    'AI가 블라인드 데이터(기획서 내용)만으로 평가한 결과를 바탕으로 답변합니다.\n' +
    '개인정보(이름, 이메일, 소속)는 포함되지 않습니다.',
    { animate: false }
  );

  // Apps Script URL 미설정 안내
  checkSetupStatus();

  // 데이터 로드
  if (APPS_SCRIPT_URL) {
    loadApplications();
    loadConfig();
  }
}

function checkSetupStatus() {
  const notice = document.getElementById('setupNotice');
  if (!APPS_SCRIPT_URL) {
    notice.classList.remove('hidden');
  } else {
    notice.classList.add('hidden');
  }
}

// ============================================
// 인증
// ============================================

async function login() {
  const passwordInput = document.getElementById('adminPassword');
  const password = passwordInput.value.trim();
  const errorEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');

  if (!password) {
    errorEl.textContent = '비밀번호를 입력해 주세요.';
    errorEl.style.display = 'block';
    passwordInput.focus();
    return;
  }

  btn.classList.add('loading');
  errorEl.style.display = 'none';

  try {
    if (APPS_SCRIPT_URL) {
      // Apps Script에서 비밀번호 확인. 비밀번호가 주소에 남지 않도록 본문으로 보낸다.
      const res = await fetch(`${APPS_SCRIPT_URL}?action=verifyAdmin`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();

      if (!data.success) {
        errorEl.textContent = data.message || '비밀번호가 올바르지 않습니다.';
        errorEl.style.display = 'block';
        btn.classList.remove('loading');
        return;
      }
    }

    // 비밀번호 저장 및 UI 전환
    adminState.password = password;
    sessionStorage.setItem('applyflow_admin_pw', password);
    btn.classList.remove('loading');
    showMainUI();
  } catch (error) {
    // 서버 확인에 실패하면 들어가지 않는다
    console.error('로그인 실패:', error);
    errorEl.textContent = '서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
    errorEl.style.display = 'block';
    btn.classList.remove('loading');
  }
}

function logout() {
  adminState.password = '';
  sessionStorage.removeItem('applyflow_admin_pw');
  document.getElementById('adminMain').style.display = 'none';
  document.getElementById('loginModal').classList.remove('hidden');
  document.getElementById('adminPassword').value = '';
}

// ============================================
// 탭 네비게이션
// ============================================

function switchTab(tabName) {
  adminState.activeTab = tabName;

  // 네비게이션 활성 상태 업데이트
  document.querySelectorAll('.admin-nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // 탭 컨텐츠 표시/숨김
  const tabs = ['design', 'applications', 'review', 'email'];
  tabs.forEach(tab => {
    const section = document.getElementById(`tab-${tab}`);
    if (section) {
      section.classList.toggle('hidden', tab !== tabName);
    }
  });

  // 탭 전환 시 데이터 로드
  if (tabName === 'applications' && APPS_SCRIPT_URL && adminState.applications.length === 0) {
    loadApplications();
  }
  if (tabName === 'review' && APPS_SCRIPT_URL && adminState.reviews.length === 0) {
    loadReviews();
  }
  if (tabName === 'email' && APPS_SCRIPT_URL && adminState.applications.length === 0) {
    loadApplications();
  }

  // 모바일 사이드바 닫기
  document.getElementById('adminSidebar').classList.remove('open');
}

function toggleSidebar() {
  document.getElementById('adminSidebar').classList.toggle('open');
}

// ============================================
// 문항 설계 탭
// ============================================

function handleDesignKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendDesignMessage();
  }
}

async function sendDesignMessage() {
  const input = document.getElementById('designChatInput');
  const text = input.value.trim();
  if (!text) return;

  const btn = document.getElementById('designSendBtn');
  btn.classList.add('loading');
  input.value = '';

  // 사용자 메시지 표시
  designChat.addUserMessage(text);
  adminState.designConversation.push({ role: 'user', content: text });

  try {
    if (APPS_SCRIPT_URL) {
      const res = await fetch(`${APPS_SCRIPT_URL}?action=chatWithAI`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          password: adminState.password,
          type: 'design',
          message: text,
          history: adminState.designConversation.slice(-10)
        })
      });
      const data = await res.json();

      if (data.success && data.reply) {
        await designChat.addAIMessage(data.reply);
        adminState.designConversation.push({ role: 'ai', content: data.reply });

        // AI 응답에서 질문 목록 파싱 시도
        parseQuestionsFromAI(data.reply);
      } else {
        await designChat.addAIMessage('죄송합니다. 응답을 생성하지 못했습니다. 다시 시도해 주세요.');
      }
    } else {
      // 오프라인 데모 응답
      await designChat.addAIMessage(
        '현재 Apps Script URL이 설정되지 않아 AI 응답을 받을 수 없습니다.\n\n' +
        '사이드바 하단의 **Apps Script 설정**에서 URL을 먼저 설정해 주세요.'
      );
    }
  } catch (error) {
    console.error('문항 설계 채팅 오류:', error);
    await designChat.addAIMessage('네트워크 오류가 발생했습니다. 다시 시도해 주세요.');
  }

  btn.classList.remove('loading');
  input.focus();
}

/**
 * AI 응답에서 번호 매겨진 질문 목록 파싱
 */
function parseQuestionsFromAI(text) {
  // 패턴: 1. 질문내용 또는 1) 질문내용
  const lines = text.split('\n');
  const questions = [];

  for (const line of lines) {
    const match = line.match(/^\s*(\d+)[.)]\s*(.+)/);
    if (match && match[2].length > 10) {
      questions.push(match[2].trim());
    }
  }

  if (questions.length >= 2) {
    // 파싱된 질문이 있으면 확정 버튼을 표시하는 인라인 카드 추가
    const addCard = document.createElement('div');
    addCard.style.cssText = 'padding: 12px 16px; background: var(--electric-blue-light); border-radius: 12px; margin: 4px 0;';
    addCard.innerHTML = `
      <div style="font-size: 13px; font-weight: 700; color: #0D9488; margin-bottom: 8px;">
        ${questions.length}개의 질문이 감지되었습니다
      </div>
      <button class="btn btn-secondary" onclick="addParsedQuestions(${JSON.stringify(questions).replace(/"/g, '&quot;')})"
              style="padding: 8px 14px; font-size: 13px;">
        질문 목록에 추가
      </button>
    `;
    designChat.addCustomElement(addCard);
  }
}

function addParsedQuestions(questions) {
  for (const q of questions) {
    if (!adminState.confirmedQuestions.includes(q)) {
      adminState.confirmedQuestions.push(q);
    }
  }
  renderConfirmedQuestions();
  showToast(`${questions.length}개 질문이 추가되었습니다.`);
}

function renderConfirmedQuestions() {
  const container = document.getElementById('confirmedQuestions');
  const saveBtn = document.getElementById('saveQuestionsBtn');

  if (adminState.confirmedQuestions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        AI와 대화하여 질문을 설계한 후<br>여기에 확정해 주세요.
      </div>
    `;
    saveBtn.disabled = true;
    return;
  }

  saveBtn.disabled = false;

  container.innerHTML = adminState.confirmedQuestions.map((q, i) => `
    <div class="question-item" draggable="true"
         ondragstart="dragStart(event, ${i})"
         ondragover="dragOver(event)"
         ondrop="drop(event, ${i})"
         ondragend="dragEnd(event)">
      <div class="q-number">질문 ${i + 1}</div>
      <div class="q-text">${escapeHtml(q)}</div>
      <div class="q-actions">
        <button onclick="editQuestion(${i})">수정</button>
        <button class="q-delete" onclick="removeQuestion(${i})">삭제</button>
      </div>
    </div>
  `).join('');
}

// --- 질문 드래그 앤 드롭 ---
let draggedIndex = null;

function dragStart(event, index) {
  draggedIndex = index;
  event.currentTarget.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
}

function dragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
}

function drop(event, targetIndex) {
  event.preventDefault();
  if (draggedIndex === null || draggedIndex === targetIndex) return;

  const questions = adminState.confirmedQuestions;
  const moved = questions.splice(draggedIndex, 1)[0];
  questions.splice(targetIndex, 0, moved);

  renderConfirmedQuestions();
}

function dragEnd(event) {
  event.currentTarget.classList.remove('dragging');
  draggedIndex = null;
}

function editQuestion(index) {
  const current = adminState.confirmedQuestions[index];
  const newText = prompt('질문을 수정하세요:', current);
  if (newText && newText.trim()) {
    adminState.confirmedQuestions[index] = newText.trim();
    renderConfirmedQuestions();
  }
}

function removeQuestion(index) {
  adminState.confirmedQuestions.splice(index, 1);
  renderConfirmedQuestions();
}

async function saveQuestions() {
  if (adminState.confirmedQuestions.length === 0) return;

  const btn = document.getElementById('saveQuestionsBtn');
  btn.classList.add('loading');

  try {
    if (APPS_SCRIPT_URL) {
      const res = await fetch(`${APPS_SCRIPT_URL}?action=saveQuestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          password: adminState.password,
          questions: adminState.confirmedQuestions
        })
      });
      const data = await res.json();

      if (data.success) {
        showToast('질문이 성공적으로 저장되었습니다!');
      } else {
        showToast('저장 실패: ' + (data.message || '알 수 없는 오류'));
      }
    } else {
      console.log('확정된 질문:', adminState.confirmedQuestions);
      showToast('(오프라인) 질문이 콘솔에 출력되었습니다.');
    }
  } catch (error) {
    console.error('질문 저장 오류:', error);
    showToast('네트워크 오류가 발생했습니다.');
  }

  btn.classList.remove('loading');
}

// ============================================
// 신청 현황 탭
// ============================================

async function loadApplications() {
  if (!APPS_SCRIPT_URL) {
    renderApplicationsTable([]);
    return;
  }

  const tbody = document.getElementById('applicationsBody');
  tbody.innerHTML = `
    <tr>
      <td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">
        <div class="spinner" style="margin: 0 auto 8px; border-color: rgba(0,0,0,0.1); border-top-color: var(--electric-blue);"></div>
        데이터를 불러오는 중...
      </td>
    </tr>
  `;

  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=getApplications`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ password: adminState.password })
    });
    const data = await res.json();

    if (data.success) {
      adminState.applications = data.applications || [];
      renderApplicationsTable(adminState.applications);
      renderStats(adminState.applications);
      renderRecipientList(adminState.applications);
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 40px; color: var(--coral);">
            데이터 로드 실패: ${escapeHtml(data.message || data.error || '알 수 없는 오류')}
          </td>
        </tr>
      `;
    }
  } catch (error) {
    console.error('신청 데이터 로드 오류:', error);
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 40px; color: var(--coral);">
          네트워크 오류가 발생했습니다.
        </td>
      </tr>
    `;
  }
}

function renderApplicationsTable(apps) {
  const tbody = document.getElementById('applicationsBody');

  if (!apps || apps.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">
          아직 신청서가 없습니다.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = apps.map((app, i) => {
    const statusClass = `status-${app.status || 'pending'}`;
    const statusLabel = getStatusLabel(app.status);
    const dateStr = app.timestamp ? formatDate(app.timestamp) : '-';

    return `
      <tr class="clickable" ondblclick="showApplicationDetail(${i})">
        <td>${app.id || i + 1}</td>
        <td style="font-weight: 600;">${escapeHtml(app.name || '-')}</td>
        <td>${escapeHtml(app.email || '-')}</td>
        <td>${escapeHtml(app.school || '-')}</td>
        <td>${escapeHtml(app.subject || '-')}</td>
        <td><span class="status-tag ${statusClass}">${statusLabel}</span></td>
        <td>${dateStr}</td>
        <td>
          <button class="btn btn-ghost" onclick="showApplicationDetail(${i})" style="padding: 4px 10px; font-size: 13px;">
            보기
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderStats(apps) {
  const total = apps.length;
  const pending = apps.filter(a => !a.status || a.status === 'pending').length;
  const reviewed = apps.filter(a => a.status === 'reviewed').length;
  const accepted = apps.filter(a => a.status === 'accepted').length;

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statPending').textContent = pending;
  document.getElementById('statReviewed').textContent = reviewed;
  document.getElementById('statAccepted').textContent = accepted;
}

function showApplicationDetail(index) {
  const app = adminState.applications[index];
  if (!app) return;

  document.getElementById('modalTitle').textContent = `${app.name || '이름 없음'} 님의 신청서`;

  const fieldLabels = {
    name: '이름', email: '이메일', school: '소속', subject: '과목',
    topic: '교재 주제', expertise: '전문성', outline: '목차 초안', sample: '샘플 챕터',
    timestamp: '신청일시', status: '상태'
  };

  // 개인정보 / 기획서 분리
  const personalKeys = ['name', 'email', 'school', 'subject'];
  const contentKeys = ['topic', 'expertise', 'outline', 'sample'];

  let html = '<div class="badge badge-blue" style="margin-bottom: 12px;">기본 정보</div>';
  for (const key of personalKeys) {
    if (app[key]) {
      html += `
        <div class="summary-item">
          <div class="summary-label">${fieldLabels[key] || key}</div>
          <div class="summary-value">${escapeHtml(app[key])}</div>
        </div>
      `;
    }
  }

  html += '<div class="badge badge-coral" style="margin: 16px 0 12px;">기획서 내용</div>';
  for (const key of contentKeys) {
    if (app[key]) {
      html += `
        <div class="summary-item">
          <div class="summary-label">${fieldLabels[key] || key}</div>
          <div class="summary-value">${escapeHtml(app[key])}</div>
        </div>
      `;
    }
  }

  // 상태 및 신청일
  html += `
    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); display: flex; gap: 12px; align-items: center;">
      <span class="status-tag status-${app.status || 'pending'}">${getStatusLabel(app.status)}</span>
      <span style="font-size: 13px; color: var(--text-muted);">${app.timestamp ? formatDate(app.timestamp) : ''}</span>
    </div>
  `;

  // 상태 변경 버튼
  html += `
    <div style="display: flex; gap: 8px; margin-top: 16px;">
      <button class="btn btn-secondary" onclick="updateApplicationStatus(${index}, 'accepted')" style="padding: 8px 14px; font-size: 13px; flex: 1;">
        합격 처리
      </button>
      <button class="btn btn-secondary" onclick="updateApplicationStatus(${index}, 'rejected')" style="padding: 8px 14px; font-size: 13px; flex: 1;">
        불합격 처리
      </button>
    </div>
  `;

  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('detailModal').classList.remove('hidden');
}

async function updateApplicationStatus(index, status) {
  const app = adminState.applications[index];
  if (!app) return;

  try {
    if (APPS_SCRIPT_URL) {
      const res = await fetch(`${APPS_SCRIPT_URL}?action=updateStatus`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          password: adminState.password,
          id: app.id || index + 1,
          status: status
        })
      });
      const data = await res.json();

      if (!data.success) {
        showToast('상태 변경 실패: ' + (data.message || ''));
        return;
      }
    }

    // 로컬 상태 업데이트
    adminState.applications[index].status = status;
    renderApplicationsTable(adminState.applications);
    renderStats(adminState.applications);
    renderRecipientList(adminState.applications);
    closeModal();
    showToast(`${app.name || '신청자'} - ${getStatusLabel(status)}으로 변경되었습니다.`);
  } catch (error) {
    console.error('상태 변경 오류:', error);
    showToast('네트워크 오류가 발생했습니다.');
  }
}

function filterApplications(query) {
  const statusFilter = document.getElementById('statusFilter').value;
  let filtered = adminState.applications;

  // 상태 필터
  if (statusFilter !== 'all') {
    filtered = filtered.filter(a => (a.status || 'pending') === statusFilter);
  }

  // 검색 필터
  if (query && query.trim()) {
    const q = query.trim().toLowerCase();
    filtered = filtered.filter(a =>
      (a.name && a.name.toLowerCase().includes(q)) ||
      (a.email && a.email.toLowerCase().includes(q)) ||
      (a.school && a.school.toLowerCase().includes(q))
    );
  }

  renderApplicationsTable(filtered);
}

// --- 테이블 정렬 ---

function sortTable(column) {
  const th = document.querySelector(`.admin-table th[onclick="sortTable('${column}')"]`);

  // 정렬 방향 토글
  if (adminState.sortColumn === column) {
    adminState.sortDirection = adminState.sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    adminState.sortColumn = column;
    adminState.sortDirection = 'asc';
  }

  // 헤더 스타일 초기화 및 적용
  document.querySelectorAll('.admin-table th').forEach(el => {
    el.classList.remove('sort-asc', 'sort-desc');
  });
  if (th) {
    th.classList.add(adminState.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
  }

  // 정렬 실행
  const sorted = [...adminState.applications].sort((a, b) => {
    let valA = a[column] || '';
    let valB = b[column] || '';

    if (column === 'id') {
      valA = parseInt(valA) || 0;
      valB = parseInt(valB) || 0;
    } else if (column === 'timestamp') {
      valA = new Date(valA).getTime() || 0;
      valB = new Date(valB).getTime() || 0;
    } else {
      valA = String(valA).toLowerCase();
      valB = String(valB).toLowerCase();
    }

    if (valA < valB) return adminState.sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return adminState.sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  renderApplicationsTable(sorted);
}

// ============================================
// AI 심사 탭
// ============================================

async function runBlindReviewAll() {
  if (!APPS_SCRIPT_URL) {
    showToast('Apps Script URL을 먼저 설정해 주세요.');
    return;
  }

  if (adminState.applications.length === 0) {
    showToast('신청자 데이터를 먼저 불러와 주세요.');
    await loadApplications();
    if (adminState.applications.length === 0) return;
  }

  const btn = document.getElementById('reviewAllBtn');
  const progress = document.getElementById('reviewProgress');
  btn.classList.add('loading');

  const pendingApps = adminState.applications.filter(a => !a.status || a.status === 'pending');

  if (pendingApps.length === 0) {
    showToast('심사할 신청서가 없습니다. (이미 모두 심사 완료)');
    btn.classList.remove('loading');
    return;
  }

  progress.textContent = `0 / ${pendingApps.length} 심사 중...`;

  try {
    const results = [];

    for (let i = 0; i < pendingApps.length; i++) {
      progress.textContent = `${i + 1} / ${pendingApps.length} 심사 중...`;

      const app = pendingApps[i];
      // 블라인드 데이터만 전송
      const blindData = {
        topic: app.topic || '',
        expertise: app.expertise || '',
        outline: app.outline || '',
        sample: app.sample || ''
      };

      const res = await fetch(`${APPS_SCRIPT_URL}?action=blindReview`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          password: adminState.password,
          applicationId: app.id,
          blindData: blindData
        })
      });
      const data = await res.json();

      if (data.success) {
        results.push({
          applicationId: app.id,
          name: app.name,
          ...data.review
        });
      }
    }

    adminState.reviews = results;
    renderReviewResults(results);
    progress.textContent = `${results.length}건 심사 완료`;
    showToast(`${results.length}건의 심사가 완료되었습니다.`);
  } catch (error) {
    console.error('AI 심사 오류:', error);
    progress.textContent = '심사 중 오류 발생';
    showToast('심사 중 오류가 발생했습니다.');
  }

  btn.classList.remove('loading');
}

async function loadReviews() {
  if (!APPS_SCRIPT_URL) return;

  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=getReviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ password: adminState.password })
    });
    const data = await res.json();

    if (data.success && data.reviews) {
      adminState.reviews = data.reviews;
      renderReviewResults(data.reviews);
    }
  } catch (error) {
    console.error('심사 결과 로드 오류:', error);
  }
}

function renderReviewResults(reviews) {
  const grid = document.getElementById('reviewGrid');

  if (!reviews || reviews.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);">
        아직 심사 결과가 없습니다. 위 버튼으로 심사를 실행해 주세요.
      </div>
    `;
    return;
  }

  grid.innerHTML = reviews.map((review, i) => {
    const score = review.totalScore || review.score || 0;
    const scoreClass = score >= 80 ? 'score-high' : score >= 50 ? 'score-mid' : 'score-low';

    // 개별 기준 점수 (있는 경우)
    const criteria = review.criteria || {};
    const criteriaHTML = Object.keys(criteria).length > 0
      ? Object.entries(criteria).map(([key, val]) => `
          <div class="criteria-row">
            <span>${escapeHtml(key)}</span>
            <span style="font-weight: 700;">${val}점</span>
          </div>
        `).join('')
      : '';

    // 이름 표시 (블라인드 아닌 결과 표시)
    const displayName = review.name || `지원자 ${i + 1}`;

    return `
      <div class="review-card">
        <div class="review-card-header">
          <div class="applicant-info">${escapeHtml(displayName)}</div>
          <div class="score-badge ${scoreClass}">${score}</div>
        </div>
        <div class="review-card-body">
          ${criteriaHTML}
          ${review.comment ? `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #F1F5F9; font-style: italic;">${escapeHtml(review.comment)}</div>` : ''}
        </div>
        <div class="review-card-footer">
          <button class="btn btn-ghost" onclick="acceptFromReview(${review.applicationId || i})" style="font-size: 12px; padding: 4px 10px; color: #059669;">
            합격
          </button>
          <button class="btn btn-ghost" onclick="rejectFromReview(${review.applicationId || i})" style="font-size: 12px; padding: 4px 10px; color: #DC2626;">
            불합격
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function acceptFromReview(appId) {
  const index = adminState.applications.findIndex(a => (a.id || 0) === appId);
  if (index >= 0) {
    updateApplicationStatus(index, 'accepted');
  }
}

function rejectFromReview(appId) {
  const index = adminState.applications.findIndex(a => (a.id || 0) === appId);
  if (index >= 0) {
    updateApplicationStatus(index, 'rejected');
  }
}

// --- 심사 결과 AI 대화 ---

function handleReviewKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendReviewMessage();
  }
}

async function sendReviewMessage() {
  const input = document.getElementById('reviewChatInput');
  const text = input.value.trim();
  if (!text) return;

  const btn = document.getElementById('reviewSendBtn');
  btn.classList.add('loading');
  input.value = '';

  reviewChat.addUserMessage(text);
  adminState.reviewConversation.push({ role: 'user', content: text });

  try {
    if (APPS_SCRIPT_URL) {
      // 블라인드 요약 데이터 첨부
      const blindSummary = getBlindSummaryForAI();

      const res = await fetch(`${APPS_SCRIPT_URL}?action=chatWithAI`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          password: adminState.password,
          type: 'review',
          message: text,
          context: blindSummary,
          history: adminState.reviewConversation.slice(-10)
        })
      });
      const data = await res.json();

      if (data.success && data.reply) {
        await reviewChat.addAIMessage(data.reply);
        adminState.reviewConversation.push({ role: 'ai', content: data.reply });
      } else {
        await reviewChat.addAIMessage('응답을 생성하지 못했습니다.');
      }
    } else {
      await reviewChat.addAIMessage(
        'Apps Script URL이 설정되지 않아 AI 응답을 받을 수 없습니다.\n' +
        '사이드바 하단의 **Apps Script 설정**에서 URL을 먼저 설정해 주세요.'
      );
    }
  } catch (error) {
    console.error('심사 채팅 오류:', error);
    await reviewChat.addAIMessage('네트워크 오류가 발생했습니다.');
  }

  btn.classList.remove('loading');
  input.focus();
}

/**
 * AI에게 전달할 블라인드(비식별) 요약 데이터 생성
 */
function getBlindSummaryForAI() {
  if (adminState.reviews.length === 0 && adminState.applications.length === 0) {
    return '아직 심사 데이터가 없습니다.';
  }

  const summaryParts = [];

  // 심사 결과 요약
  if (adminState.reviews.length > 0) {
    summaryParts.push(`## 심사 결과 (${adminState.reviews.length}건)`);
    adminState.reviews.forEach((review, i) => {
      const score = review.totalScore || review.score || 0;
      summaryParts.push(`- 지원자 ${i + 1}: 총점 ${score}점${review.comment ? ' / ' + review.comment.substring(0, 100) : ''}`);
    });
  }

  // 블라인드 신청 데이터 요약
  if (adminState.applications.length > 0) {
    summaryParts.push(`\n## 지원 현황 (${adminState.applications.length}건, 블라인드)`);
    adminState.applications.forEach((app, i) => {
      summaryParts.push(`- 지원자 ${i + 1}: 주제="${app.topic || '미작성'}", 상태=${getStatusLabel(app.status)}`);
    });
  }

  return summaryParts.join('\n');
}

// ============================================
// 이메일 발송 탭
// ============================================

function renderRecipientList(apps) {
  const container = document.getElementById('recipientRows');
  const filterType = document.getElementById('emailTypeFilter').value;

  let filtered = apps;
  if (filterType === 'accepted') {
    filtered = apps.filter(a => a.status === 'accepted');
  } else if (filterType === 'rejected') {
    filtered = apps.filter(a => a.status === 'rejected');
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="recipient-row" style="justify-content: center; color: var(--text-muted); padding: 24px;">
        해당하는 수신자가 없습니다.
      </div>
    `;
    updateSelectedCount();
    return;
  }

  container.innerHTML = filtered.map((app, i) => `
    <div class="recipient-row">
      <input type="checkbox" class="recipient-check" value="${app.id || i}" data-index="${i}"
             onchange="updateSelectedCount()">
      <span class="recipient-name">${escapeHtml(app.name || '-')}</span>
      <span class="recipient-email">${escapeHtml(app.email || '-')}</span>
      <span class="status-tag status-${app.status || 'pending'}" style="font-size: 11px;">
        ${getStatusLabel(app.status)}
      </span>
    </div>
  `).join('');

  updateSelectedCount();
}

function filterRecipients() {
  renderRecipientList(adminState.applications);
}

function toggleAllRecipients(checked) {
  document.querySelectorAll('.recipient-check').forEach(cb => {
    cb.checked = checked;
  });
  updateSelectedCount();
}

function updateSelectedCount() {
  const checked = document.querySelectorAll('.recipient-check:checked').length;
  document.getElementById('selectedCount').textContent = `${checked}명 선택`;
  document.getElementById('sendEmailBtn').disabled = checked === 0;
}

function previewEmail(type) {
  const subject = type === 'accept'
    ? document.getElementById('acceptSubject').value
    : document.getElementById('rejectSubject').value;

  const body = type === 'accept'
    ? document.getElementById('acceptBody').value
    : document.getElementById('rejectBody').value;

  // 샘플 데이터로 변수 치환
  const sampleData = {
    name: '홍길동',
    email: 'hong@school.ac.kr',
    school: '서울고등학교',
    subject: '정보'
  };

  const previewSubject = replaceTemplateVars(subject, sampleData);
  const previewBody = replaceTemplateVars(body, sampleData);

  document.getElementById('previewSubject').textContent = previewSubject;
  document.getElementById('previewBody').textContent = previewBody;
  document.getElementById('previewBody').style.color = 'var(--text-primary)';
  document.getElementById('previewBody').style.fontStyle = 'normal';
}

function replaceTemplateVars(template, data) {
  return template
    .replace(/\{\{name\}\}/g, data.name || '')
    .replace(/\{\{email\}\}/g, data.email || '')
    .replace(/\{\{school\}\}/g, data.school || '')
    .replace(/\{\{subject\}\}/g, data.subject || '');
}

async function sendEmails() {
  if (!APPS_SCRIPT_URL) {
    showToast('Apps Script URL을 먼저 설정해 주세요.');
    return;
  }

  const checkedBoxes = document.querySelectorAll('.recipient-check:checked');
  if (checkedBoxes.length === 0) {
    showToast('수신자를 선택해 주세요.');
    return;
  }

  const emailType = document.getElementById('emailTypeFilter').value;
  const type = emailType === 'rejected' ? 'reject' : 'accept';

  const subject = type === 'accept'
    ? document.getElementById('acceptSubject').value
    : document.getElementById('rejectSubject').value;

  const bodyTemplate = type === 'accept'
    ? document.getElementById('acceptBody').value
    : document.getElementById('rejectBody').value;

  // 선택된 수신자 ID 수집
  const selectedIds = Array.from(checkedBoxes).map(cb => cb.value);

  const btn = document.getElementById('sendEmailBtn');
  const status = document.getElementById('sendStatus');
  btn.classList.add('loading');
  status.textContent = '발송 중...';

  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=sendEmails`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        password: adminState.password,
        ids: selectedIds,
        subject: subject,
        bodyTemplate: bodyTemplate,
        type: type
      })
    });
    const data = await res.json();

    if (data.success) {
      status.textContent = `${data.sent || selectedIds.length}건 발송 완료`;
      showToast(`${data.sent || selectedIds.length}건의 이메일이 발송되었습니다.`);
    } else {
      status.textContent = '발송 실패';
      showToast('이메일 발송 실패: ' + (data.message || ''));
    }
  } catch (error) {
    console.error('이메일 발송 오류:', error);
    status.textContent = '네트워크 오류';
    showToast('네트워크 오류가 발생했습니다.');
  }

  btn.classList.remove('loading');
}

// ============================================
// 설정
// ============================================

async function loadConfig() {
  if (!APPS_SCRIPT_URL) return;

  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=getConfig`);
    const data = await res.json();
    if (data.success) {
      adminState.config = data.config;

      // 확정된 질문 로드
      if (data.config.confirmedQuestions) {
        adminState.confirmedQuestions = data.config.confirmedQuestions;
        renderConfirmedQuestions();
      }
    }
  } catch (error) {
    console.warn('설정 로드 실패:', error);
  }
}

function openSettings() {
  document.getElementById('appsScriptUrlInput').value = APPS_SCRIPT_URL;
  document.getElementById('adminPasswordSetting').value = '';
  document.getElementById('settingsModal').classList.remove('hidden');
}

function closeSettingsModal() {
  document.getElementById('settingsModal').classList.add('hidden');
}

function saveSettings() {
  const newUrl = document.getElementById('appsScriptUrlInput').value.trim();
  const newPassword = document.getElementById('adminPasswordSetting').value.trim();

  if (newUrl !== APPS_SCRIPT_URL) {
    APPS_SCRIPT_URL = newUrl;
    localStorage.setItem('applyflow_apps_script_url', newUrl);
    showToast('Apps Script URL이 저장되었습니다.');
    checkSetupStatus();

    // URL 변경 시 데이터 다시 로드
    if (newUrl) {
      loadApplications();
      loadConfig();
    }
  }

  if (newPassword) {
    adminState.password = newPassword;
    sessionStorage.setItem('applyflow_admin_pw', newPassword);
    showToast('비밀번호가 변경되었습니다.');
  }

  closeSettingsModal();
}

// ============================================
// 모달
// ============================================

function showModal(content) {
  document.getElementById('modalContent').innerHTML = content;
  document.getElementById('detailModal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('detailModal').classList.add('hidden');
}

// ============================================
// 유틸리티
// ============================================

function getStatusLabel(status) {
  const labels = {
    pending: '심사 대기',
    reviewed: '심사 완료',
    accepted: '합격',
    rejected: '불합격'
  };
  return labels[status] || labels.pending;
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return dateStr;
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/\n/g, '<br>');
}

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
