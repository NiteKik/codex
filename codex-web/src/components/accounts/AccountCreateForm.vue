<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { parseSessionAuthPayload } from "../../utils/session-parser.ts";
import {
  cancelChatgptRegistrationTask,
  createAccount,
  getChatgptCaptureTask,
  getChatgptRegistrationTask,
  saveChatgptCaptureTask,
  startChatgptCapture,
  startChatgptRegistration,
  type ChatgptRegistrationTask,
  type WorkspaceContext,
} from "../../services/gateway-api.ts";
import AccountCreateAutoRegisterPanel from "./AccountCreateAutoRegisterPanel.vue";
import AccountCreateBrowserCapturePanel from "./AccountCreateBrowserCapturePanel.vue";
import AccountCreateMethodTabs from "./AccountCreateMethodTabs.vue";
import AccountCreateSessionImportPanel from "./AccountCreateSessionImportPanel.vue";
import type { CreateMethod, TaskProgressItem } from "./create-form-types.ts";

const emit = defineEmits<{
  created: [];
}>();

const submitting = ref(false);
const formFeedback = ref("");
const formFeedbackTone = ref<"success" | "error">("success");

const sessionApiUrl = "https://chatgpt.com/api/auth/session";
const sessionPayload = ref("");
const sessionApiCopied = ref(false);
const captureTaskId = ref("");
const captureState = ref<"idle" | "running" | "completed" | "failed">("idle");
const captureProgressMessage = ref("");
const captureBusy = ref(false);
const capturePolling = ref(false);
const registrationTaskId = ref("");
const registrationState = ref<"idle" | "running" | "completed" | "failed">(
  "idle",
);
const registrationProgressMessage = ref("");
const registrationProgressHistory = ref<TaskProgressItem[]>([]);
const registrationStartedAtMs = ref<number | null>(null);
const registrationNowMs = ref<number>(Date.now());
const registrationBusy = ref(false);
const registrationStopping = ref(false);
const registrationPolling = ref(false);
const savedCaptureTaskIds = new Set<string>();
let captureTimer: number | null = null;
let registrationTimer: number | null = null;
let registrationClockTimer: number | null = null;
let sessionApiCopyTimer: number | null = null;
const activeMethod = ref<CreateMethod>("auto-register");

const makeAccountIdFromEmail = (email: string) =>
  `acc_${email
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replaceAll(/^_+|_+$/g, "")}_${Date.now().toString(36)}`;

const setFormFeedback = (message: string, tone: "success" | "error") => {
  formFeedback.value = message;
  formFeedbackTone.value = tone;
};

const parseIsoToMs = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const registrationElapsedSeconds = computed(() => {
  if (registrationStartedAtMs.value === null) {
    return 0;
  }

  return Math.max(
    0,
    Math.floor(
      (registrationNowMs.value - registrationStartedAtMs.value) / 1000,
    ),
  );
});

const registrationStateLabel = computed(() => {
  if (registrationState.value === "running") {
    return "进行中";
  }
  if (registrationState.value === "completed") {
    return "已完成";
  }
  if (registrationState.value === "failed") {
    return "失败";
  }
  return "待启动";
});

const captureStateLabel = computed(() => {
  if (captureState.value === "running") {
    return "采集中";
  }
  if (captureState.value === "completed") {
    return "已完成";
  }
  if (captureState.value === "failed") {
    return "失败";
  }
  return "待启动";
});

const startRegistrationClock = () => {
  if (registrationClockTimer !== null) {
    window.clearInterval(registrationClockTimer);
  }

  registrationNowMs.value = Date.now();
  registrationClockTimer = window.setInterval(() => {
    registrationNowMs.value = Date.now();
  }, 1_000);
};

const copyTextToClipboard = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
};

const copySessionApiUrl = async () => {
  try {
    await copyTextToClipboard(sessionApiUrl);
    sessionApiCopied.value = true;
    setFormFeedback("已复制 Session 接口地址到剪贴板。", "success");

    if (sessionApiCopyTimer !== null) {
      window.clearTimeout(sessionApiCopyTimer);
    }
    sessionApiCopyTimer = window.setTimeout(() => {
      sessionApiCopied.value = false;
      sessionApiCopyTimer = null;
    }, 2_000);
  } catch {
    setFormFeedback("复制失败，请手动复制 Session 接口地址。", "error");
  }
};

const stopRegistrationClock = () => {
  if (registrationClockTimer === null) {
    return;
  }

  window.clearInterval(registrationClockTimer);
  registrationClockTimer = null;
};

const mergeWorkspaceContext = (
  detected: WorkspaceContext | null,
): WorkspaceContext => {
  return {
    kind: detected?.kind ?? "unknown",
    id: detected?.id ?? null,
    name: detected?.name ?? null,
    headers: detected?.headers ?? null,
  };
};

const stopCapturePolling = () => {
  if (captureTimer !== null) {
    window.clearInterval(captureTimer);
    captureTimer = null;
  }
};

const stopRegistrationPolling = () => {
  if (registrationTimer !== null) {
    window.clearInterval(registrationTimer);
    registrationTimer = null;
  }
  stopRegistrationClock();
  registrationStopping.value = false;
};

const formatProgressTime = (value: string) => {
  const ms = parseIsoToMs(value);
  if (ms === null) {
    return "--:--:--";
  }

  return new Date(ms).toLocaleTimeString("zh-CN", {
    hour12: false,
  });
};

const pollCaptureTask = async () => {
  if (!captureTaskId.value || capturePolling.value) {
    return;
  }

  capturePolling.value = true;

  try {
    const { task } = await getChatgptCaptureTask(captureTaskId.value);
    captureState.value = task.state;
    captureProgressMessage.value = task.progressMessage;

    if (task.state === "completed") {
      stopCapturePolling();

      if (savedCaptureTaskIds.has(task.id)) {
        captureBusy.value = false;
        return;
      }

      savedCaptureTaskIds.add(task.id);

      const saveResult = await saveChatgptCaptureTask(task.id, {
        workspace: mergeWorkspaceContext(task.result?.workspace ?? null),
      });
      captureBusy.value = false;
      setFormFeedback(
        `浏览器登录采集成功，已保存账号 ${saveResult.account.name}。`,
        "success",
      );
      emit("created");
    } else if (task.state === "failed") {
      stopCapturePolling();
      captureBusy.value = false;
      setFormFeedback(task.errorMessage ?? "浏览器登录采集失败。", "error");
    }
  } catch (error) {
    stopCapturePolling();
    captureBusy.value = false;
    setFormFeedback(
      error instanceof Error ? error.message : "登录采集状态查询失败。",
      "error",
    );
  } finally {
    capturePolling.value = false;
  }
};

const syncRegistrationTaskProgress = (task: ChatgptRegistrationTask) => {
  registrationState.value = task.state;
  registrationProgressMessage.value = task.progressMessage;

  const startedAtMs = parseIsoToMs(task.startedAt);
  if (startedAtMs !== null) {
    registrationStartedAtMs.value = startedAtMs;
  }
  registrationNowMs.value = Date.now();

  const history = Array.isArray(task.progressHistory)
    ? task.progressHistory
    : [];
  if (history.length > 0) {
    registrationProgressHistory.value = history.map((entry) => ({
      message: entry.message,
      at: entry.at,
    }));
    return;
  }

  const fallbackAt =
    task.updatedAt || task.startedAt || new Date().toISOString();
  registrationProgressHistory.value = task.progressMessage
    ? [
        {
          message: task.progressMessage,
          at: fallbackAt,
        },
      ]
    : [];
};

const pollRegistrationTask = async () => {
  if (!registrationTaskId.value || registrationPolling.value) {
    return;
  }

  registrationPolling.value = true;

  try {
    const { task } = await getChatgptRegistrationTask(registrationTaskId.value);
    syncRegistrationTaskProgress(task);

    if (task.state === "completed") {
      stopRegistrationPolling();
      registrationBusy.value = false;
      registrationStopping.value = false;
      setFormFeedback(
        `自动注册成功，已写入账号 ${task.result?.email ?? task.result?.accountId ?? "未知账号"}。`,
        "success",
      );
      emit("created");
    } else if (task.state === "failed") {
      stopRegistrationPolling();
      registrationBusy.value = false;
      registrationStopping.value = false;
      setFormFeedback(task.errorMessage ?? "自动注册失败。", "error");
    } else {
      startRegistrationClock();
    }
  } catch (error) {
    stopRegistrationPolling();
    registrationBusy.value = false;
    setFormFeedback(
      error instanceof Error ? error.message : "自动注册状态查询失败。",
      "error",
    );
  } finally {
    registrationPolling.value = false;
  }
};

const startBrowserCaptureFlow = async () => {
  if (captureBusy.value) {
    return;
  }

  stopCapturePolling();
  captureBusy.value = true;
  capturePolling.value = false;
  savedCaptureTaskIds.clear();
  captureTaskId.value = "";
  captureState.value = "idle";
  captureProgressMessage.value = "";
  setFormFeedback("正在启动浏览器登录采集任务...", "success");

  try {
    const { task } = await startChatgptCapture();
    captureTaskId.value = task.id;
    captureState.value = task.state;
    captureProgressMessage.value = task.progressMessage;
    setFormFeedback(
      "浏览器已打开，请完成登录，系统会自动采集并保存账号。",
      "success",
    );

    captureTimer = window.setInterval(() => {
      void pollCaptureTask();
    }, 3_000);
    void pollCaptureTask();
  } catch (error) {
    captureBusy.value = false;
    setFormFeedback(
      error instanceof Error ? error.message : "启动浏览器登录采集失败。",
      "error",
    );
  }
};

const startAutoRegisterFlow = async () => {
  if (registrationBusy.value) {
    return;
  }

  stopRegistrationPolling();
  registrationBusy.value = true;
  registrationPolling.value = false;
  registrationTaskId.value = "";
  registrationState.value = "idle";
  registrationProgressMessage.value = "";
  registrationProgressHistory.value = [];
  registrationStartedAtMs.value = null;
  registrationNowMs.value = Date.now();
  registrationStopping.value = false;
  setFormFeedback("正在启动自动注册任务...", "success");

  try {
    const { task } = await startChatgptRegistration();
    registrationTaskId.value = task.id;
    syncRegistrationTaskProgress(task);
    setFormFeedback(
      "自动注册任务已启动，系统会在完成后自动写入账号池。",
      "success",
    );
    startRegistrationClock();

    registrationTimer = window.setInterval(() => {
      void pollRegistrationTask();
    }, 1_000);
    void pollRegistrationTask();
  } catch (error) {
    registrationBusy.value = false;
    stopRegistrationPolling();
    setFormFeedback(
      error instanceof Error ? error.message : "启动自动注册失败。",
      "error",
    );
  }
};

const stopAutoRegisterFlow = async () => {
  if (
    !registrationTaskId.value ||
    registrationState.value !== "running" ||
    registrationStopping.value
  ) {
    return;
  }

  registrationStopping.value = true;
  setFormFeedback("正在终止自动注册任务...", "success");

  try {
    const { task } = await cancelChatgptRegistrationTask(
      registrationTaskId.value,
    );
    syncRegistrationTaskProgress(task);

    if (task.state === "running") {
      return;
    }

    stopRegistrationPolling();
    registrationBusy.value = false;
    setFormFeedback(task.errorMessage ?? "自动注册任务已终止。", "error");
  } catch (error) {
    registrationStopping.value = false;
    setFormFeedback(
      error instanceof Error ? error.message : "终止自动注册失败。",
      "error",
    );
  }
};

const createAccountBySessionPayload = async (payload: string) => {
  const result = parseSessionAuthPayload(payload);
  if (!result.ok) {
    throw new Error(result.message);
  }

  await createAccount({
    id: makeAccountIdFromEmail(result.email),
    name: result.email,
    status: "healthy",
    loginEmail: result.email,
    provisionSource: "session-import",
    auth: {
      mode: "bearer",
      token: result.accessToken,
    },
    workspace: mergeWorkspaceContext(result.workspace),
    sessionInfo: payload.trim(),
  });
};

const importSessionAccount = async () => {
  formFeedback.value = "";
  submitting.value = true;

  try {
    if (!sessionPayload.value.trim()) {
      throw new Error(
        "请填写 Session JSON，或使用上方自动注册 / 浏览器采集入口。",
      );
    }

    await createAccountBySessionPayload(sessionPayload.value);
    sessionPayload.value = "";
    setFormFeedback("Session JSON 导入成功。", "success");
    emit("created");
  } catch (error) {
    setFormFeedback(
      error instanceof Error ? error.message : "账号保存失败。",
      "error",
    );
  } finally {
    submitting.value = false;
  }
};

onUnmounted(() => {
  stopCapturePolling();
  stopRegistrationPolling();
  if (sessionApiCopyTimer !== null) {
    window.clearTimeout(sessionApiCopyTimer);
    sessionApiCopyTimer = null;
  }
});
</script>

<template>
  <section class="dashboard-form">
    <AccountCreateMethodTabs
      :active-method="activeMethod"
      @update:active-method="activeMethod = $event"
    />

    <AccountCreateAutoRegisterPanel
      v-if="activeMethod === 'auto-register'"
      :registration-state="registrationState"
      :registration-state-label="registrationStateLabel"
      :registration-busy="registrationBusy"
      :registration-stopping="registrationStopping"
      :registration-task-id="registrationTaskId"
      :registration-elapsed-seconds="registrationElapsedSeconds"
      :registration-progress-message="registrationProgressMessage"
      :registration-progress-history="registrationProgressHistory"
      :format-progress-time="formatProgressTime"
      @start="startAutoRegisterFlow"
      @stop="stopAutoRegisterFlow"
    />

    <AccountCreateBrowserCapturePanel
      v-else-if="activeMethod === 'browser-capture'"
      :capture-state="captureState"
      :capture-state-label="captureStateLabel"
      :capture-busy="captureBusy"
      :capture-task-id="captureTaskId"
      :capture-progress-message="captureProgressMessage"
      @start="startBrowserCaptureFlow"
    />

    <AccountCreateSessionImportPanel
      v-else
      :session-api-url="sessionApiUrl"
      :session-payload="sessionPayload"
      :session-api-copied="sessionApiCopied"
      :submitting="submitting"
      @update:session-payload="sessionPayload = $event"
      @copy-session-api-url="copySessionApiUrl"
      @import-session="importSessionAccount"
    />

    <div v-if="formFeedback" class="dashboard-form__footer">
      <div
        class="dashboard-form__feedback"
        :class="`dashboard-form__feedback--${formFeedbackTone}`"
      >
        {{ formFeedback }}
      </div>
    </div>
  </section>
</template>

<style scoped>
.dashboard-form {
  display: grid;
  gap: 16px;
  padding: 5px;
}

.dashboard-form__footer {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
}

.dashboard-form__feedback {
  margin-top: 10px;
  padding: 12px 14px;
  border-radius: 16px;
  font-size: 0.94rem;
  font-weight: 700;
}

.dashboard-form__feedback--success {
  background: var(--success-soft);
  color: var(--success);
}

.dashboard-form__feedback--error {
  background: var(--critical-soft);
  color: var(--critical);
}
</style>
