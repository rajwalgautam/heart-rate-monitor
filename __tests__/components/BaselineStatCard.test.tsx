import { render, screen, fireEvent } from '@testing-library/react-native';
import { BaselineStatCard } from '@/components/BaselineStatCard';
import { ThemeProvider } from '@/theme/ThemeProvider';

type Props = React.ComponentProps<typeof BaselineStatCard>;

async function renderCard(overrides: Partial<Props> = {}): Promise<Props> {
  const props: Props = {
    baseline: 72,
    lastUpdated: Date.now(),
    isLoading: false,
    isStale: false,
    status: 'available',
    onRefresh: jest.fn(),
    onRequestAccess: jest.fn(),
    ...overrides,
  };
  await render(
    <ThemeProvider>
      <BaselineStatCard {...props} />
    </ThemeProvider>,
  );
  return props;
}

// Skipped for the environment limitation documented in docs/testing.md: RN 0.83
// new-arch host components render to a null stub under jest-expo ~55, so every
// RNTL query finds nothing regardless of what the component does. The specs are
// written and kept so they run the moment that is fixed — un-skip the harness
// smoke test first.
describe.skip('BaselineStatCard', () => {
  it('renders the baseline value', async () => {
    await renderCard({ baseline: 72 });
    expect(screen.getByTestId('baseline-bpm')).toHaveTextContent('72');
  });

  it('renders a placeholder when there is no baseline yet', async () => {
    await renderCard({ baseline: null });
    expect(screen.getByTestId('baseline-bpm')).toHaveTextContent('––');
  });

  it('calls onRefresh when the refresh control is pressed', async () => {
    const props = await renderCard();
    fireEvent.press(screen.getByTestId('baseline-refresh'));
    expect(props.onRefresh).toHaveBeenCalled();
  });

  it('marks the value stale without hiding it', async () => {
    await renderCard({ baseline: 72, isStale: true });
    // The number survives a rate-limit backoff — see D2.
    expect(screen.getByTestId('baseline-bpm')).toHaveTextContent('72');
    expect(screen.getByTestId('baseline-timestamp')).toHaveTextContent(/stale/i);
  });

  it('explains the unavailable state instead of erroring', async () => {
    await renderCard({ status: 'unavailable' });
    expect(screen.getByText(/Health Connect unavailable/i)).toBeTruthy();
    expect(screen.queryByTestId('baseline-bpm')).toBeNull();
  });

  it('offers to request access when permission is denied', async () => {
    const props = await renderCard({ status: 'permission-denied' });
    fireEvent.press(screen.getByText(/Grant heart rate access/i));
    expect(props.onRequestAccess).toHaveBeenCalled();
  });
});
