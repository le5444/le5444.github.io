import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";

export interface EntityDef {
  id: string;
  name: string;
  summary: string;
}

export interface NovelToolsOptions {
  searchQuery: string;
  aiWords: string[];
  entities: EntityDef[];
  highlightMode: boolean; // false = read mode (hide highlights)
}

const NovelToolsPluginKey = new PluginKey("novelTools");

function findMatches(doc: ProseMirrorNode, regex: RegExp): { from: number; to: number; text: string }[] {
  const matches: { from: number; to: number; text: string }[] = [];
  if (!regex) return matches;

  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      let m;
      while ((m = regex.exec(node.text)) !== null) {
        matches.push({
          from: pos + m.index,
          to: pos + m.index + m[0].length,
          text: m[0],
        });
      }
    }
  });
  return matches;
}

export const NovelToolsExtension = Extension.create<NovelToolsOptions>({
  name: "novelTools",

  addOptions() {
    return {
      searchQuery: "",
      aiWords: [],
      entities: [],
      highlightMode: true,
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: NovelToolsPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr) => {
            const { searchQuery, aiWords, entities, highlightMode } = this.options;
            if (!highlightMode) return DecorationSet.empty;

            const doc = tr.doc;
            const decorations: Decoration[] = [];

            // 1. AI Words Highlight
            if (aiWords.length > 0) {
              // Sort by length descending to match longest words first
              const sortedAiWords = [...aiWords].sort((a, b) => b.length - a.length);
              const escapedWords = sortedAiWords.map(w => w.replace(/[.*+?^$\{}()|[\]\\]/g, "\\$&"));
              const aiRegex = new RegExp(`(${escapedWords.join("|")})`, "g");
              
              const aiMatches = findMatches(doc, aiRegex);
              aiMatches.forEach(m => {
                decorations.push(
                  Decoration.inline(m.from, m.to, {
                    class: "ai-word-highlight border-b-2 border-dotted border-red-500 bg-red-500/10 text-red-200",
                    "data-word": m.text,
                  })
                );
              });
            }

            // 2. Entity Highlight
            if (entities.length > 0) {
              const entityNames = entities.map(e => e.name).sort((a, b) => b.length - a.length);
              const escapedEntities = entityNames.map(w => w.replace(/[.*+?^$\{}()|[\]\\]/g, "\\$&"));
              const entityRegex = new RegExp(`(${escapedEntities.join("|")})`, "g");

              const entityMatches = findMatches(doc, entityRegex);
              entityMatches.forEach(m => {
                const entity = entities.find(e => e.name === m.text);
                if (entity) {
                  decorations.push(
                    Decoration.inline(m.from, m.to, {
                      class: "entity-highlight cursor-pointer border-b-2 border-blue-400 bg-blue-500/10 text-blue-200 transition-colors hover:bg-blue-500/30",
                      "data-entity-id": entity.id,
                      "data-entity-name": entity.name,
                      "data-entity-summary": entity.summary,
                    })
                  );
                }
              });
            }

            // 3. Search Query Highlight
            if (searchQuery.trim().length > 0) {
              const escapedQuery = searchQuery.trim().replace(/[.*+?^$\{}()|[\]\\]/g, "\\$&");
              const searchRegex = new RegExp(escapedQuery, "gi");
              const searchMatches = findMatches(doc, searchRegex);
              searchMatches.forEach(m => {
                decorations.push(
                  Decoration.inline(m.from, m.to, {
                    class: "search-highlight bg-yellow-500/40 text-white rounded px-0.5",
                  })
                );
              });
            }

            return DecorationSet.create(doc, decorations);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
