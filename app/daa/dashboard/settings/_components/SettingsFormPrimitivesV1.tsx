import type {
  CSSProperties,
  Dispatch,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  SetStateAction,
} from "react";

import type { DaaMarketIndicatorConfigKeyV2, DaaSystemConfigV2 } from "@/src/daa/config/systemConfigV2";

export const SETTINGS_NAV_ITEMS_V1 = [
  { id: "strategy", label: "再平衡策略", desc: "调仓节奏、触发条件与自动分析。" },
  { id: "risk", label: "风控参数", desc: "集中度、仓位和止盈止损阈值。" },
  { id: "data", label: "数据源", desc: "行情、资讯、汇率、AI 解读与市场状态层。" },
  { id: "human-factor", label: "人因数据源", desc: "基金池范围与人工信号叠加。" },
  { id: "notification", label: "通知", desc: "邮件和 Telegram 触发策略。" },
] as const;

export type SettingsNavItemIdV1 = (typeof SETTINGS_NAV_ITEMS_V1)[number]["id"];

export const MARKET_INDICATOR_ITEMS_V1: Array<{
  key: DaaMarketIndicatorConfigKeyV2;
  label: string;
  hint: string;
  dependencies: string;
}> = [
  { key: "vix", label: "VIX", hint: "衡量美股隐含波动，越高通常代表美股更偏防守。", dependencies: "^VIX" },
  { key: "qqqSpyRatio", label: "QQQ / SPY", hint: "观察美股成长风格相对宽基大盘的强弱切换。", dependencies: "QQQ, SPY" },
  { key: "fxiVolatility", label: "FXI 波动率", hint: "衡量港股 / 中概代表指数的波动压力。", dependencies: "FXI" },
  { key: "kwebFxiRatio", label: "KWEB / FXI", hint: "观察中概互联网相对中国大盘的风险偏好。", dependencies: "KWEB, FXI" },
  { key: "btcEthRatio", label: "BTC / ETH", hint: "观察加密市场在防守与进攻风格之间的切换。", dependencies: "BTC-USD, ETH-USD" },
  { key: "btcVolatility", label: "BTC 波动率", hint: "衡量加密市场核心资产的波动风险。", dependencies: "BTC-USD" },
  { key: "goldSilverRatio", label: "金银比", hint: "高位通常意味着宏观资金更偏防御。", dependencies: "GC=F, SI=F" },
];

export type SettingsConfigSetterV1 = Dispatch<SetStateAction<DaaSystemConfigV2 | null>>;

export const settingsGridCols2StyleV1: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
};

export const settingsGridCols3StyleV1: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
};

const inputStyleV1: CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 6,
  border: "1px solid var(--border-strong)",
  background: "var(--elevated)",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: "var(--font-body)",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s, box-shadow 0.15s",
};

const selectStyleV1: CSSProperties = {
  ...inputStyleV1,
  appearance: "none",
  cursor: "pointer",
};

export function FormInputV1(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={inputStyleV1}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "var(--primary)";
        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(56,189,248,0.12)";
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "var(--border-strong)";
        e.currentTarget.style.boxShadow = "none";
        props.onBlur?.(e);
      }}
    />
  );
}

export function FormSelectV1(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      style={selectStyleV1}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "var(--primary)";
        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(56,189,248,0.12)";
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "var(--border-strong)";
        e.currentTarget.style.boxShadow = "none";
        props.onBlur?.(e);
      }}
    />
  );
}

export function NumberInputV1(props: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <FormInputV1
      type="number"
      value={Number.isFinite(props.value) ? props.value : 0}
      min={props.min}
      max={props.max}
      step={props.step || 1}
      disabled={props.disabled}
      onChange={(e) => props.onChange(Number(e.target.value))}
    />
  );
}

export function FieldLabelV1({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 500,
        color: "var(--muted)",
        marginBottom: 6,
        letterSpacing: "0.02em",
      }}
    >
      {children}
    </div>
  );
}

export function CheckboxRowV1({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
        fontSize: 13,
        color: "var(--muted)",
        userSelect: "none",
      }}
    >
      <input
        type="checkbox"
        className="daa-checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: "var(--primary)" }}
      />
      {children}
    </label>
  );
}

export function SectionCardV1({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        borderRadius: 10,
        border: "1px solid var(--border)",
        background: "var(--card)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{title}</div>
        {description ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{description}</div> : null}
      </div>
      <div style={{ padding: "16px" }}>{children}</div>
    </div>
  );
}


export function SubsectionCardV1({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        borderRadius: 10,
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.02)",
        padding: 14,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{title}</div>
      {description ? <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>{description}</div> : null}
      <div style={{ marginTop: 14 }}>{children}</div>
    </div>
  );
}

export const settingsPresetButtonStyleV1: CSSProperties = {
  padding: "4px 12px",
  borderRadius: 6,
  fontSize: 12,
  cursor: "pointer",
  border: "1px solid var(--border-strong)",
  background: "var(--elevated)",
  color: "var(--muted)",
  fontFamily: "var(--font-body)",
  transition: "all 0.15s",
};
