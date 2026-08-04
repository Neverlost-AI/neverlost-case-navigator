import { InMemoryCaseNavigatorService } from "@/services/in-memory-case-navigator";

export default function HomePage() {
  const service = new InMemoryCaseNavigatorService();
  const caseSummary = service.getCase();

  return (
    <main>
      <p className="eyebrow">Build for Good · Tranche 1</p>
      <h1>Neverlost Case Navigator</h1>
      <p>
        The deterministic application core is ready for the bounded synthetic case{" "}
        <strong>{caseSummary.id}</strong>.
      </p>
      <p>
        {caseSummary.clientName} · {caseSummary.sourceCount} preserved synthetic sources
      </p>
      <p className="notice">
        <strong>Synthetic draft demonstration.</strong> No real client records, live AI,
        database, or professional advice are included.
      </p>
    </main>
  );
}
