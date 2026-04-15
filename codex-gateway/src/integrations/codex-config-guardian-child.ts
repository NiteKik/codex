import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

const readArg = (name: string) => {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) {
    return null;
  }
  return process.argv[index + 1] ?? null;
};

const parentPid = Number(readArg("--parent-pid"));
const configPath = readArg("--config-path");
const backupPath = readArg("--backup-path");
const managedProviderId = "quota_gateway_auto_switch_managed";

const isProcessAlive = (pid: number) => {
  if (!Number.isFinite(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const stripManagedBlock = (content: string) => {
  const start = "# >>> quota-gateway auto-config (managed by codex-gateway) >>>";
  const end = "# <<< quota-gateway auto-config (managed by codex-gateway) <<<";
  const escapedStart = start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEnd = end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blockPattern = new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}\\s*`, "g");
  return content.replace(blockPattern, "").trimEnd();
};

const restoreOnce = () => {
  if (!configPath) {
    return;
  }

  mkdirSync(dirname(configPath), { recursive: true });

  if (backupPath && existsSync(backupPath)) {
    copyFileSync(backupPath, configPath);
    unlinkSync(backupPath);
    return;
  }

  if (!existsSync(configPath)) {
    return;
  }

  const current = readFileSync(configPath, "utf8");
  const stripped = stripManagedBlock(current).replace(
    new RegExp(`^(\\s*)model_provider\\s*=\\s*"${managedProviderId}"\\s*(?:#.*)?$`, "m"),
    "",
  );
  writeFileSync(configPath, stripped.endsWith("\n") ? stripped : `${stripped}\n`, "utf8");
};

if (!Number.isFinite(parentPid) || !configPath) {
  process.exit(0);
}

const timer = setInterval(() => {
  if (isProcessAlive(parentPid)) {
    return;
  }

  clearInterval(timer);
  try {
    restoreOnce();
  } finally {
    process.exit(0);
  }
}, 2_000);
