import type { Metadata } from 'next';
import { AccountPage } from '../../src/views/AccountPage';

export const metadata: Metadata = { title: 'Account' };

export default function AccountRoute(): React.JSX.Element {
  return <AccountPage />;
}
