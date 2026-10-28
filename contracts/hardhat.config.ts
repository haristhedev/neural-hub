import "@nomicfoundation/hardhat-toolbox";
import { HardhatUserConfig, subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";

const SOLC_VERSION = "0.8.28";

/**
 * Compile with the solc-js build from npm instead of downloading a native
 * compiler. Slower than native, but fully reproducible and works offline / behind
 * restrictive proxies. Remove this subtask to use Hardhat's default downloader.
 */
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args: { solcVersion: string }, _hre, runSuper) => {
  if (args.solcVersion === SOLC_VERSION) {
    return {
      compilerPath: require.resolve("solc/soljson.js"),
      isSolcJs: true,
      version: SOLC_VERSION,
      longVersion: `${SOLC_VERSION}+commit.7893614a`,
    };
  }
  return runSuper();
});

const config: HardhatUserConfig = {
  solidity: {
    version: SOLC_VERSION,
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" },
  },
  networks: {
    // Genesis is back-dated so scripts/deploy.ts can replay ~6 months of activity and
    // still finish at "now" — gives the dashboards real historical on-chain data.
    // REAL_TIME=1 starts the chain at the current time instead (used to test the live-network seed path locally).
    hardhat: { chainId: 31337, ...(process.env.REAL_TIME ? {} : { initialDate: new Date(Date.now() - 185 * 24 * 3600 * 1000).toISOString() }) },
    localhost: { url: "http://127.0.0.1:8545", chainId: 31337 },
    ...(process.env.DEPLOYER_KEY
      ? {
          baseSepolia: { url: process.env.BASE_SEPOLIA_RPC ?? "https://sepolia.base.org", chainId: 84532, accounts: [process.env.DEPLOYER_KEY] },
          sepolia: { url: process.env.SEPOLIA_RPC ?? "https://rpc.sepolia.org", chainId: 11155111, accounts: [process.env.DEPLOYER_KEY] },
          polygonAmoy: { url: process.env.AMOY_RPC ?? "https://rpc-amoy.polygon.technology", chainId: 80002, accounts: [process.env.DEPLOYER_KEY] },
        }
      : {}),
  },
  paths: { sources: "./contracts", tests: "./test", artifacts: "./artifacts", cache: "./cache" },
};

export default config;
