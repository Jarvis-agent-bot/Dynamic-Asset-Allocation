import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import BacktestOptimizationPanel from "./_components/BacktestOptimizationPanel";
import StrategyConfigPanel from "./_components/StrategyConfigPanel";

type Props = {
  searchParams?: {
    tab?: string;
  };
};

export default function StrategyLabPage({ searchParams }: Props) {
  const tab = searchParams?.tab === "backtest" ? "backtest" : "strategy";

  return (
    <div className="space-y-6">
      <PageHeader
        title="策略实验室"
        description="策略参数、回测与优化统一在此维护；修改后立即影响回测与优化输入。"
      />

      <Tabs defaultValue={tab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="strategy">策略参数</TabsTrigger>
          <TabsTrigger value="backtest">回测与优化</TabsTrigger>
        </TabsList>

        <TabsContent value="strategy" className="mt-0">
          <StrategyConfigPanel />
        </TabsContent>
        <TabsContent value="backtest" className="mt-0">
          <BacktestOptimizationPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
