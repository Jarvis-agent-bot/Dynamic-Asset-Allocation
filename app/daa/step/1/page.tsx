import { DeepLinkScaffold } from "../_components/DeepLinkScaffold";
import Step1BacktestPage from "../_pages/Step1BacktestPage";

export default function Step1Page() {
  // Deep-link page: render the actual Step UI (with the wizard summary + nav) instead of a placeholder.
  return (
    <DeepLinkScaffold stepId={1}>
      <Step1BacktestPage />
    </DeepLinkScaffold>
  );
}
