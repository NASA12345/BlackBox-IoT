import { ethers } from 'ethers';

const PROVIDER_URL = process.env.REACT_APP_SEPOLIA_URL;
const PRIVATE_KEY = process.env.REACT_APP_PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.REACT_APP_HASH_REGISTRY_ADDRESS;

const CONTRACT_ABI = [
  'function storeHash(bytes32 _hash) external',
];

class BlockchainService {
  constructor() {
    if (!PROVIDER_URL || !PRIVATE_KEY || !CONTRACT_ADDRESS) {
      this.disabled = true;
      console.warn('BlockchainService disabled: missing env configuration');
      return;
    }

    this.provider = new ethers.JsonRpcProvider(PROVIDER_URL);
    this.wallet = new ethers.Wallet(PRIVATE_KEY, this.provider);
    this.contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, this.wallet);
    this.txQueue = Promise.resolve();
    this.disabled = false;
  }

  hashTripData(tripData) {
    const payload = JSON.stringify(tripData);
    return ethers.keccak256(ethers.toUtf8Bytes(payload));
  }

  async storeHashOnChain(hash) {
    if (this.disabled) {
      throw new Error('BlockchainService is disabled because configuration is missing');
    }

    const tx = await this.contract.storeHash(hash);
    await tx.wait();
    return tx.hash;
  }

  enqueueStoreHash(hash) {
    const job = this.txQueue.then(() => this.storeHashOnChain(hash));
    // Keep queue alive even if one tx fails.
    this.txQueue = job.catch(() => undefined);
    return job;
  }

  async hashAndStoreTripData(tripData) {
    const hash = this.hashTripData(tripData);
    const txHash = await this.enqueueStoreHash(hash);
    return { hash, txHash };
  }
}

const blockchainService = new BlockchainService();

export default blockchainService;