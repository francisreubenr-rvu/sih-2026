# Security boundary

The delivered component is a static preparation website. It collects no submitted data, has no authentication/session store, contains no API key, and uses locally served assets. The preview binds to 127.0.0.1. No email or social messages were sent. No private social channels were accessed.

The eventual domain service must receive a separate threat model after the real problem is verified. Minimum tests: input type/length/range validation; request body bounds; parameterised SQL; encoded output; unauthenticated and cross-user record access; appropriate origin and CSRF controls; duplicate-write behavior; rate limiting; safe error bodies and logs; durable-data restore; dependency and secret scan. Data classification and retention must match the actual domain.

These are requirements, not passing test results. The static site cannot validate backend security. Public HTTPS deployment and response headers are not verified. See Docs/deployment-verification.md.
