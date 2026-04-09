# License Decision

## Current Status

A provisional **MIT License** has been placed in `LICENSE`. This is the most common permissive open-source license and imposes minimal restrictions on downstream use.

## Why MIT Was Chosen Provisionally

- All application code in this repo appears to be original work by the project authors.
- Dependencies (Strapi, React, Express, Prisma, ethers.js, etc.) are all MIT or similarly permissive-licensed.
- MIT is widely understood, GitHub-friendly, and does not require downstream projects to disclose source.
- No GPL or copyleft dependencies were detected that would force a copyleft license.

## Uncertainties To Resolve Before Finalizing

1. **Copyright holder**: The LICENSE currently says "PromptTrading Contributors." If the code was written under an employer or organization, the copyright holder should be updated accordingly.
2. **Contributor License Agreement (CLA)**: If external contributions are expected, decide whether a CLA is needed.
3. **Third-party code**: Verify no code was copied from sources with incompatible licenses (e.g., proprietary SDKs, StackOverflow snippets under CC-BY-SA).
4. **Trademark**: If "PromptTrading" or related product names are trademarks, consider adding a trademark notice separate from the license.

## Alternatives Considered

| License | Pros | Cons |
|---------|------|------|
| **MIT** (current) | Simple, permissive, widely adopted | No patent grant, no copyleft protection |
| **Apache 2.0** | Explicit patent grant, contributor protection | Slightly more complex, incompatible with GPLv2 |
| **BSL 1.1** | Protects commercial use for a period | Not OSI-approved, may deter contributors |
| **AGPLv3** | Strong copyleft, network use covered | Very restrictive, deters commercial adoption |

## Recommendation

MIT is the safest default for a project seeking broad adoption and community contributions. Switch to Apache 2.0 if patent protection is a concern. Review and update the copyright holder before the first public release.
