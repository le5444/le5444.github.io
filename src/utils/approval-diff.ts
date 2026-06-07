import { uid } from "./helpers";

export type ApprovalDraftStatus = "draft" | "approved" | "rejected" | "applied";

export interface ApprovalDiffLine {
  type: "context" | "add" | "remove";
  text: string;
}

export interface ApprovalChange {
  type: "add" | "remove" | "replace";
  text: string;
}

export interface ApprovalDraft {
  id: string;
  createdAt: number;
  status: ApprovalDraftStatus;
  target: string;
  reason: string;
  before: string;
  after: string;
  diff: ApprovalDiffLine[];
  risk: "low" | "medium" | "high";
  changes?: ApprovalChange[];
  rollback?: string;
}

export function buildLineDiff(before: string, after: string): ApprovalDiffLine[] {
  const beforeLines = (before || "").split(/\r?\n/);
  const afterLines = (after || "").split(/\r?\n/);
  const max = Math.max(beforeLines.length, afterLines.length);
  const diff: ApprovalDiffLine[] = [];
  for (let i = 0; i < max; i += 1) {
    const oldLine = beforeLines[i] ?? "";
    const newLine = afterLines[i] ?? "";
    if (oldLine === newLine) {
      if (oldLine.trim()) diff.push({ type: "context", text: oldLine });
      continue;
    }
    if (oldLine.trim()) diff.push({ type: "remove", text: oldLine });
    if (newLine.trim()) diff.push({ type: "add", text: newLine });
  }
  return diff.slice(0, 120);
}

export function createApprovalDraft(params: {
  target: string;
  reason: string;
  before: string;
  after: string;
  risk?: ApprovalDraft["risk"];
  changes?: ApprovalChange[];
  rollback?: string;
  at?: number;
}): ApprovalDraft {
  return {
    id: `approval-${uid()}`,
    createdAt: params.at ?? Date.now(),
    status: "draft",
    target: params.target,
    reason: params.reason,
    before: params.before,
    after: params.after,
    diff: buildLineDiff(params.before, params.after),
    risk: params.risk ?? "medium",
    changes: params.changes,
    rollback: params.rollback,
  };
}

function stripCodeFence(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function normalizeRisk(value: unknown): ApprovalDraft["risk"] {
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

function normalizeChanges(value: unknown): ApprovalChange[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): ApprovalChange | null => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const type = raw.type === "add" || raw.type === "remove" || raw.type === "replace" ? raw.type : "replace";
      const text = String(raw.text || "").trim();
      return text ? { type, text } : null;
    })
    .filter((item): item is ApprovalChange => Boolean(item));
}

export function extractApprovalDraftsFromText(text: string): ApprovalDraft[] {
  const matches = [...(text || "").matchAll(/<approval-draft>([\s\S]*?)<\/approval-draft>/gi)];
  return matches
    .map((match) => {
      try {
        const parsed = JSON.parse(stripCodeFence(match[1])) as Record<string, unknown>;
        const changes = normalizeChanges(parsed.changes);
        const before = String(parsed.before || parsed.before_summary || "").trim();
        const after = String(parsed.after || parsed.after_summary || changes.map((item) => `${item.type}: ${item.text}`).join("\n")).trim();
        return createApprovalDraft({
          target: String(parsed.target || "未指定目标").trim(),
          reason: String(parsed.reason || "AI 提出写入草案").trim(),
          risk: normalizeRisk(parsed.risk),
          before,
          after,
          changes,
          rollback: String(parsed.rollback || "").trim(),
        });
      } catch {
        return null;
      }
    })
    .filter((item): item is ApprovalDraft => Boolean(item));
}

export function renderApprovalDraftMarkdown(draft: ApprovalDraft) {
  const changes = draft.changes?.length
    ? draft.changes.map((item) => `- ${item.type}: ${item.text}`).join("\n")
    : draft.diff.map((line) => `${line.type === "add" ? "+" : line.type === "remove" ? "-" : " "} ${line.text}`).join("\n");
  return `【写入审批草案】
目标：${draft.target}
风险：${draft.risk}
原因：${draft.reason}
状态：${draft.status}

变更：
${changes || "- 无"}

回退：
${draft.rollback || "保留写入前内容即可回退。"}`;
}

export function renderApprovalProtocol() {
  return `【Approval Protocol｜写入审批协议】
当你需要修改任何文件、记忆、长期任务或外部状态时，不要声称已经写入；必须输出写入草案。

草案格式：
<approval-draft>
{
  "target": "目标文件或记忆 bank",
  "reason": "为什么需要写入",
  "risk": "low | medium | high",
  "before_summary": "写入前摘要",
  "after_summary": "写入后摘要",
  "changes": [
    {"type": "add | remove | replace", "text": "具体变更"}
  ],
  "rollback": "如何回退"
}
</approval-draft>

规则：
1. 高风险写入只能给草案，不能要求用户直接执行。
2. 记忆写回只沉淀事实、决策、风险和后续动作。
3. 涉及代码、命令、联网、账号、密钥、泄露源码时必须降级为计划。
4. 未经确认，不要把草案当成已完成状态。`;
}
