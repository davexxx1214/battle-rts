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
  type BattleState,
  type Faction,
  type UnitRole,
  type WorldPoint,
  createInitialBattle,
  issueAttackMoveCommand,
  issueAttackCommand,
} from "./game/battle";
import {
  advanceBattleSession,
  beginBattleSession,
  getBattlePhaseAccess,
  type BattlePhase,
  type BattleSessionState,
} from "./game/battleSession";
import {
  queuePlannedCommand,
  type PlannedCommand,
} from "./game/battlePlans";
import {
  type SelectionMode,
  applySelection,
  normalizeScreenRect,
  resolveFieldClickIntent,
  selectLivingFriendlyRole,
  selectFriendlyUnitsInRect,
} from "./game/selection";
import {
  BattlefieldCanvas,
  createSceneInteractionBridge,
  type CommandMarker,
} from "./scene/BattlefieldCanvas";
import {
  createCameraViewStore,
  DEFAULT_CAMERA_VIEW,
} from "./scene/camera/cameraViewStore";
import { TacticalHudPanel } from "./ui/TacticalHudPanel";
import { shouldStartFieldPointerInteraction } from "./ui/fieldInput";
import type { BenchmarkSnapshot } from "./game/benchmark";

interface DragState {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  readonly mode: SelectionMode;
}

const SIMULATION_STEP_SECONDS = 0.05;
const CLICK_THRESHOLD = 8;
const UNIT_PICK_RADIUS = 34;
const INITIAL_ARMY_SIZE = 41;

const ROLE_LABELS: Readonly<Record<UnitRole, string>> = {
  knight: "盾锋骑士",
  ranger: "长弓游侠",
  mage: "奥术法师",
  catapult: "攻城投石车",
};

export function App() {
  const benchmarkMode = useMemo(() => (
    new URLSearchParams(window.location.search).get("benchmark") === "80"
  ), []);
  const [session, setSession] = useState<BattleSessionState>(() => ({
    battle: createInitialBattle(),
    phase: benchmarkMode ? "engaged" : "briefing",
    plannedCommands: [],
  }));
  const { battle, phase: battlePhase, plannedCommands } = session;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [commandMarker, setCommandMarker] = useState<CommandMarker | null>(null);
  const [cameraResetToken, setCameraResetToken] = useState(0);
  const [battleInstanceRevision, setBattleInstanceRevision] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [benchmark, setBenchmark] = useState<BenchmarkSnapshot | null>(null);
  const battleAccess = getBattlePhaseAccess(battlePhase);
  const bridgeRef = useRef(createSceneInteractionBridge());
  const commandRevision = useRef(0);
  const cameraViewStore = useMemo(createCameraViewStore, []);
  const livingUnitKey = battle.units
    .filter((unit) => unit.health > 0)
    .map((unit) => unit.id)
    .join("\u0000");

  useBattleLoop(setSession, battlePhase);
  useEffect(() => {
    const living = new Set(livingUnitKey ? livingUnitKey.split("\u0000") : []);
    setSelectedIds((current) => {
      const next = current.filter((id) => living.has(id));
      return next.length === current.length ? current : next;
    });
  }, [livingUnitKey]);

  const selectedUnits = useMemo(
    () => battle.units.filter((unit) => selectedIds.includes(unit.id) && unit.health > 0),
    [battle.units, selectedIds],
  );
  const commandableSelectedIds = useMemo(
    () => selectedUnits.map((unit) => unit.id),
    [selectedUnits],
  );
  const armyCounts = useMemo(() => countArmies(battle), [battle]);
  const selectedCounts = useMemo(() => countRoles(selectedUnits), [selectedUnits]);
  const plannedCommandMarkers = useMemo<CommandMarker[]>(() => plannedCommands.map(
    (command, index) => command.kind === "attack"
      ? {
          kind: "attack",
          revision: index,
          x: 0,
          z: 0,
          targetId: command.targetId,
          unitIds: command.unitIds,
          persistent: true,
        }
      : plannedAttackMoveMarker(command, index, battle),
  ), [battle.units, plannedCommands]);

  const resetBattle = useCallback(() => {
    setSession({
      battle: createInitialBattle(),
      phase: "briefing",
      plannedCommands: [],
    });
    setSelectedIds([]);
    setCommandMarker(null);
    setCameraResetToken((current) => current + 1);
    cameraViewStore.publish(DEFAULT_CAMERA_VIEW);
    setBattleInstanceRevision((current) => current + 1);
  }, [cameraViewStore]);

  const selectRole = useCallback((role?: UnitRole) => {
    setSelectedIds(battle.units
      .filter((unit) => (
        unit.faction === "verdant"
        && unit.health > 0
        && (role === undefined || unit.role === role)
      ))
      .map((unit) => unit.id));
  }, [battle.units]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      !battleAccess.inspectField
      || !shouldStartFieldPointerInteraction(event.button, event.target as Element)
    ) return;
    const point = localPointer(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      endX: point.x,
      endY: point.y,
      mode: event.shiftKey ? "toggle" : "replace",
    });
  }, [battleAccess.inspectField]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const point = localPointer(event);
    setDrag((current) => current?.pointerId === event.pointerId
      ? { ...current, endX: point.x, endY: point.y }
      : current);
  }, []);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = localPointer(event);
    const completed = { ...drag, endX: point.x, endY: point.y };
    const travelled = Math.hypot(
      completed.endX - completed.startX,
      completed.endY - completed.startY,
    );
    if (travelled > CLICK_THRESHOLD) {
      const rect = normalizeScreenRect(completed);
      if (rect) {
        const incoming = selectFriendlyUnitsInRect(bridgeRef.current.projectedUnits, rect);
        setSelectedIds((current) => applySelection(current, incoming, completed.mode));
      }
    } else {
      const friendlyId = pickProjectedUnit(
        bridgeRef.current.projectedUnits,
        "verdant",
        completed.endX,
        completed.endY,
      );
      const enemyId = pickProjectedUnit(
        bridgeRef.current.projectedUnits,
        "crimson",
        completed.endX,
        completed.endY,
      );
      const intent = resolveFieldClickIntent({
        canIssueCommands: (battleAccess.issueCommands || battleAccess.planCommands) && !battle.winner,
        hasCommandableSelection: commandableSelectedIds.length > 0,
        friendlyId,
        enemyId,
      });
      if (intent.type === "select") {
        const roleIds = selectLivingFriendlyRole(battle.units, intent.unitId);
        setSelectedIds((current) => applySelection(
          current,
          roleIds,
          completed.mode,
        ));
      } else if (intent.type === "attack") {
        if (battleAccess.planCommands) {
          setSession((current) => ({
            ...current,
            plannedCommands: queuePlannedCommand(current.plannedCommands, {
              kind: "attack",
              unitIds: commandableSelectedIds,
              targetId: intent.targetId,
            }),
          }));
        } else {
          setSession((current) => ({
            ...current,
            battle: issueAttackCommand(
              current.battle,
              commandableSelectedIds,
              intent.targetId,
            ),
          }));
        }
        const enemy = battle.units.find((unit) => unit.id === intent.targetId);
        if (enemy && battleAccess.issueCommands) {
          commandRevision.current += 1;
          setCommandMarker({
            ...enemy.position,
            kind: "attack",
            revision: commandRevision.current,
            targetId: intent.targetId,
          });
        }
      } else if (intent.type === "advance") {
        const destination = bridgeRef.current.screenToWorld(completed.endX, completed.endY);
        if (destination) {
          if (battleAccess.planCommands) {
            setSession((current) => ({
              ...current,
              plannedCommands: queuePlannedCommand(current.plannedCommands, {
                kind: "attack-move",
                unitIds: commandableSelectedIds,
                destination,
              }),
            }));
          } else {
            setSession((current) => ({
              ...current,
              battle: issueAttackMoveCommand(
                current.battle,
                commandableSelectedIds,
                destination,
              ),
            }));
            commandRevision.current += 1;
            setCommandMarker({
              ...destination,
              kind: "attack-move",
              revision: commandRevision.current,
              facing: commandFacing(
                selectedUnits.map((unit) => unit.position),
                destination,
              ),
              unitIds: [...commandableSelectedIds],
            });
          }
        }
      } else {
        setSelectedIds((current) => applySelection(current, [], completed.mode));
      }
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDrag(null);
  }, [
    battle.units,
    battle.winner,
    battleAccess.issueCommands,
    battleAccess.planCommands,
    commandableSelectedIds,
    selectedUnits,
    drag,
  ]);

  const handlePointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDrag(null);
  }, []);

  const handleWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    bridgeRef.current.zoomBy(event.deltaY);
  }, []);

  const dragStyle = drag ? {
    left: Math.min(drag.startX, drag.endX),
    top: Math.min(drag.startY, drag.endY),
    width: Math.abs(drag.endX - drag.startX),
    height: Math.abs(drag.endY - drag.startY),
  } : undefined;

  const engageBattle = useCallback(() => {
    setSession((current) => beginBattleSession(current, "verdant"));
    setCommandMarker(null);
  }, []);

  return (
    <main className={styles.appShell}>
      <BattleAudio
        battle={battle}
        resetToken={battleInstanceRevision}
        commandMarker={commandMarker}
        enabled={audioEnabled && battlePhase === "engaged"}
      />
      <header className={styles.commandBar}>
        <div className={styles.brandLockup}>
          <div className={styles.brandSigil} aria-hidden="true">⚔</div>
          <div>
            <p className={styles.kicker}>TACTICAL COMBAT PROTOTYPE</p>
            <h1>IRONFIELD <em>RTS</em></h1>
          </div>
        </div>
        <div className={styles.battlePulse} aria-live="polite">
          <span>{battlePhase === "briefing"
            ? "战场检阅中"
            : battle.winner
              ? "战斗结束"
              : battle.elapsed < 2 ? "双方正在列阵" : "战线交锋中"}</span>
          <strong>{formatTime(battle.elapsed)}</strong>
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
            <span>ISSUE ORDER</span>
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
            重新列阵
          </button>
        </div>
      </header>

      <section className={styles.warTable} data-phase={battlePhase}>
        <aside className={styles.leftRail} aria-label="部队控制">
          <div className={styles.railHeading}>
            <span>YOUR COMPANY</span>
            <strong>{armyCounts.verdant} 存活</strong>
          </div>
          <button className={styles.selectAllButton} type="button" onClick={() => selectRole()}>
            全选军团 <kbd>拖框</kbd>
          </button>
          <div className={styles.roleList}>
            {(["knight", "ranger", "mage", "catapult"] as const).map((role) => (
              <button
                className={styles.roleButton}
                data-role={role}
                type="button"
                onClick={() => selectRole(role)}
                key={role}
              >
                <span className={styles.roleGlyph}>{roleGlyph(role)}</span>
                <span>
                  <strong>{ROLE_LABELS[role]}</strong>
                  <small>{roleDescription(role)}</small>
                </span>
                <em>{selectedCounts[role]}/{armyCounts.verdantByRole[role]}</em>
              </button>
            ))}
          </div>
        </aside>

        <div
          className={styles.battlefield}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onContextMenu={(event) => event.preventDefault()}
          onWheel={handleWheel}
        >
          <BattlefieldCanvas
            battle={battle}
            selectedIds={selectedIds}
            bridgeRef={bridgeRef}
            commandMarker={commandMarker}
            plannedCommandMarkers={plannedCommandMarkers}
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
          {drag && <div className={styles.selectionBox} style={dragStyle} />}
          <div className={styles.fieldCaption}>
            <span>方向键平移</span>
            <span>滚轮缩放</span>
            <span>中键旋转</span>
            <span>左键 / 触屏：选择或进攻</span>
          </div>
          <div className={styles.objectiveFlag}>
            <span>41 对 41 · 战斗目标</span>
            <strong>{battlePhase === "briefing"
              ? plannedCommands.length > 0
                ? `已预设 ${plannedCommands.length} 路军令 · 可继续调整`
                : "选兵后点击敌军或空地预设军令"
              : "选兵后点击战场下令"}</strong>
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

        <TacticalHudPanel
          battle={battle}
          selectedIds={selectedIds}
          cameraViewStore={cameraViewStore}
        />

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

function useBattleLoop(
  setSession: Dispatch<SetStateAction<BattleSessionState>>,
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
        setSession((current) => {
          const battle = advanceBattleSession(
            current.battle,
            current.phase,
            steps,
            SIMULATION_STEP_SECONDS,
          );
          return battle === current.battle ? current : { ...current, battle };
        });
      }
      animationFrame = requestAnimationFrame(frame);
    };
    animationFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationFrame);
  }, [phase, setSession]);
}

function localPointer(event: Pick<ReactPointerEvent<HTMLDivElement>, "clientX" | "clientY" | "currentTarget">) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function pickProjectedUnit(
  units: readonly { id: string; faction: Faction; x: number; y: number; alive: boolean; visible: boolean }[],
  faction: Faction,
  x: number,
  y: number,
): string | null {
  const match = units
    .filter((unit) => unit.faction === faction && unit.alive && unit.visible)
    .map((unit) => ({ id: unit.id, distance: Math.hypot(unit.x - x, unit.y - y) }))
    .filter(({ distance }) => distance <= UNIT_PICK_RADIUS)
    .sort((first, second) => first.distance - second.distance)[0];
  return match?.id ?? null;
}

function countRoles(units: readonly { role: UnitRole }[]): Record<UnitRole, number> {
  return units.reduce<Record<UnitRole, number>>(
    (counts, unit) => ({ ...counts, [unit.role]: counts[unit.role] + 1 }),
    { knight: 0, ranger: 0, mage: 0, catapult: 0 },
  );
}

function countArmies(battle: BattleState) {
  const verdant = battle.units.filter((unit) => unit.faction === "verdant" && unit.health > 0);
  const crimson = battle.units.filter((unit) => unit.faction === "crimson" && unit.health > 0);
  return {
    verdant: verdant.length,
    crimson: crimson.length,
    verdantByRole: countRoles(verdant),
  };
}

function roleGlyph(role: UnitRole): string {
  if (role === "knight") return "◆";
  if (role === "ranger") return "➶";
  if (role === "mage") return "✦";
  return "◉";
}

function roleDescription(role: UnitRole): string {
  if (role === "knight") return "高生命 · 近战阻挡";
  if (role === "ranger") return "远距离 · 单体压制";
  if (role === "mage") return "范围伤害 · 脆弱后排";
  return "超远射程 · 重型范围打击";
}

function formatTime(seconds: number): string {
  const total = Math.floor(seconds);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function winnerLabel(winner: BattleState["winner"]): string {
  if (winner === "verdant") return "苍蓝军团获胜";
  if (winner === "crimson") return "猩红军团获胜";
  if (winner === "draw") return "双方同归于尽";
  return "";
}

function commandFacing(points: readonly WorldPoint[], destination: WorldPoint): number {
  if (points.length === 0) return 0;
  const total = points.reduce(
    (sum, point) => ({ x: sum.x + point.x, z: sum.z + point.z }),
    { x: 0, z: 0 },
  );
  const center = { x: total.x / points.length, z: total.z / points.length };
  return Math.atan2(destination.x - center.x, destination.z - center.z);
}

function plannedAttackMoveMarker(
  command: Extract<PlannedCommand, { readonly kind: "attack-move" }>,
  revision: number,
  battle: BattleState,
): CommandMarker {
  const units = battle.units.filter((unit) => (
    command.unitIds.includes(unit.id)
    && unit.health > 0
  ));
  return {
    ...command.destination,
    kind: "attack-move",
    revision,
    facing: commandFacing(units.map((unit) => unit.position), command.destination),
    persistent: true,
  };
}

export type { WorldPoint };
