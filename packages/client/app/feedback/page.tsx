import type { Metadata } from 'next';
import { FeedbackProvider } from '../../src/context/FeedbackContext';
import { FeedbackPage } from '../../src/views/FeedbackPage';

export const metadata: Metadata = { title: 'Feedback' };

export default function FeedbackRoute(): React.JSX.Element {
  return (
    <FeedbackProvider>
      <FeedbackPage />
    </FeedbackProvider>
  );
}
