import { type ApiSettings } from "../store/settings";
import { type BookProject, type LibraryState } from "../store/library";
import { type PromptTemplate } from "../store/workspace";
import { type WritingStats } from "../store/stats";
import { AgentControlCenter } from "./AgentControlCenter";

export function HomePage({
  library,
  customPrompts,
  settings,
  onOpenBook,
  onOpenBookFile,
  onCreateBook,
  onOpenSettings,
  onSettingsChange,
  onOpenOverview,
  onOpenDistillation,
}: {
  library: LibraryState;
  customPrompts: PromptTemplate[];
  settings: ApiSettings;
  recycleBinCount: number;
  stats: WritingStats;
  onStatsChange: () => void;
  onOpenBook: (id: string) => void;
  onOpenBookFile?: (bookId: string, fileId: string) => void;
  onCreateBook: () => void;
  onEditBook: (book: BookProject) => void;
  onDeleteBook: (id: string) => void;
  onUsePromptWithAi: (text: string) => void;
  onOpenSettings: () => void;
  onSettingsChange: (next: ApiSettings) => void;
  onAiGeneratePrompt: () => void;
  onCreatePrompt: () => void;
  onEditPrompt: (p: PromptTemplate) => void;
  onDeletePrompt: (id: string) => void;
  onOpenRecycleBin: () => void;
  onResetDefaults: () => void;
  onOpenOverview?: () => void;
  onOpenDistillation: () => void;
  onExportBackup: () => void;
  onImportBackup: () => void;
  onBack?: () => void;
}) {
  return (
    <div className="min-h-screen overflow-auto bg-slate-950 text-white">
      <AgentControlCenter
        library={library}
        customPrompts={customPrompts}
        settings={settings}
        onCreateBook={onCreateBook}
        onOpenBook={onOpenBook}
        onOpenBookFile={onOpenBookFile}
        onOpenSettings={onOpenSettings}
        onSettingsChange={onSettingsChange}
        onOpenOverview={onOpenOverview}
        onOpenDistillation={onOpenDistillation}
      />
    </div>
  );
}
