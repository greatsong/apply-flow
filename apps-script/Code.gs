/**
 * ApplyFlow - 베타 테스터 모집 시스템 백엔드
 * Google Apps Script + Google Sheets 기반
 *
 * 시트 구조:
 * - "설정" (Config): key-value 설정 저장
 * - "신청" (Applications): 지원자 데이터
 * - "심사" (Review): AI 블라인드 심사 결과
 */

// ============================================================
// 공개 엔드포인트
// ============================================================

/**
 * POST 요청 처리 - 모든 쓰기 작업 라우팅
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    let result;

    switch (action) {
      case 'submit':
        // 신청서 제출 (인증 불필요)
        result = saveApplication(data);
        break;

      case 'chat':
        // AI 채팅 프록시 (관리자 전용)
        if (!verifyPassword(data.password)) {
          result = { success: false, error: '인증 실패' };
          break;
        }
        result = handleChat(data.messages, data.systemPrompt);
        break;

      case 'blindReview':
        // 개별 블라인드 심사 (관리자 전용)
        if (!verifyPassword(data.password)) {
          result = { success: false, error: '인증 실패' };
          break;
        }
        result = blindReview(data.applicationId);
        break;

      case 'blindReviewAll':
        // 전체 블라인드 심사 (관리자 전용)
        if (!verifyPassword(data.password)) {
          result = { success: false, error: '인증 실패' };
          break;
        }
        result = blindReviewAll();
        break;

      case 'updateStatus':
        // 상태 업데이트 (관리자 전용)
        if (!verifyPassword(data.password)) {
          result = { success: false, error: '인증 실패' };
          break;
        }
        result = updateApplicationStatus(data.id, data.status);
        break;

      case 'saveConfig':
        // 설정 저장 (관리자 전용)
        if (!verifyPassword(data.password)) {
          result = { success: false, error: '인증 실패' };
          break;
        }
        result = saveConfig(data.config);
        break;

      case 'sendEmail':
        // 결과 이메일 발송 (관리자 전용)
        if (!verifyPassword(data.password)) {
          result = { success: false, error: '인증 실패' };
          break;
        }
        if (data.ids) {
          result = sendBulkEmail(data.ids, data.type);
        } else {
          result = sendResultEmail(data.applicationId, data.type);
        }
        break;

      default:
        result = { success: false, error: '알 수 없는 액션: ' + action };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    const errorResult = { success: false, error: error.message };
    return ContentService
      .createTextOutput(JSON.stringify(errorResult))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * GET 요청 처리 - 모든 읽기 작업 라우팅
 */
function doGet(e) {
  try {
    const action = e.parameter.action;
    let result;

    switch (action) {
      case 'getConfig':
        // 공개 설정 조회 (인증 불필요)
        result = getConfig();
        break;

      case 'getApplications':
        // 전체 신청 목록 (관리자 전용)
        if (!verifyPassword(e.parameter.password)) {
          result = { success: false, error: '인증 실패' };
          break;
        }
        result = getApplications();
        break;

      case 'getReviews':
        // 전체 심사 결과 (관리자 전용)
        if (!verifyPassword(e.parameter.password)) {
          result = { success: false, error: '인증 실패' };
          break;
        }
        result = getReviews();
        break;

      default:
        result = { success: false, error: '알 수 없는 액션: ' + action };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    const errorResult = { success: false, error: error.message };
    return ContentService
      .createTextOutput(JSON.stringify(errorResult))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// 데이터 함수
// ============================================================

/**
 * 신청서 저장
 * "신청" 시트에 새 행 추가, 자동 ID 부여
 */
function saveApplication(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('신청');

    if (!sheet) {
      return { success: false, error: '"신청" 시트를 찾을 수 없습니다.' };
    }

    // 자동 ID 생성 (APP-001, APP-002, ...)
    const lastRow = sheet.getLastRow();
    let newId = 'APP-001';
    if (lastRow > 1) {
      const lastId = sheet.getRange(lastRow, 1).getValue();
      const lastNum = parseInt(lastId.replace('APP-', ''), 10);
      newId = 'APP-' + String(lastNum + 1).padStart(3, '0');
    }

    const timestamp = new Date().toISOString();
    const row = [
      newId,
      timestamp,
      data.name || '',
      data.email || '',
      data.school || '',
      data.subject || '',
      data.topic || '',
      data.expertise || '',
      data.outline || '',
      data.sample || '',
      'pending',   // status
      false         // email_sent
    ];

    sheet.appendRow(row);

    return { success: true, id: newId, message: '신청이 완료되었습니다.' };
  } catch (error) {
    return { success: false, error: '신청 저장 실패: ' + error.message };
  }
}

/**
 * 전체 신청 목록 조회
 * "신청" 시트의 모든 행을 JSON 배열로 반환
 */
function getApplications() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('신청');

    if (!sheet) {
      return { success: false, error: '"신청" 시트를 찾을 수 없습니다.' };
    }

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return { success: true, applications: [] };
    }

    const headers = sheet.getRange(1, 1, 1, 12).getValues()[0];
    const dataRange = sheet.getRange(2, 1, lastRow - 1, 12).getValues();

    const applications = dataRange.map(function(row) {
      const obj = {};
      headers.forEach(function(header, i) {
        obj[header] = row[i];
      });
      return obj;
    });

    return { success: true, applications: applications };
  } catch (error) {
    return { success: false, error: '신청 목록 조회 실패: ' + error.message };
  }
}

/**
 * 신청 상태 업데이트
 * ID로 해당 행을 찾아 status 컬럼 변경
 */
function updateApplicationStatus(id, status) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('신청');

    if (!sheet) {
      return { success: false, error: '"신청" 시트를 찾을 수 없습니다.' };
    }

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return { success: false, error: '신청 데이터가 없습니다.' };
    }

    // ID 컬럼(1열)에서 해당 ID 찾기
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    let targetRow = -1;

    for (var i = 0; i < ids.length; i++) {
      if (ids[i][0] === id) {
        targetRow = i + 2; // 헤더 행 보정
        break;
      }
    }

    if (targetRow === -1) {
      return { success: false, error: '해당 ID를 찾을 수 없습니다: ' + id };
    }

    // status 컬럼 (11번째 열) 업데이트
    sheet.getRange(targetRow, 11).setValue(status);

    return { success: true, message: id + ' 상태가 ' + status + '(으)로 변경되었습니다.' };
  } catch (error) {
    return { success: false, error: '상태 업데이트 실패: ' + error.message };
  }
}

// ============================================================
// AI 통합 (블라인드 심사)
// ============================================================

/**
 * Claude API 호출
 * Script Properties에서 ANTHROPIC_API_KEY를 가져와 사용
 */
function chatWithAI(messages, systemPrompt) {
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다. Script Properties를 확인하세요.');
    }

    const payload = {
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: messages
    };

    // 시스템 프롬프트가 있으면 추가
    if (systemPrompt) {
      payload.system = systemPrompt;
    }

    const options = {
      method: 'post',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode !== 200) {
      throw new Error('Claude API 오류 (' + responseCode + '): ' + responseText);
    }

    const result = JSON.parse(responseText);

    // 텍스트 응답 추출
    const textContent = result.content.find(function(block) {
      return block.type === 'text';
    });

    return textContent ? textContent.text : '';
  } catch (error) {
    throw new Error('AI 호출 실패: ' + error.message);
  }
}

/**
 * 블라인드 데이터 생성
 * 개인정보(이름, 이메일, 학교, 과목)를 제거하고 콘텐츠 필드만 반환
 * AI가 절대 개인정보를 볼 수 없도록 함
 */
function getBlindData(applicationRow, anonymousId) {
  return {
    id: anonymousId || '지원자',
    topic: applicationRow.topic || applicationRow['topic'] || '',
    expertise: applicationRow.expertise || applicationRow['expertise'] || '',
    outline: applicationRow.outline || applicationRow['outline'] || '',
    sample: applicationRow.sample || applicationRow['sample'] || ''
  };
}

/**
 * 개별 블라인드 심사
 * 개인정보 제거 후 AI에게 평가 요청
 */
function blindReview(applicationId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const appSheet = ss.getSheetByName('신청');
    const reviewSheet = ss.getSheetByName('심사');

    if (!appSheet || !reviewSheet) {
      return { success: false, error: '필요한 시트를 찾을 수 없습니다.' };
    }

    // 신청 데이터 가져오기
    const lastRow = appSheet.getLastRow();
    if (lastRow <= 1) {
      return { success: false, error: '신청 데이터가 없습니다.' };
    }

    const headers = appSheet.getRange(1, 1, 1, 12).getValues()[0];
    const dataRange = appSheet.getRange(2, 1, lastRow - 1, 12).getValues();

    let application = null;
    let rowIndex = -1;

    for (var i = 0; i < dataRange.length; i++) {
      if (dataRange[i][0] === applicationId) {
        application = {};
        headers.forEach(function(header, j) {
          application[header] = dataRange[i][j];
        });
        rowIndex = i;
        break;
      }
    }

    if (!application) {
      return { success: false, error: '해당 신청을 찾을 수 없습니다: ' + applicationId };
    }

    // 블라인드 데이터 생성 (개인정보 제거)
    var anonymousId = '지원자 #' + (rowIndex + 1);
    var blindData = getBlindData(application, anonymousId);

    // 심사 프롬프트 구성
    var systemPrompt = buildReviewSystemPrompt();
    var userMessage = buildReviewUserMessage(blindData);

    var messages = [
      { role: 'user', content: userMessage }
    ];

    // AI 심사 실행
    var aiResponse = chatWithAI(messages, systemPrompt);

    // AI 응답 파싱 (JSON 형식 기대)
    var scores = parseReviewResponse(aiResponse);

    // 심사 결과 저장
    var timestamp = new Date().toISOString();
    var reviewRow = [
      applicationId,
      timestamp,
      scores.authenticity || 0,       // 진정성 (30)
      scores.specificity || 0,        // 구체성 (25)
      scores.expertise || 0,          // 전문성 (25)
      scores.educationalValue || 0,   // 교육적 가치 (20)
      scores.totalScore || 0,         // 총점 (100)
      scores.aiProbability || 0,      // AI 생성 확률 (%)
      scores.comment || '',           // 심사평
      aiResponse                      // 원본 AI 응답
    ];

    reviewSheet.appendRow(reviewRow);

    return {
      success: true,
      applicationId: applicationId,
      scores: scores,
      message: applicationId + ' 심사가 완료되었습니다.'
    };
  } catch (error) {
    return { success: false, error: '블라인드 심사 실패: ' + error.message };
  }
}

/**
 * 전체 블라인드 심사
 * pending 상태인 모든 신청에 대해 심사 실행
 */
function blindReviewAll() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const appSheet = ss.getSheetByName('신청');

    if (!appSheet) {
      return { success: false, error: '"신청" 시트를 찾을 수 없습니다.' };
    }

    const lastRow = appSheet.getLastRow();
    if (lastRow <= 1) {
      return { success: true, message: '심사할 신청이 없습니다.', results: [] };
    }

    const headers = appSheet.getRange(1, 1, 1, 12).getValues()[0];
    const dataRange = appSheet.getRange(2, 1, lastRow - 1, 12).getValues();

    // status 컬럼 인덱스 찾기
    const statusIdx = headers.indexOf('status');
    const idIdx = headers.indexOf('id');

    var pendingIds = [];
    for (var i = 0; i < dataRange.length; i++) {
      if (dataRange[i][statusIdx] === 'pending') {
        pendingIds.push(dataRange[i][idIdx]);
      }
    }

    if (pendingIds.length === 0) {
      return { success: true, message: '심사 대기 중인 신청이 없습니다.', results: [] };
    }

    var results = [];
    for (var j = 0; j < pendingIds.length; j++) {
      var reviewResult = blindReview(pendingIds[j]);
      results.push(reviewResult);

      // 심사 완료 시 상태를 'reviewed'로 변경
      if (reviewResult.success) {
        updateApplicationStatus(pendingIds[j], 'reviewed');
      }

      // API 속도 제한 방지 (1초 대기)
      if (j < pendingIds.length - 1) {
        Utilities.sleep(1000);
      }
    }

    return {
      success: true,
      message: pendingIds.length + '건의 심사가 완료되었습니다.',
      results: results
    };
  } catch (error) {
    return { success: false, error: '전체 블라인드 심사 실패: ' + error.message };
  }
}

/**
 * 심사 시스템 프롬프트 구성
 */
function buildReviewSystemPrompt() {
  return '당신은 교육 콘텐츠 베타 테스터 지원서를 평가하는 심사위원입니다.\n\n' +
    '## 중요 규칙\n' +
    '- 지원자의 개인정보는 일체 제공되지 않습니다. 오직 콘텐츠만으로 평가하세요.\n' +
    '- 공정한 블라인드 심사를 수행하세요.\n' +
    '- 반드시 지정된 JSON 형식으로 응답하세요.\n\n' +
    '## 평가 기준\n\n' +
    '### 1. 진정성 (30점)\n' +
    '- AI가 작성한 것이 아닌 진짜 개인의 경험과 생각이 담겨 있는가?\n' +
    '- 실제 교육 현장의 고민이나 경험이 반영되어 있는가?\n' +
    '- 자기만의 언어와 표현으로 작성되었는가?\n\n' +
    '### 2. 구체성 (25점)\n' +
    '- 주제가 명확하고 구체적인가?\n' +
    '- 목차가 실현 가능하고 체계적인가?\n' +
    '- 추상적 나열이 아닌 실질적 계획이 있는가?\n\n' +
    '### 3. 전문성 (25점)\n' +
    '- 해당 분야에 대한 지식이나 경험이 드러나는가?\n' +
    '- 주제에 대한 이해도가 충분한가?\n' +
    '- 교육 콘텐츠 제작에 필요한 역량이 보이는가?\n\n' +
    '### 4. 교육적 가치 (20점)\n' +
    '- 독창적이고 의미 있는 교육적 관점이 있는가?\n' +
    '- 학습자에게 실질적 도움이 될 콘텐츠인가?\n' +
    '- 기존에 없는 새로운 시도나 접근이 있는가?\n\n' +
    '## AI 생성 확률 판단\n' +
    '- 0~100% 사이로 AI가 작성했을 확률을 추정하세요.\n' +
    '- 판단 근거를 간략히 제시하세요.\n\n' +
    '## 응답 형식 (반드시 JSON)\n' +
    '```json\n' +
    '{\n' +
    '  "authenticity": 0,\n' +
    '  "specificity": 0,\n' +
    '  "expertise": 0,\n' +
    '  "educationalValue": 0,\n' +
    '  "totalScore": 0,\n' +
    '  "aiProbability": 0,\n' +
    '  "comment": "종합 심사평을 여기에 작성"\n' +
    '}\n' +
    '```\n' +
    'JSON 외의 텍스트는 포함하지 마세요.';
}

/**
 * 심사 사용자 메시지 구성 (블라인드 데이터만 포함)
 */
function buildReviewUserMessage(blindData) {
  return '다음 지원서를 블라인드 심사해주세요.\n\n' +
    '---\n\n' +
    '**지원자**: ' + blindData.id + '\n\n' +
    '**주제**: ' + blindData.topic + '\n\n' +
    '**전문 분야/경험**: ' + blindData.expertise + '\n\n' +
    '**목차 (개요)**:\n' + blindData.outline + '\n\n' +
    '**샘플 원고**:\n' + blindData.sample + '\n\n' +
    '---\n\n' +
    '위 내용을 평가 기준에 따라 심사하고, 지정된 JSON 형식으로 결과를 반환해주세요.';
}

/**
 * AI 심사 응답 파싱
 * JSON 형식의 응답에서 점수를 추출
 */
function parseReviewResponse(responseText) {
  try {
    // JSON 블록 추출 (```json ... ``` 또는 순수 JSON)
    var jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        authenticity: 0,
        specificity: 0,
        expertise: 0,
        educationalValue: 0,
        totalScore: 0,
        aiProbability: 0,
        comment: 'AI 응답 파싱 실패: JSON을 찾을 수 없습니다. 원본: ' + responseText.substring(0, 200)
      };
    }

    var parsed = JSON.parse(jsonMatch[0]);

    // 총점 자동 계산 (AI가 제공한 값과 비교)
    var calculatedTotal = (parsed.authenticity || 0) +
                          (parsed.specificity || 0) +
                          (parsed.expertise || 0) +
                          (parsed.educationalValue || 0);

    return {
      authenticity: parsed.authenticity || 0,
      specificity: parsed.specificity || 0,
      expertise: parsed.expertise || 0,
      educationalValue: parsed.educationalValue || 0,
      totalScore: calculatedTotal,
      aiProbability: parsed.aiProbability || 0,
      comment: parsed.comment || ''
    };
  } catch (error) {
    return {
      authenticity: 0,
      specificity: 0,
      expertise: 0,
      educationalValue: 0,
      totalScore: 0,
      aiProbability: 0,
      comment: 'AI 응답 파싱 오류: ' + error.message
    };
  }
}

/**
 * AI 채팅 프록시 핸들러 (관리자용)
 */
function handleChat(messages, systemPrompt) {
  try {
    var response = chatWithAI(messages, systemPrompt);
    return { success: true, response: response };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 전체 심사 결과 조회
 */
function getReviews() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('심사');

    if (!sheet) {
      return { success: false, error: '"심사" 시트를 찾을 수 없습니다.' };
    }

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return { success: true, reviews: [] };
    }

    const headers = sheet.getRange(1, 1, 1, 10).getValues()[0];
    const dataRange = sheet.getRange(2, 1, lastRow - 1, 10).getValues();

    const reviews = dataRange.map(function(row) {
      var obj = {};
      headers.forEach(function(header, i) {
        obj[header] = row[i];
      });
      return obj;
    });

    return { success: true, reviews: reviews };
  } catch (error) {
    return { success: false, error: '심사 결과 조회 실패: ' + error.message };
  }
}

// ============================================================
// 이메일 함수
// ============================================================

/**
 * 결과 이메일 발송
 * 합격/불합격 이메일을 개별 지원자에게 발송
 */
function sendResultEmail(applicationId, type) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const appSheet = ss.getSheetByName('신청');

    if (!appSheet) {
      return { success: false, error: '"신청" 시트를 찾을 수 없습니다.' };
    }

    // 지원자 데이터 조회
    const lastRow = appSheet.getLastRow();
    const headers = appSheet.getRange(1, 1, 1, 12).getValues()[0];
    const dataRange = appSheet.getRange(2, 1, lastRow - 1, 12).getValues();

    var application = null;
    var targetRow = -1;

    for (var i = 0; i < dataRange.length; i++) {
      if (dataRange[i][0] === applicationId) {
        application = {};
        headers.forEach(function(header, j) {
          application[header] = dataRange[i][j];
        });
        targetRow = i + 2;
        break;
      }
    }

    if (!application) {
      return { success: false, error: '지원자를 찾을 수 없습니다: ' + applicationId };
    }

    // 설정에서 이메일 템플릿 가져오기
    var config = getConfigInternal();
    var subject, body;

    if (type === 'accepted') {
      subject = (config['email_accepted_subject'] || '[EduFlow] 베타 테스터 선정 안내').replace('{{name}}', application.name);
      var template = config['email_accepted_body'] || getDefaultAcceptedTemplate();
      body = template.replace(/\{\{name\}\}/g, application.name)
                     .replace(/\{\{topic\}\}/g, application.topic);
    } else {
      subject = (config['email_rejected_subject'] || '[EduFlow] 베타 테스터 심사 결과 안내').replace('{{name}}', application.name);
      var template = config['email_rejected_body'] || getDefaultRejectedTemplate();
      body = template.replace(/\{\{name\}\}/g, application.name);
    }

    // 이메일 발송
    GmailApp.sendEmail(application.email, subject, '', {
      htmlBody: body,
      name: config['email_sender_name'] || 'EduFlow'
    });

    // email_sent 플래그 업데이트 (12번째 열)
    appSheet.getRange(targetRow, 12).setValue(true);

    return {
      success: true,
      message: application.name + '님에게 ' + (type === 'accepted' ? '합격' : '불합격') + ' 이메일이 발송되었습니다.'
    };
  } catch (error) {
    return { success: false, error: '이메일 발송 실패: ' + error.message };
  }
}

/**
 * 일괄 이메일 발송
 */
function sendBulkEmail(ids, type) {
  try {
    var results = [];
    for (var i = 0; i < ids.length; i++) {
      var result = sendResultEmail(ids[i], type);
      results.push(result);

      // GmailApp 속도 제한 방지
      if (i < ids.length - 1) {
        Utilities.sleep(500);
      }
    }

    var successCount = results.filter(function(r) { return r.success; }).length;
    return {
      success: true,
      message: ids.length + '건 중 ' + successCount + '건 발송 완료',
      results: results
    };
  } catch (error) {
    return { success: false, error: '일괄 이메일 발송 실패: ' + error.message };
  }
}

/**
 * 기본 합격 이메일 HTML 템플릿
 */
function getDefaultAcceptedTemplate() {
  return '<!DOCTYPE html>' +
    '<html><head><meta charset="utf-8"></head>' +
    '<body style="font-family: \'Apple SD Gothic Neo\', \'Malgun Gothic\', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">' +
    '<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; border-radius: 16px 16px 0 0; text-align: center;">' +
    '<h1 style="color: white; margin: 0; font-size: 28px;">🎉 축하합니다!</h1>' +
    '<p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 16px;">EduFlow 베타 테스터로 선정되셨습니다</p>' +
    '</div>' +
    '<div style="background: white; padding: 30px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">' +
    '<p style="font-size: 16px; color: #334155;">안녕하세요, <strong>{{name}}</strong>님!</p>' +
    '<p style="font-size: 15px; color: #475569; line-height: 1.8;">' +
    '{{name}}님의 <strong>"{{topic}}"</strong> 주제 지원서를 심사한 결과, ' +
    '베타 테스터로 선정되셨음을 알려드립니다.</p>' +
    '<p style="font-size: 15px; color: #475569; line-height: 1.8;">' +
    '곧 베타 테스트 참여 안내를 별도로 보내드리겠습니다.</p>' +
    '<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center;">' +
    '<p style="font-size: 13px; color: #94a3b8;">EduFlow - AI 교육 콘텐츠 생성 플랫폼</p>' +
    '</div></div></body></html>';
}

/**
 * 기본 불합격 이메일 HTML 템플릿
 */
function getDefaultRejectedTemplate() {
  return '<!DOCTYPE html>' +
    '<html><head><meta charset="utf-8"></head>' +
    '<body style="font-family: \'Apple SD Gothic Neo\', \'Malgun Gothic\', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">' +
    '<div style="background: linear-gradient(135deg, #64748b 0%, #475569 100%); padding: 40px 30px; border-radius: 16px 16px 0 0; text-align: center;">' +
    '<h1 style="color: white; margin: 0; font-size: 24px;">심사 결과 안내</h1>' +
    '<p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 16px;">EduFlow 베타 테스터 모집</p>' +
    '</div>' +
    '<div style="background: white; padding: 30px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">' +
    '<p style="font-size: 16px; color: #334155;">안녕하세요, <strong>{{name}}</strong>님.</p>' +
    '<p style="font-size: 15px; color: #475569; line-height: 1.8;">' +
    '먼저 EduFlow 베타 테스터에 관심을 가지고 지원해 주셔서 감사합니다.</p>' +
    '<p style="font-size: 15px; color: #475569; line-height: 1.8;">' +
    '신중한 심사 결과, 아쉽게도 이번 베타 테스트에는 함께하지 못하게 되었습니다. ' +
    '{{name}}님의 소중한 지원에 다시 한번 감사드리며, 향후 기회에 다시 만나뵐 수 있기를 바랍니다.</p>' +
    '<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center;">' +
    '<p style="font-size: 13px; color: #94a3b8;">EduFlow - AI 교육 콘텐츠 생성 플랫폼</p>' +
    '</div></div></body></html>';
}

// ============================================================
// 설정 함수
// ============================================================

/**
 * 설정 저장
 * "설정" 시트에 key-value 쌍으로 저장
 */
function saveConfig(config) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('설정');

    if (!sheet) {
      sheet = ss.insertSheet('설정');
      sheet.getRange(1, 1, 1, 2).setValues([['key', 'value']]);
    }

    // 기존 데이터 지우고 새로 쓰기 (헤더 유지)
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, 2).clearContent();
    }

    // config 객체를 key-value 행으로 변환
    var keys = Object.keys(config);
    if (keys.length > 0) {
      var rows = keys.map(function(key) {
        return [key, typeof config[key] === 'object' ? JSON.stringify(config[key]) : config[key]];
      });
      sheet.getRange(2, 1, rows.length, 2).setValues(rows);
    }

    return { success: true, message: '설정이 저장되었습니다.' };
  } catch (error) {
    return { success: false, error: '설정 저장 실패: ' + error.message };
  }
}

/**
 * 설정 조회 (공개용 - 비밀번호, API 키 제외)
 */
function getConfig() {
  try {
    var config = getConfigInternal();

    // 민감 정보 제거
    delete config['admin_password_hash'];
    delete config['ANTHROPIC_API_KEY'];

    return { success: true, config: config };
  } catch (error) {
    return { success: false, error: '설정 조회 실패: ' + error.message };
  }
}

/**
 * 내부 설정 조회 (모든 필드 포함)
 */
function getConfigInternal() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('설정');

  if (!sheet) {
    return {};
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return {};
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  var config = {};

  data.forEach(function(row) {
    if (row[0]) {
      // JSON 문자열이면 파싱 시도
      try {
        var parsed = JSON.parse(row[1]);
        config[row[0]] = parsed;
      } catch (e) {
        config[row[0]] = row[1];
      }
    }
  });

  return config;
}

// ============================================================
// 인증 헬퍼
// ============================================================

/**
 * 비밀번호 검증
 * SHA-256 해시로 비교
 */
function verifyPassword(password) {
  if (!password) return false;

  try {
    var config = getConfigInternal();
    var storedHash = config['admin_password_hash'];

    if (!storedHash) {
      // 해시가 없으면 Script Properties에서도 확인
      storedHash = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD_HASH');
    }

    if (!storedHash) return false;

    // SHA-256 해시 계산
    var inputHash = hashPassword(password);

    return inputHash === storedHash;
  } catch (error) {
    Logger.log('비밀번호 검증 오류: ' + error.message);
    return false;
  }
}

/**
 * SHA-256 해시 생성
 */
function hashPassword(password) {
  var rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  var hash = '';
  for (var i = 0; i < rawHash.length; i++) {
    var byte = rawHash[i];
    if (byte < 0) byte += 256;
    var hex = byte.toString(16);
    if (hex.length === 1) hex = '0' + hex;
    hash += hex;
  }
  return hash;
}

// ============================================================
// 초기 설정
// ============================================================

/**
 * 초기 셋업 - 수동으로 한 번 실행
 * 필요한 시트와 헤더를 생성
 */
function initialSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. "설정" 시트 생성
  var configSheet = ss.getSheetByName('설정');
  if (!configSheet) {
    configSheet = ss.insertSheet('설정');
    Logger.log('"설정" 시트 생성 완료');
  }
  configSheet.getRange(1, 1, 1, 2).setValues([['key', 'value']]);

  // 기본 설정 입력
  var defaultConfig = [
    ['form_title', 'EduFlow 베타 테스터 모집'],
    ['form_description', 'AI 기반 교육 콘텐츠 생성 플랫폼의 베타 테스터를 모집합니다.'],
    ['form_open', 'true'],
    ['form_deadline', ''],
    ['email_sender_name', 'EduFlow'],
    ['email_accepted_subject', '[EduFlow] 베타 테스터 선정 안내'],
    ['email_rejected_subject', '[EduFlow] 베타 테스터 심사 결과 안내']
  ];

  if (configSheet.getLastRow() <= 1) {
    configSheet.getRange(2, 1, defaultConfig.length, 2).setValues(defaultConfig);
  }

  // 2. "신청" 시트 생성
  var appSheet = ss.getSheetByName('신청');
  if (!appSheet) {
    appSheet = ss.insertSheet('신청');
    Logger.log('"신청" 시트 생성 완료');
  }
  var appHeaders = ['id', 'timestamp', 'name', 'email', 'school', 'subject',
                    'topic', 'expertise', 'outline', 'sample', 'status', 'email_sent'];
  appSheet.getRange(1, 1, 1, appHeaders.length).setValues([appHeaders]);

  // 열 너비 조정
  appSheet.setColumnWidth(1, 80);   // id
  appSheet.setColumnWidth(2, 160);  // timestamp
  appSheet.setColumnWidth(3, 80);   // name
  appSheet.setColumnWidth(4, 200);  // email
  appSheet.setColumnWidth(5, 120);  // school
  appSheet.setColumnWidth(6, 80);   // subject
  appSheet.setColumnWidth(7, 200);  // topic
  appSheet.setColumnWidth(8, 200);  // expertise
  appSheet.setColumnWidth(9, 300);  // outline
  appSheet.setColumnWidth(10, 300); // sample
  appSheet.setColumnWidth(11, 80);  // status
  appSheet.setColumnWidth(12, 80);  // email_sent

  // 3. "심사" 시트 생성
  var reviewSheet = ss.getSheetByName('심사');
  if (!reviewSheet) {
    reviewSheet = ss.insertSheet('심사');
    Logger.log('"심사" 시트 생성 완료');
  }
  var reviewHeaders = ['application_id', 'timestamp', 'authenticity', 'specificity',
                       'expertise', 'educational_value', 'total_score', 'ai_probability',
                       'comment', 'raw_response'];
  reviewSheet.getRange(1, 1, 1, reviewHeaders.length).setValues([reviewHeaders]);

  // 열 너비 조정
  reviewSheet.setColumnWidth(1, 100);  // application_id
  reviewSheet.setColumnWidth(2, 160);  // timestamp
  reviewSheet.setColumnWidth(9, 400);  // comment
  reviewSheet.setColumnWidth(10, 400); // raw_response

  Logger.log('초기 셋업 완료!');
  Logger.log('다음 단계:');
  Logger.log('1. Script Properties에 ANTHROPIC_API_KEY 설정');
  Logger.log('2. "설정" 시트에 admin_password_hash 추가 (또는 Script Properties에 ADMIN_PASSWORD_HASH 설정)');
  Logger.log('3. 웹 앱으로 배포 (실행 대상: 나, 액세스: 모든 사용자)');

  return '초기 셋업 완료';
}

/**
 * 관리자 비밀번호 해시 생성 헬퍼
 * 스크립트 에디터에서 직접 실행하여 해시값 확인
 * 예: setAdminPassword('mypassword123')
 */
function setAdminPassword(password) {
  var hash = hashPassword(password);
  Logger.log('비밀번호 해시: ' + hash);
  Logger.log('이 값을 "설정" 시트의 admin_password_hash 행에 입력하세요.');

  // 설정 시트에 자동 저장
  var config = getConfigInternal();
  config['admin_password_hash'] = hash;
  saveConfig(config);

  return hash;
}
