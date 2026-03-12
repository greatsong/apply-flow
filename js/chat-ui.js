/**
 * ChatUI — 공용 채팅 인터페이스 컴포넌트
 * 신청 페이지와 관리자 페이지에서 공통으로 사용
 */
class ChatUI {
  constructor(container, options = {}) {
    this.container = typeof container === 'string'
      ? document.querySelector(container)
      : container;
    this.options = {
      aiName: 'ApplyFlow',
      aiAvatar: '🤖',
      userAvatar: '👤',
      typingDelay: 400,
      charDelay: 15,
      ...options
    };
    this.messages = [];
  }

  /**
   * AI 메시지 추가 (타이핑 애니메이션 포함)
   */
  async addAIMessage(text, options = {}) {
    const { animate = true, delay = this.options.typingDelay } = options;

    // 타이핑 인디케이터 표시
    if (animate) {
      const typingEl = this._createTypingIndicator();
      this.container.appendChild(typingEl);
      this._scrollToBottom();
      await this._wait(delay);
      typingEl.remove();
    }

    const messageEl = this._createMessage('ai', text);
    this.container.appendChild(messageEl);
    this.messages.push({ role: 'ai', content: text });
    this._scrollToBottom();

    return messageEl;
  }

  /**
   * 사용자 메시지 추가
   */
  addUserMessage(text) {
    const messageEl = this._createMessage('user', text);
    this.container.appendChild(messageEl);
    this.messages.push({ role: 'user', content: text });
    this._scrollToBottom();
    return messageEl;
  }

  /**
   * 사용자 응답 요약 버블 추가 (여러 필드)
   */
  addUserSummaryBubble(fields) {
    const wrapper = document.createElement('div');
    wrapper.className = 'message user';

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = this.options.userAvatar;

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    const lines = fields.map(f => `<strong>${f.label}:</strong> ${this._escapeHtml(f.value)}`);
    bubble.innerHTML = lines.join('<br>');

    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);
    this.container.appendChild(wrapper);
    this._scrollToBottom();

    const summary = fields.map(f => `${f.label}: ${f.value}`).join(', ');
    this.messages.push({ role: 'user', content: summary });

    return wrapper;
  }

  /**
   * 커스텀 HTML 요소 채팅 영역에 추가
   */
  addCustomElement(element) {
    this.container.appendChild(element);
    this._scrollToBottom();
  }

  /**
   * 모든 메시지 지우기
   */
  clear() {
    this.container.innerHTML = '';
    this.messages = [];
  }

  /**
   * 채팅 영역 하단으로 스크롤
   */
  _scrollToBottom() {
    requestAnimationFrame(() => {
      this.container.scrollTop = this.container.scrollHeight;
    });
  }

  /**
   * 메시지 DOM 요소 생성
   */
  _createMessage(role, text) {
    const wrapper = document.createElement('div');
    wrapper.className = `message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = role === 'ai' ? this.options.aiAvatar : this.options.userAvatar;

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = this._formatText(text);

    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);

    return wrapper;
  }

  /**
   * 타이핑 인디케이터 생성
   */
  _createTypingIndicator() {
    const wrapper = document.createElement('div');
    wrapper.className = 'message ai';

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = this.options.aiAvatar;

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = `
      <div class="typing-indicator">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>
    `;

    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);

    return wrapper;
  }

  /**
   * 텍스트 포맷팅 (줄바꿈, 볼드 등)
   */
  _formatText(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  /**
   * HTML 이스케이프
   */
  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Promise 기반 대기
   */
  _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 전역 내보내기
window.ChatUI = ChatUI;
