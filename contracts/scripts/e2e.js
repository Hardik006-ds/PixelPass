// End to end story against the RUNNING local chain (npm run chain + npm run deploy first).
// Prints PASS or FAIL for every step and exits with code 1 if anything failed.
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

const GA = 0;
const VIP = 1;
const FRONT_ROW = 2;

let passed = 0;
let failed = 0;

function report(ok, label, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}

// Finds the revert data (hex) anywhere inside an error object.
function findRevertData(err, depth = 0) {
  if (!err || depth > 6 || typeof err !== "object") return null;
  if (typeof err.data === "string" && err.data.startsWith("0x") && err.data.length >= 10) return err.data;
  for (const key of ["data", "error", "info", "cause", "payload"]) {
    const found = findRevertData(err[key], depth + 1);
    if (found) return found;
  }
  return null;
}

// Gets the custom error name from a failed transaction.
function revertName(pass, err) {
  const data = findRevertData(err);
  if (data) {
    try {
      const parsed = pass.interface.parseError(data);
      if (parsed) return parsed.name;
    } catch (_) {
      // fall through to the message check
    }
  }
  const m = /custom error '(\w+)\(/.exec(err?.message || "");
  if (m) return m[1];
  return err?.shortMessage || err?.message || "unknown";
}

// Runs a transaction that MUST revert and checks the custom error name.
async function expectRevert(pass, label, fn, expectedError) {
  try {
    const tx = await fn();
    await tx.wait();
    report(false, label, "transaction unexpectedly succeeded");
  } catch (err) {
    const name = revertName(pass, err);
    report(!expectedError || name === expectedError, label, `blocked: ${name}`);
  }
}

async function main() {
  const jsonPath = path.join(__dirname, "..", "deployment.json");
  if (!fs.existsSync(jsonPath)) throw new Error("deployment.json not found. Run npm run deploy first.");
  const { address, abi } = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

  const signers = await ethers.getSigners();
  const [organizer, fan1, fan2, fan3, attacker] = signers;
  const staff = signers[6];

  const code = await ethers.provider.getCode(address);
  if (code === "0x") throw new Error(`No contract at ${address}. Did the chain restart? Run npm run deploy.`);
  const pass = new ethers.Contract(address, abi, organizer);

  console.log("\n== PIXELPASS END TO END STORY ==\n");

  // 1. Create concert
  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const prices = [ethers.parseEther("0.01"), ethers.parseEther("0.02"), ethers.parseEther("0.05")];
  const before = await pass.getConcertCount();
  await (await pass.createConcert("E2E Story Night", "The Test Vectors", "Localhost Arena", now + 7 * 86400, prices, [10, 5, 2], 110)).wait();
  const concertId = before;
  const c = await pass.getConcert(concertId);
  report(c.name === "E2E Story Night" && c.active, "Organizer creates a concert", `id ${concertId}`);

  // 2. Fan 1 buys a ticket
  const buyTx = await pass.connect(fan1).buyTicket(concertId, VIP, { value: prices[VIP] });
  const receipt = await buyTx.wait();
  const minted = receipt.logs
    .map((l) => {
      try {
        return pass.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((e) => e && e.name === "TicketMinted");
  const tokenId = minted.args.tokenId;
  report((await pass.ownerOf(tokenId)) === fan1.address, "Fan 1 buys a VIP ticket", `token ${tokenId}`);

  const t = await pass.getTicket(tokenId);
  report(
    await pass.verifyTicketData(tokenId, concertId, t.tier, t.seatNumber, t.originalPrice),
    "Real ticket data matches the on-chain hash"
  );

  // 3. Transfer to Fan 2
  await (await pass.connect(fan1).transferFrom(fan1.address, fan2.address, tokenId)).wait();
  report((await pass.ownerOf(tokenId)) === fan2.address, "Fan 1 transfers the ticket to Fan 2");

  // 4. Fan 1 can no longer use it
  const challenge = ethers.hexlify(ethers.randomBytes(8));
  const message = `PIXELPASS|${address}|${tokenId}|${challenge}`;
  const fan1Sig = await fan1.signMessage(message);
  const fan1Recovered = ethers.verifyMessage(message, fan1Sig);
  report(
    fan1Recovered !== (await pass.ownerOf(tokenId)),
    "Fan 1 signature does NOT match the on-chain owner (entry refused)"
  );
  await expectRevert(
    pass,
    "Fan 1 cannot transfer the ticket again",
    () => pass.connect(fan1).transferFrom(fan2.address, fan3.address, tokenId),
    "ERC721InsufficientApproval"
  );
  await expectRevert(pass, "Fan 1 cannot mark the ticket used", () => pass.connect(fan1).markUsed(tokenId), "NotGateStaff");

  // 5. Staff verifies Fan 2 and lets them in
  const fan2Sig = await fan2.signMessage(message);
  report(
    ethers.verifyMessage(message, fan2Sig) === (await pass.ownerOf(tokenId)),
    "Staff verifies Fan 2 signature against the on-chain owner"
  );
  const valid = await pass.isValid(tokenId);
  report(valid.exists && !valid.used, "Ticket exists and is not used yet");
  await (await pass.connect(staff).markUsed(tokenId)).wait();
  report((await pass.getTicket(tokenId)).used === true, "Gate staff marks the ticket used");

  // 6. Second use fails, used ticket frozen
  await expectRevert(pass, "Second check-in is rejected", () => pass.connect(staff).markUsed(tokenId), "TicketAlreadyUsed");
  await expectRevert(
    pass,
    "Used ticket cannot be transferred",
    () => pass.connect(fan2).transferFrom(fan2.address, fan3.address, tokenId),
    "TicketAlreadyUsed"
  );

  // 7. Tamper test
  const tampered = await pass.verifyTicketData(tokenId, concertId, FRONT_ROW, t.seatNumber, t.originalPrice);
  report(tampered === false, "Tampered ticket (tier changed to FRONT_ROW) fails verifyTicketData");
  const fakeSeat = await pass.verifyTicketData(tokenId, concertId, t.tier, t.seatNumber + 1n, t.originalPrice);
  report(fakeSeat === false, "Tampered ticket (seat changed) fails verifyTicketData");
  const fake = await pass.verifyTicketData(999999, concertId, t.tier, t.seatNumber, t.originalPrice);
  report(fake === false, "Fake token id fails verifyTicketData");

  // 8. Resale cap enforced
  await (await pass.connect(fan3).buyTicket(concertId, GA, { value: prices[GA] })).wait();
  const ids = await pass.getTicketsOf(fan3.address);
  const resaleId = ids[ids.length - 1];
  const cap = await pass.resaleCap(resaleId);
  await expectRevert(
    pass,
    "Listing above the resale cap is rejected",
    () => pass.connect(fan3).listForResale(resaleId, cap + 1n),
    "PriceAboveResaleCap"
  );
  await (await pass.connect(fan3).listForResale(resaleId, cap)).wait();
  report((await pass.getListing(resaleId)).active, "Listing exactly at the cap is accepted", `${ethers.formatEther(cap)} ETH`);
  const balBefore = await pass.pendingWithdrawals(fan3.address);
  await (await pass.connect(fan1).buyResale(resaleId, { value: cap })).wait();
  report(
    (await pass.ownerOf(resaleId)) === fan1.address &&
      (await pass.pendingWithdrawals(fan3.address)) - balBefore === cap,
    "Resale sale moves the ticket and credits the seller balance"
  );

  // 9. Extra attacks
  await expectRevert(pass, "Attacker cannot withdraw", () => pass.connect(attacker).withdraw(), "NothingToWithdraw");
  await expectRevert(
    pass,
    "Wrong payment is rejected",
    () => pass.connect(fan1).buyTicket(concertId, GA, { value: 1n }),
    "WrongPayment"
  );

  console.log(`\n== E2E RESULT: ${passed} passed, ${failed} failed ==`);
  console.log(failed === 0 ? "ALL STEPS PASS\n" : "SOME STEPS FAILED\n");
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("FAIL  e2e crashed:", err.shortMessage || err.message);
  process.exitCode = 1;
});
