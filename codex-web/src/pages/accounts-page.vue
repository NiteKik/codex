<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { storeToRefs } from "pinia";
import AccountPoolTable from "../components/accounts/AccountPoolTable.vue";
import { useAccountsStore } from "../stores/accounts.ts";

const accountsStore = useAccountsStore();
const {
  accounts,
  autoRefreshCountdownSeconds,
  autoRefreshIntervalSeconds,
  errorMessage,
  refreshing,
} = storeToRefs(accountsStore);

const refreshAccounts = async () => {
  await accountsStore.refreshAccounts({ queueIfBusy: true });
};

onMounted(() => {
  accountsStore.startAutoRefresh();
});

onUnmounted(() => {
  accountsStore.stopAutoRefresh();
});
</script>

<template>
  <div class="dashboard-shell">
    <div v-if="errorMessage" class="dashboard-error" role="alert">
      {{ errorMessage }}
    </div>
    <div class="accounts-refresh-countdown">
      自动刷新倒计时：{{ autoRefreshCountdownSeconds }} 秒
      <span>（每 {{ autoRefreshIntervalSeconds }} 秒）</span>
    </div>

    <AccountPoolTable
      :accounts="accounts"
      :loading="refreshing"
      @created="refreshAccounts"
    />
  </div>
</template>

<style scoped>
.dashboard-shell {
  max-width: 1220px;
  margin: 0 auto;
  display: grid;
  gap: 22px;
}

.dashboard-error {
  padding: 16px 18px;
  border: 1px solid rgba(170, 61, 55, 0.12);
  border-radius: 20px;
  background: rgba(253, 227, 224, 0.9);
  color: var(--critical);
  font-weight: 700;
}

.accounts-refresh-countdown {
  justify-self: end;
  margin-top: -8px;
  padding: 6px 12px;
  border: 1px solid rgba(20, 33, 61, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  color: var(--ink);
  font-size: 0.85rem;
  font-weight: 700;
}

.accounts-refresh-countdown span {
  color: var(--muted);
  font-weight: 600;
}

@media (max-width: 920px) {
  .accounts-refresh-countdown {
    justify-self: stretch;
    text-align: center;
  }
}
</style>
