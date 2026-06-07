// 反崩盘引擎 · 共用类型
// 集大成于：白泽 40 岗约束卡 / 24 岗三级记忆 / A2 五维量化、千面对话指纹 + 真相文件、
//          tian-gong chronicler/continuity-checker、Round9 义务合同

export type TrustTier = "gold" | "silver" | "gray" | "red";
// gold  = 大纲/人设/世界圣典/锁定时间线（不可变，最高宪法）
// silver = 已审核归档的章节/事实（章后 chronicler 通过的）
// gray  = 待审章节/未确认事实（不允许跨章引用）
// red   = 冲突待裁决/已废弃（隔离，禁止使用）

export interface CharacterFingerprint {
  id: string;
  name: string;
  aliases?: string[];
  // 对话指纹
  sentenceLengthBias: "short" | "mixed" | "long";
  speechPatterns: string[];      // 句式偏好 (例：常用反问 / 短促陈述 / 比喻)
  catchPhrases: string[];        // 口头禅 2-3 条
  forbiddenLines: string[];      // 禁用表达 (避免风格漂移)
  // 情绪×反应矩阵：愤怒/兴奋/恐惧/冷静 各自的 "动作+句式"
  emotionPlaybook: {
    anger: string;
    joy: string;
    fear: string;
    calm: string;
    grief?: string;
    shame?: string;
  };
  // 内心 OS 配置
  innerVoiceRatio: number;       // 0-1，OS 占比
  innerVoiceFormat: string;      // 例："斜体" / "圆括号" / "破折号引出"
  // 三层人格
  surfacePersona: string;        // 外人见的样子
  privatePersona: string;        // 独处时
  extremePersona: string;        // 极端处境下
  // 视角与身份
  pov: "protagonist" | "deuteragonist" | "antagonist" | "side";
  knownAs: string;               // 别人怎么称呼他
  // 当前状态快照（每章后更新）
  stateSnapshot?: CharacterStateSnapshot;
}

export interface CharacterStateSnapshot {
  chapter: number;
  emotion: string;               // 当前主导情绪
  body: string;                  // 身体状态（伤/累/饿/孕/...）
  justExperienced: string;       // 上章末刚发生的关键事件
  currentGoal: string;           // 本章/本段目标
  relations: Record<string, string>; // 与在场角色的当前关系
  knownInformation: string[];    // 已知信息（用于反作弊检查）
  unknownInformation: string[];  // 不应该知道的信息（必须拦截）
  location: string;
}

export interface WorldAxiom {
  id: string;
  category: "power-system" | "geography" | "society" | "tech" | "currency" | "timeline" | "other";
  rule: string;
  examples?: string[];
  exceptions?: string[];
  trust: TrustTier;
}

export interface ObligationEntry {
  id: string;
  type: "foreshadow" | "promise" | "secret" | "deadline" | "debt" | "oath";
  setupChapter: number;
  setupText: string;             // 简要描述
  expectedPayoffChapter?: number; // 何时该兑现
  status: "active" | "paid" | "abandoned" | "overdue";
  notes?: string;
}

export interface TimelineEntry {
  id: string;
  chapter: number;
  inStoryTime: string;           // 故事内时间（"第三日辰时"/"开元三年春"）
  event: string;
  participants: string[];
  consequences: string[];
  trust: TrustTier;
}

export interface ChapterSummary {
  chapter: number;
  title: string;
  oneLineHook: string;
  beats: string[];               // 4-6 个主要节拍
  charactersOnStage: string[];
  newFactsLearned: string[];     // 读者新知信息
  unresolvedThreads: string[];   // 留扣
  emotionCurve: string;          // 本章情绪曲线
  growthDelta?: string;          // 战力/心智/地位变化
  trust: TrustTier;
}

// 约束卡：写作前生成的执行合同
export interface ConstraintCard {
  bookId: string;
  chapter: number;
  generatedAt: number;
  // L1 宪法层
  coreSeed: string;              // 本书核心承诺一句话
  // L2 本章细纲
  chapterOutline: string;
  beatPlan: string[];
  targetWordCount: number;
  // L3 出场人物与指纹
  onStageCharacters: CharacterFingerprint[];
  // L4 已用技能/已知信息日志
  skillUsageLog: string[];
  timelineLocks: string[];       // 已死/已销毁/已发生不可逆事件
  // L5 活跃伏笔
  activeObligations: ObligationEntry[];
  // L6 风格参数
  povCharacter: string;
  narrativeDistance: "close" | "medium" | "far";
  paragraphStyle: "short-burst" | "mixed" | "long-immersive";
  exclamationDensity: "low" | "medium" | "high";
  // L7 禁忌
  hardConstraints: string[];     // 必须遵守的负向约束
}

// 五维 AI 腔评分（白泽 A2）
export interface AiTellsReport {
  total: number;                 // 0-100 (越低越好)
  level: "clean" | "light" | "obvious" | "severe";
  dimensions: {
    summarizing: { count: number; samples: string[] };       // 总结性陈述
    analyticAside: { count: number; samples: string[] };     // 分析式旁白
    overModifier: { count: number; samples: string[] };      // 过度修饰
    emotionLabel: { count: number; samples: string[] };      // 情绪标签
    repetitiveSyntax: { count: number; samples: string[] };  // 句式重复
  };
  stockTells: string[];          // 套式身体动作命中（拳头紧握/下巴绷紧/...）
  perChapterRate: {              // 每章频率（用于跨维比较）
    summarizing: number;
    analyticAside: number;
    overModifier: number;
    emotionLabel: number;
    repetitiveSyntax: number;
  };
  suggestions: string[];
}

// 一致性扫描结果
export interface ContinuityIssue {
  severity: "P0" | "P1" | "P2";
  dimension: "timeline" | "character-state" | "geography" | "established-fact" | "skill-usage" | "world-rule" | "obligation";
  claim: string;                 // AI 写出的有问题主张
  conflict: string;              // 与什么冲突
  source: string;                // 冲突源（章节/约束卡字段）
  suggestion: string;
}

export interface ContinuityReport {
  issues: ContinuityIssue[];
  passed: boolean;               // 是否通过（无 P0）
  summary: string;
}

// 成长审计
export interface GrowthAudit {
  chapter: number;
  powerCurve: { expected: string; actual: string; delta: number; verdict: "ok" | "inflation" | "stagnation" };
  mentalCurve: { expected: string; actual: string; verdict: "ok" | "too-mature" | "too-naive" };
  statusCurve: { expected: string; actual: string; verdict: "ok" | "jump" | "stagnation" };
  recommendation: string;
}
