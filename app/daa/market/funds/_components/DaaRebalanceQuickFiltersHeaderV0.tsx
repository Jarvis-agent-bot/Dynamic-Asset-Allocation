type DaaRebalanceQuickFiltersHeaderV0Props = {
  total: number;
};

export default function DaaRebalanceQuickFiltersHeaderV0({ total }: DaaRebalanceQuickFiltersHeaderV0Props) {
  return <span className="muted" style={{ fontSize: 12 }}>Quick filters ({total})</span>;
}
