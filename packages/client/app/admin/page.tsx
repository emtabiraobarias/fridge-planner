import type { Metadata } from 'next';
import { AdminPage } from '../../src/views/AdminPage';

export const metadata: Metadata = { title: 'Administration' };

// Spec 011 US2. The route is NOT secret — a non-admin may navigate here and will see
// a refusal, because the API refuses (FR-AD-002). Hiding the nav entry is a courtesy,
// never the control.
export default function AdminRoute(): React.JSX.Element {
  return <AdminPage />;
}
