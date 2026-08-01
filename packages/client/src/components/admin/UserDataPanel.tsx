'use client';
import { useEffect, useState } from 'react';
import { fetchUserData, type UserSupportView } from '../../services/admin';

interface UserDataPanelProps {
  userId: string;
  onClose: () => void;
}

/**
 * Read-only support view of one user's kitchen (spec 011 US3, FR-AD-015).
 *
 * Exists because "my grocery list is wrong" used to be uninvestigable — every query is
 * `{ userId }`-scoped, so the maintainer could not look at the data being described.
 *
 * Deliberately renders **no mutating control of any kind**: no edit, no delete, no
 * quantity stepper. Admin writes to another user's data are out of scope for spec 011,
 * and the API offers no write verb on this path either, so the absence here matches the
 * absence there rather than relying on it.
 */
export function UserDataPanel({ userId, onClose }: UserDataPanelProps): React.JSX.Element {
  const [data, setData] = useState<UserSupportView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchUserData(userId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load that user’s data.');
      });
    return (): void => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <section
      className="mt-5 rounded-[20px] bg-surface p-5 shadow-sm"
      aria-label={`Support view for ${userId}`}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-[20px] text-ink">
          {userId} <span className="text-[13px] font-normal text-ink-soft">(read-only)</span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-accent-100 px-3 py-1 text-[13px] font-semibold text-accent-800"
        >
          Close
        </button>
      </div>

      {error && <p className="mt-3 text-[14px] text-accent-800">{error}</p>}

      {data && (
        <>
          <p className="mt-2 text-[13px] text-ink-soft" data-testid="support-counts">
            {data.counts.inventoryItems} items · {data.counts.mealPlans} meal plans ·{' '}
            {data.counts.groceryLists} grocery lists
          </p>

          <h3 className="mt-4 text-[13px] font-bold uppercase tracking-wide text-ink-soft">
            Inventory
          </h3>
          {data.inventory.length === 0 ? (
            <p className="mt-1 text-[14px] text-ink-soft">No items.</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1" aria-label="Inventory items">
              {data.inventory.map((item) => (
                <li key={item._id} className="text-[14px] text-ink">
                  {item.name} — {item.quantity} {item.unit}
                  <span className="text-ink-soft">
                    {' '}
                    · {item.location} · {item.expirationStatus}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="mt-4 text-[13px] font-bold uppercase tracking-wide text-ink-soft">
            Grocery lists
          </h3>
          {data.groceryLists.length === 0 ? (
            <p className="mt-1 text-[14px] text-ink-soft">None.</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1" aria-label="Grocery lists">
              {data.groceryLists.map((list) => (
                <li key={list._id} className="text-[14px] text-ink">
                  Week of {new Date(list.weekStart).toISOString().slice(0, 10)} —{' '}
                  {list.items.length} items
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
