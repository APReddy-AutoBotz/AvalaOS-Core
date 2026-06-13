import { GeneratedArtifacts } from './types';

export const FITTRACK_GENERATED_DATA: GeneratedArtifacts = {
    brd: {
        title: "BRD: FitTrack Mobile App",
        sections: [
            {
                key: "intro",
                title: "1. Introduction & Business Objectives",
                content: "This document outlines the business requirements for FitTrack, a new mobile application for health and fitness. The primary business objective is to capture 5% of the casual fitness tracker market within two years by offering a superior, user-friendly experience. Key success metrics include achieving 100,000 monthly active users (MAU) within the first year and a 4.5+ star rating on app stores."
            },
            {
                key: "scope",
                title: "2. Project Scope",
                content: "**In Scope:**\n- User account creation, authentication, and profile management.\n- Manual logging of gym workouts (sets, reps, weight).\n- Manual logging of daily meals and water intake.\n- Basic dashboard for viewing daily progress.\n- iOS and Android mobile applications.\n\n**Out of Scope:**\n- Wearable device integration (e.g., Apple Watch, Fitbit).\n- Guided workout videos or plans.\n- Social features like friends, feeds, or challenges.\n- Web-based application."
            },
            {
                key: 'nfrs',
                title: "3. Non-Functional Requirements",
                content: "- **Performance:** API responses must be under 200ms.\n- **Security:** User data must be encrypted at rest and in transit. Privacy obligations must be reviewed before pilot use.\n- **Scalability:** The system must support up to 250,000 users without performance degradation."
            }
        ]
    },
    frd: {
        title: "FRD: FitTrack Mobile App",
        sections: [
             {
                key: "user_auth",
                title: "1. User Authentication",
                content: "The system shall allow users to register via email/password and Google Sign-In. The system shall enforce password complexity rules. The system shall send a verification email upon registration."
            },
            {
                key: "workout_log",
                title: "2. Workout Logging",
                content: "The system shall allow users to create a new workout session. Users shall be able to add exercises to a session, specifying sets, reps, and weight. The system shall save the workout history to the user's profile."
            }
        ]
    },
    pdd: {
        title: "PDD: FitTrack (N/A for this project type)",
        sections: []
    },
    qualityGate: {
        title: "Quality Gate Analysis",
        ambiguityPoints: [
            "What are the specific password complexity rules?",
            "What is the source of the nutrition database for meal logging? Is an API subscription required?",
            "How should the app behave offline? Can users log workouts or meals without an internet connection?"
        ],
        gapPoints: [
            "No requirements for data privacy policy or terms of service screens.",
            "The process for password recovery (e.g., 'Forgot Password') is not defined.",
            "There are no requirements for user data export or account deletion to comply with GDPR."
        ]
    },
    diagrams: {
        asIs: {
            title: "As-Is Process Flow (Manual Tracking)",
            mermaidCode: `
flowchart TD
    A[User works out] --> B["User writes details in a notebook or phone notes"];
    B --> C["User manually calculates calories using a separate app"];
    C --> D["Data is fragmented and hard to track over time"];
`
        },
        toBe: {
            title: "To-Be Process Flow (FitTrack App)",
            mermaidCode: `
flowchart TD
    subgraph User
        A["Opens FitTrack App"] --> B["Logs into account"];
        B --> C["Starts new workout session"];
        C --> D["Adds exercises, sets, reps"];
        D --> E["Saves workout"];
    end
    subgraph "FitTrack Backend"
        E --> F{API receives workout data};
        F --> G["Saves data to user's profile in DB"];
        G --> H["Aggregates data for dashboard"];
    end
    H --> I["User views progress on dashboard"];
`
        }
    },
    workItems: [
        {
            type: "Epic",
            title: "User Authentication & Profile",
            description: "Enable users to create and manage their accounts securely, providing a personalized experience.",
            acceptanceCriteria: ["Users can sign up, log in, and log out.", "User profile data is securely stored.", "Users can reset their password."]
        },
        {
            type: "Story",
            title: "User Registration",
            description: "As a new user, I can sign up for an account using my email and a password so that I can start tracking my fitness.",
            acceptanceCriteria: ["User can sign up with email/password.", "Password meets security complexity rules.", "User receives a verification email and must click the link to activate their account."]
        },
        {
            type: "Task",
            title: "Set up Firebase project for Authentication",
            description: "Configure a new Firebase project and enable Email/Password and Google Sign-In providers.",
            acceptanceCriteria: ["Firebase project is created.", "Authentication providers are enabled.", "API keys are securely stored in the app's environment configuration."]
        }
    ],
    approvals: [
        { userId: 'user-1', role: 'Accountable', status: 'Pending', approvedAt: null },
        { userId: 'user-2', role: 'Responsible', status: 'Pending', approvedAt: null },
        { userId: 'user-3', role: 'Consulted', status: 'Pending', approvedAt: null },
    ]
};

export const INVOICE_PROCESSING_ARTIFACTS: GeneratedArtifacts = {
    brd: { title: 'BRD: N/A for this project type', sections: [] },
    frd: { title: 'FRD: N/A for this project type', sections: [] },
    pdd: {
        title: "PDD: AP Invoice Exception Handling",
        sections: [
            {
                key: 'asis_overview',
                title: 'Process Overview',
                content: 'The current process involves Accounts Payable analysts monitoring invoice intake channels, validating PO/GRN matches, checking vendor master exceptions, and routing unresolved cases to finance owner review before any payment-block update.'
            },
            {
                key: 'asis_steps',
                title: '2.4 Detailed As-Is Process Steps',
                content: '1. AP analyst reviews invoice intake from email, supplier portal, and shared drive sources.\n2. Analyst captures invoice number, amount, vendor, PO, GRN, tax, and duplicate-check details.\n3. Analyst compares invoice data against SAP ECC, vendor master, and PO/GRN matching reports.\n4. Exceptions are routed to the AP process owner with evidence and assumptions.\n5. Finance owner review is required before any payment-block update, vendor communication, or external action.'
            }
        ]
    },
    qualityGate: {
        title: "Quality Gate Analysis",
        ambiguityPoints: [
            "What is the exact logic for matching PO numbers?",
            "How should invoices without a PO number be routed for human review?",
            "What is the SLA for processing an invoice?"
        ],
        gapPoints: [
            "The process for handling duplicate invoices is not defined.",
            "No requirements for an audit trail or logging.",
            "The notification process for failed validation or blocked handoff is not specified."
        ]
    },
    diagrams: {
        asIs: {
            title: "As-Is Invoice Process",
            mermaidCode: `
flowchart TD
    A["Receive Invoice (Email/Mail/Portal)"] --> B["Manual Data Entry into Excel"];
    B --> C["Verify PO Number in SAP"];
    C --> D{"PO Match?"};
    D -- Yes --> E["Post Invoice in SAP"];
    D -- No --> F["Escalate to AP Manager for Review"];
`
        },
        toBe: {
            title: "To-Be AP Exception Handling Process",
            mermaidCode: `
flowchart TD
    subgraph "Avala Studio Review Artifact"
        A["Review AP source context"] --> B["Draft exception handling workflow"];
        B --> C["Attach evidence and assumptions"];
        C --> D{"Owner review complete?"};
    end
    subgraph "Avala Delivery Lite"
        D -- Yes --> E["Create traceable AP work items"];
    end
    subgraph "Human Review"
        D -- No --> F["Review Exception in Queue"];
        F --> G{"Approve or request changes"};
        G -- Approve --> E;
        G -- Request Changes --> H["Update evidence and assumptions"];
    end
`
        }
    },
    workItems: [
        {
            type: "Epic",
            title: "AP Invoice Exception Workflow Foundation",
            description: "Prepare the governed workflow for receiving, validating, and reviewing AP invoice exceptions.",
            acceptanceCriteria: ["AP exception intake is mapped from source context.", "Exceptions are routed to humans for review.", "A full evidence trail is maintained."]
        },
        {
            type: "Story",
            title: "Review invoice exception source context",
            description: "As an AP process owner, I want invoice exception artifacts to carry Assess evidence and assumptions so that downstream work stays reviewable.",
            acceptanceCriteria: ["Review artifacts reference the canonical AP assessment.", "Evidence refs include invoice exception and owner-review records.", "Payment-block or vendor-facing actions remain human-reviewed."]
        }
    ],
    approvals: [
        { userId: 'user-1', role: 'Accountable', status: 'Approved', approvedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() },
        { userId: 'user-6', role: 'Responsible', status: 'Approved', approvedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() },
        { userId: 'user-2', role: 'Consulted', status: 'Pending', approvedAt: null },
    ]
};
