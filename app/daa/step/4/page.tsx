import { DeepLinkScaffold } from "../_components/DeepLinkScaffold";
import Step4BaselineRecommendationPage from "../_pages/Step4BaselineRecommendationPage";

export default function Step4Page() {
  return (
    <DeepLinkScaffold stepId={4}>
      <Step4BaselineRecommendationPage />
    </DeepLinkScaffold>
  );
}
