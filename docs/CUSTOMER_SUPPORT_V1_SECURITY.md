# Customer Support V1 security summary

Customer support remains inside the existing Pasar UMKM authentication and authorization boundaries. User APIs require active marketplace sessions. Internal support APIs require explicit support permissions, with management operations marked sensitive so the existing admin step-up MFA policy is enforced. Support data is not cached and the feature does not introduce payment custody, wallet, escrow, or refund execution.
