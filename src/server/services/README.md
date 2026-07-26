# Server service boundary

Domain services belong here as they are introduced: execution, risk, authentication, and market-data gateway services. Services validate commands on the server, use explicit Prisma transactions where state changes span multiple records, and never trust browser-provided balance, PnL, price, or risk metrics.
