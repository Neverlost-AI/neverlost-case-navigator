import type { SourceRecord } from "@/domain/contracts";

export interface ProposalRunToken {
  sequence: number;
  localRunId: string;
  idempotencyKey: string;
  sourceId: SourceRecord["id"];
}

export class ProposalRunSequencer {
  private latestSequence = 0;

  begin(sourceId: SourceRecord["id"]): ProposalRunToken {
    this.latestSequence += 1;
    const localRunId = `proposal-run-${String(this.latestSequence).padStart(4, "0")}`;
    return {
      sequence: this.latestSequence,
      localRunId,
      idempotencyKey: `${localRunId}:${sourceId}`,
      sourceId,
    };
  }

  isLatest(token: ProposalRunToken): boolean {
    return token.sequence === this.latestSequence;
  }

  reset(): void {
    this.latestSequence = 0;
  }
}
