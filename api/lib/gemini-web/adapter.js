import { GeminiTestError } from './errors.js';
import { parseGeminiResponse } from './parse-response.js';
import { loadBootstrap } from './bootstrap.js';
import { sendExperimentalRequest } from './experimental-request.js';

// Bootstrap mappings are verified. Generation state remains unverified.
// One adapter belongs to exactly one request. Never cache instances or credentials.
export class GeminiWebAdapter {
  #session;
  #tokens;

  constructor(session) {
    this.#session = session;
  }

  get isInitialized() {
    return this.#tokens !== undefined;
  }

  async initialize() {
    this.validateSession();
    await this.refreshPageTokens();
  }

  validateSession() {
    // Syntax validation only; this does not establish a signed-in Gemini session.
    if (typeof this.#session !== 'string' || this.#session.length > 16384 ||
        !this.#session.trim() || /[\r\n\0]/.test(this.#session) || !this.#session.includes('=')) {
      throw new GeminiTestError('INVALID_SESSION', 400);
    }
  }

  async refreshPageTokens() {
    this.validateSession();
    this.#tokens = undefined;
    this.#tokens = await loadBootstrap(this.#session);
  }

  assertGenerationSupported() {
    // Missing origins for captured payload slots 3, 4 and 59, and request headers.
    // Never replay captured opaque state across users or invent replacements.
    throw new GeminiTestError('GEMINI_PROTOCOL_CHANGED', 501);
  }

  async createConversation() {
    throw new GeminiTestError('GEMINI_PROTOCOL_CHANGED', 501);
  }

  async sendTextPrompt(prompt, { omitBotGuard = false } = {}) {
    if (!omitBotGuard) this.assertGenerationSupported();
    if (!this.#tokens) throw new GeminiTestError('GEMINI_BOOTSTRAP_FAILED');
    const response = await sendExperimentalRequest(this.#session, prompt, this.#tokens);
    try { return this.parseResponse(response.raw); }
    catch (error) {
      if (error instanceof GeminiTestError) error.upstreamStatus = response.status;
      throw error;
    }
  }

  async uploadFile() {
    throw new GeminiTestError('VIDEO_UPLOAD_FAILED', 501);
  }

  async sendPromptWithFiles() {
    throw new GeminiTestError('GEMINI_PROTOCOL_CHANGED', 501);
  }

  parseResponse(raw) {
    return parseGeminiResponse(raw);
  }

  detectSessionExpired() {
    // Unknown until the upstream authentication failure format is observed.
    return null;
  }

  dispose() {
    this.#session = undefined;
    this.#tokens = undefined;
  }
}
