import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import PortfolioPositionsPanel from "./_components/PortfolioPositionsPanel";
import PortfolioWatchlistPanel from "./_components/PortfolioWatchlistPanel";

type Props = {
  searchParams?: {
    tab?: string;
  };
};

export default function PortfolioPage({ searchParams }: Props) {
  const tab = searchParams?.tab === "watchlist" ? "watchlist" : "positions";

  return (
    <div className="space-y-6">
      <PageHeader
        title="持仓与候选"
        description="持仓通过买入/卖出操作更新；候选池管理关注标的与目标权重，供策略引擎参考。"
      />

      <Tabs defaultValue={tab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="positions">持仓管理</TabsTrigger>
          <TabsTrigger value="watchlist">候选池管理</TabsTrigger>
        </TabsList>

        <TabsContent value="positions" className="mt-0">
          <PortfolioPositionsPanel />
        </TabsContent>
        <TabsContent value="watchlist" className="mt-0">
          <PortfolioWatchlistPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
