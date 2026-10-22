import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployFixture, signPermit, USD, Tier } from "./fixtures";

describe("Marketplace — licenses & revenue", () => {
  it("sells a license and splits revenue creator / partner / platform", async () => {
    const { market, token, licenses, creator, partner, treasury, buyer } = await loadFixture(deployFixture);
    await market.connect(creator).setRevenueSplit(1, partner.address, 3000); // 30% partner, 10% platform, 60% creator

    await token.connect(buyer).approve(await market.getAddress(), USD(100));
    await expect(market.connect(buyer).buyLicense(1, Tier.Commercial))
      .to.emit(market, "RevenueDistributed")
      .withArgs(1, creator.address, USD(60), partner.address, USD(30), USD(10));

    expect(await licenses.isLicenseValid(buyer.address, 1, Tier.Commercial)).to.equal(true);
    expect(await market.pending(creator.address)).to.equal(USD(60));
    expect(await market.pending(partner.address)).to.equal(USD(30));
    expect(await market.pending(treasury.address)).to.equal(USD(10));
    // the marketplace holds exactly what is owed
    expect(await token.balanceOf(await market.getAddress())).to.equal(USD(100));
  });

  it("follows the NFT: the new owner receives the creator share", async () => {
    const { market, models, token, creator, other, buyer } = await loadFixture(deployFixture);
    await models.connect(creator).transferFrom(creator.address, other.address, 1);
    await token.connect(buyer).approve(await market.getAddress(), USD(10));
    await market.connect(buyer).buyLicense(1, Tier.Personal);
    expect(await market.pending(other.address)).to.equal(USD(9));
    expect(await market.pending(creator.address)).to.equal(0);
  });

  it("supports single-tx purchase via EIP-2612 permit", async () => {
    const { market, token, licenses, buyer } = await loadFixture(deployFixture);
    const p = await signPermit(token, buyer, await market.getAddress(), USD(10));
    await market.connect(buyer).buyLicenseWithPermit(1, Tier.Personal, p.deadline, p.v, p.r, p.s);
    expect(await licenses.isLicenseValid(buyer.address, 1, Tier.Personal)).to.equal(true);
  });

  it("survives a front-run permit (allowance already set)", async () => {
    const { market, token, licenses, buyer, other } = await loadFixture(deployFixture);
    const p = await signPermit(token, buyer, await market.getAddress(), USD(10));
    await token.connect(other).permit(buyer.address, await market.getAddress(), USD(10), p.deadline, p.v, p.r, p.s);
    await market.connect(buyer).buyLicenseWithPermit(1, Tier.Personal, p.deadline, p.v, p.r, p.s);
    expect(await licenses.isLicenseValid(buyer.address, 1, Tier.Personal)).to.equal(true);
  });

  it("rejects bad permit, unlisted models, and unauthorised listing", async () => {
    const { market, token, buyer, other } = await loadFixture(deployFixture);
    const p = await signPermit(token, buyer, await market.getAddress(), USD(5)); // signed for less than price
    await expect(market.connect(buyer).buyLicenseWithPermit(1, Tier.Personal, p.deadline, p.v, p.r, p.s)).to.be.reverted;
    await expect(market.connect(buyer).buyLicense(99, Tier.Personal)).to.be.reverted; // ownerOf reverts later; NotForSale first
    await expect(
      market.connect(other).listModel(1, { personal: 1, commercial: 1, enterprise: 1, perCall: 1, listed: true }),
    ).to.be.revertedWithCustomError(market, "NotModelOwner");
    await expect(market.connect(other).setRevenueSplit(1, other.address, 100)).to.be.revertedWithCustomError(market, "NotModelOwner");
  });

  it("validates revenue split bounds", async () => {
    const { market, creator, partner } = await loadFixture(deployFixture);
    await expect(market.connect(creator).setRevenueSplit(1, partner.address, 5001)).to.be.revertedWithCustomError(market, "InvalidSplit");
    await expect(market.connect(creator).setRevenueSplit(1, ethers.ZeroAddress, 100)).to.be.revertedWithCustomError(market, "InvalidSplit");
  });

  it("claim() is pull-based, zeroes balance first, and fails when empty", async () => {
    const { market, token, creator, buyer } = await loadFixture(deployFixture);
    await token.connect(buyer).approve(await market.getAddress(), USD(100));
    await market.connect(buyer).buyLicense(1, Tier.Commercial);
    await expect(market.connect(creator).claim()).to.changeTokenBalances(token, [creator, market], [USD(90), -USD(90)]);
    await expect(market.connect(creator).claim()).to.be.revertedWithCustomError(market, "NothingToClaim");
  });
});

describe("Marketplace — pay-per-use metering", () => {
  const batch = (n: number) => ethers.keccak256(ethers.toUtf8Bytes(`batch-${n}`));

  async function funded() {
    const f = await loadFixture(deployFixture);
    await f.token.connect(f.buyer).approve(await f.market.getAddress(), USD(50));
    await f.market.connect(f.buyer).depositCredits(USD(50));
    return f;
  }

  it("debits escrow per call and credits revenue", async () => {
    const { market, gateway, buyer, creator } = await funded();
    await expect(market.connect(gateway).recordUsage(batch(1), 1, buyer.address, 1000))
      .to.emit(market, "UsageRecorded")
      .withArgs(batch(1), 1, buyer.address, 1000, USD(3)); // 1000 * $0.003
    expect(await market.credits(buyer.address)).to.equal(USD(47));
    expect(await market.callsOf(buyer.address, 1)).to.equal(1000);
    expect(await market.totalCalls(1)).to.equal(1000);
    expect(await market.pending(creator.address)).to.equal(USD("2.7"));
  });

  it("only the gateway can record usage", async () => {
    const { market, buyer, other } = await funded();
    await expect(market.connect(other).recordUsage(batch(1), 1, buyer.address, 1)).to.be.revertedWithCustomError(
      market,
      "AccessControlUnauthorizedAccount",
    );
  });

  it("is idempotent per batch id (no double settlement)", async () => {
    const { market, gateway, buyer } = await funded();
    await market.connect(gateway).recordUsage(batch(1), 1, buyer.address, 10);
    await expect(market.connect(gateway).recordUsage(batch(1), 1, buyer.address, 10)).to.be.revertedWithCustomError(
      market,
      "BatchAlreadyProcessed",
    );
  });

  it("refuses usage beyond prepaid credits", async () => {
    const { market, gateway, buyer } = await funded();
    await expect(market.connect(gateway).recordUsage(batch(1), 1, buyer.address, 20_000))
      .to.be.revertedWithCustomError(market, "InsufficientCredits")
      .withArgs(buyer.address, USD(50), USD(60));
  });

  it("lets users withdraw unused credits only", async () => {
    const { market, token, buyer } = await funded();
    await expect(market.connect(buyer).withdrawCredits(USD(20))).to.changeTokenBalances(token, [buyer, market], [USD(20), -USD(20)]);
    await expect(market.connect(buyer).withdrawCredits(USD(31))).to.be.revertedWithCustomError(market, "InsufficientCredits");
  });

  it("accepts credit deposits via permit", async () => {
    const { market, token, buyer } = await loadFixture(deployFixture);
    const p = await signPermit(token, buyer, await market.getAddress(), USD(25));
    await market.connect(buyer).depositCreditsWithPermit(USD(25), p.deadline, p.v, p.r, p.s);
    expect(await market.credits(buyer.address)).to.equal(USD(25));
  });
});

describe("Marketplace — subscriptions", () => {
  it("prices annual plans with a 20% discount and issues an expiring pass", async () => {
    const { market, token, licenses, buyer, treasury } = await loadFixture(deployFixture);
    expect(await market.planPrice(1, false)).to.equal(USD(29));
    expect(await market.planPrice(1, true)).to.equal(USD("278.4"));
    await token.connect(buyer).approve(await market.getAddress(), USD("278.4"));
    await market.connect(buyer).subscribe(1, true);
    expect(await licenses.isLicenseValid(buyer.address, 0, Tier.Personal)).to.equal(true); // plan Pro == tier 1
    expect(await market.pending(treasury.address)).to.equal(USD("278.4"));
    await time.increase(366 * 24 * 3600);
    expect(await licenses.isLicenseValid(buyer.address, 0, Tier.Personal)).to.equal(false);
  });

  it("renewal extends from the current expiry", async () => {
    const { market, token, licenses, buyer } = await loadFixture(deployFixture);
    await token.connect(buyer).approve(await market.getAddress(), USD(58));
    await market.connect(buyer).subscribe(1, false);
    const id = await licenses.licenseId(0, 1);
    const first = await licenses.expiryOf(buyer.address, id);
    await market.connect(buyer).subscribe(1, false);
    expect(await licenses.expiryOf(buyer.address, id)).to.equal(first + BigInt(30 * 24 * 3600));
  });
});
