import {
  type PointerEvent as ReactPointerEvent,
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
  issueHoldCommand,
  issueMoveCommand,
  issueStopCommand,
} from "./game/battle";
import {
  advanceBattleSession,
  getBattlePhaseAccess,
  type BattlePhase,
} from "./game/battleSession";
import {
  type SelectionMode,
  applySelection,
  normalizeScreenRect,
  selectFriendlyUnitsInRect,
} from "./game/selection";
import {
  BattlefieldCanvas,
  createSceneInteractionBridge,
  type CommandMarker,
} from "./scene/BattlefieldCanvas";

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
  const [battle, setBattle] = useState<BattleState>(() => createInitialBattle());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [commandMarker, setCommandMarker] = useState<CommandMarker | null>(null);
  const [commandMode, setCommandMode] = useState<"move" | "attack-move">("move");
  const [cameraResetToken, setCameraResetToken] = useState(0);
  const [battleInstanceRevision, setBattleInstanceRevision] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [battlePhase, setBattlePhase] = useState<BattlePhase>("briefing");
  const battleAccess = getBattlePhaseAccess(battlePhase);
  const bridgeRef = useRef(createSceneInteractionBridge());
  const livingUnitKey = battle.units
    .filter((unit) => unit.health > 0)
    .map((unit) => unit.id)
    .join("\u0000");

  useBattleLoop(setBattle, battlePhase);
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
  const armyCounts = useMemo(() => countArmies(battle), [battle]);
  const selectedCounts = useMemo(() => countRoles(selectedUnits), [selectedUnits]);

  const resetBattle = useCallback(() => {
    setBattle(createInitialBattle());
    setSelectedIds([]);
    setCommandMarker(null);
    setCommandMode("move");
    setCameraResetToken((current) => current + 1);
    setBattleInstanceRevision((current) => current + 1);
    setBattlePhase("briefing");
  }, []);

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
    if (!battleAccess.inspectField || event.button !== 0) return;
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
      const picked = pickProjectedUnit(
        bridgeRef.current.projectedUnits,
        "verdant",
        completed.endX,
        completed.endY,
      );
      setSelectedIds((current) => applySelection(
        current,
        picked ? [picked] : [],
        completed.mode,
      ));
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDrag(null);
  }, [drag]);

  const handlePointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDrag(null);
  }, []);

  const handleCommand = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!battleAccess.issueCommands || selectedIds.length === 0 || battle.winner) return;
    const point = localPointer(event);
    const enemyId = pickProjectedUnit(
      bridgeRef.current.projectedUnits,
      "crimson",
      point.x,
      point.y,
    );
    if (enemyId) {
      setBattle((current) => issueAttackCommand(current, selectedIds, enemyId));
      const enemy = battle.units.find((unit) => unit.id === enemyId);
      if (enemy) setCommandMarker({ ...enemy.position, kind: "attack", revision: battle.revision });
      return;
    }
    const destination = bridgeRef.current.screenToWorld(point.x, point.y);
    if (!destination) return;
    setBattle((current) => commandMode === "attack-move"
      ? issueAttackMoveCommand(current, selectedIds, destination)
      : issueMoveCommand(current, selectedIds, destination));
    setCommandMarker({ ...destination, kind: commandMode, revision: battle.revision });
  }, [battle.revision, battle.units, battle.winner, battleAccess.issueCommands, commandMode, selectedIds]);

  const stopSelected = useCallback(() => {
    if (!battleAccess.issueCommands || selectedIds.length === 0 || battle.winner) return;
    setBattle((current) => issueStopCommand(current, selectedIds));
    setCommandMode("move");
  }, [battle.winner, battleAccess.issueCommands, selectedIds]);

  const holdSelected = useCallback(() => {
    if (!battleAccess.issueCommands || selectedIds.length === 0 || battle.winner) return;
    setBattle((current) => issueHoldCommand(current, selectedIds));
    setCommandMode("move");
  }, [battle.winner, battleAccess.issueCommands, selectedIds]);

  useEffect(() => {
    const handleCommandKey = (event: KeyboardEvent) => {
      if (
        !battleAccess.issueCommands
        || event.repeat
        || event.ctrlKey
        || event.metaKey
        || event.altKey
      ) return;
      if (event.key.toLowerCase() === "a") setCommandMode("attack-move");
      if (event.key.toLowerCase() === "m" || event.key === "Escape") setCommandMode("move");
      if (event.key.toLowerCase() === "s") stopSelected();
      if (event.key.toLowerCase() === "h") holdSelected();
    };
    window.addEventListener("keydown", handleCommandKey);
    return () => window.removeEventListener("keydown", handleCommandKey);
  }, [battleAccess.issueCommands, holdSelected, stopSelected]);

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
            onClick={() => setBattlePhase("engaged")}
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
          <div className={styles.commandStrip} aria-label="部队命令">
            <button
              type="button"
              className={styles.commandButton}
              aria-pressed={commandMode === "attack-move"}
              disabled={!battleAccess.issueCommands || selectedUnits.length === 0}
              onClick={() => setCommandMode((current) => (
                current === "attack-move" ? "move" : "attack-move"
              ))}
            >
              <strong>攻击移动</strong>
              <kbd>A</kbd>
            </button>
            <button
              type="button"
              className={styles.commandButton}
              disabled={!battleAccess.issueCommands || selectedUnits.length === 0}
              onClick={holdSelected}
            >
              <strong>坚守</strong>
              <kbd>H</kbd>
            </button>
            <button
              type="button"
              className={styles.commandButton}
              disabled={!battleAccess.issueCommands || selectedUnits.length === 0}
              onClick={stopSelected}
            >
              <strong>停止</strong>
              <kbd>S</kbd>
            </button>
          </div>
          <div className={styles.selectionSummary}>
            <span>当前编队</span>
            <strong>{selectedUnits.length > 0 ? `${selectedUnits.length} 名单位` : "尚未选兵"}</strong>
            <small>{selectedUnits.length > 0 ? "右键地面移动 · 右键敌军集火" : "左键点选，或拖动框选己方单位"}</small>
          </div>
        </aside>

        <div
          className={styles.battlefield}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onContextMenu={handleCommand}
          onWheel={handleWheel}
        >
          <BattlefieldCanvas
            battle={battle}
            selectedIds={selectedIds}
            bridgeRef={bridgeRef}
            commandMarker={commandMarker}
            cameraResetToken={cameraResetToken}
          />
          {drag && <div className={styles.selectionBox} style={dragStyle} />}
          <div className={styles.fieldCaption}>
            <span>方向键平移</span>
            <span>滚轮缩放</span>
            <span>中键旋转</span>
            <span>左键选择</span>
            <span>右键下令</span>
          </div>
          <div className={styles.objectiveFlag}>
            <span>41 对 41 · 战斗目标</span>
            <strong>{commandMode === "attack-move" ? "选择攻击移动落点" : "击溃猩红军团"}</strong>
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

function useBattleLoop(
  setBattle: (update: (state: BattleState) => BattleState) => void,
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
        setBattle((current) => advanceBattleSession(
          current,
          phase,
          steps,
          SIMULATION_STEP_SECONDS,
        ));
      }
      animationFrame = requestAnimationFrame(frame);
    };
    animationFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationFrame);
  }, [phase, setBattle]);
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
  if (winner === "verdant") return "翠绿军团获胜";
  if (winner === "crimson") return "猩红军团获胜";
  if (winner === "draw") return "双方同归于尽";
  return "";
}

export type { WorldPoint };
