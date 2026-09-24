import ReviewWorkspace from '../../components/ReviewWorkspace';
import { fixtureDemoEnabled } from '../../lib/access';

export default function Review() {
  const offlineEnabled = fixtureDemoEnabled(process.env.NODE_ENV, process.env.TTB_OFFLINE_DEMO);
  return <main className="page">
    <header className="banner"><div><p className="eyebrow">Label Review</p><strong>Evidence first. Human decision.</strong></div><span className="pill">{offlineEnabled ? 'OFFLINE FIXTURE / PUBLIC DEMO' : 'PUBLIC DEMO'}</span></header>
    <ReviewWorkspace offlineEnabled={offlineEnabled} />
    <footer>Verification aid only. Not COLA approval, filing or legal certification. Public demo use is not individual reviewer authentication. New paid scans are capped server-side at 50 per UTC day. Only a server-confirmed SAVED receipt is durable.</footer>
  </main>;
}
