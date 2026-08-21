import type { SandboxSquadOrderKind } from "../game/sandboxOrders";
import styles from "./SandboxSquadCommandBar.module.css";

interface SandboxSquadCommandBarProps {
  readonly selectedCount: number;
  readonly armedOrder: "move" | "attack" | "attack-move" | null;
  readonly disabled?: boolean;
  readonly onArmOrder: (kind: "move" | "attack" | "attack-move") => void;
  readonly onImmediateOrder: (kind: "stop" | "hold") => void;
}

const COMMANDS: readonly {
  readonly kind: SandboxSquadOrderKind;
  readonly label: string;
  readonly shortcut: string;
  readonly armed: boolean;
}[] = [
  { kind: "move", label: "移动", shortcut: "M", armed: true },
  { kind: "attack", label: "攻击", shortcut: "R", armed: true },
  { kind: "attack-move", label: "攻移", shortcut: "A", armed: true },
  { kind: "stop", label: "停止", shortcut: "S", armed: false },
  { kind: "hold", label: "坚守", shortcut: "H", armed: false },
];

export function SandboxSquadCommandBar({
  selectedCount,
  armedOrder,
  disabled = false,
  onArmOrder,
  onImmediateOrder,
}: SandboxSquadCommandBarProps) {
  const unavailable = disabled || selectedCount === 0;
  return (
    <aside
      className={styles.bar}
      data-field-ui
      data-active={selectedCount > 0}
      aria-label="沙盒兵团命令"
    >
      <div className={styles.selectionSummary}>
        <span>已选兵团</span>
        <strong>{selectedCount}</strong>
      </div>
      <div className={styles.commands}>
        {COMMANDS.map((command) => (
          <button
            type="button"
            key={command.kind}
            disabled={unavailable}
            data-armed={armedOrder === command.kind}
            aria-pressed={command.armed ? armedOrder === command.kind : undefined}
            onClick={() => command.armed
              ? onArmOrder(command.kind as "move" | "attack" | "attack-move")
              : onImmediateOrder(command.kind as "stop" | "hold")}
          >
            <span>{command.label}</span>
            <kbd>{command.shortcut}</kbd>
          </button>
        ))}
      </div>
      <small>{armedOrder
        ? armedOrder === "attack"
          ? "点击敌军或敌方建筑"
          : "点击地图下达目标"
        : "右键地面移动 · 右键敌军攻击"}</small>
    </aside>
  );
}
