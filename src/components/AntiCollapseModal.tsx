// 反崩盘工作台 modal · 一站集成 AI腔扫描 / 一致性 / 声音指纹 / 事实台账 / 指纹管理
import { useEffect, useMemo, useRef, useState } from "react";
import { X, Save, Trash2, Plus, Scan, ShieldCheck, BookOpen, Users, Library } from "lucide-react";
import {
  scanAiTells,
  formatAiTellsReport,
  detectVoiceDrift,
  heuristicContinuityCheck,
  formatContinuityReport,
  loadMemory,
  saveMemory,
  loadFingerprints,
  saveFingerprints,
  createBlankFingerprint,
  getTrustTierLabel,
  type CharacterFingerprint,
  type TrustTier,
  type WorldAxiom,
  type ObligationEntry,
} from "../anti-collapse";

type Tab = "scanner" | "fingerprints" | "memory" | "obligations" | "timeline" | "axioms";

export function AntiCollapseModal({
  open,
  bookId,
  currentChapterNumber,
  currentChapterText,
  onClose,
}: {
  open: boolean;
  bookId: string;
  currentChapterNumber: number;
  currentChapterText: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("scanner");
  const [fingerprints, setFingerprintsState] = useState<CharacterFingerprint[]>([]);
  const [memory, setMemoryState] = useState(() => loadMemory(bookId));
  const [scanInput, setScanInput] = useState(currentChapterText);
  const [scanReport, setScanReport] = useState("");
  const [editingFp, setEditingFp] = useState<CharacterFingerprint | null>(null);

  const latestChapterTextRef = useRef(currentChapterText);
  useEffect(() => { latestChapterTextRef.current = currentChapterText; }, [currentChapterText]);
  useEffect(() => {
    if (!open) return;
    setFingerprintsState(loadFingerprints(bookId));
    setMemoryState(loadMemory(bookId));
    setScanInput(latestChapterTextRef.current);
    setScanReport("");
  }, [open, bookId]);

  if (!open) return null;

  const persistFingerprints = (next: CharacterFingerprint[]) => {
    setFingerprintsState(next);
    saveFingerprints(bookId, next);
  };
  const persistMemory = (next: typeof memory) => {
    setMemoryState(next);
    saveMemory(next);
  };

  // 扫描
  const runScan = () => {
    if (!scanInput.trim()) {
      setScanReport("请粘贴或确认章节文本后再扫描。");
      return;
    }
    const tells = scanAiTells(scanInput, 1);
    const continuity = heuristicContinuityCheck({
      text: scanInput,
      chapter: currentChapterNumber,
      memory,
      onStageCharacters: fingerprints,
    });
    const drifts = fingerprints.map((fp) => {
      const d = detectVoiceDrift(scanInput, fp);
      return { name: fp.name, score: d.score, issues: d.issues };
    });
    const lines: string[] = [];
    lines.push(formatAiTellsReport(tells));
    lines.push("");
    lines.push(formatContinuityReport(continuity));
    lines.push("");
    lines.push("【声音指纹漂移】");
    if (!drifts.length) lines.push("  （未配置角色指纹，跳过）");
    else
      drifts.forEach((d) => {
        const icon = d.score >= 80 ? "✅" : d.score >= 60 ? "⚠️" : "🛑";
        lines.push(`  ${icon} ${d.name}: ${d.score}/100${d.issues.length ? "  · " + d.issues.join("；") : ""}`);
      });
    setScanReport(lines.join("\n"));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="flex h-[90vh] w-full max-w-6xl flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">反崩盘工作台</h2>
            <span className="text-xs text-slate-500">· 第 {currentChapterNumber} 章 · 白泽 + tian-gong + 千面</span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex shrink-0 gap-1 border-b border-slate-800 px-3 py-2">
          <TabBtn icon={<Scan className="h-3.5 w-3.5" />} label="扫描器" active={tab === "scanner"} onClick={() => setTab("scanner")} />
          <TabBtn icon={<Users className="h-3.5 w-3.5" />} label={`声音指纹 (${fingerprints.length})`} active={tab === "fingerprints"} onClick={() => setTab("fingerprints")} />
          <TabBtn icon={<BookOpen className="h-3.5 w-3.5" />} label={`章节摘要 (${memory.chapterSummaries.length})`} active={tab === "memory"} onClick={() => setTab("memory")} />
          <TabBtn icon={<Library className="h-3.5 w-3.5" />} label={`伏笔 (${memory.obligations.filter((o) => o.status === "active").length})`} active={tab === "obligations"} onClick={() => setTab("obligations")} />
          <TabBtn icon={<Library className="h-3.5 w-3.5" />} label={`时间线 (${memory.timeline.length})`} active={tab === "timeline"} onClick={() => setTab("timeline")} />
          <TabBtn icon={<Library className="h-3.5 w-3.5" />} label={`世界宪法 (${memory.worldAxioms.length})`} active={tab === "axioms"} onClick={() => setTab("axioms")} />
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {tab === "scanner" && (
            <ScannerTab
              scanInput={scanInput}
              setScanInput={setScanInput}
              scanReport={scanReport}
              runScan={runScan}
            />
          )}
          {tab === "fingerprints" && (
            <FingerprintsTab
              fingerprints={fingerprints}
              onChange={persistFingerprints}
              editing={editingFp}
              setEditing={setEditingFp}
            />
          )}
          {tab === "memory" && <ChapterSummariesTab memory={memory} onChange={persistMemory} />}
          {tab === "obligations" && <ObligationsTab memory={memory} onChange={persistMemory} chapter={currentChapterNumber} />}
          {tab === "timeline" && <TimelineTab memory={memory} onChange={persistMemory} chapter={currentChapterNumber} />}
          {tab === "axioms" && <AxiomsTab memory={memory} onChange={persistMemory} />}
        </div>
      </div>
    </div>
  );
}

function TabBtn({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-emerald-500/15 text-emerald-300" : "text-slate-400 hover:bg-slate-800"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// === 扫描器 ===
function ScannerTab({
  scanInput,
  setScanInput,
  scanReport,
  runScan,
}: {
  scanInput: string;
  setScanInput: (v: string) => void;
  scanReport: string;
  runScan: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="flex flex-col">
        <label className="mb-1 text-xs text-slate-400">待扫描章节文本</label>
        <textarea
          value={scanInput}
          onChange={(e) => setScanInput(e.target.value)}
          className="h-[60vh] w-full resize-none rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200 outline-none focus:border-emerald-500"
          placeholder="粘贴或自动带入当前章节正文..."
        />
        <button
          onClick={runScan}
          className="mt-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
        >
          扫描（AI 腔 + 一致性 + 声音）
        </button>
      </div>
      <div className="flex flex-col">
        <label className="mb-1 text-xs text-slate-400">三方审稿报告</label>
        <pre className="h-[60vh] w-full overflow-auto whitespace-pre-wrap rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs leading-relaxed text-slate-300">
          {scanReport || "（尚未扫描，点击左侧按钮）"}
        </pre>
      </div>
    </div>
  );
}

// === 声音指纹库 ===
function FingerprintsTab({
  fingerprints,
  onChange,
  editing,
  setEditing,
}: {
  fingerprints: CharacterFingerprint[];
  onChange: (n: CharacterFingerprint[]) => void;
  editing: CharacterFingerprint | null;
  setEditing: (fp: CharacterFingerprint | null) => void;
}) {
  if (editing) {
    return <FingerprintEditor fp={editing} onCancel={() => setEditing(null)} onSave={(fp) => {
      onChange(fingerprints.some((x) => x.id === fp.id)
        ? fingerprints.map((x) => (x.id === fp.id ? fp : x))
        : [...fingerprints, fp]);
      setEditing(null);
    }} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">为本书登场的关键角色建立"千面对话指纹"——句长 / 口头禅 / 情绪反应 / 三层人格。</p>
        <button
          onClick={() => setEditing(createBlankFingerprint("新角色"))}
          className="flex items-center gap-1 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs text-white hover:bg-emerald-600"
        >
          <Plus className="h-3 w-3" /> 新建指纹
        </button>
      </div>
      {fingerprints.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">
          尚未配置任何角色指纹。新建后，反崩盘扫描器会自动用这些指纹检测"角色趋同 / 声音漂移"。
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {fingerprints.map((fp) => (
            <div key={fp.id} className="rounded-xl border border-slate-700 bg-slate-950/50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-white">{fp.name}</div>
                  <div className="text-[10px] text-slate-500">{fp.pov} · 句长 {fp.sentenceLengthBias}</div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEditing(fp)} className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700">编辑</button>
                  <button
                    onClick={() => {
                      if (window.confirm(`删除指纹「${fp.name}」？`)) onChange(fingerprints.filter((x) => x.id !== fp.id));
                    }}
                    className="rounded-lg bg-red-500/10 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/20"
                  >
                    删除
                  </button>
                </div>
              </div>
              <div className="text-[10px] text-slate-400">
                <div>口头禅：{fp.catchPhrases.join(" / ") || "（无）"}</div>
                <div>禁用：{fp.forbiddenLines.join(" / ") || "（无）"}</div>
                <div>表层：{fp.surfacePersona || "（未填）"}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FingerprintEditor({
  fp,
  onCancel,
  onSave,
}: {
  fp: CharacterFingerprint;
  onCancel: () => void;
  onSave: (fp: CharacterFingerprint) => void;
}) {
  const [draft, setDraft] = useState<CharacterFingerprint>(fp);
  const upd = (patch: Partial<CharacterFingerprint>) => setDraft({ ...draft, ...patch });
  const updPlaybook = (key: keyof CharacterFingerprint["emotionPlaybook"], val: string) =>
    setDraft({ ...draft, emotionPlaybook: { ...draft.emotionPlaybook, [key]: val } });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">编辑指纹</h3>
        <div className="flex gap-2">
          <button onClick={onCancel} className="rounded-xl bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700">取消</button>
          <button onClick={() => onSave(draft)} className="flex items-center gap-1 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs text-white hover:bg-emerald-600">
            <Save className="h-3 w-3" /> 保存
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="姓名" value={draft.name} onChange={(v) => upd({ name: v })} />
        <Field label="别名（以、分隔）" value={(draft.aliases || []).join("、")} onChange={(v) => upd({ aliases: v.split("、").map((s) => s.trim()).filter(Boolean) })} />
        <SelectField label="视角定位" value={draft.pov} onChange={(v) => upd({ pov: v as CharacterFingerprint["pov"] })} options={[
          { value: "protagonist", label: "主角" }, { value: "deuteragonist", label: "副主角" }, { value: "antagonist", label: "反派" }, { value: "side", label: "配角" },
        ]} />
        <Field label="别人称呼" value={draft.knownAs} onChange={(v) => upd({ knownAs: v })} />
        <SelectField label="句长偏好" value={draft.sentenceLengthBias} onChange={(v) => upd({ sentenceLengthBias: v as CharacterFingerprint["sentenceLengthBias"] })} options={[
          { value: "short", label: "短促" }, { value: "mixed", label: "长短交错" }, { value: "long", label: "连绵长句" },
        ]} />
        <Field label="内心 OS 占比 (0-1)" value={String(draft.innerVoiceRatio)} onChange={(v) => upd({ innerVoiceRatio: Math.max(0, Math.min(1, Number(v) || 0)) })} />
        <Field label="句式偏好（以、分隔）" value={draft.speechPatterns.join("、")} onChange={(v) => upd({ speechPatterns: v.split("、").map((s) => s.trim()).filter(Boolean) })} />
        <Field label="口头禅（以、分隔，2-3 条）" value={draft.catchPhrases.join("、")} onChange={(v) => upd({ catchPhrases: v.split("、").map((s) => s.trim()).filter(Boolean) })} />
        <Field label="禁用表达（以、分隔）" value={draft.forbiddenLines.join("、")} onChange={(v) => upd({ forbiddenLines: v.split("、").map((s) => s.trim()).filter(Boolean) })} />
        <Field label="OS 格式" value={draft.innerVoiceFormat} onChange={(v) => upd({ innerVoiceFormat: v })} />
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-bold text-slate-300">情绪 × 反应矩阵</h4>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <Field label="愤怒时" value={draft.emotionPlaybook.anger} onChange={(v) => updPlaybook("anger", v)} />
          <Field label="喜悦时" value={draft.emotionPlaybook.joy} onChange={(v) => updPlaybook("joy", v)} />
          <Field label="恐惧时" value={draft.emotionPlaybook.fear} onChange={(v) => updPlaybook("fear", v)} />
          <Field label="冷静时" value={draft.emotionPlaybook.calm} onChange={(v) => updPlaybook("calm", v)} />
          <Field label="悲痛时（可选）" value={draft.emotionPlaybook.grief || ""} onChange={(v) => updPlaybook("grief", v)} />
          <Field label="羞愧时（可选）" value={draft.emotionPlaybook.shame || ""} onChange={(v) => updPlaybook("shame", v)} />
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-bold text-slate-300">三层人格</h4>
        <Field label="表层（外人见）" value={draft.surfacePersona} onChange={(v) => upd({ surfacePersona: v })} />
        <Field label="中层（独处时）" value={draft.privatePersona} onChange={(v) => upd({ privatePersona: v })} />
        <Field label="深层（极端处境）" value={draft.extremePersona} onChange={(v) => upd({ extremePersona: v })} />
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-500"
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

// === 章节摘要 ===
function ChapterSummariesTab({ memory, onChange }: { memory: ReturnType<typeof loadMemory>; onChange: (m: ReturnType<typeof loadMemory>) => void }) {
  const sorted = useMemo(() => [...memory.chapterSummaries].sort((a, b) => a.chapter - b.chapter), [memory]);
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">章节摘要由"章后编年史官"自动生成或手动录入。trust=silver 表示待审，可升 gold（编入宪法层）或降 gray（不参与跨章引用）。</p>
      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">
          尚无章节摘要。写完章节后，可在 AI 聊天中调用「白泽 · 章后编年史官」Skill 生成 JSON，然后导入。
        </div>
      ) : sorted.map((s) => (
        <div key={s.chapter} className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 text-xs text-slate-300">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white">第 {s.chapter} 章 · {s.title}</span>
            <div className="flex items-center gap-1">
              <TrustBadge trust={s.trust} onChange={(t) => onChange({ ...memory, chapterSummaries: memory.chapterSummaries.map((x) => (x.chapter === s.chapter ? { ...x, trust: t } : x)) })} />
              <button onClick={() => {
                if (window.confirm(`删除第 ${s.chapter} 章摘要？`)) onChange({ ...memory, chapterSummaries: memory.chapterSummaries.filter((x) => x.chapter !== s.chapter) });
              }} className="rounded-lg p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="h-3 w-3" /></button>
            </div>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">钩子：{s.oneLineHook}</div>
          <div className="text-[11px] text-slate-400">节拍：{s.beats.join(" → ")}</div>
          <div className="text-[11px] text-slate-400">新事实：{s.newFactsLearned.join("；") || "无"}</div>
          <div className="text-[11px] text-slate-400">留扣：{s.unresolvedThreads.join("；") || "无"}</div>
          <div className="text-[11px] text-slate-400">情绪曲线：{s.emotionCurve}{s.growthDelta ? ` · 成长：${s.growthDelta}` : ""}</div>
        </div>
      ))}
    </div>
  );
}

// === 伏笔台账 ===
function ObligationsTab({ memory, onChange, chapter }: { memory: ReturnType<typeof loadMemory>; onChange: (m: ReturnType<typeof loadMemory>) => void; chapter: number }) {
  const [draft, setDraft] = useState<Partial<ObligationEntry>>({ type: "foreshadow", setupChapter: chapter, status: "active" });
  const add = () => {
    if (!draft.setupText) return;
    const entry: ObligationEntry = {
      id: "ob-" + Math.random().toString(36).slice(2, 9),
      type: draft.type as ObligationEntry["type"] || "foreshadow",
      setupChapter: Number(draft.setupChapter) || chapter,
      setupText: draft.setupText,
      expectedPayoffChapter: draft.expectedPayoffChapter ? Number(draft.expectedPayoffChapter) : undefined,
      status: "active",
    };
    onChange({ ...memory, obligations: [...memory.obligations, entry] });
    setDraft({ type: "foreshadow", setupChapter: chapter, status: "active" });
  };
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3">
        <div className="mb-2 text-xs font-bold text-slate-300">新增伏笔</div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <SelectField label="类型" value={draft.type || "foreshadow"} onChange={(v) => setDraft({ ...draft, type: v as ObligationEntry["type"] })} options={[
            { value: "foreshadow", label: "伏笔" }, { value: "promise", label: "承诺" }, { value: "secret", label: "秘密" },
            { value: "deadline", label: "期限" }, { value: "debt", label: "债务" }, { value: "oath", label: "誓言" },
          ]} />
          <Field label="设笔章节" value={String(draft.setupChapter || chapter)} onChange={(v) => setDraft({ ...draft, setupChapter: Number(v) })} />
          <Field label="预计兑现章节" value={String(draft.expectedPayoffChapter || "")} onChange={(v) => setDraft({ ...draft, expectedPayoffChapter: v ? Number(v) : undefined })} />
          <button onClick={add} className="flex items-center justify-center gap-1 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs text-white hover:bg-emerald-600"><Plus className="h-3 w-3" /> 添加</button>
        </div>
        <Field label="描述" value={draft.setupText || ""} onChange={(v) => setDraft({ ...draft, setupText: v })} />
      </div>
      {memory.obligations.map((o) => (
        <div key={o.id} className="flex items-start justify-between gap-2 rounded-xl border border-slate-700 bg-slate-950/50 p-3 text-xs">
          <div>
            <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">{o.type}</span>
            <span className={`ml-2 text-[10px] ${o.status === "active" ? "text-emerald-400" : o.status === "overdue" ? "text-red-400" : o.status === "paid" ? "text-slate-500" : "text-amber-400"}`}>{o.status}</span>
            <div className="mt-1 text-slate-300">第 {o.setupChapter} 章设：{o.setupText}</div>
            {o.expectedPayoffChapter && <div className="text-[10px] text-slate-500">预计第 {o.expectedPayoffChapter} 章兑现</div>}
          </div>
          <div className="flex shrink-0 gap-1">
            <button onClick={() => onChange({ ...memory, obligations: memory.obligations.map((x) => x.id === o.id ? { ...x, status: x.status === "active" ? "paid" : "active" } : x) })} className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700">
              {o.status === "active" ? "标记已兑现" : "重新激活"}
            </button>
            <button onClick={() => {
              if (window.confirm("删除该伏笔？")) onChange({ ...memory, obligations: memory.obligations.filter((x) => x.id !== o.id) });
            }} className="rounded-lg p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="h-3 w-3" /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

// === 时间线 ===
function TimelineTab({ memory, onChange, chapter }: { memory: ReturnType<typeof loadMemory>; onChange: (m: ReturnType<typeof loadMemory>) => void; chapter: number }) {
  const [draft, setDraft] = useState({ inStoryTime: "", event: "", participants: "", consequences: "" });
  const add = () => {
    if (!draft.event) return;
    onChange({
      ...memory,
      timeline: [...memory.timeline, {
        id: "t-" + Math.random().toString(36).slice(2, 9),
        chapter,
        inStoryTime: draft.inStoryTime,
        event: draft.event,
        participants: draft.participants.split("、").map((s) => s.trim()).filter(Boolean),
        consequences: draft.consequences.split("、").map((s) => s.trim()).filter(Boolean),
        trust: "silver",
      }],
    });
    setDraft({ inStoryTime: "", event: "", participants: "", consequences: "" });
  };
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 space-y-2">
        <div className="text-xs font-bold text-slate-300">新增时间线锁</div>
        <Field label="故事内时间（如「开元三年春·辰时」）" value={draft.inStoryTime} onChange={(v) => setDraft({ ...draft, inStoryTime: v })} />
        <Field label="事件" value={draft.event} onChange={(v) => setDraft({ ...draft, event: v })} />
        <Field label="参与者（以、分隔）" value={draft.participants} onChange={(v) => setDraft({ ...draft, participants: v })} />
        <Field label="后果（以、分隔，写明不可逆事项如「死亡 / 物品销毁」）" value={draft.consequences} onChange={(v) => setDraft({ ...draft, consequences: v })} />
        <button onClick={add} className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs text-white hover:bg-emerald-600">+ 添加</button>
      </div>
      {memory.timeline.map((t) => (
        <div key={t.id} className="flex items-start justify-between gap-2 rounded-xl border border-slate-700 bg-slate-950/50 p-3 text-xs">
          <div>
            <div className="text-slate-300">[{t.inStoryTime || "未填"}|第{t.chapter}章] {t.event}</div>
            <div className="text-[10px] text-slate-500">参与：{t.participants.join("、") || "—"} · 后果：{t.consequences.join("；") || "—"}</div>
          </div>
          <div className="flex shrink-0 gap-1">
            <TrustBadge trust={t.trust} onChange={(tr) => onChange({ ...memory, timeline: memory.timeline.map((x) => x.id === t.id ? { ...x, trust: tr } : x) })} />
            <button onClick={() => {
              if (window.confirm("删除该时间线锁？")) onChange({ ...memory, timeline: memory.timeline.filter((x) => x.id !== t.id) });
            }} className="rounded-lg p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="h-3 w-3" /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

// === 世界宪法 ===
function AxiomsTab({ memory, onChange }: { memory: ReturnType<typeof loadMemory>; onChange: (m: ReturnType<typeof loadMemory>) => void }) {
  const [draft, setDraft] = useState<Partial<WorldAxiom>>({ category: "power-system", rule: "", trust: "gold" });
  const add = () => {
    if (!draft.rule) return;
    onChange({
      ...memory,
      worldAxioms: [...memory.worldAxioms, {
        id: "ax-" + Math.random().toString(36).slice(2, 9),
        category: draft.category as WorldAxiom["category"] || "other",
        rule: draft.rule,
        trust: (draft.trust || "gold") as TrustTier,
      }],
    });
    setDraft({ category: "power-system", rule: "", trust: "gold" });
  };
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 space-y-2">
        <div className="text-xs font-bold text-slate-300">新增世界宪法</div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <SelectField label="分类" value={draft.category || "other"} onChange={(v) => setDraft({ ...draft, category: v as WorldAxiom["category"] })} options={[
            { value: "power-system", label: "力量体系" }, { value: "geography", label: "地理" }, { value: "society", label: "社会" },
            { value: "tech", label: "科技/灵气" }, { value: "currency", label: "货币" }, { value: "timeline", label: "时间线" }, { value: "other", label: "其他" },
          ]} />
          <SelectField label="信任级" value={draft.trust || "gold"} onChange={(v) => setDraft({ ...draft, trust: v as TrustTier })} options={[
            { value: "gold", label: "🟡 金·宪法层" }, { value: "silver", label: "⚪ 银·已审核" }, { value: "gray", label: "🩶 灰·待审" }, { value: "red", label: "🔴 红·废弃" },
          ]} />
        </div>
        <Field label="规则" value={draft.rule || ""} onChange={(v) => setDraft({ ...draft, rule: v })} />
        <button onClick={add} className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs text-white hover:bg-emerald-600">+ 添加</button>
      </div>
      {memory.worldAxioms.map((a) => (
        <div key={a.id} className="flex items-start justify-between gap-2 rounded-xl border border-slate-700 bg-slate-950/50 p-3 text-xs">
          <div>
            <div className="text-[10px] text-slate-500">{a.category}</div>
            <div className="text-slate-300">{a.rule}</div>
          </div>
          <div className="flex shrink-0 gap-1">
            <TrustBadge trust={a.trust} onChange={(t) => onChange({ ...memory, worldAxioms: memory.worldAxioms.map((x) => x.id === a.id ? { ...x, trust: t } : x) })} />
            <button onClick={() => {
              if (window.confirm("删除？")) onChange({ ...memory, worldAxioms: memory.worldAxioms.filter((x) => x.id !== a.id) });
            }} className="rounded-lg p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="h-3 w-3" /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

function TrustBadge({ trust, onChange }: { trust: TrustTier; onChange: (t: TrustTier) => void }) {
  return (
    <select
      value={trust}
      onChange={(e) => onChange(e.target.value as TrustTier)}
      className="rounded-md border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px] text-slate-300"
      title="trust 信任级"
    >
      {(["gold", "silver", "gray", "red"] as const).map((t) => (
        <option key={t} value={t}>{getTrustTierLabel(t)}</option>
      ))}
    </select>
  );
}
