import type { OutputSection } from "@/domain/contracts";

export const NEUROLOGY_BACKGROUND_DEFINITION = {
  title: "Neurology Referral Background Packet — Synthetic Draft",
  sections: [
    ["medical", "Relevant medical information"],
    ["referral", "Referral background"],
    ["missing_evidence", "Missing evidence"],
  ] as readonly (readonly [OutputSection, string])[],
};
