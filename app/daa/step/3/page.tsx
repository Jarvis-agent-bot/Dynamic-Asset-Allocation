import { DeepLinkScaffold } from "../_components/DeepLinkScaffold";
import Step3MoneyManagementPage from "../_pages/Step3MoneyManagementPage";

export default function Step3Page() {
  // Deep-link page: render the actual Step UI (with the wizard summary + nav) instead of a placeholder.
  return (
    <DeepLinkScaffold stepId={3}>
      <Step3MoneyManagementPage />
    </DeepLinkScaffold>
  );
}
