<script setup lang="ts">
import { onMounted, ref } from "vue";
import { renderPlusPage } from "../legacy/plus-render.ts";

const containerRef = ref<HTMLElement | null>(null);

onMounted(() => {
  if (!containerRef.value) {
    throw new Error("Plus root not found.");
  }

  renderPlusPage(containerRef.value);
});
</script>

<template>
  <div ref="containerRef" class="plus-page-root"></div>
</template>

<style>
.plus-page-root .page-shell {
  max-width: 1220px;
  margin: 0 auto;
}

.plus-page-root .plan-content {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.18fr) minmax(320px, 0.82fr);
  gap: 28px;
  padding: 28px;
  border: 1px solid var(--line);
  border-radius: 32px;
  background: var(--panel);
  box-shadow: var(--shadow);
  backdrop-filter: blur(18px);
  overflow: hidden;
}

.plus-page-root .plan-content::before {
  content: "";
  position: absolute;
  inset: -20% auto auto -8%;
  width: 320px;
  height: 320px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(216, 109, 57, 0.17), transparent 68%);
  pointer-events: none;
}

.plus-page-root .plan-main,
.plus-page-root .hero-right {
  position: relative;
  z-index: 1;
}

.plus-page-root .plan-main {
  padding: 8px;
}

.plus-page-root .badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border: 1px solid rgba(216, 109, 57, 0.18);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  color: var(--accent-strong);
  font-size: 0.92rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.plus-page-root .plan-content h1 {
  margin-top: 18px;
  font-family: var(--font-heading);
  font-size: clamp(2.5rem, 5vw, 4.6rem);
  line-height: 0.98;
  letter-spacing: -0.05em;
}

.plus-page-root .hero-subtitle {
  max-width: 44rem;
  margin-top: 18px;
  color: var(--muted);
  font-size: 1.06rem;
}

.plus-page-root .stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 34px;
}

.plus-page-root .stat {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 18px 20px;
  border: 1px solid rgba(20, 33, 61, 0.08);
  border-radius: 22px;
  background: rgba(255, 253, 250, 0.9);
  box-shadow: 0 10px 30px rgba(20, 33, 61, 0.05);
}

.plus-page-root .stat strong {
  font-family: var(--font-heading);
  font-size: 1.45rem;
  line-height: 1.1;
}

.plus-page-root .stat span {
  color: var(--muted);
  font-size: 0.95rem;
}

.plus-page-root .stat-price-wrap strong {
  color: var(--accent-strong);
}

.plus-page-root .stat-title-with-help {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.plus-page-root .help-icon,
.plus-page-root .dialog-close {
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
  transition:
    transform 180ms ease,
    background-color 180ms ease;
}

.plus-page-root .help-icon:hover,
.plus-page-root .field-label-help:hover,
.plus-page-root .dialog-close:hover {
  transform: translateY(-1px);
}

.plus-page-root .cta-card {
  margin-top: 28px;
  padding: 24px;
  border: 1px solid rgba(20, 33, 61, 0.08);
  border-radius: 28px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.84), rgba(255, 251, 245, 0.96)),
    var(--panel-solid);
  box-shadow: 0 20px 60px rgba(20, 33, 61, 0.08);
}

.plus-page-root #plusPreorderForm {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.plus-page-root .plus-session-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.plus-page-root .field-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  font-weight: 700;
}

.plus-page-root .field-label-help {
  padding: 0;
  border: 0;
  background: none;
  color: var(--accent-strong);
  font-size: 0.96rem;
  font-weight: 700;
  cursor: pointer;
}

.plus-page-root .plus-session-textarea {
  width: 100%;
  min-height: 118px;
  padding: 16px 18px;
  border: 1px solid rgba(20, 33, 61, 0.14);
  border-radius: 20px;
  background: #fffdfa;
  color: var(--ink);
  resize: vertical;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease;
}

.plus-page-root .plus-session-textarea::placeholder {
  color: #8d93a1;
}

.plus-page-root .plus-session-textarea:focus {
  outline: none;
  border-color: rgba(216, 109, 57, 0.45);
  box-shadow: 0 0 0 4px rgba(216, 109, 57, 0.12);
}

.plus-page-root .plus-session-wrap.is-valid .plus-session-textarea {
  border-color: rgba(15, 123, 108, 0.35);
  box-shadow: 0 0 0 4px rgba(15, 123, 108, 0.1);
}

.plus-page-root .plus-session-wrap.is-invalid .plus-session-textarea {
  border-color: rgba(185, 77, 29, 0.35);
  box-shadow: 0 0 0 4px rgba(185, 77, 29, 0.08);
}

.plus-page-root .plus-session-hint {
  min-height: 24px;
  color: var(--accent-strong);
  font-size: 0.94rem;
}

.plus-page-root .plus-session-info {
  display: none;
  gap: 14px;
  align-items: flex-start;
  padding: 14px 16px;
  border-radius: 18px;
  background: var(--success-soft);
  color: var(--success);
}

.plus-page-root .plus-session-info.is-visible {
  display: flex;
}

.plus-page-root .plus-session-info__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(15, 123, 108, 0.12);
  font-weight: 800;
}

.plus-page-root .plus-session-info__email {
  font-weight: 800;
  word-break: break-all;
}

.plus-page-root .plus-session-info__status {
  margin-top: 2px;
  font-size: 0.94rem;
}

.plus-page-root .primary-btn {
  width: 100%;
  padding: 16px 20px;
  border: 0;
  border-radius: 18px;
  background: linear-gradient(135deg, #d86d39 0%, #b94d1d 100%);
  color: #fff8f4;
  font-family: var(--font-heading);
  font-size: 1.04rem;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 16px 34px rgba(185, 77, 29, 0.28);
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    opacity 180ms ease;
}

.plus-page-root .primary-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 20px 42px rgba(185, 77, 29, 0.32);
}

.plus-page-root .primary-btn:disabled {
  opacity: 0.56;
  cursor: not-allowed;
  box-shadow: none;
}

.plus-page-root .form-note {
  color: var(--muted);
  font-size: 0.94rem;
}

.plus-page-root .hero-right {
  display: flex;
  min-height: 100%;
}

.plus-page-root .hero-card {
  position: relative;
  width: 100%;
  padding: 30px;
  border-radius: 28px;
  background:
    radial-gradient(circle at top right, rgba(247, 197, 107, 0.18), transparent 30%),
    linear-gradient(180deg, var(--card) 0%, var(--card-strong) 100%);
  color: var(--card-text);
  overflow: hidden;
}

.plus-page-root .hero-card::after {
  content: "";
  position: absolute;
  inset: auto -48px -64px auto;
  width: 210px;
  height: 210px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(216, 109, 57, 0.2), transparent 64%);
  pointer-events: none;
}

.plus-page-root .hero-card__eyebrow {
  color: rgba(246, 239, 230, 0.72);
  font-size: 0.94rem;
}

.plus-page-root .hero-card h3 {
  margin-top: 10px;
  font-family: var(--font-heading);
  font-size: 2rem;
  line-height: 1.05;
}

.plus-page-root .price {
  margin-top: 14px;
  font-family: var(--font-heading);
  font-size: 2.7rem;
  line-height: 1;
}

.plus-page-root .period {
  color: rgba(246, 239, 230, 0.7);
  font-size: 1rem;
  font-weight: 500;
}

.plus-page-root .feature-stack {
  display: grid;
  gap: 12px;
  padding: 0;
  margin: 30px 0 0;
  list-style: none;
}

.plus-page-root .feature-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid var(--card-line);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(8px);
}

.plus-page-root .feature-item span {
  font-size: 0.98rem;
}

.plus-page-root .feature-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 42px;
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  color: #f9f2e8;
}

.plus-page-root .feature-icon svg {
  width: 20px;
  height: 20px;
}

.plus-page-root .help-dialog {
  width: min(92vw, 540px);
  padding: 0;
  border: 1px solid rgba(20, 33, 61, 0.08);
  border-radius: 24px;
  background: #fffdfa;
  box-shadow: 0 30px 80px rgba(10, 23, 48, 0.2);
}

.plus-page-root .help-dialog::backdrop {
  background: rgba(10, 23, 48, 0.4);
  backdrop-filter: blur(6px);
}

.plus-page-root .dialog-body {
  padding: 24px;
}

.plus-page-root .dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.plus-page-root .dialog-kicker {
  color: var(--accent-strong);
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.plus-page-root .dialog-header h2 {
  margin-top: 8px;
  font-family: var(--font-heading);
  font-size: 1.55rem;
}

.plus-page-root .dialog-close {
  flex: 0 0 auto;
  font-size: 1.2rem;
}

.plus-page-root .dialog-list,
.plus-page-root .dialog-copy {
  margin-top: 18px;
  color: var(--muted);
}

.plus-page-root .dialog-list {
  padding-left: 20px;
}

.plus-page-root .dialog-list li + li {
  margin-top: 10px;
}

.plus-page-root .toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  z-index: 20;
  max-width: min(90vw, 640px);
  padding: 14px 18px;
  border-radius: 999px;
  background: rgba(10, 23, 48, 0.92);
  color: #fffaf4;
  box-shadow: 0 20px 48px rgba(10, 23, 48, 0.22);
  transform: translate(-50%, 0);
  opacity: 1;
  transition:
    transform 180ms ease,
    opacity 180ms ease;
}

.plus-page-root .toast[data-tone="success"] {
  background: rgba(15, 123, 108, 0.96);
}

.plus-page-root .toast.hidden {
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, 14px);
}

@media (max-width: 1080px) {
  .plus-page-root .plan-content {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .plus-page-root .plan-content {
    gap: 20px;
    padding: 18px;
    border-radius: 24px;
  }

  .plus-page-root .plan-main,
  .plus-page-root .hero-card {
    padding: 6px;
  }

  .plus-page-root .stats {
    grid-template-columns: 1fr;
  }

  .plus-page-root .cta-card,
  .plus-page-root .hero-card {
    padding: 22px;
  }

  .plus-page-root .field-label {
    flex-direction: column;
    align-items: flex-start;
  }

  .plus-page-root .price {
    font-size: 2.2rem;
  }

  .plus-page-root .feature-item {
    align-items: flex-start;
  }

  .plus-page-root .toast {
    bottom: 18px;
    width: calc(100vw - 36px);
    border-radius: 20px;
  }
}
</style>
