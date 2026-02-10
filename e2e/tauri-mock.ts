import type { Page } from "@playwright/test";

/** Default mock state for the Tauri backend. */
export interface MockState {
  enabled: boolean;
  volume: number;
  activePackId: string;
  packs: Array<{
    id: string;
    name: string;
    author: string;
    description: string;
    source: string | null;
  }>;
  customSlots: Record<
    string,
    Array<{ slot: string; label: string; file_name: string | null }>
  >;
  /** Next id returned by create_custom_pack */
  nextCustomId: string;
}

export const DEFAULT_PACKS = [
  {
    id: "default",
    name: "HHKB",
    author: "KeySound",
    description: "Default",
    source: null,
  },
  {
    id: "my-custom",
    name: "My Custom",
    author: "You",
    description: "",
    source: "user",
  },
  {
    id: "cherry-mx",
    name: "Cherry MX Blue",
    author: "KeySound",
    description: "Clicky",
    source: null,
  },
];

const ALL_SLOTS = [
  { slot: "default", label: "Default Key" },
  { slot: "space", label: "Space" },
  { slot: "enter", label: "Enter" },
  { slot: "modifier", label: "Modifiers" },
  { slot: "backspace", label: "Backspace / Delete" },
];

export function defaultState(): MockState {
  return {
    enabled: true,
    volume: 0.8,
    activePackId: "default",
    packs: [...DEFAULT_PACKS],
    customSlots: {
      "my-custom": ALL_SLOTS.map((s) => ({
        ...s,
        file_name: s.slot === "default" ? "click.wav" : null,
      })),
    },
    nextCustomId: "new-pack-1",
  };
}

/**
 * Inject mock `window.__TAURI_INTERNALS__` before the app scripts run.
 * Call this with `page.addInitScript` or inside `page.route` BEFORE navigating.
 */
export async function injectTauriMock(page: Page, state?: Partial<MockState>) {
  const s: MockState = { ...defaultState(), ...state };

  await page.addInitScript((mockState: MockState) => {
    // Mock the Tauri IPC so `invoke()` resolves with our data
    const state = { ...mockState };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args?: Record<string, unknown>) => {
        switch (cmd) {
          case "get_enabled":
            return state.enabled;
          case "get_volume":
            return state.volume;
          case "get_sound_packs":
            return [...state.packs];
          case "get_active_pack_id":
            return state.activePackId;
          case "toggle_sound":
            state.enabled = !state.enabled;
            return state.enabled;
          case "set_volume":
            state.volume = (args?.volume as number) ?? state.volume;
            return null;
          case "set_active_pack":
            state.activePackId = (args?.packId as string) ?? state.activePackId;
            return null;
          case "play_sound":
            return null;
          case "create_custom_pack": {
            const name = (args?.name as string) ?? "Untitled";
            const id = state.nextCustomId;
            const pack = {
              id,
              name,
              author: "You",
              description: "",
              source: "user",
            };
            // Insert after last user pack (before bundled non-default)
            const firstBundledIdx = state.packs.findIndex(
              (p, i) => i > 0 && p.source !== "user",
            );
            if (firstBundledIdx === -1) {
              state.packs.push(pack);
            } else {
              state.packs.splice(firstBundledIdx, 0, pack);
            }
            state.customSlots[id] = [
              { slot: "default", label: "Default Key", file_name: null },
              { slot: "space", label: "Space", file_name: null },
              { slot: "enter", label: "Enter", file_name: null },
              { slot: "modifier", label: "Modifiers", file_name: null },
              {
                slot: "backspace",
                label: "Backspace / Delete",
                file_name: null,
              },
            ];
            return pack;
          }
          case "import_sound_file": {
            const packId = args?.packId as string;
            const slot = args?.slot as string;
            const filePath = args?.filePath as string;
            const fileName = filePath.replace(/\\/g, "/").split("/").pop()!;
            const slots = state.customSlots[packId];
            if (slots) {
              const s = slots.find((x) => x.slot === slot);
              if (s) s.file_name = fileName;
            }
            return null;
          }
          case "get_custom_pack_slots":
            return [...(state.customSlots[args?.packId as string] ?? [])];
          case "remove_sound_slot": {
            const packId = args?.packId as string;
            const slot = args?.slot as string;
            const slots = state.customSlots[packId];
            if (slots) {
              const s = slots.find((x) => x.slot === slot);
              if (s) s.file_name = null;
            }
            return null;
          }
          case "delete_custom_pack": {
            const packId = args?.packId as string;
            state.packs = state.packs.filter((p) => p.id !== packId);
            delete state.customSlots[packId];
            return null;
          }
          default:
            console.warn(`[tauri-mock] unhandled invoke: ${cmd}`, args);
            return null;
        }
      },
      // Tauri also checks for this to know it's in a Tauri context
      metadata: { currentWindow: { label: "main" } },
    };
  }, s);
}
