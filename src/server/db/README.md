# Database boundary

This directory owns the server-only Prisma client and future repository modules. Route handlers and domain services should depend on repositories or explicit transactions from this boundary rather than importing Prisma throughout the application.

The database is authoritative for account balances, orders, fills, positions, trades, challenge state, risk snapshots, violations, watchlists, chart layouts, and audit records. Monetary values are represented as Prisma Decimal values and must not be converted to JavaScript floating point for domain calculations.
