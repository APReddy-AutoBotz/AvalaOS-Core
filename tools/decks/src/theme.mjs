import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const DECK_ROOT = path.join(ROOT, "docs", "marketing", "decks");
export const INPUTS_PATH = path.join(DECK_ROOT, "source", "deck-inputs.yaml");
export const FONT_DIR = path.join(DECK_ROOT, "assets", "fonts");
export const SCREENSHOT_SOURCE_DIR = path.join(ROOT, "public", "marketing", "screenshots");
export const SCREENSHOT_ASSET_DIR = path.join(DECK_ROOT, "assets", "screenshots");
export const BRAND_CONCEPT_DIR = path.join(DECK_ROOT, "brand", "concepts");
export const BUILD_DIR = path.join(ROOT, "tools", "decks", ".build");

export const SIZE = { width: 1280, height: 720 };
export const PAGE = { left: 64, top: 54, width: 1152, height: 610 };

export const COLOR = {
  navy: "#001B30",
  navy2: "#002C4B",
  navy3: "#0C3B5B",
  amber: "#FFBC03",
  gold: "#E4B04B",
  paleGold: "#FFF4D6",
  paper: "#F7F9FC",
  white: "#FFFFFF",
  ink: "#0B1426",
  muted: "#52627A",
  faint: "#8795A8",
  border: "#D7E0E8",
  success: "#117A65",
  successPale: "#DDF7ED",
  risk: "#C45500",
  riskPale: "#FFF1E6",
  danger: "#B42318",
  dangerPale: "#FDE7E5",
  bluePale: "#E5F2FB",
  lavender: "#EEE9FF"
};

export const FONT = {
  title: "Outfit",
  body: "Inter",
  fallbackTitle: "Aptos Display",
  fallbackBody: "Aptos"
};

export const DECKS = {
  marketing: {
    key: "marketing",
    outputDir: path.join(DECK_ROOT, "marketing"),
    basename: "AvalaOS-Executive-Product-Overview",
    audience: "Automation, AI, transformation, process excellence, architecture, and consulting leaders",
    theme: "Decision Before Execution",
    expectedSlides: 10
  },
  client: {
    key: "client",
    outputDir: path.join(DECK_ROOT, "client"),
    basename: "AvalaOS-Client-Transformation-Deck",
    audience: "CIO/COO, Automation or AI leadership, Process Owners, BA/PMO, Risk and delivery leaders",
    theme: "From Process Evidence to Governed Delivery",
    expectedSlides: 18
  },
  investor: {
    key: "investor",
    outputDir: path.join(DECK_ROOT, "investor"),
    basename: "AvalaOS-Investor-Deck",
    audience: "Pre-seed enterprise software, automation, workflow, and AI-governance investors",
    theme: "The Operating System for Governed AI and Automation Decisions",
    expectedSlides: 15
  },
  brand: {
    key: "brand",
    outputDir: path.join(DECK_ROOT, "brand"),
    basename: "AvalaOS-Assemble-Brand-Evolution-Board",
    audience: "Internal AvalaOS brand and product decision-makers",
    theme: "Evolution, not replacement",
    expectedSlides: 6
  }
};

export const SOURCE_MAP = {
  "CL-001": "docs/00_SOURCE_OF_TRUTH.md — product identity; docs/01_PRODUCT_STRATEGY.md — Positioning",
  "CL-002": "docs/00_SOURCE_OF_TRUTH.md — canonical tagline",
  "CL-003": "docs/design/avalaos-enterprise-ui-rebaseline.md — Purpose",
  "CL-004": "docs/design/avalaos-enterprise-ui-rebaseline.md — Authenticated information architecture",
  "CL-005": "docs/00_SOURCE_OF_TRUTH.md — Accepted Capabilities",
  "CL-006": "docs/architecture/assess-v2-decision-intelligence-architecture.md — Purpose and Deterministic Decision Layers",
  "CL-007": "docs/architecture/assess-v2-decision-intelligence-architecture.md — Canonical AP Invoice Exception Outcome",
  "CL-008": "docs/00_SOURCE_OF_TRUTH.md — Product and Security Law",
  "CL-009": "docs/architecture/assess-v2-economics-calibration-architecture.md — Formula Architecture and Calibration",
  "CL-010": "docs/architecture/application-portfolio-assessment-architecture.md — Dimensions and Dispositions",
  "CL-011": "docs/07_AVALA_GOVERN_FRAMEWORK.md — Current Scope",
  "CL-012": "docs/00_SOURCE_OF_TRUTH.md — Product and Security Law",
  "CL-013": "docs/architecture/studio-governed-artifact-authority.md — Scope and trust boundary",
  "CL-014": "docs/architecture/studio-governed-artifact-authority.md — Lifecycle and people",
  "CL-015": "docs/architecture/studio-private-artifact-authority.md — Objective and boundary",
  "CL-016": "docs/02_PRODUCT_REQUIREMENTS.md — Avala Delivery",
  "CL-017": "docs/design/avalaos-enterprise-ui-rebaseline.md — Delivery and Monitor",
  "CL-018": "docs/01_PRODUCT_STRATEGY.md — Product Boundaries",
  "CL-019": "docs/design/avalaos-enterprise-ui-rebaseline.md — Delivery and Monitor",
  "CL-021": "docs/design/avalaos-enterprise-ui-rebaseline.md — Product surfaces",
  "CL-022": "components/public/PublicWebsite.tsx — TrustPage BYOK direction",
  "CL-024": "docs/design/avalaos-enterprise-ui-rebaseline.md — Isolated marketing capture",
  "CL-025": "docs/design/avalaos-enterprise-ui-rebaseline.md — Executed verification",
  "CL-026": "docs/00_SOURCE_OF_TRUTH.md — Maturity Verdict and Not Accepted Or Proven",
  "CL-027": "docs/01_PRODUCT_STRATEGY.md — Personas",
  "CL-028": "components/shared/brand.tsx — AvalaLifecycleLockup; approved master brief — Avala Assemble vision",
  "CL-029": "docs/marketing/decks/source/deck-inputs.yaml — AP-confirmable discussion inputs",
  "CL-030": "docs/marketing/decks/source/external-inputs-required.md — later evidence-backed market research pass"
};

export const SCREENSHOTS = {
  home: "home-command-center.png",
  assess: "assess-process-catalog.png",
  govern: "govern-workbench.png",
  studio: "studio-artifact-workspace.png",
  delivery: "delivery-board.png",
  monitor: "monitor-overview.png",
  admin: "admin-controls.png",
  applicationPortfolio: "application-portfolio-readiness.png"
};
