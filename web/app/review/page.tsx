import ReviewWorkspace from '../../components/ReviewWorkspace';
import { fixtureDemoEnabled } from '../../lib/access';

export default function Review() {
  const offlineEnabled = fixtureDemoEnabled(process.env.NODE_ENV, process.env.TTB_OFFLINE_DEMO);
  return <main className="page">
    <header className="banner"><div><p className="eyebrow">Label Review</p><strong>Evidence first. Human decision.</strong></div><span className="pill">{offlineEnabled ? 'OFFLINE FIXTURE / GUARDED DEMO' : 'GUARDED DEMO'}</span></header>
    <ReviewWorkspace offlineEnabled={offlineEnabled} />
    <footer>Verification aid only. Not COLA approval, filing or legal certification. No authenticated reviewer, saved history or server review commit.</footer>
  </main>;
}
