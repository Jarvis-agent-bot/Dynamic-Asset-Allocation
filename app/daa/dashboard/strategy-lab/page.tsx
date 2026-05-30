import StrategyLabPageClient from "./_components/StrategyLabPageClient";
import { buildStrategyLabDateDefaults } from "./_components/strategyLabDateDefaults";

export default function StrategyLabPage() {
  return <StrategyLabPageClient dateDefaults={buildStrategyLabDateDefaults()} />;
}
