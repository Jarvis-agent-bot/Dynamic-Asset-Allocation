import { DeepLinkScaffold } from "../_components/DeepLinkScaffold";
import Step7TagsPage from "../_pages/Step7TagsPage";

export default function Step7Page() {
  return (
    <DeepLinkScaffold stepId={7}>
      <Step7TagsPage />
    </DeepLinkScaffold>
  );
}
