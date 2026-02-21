import DaaDashboardAiExplain from '../../../dashboard/_components/DaaDashboardAiExplain';
import DaaDashboardExport from '../../../dashboard/_components/DaaDashboardExport';
import DaaDashboardImport from '../../../dashboard/_components/DaaDashboardImport';
import DaaDashboardRunChecklist from '../../../dashboard/_components/DaaDashboardRunChecklist';
import Step1BacktestPage from '../../../step/_pages/Step1BacktestPage';
import Step2MarketEventsPage from '../../../step/_pages/Step2MarketEventsPage';
import Step3MoneyManagementPage from '../../../step/_pages/Step3MoneyManagementPage';
import Step4BaselineRecommendationPage from '../../../step/_pages/Step4BaselineRecommendationPage';
import Step6HumanFactorPage from '../../../step/_pages/Step6HumanFactorPage';
import Step7TagsPage from '../../../step/_pages/Step7TagsPage';
import DaaDynamicRebalanceRunHistoryV0 from './DaaDynamicRebalanceRunHistoryV0';
import DaaRebalanceLogViewV0 from './DaaRebalanceLogViewV0';

type Props = {
  hasRecommendation: boolean;
  rev: number;
  onJump: (id: string) => void;
};

export default function DaaRebalancePanelWorkflowSectionsV0({ hasRecommendation, rev, onJump }: Props) {
  return (
    <>
      <div id="dynamic-rebalance-run-history" style={{ scrollMarginTop: 12 }}>
        <DaaDynamicRebalanceRunHistoryV0 rev={rev} />
      </div>
      <div id="rebalance-log" style={{ scrollMarginTop: 12 }}>
        <DaaRebalanceLogViewV0 />
      </div>
      <div id="step1" style={{ scrollMarginTop: 12 }}>
        <Step1BacktestPage />
      </div>
      <DaaDashboardRunChecklist onJump={onJump} />
      <div id="import" style={{ scrollMarginTop: 12 }}>
        <DaaDashboardImport />
      </div>
      <div id="export" style={{ scrollMarginTop: 12 }}>
        <DaaDashboardExport />
      </div>
      <div id="step2" style={{ scrollMarginTop: 12 }}>
        <Step2MarketEventsPage />
      </div>
      <div id="step3" style={{ scrollMarginTop: 12 }}>
        <Step3MoneyManagementPage />
      </div>
      <div id="step4" style={{ scrollMarginTop: 12 }}>
        <Step4BaselineRecommendationPage />
      </div>
      {hasRecommendation ? (
        <div id="step5" style={{ scrollMarginTop: 12 }}>
          <DaaDashboardAiExplain />
        </div>
      ) : (
        <div id="step5" style={{ scrollMarginTop: 12, fontSize: 12 }} className="muted">
          Step5 Explain：blocked，需先跑一次 Step4 recommendation。
        </div>
      )}
      <div id="step6" style={{ scrollMarginTop: 12 }}>
        <Step6HumanFactorPage />
      </div>
      <div id="step7" style={{ scrollMarginTop: 12 }}>
        <Step7TagsPage />
      </div>
    </>
  );
}
