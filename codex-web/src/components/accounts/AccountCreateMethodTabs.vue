<script setup lang="ts">
import type { CreateMethod } from "./create-form-types.ts";

const props = defineProps<{
  activeMethod: CreateMethod;
}>();

const emit = defineEmits<{
  "update:activeMethod": [value: CreateMethod];
}>();

const setMethod = (method: CreateMethod) => {
  if (props.activeMethod === method) {
    return;
  }
  emit("update:activeMethod", method);
};
</script>

<template>
  <section class="account-method-panel">
    <div class="account-method-tabs" role="tablist" aria-label="添加方式">
      <button
        type="button"
        class="account-method-tab"
        :class="{ 'account-method-tab--active': activeMethod === 'auto-register' }"
        role="tab"
        :aria-selected="activeMethod === 'auto-register'"
        @click="setMethod('auto-register')"
      >
        方式一：自动注册
      </button>
      <button
        type="button"
        class="account-method-tab"
        :class="{ 'account-method-tab--active': activeMethod === 'browser-capture' }"
        role="tab"
        :aria-selected="activeMethod === 'browser-capture'"
        @click="setMethod('browser-capture')"
      >
        方式二：浏览器采集
      </button>
      <button
        type="button"
        class="account-method-tab"
        :class="{ 'account-method-tab--active': activeMethod === 'session-import' }"
        role="tab"
        :aria-selected="activeMethod === 'session-import'"
        @click="setMethod('session-import')"
      >
        方式三：Session 导入
      </button>
    </div>
  </section>
</template>

<style scoped>
.account-method-panel {
  display: block;
  padding: 14px 16px;
  border: 1px solid rgba(20, 33, 61, 0.1);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
}

.account-method-tabs {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.account-method-tab {
  padding: 10px 14px;
  border: 1px solid rgba(20, 33, 61, 0.14);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.9);
  color: var(--ink);
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
}

.account-method-tab:hover {
  border-color: rgba(216, 109, 57, 0.35);
  background: rgba(216, 109, 57, 0.08);
}

.account-method-tab:focus-visible {
  outline: 2px solid rgba(216, 109, 57, 0.35);
  outline-offset: 2px;
}

.account-method-tab--active {
  border-color: rgba(216, 109, 57, 0.5);
  background: linear-gradient(135deg, #d86d39 0%, #b94d1d 100%);
  color: #fff8f4;
  box-shadow: 0 10px 24px rgba(185, 77, 29, 0.25);
}

@media (max-width: 920px) {
  .account-method-tabs {
    display: grid;
    grid-template-columns: 1fr;
  }

  .account-method-tab {
    width: 100%;
    text-align: left;
  }
}
</style>

