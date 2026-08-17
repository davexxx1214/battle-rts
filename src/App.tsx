import {
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import styles from "./App.module.css";
import {
  DEFAULT_GAME_MODE,
  type GameMode,
} from "./app/gameMode";
import { DEFAULT_AUDIO_ENABLED } from "./audio/battleAudio";
import { useBattleAudio } from "./audio/useBattleAudio";
import {
  createInitialBattle,
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
import { getMatchClock } from "./game/economy";
import {
  DEFAULT_AI_DIFFICULTY,
  type AiDifficulty,
  type DeployableKind,
} from "./game/rules";
import { createBenchmarkBattle, type BenchmarkSnapshot } from "./game/benchmark";
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
} from "./ui/DeploymentRail";
import { AiDifficultySelector } from "./ui/AiDifficultySelector";
import { GameModeSelector } from "./ui/GameModeSelector";
import {
  fieldPointerCoordinates,
  fieldPointerDistance,
  pinchZoomFactor,
  pointerDragExceedsThreshold,
  shouldStartFieldPointerInteraction,
  type FieldPoint,
} from "./ui/fieldInput";

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
  const [mode, setMode] = useState<GameMode>(DEFAULT_GAME_MODE);
  const [difficulty, setDifficulty] = useState<AiDifficulty>(DEFAULT_AI_DIFFICULTY);
  const [app, setApp] = useState<AppState>(() => (
    createAppState(benchmarkMode, DEFAULT_GAME_MODE)
  ));
  const { battle, phase: battlePhase } = app.session;
  const [cursorWorld, setCursorWorld] = useState<WorldPoint | null>(null);
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
  const activeTouchPointersRef = useRef(new Map<number, FieldPoint>());
  const singleTouchDragRef = useRef<TouchDragState | null>(null);
  const previousPinchDistanceRef = useRef<number | null>(null);
  const suppressTouchDeploymentRef = useRef(false);
  const cameraViewStore = useMemo(createCameraViewStore, []);
  const clock = getMatchClock(battle.matchElapsed);
  const armyCounts = useMemo(() => countArmies(battle), [battle]);
  const enemyForceShare = armyCounts.crimson / Math.max(
    1,
    armyCounts.verdant + armyCounts.crimson,
  );
  const deploymentEnabled = battlePhase === "engaged" && battle.winner === null;
  const deploymentPreview = useMemo<DeploymentPreview | null>(() => (
    app.selectedDeployable && cursorWorld
      ? previewDeployment(app.session, {
          faction: "verdant",
          kind: app.selectedDeployable,
          worldPosition: cursorWorld,
        })
      : null
  ), [app.selectedDeployable, app.session, cursorWorld]);
  const playUiCue = useBattleAudio({
    battle,
    resetToken: battleInstanceRevision,
    enabled: audioEnabled,
  });

  useBattleLoop(setApp, assetsReady ? battlePhase : "briefing", difficulty);

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
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setCursorWorld(null);
      setApp((current) => current.selectedDeployable
        ? {
            ...current,
            selectedDeployable: null,
            feedback: { tone: "info", message: "已取消部署" },
          }
        : current);
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, []);

  const resetBattle = useCallback(() => {
    setApp(createAppState(benchmarkMode, mode));
    setCursorWorld(null);
    setCameraResetToken((current) => current + 1);
    cameraViewStore.publish(DEFAULT_CAMERA_VIEW);
    setBattleInstanceRevision((current) => current + 1);
  }, [benchmarkMode, cameraViewStore, mode]);

  const changeMode = useCallback((nextMode: GameMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setApp(createAppState(benchmarkMode, nextMode));
    setCursorWorld(null);
    setCameraResetToken((current) => current + 1);
    cameraViewStore.publish(DEFAULT_CAMERA_VIEW);
    setBattleInstanceRevision((current) => current + 1);
  }, [benchmarkMode, cameraViewStore, mode]);

  const changeDifficulty = useCallback((nextDifficulty: AiDifficulty) => {
    if (battlePhase !== "briefing" || nextDifficulty === difficulty) return;
    setDifficulty(nextDifficulty);
  }, [battlePhase, difficulty]);

  const engageBattle = useCallback(() => {
    if (!assetsReady) return;
    setApp((current) => ({
      ...current,
      session: beginBattleSession(current.session),
      feedback: { tone: "info", message: "选择左侧卡牌，然后点击己方势力范围部署" },
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
    playUiCue("select");
    setApp((current) => ({
      ...current,
      selectedDeployable: kind,
      feedback: { tone: "info", message: "移动到己方区域，绿色预览表示可以部署" },
    }));
  }, [playUiCue]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      event.pointerType !== "touch"
      || !shouldStartFieldPointerInteraction(event.button, event.target as Element | null)
    ) return;

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
  }, []);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
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
    if (!app.selectedDeployable) return;
    const point = localPointer(event);
    setCursorWorld(bridgeRef.current.screenToWorld(point.x, point.y));
  }, [app.selectedDeployable]);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
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
        setCursorWorld(null);
        return;
      }
    }

    if (
      !shouldStartFieldPointerInteraction(event.button, event.target as Element | null)
      || !app.selectedDeployable
      || !deploymentEnabled
    ) return;
    const point = localPointer(event);
    const worldPosition = bridgeRef.current.screenToWorld(point.x, point.y);
    if (!worldPosition) return;
    setApp((current) => {
      const kind = current.selectedDeployable;
      if (!kind || current.session.phase !== "engaged") return current;
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
  }, [app.selectedDeployable, deploymentEnabled]);

  const handlePointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    if (singleTouchDragRef.current?.pointerId === event.pointerId) {
      singleTouchDragRef.current = null;
    }
    activeTouchPointersRef.current.delete(event.pointerId);
    previousPinchDistanceRef.current = activeTouchDistance(activeTouchPointersRef.current);
    if (activeTouchPointersRef.current.size === 0) {
      suppressTouchDeploymentRef.current = false;
    }
    setCursorWorld(null);
  }, []);

  const cancelDeployment = useCallback(() => {
    setCursorWorld(null);
    setApp((current) => current.selectedDeployable
      ? {
          ...current,
          selectedDeployable: null,
          feedback: { tone: "info", message: "已取消部署" },
        }
      : current);
  }, []);

  const handleWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    bridgeRef.current.zoomBy(event.deltaY);
  }, []);

  const fieldFeedback = deploymentPreview && !deploymentPreview.valid
    ? { tone: "error" as const, message: deploymentReasonLabel(deploymentPreview.reason) }
    : app.feedback;

  return (
    <main className={styles.appShell} aria-busy={!assetsReady}>
      <header
        className={styles.commandBar}
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
          {!benchmarkMode && <GameModeSelector mode={mode} onChange={changeMode} />}
          {!benchmarkMode && (
            <AiDifficultySelector
              difficulty={difficulty}
              disabled={battlePhase !== "briefing"}
              onChange={changeDifficulty}
            />
          )}
          <div className={styles.battlePulse} aria-live="polite">
            <span>{battlePhase === "briefing"
              ? "等待交战"
              : battle.winner
                ? "战斗结束"
                : clock.phase === "double" ? "双倍金币" : "战线交锋中"}</span>
            <strong>{formatTime(clock.remainingSeconds)}</strong>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.engagementOrder}
            data-open={battlePhase === "briefing"}
            type="button"
            aria-hidden={battlePhase !== "briefing"}
            inert={battlePhase !== "briefing"}
            autoFocus={assetsReady}
            onClick={engageBattle}
          >
            <span>BEGIN DEPLOYMENT</span>
            <strong><b aria-hidden="true">⚔</b> 交战</strong>
          </button>
          <button
            className={styles.audioToggle}
            data-enabled={audioEnabled}
            type="button"
            aria-label={audioEnabled ? "关闭结算音乐和界面音效" : "开启结算音乐和界面音效"}
            aria-pressed={audioEnabled}
            onClick={() => setAudioEnabled((current) => !current)}
          >
            <span aria-hidden="true">{audioEnabled ? "♪" : "×"}</span>
            音频 <strong>{audioEnabled ? "开启" : "关闭"}</strong>
          </button>
          <button className={styles.restartButton} type="button" onClick={resetBattle}>
            重新开局
          </button>
        </div>
      </header>

      <section
        className={styles.warTable}
        data-phase={battlePhase}
        inert={!assetsReady}
        aria-hidden={!assetsReady}
      >
        <DeploymentRail
          session={app.session}
          selectedKind={app.selectedDeployable}
          onSelect={selectDeployable}
        />

        <div
          className={styles.battlefield}
          data-deploying={app.selectedDeployable !== null}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setCursorWorld(null)}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onContextMenu={(event) => {
            event.preventDefault();
            cancelDeployment();
          }}
          onWheel={handleWheel}
        >
          <BattlefieldCanvas
            battle={battle}
            bridgeRef={bridgeRef}
            deploymentKind={app.selectedDeployable}
            deploymentPreview={app.selectedDeployable && deploymentPreview
              ? { kind: app.selectedDeployable, ...deploymentPreview }
              : null}
            cameraResetToken={cameraResetToken}
            cameraViewStore={cameraViewStore}
            onAssetProgress={setAssetLoadProgress}
            onAssetsReady={handleAssetsReady}
            onAssetError={handleAssetError}
            onBenchmarkUpdate={benchmarkMode ? setBenchmark : undefined}
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
            <span>{app.selectedDeployable ? "左键部署 · 右键取消" : "从左侧选择部署单位"}</span>
          </div>
          <div className={styles.objectiveFlag} data-tone={fieldFeedback?.tone ?? "info"}>
            <span>{app.selectedDeployable ? "DEPLOYMENT MODE" : "FORTIFIED FRONT"}</span>
            <strong aria-live="polite">{battlePhase === "briefing"
              ? "点击交战，开始三分钟攻防"
              : fieldFeedback?.message ?? (app.selectedDeployable
                ? "移动到己方区域，绿色预览表示可以部署"
                : "选择建筑或兵种进入部署模式")}</strong>
          </div>
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
            <span>THE FIELD IS DECIDED</span>
            <strong>{winnerLabel(battle.winner)}</strong>
            <button type="button" onClick={resetBattle}>再次交锋</button>
          </div>
        </div>

        <aside className={styles.enemyRail} aria-label="敌军状态">
          <span>ENEMY HOST</span>
          <strong>{armyCounts.crimson}</strong>
          <small>猩红军团存活</small>
          <div className={styles.forceMeter}>
            <i style={{ height: `${enemyForceShare * 100}%` }} />
          </div>
        </aside>
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

function createAppState(benchmarkMode: boolean, mode: GameMode): AppState {
  return {
    session: {
      battle: benchmarkMode
        ? createBenchmarkBattle(80)
        : mode === "arena" ? createArenaBattle() : createInitialBattle(),
      phase: benchmarkMode ? "engaged" : "briefing",
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
    window.matchMedia("(orientation: portrait)").matches,
  );
}

function activeTouchDistance(touches: ReadonlyMap<number, FieldPoint>): number | null {
  const [first, second] = touches.values();
  return first && second ? fieldPointerDistance(first, second) : null;
}

function countArmies(battle: BattleState) {
  return {
    verdant: battle.units.filter((unit) => (
      unit.faction === "verdant" && unit.health > 0
    )).length,
    crimson: battle.units.filter((unit) => (
      unit.faction === "crimson" && unit.health > 0
    )).length,
  };
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function winnerLabel(winner: BattleState["winner"]): string {
  if (winner === "verdant") return "苍蓝军团获胜";
  if (winner === "crimson") return "猩红军团获胜";
  if (winner === "draw") return "双方平局";
  return "";
}

export type { WorldPoint };
