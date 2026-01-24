import { DocTemplate, IndustryProfile } from '../types';

export const MOCK_DOC_TEMPLATES: DocTemplate[] = [
    {
        id: 'brd.v1',
        title: 'Business Requirements Document (BRD)',
        description: 'Outlines the high-level business goals, scope, and requirements for a project.',
        artifactKey: 'brd',
        sections: [
            { key: 'introduction', title: '1. Introduction', description: 'Background and purpose of the project.', promptInjection: 'Provide a concise introduction covering the project\'s background, the business problem it solves, and the purpose of this BRD.' },
            { key: 'objectives', title: '2. Business Objectives & Success Metrics', description: 'What the project aims to achieve, with measurable KPIs.', promptInjection: 'List 3-5 specific, measurable, achievable, relevant, and time-bound (SMART) objectives. For each, define a key success metric (e.g., "Achieve 95% customer satisfaction").' },
            { key: 'scope', title: '3. Project Scope', description: 'What is and is not included.', promptInjection: 'Create two distinct sections with bullet points: "In Scope" and "Out of Scope". Be specific about features, functionalities, and user groups for both.' },
            { key: 'stakeholders', title: '4. Key Stakeholders', description: 'Individuals and groups impacted by the project.', promptInjection: 'Create a Markdown table of key stakeholders with columns for `Name/Group`, `Role`, and `Interest/Expectations`.' },
            { key: 'business_reqs', title: '5. Business Requirements', description: 'High-level requirements from a business perspective.', promptInjection: 'List the high-level business requirements. Group them logically by feature or process area. Each requirement should describe a business need, not a technical solution.' },
            { key: 'business_rules', title: '6. Business Rules', description: 'Specific rules or policies that the solution must adhere to.', promptInjection: 'List any critical business rules that govern the process or data. For example, "A customer\'s credit limit cannot be exceeded."' },
            { key: 'assumptions_constraints', title: '7. Assumptions and Constraints', description: 'Factors assumed to be true and limitations on the project.', promptInjection: 'Create two sections: "Assumptions" (e.g., "Third-party API will be available") and "Constraints" (e.g., "Budget cannot exceed $50,000"). Use bullet points.' },
            { key: 'nfrs', title: '8. Non-Functional Requirements', description: 'System-level requirements like security, performance.', promptInjection: 'List key non-functional requirements covering areas like Security (e.g., data encryption), Performance (e.g., page load times), and Usability. Incorporate any NFRs from selected industry profiles.' },
        ]
    },
    {
        id: 'pdd.v1',
        title: 'Process Design Document (PDD)',
        description: 'A detailed document that describes a business process in the context of a Robotic Process Automation (RPA) project.',
        artifactKey: 'pdd',
        sections: [
            { key: 'intro_purpose', title: '1.1 Purpose of the Document', description: 'Clearly state the purpose of this document and the business process it defines for automation.', promptInjection: 'Write a concise paragraph explaining that this Process Design Document (PDD) outlines the business process chosen for automation using Robotic Process Automation (RPA) technology. State that it serves as a blueprint for developers.' },
            { key: 'intro_objectives', title: '1.2 Objectives', description: 'List the specific business goals and measurable benefits expected from this automation.', promptInjection: 'List the key business objectives and expected benefits from automating this process. Use a bulleted list. Examples include: "Reduce processing time per item by 80%", "Improve data accuracy to 99.5%", "Eliminate manual errors".' },
            { key: 'intro_contacts', title: '1.3 Key Contacts', description: 'Identify the key stakeholders, SMEs, and process owners involved in this project.', promptInjection: 'Create a Markdown table listing the key project contacts. Include columns for `Role`, `Name`, `Contact Details`, and `Notes`. Populate with essential roles like "Process Owner", "Subject Matter Expert (SME)", and "RPA Solution Architect", including their responsibilities (e.g., "Point of contact for process exceptions").' },
            { key: 'intro_prerequisites', title: '1.4 Minimum Prerequisites for Automation', description: 'List all necessary conditions that must be met before development can begin.', promptInjection: 'Create a numbered list of the minimum prerequisites required for the automation project to succeed. Examples include: "Filled in Process Design Document", "Test Data to support development", "User access and accounts for robots", "Credentials for all required applications".' },
            { key: 'asis_overview', title: '2.1 Process Overview', description: 'Provide a high-level summary of the current manual process, including key metrics.', promptInjection: 'Create a Markdown table summarizing the current "As-Is" process. Include rows for `Process full name`, `Process Area`, `Department`, `Process short description`, `Role(s) performing the process`, `Process schedule and frequency`, `# of items processed`, `Average handling time per item`, `Input data`, and `Output data`. Populate the descriptions based on the source material.' },
            { key: 'asis_applications', title: '2.2 Applications Used in the Process', description: 'List all software applications and systems currently used in the manual process.', promptInjection: 'Create a Markdown table listing all applications used in the current manual process. Include columns for `Application Name`, `System Language`, `Access Method (e.g., Web, Desktop)`, and `Purpose in Process`. Populate with all relevant applications mentioned in the source.' },
            { key: 'asis_map', title: '2.3 As-Is Process Map', description: 'A diagram visualizing the current, high-level process flow.', promptInjection: 'Generate Mermaid.js flowchart code for the high-level "As-Is" process map based on the source document. This should show the major stages of the current manual process.' },
            { key: 'asis_steps', title: '2.4 Detailed As-Is Process Steps', description: 'A granular, step-by-step breakdown of the current manual workflow.', promptInjection: 'Provide a detailed, numbered list describing each step a user currently takes to complete the process. This should be granular enough for an RPA developer to understand the exact manual procedure. Base this on the source document\'s description of the manual workflow.' },
            { key: 'asis_input_data', title: '2.5 Input Data Description', description: 'Describe the inputs that trigger the process and the data that is used.', promptInjection: 'Create a Markdown table describing the input data for the process. Include columns for `Input Type` (e.g., Email, PDF, Excel file), `Location`, `Is it Standard? (Yes/No)`, `Is it Structured? (Yes/No)`, and `Key Data to be Used`. Provide details on what makes the data standard or structured.' },
            { key: 'tobe_map', title: '3.1 To-Be Detailed Process Map', description: 'A diagram visualizing the future, automated process flow, highlighting bot interventions.', promptInjection: 'Generate Mermaid.js flowchart code for the "To-Be" process map. This should clearly show the new, automated workflow, highlighting which steps are performed by the RPA bot and which remain manual.' },
            { key: 'tobe_initiatives', title: '3.2 Parallel Initiatives / Overlap (if applicable)', description: 'Identify any other ongoing projects or system changes that might impact this automation.', promptInjection: 'Create a Markdown table to capture any parallel initiatives or system changes that could impact the automation. Include columns for `Initiative Name`, `Process Step(s) affected`, `Impact on automation`, `Expected Completion Date`, and `Contact Person`. If no initiatives are known, state "n/a".' },
            { key: 'tobe_in_scope', title: '3.3 In Scope for RPA', description: 'Clearly list all process steps and activities that will be included in the automation.', promptInjection: 'Create a clear, bulleted list of all activities and process steps that are explicitly IN SCOPE for the automation project. Be specific.' },
            { key: 'tobe_out_of_scope', title: '3.4 Out of Scope for RPA', description: 'Clearly list all process steps and activities that will NOT be included in the automation.', promptInjection: 'Create a Markdown table to list all activities that are explicitly OUT OF SCOPE for the automation project. The table should have columns for `Activity/Step`, `Reason for Being Out of Scope`, and `Impact on the To-Be Process`.' },
            { key: 'tobe_business_exceptions', title: '3.5 Business Exceptions Handling', description: 'Define how the bot will manage known and unknown business-related exceptions (e.g., missing data).', promptInjection: 'Describe the strategy for handling business process exceptions. First, define "Known" vs. "Unknown" exceptions. Then, create a Markdown table for "Known Exceptions" with columns for `Exception Name`, `Step`, `Parameters`, and `Action to be Taken`. Finally, clearly state the procedure for all "Unknown Exceptions" (e.g., "Send an email notification to a specified address with a screenshot of the error").' },
            { key: 'tobe_application_exceptions', title: '3.6 Application Error and Exception Handling', description: 'Define how the bot will recover from application errors (e.g., system crash, element not found).', promptInjection: 'Describe the strategy for handling application errors. First, define "Known" vs. "Unknown" application errors. Then, create a Markdown table for "Known Errors" with columns for `Error Name`, `Step`, `Parameters`, and `Action to be Taken` (e.g., "Application Crash" -> "Recover & retry for maximum 3 times"). Finally, state the procedure for all "Unknown Application Errors".' },
            { key: 'tobe_reporting', title: '3.7 Reporting', description: 'Specify the data and metrics that the automation should log for monitoring and auditing.', promptInjection: 'Create a Markdown table detailing the reporting and logging requirements for the automation. The table should have columns for `Report Type` (e.g., Process logs, Transaction logs), `Update Frequency`, `Details to Capture`, and `Monitoring Tool`. Populate with examples for process, transaction, and error logs.' },
            { key: 'other_observations', title: '4. Other Observations', description: 'A section for any additional notes, considerations, or potential process improvements.', promptInjection: 'Write a paragraph to capture any other relevant observations or considerations for the project that don\'t fit in other sections. This can include potential process improvements, specific business monitoring requirements, or audit needs.' },
            { key: 'additional_sources', title: '5. Additional Sources of Process Documentation', description: 'List any supplementary documents, recordings, or materials that support the automation project.', promptInjection: 'Create a Markdown table to list supplementary documentation. The table should have columns for `Document Type` (e.g., Video Recording, SOP), `Link/Details`, and `Relevant Comments`.' }
        ]
    },
     {
        id: 'frd.v1',
        title: 'Functional Requirements Document (FRD)',
        description: 'Specifies the detailed functional requirements and user interactions with the system.',
        artifactKey: 'frd',
        sections: [
            { key: 'intro', title: '1. Introduction', required: true, description: 'Purpose, scope, and references for this FRD.', promptInjection: 'Write a brief introduction explaining the purpose of this FRD, the specific features it covers, and references to the corresponding BRD or project charter.' },
            { key: 'user_roles', title: '2. User Roles and Characteristics', description: 'Describes the types of users who will interact with the system.', promptInjection: 'Define the different user roles (e.g., Administrator, Standard User, Guest). For each role, describe their permissions and expected interactions with the system.' },
            { key: 'functional_reqs', title: '3. Functional Requirements', description: 'Detailed requirements, often grouped by feature and including user stories.', promptInjection: 'For each major feature, create a subsection. Within each subsection, list the associated User Stories (As a [user], I want [action]...) followed by a numbered list of detailed functional requirements in the format "The system shall...". Include specific acceptance criteria for each requirement.' },
            { key: 'ui_ux_reqs', title: '4. User Interface and User Experience Requirements', description: 'Specifies the look, feel, and flow of the user interface.', promptInjection: 'Describe the key UI screens and components. You cannot create images, but you can describe the layout, required fields, button actions, and navigation flow in detail. Specify usability requirements like accessibility (WCAG) standards.' },
            { key: 'data_reqs', title: '5. Data Requirements', description: 'Data entities, validation rules, and data handling.', promptInjection: 'Create a markdown table for each key data entity. The table should include columns for `Field Name`, `Data Type`, `Required?`, `Validation Rules`, and `Description`.' },
            { key: 'error_handling', title: '6. Error Handling and System Messages', description: 'How the system should respond to errors and what messages to display.', promptInjection: 'Create a table with columns for `Error Condition`, `System Action`, and `User Message`. Detail how the system should handle common validation errors, system failures, and other exceptions, and specify the exact messages to be displayed to the user.' },
        ]
    },
    {
        id: 'sdd.v1',
        title: 'Solution Design Document (SDD)',
        description: 'Details the technical design and implementation plan for an RPA automation solution.',
        artifactKey: 'pdd',
        sections: [
            { key: 'distribution_list', title: 'Distribution List', description: 'List of stakeholders who will receive this document.', promptInjection: 'Create a markdown table for the document\'s distribution list with columns for Name, Role, and Email.' },
            { key: 'sign_off', title: 'Sign Off', description: 'Table for key stakeholders to sign off on the design.', promptInjection: 'Create a markdown table for project sign-off with columns for Name, Role, Signature, and Date.' },
            { key: 'development_team', title: 'Development Team', description: 'List of the developers and architects on the project.', promptInjection: 'Create a markdown table listing the development team members with columns for Name and Role (e.g., RPA Developer, Solution Architect).' },
            { key: 'process_metrics', title: '2.1 Process Metrics', description: 'Key performance indicators for the process before and after automation.', promptInjection: 'Create a markdown table of key process metrics. Include columns for Metric, Current Value (As-Is), and Target Value (To-Be). Examples: "Average Handling Time", "Error Rate", "Throughput".' },
            { key: 'process_overview', title: '2.2 Process Overview', description: 'A high-level summary of the business process being automated.', promptInjection: 'Provide a brief, high-level paragraph summarizing the business process being automated. Describe the main activities and the overall outcome.' },
            { key: 'applications_used', title: '2.3 Applications Used', description: 'A list of all software applications involved in the process.', promptInjection: 'Create a markdown table listing all applications involved in the process. Include columns for Application Name & Version, and its Role in the process.' },
            { key: 'scope_of_rpa', title: '2.4 Scope Of RPA', description: 'Defines exactly which parts of the process will be automated.', promptInjection: 'Create a clear, bulleted list of all process steps and activities that are IN SCOPE for this automation.' },
            { key: 'out_of_scope', title: '2.5 Out of Scope', description: 'Defines which parts of the process will remain manual or are otherwise excluded.', promptInjection: 'Create a clear, bulleted list of all process steps and activities that are explicitly OUT OF SCOPE for this automation.' },
            { key: 'as_is_process', title: '2.6 AS IS Process', description: 'A detailed, step-by-step description of the current manual process.', promptInjection: 'Provide a detailed, numbered list describing the current "As-Is" manual process steps. This should be granular enough for a developer to replicate the manual work.' },
            { key: 'input_data_desc', title: 'Input Data Description', description: 'Details about the data that triggers and is used by the process.', promptInjection: 'Describe the input data for the automated process. Specify the format (e.g., PDF, Excel), source (e.g., email attachment), and key data fields to be extracted.' },
            { key: 'to_be_process', title: 'To Be Process', description: 'A detailed, step-by-step description of the future automated process.', promptInjection: 'Provide a detailed, numbered list describing the future "To-Be" automated process flow. Clearly distinguish between steps performed by the bot and any remaining manual steps.' },
            { key: 'dev_prerequisites', title: 'Development Prerequisites', description: 'Technical and environmental requirements needed before and during development.', promptInjection: 'List the technical and environmental prerequisites for development. Include items like "Robot access to all required applications", "Availability of test environments and data", and "Credentials for service accounts".' },
            { key: 'known_biz_exceptions', title: 'Known Business Exceptions', description: 'How the bot will handle predictable business rule violations.', promptInjection: 'Create a markdown table for handling known business exceptions. Include columns for `Exception Scenario`, `Trigger`, and `Bot\\\'s Action`. Example: Scenario: "Invoice total mismatch", Trigger: "Calculated total != invoice total", Action: "Flag item for manual review".' },
            { key: 'app_error_handling_strategy', title: 'Applications Errors & Exceptions Handling Strategy', description: 'The general strategy for how the bot will recover from application failures.', promptInjection: 'Describe the general strategy for how the bot should handle application errors (e.g., crashes, unresponsiveness). Outline the retry logic, recovery steps, and escalation procedure.' },
            { key: 'known_app_errors', title: 'Known Applications Errors and Exceptions', description: 'Specific plans for predictable application errors and how the bot should respond.', promptInjection: 'Create a markdown table for handling specific, known application errors. Include columns for `Application`, `Error Scenario`, and `Bot\\\'s Action`. Example: Application: "SAP", Scenario: "Login screen not found", Action: "Retry login 3 times; if fails, terminate process and notify support".' },
            { key: 'reporting_reqs', title: 'Reporting', description: 'Specifies the data and metrics the bot should log for monitoring and auditing.', promptInjection: 'Specify the reporting and logging requirements for the automation. Detail what information should be captured in success logs, transaction logs, and error logs for monitoring and auditing purposes.' },
            { key: 'testing_plan', title: 'UAT & Production Testing', description: 'The plan for testing the automation before and after deployment.', promptInjection: 'Outline the plan for User Acceptance Testing (UAT) and post-deployment production testing. Describe the scope of testing, key scenarios to be tested, and the criteria for successful completion.' },
            { key: 'assumptions', title: 'Assumptions', description: 'A list of business and technical assumptions made during the design phase.', promptInjection: 'List all key business and technical assumptions made during the design of this automation solution. These are conditions that are assumed to be true for the solution to work as designed.' }
        ]
    },
    {
        id: 'add.v1',
        title: 'Agent Design Document (ADD)',
        description: 'Defines and structures an intelligent agent, outlining its functionality, boundaries, interactions, and dependencies for an agentic automation solution.',
        artifactKey: 'pdd',
        sections: [
            { 
                key: 'intro_purpose', 
                title: '1.1 Purpose of the Document', 
                description: 'Define the role of the Agent Definition Document (ADD) as the primary blueprint for the intelligent agent.',
                promptInjection: 'Explain that the Agent Definition Document (ADD) serves as a blueprint for defining and structuring an intelligent agent. Clarify that it outlines the agent\'s functionality, boundaries, and dependencies to ensure it meets business objectives while maintaining efficiency, security, and scalability. Mention it is a communication document between the Business Analyst, SME/Process Owner, and the Development Team.'
            },
            { 
                key: 'intro_success_criteria', 
                title: '1.2 Success Criteria', 
                description: 'List the measurable business objectives and benefits expected from the agent\'s implementation.',
                promptInjection: 'List the business objectives and benefits expected after the agent is implemented. Use a bulleted list. Examples: "Reduce manual workload by automating repetitive tasks", "Improve process speed and accuracy by minimizing human errors", "Enhance data-driven decision-making through AI-based analysis".'
            },
            { 
                key: 'intro_prerequisites', 
                title: '1.3 Minimum Prerequisites', 
                description: 'Itemize all technical and business prerequisites required before agent implementation can begin.',
                promptInjection: 'Create a markdown table listing the minimum prerequisites for the agent implementation. Include columns for Category (e.g., Access, Sign-off, Test Data), Description/Assumption, and Owner (e.g., IT, BA, SME). Populate with critical items like system access, SME sign-off, and availability of test data.'
            },
            { 
                key: 'agent_desc_metrics', 
                title: '2.1 Process Metrics', 
                description: 'Detail the key metrics of the existing process before automation to establish a baseline.',
                promptInjection: 'Create a markdown table to document the metrics of the existing process before automation. Include rows for: High-level description, Frequency, No. of processed items, Average handling time per transaction (AHT), Total no. of FTEs, Error rates, and Pain points.'
            },
            { 
                key: 'agent_desc_story', 
                title: '2.2 Agent Story', 
                description: 'A high-level narrative describing the agent\'s role, context, objective, and interactions.',
                promptInjection: 'Write a high-level agent story using the following template: "As an [Agent Role], Operating in [Context/Environment], I want to [Objective] by [Actions/Behaviors], interacting with [Users/Systems/Agents] so that [Desired Outcome/Benefit]. Human intervention is needed for [escalations]. The impact of an incorrect answer is [risks]. Success is measured by [Success Criteria]."'
            },
            { 
                key: 'agent_desc_flow_diagram', 
                title: '2.3 Business Flow Diagram', 
                description: 'A visual representation of the business process the agent will operate within.',
                promptInjection: 'Generate Mermaid.js flowchart code for the "To-Be" business process flow that the agent will follow. This diagram should visualize the sequence of activities and decision points.'
            },
            { 
                key: 'agent_desc_functional_reqs', 
                title: '2.4.1 Functional Requirements', 
                description: 'A detailed, step-by-step list of all activities and actions the agent must perform.',
                promptInjection: 'Translate the business requirements into a numbered list of detailed functional requirements. Each item should describe a specific action or step the agent must take to fulfill the business process.'
            },
            { 
                key: 'agent_desc_non_functional_reqs', 
                title: '2.4.2 Non-Functional Requirements', 
                description: 'Define the operational parameters and quality attributes for the agent (e.g., performance, security, scalability).',
                promptInjection: 'Create a markdown table for Non-Functional Requirements (NFRs). Include columns for NFR #, Category, and Description. Populate with key NFRs such as Response Time, Accuracy, Security, Scalability, Audit Trail, and Resilience. Provide specific targets where possible (e.g., "minimum of 95% accuracy").'
            },
            { 
                key: 'agent_desc_reporting', 
                title: '2.5 Reporting', 
                description: 'Detail all business reporting requirements to track the agent\'s performance and outcomes.',
                promptInjection: 'Create a markdown table detailing the reporting requirements needed to track the solution\'s performance. Include columns for Field (e.g., Report Name, Purpose, Contents, Format, Frequency) and Description. If multiple reports are needed, specify this.'
            },
            { 
                key: 'agent_desc_triggers', 
                title: '2.6 Triggers', 
                description: 'Describe the events that will initiate the agent\'s execution.',
                promptInjection: 'Create a markdown table to list the triggers that will start the agent. Include columns for Name, Initiation Method (e.g., scheduled, user prompt, integration trigger), and Details.'
            },
            { 
                key: 'agent_solution_diagram', 
                title: '3.1 Agentic Solution Diagram', 
                description: 'A technical diagram showing the agent\'s architecture, components, and interactions with other systems.',
                promptInjection: 'Generate Mermaid.js diagram code (e.g., a flowchart or component diagram) that illustrates the agentic solution architecture. The diagram should show the agent, its internal components (e.g., prompt manager, tool executor), and how it interacts with external systems, tools, and users.'
            },
            { 
                key: 'agent_solution_system_prompts', 
                title: '3.2.1 System Prompts', 
                description: 'Define the core instructions and context that guide the agent\'s overall behavior and personality.',
                promptInjection: 'Provide the full text for the system prompt that will guide the agent\'s behavior. Include the objective, output format instructions, and any core principles the agent must follow.'
            },
            { 
                key: 'agent_solution_user_prompts', 
                title: '3.2.2 User Prompts', 
                description: 'Provide examples of typical user inputs or requests that the agent will handle.',
                promptInjection: 'List several examples of typical user prompts or inputs that the agent is expected to process. For each example, briefly describe the expected agent response or action.'
            },
            { 
                key: 'agent_solution_contexts', 
                title: '3.3 Contexts', 
                description: 'List the data sources and information used to ground the prompts and guide the agent\'s responses.',
                promptInjection: 'Create a markdown table listing the contexts used to ground the agent\'s prompts. Include columns for Name, Type (e.g., Document, Database, API), Description, and Usage (how it guides the generation).'
            },
            { 
                key: 'agent_solution_guardrails', 
                title: '3.4 Guardrails', 
                description: 'Define the mechanisms to control unexpected behavior and ensure escalations occur when needed.',
                promptInjection: 'Describe the guardrails and mechanisms that control the agent\'s behavior with tool calls. Define the specific conditions that will trigger human intervention or escalation. Mention techniques like prompt chaining if applicable.'
            },
            { 
                key: 'agent_solution_tools', 
                title: '3.5 Tools', 
                description: 'List all tools (e.g., RPA processes, APIs, sub-agents) the agent can use to perform actions.',
                promptInjection: 'Create a markdown table listing the tools the agent can use. Include columns for Tool Name, Type (e.g., RPA Process, API, Agent), Details, Max Retry Attempts, and Arguments.'
            },
            { 
                key: 'agent_solution_detailed_steps', 
                title: '3.6 Detailed Steps for Tools', 
                description: 'Describe the step-by-step actions of each tool the agent uses.',
                promptInjection: 'For each tool listed in the previous section, provide a detailed step-by-step description of its actions. For RPA tools, describe the UI interactions. For all tools, specify the triggering logic, the expected output, and any other relevant details.'
            },
            { 
                key: 'agent_solution_escalations', 
                title: '3.7 Escalations', 
                description: 'Define the process for escalating tasks to a human for validation or manual assistance.',
                promptInjection: 'Create a markdown table listing the escalation paths. Include columns for Escalation #, Type (e.g., Action Center Task), Assign To (Person/Team), and Details (when to escalate, what information to include, what response is expected).'
            },
            { 
                key: 'scope_in', 
                title: '4.1 In Scope', 
                description: 'A definitive list of all actions and functionalities that are included in the proposed solution.',
                promptInjection: 'Create a clear, bulleted list of all actions and functionalities that are explicitly IN SCOPE for the agent.'
            },
            { 
                key: 'scope_out', 
                title: '4.2 Out of Scope', 
                description: 'A list of actions and functionalities that are explicitly excluded, with reasoning.',
                promptInjection: 'Create a bulleted list of all actions and functionalities that are explicitly OUT OF SCOPE for the agent, providing a brief reason for each exclusion.'
            },
            { 
                key: 'scope_observations', 
                title: '4.3 Other Observations', 
                description: 'Note any pending topics, discussions, or potential future improvements that could impact the agent.',
                promptInjection: 'Add any observations, pending topics under discussion, or potential future improvements that could impact the automation of the to-be process.'
            },
        ]
    },
    {
        id: 'charter.v1',
        title: 'Project Charter',
        description: 'Formally authorizes the project and outlines its key objectives, stakeholders, scope, and high-level budget.',
        artifactKey: 'brd',
        sections: [
            { key: 'project_purpose', title: '1. Project Purpose & Justification', description: 'The "why" behind the project and the business problem it solves.', promptInjection: 'Clearly state the project\'s purpose and provide a compelling business justification. Explain why this project is important now.' },
            { key: 'objectives_success', title: '2. Measurable Objectives & Success Criteria', description: 'SMART goals for the project.', promptInjection: 'List 3-5 SMART (Specific, Measurable, Achievable, Relevant, Time-bound) objectives. Define the criteria that will be used to judge the success of the project.' },
            { key: 'high_level_requirements', title: '3. High-Level Requirements', description: 'Major features and functionalities.', promptInjection: 'List the major features and capabilities of the final product or service. This should be a high-level overview, not a detailed feature list.' },
            { key: 'scope_boundaries', title: '4. Scope & Boundaries', description: 'What is in and out of scope for this project.', promptInjection: 'Explicitly define the project boundaries. Use "In Scope" and "Out of Scope" sub-sections with bullet points for clarity.' },
            { key: 'stakeholders', title: '5. Key Stakeholders', description: 'List of key stakeholders and their roles.', promptInjection: 'Identify key stakeholders, including the project sponsor, project manager, and key team members or departments. Describe their roles and responsibilities in a table.' },
            { key: 'milestone_schedule', title: '6. High-Level Milestone Schedule', description: 'Major project phases and target completion dates.', promptInjection: 'Create a high-level timeline with major project phases (e.g., Initiation, Planning, Execution, Closure) and key milestones with target dates.' },
            { key: 'budget_summary', title: '7. Budget Summary', description: 'High-level cost estimates and funding sources.', promptInjection: 'Provide a high-level summary of the estimated project cost (e.g., capital, operational) and mention the source of funding. A detailed budget is not required here.' },
            { key: 'risks_assumptions', title: '8. Risks, Assumptions, and Constraints', description: 'Initial list of known risks and constraints.', promptInjection: 'Identify initial high-level risks, assumptions, and constraints that could impact the project. This is not a full risk assessment, but a preliminary list.' },
            { key: 'authorization', title: '9. Project Authorization', description: 'Sign-off from the project sponsor.', promptInjection: 'Create a sign-off table for the Project Sponsor with columns for Name, Title, Signature, and Date to formally authorize the project.' },
        ]
    },
    {
        id: 'tdd.v1',
        title: 'Technical Design Document (TDD)',
        description: 'Provides a detailed technical implementation plan for a specific feature or component.',
        artifactKey: 'frd',
        sections: [
            { key: 'introduction', title: '1. Introduction', description: 'Purpose, scope, and reference to the corresponding FRD.', promptInjection: 'Clearly state the purpose of this TDD and the specific feature/component it covers. Reference the relevant user story or FRD requirement ID.' },
            { key: 'tech_stack', title: '2. Technology Stack & Architecture', description: 'Overview of technologies and architectural context.', promptInjection: 'List the key technologies, frameworks, and libraries to be used. Briefly explain how the proposed solution fits into the existing system architecture.' },
            { key: 'detailed_design', title: '3. Detailed Design', description: 'Breakdown of components, classes, modules, and algorithms.', promptInjection: 'Provide a detailed breakdown of the implementation. Use subsections for each major component. Describe new classes, functions, algorithms, and data structures. Use Markdown for code blocks where appropriate. Generate Mermaid.js code for sequence or class diagrams where it helps clarify the design.' },
            { key: 'api_design', title: '4. API Endpoints (if applicable)', description: 'Specification for any new or modified APIs.', promptInjection: 'If the feature involves an API, create a table for each endpoint with columns for `HTTP Method`, `URI`, `Request Body/Params`, `Success Response (2xx)`, and `Error Response (4xx/5xx)`.' },
            { key: 'database_design', title: '5. Database Design', description: 'Schema modifications, new tables, or data migration plans.', promptInjection: 'List any required changes to the database schema. Provide DDL `CREATE TABLE` or `ALTER TABLE` statements for new or modified tables. If a data migration is needed, outline the steps.' },
            { key: 'security', title: '6. Security Considerations', description: 'Authentication, authorization, data protection, and threat modeling.', promptInjection: 'Detail the security measures for this feature. Cover authentication/authorization mechanisms, data encryption (at rest and in transit), and any potential threats or vulnerabilities with their mitigation strategies.' },
            { key: 'testing_strategy', title: '7. Testing Strategy', description: 'Unit, integration, and performance testing approach.', promptInjection: 'Describe the testing plan for this feature. Outline the approach for unit tests (key methods/classes to test), integration tests (interactions with other components), and any required performance or security testing.' },
            { key: 'deployment_plan', title: '8. Deployment & Rollback Plan', description: 'Steps for deploying the feature and rolling back if necessary.', promptInjection: 'Outline the step-by-step plan for deploying this change to production, including any configuration changes or dependencies. Provide a clear, step-by-step rollback plan in case of failure.' },
        ]
    }
];

export const INDUSTRY_PROFILES: IndustryProfile[] = [
    {
        id: 'profile.pharma',
        name: 'Pharmaceuticals',
        description: 'Compliance with GxP, HIPAA, and focus on patient safety.',
        nfr_overrides: ['regulatory:gxp', 'privacy:hipaa', 'security:soc2'],
        risk_taxonomy: ['patient_safety', 'data_integrity', 'compliance_findings'],
        policy_checks: ['icf_signed', 'lab_units_consistent']
    },
    {
        id: 'profile.banking',
        name: 'Banking & Finance',
        description: 'Focus on financial regulations, fraud detection, and transaction integrity.',
        nfr_overrides: ['regulatory:sox', 'privacy:glba', 'security:pci-dss'],
        risk_taxonomy: ['transaction_fraud', 'market_risk', 'credit_risk', 'regulatory_fines'],
        policy_checks: ['aml_check_completed', 'kyc_verification_passed']
    },
    {
        id: 'profile.manufacturing',
        name: 'Manufacturing',
        description: 'Emphasis on supply chain, inventory management, and operational efficiency.',
        nfr_overrides: ['availability:99.99%', 'performance:real-time_inventory'],
        risk_taxonomy: ['supply_chain_disruption', 'equipment_failure', 'quality_control_lapse'],
        policy_checks: ['safety_protocol_followed', 'inventory_levels_checked']
    }
];