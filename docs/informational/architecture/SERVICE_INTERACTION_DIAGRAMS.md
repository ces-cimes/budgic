# Service Interaction Diagrams

## Overview
This document contains Mermaid diagrams showing the interactions between different services in the Budgic application.

## Service Dependency Graph

```mermaid
graph TD
    %% Core Services
    A[AccountService] --> DB[(Database)]
    T[TransactionService] --> DB
    T --> A
    T --> CRS[CrossRouteSyncService]
    
    B[BudgetService] --> DB
    B --> T
    
    G[GoalService] --> DB
    G --> CRS
    
    U[UserService] --> DB
    
    %% Analytics Services
    AS[AnalyticsService] --> DB
    AS --> T
    AS --> B
    
    IS[InsightsService] --> DB
    IS --> AS
    IS --> G
    IS --> B
    
    CRS --> IS
    CRS --> G
    CRS --> T
    CRS --> B
    
    %% Page Services
    ANS[AnalyzeService] --> AS
    ANS --> T
    ANS --> IS
    
    GS[GoalsService] --> G
    GS --> AS
    
    PS[PlanService] --> A
    PS --> T
    PS --> B
    PS --> CRS
    
    %% Styling
    classDef coreService fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef analyticsService fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef pageService fill:#e8f5e8,stroke:#1b5e20,stroke-width:2px
    classDef database fill:#fff3e0,stroke:#e65100,stroke-width:3px
    
    class A,T,B,G,U coreService
    class AS,IS,CRS analyticsService
    class ANS,GS,PS pageService
    class DB database
```

## Data Flow Diagram

```mermaid
sequenceDiagram
    participant UI as User Interface
    participant PS as Page Service
    participant CS as Core Service
    participant CRS as CrossRouteSyncService
    participant IS as InsightsService
    participant DB as Database
    
    UI->>PS: User Action
    PS->>CS: Process Request
    CS->>DB: Validate & Store Data
    DB-->>CS: Return Result
    CS->>CRS: Emit Sync Event
    CRS->>IS: Generate Insights
    IS->>DB: Store Insights
    CRS-->>PS: Sync Complete
    PS-->>UI: Update UI State
```

## Transaction Processing Flow

```mermaid
flowchart TD
    Start([User Creates Transaction]) --> Validate{Validate Data}
    Validate -->|Invalid| Error[Return Error]
    Validate -->|Valid| Create[Create Transaction]
    Create --> UpdateAccount[Update Account Balance]
    UpdateAccount --> EmitSync[Emit Sync Event]
    EmitSync --> GenerateInsights[Generate Insights]
    GenerateInsights --> UpdateUI[Update UI Components]
    UpdateUI --> End([Transaction Complete])
    
    Error --> End
```

## Cross-Route Synchronization Flow

```mermaid
sequenceDiagram
    participant S1 as Service 1
    participant CRS as CrossRouteSyncService
    participant S2 as Service 2
    participant S3 as Service 3
    participant IS as InsightsService
    
    S1->>CRS: Emit Event
    CRS->>CRS: Process Event
    CRS->>S2: Update Related Data
    CRS->>S3: Update Related Data
    CRS->>IS: Generate Cross-Route Insights
    IS->>CRS: Insights Created
    CRS->>S1: Sync Complete
    CRS->>S2: Sync Complete
    CRS->>S3: Sync Complete
```

## Service Categories Overview

```mermaid
graph LR
    subgraph "Core Services"
        A[AccountService]
        T[TransactionService]
        B[BudgetService]
        G[GoalService]
        U[UserService]
    end
    
    subgraph "Analytics Services"
        AS[AnalyticsService]
        IS[InsightsService]
        CRS[CrossRouteSyncService]
    end
    
    subgraph "Page Services"
        ANS[AnalyzeService]
        GS[GoalsService]
        PS[PlanService]
    end
    
    subgraph "External"
        DB[(Database)]
        UI[User Interface]
    end
    
    %% Connections
    A --> DB
    T --> DB
    B --> DB
    G --> DB
    U --> DB
    
    AS --> DB
    IS --> DB
    CRS --> DB
    
    ANS --> AS
    GS --> G
    PS --> A
    
    UI --> ANS
    UI --> GS
    UI --> PS
```

## Error Handling Flow

```mermaid
flowchart TD
    Start([Service Method Called]) --> Validate{Input Validation}
    Validate -->|Zod Error| ValidationError[Throw ValidationError]
    Validate -->|Valid| Process[Process Request]
    Process --> DBQuery{Database Operation}
    DBQuery -->|Success| Success[Return Success]
    DBQuery -->|Error| DBError[Log Error & Throw ServiceError]
    ValidationError --> ErrorHandler[Error Handler]
    DBError --> ErrorHandler
    ErrorHandler --> ClientError[Return Client Error]
    Success --> End([Method Complete])
    ClientError --> End
```

## Service Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Initializing
    Initializing --> Ready
    Ready --> Processing
    Processing --> Ready
    Processing --> Error
    Error --> Ready
    Ready --> Stopping
    Stopping --> [*]
    
    note right of Initializing
        Services initialize database connections
        and set up event listeners
    end note
    
    note right of Ready
        Services are ready to handle requests
        and process operations
    end note
    
    note right of Processing
        Services are actively processing
        requests and updating data
    end note
    
    note right of Error
        Services handle errors gracefully
        and attempt recovery
    end note
```

---

*These diagrams are automatically generated and should be updated when service architecture changes are made.*
