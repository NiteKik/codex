import { ref } from "vue";
import { closeDialogOnBackdropClick } from "./use-dialog-backdrop-close.ts";
import {
  updateAccount,
  type AccountRow,
  type AccountStatus,
  type AuthMode,
  type WorkspaceKind,
} from "../services/gateway-api.ts";
import { parseStringRecordJson } from "../utils/parse-string-record-json.ts";

type FeedbackTone = "success" | "error";

type UseAccountEditDialogOptions = {
  notifyCreated: () => void;
  setTableFeedback: (message: string, tone: FeedbackTone) => void;
};

export const useAccountEditDialog = ({
  notifyCreated,
  setTableFeedback,
}: UseAccountEditDialogOptions) => {
  const editDialogRef = ref<HTMLDialogElement | null>(null);
  const editingAccountId = ref("");
  const editName = ref("");
  const editStatus = ref<AccountStatus>("healthy");
  const editAuthMode = ref<AuthMode>("bearer");
  const editToken = ref("");
  const editWorkspaceKind = ref<WorkspaceKind>("unknown");
  const editWorkspaceId = ref("");
  const editWorkspaceName = ref("");
  const editWorkspaceHeadersPayload = ref("");
  const editSubmitting = ref(false);
  const editFeedback = ref("");
  const editFeedbackTone = ref<FeedbackTone>("success");

  const statusOptions: AccountStatus[] = [
    "healthy",
    "cooling",
    "exhausted",
    "invalid",
  ];

  const setEditFeedback = (message: string, tone: FeedbackTone) => {
    editFeedback.value = message;
    editFeedbackTone.value = tone;
  };

  const openEditDialog = (account: AccountRow) => {
    editingAccountId.value = account.id;
    editName.value = account.name;
    editStatus.value = account.status;
    editAuthMode.value = account.auth.mode;
    editToken.value = "";
    editWorkspaceKind.value = account.workspace.kind;
    editWorkspaceId.value = account.workspace.id ?? "";
    editWorkspaceName.value = account.workspace.name ?? "";
    editWorkspaceHeadersPayload.value = account.workspace.headers
      ? JSON.stringify(account.workspace.headers, null, 2)
      : "";
    editSubmitting.value = false;
    editFeedback.value = "";
    editDialogRef.value?.showModal();
  };

  const closeEditDialog = () => {
    editDialogRef.value?.close();
  };

  const onEditDialogClick = (event: MouseEvent) => {
    closeDialogOnBackdropClick(editDialogRef.value, event);
  };

  const submitEdit = async () => {
    const accountId = editingAccountId.value;
    if (!accountId) {
      return;
    }

    const name = editName.value.trim();
    if (name.length === 0) {
      setEditFeedback("账号名称不能为空。", "error");
      return;
    }

    editSubmitting.value = true;
    editFeedback.value = "";

    try {
      const workspaceHeaders = parseStringRecordJson(
        editWorkspaceHeadersPayload.value,
        "工作空间请求头",
      );
      await updateAccount(accountId, {
        id: accountId,
        name,
        status: editStatus.value,
        workspace: {
          kind: editWorkspaceKind.value,
          id: editWorkspaceId.value.trim() || null,
          name: editWorkspaceName.value.trim() || null,
          headers: workspaceHeaders,
        },
        ...(editAuthMode.value === "bearer" && editToken.value.trim().length > 0
          ? {
              auth: {
                mode: "bearer" as const,
                token: editToken.value.trim(),
              },
            }
          : {}),
      });
      closeEditDialog();
      setTableFeedback("账号已更新。", "success");
      notifyCreated();
    } catch (error) {
      setEditFeedback(
        error instanceof Error ? error.message : "账号更新失败。",
        "error",
      );
    } finally {
      editSubmitting.value = false;
    }
  };

  return {
    closeEditDialog,
    editAuthMode,
    editDialogRef,
    editFeedback,
    editFeedbackTone,
    editName,
    editStatus,
    editSubmitting,
    editToken,
    editWorkspaceHeadersPayload,
    editWorkspaceId,
    editWorkspaceKind,
    editWorkspaceName,
    onEditDialogClick,
    openEditDialog,
    statusOptions,
    submitEdit,
  };
};
