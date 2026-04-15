import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { GatewayDatabase } from "../db/database.js";
import { nowIso } from "../utils/time.js";

const managedBlockStart = "# >>> quota-gateway auto-config (managed by codex-gateway) >>>";
const managedBlockEnd = "# <<< quota-gateway auto-config (managed by codex-gateway) <<<";
const managedProviderId = "quota_gateway_auto_switch_managed";

type CodexAutoConfigMode =
  | "provider_auth"
  | "provider_env";

const autoConfigModes = new Set<CodexAutoConfigMode>([
  "provider_auth",
  "provider_env",
]);

const runtimeSettingKeys = {
  enabled: "codex_auto_config_enabled",
  mode: "codex_auto_config_mode",
  configPath: "codex_auto_config_path",
  backupPath: "codex_auto_config_backup_path",
  guardianPid: "codex_auto_config_guardian_pid",
  lastError: "codex_auto_config_last_error",
  lastAppliedAt: "codex_auto_config_last_applied_at",
} as const;

const ensureTrailingNewline = (value: string) => (value.endsWith("\n") ? value : `${value}\n`);

const normalizeNewlines = (value: string) => value.replaceAll("\r\n", "\n");

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseBoolean = (value: string | null, fallback: boolean) => {
  if (value === null) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }

  return fallback;
};

const parsePid = (value: string | null) => {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
};

const toTomlString = (value: string) => JSON.stringify(value);

const readTextFile = (filePath: string) =>
  existsSync(filePath) ? normalizeNewlines(readFileSync(filePath, "utf8")) : "";

const stripManagedBlock = (content: string) => {
  const blockPattern = new RegExp(
    `${escapeRegExp(managedBlockStart)}[\\s\\S]*?${escapeRegExp(managedBlockEnd)}\\s*`,
    "g",
  );
  return content.replace(blockPattern, "").trimEnd();
};

const stripConfigKeys = (content: string, keys: string[]) => {
  if (keys.length === 0) {
    return content;
  }
  const pattern = new RegExp(`^(\\s*)(?:${keys.map(escapeRegExp).join("|")})\\s*=.*$`, "gm");
  return content.replace(pattern, "").trimEnd();
};

const isProcessAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const killProcessBestEffort = (pid: number) => {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // ignore
  }
};

export type CodexAutoConfigStatus = {
  enabled: boolean;
  active: boolean;
  mode: CodexAutoConfigMode;
  resolvedMode: CodexAutoConfigMode;
  bunAvailable: boolean;
  configPath: string;
  backupPath: string;
  backupExists: boolean;
  guardianPid: number | null;
  guardianRunning: boolean;
  lastError: string | null;
  lastAppliedAt: string | null;
};

export class CodexConfigAutoManager {
  private readonly configPath: string;
  private readonly backupPath: string;
  private readonly guardianScriptPath: string;
  private bunAvailableCache: boolean | null = null;

  constructor(
    private readonly db: GatewayDatabase,
    private readonly options: {
      gatewayPort: number;
    },
  ) {
    this.configPath = join(homedir(), ".codex", "config.toml");
    this.backupPath = `${this.configPath}.back`;

    const currentFilePath = fileURLToPath(import.meta.url);
    const currentExt = extname(currentFilePath);
    const expectedScriptPath = join(
      dirname(currentFilePath),
      `codex-config-guardian-child${currentExt === ".ts" ? ".ts" : ".js"}`,
    );
    this.guardianScriptPath = expectedScriptPath;
  }

  initialize() {
    // Silent startup: always bootstrap auto-config on gateway boot.
    if (!this.isEnabled()) {
      this.setEnabledSetting(true);
    }

    try {
      this.applyManagedConfig();
      this.startGuardian();
      this.clearLastError();
    } catch (error) {
      this.recordLastError(
        error instanceof Error ? error.message : "Codex 自动配置初始化失败。",
      );
    }

    return this.getStatus();
  }

  getStatus(): CodexAutoConfigStatus {
    const enabled = this.isEnabled();
    const content = readTextFile(this.configPath);
    const guardianPid = parsePid(this.db.getRuntimeSetting(runtimeSettingKeys.guardianPid));
    const guardianRunning = guardianPid ? isProcessAlive(guardianPid) : false;
    const lastError = this.db.getRuntimeSetting(runtimeSettingKeys.lastError);
    const lastAppliedAt = this.db.getRuntimeSetting(runtimeSettingKeys.lastAppliedAt);
    const mode = this.getMode();
    const bunAvailable = this.getBunAvailability();
    const resolvedMode = this.resolveMode(mode, bunAvailable);

    return {
      enabled,
      active: content.includes(managedBlockStart) && content.includes(managedBlockEnd),
      mode,
      resolvedMode,
      bunAvailable,
      configPath: this.configPath,
      backupPath: this.backupPath,
      backupExists: existsSync(this.backupPath),
      guardianPid,
      guardianRunning,
      lastError,
      lastAppliedAt,
    };
  }

  setEnabled(enabled: boolean) {
    if (enabled) {
      this.enableManagedMode();
    } else {
      this.disableManagedMode();
    }

    return this.getStatus();
  }

  restoreForShutdown() {
    if (!this.isEnabled()) {
      this.stopGuardian();
      return this.getStatus();
    }

    try {
      this.stopGuardian();
      this.restoreBackupToConfig();
      this.clearLastError();
    } catch (error) {
      this.recordLastError(
        error instanceof Error ? error.message : "进程退出还原 Codex 配置失败。",
      );
    }

    return this.getStatus();
  }

  private isEnabled() {
    return parseBoolean(this.db.getRuntimeSetting(runtimeSettingKeys.enabled), false);
  }

  private getMode(): CodexAutoConfigMode {
    const stored = this.db.getRuntimeSetting(runtimeSettingKeys.mode);
    if (stored && autoConfigModes.has(stored as CodexAutoConfigMode)) {
      return stored as CodexAutoConfigMode;
    }
    return "provider_env";
  }

  setMode(mode: CodexAutoConfigMode) {
    const normalized = autoConfigModes.has(mode) ? mode : "provider_env";
    this.db.setRuntimeSetting(runtimeSettingKeys.mode, normalized);
  }

  private getBunAvailability() {
    if (this.bunAvailableCache !== null) {
      return this.bunAvailableCache;
    }
    try {
      const result = spawnSync("bun", ["--version"], {
        stdio: "ignore",
        windowsHide: true,
        timeout: 2_000,
      });
      this.bunAvailableCache = result.status === 0;
    } catch {
      this.bunAvailableCache = false;
    }
    return this.bunAvailableCache;
  }

  private resolveMode(mode: CodexAutoConfigMode, bunAvailable = this.getBunAvailability()) {
    if (mode === "provider_auth" && !bunAvailable) {
      return "provider_env";
    }
    return mode;
  }

  private setEnabledSetting(enabled: boolean) {
    this.db.setRuntimeSetting(runtimeSettingKeys.enabled, enabled ? "1" : "0");
  }

  private clearLastError() {
    this.db.deleteRuntimeSetting(runtimeSettingKeys.lastError);
  }

  private recordLastError(message: string) {
    this.db.setRuntimeSetting(runtimeSettingKeys.lastError, message);
  }

  private ensureConfigFileExists() {
    mkdirSync(dirname(this.configPath), { recursive: true });
    if (!existsSync(this.configPath)) {
      writeFileSync(this.configPath, "", "utf8");
    }
  }

  private ensureBackupFileExists() {
    if (existsSync(this.backupPath)) {
      return;
    }
    copyFileSync(this.configPath, this.backupPath);
    this.db.setRuntimeSetting(runtimeSettingKeys.backupPath, this.backupPath);
  }

  private buildManagedContent(baseContent: string) {
    const contentWithoutManagedBlock = stripManagedBlock(baseContent);
    const contentWithoutLegacyOpenaiKeys = stripConfigKeys(contentWithoutManagedBlock, [
      "openai_base_url",
      "forced_login_method",
    ]);
    const contentWithoutModelProvider = stripConfigKeys(contentWithoutLegacyOpenaiKeys, [
      "model_provider",
    ]);
    const gatewayBaseUrl = `http://127.0.0.1:${this.options.gatewayPort}`;
    const cleanedContent = contentWithoutModelProvider
      .replace(
        new RegExp(`^(\\s*)model_provider\\s*=\\s*"${escapeRegExp(managedProviderId)}"\\s*(?:#.*)?$`, "m"),
        "",
      )
      .trimEnd();
    const managedBlock = [
      managedBlockStart,
      `[model_providers.${managedProviderId}]`,
      'name = "Local Quota Gateway"',
      `base_url = ${toTomlString(gatewayBaseUrl)}`,
      'env_key = "QUOTA_GATEWAY_TOKEN"',
      managedBlockEnd,
    ].join("\n");
    const forcedModelProviderLine = `model_provider = "${managedProviderId}"`;

    if (!cleanedContent.trim()) {
      return ensureTrailingNewline(`${forcedModelProviderLine}\n\n${managedBlock}`);
    }

    return ensureTrailingNewline(
      `${forcedModelProviderLine}\n\n${cleanedContent.trimEnd()}\n\n${managedBlock}`,
    );
  }

  private applyManagedConfig() {
    this.ensureConfigFileExists();
    this.ensureBackupFileExists();

    const baseContent = readTextFile(this.backupPath);
    const nextContent = this.buildManagedContent(baseContent);
    writeFileSync(this.configPath, nextContent, "utf8");
    this.db.setRuntimeSetting(runtimeSettingKeys.configPath, this.configPath);
    this.db.setRuntimeSetting(runtimeSettingKeys.lastAppliedAt, nowIso());
  }

  private restoreBackupToConfig() {
    mkdirSync(dirname(this.configPath), { recursive: true });

    if (!existsSync(this.backupPath)) {
      const current = readTextFile(this.configPath);
      const stripped = stripManagedBlock(current).replace(
        new RegExp(`^(\\s*)model_provider\\s*=\\s*"${escapeRegExp(managedProviderId)}"\\s*(?:#.*)?$`, "m"),
        "",
      );
      writeFileSync(this.configPath, ensureTrailingNewline(stripped.trimEnd()), "utf8");
      return;
    }

    copyFileSync(this.backupPath, this.configPath);
    unlinkSync(this.backupPath);
  }

  private enableManagedMode() {
    try {
      this.applyManagedConfig();
      this.setEnabledSetting(true);
      this.startGuardian();
      this.clearLastError();
    } catch (error) {
      this.recordLastError(error instanceof Error ? error.message : "启用 Codex 自动配置失败。");
      throw error;
    }
  }

  private disableManagedMode() {
    try {
      this.stopGuardian();
      this.restoreBackupToConfig();
      this.setEnabledSetting(false);
      this.clearLastError();
    } catch (error) {
      this.recordLastError(error instanceof Error ? error.message : "关闭 Codex 自动配置失败。");
      throw error;
    }
  }

  private startGuardian() {
    this.stopGuardian();

    if (!existsSync(this.guardianScriptPath)) {
      throw new Error(`守护进程脚本不存在：${this.guardianScriptPath}`);
    }

    const child = spawn(
      process.execPath,
      [
        this.guardianScriptPath,
        "--parent-pid",
        String(process.pid),
        "--config-path",
        this.configPath,
        "--backup-path",
        this.backupPath,
      ],
      {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      },
    );
    child.unref();
    this.db.setRuntimeSetting(runtimeSettingKeys.guardianPid, String(child.pid));
  }

  private stopGuardian() {
    const guardianPid = parsePid(this.db.getRuntimeSetting(runtimeSettingKeys.guardianPid));
    if (guardianPid) {
      killProcessBestEffort(guardianPid);
    }
    this.db.deleteRuntimeSetting(runtimeSettingKeys.guardianPid);
  }
}
