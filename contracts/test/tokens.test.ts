import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployFixture, USD, Tier, Category } from "./fixtures";

describe("NHUSD (ERC-20 + permit)", () => {
  it("has 6 decimals and a rate-limited faucet", async () => {
    const { token, other } = await loadFixture(deployFixture);
    expect(await token.decimals()).to.equal(6);
    await token.connect(other).faucet();
    expect(await token.balanceOf(other.address)).to.equal(USD(1000));
    await expect(token.connect(other).faucet()).to.be.revertedWithCustomError(token, "FaucetCooldown");
    await time.increase(24 * 3600);
    await token.connect(other).faucet();
    expect(await token.balanceOf(other.address)).to.equal(USD(2000));
  });

  it("only the owner can mint", async () => {
    const { token, other } = await loadFixture(deployFixture);
    await expect(token.connect(other).mint(other.address, 1n)).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
  });
});

describe("ModelNFT (ERC-721)", () => {
  it("mints a model identity with creator, category, version and ERC-2981 royalty", async () => {
    const { models, creator } = await loadFixture(deployFixture);
    const info = await models.modelInfo(1);
    expect(info.creator).to.equal(creator.address);
    expect(info.category).to.equal(Category.ImageGen);
    expect(info.version).to.equal("v1.0.0");
    expect(await models.tokenURI(1)).to.equal("ipfs://model-1");
    const [receiver, amount] = await models.royaltyInfo(1, 10_000);
    expect(receiver).to.equal(creator.address);
    expect(amount).to.equal(500);
    expect(await models.totalSupply()).to.equal(1);
    expect(await models.tokenOfOwnerByIndex(creator.address, 0)).to.equal(1);
  });

  it("rejects royalties above 10% and non-owner version updates", async () => {
    const { models, creator, other } = await loadFixture(deployFixture);
    await expect(models.connect(other).mintModel("ipfs://x", 0, "v1", 1001)).to.be.revertedWithCustomError(models, "InvalidRoyalty");
    await expect(models.connect(other).updateVersion(1, "v2", "ipfs://y")).to.be.revertedWithCustomError(models, "NotModelOwner");
    await expect(models.connect(creator).updateVersion(1, "v2", "ipfs://y")).to.emit(models, "ModelVersionUpdated");
  });
});

describe("ModelLicenses (ERC-1155)", () => {
  it("encodes and decodes license ids", async () => {
    const { licenses } = await loadFixture(deployFixture);
    const id = await licenses.licenseId(42, Tier.Commercial);
    expect(id).to.equal((42n << 8n) | 2n);
    const [modelId, tier] = await licenses.decodeId(id);
    expect(modelId).to.equal(42);
    expect(tier).to.equal(Tier.Commercial);
  });

  it("only issuers can mint", async () => {
    const { licenses, other } = await loadFixture(deployFixture);
    await expect(licenses.connect(other).issue(other.address, 1, Tier.Personal, 0)).to.be.revertedWithCustomError(
      licenses,
      "AccessControlUnauthorizedAccount",
    );
  });

  it("moves expiry with the token and forbids double-holding", async () => {
    const { market, licenses, token, buyer, other } = await loadFixture(deployFixture);
    await token.connect(buyer).approve(await market.getAddress(), USD(100));
    await market.connect(buyer).buyLicense(1, Tier.Commercial);
    const id = await licenses.licenseId(1, Tier.Commercial);
    const exp = await licenses.expiryOf(buyer.address, id);
    expect(exp).to.be.gt(0);

    await licenses.connect(buyer).safeTransferFrom(buyer.address, other.address, id, 1, "0x");
    expect(await licenses.isLicenseValid(buyer.address, 1, Tier.Commercial)).to.equal(false);
    expect(await licenses.isLicenseValid(other.address, 1, Tier.Commercial)).to.equal(true);
    expect(await licenses.expiryOf(other.address, id)).to.equal(exp);
    expect(await licenses.expiryOf(buyer.address, id)).to.equal(0);
  });

  it("licenses expire", async () => {
    const { market, licenses, token, buyer } = await loadFixture(deployFixture);
    await token.connect(buyer).approve(await market.getAddress(), USD(10));
    await market.connect(buyer).buyLicense(1, Tier.Personal);
    expect(await licenses.isLicenseValid(buyer.address, 1, Tier.Personal)).to.equal(true);
    await time.increase(366 * 24 * 3600);
    expect(await licenses.isLicenseValid(buyer.address, 1, Tier.Personal)).to.equal(false);
  });
});
