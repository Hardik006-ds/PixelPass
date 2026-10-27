# PIXELPASS viva questions

Short, beginner-friendly answers to the questions an examiner is most likely to ask.

---

### 1. Why use a blockchain instead of a normal database?

With a normal database, whoever runs the server can change or delete records, and fans must trust them. On a blockchain every change is stored in blocks linked by fingerprints and copied on many computers, so nobody can quietly rewrite who owns a ticket or whether it was used. The rules are also fixed in code, so even the organizer cannot sell more seats than exist.

### 2. Is this a real blockchain?

The website runs a small blockchain inside the browser to demonstrate the concept clearly. The important parts are real: SHA-256 fingerprints, blocks linked by the previous block's hash, proof-of-work mining, rules checked before a block is added, and secp256k1 digital signatures (the same as Bitcoin and Ethereum). What is simplified is the network: one browser instead of thousands of computers. The `contracts` folder has the same rules written as a real Ethereum smart contract in Solidity, with 47 tests.

### 3. What is a block, and what makes it a "chain"?

A block stores what happened, the time, a nonce, and the fingerprint (hash) of the previous block. Its own fingerprint is calculated from all of that. Because every block contains the previous block's fingerprint, they are linked like a chain. The Blockchain page shows each block with "Fingerprint" and "Previous".

### 4. What happens if someone edits an old block?

Its fingerprint changes, so the next block's "Previous" no longer matches, and the chain is broken from that point. Other computers still have the honest copy, so the edited copy is outvoted and rejected. You can demonstrate this with "Tamper with this block" and then "Restore from the network".

### 5. What is mining (proof of work)?

To add a block, the computer keeps changing a number (the nonce) until the block's fingerprint starts with "000". It takes thousands of attempts. This makes rewriting history expensive: an attacker would have to redo the mining for the edited block and every block after it, faster than everyone else.

### 6. What does the ticket fingerprint do?

When a ticket is created, a SHA-256 fingerprint of its concert, ticket number, tier, seat and price is stored on the blockchain. If anyone edits a copy of the ticket (for example changes GA to Front Row), the new fingerprint is completely different and the gate says TAMPERED. The Fraud Lab's "Edit a ticket copy" shows this live.

### 7. Why is the QR code alone not enough?

A QR code is just a picture, so anyone can screenshot it and share it. At the gate the holder must also sign a random code with their private key. Only the real owner has that key, so a screenshot thief gets WRONG OWNER.

### 8. What are private keys, public keys and digital signatures?

Each person has a private key (secret) and a public key (shared). Signing a message with the private key produces a signature. Anyone can check the signature with the public key, but nobody can create a valid signature without the private key. The gate checks the signature against the owner's public key recorded on the blockchain.

### 9. Why does the gate use a new random code every time?

So an old signature cannot be reused. A signature is tied to the exact message it signed, which includes the random code. If the code changes, the old signature no longer matches. Our tests check this ("Re-using an old signature fails").

### 10. How do you stop a ticket being used twice, or sold after use?

When gate staff let someone in, a "check in" block marks the ticket as used. The rules then refuse any second check in, any transfer and any resale of that ticket, and the gate shows ALREADY USED. Only gate staff are allowed to check tickets in.

### 11. What does the resale limit prove?

Business rules can be enforced by code instead of trust. Each concert has a resale limit (for example 110% of the price). Any attempt to list a ticket above it is rejected before it reaches the blockchain, so scalpers cannot charge 5 times the price.

### 12. What are the limitations?

- The blockchain runs in one browser; the network of 3 computers is a visual explanation, not real networking.
- All 6 demo people's keys are built into the app so one presenter can play every role; real users would keep their keys in a wallet.
- Money is pretend rupees, not real payments.
- Mining difficulty is very low so the demo is instant.
- On a real public blockchain every action costs a small fee (gas), and data is public, so no personal details should be stored on chain.
