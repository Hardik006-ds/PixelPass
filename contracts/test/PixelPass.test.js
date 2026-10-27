const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const GA = 0;
const VIP = 1;
const FRONT_ROW = 2;

const PRICES = [ethers.parseEther("0.05"), ethers.parseEther("0.12"), ethers.parseEther("0.3")];
const CAPS = [5n, 3n, 2n];

// Collected so we can print a readable summary after all tests.
const results = { passed: 0, failed: 0, failedTitles: [] };

describe("PixelPass", function () {
  afterEach(function () {
    if (this.currentTest.state === "passed") results.passed++;
    else if (this.currentTest.state === "failed") {
      results.failed++;
      results.failedTitles.push(this.currentTest.fullTitle());
    }
  });

  after(function () {
    const line = "=".repeat(60);
    console.log("\n" + line);
    console.log("  PIXELPASS CONTRACT TEST SUMMARY");
    console.log(line);
    console.log(`  Passed: ${results.passed}`);
    console.log(`  Failed: ${results.failed}`);
    for (const t of results.failedTitles) console.log(`   x ${t}`);
    console.log(results.failed === 0 ? "  RESULT: ALL TESTS PASSED" : "  RESULT: SOME TESTS FAILED");
    console.log(line + "\n");
  });

  async function deployFixture() {
    const [organizer, fan1, fan2, fan3, attacker, other, staff] = await ethers.getSigners();
    const PixelPass = await ethers.getContractFactory("PixelPass");
    const pass = await PixelPass.deploy();
    await pass.waitForDeployment();

    const date = (await time.latest()) + 30 * 24 * 3600;
    await pass.createConcert("Neon Skyline", "The Voltage Hearts", "Arcadia Dome", date, PRICES, CAPS, 110);
    await pass.addGateStaff(staff.address);

    return { pass, organizer, fan1, fan2, fan3, attacker, other, staff, date };
  }

  async function withTicketFixture() {
    const ctx = await deployFixture();
    await ctx.pass.connect(ctx.fan1).buyTicket(0, VIP, { value: PRICES[VIP] });
    return { ...ctx, tokenId: 1n };
  }

  describe("Concert creation", function () {
    it("owner can create a concert with 3 tiers", async function () {
      const { pass, organizer, date } = await loadFixture(deployFixture);
      expect(await pass.getConcertCount()).to.equal(1n);
      const c = await pass.getConcert(0);
      expect(c.name).to.equal("Neon Skyline");
      expect(c.artist).to.equal("The Voltage Hearts");
      expect(c.venue).to.equal("Arcadia Dome");
      expect(c.dateTime).to.equal(BigInt(date));
      expect(c.organizer).to.equal(organizer.address);
      expect(c.active).to.equal(true);
      expect(c.resaleCapPercent).to.equal(110n);
      expect([...c.tierPrices]).to.deep.equal(PRICES);
      expect([...c.tierCapacities]).to.deep.equal(CAPS);
      expect([...c.tierSold]).to.deep.equal([0n, 0n, 0n]);
    });

    it("emits ConcertCreated", async function () {
      const { pass } = await loadFixture(deployFixture);
      const date = (await time.latest()) + 1000;
      await expect(pass.createConcert("A", "B", "C", date, PRICES, CAPS, 0))
        .to.emit(pass, "ConcertCreated")
        .withArgs(1n, "A", "B", "C", BigInt(date), 110n);
    });

    it("resale cap 0 falls back to the default 110", async function () {
      const { pass } = await loadFixture(deployFixture);
      const date = (await time.latest()) + 1000;
      await pass.createConcert("A", "B", "C", date, PRICES, CAPS, 0);
      expect((await pass.getConcert(1)).resaleCapPercent).to.equal(110n);
    });

    it("non-owner cannot create a concert", async function () {
      const { pass, fan1 } = await loadFixture(deployFixture);
      const date = (await time.latest()) + 1000;
      await expect(pass.connect(fan1).createConcert("A", "B", "C", date, PRICES, CAPS, 110))
        .to.be.revertedWithCustomError(pass, "OwnableUnauthorizedAccount")
        .withArgs(fan1.address);
    });

    it("date in the past reverts", async function () {
      const { pass } = await loadFixture(deployFixture);
      const past = (await time.latest()) - 10;
      await expect(pass.createConcert("A", "B", "C", past, PRICES, CAPS, 110)).to.be.revertedWithCustomError(
        pass,
        "DateMustBeInFuture"
      );
    });

    it("zero capacity reverts", async function () {
      const { pass } = await loadFixture(deployFixture);
      const date = (await time.latest()) + 1000;
      await expect(pass.createConcert("A", "B", "C", date, PRICES, [5, 0, 2], 110)).to.be.revertedWithCustomError(
        pass,
        "InvalidCapacity"
      );
    });

    it("bad resale cap and empty text revert", async function () {
      const { pass } = await loadFixture(deployFixture);
      const date = (await time.latest()) + 1000;
      await expect(pass.createConcert("A", "B", "C", date, PRICES, CAPS, 90)).to.be.revertedWithCustomError(
        pass,
        "InvalidResaleCap"
      );
      await expect(pass.createConcert("", "B", "C", date, PRICES, CAPS, 110)).to.be.revertedWithCustomError(
        pass,
        "EmptyText"
      );
    });
  });

  describe("Buying tickets", function () {
    for (const [name, tier] of [
      ["GA", GA],
      ["VIP", VIP],
      ["FRONT_ROW", FRONT_ROW],
    ]) {
      it(`buys a ${name} ticket with the exact price`, async function () {
        const { pass, fan1 } = await loadFixture(deployFixture);
        await expect(pass.connect(fan1).buyTicket(0, tier, { value: PRICES[tier] }))
          .to.emit(pass, "TicketMinted")
          .and.to.emit(pass, "Transfer")
          .withArgs(ethers.ZeroAddress, fan1.address, 1n);
        expect(await pass.ownerOf(1)).to.equal(fan1.address);
        const t = await pass.getTicket(1);
        expect(t.tier).to.equal(BigInt(tier));
        expect(t.seatNumber).to.equal(1n);
        expect(t.originalPrice).to.equal(PRICES[tier]);
        expect(t.used).to.equal(false);
      });

      it(`rejects ${name} with too little or too much ETH`, async function () {
        const { pass, fan1 } = await loadFixture(deployFixture);
        await expect(pass.connect(fan1).buyTicket(0, tier, { value: PRICES[tier] - 1n }))
          .to.be.revertedWithCustomError(pass, "WrongPayment")
          .withArgs(PRICES[tier], PRICES[tier] - 1n);
        await expect(
          pass.connect(fan1).buyTicket(0, tier, { value: PRICES[tier] + 1n })
        ).to.be.revertedWithCustomError(pass, "WrongPayment");
        await expect(pass.connect(fan1).buyTicket(0, tier, { value: 0 })).to.be.revertedWithCustomError(
          pass,
          "WrongPayment"
        );
      });
    }

    it("invalid tier and unknown concert revert", async function () {
      const { pass, fan1 } = await loadFixture(deployFixture);
      await expect(pass.connect(fan1).buyTicket(0, 3, { value: PRICES[0] }))
        .to.be.revertedWithCustomError(pass, "InvalidTier")
        .withArgs(3);
      await expect(pass.connect(fan1).buyTicket(9, 0, { value: PRICES[0] }))
        .to.be.revertedWithCustomError(pass, "ConcertDoesNotExist")
        .withArgs(9);
    });

    it("sold-out tier reverts and never mints beyond capacity", async function () {
      const { pass, fan1, fan2 } = await loadFixture(deployFixture);
      await pass.connect(fan1).buyTicket(0, FRONT_ROW, { value: PRICES[FRONT_ROW] });
      await pass.connect(fan2).buyTicket(0, FRONT_ROW, { value: PRICES[FRONT_ROW] });
      await expect(pass.connect(fan1).buyTicket(0, FRONT_ROW, { value: PRICES[FRONT_ROW] }))
        .to.be.revertedWithCustomError(pass, "TierSoldOut")
        .withArgs(0, FRONT_ROW);
      const c = await pass.getConcert(0);
      expect(c.tierSold[FRONT_ROW]).to.equal(2n);
      expect(await pass.totalSupply()).to.equal(2n);
      // Other tiers are still on sale.
      await pass.connect(fan1).buyTicket(0, GA, { value: PRICES[GA] });
    });

    it("inactive or past concert cannot sell", async function () {
      const { pass, fan1, date } = await loadFixture(deployFixture);
      await pass.setConcertActive(0, false);
      await expect(pass.connect(fan1).buyTicket(0, GA, { value: PRICES[GA] })).to.be.revertedWithCustomError(
        pass,
        "ConcertNotActive"
      );
      await pass.setConcertActive(0, true);
      await time.increaseTo(date + 1);
      await expect(pass.connect(fan1).buyTicket(0, GA, { value: PRICES[GA] })).to.be.revertedWithCustomError(
        pass,
        "ConcertNotUpcoming"
      );
    });

    it("assigns unique sequential seat numbers per tier", async function () {
      const { pass, fan1, fan2, fan3 } = await loadFixture(deployFixture);
      const buyers = [fan1, fan2, fan3, fan1, fan2];
      for (const b of buyers) await pass.connect(b).buyTicket(0, GA, { value: PRICES[GA] });
      await pass.connect(fan3).buyTicket(0, VIP, { value: PRICES[VIP] });
      const seats = [];
      for (let id = 1; id <= 5; id++) seats.push((await pass.getTicket(id)).seatNumber);
      expect(seats).to.deep.equal([1n, 2n, 3n, 4n, 5n]);
      // VIP tier has its own counter.
      expect((await pass.getTicket(6)).seatNumber).to.equal(1n);
    });

    it("payment is held by the contract and credited to the organizer", async function () {
      const { pass, organizer, fan1 } = await loadFixture(deployFixture);
      await expect(pass.connect(fan1).buyTicket(0, VIP, { value: PRICES[VIP] })).to.changeEtherBalances(
        [fan1, pass, organizer],
        [-PRICES[VIP], PRICES[VIP], 0n]
      );
      expect(await pass.pendingWithdrawals(organizer.address)).to.equal(PRICES[VIP]);
    });
  });

  describe("Ticket hash", function () {
    it("stores keccak256(abi.encode(concertId, tokenId, tier, seat, price))", async function () {
      const { pass, tokenId } = await loadFixture(withTicketFixture);
      const t = await pass.getTicket(tokenId);
      const expected = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint256", "uint256", "uint8", "uint256", "uint256"],
          [0n, tokenId, VIP, 1n, PRICES[VIP]]
        )
      );
      expect(t.ticketHash).to.equal(expected);
      expect(await pass.computeHash(0, tokenId, VIP, 1, PRICES[VIP])).to.equal(expected);
    });

    it("verifyTicketData is true for the correct data", async function () {
      const { pass, tokenId } = await loadFixture(withTicketFixture);
      expect(await pass.verifyTicketData(tokenId, 0, VIP, 1, PRICES[VIP])).to.equal(true);
    });

    it("verifyTicketData is false when ANY single field changes", async function () {
      const { pass, fan1, tokenId } = await loadFixture(withTicketFixture);
      // A second real ticket so a changed token id still points at a real token.
      await pass.connect(fan1).buyTicket(0, GA, { value: PRICES[GA] });
      expect(await pass.verifyTicketData(2, 0, VIP, 1, PRICES[VIP])).to.equal(false); // tokenId
      expect(await pass.verifyTicketData(tokenId, 1, VIP, 1, PRICES[VIP])).to.equal(false); // concertId
      expect(await pass.verifyTicketData(tokenId, 0, FRONT_ROW, 1, PRICES[VIP])).to.equal(false); // tier
      expect(await pass.verifyTicketData(tokenId, 0, VIP, 2, PRICES[VIP])).to.equal(false); // seat
      expect(await pass.verifyTicketData(tokenId, 0, VIP, 1, PRICES[VIP] - 1n)).to.equal(false); // price
    });

    it("verifyTicketData is false for a token that does not exist", async function () {
      const { pass } = await loadFixture(withTicketFixture);
      expect(await pass.verifyTicketData(999, 0, VIP, 1, PRICES[VIP])).to.equal(false);
    });

    it("isValid reports exists, owner and used", async function () {
      const { pass, fan1, staff, tokenId } = await loadFixture(withTicketFixture);
      let v = await pass.isValid(tokenId);
      expect(v.exists).to.equal(true);
      expect(v.holder).to.equal(fan1.address);
      expect(v.used).to.equal(false);
      await pass.connect(staff).markUsed(tokenId);
      v = await pass.isValid(tokenId);
      expect(v.used).to.equal(true);
      v = await pass.isValid(777);
      expect(v.exists).to.equal(false);
      expect(v.holder).to.equal(ethers.ZeroAddress);
    });
  });

  describe("Transfers", function () {
    it("transfer changes ownership and getTicketsOf", async function () {
      const { pass, fan1, fan2, tokenId } = await loadFixture(withTicketFixture);
      await pass.connect(fan1).transferFrom(fan1.address, fan2.address, tokenId);
      expect(await pass.ownerOf(tokenId)).to.equal(fan2.address);
      expect(await pass.getTicketsOf(fan1.address)).to.deep.equal([]);
      expect(await pass.getTicketsOf(fan2.address)).to.deep.equal([tokenId]);
    });

    it("safeTransferFrom gifting works for unused tickets", async function () {
      const { pass, fan1, fan3, tokenId } = await loadFixture(withTicketFixture);
      await pass
        .connect(fan1)
        ["safeTransferFrom(address,address,uint256)"](fan1.address, fan3.address, tokenId);
      expect(await pass.ownerOf(tokenId)).to.equal(fan3.address);
    });

    it("previous owner cannot transfer or list after transfer", async function () {
      const { pass, fan1, fan2, fan3, tokenId } = await loadFixture(withTicketFixture);
      await pass.connect(fan1).transferFrom(fan1.address, fan2.address, tokenId);
      await expect(
        pass.connect(fan1).transferFrom(fan2.address, fan3.address, tokenId)
      ).to.be.revertedWithCustomError(pass, "ERC721InsufficientApproval");
      await expect(pass.connect(fan1).listForResale(tokenId, PRICES[VIP])).to.be.revertedWithCustomError(
        pass,
        "NotTicketOwner"
      );
    });

    it("previous owner is no longer the owner the gate checks against", async function () {
      const { pass, fan1, fan2, tokenId } = await loadFixture(withTicketFixture);
      await pass.connect(fan1).transferFrom(fan1.address, fan2.address, tokenId);
      // The gate checks that a signature recovers to ownerOf. Fan 1 signing now fails that check.
      const challenge = "abc123";
      const msg = `PIXELPASS|${await pass.getAddress()}|${tokenId}|${challenge}`;
      const sig = await fan1.signMessage(msg);
      const recovered = ethers.verifyMessage(msg, sig);
      expect(recovered).to.equal(fan1.address);
      expect(recovered).to.not.equal(await pass.ownerOf(tokenId));
    });

    it("previous owner cannot check in (markUsed is staff only)", async function () {
      const { pass, fan1, fan2, tokenId } = await loadFixture(withTicketFixture);
      await pass.connect(fan1).transferFrom(fan1.address, fan2.address, tokenId);
      await expect(pass.connect(fan1).markUsed(tokenId))
        .to.be.revertedWithCustomError(pass, "NotGateStaff")
        .withArgs(fan1.address);
    });

    it("non-owner cannot transfer someone else's ticket", async function () {
      const { pass, fan1, attacker, tokenId } = await loadFixture(withTicketFixture);
      await expect(
        pass.connect(attacker).transferFrom(fan1.address, attacker.address, tokenId)
      ).to.be.revertedWithCustomError(pass, "ERC721InsufficientApproval");
      expect(await pass.ownerOf(tokenId)).to.equal(fan1.address);
    });
  });

  describe("Gate check-in", function () {
    it("staff can mark a ticket used", async function () {
      const { pass, staff, tokenId } = await loadFixture(withTicketFixture);
      await expect(pass.connect(staff).markUsed(tokenId))
        .to.emit(pass, "TicketUsed")
        .withArgs(tokenId, 0n, staff.address);
      expect((await pass.getTicket(tokenId)).used).to.equal(true);
    });

    it("owner (organizer) can mark a ticket used", async function () {
      const { pass, tokenId } = await loadFixture(withTicketFixture);
      await pass.markUsed(tokenId);
      expect((await pass.getTicket(tokenId)).used).to.equal(true);
    });

    it("marking twice reverts", async function () {
      const { pass, staff, tokenId } = await loadFixture(withTicketFixture);
      await pass.connect(staff).markUsed(tokenId);
      await expect(pass.connect(staff).markUsed(tokenId))
        .to.be.revertedWithCustomError(pass, "TicketAlreadyUsed")
        .withArgs(tokenId);
    });

    it("normal fan cannot mark used", async function () {
      const { pass, fan1, tokenId } = await loadFixture(withTicketFixture);
      await expect(pass.connect(fan1).markUsed(tokenId)).to.be.revertedWithCustomError(pass, "NotGateStaff");
    });

    it("non-existent ticket and inactive concert revert", async function () {
      const { pass, staff, tokenId } = await loadFixture(withTicketFixture);
      await expect(pass.connect(staff).markUsed(42)).to.be.revertedWithCustomError(pass, "TicketDoesNotExist");
      await pass.setConcertActive(0, false);
      await expect(pass.connect(staff).markUsed(tokenId)).to.be.revertedWithCustomError(pass, "ConcertNotActive");
    });

    it("removed staff can no longer mark used", async function () {
      const { pass, staff, tokenId } = await loadFixture(withTicketFixture);
      await expect(pass.removeGateStaff(staff.address)).to.emit(pass, "GateStaffRemoved");
      await expect(pass.connect(staff).markUsed(tokenId)).to.be.revertedWithCustomError(pass, "NotGateStaff");
    });

    it("only owner manages staff", async function () {
      const { pass, attacker } = await loadFixture(deployFixture);
      await expect(pass.connect(attacker).addGateStaff(attacker.address)).to.be.revertedWithCustomError(
        pass,
        "OwnableUnauthorizedAccount"
      );
    });

    it("used ticket cannot be transferred", async function () {
      const { pass, fan1, fan2, staff, tokenId } = await loadFixture(withTicketFixture);
      await pass.connect(staff).markUsed(tokenId);
      await expect(pass.connect(fan1).transferFrom(fan1.address, fan2.address, tokenId))
        .to.be.revertedWithCustomError(pass, "TicketAlreadyUsed")
        .withArgs(tokenId);
      await expect(
        pass.connect(fan1)["safeTransferFrom(address,address,uint256)"](fan1.address, fan2.address, tokenId)
      ).to.be.revertedWithCustomError(pass, "TicketAlreadyUsed");
    });

    it("used ticket cannot be listed and an active listing is cleared on check-in", async function () {
      const { pass, fan1, staff, tokenId } = await loadFixture(withTicketFixture);
      await pass.connect(fan1).listForResale(tokenId, PRICES[VIP]);
      await expect(pass.connect(staff).markUsed(tokenId)).to.emit(pass, "ListingCancelled").withArgs(tokenId);
      expect((await pass.getListing(tokenId)).active).to.equal(false);
      await expect(pass.connect(fan1).listForResale(tokenId, PRICES[VIP])).to.be.revertedWithCustomError(
        pass,
        "TicketAlreadyUsed"
      );
    });
  });

  describe("Resale market", function () {
    it("listing above the cap reverts", async function () {
      const { pass, fan1, tokenId } = await loadFixture(withTicketFixture);
      const cap = (PRICES[VIP] * 110n) / 100n;
      expect(await pass.resaleCap(tokenId)).to.equal(cap);
      await expect(pass.connect(fan1).listForResale(tokenId, cap + 1n))
        .to.be.revertedWithCustomError(pass, "PriceAboveResaleCap")
        .withArgs(cap + 1n, cap);
    });

    it("only the owner can list", async function () {
      const { pass, attacker, tokenId } = await loadFixture(withTicketFixture);
      await expect(pass.connect(attacker).listForResale(tokenId, PRICES[VIP])).to.be.revertedWithCustomError(
        pass,
        "NotTicketOwner"
      );
    });

    it("resale at the cap works and pays the seller's balance", async function () {
      const { pass, fan1, fan2, tokenId } = await loadFixture(withTicketFixture);
      const cap = await pass.resaleCap(tokenId);
      await expect(pass.connect(fan1).listForResale(tokenId, cap))
        .to.emit(pass, "Listed")
        .withArgs(tokenId, fan1.address, cap);

      const [ids, sellers, prices] = await pass.getActiveListings();
      expect(ids).to.deep.equal([tokenId]);
      expect(sellers).to.deep.equal([fan1.address]);
      expect(prices).to.deep.equal([cap]);

      // No ETH is pushed to the seller during the sale.
      const saleTx = pass.connect(fan2).buyResale(tokenId, { value: cap });
      await expect(saleTx).to.changeEtherBalances([fan2, pass, fan1], [-cap, cap, 0n]);
      await expect(saleTx).to.emit(pass, "Sold").withArgs(tokenId, fan1.address, fan2.address, cap);

      expect(await pass.ownerOf(tokenId)).to.equal(fan2.address);
      expect(await pass.pendingWithdrawals(fan1.address)).to.equal(cap);
      expect((await pass.getListing(tokenId)).active).to.equal(false);

      // The seller pulls the money.
      await expect(pass.connect(fan1).withdraw()).to.changeEtherBalances([fan1, pass], [cap, -cap]);
    });

    it("buyResale with wrong payment, unlisted ticket or own listing reverts", async function () {
      const { pass, fan1, fan2, tokenId } = await loadFixture(withTicketFixture);
      await expect(pass.connect(fan2).buyResale(tokenId, { value: PRICES[VIP] })).to.be.revertedWithCustomError(
        pass,
        "NotListed"
      );
      await pass.connect(fan1).listForResale(tokenId, PRICES[VIP]);
      await expect(pass.connect(fan2).buyResale(tokenId, { value: 1n })).to.be.revertedWithCustomError(
        pass,
        "WrongPayment"
      );
      await expect(pass.connect(fan1).buyResale(tokenId, { value: PRICES[VIP] })).to.be.revertedWithCustomError(
        pass,
        "CannotBuyOwnListing"
      );
    });

    it("cancelListing works for the seller only", async function () {
      const { pass, fan1, attacker, tokenId } = await loadFixture(withTicketFixture);
      await pass.connect(fan1).listForResale(tokenId, PRICES[VIP]);
      await expect(pass.connect(attacker).cancelListing(tokenId)).to.be.revertedWithCustomError(
        pass,
        "NotTicketOwner"
      );
      await expect(pass.connect(fan1).cancelListing(tokenId)).to.emit(pass, "ListingCancelled");
      await expect(pass.connect(fan1).cancelListing(tokenId)).to.be.revertedWithCustomError(pass, "NotListed");
    });

    it("listing is cleared after a direct transfer", async function () {
      const { pass, fan1, fan2, fan3, tokenId } = await loadFixture(withTicketFixture);
      await pass.connect(fan1).listForResale(tokenId, PRICES[VIP]);
      await expect(pass.connect(fan1).transferFrom(fan1.address, fan2.address, tokenId))
        .to.emit(pass, "ListingCancelled")
        .withArgs(tokenId);
      expect((await pass.getListing(tokenId)).active).to.equal(false);
      // The stale listing cannot be bought.
      await expect(pass.connect(fan3).buyResale(tokenId, { value: PRICES[VIP] })).to.be.revertedWithCustomError(
        pass,
        "NotListed"
      );
      const [ids] = await pass.getActiveListings();
      expect(ids.length).to.equal(0);
    });
  });

  describe("Withdrawals", function () {
    it("organizer withdraws sales and cannot withdraw the same balance twice", async function () {
      const { pass, organizer, fan1, fan2 } = await loadFixture(deployFixture);
      await pass.connect(fan1).buyTicket(0, GA, { value: PRICES[GA] });
      await pass.connect(fan2).buyTicket(0, FRONT_ROW, { value: PRICES[FRONT_ROW] });
      const total = PRICES[GA] + PRICES[FRONT_ROW];
      const wTx = pass.connect(organizer).withdraw();
      await expect(wTx).to.changeEtherBalances([organizer, pass], [total, -total]);
      await expect(wTx).to.emit(pass, "Withdrawn").withArgs(organizer.address, total);
      expect(await pass.pendingWithdrawals(organizer.address)).to.equal(0n);
      await expect(pass.connect(organizer).withdraw()).to.be.revertedWithCustomError(pass, "NothingToWithdraw");
    });

    it("someone with no balance cannot withdraw", async function () {
      const { pass, attacker, fan1 } = await loadFixture(deployFixture);
      await pass.connect(fan1).buyTicket(0, GA, { value: PRICES[GA] });
      await expect(pass.connect(attacker).withdraw()).to.be.revertedWithCustomError(pass, "NothingToWithdraw");
    });

    it("is safe against reentrancy", async function () {
      const { pass, fan2 } = await loadFixture(deployFixture);
      const Attacker = await ethers.getContractFactory("ReentrancyAttacker");
      const evil = await Attacker.deploy(await pass.getAddress());
      await evil.waitForDeployment();

      // The attacker contract buys a ticket and sells it to Fan 2 so it has a real balance.
      await evil.buy(0, GA, { value: PRICES[GA] });
      const tokenId = 1n;
      await evil.list(tokenId, PRICES[GA]);
      await pass.connect(fan2).buyResale(tokenId, { value: PRICES[GA] });
      expect(await pass.pendingWithdrawals(await evil.getAddress())).to.equal(PRICES[GA]);

      const before = await ethers.provider.getBalance(await pass.getAddress());
      await evil.attack();
      const after = await ethers.provider.getBalance(await pass.getAddress());

      expect(await evil.reentryAttempts()).to.equal(1n);
      expect(await evil.reentrySucceeded()).to.equal(false);
      expect(await evil.reentryBlocked()).to.equal(true);
      // Paid exactly once.
      expect(before - after).to.equal(PRICES[GA]);
      expect(await ethers.provider.getBalance(await evil.getAddress())).to.equal(PRICES[GA]);
      expect(await pass.pendingWithdrawals(await evil.getAddress())).to.equal(0n);
    });
  });
});
