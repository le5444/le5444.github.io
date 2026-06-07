export type CommandValidatorSeverity = "pass" | "warn" | "block";

export interface CommandDraft {
  command: string;
  cwd?: string;
  purpose?: string;
}

export interface CommandValidatorSpec {
  key: string;
  label: string;
  severity: Exclude<CommandValidatorSeverity, "pass">;
  description: string;
  pattern: RegExp;
}

export interface CommandValidationResult {
  key: string;
  label: string;
  severity: CommandValidatorSeverity;
  message: string;
}

export const COMMAND_VALIDATORS: CommandValidatorSpec[] = [
  { key: "shell_chain", label: "Shell 链式执行", severity: "warn", description: "复杂链式命令需要拆开验证。", pattern: /&&|\|\||;\s*\S/ },
  { key: "pipe_to_shell", label: "网络脚本管道执行", severity: "block", description: "禁止 curl/wget 直接 pipe 到 shell。", pattern: /(curl|wget|irm|iwr)[^|]*(\||\>)\s*(sh|bash|powershell|pwsh|cmd)/i },
  { key: "recursive_delete", label: "递归删除", severity: "block", description: "递归删除必须人工确认路径范围。", pattern: /\b(rm\s+-rf|Remove-Item\b[^|]*(?:-Recurse|-r)|del\s+\/s|rd\s+\/s)\b/i },
  { key: "root_delete", label: "根目录/系统目录删除", severity: "block", description: "禁止对根目录、系统目录、用户目录整体删除。", pattern: /(rm\s+-rf\s+\/|C:\\Windows|C:\\Users\\?$|%USERPROFILE%\\?$|\$HOME\/?$)/i },
  { key: "git_reset_hard", label: "硬重置", severity: "block", description: "禁止未经确认执行 git reset --hard 或 checkout 覆盖。", pattern: /\bgit\s+(reset\s+--hard|checkout\s+--\s+)/i },
  { key: "sudo_admin", label: "管理员权限", severity: "block", description: "管理员权限命令必须单独审批。", pattern: /\b(sudo|runas|Start-Process\b[^|]*-Verb\s+RunAs)\b/i },
  { key: "secret_echo", label: "密钥输出", severity: "block", description: "禁止 echo/print/set 输出密钥或 token。", pattern: /\b(echo|print|Write-Host|set)\b.*(token|secret|api[_-]?key|password|passwd|cookie)/i },
  { key: "env_dump", label: "环境变量倾倒", severity: "warn", description: "完整环境变量输出可能泄露凭据。", pattern: /\b(env|printenv|set|Get-ChildItem\s+Env:)\b/i },
  { key: "chmod_broad", label: "宽泛权限修改", severity: "warn", description: "chmod/chown 大范围操作需要确认。", pattern: /\b(chmod|chown|icacls)\b/i },
  { key: "process_kill", label: "批量杀进程", severity: "warn", description: "批量 kill/Stop-Process 需要确认目标。", pattern: /\b(killall|pkill|taskkill|Stop-Process)\b/i },
  { key: "network_post", label: "外部提交", severity: "warn", description: "POST/上传命令可能发送本地数据。", pattern: /\b(curl|wget|Invoke-WebRequest|iwr|Invoke-RestMethod|irm)\b.*\b(-X\s+POST|--upload-file|-F\s|--form|PUT)\b/i },
  { key: "package_global", label: "全局安装", severity: "warn", description: "全局安装会改变系统环境。", pattern: /\b(npm|pnpm|yarn|pip|uv|cargo)\b.*\b(-g|--global|install)\b/i },
  { key: "background_daemon", label: "后台常驻", severity: "warn", description: "后台/守护进程需要登记 KAIROS 与停止方式。", pattern: /\b(nohup|Start-Process|--daemon|pm2|forever|schtasks|crontab)\b/i },
  { key: "cron_modify", label: "定时任务修改", severity: "block", description: "定时任务必须先生成草案。", pattern: /\b(crontab|schtasks|New-ScheduledTask|Register-ScheduledTask)\b/i },
  { key: "encoded_payload", label: "编码载荷", severity: "block", description: "Base64/encoded command 常用于隐藏执行内容。", pattern: /\b(-EncodedCommand|frombase64string|base64\s+-d|certutil\s+-decode)\b/i },
  { key: "powershell_profile", label: "Shell 配置修改", severity: "warn", description: "修改 profile/rc 文件会影响长期环境。", pattern: /(\$PROFILE|\.bashrc|\.zshrc|profile\.ps1|PowerShell_profile)/i },
  { key: "registry_edit", label: "注册表修改", severity: "block", description: "Windows 注册表修改必须单独审批。", pattern: /\b(reg\s+(add|delete|import)|Set-ItemProperty\s+HK)/i },
  { key: "firewall_security", label: "安全策略修改", severity: "block", description: "防火墙、杀软、安全策略修改禁止自动执行。", pattern: /\b(netsh\s+advfirewall|Set-MpPreference|DisableRealtimeMonitoring|ufw|iptables)\b/i },
  { key: "ssh_key", label: "SSH/密钥操作", severity: "warn", description: "SSH key 和证书操作需要确认。", pattern: /\b(ssh-keygen|ssh-add|openssl|gpg)\b/i },
  { key: "file_overwrite", label: "重定向覆盖", severity: "warn", description: "单尖括号覆盖文件需要 diff。", pattern: /(^|[^>])>\s*[^>]/ },
  { key: "destructive_db", label: "数据库破坏操作", severity: "block", description: "DROP/TRUNCATE/DELETE 无 WHERE 等需要拦截。", pattern: /\b(drop\s+table|truncate\s+table|delete\s+from\s+\w+\s*(;|$))\b/i },
  { key: "docker_prune", label: "Docker 清理", severity: "warn", description: "prune/rmi/volume rm 可能删除环境资产。", pattern: /\bdocker\b.*\b(prune|rmi|volume\s+rm|system\s+prune)\b/i },
  { key: "untrusted_source", label: "未验证来源", severity: "warn", description: "从外部 URL 下载后执行需要来源分级。", pattern: /\b(git\s+clone|curl|wget|Invoke-WebRequest|iwr)\b.*https?:\/\//i },
];

export function validateCommandDraft(draft: CommandDraft): CommandValidationResult[] {
  const text = `${draft.command}\n${draft.cwd || ""}\n${draft.purpose || ""}`;
  const hits = COMMAND_VALIDATORS
    .filter((validator) => validator.pattern.test(text))
    .map((validator) => ({
      key: validator.key,
      label: validator.label,
      severity: validator.severity,
      message: validator.description,
    }));
  if (!hits.length) {
    return [{ key: "safe_read", label: "基础检查", severity: "pass", message: "未命中高风险模式，仍需遵守范围和权限。 " }];
  }
  return hits;
}

export function renderCommandValidatorContext() {
  return `【Command Validators｜23个执行安全验证器】
${COMMAND_VALIDATORS.map((validator, index) => `${index + 1}. ${validator.label}｜${validator.severity}｜${validator.description}`).join("\n")}

执行规则：
1. 命中 block：只输出审批草案，不执行。
2. 命中 warn：先拆解命令、说明影响面和回退方式。
3. 未命中也不代表可执行；仍需通过 7 层安全防线。`;
}
