interface GroceryListSearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function GroceryListSearchBar({ value, onChange }: GroceryListSearchBarProps): React.JSX.Element {
  return (
    <div className="mb-4">
      <input
        type="search"
        aria-label="Search grocery items"
        placeholder="Search items…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
    </div>
  );
}
