import {
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import styles from "./App.module.css";
import {
  DEFAULT_GAME_MODE,
  factionRacesForGameMode,
  matchPolicyForGameMode,
  requiresSceneAssetReload,
  type GameMode,
} from "./app/gameMode";
import {
  BATTLE_RACE_LABELS,
  createFactionRaces,
  hasRace,
} from "./game/factions";
import type { BattleRace, Faction, FactionRaces } from "./game/types";
import { CampaignMap } from "./campaign/CampaignMap";
import {
  completeCampaignMission,
  createCampaignBattle,
  evaluateCampaignMission,
  getCampaignFactionRaces,
  getCampaignMission,
  getMissionDeployables,
  loadCampaignProgress,
  saveCampaignProgress,
  type CampaignId,
  type CampaignMission,
} from "./campaign/campaign";
import { DEFAULT_AUDIO_ENABLED } from "./audio/battleAudio";
import { useBattleAudio } from "./audio/useBattleAudio";
import {
  createInitialBattle,
  getBattleMatchClock,
  type BattleState,
  type WorldPoint,
} from "./game/battle";
import {
  advanceBattleSession,
  beginBattleSession,
  type BattlePhase,
  type BattleSessionState,
} from "./game/battleSession";
import {
  deployBattleSessionEntity,
  previewDeployment,
  type DeploymentPreview,
} from "./game/deployTransaction";
import { createArenaBattle } from "./game/arenaBattle";
import {
  createFrostBreathPreviewBattle,
  isFrostBreathPreviewRequest,
} from "./game/frostBreathPreview";
import {
  createFireballPreviewBattle,
  isFireballPreviewRequest,
} from "./game/fireballPreview";
import {
  DEFAULT_AI_DIFFICULTY,
  UNDEAD_TROOP_DESIGNS,
  type AiDifficulty,
  type DeployableKind,
} from "./game/rules";
import { createBenchmarkBattle, type BenchmarkSnapshot } from "./game/benchmark";
import {
  previewSandboxBuildingConstruction,
  startSandboxBuildingConstruction,
  type SandboxBuildingConstructionPreview,
} from "./game/sandboxBattleTransactions";
import {
  sandboxBuildingSpec,
  type SandboxBuildingSlot,
  type SandboxTroopSlot,
} from "./game/sandboxCatalog";
import { sandboxBuildingMissingPrerequisites } from "./game/sandboxConstruction";
import { enqueueSandboxBattleProduction } from "./game/sandboxProductionTransactions";
import {
  issueSandboxSquadOrder,
  type SandboxSquadOrderKind,
  type SandboxSquadOrderTarget,
} from "./game/sandboxOrders";
import { battlefieldDefinitionFor } from "./map/battlefieldDefinition";
import {
  BattlefieldCanvas,
  createSceneInteractionBridge,
} from "./scene/BattlefieldCanvas";
import {
  createCameraViewStore,
  DEFAULT_CAMERA_VIEW,
} from "./scene/camera/cameraViewStore";
import {
  sceneAssetLoadPercentage,
  type SceneAssetLoadProgress,
} from "./scene/loadingProgress";
import {
  DeploymentRail,
  deploymentReasonLabel,
  type DeploymentDragEvent,
} from "./ui/DeploymentRail";
import { AiDifficultySelector } from "./ui/AiDifficultySelector";
import { GameModeSelector } from "./ui/GameModeSelector";
import { FactionRaceSelector } from "./ui/FactionRaceSelector";
import { deployableLabelForRace } from "./ui/deployablePresentation";
import {
  fieldPointerCoordinates,
  fieldPointerDistance,
  pinchZoomFactor,
  pointerDragExceedsThreshold,
  shouldStartFieldPointerInteraction,
  type FieldPoint,
} from "./ui/fieldInput";
import { SandboxMinimap } from "./ui/minimap";
import { SandboxCommandPanel } from "./ui/SandboxCommandPanel";
import { SandboxSquadCommandBar } from "./ui/SandboxSquadCommandBar";
import {
  createSandboxSelectionState,
  pruneSandboxSelection,
  sandboxSelectionBox,
  selectSandboxSquad,
  selectSandboxSquadsInBox,
  transitionSandboxInteraction,
  type SandboxInteractionMode,
  type SandboxSelectionBox,
} from "./ui/sandboxSelection";

interface AppState {
  readonly session: BattleSessionState;
  readonly selectedDeployable: DeployableKind | null;
  readonly feedback: DeploymentFeedback | null;
}

interface DeploymentFeedback {
  readonly tone: "success" | "error" | "info";
  readonly message: string;
}

interface TouchDragState {
  readonly pointerId: number;
  readonly startClient: FieldPoint;
  previousField: FieldPoint;
  dragging: boolean;
}

interface ActiveDeploymentDrag {
  readonly pointerId: number;
  readonly kind: DeployableKind;
}

interface SandboxSelectionDrag {
  readonly pointerId: number;
  readonly startField: FieldPoint;
  readonly additive: boolean;
  currentField: FieldPoint;
  dragging: boolean;
}

interface SandboxCommandMarkerState {
  readonly sequence: number;
  readonly kind: SandboxSquadOrderKind;
  readonly position: WorldPoint;
}

const SIMULATION_STEP_SECONDS = 0.05;
const TOUCH_DRAG_THRESHOLD_PX = 8;
const FEEDBACK_LIFETIME_MS = {
  success: 1800,
  error: 2600,
  info: 2200,
} as const satisfies Readonly<Record<DeploymentFeedback["tone"], number>>;

export function App() {
  const benchmarkMode = useMemo(() => (
    new URLSearchParams(window.location.search).get("benchmark") === "80"
  ), []);
  const frostPreview = useMemo(() => (
    isFrostBreathPreviewRequest(window.location.search)
  ), []);
  const fireballPreview = useMemo(() => (
    isFireballPreviewRequest(window.location.search)
  ), []);
  const initialMode = DEFAULT_GAME_MODE;
  const initialFactionRaces = frostPreview
    ? createFactionRaces({ crimson: "undead" })
    : factionRacesForGameMode(initialMode);
  const [mode, setMode] = useState<GameMode>(initialMode);
  const [factionRaces, setFactionRaces] = useState<FactionRaces>(initialFactionRaces);
  const [difficulty, setDifficulty] = useState<AiDifficulty>(DEFAULT_AI_DIFFICULTY);
  const [campaignProgress, setCampaignProgress] = useState(loadCampaignProgress);
  const [selectedCampaignId, setSelectedCampaignId] = useState<CampaignId>("human");
  const [activeCampaignMissionId, setActiveCampaignMissionId] = useState<string | null>(null);
  const [mobileMatchSetupOpen, setMobileMatchSetupOpen] = useState(false);
  const [app, setApp] = useState<AppState>(() => (
    createAppState(
      benchmarkMode,
      initialMode,
      null,
      frostPreview,
      initialFactionRaces,
      fireballPreview,
    )
  ));
  const { battle, phase: battlePhase } = app.session;
  const battlefieldDefinition = useMemo(
    () => battlefieldDefinitionFor(battle.mapId),
    [battle.mapId],
  );
  const undeadOpponent = factionRaces.crimson === "undead";
  const undeadPlayer = factionRaces.verdant === "undead";
  const hasUndeadTerritory = hasRace(factionRaces, "undead");
  const activeCampaignMission = useMemo(() => (
    activeCampaignMissionId
      ? getCampaignMission(activeCampaignMissionId) ?? null
      : null
  ), [activeCampaignMissionId]);
  const campaignDeployables = useMemo(() => (
    activeCampaignMission
      ? getMissionDeployables(activeCampaignMission, campaignProgress)
      : undefined
  ), [activeCampaignMission, campaignProgress]);
  const [cursorWorld, setCursorWorld] = useState<WorldPoint | null>(null);
  const [selectedSandboxBuilding, setSelectedSandboxBuilding] = useState<
    SandboxBuildingSlot | null
  >(null);
  const [sandboxSelection, setSandboxSelection] = useState(createSandboxSelectionState);
  const [sandboxInteractionMode, setSandboxInteractionMode] = useState<
    SandboxInteractionMode
  >("neutral");
  const [sandboxSelectionRect, setSandboxSelectionRect] = useState<
    SandboxSelectionBox | null
  >(null);
  const [sandboxCommandMarker, setSandboxCommandMarker] = useState<
    SandboxCommandMarkerState | null
  >(null);
  const [cameraResetToken, setCameraResetToken] = useState(0);
  const [battleInstanceRevision, setBattleInstanceRevision] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(DEFAULT_AUDIO_ENABLED);
  const [benchmark, setBenchmark] = useState<BenchmarkSnapshot | null>(null);
  const [assetsReady, setAssetsReady] = useState(false);
  const [assetLoadProgress, setAssetLoadProgress] = useState<SceneAssetLoadProgress>({
    loaded: 0,
    total: 0,
  });
  const [assetLoadError, setAssetLoadError] = useState<string | null>(null);
  const bridgeRef = useRef(createSceneInteractionBridge());
  const battlefieldRef = useRef<HTMLDivElement>(null);
  const activeTouchPointersRef = useRef(new Map<number, FieldPoint>());
  const singleTouchDragRef = useRef<TouchDragState | null>(null);
  const previousPinchDistanceRef = useRef<number | null>(null);
  const suppressTouchDeploymentRef = useRef(false);
  const deploymentDragRef = useRef<ActiveDeploymentDrag | null>(null);
  const deploymentDragReleasePointerRef = useRef<number | null>(null);
  const sandboxSelectionDragRef = useRef<SandboxSelectionDrag | null>(null);
  const nextSandboxCommandMarkerSequence = useRef(1);
  const [deploymentDragActive, setDeploymentDragActive] = useState(false);
  const [deploymentDragOverBattlefield, setDeploymentDragOverBattlefield] = useState(false);
  const cameraViewStore = useMemo(createCameraViewStore, []);
  const clock = getBattleMatchClock(battle);
  const sandboxMode = battle.modeId === "sandbox";
  const armedSandboxOrder = sandboxOrderForInteractionMode(sandboxInteractionMode);
  const deploymentEnabled = !sandboxMode
    && battlePhase === "engaged"
    && battle.winner === null;
  const deploymentPreview = useMemo<DeploymentPreview | null>(() => (
    !sandboxMode && app.selectedDeployable && cursorWorld
      ? previewDeployment(app.session, {
          faction: "verdant",
          kind: app.selectedDeployable,
          worldPosition: cursorWorld,
        })
      : null
  ), [app.selectedDeployable, app.session, cursorWorld, sandboxMode]);
  const sandboxConstructionPreview = useMemo<SandboxBuildingConstructionPreview | null>(() => (
    sandboxMode && selectedSandboxBuilding && cursorWorld
      ? previewSandboxBuildingConstruction(battle, {
          faction: "verdant",
          slot: selectedSandboxBuilding,
          worldPosition: cursorWorld,
        })
      : null
  ), [battle, cursorWorld, sandboxMode, selectedSandboxBuilding]);
  const playUiCue = useBattleAudio({
    battle,
    resetToken: battleInstanceRevision,
    enabled: audioEnabled,
  });

  const battleLoopPhase = mode === "campaign" && !activeCampaignMission
    ? "briefing"
    : assetsReady ? battlePhase : "briefing";
  const opponentDifficulty = activeCampaignMission?.aiDifficulty ?? difficulty;

  useEffect(() => {
    const battlefield = battlefieldRef.current;
    if (!battlefield) return;

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      bridgeRef.current.zoomBy(event.deltaY, event.deltaMode);
    };
    battlefield.addEventListener("wheel", handleWheel, { passive: false });
    return () => battlefield.removeEventListener("wheel", handleWheel);
  }, [activeCampaignMissionId, mode]);
  const campaignResult = activeCampaignMission && battle.winner
    ? evaluateCampaignMission(activeCampaignMission, battle)
    : null;

  useBattleLoop(setApp, battleLoopPhase, opponentDifficulty);

  useEffect(() => {
    saveCampaignProgress(campaignProgress);
  }, [campaignProgress]);

  useEffect(() => {
    if (!activeCampaignMission || !campaignResult?.success) return;
    setCampaignProgress((current) => completeCampaignMission(
      current,
      activeCampaignMission.id,
      campaignResult.stars,
    ));
  }, [activeCampaignMission, campaignResult]);

  useEffect(() => {
    const feedback = app.feedback;
    if (!feedback) return;

    const timeout = window.setTimeout(() => {
      setApp((current) => current.feedback === feedback
        ? { ...current, feedback: null }
        : current);
    }, FEEDBACK_LIFETIME_MS[feedback.tone]);

    return () => window.clearTimeout(timeout);
  }, [app.feedback]);

  useEffect(() => {
    const livingFriendlySquads = new Set(battle.units.flatMap((unit) => (
      unit.faction === "verdant" && unit.health > 0 && unit.status !== "dead"
        ? [unit.squadId]
        : []
    )));
    setSandboxSelection((current) => pruneSandboxSelection(current, livingFriendlySquads));
  }, [battle.units]);

  useEffect(() => {
    if (!sandboxCommandMarker) return;
    const timeout = window.setTimeout(() => setSandboxCommandMarker((current) => (
      current?.sequence === sandboxCommandMarker.sequence ? null : current
    )), 1_100);
    return () => window.clearTimeout(timeout);
  }, [sandboxCommandMarker]);

  useEffect(() => {
    if (sandboxMode && battlePhase === "engaged" && battle.winner === null) return;
    sandboxSelectionDragRef.current = null;
    setSelectedSandboxBuilding(null);
    setCursorWorld(null);
    setSandboxSelectionRect(null);
    setSandboxInteractionMode("neutral");
    if (!sandboxMode || battle.winner !== null) {
      setSandboxSelection(createSandboxSelectionState());
    }
  }, [battle.winner, battlePhase, sandboxMode]);

  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      sandboxSelectionDragRef.current = null;
      setCursorWorld(null);
      setSelectedSandboxBuilding(null);
      setSandboxSelectionRect(null);
      setSandboxInteractionMode("neutral");
      setApp((current) => current.selectedDeployable
        ? {
            ...current,
            selectedDeployable: null,
            feedback: { tone: "info", message: "已取消部署" },
          }
        : selectedSandboxBuilding || armedSandboxOrder
          ? {
              ...current,
              feedback: {
                tone: "info",
                message: selectedSandboxBuilding ? "已取消建造" : "已取消命令",
              },
            }
          : current);
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [armedSandboxOrder, selectedSandboxBuilding]);

  const resetBattle = useCallback(() => {
    deploymentDragRef.current = null;
    setDeploymentDragActive(false);
    setDeploymentDragOverBattlefield(false);
    setSelectedSandboxBuilding(null);
    sandboxSelectionDragRef.current = null;
    setSandboxSelection(createSandboxSelectionState());
    setSandboxSelectionRect(null);
    setSandboxInteractionMode("neutral");
    setSandboxCommandMarker(null);
    setMobileMatchSetupOpen(false);
    setApp(createAppState(
      benchmarkMode,
      mode,
      activeCampaignMission,
      frostPreview,
      factionRaces,
      fireballPreview,
    ));
    setCursorWorld(null);
    setCameraResetToken((current) => current + 1);
    cameraViewStore.publish(DEFAULT_CAMERA_VIEW);
    setBattleInstanceRevision((current) => current + 1);
  }, [
    activeCampaignMission,
    benchmarkMode,
    cameraViewStore,
    factionRaces,
    fireballPreview,
    frostPreview,
    mode,
  ]);

  const changeMode = useCallback((nextMode: GameMode) => {
    if (nextMode === mode) return;
    deploymentDragRef.current = null;
    setDeploymentDragActive(false);
    setDeploymentDragOverBattlefield(false);
    setSelectedSandboxBuilding(null);
    sandboxSelectionDragRef.current = null;
    setSandboxSelection(createSandboxSelectionState());
    setSandboxSelectionRect(null);
    setSandboxInteractionMode("neutral");
    setSandboxCommandMarker(null);
    const reloadSceneAssets = requiresSceneAssetReload(
      mode,
      nextMode,
      activeCampaignMission !== null,
    );
    const nextFactionRaces = nextMode === "campaign"
      ? getCampaignFactionRaces(selectedCampaignId)
      : factionRacesForGameMode(nextMode);
    setMode(nextMode);
    setMobileMatchSetupOpen(false);
    setFactionRaces(nextFactionRaces);
    setActiveCampaignMissionId(null);
    setApp(createAppState(benchmarkMode, nextMode, null, false, nextFactionRaces));
    if (reloadSceneAssets) setAssetsReady(false);
    setAssetLoadProgress({ loaded: 0, total: 0 });
    setAssetLoadError(null);
    setCursorWorld(null);
    setCameraResetToken((current) => current + 1);
    cameraViewStore.publish(DEFAULT_CAMERA_VIEW);
    setBattleInstanceRevision((current) => current + 1);
  }, [activeCampaignMission, benchmarkMode, cameraViewStore, mode, selectedCampaignId]);

  const changeFactionRace = useCallback((faction: Faction, race: BattleRace) => {
    if (battlePhase !== "briefing" || factionRaces[faction] === race) return;
    const nextFactionRaces = createFactionRaces({ ...factionRaces, [faction]: race });
    setFactionRaces(nextFactionRaces);
    setApp(createAppState(
      benchmarkMode,
      mode,
      activeCampaignMission,
      false,
      nextFactionRaces,
    ));
    setCursorWorld(null);
    setCameraResetToken((current) => current + 1);
    cameraViewStore.publish(DEFAULT_CAMERA_VIEW);
    setBattleInstanceRevision((current) => current + 1);
  }, [
    activeCampaignMission,
    battlePhase,
    benchmarkMode,
    cameraViewStore,
    factionRaces,
    mode,
  ]);

  const startCampaignMission = useCallback((mission: CampaignMission) => {
    const nextFactionRaces = getCampaignFactionRaces(mission.campaignId);
    setSelectedCampaignId(mission.campaignId);
    setFactionRaces(nextFactionRaces);
    setActiveCampaignMissionId(mission.id);
    setApp(createAppState(false, "campaign", mission, false, nextFactionRaces));
    setAssetsReady(false);
    setAssetLoadProgress({ loaded: 0, total: 0 });
    setAssetLoadError(null);
    setCursorWorld(null);
    setCameraResetToken((current) => current + 1);
    cameraViewStore.publish(DEFAULT_CAMERA_VIEW);
    setBattleInstanceRevision((current) => current + 1);
  }, [cameraViewStore]);

  const selectCampaign = useCallback((campaignId: CampaignId) => {
    setSelectedCampaignId(campaignId);
    setFactionRaces(getCampaignFactionRaces(campaignId));
  }, []);

  const returnToCampaignMap = useCallback(() => {
    const nextFactionRaces = getCampaignFactionRaces(selectedCampaignId);
    deploymentDragRef.current = null;
    setDeploymentDragActive(false);
    setDeploymentDragOverBattlefield(false);
    setMobileMatchSetupOpen(false);
    setFactionRaces(nextFactionRaces);
    setActiveCampaignMissionId(null);
    setApp(createAppState(false, "campaign", null, false, nextFactionRaces));
    setAssetsReady(false);
    setAssetLoadProgress({ loaded: 0, total: 0 });
    setAssetLoadError(null);
    setCursorWorld(null);
    setBattleInstanceRevision((current) => current + 1);
  }, [selectedCampaignId]);

  const changeDifficulty = useCallback((nextDifficulty: AiDifficulty) => {
    if (battlePhase !== "briefing" || nextDifficulty === difficulty) return;
    setDifficulty(nextDifficulty);
  }, [battlePhase, difficulty]);

  const engageBattle = useCallback(() => {
    if (!assetsReady) return;
    setMobileMatchSetupOpen(false);
    setApp((current) => ({
      ...current,
      session: beginBattleSession(current.session),
      feedback: {
        tone: "info",
        message: current.session.battle.modeId === "sandbox"
          ? "选择左侧建筑，然后点击合法建造格开始沙盒经营"
          : "选择左侧卡牌，然后点击己方势力范围部署",
      },
    }));
  }, [assetsReady]);

  const handleAssetsReady = useCallback(() => {
    setAssetLoadError(null);
    setAssetsReady(true);
  }, []);

  const handleAssetError = useCallback((message: string) => {
    setAssetLoadError(message);
  }, []);

  const selectDeployable = useCallback((kind: DeployableKind) => {
    if (campaignDeployables && !campaignDeployables.includes(kind)) return;
    playUiCue("select");
    setCursorWorld(null);
    setApp((current) => {
      const isCancelling = current.selectedDeployable === kind;
      return {
        ...current,
        selectedDeployable: isCancelling ? null : kind,
        feedback: {
          tone: "info",
          message: isCancelling
            ? "已取消部署"
            : "移动到己方区域，绿色预览表示可以部署",
        },
      };
    });
  }, [campaignDeployables, playUiCue]);

  const selectSandboxBuilding = useCallback((slot: SandboxBuildingSlot) => {
    if (!sandboxMode || battlePhase !== "engaged" || battle.winner !== null) return;
    const missingPrerequisites = sandboxBuildingMissingPrerequisites(
      battle.buildings,
      "verdant",
      slot,
      battle.matchElapsed,
    );
    if (missingPrerequisites.length > 0) {
      const names = missingPrerequisites.map((prerequisite) => (
        sandboxBuildingSpec(prerequisite).displayByRace[factionRaces.verdant].name
      ));
      setApp((current) => ({
        ...current,
        feedback: {
          tone: "error",
          message: `尚未解锁：请先建造完成${names.join("、")}`,
        },
      }));
      return;
    }
    playUiCue("select");
    setCursorWorld(null);
    setApp((current) => ({ ...current, selectedDeployable: null }));
    const cancelling = selectedSandboxBuilding === slot;
    setSelectedSandboxBuilding(cancelling ? null : slot);
    setSandboxSelection(createSandboxSelectionState());
    setSandboxSelectionRect(null);
    setSandboxInteractionMode((current) => transitionSandboxInteraction(current, {
      type: "select-building",
      selected: !cancelling,
    }));
    const display = sandboxBuildingSpec(slot).displayByRace[factionRaces.verdant];
    setApp((current) => ({
      ...current,
      feedback: {
        tone: "info",
        message: cancelling
          ? "已取消建造"
          : slot === "mine"
            ? `已选择${display.name}：点击受控矿坑`
            : `已选择${display.name}：点击己方合法建造锚点`,
      },
    }));
  }, [
    battle.winner,
    battle.buildings,
    battle.matchElapsed,
    battlePhase,
    factionRaces.verdant,
    playUiCue,
    sandboxMode,
    selectedSandboxBuilding,
  ]);

  const enqueueSandboxProduction = useCallback((
    buildingId: string,
    troopKind: SandboxTroopSlot,
  ) => {
    playUiCue("select");
    setApp((current) => {
      if (current.session.phase !== "engaged") return current;
      const result = enqueueSandboxBattleProduction(current.session.battle, {
        faction: "verdant",
        buildingId,
        troopKind,
      });
      if (!result.ok) {
        return {
          ...current,
          feedback: {
            tone: "error",
            message: sandboxActionReasonLabel(result.reason),
          },
        };
      }
      return {
        ...current,
        session: { ...current.session, battle: result.battle },
        feedback: {
          tone: "success",
          message: `训练已入队，支付 ${result.costCharged} 金币`,
        },
      };
    });
  }, [playUiCue]);

  const issueSelectedSandboxOrder = useCallback((
    kind: SandboxSquadOrderKind,
    options: {
      readonly destination?: WorldPoint;
      readonly target?: SandboxSquadOrderTarget;
    } = {},
  ) => {
    const selectedSquadIds = sandboxSelection.selectedSquadIds;
    setApp((current) => {
      if (current.session.phase !== "engaged") return current;
      const result = issueSandboxSquadOrder(current.session.battle, {
        faction: "verdant",
        squadIds: selectedSquadIds,
        kind,
        ...options,
      });
      if (!result.ok) {
        return {
          ...current,
          feedback: {
            tone: "error",
            message: sandboxActionReasonLabel(result.reason),
          },
        };
      }
      if (result.markerPosition) {
        const marker = {
          sequence: nextSandboxCommandMarkerSequence.current,
          kind,
          position: result.markerPosition,
        } as const;
        nextSandboxCommandMarkerSequence.current += 1;
        queueMicrotask(() => setSandboxCommandMarker(marker));
      }
      queueMicrotask(() => setSandboxInteractionMode("neutral"));
      return {
        ...current,
        session: { ...current.session, battle: result.battle },
        feedback: {
          tone: "success",
          message: sandboxOrderSuccessLabel(kind, result.orders.length),
        },
      };
    });
  }, [sandboxSelection.selectedSquadIds]);

  const armSandboxOrder = useCallback((
    kind: "move" | "attack" | "attack-move",
  ) => {
    if (
      !sandboxMode
      || battlePhase !== "engaged"
      || battle.winner !== null
      || sandboxSelection.selectedSquadIds.length === 0
    ) return;
    setSelectedSandboxBuilding(null);
    setCursorWorld(null);
    setSandboxSelectionRect(null);
    setSandboxInteractionMode((current) => transitionSandboxInteraction(current, {
      type: "arm-order",
      order: kind,
    }));
    setApp((current) => ({
      ...current,
      selectedDeployable: null,
      feedback: {
        tone: "info",
        message: kind === "attack"
          ? "点击敌军或敌方建筑下达攻击命令"
          : "点击地图选择命令目标",
      },
    }));
  }, [
    battle.winner,
    battlePhase,
    sandboxMode,
    sandboxSelection.selectedSquadIds.length,
  ]);

  const issueImmediateSandboxOrder = useCallback((kind: "stop" | "hold") => {
    issueSelectedSandboxOrder(kind);
  }, [issueSelectedSandboxOrder]);

  useEffect(() => {
    const handleSandboxShortcut = (event: KeyboardEvent) => {
      if (
        !sandboxMode
        || battlePhase !== "engaged"
        || battle.winner !== null
        || event.ctrlKey
        || event.metaKey
        || event.altKey
        || (event.target as Element | null)?.closest?.("input, textarea, select")
      ) return;
      const key = event.key.toLowerCase();
      if (key === "a") armSandboxOrder("attack-move");
      else if (key === "m") armSandboxOrder("move");
      else if (key === "r") armSandboxOrder("attack");
      else if (key === "s") issueImmediateSandboxOrder("stop");
      else if (key === "h") issueImmediateSandboxOrder("hold");
      else return;
      event.preventDefault();
    };
    const clearTransientInteraction = () => {
      sandboxSelectionDragRef.current = null;
      setSelectedSandboxBuilding(null);
      setSandboxSelectionRect(null);
      setSandboxInteractionMode("neutral");
      setCursorWorld(null);
    };
    window.addEventListener("keydown", handleSandboxShortcut);
    window.addEventListener("blur", clearTransientInteraction);
    return () => {
      window.removeEventListener("keydown", handleSandboxShortcut);
      window.removeEventListener("blur", clearTransientInteraction);
    };
  }, [
    armSandboxOrder,
    battle.winner,
    battlePhase,
    issueImmediateSandboxOrder,
    sandboxMode,
  ]);

  const resolveDeploymentDragTarget = useCallback((client: FieldPoint) => {
    const battlefield = battlefieldRef.current;
    if (!battlefield) {
      return { overBattlefield: false, worldPosition: null } as const;
    }
    const bounds = battlefield.getBoundingClientRect();
    const overBounds = client.x >= bounds.left
      && client.x <= bounds.right
      && client.y >= bounds.top
      && client.y <= bounds.bottom;
    const hitElement = document.elementFromPoint(client.x, client.y);
    if (!overBounds || hitElement?.closest("[data-field-ui]")) {
      return { overBattlefield: false, worldPosition: null } as const;
    }
    const fieldPoint = fieldPointerCoordinates(
      client,
      bounds,
      { width: battlefield.clientWidth, height: battlefield.clientHeight },
      false,
    );
    return {
      overBattlefield: true,
      worldPosition: bridgeRef.current.screenToWorld(fieldPoint.x, fieldPoint.y),
    } as const;
  }, []);

  const handleDeploymentDrag = useCallback((event: DeploymentDragEvent) => {
    if (event.phase === "start") {
      if (deploymentDragRef.current) return;
      if (campaignDeployables && !campaignDeployables.includes(event.kind)) return;
      deploymentDragRef.current = { pointerId: event.pointerId, kind: event.kind };
      const target = resolveDeploymentDragTarget(event.client);
      setDeploymentDragActive(true);
      setDeploymentDragOverBattlefield(
        target.overBattlefield && target.worldPosition !== null,
      );
      setCursorWorld(target.overBattlefield ? target.worldPosition : null);
      playUiCue("select");
      setApp((current) => ({
        ...current,
        selectedDeployable: event.kind,
        feedback: {
          tone: "info",
          message: "拖到战场格子：高亮后松手部署",
        },
      }));
      return;
    }

    const activeDrag = deploymentDragRef.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    if (event.phase === "move") {
      const target = resolveDeploymentDragTarget(event.client);
      setDeploymentDragOverBattlefield(
        target.overBattlefield && target.worldPosition !== null,
      );
      if (target.overBattlefield && target.worldPosition) {
        setCursorWorld(target.worldPosition);
      }
      return;
    }

    deploymentDragRef.current = null;
    setDeploymentDragActive(false);
    setDeploymentDragOverBattlefield(false);

    if (event.phase === "cancel") {
      setCursorWorld(null);
      setApp((current) => ({
        ...current,
        selectedDeployable: null,
        feedback: { tone: "info", message: "部署已取消，金币未扣除" },
      }));
      return;
    }

    const target = resolveDeploymentDragTarget(event.client);
    setCursorWorld(null);
    if (!target.overBattlefield || !target.worldPosition) {
      setApp((current) => ({
        ...current,
        selectedDeployable: null,
        feedback: { tone: "info", message: "部署已取消，金币未扣除" },
      }));
      return;
    }
    const worldPosition = target.worldPosition;

    setApp((current) => {
      if (current.session.phase !== "engaged") {
        return {
          ...current,
          selectedDeployable: null,
          feedback: { tone: "error", message: "部署阶段已结束，金币未扣除" },
        };
      }
      const preview = previewDeployment(current.session, {
        faction: "verdant",
        kind: activeDrag.kind,
        worldPosition,
      });
      if (!preview.valid) {
        return {
          ...current,
          selectedDeployable: null,
          feedback: {
            tone: "error",
            message: `${deploymentReasonLabel(preview.reason)}，金币未扣除`,
          },
        };
      }
      const result = deployBattleSessionEntity(current.session, {
        faction: "verdant",
        kind: activeDrag.kind,
        worldPosition,
      });
      if (!result.ok) {
        return {
          ...current,
          selectedDeployable: null,
          feedback: {
            tone: "error",
            message: `${deploymentReasonLabel(result.reason)}，金币未扣除`,
          },
        };
      }
      return {
        session: result.state,
        selectedDeployable: null,
        feedback: { tone: "success", message: "部署成功，金币已扣除" },
      };
    });
  }, [campaignDeployables, playUiCue, resolveDeploymentDragTarget]);

  useEffect(() => {
    const handleWindowPointerMove = (event: PointerEvent) => {
      if (deploymentDragRef.current?.pointerId !== event.pointerId) return;
      handleDeploymentDrag({
        phase: "move",
        pointerId: event.pointerId,
        client: { x: event.clientX, y: event.clientY },
      });
    };
    const finishWindowDeploymentDrag = (
      phase: "end" | "cancel",
      event: PointerEvent,
    ) => {
      if (deploymentDragRef.current?.pointerId !== event.pointerId) return;
      deploymentDragReleasePointerRef.current = event.pointerId;
      queueMicrotask(() => {
        if (deploymentDragReleasePointerRef.current === event.pointerId) {
          deploymentDragReleasePointerRef.current = null;
        }
      });
      handleDeploymentDrag(phase === "end"
        ? {
            phase,
            pointerId: event.pointerId,
            client: { x: event.clientX, y: event.clientY },
          }
        : { phase, pointerId: event.pointerId });
    };
    const handleWindowPointerUp = (event: PointerEvent) => {
      finishWindowDeploymentDrag("end", event);
    };
    const handleWindowPointerCancel = (event: PointerEvent) => {
      finishWindowDeploymentDrag("cancel", event);
    };

    window.addEventListener("pointermove", handleWindowPointerMove, true);
    window.addEventListener("pointerup", handleWindowPointerUp, true);
    window.addEventListener("pointercancel", handleWindowPointerCancel, true);
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove, true);
      window.removeEventListener("pointerup", handleWindowPointerUp, true);
      window.removeEventListener("pointercancel", handleWindowPointerCancel, true);
    };
  }, [handleDeploymentDrag]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (deploymentDragRef.current) {
      event.preventDefault();
      return;
    }
    const fieldInteractionAllowed = shouldStartFieldPointerInteraction(
      event.button,
      event.target as Element | null,
    );
    if (
      event.pointerType !== "touch"
      && sandboxMode
      && battlePhase === "engaged"
      && battle.winner === null
      && selectedSandboxBuilding === null
      && sandboxInteractionMode === "neutral"
      && fieldInteractionAllowed
    ) {
      const point = localPointer(event);
      event.currentTarget.setPointerCapture(event.pointerId);
      sandboxSelectionDragRef.current = {
        pointerId: event.pointerId,
        startField: point,
        currentField: point,
        additive: event.shiftKey,
        dragging: false,
      };
      return;
    }
    if (event.pointerType !== "touch" || !fieldInteractionAllowed) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    activeTouchPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (activeTouchPointersRef.current.size === 1) {
      singleTouchDragRef.current = {
        pointerId: event.pointerId,
        startClient: { x: event.clientX, y: event.clientY },
        previousField: localPointer(event),
        dragging: false,
      };
    }
    const pinchDistance = activeTouchDistance(activeTouchPointersRef.current);
    if (pinchDistance === null) return;

    singleTouchDragRef.current = null;
    previousPinchDistanceRef.current = pinchDistance;
    suppressTouchDeploymentRef.current = true;
    setCursorWorld(null);
    event.preventDefault();
  }, [
    battle.winner,
    battlePhase,
    sandboxInteractionMode,
    sandboxMode,
    selectedSandboxBuilding,
  ]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (deploymentDragRef.current?.pointerId === event.pointerId) return;
    const selectionDrag = sandboxSelectionDragRef.current;
    if (selectionDrag?.pointerId === event.pointerId) {
      const currentField = localPointer(event);
      selectionDrag.currentField = currentField;
      selectionDrag.dragging = selectionDrag.dragging || pointerDragExceedsThreshold(
        selectionDrag.startField,
        currentField,
        TOUCH_DRAG_THRESHOLD_PX,
      );
      if (selectionDrag.dragging) {
        setSandboxInteractionMode((current) => transitionSandboxInteraction(
          current,
          { type: "begin-box" },
        ));
        setSandboxSelectionRect(sandboxSelectionBox(
          selectionDrag.startField,
          currentField,
        ));
        event.preventDefault();
      }
      return;
    }
    if (event.pointerType === "touch") {
      if (!activeTouchPointersRef.current.has(event.pointerId)) return;
      activeTouchPointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      const pinchDistance = activeTouchDistance(activeTouchPointersRef.current);
      if (pinchDistance !== null) {
        singleTouchDragRef.current = null;
        const previousDistance = previousPinchDistanceRef.current;
        if (previousDistance !== null) {
          bridgeRef.current.zoomByFactor(pinchZoomFactor(previousDistance, pinchDistance));
        }
        previousPinchDistanceRef.current = pinchDistance;
        suppressTouchDeploymentRef.current = true;
        setCursorWorld(null);
        event.preventDefault();
        return;
      }

      const drag = singleTouchDragRef.current;
      if (drag?.pointerId === event.pointerId) {
        const currentField = localPointer(event);
        const dragging = drag.dragging || pointerDragExceedsThreshold(
          drag.startClient,
          { x: event.clientX, y: event.clientY },
          TOUCH_DRAG_THRESHOLD_PX,
        );
        if (dragging) {
          bridgeRef.current.panByScreenDelta(
            currentField.x - drag.previousField.x,
            currentField.y - drag.previousField.y,
          );
          drag.dragging = true;
          setSandboxInteractionMode((current) => transitionSandboxInteraction(
            current,
            { type: "begin-camera" },
          ));
          suppressTouchDeploymentRef.current = true;
          setCursorWorld(null);
          drag.previousField = currentField;
          event.preventDefault();
          return;
        }
        drag.previousField = currentField;
      }
      if (suppressTouchDeploymentRef.current) {
        event.preventDefault();
        return;
      }
    }

    if (!shouldStartFieldPointerInteraction(0, event.target as Element | null)) {
      setCursorWorld(null);
      return;
    }
    if (!app.selectedDeployable && !selectedSandboxBuilding) return;
    const point = localPointer(event);
    setCursorWorld(bridgeRef.current.screenToWorld(point.x, point.y));
  }, [app.selectedDeployable, selectedSandboxBuilding]);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      deploymentDragRef.current?.pointerId === event.pointerId
      || deploymentDragReleasePointerRef.current === event.pointerId
    ) return;
    const selectionDrag = sandboxSelectionDragRef.current;
    if (selectionDrag?.pointerId === event.pointerId) {
      sandboxSelectionDragRef.current = null;
      setSandboxSelectionRect(null);
      setSandboxInteractionMode("neutral");
      if (selectionDrag.dragging) {
        const squadIds = bridgeRef.current.squadIdsInScreenRect(
          sandboxSelectionBox(selectionDrag.startField, selectionDrag.currentField),
          "verdant",
        );
        setSandboxSelection((current) => selectSandboxSquadsInBox(
          current,
          squadIds,
          selectionDrag.additive,
        ));
      } else {
        const pick = bridgeRef.current.pickBattlefieldEntity(
          selectionDrag.currentField.x,
          selectionDrag.currentField.y,
        );
        setSandboxSelection((current) => selectSandboxSquad(
          current,
          pick?.targetType === "unit" && pick.faction === "verdant"
            ? pick.squadId
            : null,
          selectionDrag.additive,
        ));
      }
      event.preventDefault();
      return;
    }
    if (event.pointerType === "touch") {
      const trackedPointer = activeTouchPointersRef.current.has(event.pointerId);
      const drag = singleTouchDragRef.current;
      const suppressDeployment = suppressTouchDeploymentRef.current || (
        drag?.pointerId === event.pointerId && drag.dragging
      );
      if (drag?.pointerId === event.pointerId) singleTouchDragRef.current = null;
      activeTouchPointersRef.current.delete(event.pointerId);
      previousPinchDistanceRef.current = activeTouchDistance(activeTouchPointersRef.current);
      if (activeTouchPointersRef.current.size === 0) {
        suppressTouchDeploymentRef.current = false;
      }
      if (!trackedPointer || suppressDeployment) {
        setSandboxInteractionMode("neutral");
        setCursorWorld(null);
        return;
      }
    }

    if (!shouldStartFieldPointerInteraction(event.button, event.target as Element | null)) return;
    const placingSandboxBuilding = sandboxMode
      && selectedSandboxBuilding !== null
      && battlePhase === "engaged"
      && battle.winner === null;
    const armedOrder = sandboxOrderForInteractionMode(sandboxInteractionMode);
    const selectingSandboxSquad = sandboxMode
      && battlePhase === "engaged"
      && battle.winner === null
      && selectedSandboxBuilding === null
      && armedOrder === null;
    if (
      !placingSandboxBuilding
      && !armedOrder
      && !selectingSandboxSquad
      && (!app.selectedDeployable || !deploymentEnabled)
    ) return;
    const point = localPointer(event);
    const worldPosition = bridgeRef.current.screenToWorld(point.x, point.y);
    if (!worldPosition) return;
    if (armedOrder) {
      if (armedOrder === "attack") {
        const pick = bridgeRef.current.pickBattlefieldEntity(point.x, point.y);
        if (!pick || pick.faction === "verdant") {
          setApp((current) => ({
            ...current,
            feedback: { tone: "error", message: "请选择敌军或敌方建筑" },
          }));
          return;
        }
        issueSelectedSandboxOrder("attack", {
          target: { targetType: pick.targetType, targetId: pick.id },
        });
      } else {
        issueSelectedSandboxOrder(armedOrder, { destination: worldPosition });
      }
      return;
    }
    if (placingSandboxBuilding) {
      const slot = selectedSandboxBuilding;
      setCursorWorld(null);
      if (previewSandboxBuildingConstruction(battle, {
        faction: "verdant",
        slot,
        worldPosition,
      }).valid) {
        setSelectedSandboxBuilding(null);
        setSandboxInteractionMode("neutral");
      }
      setApp((current) => {
        if (current.session.phase !== "engaged" || current.session.battle.modeId !== "sandbox") {
          return current;
        }
        const result = startSandboxBuildingConstruction(current.session.battle, {
          faction: "verdant",
          slot,
          worldPosition,
        });
        if (!result.ok) {
          return {
            ...current,
            feedback: {
              tone: "error",
              message: sandboxActionReasonLabel(result.reason),
            },
          };
        }
        return {
          ...current,
          session: { ...current.session, battle: result.battle },
          feedback: {
            tone: "success",
            message: `施工已开始，支付 ${result.costCharged} 金币${
              result.usedEmergencyPermit ? "（已使用紧急采矿许可）" : ""
            }`,
          },
        };
      });
      return;
    }
    if (selectingSandboxSquad) {
      const pick = bridgeRef.current.pickBattlefieldEntity(point.x, point.y);
      setSandboxSelection((current) => selectSandboxSquad(
        current,
        pick?.targetType === "unit" && pick.faction === "verdant"
          ? pick.squadId
          : null,
        event.shiftKey,
      ));
      setSandboxInteractionMode("neutral");
      return;
    }
    setApp((current) => {
      const kind = current.selectedDeployable;
      if (!kind || current.session.phase !== "engaged") return current;
      if (campaignDeployables && !campaignDeployables.includes(kind)) return current;
      const result = deployBattleSessionEntity(current.session, {
        faction: "verdant",
        kind,
        worldPosition,
      });
      if (!result.ok) {
        return {
          ...current,
          feedback: { tone: "error", message: deploymentReasonLabel(result.reason) },
        };
      }
      return {
        session: result.state,
        selectedDeployable: null,
        feedback: { tone: "success", message: "部署成功，金币已扣除" },
      };
    });
  }, [
    app.selectedDeployable,
    battle,
    battle.winner,
    battlePhase,
    campaignDeployables,
    deploymentEnabled,
    issueSelectedSandboxOrder,
    sandboxInteractionMode,
    sandboxMode,
    selectedSandboxBuilding,
  ]);

  const handlePointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (sandboxSelectionDragRef.current?.pointerId === event.pointerId) {
      sandboxSelectionDragRef.current = null;
      setSandboxSelectionRect(null);
      setSandboxInteractionMode("neutral");
    }
    if (event.pointerType !== "touch") return;
    setSelectedSandboxBuilding(null);
    if (singleTouchDragRef.current?.pointerId === event.pointerId) {
      singleTouchDragRef.current = null;
    }
    activeTouchPointersRef.current.delete(event.pointerId);
    previousPinchDistanceRef.current = activeTouchDistance(activeTouchPointersRef.current);
    if (activeTouchPointersRef.current.size === 0) {
      suppressTouchDeploymentRef.current = false;
    }
    setSandboxInteractionMode("neutral");
    setCursorWorld(null);
  }, []);

  const cancelDeployment = useCallback(() => {
    deploymentDragRef.current = null;
    setDeploymentDragActive(false);
    setDeploymentDragOverBattlefield(false);
    setCursorWorld(null);
    setSelectedSandboxBuilding(null);
    sandboxSelectionDragRef.current = null;
    setSandboxSelectionRect(null);
    setSandboxInteractionMode("neutral");
    setApp((current) => current.selectedDeployable
      ? {
          ...current,
          selectedDeployable: null,
          feedback: { tone: "info", message: "已取消部署" },
        }
      : selectedSandboxBuilding
        ? {
            ...current,
            feedback: { tone: "info", message: "已取消建造" },
          }
        : current);
  }, [selectedSandboxBuilding]);

  const handleBattlefieldContextMenu = useCallback((
    event: ReactMouseEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    if (selectedSandboxBuilding || app.selectedDeployable) {
      cancelDeployment();
      return;
    }
    if (
      !sandboxMode
      || battlePhase !== "engaged"
      || battle.winner !== null
      || sandboxSelection.selectedSquadIds.length === 0
    ) return;
    const point = localPointer(event);
    const pick = bridgeRef.current.pickBattlefieldEntity(point.x, point.y);
    if (pick && pick.faction !== "verdant") {
      issueSelectedSandboxOrder("attack", {
        target: { targetType: pick.targetType, targetId: pick.id },
      });
      return;
    }
    const destination = bridgeRef.current.screenToWorld(point.x, point.y);
    if (destination) issueSelectedSandboxOrder("move", { destination });
  }, [
    app.selectedDeployable,
    battle.winner,
    battlePhase,
    cancelDeployment,
    issueSelectedSandboxOrder,
    sandboxMode,
    sandboxSelection.selectedSquadIds.length,
    selectedSandboxBuilding,
  ]);

  const fieldFeedback = deploymentDragActive
    ? !deploymentDragOverBattlefield
      ? { tone: "info" as const, message: "拖回列表或在此松手将取消部署" }
      : deploymentPreview?.valid
        ? { tone: "success" as const, message: "格子可部署，松开手指确认" }
        : deploymentPreview
          ? { tone: "error" as const, message: deploymentReasonLabel(deploymentPreview.reason) }
          : { tone: "info" as const, message: "继续拖到战场格子" }
    : sandboxConstructionPreview
      ? sandboxConstructionPreview.valid
        ? { tone: "success" as const, message: "格子可建造，左键确认施工" }
        : {
            tone: "error" as const,
            message: sandboxActionReasonLabel(
              sandboxConstructionPreview.reason ?? "invalid-request",
            ),
          }
    : deploymentPreview && !deploymentPreview.valid
      ? { tone: "error" as const, message: deploymentReasonLabel(deploymentPreview.reason) }
      : app.feedback;

  if (!benchmarkMode && mode === "campaign" && !activeCampaignMission) {
    return (
      <main className={styles.appShell} data-view="campaign-map">
        <CampaignMap
          mode={mode}
          progress={campaignProgress}
          campaignId={selectedCampaignId}
          onStartMission={startCampaignMission}
          onSelectCampaign={selectCampaign}
          onChangeMode={changeMode}
        />
      </main>
    );
  }

  return (
    <main
      className={styles.appShell}
      data-view="battle"
      data-battle-theme={hasUndeadTerritory ? "undead" : "human"}
      data-enemy-race={factionRaces.crimson}
      aria-busy={!assetsReady}
    >
      <header
        className={styles.commandBar}
        data-phase={battlePhase}
        inert={!assetsReady}
        aria-hidden={!assetsReady}
      >
        <div className={styles.brandLockup}>
          <div className={styles.brandSigil} aria-hidden="true">⚔</div>
          <div>
            <p className={styles.kicker}>FORTIFIED CAMP PROTOTYPE</p>
            <h1>IRONFIELD <em>GOLD WAR</em></h1>
          </div>
        </div>
        <div className={styles.commandCenter}>
          {!benchmarkMode && (
            <GameModeSelector
              mode={mode}
              onChange={changeMode}
              compactOnPortrait
            />
          )}
          {!benchmarkMode && (
            <>
              <button
                className={styles.mobileMatchSetupButton}
                type="button"
                aria-label="战斗设置"
                aria-controls="mobile-match-setup"
                aria-expanded={mobileMatchSetupOpen}
                title="战斗设置"
                onClick={() => setMobileMatchSetupOpen((open) => !open)}
              >
                <span className={styles.settingsIcon} aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z" />
                    <path d="m19.1 13.4 1.4 1.1-1.8 3.1-1.7-.7a7.7 7.7 0 0 1-2.3 1.3l-.3 1.8h-3.6l-.3-1.8a7.7 7.7 0 0 1-2.3-1.3l-1.7.7-1.8-3.1 1.4-1.1a7.1 7.1 0 0 1 0-2.8L4.7 9.5l1.8-3.1 1.7.7a7.7 7.7 0 0 1 2.3-1.3l.3-1.8h3.6l.3 1.8A7.7 7.7 0 0 1 17 7.1l1.7-.7 1.8 3.1-1.4 1.1a7.1 7.1 0 0 1 0 2.8Z" />
                  </svg>
                </span>
                <span className={styles.settingsLabel}>设置</span>
              </button>
              <div
                id="mobile-match-setup"
                className={styles.matchSetupControls}
                data-mobile-open={mobileMatchSetupOpen}
              >
                {mode !== "campaign" && (
                  <>
                    <FactionRaceSelector
                      disabled={battlePhase !== "briefing"}
                      factionRaces={factionRaces}
                      onChange={changeFactionRace}
                    />
                    <AiDifficultySelector
                      difficulty={difficulty}
                      disabled={battlePhase !== "briefing"}
                      onChange={changeDifficulty}
                    />
                  </>
                )}
                {activeCampaignMission && (
                  <button
                    className={styles.mobileCampaignReturn}
                    type="button"
                    onClick={returnToCampaignMap}
                  >
                    返回战役地图
                  </button>
                )}
              </div>
            </>
          )}
          <div className={styles.battlePulse} aria-live="polite">
            <span>{battlePhase === "briefing"
              ? activeCampaignMission ? "任务待命" : "等待交战"
              : battle.winner
                ? "战斗结束"
                : clock.activeBonus?.resource === "gold"
                  ? "双倍金币"
                  : clock.activeBonus?.resource === "experience"
                    ? "双倍经验"
                    : "战线交锋中"}</span>
            <strong>{formatTime(clock.remainingSeconds)}</strong>
          </div>
        </div>
        <div className={styles.headerActions}>
          {activeCampaignMission && (
            <button
              className={`${styles.restartButton} ${styles.campaignReturnButton}`}
              type="button"
              onClick={returnToCampaignMap}
            >
              返回地图
            </button>
          )}
          <button
            className={styles.engagementOrder}
            data-open={battlePhase === "briefing"}
            type="button"
            aria-hidden={battlePhase !== "briefing"}
            inert={battlePhase !== "briefing"}
            autoFocus={assetsReady}
            onClick={engageBattle}
          >
            <span>{activeCampaignMission ? "BEGIN MISSION" : "BEGIN DEPLOYMENT"}</span>
            <strong><b aria-hidden="true">⚔</b> {activeCampaignMission ? "开始任务" : "交战"}</strong>
          </button>
          <button
            className={styles.audioToggle}
            data-enabled={audioEnabled}
            type="button"
            aria-label="游戏声音"
            aria-pressed={audioEnabled}
            title={audioEnabled ? "关闭游戏声音" : "开启游戏声音"}
            onClick={() => setAudioEnabled((current) => !current)}
          >
            <span
              className={styles.audioIcon}
              data-sound-state={audioEnabled ? "on" : "off"}
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M3.5 9h4L13 4.75v14.5L7.5 15h-4Z" fill="currentColor" />
                {audioEnabled ? (
                  <>
                    <path d="M16 8.5c2.1 1.8 2.1 5.2 0 7" />
                    <path d="M18.7 6c4 3.2 4 8.8 0 12" />
                  </>
                ) : (
                  <path d="m16.5 9 5 6m0-6-5 6" />
                )}
              </svg>
            </span>
            <span className={styles.audioLabel}>声音</span>
            <strong>{audioEnabled ? "开启" : "关闭"}</strong>
          </button>
          <button
            className={styles.restartButton}
            type="button"
            aria-label="重新开局"
            title="重新开局"
            onClick={resetBattle}
          >
            <span className={styles.restartIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M8 7H4V3" />
                <path d="M4.8 7.2A8 8 0 1 1 4 15" />
              </svg>
            </span>
            <span className={styles.restartLabel}>重新开局</span>
          </button>
        </div>
      </header>

      <section
        className={styles.warTable}
        data-phase={battlePhase}
        data-winner={battle.winner ?? "none"}
        inert={!assetsReady}
        aria-hidden={!assetsReady}
      >
        {battle.winner === null && (sandboxMode ? (
          <SandboxCommandPanel
            battle={battle}
            selectedBuilding={selectedSandboxBuilding}
            disabled={battlePhase !== "engaged"}
            onSelectBuilding={selectSandboxBuilding}
            onEnqueueProduction={enqueueSandboxProduction}
          />
        ) : (
          <DeploymentRail
            session={app.session}
            selectedKind={app.selectedDeployable}
            allowedKinds={campaignDeployables}
            onSelect={selectDeployable}
            onDragDeploy={handleDeploymentDrag}
          />
        ))}
        {battle.winner === null && sandboxMode && (
          <SandboxSquadCommandBar
            selectedCount={sandboxSelection.selectedSquadIds.length}
            armedOrder={armedSandboxOrder}
            disabled={battlePhase !== "engaged"}
            onArmOrder={armSandboxOrder}
            onImmediateOrder={issueImmediateSandboxOrder}
          />
        )}

        <div
          ref={battlefieldRef}
          className={styles.battlefield}
          data-deploying={app.selectedDeployable !== null || selectedSandboxBuilding !== null}
          data-sandbox-interaction={sandboxInteractionMode}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setCursorWorld(null)}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onContextMenu={handleBattlefieldContextMenu}
        >
          <BattlefieldCanvas
            battle={battle}
            factionRaces={factionRaces}
            bridgeRef={bridgeRef}
            deploymentKind={app.selectedDeployable}
            deploymentPreview={app.selectedDeployable && deploymentPreview
              ? { kind: app.selectedDeployable, ...deploymentPreview }
              : null}
            sandboxConstructionPreview={sandboxConstructionPreview}
            selectedSquadIds={sandboxSelection.selectedSquadIds}
            sandboxCommandMarker={sandboxCommandMarker}
            cameraResetToken={cameraResetToken}
            cameraViewStore={cameraViewStore}
            onAssetProgress={setAssetLoadProgress}
            onAssetsReady={handleAssetsReady}
            onAssetError={handleAssetError}
            onBenchmarkUpdate={benchmarkMode ? setBenchmark : undefined}
          />
          {sandboxSelectionRect && (
            <div
              className={styles.sandboxSelectionBox}
              data-field-ui
              aria-hidden="true"
              style={{
                left: sandboxSelectionRect.left,
                top: sandboxSelectionRect.top,
                width: sandboxSelectionRect.right - sandboxSelectionRect.left,
                height: sandboxSelectionRect.bottom - sandboxSelectionRect.top,
              }}
            />
          )}
          <SandboxMinimap
            battle={battle}
            battlefield={battlefieldDefinition}
            cameraViewStore={cameraViewStore}
            className={styles.sandboxMinimap}
            onCameraTargetRequest={(target) => bridgeRef.current.centerOn(target)}
          />
          {benchmarkMode && (
            <output className={styles.benchmarkPanel} data-complete={benchmark?.complete ?? false}>
              <strong>BENCHMARK 80 · {benchmark?.complete ? "完成" : "采样中"}</strong>
              <span>中位 FPS：{benchmark?.medianFps ?? "—"}</span>
              <span>1% LOW：{benchmark?.onePercentLowFps ?? "—"}</span>
              <span>Draw calls：{benchmark?.drawCalls ?? "—"}</span>
              <span>Triangles：{benchmark?.triangles.toLocaleString() ?? "—"}</span>
              <small>{benchmark?.frames ?? 0} frames / 10 sec</small>
            </output>
          )}
          <div className={styles.fieldCaption}>
            <span>方向键平移</span>
            <span>滚轮缩放</span>
            <span>中键旋转</span>
            <span>{selectedSandboxBuilding
              ? "左键建造 · 右键取消"
              : app.selectedDeployable
                ? "左键部署 · 右键取消"
                : sandboxMode
                  ? "从左侧选择建筑或训练单位"
                  : "从左侧选择部署单位"}</span>
          </div>
          <div className={styles.objectiveFlag} data-tone={fieldFeedback?.tone ?? "info"}>
            <span>{selectedSandboxBuilding
              ? "CONSTRUCTION MODE"
              : app.selectedDeployable
                ? "DEPLOYMENT MODE"
              : activeCampaignMission
                ? activeCampaignMission.title
                : battleMatchupLabel(factionRaces)}</span>
            <strong aria-live="polite">{battlePhase === "briefing"
              ? activeCampaignMission?.primaryObjective
                ?? matchBriefingLabel(clock.remainingSeconds)
              : fieldFeedback?.message ?? (selectedSandboxBuilding
                ? selectedSandboxBuilding === "mine"
                  ? "点击受控矿坑开始建造金矿"
                  : "点击己方合法建造锚点开始施工"
                : app.selectedDeployable
                  ? "移动到己方区域，绿色预览表示可以部署"
                  : sandboxMode
                    ? "建造资源与生产建筑，兵种只从对应建筑训练"
                    : "选择建筑或兵种进入部署模式")}</strong>
          </div>
          {hasUndeadTerritory && battlePhase === "briefing" && (
            <aside className={styles.undeadRosterPanel} aria-label="亡灵兵种概览">
              <span>{undeadPlayer && undeadOpponent
                ? "UNDEAD MIRROR"
                : undeadPlayer ? "PLAYER UNDEAD ROSTER" : "ENEMY UNDEAD ROSTER"}</span>
              {Object.values(UNDEAD_TROOP_DESIGNS).map((troop) => (
                <div key={troop.name}>
                  <strong>{troop.name}</strong>
                  <small>{troop.identity}</small>
                </div>
              ))}
            </aside>
          )}
          <div
            className={styles.zoomControls}
            data-field-ui
            role="group"
            aria-label="战场缩放"
          >
            <button
              className={styles.zoomButton}
              type="button"
              aria-label="缩小战场"
              onClick={() => bridgeRef.current.zoomByFactor(0.85)}
            >
              <span aria-hidden="true">−</span>
            </button>
            <button
              className={styles.zoomButton}
              type="button"
              aria-label="放大战场"
              onClick={() => bridgeRef.current.zoomByFactor(1.18)}
            >
              <span aria-hidden="true">+</span>
            </button>
          </div>
          <div
            className={styles.victoryBanner}
            data-winner={battle.winner ?? "none"}
            aria-hidden={battle.winner === null}
            inert={battle.winner === null}
          >
            <span>{activeCampaignMission ? "MISSION REPORT" : "THE FIELD IS DECIDED"}</span>
            <strong>{campaignResult
              ? campaignResult.success
                ? `任务完成 · ${"★".repeat(campaignResult.stars)}${"☆".repeat(3 - campaignResult.stars)}`
                : battle.winner === "verdant" && !campaignResult.primaryConditionMet
                  ? "试炼条件未完成"
                  : winnerLabel(battle.winner, factionRaces)
              : winnerLabel(battle.winner, factionRaces)}</strong>
            {campaignResult && (
              <div className={styles.campaignObjectives}>
                <small data-complete={campaignResult.primaryConditionMet}>
                  {campaignResult.primaryConditionMet ? "✓" : "×"} {activeCampaignMission?.primaryObjective}
                </small>
                {campaignResult.optionalResults.map((objective) => (
                  <small data-complete={objective.completed} key={objective.label}>
                    {objective.completed ? "★" : "☆"} {objective.label}
                  </small>
                ))}
                {campaignResult.success && activeCampaignMission?.reward && (
                  <em>军备解锁：{deployableLabelForRace(
                    activeCampaignMission.reward,
                    activeCampaignMission.playerRace,
                  )}</em>
                )}
              </div>
            )}
            <div className={styles.resultActions}>
              {activeCampaignMission && (
                <button type="button" onClick={returnToCampaignMap}>
                  {campaignResult?.success ? "领取奖励" : "返回地图"}
                </button>
              )}
              <button type="button" onClick={resetBattle}>
                {activeCampaignMission ? "重新挑战" : "再次交锋"}
              </button>
            </div>
          </div>
        </div>

      </section>
      {!assetsReady && (
        <AssetLoadingScreen
          percentage={sceneAssetLoadPercentage(assetLoadProgress)}
          error={assetLoadError}
        />
      )}
    </main>
  );
}

function AssetLoadingScreen({
  percentage,
  error,
}: {
  readonly percentage: number;
  readonly error: string | null;
}) {
  return (
    <section
      className={styles.loadingScreen}
      role={error ? "alert" : "status"}
      aria-live="polite"
      aria-label={error ? "资源加载失败" : "正在加载游戏资源"}
    >
      <div className={styles.loadingPanel}>
        <div className={styles.loadingSigil} aria-hidden="true">⚔</div>
        <p className={styles.loadingKicker}>FORTIFIED FRONT · FIELD ASSEMBLY</p>
        <h2>{error ? "战场装配中断" : "正在装配战场"}</h2>
        {error ? (
          <>
            <p className={styles.loadingMessage}>部分资源未能载入，请检查网络后重新加载。</p>
            <button
              className={styles.loadingRetry}
              type="button"
              onClick={() => window.location.reload()}
            >
              重新加载
            </button>
          </>
        ) : (
          <>
            <div
              className={styles.loadingTrack}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percentage}
              aria-label={`资源加载进度 ${percentage}%`}
            >
              <i style={{ width: `${percentage}%` }} />
            </div>
            <div className={styles.loadingMeta}>
              <span>地形 · 单位 · 建筑 · 战斗特效</span>
              <strong>{percentage}%</strong>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function createAppState(
  benchmarkMode: boolean,
  mode: GameMode,
  campaignMission: CampaignMission | null = null,
  frostPreview = false,
  factionRaces: FactionRaces = factionRacesForGameMode(mode),
  fireballPreview = false,
): AppState {
  return {
    session: {
      battle: benchmarkMode
        ? createBenchmarkBattle(80)
        : frostPreview
          ? createFrostBreathPreviewBattle()
          : fireballPreview
            ? createFireballPreviewBattle()
          : campaignMission
            ? createCampaignBattle(campaignMission)
            : mode === "arena"
              ? createArenaBattle(factionRaces)
              : createInitialBattle({
                  modeId: mode,
                  factionRaces,
                  matchPolicy: matchPolicyForGameMode(mode),
                }),
      phase: benchmarkMode || frostPreview || fireballPreview ? "engaged" : "briefing",
    },
    selectedDeployable: null,
    feedback: null,
  };
}

function useBattleLoop(
  setApp: Dispatch<SetStateAction<AppState>>,
  phase: BattlePhase,
  difficulty: AiDifficulty,
): void {
  useEffect(() => {
    if (phase !== "engaged") return;
    let animationFrame = 0;
    let previous = performance.now();
    let accumulator = 0;
    const frame = (now: number) => {
      accumulator += Math.min(0.2, (now - previous) / 1000);
      previous = now;
      if (accumulator >= SIMULATION_STEP_SECONDS) {
        const steps = Math.min(4, Math.floor(accumulator / SIMULATION_STEP_SECONDS));
        accumulator -= steps * SIMULATION_STEP_SECONDS;
        setApp((current) => {
          const battle = advanceBattleSession(
            current.session.battle,
            current.session.phase,
            steps,
            SIMULATION_STEP_SECONDS,
            difficulty,
          );
          return battle === current.session.battle
            ? current
            : { ...current, session: { ...current.session, battle } };
        });
      }
      animationFrame = requestAnimationFrame(frame);
    };
    animationFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationFrame);
  }, [difficulty, phase, setApp]);
}

function localPointer(
  event: Pick<ReactPointerEvent<HTMLDivElement>, "clientX" | "clientY" | "currentTarget">,
) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return fieldPointerCoordinates(
    { x: event.clientX, y: event.clientY },
    bounds,
    {
      width: event.currentTarget.clientWidth,
      height: event.currentTarget.clientHeight,
    },
    false,
  );
}

function activeTouchDistance(touches: ReadonlyMap<number, FieldPoint>): number | null {
  const [first, second] = touches.values();
  return first && second ? fieldPointerDistance(first, second) : null;
}

function formatTime(seconds: number | null): string {
  if (seconds === null) return "∞";
  const total = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function matchBriefingLabel(remainingSeconds: number | null): string {
  if (remainingSeconds === null) return "点击交战，开始无限攻防";
  const minutes = remainingSeconds / 60;
  return `点击交战，开始${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)}分钟攻防`;
}

function sandboxOrderForInteractionMode(
  mode: SandboxInteractionMode,
): "move" | "attack" | "attack-move" | null {
  if (mode === "move-armed") return "move";
  if (mode === "attack-armed") return "attack";
  if (mode === "attack-move-armed") return "attack-move";
  return null;
}

function sandboxOrderSuccessLabel(
  kind: SandboxSquadOrderKind,
  squadCount: number,
): string {
  const label = kind === "move"
    ? "移动"
    : kind === "attack" ? "攻击"
      : kind === "attack-move" ? "攻击移动"
        : kind === "stop" ? "停止" : "坚守";
  return `${squadCount} 支兵团已执行${label}命令`;
}

function sandboxActionReasonLabel(reason: string): string {
  const labels: Readonly<Record<string, string>> = {
    "sandbox-mode-required": "此操作只在沙盒模式可用",
    "match-over": "战斗已经结束",
    "unknown-building-slot": "未知建筑类型",
    "invalid-building-slot": "此位置不能建造该建筑",
    "unknown-pit": "未找到该矿坑",
    "outside-battlefield": "目标位于地图边界外",
    "invalid-zone": "这里不是合法建造区",
    "pit-state-unavailable": "这里没有可用矿坑",
    "pit-not-controlled": "需要先控制该矿坑",
    "pit-depleted": "该矿坑已经枯竭",
    "pit-occupied": "该矿坑已有金矿",
    "occupied-hex": "这个格子已被占用",
    "duplicate-building-id": "建筑编号冲突，请重试",
    "invalid-request": "建造请求无效",
    "missing-prerequisite": "需要一座已完成且存活的兵营",
    "building-limit-reached": "该建筑已达到数量上限",
    "production-exit-unavailable": "该位置没有可用的生产出口",
    "would-block-production-exit": "此建筑会封死已有生产出口",
    "building-not-found": "生产建筑不存在或已被摧毁",
    "faction-mismatch": "不能操作敌方建筑",
    "invalid-troop": "未知兵种",
    "wrong-producer": "该兵种必须从对应建筑训练",
    "queue-full": "该建筑的三项生产队列已满",
    "invalid-population": "人口状态异常",
    "population-cap": "人口预留将超过 100 上限",
    "insufficient-gold": "金币不足",
    "building-not-operational": "建筑尚未完工",
    "empty-selection": "请先选择己方兵团",
    "squad-not-found": "所选兵团已不存在",
    "invalid-destination": "命令目标不在可行走地图内",
    "no-path": "所选兵团无法到达目标",
    "target-not-found": "攻击目标已经消失",
    "friendly-target": "不能攻击己方目标",
    "invalid-order": "无效的兵团命令",
  };
  return labels[reason] ?? `操作失败：${reason}`;
}

function winnerLabel(winner: BattleState["winner"], factionRaces: FactionRaces): string {
  if (winner === "verdant") return `${BATTLE_RACE_LABELS[factionRaces.verdant]}·苍蓝军团获胜`;
  if (winner === "crimson") return `${BATTLE_RACE_LABELS[factionRaces.crimson]}·猩红军团获胜`;
  if (winner === "draw") return "双方平局";
  return "";
}

function battleMatchupLabel(factionRaces: FactionRaces): string {
  return `${BATTLE_RACE_LABELS[factionRaces.verdant]} VS ${BATTLE_RACE_LABELS[factionRaces.crimson]}`;
}

export type { WorldPoint };
