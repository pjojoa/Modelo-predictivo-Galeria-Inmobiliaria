/**
 * GeoMapvalChatWidget - Versión Vanilla JavaScript
 * 
 * Widget de chat flotante para GeoMapval
 * Se posiciona al lado del botón informativo en el header
 * 
 * INTEGRACIÓN:
 * 1. Incluye este script en tu HTML: <script src="/static/js/geomapval-chat.js"></script>
 * 2. Inicializa el widget: new GeoMapvalChatWidget({ onSendMessage: tuFuncion })
 * 
 * CONEXIÓN CON BACKEND:
 * const chatWidget = new GeoMapvalChatWidget({
 *   onSendMessage: async (message) => {
 *     const response = await fetch('/api/chat', {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify({ message })
 *     });
 *     const data = await response.json();
 *     return data.response;
 *   }
 * });
 */

class GeoMapvalChatWidget {
  constructor(options = {}) {
    this.isOpen = false;
    this.messages = [];
    this.isTyping = false;
    this.isSending = false;
    this.onSendMessage = options.onSendMessage || null;
    this.initialMessages = options.initialMessages || [
      {
        id: '1',
        from: 'assistant',
        text: '¡Hola! Soy el asistente de GeoMapval. Puedo ayudarte a analizar proyectos y datos geoespaciales.',
        timestamp: new Date(),
      },
    ];

    // Log para debug
    console.log('[GeoMapval Chat] Widget inicializado');
    console.log('[GeoMapval Chat] onSendMessage configurado:', !!this.onSendMessage);
    console.log('[GeoMapval Chat] Tipo de onSendMessage:', typeof this.onSendMessage);

    this.init();
  }

  init() {
    this.createWidget();
    this.attachEventListeners();
    this.messages = [...this.initialMessages];
    this.renderMessages();
  }

  createWidget() {
    // Crear contenedor del botón
    const buttonContainer = document.createElement('div');
    buttonContainer.id = 'geomapval-chat-button-container';
    buttonContainer.className = 'geomapval-chat-button-container';

    // Crear botón flotante con ícono de robot sofisticado
    const button = document.createElement('button');
    button.id = 'geomapval-chat-button';
    button.className = 'geomapval-chat-button';
    button.setAttribute('aria-label', 'Abrir chat de GeoMapval');
    button.innerHTML = `
      <i class="fas fa-robot geomapval-chat-robot-icon"></i>
      <div class="geomapval-chat-robot-glow"></div>
    `;

    buttonContainer.appendChild(button);

    // Crear panel de chat
    const panel = document.createElement('div');
    panel.id = 'geomapval-chat-panel';
    panel.className = 'geomapval-chat-panel';
    panel.innerHTML = `
      <div class="geomapval-chat-header">
        <div class="geomapval-chat-header-content">
          <svg class="geomapval-chat-header-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <div class="geomapval-chat-header-text">
            <h3>GeoMapval Assistant</h3>
            <p>Chat de análisis GeoMapval</p>
          </div>
        </div>
        <div class="geomapval-chat-header-actions">
          <div class="geomapval-chat-status">
            <span class="geomapval-chat-status-dot"></span>
            <span>En línea</span>
          </div>
          <button class="geomapval-chat-close" aria-label="Cerrar chat">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="geomapval-chat-messages" id="geomapval-chat-messages">
        <!-- Mensajes se renderizan aquí -->
      </div>
      <div class="geomapval-chat-input-area">
        <div class="geomapval-chat-input-wrapper">
          <textarea 
            id="geomapval-chat-input" 
            class="geomapval-chat-input" 
            placeholder="Escribe tu mensaje sobre GeoMapval…"
            rows="1"
          ></textarea>
          <button id="geomapval-chat-send" class="geomapval-chat-send" aria-label="Enviar mensaje">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
        <p class="geomapval-chat-hint">
          Presiona <kbd>Enter</kbd> para enviar, <kbd>Shift + Enter</kbd> para nueva línea
        </p>
      </div>
    `;

    // Insertar después del botón informativo
    const infoBtn = document.getElementById('info-classification-btn');
    if (infoBtn && infoBtn.parentElement) {
      infoBtn.parentElement.insertBefore(buttonContainer, infoBtn.nextSibling);
    } else {
      // Fallback: insertar en el header
      const header = document.querySelector('.main-header');
      if (header) {
        header.appendChild(buttonContainer);
      }
    }

    // Insertar panel en el body
    document.body.appendChild(panel);
  }

  attachEventListeners() {
    const button = document.getElementById('geomapval-chat-button');
    const closeBtn = document.querySelector('.geomapval-chat-close');
    const sendBtn = document.getElementById('geomapval-chat-send');
    const input = document.getElementById('geomapval-chat-input');

    if (button) {
      button.addEventListener('click', () => this.toggleChat());
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeChat());
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', () => this.sendMessage());
    }

    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });

      input.addEventListener('input', (e) => {
        this.adjustTextareaHeight(e.target);
        this.updateSendButton();
      });
    }
  }

  toggleChat() {
    this.isOpen = !this.isOpen;
    const panel = document.getElementById('geomapval-chat-panel');
    const button = document.getElementById('geomapval-chat-button');

    if (panel && button) {
      if (this.isOpen) {
        panel.classList.add('open');
        button.classList.add('active');
        // Cambiar ícono cuando está abierto
        const robotIcon = button.querySelector('.geomapval-chat-robot-icon');
        if (robotIcon) {
          robotIcon.classList.remove('fa-robot');
          robotIcon.classList.add('fa-times');
        }
        setTimeout(() => {
          const input = document.getElementById('geomapval-chat-input');
          if (input) input.focus();
        }, 300);
      } else {
        panel.classList.remove('open');
        button.classList.remove('active');
        // Restaurar ícono de robot cuando está cerrado
        const closeIcon = button.querySelector('.fa-times');
        if (closeIcon) {
          closeIcon.classList.remove('fa-times');
          closeIcon.classList.add('fa-robot');
        }
      }
    }
  }

  closeChat() {
    this.isOpen = false;
    const panel = document.getElementById('geomapval-chat-panel');
    const button = document.getElementById('geomapval-chat-button');

    if (panel) panel.classList.remove('open');
    if (button) button.classList.remove('active');
  }

  async sendMessage() {
    const input = document.getElementById('geomapval-chat-input');
    if (!input || !input.value.trim() || this.isSending) return;

    const messageText = input.value.trim();
    input.value = '';
    this.adjustTextareaHeight(input);
    this.updateSendButton();

    // Agregar mensaje del usuario
    const userMessage = {
      id: Date.now().toString(),
      from: 'user',
      text: messageText,
      timestamp: new Date(),
    };

    this.messages.push(userMessage);
    this.renderMessages();
    this.showTyping();

    this.isSending = true;
    this.updateSendButton();

    try {
      let responseText;

      // Verificar que onSendMessage esté configurado y sea una función
      if (this.onSendMessage && typeof this.onSendMessage === 'function') {
        console.log('[GeoMapval Chat] Llamando a onSendMessage con:', messageText);
        responseText = await this.onSendMessage(messageText);
        console.log('[GeoMapval Chat] Respuesta recibida del backend');
      } else {
        console.error('[GeoMapval Chat] ERROR: onSendMessage no está configurado correctamente');
        console.error('[GeoMapval Chat] Tipo de onSendMessage:', typeof this.onSendMessage);
        console.error('[GeoMapval Chat] Valor:', this.onSendMessage);
        // Respuesta de error más clara
        await new Promise((resolve) => setTimeout(resolve, 1000));
        responseText = 'Error: El chat no está conectado al backend. Por favor, recarga la página o contacta al administrador.';
      }

      const assistantMessage = {
        id: (Date.now() + 1).toString(),
        from: 'assistant',
        text: responseText,
        timestamp: new Date(),
      };

      this.messages.push(assistantMessage);
      this.hideTyping();
      this.renderMessages();
    } catch (error) {
      console.error('Error al enviar mensaje:', error);
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        from: 'assistant',
        text: 'Lo siento, hubo un error al procesar tu mensaje. Por favor, intenta nuevamente.',
        timestamp: new Date(),
      };
      this.messages.push(errorMessage);
      this.hideTyping();
      this.renderMessages();
    } finally {
      this.isSending = false;
      this.updateSendButton();
    }
  }

  showTyping() {
    this.isTyping = true;
    const messagesContainer = document.getElementById('geomapval-chat-messages');
    if (messagesContainer) {
      const typingEl = document.createElement('div');
      typingEl.className = 'geomapval-chat-message typing';
      typingEl.innerHTML = `
        <div class="geomapval-chat-bubble assistant">
          <div class="geomapval-chat-typing">
            <span>Escribiendo</span>
            <div class="geomapval-chat-dots">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>
      `;
      messagesContainer.appendChild(typingEl);
      this.scrollToBottom();
    }
  }

  hideTyping() {
    this.isTyping = false;
    const messagesContainer = document.getElementById('geomapval-chat-messages');
    if (messagesContainer) {
      const typingEl = messagesContainer.querySelector('.typing');
      if (typingEl) typingEl.remove();
    }
  }

  renderMessages() {
    const messagesContainer = document.getElementById('geomapval-chat-messages');
    if (!messagesContainer) return;

    // Remover mensajes existentes (excepto typing)
    const existingMessages = messagesContainer.querySelectorAll('.geomapval-chat-message:not(.typing)');
    existingMessages.forEach((msg) => msg.remove());

    // Renderizar mensajes
    this.messages.forEach((message) => {
      const messageEl = document.createElement('div');
      messageEl.className = `geomapval-chat-message ${message.from}`;
      messageEl.innerHTML = `
        <div class="geomapval-chat-bubble ${message.from}">
          <p>${this.escapeHtml(message.text)}</p>
          <span class="geomapval-chat-time">${this.formatTime(message.timestamp)}</span>
        </div>
      `;
      messagesContainer.appendChild(messageEl);
    });

    this.scrollToBottom();
  }

  scrollToBottom() {
    const messagesContainer = document.getElementById('geomapval-chat-messages');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  formatTime(date) {
    return date.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  adjustTextareaHeight(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
  }

  updateSendButton() {
    const input = document.getElementById('geomapval-chat-input');
    const sendBtn = document.getElementById('geomapval-chat-send');
    if (input && sendBtn) {
      const hasText = input.value.trim().length > 0;
      sendBtn.disabled = !hasText || this.isSending;
      sendBtn.classList.toggle('disabled', !hasText || this.isSending);
    }
  }
}

// NO auto-inicializar aquí - se inicializará desde el HTML con la configuración correcta
// El widget se inicializará desde templates/index.html con onSendMessage configurado

