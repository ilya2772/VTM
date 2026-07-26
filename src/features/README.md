# Feature modules

Each product capability owns its UI, client-side state and feature-specific orchestration in a dedicated folder under `src/features`. Feature code may import shared contracts and utilities, but features must not reach into another feature's private modules.
