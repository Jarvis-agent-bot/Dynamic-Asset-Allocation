import type {
  CSSProperties,
  Dispatch,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  SetStateAction,
} from "react";
import { useId } from "react";

import type { DaaMarketIndicatorConfigKey, DaaSystemConfig } from "@/src/daa/config/systemConfig";

export const SETTINGS_NAV_ITEMS_ = [
  { id: "strategy", label: "基础策略", desc: "调仓节奏、执行规则与风控参数。" },
  { id: "brain", label: "大脑与自动化", desc: "AI 授权等级、认知循环与配置落地策略。" },
  { id: "data", label: "数据与模型", desc: "行情、资讯、汇率、AI 解读与人因输入。" },
  { id: "notification", label: "通知", desc: "Telegram 与飞书的触发策略和运行状态。" },
  { id: "secrets", label: "凭证与连接", desc: "API Key、Token、Webhook 与连通性管理。" },
] as const;

export type SettingsNavItemId = (typeof SETTINGS_NAV_ITEMS_)[number]["id"];

export const MARKET_INDICATOR_ITEMS_: Array<{
  key: DaaMarketIndicatorConfigKey;
  label: string;
  hint: string;
  dependencies: string;
}> = [
  { key: "vix", label: "美股恐慌指数 (VIX)", hint: "衡量美股隐含波动，越高通常代表美股更偏防守。", dependencies: "^VIX" },
  { key: "qqqSpyRatio", label: "美股成长/大盘比 (QQQ/SPY)", hint: "观察美股成长风格相对宽基大盘的强弱切换。", dependencies: "QQQ, SPY" },
  { key: "fxiVolatility", label: "港中概波动率 (FXI)", hint: "衡量港股 / 中概代表指数的波动压力。", dependencies: "FXI" },
  { key: "kwebFxiRatio", label: "中概互联/大盘比 (KWEB/FXI)", hint: "观察中概互联网相对中国大盘的风险偏好。", dependencies: "KWEB, FXI" },
  { key: "btcEthRatio", label: "比特币/以太坊比 (BTC/ETH)", hint: "观察加密市场在防守与进攻风格之间的切换。", dependencies: "BTC-USD, ETH-USD" },
  { key: "btcVolatility", label: "比特币波动率 (BTC)", hint: "衡量加密市场核心资产的波动风险。", dependencies: "BTC-USD" },
  { key: "goldSilverRatio", label: "金银比 (GC/SI)", hint: "高位通常意味着宏观资金更偏防御。", dependencies: "GC=F, SI=F" },
];

export type SettingsConfigSetter = Dispatch<SetStateAction<DaaSystemConfig | null>>;

export const settingsGridCols2Style: CSSProperties = {
  display: "grid",
  gap: 18,
  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
};

export const settingsGridCols3Style: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid var(--border-strong)",
  background: "var(--elevated)",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: "var(--font-body)",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s, box-shadow 0.15s, background 0.15s",
};

const selectStyle: CSSProperties = {
  ...inputStyle,
  appearance: "none",
  cursor: "pointer",
};

export function FormInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const generatedId = useId();
  const controlId = props.id ?? generatedId;
  const controlName = props.name ?? controlId;

  return (
    <input
      {...props}
      id={controlId}
      name={controlName}
      style={inputStyle}
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

export function FormSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const generatedId = useId();
  const controlId = props.id ?? generatedId;
  const controlName = props.name ?? controlId;

  return (
    <select
      {...props}
      id={controlId}
      name={controlName}
      style={selectStyle}
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

export function NumberInput(props: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  id?: string;
  name?: string;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <FormInput
      type="number"
      id={props.id}
      name={props.name}
      value={Number.isFinite(props.value) ? props.value : 0}
      min={props.min}
      max={props.max}
      step={props.step || 1}
      disabled={props.disabled}
      onChange={(e) => props.onChange(Number(e.target.value))}
    />
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: "var(--faint)",
        marginBottom: 8,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

export function CheckboxRow({
  checked,
  onChange,
  children,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  const generatedId = useId();

  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 13,
        color: disabled ? "var(--faint)" : "var(--muted)",
        userSelect: "none",
      }}
    >
      <input
        type="checkbox"
        id={generatedId}
        name={generatedId}
        className="daa-checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: "var(--primary)" }}
      />
      {children}
    </label>
  );
}

export function SectionCard({
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
        borderRadius: 18,
        border: "1px solid var(--border)",
        background: "linear-gradient(180deg, rgba(17,23,38,0.94), rgba(9,13,24,0.98))",
        overflow: "hidden",
        boxShadow: "0 24px 60px rgba(0,0,0,0.22)",
      }}
    >
      <div
        style={{
          padding: "16px 18px",
          borderBottom: "1px solid var(--border)",
          background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0))",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", letterSpacing: "0.01em" }}>{title}</div>
        {description ? (
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 5, lineHeight: 1.7 }}>
            {description}
          </div>
        ) : null}
      </div>
      <div style={{ padding: "18px" }}>{children}</div>
    </div>
  );
}


export function SubsectionCard({
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
        borderRadius: 16,
        border: "1px solid var(--border)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))",
        padding: 16,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", letterSpacing: "0.01em" }}>{title}</div>
      {description ? (
        <div style={{ marginTop: 5, fontSize: 12, color: "var(--muted)", lineHeight: 1.75 }}>
          {description}
        </div>
      ) : null}
      <div style={{ marginTop: 14 }}>{children}</div>
    </div>
  );
}

export const settingsPresetButtonStyle: CSSProperties = {
  padding: "7px 12px",
  borderRadius: 999,
  fontSize: 12,
  cursor: "pointer",
  border: "1px solid var(--border-strong)",
  background: "rgba(255,255,255,0.03)",
  color: "var(--muted)",
  fontFamily: "var(--font-body)",
  transition: "all 0.15s",
  fontWeight: 600,
};
