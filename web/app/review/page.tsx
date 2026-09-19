export default function Review() {
  return <main className="page">
    <header className="banner">
      <div><p className="eyebrow">Label Review</p><h1>Pair a label with its application</h1></div>
      <span className="pill">Foundation / preflight only</span>
    </header>
    <section className="card" aria-labelledby="prepare-title">
      <h2 id="prepare-title">Single label preparation</h2>
      <p>Select one image and use only its own application record. This local foundation is separate from the frozen v3 design simulation.</p>
      <label htmlFor="label-image">Label image (JPEG or PNG)</label>
      <input id="label-image" type="file" accept="image/jpeg,image/png" aria-describedby="file-help" />
      <p id="file-help">Local selection only. No upload or image validation is connected in this shell.</p>
      <div className="notice"><strong>Processing not connected</strong><p>No analysis, authentication, saved history or review submission is available. Use synthetic data only.</p></div>
      <button disabled>Submit for comparison</button>
    </section>
    <aside className="card" aria-labelledby="scope-title">
      <h2 id="scope-title">Seven-category scope</h2>
      <p>Brand name · Class / type · Alcohol by volume · Net contents · Producer name and address · Country of origin · Government warning.</p>
      <p>The government warning will use a fixed statutory reference, not editable applicant text. Physical type size requires human review. No categories have been checked.</p>
      <h2>Batch preparation is deferred</h2>
      <p>Each image will need a unique filename mapped explicitly to its own application ID and version. No batch queue or inference is connected.</p>
    </aside>
    <footer>Verification aid only. Not COLA approval, filing or legal certification.</footer>
  </main>;
}
