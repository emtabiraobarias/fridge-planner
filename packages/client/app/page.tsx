import type { Metadata } from 'next';
import { InventoryPage } from '../src/views/InventoryPage';

export const metadata: Metadata = { title: 'Inventory' };

export default function HomePage(): React.JSX.Element {
  return <InventoryPage />;
}
