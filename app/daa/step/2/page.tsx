import { DeepLinkScaffold } from "../_components/DeepLinkScaffold";
import Step2MarketEventsPage from "../_pages/Step2MarketEventsPage";

export default function Step2Page() {
  // Deep-link page: render the actual Step UI (with the wizard summary + nav) instead of a placeholder.
  return (
    <DeepLinkScaffold stepId={2}>
      <Step2MarketEventsPage />
    </DeepLinkScaffold>
  );
}
