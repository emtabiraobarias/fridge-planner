import type { InventoryItem } from '../../services/inventory';

interface Props {
  items: InventoryItem[];
  onDelete: (id: string) => void;
  onEdit: (item: InventoryItem) => void;
}

function expiryRowClass(status: InventoryItem['expirationStatus']): string {
  if (status === 'expired') return 'bg-red-50 border-red-200';
  if (status === 'expiring-soon') return 'bg-yellow-50 border-yellow-200';
  return 'bg-white border-gray-200';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export function InventoryList({ items, onDelete, onEdit }: Props): React.JSX.Element {
  if (items.length === 0) {
    return (
      <p className="text-gray-500 text-sm py-6 text-center">
        No ingredients yet. Add your first item above.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-gray-100" aria-label="Inventory items">
      {items.map((item) => (
        <li
          key={item._id}
          aria-label={item.name}
          className={`flex items-center justify-between p-3 border rounded-lg mb-2 ${expiryRowClass(item.expirationStatus)}`}
        >
          <div className="flex-1 min-w-0">
            <span className="font-medium text-gray-900 truncate block">{item.name}</span>
            <span className="text-sm text-gray-600">
              {item.quantity} {item.unit} · {item.category}
              {item.expiresAt && (
                <span className={item.expirationStatus === 'expired' ? 'text-red-600 font-medium' : 'text-yellow-700'}>
                  {' · '}{formatDate(item.expiresAt)}
                </span>
              )}
            </span>
          </div>

          <div className="flex gap-2 ml-3 shrink-0">
            <button
              onClick={() => onEdit(item)}
              disabled={item.expirationStatus === 'expired'}
              aria-label={`Edit ${item.name}`}
              className="text-sm px-2 py-1 rounded text-blue-600 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Edit
            </button>
            <button
              onClick={() => onDelete(item._id)}
              disabled={item.expirationStatus === 'expired'}
              aria-label={`Delete ${item.name}`}
              className="text-sm px-2 py-1 rounded text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
