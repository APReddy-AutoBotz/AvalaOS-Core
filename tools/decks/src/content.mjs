const slide = (layout, title, config = {}) => ({
  layout,
  title,
  eyebrow: config.eyebrow ?? "AVALAOS",
  subtitle: config.subtitle ?? "",
  bullets: config.bullets ?? [],
  sideBullets: config.sideBullets ?? [],
  claims: config.claims ?? [],
  qualifier: config.qualifier ?? "",
  screenshot: config.screenshot,
  screenshots: config.screenshots ?? [],
  concept: config.concept,
  stages: config.stages ?? [],
  left: config.left,
  right: config.right,
  statusColumns: config.statusColumns ?? [],
  emphasis: config.emphasis ?? "Keep the decision boundary and proof boundary explicit.",
  objection: config.objection ?? "How does this change the next decision?",
  response: config.response ?? "It makes the evidence, authority, and handoff condition visible before execution begins.",
  apInput: config.apInput ?? "None.",
  roadmap: config.roadmap ?? "Current unless otherwise labelled.",
  noteLead: config.noteLead ?? ""
});

const techFit = [
  ["Stable + structured", "Rules / workflow", "Deterministic controls"],
  ["Repetitive UI work", "RPA", "Only where stronger interfaces are unavailable"],
  ["Unstructured content", "AI assistance", "Extraction, classification, summarisation"],
  ["Context-heavy inquiry", "Bounded agent assistance", "Evidence synthesis with controls"],
  ["Material-risk judgment", "Human / HITL", "Accountable approval"],
  ["Mixed end-to-end work", "Hybrid model", "A governed combination"]
];

const lifecycle = [
  ["Assess", "Evidence-qualified recommendation"],
  ["Govern", "Human-owned controls"],
  ["Studio", "Approved artifacts"],
  ["Delivery", "Source-linked work"],
  ["Monitor", "Outcome visibility"]
];

export function marketingSlides(inputs) {
  return [
    slide("cover", "Evaluate before you automate.\nGovern before you execute.", {
      eyebrow: "AVALAOS • DECISION BEFORE EXECUTION",
      subtitle: "The governed decision and delivery layer around AI, automation, and human work.",
      screenshot: "home",
      claims: ["CL-001", "CL-002", "CL-003", "CL-024"],
      qualifier: "Synthetic product preview. No live execution.",
      emphasis: "Open with the decision problem, not a feature list.",
      objection: "Is this another automation platform?",
      response: "AvalaOS governs the decision and handoff around execution; authorized systems execute."
    }),
    slide("statement", "Enterprises are choosing tools before understanding the work.", {
      eyebrow: "THE AUTOMATION DECISION GAP",
      bullets: [
        "AI applied where deterministic rules would be safer",
        "RPA selected where APIs or workflow would be stronger",
        "Agents introduced without sufficient evidence or control",
        "Human accountability introduced after the design is committed"
      ],
      claims: ["CL-001", "CL-007", "CL-008", "CL-012"],
      qualifier: "Strategic problem framing; no quantified failure-rate claim.",
      emphasis: "Make the cost of a technology-first decision intuitive.",
      objection: "Is this a measured enterprise failure pattern?",
      response: "It is the operating problem AvalaOS is designed to address, not a quantified market statistic."
    }),
    slide("techfit", "One process is not one technology.", {
      eyebrow: "TECHNOLOGY FIT",
      stages: techFit,
      claims: ["CL-006", "CL-007", "CL-008"],
      qualifier: "AvalaOS evaluates fit, controls, and handoff readiness. Authorized systems execute.",
      emphasis: "Show that hybrid is the normal outcome, not a compromise.",
      objection: "Does AvalaOS autonomously select the technology?",
      response: "No. Versioned deterministic logic produces a recommendation that accountable humans review."
    }),
    slide("lifecycle", "One governed lifecycle keeps the evidence attached.", {
      eyebrow: "ASSESS → GOVERN → STUDIO → DELIVERY → MONITOR",
      stages: lifecycle,
      screenshots: ["assess", "govern", "studio", "delivery", "monitor"],
      claims: ["CL-003", "CL-004", "CL-024"],
      qualifier: "Synthetic product previews. Execution remains with authorized systems.",
      emphasis: "Present the lifecycle as one cumulative decision path.",
      objection: "Is this a new project-management suite?",
      response: "No. AvalaOS preserves governed context and complements the execution ecosystem."
    }),
    slide("dualScreenshot", "Evidence becomes a governed decision.", {
      eyebrow: "ASSESS + GOVERN",
      subtitle: "Process decomposition and deterministic recommendation meet evidence gaps, material-risk review, control conditions, and human approval.",
      screenshots: ["assess", "govern"],
      bullets: ["Primitive-level fitment", "Evidence and assumptions", "Action-specific controls", "Human-owned approval"],
      claims: ["CL-005", "CL-006", "CL-008", "CL-011", "CL-012", "CL-024"],
      qualifier: "Source/CI authority; not hosted, pilot, or production proof.",
      emphasis: "Connect explainability to accountable governance.",
      objection: "Is AI approving the recommendation?",
      response: "No. AI remains outside scoring and approval authority."
    }),
    slide("screenshot", "Approved context becomes an artifact people can revise and approve.", {
      eyebrow: "AVALA STUDIO",
      screenshot: "studio",
      bullets: ["BRD", "FRD", "PDD", "Immutable revisions", "Independent review", "Separate final approval"],
      claims: ["CL-013", "CL-014", "CL-024"],
      qualifier: "Common enterprise artifacts. Studio private files and brokered download remain candidate-only.",
      emphasis: "Stress editability, lineage, and human separation of duty.",
      objection: "Are these certified document standards?",
      response: "They are common enterprise artifact types, not globally certified templates."
    }),
    slide("dualScreenshot", "Approved context reaches delivery without losing the why.", {
      eyebrow: "DELIVERY + MONITOR",
      subtitle: "One governed handoff prepares source-linked work in Delivery. Monitor provides readiness, risk, blocker, lineage, and recorded-outcome visibility.",
      screenshots: ["delivery", "monitor"],
      bullets: ["Work items and tasks", "Acceptance context", "Owners and blockers", "Delivery Pack lineage", "Outcome recording state"],
      claims: ["CL-016", "CL-017", "CL-018", "CL-019", "CL-024"],
      qualifier: "Delivery complements execution systems. Monitor does not create tasks or claim live telemetry.",
      emphasis: "Use the exact Delivery-versus-Monitor split.",
      objection: "Is Avala Delivery a Jira replacement?",
      response: "No. It prepares governed work and complements authorized delivery systems."
    }),
    slide("trust", "Enterprise control starts at the model boundary.", {
      eyebrow: "TRUST + AI CONTROLS",
      screenshot: "admin",
      bullets: ["BYOK-ready architecture", "Provider choice", "Server-side secret boundary", "Human authority", "Evidence and audit", "Fail-closed behavior"],
      claims: ["CL-008", "CL-021", "CL-022", "CL-024", "CL-026"],
      qualifier: "Provider availability is deployment-dependent. No security or compliance certification claim.",
      emphasis: "Separate model access from human decision authority.",
      objection: "Is enterprise BYOK available today?",
      response: "The safe current claim is BYOK-ready architecture; availability depends on a validated deployment."
    }),
    slide("roles", "Built for the teams making automation decisions.", {
      eyebrow: "FAMILIAR ENTERPRISE ROLES",
      bullets: ["Automation / AI CoE", "Transformation Office", "Process Excellence", "Business Analysts", "Enterprise Architecture", "Risk and Control", "Delivery leadership", "Consulting partners"],
      claims: ["CL-027"],
      qualifier: "Designed to reduce adoption friction; no zero-training or instant-adoption claim.",
      emphasis: "Show shared context with role-specific next actions.",
      objection: "How much change management is required?",
      response: "The product uses familiar roles and artifacts, but it does not claim zero training."
    }),
    slide("cta", "Make one governed decision before committing to build.", {
      eyebrow: "NEXT STEP",
      subtitle: "Explore the synthetic product. Assess a real candidate process. Review the recommendation, evidence, and control conditions before committing automation budget.",
      bullets: ["Select a process", "Bring the evidence", "Review the recommendation", "Decide the governed next step"],
      claims: ["CL-001", "CL-002", "CL-005", "CL-008", "CL-024"],
      qualifier: "Success is a defensible decision, not a deployed automation.",
      emphasis: "Close with a bounded action the audience can take now.",
      objection: "What is the smallest credible first step?",
      response: "One candidate process, one evidence set, and one reviewed Decision Pack."
    })
  ];
}

export function clientSlides(inputs) {
  const clientName = inputs.client?.client_name?.trim();
  const coverEyebrow = clientName ? `PREPARED FOR ${clientName.toUpperCase()}` : "CLIENT DISCUSSION DRAFT";
  return [
    slide("cover", "From process evidence to governed delivery.", {
      eyebrow: coverEyebrow,
      subtitle: "AvalaOS — the governed decision and delivery layer around AI, automation, and human work.",
      screenshot: "home",
      claims: ["CL-001", "CL-002", "CL-003", "CL-024"],
      qualifier: "Synthetic product preview. No client relationship or live execution implied.",
      apInput: clientName ? "None." : "Client name and logo remain unsupplied.",
      emphasis: "Orient the buyer around the operating outcome.",
      objection: "Is this a customer case study?",
      response: "No. This is a configurable discussion draft using synthetic product data."
    }),
    slide("statement", "Automation portfolios fail before development begins.", {
      eyebrow: "THE BUYER PROBLEM",
      bullets: ["Technology-first selection", "Inconsistent assessment methods", "Incomplete evidence", "Spreadsheet decisions", "Approval by email", "Context lost at handoff"],
      claims: ["CL-001", "CL-003", "CL-008"],
      qualifier: "Recognizable operating pattern; no quantified buyer performance claim.",
      emphasis: "Frame decision quality as a portfolio-control problem.",
      objection: "Do you have benchmark failure rates?",
      response: "No benchmark number is used; the slide describes the problem the product addresses."
    }),
    slide("techfit", "Not every process needs AI.", {
      eyebrow: "TECHNOLOGY FIT",
      stages: techFit,
      claims: ["CL-006", "CL-007", "CL-008"],
      qualifier: "AvalaOS evaluates evidence and controls; authorized systems execute.",
      emphasis: "Use the AP Invoice Exception pattern to make hybrid fit concrete.",
      objection: "Does the system prefer AI?",
      response: "No. It selects the least-complex eligible mix under deterministic rules."
    }),
    slide("comparison", "The decision trail breaks when every phase starts over.", {
      eyebrow: "FRAGMENTED VS GOVERNED",
      left: { title: "Fragmented path", items: ["Workshop", "Spreadsheet", "Opinion", "Document", "Email approval", "Delivery tool", "Lost context"] },
      right: { title: "AvalaOS path", items: ["Evidence", "Deterministic decision", "Human governance", "Governed artifact", "Delivery handoff", "Outcome visibility"] },
      claims: ["CL-003"],
      qualifier: "The fragmented path is an operating pattern, not a claim about a named client.",
      emphasis: "Contrast handoff loss with retained reasoning.",
      objection: "Can existing tools be retained?",
      response: "Yes. AvalaOS complements the execution ecosystem."
    }),
    slide("lifecycle", "One governed lifecycle keeps evidence and accountability attached.", {
      eyebrow: "THE AVALAOS LIFECYCLE",
      stages: lifecycle,
      screenshots: ["assess", "govern", "studio", "delivery", "monitor"],
      claims: ["CL-003", "CL-004", "CL-024"],
      qualifier: "Synthetic product previews. Execution remains with authorized systems.",
      emphasis: "Explain the cumulative output of each stage.",
      objection: "Does the lifecycle replace our existing stack?",
      response: "No. It preserves decision context around the systems that execute."
    }),
    slide("screenshot", "Avala Assess turns evidence into an explainable recommendation.", {
      eyebrow: "WHAT THE CLIENT RECEIVES",
      screenshot: "assess",
      bullets: ["Process inventory", "Primitive-level decomposition", "Evidence confidence and gaps", "Versioned deterministic recommendation", "Hybrid operating model", "Decision Pack"],
      claims: ["CL-005", "CL-006", "CL-009", "CL-010", "CL-024"],
      qualifier: "Economics are scenario-based; calibration is Insufficient Data. No live estate scanning.",
      emphasis: "Describe tangible buyer outputs, not features alone.",
      objection: "How accurate are the economics?",
      response: "They are traceable scenarios from explicit evidence and assumptions, not guaranteed outcomes."
    }),
    slide("screenshot", "Govern resolves material risk before handoff.", {
      eyebrow: "HUMANS APPROVE RISK",
      screenshot: "govern",
      bullets: ["Evidence attestations", "Assumptions and gaps", "Action-specific controls", "Approval conditions", "Handoff readiness"],
      claims: ["CL-008", "CL-011", "CL-012", "CL-024"],
      qualifier: "Govern is a control-plane record, not runtime enforcement.",
      emphasis: "Use resolves conditions, not eliminates risk.",
      objection: "Can the system enforce agent behavior live?",
      response: "Not in the current baseline. Authorized execution platforms retain runtime control."
    }),
    slide("screenshot", "Studio turns approved context into an artifact people can revise and approve.", {
      eyebrow: "EDITABLE BUSINESS + DELIVERY DOCUMENTATION",
      screenshot: "studio",
      bullets: ["BRD", "FRD", "PDD", "Human-readable preview", "Immutable revisions", "Independent review", "Separate approval"],
      claims: ["CL-013", "CL-014", "CL-015", "CL-024"],
      qualifier: "Structured artifacts are accepted. Private rendition and brokered download remain candidate-only.",
      emphasis: "Keep current structured authority distinct from candidate private files.",
      objection: "Can we download approved files today?",
      response: "Private Markdown/PDF/DOCX and brokered download remain release- and deployment-dependent."
    }),
    slide("screenshot", "One governed handoff carries the why into delivery.", {
      eyebrow: "AVALA DELIVERY",
      screenshot: "delivery",
      bullets: ["Source-linked work items", "Tasks and acceptance context", "Ownership and blockers", "Delivery Pack", "Evidence and lineage"],
      claims: ["CL-016", "CL-017", "CL-018", "CL-024"],
      qualifier: "One governed handoff prepares source-linked work; AvalaOS neither executes the automation nor replaces Jira.",
      emphasis: "Show what the delivery team receives.",
      objection: "Does it sync to Jira or Azure DevOps?",
      response: "No connector or synchronization is promised in this deck."
    }),
    slide("screenshot", "Monitor shows what is ready — and what is not recorded.", {
      eyebrow: "AVALA MONITOR",
      screenshot: "monitor",
      bullets: ["Initiative disposition", "Readiness and risk", "Open work and blockers", "Source lineage", "Outcome recording state"],
      claims: ["CL-019", "CL-024"],
      qualifier: "Read-only visibility over recorded data. No live runtime telemetry; fixture percentages are not client outcomes.",
      emphasis: "Make the absence of evidence a visible state.",
      objection: "Is Monitor real-time?",
      response: "No. It is a read-only view over recorded data."
    }),
    slide("roles", "Familiar roles and artifacts reduce adoption friction.", {
      eyebrow: "BUILT AROUND ENTERPRISE WORK",
      bullets: ["Process owner", "Process analyst", "Business analyst", "Control reviewer", "Delivery lead", "Executive / buyer", "Platform admin"],
      sideBullets: ["Process catalog", "Decision Pack", "BRD / FRD / PDD", "Work items", "Delivery Pack", "Portfolio views"],
      claims: ["CL-027"],
      qualifier: "Designed to reduce adoption friction; no zero-training claim.",
      emphasis: "Show shared evidence with role-specific views.",
      objection: "How much training is needed?",
      response: "Familiar roles and artifacts reduce friction, but training is not claimed to be unnecessary."
    }),
    slide("trust", "Control boundaries keep model authority and decision authority separate.", {
      eyebrow: "TRUST, AUTHORITY + BYOK",
      screenshot: "admin",
      bullets: ["BYOK-ready architecture", "Designed for customer-controlled model access", "Server-side secret boundary", "Human approval", "Evidence and audit", "Fail-closed behavior"],
      claims: ["CL-008", "CL-021", "CL-022", "CL-026"],
      qualifier: "Provider availability is deployment-dependent. Hosted tenant isolation and compliance readiness remain unproven.",
      emphasis: "Use proof-safe trust wording.",
      objection: "Is BYOK available now?",
      response: "The current claim is BYOK-ready architecture, dependent on a validated deployment."
    }),
    slide("flow", "Start with one decision, then earn the right to scale.", {
      eyebrow: "SUGGESTED ENGAGEMENT PATH",
      stages: [
        ["1", "Candidate process + evidence discovery"],
        ["2", "Governed assessment + Decision Pack"],
        ["3", "Studio artifact + approval"],
        ["4", "Delivery-handoff validation"],
        ["5", "Monitor + outcome review"],
        ["6", "Controlled scale-out decision"]
      ],
      claims: ["CL-003", "CL-005", "CL-011", "CL-013", "CL-017", "CL-019"],
      qualifier: "No timeline promise. Later pilot and scale stages depend on separately accepted readiness evidence.",
      emphasis: "Every stage produces an auditable output.",
      objection: "How quickly can we deploy?",
      response: "This deck does not promise a timeline; it sequences the decisions and proof required."
    }),
    slide("cta", "Select one process before committing build budget.", {
      eyebrow: "NEXT STEP",
      subtitle: "Bring a named process owner, a candidate process, available evidence, and known constraints. Leave with a reviewed Decision Pack, control requirements, and an explicit next-step disposition.",
      bullets: ["Run a governed assessment", "Review the recommendation", "Then decide whether to build"],
      claims: ["CL-001", "CL-005", "CL-008"],
      qualifier: "Success is a defensible decision, not a deployed automation.",
      emphasis: "Close on a bounded, buyer-owned action.",
      objection: "What must the client provide?",
      response: "One process, accountable owners, current evidence, and known constraints."
    }),
    slide("audience", "Turn discovery into a repeatable, evidence-backed client method.", {
      eyebrow: "MODULAR INSERT • CONSULTING PARTNER",
      bullets: ["Reusable assessment structure", "Client-specific evidence and Decision Pack", "Governed BRD/FRD/PDD package", "Delivery-handoff preparation", "Repeatable review and control language"],
      claims: ["CL-005", "CL-013", "CL-017", "CL-029"],
      qualifier: "Proposed partner operating model; no current white-label, reseller, or client-branding claim.",
      roadmap: "Commercial discussion strategy requiring AP and legal confirmation.",
      apInput: "White-label rights, licensing structure, branding rules, pricing, support, and retained IP.",
      emphasis: "Focus on method repeatability, not an unproven reseller program."
    }),
    slide("comparison", "Define the partner model before making a commercial promise.", {
      eyebrow: "MODULAR INSERT • CONSULTING PARTNER",
      left: { title: "Partner", items: ["Client relationship", "Discovery", "Implementation", "Enablement", "Approved customisation"] },
      right: { title: "AvalaOS + joint boundary", items: ["Platform IP", "Decision law", "Product releases", "Change control", "Support and evidence ownership"] },
      claims: ["CL-029"],
      qualifier: "REQUIRES AP / LEGAL INPUT — licensing, territory, branding, pricing, support, and IP terms.",
      roadmap: "Proposed model, not current capability.",
      apInput: "All commercial and legal partner terms.",
      emphasis: "Keep the visible copy polished while making the approval boundary explicit."
    }),
    slide("audience", "Build portfolio discipline before technology becomes the default.", {
      eyebrow: "MODULAR INSERT • ENTERPRISE AI / AUTOMATION COE",
      bullets: ["Process and application inventory", "Evidence and accountable owners", "Governed dispositions", "Application-readiness bands", "Dependency waves", "Risk, control, and economics ranges"],
      claims: ["CL-006", "CL-009", "CL-010", "CL-011"],
      qualifier: "No live CMDB scanning, automatic roadmap approval, or operational telemetry.",
      emphasis: "Show a repeatable portfolio decision contract.",
      objection: "Does this discover the estate automatically?",
      response: "No. Current capability uses governed inventory, import, evidence, and review."
    }),
    slide("flow", "Give every initiative the same decision-to-handoff contract.", {
      eyebrow: "MODULAR INSERT • ENTERPRISE AI / AUTOMATION COE",
      stages: [
        ["1", "Evidence + assumptions"],
        ["2", "Versioned deterministic recommendation"],
        ["3", "Human review + controls"],
        ["4", "Approved artifact"],
        ["5", "Source-linked handoff"],
        ["6", "Executive visibility"]
      ],
      claims: ["CL-003", "CL-008", "CL-013", "CL-017", "CL-019"],
      qualifier: "A standard decision contract, not autonomous execution or direct tool integration.",
      emphasis: "End the appendix on the scalable governance pattern."
    })
  ];
}

export function investorSlides(inputs) {
  return [
    slide("cover", "The operating system for governed AI and automation decisions.", {
      eyebrow: "AVALAOS • INVESTOR DISCUSSION DRAFT",
      subtitle: "Evaluate before you automate. Govern before you execute.",
      screenshot: "home",
      claims: ["CL-001", "CL-002", "CL-024"],
      qualifier: "Synthetic product preview. No live execution or commercial traction implied.",
      apInput: "Founder, round, contact, and confidentiality inputs remain unsupplied.",
      emphasis: "Open with category ambition and immediate proof discipline."
    }),
    slide("statement", "Enterprises have automation tools. They lack one governed decision path.", {
      eyebrow: "THE PROBLEM",
      bullets: ["Tool-first selection", "Fragmented assessment", "Missing evidence", "Inconsistent governance", "Handoff loss", "Weak outcome visibility"],
      claims: ["CL-001", "CL-003"],
      qualifier: "Strategic thesis; no quantified market-size or failure-rate claim.",
      emphasis: "Define the missing layer without attacking named competitors."
    }),
    slide("techfit", "One business process is a portfolio of different work types.", {
      eyebrow: "THE KEY INSIGHT",
      stages: techFit,
      claims: ["CL-006", "CL-007", "CL-008"],
      qualifier: "The right answer is usually a governed mix, not one technology winner.",
      emphasis: "Make the decision model the core insight."
    }),
    slide("category", "The decision path crosses categories that stop at their own boundary.", {
      eyebrow: "WHY CURRENT APPROACHES BREAK",
      stages: [
        ["Process mining", "Discovers work"],
        ["Consulting", "Assesses and recommends"],
        ["AI governance", "Frames controls"],
        ["Requirements", "Documents the change"],
        ["Delivery", "Plans the build"],
        ["Runtime", "Executes the work"]
      ],
      claims: ["CL-001", "CL-003", "CL-018"],
      qualifier: "AvalaOS governs the connective path; authorized systems execute.",
      emphasis: "Position between categories, not as a replacement for each."
    }),
    slide("flow", "AvalaOS carries evidence into delivery without losing authority.", {
      eyebrow: "THE SOLUTION",
      stages: [
        ["1", "Evidence"], ["2", "Deterministic decision"], ["3", "Human governance"],
        ["4", "Governed artifact"], ["5", "Delivery handoff"], ["6", "Outcome visibility"]
      ],
      claims: ["CL-003", "CL-008"],
      qualifier: "Execution remains with systems and teams already authorized to perform it.",
      emphasis: "Show how authority survives the handoff."
    }),
    slide("lifecycle", "The synthetic AP Invoice Exception journey proves the product model end to end.", {
      eyebrow: "PRODUCT PROOF",
      stages: lifecycle,
      screenshots: ["assess", "govern", "studio", "delivery", "monitor"],
      claims: ["CL-004", "CL-005", "CL-011", "CL-013", "CL-016", "CL-019", "CL-024"],
      qualifier: "Synthetic reference journey • source and CI proof • no live execution or customer outcome.",
      emphasis: "Separate product proof from commercial proof."
    }),
    slide("audience", "Start where recurring automation decisions already exist.", {
      eyebrow: "INITIAL CUSTOMER WEDGE",
      bullets: ["Automation and transformation consultancies", "Small and mid-sized enterprise AI / Automation CoEs", "Process Excellence teams", "Enterprise Architecture teams"],
      sideBullets: ["Land with one high-value process", "Expand to multiple processes", "Add portfolio and application context"],
      claims: ["CL-029"],
      qualifier: "Go-to-market hypothesis for AP confirmation; not evidence of customers, segment size, or willingness to pay.",
      roadmap: "Proposed commercial wedge.",
      apInput: "ICP validation, buyer interviews, design partners, and pipeline evidence.",
      emphasis: "Keep the beachhead focused and testable."
    }),
    slide("roadmap", "The wedge expands along the same governed context.", {
      eyebrow: "BEACHHEAD + EXPANSION",
      statusColumns: [
        { title: "CURRENT", items: ["Process assessment", "Decision intelligence", "Governed review", "BRD / FRD / PDD", "Application modernization assessment"] },
        { title: "NEAR TERM", items: ["Delivery lineage authority", "Monitor / Admin / Trust server models", "Controlled deployment", "Design-partner pilot"] },
        { title: "VISION", items: ["Reusable solution patterns", "Governed software assembly", "Company-owned applications"] }
      ],
      claims: ["CL-005", "CL-010", "CL-013", "CL-017", "CL-021", "CL-028"],
      qualifier: "Current, near-term, and vision status are deliberately separated.",
      emphasis: "Show expansion through retained context, not unrelated modules."
    }),
    slide("moat", "Defensibility grows from context that survives every stage.", {
      eyebrow: "PRODUCT + DATA MOAT",
      bullets: ["Versioned deterministic logic", "Primitive-level operating models", "Claim-linked evidence and assumptions", "Human authority for material risk", "Immutable review and artifact ancestry", "Cross-module application and economics context"],
      claims: ["CL-006", "CL-008", "CL-009", "CL-010", "CL-013", "CL-014"],
      qualifier: "No patent, proprietary-algorithm, scientific-validation, calibrated-model, or uncopyable-moat claim.",
      emphasis: "Present defensibility as accumulated governed context."
    }),
    slide("commercial", "A services-assisted license can land the platform before recurring hosting.", {
      eyebrow: "COMMERCIAL MODEL • AP CONFIRMATION REQUIRED",
      left: { title: "Initial strategy", items: ["Upfront enterprise or white-label license", "Implementation and enablement", "Paid customisation and enhancements", "Optional support and update agreement"] },
      right: { title: "Future strategy", items: ["Hosted enterprise offering", "BYOK and provider controls", "Recurring tiers after deployment and pilot readiness"] },
      claims: ["CL-022", "CL-029"],
      qualifier: "Discussion strategy. Pricing, margins, customers, revenue, and contract terms are not supplied.",
      roadmap: "Proposed commercial strategy.",
      apInput: "License range, implementation range, support model, hosted pricing, and target gross margin.",
      emphasis: "Keep the monetization path plausible without inventing numbers."
    }),
    slide("flow", "Founder-led assessments create the first route to repeatable distribution.", {
      eyebrow: "GO-TO-MARKET • AP CONFIRMATION REQUIRED",
      stages: [
        ["1", "Targeted process assessment"], ["2", "Synthetic reference journey"], ["3", "Design-partner learning"],
        ["4", "Consulting / automation partners"], ["5", "White-label licensing"], ["6", "Module + portfolio expansion"]
      ],
      claims: ["CL-024", "CL-029"],
      qualifier: "Planned route only. No current partnership, pilot, customer, or pipeline claim.",
      roadmap: "Proposed go-to-market strategy.",
      apInput: "Founder background, design-partner status, partner evidence, and pipeline.",
      emphasis: "Show a learning loop, not fictional traction."
    }),
    slide("status", "Product proof is ahead of commercial proof — and the boundary is explicit.", {
      eyebrow: "PRODUCT PROGRESS",
      statusColumns: [
        { title: "ACCEPTED SOURCE / CI", items: ["Tenant authority + Assess", "V2 review and Govern handoff", "Economics + Application Portfolio", "Studio BRD / FRD / PDD"] },
        { title: "PRODUCT SURFACES", items: ["Delivery workbench", "Monitor overview", "Admin / Trust", "Public enterprise UI"] },
        { title: "CANDIDATE / AHEAD", items: ["Studio private artifacts", "Delivery lineage authority", "Monitor / Admin / Trust server models", "Deployment + pilot controls"] }
      ],
      claims: ["CL-005", "CL-009", "CL-010", "CL-011", "CL-013", "CL-015", "CL-016", "CL-019", "CL-021", "CL-025", "CL-026"],
      qualifier: "Product verification is not customer adoption. Hosted and live validation remain unproven.",
      emphasis: "Make proof maturity a credibility signal."
    }),
    slide("roadmap", "The roadmap converts source proof into controlled commercial proof.", {
      eyebrow: "ROADMAP",
      statusColumns: [
        { title: "CURRENT", items: ["Assess + Govern", "Application Portfolio", "Studio structured artifacts", "Source-level controls + UI"] },
        { title: "NEAR TERM", items: ["Accept Studio PR B", "Delivery / Monitor / Admin / Trust authority", "Deployment-backed BYOK", "Controlled pilot"] },
        { title: "EXPANSION", items: ["Reusable solution blocks", "Governed integration patterns", "Solution blueprints", "Company-owned applications"] }
      ],
      claims: ["CL-013", "CL-015", "CL-017", "CL-021", "CL-022", "CL-026", "CL-028", "CL-029"],
      qualifier: "Commercial milestones require AP confirmation; product roadmap items require accepted evidence.",
      emphasis: "Show the next de-risking sequence, not a calendar promise."
    }),
    slide("assemble", "From deciding what to build to governing how software is assembled.", {
      eyebrow: "AVALA ASSEMBLE • ROADMAP VISION",
      stages: [["Assess", "Evidence"], ["Validate", "Controls"], ["Assemble", "Reusable blocks"], ["Launch", "Governed handoff"], ["Audit", "Evidence + visibility"]],
      bullets: ["Forms", "Workflows", "Extraction", "Validations", "Approvals", "Connectors", "Reporting", "Later-approved agent tools"],
      claims: ["CL-028"],
      qualifier: "ROADMAP VISION — not a current production-application generation or deployment capability.",
      roadmap: "Roadmap only.",
      emphasis: "Differentiate the future vision by its approved evidence and control ancestry."
    }),
    slide("funding", "Capital would convert product proof into controlled market proof.", {
      eyebrow: "FUNDING OBJECTIVE • DISCUSSION DRAFT",
      bullets: ["Deployment-backed BYOK", "Operational and pilot controls", "Delivery / Monitor / Admin / Trust engineering", "First design partners", "Focused go-to-market"],
      claims: ["CL-022", "CL-026", "CL-029"],
      qualifier: "Round, amount, runway, founder credentials, traction, legal entity, and contact details are intentionally omitted until supplied.",
      roadmap: "Proposed use-of-funds direction.",
      apInput: "Founder, team, legal entity, round, raise amount, runway, use of funds, traction, and contact details.",
      emphasis: "Close on the de-risking objective rather than missing numbers."
    })
  ];
}

export function brandSlides(inputs) {
  return [
    slide("brandCurrent", "Retain the equity already working.", {
      eyebrow: "AVALAOS BRAND EVOLUTION • INTERNAL",
      subtitle: "Preserve the AvalaOS name, current A silhouette, premium wordmark proportions, navy and amber palette, enterprise tone, and canonical tagline.",
      claims: ["CL-002", "CL-028"],
      qualifier: "Internal exploration. No production brand asset is changed.",
      emphasis: "Define the non-negotiable recognition assets."
    }),
    slide("brandMeaning", "Give the name a future meaning without inventing a current module.", {
      eyebrow: "FUTURE MNEMONIC",
      stages: [["A", "Assess"], ["V", "Validate"], ["A", "Assemble"], ["L", "Launch"], ["A", "Audit"], ["OS", "Operating System"]],
      bullets: ["Assess → Avala Assess", "Validate → Avala Govern", "Assemble → Studio + future assembly", "Launch → Avala Delivery", "Audit → Monitor + Admin"],
      claims: ["CL-004", "CL-028"],
      qualifier: "Brand meaning and roadmap vision; not proof of a current Avala Assemble module.",
      roadmap: "Roadmap vision.",
      emphasis: "Use the mnemonic to clarify the lifecycle, not to overstate capability."
    }),
    slide("brandConcept", "Concept 1 — Modular A", {
      eyebrow: "FIVE CONTROLLED COMPONENTS",
      concept: "concept-01-modular-a.svg",
      bullets: ["Strong assembly metaphor", "Clear five-part construction", "More radical silhouette", "Risk: reduced recognition at small sizes"],
      claims: ["CL-028"],
      qualifier: "Exploratory internal mark. Not a production replacement.",
      emphasis: "Judge whether the modularity is worth the recognition cost."
    }),
    slide("brandConcept", "Concept 2 — Governed Bridge", {
      eyebrow: "EVIDENCE TO EXECUTION",
      concept: "concept-02-governed-bridge.svg",
      bullets: ["Expresses the connective control layer", "Amber pathway signals governed movement", "Distinctive at large scale", "Risk: more illustrative than iconic"],
      claims: ["CL-003", "CL-028"],
      qualifier: "Exploratory internal mark. Not a production replacement.",
      emphasis: "Test whether the pathway reads at favicon and document sizes."
    }),
    slide("brandConcept", "Concept 3 — Assembly Node", {
      eyebrow: "EVOLUTIONARY RECOMMENDATION",
      concept: "concept-03-assembly-node.svg",
      bullets: ["Preserves the current A silhouette", "Adds a subtle joining node", "Retains navy / amber equity", "Scales with the strongest recognition"],
      claims: ["CL-028"],
      qualifier: "Recommended internal direction. Production use still requires brand and legal approval.",
      roadmap: "Brand evolution candidate.",
      emphasis: "Show why the smallest change carries the most future meaning."
    }),
    slide("brandRecommendation", "Recommend the Assembly Node — evolve, do not replace.", {
      eyebrow: "RECOMMENDATION + USAGE RULES",
      concept: "concept-03-assembly-node.svg",
      bullets: ["Keep AvalaOS as the product brand", "Use the node only in approved future contexts", "Retain current wordmark proportions", "Keep amber below 15% of visual area", "Never imply current app generation", "Test mono, small-size, and accessibility variants before adoption"],
      claims: ["CL-002", "CL-028"],
      qualifier: "Internal recommendation. No production logo, public page, or application asset is modified.",
      roadmap: "Future identity decision only.",
      apInput: "AP brand approval, trademark review, accessibility variants, and production rollout decision.",
      emphasis: "Close with a clear recommendation and safe adoption gate."
    })
  ];
}

export const DECK_FACTORIES = { marketing: marketingSlides, client: clientSlides, investor: investorSlides, brand: brandSlides };
