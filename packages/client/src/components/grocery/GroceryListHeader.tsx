interface GroceryListHeaderProps {
  weekStart: string;
  itemCount: number;
  purchasedCount: number;
  onGenerate: () => void;
  generating: boolean;
}

export function GroceryListHeader({
  weekStart,
  itemCount,
  purchasedCount,
  onGenerate,
  generating,
}: GroceryListHeaderProps): React.JSX.Element {
  const date = new Date(weekStart);
  const endDate = new Date(date);
  endDate.setDate(date.getDate() + 6);

  function formatDate(d: Date): string {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Grocery List</h2>
        <p className="text-sm text-gray-500">
          {formatDate(date)} – {formatDate(endDate)}
          {itemCount > 0 && (
            <span className="ml-2 text-gray-400">
              {purchasedCount}/{itemCount} items
            </span>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={onGenerate}
        disabled={generating}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {generating ? 'Generating…' : 'Regenerate'}
      </button>
    </div>
  );
}
