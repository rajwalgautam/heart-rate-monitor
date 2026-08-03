import { render, screen } from '@testing-library/react-native';
import { LiveHeartRateCard } from '@/components/LiveHeartRateCard';
import { ThemeProvider } from '@/theme/ThemeProvider';

function renderCard(props: React.ComponentProps<typeof LiveHeartRateCard>) {
  return render(
    <ThemeProvider>
      <LiveHeartRateCard {...props} />
    </ThemeProvider>,
  );
}

// Skipped for the environment limitation documented in docs/testing.md: RN 0.83
// new-arch host components render to a null stub under jest-expo ~55, so every
// RNTL query finds nothing regardless of what the component does. The specs are
// written and kept so they run the moment that is fixed — un-skip the harness
// smoke test first. The pure logic these cards display (`formatBaselineDelta`,
// `formatRelativeTime`) is covered in the `unit` project, which is unaffected.
describe.skip('LiveHeartRateCard', () => {
  it('renders the live BPM', async () => {
    await renderCard({ bpm: 88, baseline: 72, isConnected: true });
    expect(screen.getByTestId('live-bpm')).toHaveTextContent('88');
  });

  it('shows the delta against the baseline', async () => {
    await renderCard({ bpm: 90, baseline: 72, isConnected: true });
    expect(screen.getByTestId('baseline-delta')).toHaveTextContent('+18 vs baseline');
  });

  it('shows a placeholder when nothing is streaming', async () => {
    await renderCard({ bpm: null, baseline: 72, isConnected: false });
    expect(screen.getByTestId('live-bpm')).toHaveTextContent('––');
    expect(screen.getByText('Not connected')).toBeTruthy();
  });

  it('distinguishes connected-but-waiting from disconnected', async () => {
    await renderCard({ bpm: null, baseline: 72, isConnected: true });
    expect(screen.getByText(/Waiting for a reading/i)).toBeTruthy();
  });

  it('omits the delta when the baseline is unknown', async () => {
    await renderCard({ bpm: 88, baseline: null, isConnected: true });
    expect(screen.queryByTestId('baseline-delta')).toBeNull();
  });
});
