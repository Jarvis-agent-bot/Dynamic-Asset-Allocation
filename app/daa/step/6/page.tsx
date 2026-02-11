import { DeepLinkScaffold } from "../_components/DeepLinkScaffold";
import Step6HumanFactorPage from "../_pages/Step6HumanFactorPage";

export default function Step6Page() {
  return (
    <DeepLinkScaffold stepId={6}>
      <Step6HumanFactorPage />
    </DeepLinkScaffold>
  );
}
