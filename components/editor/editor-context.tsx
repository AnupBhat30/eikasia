"use client";

import * as React from "react";

import {
  DEFAULT_ADJUSTMENTS,
  DEFAULT_CROP,
  MAX_HISTORY,
  createInitialProjectState,
  getLookDefinition,
  getPerspectiveForPreset,
  resolveLookGrainLayer,
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
import type { ExportTarget } from "@/lib/social-export";

interface HistoryState {
  past: ProjectState[];
  present: ProjectState;
  future: ProjectState[];
  lastMutation: { key: string; at: number } | null;
}

type MutationMeta = { key: string; at: number };

type ProjectAction =
  | { type: "reset-project" }
  | { type: "set-image"; imageSrc: string | null; imageName: string | null }
  | { type: "set-image-dimensions"; width: number; height: number }
  | { type: "set-look"; lookId: string | null }
  | { type: "set-filter-intensity"; value: number; mutation: MutationMeta }
  | { type: "set-acros-channel"; value: AcrosChannel }
  | { type: "set-adjustment"; key: AdjustmentKey; value: number; mutation: MutationMeta }
  | { type: "reset-adjustment"; key: AdjustmentKey }
  | { type: "add-text-layer"; layer: TextLayer }
  | { type: "update-text-layer"; id: string; updates: Partial<TextLayer>; mutation: MutationMeta }
  | { type: "remove-text-layer"; id: string }
  | { type: "set-text-layers"; layers: TextLayer[] }
  | { type: "upsert-overlay"; layer: OverlayLayer; replaceByType?: boolean; mutation: MutationMeta }
  | { type: "remove-overlay"; id?: string; overlayType?: OverlayType }
  | { type: "set-crop-rotation"; value: number; mutation: MutationMeta }
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
  exportTarget: ExportTarget;
  canUndo: boolean;
  canRedo: boolean;
  setActiveTab: (tab: EditorTabId) => void;
  setSelectedTextId: (id: string | null) => void;
  setExportFormat: (format: "png" | "jpeg") => void;
  setExportQuality: (quality: number) => void;
  setExportTarget: (target: ExportTarget) => void;
  setImage: (imageSrc: string | null, imageName: string | null) => void;
  setImageDimensions: (width: number, height: number) => void;
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

const MUTATION_COALESCE_WINDOW_MS = 700;

function pushHistory(
  history: HistoryState,
  nextPresent: ProjectState,
  mutation: MutationMeta | null = null,
): HistoryState {
  const coalesce =
    mutation !== null &&
    history.lastMutation?.key === mutation.key &&
    mutation.at - history.lastMutation.at <= MUTATION_COALESCE_WINDOW_MS;

  return {
    past: coalesce
      ? history.past
      : [...history.past, history.present].slice(-MAX_HISTORY),
    present: nextPresent,
    future: [],
    lastMutation: mutation,
  };
}

function areCropPointsEqual(first: CropPoint, second: CropPoint) {
  return first.x === second.x && first.y === second.y;
}

function areCropPerspectivesEqual(
  first: ProjectState["crop"]["perspective"],
  second: ProjectState["crop"]["perspective"],
) {
  return (
    areCropPointsEqual(first.tl, second.tl) &&
    areCropPointsEqual(first.tr, second.tr) &&
    areCropPointsEqual(first.br, second.br) &&
    areCropPointsEqual(first.bl, second.bl)
  );
}

function projectReducer(history: HistoryState, action: ProjectAction): HistoryState {
  const applyChange = (
    recipe: (project: ProjectState) => ProjectState,
    mutation: MutationMeta | null = null,
  ) => pushHistory(history, recipe(history.present), mutation);

  switch (action.type) {
    case "reset-project":
      return {
        past: [],
        present: createInitialProjectState(),
        future: [],
        lastMutation: null,
      };
    case "set-image":
      return {
        past: [],
        present: {
          ...createInitialProjectState(),
          imageSrc: action.imageSrc,
          imageName: action.imageName,
        },
        future: [],
        lastMutation: null,
      };
    case "set-image-dimensions":
      return {
        ...history,
        present: {
          ...history.present,
          imageWidth: action.width,
          imageHeight: action.height,
        },
        lastMutation: null,
      };
    case "set-look":
      if (history.present.activeLookId === action.lookId) {
        return history;
      }

      return applyChange((project) => {
        const look = getLookDefinition(action.lookId);
        const existingGrainLayer =
          project.overlayLayers.find((layer) => layer.type === "grain") ?? null;
        const nextGrainLayer = resolveLookGrainLayer(
          look,
          existingGrainLayer,
        );

        return {
          ...project,
          activeLookId: action.lookId,
          filterIntensity: look?.preset.filterIntensity ?? 0,
          overlayLayers: nextGrainLayer
            ? [
                ...project.overlayLayers.filter((layer) => layer.type !== "grain"),
                nextGrainLayer,
              ]
            : project.overlayLayers.filter((layer) => layer.type !== "grain"),
        };
      });
    case "set-filter-intensity":
      if (history.present.filterIntensity === action.value) {
        return history;
      }

      return applyChange(
        (project) => ({
          ...project,
          filterIntensity: action.value,
        }),
        action.mutation,
      );
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

      return applyChange(
        (project) => ({
          ...project,
          adjustments: {
            ...project.adjustments,
            [action.key]: action.value,
          },
        }),
        action.mutation,
      );
    case "reset-adjustment":
      {
        // Manual controls are offsets around neutral. The active look is mixed
        // later by resolveEffectiveAdjustments, so using its value here would
        // apply the look twice after pressing reset.
        const nextValue = DEFAULT_ADJUSTMENTS[action.key];

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
      return applyChange(
        (project) => ({
          ...project,
          textLayers: project.textLayers.map((layer) =>
            layer.id === action.id ? { ...layer, ...action.updates } : layer,
          ),
        }),
        action.mutation,
      );
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
      return applyChange(
        (project) => {
          const baseLayers = action.replaceByType
            ? project.overlayLayers.filter((layer) => layer.type !== action.layer.type)
            : project.overlayLayers.filter((layer) => layer.id !== action.layer.id);

          return {
            ...project,
            overlayLayers: [...baseLayers, action.layer],
          };
        },
        action.mutation,
      );
    case "remove-overlay":
      return applyChange((project) => {
        const removesLayer = (layer: ProjectState["overlayLayers"][number]) =>
          Boolean(
            (action.id && layer.id === action.id) ||
              (action.overlayType && layer.type === action.overlayType),
          );
        const removesGrain =
          action.overlayType === "grain" ||
          project.overlayLayers.some(
            (layer) => layer.type === "grain" && removesLayer(layer),
          );

        return {
          ...project,
          adjustments: removesGrain
            ? { ...project.adjustments, grainAmount: 0 }
            : project.adjustments,
          overlayLayers: project.overlayLayers.filter(
            (layer) => !removesLayer(layer),
          ),
        };
      });
    case "set-crop-rotation":
      if (history.present.crop.rotation === action.value) {
        return history;
      }

      return applyChange(
        (project) => ({
          ...project,
          crop: { ...project.crop, rotation: action.value },
        }),
        action.mutation,
      );
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
      if (
        history.present.crop.presetId === action.presetId &&
        areCropPerspectivesEqual(
          history.present.crop.perspective,
          getPerspectiveForPreset(
            action.presetId,
            history.present.imageWidth,
            history.present.imageHeight,
          ),
        )
      ) {
        return history;
      }

      return applyChange((project) => ({
        ...project,
        crop: {
          ...project.crop,
          presetId: action.presetId,
          perspective: getPerspectiveForPreset(
            action.presetId,
            project.imageWidth,
            project.imageHeight,
          ),
        },
      }));
    case "set-crop-perspective":
      if (areCropPerspectivesEqual(history.present.crop.perspective, action.value)) {
        return history;
      }

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
      if (
        history.present.crop.presetId === DEFAULT_CROP.presetId &&
        history.present.crop.rotation === DEFAULT_CROP.rotation &&
        history.present.crop.flipX === DEFAULT_CROP.flipX &&
        history.present.crop.flipY === DEFAULT_CROP.flipY &&
        areCropPerspectivesEqual(
          history.present.crop.perspective,
          DEFAULT_CROP.perspective,
        )
      ) {
        return history;
      }

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
        lastMutation: null,
      };
    case "redo":
      if (!history.future.length) {
        return history;
      }

      return {
        past: [...history.past, history.present].slice(-MAX_HISTORY),
        present: history.future[0],
        future: history.future.slice(1),
        lastMutation: null,
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
    lastMutation: null,
  });
  const [activeTab, setActiveTab] = React.useState<EditorTabId>("filters");
  const [requestedSelectedTextId, setSelectedTextId] =
    React.useState<string | null>(null);
  const [exportFormat, setExportFormat] = React.useState<"png" | "jpeg">("jpeg");
  const [exportQuality, setExportQuality] = React.useState(92);
  const [exportTarget, setExportTarget] =
    React.useState<ExportTarget>("instagram-feed");
  const selectedTextId =
    requestedSelectedTextId &&
    history.present.textLayers.some(
      (layer) => layer.id === requestedSelectedTextId,
    )
      ? requestedSelectedTextId
      : null;

  const actions = React.useMemo(
    () => ({
      setActiveTab,
      setSelectedTextId,
      setExportFormat,
      setExportQuality,
      setExportTarget,
      setImage: (imageSrc: string | null, imageName: string | null) =>
        dispatch({ type: "set-image", imageSrc, imageName }),
      setImageDimensions: (width: number, height: number) =>
        dispatch({ type: "set-image-dimensions", width, height }),
      resetProject: () => dispatch({ type: "reset-project" }),
      setLook: (lookId: string | null) =>
        dispatch({ type: "set-look", lookId }),
      setFilterIntensity: (value: number) =>
        dispatch({
          type: "set-filter-intensity",
          value,
          mutation: { key: "filter-intensity", at: Date.now() },
        }),
      setAcrosChannel: (value: ProjectState["acrosChannel"]) =>
        dispatch({ type: "set-acros-channel", value }),
      setAdjustment: (key: AdjustmentKey, value: number) =>
        dispatch({
          type: "set-adjustment",
          key,
          value,
          mutation: { key: `adjustment:${key}`, at: Date.now() },
        }),
      resetAdjustment: (key: AdjustmentKey) =>
        dispatch({ type: "reset-adjustment", key }),
      addTextLayer: (layer: TextLayer) =>
        dispatch({ type: "add-text-layer", layer }),
      updateTextLayer: (id: string, updates: Partial<TextLayer>) =>
        dispatch({
          type: "update-text-layer",
          id,
          updates,
          mutation: { key: `text:${id}`, at: Date.now() },
        }),
      removeTextLayer: (id: string) =>
        dispatch({ type: "remove-text-layer", id }),
      setTextLayers: (layers: TextLayer[]) =>
        dispatch({ type: "set-text-layers", layers }),
      upsertOverlay: (
        layer: OverlayLayer,
        replaceByType: boolean = true,
      ) =>
        dispatch({
          type: "upsert-overlay",
          layer,
          replaceByType,
          mutation: { key: `overlay:${layer.type}:${layer.id}`, at: Date.now() },
        }),
      removeOverlay: (id?: string, overlayType?: OverlayLayer["type"]) =>
        dispatch({ type: "remove-overlay", id, overlayType }),
      setCropRotation: (value: number) =>
        dispatch({
          type: "set-crop-rotation",
          value,
          mutation: { key: "crop:rotation", at: Date.now() },
        }),
      toggleFlip: (axis: "x" | "y") =>
        dispatch({ type: "toggle-flip", axis }),
      setCropPreset: (presetId: string) =>
        dispatch({ type: "set-crop-preset", presetId }),
      setCropPerspective: (value: ProjectState["crop"]["perspective"]) =>
        dispatch({ type: "set-crop-perspective", value }),
      setCropPoint: (
        point: keyof ProjectState["crop"]["perspective"],
        value: CropPoint,
      ) =>
        dispatch({ type: "set-crop-point", point, value }),
      resetCrop: () => dispatch({ type: "reset-crop" }),
      undo: () => dispatch({ type: "undo" }),
      redo: () => dispatch({ type: "redo" }),
    }),
    [],
  );

  const value = React.useMemo<EditorContextValue>(
    () => ({
      project: history.present,
      activeTab,
      selectedTextId,
      exportFormat,
      exportQuality,
      exportTarget,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      ...actions,
    }),
    [
      activeTab,
      actions,
      exportFormat,
      exportQuality,
      exportTarget,
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
