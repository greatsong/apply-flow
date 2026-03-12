/**
 * ApplyFlow — 신청 페이지 메인 로직
 * AI 대화형 인터페이스로 신청서를 작성하는 스크립트
 */

// ============================================
// 설정
// ============================================

// Google Apps Script 웹 앱 URL (배포 후 여기에 입력)
const APPS_SCRIPT_URL = '';

// 기본 폼 구성 (Apps Script에서 동적으로 로드하거나 이 기본값 사용)
const DEFAULT_CONFIG = {
  title: '에듀플로 베타 테스터 모집',
  description: 'AI와 함께 교재를 만드는 새로운 경험, 에듀플로의 첫 번째 여정에 함께하세요.',
  deadline: '2026-03-22',
  steps: [
    {
      id: 'intro',
      type: 'intro',
      aiMessage: '안녕하세요! 에듀플로 베타 테스터 모집에 오신 걸 환영합니다.\n\n에듀플로는 **AI와 대화하며 교재를 만드는 플랫폼**이에요. 지금부터 몇 가지 질문을 드릴 테니 편하게 답해주세요.\n\n준비되셨으면 아래 버튼을 눌러주세요!'
    },
    {
      id: 'basic',
      type: 'form',
      aiMessage: '먼저 기본 정보를 알려주세요.',
      fields: [
        { name: 'name', label: '이름', type: 'text', placeholder: '홍길동', required: true },
        { name: 'email', label: '이메일', type: 'email', placeholder: 'example@school.ac.kr', required: true },
        { name: 'school', label: '소속 (학교/기관)', type: 'text', placeholder: '○○고등학교', required: true },
        { name: 'subject', label: '담당 과목', type: 'text', placeholder: '정보, 수학, 과학 등', required: true }
      ],
      layout: 'grid' // 'grid' or 'stack'
    },
    {
      id: 'topic',
      type: 'textarea',
      aiMessage: '좋습니다! 이제 본격적으로 여쭤볼게요.\n\n에듀플로로 **어떤 교재를 만들고 싶으세요?** 주제를 자유롭게 적어주세요.\n\n예를 들어 "고등학교 정보 교과의 프로그래밍 입문 교재" 같은 느낌이면 됩니다.',
      field: { name: 'topic', label: '만들고 싶은 교재 주제', placeholder: '만들고 싶은 교재의 주제를 구체적으로 적어주세요...', minLength: 30 }
    },
    {
      id: 'expertise',
      type: 'textarea',
      aiMessage: '흥미로운 주제네요!\n\n이 분야에서의 **전문성이나 경험**을 간단히 소개해 주세요.\n\n교육 경력, 관련 프로젝트, 연구 활동 등 자유롭게 작성해 주시면 됩니다.',
      field: { name: 'expertise', label: '전문성 소개', placeholder: '이 분야에서의 경험과 전문성을 소개해 주세요...', minLength: 30 }
    },
    {
      id: 'outline',
      type: 'textarea',
      aiMessage: '이제 교재의 **목차를 간단히 구상**해 보세요.\n\n3~5개 챕터 정도면 충분해요. 각 챕터의 제목과 간단한 설명을 적어주세요.',
      field: { name: 'outline', label: '목차 초안 (3~5개 챕터)', placeholder: '1장. 제목 - 간단한 설명\n2장. 제목 - 간단한 설명\n3장. 제목 - 간단한 설명\n...', minLength: 50 }
    },
    {
      id: 'sample',
      type: 'textarea',
      aiMessage: '마지막 질문이에요!\n\n가장 자신 있는 챕터 하나를 골라서 **어떤 내용을 담고 싶은지** 간단히 설명해 주세요.\n\n학습 목표, 핵심 개념, 활동 등을 자유롭게 적어주시면 됩니다.',
      field: { name: 'sample', label: '샘플 챕터 내용 개요', placeholder: '선택한 챕터에 담고 싶은 구체적인 내용을 설명해 주세요...', minLength: 50 }
    },
    {
      id: 'confirm',
      type: 'confirm',
      aiMessage: '모든 답변을 잘 작성해 주셨어요! 아래에서 내용을 확인해 주세요.'
    }
  ]
};

// ============================================
// 앱 상태
// ============================================

const state = {
  config: null,
  currentStep: 0,
  formData: {},
  submitted: false
};

// ============================================
// 초기화
// ============================================

let chatUI;

document.addEventListener('DOMContentLoaded', async () => {
  chatUI = new ChatUI('#chatArea', {
    aiAvatar: '📚',
    userAvatar: '✍️',
    typingDelay: 600
  });

  await loadConfig();
  renderProgressBar();
  await startConversation();
});

/**
 * 설정 로드 (Apps Script에서 또는 기본값 사용)
 */
async function loadConfig() {
  if (APPS_SCRIPT_URL) {
    try {
      const res = await fetch(`${APPS_SCRIPT_URL}?action=getConfig`);
      const data = await res.json();
      if (data.success) {
        state.config = data.config;
        return;
      }
    } catch (e) {
      console.warn('설정 로드 실패, 기본값 사용:', e);
    }
  }
  state.config = DEFAULT_CONFIG;

  // 헤더 업데이트
  document.querySelector('.header h1').textContent = state.config.title;
  document.querySelector('.header p').textContent = state.config.description;

  // 마감일 표시
  if (state.config.deadline) {
    const d = new Date(state.config.deadline);
    document.getElementById('deadlineDate').textContent =
      `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;

    // 마감 확인
    if (new Date() > d) {
      document.getElementById('deadlineBanner').innerHTML = '⚠️ 모집이 마감되었습니다.';
      document.getElementById('deadlineBanner').style.background = '#FEE2E2';
      document.getElementById('deadlineBanner').style.borderColor = '#F87171';
      document.getElementById('deadlineBanner').style.color = '#991B1B';
    }
  } else {
    document.getElementById('deadlineBanner').classList.add('hidden');
  }
}

// ============================================
// 진행률 바
// ============================================

function renderProgressBar() {
  const bar = document.getElementById('progressBar');
  const steps = state.config.steps;
  const totalSteps = steps.length;

  bar.innerHTML = '';

  for (let i = 0; i < totalSteps; i++) {
    const stepEl = document.createElement('div');
    stepEl.className = 'progress-step';

    const circle = document.createElement('div');
    circle.className = 'step-circle';
    circle.id = `step-${i}`;

    if (i < state.currentStep) {
      circle.className += ' completed';
      circle.textContent = '✓';
    } else if (i === state.currentStep) {
      circle.className += ' active';
      circle.textContent = i + 1;
    } else {
      circle.className += ' inactive';
      circle.textContent = i + 1;
    }

    stepEl.appendChild(circle);

    if (i < totalSteps - 1) {
      const line = document.createElement('div');
      line.className = `step-line ${i < state.currentStep ? 'active' : 'inactive'}`;
      stepEl.appendChild(line);
    }

    bar.appendChild(stepEl);
  }
}

function updateProgress() {
  renderProgressBar();
}

// ============================================
// 대화 흐름
// ============================================

async function startConversation() {
  await processStep(0);
}

async function processStep(stepIndex) {
  if (stepIndex >= state.config.steps.length) return;

  state.currentStep = stepIndex;
  updateProgress();

  const step = state.config.steps[stepIndex];

  // AI 메시지 표시
  await chatUI.addAIMessage(step.aiMessage);

  // 입력 영역 렌더링
  renderInput(step);
}

// ============================================
// 입력 렌더링
// ============================================

function renderInput(step) {
  const inputArea = document.getElementById('inputArea');
  inputArea.innerHTML = '';

  switch (step.type) {
    case 'intro':
      renderIntroInput(inputArea, step);
      break;
    case 'form':
      renderFormInput(inputArea, step);
      break;
    case 'textarea':
      renderTextareaInput(inputArea, step);
      break;
    case 'confirm':
      renderConfirmInput(inputArea, step);
      break;
  }
}

/**
 * 인트로 (시작 버튼)
 */
function renderIntroInput(container, step) {
  const section = document.createElement('div');
  section.className = 'input-section';
  section.innerHTML = `
    <button class="btn btn-primary" onclick="handleIntroNext()">
      시작하기 →
    </button>
  `;
  container.appendChild(section);
}

function handleIntroNext() {
  // 사용자 버블
  chatUI.addUserMessage('네, 준비됐어요!');
  document.getElementById('inputArea').innerHTML = '';
  setTimeout(() => processStep(state.currentStep + 1), 300);
}

/**
 * 폼 입력 (여러 필드)
 */
function renderFormInput(container, step) {
  const section = document.createElement('div');
  section.className = 'input-section';

  const card = document.createElement('div');
  card.className = 'input-card';

  const fieldsHTML = step.fields.map(field => {
    const reqMark = field.required ? '<span class="required">*</span>' : '';
    return `
      <div class="input-group">
        <label>${field.label}${reqMark}</label>
        <input type="${field.type || 'text'}" id="field-${field.name}"
               placeholder="${field.placeholder || ''}"
               ${field.required ? 'required' : ''}>
      </div>
    `;
  }).join('');

  // grid 또는 stack 레이아웃
  const layoutClass = step.layout === 'grid' ? 'input-row' : '';

  if (step.layout === 'grid' && step.fields.length === 4) {
    // 2x2 그리드
    card.innerHTML = `
      <div class="input-row">
        ${step.fields.slice(0, 2).map(f => `
          <div class="input-group">
            <label>${f.label}${f.required ? '<span class="required">*</span>' : ''}</label>
            <input type="${f.type || 'text'}" id="field-${f.name}" placeholder="${f.placeholder || ''}" ${f.required ? 'required' : ''}>
          </div>
        `).join('')}
      </div>
      <div class="input-row">
        ${step.fields.slice(2, 4).map(f => `
          <div class="input-group">
            <label>${f.label}${f.required ? '<span class="required">*</span>' : ''}</label>
            <input type="${f.type || 'text'}" id="field-${f.name}" placeholder="${f.placeholder || ''}" ${f.required ? 'required' : ''}>
          </div>
        `).join('')}
      </div>
    `;
  } else {
    card.innerHTML = fieldsHTML;
  }

  const btnWrap = document.createElement('div');
  btnWrap.style.marginTop = '16px';
  btnWrap.innerHTML = `<button class="btn btn-primary" onclick="handleFormSubmit('${step.id}')">다음 →</button>`;
  card.appendChild(btnWrap);

  section.appendChild(card);
  container.appendChild(section);

  // 첫 필드에 포커스
  const firstInput = card.querySelector('input');
  if (firstInput) setTimeout(() => firstInput.focus(), 300);
}

function handleFormSubmit(stepId) {
  const step = state.config.steps.find(s => s.id === stepId);
  if (!step) return;

  const fields = [];
  let valid = true;

  for (const f of step.fields) {
    const input = document.getElementById(`field-${f.name}`);
    const value = input.value.trim();

    if (f.required && !value) {
      input.style.borderColor = '#FF6B6B';
      input.focus();
      valid = false;
      break;
    }

    if (f.type === 'email' && value && !isValidEmail(value)) {
      input.style.borderColor = '#FF6B6B';
      input.focus();
      valid = false;
      break;
    }

    state.formData[f.name] = value;
    fields.push({ label: f.label, value });
  }

  if (!valid) return;

  // 사용자 응답 버블
  chatUI.addUserSummaryBubble(fields);

  // 입력 영역 제거 + 다음 단계
  document.getElementById('inputArea').innerHTML = '';
  setTimeout(() => processStep(state.currentStep + 1), 400);
}

/**
 * 텍스트 영역 입력
 */
function renderTextareaInput(container, step) {
  const section = document.createElement('div');
  section.className = 'input-section';

  const card = document.createElement('div');
  card.className = 'input-card';

  const minLen = step.field.minLength || 0;
  const counterHTML = minLen > 0
    ? `<div id="charCount" style="text-align:right;font-size:12px;color:var(--text-muted);margin-top:4px;">0 / ${minLen}자 이상</div>`
    : '';

  card.innerHTML = `
    <div class="input-group">
      <label>${step.field.label}<span class="required">*</span></label>
      <textarea id="field-${step.field.name}"
                placeholder="${step.field.placeholder || ''}"
                rows="5"
                oninput="updateCharCount(this, ${minLen})">${state.formData[step.field.name] || ''}</textarea>
      ${counterHTML}
    </div>
    <button class="btn btn-primary" id="textareaSubmitBtn" onclick="handleTextareaSubmit('${step.id}')" ${minLen > 0 ? 'disabled' : ''}>
      다음 →
    </button>
  `;

  section.appendChild(card);
  container.appendChild(section);

  // 포커스
  const textarea = card.querySelector('textarea');
  if (textarea) setTimeout(() => textarea.focus(), 300);
}

function updateCharCount(textarea, minLen) {
  const count = textarea.value.trim().length;
  const counterEl = document.getElementById('charCount');
  const btn = document.getElementById('textareaSubmitBtn');

  if (counterEl) {
    counterEl.textContent = `${count} / ${minLen}자 이상`;
    counterEl.style.color = count >= minLen ? '#10B981' : 'var(--text-muted)';
  }

  if (btn) {
    btn.disabled = count < minLen;
  }
}

function handleTextareaSubmit(stepId) {
  const step = state.config.steps.find(s => s.id === stepId);
  if (!step) return;

  const textarea = document.getElementById(`field-${step.field.name}`);
  const value = textarea.value.trim();

  if (step.field.minLength && value.length < step.field.minLength) return;

  state.formData[step.field.name] = value;

  // 사용자 응답 (요약)
  const displayText = value.length > 120 ? value.substring(0, 120) + '...' : value;
  chatUI.addUserMessage(displayText);

  document.getElementById('inputArea').innerHTML = '';
  setTimeout(() => processStep(state.currentStep + 1), 400);
}

/**
 * 확인 및 제출
 */
function renderConfirmInput(container, step) {
  const section = document.createElement('div');
  section.className = 'input-section';

  // 요약 카드 생성
  const card = document.createElement('div');
  card.className = 'summary-card';

  const fieldLabels = {
    name: '이름', email: '이메일', school: '소속', subject: '과목',
    topic: '교재 주제', expertise: '전문성', outline: '목차 초안', sample: '샘플 챕터'
  };

  // 개인정보 필드 (블라인드 참고)
  const personalFields = ['name', 'email', 'school', 'subject'];
  const contentFields = Object.keys(state.formData).filter(k => !personalFields.includes(k));

  let itemsHTML = '';

  // 개인정보
  itemsHTML += '<div style="margin-bottom:12px"><span class="badge badge-blue" style="margin-bottom:8px">기본 정보</span></div>';
  for (const key of personalFields) {
    if (state.formData[key]) {
      itemsHTML += `
        <div class="summary-item">
          <div class="summary-label">${fieldLabels[key] || key}</div>
          <div class="summary-value">${escapeHtml(state.formData[key])}</div>
        </div>
      `;
    }
  }

  // 내용
  itemsHTML += '<div style="margin:16px 0 12px"><span class="badge badge-coral" style="margin-bottom:8px">기획서 내용</span></div>';
  for (const key of contentFields) {
    if (state.formData[key]) {
      itemsHTML += `
        <div class="summary-item">
          <div class="summary-label">${fieldLabels[key] || key}</div>
          <div class="summary-value">${escapeHtml(state.formData[key])}</div>
        </div>
      `;
    }
  }

  card.innerHTML = `
    <h3>📋 신청서 요약</h3>
    ${itemsHTML}
    <div class="summary-actions">
      <button class="btn btn-primary" style="flex:2" onclick="handleSubmit()">
        제출하기
      </button>
      <button class="btn btn-secondary" style="flex:1" onclick="handleEdit()">
        수정하기
      </button>
    </div>
  `;

  section.appendChild(card);
  container.appendChild(section);
}

/**
 * 최종 제출
 */
async function handleSubmit() {
  if (state.submitted) return;

  const btn = document.querySelector('.summary-actions .btn-primary');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> 제출 중...';

  try {
    if (APPS_SCRIPT_URL) {
      const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          data: state.formData,
          timestamp: new Date().toISOString()
        })
      });

      // no-cors 모드에서는 응답을 읽을 수 없으므로 성공으로 간주
    } else {
      // Apps Script URL 미설정 시 콘솔 출력
      console.log('제출 데이터:', state.formData);
      await new Promise(r => setTimeout(r, 1000));
    }

    state.submitted = true;
    showSuccess();
  } catch (error) {
    console.error('제출 실패:', error);
    btn.disabled = false;
    btn.innerHTML = '제출하기';
    showToast('제출에 실패했습니다. 다시 시도해 주세요.');
  }
}

/**
 * 수정하기 (처음부터 다시)
 */
function handleEdit() {
  // 폼 데이터는 유지하고 처음부터 다시
  state.currentStep = 0;
  chatUI.clear();
  document.getElementById('inputArea').innerHTML = '';
  startConversation();
}

/**
 * 성공 화면
 */
function showSuccess() {
  document.getElementById('inputArea').innerHTML = '';
  document.getElementById('progressBar').classList.add('hidden');

  const chatArea = document.getElementById('chatArea');
  chatArea.innerHTML = '';

  const successEl = document.createElement('div');
  successEl.className = 'success-screen';
  successEl.innerHTML = `
    <div class="success-icon">🎉</div>
    <h2>신청이 완료되었습니다!</h2>
    <p>심사 결과는 입력하신 이메일로 안내드리겠습니다. 에듀플로에 관심을 가져주셔서 감사합니다!</p>
    <div style="margin-top:32px">
      <a href="https://eduflow-greatsong.fly.dev" target="_blank" class="btn btn-secondary" style="text-decoration:none">
        에듀플로 둘러보기 →
      </a>
    </div>
  `;

  chatArea.appendChild(successEl);
}

// ============================================
// 유틸리티
// ============================================

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(text) {
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

  setTimeout(() => toast.remove(), 3000);
}
