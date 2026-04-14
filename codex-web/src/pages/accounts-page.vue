<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { storeToRefs } from "pinia";
import AccountPoolTable from "../components/accounts/AccountPoolTable.vue";
import { useAccountsStore } from "../stores/accounts.ts";

const accountsStore = useAccountsStore();
const { accounts, errorMessage, refreshing } = storeToRefs(accountsStore);

const refreshAccounts = async () => {
  await accountsStore.refreshAccounts();
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
</style>
