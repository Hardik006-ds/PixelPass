// Deploys PixelPass to the running local chain, seeds demo data and
// writes the address + ABI to contracts/deployment.json.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;

const GA = 0;
const VIP = 1;
const FRONT_ROW = 2;
const DAY = 24 * 3600;

const ROLE_NAMES = {
  0: "Organizer",
  1: "Fan 1",
  2: "Fan 2",
  3: "Fan 3",
  4: "Attacker",
  6: "Gate Staff",
};

async function main() {
  const signers = await ethers.getSigners();
  const [organizer, fan1, fan2, fan3] = signers;
  const staff = signers[6];

  console.log("\n== PIXELPASS DEPLOY ==");
  console.log(`Network: ${hre.network.name}`);

  const PixelPass = await ethers.getContractFactory("PixelPass", organizer);
  const pass = await PixelPass.deploy();
  await pass.waitForDeployment();
  const address = await pass.getAddress();
  const deployBlock = (await pass.deploymentTransaction().wait()).blockNumber;
  console.log(`PixelPass deployed at ${address} (block ${deployBlock})`);

  // Use chain time, not the computer clock, so dates are always in the future.
  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const p = (x) => ethers.parseEther(x);

  const concerts = [
    {
      name: "Neon Skyline Tour",
      artist: "The Voltage Hearts",
      venue: "Arcadia Dome, Sector 7",
      date: now + 21 * DAY,
      prices: [p("0.05"), p("0.12"), p("0.3")],
      caps: [120, 40, 10],
      cap: 110,
    },
    {
      name: "Midnight Cartridge",
      artist: "Lo-Fi Lanterns",
      venue: "Pixel Pier Amphitheatre",
      date: now + 45 * DAY,
      prices: [p("0.04"), p("0.1"), p("0.25")],
      caps: [80, 20, 6],
      cap: 120,
    },
    {
      name: "Bitcrush Festival Night",
      artist: "DJ Kilobyte",
      venue: "The Circuit Hall",
      date: now + 75 * DAY,
      prices: [p("0.08"), p("0.2"), p("0.5")],
      caps: [50, 10, 1],
      cap: 110,
    },
  ];

  for (const c of concerts) {
    const tx = await pass.createConcert(c.name, c.artist, c.venue, c.date, c.prices, c.caps, c.cap);
    await tx.wait();
    console.log(`Created concert: ${c.name} by ${c.artist}`);
  }

  await (await pass.addGateStaff(staff.address)).wait();
  console.log(`Gate staff added: ${staff.address} (account 6)`);

  // Sample purchases so the UI is not empty on first load.
  const buy = async (signer, concertId, tier) => {
    const c = await pass.getConcert(concertId);
    const tx = await pass.connect(signer).buyTicket(concertId, tier, { value: c.tierPrices[tier] });
    await tx.wait();
  };
  await buy(fan1, 0, VIP); // token 1
  await buy(fan1, 1, GA); // token 2
  await buy(fan2, 0, GA); // token 3
  await buy(fan2, 2, GA); // token 4
  await buy(fan3, 2, FRONT_ROW); // token 5, makes Bitcrush FRONT_ROW sold out (capacity 1)
  console.log("Sample tickets bought for Fan 1, Fan 2 and Fan 3");

  // One resale listing so the market is not empty.
  const cap4 = await pass.resaleCap(4);
  await (await pass.connect(fan2).listForResale(4, cap4)).wait();
  console.log(`Fan 2 listed token 4 for resale at ${ethers.formatEther(cap4)} ETH (the cap)`);

  // Write address + ABI (used by scripts/e2e.js).
  const artifact = await hre.artifacts.readArtifact("PixelPass");
  const out = {
    address,
    chainId: 31337,
    deployBlock,
    deployedAt: new Date().toISOString(),
    abi: artifact.abi,
  };
  const outPath = path.join(__dirname, "..", "deployment.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${path.relative(process.cwd(), outPath)}`);

  console.log("\n== PRE-FUNDED HARDHAT ACCOUNTS (local test chain only) ==");
  for (let i = 0; i < 10; i++) {
    const bal = await ethers.provider.getBalance(signers[i].address);
    const role = ROLE_NAMES[i] ? ` <- ${ROLE_NAMES[i]}` : "";
    console.log(
      `  #${String(i).padEnd(2)} ${signers[i].address}  ${Number(ethers.formatEther(bal)).toFixed(3)} ETH${role}`
    );
  }
  console.log("\nDeploy complete. Run the story test with: npm run e2e\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
