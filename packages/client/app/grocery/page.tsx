import type { Metadata } from 'next';
import { GroceryListProvider } from '../../src/context/GroceryListContext';

export const metadata: Metadata = { title: 'Groceries' };
import { GroceryListPage } from '../../src/views/GroceryListPage';

export default function GroceryRoute(): React.JSX.Element {
  return (
    <GroceryListProvider>
      <GroceryListPage />
    </GroceryListProvider>
  );
}
