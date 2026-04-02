const PREFERENCES = ['vegetarian', 'vegan', 'pescatarian', 'gluten-free', 'dairy-free', 'nut-free'] as const;

interface Props {
  selected: string[];
  onChange: (preferences: string[]) => void;
}

export function DietaryPreferences({ selected, onChange }: Props): React.JSX.Element {
  function toggle(pref: string): void {
    onChange(
      selected.includes(pref)
        ? selected.filter((p) => p !== pref)
        : [...selected, pref],
    );
  }

  return (
    <fieldset className="mb-3">
      <legend className="text-sm font-medium text-gray-700 mb-2">Dietary Preferences</legend>
      <div className="flex flex-wrap gap-2">
        {PREFERENCES.map((pref) => (
          <label key={pref} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.includes(pref)}
              onChange={() => toggle(pref)}
              className="rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <span className="capitalize">{pref}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
