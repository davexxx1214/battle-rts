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
import { BattleAudio } from "./audio/BattleAudioPlayer";
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
import { getMatchClock } from "./game/economy";
import type { DeployableKind } from "./game/rules";
import type { BenchmarkSnapshot } from "./game/benchmark";
import {
  BattlefieldCanvas,
  createSceneInteractionBridge,
} from "./scene/BattlefieldCanvas";
import {
  createCameraViewStore,
  DEFAULT_CAMERA_VIEW,
} from "./scene/camera/cameraViewStore";
import {
  DeploymentRail,
  deploymentReasonLabel,
} from "./ui/DeploymentRail";

interface AppState {
  readonly session: BattleSessionState;
  readonly selectedDeployable: DeployableKind | null;
  readonly feedback: DeploymentFeedback | null;
}

interface DeploymentFeedback {
  readonly tone: "success" | "error" | "info";
  readonly message: string;
}

const SIMULATION_STEP_SECONDS = 0.05;
const INITIAL_ARMY_SIZE = 41;

export function App() {
  const benchmarkMode = useMemo(() => (
    new URLSearchParams(window.location.search).get("benchmark") === "80"
  ), []);
  const [app, setApp] = useState<AppState>(() => createAppState(benchmarkMode));
  const { battle, phase: battlePhase } = app.session;
  const [cursorWorld, setCursorWorld] = useState<WorldPoint | null>(null);
  const [cameraResetToken, setCameraResetToken] = useState(0);
  const [battleInstanceRevision, setBattleInstanceRevision] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [benchmark, setBenchmark] = useState<BenchmarkSnapshot | null>(null);
  const bridgeRef = useRef(createSceneInteractionBridge());
  const cameraViewStore = useMemo(createCameraViewStore, []);
  const clock = getMatchClock(battle.matchElapsed);
  const armyCounts = useMemo(() => countArmies(battle), [battle]);
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

  useBattleLoop(setApp, battlePhase);

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
    setApp(createAppState(benchmarkMode));
    setCursorWorld(null);
    setCameraResetToken((current) => current + 1);
    cameraViewStore.publish(DEFAULT_CAMERA_VIEW);
    setBattleInstanceRevision((current) => current + 1);
  }, [benchmarkMode, cameraViewStore]);

  const engageBattle = useCallback(() => {
    setApp((current) => ({
      ...current,
      session: beginBattleSession(current.session),
      feedback: { tone: "info", message: "选择左侧卡牌，然后点击己方势力范围部署" },
    }));
  }, []);

  const selectDeployable = useCallback((kind: DeployableKind) => {
    setApp((current) => ({
      ...current,
      selectedDeployable: kind,
      feedback: { tone: "info", message: "移动到己方区域，绿色预览表示可以部署" },
    }));
  }, []);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!app.selectedDeployable) return;
    const point = localPointer(event);
    setCursorWorld(bridgeRef.current.screenToWorld(point.x, point.y));
  }, [app.selectedDeployable]);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !app.selectedDeployable || !deploymentEnabled) return;
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
    <main className={styles.appShell}>
      <BattleAudio
        battle={battle}
        resetToken={battleInstanceRevision}
        enabled={audioEnabled && battlePhase === "engaged"}
      />
      <header className={styles.commandBar}>
        <div className={styles.brandLockup}>
          <div className={styles.brandSigil} aria-hidden="true">⚔</div>
          <div>
            <p className={styles.kicker}>FORTIFIED CAMP PROTOTYPE</p>
            <h1>IRONFIELD <em>GOLD WAR</em></h1>
          </div>
        </div>
        <div className={styles.battlePulse} aria-live="polite">
          <span>{battlePhase === "briefing"
            ? "等待交战"
            : battle.winner
              ? "战斗结束"
              : clock.phase === "double" ? "双倍金币" : "战线交锋中"}</span>
          <strong>{formatTime(clock.remainingSeconds)}</strong>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.engagementOrder}
            data-open={battlePhase === "briefing"}
            type="button"
            aria-hidden={battlePhase !== "briefing"}
            inert={battlePhase !== "briefing"}
            autoFocus
            onClick={engageBattle}
          >
            <span>BEGIN DEPLOYMENT</span>
            <strong><b aria-hidden="true">⚔</b> 交战</strong>
          </button>
          <button
            className={styles.audioToggle}
            data-enabled={audioEnabled}
            type="button"
            aria-label={audioEnabled ? "关闭音乐和音效" : "开启音乐和音效"}
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

      <section className={styles.warTable} data-phase={battlePhase}>
        <DeploymentRail
          session={app.session}
          selectedKind={app.selectedDeployable}
          onSelect={selectDeployable}
        />

        <div
          className={styles.battlefield}
          data-deploying={app.selectedDeployable !== null}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setCursorWorld(null)}
          onPointerUp={handlePointerUp}
          onContextMenu={(event) => {
            event.preventDefault();
            cancelDeployment();
          }}
          onWheel={handleWheel}
        >
          <BattlefieldCanvas
            battle={battle}
            bridgeRef={bridgeRef}
            deploymentPreview={app.selectedDeployable && deploymentPreview
              ? { kind: app.selectedDeployable, ...deploymentPreview }
              : null}
            cameraResetToken={cameraResetToken}
            cameraViewStore={cameraViewStore}
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
              : fieldFeedback?.message ?? "选择建筑或兵种进入部署模式"}</strong>
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
            <i style={{ height: `${(armyCounts.crimson / INITIAL_ARMY_SIZE) * 100}%` }} />
          </div>
        </aside>
      </section>
    </main>
  );
}

function createAppState(benchmarkMode: boolean): AppState {
  return {
    session: {
      battle: createInitialBattle(),
      phase: benchmarkMode ? "engaged" : "briefing",
    },
    selectedDeployable: null,
    feedback: null,
  };
}

function useBattleLoop(
  setApp: Dispatch<SetStateAction<AppState>>,
  phase: BattlePhase,
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
  }, [phase, setApp]);
}

function localPointer(
  event: Pick<ReactPointerEvent<HTMLDivElement>, "clientX" | "clientY" | "currentTarget">,
) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function countArmies(battle: BattleState) {
  return {
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
  if (winner === "draw") return "三分钟结束 · 双方平局";
  return "";
}

export type { WorldPoint };
