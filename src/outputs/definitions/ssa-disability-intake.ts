import type { OutputSection } from "@/domain/contracts";

export const SSA_DISABILITY_INTAKE_DEFINITION = {
  title: "SSA Disability Intake Packet — Synthetic Draft",
  sections: [
    ["medical", "Medical information"],
    ["functional", "Functional information"],
    ["employer", "Employer information"],
    ["referral", "Referral information"],
    ["missing_evidence", "Missing evidence"],
    ["pcp_review", "Primary-care review"],
  ] as readonly (readonly [OutputSection, string])[],
};
