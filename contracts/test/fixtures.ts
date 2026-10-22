import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

export const USD = (n: number | string) => ethers.parseUnits(String(n), 6);
export const Tier = { None: 0, Personal: 1, Commercial: 2, Enterprise: 3 } as const;
export const Category = { LLM: 0, ImageGen: 1, Audio: 2, Video: 3, Predictive: 4, NLP: 5, Security: 6 } as const;

export async function deployFixture() {
  const [admin, treasury, gateway, creator, partner, buyer, other] = await ethers.getSigners();

  const token = await (await ethers.getContractFactory("NHUSD")).deploy(admin.address);
  const models = await (await ethers.getContractFactory("ModelNFT")).deploy();
  const licenses = await (await ethers.getContractFactory("ModelLicenses")).deploy(admin.address, "https://nh.test/{id}.json");
  const market = await (
    await ethers.getContractFactory("Marketplace")
  ).deploy(admin.address, treasury.address, await token.getAddress(), await models.getAddress(), await licenses.getAddress());

  await licenses.grantRole(await licenses.ISSUER_ROLE(), await market.getAddress());
  await market.grantRole(await market.GATEWAY_ROLE(), gateway.address);

  await models.connect(creator).mintModel("ipfs://model-1", Category.ImageGen, "v1.0.0", 500);
  await market
    .connect(creator)
    .listModel(1, { personal: USD(10), commercial: USD(100), enterprise: USD(1000), perCall: 3_000n, listed: true });

  await token.mint(buyer.address, USD(5000));

  return { admin, treasury, gateway, creator, partner, buyer, other, token, models, licenses, market };
}

export async function signPermit(
  token: Awaited<ReturnType<typeof deployFixture>>["token"],
  owner: Awaited<ReturnType<typeof ethers.getSigners>>[number],
  spender: string,
  value: bigint,
  deadlineOffset = 3600,
) {
  const { chainId } = await ethers.provider.getNetwork();
  const deadline = (await time.latest()) + deadlineOffset;
  const nonce = await token.nonces(owner.address);
  const sig = await owner.signTypedData(
    { name: "NeuralHub USD (test)", version: "1", chainId, verifyingContract: await token.getAddress() },
    {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    { owner: owner.address, spender, value, nonce, deadline },
  );
  const { v, r, s } = ethers.Signature.from(sig);
  return { deadline, v, r, s };
}
