import { DAA_STEP_STATUS_LABEL } from "../steps";

export default function StatusPill({ status }) {
  const label = DAA_STEP_STATUS_LABEL[status] || status || "";
  const bg =
    status === "wip"
      ? "#e6f4ff"
      : status === "todo"
        ? "#fff7e6"
        : status === "done"
          ? "#f6ffed"
          : "#f5f5f5";
  const fg =
    status === "wip"
      ? "#0958d9"
      : status === "todo"
        ? "#ad4e00"
        : status === "done"
          ? "#237804"
          : "#555";

  return (
    <span
      aria-label={label ? `状态: ${label}` : "状态"}
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        background: bg,
        color: fg,
        border: "1px solid rgba(0,0,0,0.06)",
        lineHeight: "18px",
      }}
    >
      {label}
    </span>
  );
}
