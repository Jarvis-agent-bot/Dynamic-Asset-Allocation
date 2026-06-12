import type {
  Dispatch,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  SetStateAction,
} from "react";
import { useId, useState } from "react";

import { cn } from "@/lib/utils";
import type { DaaMarketIndicatorConfigKey, DaaSystemConfig } from "@/src/daa/config/systemConfig";

export const SETTINGS_NAV_ITEMS = [
  { id: "strategy", label: "策略与风控" },
  { id: "brain", label: "投资助理" },
  { id: "data", label: "数据与连接" },
  { id: "notification", label: "通知" },
] as const;

export type SettingsNavItemId = (typeof SETTINGS_NAV_ITEMS)[number]["id"];

export const MARKET_INDICATOR_ITEMS: Array<{
  key: DaaMarketIndicatorConfigKey;
  label: string;
  hint: string;
  dependencies: string;
}> = [
  { key: "vix", label: "美股恐慌指数 (VIX)", hint: "衡量美股隐含波动，越高通常代表美股风险压力越高。", dependencies: "^VIX" },
  { key: "qqqSpyRatio", label: "美股成长/大盘比 (QQQ/SPY)", hint: "观察美股成长风格相对宽基大盘的强弱切换。", dependencies: "QQQ, SPY" },
  { key: "fxiVolatility", label: "港中概波动率 (FXI)", hint: "衡量港股 / 中概代表指数的波动压力。", dependencies: "FXI" },
  { key: "kwebFxiRatio", label: "中概互联/大盘比 (KWEB/FXI)", hint: "观察中概互联网相对中国大盘的风险偏好。", dependencies: "KWEB, FXI" },
  { key: "btcEthRatio", label: "比特币/以太坊比 (BTC/ETH)", hint: "观察加密市场在防守与进攻风格之间的切换。", dependencies: "BTC-USD, ETH-USD" },
  { key: "btcVolatility", label: "比特币波动率 (BTC)", hint: "衡量加密市场核心资产的波动风险。", dependencies: "BTC-USD" },
  { key: "goldSilverRatio", label: "金银比 (GC/SI)", hint: "高位通常意味着宏观资金更偏防御。", dependencies: "GC=F, SI=F" },
  { key: "yieldCurveSpread", label: "收益率曲线斜率 (IEF/SHY)", hint: "观察债券期限结构是否进入更防守的宏观状态。", dependencies: "IEF, SHY" },
  { key: "usdStrength", label: "美元波动压力 (UUP)", hint: "衡量美元波动压力，对非美风险资产有辅助解释。", dependencies: "UUP" },
  { key: "creditSpread", label: "信用利差 (HYG/LQD)", hint: "观察信用风险偏好是否收缩。", dependencies: "HYG, LQD" },
  { key: "inflationExpectation", label: "通胀预期 (TIP/IEF)", hint: "观察通胀预期是否影响权益与债券配置语境。", dependencies: "TIP, IEF" },
  { key: "marketBreadth", label: "市场广度 (RSP/SPY)", hint: "观察美股上涨是否由少数头部资产驱动。", dependencies: "RSP, SPY" },
  { key: "ppiInflation", label: "生产者价格指数 (PPI)", hint: "观察生产端通胀压力是否压制降息空间和企业利润率。", dependencies: "FRED:PPIACO" },
  { key: "fedPolicyRate", label: "政策利率路径 (FEDFUNDS)", hint: "观察联邦基金利率水平和近期是否进入降息/再加息路径。", dependencies: "FRED:FEDFUNDS" },
  { key: "fedBalanceSheet", label: "美联储资产负债表 (WALCL)", hint: "观察缩表或扩表对系统流动性的影响。", dependencies: "FRED:WALCL" },
];

export type SettingsConfigSetter = Dispatch<SetStateAction<DaaSystemConfig | null>>;

const settingsControlClassName =
  "w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--elevated)] px-3 py-2 text-[13px] text-[var(--text)] outline-none transition-[border-color,box-shadow,background] placeholder:text-[var(--faint)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-bg)] disabled:cursor-not-allowed disabled:opacity-60";

const settingsPresetButtonClassName =
  "inline-flex items-center rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] transition-colors hover:border-[var(--primary)]/35 hover:bg-[var(--hover)] hover:text-[var(--text)]";

export function FormInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const generatedId = useId();
  const controlId = props.id ?? generatedId;
  const controlName = props.name ?? controlId;
  const { className, ...inputProps } = props;

  return (
    <input
      {...inputProps}
      id={controlId}
      name={controlName}
      className={cn(settingsControlClassName, className)}
    />
  );
}

export function FormSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const generatedId = useId();
  const controlId = props.id ?? generatedId;
  const controlName = props.name ?? controlId;
  const { className, ...selectProps } = props;

  return (
    <select
      {...selectProps}
      id={controlId}
      name={controlName}
      className={cn(settingsControlClassName, "appearance-none cursor-pointer", className)}
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
  // 编辑期维护本地草稿字符串，允许中途清空/重输，不被父级 clamp 强制回填打断；
  // 仅在失焦时把显示值规整回父级的受控值。
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const controlledValue = Number.isFinite(props.value) ? String(props.value) : "0";

  return (
    <FormInput
      type="number"
      id={props.id}
      name={props.name}
      value={focused ? draft : controlledValue}
      min={props.min}
      max={props.max}
      step={props.step || 1}
      disabled={props.disabled}
      onFocus={() => {
        setDraft(controlledValue);
        setFocused(true);
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        const parsed = Number(e.target.value);
        if (e.target.value !== "" && Number.isFinite(parsed)) props.onChange(parsed);
      }}
      onBlur={() => setFocused(false)}
    />
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-normal text-[var(--muted)]">
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
      className={cn(
        "flex items-center gap-2 select-none text-[13px]",
        disabled ? "cursor-not-allowed text-[var(--muted)] opacity-70" : "cursor-pointer text-[var(--text)]",
      )}
    >
      <input
        type="checkbox"
        id={generatedId}
        name={generatedId}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-[var(--border-strong)] bg-transparent accent-[var(--primary)]"
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
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]">
      <div className="border-b border-[var(--border)] bg-[var(--elevated)] px-4 py-3">
        <div className="text-[15px] font-bold tracking-normal text-[var(--text)]">{title}</div>
        {description ? (
          <div className="mt-1 text-xs leading-6 text-[var(--muted)]">
            {description}
          </div>
        ) : null}
      </div>
      <div className="p-4">{children}</div>
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
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
      <div className="text-[13px] font-bold tracking-normal text-[var(--text)]">{title}</div>
      {description ? (
        <div className="mt-1 text-xs leading-6 text-[var(--muted)]">
          {description}
        </div>
      ) : null}
      <div className="mt-3.5">{children}</div>
    </div>
  );
}

export { settingsPresetButtonClassName };
