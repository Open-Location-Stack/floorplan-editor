import { useEffect, useMemo, useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { MapCanvas } from "./components/MapCanvas";
import { EditorPanels } from "./features/editor/EditorPanels";
import { createFeature } from "./features/editor/featureFactory";
import { getRuntimeConfig } from "./lib/config/runtimeConfig";
import {
  addFeature,
  createInitialEditorState,
  deleteSelectedFeature,
  type EditorState,
  redo,
  replaceAllFeatures,
  selectFeature,
  undo,
} from "./lib/editor/editorModel";
import { clientLogger } from "./lib/logging/clientLogger";
import { projectRepository } from "./lib/persistence/projectRepository";
import type { FloorFeature, FloorOverlay, ThemeId } from "./lib/types";

const THEME_STORAGE_KEY = "floorplan-editor-theme";
const PROJECT_ID = "default-project";

const isThemeId = (value: string | null): value is ThemeId =>
  value === "qr-light" || value === "qr-dark";

const getInitialTheme = (): ThemeId => {
  if (typeof window === "undefined") {
    return "qr-light";
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (isThemeId(stored)) {
    return stored;
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "qr-dark" : "qr-light";
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

const saveEditorSnapshot = async (
  features: FloorFeature[],
  overlays: FloorOverlay[],
): Promise<void> => {
  await projectRepository.saveProject({
    id: PROJECT_ID,
    name: "Main project",
    version: 1,
    updatedAt: new Date().toISOString(),
    features,
    overlays,
  });
};

function App() {
  const [theme, setTheme] = useState<ThemeId>(() => getInitialTheme());
  const [editorState, setEditorState] = useState<EditorState>(() => createInitialEditorState());
  const [overlays, setOverlays] = useState<FloorOverlay[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const runtimeConfig = getRuntimeConfig();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;

    void projectRepository.loadProject(PROJECT_ID).then((project) => {
      if (cancelled || !project) {
        return;
      }

      setEditorState(createInitialEditorState(project.features));
      setOverlays(project.overlays);
      setSaveStatus("saved");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSaveStatus("saving");
      void saveEditorSnapshot(editorState.features, overlays)
        .then(() => {
          setSaveStatus("saved");
        })
        .catch((error: unknown) => {
          clientLogger.error("persistence.save_failed", { error });
          setSaveStatus("error");
        });
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [editorState.features, overlays]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isMeta = event.ctrlKey || event.metaKey;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        setEditorState((current) => deleteSelectedFeature(current));
        return;
      }

      if (!isMeta) {
        return;
      }

      if (event.key.toLowerCase() === "z" && event.shiftKey) {
        event.preventDefault();
        setEditorState((current) => redo(current));
        return;
      }

      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        setEditorState((current) => undo(current));
        return;
      }

      if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        setEditorState((current) => redo(current));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const selectedFeature = useMemo(
    () => editorState.features.find((feature) => feature.id === editorState.selectedFeatureId),
    [editorState.features, editorState.selectedFeatureId],
  );

  if (!runtimeConfig.ok) {
    return (
      <main className="min-h-screen bg-base-200 p-6">
        <div className="mx-auto max-w-3xl">
          <div className="alert alert-error">
            <div>
              <h1 className="text-lg font-semibold">Configuration error</h1>
              <p>{runtimeConfig.error}</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <ErrorBoundary>
      <main className="min-h-screen bg-base-200 p-4 lg:p-6">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
          <header className="navbar rounded-box bg-base-100 shadow">
            <div className="flex-1">
              <h1 className="text-xl font-semibold">FORMATION Floor Plan Editor</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="badge badge-outline">{saveStatus}</span>
              <label className="swap swap-rotate rounded-box bg-base-200 p-2">
                <input
                  type="checkbox"
                  aria-label="Toggle theme"
                  checked={theme === "qr-dark"}
                  onChange={(event) =>
                    setTheme(event.currentTarget.checked ? "qr-dark" : "qr-light")
                  }
                />
                <span className="swap-on">Dark</span>
                <span className="swap-off">Light</span>
              </label>
            </div>
          </header>

          <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
            <EditorPanels
              features={editorState.features}
              selectedFeatureId={editorState.selectedFeatureId}
              overlays={overlays}
              onSelect={(featureId) =>
                setEditorState((current) => selectFeature(current, featureId))
              }
              onAdd={(kind) =>
                setEditorState((current) => addFeature(current, createFeature(kind)))
              }
              onDeleteSelected={() => setEditorState((current) => deleteSelectedFeature(current))}
              onUndo={() => setEditorState((current) => undo(current))}
              onRedo={() => setEditorState((current) => redo(current))}
              onImport={(features) =>
                setEditorState((current) => replaceAllFeatures(current, features))
              }
              onOverlayChange={(overlay) => setOverlays([overlay])}
            />

            <section className="card bg-base-100 shadow">
              <div className="card-body gap-3">
                <h2 className="card-title text-lg">Map View</h2>
                <MapCanvas
                  maptilerApiKey={runtimeConfig.config.maptilerApiKey}
                  features={editorState.features}
                />
                {selectedFeature ? (
                  <div className="rounded-box bg-base-200 p-3 text-sm">
                    Selected:{" "}
                    <span className="font-semibold">
                      {selectedFeature.properties.name ?? selectedFeature.id}
                    </span>
                  </div>
                ) : (
                  <div className="rounded-box bg-base-200 p-3 text-sm text-base-content/70">
                    Select a feature to inspect it.
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </ErrorBoundary>
  );
}

export default App;
