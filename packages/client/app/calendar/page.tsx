import type { Metadata } from 'next';
import { CalendarPage } from '../../src/views/CalendarPage';

export const metadata: Metadata = { title: 'Meal plan' };

export default function CalendarRoute(): React.JSX.Element {
  return <CalendarPage />;
}
