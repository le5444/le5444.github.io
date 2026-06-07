// 编年史官 chronicler · 章后事实抽取与归档
// 任务：写完一章后，把"新揭示的事实/状态变化/技能使用/新设伏笔/兑现伏笔/不可逆事件"
//      从章节文本中抽取并归档为 silver 信任级（待审），通过用户确认升 gold。
//
// 这里提供两种实现：
//  1) 启发式抽取（无需 AI 调用，立即可用）
//  2) AI 提示模板（让模型按 JSON Schema 回答，由调用方喂给 sendRawChat）
import type {
  ChapterSummary,
  ObligationEntry,
  TimelineEntry,
  CharacterStateSnapshot,
} from "./types";

// === 1. 启发式抽取（兜底） ===
export interface HeuristicChronicleResult {
  oneLineHook: string;
  beats: string[];
  newFactsLearned: string[];
  unresolvedThreads: string[];
  emotionCurve: string;
}

export function heuristicChronicle(text: string, title: string): HeuristicChronicleResult {
  const paras = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);

  // 一句话钩子：取第一段最有冲击力的一句（含动词 + 短）
  const firstPara = paras[0] || "";
  const sentences = firstPara.split(/[。！？]/).filter((s) => s.length > 5 && s.length < 60);
  const oneLineHook = sentences[0] || title;

  // 节拍：取每 1/5 长度处的关键句作为节拍锚
  const beats: string[] = [];
  const step = Math.max(1, Math.floor(paras.length / 5));
  for (let i = 0; i < paras.length; i += step) {
    const p = paras[i];
    const s = p.split(/[。！？]/).find((x) => x.length > 8 && x.length < 40);
    if (s) beats.push(s.trim());
    if (beats.length >= 5) break;
  }

  // 新事实：包含"原来/竟然/居然/才知道/才发现"的句子
  const newFacts: string[] = [];
  const factPattern = /[^。！？\n]{6,60}(?:原来|竟然|居然|才知道|才发现|这才明白|这才意识到)[^。！？\n]{0,60}[。！？]/g;
  let m: RegExpExecArray | null;
  while ((m = factPattern.exec(text)) !== null) {
    newFacts.push(m[0].trim());
    if (newFacts.length >= 6) break;
  }

  // 留扣：含"未完/未说/没敢/还没/留待/改日/下次/暗中"的句子
  const threads: string[] = [];
  const threadPattern = /[^。！？\n]{6,60}(?:未完|没敢|还没|留待|改日|下次|暗中|藏在|没告诉|没说出口)[^。！？\n]{0,40}[。！？]/g;
  while ((m = threadPattern.exec(text)) !== null) {
    threads.push(m[0].trim());
    if (threads.length >= 5) break;
  }

  // 情绪曲线：简单粗暴地数情绪词分布
  const emotionMarkers: { name: string; pattern: RegExp }[] = [
    { name: "紧张", pattern: /紧张|心跳|屏息|攥紧|警觉/g },
    { name: "悲伤", pattern: /泪|哽咽|沉默|压低|低头/g },
    { name: "愤怒", pattern: /怒|喝|吼|拍|砸|逼近/g },
    { name: "平静", pattern: /平静|淡淡|缓缓|从容|稳/g },
    { name: "喜悦", pattern: /笑|轻快|跳|哼|抬头/g },
  ];
  const emotionCounts = emotionMarkers.map((em) => ({
    name: em.name,
    count: (text.match(em.pattern) || []).length,
  }));
  emotionCounts.sort((a, b) => b.count - a.count);
  const top = emotionCounts.filter((e) => e.count > 0).slice(0, 3);
  const emotionCurve = top.length ? top.map((e) => `${e.name}(${e.count})`).join(" → ") : "未检出明显情绪";

  return { oneLineHook, beats, newFactsLearned: newFacts, unresolvedThreads: threads, emotionCurve };
}

// === 2. AI 抽取提示模板 ===
// 调用方应将本提示连同章节文本发给 sendRawChat，要求模型返回严格 JSON
export function buildChroniclerPrompt(text: string, chapter: number, title: string): string {
  return `你是【白泽·编年史官】，刚刚完成第 ${chapter} 章《${title}》的写作审计。
请只输出严格 JSON（不要 markdown 包裹、不要解释），结构如下：

{
  "oneLineHook": "一句话本章钩子（不超过 30 字）",
  "beats": ["节拍1", "节拍2", "节拍3", "节拍4", "节拍5"],
  "charactersOnStage": ["出场角色名1", "角色名2", ...],
  "newFactsLearned": ["读者本章新知信息1", ...],
  "unresolvedThreads": ["本章设下/未兑现的扣子1", ...],
  "emotionCurve": "本章情绪曲线（如：警觉→怒火→冷静）",
  "growthDelta": "战力/心智/地位的变化（若无写空字符串）",
  "newTimelineEvents": [
    {
      "inStoryTime": "故事内时间（如「开元三年春·辰时」）",
      "event": "事件简述",
      "participants": ["参与者"],
      "consequences": ["后果1", "后果2"],
      "irreversible": true
    }
  ],
  "newObligationsSet": [
    {
      "type": "foreshadow|promise|secret|deadline|debt|oath",
      "setupText": "本章设下的扣子描述",
      "expectedPayoffChapter": 50
    }
  ],
  "obligationsPaidThisChapter": ["已兑现的伏笔的简短描述（用于匹配）", ...],
  "characterStateChanges": [
    {
      "name": "角色名",
      "emotion": "本章结束时的情绪",
      "body": "身体状态",
      "justExperienced": "刚经历的关键事件",
      "currentGoal": "当前目标",
      "location": "所在位置",
      "newKnownInformation": ["本章后新知道的信息"]
    }
  ]
}

==== 章节正文（${text.length} 字）====
${text}
==== 正文结束 ====

只输出 JSON。`;
}

export interface ChroniclerExtraction {
  oneLineHook: string;
  beats: string[];
  charactersOnStage: string[];
  newFactsLearned: string[];
  unresolvedThreads: string[];
  emotionCurve: string;
  growthDelta?: string;
  newTimelineEvents: Array<{
    inStoryTime: string;
    event: string;
    participants: string[];
    consequences: string[];
    irreversible: boolean;
  }>;
  newObligationsSet: Array<{
    type: ObligationEntry["type"];
    setupText: string;
    expectedPayoffChapter?: number;
  }>;
  obligationsPaidThisChapter: string[];
  characterStateChanges: Array<{
    name: string;
    emotion: string;
    body: string;
    justExperienced: string;
    currentGoal: string;
    location: string;
    newKnownInformation: string[];
  }>;
}

// 解析 AI 返回的 JSON（容错：剥除 ```json 包裹）
export function parseChroniclerResponse(raw: string): ChroniclerExtraction | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    const j = JSON.parse(cleaned);
    return {
      oneLineHook: j.oneLineHook || "",
      beats: Array.isArray(j.beats) ? j.beats : [],
      charactersOnStage: Array.isArray(j.charactersOnStage) ? j.charactersOnStage : [],
      newFactsLearned: Array.isArray(j.newFactsLearned) ? j.newFactsLearned : [],
      unresolvedThreads: Array.isArray(j.unresolvedThreads) ? j.unresolvedThreads : [],
      emotionCurve: j.emotionCurve || "",
      growthDelta: j.growthDelta || "",
      newTimelineEvents: Array.isArray(j.newTimelineEvents) ? j.newTimelineEvents : [],
      newObligationsSet: Array.isArray(j.newObligationsSet) ? j.newObligationsSet : [],
      obligationsPaidThisChapter: Array.isArray(j.obligationsPaidThisChapter)
        ? j.obligationsPaidThisChapter
        : [],
      characterStateChanges: Array.isArray(j.characterStateChanges) ? j.characterStateChanges : [],
    };
  } catch {
    return null;
  }
}

// 把 ChroniclerExtraction 转换成可写入 MemoryStore 的结构
export function extractionToChapterSummary(
  e: ChroniclerExtraction,
  chapter: number,
  title: string,
): ChapterSummary {
  return {
    chapter,
    title,
    oneLineHook: e.oneLineHook,
    beats: e.beats,
    charactersOnStage: e.charactersOnStage,
    newFactsLearned: e.newFactsLearned,
    unresolvedThreads: e.unresolvedThreads,
    emotionCurve: e.emotionCurve,
    growthDelta: e.growthDelta,
    trust: "silver", // chronicler 抽取的章后摘要默认 silver（待用户确认升 gold）
  };
}

export function extractionToTimelineEntries(
  e: ChroniclerExtraction,
  chapter: number,
  idGen: () => string,
): TimelineEntry[] {
  return e.newTimelineEvents.map((ev) => ({
    id: "timeline-" + idGen(),
    chapter,
    inStoryTime: ev.inStoryTime,
    event: ev.event,
    participants: ev.participants,
    consequences: ev.consequences,
    trust: ev.irreversible ? "silver" : "gray",
  }));
}

export function extractionToObligations(
  e: ChroniclerExtraction,
  chapter: number,
  idGen: () => string,
): ObligationEntry[] {
  return e.newObligationsSet.map((ob) => ({
    id: "ob-" + idGen(),
    type: ob.type,
    setupChapter: chapter,
    setupText: ob.setupText,
    expectedPayoffChapter: ob.expectedPayoffChapter,
    status: "active" as const,
  }));
}

export function extractionToStateSnapshots(
  e: ChroniclerExtraction,
  chapter: number,
): Record<string, CharacterStateSnapshot> {
  const map: Record<string, CharacterStateSnapshot> = {};
  e.characterStateChanges.forEach((c) => {
    map[c.name] = {
      chapter: chapter + 1, // 下一章前的状态快照
      emotion: c.emotion,
      body: c.body,
      justExperienced: c.justExperienced,
      currentGoal: c.currentGoal,
      relations: {},
      knownInformation: c.newKnownInformation,
      unknownInformation: [],
      location: c.location,
    };
  });
  return map;
}
