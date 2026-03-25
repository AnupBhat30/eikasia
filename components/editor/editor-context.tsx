"use client";

import * as React from "react";

import {
  createRecommendedGrainLayer,
  DEFAULT_ADJUSTMENTS,
  DEFAULT_CROP,
  MAX_HISTORY,
  createInitialProjectState,
  getLookDefinition,
  getPerspectiveForPreset,
  normalizeLookAdjustments,
} from "@/components/editor/constants";
import type {
  AcrosChannel,
  AdjustmentKey,
  CropPoint,
  EditorTabId,
  OverlayLayer,
  OverlayType,
  ProjectState,
  TextLayer,
} from "@/components/editor/types";

interface HistoryState {
  past: ProjectState[];
  present: ProjectState;
  future: ProjectState[];
}

type ProjectAction =
  | { type: "reset-project" }
  | { type: "set-image"; imageSrc: string | null; imageName: string | null }
  | { type: "set-look"; lookId: string | null }
  | { type: "set-filter-intensity"; value: number }
  | { type: "set-acros-channel"; value: AcrosChannel }
  | { type: "set-adjustment"; key: AdjustmentKey; value: number }
  | { type: "reset-adjustment"; key: AdjustmentKey }
  | { type: "add-text-layer"; layer: TextLayer }
  | { type: "update-text-layer"; id: string; updates: Partial<TextLayer> }
  | { type: "remove-text-layer"; id: string }
  | { type: "set-text-layers"; layers: TextLayer[] }
  | { type: "upsert-overlay"; layer: OverlayLayer; replaceByType?: boolean }
  | { type: "remove-overlay"; id?: string; overlayType?: OverlayType }
  | { type: "set-crop-rotation"; value: number }
  | { type: "toggle-flip"; axis: "x" | "y" }
  | { type: "set-crop-preset"; presetId: string }
  | { type: "set-crop-perspective"; value: ProjectState["crop"]["perspective"] }
  | { type: "set-crop-point"; point: keyof ProjectState["crop"]["perspective"]; value: CropPoint }
  | { type: "reset-crop" }
  | { type: "undo" }
  | { type: "redo" };

interface EditorContextValue {
  project: ProjectState;
  activeTab: EditorTabId;
  selectedTextId: string | null;
  exportFormat: "png" | "jpeg";
  exportQuality: number;
  canUndo: boolean;
  canRedo: boolean;
  setActiveTab: (tab: EditorTabId) => void;
  setSelectedTextId: (id: string | null) => void;
  setExportFormat: (format: "png" | "jpeg") => void;
  setExportQuality: (quality: number) => void;
  setImage: (imageSrc: string | null, imageName: string | null) => void;
  resetProject: () => void;
  setLook: (lookId: string | null) => void;
  setFilterIntensity: (value: number) => void;
  setAcrosChannel: (value: AcrosChannel) => void;
  setAdjustment: (key: AdjustmentKey, value: number) => void;
  resetAdjustment: (key: AdjustmentKey) => void;
  addTextLayer: (layer: TextLayer) => void;
  updateTextLayer: (id: string, updates: Partial<TextLayer>) => void;
  removeTextLayer: (id: string) => void;
  setTextLayers: (layers: TextLayer[]) => void;
  upsertOverlay: (layer: OverlayLayer, replaceByType?: boolean) => void;
  removeOverlay: (id?: string, overlayType?: OverlayType) => void;
  setCropRotation: (value: number) => void;
  toggleFlip: (axis: "x" | "y") => void;
  setCropPreset: (presetId: string) => void;
  setCropPerspective: (value: ProjectState["crop"]["perspective"]) => void;
  setCropPoint: (
    point: keyof ProjectState["crop"]["perspective"],
    value: CropPoint,
  ) => void;
  resetCrop: () => void;
  undo: () => void;
  redo: () => void;
}

const EditorContext = React.createContext<EditorContextValue | null>(null);

function pushHistory(history: HistoryState, nextPresent: ProjectState): HistoryState {
  return {
    past: [...history.past, history.present].slice(-MAX_HISTORY),
    present: nextPresent,
    future: [],
  };
}

function projectReducer(history: HistoryState, action: ProjectAction): HistoryState {
  const applyChange = (recipe: (project: ProjectState) => ProjectState) =>
    pushHistory(history, recipe(history.present));

  switch (action.type) {
    case "reset-project":
      return pushHistory(history, createInitialProjectState());
    case "set-image":
      return pushHistory(history, {
        ...createInitialProjectState(),
        imageSrc: action.imageSrc,
        imageName: action.imageName,
      });
    case "set-look":
      if (history.present.activeLookId === action.lookId) {
        return history;
      }

      return applyChange((project) => {
        const look = getLookDefinition(action.lookId);
        const recommendedGrainLayer = look
          ? createRecommendedGrainLayer(
              look.preset.grain,
              project.overlayLayers.find((layer) => layer.type === "grain") ?? null,
            )
          : null;

        return {
          ...project,
          activeLookId: action.lookId,
          filterIntensity: look?.preset.filterIntensity ?? project.filterIntensity,
          adjustments: look
            ? {
                ...DEFAULT_ADJUSTMENTS,
                ...normalizeLookAdjustments(look.preset.adjustments),
              }
            : project.adjustments,
          overlayLayers: recommendedGrainLayer
            ? [
                ...project.overlayLayers.filter((layer) => layer.type !== "grain"),
                recommendedGrainLayer,
              ]
            : project.overlayLayers,
        };
      });
    case "set-filter-intensity":
      if (history.present.filterIntensity === action.value) {
        return history;
      }

      return applyChange((project) => ({
        ...project,
        filterIntensity: action.value,
      }));
    case "set-acros-channel":
      if (history.present.acrosChannel === action.value) {
        return history;
      }

      return applyChange((project) => ({
        ...project,
        acrosChannel: action.value,
      }));
    case "set-adjustment":
      if (history.present.adjustments[action.key] === action.value) {
        return history;
      }

      return applyChange((project) => ({
        ...project,
        adjustments: {
          ...project.adjustments,
          [action.key]: action.value,
        },
      }));
    case "reset-adjustment":
      {
        const activeLook = getLookDefinition(history.present.activeLookId);
        const nextValue =
          activeLook?.preset.adjustments[action.key] ??
          DEFAULT_ADJUSTMENTS[action.key];

        if (history.present.adjustments[action.key] === nextValue) {
          return history;
        }

        return applyChange((project) => ({
          ...project,
          adjustments: {
            ...project.adjustments,
            [action.key]: nextValue,
          },
        }));
      }

    case "add-text-layer":
      return applyChange((project) => ({
        ...project,
        textLayers: [...project.textLayers, action.layer],
      }));
    case "update-text-layer":
      return applyChange((project) => ({
        ...project,
        textLayers: project.textLayers.map((layer) =>
          layer.id === action.id ? { ...layer, ...action.updates } : layer,
        ),
      }));
    case "remove-text-layer":
      return applyChange((project) => ({
        ...project,
        textLayers: project.textLayers.filter((layer) => layer.id !== action.id),
      }));
    case "set-text-layers":
      return applyChange((project) => ({
        ...project,
        textLayers: action.layers,
      }));
    case "upsert-overlay":
      return applyChange((project) => {
        const baseLayers = action.replaceByType
          ? project.overlayLayers.filter((layer) => layer.type !== action.layer.type)
          : project.overlayLayers.filter((layer) => layer.id !== action.layer.id);

        return {
          ...project,
          overlayLayers: [...baseLayers, action.layer],
        };
      });
    case "remove-overlay":
      return applyChange((project) => ({
        ...project,
        overlayLayers: project.overlayLayers.filter((layer) => {
          if (action.id && layer.id === action.id) {
            return false;
          }

          if (action.overlayType && layer.type === action.overlayType) {
            return false;
          }

          return true;
        }),
      }));
    case "set-crop-rotation":
      if (history.present.crop.rotation === action.value) {
        return history;
      }

      return applyChange((project) => ({
        ...project,
        crop: { ...project.crop, rotation: action.value },
      }));
    case "toggle-flip":
      return applyChange((project) => ({
        ...project,
        crop: {
          ...project.crop,
          flipX: action.axis === "x" ? !project.crop.flipX : project.crop.flipX,
          flipY: action.axis === "y" ? !project.crop.flipY : project.crop.flipY,
        },
      }));
    case "set-crop-preset":
      return applyChange((project) => ({
        ...project,
        crop: {
          ...project.crop,
          presetId: action.presetId,
          perspective: getPerspectiveForPreset(action.presetId),
        },
      }));
    case "set-crop-perspective":
      return applyChange((project) => ({
        ...project,
        crop: {
          ...project.crop,
          perspective: action.value,
        },
      }));
    case "set-crop-point":
      return applyChange((project) => ({
        ...project,
        crop: {
          ...project.crop,
          perspective: {
            ...project.crop.perspective,
            [action.point]: action.value,
          },
        },
      }));
    case "reset-crop":
      return applyChange((project) => ({
        ...project,
        crop: structuredClone(DEFAULT_CROP),
      }));
    case "undo":
      if (!history.past.length) {
        return history;
      }

      return {
        past: history.past.slice(0, -1),
        present: history.past[history.past.length - 1],
        future: [history.present, ...history.future],
      };
    case "redo":
      if (!history.future.length) {
        return history;
      }

      return {
        past: [...history.past, history.present].slice(-MAX_HISTORY),
        present: history.future[0],
        future: history.future.slice(1),
      };
    default:
      return history;
  }
}

export function EditorProvider({ children }: { children: React.ReactNode }) {
  const [history, dispatch] = React.useReducer(projectReducer, {
    past: [],
    present: createInitialProjectState(),
    future: [],
  });
  const [activeTab, setActiveTab] = React.useState<EditorTabId>("filters");
  const [selectedTextId, setSelectedTextId] = React.useState<string | null>(null);
  const [exportFormat, setExportFormat] = React.useState<"png" | "jpeg">("jpeg");
  const [exportQuality, setExportQuality] = React.useState(88);

  React.useEffect(() => {
    if (
      selectedTextId &&
      !history.present.textLayers.some((layer) => layer.id === selectedTextId)
    ) {
      setSelectedTextId(null);
    }
  }, [history.present.textLayers, selectedTextId]);

  const dispatchTransition = React.useCallback((action: ProjectAction) => {
    React.startTransition(() => {
      dispatch(action);
    });
  }, []);

  const value = React.useMemo<EditorContextValue>(
    () => ({
      project: history.present,
      activeTab,
      selectedTextId,
      exportFormat,
      exportQuality,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      setActiveTab,
      setSelectedTextId,
      setExportFormat,
      setExportQuality,
      setImage: (imageSrc, imageName) =>
        dispatch({ type: "set-image", imageSrc, imageName }),
      resetProject: () => dispatch({ type: "reset-project" }),
      setLook: (lookId) => dispatchTransition({ type: "set-look", lookId }),
      setFilterIntensity: (value) =>
        dispatchTransition({ type: "set-filter-intensity", value }),
      setAcrosChannel: (value) =>
        dispatchTransition({ type: "set-acros-channel", value }),
      setAdjustment: (key, value) =>
        dispatchTransition({ type: "set-adjustment", key, value }),
      resetAdjustment: (key) =>
        dispatchTransition({ type: "reset-adjustment", key }),
      addTextLayer: (layer) =>
        dispatchTransition({ type: "add-text-layer", layer }),
      updateTextLayer: (id, updates) =>
        dispatchTransition({ type: "update-text-layer", id, updates }),
      removeTextLayer: (id) =>
        dispatchTransition({ type: "remove-text-layer", id }),
      setTextLayers: (layers) =>
        dispatchTransition({ type: "set-text-layers", layers }),
      upsertOverlay: (layer, replaceByType = true) =>
        dispatchTransition({ type: "upsert-overlay", layer, replaceByType }),
      removeOverlay: (id, overlayType) =>
        dispatchTransition({ type: "remove-overlay", id, overlayType }),
      setCropRotation: (value) =>
        dispatchTransition({ type: "set-crop-rotation", value }),
      toggleFlip: (axis) => dispatchTransition({ type: "toggle-flip", axis }),
      setCropPreset: (presetId) =>
        dispatchTransition({ type: "set-crop-preset", presetId }),
      setCropPerspective: (value) =>
        dispatchTransition({ type: "set-crop-perspective", value }),
      setCropPoint: (point, value) =>
        dispatchTransition({ type: "set-crop-point", point, value }),
      resetCrop: () => dispatchTransition({ type: "reset-crop" }),
      undo: () => dispatch({ type: "undo" }),
      redo: () => dispatch({ type: "redo" }),
    }),
    [
      activeTab,
      dispatchTransition,
      exportFormat,
      exportQuality,
      history,
      selectedTextId,
    ],
  );

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  );
}

export function useEditor() {
  const context = React.useContext(EditorContext);

  if (!context) {
    throw new Error("useEditor must be used inside EditorProvider");
  }

  return context;
}
