import type { GroceryListItem, GroceryCategory, PatchGroceryItemPayload } from '../../types/grocery-list';
import { GroceryListItemRow } from './GroceryListItemRow';

interface GroceryListCategoryGroupProps {
  category: GroceryCategory;
  items: GroceryListItem[];
  onTogglePurchased: (itemId: string, current: boolean) => void;
  onUpdate: (itemId: string, payload: PatchGroceryItemPayload) => void;
  onRemove: (itemId: string) => void;
}

export function GroceryListCategoryGroup({
  category,
  items,
  onTogglePurchased,
  onUpdate,
  onRemove,
}: GroceryListCategoryGroupProps): React.JSX.Element {
  return (
    <section aria-label={`${category} items`} className="mb-4">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {category}
      </h3>
      <ul
        role="list"
        className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white px-3"
      >
        {items.map((item) => (
          <GroceryListItemRow
            key={item._id}
            item={item}
            onTogglePurchased={onTogglePurchased}
            onUpdate={onUpdate}
            onRemove={onRemove}
          />
        ))}
      </ul>
    </section>
  );
}
