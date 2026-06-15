import { type ApiSettings } from "../store/settings";
import { type LibraryState } from "../store/library";
import { type PromptTemplate } from "../store/workspace";
import { AgentControlCenter } from "./AgentControlCenter";

export function HomePage({
  library,
  customPrompts,
  settings,
  onSelectBook,
  onRenameBook,
  onDeleteBook,
  onCreateBook,
  onOpenSettings,
  onSettingsChange,
}: {
  library: LibraryState;
  customPrompts: PromptTemplate[];
  settings: ApiSettings;
  onSelectBook?: (id: string) => void;
  onRenameBook?: (id: string, title: string) => void;
  onDeleteBook?: (id: string, options?: { confirmed?: boolean }) => void;
  onCreateBook: () => void;
  onOpenSettings: () => void;
  onSettingsChange: (next: ApiSettings) => void;
}) {
  return (
    <div className="min-h-screen overflow-auto bg-slate-950 text-white">
      <AgentControlCenter
        library={library}
        customPrompts={customPrompts}
        settings={settings}
        onCreateBook={onCreateBook}
        onSelectBook={onSelectBook}
        onRenameBook={onRenameBook}
        onDeleteBook={onDeleteBook}
        onOpenSettings={onOpenSettings}
        onSettingsChange={onSettingsChange}
      />
    </div>
  );
}
