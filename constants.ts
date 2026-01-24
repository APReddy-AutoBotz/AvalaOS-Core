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
                content: "- **Performance:** API responses must be under 200ms.\n- **Security:** User data must be encrypted at rest and in transit. Must be compliant with GDPR.\n- **Scalability:** The system must support up to 250,000 users without performance degradation."
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
        title: "PDD: AP Invoice Automation",
        sections: [
            {
                key: 'asis_overview',
                title: '2.1 Process Overview',
                content: 'The current process involves Accounts Payable clerks manually monitoring an inbox for invoices. They open each PDF, extract key information (Invoice #, Date, Amount, PO #), and enter it into an Excel tracker. They then log into SAP to validate the PO number and post the invoice for payment.'
            },
            {
                key: 'asis_steps',
                title: '2.4 Detailed As-Is Process Steps',
                content: '1. AP Clerk opens `invoices@company.com` mailbox.\n2. Opens unread email and saves PDF invoice to a shared drive.\n3. Opens the PDF and an Excel tracking sheet.\n4. Manually types invoice data into the Excel sheet.\n5. Logs into SAP ECC.\n6. Navigates to transaction `FB60`.\n7. Enters invoice data from Excel into SAP fields.\n8. If PO is invalid, emails the business approver.\n9. If PO is valid, posts the invoice.'
            }
        ]
    },
    qualityGate: {
        title: "Quality Gate Analysis",
        ambiguityPoints: [
            "What is the exact logic for matching PO numbers?",
            "How should the bot handle invoices without a PO number?",
            "What is the SLA for processing an invoice?"
        ],
        gapPoints: [
            "The process for handling duplicate invoices is not defined.",
            "No requirements for an audit trail or logging.",
            "The notification process for failed automations is not specified."
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
            title: "To-Be Automated Invoice Process",
            mermaidCode: `
flowchart TD
    subgraph "RPA Bot"
        A["Monitor Inputs (Email/Portal)"] --> B["Extract Invoice Data (OCR)"];
        B --> C["Validate Data vs Business Rules"];
        C --> D{"Validation OK?"};
    end
    subgraph "SAP System"
        D -- Yes --> E["Post Invoice Automatically"];
    end
    subgraph "Human in the Loop (AP Clerk)"
        D -- No --> F["Review Exception in Queue"];
        F --> G{"Approve or Reject"};
        G -- Approve --> E;
        G -- Reject --> H["Notify Vendor"];
    end
`
        }
    },
    workItems: [
        {
            type: "Epic",
            title: "Invoice Ingestion & Processing",
            description: "Automate the end-to-end process of receiving, validating, and posting invoices in SAP.",
            acceptanceCriteria: ["Invoices are processed automatically without manual intervention for standard cases.", "Exceptions are routed to humans for review.", "A full audit trail is maintained."]
        },
        {
            type: "Story",
            title: "Automated Invoice Data Extraction",
            description: "As an AP Clerk, I want the system to automatically read invoice PDFs from an email inbox and extract key data fields, so I don't have to do manual data entry.",
            acceptanceCriteria: ["Bot monitors a specific email inbox for new messages with PDF attachments.", "Bot extracts Invoice #, Date, Amount, and PO # from the PDF.", "Extracted data is stored in a structured format (e.g., queue item)."]
        }
    ],
    approvals: [
        { userId: 'user-1', role: 'Accountable', status: 'Approved', approvedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() },
        { userId: 'user-6', role: 'Responsible', status: 'Approved', approvedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() },
        { userId: 'user-2', role: 'Consulted', status: 'Pending', approvedAt: null },
    ]
};
