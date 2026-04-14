<script setup lang="ts">
import { Separator } from "reka-ui";
import { useTokensPage } from "../composables/use-tokens-page.ts";
import { formatDateTime, formatExpiry, formatTokenStatus } from "../stores/tokens.ts";

const {
  required,
  primaryToken,
  tokens,
  pageError,
  pageFeedback,
  pageFeedbackTone,
  busyTokenId,
  activeCount,
  revokedCount,
  expiredCount,
  createSubmitting,
  createName,
  createNeverExpires,
  createTtlHours,
  createFeedback,
  createFeedbackTone,
  ttlSubmitting,
  editingTokenName,
  ttlNeverExpires,
  ttlHours,
  ttlFeedback,
  ttlFeedbackTone,
  revealedTokenValue,
  createDialogRef,
  ttlDialogRef,
  revealDialogRef,
  openCreateDialog,
  closeCreateDialog,
  closeRevealDialog,
  submitCreate,
  openTtlDialog,
  closeTtlDialog,
  submitTtlUpdate,
  destroyToken,
  copyText,
  onCreateDialogClick,
  onTtlDialogClick,
  onRevealDialogClick,
} = useTokensPage();
</script>

<template>
  <div class="token-shell">
    <section class="token-hero">
      <div class="token-hero__copy">
        <span class="token-kicker">Gateway Token</span>
        <h1>Token 管理</h1>
        <p>在这里集中管理网关访问 Token：生成、销毁和时效控制。</p>
      </div>

      <div class="token-stats-grid">
        <article class="token-stat-card">
          <small>鉴权状态</small>
          <strong>{{ required ? "已启用" : "已关闭" }}</strong>
        </article>
        <article class="token-stat-card">
          <small>生效中</small>
          <strong>{{ activeCount }}</strong>
        </article>
        <article class="token-stat-card">
          <small>已失效/销毁</small>
          <strong>{{ expiredCount + revokedCount }}</strong>
        </article>
      </div>
    </section>

    <div v-if="pageError" class="token-feedback token-feedback--error" role="alert">
      {{ pageError }}
    </div>

    <section class="token-panel">
      <div class="section-heading">
        <div>
          <span class="section-kicker">Primary Token</span>
          <h2>默认 Token</h2>
        </div>
      </div>
      <Separator class="tokens-separator" orientation="horizontal" />
      <template v-if="primaryToken">
        <div class="token-primary-grid">
          <label class="token-field">
            <span>Token</span>
            <div class="token-field__row">
              <input
                class="token-input"
                type="text"
                :value="primaryToken.token"
                readonly
                spellcheck="false"
              />
              <button
                type="button"
                class="secondary-btn"
                @click="copyText(primaryToken.token, '默认 Token 已复制。')"
              >
                复制
              </button>
            </div>
          </label>
          <p class="token-hint">
            来源：{{ primaryToken.source || "unknown" }}
            <span v-if="primaryToken.tokenFilePath">
              · 文件：<code>{{ primaryToken.tokenFilePath }}</code>
            </span>
          </p>
        </div>
      </template>
      <p v-else class="token-hint">加载中...</p>
    </section>

    <section class="token-panel">
      <div class="section-heading">
        <div>
          <span class="section-kicker">Managed Tokens</span>
          <h2>额外 Token</h2>
        </div>
        <button type="button" class="primary-btn token-add-btn" @click="openCreateDialog">
          生成 Token
        </button>
      </div>

      <Separator class="tokens-separator" orientation="horizontal" />

      <div v-if="pageFeedback" class="token-feedback" :class="`token-feedback--${pageFeedbackTone}`">
        {{ pageFeedback }}
      </div>

      <template v-if="tokens.length === 0">
        <div class="token-empty-card">暂无额外 Token，可点击“生成 Token”。</div>
      </template>
      <template v-else>
        <div class="token-row token-row--header">
          <div>名称</div>
          <div>状态</div>
          <div>时效</div>
          <div>创建时间</div>
          <div>操作</div>
        </div>

        <div v-for="token in tokens" :key="token.id" class="token-row">
          <div class="token-row__name">
            <strong>{{ token.name }}</strong>
            <small>{{ token.tokenPreview }}</small>
            <small>最近使用：{{ formatDateTime(token.lastUsedAt) }}</small>
          </div>
          <div>
            <span class="status-badge" :class="`status-badge--${token.status}`">
              {{ formatTokenStatus(token.status) }}
            </span>
          </div>
          <div class="token-row__meta">{{ formatExpiry(token) }}</div>
          <div class="token-row__meta">{{ formatDateTime(token.createdAt) }}</div>
          <div class="token-row__actions">
            <button
              type="button"
              class="secondary-btn token-action-btn"
              :disabled="busyTokenId === token.id || token.status === 'revoked'"
              @click="openTtlDialog(token)"
            >
              调整时效
            </button>
            <button
              type="button"
              class="secondary-btn token-action-btn token-action-btn--danger"
              :disabled="busyTokenId === token.id || token.status === 'revoked'"
              @click="destroyToken(token)"
            >
              {{ busyTokenId === token.id ? "处理中..." : "销毁" }}
            </button>
          </div>
        </div>
      </template>
    </section>

    <dialog ref="createDialogRef" class="help-dialog token-dialog" @click="onCreateDialogClick">
      <div class="dialog-body">
        <div class="dialog-header">
          <div>
            <p class="dialog-kicker">Managed Token</p>
            <h2>生成 Token</h2>
          </div>
          <button type="button" class="dialog-close" aria-label="关闭" @click="closeCreateDialog">
            ×
          </button>
        </div>

        <form class="token-form" @submit.prevent="submitCreate">
          <label class="token-form-field">
            <span>名称（可选）</span>
            <input v-model="createName" class="token-input" type="text" spellcheck="false" />
          </label>

          <label class="token-checkbox-row">
            <input v-model="createNeverExpires" type="checkbox" />
            <span>永不过期</span>
          </label>

          <label v-if="!createNeverExpires" class="token-form-field">
            <span>有效时长（小时）</span>
            <input
              v-model="createTtlHours"
              class="token-input"
              type="number"
              min="1"
              step="1"
            />
          </label>

          <div
            v-if="createFeedback"
            class="token-feedback"
            :class="`token-feedback--${createFeedbackTone}`"
          >
            {{ createFeedback }}
          </div>

          <div class="token-form-footer">
            <button type="button" class="secondary-btn" :disabled="createSubmitting" @click="closeCreateDialog">
              取消
            </button>
            <button type="submit" class="primary-btn" :disabled="createSubmitting">
              {{ createSubmitting ? "生成中..." : "生成" }}
            </button>
          </div>
        </form>
      </div>
    </dialog>

    <dialog ref="ttlDialogRef" class="help-dialog token-dialog" @click="onTtlDialogClick">
      <div class="dialog-body">
        <div class="dialog-header">
          <div>
            <p class="dialog-kicker">Managed Token</p>
            <h2>调整时效</h2>
          </div>
          <button type="button" class="dialog-close" aria-label="关闭" @click="closeTtlDialog">×</button>
        </div>

        <form class="token-form" @submit.prevent="submitTtlUpdate">
          <p class="token-hint">当前 Token：{{ editingTokenName }}</p>

          <label class="token-checkbox-row">
            <input v-model="ttlNeverExpires" type="checkbox" />
            <span>永不过期</span>
          </label>

          <label v-if="!ttlNeverExpires" class="token-form-field">
            <span>新的有效时长（小时）</span>
            <input v-model="ttlHours" class="token-input" type="number" min="1" step="1" />
          </label>

          <div v-if="ttlFeedback" class="token-feedback" :class="`token-feedback--${ttlFeedbackTone}`">
            {{ ttlFeedback }}
          </div>

          <div class="token-form-footer">
            <button type="button" class="secondary-btn" :disabled="ttlSubmitting" @click="closeTtlDialog">
              取消
            </button>
            <button type="submit" class="primary-btn" :disabled="ttlSubmitting">
              {{ ttlSubmitting ? "保存中..." : "保存" }}
            </button>
          </div>
        </form>
      </div>
    </dialog>

    <dialog ref="revealDialogRef" class="help-dialog token-dialog" @click="onRevealDialogClick">
      <div class="dialog-body">
        <div class="dialog-header">
          <div>
            <p class="dialog-kicker">Managed Token</p>
            <h2>新 Token（仅展示一次）</h2>
          </div>
          <button type="button" class="dialog-close" aria-label="关闭" @click="closeRevealDialog">×</button>
        </div>

        <label class="token-form-field">
          <span>请立即保存</span>
          <div class="token-field__row">
            <input
              class="token-input"
              type="text"
              :value="revealedTokenValue"
              readonly
              spellcheck="false"
            />
            <button
              type="button"
              class="secondary-btn"
              @click="copyText(revealedTokenValue, '新 Token 已复制。')"
            >
              复制
            </button>
          </div>
        </label>

      </div>
    </dialog>
  </div>
</template>

<style scoped>
.token-shell {
  max-width: 1220px;
  margin: 0 auto;
  display: grid;
  gap: 22px;
}

.token-hero,
.token-panel {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 30px;
  background: rgba(255, 253, 248, 0.82);
  box-shadow: var(--shadow);
  backdrop-filter: blur(16px);
}

.token-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
  gap: 24px;
  padding: 28px;
}

.token-panel {
  padding: 24px;
}

.token-hero::before,
.token-panel::before {
  content: "";
  position: absolute;
  inset: auto auto -72px -48px;
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(216, 109, 57, 0.12), transparent 70%);
  pointer-events: none;
}

.token-hero__copy,
.token-stats-grid,
.token-panel {
  position: relative;
  z-index: 1;
}

.token-kicker,
.section-kicker {
  display: inline-flex;
  align-items: center;
  color: var(--accent-strong);
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.token-hero__copy h1 {
  margin-top: 12px;
  font-family: var(--font-heading);
  font-size: clamp(2.2rem, 4vw, 3.6rem);
  line-height: 0.95;
}

.token-hero__copy p,
.token-hint {
  color: var(--muted);
}

.token-hero__copy p {
  margin-top: 16px;
}

.token-stats-grid {
  display: grid;
  gap: 12px;
}

.token-stat-card {
  padding: 14px 16px;
  border: 1px solid rgba(20, 33, 61, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.74);
  display: grid;
  gap: 4px;
}

.token-stat-card small {
  color: var(--muted);
  font-size: 0.84rem;
}

.token-stat-card strong {
  font-family: var(--font-heading);
  font-size: 1.5rem;
}

.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 16px;
}

.section-heading h2 {
  margin-top: 8px;
  font-family: var(--font-heading);
  font-size: 1.7rem;
}

.tokens-separator {
  margin: 0 0 16px;
  background: rgba(20, 33, 61, 0.1);
  height: 1px;
}

.token-primary-grid {
  display: grid;
  gap: 10px;
}

.token-field {
  display: grid;
  gap: 8px;
}

.token-field__row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.token-input {
  width: 100%;
  min-height: 46px;
  padding: 10px 12px;
  border: 1px solid rgba(20, 33, 61, 0.12);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--ink);
}

.token-input:focus {
  outline: none;
  border-color: rgba(216, 109, 57, 0.34);
  box-shadow: 0 0 0 4px rgba(216, 109, 57, 0.08);
}

.token-row {
  display: grid;
  grid-template-columns:
    minmax(180px, 1.15fr)
    minmax(100px, 0.65fr)
    minmax(150px, 0.9fr)
    minmax(170px, 1fr)
    minmax(180px, auto);
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  border: 1px solid rgba(20, 33, 61, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.74);
}

.token-row + .token-row {
  margin-top: 10px;
}

.token-row--header {
  color: var(--muted);
  font-size: 0.84rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.token-row--header + .token-row {
  margin-top: 10px;
}

.token-row__name {
  display: grid;
  gap: 4px;
}

.token-row__name strong {
  font-family: var(--font-heading);
}

.token-row__name small,
.token-row__meta {
  color: var(--muted);
  font-size: 0.84rem;
}

.token-row__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.status-badge {
  display: inline-flex;
  width: fit-content;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.status-badge--active {
  background: rgba(15, 123, 108, 0.12);
  color: #0f7b6c;
}

.status-badge--expired {
  background: rgba(216, 109, 57, 0.12);
  color: #b94d1d;
}

.status-badge--revoked {
  background: rgba(170, 61, 55, 0.12);
  color: #aa3d37;
}

.token-empty-card {
  padding: 22px;
  border: 1px dashed rgba(20, 33, 61, 0.16);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.56);
  color: var(--muted);
}

.primary-btn {
  padding: 14px 18px;
  border: 0;
  border-radius: 16px;
  background: linear-gradient(135deg, #d86d39 0%, #b94d1d 100%);
  color: #fff8f4;
  font-family: var(--font-heading);
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 14px 28px rgba(185, 77, 29, 0.28);
}

.primary-btn:disabled {
  opacity: 0.56;
  cursor: not-allowed;
  box-shadow: none;
}

.secondary-btn {
  padding: 12px 16px;
  border: 1px solid rgba(20, 33, 61, 0.12);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.75);
  color: var(--ink);
  font-weight: 700;
  cursor: pointer;
}

.secondary-btn:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}

.token-action-btn {
  min-width: 84px;
  padding: 9px 12px;
}

.token-action-btn--danger {
  border-color: rgba(170, 61, 55, 0.24);
  color: var(--critical);
}

.token-add-btn {
  min-width: 120px;
}

.token-feedback {
  padding: 12px 14px;
  border-radius: 16px;
  font-size: 0.94rem;
  font-weight: 700;
}

.token-feedback--success {
  background: var(--success-soft);
  color: var(--success);
}

.token-feedback--error {
  background: var(--critical-soft);
  color: var(--critical);
}

.help-dialog {
  width: min(92vw, 620px);
  padding: 0;
  border: 1px solid rgba(20, 33, 61, 0.08);
  border-radius: 24px;
  background: #fffdfa;
  box-shadow: 0 30px 80px rgba(10, 23, 48, 0.2);
}

.help-dialog::backdrop {
  background: rgba(10, 23, 48, 0.4);
  backdrop-filter: blur(6px);
}

.dialog-body {
  padding: 24px;
}

.dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.dialog-kicker {
  color: var(--accent-strong);
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.dialog-header h2 {
  margin-top: 8px;
  font-family: var(--font-heading);
  font-size: 1.55rem;
}

.dialog-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(20, 33, 61, 0.08);
  color: var(--ink);
  cursor: pointer;
}

.token-form {
  display: grid;
  gap: 14px;
}

.token-form-field {
  display: grid;
  gap: 8px;
  font-weight: 700;
}

.token-checkbox-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
}

.token-form-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 980px) {
  .token-hero {
    grid-template-columns: 1fr;
    padding: 20px;
  }

  .section-heading {
    flex-direction: column;
    align-items: stretch;
  }

  .token-add-btn {
    width: 100%;
  }

  .token-row {
    grid-template-columns: 1fr;
  }

  .token-row__actions {
    justify-content: flex-start;
  }

  .token-field__row,
  .token-form-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .token-field__row .secondary-btn,
  .token-form-footer .secondary-btn,
  .token-form-footer .primary-btn {
    width: 100%;
  }
}
</style>
