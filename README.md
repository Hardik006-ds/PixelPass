# PIXELPASS

**Concert tickets that cannot be faked, copied, used twice or scalped, because every ticket lives on a blockchain.**

PIXELPASS is a college project that demonstrates how a blockchain protects event tickets. The website contains its own small blockchain that runs inside the browser:

- every action (create concert, buy, give, resell, check in) becomes a **block**
- every block has a **SHA-256 fingerprint** and stores the **previous block's fingerprint**, so the blocks form a chain
- new blocks are **mined** (proof of work: the fingerprint must start with `000`)
- the **rules** (like a smart contract) reject cheating before anything reaches the chain
- at the gate, ticket holders prove ownership with a real **digital signature** (secp256k1, the same curve Bitcoin and Ethereum use)

No crypto wallet, no MetaMask and no real money. Prices are in rupees (pretend money).

---

## How to run it (2 commands)

You need **Node.js 18 or newer**.

```bash
npm run setup
```

```bash
npm run demo
```

The website opens at **http://localhost:5173**. Keep the terminal open while presenting, and press `Ctrl+C` to stop.

Other commands:

| Command | What it does |
| --- | --- |
| `npm test` | Runs 28 tests on the blockchain simulation (prints PASS or FAIL for each) |
| `npm run build` | Builds the website for production |

Everything is saved in the browser, so a refresh keeps your data. Use **Reset demo data** on the Home page (or **Start over** in the guided demo) before presenting.

---

## How to present it (the easy way)

1. Open the website and press **Start guided demo**. A panel opens on the right.
2. Press **Run step 1**, read the **Say** line to the audience, then press **Run step 2**, and so on.
3. Each step switches to the right person, does the action and opens the right page, so the audience sees it happen.

The 10 steps (about 3 minutes):

| # | Step | What the audience sees |
| --- | --- | --- |
| 1 | The organizer creates a concert | A new concert appears and a green "Block added" note pops up |
| 2 | Fan 1 buys a VIP ticket | The ticket appears in Fan 1's tickets |
| 3 | Fan 1 gives the ticket to Fan 2 | The ticket is now in Fan 2's tickets |
| 4 | Fan 1 tries to get in anyway | Gate says **WRONG OWNER** (signature is from the wrong person) |
| 5 | Fan 2, the real owner, gets in | Gate says **VALID**, ticket marked used |
| 6 | Someone tries the same ticket again | Gate says **ALREADY USED** |
| 7 | A cheater edits a ticket | Fraud Lab: **TAMPERED** (fingerprint does not match) |
| 8 | A scalper tries to resell at 5x | Fraud Lab: **BLOCKED BY THE RULES** |
| 9 | Someone edits the blockchain itself | Blockchain page turns red: **CHAIN IS BROKEN** |
| 10 | The network repairs it | Blockchain page is green again: **CHAIN IS VALID** |

After the guided demo, if there is time, open the **Fraud Lab** and press **Try all 9 cheats**: every one is stopped.

---

## The website, page by page

At the top, **YOU ARE** shows who you are pretending to be. Click a name to switch: Organizer, Fan 1, Fan 2, Fan 3, Attacker or Gate Staff. Their wallet balance is shown next to it.

| Page | What it is for |
| --- | --- |
| **Home** | What the project solves, how it works in 4 steps, the people in the demo, and Reset demo data |
| **Concerts** | Buy tickets (GA, VIP, Front Row) and buy resale tickets from other fans |
| **My Tickets** | Your tickets, drawn as pixel tickets with a QR code. **Give to someone** or **Sell** (up to the resale limit) |
| **Entry Gate** | Gate Staff only. 3 steps: scan a ticket, choose who is holding the phone (they sign a random code), check with the blockchain, then **Let them in** |
| **Organizer** | Organizer only. Create a concert, see money received and tickets sold |
| **Blockchain** | Every block with its fingerprint, previous fingerprint and mining tries. **Tamper with this block** to break the chain, **Check the whole chain**, **Restore from the network**. Also lists rejected attempts |
| **Fraud Lab** | Edit a ticket copy and watch the fingerprint stop matching, plus 9 cheat buttons that really try to cheat |

---

## How it works (for beginners)

**1. Blocks and the chain.**
Every accepted action is written into a block. A block contains what happened, the time, the fingerprint (SHA-256 hash) of the previous block, and a number called the nonce. The block's own fingerprint is calculated from all of that. Because each block includes the previous block's fingerprint, the blocks are chained together.

**2. Why nobody can edit history.**
If someone changes an old block, its fingerprint changes. The next block still holds the old fingerprint, so the link breaks, and every block after it is now untrustworthy. In a real blockchain many computers keep a copy, so an edited copy is outvoted by the honest ones. The Blockchain page shows this with three computers.

**3. Mining.**
To add a block, the computer keeps changing the nonce until the fingerprint starts with `000`. This takes a few thousand tries ("mining tries" on each block). It makes rewriting history expensive.

**4. The rules (smart contract).**
Before an action becomes a block, the rules check it: only the organizer creates concerts, you need enough money, a sold-out tier cannot sell more, only the owner can give away or sell a ticket, resale cannot go above the limit, only gate staff can check tickets in, and a used ticket can never be used, moved or sold again. Rejected actions never reach the chain.

**5. The ticket fingerprint.**
When a ticket is created, its fingerprint is calculated from concert, ticket number, tier, seat and price, and stored on the chain. If anyone edits a copy of the ticket (for example GA to Front Row), the fingerprint no longer matches.

**6. Why a QR code alone is not enough.**
A QR code can be screenshotted. So at the gate, staff show a random code and the holder signs it with their **private key**. The gate checks the signature with the **owner's public key** from the blockchain. Only the real owner can make a signature that passes, and the code changes every scan, so old signatures and screenshots fail.

**7. The 5 gate checks.**
1. Ticket exists on the blockchain
2. Ticket details match the fingerprint
3. Holder's signature matches the owner
4. Ticket not used before
5. Concert is on

Result: **VALID**, **ALREADY USED**, **TAMPERED**, **FAKE** or **WRONG OWNER**.

---

## Project structure

```
pixelpass/
  package.json              helper scripts (setup, demo, test, build)
  README.md                 this file
  VIVA.md                   likely viva questions with short answers
  frontend/                 THE WEBSITE (this is what you present)
    src/lib/engine.js         the blockchain: blocks, mining, chain check, and the rules
    src/lib/crypto.js         SHA-256 fingerprints and digital signatures
    src/lib/verifier.js       the 5 gate checks
    src/lib/cheats.js         the Fraud Lab cheats
    src/lib/roles.js          the 6 people in the demo
    src/context/Store.jsx     app state, saved in the browser
    src/components/           pixel ticket, pixel poster, top bar, guided demo panel, notifications
    src/pages/                Home, Concerts, MyTickets, Gate, Organizer, Blockchain, FraudLab
    src/styles.css            the half-pixelated theme
    scripts/test-engine.mjs   28 tests for the simulation (npm test)
  contracts/                OPTIONAL: the same idea as a real Solidity smart contract
```

### Optional: the real Solidity version

The `contracts` folder holds the same ticket rules written as a real Ethereum smart contract (Solidity + Hardhat), with 47 automated tests and an end to end script. You do not need it to run or present the website, but it is useful if an examiner asks "how would this work on a real blockchain?"

```bash
npm run contracts:setup
```

```bash
npm run contracts:test
```

To run the story test against a local chain: `npm run contracts:chain` in one terminal, then `npm run contracts:deploy` and `npm run contracts:e2e` in another.

---

## Limitations

- The blockchain runs in one browser. A real one is copied across thousands of computers; here the "network" of 3 computers is a visual explanation.
- The private keys of the 6 demo people are built into the app so one presenter can play every role. Real users keep their own keys in a wallet app.
- Money is pretend rupees, not a real payment.
- Mining difficulty is tiny (`000`) so blocks are created instantly.
